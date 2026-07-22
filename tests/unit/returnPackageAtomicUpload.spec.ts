import { beforeEach, describe, expect, test, vi } from "vitest";

const operationId = "11111111-1111-4111-8111-111111111111";
const packageId = "22222222-2222-4222-8222-222222222222";

const supabase = vi.hoisted(() => {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.is = vi.fn(() => query);
  query.maybeSingle = vi.fn();
  return {
    events: [] as string[],
    from: vi.fn(() => query),
    maybeSingle: query.maybeSingle,
    query,
    remove: vi.fn(),
    rpc: vi.fn(),
    storageFrom: vi.fn(),
    upload: vi.fn(),
  };
});

vi.mock("../../src/lib/supabase/client", () => ({
  getSupabaseClient: () => ({
    from: supabase.from,
    rpc: supabase.rpc,
    storage: { from: supabase.storageFrom },
  }),
}));

import { uploadAgentReturnPackageArtifact } from "../../src/modules/submissions/returnPackagePersistence";

function pdfFile() {
  return new File(["%PDF-1.7\natomic return package"], "returned.pdf", {
    type: "application/pdf",
  });
}

function artifactRow(input: { path: string; sha256: string; size: number }) {
  return {
    applicant_id: null,
    applicant_name: null,
    artifact_kind: "agent_list_pdf" as const,
    file_name: "agent_list.pdf",
    id: "33333333-3333-4333-8333-333333333333",
    return_package_id: packageId,
    sha256: input.sha256,
    size_bytes: input.size,
    storage_bucket: "agent-return-packages" as const,
    storage_path: input.path,
    uploaded_at: "2026-07-22T12:00:00.000Z",
    uploaded_by: "44444444-4444-4444-8444-444444444444",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  supabase.events.length = 0;
  vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(operationId);
  supabase.storageFrom.mockReturnValue({
    remove: supabase.remove,
    upload: supabase.upload,
  });
  supabase.upload.mockImplementation(async () => {
    supabase.events.push("upload");
    return { error: null };
  });
  supabase.remove.mockImplementation(async ([path]: string[]) => {
    supabase.events.push(`remove:${path}`);
    return { error: null };
  });
  supabase.maybeSingle.mockResolvedValue({ data: null, error: null });
});

describe("atomic return-package artifact upload", () => {
  test("uploads to a prepared versioned path before atomically finalizing metadata", async () => {
    const file = pdfFile();
    let preparedSha = "";
    const preparedPath = `return-package-upload-intents/${packageId}/${operationId}.pdf`;
    supabase.rpc.mockImplementation(async (name: string, args: unknown) => {
      supabase.events.push(name);
      if (name === "prepare_agent_return_package_artifact_upload") {
        preparedSha = (args as { payload: { sha256: string } }).payload.sha256;
        return {
          data: {
            fileName: "agent_list.pdf",
            operationId,
            status: "prepared",
            storageBucket: "agent-return-packages",
            storagePath: preparedPath,
          },
          error: null,
        };
      }
      if (name === "finalize_agent_return_package_artifact_upload") {
        return {
          data: {
            artifact: artifactRow({
              path: preparedPath,
              sha256: preparedSha,
              size: file.size,
            }),
            duplicate: false,
            operationId,
            previousStoragePath: null,
          },
          error: null,
        };
      }
      throw new Error(`Unexpected RPC ${name}`);
    });

    await expect(
      uploadAgentReturnPackageArtifact({
        artifactKind: "agent_list_pdf",
        file,
        packageId,
      }),
    ).resolves.toMatchObject({
      packageId,
      storagePath: preparedPath,
    });

    expect(supabase.events).toEqual([
      "prepare_agent_return_package_artifact_upload",
      "upload",
      "finalize_agent_return_package_artifact_upload",
    ]);
    expect(supabase.upload).toHaveBeenCalledWith(preparedPath, file, {
      contentType: "application/pdf",
      upsert: false,
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  test("retries finalize with the same operation id after a lost response", async () => {
    const file = pdfFile();
    const preparedPath = `return-package-upload-intents/${packageId}/${operationId}.pdf`;
    const previousPath = `return-packages/${packageId}/list/agent_list.pdf`;
    let preparedSha = "";
    let finalizeCalls = 0;
    supabase.rpc.mockImplementation(async (name: string, args: unknown) => {
      supabase.events.push(name);
      if (name === "prepare_agent_return_package_artifact_upload") {
        preparedSha = (args as { payload: { sha256: string } }).payload.sha256;
        return {
          data: {
            fileName: "agent_list.pdf",
            operationId,
            status: "prepared",
            storageBucket: "agent-return-packages",
            storagePath: preparedPath,
          },
          error: null,
        };
      }
      if (name === "finalize_agent_return_package_artifact_upload") {
        finalizeCalls += 1;
        expect(args).toEqual({ p_operation_id: operationId });
        if (finalizeCalls === 1) {
          return { data: null, error: new TypeError("Failed to fetch") };
        }
        return {
          data: {
            artifact: artifactRow({
              path: preparedPath,
              sha256: preparedSha,
              size: file.size,
            }),
            duplicate: true,
            operationId,
            previousStoragePath: previousPath,
          },
          error: null,
        };
      }
      throw new Error(`Unexpected RPC ${name}`);
    });

    await expect(
      uploadAgentReturnPackageArtifact({
        artifactKind: "agent_list_pdf",
        file,
        packageId,
      }),
    ).resolves.toMatchObject({ storagePath: preparedPath });

    expect(finalizeCalls).toBe(2);
    expect(supabase.remove).toHaveBeenCalledWith([previousPath]);
  });

  test("does not overwrite a conflicting client and aborts only its losing intent", async () => {
    const file = pdfFile();
    const preparedPath = `return-package-upload-intents/${packageId}/${operationId}.pdf`;
    const oldPath = `return-packages/${packageId}/list/agent_list.pdf`;
    let preparedSha = "";
    supabase.maybeSingle.mockImplementation(async () => ({
      data: artifactRow({ path: oldPath, sha256: "b".repeat(64), size: 9 }),
      error: null,
    }));
    supabase.rpc.mockImplementation(async (name: string, args: unknown) => {
      supabase.events.push(name);
      if (name === "prepare_agent_return_package_artifact_upload") {
        preparedSha = (args as { payload: { sha256: string } }).payload.sha256;
        expect(preparedSha).toMatch(/^[a-f0-9]{64}$/);
        return {
          data: {
            fileName: "agent_list.pdf",
            operationId,
            status: "prepared",
            storageBucket: "agent-return-packages",
            storagePath: preparedPath,
          },
          error: null,
        };
      }
      if (name === "finalize_agent_return_package_artifact_upload") {
        return {
          data: null,
          error: {
            code: "40001",
            message: "V19_RETURN_PACKAGE_UPLOAD_CONFLICT: artifact slot changed",
          },
        };
      }
      if (name === "abort_agent_return_package_artifact_upload") {
        expect(args).toEqual({ p_operation_id: operationId });
        return {
          data: { operationId, status: "aborted" },
          error: null,
        };
      }
      throw new Error(`Unexpected RPC ${name}`);
    });

    await expect(
      uploadAgentReturnPackageArtifact({
        artifactKind: "agent_list_pdf",
        file,
        packageId,
      }),
    ).rejects.toThrow("уже изменён в другой административной сессии");

    expect(supabase.remove).toHaveBeenCalledWith([preparedPath]);
    expect(supabase.events).toContain(
      "abort_agent_return_package_artifact_upload",
    );
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  test("preserves the prepared object when both finalize responses are uncertain", async () => {
    const file = pdfFile();
    const preparedPath = `return-package-upload-intents/${packageId}/${operationId}.pdf`;
    supabase.rpc.mockImplementation(async (name: string) => {
      supabase.events.push(name);
      if (name === "prepare_agent_return_package_artifact_upload") {
        return {
          data: {
            fileName: "agent_list.pdf",
            operationId,
            status: "prepared",
            storageBucket: "agent-return-packages",
            storagePath: preparedPath,
          },
          error: null,
        };
      }
      if (name === "finalize_agent_return_package_artifact_upload") {
        return { data: null, error: new TypeError("Failed to fetch") };
      }
      throw new Error(`Unexpected RPC ${name}`);
    });

    await expect(
      uploadAgentReturnPackageArtifact({
        artifactKind: "agent_list_pdf",
        file,
        packageId,
      }),
    ).rejects.toThrow("outcome is uncertain");

    expect(supabase.remove).not.toHaveBeenCalled();
    expect(supabase.events).not.toContain(
      "abort_agent_return_package_artifact_upload",
    );
  });
});

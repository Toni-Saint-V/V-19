import { describe, expect, test, vi } from "vitest";
import { DocumentRepository } from "../../src/modules/documents/documentRepository";
import type { VisaFlowSupabaseClient } from "../../src/lib/supabase/client";

const auditInput = {
  documentAssetIds: ["asset-1"],
  fileCount: 1,
  fileName: "export.zip",
  packageId: "package-1",
  submissionIds: ["submission-1"],
};

function auditRow(overrides: Record<string, unknown> = {}) {
  return {
    asset_ids: auditInput.documentAssetIds,
    file_count: auditInput.fileCount,
    id: "event-1",
    package_identity_key: auditInput.packageId,
    submission_ids: auditInput.submissionIds,
    zip_file_name: auditInput.fileName,
    ...overrides,
  };
}

function auditRepositoryClient(
  eventReads: Array<Array<ReturnType<typeof auditRow>>>,
  insertResult: { data: null; error: unknown } = { data: null, error: null },
) {
  let readIndex = 0;
  const query = {
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn(async () => ({
      data: eventReads[Math.min(readIndex++, eventReads.length - 1)] ?? [],
      error: null,
    })),
    order: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
  };
  const insert = vi.fn(async () => insertResult);

  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "admin-1" } },
        error: null,
      }),
    },
    from: vi.fn(() => ({ ...query, insert })),
  } as unknown as VisaFlowSupabaseClient;

  return { client, insert, query };
}

function assetStatusClient(input: {
  mutations: Array<{ data: unknown; error: unknown }>;
  reads?: Array<Array<{ export_status: string; id: string }>>;
}) {
  const mutationSelect = vi.fn();
  const reconciliationIn = vi.fn();
  const steps: Array<Record<string, unknown>> = [];
  input.mutations.forEach((mutation, index) => {
    steps.push({
      update: vi.fn(() => ({
        in: vi.fn(() => ({
          select: mutationSelect.mockResolvedValueOnce(mutation),
        })),
      })),
    });
    const read = input.reads?.[index];
    if (read) {
      steps.push({
        select: vi.fn(() => ({
          in: reconciliationIn.mockResolvedValueOnce({ data: read, error: null }),
        })),
      });
    }
  });
  const from = vi.fn(() => steps.shift());

  return {
    client: { from } as unknown as VisaFlowSupabaseClient,
    from,
    mutationSelect,
    reconciliationIn,
  };
}

describe("DocumentRepository export audit", () => {
  test("does not duplicate an exact audit event for a retried package", async () => {
    const { client, insert, query } = auditRepositoryClient([[auditRow()]]);

    await new DocumentRepository(client).recordExportAudit(auditInput);

    expect(query.eq).toHaveBeenCalledWith("package_identity_key", "package-1");
    expect(insert).not.toHaveBeenCalled();
  });

  test("records a new audit event when the package has not been seen", async () => {
    const { client, insert } = auditRepositoryClient([[]]);

    await new DocumentRepository(client).recordExportAudit(auditInput);

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "DOCUMENT_EXPORT_CREATED",
        package_identity_key: "package-1",
        created_by: "admin-1",
      }),
    );
  });

  test("accepts a lost audit insert response only after exact canonical reconciliation", async () => {
    const { client, insert } = auditRepositoryClient([[], [auditRow()]], {
      data: null,
      error: { message: "Failed to fetch", name: "FetchError" },
    });

    await expect(
      new DocumentRepository(client).recordExportAudit(auditInput),
    ).resolves.toBeUndefined();
    expect(insert).toHaveBeenCalledTimes(1);
  });

  test("keeps a lost audit insert failed when canonical reconciliation proves no event exists", async () => {
    const { client } = auditRepositoryClient([[], []], {
      data: null,
      error: { message: "Failed to fetch", name: "FetchError" },
    });

    await expect(
      new DocumentRepository(client).recordExportAudit(auditInput),
    ).rejects.toMatchObject({
      diagnostics: {
        operation: "document_export_events.insert",
        retryable: true,
      },
    });
  });

  test("rejects an existing audit event whose exact asset identity differs", async () => {
    const { client, insert } = auditRepositoryClient([
      [auditRow({ asset_ids: ["different-asset"] })],
    ]);

    await expect(
      new DocumentRepository(client).recordExportAudit(auditInput),
    ).rejects.toThrow("identity does not match");
    expect(insert).not.toHaveBeenCalled();
  });
});

describe("DocumentRepository export status reconciliation", () => {
  test("treats a lost PATCH response as committed only when every exact asset is exported", async () => {
    const { client, reconciliationIn } = assetStatusClient({
      mutations: [
        {
          data: null,
          error: { message: "Request timed out", name: "TimeoutError" },
        },
      ],
      reads: [[{ export_status: "exported", id: "asset-1" }]],
    });

    await expect(
      new DocumentRepository(client).markExported(["asset-1"]),
    ).resolves.toBeUndefined();
    expect(reconciliationIn).toHaveBeenCalledWith("id", ["asset-1"]);
  });

  test("keeps the export failed when canonical assets prove the lost PATCH did not commit", async () => {
    const timeout = {
      data: null,
      error: { message: "Request timed out", name: "TimeoutError" },
    };
    const { client } = assetStatusClient({
      mutations: [timeout, timeout],
      reads: [
        [{ export_status: "ready", id: "asset-1" }],
        [{ export_status: "ready", id: "asset-1" }],
      ],
    });

    await expect(
      new DocumentRepository(client).markExported(["asset-1"]),
    ).rejects.toMatchObject({
      diagnostics: {
        operation: "document_assets.mark_exported",
        retryable: true,
      },
    });
  });

  test("accepts a lost recovery PATCH response only when every exact asset is ready again", async () => {
    const { client } = assetStatusClient({
      mutations: [
        {
          data: null,
          error: { message: "Request timed out", name: "TimeoutError" },
        },
      ],
      reads: [[{ export_status: "ready", id: "asset-1" }]],
    });

    await expect(
      new DocumentRepository(client).restoreReadyForExport(["asset-1"]),
    ).resolves.toBeUndefined();
  });

  test("retries the exact recovery PATCH when the first lost response did not commit", async () => {
    const { client, from } = assetStatusClient({
      mutations: [
        {
          data: null,
          error: { message: "Request timed out", name: "TimeoutError" },
        },
        {
          data: [{ export_status: "ready", id: "asset-1" }],
          error: null,
        },
      ],
      reads: [[{ export_status: "exported", id: "asset-1" }]],
    });

    await expect(
      new DocumentRepository(client).restoreReadyForExport(["asset-1"]),
    ).resolves.toBeUndefined();
    expect(from).toHaveBeenCalledTimes(3);
  });

  test("rejects a successful PATCH response that omitted a requested asset", async () => {
    const { client } = assetStatusClient({
      mutations: [{ data: [], error: null }],
    });

    await expect(
      new DocumentRepository(client).markExported(["asset-1"]),
    ).rejects.toThrow("did not update every requested asset");
  });
});

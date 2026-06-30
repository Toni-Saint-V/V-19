import { describe, expect, test, vi, beforeEach } from "vitest";

const target = {
  bucket: "submission-media" as const,
  path: "VF-1044/common/appointment_pdf/aaaaaaaaaaaaaaaa_appointment_pdf.pdf",
};

const mocks = vi.hoisted(() => ({
  client: null as null | Record<string, unknown>,
  deleteMediaFromStorage: vi.fn(),
  uploadMediaToStorage: vi.fn(),
}));

vi.mock("../../src/lib/supabase/client", () => ({
  getSupabaseClient: () => mocks.client,
}));

vi.mock("../../src/modules/submissions/mediaStorage", () => ({
  buildApplicationPdfStorageTarget: vi.fn(() => target),
  buildAppointmentPdfStorageTarget: vi.fn(() => target),
  deleteMediaFromStorage: mocks.deleteMediaFromStorage,
  mediaStorageBucket: "submission-media",
  uploadMediaToStorage: mocks.uploadMediaToStorage,
  validateApplicationPdfStorageTarget: vi.fn((input) => input.target),
  validateAppointmentPdfStorageTarget: vi.fn((input) => input.target),
}));

import { uploadAdminPdfArtifact } from "../../src/modules/submissions/adminPdfArtifacts";

function clientWithUpsert(upsertResult: {
  data: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
}) {
  return {
    from: () => ({
      upsert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(async () => upsertResult),
        })),
      })),
    }),
  };
}

describe("admin PDF artifacts", () => {
  beforeEach(() => {
    mocks.client = null;
    mocks.deleteMediaFromStorage.mockReset();
    mocks.uploadMediaToStorage.mockReset();
  });

  test("stores realistic PDF file names after private upload", async () => {
    mocks.uploadMediaToStorage.mockResolvedValue({ path: target.path });
    mocks.client = clientWithUpsert({
      data: {
        artifact_kind: "appointment_pdf",
        file_name: "Запись BLS Madrid 29.06.2026.pdf",
        id: "artifact-1",
        sha256: "a".repeat(64),
        storage_bucket: "submission-media",
        storage_path: target.path,
        submission_id: "VF-1044",
        uploaded_at: "2026-06-29T00:00:00.000Z",
        uploaded_by: "admin-1",
      },
      error: null,
    });

    await expect(
      uploadAdminPdfArtifact({
        actorId: "admin-1",
        artifactKind: "appointment_pdf",
        file: new File(["%PDF"], "Запись BLS Madrid 29.06.2026.pdf", {
          type: "application/pdf",
        }),
        submissionId: "VF-1044",
      }),
    ).resolves.toMatchObject({
      artifactKind: "appointment_pdf",
      fileName: "Запись BLS Madrid 29.06.2026.pdf",
      storagePath: target.path,
    });
    expect(mocks.deleteMediaFromStorage).not.toHaveBeenCalled();
  });

  test("cleans uploaded Storage object when metadata upsert fails", async () => {
    mocks.uploadMediaToStorage.mockResolvedValue({ path: target.path });
    mocks.deleteMediaFromStorage.mockResolvedValue({ path: target.path });
    mocks.client = clientWithUpsert({
      data: null,
      error: {
        code: "23514",
        message: "new row violates check constraint",
        name: "PostgrestError",
      },
    });

    await expect(
      uploadAdminPdfArtifact({
        actorId: "admin-1",
        artifactKind: "appointment_pdf",
        file: new File(["%PDF"], "bad.pdf", { type: "application/pdf" }),
        submissionId: "VF-1044",
      }),
    ).rejects.toMatchObject({
      diagnostics: {
        operation: "admin_pdf_artifacts.upsert",
      },
    });
    expect(mocks.deleteMediaFromStorage).toHaveBeenCalledWith(target);
  });
});

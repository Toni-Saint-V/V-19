import { describe, expect, test, vi } from "vitest";
import {
  commitSubmissionExportPackage,
  reconcileSubmissionExportPackage,
  type ExportPackageCommitBatch,
} from "../../src/modules/submissions/exportPackagePersistence";
import type { ExportPackageDocumentCommit } from "../../src/modules/submissions/exportPackageDocumentCommit";

const supabaseMock = vi.hoisted(() => ({
  client: null as null | Record<string, unknown>,
}));

vi.mock("../../src/lib/supabase/client", () => ({
  getSupabaseClient: () => supabaseMock.client,
}));

const batch: ExportPackageCommitBatch = {
  id: "00000000-0000-4000-8000-000000000301",
  createdBy: "00000000-0000-4000-8000-000000000999",
  createdAt: "2026-06-16T08:00:00.000Z",
  format: "xlsx",
  contentFingerprint: "xlsx|2|ПД-1056",
  idempotencyKey: "export-content-1",
  fileName: "visaflow-export-export-content-1.xlsx",
  rowCount: 2,
  submissionIds: ["ПД-1056", "ПД-1057"],
};

const documentExport: ExportPackageDocumentCommit = {
  applicantCount: 2,
  assetIds: [
    "00000000-0000-4000-8000-000000000611",
    "00000000-0000-4000-8000-000000000612",
    "00000000-0000-4000-8000-000000000613",
    "00000000-0000-4000-8000-000000000614",
    "00000000-0000-4000-8000-000000000615",
    "00000000-0000-4000-8000-000000000616",
  ],
  fileCount: 6,
  workbookFileName: batch.fileName,
  zipFileName: "visaflow-export-export-content-1_documents.zip",
};

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: batch.id,
    created_by: "00000000-0000-4000-8000-000000000001",
    created_at: "2026-06-16T08:01:00.000Z",
    content_fingerprint: batch.contentFingerprint ?? null,
    file_name: batch.fileName,
    format: batch.format,
    idempotency_key: batch.idempotencyKey,
    row_count: batch.rowCount,
    submission_ids: batch.submissionIds,
    ...overrides,
  };
}

function eventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000701",
    applicant_count: documentExport.applicantCount,
    asset_ids: documentExport.assetIds,
    file_count: documentExport.fileCount,
    package_identity_key: batch.idempotencyKey,
    submission_ids: batch.submissionIds,
    workbook_file_name: documentExport.workbookFileName,
    zip_file_name: documentExport.zipFileName,
    ...overrides,
  };
}

function reconciliationClient(input: {
  assetRows: Array<{ export_status: string; id: string }>;
  batchRows: Array<Record<string, unknown>>;
  eventRows: Array<Record<string, unknown>>;
  submissionRows: Array<{ id: string; status: string }>;
}) {
  return {
    from: vi.fn((table: string) => {
      if (table === "export_batches") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              limit: vi.fn(async () => ({ data: input.batchRows, error: null })),
            })),
          })),
        };
      }
      if (table === "submissions") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(async () => ({ data: input.submissionRows, error: null })),
          })),
        };
      }
      if (table === "document_export_events") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              limit: vi.fn(async () => ({ data: input.eventRows, error: null })),
            })),
          })),
        };
      }
      if (table === "document_assets") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(async () => ({ data: input.assetRows, error: null })),
          })),
        };
      }
      throw new Error(`Unexpected reconciliation table: ${table}`);
    }),
  };
}

describe("V-19 submission export package persistence", () => {
  test("commits the batch and document proof through one RPC payload", async () => {
    const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
      expect(name).toBe("complete_export_package");
      expect(args).toMatchObject({
        payload: {
          batch: {
            file_name: batch.fileName,
            format: "xlsx",
            content_fingerprint: batch.contentFingerprint,
            id: batch.id,
            idempotency_key: batch.idempotencyKey,
            row_count: 2,
            submission_ids: batch.submissionIds,
          },
          document_export: {
            applicant_count: 2,
            asset_ids: documentExport.assetIds,
            file_count: documentExport.fileCount,
            workbook_file_name: batch.fileName,
            zip_file_name: documentExport.zipFileName,
          },
        },
      });

      return {
        data: {
          duplicate: false,
          documentExport: {
            id: "00000000-0000-4000-8000-000000000701",
            applicant_count: documentExport.applicantCount,
            asset_ids: documentExport.assetIds,
            file_count: documentExport.fileCount,
            workbook_file_name: documentExport.workbookFileName,
            zip_file_name: documentExport.zipFileName,
          },
          exportBatch: row({
            id: "00000000-0000-4000-8000-000000000888",
          }),
          statusHistory: 2,
          submissions: 2,
        },
        error: null,
      };
    });
    supabaseMock.client = { rpc };

    const committed = await commitSubmissionExportPackage(batch, documentExport);

    expect(committed).toMatchObject({
      changedSubmissions: 2,
      documentExport,
      duplicate: false,
      statusHistory: 2,
      batch: {
        id: "00000000-0000-4000-8000-000000000888",
        createdAt: "2026-06-16T08:01:00.000Z",
        createdBy: "00000000-0000-4000-8000-000000000001",
        contentFingerprint: "xlsx|2|ПД-1056",
        idempotencyKey: "export-content-1",
      },
    });
  });

  test("wraps export package RPC failures with safe V19 diagnostics", async () => {
    supabaseMock.client = {
      rpc: async () => ({
        data: null,
        error: {
          code: "42501",
          message: "Only admins can complete export packages",
          name: "PostgrestError",
          status: 403,
        },
      }),
    };

    await expect(
      commitSubmissionExportPackage(batch, documentExport),
    ).rejects.toMatchObject({
      diagnostics: {
        kind: "rls",
        operation: "rpc.complete_export_package",
        retryable: false,
        safeCode: "rpc.complete_export_package:rls:42501",
      },
      userMessage:
        "Недостаточно прав для этого действия. Обратитесь к администратору.",
    });
  });

  test("classifies a thrown lost RPC response as retryable before reconciliation", async () => {
    supabaseMock.client = {
      rpc: vi.fn(async () => {
        throw { message: "Request timed out", name: "TimeoutError" };
      }),
    };

    await expect(
      commitSubmissionExportPackage(batch, documentExport),
    ).rejects.toMatchObject({
      diagnostics: {
        operation: "rpc.complete_export_package",
        retryable: true,
        safeCode: "rpc.complete_export_package:rpc:NETWORK",
      },
    });
  });

  test("reconciles a lost response as committed only for exact batch, audit, assets, and terminal submissions", async () => {
    supabaseMock.client = reconciliationClient({
      assetRows: documentExport.assetIds.map((id) => ({ id, export_status: "exported" })),
      batchRows: [row()],
      eventRows: [eventRow()],
      submissionRows: batch.submissionIds.map((id) => ({ id, status: "exported" })),
    });

    await expect(
      reconcileSubmissionExportPackage(batch, documentExport),
    ).resolves.toMatchObject({
      batch: {
        idempotencyKey: batch.idempotencyKey,
        submissionIds: batch.submissionIds,
      },
      status: "committed",
    });
  });

  test("returns not_committed for exact accepted or Excel-ready raw states without durable export proof", async () => {
    supabaseMock.client = reconciliationClient({
      assetRows: documentExport.assetIds.map((id) => ({ id, export_status: "ready" })),
      batchRows: [],
      eventRows: [],
      submissionRows: batch.submissionIds.map((id, index) => ({
        id,
        status: index === 0 ? "accepted" : "ready_for_excel",
      })),
    });

    await expect(
      reconcileSubmissionExportPackage(batch, documentExport),
    ).resolves.toEqual({ status: "not_committed" });
  });

  test("fails closed for any non-pre-terminal raw submission status without export proof", async () => {
    supabaseMock.client = reconciliationClient({
      assetRows: documentExport.assetIds.map((id) => ({ id, export_status: "ready" })),
      batchRows: [],
      eventRows: [],
      submissionRows: batch.submissionIds.map((id, index) => ({
        id,
        status: index === 0 ? "accepted" : "waiting_review",
      })),
    });

    await expect(
      reconcileSubmissionExportPackage(batch, documentExport),
    ).resolves.toEqual({ status: "unknown" });
  });

  test("keeps partial audit or asset state unknown and never rolls it back", async () => {
    supabaseMock.client = reconciliationClient({
      assetRows: documentExport.assetIds.map((id, index) => ({
        id,
        export_status: index === 0 ? "exported" : "ready",
      })),
      batchRows: [row()],
      eventRows: [eventRow({ file_count: 7 })],
      submissionRows: batch.submissionIds.map((id) => ({ id, status: "exported" })),
    });

    await expect(
      reconcileSubmissionExportPackage(batch, documentExport),
    ).resolves.toEqual({ status: "unknown" });
  });
});

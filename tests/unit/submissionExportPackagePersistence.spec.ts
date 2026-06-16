import { describe, expect, test, vi } from "vitest";
import {
  commitSubmissionExportPackage,
  type ExportPackageCommitBatch,
} from "../../src/modules/submissions/exportPackagePersistence";

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

describe("V-19 submission export package persistence", () => {
  test("commits export packages through the V19-local RPC adapter", async () => {
    const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
      expect(name).toBe("complete_export_package");
      expect(args).toMatchObject({
        payload: {
          batch: {
            file_name: "visaflow-export-export-content-1.xlsx",
            format: "xlsx",
            content_fingerprint: "xlsx|2|ПД-1056",
            id: batch.id,
            idempotency_key: "export-content-1",
            row_count: 2,
            submission_ids: ["ПД-1056", "ПД-1057"],
          },
        },
      });

      return {
        data: {
          duplicate: false,
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

    const committed = await commitSubmissionExportPackage(batch);

    expect(committed).toMatchObject({
      changedSubmissions: 2,
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

    await expect(commitSubmissionExportPackage(batch)).rejects.toMatchObject({
      diagnostics: {
        kind: "rls",
        operation: "rpc.complete_export_package",
        retryable: false,
        safeCode: "rpc.complete_export_package:rls:42501",
      },
      userMessage:
        "Access was denied by Supabase policy. Ask an operator to confirm access.",
    });
  });
});

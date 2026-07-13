import { describe, expect, test, vi } from "vitest";
import {
  commitSubmissionExportPackage,
  reconcileSubmissionExportPackage,
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

function reconciliationClient(
  batchRows: Array<Record<string, unknown>>,
  submissionRows: Array<{ id: string; status: string }>,
) {
  return {
    from: vi.fn((table: string) => {
      if (table === "export_batches") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              limit: vi.fn(async () => ({ data: batchRows, error: null })),
            })),
          })),
        };
      }
      if (table === "submissions") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(async () => ({ data: submissionRows, error: null })),
          })),
        };
      }
      throw new Error(`Unexpected reconciliation table: ${table}`);
    }),
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

  test("classifies a thrown lost RPC response as retryable before reconciliation", async () => {
    supabaseMock.client = {
      rpc: vi.fn(async () => {
        throw { message: "Request timed out", name: "TimeoutError" };
      }),
    };

    await expect(commitSubmissionExportPackage(batch)).rejects.toMatchObject({
      diagnostics: {
        operation: "rpc.complete_export_package",
        retryable: true,
        safeCode: "rpc.complete_export_package:rpc:NETWORK",
      },
    });
  });

  test("reconciles a lost RPC response as committed only for the exact batch and exported submissions", async () => {
    supabaseMock.client = reconciliationClient(
      [row()],
      batch.submissionIds.map((id) => ({ id, status: "exported" })),
    );

    await expect(
      reconcileSubmissionExportPackage(batch),
    ).resolves.toMatchObject({
      batch: {
        idempotencyKey: batch.idempotencyKey,
        submissionIds: batch.submissionIds,
      },
      status: "committed",
    });
  });

  test("reconciles a lost RPC response as not committed only when no batch exists and every exact submission remains ready", async () => {
    supabaseMock.client = reconciliationClient(
      [],
      batch.submissionIds.map((id) => ({ id, status: "ready_for_excel" })),
    );

    await expect(
      reconcileSubmissionExportPackage(batch),
    ).resolves.toEqual({ status: "not_committed" });
  });

  test("keeps reconciliation unknown for a partial canonical submission set", async () => {
    supabaseMock.client = reconciliationClient([], [
      { id: batch.submissionIds[0]!, status: "ready_for_excel" },
    ]);

    await expect(
      reconcileSubmissionExportPackage(batch),
    ).resolves.toEqual({ status: "unknown" });
  });
});

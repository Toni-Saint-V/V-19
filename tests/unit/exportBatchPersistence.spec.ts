import { describe, expect, test, vi } from "vitest";
import type { ExportBatch } from "../../src/types/domain";

const supabaseMock = vi.hoisted(() => ({
  client: null as null | Record<string, unknown>,
  duplicateKey: "",
  insertPayload: null as unknown,
  insertSelect: "",
}));

vi.mock("../../src/lib/supabase/client", () => ({
  getSupabaseClient: () => supabaseMock.client,
}));

import {
  commitExportPackage,
  recordExportBatch,
} from "../../src/services/submissionService";

const batch: ExportBatch = {
  id: "00000000-0000-4000-8000-000000000301",
  createdBy: "00000000-0000-4000-8000-000000000999",
  createdAt: "2026-06-16T08:00:00.000Z",
  format: "xlsx",
  idempotencyKey: "export-content-1",
  fileName: "visaflow-export-export-content-1.xlsx",
  rowCount: 2,
  submissionIds: ["VF-1001", "VF-1002"],
};

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: batch.id,
    created_by: "00000000-0000-4000-8000-000000000001",
    created_at: "2026-06-16T08:01:00.000Z",
    format: batch.format,
    idempotency_key: batch.idempotencyKey,
    file_name: batch.fileName,
    row_count: batch.rowCount,
    submission_ids: batch.submissionIds,
    ...overrides,
  };
}

function insertChain(result: { data?: unknown; error?: unknown }) {
  return {
    select: (fields: string) => {
      supabaseMock.insertSelect = fields;
      return {
        single: async () => ({
          data: result.data ?? null,
          error: result.error ?? null,
        }),
      };
    },
  };
}

describe("Supabase export batch persistence", () => {
  test("records export batches without trusting client-supplied actor fields", async () => {
    supabaseMock.client = {
      from: (table: string) => {
        expect(table).toBe("export_batches");
        return {
          insert: (payload: unknown) => {
            supabaseMock.insertPayload = payload;
            return insertChain({ data: row() });
          },
        };
      },
    };

    const recorded = await recordExportBatch(batch);

    expect(supabaseMock.insertPayload).toMatchObject({
      id: batch.id,
      format: "xlsx",
      idempotency_key: "export-content-1",
      file_name: "visaflow-export-export-content-1.xlsx",
      row_count: 2,
      submission_ids: ["VF-1001", "VF-1002"],
    });
    expect(supabaseMock.insertPayload).not.toHaveProperty("created_by");
    expect(supabaseMock.insertPayload).not.toHaveProperty("created_at");
    expect(supabaseMock.insertSelect).toContain("idempotency_key,file_name");
    expect(recorded).toMatchObject({
      createdBy: "00000000-0000-4000-8000-000000000001",
      createdAt: "2026-06-16T08:01:00.000Z",
      idempotencyKey: "export-content-1",
      fileName: "visaflow-export-export-content-1.xlsx",
    });
  });

  test("returns the existing batch on idempotency conflicts", async () => {
    supabaseMock.client = {
      from: (table: string) => {
        expect(table).toBe("export_batches");
        return {
          insert: (payload: unknown) => {
            supabaseMock.insertPayload = payload;
            return insertChain({
              error: {
                name: "PostgrestError",
                code: "23505",
                message: "duplicate key value violates unique constraint",
              },
            });
          },
          select: () => ({
            eq: (field: string, value: string) => {
              supabaseMock.duplicateKey = `${field}:${value}`;
              return {
                single: async () => ({
                  data: row({ id: "00000000-0000-4000-8000-000000000777" }),
                  error: null,
                }),
              };
            },
          }),
        };
      },
    };

    const recorded = await recordExportBatch(batch);

    expect(supabaseMock.duplicateKey).toBe("idempotency_key:export-content-1");
    expect(recorded?.id).toBe("00000000-0000-4000-8000-000000000777");
  });

  test("wraps export batch insert failures with safe diagnostics", async () => {
    supabaseMock.client = {
      from: () => ({
        insert: () =>
          insertChain({
            error: {
              name: "PostgrestError",
              code: "42501",
              status: 403,
              message: "new row violates row-level security policy",
            },
          }),
      }),
    };

    await expect(recordExportBatch(batch)).rejects.toMatchObject({
      diagnostics: {
        operation: "export_batches.insert",
        kind: "rls",
        safeCode: "export_batches.insert:rls:42501",
        retryable: false,
      },
      userMessage:
        "Access was denied by Supabase policy. Ask an operator to confirm access.",
    });
  });

  test("commits export packages through the server-side RPC boundary", async () => {
    const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
      expect(name).toBe("complete_export_package");
      expect(args).toMatchObject({
        payload: {
          batch: {
            id: batch.id,
            format: "xlsx",
            idempotency_key: "export-content-1",
            file_name: "visaflow-export-export-content-1.xlsx",
            row_count: 2,
            submission_ids: ["VF-1001", "VF-1002"],
          },
        },
      });

      return {
        data: {
          exportBatch: row({
            id: "00000000-0000-4000-8000-000000000888",
          }),
          submissions: 2,
          statusHistory: 2,
          duplicate: false,
        },
        error: null,
      };
    });
    supabaseMock.client = { rpc };

    const committed = await commitExportPackage(batch);

    expect(committed).toMatchObject({
      id: "00000000-0000-4000-8000-000000000888",
      createdBy: "00000000-0000-4000-8000-000000000001",
      createdAt: "2026-06-16T08:01:00.000Z",
      idempotencyKey: "export-content-1",
    });
  });

  test("wraps export package RPC failures with safe diagnostics", async () => {
    supabaseMock.client = {
      rpc: async () => ({
        data: null,
        error: {
          name: "PostgrestError",
          code: "42501",
          status: 403,
          message: "Only admins can complete export packages",
        },
      }),
    };

    await expect(commitExportPackage(batch)).rejects.toMatchObject({
      diagnostics: {
        operation: "rpc.complete_export_package",
        kind: "rls",
        safeCode: "rpc.complete_export_package:rls:42501",
        retryable: false,
      },
      userMessage:
        "Access was denied by Supabase policy. Ask an operator to confirm access.",
    });
  });
});

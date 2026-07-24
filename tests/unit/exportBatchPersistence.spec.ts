import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
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

import { recordExportBatch } from "../../src/services/submissionService";

const batch: ExportBatch = {
  id: "00000000-0000-4000-8000-000000000301",
  createdBy: "00000000-0000-4000-8000-000000000999",
  createdAt: "2026-06-16T08:00:00.000Z",
  format: "xlsx",
  contentFingerprint: "xlsx|2|VF-1001",
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
    content_fingerprint: batch.contentFingerprint ?? null,
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
      content_fingerprint: "xlsx|2|VF-1001",
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
        "Недостаточно прав для этого действия. Обратитесь к администратору.",
    });
  });

  test("keeps the V19 export package RPC adapter out of the shared repository", () => {
    const repository = readFileSync(
      `${process.cwd()}/src/services/submissionService.ts`,
      "utf8",
    );
    const adapter = readFileSync(
      `${process.cwd()}/src/modules/submissions/exportPackagePersistence.ts`,
      "utf8",
    );

    expect(repository).not.toContain("complete_export_package");
    expect(repository).not.toContain("commitExportPackage");
    expect(adapter).toContain("export async function commitSubmissionExportPackage");
    expect(adapter).not.toContain("../../services/submissionService");
  });
});

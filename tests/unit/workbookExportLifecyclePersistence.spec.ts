import { describe, expect, test, vi } from "vitest";

import {
  completeWorkbookExport,
  recordWorkbookDownloadAcknowledgement,
  reconcileWorkbookExport,
} from "../../src/modules/submissions/workbookExportPersistence";
import type { ExportPackageIdentity } from "../../src/modules/submissions/types";

const supabaseMock = vi.hoisted(() => ({
  client: null as null | { rpc: ReturnType<typeof vi.fn> },
}));

vi.mock("../../src/lib/supabase/client", () => ({
  getSupabaseClient: () => supabaseMock.client,
}));

const identity: ExportPackageIdentity = {
  contentFingerprint: "xlsx|1|Sheet1|A:BD|SUB-1",
  fileName: "visaflow-export-abc1234.xlsx",
  format: "xlsx",
  idempotencyKey: "abc1234",
  rowCount: 1,
  submissionIds: ["SUB-1"],
};

const request = {
  archiveInputSignature: "archive-signature-1",
  expectedCaseRevisions: { "SUB-1": 7 },
  packageIdentity: identity,
  submissionIds: ["SUB-1"],
};

describe("workbook-only durable export persistence", () => {
  test("records an explicit T8 acknowledgement through the dedicated RPC", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        duplicate: false,
        receipt: {
          acknowledgedAt: "2026-08-12T12:00:00.000Z",
          acknowledgedBy: "admin-1",
          completedAt: null,
          completedBy: null,
          exportBatchId: "batch-1",
          id: "receipt-1",
          revisionFingerprint: "SUB-1:7",
        },
        submissions: 1,
      },
      error: null,
    }));
    supabaseMock.client = { rpc };

    await expect(recordWorkbookDownloadAcknowledgement(request)).resolves.toMatchObject(
      {
        duplicate: false,
        receipt: { id: "receipt-1", revisionFingerprint: "SUB-1:7" },
        submissions: 1,
      },
    );
    expect(rpc).toHaveBeenCalledWith(
      "record_export_workbook_download_acknowledgement",
      {
        payload: {
          archive_input_signature: request.archiveInputSignature,
          batch: {
            content_fingerprint: identity.contentFingerprint,
            file_name: identity.fileName,
            format: "xlsx",
            idempotency_key: identity.idempotencyKey,
            row_count: 1,
            submission_ids: ["SUB-1"],
          },
          expected_case_revisions: request.expectedCaseRevisions,
        },
      },
    );
  });

  test("completes T9 without fabricating ZIP document proof", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        duplicate: false,
        receipt: {
          acknowledgedAt: "2026-08-12T12:00:00.000Z",
          acknowledgedBy: "admin-1",
          completedAt: "2026-08-12T12:01:00.000Z",
          completedBy: "admin-1",
          exportBatchId: "batch-1",
          id: "receipt-1",
          revisionFingerprint: "SUB-1:7",
        },
        statusHistory: 1,
        submissions: 1,
      },
      error: null,
    }));
    supabaseMock.client = { rpc };

    await expect(completeWorkbookExport(request)).resolves.toMatchObject({
      duplicate: false,
      statusHistory: 1,
      submissions: 1,
    });
    expect(rpc).toHaveBeenCalledWith("complete_workbook_export", {
      payload: {
        archive_input_signature: request.archiveInputSignature,
        batch: expect.objectContaining({ idempotency_key: "abc1234" }),
        expected_case_revisions: request.expectedCaseRevisions,
      },
    });
    const firstCall = rpc.mock.calls[0] as unknown[] | undefined;
    expect(firstCall?.[1]).not.toHaveProperty("payload.document_export");
  });

  test("reconciles a lost Excel-only T9 response from the canonical receipt", async () => {
    const rpc = vi
      .fn()
      .mockRejectedValueOnce({ message: "Request timed out", name: "TimeoutError" })
      .mockResolvedValueOnce({
        data: { receipt: null, stage: "t9", status: "unknown", submissions: [] },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          receipt: {
            acknowledgedAt: "2026-08-12T12:00:00.000Z",
            acknowledgedBy: "admin-1",
            completedAt: "2026-08-12T12:01:00.000Z",
            completedBy: "admin-1",
            exportBatchId: "batch-1",
            id: "receipt-1",
            revisionFingerprint: "SUB-1:7",
          },
          stage: "t9",
          status: "committed",
          submissions: [{ caseRevision: 8, id: "SUB-1", status: "exported" }],
        },
        error: null,
      });
    supabaseMock.client = { rpc };

    await expect(completeWorkbookExport(request)).rejects.toMatchObject({
      diagnostics: {
        operation: "rpc.complete_workbook_export",
        retryable: true,
      },
    });

    await expect(reconcileWorkbookExport("t9", request)).resolves.toMatchObject({
      receipt: expect.objectContaining({ id: "receipt-1" }),
      stage: "t9",
      status: "committed",
      submissions: [{ caseRevision: 8, id: "SUB-1", status: "exported" }],
    });

    expect(rpc).toHaveBeenNthCalledWith(2, "reconcile_workbook_export", {
      payload: {
        archive_input_signature: request.archiveInputSignature,
        batch: expect.objectContaining({
          format: "xlsx",
          idempotency_key: identity.idempotencyKey,
        }),
        expected_case_revisions: request.expectedCaseRevisions,
        stage: "t9",
      },
    });
    expect(rpc).toHaveBeenNthCalledWith(3, "reconcile_workbook_export", {
      payload: {
        archive_input_signature: request.archiveInputSignature,
        batch: expect.objectContaining({
          format: "xlsx",
          idempotency_key: identity.idempotencyKey,
        }),
        expected_case_revisions: { "SUB-1": 8 },
        stage: "t9",
      },
    });
    const reconciliationPayload = rpc.mock.calls[2]?.[1] as
      | { payload?: Record<string, unknown> }
      | undefined;
    expect(reconciliationPayload?.payload).not.toHaveProperty("document_export");
  });

  test.each(["committed", "not_committed", "unknown"] as const)(
    "maps workbook reconciliation status %s without a document event",
    async (status) => {
      const rpc = vi.fn(async () => ({
        data: { receipt: null, stage: "t8", status, submissions: [] },
        error: null,
      }));
      supabaseMock.client = { rpc };

      await expect(reconcileWorkbookExport("t8", request)).resolves.toMatchObject({
        stage: "t8",
        status,
      });
      expect(rpc).toHaveBeenCalledWith("reconcile_workbook_export", {
        payload: {
          archive_input_signature: request.archiveInputSignature,
          batch: expect.objectContaining({ submission_ids: ["SUB-1"] }),
          expected_case_revisions: request.expectedCaseRevisions,
          stage: "t8",
        },
      });
    },
  );
});

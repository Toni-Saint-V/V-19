import { describe, expect, test, vi } from "vitest";
import {
  completeExportPackage,
  type ExportBatchRecorder,
  type ExportedSubmissionPersister,
} from "../../src/modules/submissions/exportWorkflow";
import { initialSubmissions } from "../../src/modules/submissions/mockData";
import { applyExportStateToSelection } from "../../src/modules/submissions/submissionActions";
import type { Submission } from "../../src/modules/submissions/types";

const createdAt = "2026-06-16T09:00:00.000Z";
const createdBy = "00000000-0000-4000-8000-000000000010";
const serverCreatedAt = "2026-06-16T09:01:00.000Z";
const serverCreatedBy = "00000000-0000-4000-8000-000000000020";

function byId(id: string): Submission {
  const submission = initialSubmissions.find((item) => item.id === id);
  if (!submission) throw new Error(`Missing fixture ${id}`);
  return submission;
}

function downloadedSelection(): Submission[] {
  const generated = applyExportStateToSelection(
    [byId("ПД-1056")],
    ["ПД-1056"],
    "file_generated",
  );

  return applyExportStateToSelection(
    generated,
    ["ПД-1056"],
    "file_downloaded",
  );
}

function options(
  recordBatch: ExportBatchRecorder,
  persistExportedSubmissions?: ExportedSubmissionPersister,
) {
  return {
    batchId: "00000000-0000-4000-8000-000000000501",
    createdAt,
    createdBy,
    format: "xlsx" as const,
    persistExportedSubmissions,
    recordBatch,
  };
}

describe("submission export workflow", () => {
  test("records the durable batch before marking submissions exported", async () => {
    const recordBatch = vi.fn<ExportBatchRecorder>(async (batch) => ({
      ...batch,
      id: "00000000-0000-4000-8000-000000000777",
      createdAt: serverCreatedAt,
      createdBy: serverCreatedBy,
    }));
    const persistExportedSubmissions = vi.fn<ExportedSubmissionPersister>();

    const result = await completeExportPackage(
      downloadedSelection(),
      options(recordBatch, persistExportedSubmissions),
    );

    expect(recordBatch).toHaveBeenCalledTimes(1);
    expect(recordBatch.mock.calls[0]?.[0]).toMatchObject({
      createdAt,
      createdBy,
      format: "xlsx",
      rowCount: 1,
      submissionIds: ["ПД-1056"],
    });
    expect(persistExportedSubmissions).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("exported");
    if (result.status !== "exported") throw new Error("expected exported result");
    expect(result.batch).toMatchObject({
      id: "00000000-0000-4000-8000-000000000777",
      createdAt: serverCreatedAt,
      createdBy: serverCreatedBy,
    });
    expect(result.submissions[0]).toMatchObject({
      status: "exported",
      exportState: "marked_exported",
      updatedAt: serverCreatedAt,
    });
    expect(result.submissions[0]?.history[0]?.text).toContain(
      result.batch.fileName,
    );
  });

  test("does not record or mutate when the package was not downloaded", async () => {
    const recordBatch = vi.fn<ExportBatchRecorder>();

    const result = await completeExportPackage([byId("ПД-1056")], options(recordBatch));

    expect(result.status).toBe("blocked");
    expect(recordBatch).not.toHaveBeenCalled();
    expect(result.submissions[0]?.status).toBe("ready_for_export");
  });

  test("does not mark exported when durable recording fails", async () => {
    const recordBatch = vi.fn<ExportBatchRecorder>(async () => {
      throw new Error("database unavailable");
    });
    const selection = downloadedSelection();

    await expect(
      completeExportPackage(selection, options(recordBatch)),
    ).rejects.toThrow("database unavailable");

    expect(selection[0]?.status).toBe("ready_for_export");
    expect(selection[0]?.exportState).toBe("file_downloaded");
  });

  test("fails closed when exported snapshot persistence fails after batch record", async () => {
    const recordBatch = vi.fn<ExportBatchRecorder>(async (batch) => ({
      ...batch,
      id: "00000000-0000-4000-8000-000000000777",
      createdAt: serverCreatedAt,
      createdBy: serverCreatedBy,
    }));
    const persistExportedSubmissions = vi.fn<ExportedSubmissionPersister>(
      async () => {
        throw new Error("snapshot save failed");
      },
    );
    const selection = downloadedSelection();

    await expect(
      completeExportPackage(
        selection,
        options(recordBatch, persistExportedSubmissions),
      ),
    ).rejects.toThrow("snapshot save failed");

    expect(recordBatch).toHaveBeenCalledTimes(1);
    expect(persistExportedSubmissions).toHaveBeenCalledTimes(1);
    expect(selection[0]?.status).toBe("ready_for_export");
    expect(selection[0]?.exportState).toBe("file_downloaded");
  });
});

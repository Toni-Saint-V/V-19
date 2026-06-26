import { describe, expect, test, vi } from "vitest";
import {
  completeExportPackage,
  type ExportPackageCommitter,
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

function canonicalMediaSubmission(submission: Submission): Submission {
  return {
    ...submission,
    files: submission.files.filter(
      (file) =>
        file.type === "passport_scan" ||
        file.type === "selfie" ||
        file.type === "selfie_2",
    ),
  };
}

function readySubmission(): Submission {
  return canonicalMediaSubmission(byId("ПД-1056"));
}

function downloadedSelection(): Submission[] {
  const generated = applyExportStateToSelection(
    [readySubmission()],
    ["ПД-1056"],
    "file_generated",
  );

  return applyExportStateToSelection(generated, ["ПД-1056"], "file_downloaded");
}

function options(
  commitPackage: ExportPackageCommitter,
  persistExportedSubmissions?: ExportedSubmissionPersister,
) {
  return {
    batchId: "00000000-0000-4000-8000-000000000501",
    createdAt,
    createdBy,
    format: "xlsx" as const,
    commitPackage,
    persistExportedSubmissions,
  };
}

describe("submission export workflow", () => {
  test("records the durable batch before marking submissions exported", async () => {
    const commitPackage = vi.fn<ExportPackageCommitter>(async (batch) => ({
      batch: {
        ...batch,
        id: "00000000-0000-4000-8000-000000000777",
        createdAt: serverCreatedAt,
        createdBy: serverCreatedBy,
      },
      changedSubmissions: 1,
      duplicate: false,
      statusHistory: 1,
    }));
    const persistExportedSubmissions = vi.fn<ExportedSubmissionPersister>();

    const result = await completeExportPackage(
      downloadedSelection(),
      options(commitPackage, persistExportedSubmissions),
    );

    expect(commitPackage).toHaveBeenCalledTimes(1);
    expect(commitPackage.mock.calls[0]?.[0]).toMatchObject({
      createdAt,
      createdBy,
      contentFingerprint: expect.stringContaining("ПД-1056"),
      format: "xlsx",
      rowCount: 1,
      submissionIds: ["ПД-1056"],
    });
    expect(persistExportedSubmissions).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("exported");
    if (result.status !== "exported") throw new Error("expected exported result");
    expect(result.batch).toMatchObject({
      id: "00000000-0000-4000-8000-000000000777",
      contentFingerprint: expect.stringContaining("Дмитрий Орлов"),
      createdAt: serverCreatedAt,
      createdBy: serverCreatedBy,
    });
    expect(result.submissions[0]).toMatchObject({
      status: "exported",
      exportState: "marked_exported",
      updatedAt: serverCreatedAt,
    });
    expect(result.submissions[0]?.history[0]?.text).toContain(result.batch.fileName);
  });

  test("does not record or mutate when the package was not downloaded", async () => {
    const commitPackage = vi.fn<ExportPackageCommitter>();

    const result = await completeExportPackage([readySubmission()], options(commitPackage));

    expect(result.status).toBe("blocked");
    expect(commitPackage).not.toHaveBeenCalled();
    expect(result.submissions[0]?.status).toBe("ready_for_export");
  });

  test("does not mark exported when durable recording fails", async () => {
    const commitPackage = vi.fn<ExportPackageCommitter>(async () => {
      throw new Error("database unavailable");
    });
    const selection = downloadedSelection();

    await expect(
      completeExportPackage(selection, options(commitPackage)),
    ).rejects.toThrow("database unavailable");

    expect(selection[0]?.status).toBe("ready_for_export");
    expect(selection[0]?.exportState).toBe("file_downloaded");
  });

  test("fails closed when exported snapshot persistence fails after batch record", async () => {
    const commitPackage = vi.fn<ExportPackageCommitter>(async (batch) => ({
      batch: {
        ...batch,
        id: "00000000-0000-4000-8000-000000000777",
        createdAt: serverCreatedAt,
        createdBy: serverCreatedBy,
      },
      changedSubmissions: 1,
      duplicate: false,
      statusHistory: 1,
    }));
    const persistExportedSubmissions = vi.fn<ExportedSubmissionPersister>(async () => {
      throw new Error("snapshot save failed");
    });
    const selection = downloadedSelection();

    await expect(
      completeExportPackage(
        selection,
        options(commitPackage, persistExportedSubmissions),
      ),
    ).rejects.toThrow("snapshot save failed");

    expect(commitPackage).toHaveBeenCalledTimes(1);
    expect(persistExportedSubmissions).toHaveBeenCalledTimes(1);
    expect(selection[0]?.status).toBe("ready_for_export");
    expect(selection[0]?.exportState).toBe("file_downloaded");
  });
});

import type { ExportBatch } from "../../types/domain";
import { commitSubmissionExportPackage } from "./exportPackagePersistence";
import { exportSummary } from "./exportRules";
import { tripDates } from "./selectors";
import { typeLabels } from "./status";
import type { ExportRow, Submission } from "./types";

export type ExportBatchRecorder = (batch: ExportBatch) => Promise<ExportBatch | null>;
export type ExportedSubmissionPersister = (
  submissions: Submission[],
) => Promise<void>;

export interface CompleteExportPackageOptions {
  batchId?: string;
  createdAt: string;
  createdBy: string;
  format: ExportBatch["format"];
  persistExportedSubmissions?: ExportedSubmissionPersister;
  recordBatch?: ExportBatchRecorder;
}

export interface CompleteExportPackageBlocked {
  status: "blocked";
  blockers: string[];
  submissions: Submission[];
}

export interface CompleteExportPackageExported {
  status: "exported";
  batch: ExportBatch;
  submissions: Submission[];
}

export type CompleteExportPackageResult =
  | CompleteExportPackageBlocked
  | CompleteExportPackageExported;

const exportRowColumns: Array<keyof ExportRow> = [
  "submissionCode",
  "submissionId",
  "submissionTitle",
  "applicantName",
  "city",
  "tripDates",
  "type",
  "groupKey",
  "groupLabel",
  "applicantIndex",
  "applicantCount",
];

export async function completeExportPackage(
  submissions: Submission[],
  options: CompleteExportPackageOptions,
): Promise<CompleteExportPackageResult> {
  const plan = exportSummary(submissions);
  if (!plan.canMarkExported) {
    return {
      status: "blocked",
      blockers: plan.blockers.length
        ? plan.blockers.map((blocker) => blocker.reason)
        : ["Сначала сформируйте и скачайте файл выгрузки."],
      submissions,
    };
  }

  const idempotencyKey = exportPackageIdempotencyKey(plan.rows, options.format);
  const batch: ExportBatch = {
    id: options.batchId ?? crypto.randomUUID(),
    createdAt: options.createdAt,
    createdBy: options.createdBy,
    fileName: `visaflow-export-${idempotencyKey}.${options.format}`,
    format: options.format,
    idempotencyKey,
    rowCount: plan.rowCount,
    submissionIds: sortedSubmissionIds(submissions),
  };
  const recorder = options.recordBatch ?? commitSubmissionExportPackage;
  const recordedBatch = await recorder(batch);
  if (!recordedBatch) {
    throw new Error("Export batch persistence did not return a recorded batch.");
  }

  const exportedSubmissions = markSubmissionsExported(submissions, recordedBatch);
  if (!allSubmissionsContainRecordedBatch(exportedSubmissions, recordedBatch)) {
    throw new Error(
      "Export package was recorded, but exported submissions no longer match the batch.",
    );
  }

  await options.persistExportedSubmissions?.(exportedSubmissions);

  return {
    status: "exported",
    batch: recordedBatch,
    submissions: exportedSubmissions,
  };
}

function markSubmissionsExported(
  submissions: Submission[],
  batch: ExportBatch,
): Submission[] {
  const ids = new Set(batch.submissionIds);

  return submissions.map((submission) =>
    ids.has(submission.id) ? markSubmissionExported(submission, batch) : submission,
  );
}

function markSubmissionExported(
  submission: Submission,
  batch: ExportBatch,
): Submission {
  const historyId = `и-${submission.id}-выгружено-${batch.id}`;
  const existingHistory = submission.history.some((item) => item.id === historyId);

  return {
    ...submission,
    status: "exported",
    exportState: "marked_exported",
    updatedAt: batch.createdAt,
    history: existingHistory
      ? submission.history
      : [
          {
            id: historyId,
            text: `Подача включена в выгрузку ${batch.fileName ?? batch.id}`,
            at: batch.createdAt,
            source: "admin",
          },
          ...submission.history,
        ],
  };
}

function allSubmissionsContainRecordedBatch(
  submissions: Submission[],
  batch: ExportBatch,
): boolean {
  const expectedIds = new Set(batch.submissionIds);
  const matchingSubmissions = submissions.filter((submission) =>
    expectedIds.has(submission.id),
  );

  return (
    matchingSubmissions.length === expectedIds.size &&
    matchingSubmissions.every(
      (submission) =>
        submission.status === "exported" &&
        submission.exportState === "marked_exported" &&
        submission.history.some((item) => item.text.includes(batch.fileName ?? batch.id)),
    )
  );
}

function exportPackageIdempotencyKey(
  rows: ExportRow[],
  format: ExportBatch["format"],
): string {
  const source = rows
    .map((row) => exportRowColumns.map((column) => String(row[column])).join("\u001f"))
    .join("|");

  return stableKey([format, rows.length, source].join("|"));
}

function sortedSubmissionIds(submissions: Submission[]): string[] {
  return submissions.map((submission) => submission.id).sort();
}

function stableKey(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }

  return (hash >>> 0).toString(36).padStart(7, "0");
}

export function exportPackagePreviewName(
  submissions: Submission[],
  format: ExportBatch["format"],
): string | null {
  const plan = exportSummary(submissions);
  if (plan.rowCount === 0) return null;
  return `visaflow-export-${exportPackageIdempotencyKey(plan.rows, format)}.${format}`;
}

export function exportPackageLabel(submission: Submission): string {
  return [
    submission.id,
    typeLabels[submission.type],
    submission.city,
    tripDates(submission),
  ].join(" · ");
}

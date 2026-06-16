import type {
  ExportBlocker,
  ExportPackageFormat,
  ExportPackageIdentity,
  ExportRow,
  ExportState,
  Submission,
} from "./types";
import { tripDates } from "./selectors";
import { typeLabels } from "./status";

export type ExportSelectionState = ExportState | "mixed";
export type ExportSummary = {
  rows: ExportRow[];
  blockers: ExportBlocker[];
  rowCount: number;
  ready: boolean;
  exportState: ExportSelectionState;
  canGenerate: boolean;
  canDownload: boolean;
  canMarkExported: boolean;
};

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

export function getExportBlockers(submissions: Submission[]): ExportBlocker[] {
  if (submissions.length === 0) return [{ reason: "Выберите хотя бы одну подачу" }];

  const blockers: ExportBlocker[] = [];
  const notReady = submissions.filter(
    (submission) => submission.status !== "ready_for_export",
  );
  const alreadyExported = submissions.filter(
    (submission) =>
      submission.status === "exported" || submission.exportState === "marked_exported",
  );
  const cities = new Set(submissions.map((submission) => submission.city));
  const dates = new Set(submissions.map(tripDates));
  const types = new Set(submissions.map((submission) => submission.type));
  const exportState = getExportSelectionState(submissions);

  if (notReady.length > 0) {
    blockers.push({ reason: "В выборке есть подачи не готовые к выгрузке" });
  }

  if (alreadyExported.length > 0) {
    blockers.push({ reason: "В выборке есть уже выгруженные подачи" });
  }

  if (cities.size > 1) blockers.push({ reason: "Нельзя смешивать разные города" });
  if (dates.size > 1) blockers.push({ reason: "Нельзя смешивать разные даты поездки" });
  if (types.size > 1)
    blockers.push({ reason: "Нельзя смешивать одинарные и семейные подачи" });
  if (exportState === "mixed")
    blockers.push({ reason: "В выборке разные состояния выгрузки" });

  return blockers;
}

export function canGenerateExport(submissions: Submission[]) {
  return getExportBlockers(submissions).length === 0;
}

export function buildExportRows(submissions: Submission[]): ExportRow[] {
  return submissions.flatMap((submission) =>
    submission.applicants.map((applicant, index) => ({
      submissionCode:
        submission.type === "family" ? `${submission.id}-${index + 1}` : submission.id,
      submissionId: submission.id,
      submissionTitle: submission.title,
      applicantName: applicant.fullName,
      city: submission.city,
      tripDates: tripDates(submission),
      type: typeLabels[submission.type],
      groupKey: submission.id,
      groupLabel: submission.type === "family" ? "Семья" : "Один заявитель",
      applicantIndex: index + 1,
      applicantCount: submission.applicants.length,
    })),
  );
}

export function exportSummary(
  submissions: Submission[],
  format: ExportPackageFormat = "xlsx",
): ExportSummary {
  const rows = buildExportRows(submissions);
  const blockers = getExportBlockers(submissions);
  const exportState = getExportSelectionState(submissions);
  const packageIdentity = buildExportPackageIdentity(submissions, format);
  const packageStale =
    Boolean(packageIdentity) &&
    (exportState === "file_generated" || exportState === "file_downloaded") &&
    !submissions.every(
      (submission) =>
        submission.exportPackage &&
        exportPackageIdentityMatches(submission.exportPackage, packageIdentity),
    );
  const effectiveBlockers = packageStale
    ? [
        ...blockers,
        { reason: "Состав выгрузки изменился после формирования файла" },
      ]
    : blockers;
  const ready = blockers.length === 0;

  return {
    rows,
    blockers: effectiveBlockers,
    rowCount: rows.length,
    ready: ready && !packageStale,
    exportState,
    canGenerate: ready && (exportState === "ready" || packageStale),
    canDownload: ready && !packageStale && exportState === "file_generated",
    canMarkExported: ready && !packageStale && exportState === "file_downloaded",
  };
}

export function buildExportPackageIdentity(
  submissions: Submission[],
  format: ExportPackageFormat = "xlsx",
): ExportPackageIdentity | null {
  const rows = buildExportRows(submissions);
  if (rows.length === 0) return null;

  const contentFingerprint = exportPackageContentFingerprint(rows, format);
  const idempotencyKey = stableKey(contentFingerprint);
  return {
    contentFingerprint,
    fileName: `visaflow-export-${idempotencyKey}.${format}`,
    format,
    idempotencyKey,
    rowCount: rows.length,
    submissionIds: sortedSubmissionIds(submissions),
  };
}

export function exportPackageIdentityMatches(
  left: ExportPackageIdentity,
  right: ExportPackageIdentity | null,
): right is ExportPackageIdentity {
  if (!right) return false;

  return (
    left.contentFingerprint === right.contentFingerprint &&
    left.fileName === right.fileName &&
    left.format === right.format &&
    left.idempotencyKey === right.idempotencyKey &&
    left.rowCount === right.rowCount &&
    sameStringArray(left.submissionIds, right.submissionIds)
  );
}

export function getExportSelectionState(
  submissions: Submission[],
): ExportSelectionState {
  if (submissions.length === 0) return "not_ready";

  const states = new Set(
    submissions.map(
      (submission) => submission.exportState ?? inferExportState(submission),
    ),
  );

  if (states.size > 1) return "mixed";
  return [...states][0] ?? "not_ready";
}

function inferExportState(submission: Submission): ExportState {
  if (submission.status === "exported") return "marked_exported";
  if (submission.status === "ready_for_export") return "ready";
  return "not_ready";
}

function exportPackageContentFingerprint(
  rows: ExportRow[],
  format: ExportPackageFormat,
): string {
  const orderedRows = [...rows].sort(
    (left, right) =>
      left.submissionId.localeCompare(right.submissionId) ||
      left.applicantIndex - right.applicantIndex,
  );
  const source = orderedRows
    .map((row) => exportRowColumns.map((column) => String(row[column])).join("\u001f"))
    .join("|");

  return [format, orderedRows.length, source].join("|");
}

function sortedSubmissionIds(submissions: Submission[]): string[] {
  return submissions.map((submission) => submission.id).sort();
}

function sameStringArray(left: string[], right: string[]): boolean {
  return (
    left.length === right.length && left.every((value, index) => value === right[index])
  );
}

function stableKey(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }

  return (hash >>> 0).toString(36).padStart(7, "0");
}

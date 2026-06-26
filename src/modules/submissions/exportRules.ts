import type {
  ExportBlocker,
  ExportPackageFormat,
  ExportPackageIdentity,
  ExportState,
  Submission,
} from "./types";
import { tripDates } from "./selectors";
import {
  buildExportContractRows,
  buildExportPreview,
  exportContractFingerprint,
  type ExportContractPreview,
  type ExportContractRow,
  validateExportContractShape,
} from "./exportContract";

export type ExportSelectionState = ExportState | "mixed";
export type ExportSummary = {
  rows: ExportContractRow[];
  blockers: ExportBlocker[];
  contract: {
    columnCount: number;
    range: ExportContractPreview["range"];
    sheetName: ExportContractPreview["sheetName"];
    valid: boolean;
  };
  preview: ExportContractPreview;
  rowCount: number;
  ready: boolean;
  exportState: ExportSelectionState;
  canGenerate: boolean;
  canDownload: boolean;
  canMarkExported: boolean;
  downloadPackageIdentity: ExportPackageIdentity | null;
};

export function getExportBlockers(submissions: Submission[]): ExportBlocker[] {
  if (submissions.length === 0) return [{ reason: "Выберите хотя бы одну подачу" }];

  const blockers: ExportBlocker[] = [];
  const contractValid = validateExportContractShape();
  const notReady = submissions.filter(
    (submission) => submission.status !== "ready_for_export",
  );
  const alreadyExported = submissions.filter(
    (submission) =>
      submission.status === "exported" || submission.exportState === "marked_exported",
  );
  const emptyApplicantSubmissions = submissions.filter(
    (submission) => submission.applicants.length === 0,
  );
  const rows = buildExportRows(submissions);
  const rowsWithMissingApplicantName = rows.filter((row) => !row.applicantName.trim());
  const openBlockingIssues = submissions.filter((submission) =>
    submission.issues.some(
      (issue) =>
        issue.severity === "blocker" &&
        (issue.status === "open" || issue.status === "fixed_by_agent"),
    ),
  );
  const cities = new Set(submissions.map((submission) => submission.city));
  const dates = new Set(submissions.map(tripDates));
  const types = new Set(submissions.map((submission) => submission.type));
  const exportState = getExportSelectionState(submissions);

  if (!contractValid) {
    blockers.push({ reason: "Контракт Excel A:BD не подтверждён" });
  }

  if (notReady.length > 0) {
    blockers.push({ reason: "В выборке есть подачи не готовые к выгрузке" });
  }

  if (alreadyExported.length > 0) {
    blockers.push({ reason: "В выборке есть уже выгруженные подачи" });
  }

  if (emptyApplicantSubmissions.length > 0) {
    blockers.push({ reason: "В выборке есть подачи без заявителей" });
  }

  if (rowsWithMissingApplicantName.length > 0) {
    blockers.push({ reason: "В строках выгрузки есть заявители без ФИО" });
  }

  if (openBlockingIssues.length > 0) {
    blockers.push({
      reason: "В выборке есть блокирующие замечания, не закрытые администратором",
    });
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

export function buildExportRows(submissions: Submission[]): ExportContractRow[] {
  return buildExportContractRows(submissions);
}

export function exportSummary(
  submissions: Submission[],
  format: ExportPackageFormat = "xlsx",
): ExportSummary {
  const rows = buildExportRows(submissions);
  const blockers = getExportBlockers(submissions);
  const exportState = getExportSelectionState(submissions);
  const packageIdentity = buildExportPackageIdentity(submissions, format);
  const preview = buildExportPreview(rows);
  const contractValid = validateExportContractShape();
  const packageStale =
    Boolean(packageIdentity) &&
    (exportState === "file_generated" || exportState === "file_downloaded") &&
    !submissions.every(
      (submission) =>
        submission.exportPackage &&
        exportPackageIdentityMatches(submission.exportPackage, packageIdentity),
    );
  const effectiveBlockers = packageStale
    ? [...blockers, { reason: "Состав выгрузки изменился после формирования файла" }]
    : blockers;
  const ready = blockers.length === 0 && contractValid;
  const canDownload = ready && !packageStale && exportState === "file_generated";

  return {
    rows,
    blockers: effectiveBlockers,
    contract: {
      columnCount: preview.columnCount,
      range: preview.range,
      sheetName: preview.sheetName,
      valid: contractValid,
    },
    preview,
    rowCount: rows.length,
    ready: ready && !packageStale,
    exportState,
    canGenerate: ready && (exportState === "ready" || packageStale),
    canDownload,
    canMarkExported: ready && !packageStale && exportState === "file_downloaded",
    downloadPackageIdentity: canDownload ? packageIdentity : null,
  };
}

export function selectedReadySubmissionsForExport(
  submissions: Submission[],
  selectedIds: readonly string[],
): Submission[] {
  const selectedIdSet = new Set(selectedIds);
  return submissions.filter(
    (submission) =>
      submission.status === "ready_for_export" && selectedIdSet.has(submission.id),
  );
}

export function exportSummaryForSelectedIds(
  submissions: Submission[],
  selectedIds: readonly string[],
  format: ExportPackageFormat = "xlsx",
): ExportSummary {
  return exportSummary(
    selectedReadySubmissionsForExport(submissions, selectedIds),
    format,
  );
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

export function exportRowsMatchPackageIdentity(
  rows: ExportContractRow[],
  identity: ExportPackageIdentity | null,
): identity is ExportPackageIdentity {
  return Boolean(
    identity &&
    identity.rowCount === rows.length &&
    identity.contentFingerprint ===
      exportPackageContentFingerprint(rows, identity.format),
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
  rows: ExportContractRow[],
  format: ExportPackageFormat,
): string {
  return exportContractFingerprint(rows, format);
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

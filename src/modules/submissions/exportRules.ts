import type {
  ExportBlocker,
  ExportPackageFormat,
  ExportPackageIdentity,
  ExportState,
  Submission,
} from "./types";
import {
  type CanonicalSubmissionStatus,
  canonicalRequiredMediaReadiness,
  normalizeLegacySubmissionStatus,
} from "./domainContract";
import { hasUsableTripDateRange } from "./status";
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
  warnings: ExportBlocker[];
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
    (submission) => statusForExportDecision(submission) !== "ready_for_export",
  );
  const alreadyExported = submissions.filter(
    (submission) =>
      statusForExportDecision(submission) === "exported" ||
      submission.exportState === "marked_exported",
  );
  const missingCanonicalMedia = submissions.filter(
    (submission) => !canonicalMediaReadyForExport(submission),
  );
  const emptyApplicantSubmissions = submissions.filter(
    (submission) => submission.applicants.length === 0,
  );
  const missingTripDateRange = submissions.filter(
    (submission) => !hasUsableTripDateRange(submission),
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
  const ownerAgentIds = new Set(submissions.map((submission) => submission.agentId));
  const tripDateRanges = new Set(submissions.map(tripDateRangeKey));
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

  if (missingCanonicalMedia.length > 0) {
    blockers.push({
      reason: "В выборке есть подачи без полного канонического пакета медиа",
    });
  }

  if (emptyApplicantSubmissions.length > 0) {
    blockers.push({ reason: "В выборке есть подачи без заявителей" });
  }

  if (missingTripDateRange.length > 0) {
    blockers.push({ reason: "В выборке есть подачи без дат поездки" });
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
  if (cities.size > 1 && ownerAgentIds.size > 1)
    blockers.push({ reason: "Нельзя смешивать подачи разных агентов" });
  if (tripDateRanges.size > 1)
    blockers.push({ reason: "Нельзя смешивать разные даты поездки" });
  if (exportState === "mixed")
    blockers.push({ reason: "В выборке разные состояния выгрузки" });

  return blockers;
}

export function getExportWarnings(submissions: Submission[]): ExportBlocker[] {
  if (submissions.length === 0) return [];

  const cities = new Set(submissions.map((submission) => submission.city));
  const ownerAgentIds = new Set(submissions.map((submission) => submission.agentId));

  if (cities.size === 1 && ownerAgentIds.size > 1) {
    return [
      {
        reason:
          "Пакет содержит подачи разных агентов: Excel разрешён, returned PDF останется agent-scoped.",
      },
    ];
  }

  return [];
}

export function canGenerateExport(submissions: Submission[]) {
  return getExportBlockers(submissions).length === 0;
}

export function isSubmissionSelectableForExport(submission: Submission): boolean {
  return getExportBlockers([submission]).length === 0;
}

export function buildExportRows(submissions: Submission[]): ExportContractRow[] {
  return buildExportContractRows(orderSubmissionsForExportRows(submissions));
}

function orderSubmissionsForExportRows(submissions: Submission[]): Submission[] {
  return submissions
    .map((submission, index) => ({ index, submission }))
    .sort((left, right) => {
      const leftFamilyOrder = left.submission.type === "family" ? 0 : 1;
      const rightFamilyOrder = right.submission.type === "family" ? 0 : 1;

      if (leftFamilyOrder !== rightFamilyOrder) {
        return leftFamilyOrder - rightFamilyOrder;
      }

      return left.index - right.index;
    })
    .map((item) => item.submission);
}

function tripDateRangeKey(submission: Submission): string {
  return `${submission.tripDateFrom.trim()}|${submission.tripDateTo.trim()}`;
}

export function exportSummary(
  submissions: Submission[],
  format: ExportPackageFormat = "xlsx",
): ExportSummary {
  const rows = buildExportRows(submissions);
  const blockers = getExportBlockers(submissions);
  const warnings = getExportWarnings(submissions);
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
    warnings,
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
      statusForExportDecision(submission) === "ready_for_export" &&
      selectedIdSet.has(submission.id),
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
  const status = statusForExportDecision(submission);
  if (status === "exported") return "marked_exported";
  if (status === "ready_for_export") return "ready";
  return "not_ready";
}

function statusForExportDecision(
  submission: Submission,
): CanonicalSubmissionStatus | null {
  const status = normalizeLegacySubmissionStatus(submission.status, {
    exportedAt: exportedAtForDecision(submission),
  });
  return status.ok ? status.data : null;
}

function canonicalMediaReadyForExport(submission: Submission): boolean {
  return canonicalRequiredMediaReadiness(
    {
      applicants: submission.applicants,
      files: submission.files,
    },
    { requireAccepted: true },
  ).ok;
}

function exportedAtForDecision(submission: Submission): unknown {
  const legacy = submission as Submission & {
    exportedAt?: unknown;
    exported_at?: unknown;
  };
  return legacy.exportedAt ?? legacy.exported_at;
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

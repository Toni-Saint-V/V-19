import type {
  AgentOwnerId,
  City,
  ExportBlocker,
  ExportPackageFormat,
  ExportPackageIdentity,
  ExportState,
  Submission,
} from "./types";
import { agentOwnerDisplayName } from "./ownership";
import {
  type CanonicalSubmissionStatus,
  canonicalRequiredMediaReadiness,
  isCanonicalFrontendMediaType,
  normalizeLegacySubmissionStatus,
} from "./domainContract";
import { passportGateIssues } from "./passportExtractionGuards";
import { hasUsableTripDateRange } from "./status";
import {
  buildExportContractRows,
  buildExportPreview,
  exportContractDataIssues,
  exportContractColumns,
  exportContractFingerprint,
  type ExportContractColumnKey,
  type ExportContractPreview,
  type ExportContractRow,
  validateExportContractShape,
} from "./exportContract";
import { validateVisaApplicationFormData } from "./visaApplicationFormPdf";
import { blsQuestionnaireReadiness } from "./questionnaireBlsRules";

export type ExportSelectionState = ExportState | "mixed";
export type ExportMappingState = "mapped" | "derived" | "unresolved";
export type ExportMappingAuditRow = {
  header: string;
  index: number;
  key: ExportContractColumnKey;
  state: ExportMappingState;
};
export type ExportMappingAudit = {
  derivedCount: number;
  mappedCount: number;
  rows: ExportMappingAuditRow[];
  unresolvedCount: number;
};
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

const derivedExportColumnKeys = new Set<ExportContractColumnKey>([
  "firstName",
  "lastName",
  "appointmentType",
]);

export type ExportInternalMapping = {
  applicantFullName: string;
  applicantId: string;
  city: City;
  excelRowNumber: number;
  exportPackageId: string;
  familyGroupId?: string;
  familySubmissionId?: string;
  ownerAgentId: AgentOwnerId;
  ownerAgentName: string;
  passportLast3: string;
  passportNumber: string;
  submissionId: string;
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
  const submissionsWithPassportGateIssues = submissions.filter(
    (submission) => passportGateIssues(submission).length > 0,
  );
  const rows = buildExportRows(submissions);
  const rowsWithMissingApplicantName = rows.filter((row) => !row.applicantName.trim());
  const rowDataIssues = new Set(exportContractDataIssues(rows));
  const applicantsWithIncompleteVisaForm = submissions.flatMap((submission) =>
    submission.applicants.filter(
      (applicant) => !validateVisaApplicationFormData(submission, applicant).ok,
    ),
  );
  const submissionsWithIncompleteQuestionnaire = submissions.filter(
    (submission) => !blsQuestionnaireReadiness(submission).ready,
  );
  const openBlockingIssues = submissions.filter((submission) =>
    submission.issues.some(
      (issue) => issue.status === "open" || issue.status === "fixed_by_agent",
    ),
  );
  const cities = new Set(submissions.map((submission) => submission.city));
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

  if (submissionsWithPassportGateIssues.length > 0) {
    blockers.push({
      reason: "В выборке есть подачи с непроверенным или некорректным паспортом",
    });
  }

  if (rowsWithMissingApplicantName.length > 0) {
    blockers.push({ reason: "В строках выгрузки есть заявители без ФИО" });
  }

  if (rowDataIssues.has("unsupported_means")) {
    blockers.push({
      reason:
        "В строках выгрузки есть способ оплаты, который не поддерживается Excel-контрактом",
    });
  }

  if (rowDataIssues.has("invalid_applicant_mobile")) {
    blockers.push({
      reason: "В строках выгрузки есть телефон заявителя не в формате 10 цифр",
    });
  }

  if (rowDataIssues.has("duplicate_passport")) {
    blockers.push({
      reason: "В строках выгрузки повторяется номер паспорта у разных заявителей",
    });
  }

  if (rowDataIssues.has("duplicate_identity")) {
    blockers.push({
      reason:
        "В строках выгрузки повторяются ФИО и дата рождения у разных заявителей",
    });
  }

  if (rowDataIssues.has("family_contact_mismatch")) {
    blockers.push({
      reason:
        "В семейной подаче email и телефон должны совпадать у всех заявителей",
    });
  }

  if (applicantsWithIncompleteVisaForm.length > 0) {
    blockers.push({
      reason:
        "В выборке есть анкеты без обязательных данных для PDF. ZIP не сформирован.",
    });
  }

  if (submissionsWithIncompleteQuestionnaire.length > 0) {
    blockers.push({
      reason: "В выборке есть анкеты, которые не прошли актуальную BLS-проверку",
    });
  }

  if (openBlockingIssues.length > 0) {
    blockers.push({
      reason: "В выборке есть блокирующие замечания, не закрытые администратором",
    });
  }

  if (cities.size > 1) blockers.push({ reason: "Нельзя смешивать разные города" });
  if (exportState === "mixed")
    blockers.push({ reason: "В выборке разные состояния выгрузки" });

  return blockers;
}

export function getExportWarnings(submissions: Submission[]): ExportBlocker[] {
  if (submissions.length === 0) return [];

  const cities = new Set(submissions.map((submission) => submission.city));
  const ownerAgentIds = new Set(submissions.map((submission) => submission.agentId));
  const tripDateRanges = new Set(submissions.map(tripDateRangeKey));
  const warnings: ExportBlocker[] = [];

  if (cities.size === 1 && tripDateRanges.size > 1) {
    warnings.push({
      reason:
        "В одном городе разные даты поездки. Excel и ZIP доступны, проверьте слот/дату перед BLS выгрузкой.",
    });
  }

  if (cities.size === 1 && ownerAgentIds.size > 1) {
    warnings.push({
      reason:
        "В пакете подачи разных агентов. Excel доступен, PDF останется у своих агентов.",
    });
  }

  return warnings;
}

export function canGenerateExport(submissions: Submission[]) {
  return getExportBlockers(submissions).length === 0;
}

export function isSubmissionSelectableForExport(submission: Submission): boolean {
  return getExportBlockers([submission]).length === 0;
}

export function buildExportMappingAudit(
  preview: ExportContractPreview,
): ExportMappingAudit {
  const previewHeaders = new Set(preview.headers);
  const rows = exportContractColumns.map((column, index) => {
    const state: ExportMappingState = !previewHeaders.has(column.header)
      ? "unresolved"
      : derivedExportColumnKeys.has(column.key)
        ? "derived"
        : "mapped";

    return {
      header: column.header,
      index: index + 1,
      key: column.key,
      state,
    };
  });

  return {
    derivedCount: rows.filter((row) => row.state === "derived").length,
    mappedCount: rows.filter((row) => row.state === "mapped").length,
    rows,
    unresolvedCount: rows.filter((row) => row.state === "unresolved").length,
  };
}

export function buildExportRows(submissions: Submission[]): ExportContractRow[] {
  return buildExportContractRows(orderSubmissionsForExportPackage(submissions));
}

export function buildExportInternalMappings(
  submissions: Submission[],
  exportPackageId?: string,
): ExportInternalMapping[] {
  const rows = buildExportRows(submissions);
  const packageId =
    exportPackageId ?? buildExportPackageIdentity(submissions)?.idempotencyKey ?? "";

  return rows.map((row, index) => ({
    applicantFullName: row.applicantName,
    applicantId: row.applicantId,
    city: row.city as City,
    excelRowNumber: row.excelRowNumber ?? index + 2,
    exportPackageId: packageId,
    familyGroupId: row.familyGroupId,
    familySubmissionId: row.familySubmissionId,
    ownerAgentId: row.ownerAgentId,
    ownerAgentName: row.ownerAgentName ?? agentOwnerDisplayName(row.ownerAgentId),
    passportLast3: row.passportLast3,
    passportNumber: row.passportNumber,
    submissionId: row.submissionId,
  }));
}

export function orderSubmissionsForExportPackage(submissions: Submission[]): Submission[] {
  return submissions
    .map((submission, index) => ({ index, submission }))
    .sort((left, right) => {
      const leftFamilyOrder = left.submission.type === "family" ? 0 : 1;
      const rightFamilyOrder = right.submission.type === "family" ? 0 : 1;

      if (leftFamilyOrder !== rightFamilyOrder) {
        return leftFamilyOrder - rightFamilyOrder;
      }

      const cityOrder = compareExportText(left.submission.city, right.submission.city);
      if (cityOrder !== 0) return cityOrder;

      return (
        compareExportText(left.submission.tripDateFrom, right.submission.tripDateFrom) ||
        compareExportText(left.submission.tripDateTo, right.submission.tripDateTo) ||
        compareExportText(
          left.submission.listTitle ?? left.submission.title,
          right.submission.listTitle ?? right.submission.title,
        ) ||
        compareExportText(left.submission.id, right.submission.id) ||
        left.index - right.index
      );
    })
    .map((item) => item.submission);
}

function compareExportText(left: string, right: string): number {
  return left.localeCompare(right, "ru", { numeric: true, sensitivity: "base" });
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
  const hasRecordedPackage = submissions.some((submission) => submission.exportPackage);
  const packageStale =
    Boolean(packageIdentity) &&
    (hasRecordedPackage ||
      exportState === "file_generated" ||
      exportState === "file_downloaded") &&
    !submissions.every(
      (submission) =>
        submission.exportPackage &&
        exportPackageIdentityMatches(submission.exportPackage, packageIdentity),
    );
  const effectiveBlockers = packageStale
    ? [{ reason: "Выбор изменился. Сформируйте Excel заново" }, ...blockers]
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

export function buildExportArchiveInputSignature(
  submissions: Submission[],
  format: ExportPackageFormat = "xlsx",
): string | null {
  const packageIdentity = buildExportPackageIdentity(submissions, format);
  if (!packageIdentity) return null;

  const questionnaireFields = submissions
    .flatMap((submission) =>
      submission.applicants.flatMap((applicant) =>
        applicant.sections.flatMap((section) =>
          section.fields.map(
            (field) =>
              [
                submission.id,
                applicant.id,
                section.id,
                field.id,
                field.value,
              ] as const,
          ),
        ),
      ),
    )
    .sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
    );
  const mediaFiles = submissions
    .flatMap((submission) =>
      submission.files
        .filter((file) => isCanonicalFrontendMediaType(file.type))
        .map(
          (file) =>
            [
              submission.id,
              file.id,
              file.applicantId,
              file.type,
              file.status,
              file.uploadStatus ?? null,
              file.storageAdapter ?? null,
              file.storageBucket ?? null,
              file.storagePath ?? null,
              file.generatedFileName ?? null,
              file.mimeType ?? null,
              file.sizeBytes ?? null,
            ] as const,
        ),
    )
    .sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
    );

  return JSON.stringify({
    mediaFiles,
    packageIdentity: {
      contentFingerprint: packageIdentity.contentFingerprint,
      format: packageIdentity.format,
      rowCount: packageIdentity.rowCount,
      submissionIds: packageIdentity.submissionIds,
    },
    questionnaireFields,
  });
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

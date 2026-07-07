import type { Applicant, ExportBatch, Submission } from "../types/domain";
import JSZip from "jszip";
import {
  digitsOnly,
  exportDurationDays,
  exportContractHeaders,
  exportContractRecordFromRow,
  normalizeExportContractDate,
  safeSpreadsheetValue,
  type ExportContractRow,
} from "../lib/export/exportContractCore";
import {
  createExportWorkbookBlob,
  EXPORT_WORKBOOK_CONTENT_TYPE,
} from "../lib/export/exportWorkbookCore";
import {
  appendExportBatch,
  blockers,
  ensureMediaSlots,
  normalizeSubmission,
  statusMeta,
} from "../lib/workflow";

export const exportColumns = exportContractHeaders();

export type ExportColumn = string;
export type ExportRow = Record<ExportColumn, string>;

export interface ExportBlocker {
  submissionId: string;
  title: string;
  reason: string;
}

export interface ExportPlan {
  rows: ExportRow[];
  readySubmissions: Submission[];
  blocked: ExportBlocker[];
  applicantRowCount: number;
  familySubmissionCount: number;
}

export type ExportPackageFormat = ExportBatch["format"];

export interface ExportPackageOptions {
  batchId?: string;
  city?: string;
  createdAt: string;
  createdBy: string;
  format: ExportPackageFormat;
}

export interface ExportPackageArtifact {
  blob: Blob;
  contentType: string;
  fileName: string;
}

export interface ExportPackageArchiveArtifact {
  blob: Blob;
  contentType: "application/zip";
  fileName: string;
}

export interface ExportPackageBlocked {
  status: "blocked";
  blockers: ExportBlocker[];
  idempotencyKey: string;
  plan: ExportPlan;
}

export interface ExportPackageDuplicate {
  status: "duplicate";
  artifact: ExportPackageArtifact;
  batch: ExportBatch;
  idempotencyKey: string;
  plan: ExportPlan;
  rows: ExportRow[];
}

export interface ExportPackageReady {
  status: "ready";
  artifact: ExportPackageArtifact;
  batch: ExportBatch;
  idempotencyKey: string;
  plan: ExportPlan;
  rows: ExportRow[];
}

export type ExportPackageDraft =
  | ExportPackageBlocked
  | ExportPackageDuplicate
  | ExportPackageReady;

export interface ExportCityPackageDraft {
  city: string;
  draft: ExportPackageDraft;
  submissions: Submission[];
}

const exportableStatuses = new Set(["accepted"]);

export function buildExportPlan(submissions: Submission[]): ExportPlan {
  const normalized = submissions.map(normalizeSubmission);
  const readySubmissions: Submission[] = [];
  const blocked: ExportBlocker[] = [];

  for (const submission of normalized) {
    const reasons = exportBlockers(submission);
    if (reasons.length) {
      blocked.push(
        ...reasons.map((reason) => ({
          submissionId: submission.id,
          title: submission.title,
          reason,
        })),
      );
      continue;
    }

    readySubmissions.push(submission);
  }

  const orderedReadySubmissions = sortSubmissionsForExport(readySubmissions);
  const rows = orderedReadySubmissions.flatMap((submission) =>
    submission.applicants.map((applicant, index) =>
      buildExportRow(submission, applicant, index),
    ),
  );

  return {
    rows,
    readySubmissions: orderedReadySubmissions,
    blocked,
    applicantRowCount: rows.length,
    familySubmissionCount: orderedReadySubmissions.filter(
      (submission) => submission.type === "family",
    ).length,
  };
}

export function buildExportPackageDraft(
  submissions: Submission[],
  options: ExportPackageOptions,
): ExportPackageDraft {
  const plan = buildExportPlan(submissions);
  const contentFingerprint = exportPackageContentFingerprint(plan, options.format);
  const idempotencyKey = stableKey(contentFingerprint);

  if (plan.blocked.length > 0 || plan.readySubmissions.length === 0) {
    return {
      status: "blocked",
      blockers:
        plan.blocked.length > 0
          ? plan.blocked
          : [{ submissionId: "", title: "", reason: "нет заявок для выгрузки" }],
      idempotencyKey,
      plan,
    };
  }

  const artifact = buildExportPackageArtifact(
    plan.rows,
    options.format,
    idempotencyKey,
  );
  const duplicate = findExistingExportBatch(
    plan.readySubmissions,
    options.format,
    plan.rows.length,
    contentFingerprint,
    idempotencyKey,
  );

  if (duplicate) {
    return {
      status: "duplicate",
      artifact,
      batch: duplicate,
      idempotencyKey,
      plan,
      rows: plan.rows,
    };
  }

  return {
    status: "ready",
    artifact,
    batch: {
      id: options.batchId ?? crypto.randomUUID(),
      createdBy: options.createdBy,
      createdAt: options.createdAt,
      format: options.format,
      contentFingerprint,
      idempotencyKey,
      fileName: artifact.fileName,
      rowCount: plan.rows.length,
      submissionIds: sortedSubmissionIds(plan.readySubmissions),
    },
    idempotencyKey,
    plan,
    rows: plan.rows,
  };
}

export function buildExportPackageDraftsByCity(
  submissions: Submission[],
  options: ExportPackageOptions,
): ExportCityPackageDraft[] {
  const grouped = groupSubmissionsByExportCity(submissions.map(normalizeSubmission));

  return grouped.map(([city, citySubmissions]) => ({
    city,
    draft: buildExportPackageDraft(citySubmissions, { ...options, city }),
    submissions: citySubmissions,
  }));
}

export function applyExportPackageDraft(
  submissions: Submission[],
  draft: ExportPackageDraft,
): Submission[] {
  if (draft.status !== "ready") return submissions;

  const ids = new Set(draft.batch.submissionIds);
  const selected = submissions.filter((submission) => ids.has(submission.id));
  const currentPlan = buildExportPlan(selected);

  if (!exportPlanMatchesDraft(currentPlan, draft)) return submissions;

  return submissions.map((submission) =>
    ids.has(submission.id)
      ? appendExportBatchOnce(
          submission,
          draft.batch,
          draft.batch.createdBy,
          draft.batch.createdAt,
        )
      : submission,
  );
}

export async function buildExportPackageArchiveArtifact(
  draft: ExportPackageReady | ExportPackageDuplicate,
): Promise<ExportPackageArchiveArtifact> {
  const zip = new JSZip();
  zip.file(draft.artifact.fileName, await draft.artifact.blob.arrayBuffer());
  zip.file(
    "manifest.json",
    JSON.stringify(
      {
        batchId: draft.batch.id,
        excelFileName: draft.artifact.fileName,
        idempotencyKey: draft.idempotencyKey,
        rowCount: draft.batch.rowCount,
        submissionIds: draft.batch.submissionIds,
      },
      null,
      2,
    ),
  );

  return {
    blob: await zip.generateAsync({ type: "blob" }),
    contentType: "application/zip",
    fileName: `visaflow-export-${draft.idempotencyKey}_documents.zip`,
  };
}

export function exportBlockers(submission: Submission): string[] {
  const reasons: string[] = [];

  if (!exportableStatuses.has(submission.status)) {
    reasons.push(`статус ${statusMeta[submission.status].label}`);
    return reasons;
  }

  const deterministicBlockers = blockers(submission);
  if (deterministicBlockers.length) {
    reasons.push(...deterministicBlockers.slice(0, 2));
  }

  if (
    submission.type === "family" &&
    submission.applicants.length > 1 &&
    submission.familyIntelligence?.status !== "confirmed"
  ) {
    reasons.push("семейная группа не подтверждена агентом");
  }

  for (const applicant of submission.applicants) {
    const passport = cleanPassport(applicant.passport);
    if (!passport) {
      reasons.push(`${applicant.name}: нет номера паспорта для строки экспорта`);
    }

    const mediaSlots = ensureMediaSlots(applicant);
    const unaccepted = mediaSlots.filter((slot) => slot.state !== "accepted");
    if (unaccepted.length) {
      reasons.push(`${applicant.name}: медиа не принято оператором`);
    }
  }

  return Array.from(new Set(reasons));
}

function buildExportPackageArtifact(
  rows: ExportRow[],
  format: ExportPackageFormat,
  idempotencyKey: string,
): ExportPackageArtifact {
  const contentType =
    format === "csv"
      ? "text/csv;charset=utf-8"
      : EXPORT_WORKBOOK_CONTENT_TYPE;

  return {
    blob: format === "csv" ? createCsvBlob(rows) : createXlsxBlob(rows),
    contentType,
    fileName: `visaflow-export-${idempotencyKey}.${format}`,
  };
}

function appendExportBatchOnce(
  submission: Submission,
  batch: ExportBatch,
  changedBy: string,
  changedAt: string,
): Submission {
  const normalized = normalizeSubmission(submission);
  const existingBatch = normalized.exportHistory?.find((existing) =>
    exportBatchMatches(existing, batch),
  );

  if (existingBatch && normalized.status === "exported") {
    return normalized;
  }

  if (!existingBatch) {
    return appendExportBatch(normalized, batch, changedBy, changedAt);
  }

  return appendExportBatch(
    {
      ...normalized,
      exportHistory: normalized.exportHistory?.filter(
        (existing) => !exportBatchMatches(existing, batch),
      ),
    },
    existingBatch,
    changedBy,
    changedAt,
  );
}

function findExistingExportBatch(
  submissions: Submission[],
  format: ExportPackageFormat,
  rowCount: number,
  contentFingerprint: string,
  idempotencyKey: string,
): ExportBatch | undefined {
  const ids = sortedSubmissionIds(submissions);
  const [first] = submissions;

  return first?.exportHistory?.find(
    (batch) =>
      batch.format === format &&
      batch.rowCount === rowCount &&
      batch.contentFingerprint === contentFingerprint &&
      batch.idempotencyKey === idempotencyKey &&
      sameStringSet(batch.submissionIds, ids) &&
      submissions.every((submission) =>
        submission.exportHistory?.some((existing) =>
          exportBatchMatches(existing, batch),
        ),
      ),
  );
}

function exportBatchMatches(left: ExportBatch, right: ExportBatch): boolean {
  if (left.contentFingerprint || right.contentFingerprint) {
    return (
      left.contentFingerprint === right.contentFingerprint &&
      left.idempotencyKey === right.idempotencyKey &&
      left.format === right.format &&
      left.rowCount === right.rowCount &&
      sameStringSet(left.submissionIds, right.submissionIds)
    );
  }

  if (left.idempotencyKey && right.idempotencyKey) {
    return left.idempotencyKey === right.idempotencyKey;
  }

  return (
    left.id === right.id &&
    left.format === right.format &&
    left.rowCount === right.rowCount &&
    sameStringSet(left.submissionIds, right.submissionIds)
  );
}

function exportPlanMatchesDraft(plan: ExportPlan, draft: ExportPackageReady): boolean {
  if (plan.blocked.length > 0) return false;
  if (plan.rows.length !== draft.batch.rowCount) return false;
  if (!draft.batch.contentFingerprint) return false;
  if (
    !sameStringSet(
      sortedSubmissionIds(plan.readySubmissions),
      draft.batch.submissionIds,
    )
  ) {
    return false;
  }

  const contentFingerprint = exportPackageContentFingerprint(plan, draft.batch.format);
  return (
    contentFingerprint === draft.batch.contentFingerprint &&
    stableKey(contentFingerprint) === draft.idempotencyKey
  );
}

function exportPackageContentFingerprint(
  plan: ExportPlan,
  format: ExportPackageFormat,
): string {
  const identities = plan.readySubmissions
    .map((submission) =>
      [submission.id, submission.title, submission.type].join("\u001f"),
    )
    .join("|");
  const source = plan.rows
    .map((row) => exportColumns.map((column) => row[column]).join("\u001f"))
    .join("|");

  return [format, plan.rows.length, identities, source].join("|");
}

function sortedSubmissionIds(submissions: Submission[]): string[] {
  return submissions.map((submission) => submission.id).sort();
}

function groupSubmissionsByExportCity(submissions: Submission[]): Array<[string, Submission[]]> {
  const groups = new Map<string, Submission[]>();

  for (const submission of submissions) {
    const city = submission.city?.trim() || "Без города";
    groups.set(city, [...(groups.get(city) ?? []), submission]);
  }

  return Array.from(groups.entries()).sort(([left], [right]) => left.localeCompare(right, "ru"));
}

function sortSubmissionsForExport(submissions: Submission[]): Submission[] {
  return [...submissions]
    .map((submission, index) => ({ index, submission }))
    .sort((left, right) => {
      const leftRank = left.submission.type === "family" ? 0 : 1;
      const rightRank = right.submission.type === "family" ? 0 : 1;

      return (
        leftRank - rightRank ||
        left.submission.id.localeCompare(right.submission.id) ||
        left.index - right.index
      );
    })
    .map((item) => item.submission);
}

function sameStringSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const normalizedLeft = [...left].sort();
  const normalizedRight = [...right].sort();
  return normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

function stableKey(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }

  return (hash >>> 0).toString(36).padStart(7, "0");
}

export function createCsvBlob(rows: ExportRow[]): Blob {
  const csvRows = [
    exportColumns.join(","),
    ...rows.map((row) =>
      exportColumns.map((column) => escapeCsv(row[column])).join(","),
    ),
  ];

  return new Blob([`\uFEFF${csvRows.join("\r\n")}`], {
    type: "text/csv;charset=utf-8",
  });
}

export function createXlsxBlob(rows: ExportRow[]): Blob {
  const matrix = [
    exportColumns,
    ...rows.map((row) => exportColumns.map((column) => row[column])),
  ];
  return createExportWorkbookBlob(matrix);
}

function buildExportRow(
  submission: Submission,
  applicant: Applicant,
  index: number,
): ExportRow {
  return exportContractRecordFromRow(
    buildServiceExportContractRow(submission, applicant, index),
  );
}

function buildServiceExportContractRow(
  submission: Submission,
  applicant: Applicant,
  index: number,
): ExportContractRow {
  const nameParts = applicantNameParts(applicant.name);
  const trip = exportTripDates(applicant.tripDates ?? submission.travelDate);
  const hotelName = applicant.hotelName ?? "";
  const hotelAddress = applicant.hotelAddress ?? "";
  const groupLabel = submission.type === "family" ? "Семья" : "Один заявитель";
  const contactNumber = cleanPassport(applicant.phone ?? "");
  const passportNumber = cleanPassport(applicant.passport);
  const familyGroupId =
    submission.type === "family" ? (submission.familyGroupId ?? submission.id) : undefined;

  return {
    addressCity: applicant.city ?? submission.city,
    addressContactNo: contactNumber,
    addressCountry: applicant.country ?? submission.country,
    addressLine1: applicant.address ?? "",
    addressPostalCode: "",
    applicantCount: submission.applicants.length,
    applicantEmail: applicant.email ?? "",
    applicantId: applicant.id ?? `${submission.id}-${index + 1}`,
    applicantIndex: index + 1,
    applicantMobile: contactNumber,
    applicantName: applicant.name,
    appointmentCategory: "Normal",
    appointmentType: submission.type === "family" ? "Family" : "Individual",
    city: applicant.city ?? submission.city,
    contactPersonAddress: hotelAddress,
    contactPersonCity: applicant.city ?? submission.city,
    contactPersonCountry: "Spain",
    contactPersonEmail: "",
    contactPersonFirstName: hotelName,
    contactPersonLastName: "Reception",
    contactPersonMobile: "",
    contactPersonZipCode: "",
    costCoveredBy: "Applicant",
    countryOfBirth: applicant.citizenship ?? "Russian Federation",
    currentNationality: applicant.citizenship ?? "Russian Federation",
    dateOfBirth: applicant.birthDate ?? "",
    employerAddress: "",
    employerContactNo: "",
    employerName: applicant.employment ?? "",
    employerOccupation: applicant.employment ?? "",
    entriesRequested: "Multiple Entry",
    firstName: nameParts.first,
    familyGroupId,
    familySubmissionId: familyGroupId,
    gender: "",
    groupKey: submission.id,
    groupLabel,
    intendedDateOfArrival: trip.arrivalDate,
    intendedDateOfDeparture: trip.departureDate,
    invitingCompanyAddress: hotelAddress,
    invitingCompanyCity: applicant.city ?? submission.city,
    invitingCompanyContactNo: "",
    invitingCompanyCountry: "Spain",
    invitingCompanyEmail: "",
    invitingCompanyName: hotelName,
    invitingCompanyZipCode: "",
    lastName: nameParts.surname,
    location: applicant.city ?? submission.city,
    maritalStatus: "",
    meansOfSupport: "Cash",
    nationalityAtBirth: applicant.citizenship ?? "Russian Federation",
    ownerAgentId: submission.agentId,
    ownerAgentName: submission.agentName,
    passportLast3: passportNumber.slice(-3),
    passportNumber,
    passportExpiryDate: applicant.passportExpiresAt ?? "",
    passportIssueCountry: applicant.country ?? submission.country,
    passportIssueDate: applicant.passportIssuedAt ?? "",
    passportIssuePlace: "",
    passportNo: passportNumber,
    passportType: "Ordinary Passport",
    placeOfBirth: "",
    purposeOfJourney: applicant.tripPurpose ?? "TOURISM",
    stayDurationInDays: numericDuration(applicant.tripDuration) || trip.durationDays,
    submissionCode:
      submission.type === "family" ? `${submission.id}-${index + 1}` : submission.id,
    submissionId: submission.id,
    submissionTitle: submission.title,
    surnameAtBirth: nameParts.surname,
    surnameFamilyName: nameParts.surname,
    travelDate: trip.travelDate,
    tripDates:
      trip.arrivalDate && trip.departureDate
        ? `${trip.arrivalDate}-${trip.departureDate}`
        : trip.travelDate,
    type: groupLabel,
    visaSubType: applicant.tripPurpose ?? "Tourism",
    visaType: "Schengen",
  };
}

function applicantNameParts(fullName: string) {
  const [first = "", ...rest] = fullName.trim().split(/\s+/);
  return {
    first: first || fullName,
    surname: rest.join(" ") || first || fullName,
  };
}

function cleanPassport(value: string): string {
  return digitsOnly(value);
}

function escapeCsv(value: string): string {
  const safe = safeSpreadsheetValue(value);
  if (/[",\r\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }

  return safe;
}

function exportTripDates(value: string) {
  const dates = extractExportDates(value);
  const arrivalDate = dates[0] ?? normalizeExportDate(value);
  const departureDate = dates[1] ?? arrivalDate;

  return {
    arrivalDate,
    departureDate,
    durationDays: exportDurationDays(arrivalDate, departureDate),
    travelDate: arrivalDate,
  };
}

function extractExportDates(value: string): string[] {
  const isoDates = [...value.matchAll(/\d{4}-\d{2}-\d{2}/g)].map(
    (match) => match[0],
  );
  if (isoDates.length > 0) return isoDates;

  return [...value.matchAll(/\d{2}\.\d{2}\.\d{4}/g)].map((match) =>
    normalizeExportContractDate(match[0]),
  );
}

function normalizeExportDate(value: string): string {
  return normalizeExportContractDate(value);
}

function numericDuration(value: string | undefined): string {
  return value?.match(/\d+/)?.[0] ?? "";
}

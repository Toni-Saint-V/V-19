import { getSupabaseClient } from "../../lib/supabase/client";
import type {
  ApplicantInsert,
  ApplicantRow,
  CorrectionInsert,
  CorrectionRow,
  ExportBatchRow,
  Json,
  MediaAssetInsert,
  MediaAssetRow,
  QuestionnaireAnswerRow,
  QuestionnaireAnswerInsert,
  StatusHistoryInsert,
  StatusHistoryRow,
  SubmissionDraftPersistencePayload,
  SubmissionRow,
} from "../../lib/supabase/database.types";
import type {
  AppointmentStatus,
  SubmissionStatus as SupabaseSubmissionStatus,
} from "../../types/domain";
import {
  mapSupabasePersistenceError,
  PersistenceObservableError,
} from "../../services/persistenceObservability";
import type { AppProfile } from "../../types/session";
import { familyListTitleFromMainApplicantName } from "./listFormatters";
import {
  submissionPublicNumberMax,
  submissionPublicNumberMin,
} from "./submissionIdentity";
import { assignSubmissionOwner, ensureSubmissionOwner } from "./ownership";
import {
  normalizeSubmissionQuestionnaire,
  questionnaireFieldMatchesTarget,
} from "./questionnaire";
import {
  isCity,
  isQuestionnaireReviewSource,
  isQuestionnaireReviewState,
} from "./types";
import {
  canonicalRequiredMediaReadiness,
  isCanonicalFrontendMediaType,
  normalizeLegacySubmissionStatus,
  toCanonicalStorageMediaType,
} from "./domainContract";
import {
  isPersistablePrivateFileAsset,
  withRecomputedFileCompletion,
} from "./fileAsset";
import {
  isAgentIssueCorrectionConfirmed,
  isSubmissionIssueResolved,
  transitionMatrix,
} from "./status";
import { currentIssueTargetRevision } from "./correctionRevision";
import { blsQuestionnaireReadiness } from "./questionnaireBlsRules";
import { normalizeSubmissionForCanonicalRuntime } from "./submissionActions";
import type {
  Applicant,
  Issue,
  QuestionnaireField,
  QuestionnaireReviewSource,
  QuestionnaireReviewState,
  IssueStatus,
  Role,
  Submission,
  ExportPackageIdentity,
  SubmissionFile,
  SubmissionFileType,
  SubmissionHistorySource,
  SubmissionStatus,
} from "./types";

export const cockpitSnapshotVersion = 1;
export const cockpitSnapshotKey = "v19CockpitSnapshot";
export const cockpitSnapshotStorageField =
  "submissions.family_intelligence.v19CockpitSnapshot";
export const cockpitSnapshotStatus = "unreviewed";
const submissionPageSize = 100;
const relatedRowPageSize = 1000;
const relatedSubmissionIdChunkSize = 50;
const submissionSelect =
  "id,public_number,case_revision,agent_id,type,title,country,city,travel_date,trip_date_from,trip_date_to,status,priority,readiness_percent,family_intelligence,appointment_status,created_at,submitted_at,review_started_at,accepted_at,exported_at,updated_at" as const;
const preConcurrencySubmissionSelect =
  "id,public_number,agent_id,type,title,country,city,travel_date,trip_date_from,trip_date_to,status,priority,readiness_percent,family_intelligence,appointment_status,created_at,submitted_at,review_started_at,accepted_at,exported_at,updated_at" as const;
const legacySubmissionSelect =
  "id,agent_id,type,title,country,city,travel_date,trip_date_from,trip_date_to,status,priority,readiness_percent,family_intelligence,appointment_status,created_at,submitted_at,review_started_at,accepted_at,exported_at,updated_at" as const;
const applicantSelect =
  "id,submission_id,full_name,role,questionnaire_percent,media_percent,created_at,updated_at" as const;
const questionnaireAnswerSelect =
  "id,submission_id,applicant_id,section_id,field_id,label,value,updated_by,created_at,updated_at" as const;
const mediaAssetSelect =
  "id,applicant_id,submission_id,type,original_file_name,generated_file_name,storage_bucket,storage_path,mime_type,size_bytes,upload_status,review_status,uploaded_at,reviewed_at,reviewed_by" as const;
const exportBatchSelect =
  "id,created_at,file_name,format,content_fingerprint,idempotency_key,row_count,submission_ids" as const;
const statusHistorySelect =
  "id,entity_type,entity_id,from_status,to_status,comment,source,note,changed_by,changed_at" as const;
const correctionSelect =
  "id,submission_id,applicant_id,scope,field_key,media_type,reason,severity,status,created_by,created_at,fixed_at,target_revision,agent_confirmed_at,agent_confirmed_revision,target_section_id,target_field_id,target_baseline,target_projection" as const;
const agentProfileSelect = "id,display_name" as const;

export interface CockpitLoadResult {
  caseRevisionsBySubmissionId: Map<string, number>;
  ownerIdsBySubmissionId: Map<string, string>;
  quarantinedSubmissionIds: Set<string>;
  submissions: Submission[];
}

export interface AdminCockpitSaveResult {
  caseRevisionsBySubmissionId: Map<string, number>;
  operationId: string;
  ownerIdsBySubmissionId: Map<string, string>;
}

export interface AgentCockpitSaveResult {
  caseRevisionsBySubmissionId: Map<string, number>;
  ownerIdsBySubmissionId: Map<string, string>;
}

type CockpitCanonicalLoader = (
  profile: AppProfile,
) => Promise<CockpitLoadResult>;

function canonicalTargetJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalTargetJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalTargetJson(nested)]),
  );
}

function correctionTargetProjection(submission: Submission, issue: Issue) {
  const applicant = submission.applicants.find(
    (candidate) => candidate.id === issue.target.applicantId,
  );
  if (issue.target.fileType) {
    const file = submission.files.find(
      (candidate) =>
        candidate.applicantId === issue.target.applicantId &&
        candidate.type === issue.target.fileType,
    );
    return JSON.stringify(
      canonicalTargetJson({
        generatedFileName: file?.generatedFileName,
        id: file?.id,
        mimeType: file?.mimeType,
        originalFileName: file?.originalFileName,
        reviewStatus: file?.reviewStatus,
        sizeBytes: file?.sizeBytes,
        status: file?.status,
        storageBucket: file?.storageBucket,
        storagePath: file?.storagePath,
        uploadStatus: file?.uploadStatus,
      }),
    );
  }
  if (
    issue.target.section === "Паспорт" &&
    issue.target.field === "Распознанные данные паспорта"
  ) {
    return JSON.stringify(canonicalTargetJson(applicant?.passportExtraction));
  }
  if (issue.type === "section") {
    const targetSections =
      applicant?.sections
        .filter(
          (section) =>
            section.title === issue.target.section ||
            section.title === issue.target.field,
        )
        .map((section) => ({
          ...section,
          fields: [...section.fields].sort((left, right) =>
            left.id.localeCompare(right.id),
          ),
        }))
        .sort((left, right) => left.id.localeCompare(right.id)) ?? [];
    return JSON.stringify(canonicalTargetJson(targetSections));
  }
  const targetFields =
    applicant?.sections
      .flatMap((section) => section.fields)
      .filter((field) =>
        questionnaireFieldMatchesTarget(field, issue.target.field),
      )
      .sort((left, right) => left.id.localeCompare(right.id)) ?? [];
  return JSON.stringify(canonicalTargetJson(targetFields));
}

export type PublicNumberAssignment = {
  assignedNow: boolean;
  publicNumber: number;
};

function publicNumberAssignmentFromRpc(value: unknown): PublicNumberAssignment {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Supabase вернул некорректный результат выдачи номера.");
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.assignedNow !== "boolean" ||
    typeof record.publicNumber !== "number" ||
    !Number.isSafeInteger(record.publicNumber) ||
    record.publicNumber < submissionPublicNumberMin ||
    record.publicNumber > submissionPublicNumberMax
  ) {
    throw new Error("Supabase вернул некорректный номер подачи.");
  }
  return {
    assignedNow: record.assignedNow,
    publicNumber: record.publicNumber,
  };
}

export async function ensureSubmissionPublicNumber(
  submissionId: string,
): Promise<PublicNumberAssignment> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Supabase недоступен для выдачи номера подачи.");
  }
  const { data, error } = await client.rpc("ensure_submission_public_number", {
    submission_id: submissionId,
  });
  if (error) {
    throw mapSupabasePersistenceError(error, {
      operation: "rpc.ensure_submission_public_number",
      fallbackKind: "rpc",
    });
  }
  return publicNumberAssignmentFromRpc(data);
}

type SnapshotEnvelope = {
  submission?: unknown;
  version?: unknown;
};
type CockpitApplicantRow = Pick<
  ApplicantRow,
  | "full_name"
  | "id"
  | "media_percent"
  | "questionnaire_percent"
  | "role"
  | "submission_id"
>;
type CockpitCorrectionRow = Pick<
  CorrectionRow,
  | "applicant_id"
  | "agent_confirmed_at"
  | "agent_confirmed_revision"
  | "created_at"
  | "created_by"
  | "field_key"
  | "fixed_at"
  | "id"
  | "media_type"
  | "reason"
  | "scope"
  | "severity"
  | "status"
  | "submission_id"
  | "target_baseline"
  | "target_field_id"
  | "target_projection"
  | "target_revision"
  | "target_section_id"
>;
type CockpitQuestionnaireAnswerRow = Pick<
  QuestionnaireAnswerRow,
  "applicant_id" | "field_id" | "label" | "section_id" | "submission_id" | "value"
>;
type CockpitExportBatchRow = Pick<
  ExportBatchRow,
  | "content_fingerprint"
  | "created_at"
  | "file_name"
  | "format"
  | "id"
  | "idempotency_key"
  | "row_count"
  | "submission_ids"
>;
type CockpitMediaAssetRow = Pick<
  MediaAssetRow,
  | "applicant_id"
  | "generated_file_name"
  | "id"
  | "mime_type"
  | "original_file_name"
  | "review_status"
  | "reviewed_at"
  | "reviewed_by"
  | "size_bytes"
  | "storage_bucket"
  | "storage_path"
  | "submission_id"
  | "type"
  | "upload_status"
  | "uploaded_at"
>;
type CockpitStatusHistoryRow = Pick<
  StatusHistoryRow,
  | "changed_at"
  | "changed_by"
  | "comment"
  | "entity_id"
  | "entity_type"
  | "from_status"
  | "id"
  | "note"
  | "source"
  | "to_status"
>;
type QuestionnaireAnswerValueEnvelope = {
  adminReviewApprovedAtIso?: string;
  adminReviewApprovedBy?: string;
  kind: typeof questionnaireAnswerEnvelopeKind;
  reviewConfirmedAtIso?: string;
  reviewConfirmedBy?: string;
  reviewOriginSource?: QuestionnaireReviewSource;
  reviewSource?: QuestionnaireReviewSource;
  reviewState?: QuestionnaireReviewState;
  value: string;
  version: typeof questionnaireAnswerEnvelopeVersion;
};
type QuestionnaireAnswerValueResult = {
  adminReviewApprovedAtIso?: string;
  adminReviewApprovedBy?: string;
  reviewConfirmedAtIso?: string;
  reviewConfirmedBy?: string;
  reviewOriginSource?: QuestionnaireReviewSource;
  reviewSource?: QuestionnaireReviewSource;
  reviewState?: QuestionnaireReviewState;
  value: string;
};

type PagedRowsResult<Row> = {
  data: Row[];
  error: unknown | null;
};

async function collectPagedRows<Row>(
  fetchPage: (
    from: number,
    to: number,
  ) => Promise<PagedRowsResult<Row>>,
  pageSize: number,
): Promise<PagedRowsResult<Row>> {
  const data: Row[] = [];
  for (let from = 0; ; from += pageSize) {
    const page = await fetchPage(from, from + pageSize - 1);
    if (page.error) return { data: [], error: page.error };
    data.push(...page.data);
    if (page.data.length < pageSize) return { data, error: null };
  }
}

async function collectIdKeysetPagedRows<Row extends { id: string }>(
  fetchPage: (
    afterId: string | null,
    limit: number,
  ) => Promise<PagedRowsResult<Row>>,
  pageSize: number,
): Promise<PagedRowsResult<Row>> {
  const data: Row[] = [];
  const seenIds = new Set<string>();
  let afterId: string | null = null;

  for (;;) {
    const page = await fetchPage(afterId, pageSize);
    if (page.error) return { data: [], error: page.error };

    for (const row of page.data) {
      if (!row.id || seenIds.has(row.id) || (afterId !== null && row.id <= afterId)) {
        return {
          data: [],
          error: new Error("Supabase submission keyset pagination was not stable."),
        };
      }
      seenIds.add(row.id);
      data.push(row);
    }

    if (page.data.length < pageSize) return { data, error: null };
    afterId = page.data.at(-1)?.id ?? null;
    if (!afterId) {
      return {
        data: [],
        error: new Error("Supabase submission keyset cursor is missing."),
      };
    }
  }
}

function chunkedSubmissionIds(submissionIds: readonly string[]) {
  const chunks: string[][] = [];
  for (
    let index = 0;
    index < submissionIds.length;
    index += relatedSubmissionIdChunkSize
  ) {
    chunks.push(
      submissionIds.slice(index, index + relatedSubmissionIdChunkSize),
    );
  }
  return chunks;
}

async function collectRowsForSubmissionIds<Row>(
  submissionIds: readonly string[],
  fetchPage: (
    submissionIdChunk: string[],
    from: number,
    to: number,
  ) => Promise<PagedRowsResult<Row>>,
): Promise<PagedRowsResult<Row>> {
  const data: Row[] = [];
  for (const submissionIdChunk of chunkedSubmissionIds(submissionIds)) {
    const chunkRows = await collectPagedRows(
      (from, to) => fetchPage(submissionIdChunk, from, to),
      relatedRowPageSize,
    );
    if (chunkRows.error) return { data: [], error: chunkRows.error };
    data.push(...chunkRows.data);
  }
  return { data, error: null };
}

const questionnaireAnswerEnvelopeKind = "v19_questionnaire_field";
const questionnaireAnswerEnvelopeVersion = 1;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function cockpitSubmissionFingerprint(submission: Submission) {
  return JSON.stringify(submission);
}

export function changedCockpitSubmissions(
  submissions: Submission[],
  baselineFingerprints: ReadonlyMap<string, string>,
) {
  return submissions.filter(
    (submission) =>
      baselineFingerprints.get(submission.id) !==
      cockpitSubmissionFingerprint(submission),
  );
}

export function cockpitSubmissionFingerprintMap(submissions: Submission[]) {
  return new Map(
    submissions.map((submission) => [
      submission.id,
      cockpitSubmissionFingerprint(submission),
    ]),
  );
}

function isCockpitSubmission(value: unknown): value is Submission {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    value.country === "Испания" &&
    Array.isArray(value.applicants) &&
    Array.isArray(value.issues) &&
    Array.isArray(value.files) &&
    Array.isArray(value.history) &&
    isRecord(value.completeness)
  );
}

function snapshotEnvelope(value: Json | null): SnapshotEnvelope | null {
  if (!isRecord(value)) return null;
  const envelope = value[cockpitSnapshotKey];
  return isRecord(envelope) ? envelope : null;
}

type CockpitSnapshotReadResult =
  | { kind: "absent" }
  | { kind: "corrupt" }
  | { kind: "valid"; submission: Submission };

function cockpitSnapshotReadResult(value: Json | null): CockpitSnapshotReadResult {
  const envelope = snapshotEnvelope(value);
  if (!envelope) return { kind: "absent" };
  if (
    envelope.version !== cockpitSnapshotVersion ||
    !isCockpitSubmission(envelope.submission)
  ) {
    return { kind: "corrupt" };
  }

  try {
    return {
      kind: "valid",
      submission: normalizeSubmissionForCanonicalRuntime(envelope.submission),
    };
  } catch {
    return { kind: "corrupt" };
  }
}

export function readCockpitSnapshot(value: Json | null): Submission | null {
  const result = cockpitSnapshotReadResult(value);
  return result.kind === "valid" ? result.submission : null;
}

function attachNormalizedApplicantRows(
  submission: Submission,
  applicants: CockpitApplicantRow[],
): Submission {
  if (!applicants.length) return submission;

  const rowsById = new Map(applicants.map((applicant) => [applicant.id, applicant]));

  return {
    ...submission,
    applicants: submission.applicants.map((applicant) => {
      const row = rowsById.get(applicant.id);
      if (!row) return applicant;

      return {
        ...applicant,
        fullName: applicant.fullName || row.full_name,
      };
    }),
  };
}

function attachQuestionnaireAnswerRows(
  submission: Submission,
  answers: CockpitQuestionnaireAnswerRow[],
): Submission {
  if (!answers.length) return submission;

  const answersByApplicantField = new Map(
    answers.map((answer) => [`${answer.applicant_id}:${answer.field_id}`, answer]),
  );

  return normalizeSubmissionQuestionnaire({
    ...submission,
    applicants: submission.applicants.map((applicant) => ({
      ...applicant,
      sections: applicant.sections.map((section) => ({
        ...section,
        fields: section.fields.map((field) => {
          const answer = answersByApplicantField.get(`${applicant.id}:${field.id}`);
          if (!answer) return field;

          const value = questionnaireAnswerFieldValue(answer.value);
          return {
            ...field,
            adminReviewApprovedAtIso: value.adminReviewApprovedAtIso,
            adminReviewApprovedBy: value.adminReviewApprovedBy,
            reviewConfirmedAtIso: value.reviewConfirmedAtIso,
            reviewConfirmedBy: value.reviewConfirmedBy,
            reviewOriginSource: value.reviewOriginSource,
            reviewSource: value.reviewSource,
            reviewState: value.reviewState,
            value: value.value,
          };
        }),
      })),
    })),
  });
}

function fileStatusFromMediaAssetRow(
  row: CockpitMediaAssetRow,
): SubmissionFile["status"] {
  if (row.review_status === "accepted") return "accepted";
  if (
    row.review_status === "replace_required" ||
    row.review_status === "poor_quality"
  ) {
    return "needs_replacement";
  }
  return row.upload_status === "uploaded" ? "uploaded" : "missing";
}

function submissionFileTypeFromMediaAssetRow(
  row: CockpitMediaAssetRow,
): SubmissionFileType | null {
  if (isCanonicalFrontendMediaType(row.type)) {
    return row.type;
  }
  return null;
}

function submissionFileFromMediaAssetRow(
  row: CockpitMediaAssetRow,
): SubmissionFile | null {
  const type = submissionFileTypeFromMediaAssetRow(row);
  if (!type) return null;

  return {
    id: row.id,
    applicantId: row.applicant_id,
    type,
    status: fileStatusFromMediaAssetRow(row),
    generatedFileName: row.generated_file_name ?? undefined,
    mimeType: row.mime_type ?? undefined,
    originalFileName: row.original_file_name ?? undefined,
    reviewedAtIso: row.reviewed_at ?? undefined,
    reviewedBy: row.reviewed_by ?? undefined,
    reviewStatus: row.review_status,
    sizeBytes: row.size_bytes ?? undefined,
    storageAdapter:
      row.upload_status === "uploaded" && row.storage_path
        ? "supabase-private"
        : undefined,
    storageBucket: row.storage_bucket || undefined,
    storagePath: row.storage_path || undefined,
    uploadedAtIso: row.uploaded_at ?? undefined,
    uploadStatus: row.upload_status,
  };
}

export function attachDurableMediaAssetRows(
  submission: Submission,
  mediaRows: CockpitMediaAssetRow[],
): Submission {
  if (!mediaRows.length) return withRecomputedFileCompletion(submission);

  const durableFiles = mediaRows
    .map(submissionFileFromMediaAssetRow)
    .filter((file): file is SubmissionFile => Boolean(file));
  if (!durableFiles.length) return withRecomputedFileCompletion(submission);

  const durableFilesByApplicantType = new Map(
    durableFiles.map((file) => [`${file.applicantId}:${file.type}`, file]),
  );
  const overlayedFiles = submission.files.map((file) => {
    const durableFile = durableFilesByApplicantType.get(
      `${file.applicantId}:${file.type}`,
    );
    return durableFile ? { ...file, ...durableFile, id: file.id } : file;
  });
  const existingKeys = new Set(
    overlayedFiles.map((file) => `${file.applicantId}:${file.type}`),
  );
  const missingDurableFiles = durableFiles.filter(
    (file) => !existingKeys.has(`${file.applicantId}:${file.type}`),
  );

  return withRecomputedFileCompletion({
    ...submission,
    files: [...overlayedFiles, ...missingDurableFiles],
  });
}

function submissionHistorySourceFromRow(value: unknown): SubmissionHistorySource {
  if (value === "agent" || value === "admin" || value === "bb" || value === "system") {
    return value;
  }
  return "system";
}

function submissionStatusFromHistoryValue(value: unknown): SubmissionStatus | null {
  if (typeof value !== "string" || !value) return null;
  const normalized = normalizeLegacySubmissionStatus(value);
  return normalized.ok ? normalized.data : null;
}

function statusHistoryItemFromRow(
  row: CockpitStatusHistoryRow,
): Submission["history"][number] | null {
  const fromStatus = submissionStatusFromHistoryValue(row.from_status);
  const toStatus = submissionStatusFromHistoryValue(row.to_status);
  if (!toStatus) return null;

  return {
    id: row.id,
    actorId: row.changed_by,
    at: row.changed_at,
    createdAt: row.changed_at,
    fromStatus: fromStatus ?? undefined,
    note: row.note?.trim() || undefined,
    source: submissionHistorySourceFromRow(row.source),
    text: row.comment,
    toStatus,
  };
}

function statusHistoryMatchKey(item: Submission["history"][number]) {
  return `${item.fromStatus ?? ""}:${item.toStatus ?? ""}:${item.source ?? ""}:${item.note ?? ""}`;
}

export function attachDurableStatusHistoryRows(
  submission: Submission,
  historyRows: CockpitStatusHistoryRow[],
): Submission {
  const durableHistory = historyRows
    .filter(
      (row) => row.entity_type === "submission" && row.entity_id === submission.id,
    )
    .map(statusHistoryItemFromRow)
    .filter((item): item is Submission["history"][number] => Boolean(item))
    .sort((left, right) => right.at.localeCompare(left.at));

  if (!durableHistory.length) return submission;

  const durableStatusKeys = new Set(durableHistory.map(statusHistoryMatchKey));
  const snapshotHistory = submission.history.filter(
    (item) =>
      !item.fromStatus ||
      !item.toStatus ||
      !durableStatusKeys.has(statusHistoryMatchKey(item)),
  );

  return {
    ...submission,
    history: [...durableHistory, ...snapshotHistory],
  };
}

function latestSubmissionStatusFromHistoryRows(
  historyRows: CockpitStatusHistoryRow[],
): SubmissionStatus | undefined {
  const latest = [...historyRows]
    .filter((row) => row.entity_type === "submission")
    .sort((left, right) => right.changed_at.localeCompare(left.changed_at))
    .find((row) => submissionStatusFromHistoryValue(row.to_status));

  return latest ? (submissionStatusFromHistoryValue(latest.to_status) ?? undefined) : undefined;
}

function exportPackageFromBatchRow(
  row: CockpitExportBatchRow,
): ExportPackageIdentity | undefined {
  if (
    !row.content_fingerprint ||
    !row.file_name ||
    !row.idempotency_key ||
    row.row_count < 1 ||
    row.submission_ids.length < 1
  ) {
    return undefined;
  }

  return {
    contentFingerprint: row.content_fingerprint,
    fileName: row.file_name,
    format: row.format,
    idempotencyKey: row.idempotency_key,
    rowCount: row.row_count,
    submissionIds: [...row.submission_ids].sort(),
  };
}

function latestExportBatchForSubmission(
  submissionId: string,
  rows: CockpitExportBatchRow[],
): CockpitExportBatchRow | undefined {
  return rows
    .filter((row) => row.format === "xlsx" && row.submission_ids.includes(submissionId))
    .sort(
      (left, right) =>
        right.created_at.localeCompare(left.created_at) ||
        right.id.localeCompare(left.id),
    )[0];
}

function exportStateFromDurableRowStatus(
  rowStatus: SubmissionStatus,
): Submission["exportState"] {
  if (rowStatus === "exported") return "marked_exported";
  if (rowStatus === "ready_for_export") return "ready";
  return "not_ready";
}

function clearSnapshotExportPackage(
  submission: Submission,
  rowStatus: SubmissionStatus,
): Submission {
  return {
    ...submission,
    exportPackage: undefined,
    exportState: exportStateFromDurableRowStatus(rowStatus),
  };
}

function attachExportPackageRow(
  submission: Submission,
  rowStatus: SubmissionStatus,
  exportBatches: CockpitExportBatchRow[],
  options: { restoreGeneratedState?: boolean } = {},
): Submission {
  const durableExportState = exportStateFromDurableRowStatus(rowStatus);
  if (durableExportState === "not_ready") {
    return clearSnapshotExportPackage(submission, rowStatus);
  }

  const exportBatch = latestExportBatchForSubmission(submission.id, exportBatches);
  if (!exportBatch) return clearSnapshotExportPackage(submission, rowStatus);

  const exportPackage = exportPackageFromBatchRow(exportBatch);
  if (!exportPackage) return clearSnapshotExportPackage(submission, rowStatus);

  return {
    ...submission,
    exportPackage,
    exportState:
      rowStatus === "exported"
        ? "marked_exported"
        : options.restoreGeneratedState
          ? "file_generated"
          : durableExportState,
  };
}

function reconcileCockpitSnapshotWithSubmissionRow(
  row: Pick<
    SubmissionRow,
    "agent_id" | "created_at" | "exported_at" | "public_number" | "status" | "updated_at"
  >,
  snapshot: Submission,
  applicants: CockpitApplicantRow[],
  questionnaireAnswers: CockpitQuestionnaireAnswerRow[],
  exportBatches: CockpitExportBatchRow[],
): Submission {
  const rowStatus = fromSupabaseSubmissionRowStatus(row);
  const normalizedSnapshot = {
    ...normalizeSubmissionForCanonicalRuntime(
      attachQuestionnaireAnswerRows(
        attachNormalizedApplicantRows(
          ensureSubmissionOwner(snapshot, row.agent_id),
          applicants,
        ),
        questionnaireAnswers,
      ),
      {
        exportedAt: row.exported_at,
        statusFallback: rowStatus,
      },
    ),
    createdAt: row.created_at,
    publicNumber: row.public_number,
  };

  if (rowStatus !== "exported") {
    return attachExportPackageRow(normalizedSnapshot, rowStatus, exportBatches, {
      restoreGeneratedState: true,
    });
  }
  if (
    normalizedSnapshot.status === "exported" &&
    normalizedSnapshot.exportState === "marked_exported"
  ) {
    return attachExportPackageRow(normalizedSnapshot, rowStatus, exportBatches, {
      restoreGeneratedState: true,
    });
  }

  const syncedAt = row.exported_at ?? row.updated_at;
  const historyId = `и-${normalizedSnapshot.id}-sync-exported`;
  const syncedHistory = normalizedSnapshot.history.some((item) => item.id === historyId)
    ? normalizedSnapshot.history
    : [
        {
          id: historyId,
          text: "Подача синхронизирована с завершенной выгрузкой",
          at: syncedAt,
          source: "system" as const,
        },
        ...normalizedSnapshot.history,
      ];

  return attachExportPackageRow(
    {
      ...normalizedSnapshot,
      status: "exported",
      exportState: "marked_exported",
      updatedAt: syncedAt,
      history: syncedHistory,
    },
    rowStatus,
    exportBatches,
    { restoreGeneratedState: true },
  );
}

function cockpitSnapshotFamilyIntelligence(submission: Submission): Json {
  // The normalized tables are a query projection; this snapshot owns the full cockpit UI model.
  const snapshotSubmission = { ...submission };
  delete snapshotSubmission.agentDisplayName;
  return {
    status: cockpitSnapshotStatus,
    [cockpitSnapshotKey]: {
      version: cockpitSnapshotVersion,
      submission: snapshotSubmission as unknown as Json,
    },
  };
}

function stableUuid(seed: string): string {
  let hashA = 0x811c9dc5;
  let hashB = 0x01000193;

  for (const char of seed) {
    const code = char.codePointAt(0) ?? 0;
    hashA ^= code;
    hashA = Math.imul(hashA, 0x01000193);
    hashB ^= code + hashA;
    hashB = Math.imul(hashB, 0x85ebca6b);
  }

  const hex = [hashA, hashB, hashA ^ hashB, hashA + hashB]
    .map((value) => (value >>> 0).toString(16).padStart(8, "0"))
    .join("");

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Status-history rows are rehydrated with their durable database UUID. Keep
 * that identity on a subsequent draft save so the database conflict boundary
 * remains idempotent instead of generating a second audit event.
 */
function isDurableUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function timestampOrNow(value: string | undefined): string {
  if (value && /^\d{4}-\d{2}-\d{2}(T.+)?$/.test(value)) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }

  return new Date().toISOString();
}

function tripDate(submission: Submission): string {
  if (submission.tripDateFrom === submission.tripDateTo) return submission.tripDateFrom;
  return `${submission.tripDateFrom} - ${submission.tripDateTo}`;
}

function splitLegacyTripDateRange(value: string) {
  const normalized = value.trim();
  const rangeMatch = normalized.match(/^(.+?)\s+-\s+(.+)$/);
  if (!rangeMatch) return { from: normalized, to: normalized };

  const from = rangeMatch[1]?.trim() ?? normalized;
  const to = rangeMatch[2]?.trim() ?? normalized;
  return { from: from || normalized, to: to || normalized };
}

function tripDateRangeFromRow(
  row: Pick<SubmissionRow, "travel_date" | "trip_date_from" | "trip_date_to">,
) {
  const legacy = row.travel_date.trim();
  const legacyRange = splitLegacyTripDateRange(legacy);
  return {
    from: row.trip_date_from?.trim() || legacyRange.from,
    to: row.trip_date_to?.trim() || legacyRange.to,
  };
}

function toSupabaseStatus(status: SubmissionStatus): SupabaseSubmissionStatus {
  if (status === "requires_action") {
    throw new Error("Legacy status cannot be written by canonical submissions flow.");
  }

  switch (status) {
    case "draft":
      return "draft";
    case "in_progress":
      return "filling";
    case "submitted_for_review":
      return "waiting_review";
    case "returned":
      return "returned";
    case "corrections_received":
      return "waiting_review";
    case "ready_for_export":
      return "ready_for_excel";
    case "exported":
      return "exported";
  }
}

function fromSupabaseSubmissionRowStatus(
  row: Pick<SubmissionRow, "exported_at" | "status">,
): SubmissionStatus {
  const normalized = normalizeLegacySubmissionStatus(row.status, {
    exportedAt: row.exported_at,
  });
  if (!normalized.ok) throw new Error(normalized.reason);
  return normalized.data;
}

function appointmentStatusForSubmission(submission: Submission): AppointmentStatus {
  return submission.status === "exported" ? "completed" : "not_started";
}

function issueStatusToCorrectionStatus(
  status: IssueStatus,
): CorrectionInsert["status"] {
  if (status === "closed_by_admin") return "closed";
  if (status === "fixed_by_agent") return "fixed";
  return "open";
}

function mediaTypeForIssue(type: SubmissionFileType | undefined) {
  if (!type) return null;
  const mediaType = toCanonicalStorageMediaType(type);
  return mediaType.ok ? mediaType.data : null;
}

function mediaTypeForFile(type: SubmissionFileType): MediaAssetInsert["type"] | null {
  const mediaType = toCanonicalStorageMediaType(type);
  return mediaType.ok ? mediaType.data : null;
}

function applicantRoleLabel(role: Applicant["role"]): string {
  if (role === "main") return "Основной заявитель";
  if (role === "spouse") return "Супруг";
  if (role === "child") return "Ребёнок";
  return "Заявитель";
}

function questionnaireFieldValue(applicant: Applicant, ...fieldIds: string[]) {
  const fieldIdSet = new Set(fieldIds);
  return (
    applicant.sections
      .flatMap((section) => section.fields)
      .find((field) => fieldIdSet.has(field.id))
      ?.value.trim() || null
  );
}

function questionnaireDateValue(value: string | null) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const dotted = /^(\d{2})[.-](\d{2})[.-](\d{4})$/.exec(value);
  return dotted ? `${dotted[3]}-${dotted[2]}-${dotted[1]}` : null;
}

function toApplicantInsert(
  submission: Submission,
  applicant: Applicant,
): ApplicantInsert {
  const birthDate = questionnaireFieldValue(applicant, "birth-date");
  const passportIssuedAt = questionnaireFieldValue(applicant, "passport-issue-date");
  const passportExpiresAt = questionnaireFieldValue(applicant, "passport-expiry-date");

  return {
    id: applicant.id,
    submission_id: submission.id,
    full_name: applicant.fullName,
    role: applicantRoleLabel(applicant.role),
    suggested_role: null,
    role_confirmed: true,
    birth_date: questionnaireDateValue(birthDate),
    patronymic: null,
    citizenship: questionnaireFieldValue(applicant, "nationality"),
    address: questionnaireFieldValue(applicant, "home-address"),
    phone: questionnaireFieldValue(applicant, "contact-number"),
    email: questionnaireFieldValue(applicant, "email"),
    passport_number: questionnaireFieldValue(applicant, "passport-no") ?? "",
    passport_issued_at: questionnaireDateValue(passportIssuedAt),
    passport_expires_at: questionnaireDateValue(passportExpiresAt),
    country: submission.country,
    city: submission.city,
    trip_dates: tripDate(submission),
    hotel_name: questionnaireFieldValue(applicant, "hotel-name"),
    hotel_address: questionnaireFieldValue(applicant, "hotel-address"),
    questionnaire_percent: submission.completeness.questionnaire,
    media_percent: submission.completeness.files,
  };
}

function toCorrectionInsert(
  submission: Submission,
  issue: Issue,
  actorId: string,
): CorrectionInsert {
  return {
    id: stableUuid(`correction:${submission.id}:${issue.id}`),
    submission_id: submission.id,
    applicant_id: issue.target.applicantId,
    scope: issue.type === "file" || issue.type === "media" ? "media" : "field",
    field_key: issue.target.field ?? null,
    target_section_id: issue.target.sectionId ?? null,
    target_field_id: issue.target.fieldId ?? null,
    media_type: mediaTypeForIssue(issue.target.fileType),
    reason: `${issue.reason}${issue.comment ? ` — ${issue.comment}` : ""}`,
    severity: issue.severity === "blocker" ? "blocking" : "note",
    status: issueStatusToCorrectionStatus(issue.status),
    created_by: actorId,
    created_at: timestampOrNow(issue.createdAt),
    fixed_at:
      issue.status === "fixed_by_agent" || issue.status === "closed_by_admin"
        ? issue.fixedAtIso ?? issue.agentConfirmation?.confirmedAtIso ?? null
        : null,
    agent_confirmed_at: issue.agentConfirmation?.confirmedAtIso ?? null,
    agent_confirmed_revision:
      issue.agentConfirmation?.targetRevision ?? null,
    target_revision: currentIssueTargetRevision(issue),
    target_baseline: null,
    target_projection: null,
  };
}

function toStatusHistoryInsert(
  submission: Submission,
  item: PersistableStatusHistoryItem,
  actorId: string,
): StatusHistoryInsert {
  return {
    id: isDurableUuid(item.id)
      ? item.id
      : stableUuid(`history:${submission.id}:${item.id}`),
    entity_type: "submission",
    entity_id: submission.id,
    from_status: item.fromStatus,
    to_status: item.toStatus,
    comment: item.detail ? `${item.text} — ${item.detail}` : item.text,
    changed_by: actorId,
    changed_at: timestampOrNow(item.at),
    note: item.note ?? null,
    source: item.source ?? "system",
  };
}

type PersistableStatusHistoryItem = Submission["history"][number] & {
  fromStatus: SubmissionStatus;
  toStatus: SubmissionStatus;
};

function isPersistableStatusHistoryItem(
  item: Submission["history"][number],
): item is PersistableStatusHistoryItem {
  return Boolean(item.fromStatus && item.toStatus);
}

function reviewStatusForFile(file: SubmissionFile): MediaAssetInsert["review_status"] {
  if (file.status === "accepted") return "accepted";
  if (file.status === "needs_replacement") {
    return file.reviewStatus === "poor_quality" ? "poor_quality" : "replace_required";
  }
  return file.reviewStatus ?? "not_reviewed";
}

function toCockpitMediaAssetInserts(submission: Submission): MediaAssetInsert[] {
  return submission.files.flatMap((file) => {
    if (!isPersistablePrivateFileAsset(file)) return [];

    const mediaType = mediaTypeForFile(file.type);
    if (!mediaType) return [];

    return [
      {
        id: stableUuid(`media:${submission.id}:${file.applicantId}:${file.type}`),
        applicant_id: file.applicantId,
        submission_id: submission.id,
        type: mediaType,
        original_file_name: file.originalFileName ?? null,
        generated_file_name: file.generatedFileName,
        storage_bucket: file.storageBucket,
        storage_path: file.storagePath,
        mime_type: file.mimeType ?? null,
        size_bytes: file.sizeBytes ?? null,
        upload_status: "uploaded",
        review_status: reviewStatusForFile(file),
        uploaded_at: timestampOrNow(file.uploadedAtIso ?? file.uploadedAt),
        reviewed_at: file.reviewedAtIso ? timestampOrNow(file.reviewedAtIso) : null,
        reviewed_by: file.reviewedBy ?? null,
      },
    ];
  });
}

export function toCockpitQuestionnaireAnswerInserts(
  submission: Submission,
  actorId: string,
): QuestionnaireAnswerInsert[] {
  return submission.applicants.flatMap((applicant) =>
    applicant.sections.flatMap((section) =>
      section.fields.map((field) => ({
        submission_id: submission.id,
        applicant_id: applicant.id,
        section_id: section.id,
        field_id: field.id,
        label: field.label,
        value: questionnaireAnswerJsonForField(field),
        updated_by: actorId,
      })),
    ),
  );
}

export function toCockpitDraftPersistencePayload(
  submission: Submission,
  actorId: string,
  ownerId: string,
  actorHistorySource: Extract<SubmissionHistorySource, "agent" | "admin"> =
    actorId === ownerId ? "agent" : "admin",
): SubmissionDraftPersistencePayload {
  const ownedSubmission = assignSubmissionOwner(
    ensureSubmissionOwner(submission, ownerId),
    ownerId,
  );
  const persistenceTimestamp = timestampOrNow(ownedSubmission.updatedAt);

  return {
    submission: {
      id: ownedSubmission.id,
      agent_id: ownerId,
      type: ownedSubmission.type,
      title: ownedSubmission.title,
      country: ownedSubmission.country,
      city: ownedSubmission.city,
      travel_date: tripDate(ownedSubmission),
      trip_date_from: ownedSubmission.tripDateFrom,
      trip_date_to: ownedSubmission.tripDateTo,
      status: toSupabaseStatus(ownedSubmission.status),
      priority:
        ownedSubmission.status === "returned" ||
        ownedSubmission.status === "requires_action"
          ? "Высокий"
          : "Средний",
      readiness_percent: ownedSubmission.completeness.total,
      family_intelligence: cockpitSnapshotFamilyIntelligence(ownedSubmission),
      appointment_status: appointmentStatusForSubmission(ownedSubmission),
      submitted_at:
        ownedSubmission.status === "submitted_for_review"
          ? persistenceTimestamp
          : null,
      review_started_at: null,
      accepted_at:
        ownedSubmission.status === "ready_for_export" ||
        ownedSubmission.status === "exported"
          ? persistenceTimestamp
          : null,
      exported_at:
        ownedSubmission.status === "exported"
          ? persistenceTimestamp
          : null,
      updated_at: persistenceTimestamp,
    },
    applicants: ownedSubmission.applicants.map((applicant) =>
      toApplicantInsert(ownedSubmission, applicant),
    ),
    questionnaire_answers: toCockpitQuestionnaireAnswerInserts(
      ownedSubmission,
      actorId,
    ),
    media_assets: toCockpitMediaAssetInserts(ownedSubmission),
    corrections: ownedSubmission.issues.map((issue) =>
      toCorrectionInsert(ownedSubmission, issue, actorId),
    ),
    status_history: ownedSubmission.history
      .filter(isPersistableStatusHistoryItem)
      .filter((item) => item.source === actorHistorySource)
      .map((item) => toStatusHistoryInsert(ownedSubmission, item, actorId)),
  };
}

function requiresCorrectionHandoff(submission: Submission, role: Role): boolean {
  return (
    role === "agent" &&
    submission.status === "corrections_received" &&
    submission.issues.some((issue) => issue.status === "fixed_by_agent")
  );
}

export function reviewHandoffPersistenceIssues(
  submission: Submission,
  role?: Role,
): string[] {
  const openIssues = submission.issues.filter((issue) => issue.status === "open");
  const fixedIssues = submission.issues.filter(
    (issue) => issue.status === "fixed_by_agent",
  );
  const unresolvedIssues = [...openIssues, ...fixedIssues];
  const issues: string[] = [];

  if (submission.status === "submitted_for_review") {
    if (unresolvedIssues.length > 0) {
      issues.push("submitted_for_review cannot carry unresolved issues");
    }
    const mediaReadiness = canonicalRequiredMediaReadiness(submission, {
      requireStorageIdentity: true,
    });
    if (!mediaReadiness.ok) {
      issues.push(
        `submitted_for_review requires canonical media: ${mediaReadiness.reason}`,
      );
    }
    if (!hasHandoffHistory(submission, "submitted_for_review", "agent", role)) {
      issues.push("submitted_for_review requires matching agent history");
    }
  }

  if (submission.status === "returned") {
    if (openIssues.length === 0) {
      issues.push("returned requires at least one open issue");
    }
    if (!hasHandoffHistory(submission, "returned", "admin", role)) {
      issues.push("returned requires matching admin history");
    }
  }

  if (submission.status === "corrections_received") {
    const unresolvedFixedTargets = fixedIssues.filter(
      (issue) => !isSubmissionIssueResolved(submission, issue),
    );
    const unconfirmedFixedTargets = fixedIssues.filter(
      (issue) => !isAgentIssueCorrectionConfirmed(submission, issue),
    );
    if (openIssues.length > 0) {
      issues.push("corrections_received cannot persist open issues");
    }
    if (fixedIssues.length === 0) {
      issues.push("corrections_received requires fixed_by_agent issues");
    }
    if (unresolvedFixedTargets.length > 0) {
      issues.push("corrections_received fixed issues must resolve their targets");
    }
    if (unconfirmedFixedTargets.length > 0) {
      issues.push(
        "corrections_received requires a current confirmation for every fixed issue",
      );
    }
    if (!blsQuestionnaireReadiness(submission).ready) {
      issues.push("corrections_received requires a complete BLS questionnaire");
    }
    const mediaReadiness = canonicalRequiredMediaReadiness(submission, {
      requireStorageIdentity: true,
    });
    if (!mediaReadiness.ok) {
      issues.push(
        `corrections_received requires canonical media: ${mediaReadiness.reason}`,
      );
    }
    if (!hasHandoffHistory(submission, "corrections_received", "agent", role)) {
      issues.push("corrections_received requires matching agent history");
    }
  }

  if (submission.status === "ready_for_export") {
    if (unresolvedIssues.length > 0) {
      issues.push("ready_for_export cannot persist unresolved issues");
    }
    const mediaReadiness = canonicalRequiredMediaReadiness(submission, {
      requireAccepted: true,
      requireStorageIdentity: true,
    });
    if (!mediaReadiness.ok) {
      issues.push(
        `ready_for_export requires accepted canonical media: ${mediaReadiness.reason}`,
      );
    }
    if (!hasHandoffHistory(submission, "ready_for_export", "admin", role)) {
      issues.push("ready_for_export requires matching admin history");
    }
  }

  return issues;
}

function assertReviewHandoffPersistenceConsistency(
  submission: Submission,
  role: Role,
): void {
  if (!isReviewHandoffCommandWrite(submission, role)) return;

  const issues = reviewHandoffPersistenceIssues(submission, role);
  if (issues.length === 0) return;
  const operation = requiresCorrectionHandoff(submission, role)
    ? "rpc.submit_corrections_handoff"
    : "rpc.save_submission_draft";

  throw new PersistenceObservableError(
    `${operation} failed safely (${operation}:save:HANDOFF_CONSISTENCY).`,
    {
      operation,
      kind: "save",
      safeCode: `${operation}:save:HANDOFF_CONSISTENCY`,
      retryable: false,
    },
    {
      cause: new Error(issues.join("; ")),
    },
  );
}

function hasHandoffHistory(
  submission: Submission,
  toStatus: SubmissionStatus,
  source: NonNullable<Submission["history"][number]["source"]>,
  role?: Role,
): boolean {
  const allowedFromStatuses = handoffAllowedFromStatuses[toStatus] ?? [];
  const hasTypedHistory = submission.history.some(
    (item) => item.fromStatus || item.toStatus,
  );
  const hasExactTypedHistory = submission.history.some(
    (item) =>
      item.toStatus === toStatus &&
      item.source === source &&
      Boolean(item.fromStatus) &&
      allowedFromStatuses.includes(item.fromStatus as SubmissionStatus),
  );
  if (hasExactTypedHistory) return true;
  if (hasTypedHistory || (role && isCurrentLocalHandoffWrite(submission, role))) {
    return false;
  }

  return submission.history.some((item) => {
    if (item.source !== source) return false;

    const text = item.text.toLowerCase();
    if (toStatus === "submitted_for_review") {
      return text.includes("провер");
    }
    if (toStatus === "returned") {
      return text.includes("вернул") || text.includes("возврат");
    }
    if (toStatus === "corrections_received") {
      return text.includes("исправ");
    }
    if (toStatus === "ready_for_export") {
      return text.includes("прин") || text.includes("готов");
    }

    return false;
  });
}

const handoffAllowedFromStatuses: Partial<
  Record<SubmissionStatus, SubmissionStatus[]>
> = {
  submitted_for_review: transitionMatrix.submit_for_review.from,
  returned: [
    ...transitionMatrix.return_with_issues.from,
    ...transitionMatrix.return_again.from,
  ],
  corrections_received: transitionMatrix.submit_corrections.from,
  ready_for_export: [
    ...transitionMatrix.accept.from,
    ...transitionMatrix.close_issues_accept.from,
  ],
};

function isCurrentLocalHandoffWrite(submission: Submission, role: Role): boolean {
  if (submission.updatedAt !== "сейчас") return false;

  if (submission.status === "submitted_for_review") {
    return role === "agent";
  }
  if (submission.status === "returned") {
    return role === "admin" && submission.issues.some(
      (issue) =>
        issue.status === "open" &&
        issue.createdAt === "сейчас" &&
        issue.createdBy === "admin",
    );
  }
  if (submission.status === "corrections_received") {
    return role === "agent";
  }
  if (submission.status === "ready_for_export") {
    return role === "admin" && submission.exportState === "ready";
  }

  return false;
}

function isReviewHandoffCommandWrite(submission: Submission, role: Role): boolean {
  if (!handoffAllowedFromStatuses[submission.status]) return false;
  if (submission.history[0]?.toStatus === submission.status) {
    return true;
  }

  return isCurrentLocalHandoffWrite(submission, role);
}

function applicantRoleFromDurableRow(value: string): Applicant["role"] {
  const normalized = value.trim().toLowerCase();
  if (normalized === "main" || normalized === "основной заявитель") {
    return "main";
  }
  if (
    normalized === "spouse" ||
    normalized === "супруг" ||
    normalized === "супруга" ||
    normalized === "супруг(а)" ||
    normalized === "супруг/супруга"
  ) {
    return "spouse";
  }
  if (
    normalized === "child" ||
    normalized.startsWith("ребёнок") ||
    normalized.startsWith("ребенок")
  ) {
    return "child";
  }
  throw new Error(`Неизвестная роль заявителя в Supabase: ${value || "пусто"}.`);
}

function issueStatusFromCorrectionRow(
  status: CockpitCorrectionRow["status"],
): IssueStatus {
  if (status === "fixed") return "fixed_by_agent";
  if (status === "closed") return "closed_by_admin";
  return "open";
}

function issueFromCorrectionRow(
  row: CockpitCorrectionRow,
  applicants: Applicant[],
): Issue {
  const applicant =
    applicants.find((candidate) => candidate.id === row.applicant_id) ??
    applicants.find((candidate) => candidate.role === "main") ??
    applicants[0];
  if (!applicant) {
    throw new Error(
      `Коррекция ${row.id} не может быть восстановлена без заявителя.`,
    );
  }
  const fileType =
    row.media_type && isCanonicalFrontendMediaType(row.media_type)
      ? row.media_type
      : undefined;

  return {
    id: row.id,
    agentConfirmation:
      row.agent_confirmed_at && row.agent_confirmed_revision !== null
        ? {
            confirmedAtIso: row.agent_confirmed_at,
            targetRevision: row.agent_confirmed_revision,
          }
        : undefined,
    comment: "",
    createdAt: row.created_at,
    createdBy: "admin",
    fixedAtIso: row.fixed_at ?? undefined,
    reason: row.reason,
    severity: row.severity === "blocking" ? "blocker" : "warning",
    status: issueStatusFromCorrectionRow(row.status),
    targetRevision: row.target_revision,
    target: {
      applicantId: applicant.id,
      applicantName: applicant.fullName,
      field: row.field_key ?? undefined,
      fieldId: row.target_field_id ?? undefined,
      fileType,
      sectionId: row.target_section_id ?? undefined,
    },
    type:
      row.scope === "media"
        ? "media"
        : row.scope === "submission" || row.scope === "applicant"
          ? "section"
          : "field",
  };
}

export function attachDurableCorrectionRows(
  submission: Submission,
  correctionRows: CockpitCorrectionRow[],
): Submission {
  if (!correctionRows.length) return submission;

  const correctionByPersistedId = new Map(
    correctionRows.map((row) => [row.id, row]),
  );
  const consumedCorrectionIds = new Set<string>();
  const snapshotIssues = submission.issues.map((issue): Issue => {
    const persistedId = stableUuid(
      `correction:${submission.id}:${issue.id}`,
    );
    const durable = correctionByPersistedId.get(persistedId);
    if (!durable) return issue;
    consumedCorrectionIds.add(durable.id);
    return {
      ...issue,
      agentConfirmation:
        durable.agent_confirmed_at && durable.agent_confirmed_revision !== null
          ? {
              confirmedAtIso: durable.agent_confirmed_at,
              targetRevision: durable.agent_confirmed_revision,
            }
          : undefined,
      createdAt: durable.created_at,
      fixedAtIso: durable.fixed_at ?? undefined,
      severity: durable.severity === "blocking" ? "blocker" : "warning",
      status: issueStatusFromCorrectionRow(durable.status),
      targetRevision: durable.target_revision,
      target: {
        ...issue.target,
        fieldId: durable.target_field_id ?? issue.target.fieldId,
        sectionId: durable.target_section_id ?? issue.target.sectionId,
      },
    };
  });
  const durableOnlyIssues = correctionRows
    .filter((row) => !consumedCorrectionIds.has(row.id))
    .map((row) => issueFromCorrectionRow(row, submission.applicants));

  return {
    ...submission,
    issues: [...snapshotIssues, ...durableOnlyIssues],
  };
}

function fallbackSubmissionFromRows(
  row: SubmissionRow,
  applicants: CockpitApplicantRow[],
  questionnaireAnswers: CockpitQuestionnaireAnswerRow[],
  statusOverride?: SubmissionStatus,
): Submission {
  const tripDateRange = tripDateRangeFromRow(row);
  const applicantItems: Applicant[] = applicants.map((applicant) => ({
    id: applicant.id,
    fullName: applicant.full_name,
    role: applicantRoleFromDurableRow(applicant.role),
    questionnaireStatus:
      applicant.questionnaire_percent >= 100 ? "complete" : "partial",
    fileStatus: applicant.media_percent >= 100 ? "complete" : "partial",
    sections: questionnaireSectionsFromAnswerRows(
      applicant.id,
      questionnaireAnswers.filter((answer) => answer.applicant_id === applicant.id),
    ),
  }));
  const questionnairePercent = applicantItems.some((applicant) =>
    applicant.sections.some((section) => section.fields.length > 0),
  )
    ? row.readiness_percent
    : 0;

  return normalizeSubmissionQuestionnaire({
    id: row.id,
    publicNumber: row.public_number,
    agentId: row.agent_id,
    title: row.title,
    listTitle:
      row.type === "family"
        ? familyListTitleFromMainApplicantName(applicantItems[0]?.fullName)
        : undefined,
    type: row.type,
    country: "Испания",
    city: isCity(row.city) ? row.city : "Москва",
    tripDateFrom: tripDateRange.from,
    tripDateTo: tripDateRange.to,
    status: statusOverride ?? fromSupabaseSubmissionRowStatus(row),
    applicants: applicantItems,
    issues: [],
    files: [],
    completeness: {
      questionnaire: questionnairePercent,
      files: 0,
      total: questionnairePercent,
    },
    exportState: row.status === "exported" ? "marked_exported" : "not_ready",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    history: [],
  });
}

function attachCorruptCockpitSnapshotIssue(
  submission: Submission,
  row: SubmissionRow,
): Submission {
  const applicant = submission.applicants[0];
  return {
    ...submission,
    issues: [
      ...submission.issues,
      {
        comment:
          "Канонические таблицы загружены, но расширенный cockpit snapshot изолирован до восстановления.",
        createdAt: row.updated_at,
        createdBy: "system",
        id: `system-corrupt-cockpit-snapshot-${row.id}`,
        reason: "Повреждённый cockpit snapshot: требуется восстановление данных",
        severity: "blocker",
        status: "open",
        target: {
          applicantId: applicant?.id ?? `submission-${row.id}`,
          applicantName: applicant?.fullName ?? row.title,
          section: "cockpit_snapshot",
        },
        type: "section",
      },
    ],
  };
}

function questionnaireSectionsFromAnswerRows(
  applicantId: string,
  answers: CockpitQuestionnaireAnswerRow[],
) {
  const sectionsById = new Map<string, CockpitQuestionnaireAnswerRow[]>();
  for (const answer of answers) {
    const current = sectionsById.get(answer.section_id) ?? [];
    current.push(answer);
    sectionsById.set(answer.section_id, current);
  }

  return Array.from(sectionsById.entries()).map(([sectionId, sectionAnswers]) => ({
    id: sectionId,
    title: sectionId,
    status: "partial" as const,
    fields: sectionAnswers.map((answer) => {
      const value = questionnaireAnswerFieldValue(answer.value);

      return {
        adminReviewApprovedAtIso: value.adminReviewApprovedAtIso,
        adminReviewApprovedBy: value.adminReviewApprovedBy,
        id: answer.field_id,
        label: answer.label,
        required: true,
        reviewConfirmedAtIso: value.reviewConfirmedAtIso,
        reviewConfirmedBy: value.reviewConfirmedBy,
        reviewOriginSource: value.reviewOriginSource,
        reviewSource: value.reviewSource,
        reviewState: value.reviewState,
        value: value.value,
      };
    }),
  }));
}

function questionnaireAnswerJsonForField(field: QuestionnaireField): Json {
  if (
    !field.adminReviewApprovedAtIso &&
    !field.adminReviewApprovedBy &&
    !field.reviewState &&
    !field.reviewSource &&
    !field.reviewOriginSource &&
    !field.reviewConfirmedAtIso &&
    !field.reviewConfirmedBy
  ) {
    return field.value;
  }

  const envelope: QuestionnaireAnswerValueEnvelope = {
    kind: questionnaireAnswerEnvelopeKind,
    value: field.value,
    version: questionnaireAnswerEnvelopeVersion,
  };

  if (field.adminReviewApprovedAtIso) {
    envelope.adminReviewApprovedAtIso = field.adminReviewApprovedAtIso;
  }

  if (field.adminReviewApprovedBy) {
    envelope.adminReviewApprovedBy = field.adminReviewApprovedBy;
  }

  if (field.reviewConfirmedAtIso) {
    envelope.reviewConfirmedAtIso = field.reviewConfirmedAtIso;
  }

  if (field.reviewConfirmedBy) {
    envelope.reviewConfirmedBy = field.reviewConfirmedBy;
  }

  if (field.reviewOriginSource) {
    envelope.reviewOriginSource = field.reviewOriginSource;
  }

  if (field.reviewState) {
    envelope.reviewState = field.reviewState;
  }

  if (field.reviewSource) {
    envelope.reviewSource = field.reviewSource;
  }

  return envelope;
}

function questionnaireAnswerFieldValue(value: Json): QuestionnaireAnswerValueResult {
  if (isRecord(value) && value.kind === questionnaireAnswerEnvelopeKind) {
    if (
      value.version !== undefined &&
      value.version !== questionnaireAnswerEnvelopeVersion
    ) {
      return { value: typeof value.value === "string" ? value.value : "" };
    }

    return {
      adminReviewApprovedAtIso:
        typeof value.adminReviewApprovedAtIso === "string"
          ? value.adminReviewApprovedAtIso
          : undefined,
      adminReviewApprovedBy:
        typeof value.adminReviewApprovedBy === "string"
          ? value.adminReviewApprovedBy
          : undefined,
      reviewConfirmedAtIso:
        typeof value.reviewConfirmedAtIso === "string"
          ? value.reviewConfirmedAtIso
          : undefined,
      reviewConfirmedBy:
        typeof value.reviewConfirmedBy === "string"
          ? value.reviewConfirmedBy
          : undefined,
      reviewOriginSource: isQuestionnaireReviewSource(value.reviewOriginSource)
        ? value.reviewOriginSource
        : undefined,
      reviewSource: isQuestionnaireReviewSource(value.reviewSource)
        ? value.reviewSource
        : undefined,
      reviewState: isQuestionnaireReviewState(value.reviewState)
        ? value.reviewState
        : undefined,
      value: typeof value.value === "string" ? value.value : "",
    };
  }

  if (typeof value === "string") return { value };
  if (value === null) return { value: "" };
  return { value: JSON.stringify(value) };
}

export async function loadCockpitSubmissionsForProfile(
  profile: AppProfile,
): Promise<CockpitLoadResult> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      caseRevisionsBySubmissionId: new Map(),
      ownerIdsBySubmissionId: new Map(),
      quarantinedSubmissionIds: new Set(),
      submissions: [],
    };
  }

  const runCurrentQuery = () =>
    collectIdKeysetPagedRows<SubmissionRow>(async (afterId, limit) => {
      let query = client
        .from("submissions")
        .select(submissionSelect)
        .order("id", { ascending: true })
        .limit(limit);
      if (profile.role === "agent") query = query.eq("agent_id", profile.id);
      if (afterId) query = query.gt("id", afterId);
      const { data, error } = await query;
      return { data: (data ?? []) as SubmissionRow[], error };
    }, submissionPageSize);
  const runPreConcurrencyQuery = () =>
    collectIdKeysetPagedRows<SubmissionRow>(async (afterId, limit) => {
      let query = client
        .from("submissions")
        .select(preConcurrencySubmissionSelect)
        .order("id", { ascending: true })
        .limit(limit);
      if (profile.role === "agent") query = query.eq("agent_id", profile.id);
      if (afterId) query = query.gt("id", afterId);
      const { data, error } = await query;
      return {
        data: (data ?? []).map((row) => ({
          ...row,
          case_revision: null,
        })) as SubmissionRow[],
        error,
      };
    }, submissionPageSize);
  const runLegacyQuery = () =>
    collectIdKeysetPagedRows<SubmissionRow>(async (afterId, limit) => {
      let query = client
        .from("submissions")
        .select(legacySubmissionSelect)
        .order("id", { ascending: true })
        .limit(limit);
      if (profile.role === "agent") query = query.eq("agent_id", profile.id);
      if (afterId) query = query.gt("id", afterId);
      const { data, error } = await query;
      return {
        data: (data ?? []).map((row) => ({
          ...row,
          case_revision: null,
          public_number: null,
        })) as SubmissionRow[],
        error,
      };
    }, submissionPageSize);
  let { data: rows, error } = await runCurrentQuery();

  if (isMissingCaseRevisionColumn(error)) {
    const preConcurrencyResult = await runPreConcurrencyQuery();
    error = preConcurrencyResult.error;
    rows = preConcurrencyResult.data;
  }

  if (isMissingPublicNumberColumn(error)) {
    const legacyResult = await runLegacyQuery();
    error = legacyResult.error;
    rows = legacyResult.data;
  }

  if (error) {
    throw mapSupabasePersistenceError(error, {
      operation: "submissions.list",
      fallbackKind: "database",
    });
  }

  if (!rows.length) {
    return {
      caseRevisionsBySubmissionId: new Map(),
      ownerIdsBySubmissionId: new Map(),
      quarantinedSubmissionIds: new Set(),
      submissions: [],
    };
  }

  const submissionIds = rows.map((row) => row.id);
  const agentIds = [...new Set(rows.map((row) => row.agent_id))];
  const [
    applicantResult,
    questionnaireResult,
    mediaResult,
    correctionResult,
    statusHistoryResult,
    exportBatchRows,
    agentProfilesResult,
  ] = await Promise.all([
    collectRowsForSubmissionIds<CockpitApplicantRow>(
      submissionIds,
      async (submissionIdChunk, from, to) => {
        const { data, error } = await client
          .from("applicants")
          .select(applicantSelect)
          .in("submission_id", submissionIdChunk)
          .order("id", { ascending: true })
          .range(from, to);
        return { data: (data ?? []) as CockpitApplicantRow[], error };
      },
    ),
    collectRowsForSubmissionIds<CockpitQuestionnaireAnswerRow>(
      submissionIds,
      async (submissionIdChunk, from, to) => {
        const { data, error } = await client
          .from("questionnaire_answers")
          .select(questionnaireAnswerSelect)
          .in("submission_id", submissionIdChunk)
          .order("id", { ascending: true })
          .range(from, to);
        return { data: (data ?? []) as CockpitQuestionnaireAnswerRow[], error };
      },
    ),
    collectRowsForSubmissionIds<CockpitMediaAssetRow>(
      submissionIds,
      async (submissionIdChunk, from, to) => {
        const { data, error } = await client
          .from("media_assets")
          .select(mediaAssetSelect)
          .in("submission_id", submissionIdChunk)
          .order("id", { ascending: true })
          .range(from, to);
        return { data: (data ?? []) as CockpitMediaAssetRow[], error };
      },
    ),
    collectRowsForSubmissionIds<CockpitCorrectionRow>(
      submissionIds,
      async (submissionIdChunk, from, to) => {
        const { data, error } = await client
          .from("corrections")
          .select(correctionSelect)
          .in("submission_id", submissionIdChunk)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to);
        return { data: (data ?? []) as CockpitCorrectionRow[], error };
      },
    ),
    collectRowsForSubmissionIds<CockpitStatusHistoryRow>(
      submissionIds,
      async (submissionIdChunk, from, to) => {
        const { data, error } = await client
          .from("status_history")
          .select(statusHistorySelect)
          .eq("entity_type", "submission")
          .in("entity_id", submissionIdChunk)
          .order("changed_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, to);
        return { data: (data ?? []) as CockpitStatusHistoryRow[], error };
      },
    ),
    profile.role === "admin"
      ? loadExportBatchRowsForSubmissions(submissionIds)
      : Promise.resolve([]),
    profile.role === "admin"
      ? collectRowsForSubmissionIds<{ id: string; display_name: string }>(
          agentIds,
          async (agentIdChunk, from, to) => {
            const { data, error } = await client
              .from("profiles")
              .select(agentProfileSelect)
              .in("id", agentIdChunk)
              .order("id", { ascending: true })
              .range(from, to);
            return {
              data: (data ?? []) as { id: string; display_name: string }[],
              error,
            };
          },
        )
      : Promise.resolve({
          data: [{ id: profile.id, display_name: profile.displayName }],
          error: null,
        }),
  ]);

  const { data: applicantRows, error: applicantError } = applicantResult;
  const { data: questionnaireRows, error: questionnaireError } =
    questionnaireResult;
  const { data: mediaRows, error: mediaError } = mediaResult;
  const { data: correctionRows, error: correctionError } = correctionResult;
  const { data: statusHistoryRows, error: statusHistoryError } =
    statusHistoryResult;

  if (applicantError) {
    throw mapSupabasePersistenceError(applicantError, {
      operation: "applicants.list",
      fallbackKind: "database",
    });
  }

  if (questionnaireError) {
    throw mapSupabasePersistenceError(questionnaireError, {
      operation: "questionnaire_answers.list",
      fallbackKind: "database",
    });
  }

  if (mediaError) {
    throw mapSupabasePersistenceError(mediaError, {
      operation: "media_assets.list",
      fallbackKind: "database",
    });
  }

  if (correctionError) {
    throw mapSupabasePersistenceError(correctionError, {
      operation: "corrections.list",
      fallbackKind: "database",
    });
  }

  if (statusHistoryError) {
    throw mapSupabasePersistenceError(statusHistoryError, {
      operation: "status_history.list",
      fallbackKind: "database",
    });
  }

  if (agentProfilesResult.error) {
    throw mapSupabasePersistenceError(agentProfilesResult.error, {
      operation: "profiles.agent-list",
      fallbackKind: "database",
    });
  }

  const agentDisplayNamesById = new Map(
    (agentProfilesResult.data ?? []).map((agentProfile) => [
      agentProfile.id,
      agentProfile.display_name.trim(),
    ]),
  );
  const caseRevisionsBySubmissionId = new Map<string, number>();
  const ownerIdsBySubmissionId = new Map<string, string>();
  const quarantinedSubmissionIds = new Set<string>();
  const submissions = rows.map((row) => {
    if (
      typeof row.case_revision === "number" &&
      Number.isSafeInteger(row.case_revision) &&
      row.case_revision >= 0
    ) {
      caseRevisionsBySubmissionId.set(row.id, row.case_revision);
    }
    ownerIdsBySubmissionId.set(row.id, row.agent_id);
    const submissionApplicants = (applicantRows ?? []).filter(
      (applicant) => applicant.submission_id === row.id,
    );
    const submissionQuestionnaireAnswers = (questionnaireRows ?? []).filter(
      (answer) => answer.submission_id === row.id,
    );
    const submissionExportBatches = exportBatchRows.filter((batch) =>
      batch.submission_ids.includes(row.id),
    );
    const submissionMediaRows = (mediaRows ?? []).filter(
      (media) => media.submission_id === row.id,
    );
    const submissionCorrectionRows = (correctionRows ?? []).filter(
      (correction) => correction.submission_id === row.id,
    );
    const submissionStatusHistoryRows = (statusHistoryRows ?? []).filter(
      (history) => history.entity_type === "submission" && history.entity_id === row.id,
    );
    const snapshotResult = cockpitSnapshotReadResult(row.family_intelligence);
    if (snapshotResult.kind === "corrupt") {
      quarantinedSubmissionIds.add(row.id);
    }
    const snapshotOrFallback =
      snapshotResult.kind === "valid"
        ? reconcileCockpitSnapshotWithSubmissionRow(
            row,
            snapshotResult.submission,
            submissionApplicants,
            submissionQuestionnaireAnswers,
            submissionExportBatches,
          )
        : attachExportPackageRow(
            snapshotResult.kind === "corrupt"
              ? attachCorruptCockpitSnapshotIssue(
                  fallbackSubmissionFromRows(
                    row,
                    submissionApplicants,
                    submissionQuestionnaireAnswers,
                    latestSubmissionStatusFromHistoryRows(
                      submissionStatusHistoryRows,
                    ),
                  ),
                  row,
                )
              : fallbackSubmissionFromRows(
                  row,
                  submissionApplicants,
                  submissionQuestionnaireAnswers,
                  latestSubmissionStatusFromHistoryRows(
                    submissionStatusHistoryRows,
                  ),
                ),
            fromSupabaseSubmissionRowStatus(row),
            submissionExportBatches,
          );
    const submission = attachDurableStatusHistoryRows(
      attachDurableCorrectionRows(
        attachDurableMediaAssetRows(snapshotOrFallback, submissionMediaRows),
        submissionCorrectionRows,
      ),
      submissionStatusHistoryRows,
    );

    const agentDisplayName = agentDisplayNamesById.get(row.agent_id);
    return agentDisplayName ? { ...submission, agentDisplayName } : submission;
  });

  return {
    caseRevisionsBySubmissionId,
    ownerIdsBySubmissionId,
    quarantinedSubmissionIds,
    submissions,
  };
}

function isMissingCaseRevisionColumn(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown };
  return (
    record.code === "42703" &&
    typeof record.message === "string" &&
    record.message.includes("case_revision")
  );
}

function isMissingPublicNumberColumn(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown };
  return (
    record.code === "42703" ||
    (typeof record.message === "string" && record.message.includes("public_number"))
  );
}

async function loadExportBatchRowsForSubmissions(
  submissionIds: string[],
): Promise<CockpitExportBatchRow[]> {
  if (!submissionIds.length) return [];

  const client = getSupabaseClient();
  if (!client) return [];

  const result = await collectRowsForSubmissionIds<CockpitExportBatchRow>(
    submissionIds,
    async (submissionIdChunk, from, to) => {
      const { data, error } = await client
        .from("export_batches")
        .select(exportBatchSelect)
        .overlaps("submission_ids", submissionIdChunk)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to);
      return { data: (data ?? []) as CockpitExportBatchRow[], error };
    },
  );

  if (result.error) {
    throw mapSupabasePersistenceError(result.error, {
      operation: "export_batches.list",
      fallbackKind: "database",
    });
  }

  return [...new Map(result.data.map((row) => [row.id, row])).values()];
}

function adminCaseRevisionsFromRpc(
  value: unknown,
  submissionIds: readonly string[],
  operationId: string,
): Map<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Supabase вернул некорректный результат admin concurrency RPC.");
  }
  const record = value as Record<string, unknown>;
  if (record.operationId !== operationId) {
    throw new Error("Supabase вернул результат другой admin mutation operation.");
  }
  if (
    !record.caseRevisions ||
    typeof record.caseRevisions !== "object" ||
    Array.isArray(record.caseRevisions)
  ) {
    throw new Error("Supabase не вернул новые revision для admin mutation.");
  }

  const revisionRecord = record.caseRevisions as Record<string, unknown>;
  const revisions = new Map<string, number>();
  for (const submissionId of submissionIds) {
    const revision = revisionRecord[submissionId];
    if (
      typeof revision !== "number" ||
      !Number.isSafeInteger(revision) ||
      revision < 0
    ) {
      throw new Error(
        `Supabase вернул некорректную revision для подачи ${submissionId}.`,
      );
    }
    revisions.set(submissionId, revision);
  }
  return revisions;
}

export function isAdminSubmissionConcurrencyConflict(error: unknown): boolean {
  return (
    error instanceof PersistenceObservableError &&
    error.diagnostics.operation ===
      "rpc.save_admin_submission_batch_if_current" &&
    error.diagnostics.supabaseCode === "40001"
  );
}

export function isSubmissionConcurrencyConflict(error: unknown): boolean {
  return (
    error instanceof PersistenceObservableError &&
    error.diagnostics.supabaseCode === "40001" &&
    (error.diagnostics.operation ===
      "rpc.save_admin_submission_batch_if_current" ||
      error.diagnostics.operation === "rpc.save_submission_draft" ||
      error.diagnostics.operation === "rpc.submit_corrections_handoff")
  );
}

export async function saveAdminCockpitSubmissionsIfCurrent(
  profile: AppProfile,
  submissions: Submission[],
  ownerIdsBySubmissionId: ReadonlyMap<string, string>,
  caseRevisionsBySubmissionId: ReadonlyMap<string, number>,
): Promise<AdminCockpitSaveResult> {
  if (profile.role !== "admin") {
    throw new Error("Only administrators can use the admin concurrency writer.");
  }
  if (!submissions.length) {
    throw new Error("Admin concurrency writer requires at least one submission.");
  }

  const uniqueIds = new Set(submissions.map((submission) => submission.id));
  if (uniqueIds.size !== submissions.length) {
    throw new Error("Admin concurrency writer received duplicate submission ids.");
  }

  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Supabase admin concurrency writer is unavailable.");
  }

  const nextOwnerIds = new Map(ownerIdsBySubmissionId);
  const nextCaseRevisions = new Map(caseRevisionsBySubmissionId);
  const expectedRevisions: Record<string, number> = {};
  const payloads = submissions.map((submission) => {
    assertReviewHandoffPersistenceConsistency(submission, profile.role);
    const ownerId =
      nextOwnerIds.get(submission.id) ?? submission.agentId ?? profile.id;
    const expectedRevision = caseRevisionsBySubmissionId.get(submission.id);
    if (expectedRevision === undefined) {
      throw new Error(
        `Подача ${submission.id} не имеет server revision. Обновите данные после применения migration.`,
      );
    }
    expectedRevisions[submission.id] = expectedRevision;
    nextOwnerIds.set(submission.id, ownerId);
    return toCockpitDraftPersistencePayload(
      submission,
      profile.id,
      ownerId,
      profile.role,
    );
  });
  const operationId = crypto.randomUUID();

  const invoke = async (): Promise<{ data: unknown; error: unknown | null }> => {
    try {
      const response = await client.rpc("save_admin_submission_batch_if_current", {
        actor_id: profile.id,
        expected_revisions: expectedRevisions,
        operation_id: operationId,
        payloads,
      });
      return { data: response.data, error: response.error };
    } catch (error) {
      return { data: null, error };
    }
  };

  let result = await invoke();
  if (result.error) {
    let failure = mapSupabasePersistenceError(result.error, {
      operation: "rpc.save_admin_submission_batch_if_current",
      fallbackKind: "save",
    });
    if (failure.diagnostics.retryable) {
      result = await invoke();
      if (result.error) {
        failure = mapSupabasePersistenceError(result.error, {
          operation: "rpc.save_admin_submission_batch_if_current",
          fallbackKind: "save",
        });
      }
    }
    if (result.error) throw failure;
  }
  if (!result.data) {
    throw mapSupabasePersistenceError(null, {
      operation: "rpc.save_admin_submission_batch_if_current",
      fallbackKind: "save",
    });
  }

  const returnedRevisions = adminCaseRevisionsFromRpc(
    result.data,
    submissions.map((submission) => submission.id),
    operationId,
  );
  for (const [submissionId, revision] of returnedRevisions) {
    nextCaseRevisions.set(submissionId, revision);
  }

  return {
    caseRevisionsBySubmissionId: nextCaseRevisions,
    operationId,
    ownerIdsBySubmissionId: nextOwnerIds,
  };
}

export async function saveCockpitSubmissionsForProfile(
  profile: AppProfile,
  submissions: Submission[],
  ownerIdsBySubmissionId: ReadonlyMap<string, string>,
  caseRevisionsBySubmissionId: ReadonlyMap<string, number> = new Map(),
  loadCanonical: CockpitCanonicalLoader = loadCockpitSubmissionsForProfile,
): Promise<AgentCockpitSaveResult> {
  if (profile.role === "admin") {
    throw new Error(
      "Administrators must use the revision-checked admin concurrency writer.",
    );
  }
  const client = getSupabaseClient();
  if (!client) {
    return {
      caseRevisionsBySubmissionId: new Map(caseRevisionsBySubmissionId),
      ownerIdsBySubmissionId: new Map(ownerIdsBySubmissionId),
    };
  }

  const nextOwnerIds = new Map(ownerIdsBySubmissionId);
  const nextCaseRevisions = new Map(caseRevisionsBySubmissionId);

  for (const submission of submissions) {
    assertReviewHandoffPersistenceConsistency(submission, profile.role);

    const ownerId = profile.id;
    const expectedRevision = caseRevisionsBySubmissionId.get(submission.id);
    const payload: SubmissionDraftPersistencePayload = {
      ...toCockpitDraftPersistencePayload(
      submission,
      profile.id,
      ownerId,
      profile.role,
      ),
      client_contract_version: 2,
      ...(expectedRevision === undefined
        ? {}
        : { expected_case_revision: expectedRevision }),
    };
    const correctionHandoff = requiresCorrectionHandoff(submission, profile.role);
    const operation = correctionHandoff
      ? "rpc.submit_corrections_handoff"
      : "rpc.save_submission_draft";
    const invokeSave = async (): Promise<{
      data: unknown;
      error: unknown | null;
    }> => {
      try {
        const { data, error } = correctionHandoff
          ? await client.rpc("submit_corrections_handoff", { payload })
          : await client.rpc("save_submission_draft", { payload });
        return { data, error };
      } catch (error) {
        return { data: null, error };
      }
    };

    const result = await invokeSave();
    if (result.error) {
      const failure = mapSupabasePersistenceError(result.error, {
        operation,
        fallbackKind: "save",
      });
      if (failure.diagnostics.retryable) {
        try {
          const canonical = await loadCanonical(profile);
          const canonicalSubmission = canonical.submissions.find(
            (item) => item.id === submission.id,
          );
          const canonicalRevision =
            canonical.caseRevisionsBySubmissionId.get(submission.id);
          const intendedFixedIssues = submission.issues.filter(
            (issue) => issue.status === "fixed_by_agent",
          );
          const intendedConfirmedIssues = submission.issues.filter(
            (issue) => issue.agentConfirmation,
          );
          const canonicalIssuesById = new Map(
            canonicalSubmission?.issues.map((issue) => [issue.id, issue]) ?? [],
          );
          const revisionAdvanced =
            canonicalRevision !== undefined &&
            (expectedRevision === undefined ||
              canonicalRevision > expectedRevision);
          const intendedConfirmationsAreDurable =
            intendedConfirmedIssues.length > 0 &&
            intendedConfirmedIssues.every((issue) => {
              const persistedIssue = canonicalIssuesById.get(issue.id);
              return (
                persistedIssue?.status === issue.status &&
                currentIssueTargetRevision(persistedIssue) ===
                  currentIssueTargetRevision(issue) &&
                correctionTargetProjection(
                  canonicalSubmission ?? submission,
                  persistedIssue,
                ) ===
                  correctionTargetProjection(submission, issue) &&
                isAgentIssueCorrectionConfirmed(
                  canonicalSubmission ?? submission,
                  persistedIssue,
                )
              );
            });
          const handoffIsDurable =
            canonicalSubmission?.status === "corrections_received" &&
            !canonicalSubmission.issues.some((issue) => issue.status === "open") &&
            intendedFixedIssues.length > 0 &&
            intendedFixedIssues.every((issue) => {
              const persistedIssue = canonicalIssuesById.get(issue.id);
              return (
                persistedIssue?.status === "fixed_by_agent" &&
                currentIssueTargetRevision(persistedIssue) ===
                  currentIssueTargetRevision(issue) &&
                correctionTargetProjection(
                  canonicalSubmission,
                  persistedIssue,
                ) === correctionTargetProjection(submission, issue) &&
                isAgentIssueCorrectionConfirmed(
                  canonicalSubmission,
                  persistedIssue,
                )
              );
            }) &&
            revisionAdvanced;
          const confirmationSaveIsDurable =
            !correctionHandoff &&
            canonicalSubmission?.status === submission.status &&
            intendedConfirmationsAreDurable &&
            revisionAdvanced;

          if (handoffIsDurable || confirmationSaveIsDurable) {
            return {
              caseRevisionsBySubmissionId:
                canonical.caseRevisionsBySubmissionId,
              ownerIdsBySubmissionId: canonical.ownerIdsBySubmissionId,
            };
          }
        } catch {
          // Preserve the original observable transport failure unless canonical
          // readback proves that the handoff committed.
        }
      }
      throw failure;
    }

    if (!result.data || typeof result.data !== "object") {
      throw new Error(
        `Supabase не вернул новую revision для подачи ${submission.id}.`,
      );
    }
    const revision = (result.data as { caseRevision?: unknown }).caseRevision;
    if (
      typeof revision !== "number" ||
      !Number.isSafeInteger(revision) ||
      revision < 0 ||
      (expectedRevision !== undefined && revision <= expectedRevision)
    ) {
      throw new Error(
        `Supabase вернул некорректную revision для подачи ${submission.id}.`,
      );
    }
    nextCaseRevisions.set(submission.id, revision);
    nextOwnerIds.set(submission.id, ownerId);
  }

  return {
    caseRevisionsBySubmissionId: nextCaseRevisions,
    ownerIdsBySubmissionId: nextOwnerIds,
  };
}

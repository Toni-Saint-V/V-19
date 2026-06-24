import { getSupabaseClient } from "../../lib/supabase/client";
import type {
  ApplicantInsert,
  ApplicantRow,
  CorrectionInsert,
  Json,
  MediaAssetInsert,
  QuestionnaireAnswerRow,
  QuestionnaireAnswerInsert,
  StatusHistoryInsert,
  SubmissionDraftPersistencePayload,
  SubmissionRow,
} from "../../lib/supabase/database.types";
import type {
  AppointmentStatus,
  SubmissionStatus as SupabaseSubmissionStatus,
} from "../../types/domain";
import { mapSupabasePersistenceError } from "../../services/persistenceObservability";
import type { AppProfile } from "../../types/session";
import { familyListTitleFromMainApplicantName } from "./listFormatters";
import { assignSubmissionOwner, ensureSubmissionOwner } from "./ownership";
import { normalizeSubmissionQuestionnaire } from "./questionnaire";
import type {
  Applicant,
  Issue,
  IssueStatus,
  Submission,
  SubmissionFile,
  SubmissionFileType,
  SubmissionStatus,
} from "./types";

export const cockpitSnapshotVersion = 1;
export const cockpitSnapshotKey = "v19CockpitSnapshot";
export const cockpitSnapshotStorageField =
  "submissions.family_intelligence.v19CockpitSnapshot";
export const cockpitSnapshotStatus = "unreviewed";
const submissionListLimit = 100;
const submissionSelect =
  "id,agent_id,type,title,country,city,travel_date,status,priority,readiness_percent,family_intelligence,appointment_status,created_at,submitted_at,review_started_at,accepted_at,exported_at,updated_at" as const;
const applicantSelect =
  "id,submission_id,full_name,questionnaire_percent,media_percent,created_at,updated_at" as const;
const questionnaireAnswerSelect =
  "id,submission_id,applicant_id,section_id,field_id,label,value,updated_by,created_at,updated_at" as const;

export interface CockpitLoadResult {
  ownerIdsBySubmissionId: Map<string, string>;
  submissions: Submission[];
}

type SnapshotEnvelope = {
  submission?: unknown;
  version?: unknown;
};
type CockpitApplicantRow = Pick<
  ApplicantRow,
  "full_name" | "id" | "media_percent" | "questionnaire_percent" | "submission_id"
>;
type CockpitQuestionnaireAnswerRow = Pick<
  QuestionnaireAnswerRow,
  "applicant_id" | "field_id" | "label" | "section_id" | "submission_id" | "value"
>;

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

export function readCockpitSnapshot(value: Json | null): Submission | null {
  const envelope = snapshotEnvelope(value);
  if (!envelope || envelope.version !== cockpitSnapshotVersion) return null;

  return isCockpitSubmission(envelope.submission) ? envelope.submission : null;
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

function reconcileCockpitSnapshotWithSubmissionRow(
  row: Pick<SubmissionRow, "agent_id" | "exported_at" | "status" | "updated_at">,
  snapshot: Submission,
  applicants: CockpitApplicantRow[],
): Submission {
  const normalizedSnapshot = attachNormalizedApplicantRows(
    ensureSubmissionOwner(snapshot, row.agent_id),
    applicants,
  );

  if (row.status !== "exported") return normalizedSnapshot;
  if (
    normalizedSnapshot.status === "exported" &&
    normalizedSnapshot.exportState === "marked_exported"
  ) {
    return normalizedSnapshot;
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

  return {
    ...normalizedSnapshot,
    status: "exported",
    exportState: "marked_exported",
    updatedAt: syncedAt,
    history: syncedHistory,
  };
}

function cockpitSnapshotFamilyIntelligence(submission: Submission): Json {
  // The normalized tables are a query projection; this snapshot owns the full cockpit UI model.
  return {
    status: cockpitSnapshotStatus,
    [cockpitSnapshotKey]: {
      version: cockpitSnapshotVersion,
      submission: submission as unknown as Json,
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

function toSupabaseStatus(status: SubmissionStatus): SupabaseSubmissionStatus {
  switch (status) {
    case "draft":
      return "draft";
    case "in_progress":
      return "filling";
    case "submitted_for_review":
      return "waiting_review";
    case "returned":
    case "requires_action":
      return "returned";
    case "corrections_received":
      return "waiting_review";
    case "ready_for_export":
      return "ready_for_excel";
    case "exported":
      return "exported";
  }
}

function fromSupabaseStatus(status: SupabaseSubmissionStatus): SubmissionStatus {
  switch (status) {
    case "draft":
      return "draft";
    case "filling":
      return "in_progress";
    case "ready_for_review":
    case "waiting_review":
    case "in_review":
      return "submitted_for_review";
    case "returned":
    case "attention_required":
      return "returned";
    case "exported":
      return "exported";
    case "accepted":
    case "ready_for_excel":
    case "sent_to_appointment":
    case "appointment_scheduled":
    case "completed":
      return "ready_for_export";
  }
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
  if (type === "photo") return "photo_white";
  if (type === "selfie") return "selfie";
  if (type === "selfie_2") return "selfie_2";
  if (type === "passport_scan") return "passport_scan";
  if (type === "video") return "video";
  return null;
}

function mediaTypeForFile(type: SubmissionFileType): MediaAssetInsert["type"] {
  if (type === "photo") return "photo_white";
  if (type === "selfie") return "selfie";
  if (type === "selfie_2") return "selfie_2";
  if (type === "passport_scan") return "passport_scan";
  return "video";
}

function applicantRoleLabel(role: Applicant["role"]): string {
  if (role === "main") return "Основной заявитель";
  if (role === "spouse") return "Супруг";
  if (role === "child") return "Ребёнок";
  return "Заявитель";
}

function toApplicantInsert(
  submission: Submission,
  applicant: Applicant,
): ApplicantInsert {
  return {
    id: applicant.id,
    submission_id: submission.id,
    full_name: applicant.fullName,
    role: applicantRoleLabel(applicant.role),
    suggested_role: null,
    role_confirmed: true,
    birth_date: null,
    patronymic: null,
    citizenship: null,
    address: null,
    phone: null,
    email: null,
    passport_number: "",
    passport_issued_at: null,
    passport_expires_at: null,
    country: submission.country,
    city: submission.city,
    trip_dates: tripDate(submission),
    hotel_name: null,
    hotel_address: null,
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
    media_type: mediaTypeForIssue(issue.target.fileType),
    reason: `${issue.reason}${issue.comment ? ` — ${issue.comment}` : ""}`,
    severity: issue.severity === "blocker" ? "blocking" : "note",
    status: issueStatusToCorrectionStatus(issue.status),
    created_by: actorId,
    created_at: timestampOrNow(issue.createdAt),
    fixed_at:
      issue.status === "fixed_by_agent" || issue.status === "closed_by_admin"
        ? new Date().toISOString()
        : null,
  };
}

function toStatusHistoryInsert(
  submission: Submission,
  item: Submission["history"][number],
  actorId: string,
): StatusHistoryInsert {
  return {
    id: stableUuid(`history:${submission.id}:${item.id}`),
    entity_type: "submission",
    entity_id: submission.id,
    from_status: null,
    to_status: toSupabaseStatus(submission.status),
    comment: item.detail ? `${item.text} — ${item.detail}` : item.text,
    changed_by: actorId,
    changed_at: timestampOrNow(item.at),
  };
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
    if (
      !file.generatedFileName ||
      !file.storageBucket ||
      !file.storagePath ||
      file.status === "missing"
    ) {
      return [];
    }

    return [
      {
        id: stableUuid(`media:${submission.id}:${file.applicantId}:${file.type}`),
        applicant_id: file.applicantId,
        submission_id: submission.id,
        type: mediaTypeForFile(file.type),
        original_file_name: file.originalFileName ?? null,
        generated_file_name: file.generatedFileName,
        storage_bucket: file.storageBucket,
        storage_path: file.storagePath,
        mime_type: file.mimeType ?? null,
        size_bytes: file.sizeBytes ?? null,
        upload_status: file.uploadStatus ?? "uploaded",
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
        value: field.value,
        updated_by: actorId,
      })),
    ),
  );
}

export function toCockpitDraftPersistencePayload(
  submission: Submission,
  actorId: string,
  ownerId: string,
): SubmissionDraftPersistencePayload {
  const ownedSubmission = assignSubmissionOwner(
    ensureSubmissionOwner(submission, ownerId),
    ownerId,
  );

  return {
    submission: {
      id: ownedSubmission.id,
      agent_id: ownerId,
      type: ownedSubmission.type,
      title: ownedSubmission.title,
      country: ownedSubmission.country,
      city: ownedSubmission.city,
      travel_date: tripDate(ownedSubmission),
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
          ? timestampOrNow(ownedSubmission.updatedAt)
          : null,
      review_started_at: null,
      accepted_at:
        ownedSubmission.status === "ready_for_export" ||
        ownedSubmission.status === "exported"
          ? timestampOrNow(ownedSubmission.updatedAt)
          : null,
      exported_at:
        ownedSubmission.status === "exported"
          ? timestampOrNow(ownedSubmission.updatedAt)
          : null,
      updated_at: timestampOrNow(ownedSubmission.updatedAt),
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
    status_history: ownedSubmission.history.map((item) =>
      toStatusHistoryInsert(ownedSubmission, item, actorId),
    ),
  };
}

function requiresCorrectionHandoff(submission: Submission): boolean {
  return (
    submission.status === "corrections_received" &&
    submission.issues.some((issue) => issue.status === "fixed_by_agent")
  );
}

function fallbackSubmissionFromRows(
  row: SubmissionRow,
  applicants: CockpitApplicantRow[],
  questionnaireAnswers: CockpitQuestionnaireAnswerRow[],
): Submission {
  const applicantItems: Applicant[] = applicants.map((applicant) => ({
    id: applicant.id,
    fullName: applicant.full_name,
    role: "main",
    questionnaireStatus:
      applicant.questionnaire_percent >= 100 ? "complete" : "partial",
    fileStatus: applicant.media_percent >= 100 ? "complete" : "partial",
    sections: questionnaireSectionsFromAnswerRows(
      applicant.id,
      questionnaireAnswers.filter((answer) => answer.applicant_id === applicant.id),
    ),
  }));

  return normalizeSubmissionQuestionnaire({
    id: row.id,
    agentId: row.agent_id,
    title: row.title,
    listTitle:
      row.type === "family"
        ? familyListTitleFromMainApplicantName(applicantItems[0]?.fullName)
        : undefined,
    type: row.type,
    country: "Испания",
    city:
      row.city === "Москва" || row.city === "Санкт-Петербург" || row.city === "Казань"
        ? row.city
        : "Москва",
    tripDateFrom: row.travel_date,
    tripDateTo: row.travel_date,
    status: fromSupabaseStatus(row.status),
    applicants: applicantItems,
    issues: [],
    files: [],
    completeness: {
      questionnaire: row.readiness_percent,
      files: 0,
      total: row.readiness_percent,
    },
    exportState: row.status === "exported" ? "marked_exported" : "not_ready",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    history: [],
  });
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
    fields: sectionAnswers.map((answer) => ({
      id: answer.field_id,
      label: answer.label,
      value: questionnaireAnswerValue(answer.value),
      required: true,
    })),
  }));
}

function questionnaireAnswerValue(value: Json): string {
  if (typeof value === "string") return value;
  if (value === null) return "";
  return JSON.stringify(value);
}

export async function loadCockpitSubmissionsForProfile(
  profile: AppProfile,
): Promise<CockpitLoadResult> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      ownerIdsBySubmissionId: new Map(),
      submissions: [],
    };
  }

  const query = client
    .from("submissions")
    .select(submissionSelect)
    .order("updated_at", { ascending: false })
    .limit(submissionListLimit);
  const { data: rows, error } =
    profile.role === "agent" ? await query.eq("agent_id", profile.id) : await query;

  if (error) {
    throw mapSupabasePersistenceError(error, {
      operation: "submissions.list",
      fallbackKind: "database",
    });
  }

  if (!rows?.length) {
    return {
      ownerIdsBySubmissionId: new Map(),
      submissions: [],
    };
  }

  const submissionIds = rows.map((row) => row.id);
  const { data: applicantRows, error: applicantError } = await client
    .from("applicants")
    .select(applicantSelect)
    .in("submission_id", submissionIds);

  if (applicantError) {
    throw mapSupabasePersistenceError(applicantError, {
      operation: "applicants.list",
      fallbackKind: "database",
    });
  }

  const { data: questionnaireRows, error: questionnaireError } = await client
    .from("questionnaire_answers")
    .select(questionnaireAnswerSelect)
    .in("submission_id", submissionIds);

  if (questionnaireError) {
    throw mapSupabasePersistenceError(questionnaireError, {
      operation: "questionnaire_answers.list",
      fallbackKind: "database",
    });
  }

  const ownerIdsBySubmissionId = new Map<string, string>();
  const submissions = rows.map((row) => {
    ownerIdsBySubmissionId.set(row.id, row.agent_id);
    const submissionApplicants = (applicantRows ?? []).filter(
      (applicant) => applicant.submission_id === row.id,
    );
    const submissionQuestionnaireAnswers = (questionnaireRows ?? []).filter(
      (answer) => answer.submission_id === row.id,
    );
    const snapshot = readCockpitSnapshot(row.family_intelligence);
    if (snapshot) {
      return reconcileCockpitSnapshotWithSubmissionRow(
        row,
        snapshot,
        submissionApplicants,
      );
    }

    return fallbackSubmissionFromRows(
      row,
      submissionApplicants,
      submissionQuestionnaireAnswers,
    );
  });

  return {
    ownerIdsBySubmissionId,
    submissions,
  };
}

export async function saveCockpitSubmissionsForProfile(
  profile: AppProfile,
  submissions: Submission[],
  ownerIdsBySubmissionId: ReadonlyMap<string, string>,
): Promise<Map<string, string>> {
  const client = getSupabaseClient();
  if (!client) return new Map(ownerIdsBySubmissionId);

  const nextOwnerIds = new Map(ownerIdsBySubmissionId);

  for (const submission of submissions) {
    const ownerId =
      profile.role === "admin"
        ? (nextOwnerIds.get(submission.id) ?? submission.agentId ?? profile.id)
        : profile.id;
    const payload = toCockpitDraftPersistencePayload(submission, profile.id, ownerId);
    const { error } = requiresCorrectionHandoff(submission)
      ? await client.rpc("submit_corrections_handoff", { payload })
      : await client.rpc("save_submission_draft", { payload });

    if (error) {
      throw mapSupabasePersistenceError(error, {
        operation: requiresCorrectionHandoff(submission)
          ? "rpc.submit_corrections_handoff"
          : "rpc.save_submission_draft",
        fallbackKind: "save",
      });
    }

    nextOwnerIds.set(submission.id, ownerId);
  }

  return nextOwnerIds;
}

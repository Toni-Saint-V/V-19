import type {
  Applicant,
  Appointment,
  CorrectionNote,
  ExportBatch,
  MediaSlot,
  StatusHistoryItem,
  Submission,
} from "../types/domain";
import { getSupabaseClient } from "../lib/supabase/client";
import type {
  AppointmentInsert,
  AppointmentRow,
  ApplicantInsert,
  ApplicantRow,
  CorrectionInsert,
  CorrectionRow,
  ExportBatchInsert,
  ExportBatchRow,
  MediaAssetInsert,
  MediaAssetRow,
  StatusHistoryInsert,
  StatusHistoryRow,
  SubmissionDraftPersistencePayload,
  SubmissionInsert,
  SubmissionRow,
} from "../lib/supabase/database.types";
import {
  applicantFieldCompletion,
  applicantMediaCompletion,
  normalizeApplicant,
  normalizeSubmission,
  readiness,
} from "../lib/workflow";
import { mapSupabasePersistenceError } from "./persistenceObservability";
import { storageTargetForSlot } from "./storagePathPolicy";

const submissionSelect =
  "id,public_number,agent_id,type,title,country,city,travel_date,trip_date_from,trip_date_to,status,priority,readiness_percent,family_intelligence,appointment_status,created_at,submitted_at,review_started_at,accepted_at,exported_at,updated_at" as const;
const legacySubmissionSelect =
  "id,agent_id,type,title,country,city,travel_date,trip_date_from,trip_date_to,status,priority,readiness_percent,family_intelligence,appointment_status,created_at,submitted_at,review_started_at,accepted_at,exported_at,updated_at" as const;
const applicantSelect =
  "id,submission_id,full_name,role,suggested_role,role_confirmed,birth_date,patronymic,citizenship,address,phone,email,passport_number,passport_issued_at,passport_expires_at,country,city,trip_dates,hotel_name,hotel_address,questionnaire_percent,media_percent,created_at,updated_at" as const;
const mediaAssetSelect =
  "id,applicant_id,submission_id,type,original_file_name,generated_file_name,storage_bucket,storage_path,mime_type,size_bytes,upload_status,review_status,uploaded_at,reviewed_at,reviewed_by" as const;
const correctionSelect =
  "id,submission_id,applicant_id,scope,field_key,media_type,reason,severity,status,created_by,created_at,fixed_at" as const;
const appointmentSelect =
  "id,submission_id,status,city,date,time,operator_comment,updated_by,updated_at" as const;
const exportBatchSelect =
  "id,created_by,created_at,format,content_fingerprint,idempotency_key,file_name,row_count,submission_ids" as const;
const statusHistorySelect =
  "id,entity_type,entity_id,from_status,to_status,comment,source,note,changed_by,changed_at" as const;
const submissionListLimit = 100;
const requiredMediaSlotsPerApplicant = 4;

function legacyTravelDateFromRow(row: SubmissionRow): string {
  const from = row.trip_date_from?.trim();
  const to = row.trip_date_to?.trim();
  if (from && to && from !== to) return `${from} - ${to}`;
  return from || to || row.travel_date;
}

function splitTripDateRange(value: string): { from: string; to: string } {
  const normalized = value.trim();
  const rangeMatch = normalized.match(/^(.+?)\s+-\s+(.+)$/);
  if (!rangeMatch) return { from: normalized, to: normalized };

  const from = rangeMatch[1]?.trim() ?? normalized;
  const to = rangeMatch[2]?.trim() ?? normalized;
  return { from: from || normalized, to: to || normalized };
}

function mapSubmissionRow(
  row: SubmissionRow,
  applicants: Applicant[] = [],
  options: {
    notes?: CorrectionNote[];
    timeline?: StatusHistoryItem[];
    exportHistory?: ExportBatch[];
    appointmentDetails?: Appointment;
  } = {},
): Submission {
  return normalizeSubmission({
    id: row.id,
    publicNumber: row.public_number,
    title: row.title,
    type: row.type,
    agentId: row.agent_id,
    agentName: "Agent",
    country: row.country,
    city: row.city,
    travelDate: legacyTravelDateFromRow(row),
    updated: row.updated_at,
    status: row.status,
    appointment: row.appointment_status,
    priority: row.priority,
    fields: row.readiness_percent,
    media: 0,
    mediaRequired: applicants.length * requiredMediaSlotsPerApplicant,
    applicants,
    mediaRows: [],
    notes: options.notes ?? [],
    timeline: options.timeline,
    exportHistory: options.exportHistory,
    appointmentDetails: options.appointmentDetails,
    submittedAt: row.submitted_at ?? undefined,
    reviewStartedAt: row.review_started_at ?? undefined,
    acceptedAt: row.accepted_at ?? undefined,
    exportedAt: row.exported_at ?? undefined,
    familyIntelligence:
      row.family_intelligence && typeof row.family_intelligence === "object"
        ? {
            status:
              "status" in row.family_intelligence &&
              row.family_intelligence.status === "confirmed"
                ? "confirmed"
                : "unreviewed",
          }
        : undefined,
  });
}

function mapApplicantRow(row: ApplicantRow): Applicant {
  return normalizeApplicant({
    id: row.id,
    name: row.full_name,
    role: row.role,
    suggestedRole: row.suggested_role ?? undefined,
    roleConfirmed: row.role_confirmed,
    passport: row.passport_number,
    form: row.questionnaire_percent,
    media: 0,
    mediaRequired: requiredMediaSlotsPerApplicant,
    birthDate: row.birth_date ?? undefined,
    patronymic: row.patronymic ?? undefined,
    citizenship: row.citizenship ?? undefined,
    address: row.address ?? undefined,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    passportIssuedAt: row.passport_issued_at ?? undefined,
    passportExpiresAt: row.passport_expires_at ?? undefined,
    country: row.country,
    city: row.city,
    tripDates: row.trip_dates,
    hotelName: row.hotel_name ?? undefined,
    hotelAddress: row.hotel_address ?? undefined,
  });
}

function mediaStateFromRow(row: MediaAssetRow): MediaSlot["state"] {
  if (row.review_status === "accepted") return "accepted";
  if (
    row.review_status === "replace_required" ||
    row.review_status === "poor_quality"
  ) {
    return "replace";
  }
  return row.upload_status === "uploaded" ? "uploaded" : "missing";
}

function mapMediaAssetRow(row: MediaAssetRow): MediaSlot {
  const labelByType: Record<MediaSlot["type"], string> = {
    photo_white: "Фото",
    selfie: "Селфи 1",
    selfie_2: "Селфи 2",
    passport_scan: "Скан паспорта",
    video: "Видео",
  };

  return {
    id: row.id,
    applicantId: row.applicant_id,
    type: row.type,
    label: labelByType[row.type],
    state: mediaStateFromRow(row),
    originalFileName: row.original_file_name ?? undefined,
    generatedFileName: row.generated_file_name ?? undefined,
    mimeType: row.mime_type ?? undefined,
    sizeBytes: row.size_bytes ?? undefined,
    uploadStatus: row.upload_status,
    reviewStatus: row.review_status,
    uploadedAt: row.uploaded_at ?? undefined,
    reviewedAt: row.reviewed_at ?? undefined,
    reviewedBy: row.reviewed_by ?? undefined,
  };
}

function mapCorrectionRow(row: CorrectionRow): CorrectionNote {
  return {
    id: row.id,
    target:
      row.scope === "media"
        ? (row.media_type ?? "Файлы")
        : row.scope === "field"
          ? (row.field_key ?? "Поле")
          : row.scope === "applicant"
            ? "Заявитель"
            : "Анкета",
    text: row.reason,
    scope: row.scope,
    applicantId: row.applicant_id ?? undefined,
    fieldKey: row.field_key ? (row.field_key as CorrectionNote["fieldKey"]) : undefined,
    mediaType: row.media_type ?? undefined,
    severity: row.severity,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    fixedAt: row.fixed_at ?? undefined,
  };
}

function mapStatusHistoryRow(row: StatusHistoryRow): StatusHistoryItem {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    fromStatus: row.from_status ?? undefined,
    toStatus: row.to_status,
    comment: row.comment,
    note: row.note ?? undefined,
    source: row.source,
    changedBy: row.changed_by,
    changedAt: row.changed_at,
  };
}

export function mapExportBatchRow(row: ExportBatchRow): ExportBatch {
  const batch: ExportBatch = {
    id: row.id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    format: row.format,
    rowCount: row.row_count,
    submissionIds: row.submission_ids,
  };

  if (row.idempotency_key) batch.idempotencyKey = row.idempotency_key;
  if (row.content_fingerprint) batch.contentFingerprint = row.content_fingerprint;
  if (row.file_name) batch.fileName = row.file_name;

  return batch;
}

function mapAppointmentRow(row: AppointmentRow): Appointment {
  return {
    submissionId: row.submission_id,
    status: row.status,
    city: row.city,
    date: row.date ?? undefined,
    time: row.time ?? undefined,
    operatorComment: row.operator_comment,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  };
}

function timestampOrNull(value: string | undefined): string | null {
  if (!value) return null;
  const dateMatch = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (dateMatch) {
    const [, day, month, year] = dateMatch;
    const parsed = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString().slice(0, 10) === `${year}-${month}-${day}`
      ? parsed.toISOString()
      : null;
  }
  if (!/^\d{4}-\d{2}-\d{2}(T.+)?$/.test(value)) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function timestampOrNow(value: string | undefined): string {
  return timestampOrNull(value) ?? new Date().toISOString();
}

function dateOrNull(value: string | undefined): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10) === value ? value : null;
}

function uploadStatusForSlot(slot: MediaSlot): MediaAssetInsert["upload_status"] {
  return slot.state === "missing" ? "none" : "uploaded";
}

function reviewStatusForSlot(slot: MediaSlot): MediaAssetInsert["review_status"] {
  if (slot.state === "accepted") return "accepted";
  if (slot.state === "replace") {
    return slot.reviewStatus === "poor_quality" ? "poor_quality" : "replace_required";
  }
  return slot.reviewStatus ?? "not_reviewed";
}

function toNullableUuid(value: string | undefined): string | undefined {
  return value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
    ? value
    : undefined;
}

export function toSubmissionInsert(submission: Submission): SubmissionInsert {
  const normalized = normalizeSubmission(submission);
  const tripDateRange = splitTripDateRange(normalized.travelDate);

  return {
    id: normalized.id,
    agent_id: normalized.agentId,
    type: normalized.type,
    title: normalized.title,
    country: normalized.country,
    city: normalized.city,
    travel_date: normalized.travelDate,
    trip_date_from: tripDateRange.from,
    trip_date_to: tripDateRange.to,
    status: normalized.status,
    priority: normalized.priority,
    readiness_percent: readiness(normalized),
    family_intelligence: normalized.familyIntelligence
      ? {
          status: normalized.familyIntelligence.status,
          confirmedAt: normalized.familyIntelligence.confirmedAt,
        }
      : null,
    appointment_status: normalized.appointment,
    submitted_at: timestampOrNull(normalized.submittedAt),
    review_started_at: timestampOrNull(normalized.reviewStartedAt),
    accepted_at: timestampOrNull(normalized.acceptedAt),
    exported_at: timestampOrNull(normalized.exportedAt),
    updated_at: timestampOrNow(normalized.updated),
  };
}

export function toApplicantInsert(
  submissionId: string,
  applicant: Applicant,
): ApplicantInsert {
  const normalized = normalizeApplicant(applicant);

  return {
    id: normalized.id ?? `${submissionId}-${normalized.name}`,
    submission_id: submissionId,
    full_name: normalized.name,
    role: normalized.role,
    suggested_role: normalized.suggestedRole ?? null,
    role_confirmed: normalized.roleConfirmed ?? false,
    birth_date: dateOrNull(normalized.birthDate),
    patronymic: normalized.patronymic ?? null,
    citizenship: normalized.citizenship ?? null,
    address: normalized.address ?? null,
    phone: normalized.phone ?? null,
    email: normalized.email ?? null,
    passport_number: normalized.passport,
    passport_issued_at: dateOrNull(normalized.passportIssuedAt),
    passport_expires_at: dateOrNull(normalized.passportExpiresAt),
    country: normalized.country ?? "",
    city: normalized.city ?? "",
    trip_dates: normalized.tripDates ?? "",
    hotel_name: normalized.hotelName ?? null,
    hotel_address: normalized.hotelAddress ?? null,
    questionnaire_percent: applicantFieldCompletion(normalized),
    media_percent: applicantMediaCompletion(normalized),
  };
}

export function toMediaAssetInserts(submission: Submission): MediaAssetInsert[] {
  const normalized = normalizeSubmission(submission);

  return normalized.applicants.flatMap((applicant) =>
    (applicant.mediaSlots ?? []).flatMap((slot) => {
      if (!applicant.id || !slot.generatedFileName) return [];

      const target = storageTargetForSlot(normalized.id, applicant.id, slot);
      return [
        {
          id: slot.id,
          applicant_id: applicant.id,
          submission_id: normalized.id,
          type: slot.type,
          original_file_name: slot.originalFileName ?? null,
          generated_file_name: slot.generatedFileName,
          storage_bucket: target.bucket,
          storage_path: target.path,
          mime_type:
            slot.mimeType ??
            (slot.type === "video"
              ? "video/mp4"
              : slot.generatedFileName.endsWith(".pdf")
                ? "application/pdf"
                : slot.generatedFileName.endsWith(".png")
                  ? "image/png"
                  : "image/jpeg"),
          size_bytes: slot.sizeBytes ?? null,
          upload_status: uploadStatusForSlot(slot),
          review_status: reviewStatusForSlot(slot),
          uploaded_at: timestampOrNull(slot.uploadedAt),
          reviewed_at: timestampOrNull(slot.reviewedAt),
          reviewed_by: slot.reviewedBy ?? null,
        },
      ];
    }),
  );
}

export function toCorrectionInserts(
  submission: Submission,
  actorId: string,
): CorrectionInsert[] {
  return submission.notes.map((note) => ({
    id: toNullableUuid(note.id) ?? crypto.randomUUID(),
    submission_id: submission.id,
    applicant_id: note.applicantId ?? null,
    scope: note.scope ?? "submission",
    field_key: note.fieldKey ? String(note.fieldKey) : null,
    media_type: note.mediaType ?? null,
    reason: note.text,
    severity: note.severity ?? "blocking",
    status: note.status ?? "open",
    created_by: actorId,
    created_at: timestampOrNow(note.createdAt),
    fixed_at: timestampOrNull(note.fixedAt),
  }));
}

export function toStatusHistoryInserts(
  submission: Submission,
  actorId: string,
): StatusHistoryInsert[] {
  return (submission.timeline ?? []).map((item) => ({
    id: toNullableUuid(item.id) ?? crypto.randomUUID(),
    entity_type: item.entityType,
    entity_id: item.entityId,
    from_status: item.fromStatus ?? null,
    to_status: item.toStatus,
    comment: item.comment,
    note: item.note ?? null,
    source: item.source ?? "system",
    changed_by: toNullableUuid(item.changedBy) ?? actorId,
    changed_at: timestampOrNow(item.changedAt),
  }));
}

export function toExportBatchInserts(submission: Submission): ExportBatchInsert[] {
  return (submission.exportHistory ?? []).map((batch) => ({
    id: toNullableUuid(batch.id) ?? crypto.randomUUID(),
    created_by: batch.createdBy,
    created_at: timestampOrNow(batch.createdAt),
    format: batch.format,
    content_fingerprint: batch.contentFingerprint ?? null,
    idempotency_key: batch.idempotencyKey ?? null,
    file_name: batch.fileName ?? null,
    row_count: batch.rowCount,
    submission_ids: batch.submissionIds,
  }));
}

type ExportBatchWriteInsert = Omit<ExportBatchInsert, "created_by" | "created_at">;

function toExportBatchWriteInsert(batch: ExportBatch): ExportBatchWriteInsert {
  return {
    ...(toNullableUuid(batch.id) ? { id: batch.id } : {}),
    format: batch.format,
    content_fingerprint: batch.contentFingerprint ?? null,
    idempotency_key: batch.idempotencyKey ?? null,
    file_name: batch.fileName ?? null,
    row_count: batch.rowCount,
    submission_ids: batch.submissionIds,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    !!error && typeof error === "object" && "code" in error && error.code === "23505"
  );
}

export async function recordExportBatch(
  batch: ExportBatch,
): Promise<ExportBatch | null> {
  const client = getSupabaseClient();
  if (!client) return batch;

  const { data, error } = await client
    .from("export_batches")
    .insert(toExportBatchWriteInsert(batch))
    .select(exportBatchSelect)
    .single();

  if (!error) return mapExportBatchRow(data);

  if (isUniqueViolation(error) && batch.idempotencyKey) {
    const { data: duplicate, error: duplicateError } = await client
      .from("export_batches")
      .select(exportBatchSelect)
      .eq("idempotency_key", batch.idempotencyKey)
      .single();

    if (duplicateError) {
      throw mapSupabasePersistenceError(duplicateError, {
        operation: "export_batches.read_duplicate",
        fallbackKind: "database",
      });
    }

    return mapExportBatchRow(duplicate);
  }

  throw mapSupabasePersistenceError(error, {
    operation: "export_batches.insert",
    fallbackKind: "database",
  });
}

export function toAppointmentInsert(
  submission: Submission,
  actorId: string,
): AppointmentInsert {
  const appointment = submission.appointmentDetails;
  return {
    submission_id: submission.id,
    status: submission.appointment,
    city: appointment?.city ?? submission.city,
    date: dateOrNull(appointment?.date),
    time: appointment?.time ?? null,
    operator_comment: appointment?.operatorComment ?? "",
    updated_by: toNullableUuid(appointment?.updatedBy) ?? actorId,
    updated_at: timestampOrNow(appointment?.updatedAt ?? submission.updated),
  };
}

export function toSubmissionDraftPersistencePayload(
  submission: Submission,
  actorId: string,
  persistedStatusHistoryIds?: ReadonlySet<string>,
): SubmissionDraftPersistencePayload {
  const normalized = normalizeSubmission(submission);

  return {
    submission: toSubmissionInsert(normalized),
    applicants: normalized.applicants.map((applicant) =>
      toApplicantInsert(normalized.id, applicant),
    ),
    media_assets: toMediaAssetInserts(normalized),
    corrections: toCorrectionInserts(normalized, actorId),
    status_history: toStatusHistoryInserts(normalized, actorId).filter(
      (item) => !persistedStatusHistoryIds?.has(item.id ?? ""),
    ),
  };
}

export async function listSubmissionsForRole(role: "agent" | "admin", agentId: string) {
  const client = getSupabaseClient();
  if (!client) return null;

  const runCurrentQuery = () => {
    const query = client
      .from("submissions")
      .select(submissionSelect)
      .order("updated_at", { ascending: false })
      .limit(submissionListLimit);
    return role === "agent" ? query.eq("agent_id", agentId) : query;
  };
  const runLegacyQuery = () => {
    const query = client
      .from("submissions")
      .select(legacySubmissionSelect)
      .order("updated_at", { ascending: false })
      .limit(submissionListLimit);
    return role === "agent" ? query.eq("agent_id", agentId) : query;
  };
  let { data: submissionRows, error } = await runCurrentQuery();

  if (isMissingPublicNumberColumn(error)) {
    const legacyResult = await runLegacyQuery();
    error = legacyResult.error;
    submissionRows = (legacyResult.data ?? []).map((row) => ({
      ...row,
      public_number: null,
    })) as typeof submissionRows;
  }

  if (error) {
    throw mapSupabasePersistenceError(error, {
      operation: "submissions.list",
      fallbackKind: "database",
    });
  }
  if (!submissionRows?.length) return [];

  const ids = submissionRows.map((row) => row.id);
  const { data: applicantRows, error: applicantError } = await client
    .from("applicants")
    .select(applicantSelect)
    .in("submission_id", ids);

  if (applicantError) {
    throw mapSupabasePersistenceError(applicantError, {
      operation: "applicants.list",
      fallbackKind: "database",
    });
  }

  const { data: mediaRows, error: mediaError } = await client
    .from("media_assets")
    .select(mediaAssetSelect)
    .in("submission_id", ids);

  if (mediaError) {
    throw mapSupabasePersistenceError(mediaError, {
      operation: "media_assets.list",
      fallbackKind: "database",
    });
  }

  const { data: correctionRows, error: correctionError } = await client
    .from("corrections")
    .select(correctionSelect)
    .in("submission_id", ids);

  if (correctionError) {
    throw mapSupabasePersistenceError(correctionError, {
      operation: "corrections.list",
      fallbackKind: "database",
    });
  }

  const { data: appointmentRows, error: appointmentError } = await client
    .from("appointments")
    .select(appointmentSelect)
    .in("submission_id", ids);

  if (appointmentError) {
    throw mapSupabasePersistenceError(appointmentError, {
      operation: "appointments.list",
      fallbackKind: "database",
    });
  }

  const { data: exportRows, error: exportError } = await client
    .from("export_batches")
    .select(exportBatchSelect)
    .overlaps("submission_ids", ids);

  if (exportError) {
    throw mapSupabasePersistenceError(exportError, {
      operation: "export_batches.list",
      fallbackKind: "database",
    });
  }

  const allTimelineEntityIds = Array.from(
    new Set([
      ...ids,
      ...(applicantRows ?? []).map((row) => row.id),
      ...(mediaRows ?? []).map((row) => row.id),
      ...(appointmentRows ?? []).map((row) => row.id),
    ]),
  );
  const { data: statusRows, error: statusError } = await client
    .from("status_history")
    .select(statusHistorySelect)
    .in("entity_id", allTimelineEntityIds);

  if (statusError) {
    throw mapSupabasePersistenceError(statusError, {
      operation: "status_history.list",
      fallbackKind: "database",
    });
  }

  return submissionRows.map((submissionRow) => {
    const applicants = (applicantRows ?? [])
      .filter((row) => row.submission_id === submissionRow.id)
      .map((applicantRow) => {
        const mediaSlots = (mediaRows ?? [])
          .filter((row) => row.applicant_id === applicantRow.id)
          .map(mapMediaAssetRow);

        return {
          ...mapApplicantRow(applicantRow),
          mediaSlots,
        };
      });

    const notes = (correctionRows ?? [])
      .filter((row) => row.submission_id === submissionRow.id)
      .map(mapCorrectionRow);
    const appointmentDetails = (appointmentRows ?? [])
      .filter((row) => row.submission_id === submissionRow.id)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .map(mapAppointmentRow)[0];
    const exportHistory = (exportRows ?? [])
      .filter((row) => row.submission_ids.includes(submissionRow.id))
      .map(mapExportBatchRow);
    const applicantIds = applicants.map((applicant) => applicant.id).filter(Boolean);
    const mediaIds = (mediaRows ?? [])
      .filter((row) => row.submission_id === submissionRow.id)
      .map((row) => row.id);
    const appointmentIds = (appointmentRows ?? [])
      .filter((row) => row.submission_id === submissionRow.id)
      .map((row) => row.id);
    const entityIds = new Set([
      submissionRow.id,
      ...applicantIds,
      ...mediaIds,
      ...appointmentIds,
    ]);
    const timeline = (statusRows ?? [])
      .filter((row) => entityIds.has(row.entity_id))
      .map(mapStatusHistoryRow);

    return mapSubmissionRow(submissionRow, applicants, {
      notes,
      appointmentDetails,
      exportHistory,
      timeline,
    });
  });
}

function isMissingPublicNumberColumn(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown };
  return (
    record.code === "42703" ||
    (typeof record.message === "string" && record.message.includes("public_number"))
  );
}

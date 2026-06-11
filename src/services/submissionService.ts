import type { Applicant, Submission } from "../types/domain";
import { getSupabaseClient } from "../lib/supabase/client";
import type {
  ApplicantInsert,
  ApplicantRow,
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

function mapSubmissionRow(
  row: SubmissionRow,
  applicants: Applicant[] = [],
): Submission {
  return normalizeSubmission({
    id: row.id,
    title: row.title,
    type: row.type,
    agentId: row.agent_id,
    agentName: "Agent",
    country: row.country,
    city: row.city,
    travelDate: row.travel_date,
    updated: row.updated_at,
    status: row.status,
    appointment: row.appointment_status,
    priority: row.priority,
    fields: row.readiness_percent,
    media: 0,
    mediaRequired: applicants.length * 3,
    applicants,
    mediaRows: [],
    notes: [],
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
    mediaRequired: 3,
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

export function toSubmissionInsert(submission: Submission): SubmissionInsert {
  const normalized = normalizeSubmission(submission);

  return {
    id: normalized.id,
    agent_id: normalized.agentId,
    type: normalized.type,
    title: normalized.title,
    country: normalized.country,
    city: normalized.city,
    travel_date: normalized.travelDate,
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
    birth_date: normalized.birthDate ?? null,
    patronymic: normalized.patronymic ?? null,
    citizenship: normalized.citizenship ?? null,
    address: normalized.address ?? null,
    phone: normalized.phone ?? null,
    email: normalized.email ?? null,
    passport_number: normalized.passport,
    passport_issued_at: normalized.passportIssuedAt ?? null,
    passport_expires_at: normalized.passportExpiresAt ?? null,
    country: normalized.country ?? "",
    city: normalized.city ?? "",
    trip_dates: normalized.tripDates ?? "",
    hotel_name: normalized.hotelName ?? null,
    hotel_address: normalized.hotelAddress ?? null,
    questionnaire_percent: applicantFieldCompletion(normalized),
    media_percent: applicantMediaCompletion(normalized),
  };
}

export async function listSubmissionsForRole(role: "agent" | "admin", agentId: string) {
  const client = getSupabaseClient();
  if (!client) return null;

  const query = client.from("submissions").select("*").order("updated_at", {
    ascending: false,
  });
  const { data: submissionRows, error } =
    role === "agent" ? await query.eq("agent_id", agentId) : await query;

  if (error) throw error;
  if (!submissionRows?.length) return [];

  const ids = submissionRows.map((row) => row.id);
  const { data: applicantRows, error: applicantError } = await client
    .from("applicants")
    .select("*")
    .in("submission_id", ids);

  if (applicantError) throw applicantError;

  return submissionRows.map((submissionRow) => {
    const applicants = (applicantRows ?? [])
      .filter((row) => row.submission_id === submissionRow.id)
      .map(mapApplicantRow);

    return mapSubmissionRow(submissionRow, applicants);
  });
}

export async function saveSubmissionDraft(submission: Submission): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;

  const normalized = normalizeSubmission(submission);
  const { error } = await client
    .from("submissions")
    .upsert(toSubmissionInsert(normalized));

  if (error) throw error;

  const { error: applicantsError } = await client
    .from("applicants")
    .upsert(
      normalized.applicants.map((applicant) =>
        toApplicantInsert(normalized.id, applicant),
      ),
    );

  if (applicantsError) throw applicantsError;
}

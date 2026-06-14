import type { Applicant, CorrectionNote, Submission } from "../types/domain";
import {
  normalizeSubmission,
  readiness,
  requiredApplicantFields,
} from "../lib/workflow";

export type TextIntakeReviewSeverity = "blocking" | "warning" | "info";

export type TextIntakeReviewCode =
  | "missing_required_text"
  | "missing_conditional_text"
  | "placeholder_text"
  | "invalid_email"
  | "weak_phone"
  | "invalid_date_format"
  | "invalid_birth_date"
  | "passport_expired_before_travel"
  | "passport_issued_after_expiry"
  | "date_order_inconsistent"
  | "duration_dates_mismatch"
  | "non_numeric_duration"
  | "weak_passport_number"
  | "passport_number_unexpected_format"
  | "passport_validity_too_short_after_departure"
  | "passport_validity_period_unexpected"
  | "latin_text_expected"
  | "family_trip_mismatch"
  | "residence_submission_city_mismatch"
  | "home_address_incomplete"
  | "host_country_unexpected"
  | "spanish_host_postal_invalid"
  | "spanish_host_phone_unexpected"
  | "appointment_after_travel_date"
  | "minor_occupation_age_mismatch"
  | "employer_contact_matches_applicant"
  | "employer_address_matches_home"
  | "submission_applicant_country_mismatch"
  | "submission_applicant_city_mismatch"
  | "trip_dates_not_machine_readable"
  | "travel_date_outside_trip_dates"
  | "duplicate_passport"
  | "shared_contact_requires_review"
  | "name_too_short"
  | "family_role_unconfirmed";

export interface TextIntakeReviewFinding {
  id: string;
  code: TextIntakeReviewCode;
  severity: TextIntakeReviewSeverity;
  scope: "submission" | "applicant" | "field";
  applicantId?: string;
  applicantName?: string;
  fieldKey?: keyof Applicant;
  sourceField?: string;
  fieldLabel?: string;
  problem: string;
  reason: string;
  requiredAction: string;
}

export interface TextIntakeReviewResult {
  status: "clear" | "needs_review" | "needs_correction";
  readiness: number;
  reviewedApplicants: number;
  reviewedFields: number;
  findings: TextIntakeReviewFinding[];
  correctionCandidates: CorrectionNote[];
  guardrails: string[];
}

const placeholderValues = new Set([
  "-",
  "--",
  "—",
  "— выберите —",
  "n/a",
  "na",
  "unknown",
  "todo",
  "test",
  "тест",
  "уточнить",
  "неизвестно",
  "нет данных",
  "not applicable",
]);

const fieldLabels = new Map<keyof Applicant, string>(
  requiredApplicantFields.map(({ key, label }) => [key, label]),
);

const textReviewGuardrails = [
  "Text review checks questionnaire fields only; photos and videos remain manual media review.",
  "Findings are correction drafts, not outcome decisions or authority claims.",
  "Readiness and handoff still depend on deterministic preflight and human review.",
];

export type BlsAppointmentTextKey =
  | "city"
  | "visa_type"
  | "visa_category"
  | "schedule_date1"
  | "schedule_date2"
  | "schedule_date3"
  | "note";

export type BlsApplicantTextKey =
  | "relation_to_primary"
  | "first_name"
  | "last_name"
  | "maiden_name"
  | "surname_at_birth"
  | "birth_date"
  | "birth_place"
  | "birth_country"
  | "current_nationality"
  | "gender"
  | "marital_status"
  | "passport_type"
  | "passport_number"
  | "passport_issued_at"
  | "passport_expires_at"
  | "travel_date"
  | "address_line1"
  | "country"
  | "addr_city"
  | "postal_code"
  | "phone"
  | "email"
  | "employer_name"
  | "occupation"
  | "occupation_other"
  | "work_phone"
  | "work_address"
  | "trip_purpose"
  | "stay_duration"
  | "entries_number"
  | "arrival_date"
  | "departure_date"
  | "host_type"
  | "host_name"
  | "host_country"
  | "host_city"
  | "host_postal"
  | "host_address"
  | "host_email"
  | "host_phone"
  | "cost_covered_by"
  | "means_of_support";

export type BlsAppointmentTextFields = Partial<Record<BlsAppointmentTextKey, string>>;
export type BlsApplicantTextFields = Partial<Record<BlsApplicantTextKey, string>> & {
  id?: string;
  label?: string;
};

export interface BlsTextQuestionnaireInput {
  appointment: BlsAppointmentTextFields;
  applicants: BlsApplicantTextFields[];
}

const blsAppointmentFields: Array<{
  key: BlsAppointmentTextKey;
  label: string;
  required: boolean;
  date?: boolean;
}> = [
  { key: "city", label: "Город подачи", required: true },
  { key: "visa_type", label: "Тип визы", required: true },
  { key: "visa_category", label: "Категория", required: true },
  { key: "schedule_date1", label: "Желаемая дата 1", required: false, date: true },
  { key: "schedule_date2", label: "Желаемая дата 2", required: false, date: true },
  { key: "schedule_date3", label: "Желаемая дата 3", required: false, date: true },
  { key: "note", label: "Примечание", required: false },
];

const blsApplicantFields: Array<{
  key: BlsApplicantTextKey;
  label: string;
  required: boolean;
  date?: boolean;
  email?: boolean;
  phone?: boolean;
  latin?: boolean;
  passport?: boolean;
}> = [
  {
    key: "first_name",
    label: "First Name (Given Name)",
    required: true,
    latin: true,
  },
  {
    key: "relation_to_primary",
    label: "Relation to primary applicant",
    required: false,
  },
  {
    key: "last_name",
    label: "Surname (Family Name)",
    required: true,
    latin: true,
  },
  { key: "maiden_name", label: "Maiden Name", required: true, latin: true },
  {
    key: "surname_at_birth",
    label: "Surname At Birth",
    required: true,
    latin: true,
  },
  { key: "birth_date", label: "Date of Birth", required: true, date: true },
  { key: "birth_place", label: "Place of Birth", required: true, latin: true },
  { key: "birth_country", label: "Country of Birth", required: true },
  { key: "current_nationality", label: "Current Nationality", required: true },
  { key: "gender", label: "Gender", required: true },
  { key: "marital_status", label: "Marital Status", required: true },
  { key: "passport_type", label: "Passport Type", required: true },
  {
    key: "passport_number",
    label: "Passport No",
    required: true,
    passport: true,
  },
  {
    key: "passport_issued_at",
    label: "Passport Issue Date",
    required: true,
    date: true,
  },
  {
    key: "passport_expires_at",
    label: "Passport Expiry Date",
    required: true,
    date: true,
  },
  { key: "travel_date", label: "Travel Date", required: true, date: true },
  { key: "address_line1", label: "Home Address Line 1", required: true },
  { key: "country", label: "Country", required: true },
  { key: "addr_city", label: "City", required: true },
  { key: "postal_code", label: "Postal Code", required: true },
  { key: "phone", label: "Contact Number", required: true, phone: true },
  { key: "email", label: "Email", required: true, email: true },
  { key: "employer_name", label: "Employer Name", required: true },
  { key: "occupation", label: "Occupation", required: true },
  { key: "occupation_other", label: "Occupation (specify)", required: false },
  { key: "work_phone", label: "Employer Contact Number", required: true, phone: true },
  { key: "work_address", label: "Employer Address", required: true },
  { key: "trip_purpose", label: "Purpose of Journey", required: true },
  { key: "stay_duration", label: "Stay Duration in Days", required: true },
  { key: "entries_number", label: "Number of Entries", required: true },
  {
    key: "arrival_date",
    label: "Intended Date of Arrival",
    required: true,
    date: true,
  },
  {
    key: "departure_date",
    label: "Intended Date of Departure",
    required: true,
    date: true,
  },
  { key: "host_type", label: "Inviting Party Type", required: true },
  { key: "host_name", label: "Name", required: true },
  { key: "host_country", label: "Country", required: true },
  { key: "host_city", label: "City", required: true },
  { key: "host_postal", label: "Postal Code", required: true },
  { key: "host_address", label: "Address", required: true },
  { key: "host_email", label: "Email", required: true, email: true },
  { key: "host_phone", label: "Contact Number", required: true, phone: true },
  { key: "cost_covered_by", label: "Cost Covered By", required: true },
  { key: "means_of_support", label: "Means of Support", required: true },
];

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizedText(value: unknown): string {
  return cleanText(value).replace(/\s+/g, " ").toLowerCase();
}

function normalizePassport(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function normalizeContact(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

function phoneDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function normalizedComparableText(value: unknown): string {
  return normalizedText(value).replace(/[^a-zа-яё0-9]+/gi, "");
}

function containsCyrillic(value: string): boolean {
  return /[А-Яа-яЁё]/.test(value);
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date.getTime());
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function daysBetween(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

function yearsBetween(start: Date, end: Date): number {
  return daysBetween(start, end) / 365.25;
}

function ageAt(birthDate: Date, targetDate: Date): number {
  let age = targetDate.getUTCFullYear() - birthDate.getUTCFullYear();
  const beforeBirthday =
    targetDate.getUTCMonth() < birthDate.getUTCMonth() ||
    (targetDate.getUTCMonth() === birthDate.getUTCMonth() &&
      targetDate.getUTCDate() < birthDate.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

function canonicalSubmissionCity(value: string | undefined): string | null {
  const normalized = normalizedComparableText(value);
  if (!normalized) return null;

  const aliases: Record<string, string> = {
    moscow: "moscow",
    москва: "moscow",
    spb: "saint-petersburg",
    saintpetersburg: "saint-petersburg",
    stpetersburg: "saint-petersburg",
    санктпетербург: "saint-petersburg",
    петербург: "saint-petersburg",
    kazan: "kazan",
    казань: "kazan",
    ekaterinburg: "yekaterinburg",
    yekaterinburg: "yekaterinburg",
    екатеринбург: "yekaterinburg",
    novosibirsk: "novosibirsk",
    новосибирск: "novosibirsk",
    nizhniynovgorod: "nizhny-novgorod",
    нижнийновгород: "nizhny-novgorod",
    samara: "samara",
    самара: "samara",
    rostovondon: "rostov-on-don",
    ростовнадону: "rostov-on-don",
  };

  return aliases[normalized] ?? null;
}

function applicantIdentity(applicant: Applicant, index: number): string {
  return applicant.id ?? `applicant-${index + 1}`;
}

function fieldLabel(fieldKey: keyof Applicant): string {
  return fieldLabels.get(fieldKey) ?? String(fieldKey);
}

function isPlaceholder(value: string): boolean {
  return placeholderValues.has(normalizedText(value));
}

function parseIsoDate(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return null;
  const parsed = new Date(`${value.trim()}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10) === value.trim() ? parsed : null;
}

function parseDmyDate(value: string | undefined): Date | null {
  const match = value?.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const parsed = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10) === `${year}-${month}-${day}`
    ? parsed
    : null;
}

function extractIsoDates(value: string | undefined): Date[] {
  const matches = value?.match(/\d{4}-\d{2}-\d{2}/g) ?? [];
  return matches.flatMap((match) => {
    const parsed = parseIsoDate(match);
    return parsed ? [parsed] : [];
  });
}

function addFinding(
  findings: TextIntakeReviewFinding[],
  finding: Omit<TextIntakeReviewFinding, "id">,
): void {
  const applicantPart = finding.applicantId ?? "submission";
  const fieldPart = finding.fieldKey
    ? String(finding.fieldKey)
    : (finding.sourceField ?? finding.scope);
  findings.push({
    ...finding,
    id: `${applicantPart}:${fieldPart}:${finding.code}`,
  });
}

function addRequiredFieldFindings(
  submission: Submission,
  applicant: Applicant,
  applicantId: string,
  findings: TextIntakeReviewFinding[],
): void {
  for (const { key, label } of requiredApplicantFields) {
    const value = cleanText(applicant[key]);
    if (!value) {
      addFinding(findings, {
        code: "missing_required_text",
        severity: "blocking",
        scope: "field",
        applicantId,
        applicantName: applicant.name,
        fieldKey: key,
        fieldLabel: label,
        problem: `${label} is missing.`,
        reason:
          "The questionnaire cannot be sent for operator review with an empty required text field.",
        requiredAction: `Fill ${label} for ${applicant.name}.`,
      });
      continue;
    }

    if (isPlaceholder(value)) {
      addFinding(findings, {
        code: "placeholder_text",
        severity: "blocking",
        scope: "field",
        applicantId,
        applicantName: applicant.name,
        fieldKey: key,
        fieldLabel: label,
        problem: `${label} contains a placeholder value.`,
        reason:
          "Placeholder text looks filled but does not give the operator usable applicant data.",
        requiredAction: `Replace the placeholder in ${label} with real data for ${applicant.name}.`,
      });
    }
  }

  if (normalizedText(applicant.country) && normalizedText(submission.country)) {
    if (normalizedText(applicant.country) !== normalizedText(submission.country)) {
      addFinding(findings, {
        code: "submission_applicant_country_mismatch",
        severity: "warning",
        scope: "field",
        applicantId,
        applicantName: applicant.name,
        fieldKey: "country",
        fieldLabel: fieldLabel("country"),
        problem: "Applicant country does not match the case country.",
        reason: "Country mismatch can send the operator to the wrong submission route.",
        requiredAction: "Confirm the correct submission country before handoff.",
      });
    }
  }

  if (normalizedText(applicant.city) && normalizedText(submission.city)) {
    if (normalizedText(applicant.city) !== normalizedText(submission.city)) {
      addFinding(findings, {
        code: "submission_applicant_city_mismatch",
        severity: "warning",
        scope: "field",
        applicantId,
        applicantName: applicant.name,
        fieldKey: "city",
        fieldLabel: fieldLabel("city"),
        problem: "Applicant city does not match the case city.",
        reason: "City mismatch can create appointment or consulate routing mistakes.",
        requiredAction: "Confirm the correct submission city before handoff.",
      });
    }
  }
}

function addFormatAndDateFindings(
  submission: Submission,
  applicant: Applicant,
  applicantId: string,
  findings: TextIntakeReviewFinding[],
): void {
  const nameParts = cleanText(applicant.name).split(/\s+/).filter(Boolean);
  if (nameParts.length < 2) {
    addFinding(findings, {
      code: "name_too_short",
      severity: "warning",
      scope: "field",
      applicantId,
      applicantName: applicant.name,
      fieldKey: "name",
      fieldLabel: fieldLabel("name"),
      problem: "Applicant name looks incomplete.",
      reason: "A one-word name is hard for the operator to compare with passport data.",
      requiredAction:
        "Confirm the full applicant name exactly as it appears in the passport.",
    });
  }

  const email = cleanText(applicant.email);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    addFinding(findings, {
      code: "invalid_email",
      severity: "blocking",
      scope: "field",
      applicantId,
      applicantName: applicant.name,
      fieldKey: "email",
      fieldLabel: fieldLabel("email"),
      problem: "Email format is invalid.",
      reason:
        "The operator cannot reliably contact or match the applicant with an invalid email.",
      requiredAction:
        "Enter a valid email address or confirm the correct contact channel.",
    });
  }

  const phone = cleanText(applicant.phone);
  if (phone && phoneDigits(phone).length < 10) {
    addFinding(findings, {
      code: "weak_phone",
      severity: "blocking",
      scope: "field",
      applicantId,
      applicantName: applicant.name,
      fieldKey: "phone",
      fieldLabel: fieldLabel("phone"),
      problem: "Phone number has too few digits.",
      reason: "Short phone values usually indicate an incomplete contact field.",
      requiredAction: "Enter the full phone number with country or city code.",
    });
  }

  const birthDate = parseIsoDate(applicant.birthDate);
  const today = new Date();
  if (applicant.birthDate && !birthDate) {
    addFinding(findings, {
      code: "invalid_birth_date",
      severity: "blocking",
      scope: "field",
      applicantId,
      applicantName: applicant.name,
      fieldKey: "birthDate",
      fieldLabel: fieldLabel("birthDate"),
      problem: "Birth date is not a valid ISO date.",
      reason: "Date fields must be machine-checkable before the case is reviewed.",
      requiredAction: "Use YYYY-MM-DD format for birth date.",
    });
  } else if (birthDate && birthDate > today) {
    addFinding(findings, {
      code: "invalid_birth_date",
      severity: "blocking",
      scope: "field",
      applicantId,
      applicantName: applicant.name,
      fieldKey: "birthDate",
      fieldLabel: fieldLabel("birthDate"),
      problem: "Birth date is in the future.",
      reason: "Future birth dates indicate a data-entry error.",
      requiredAction: "Correct the birth date before handoff.",
    });
  }

  const passportIssued = parseIsoDate(applicant.passportIssuedAt);
  const passportExpires = parseIsoDate(applicant.passportExpiresAt);
  if (passportIssued && passportExpires && passportIssued > passportExpires) {
    addFinding(findings, {
      code: "passport_issued_after_expiry",
      severity: "blocking",
      scope: "field",
      applicantId,
      applicantName: applicant.name,
      fieldKey: "passportIssuedAt",
      fieldLabel: fieldLabel("passportIssuedAt"),
      problem: "Passport issue date is after the passport expiry date.",
      reason: "The passport date range is internally inconsistent.",
      requiredAction: "Correct passport issue and expiry dates.",
    });
  }

  const travelDate = parseIsoDate(submission.travelDate);
  if (passportExpires && travelDate && passportExpires < travelDate) {
    addFinding(findings, {
      code: "passport_expired_before_travel",
      severity: "blocking",
      scope: "field",
      applicantId,
      applicantName: applicant.name,
      fieldKey: "passportExpiresAt",
      fieldLabel: fieldLabel("passportExpiresAt"),
      problem: "Passport expires before the case travel date.",
      reason: "Expired passport dates can block operator handoff or trigger a return.",
      requiredAction: "Confirm passport validity or update the travel/passport dates.",
    });
  }

  const tripDates = extractIsoDates(applicant.tripDates);
  if (cleanText(applicant.tripDates) && tripDates.length === 0) {
    addFinding(findings, {
      code: "trip_dates_not_machine_readable",
      severity: "warning",
      scope: "field",
      applicantId,
      applicantName: applicant.name,
      fieldKey: "tripDates",
      fieldLabel: fieldLabel("tripDates"),
      problem: "Trip dates are not machine-readable.",
      reason:
        "The reviewer can only compare travel dates when at least one YYYY-MM-DD date is present.",
      requiredAction:
        "Enter trip dates with ISO dates, for example 2026-08-20 - 2026-08-30.",
    });
  } else if (travelDate && tripDates.length >= 2) {
    const [start, end] = [...tripDates].sort((a, b) => a.getTime() - b.getTime());
    if (travelDate < start || travelDate > end) {
      addFinding(findings, {
        code: "travel_date_outside_trip_dates",
        severity: "blocking",
        scope: "field",
        applicantId,
        applicantName: applicant.name,
        fieldKey: "tripDates",
        fieldLabel: fieldLabel("tripDates"),
        problem: "Case travel date is outside the applicant trip date range.",
        reason: "The case-level travel date and applicant trip dates disagree.",
        requiredAction:
          "Align the case travel date and applicant trip dates before review.",
      });
    }
  }
}

function addCrossApplicantFindings(
  submission: Submission,
  findings: TextIntakeReviewFinding[],
): void {
  const passportOwners = new Map<string, Applicant[]>();
  const emailOwners = new Map<string, Applicant[]>();
  const phoneOwners = new Map<string, Applicant[]>();

  for (const applicant of submission.applicants) {
    const passport = normalizePassport(applicant.passport);
    if (passport) {
      passportOwners.set(passport, [
        ...(passportOwners.get(passport) ?? []),
        applicant,
      ]);
    }

    const email = normalizeContact(cleanText(applicant.email));
    if (email) {
      emailOwners.set(email, [...(emailOwners.get(email) ?? []), applicant]);
    }

    const phone = phoneDigits(cleanText(applicant.phone));
    if (phone) {
      phoneOwners.set(phone, [...(phoneOwners.get(phone) ?? []), applicant]);
    }
  }

  for (const owners of passportOwners.values()) {
    if (owners.length < 2) continue;
    const names = owners.map((owner) => owner.name).join(", ");
    addFinding(findings, {
      code: "duplicate_passport",
      severity: "blocking",
      scope: "submission",
      problem: "Two or more applicants use the same passport number.",
      reason: "Duplicate passport numbers usually indicate copied applicant data.",
      requiredAction: `Check passport numbers for: ${names}.`,
    });
  }

  for (const [fieldKey, ownerGroups] of [
    ["email", emailOwners.values()],
    ["phone", phoneOwners.values()],
  ] as const) {
    for (const owners of ownerGroups) {
      if (owners.length < 2) continue;
      const names = owners.map((owner) => owner.name).join(", ");
      addFinding(findings, {
        code: "shared_contact_requires_review",
        severity: submission.type === "family" ? "warning" : "blocking",
        scope: "field",
        fieldKey,
        fieldLabel: fieldLabel(fieldKey),
        problem: "Multiple applicants share the same contact value.",
        reason:
          submission.type === "family"
            ? "Shared family contacts can be valid, but the agent should confirm they are intentional."
            : "Shared contacts in a single-applicant or unrelated case can indicate copied data.",
        requiredAction: `Confirm shared contact data for: ${names}.`,
      });
    }
  }

  if (submission.type === "family") {
    for (const applicant of submission.applicants) {
      if (applicant.suggestedRole && !applicant.roleConfirmed) {
        addFinding(findings, {
          code: "family_role_unconfirmed",
          severity: "warning",
          scope: "applicant",
          applicantId: applicant.id,
          applicantName: applicant.name,
          fieldKey: "role",
          fieldLabel: "Роль",
          problem: "Family role suggestion is not confirmed.",
          reason: "AI family analysis is advisory and must be confirmed manually.",
          requiredAction: `Confirm or dismiss the suggested role for ${applicant.name}.`,
        });
      }
    }
  }
}

function blsApplicantIdentity(
  applicant: BlsApplicantTextFields,
  index: number,
): string {
  return applicant.id ?? `applicant-${index + 1}`;
}

function blsApplicantName(applicant: BlsApplicantTextFields, index: number): string {
  const name = [applicant.first_name, applicant.last_name]
    .map(cleanText)
    .filter(Boolean)
    .join(" ");
  return cleanText(applicant.label) || name || `Applicant #${index + 1}`;
}

function addBlsFieldFinding(
  findings: TextIntakeReviewFinding[],
  finding: Omit<TextIntakeReviewFinding, "id" | "scope"> & {
    sourceField: string;
    scope?: TextIntakeReviewFinding["scope"];
  },
): void {
  addFinding(findings, {
    ...finding,
    scope: finding.scope ?? "field",
  });
}

function addBlsAppointmentFindings(
  appointment: BlsAppointmentTextFields,
  findings: TextIntakeReviewFinding[],
): void {
  for (const field of blsAppointmentFields) {
    const value = cleanText(appointment[field.key]);
    if (field.required && (!value || isPlaceholder(value))) {
      addBlsFieldFinding(findings, {
        code: value ? "placeholder_text" : "missing_required_text",
        severity: "blocking",
        sourceField: field.key,
        fieldLabel: field.label,
        problem: `${field.label} is missing or not selected.`,
        reason:
          "The appointment block must be complete before the questionnaire is reliable.",
        requiredAction: `Fill ${field.label}.`,
      });
    }

    if (field.date && value && !parseDmyDate(value)) {
      addBlsFieldFinding(findings, {
        code: "invalid_date_format",
        severity: "warning",
        sourceField: field.key,
        fieldLabel: field.label,
        problem: `${field.label} is not a valid DD.MM.YYYY date.`,
        reason: "The appointment date cannot be compared or exported reliably.",
        requiredAction: `Use DD.MM.YYYY format for ${field.label}.`,
      });
    }
  }
}

function addBlsApplicantRequiredFindings(
  applicant: BlsApplicantTextFields,
  applicantIndex: number,
  applicantId: string,
  applicantName: string,
  findings: TextIntakeReviewFinding[],
): void {
  for (const field of blsApplicantFields) {
    const value = cleanText(applicant[field.key]);
    if (field.required && (!value || isPlaceholder(value))) {
      addBlsFieldFinding(findings, {
        code: value ? "placeholder_text" : "missing_required_text",
        severity: "blocking",
        applicantId,
        applicantName,
        sourceField: field.key,
        fieldLabel: field.label,
        problem: `${field.label} is missing or not selected.`,
        reason: "This BLS questionnaire field is marked as required in the form.",
        requiredAction: `Fill ${field.label} for ${applicantName}.`,
      });
    }

    if (field.date && value && !parseDmyDate(value)) {
      addBlsFieldFinding(findings, {
        code: "invalid_date_format",
        severity: "blocking",
        applicantId,
        applicantName,
        sourceField: field.key,
        fieldLabel: field.label,
        problem: `${field.label} is not a valid DD.MM.YYYY date.`,
        reason:
          "BLS date fields in this form use DD.MM.YYYY and must be machine-checkable.",
        requiredAction: `Use DD.MM.YYYY format for ${field.label}.`,
      });
    }

    if (field.email && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      addBlsFieldFinding(findings, {
        code: "invalid_email",
        severity: "blocking",
        applicantId,
        applicantName,
        sourceField: field.key,
        fieldLabel: field.label,
        problem: `${field.label} format is invalid.`,
        reason: "The operator cannot reliably use an invalid email value.",
        requiredAction: `Correct ${field.label} for ${applicantName}.`,
      });
    }

    if (field.phone && value && phoneDigits(value).length < 10) {
      addBlsFieldFinding(findings, {
        code: "weak_phone",
        severity: "blocking",
        applicantId,
        applicantName,
        sourceField: field.key,
        fieldLabel: field.label,
        problem: `${field.label} has too few digits.`,
        reason: "Short phone values usually indicate incomplete contact data.",
        requiredAction: `Enter the full ${field.label.toLowerCase()} for ${applicantName}.`,
      });
    }

    if (field.passport && value && normalizePassport(value).length < 6) {
      addBlsFieldFinding(findings, {
        code: "weak_passport_number",
        severity: "blocking",
        applicantId,
        applicantName,
        sourceField: field.key,
        fieldLabel: field.label,
        problem: `${field.label} is too short to be a reliable passport number.`,
        reason: "Short passport values usually indicate a partial copy or typo.",
        requiredAction: `Check the full passport number for ${applicantName}.`,
      });
    }

    if (
      field.passport &&
      value &&
      normalizedText(applicant.current_nationality) === "russian federation" &&
      !/^\d{9}$/.test(normalizePassport(value))
    ) {
      addBlsFieldFinding(findings, {
        code: "passport_number_unexpected_format",
        severity: "warning",
        applicantId,
        applicantName,
        sourceField: field.key,
        fieldLabel: field.label,
        problem:
          "Passport No does not look like the usual 9-digit Russian international passport number.",
        reason:
          "Russian foreign passport numbers are commonly entered as a 2-digit series plus 7-digit number. Different formats can be valid, but this should be confirmed.",
        requiredAction: `Confirm Passport No from the foreign passport for ${applicantName}.`,
      });
    }

    if (field.latin && value && containsCyrillic(value)) {
      addBlsFieldFinding(findings, {
        code: "latin_text_expected",
        severity: "warning",
        applicantId,
        applicantName,
        sourceField: field.key,
        fieldLabel: field.label,
        problem: `${field.label} contains Cyrillic characters.`,
        reason:
          "BLS passport-name fields are usually entered in Latin characters from the passport.",
        requiredAction: `Confirm transliteration for ${field.label} on ${applicantName}.`,
      });
    }
  }

  if (normalizedText(applicant.occupation) === "other") {
    const occupationOther = cleanText(applicant.occupation_other);
    if (!occupationOther || isPlaceholder(occupationOther)) {
      addBlsFieldFinding(findings, {
        code: "missing_conditional_text",
        severity: "blocking",
        applicantId,
        applicantName,
        sourceField: "occupation_other",
        fieldLabel: "Occupation (specify)",
        problem: "Occupation is OTHER but the occupation detail is empty.",
        reason: "The operator needs the specific occupation when OTHER is selected.",
        requiredAction: `Specify occupation for ${applicantName}.`,
      });
    }
  }

  const address = cleanText(applicant.address_line1);
  if (address && (address.length < 8 || !/\d/.test(address))) {
    addBlsFieldFinding(findings, {
      code: "home_address_incomplete",
      severity: "warning",
      applicantId,
      applicantName,
      sourceField: "address_line1",
      fieldLabel: "Home Address Line 1",
      problem: "Home address looks too short or lacks a house/building number.",
      reason:
        "The home address should be specific enough for an operator to compare against residence/registration documents.",
      requiredAction: `Confirm street, house/building and apartment details for ${applicantName}.`,
    });
  }

  if (applicantIndex > 0) {
    const relation = cleanText(applicant.relation_to_primary);
    if (!relation || isPlaceholder(relation)) {
      addBlsFieldFinding(findings, {
        code: "missing_required_text",
        severity: "blocking",
        applicantId,
        applicantName,
        sourceField: "relation_to_primary",
        fieldLabel: "Relation to primary applicant",
        problem: "Relation to primary applicant is missing.",
        reason:
          "Family BLS questionnaires include this field for secondary applicants.",
        requiredAction: `Fill relation to primary applicant for ${applicantName}.`,
      });
    }
  }
}

function addBlsApplicantConsistencyFindings(
  appointment: BlsAppointmentTextFields,
  applicant: BlsApplicantTextFields,
  applicantId: string,
  applicantName: string,
  findings: TextIntakeReviewFinding[],
): void {
  const birthDate = parseDmyDate(applicant.birth_date);
  const today = new Date();
  if (birthDate && birthDate > today) {
    addBlsFieldFinding(findings, {
      code: "invalid_birth_date",
      severity: "blocking",
      applicantId,
      applicantName,
      sourceField: "birth_date",
      fieldLabel: "Date of Birth",
      problem: "Date of Birth is in the future.",
      reason: "Future birth dates indicate a data-entry error.",
      requiredAction: `Correct Date of Birth for ${applicantName}.`,
    });
  }

  const passportIssued = parseDmyDate(applicant.passport_issued_at);
  const passportExpires = parseDmyDate(applicant.passport_expires_at);
  const travelDate = parseDmyDate(applicant.travel_date);
  const arrivalDate = parseDmyDate(applicant.arrival_date);
  const departureDate = parseDmyDate(applicant.departure_date);

  if (passportIssued && passportExpires && passportIssued > passportExpires) {
    addBlsFieldFinding(findings, {
      code: "passport_issued_after_expiry",
      severity: "blocking",
      applicantId,
      applicantName,
      sourceField: "passport_issued_at",
      fieldLabel: "Passport Issue Date",
      problem: "Passport Issue Date is after Passport Expiry Date.",
      reason: "The passport date range is internally inconsistent.",
      requiredAction: `Correct passport dates for ${applicantName}.`,
    });
  }

  if (passportExpires && travelDate && passportExpires < travelDate) {
    addBlsFieldFinding(findings, {
      code: "passport_expired_before_travel",
      severity: "blocking",
      applicantId,
      applicantName,
      sourceField: "passport_expires_at",
      fieldLabel: "Passport Expiry Date",
      problem: "Passport expires before Travel Date.",
      reason: "The passport validity and travel date conflict.",
      requiredAction: `Confirm passport validity or travel date for ${applicantName}.`,
    });
  }

  if (passportExpires && departureDate) {
    const minimumExpiry = addMonths(departureDate, 3);
    if (passportExpires < minimumExpiry) {
      addBlsFieldFinding(findings, {
        code: "passport_validity_too_short_after_departure",
        severity: "blocking",
        applicantId,
        applicantName,
        sourceField: "passport_expires_at",
        fieldLabel: "Passport Expiry Date",
        problem:
          "Passport expires less than three months after the intended departure date.",
        reason:
          "Schengen passport preflight commonly requires validity beyond the planned exit date; this needs operator confirmation before handoff.",
        requiredAction: `Confirm passport validity window for ${applicantName}.`,
      });
    }
  }

  if (
    passportIssued &&
    passportExpires &&
    passportExpires > passportIssued &&
    yearsBetween(passportIssued, passportExpires) > 10.15
  ) {
    addBlsFieldFinding(findings, {
      code: "passport_validity_period_unexpected",
      severity: "warning",
      applicantId,
      applicantName,
      sourceField: "passport_expires_at",
      fieldLabel: "Passport Expiry Date",
      problem: "Passport validity period is longer than the usual 10-year maximum.",
      reason:
        "Russian foreign passports are commonly valid for 5 or 10 years; a longer period usually means a date typo.",
      requiredAction: `Check issue and expiry dates from the passport for ${applicantName}.`,
    });
  }

  if (arrivalDate && departureDate && arrivalDate > departureDate) {
    addBlsFieldFinding(findings, {
      code: "date_order_inconsistent",
      severity: "blocking",
      applicantId,
      applicantName,
      sourceField: "arrival_date",
      fieldLabel: "Intended Date of Arrival",
      problem: "Arrival date is after departure date.",
      reason: "Travel date order is impossible.",
      requiredAction: `Correct arrival and departure dates for ${applicantName}.`,
    });
  }

  if (travelDate && arrivalDate && departureDate) {
    if (travelDate < arrivalDate || travelDate > departureDate) {
      addBlsFieldFinding(findings, {
        code: "travel_date_outside_trip_dates",
        severity: "blocking",
        applicantId,
        applicantName,
        sourceField: "travel_date",
        fieldLabel: "Travel Date",
        problem: "Travel Date is outside the arrival/departure range.",
        reason: "The applicant travel date and trip interval disagree.",
        requiredAction: `Align Travel Date, Arrival Date and Departure Date for ${applicantName}.`,
      });
    }
  }

  const scheduleDates = [
    appointment.schedule_date1,
    appointment.schedule_date2,
    appointment.schedule_date3,
  ].flatMap((value) => {
    const parsed = parseDmyDate(value);
    return parsed ? [parsed] : [];
  });
  if (arrivalDate && scheduleDates.some((scheduleDate) => scheduleDate > arrivalDate)) {
    addBlsFieldFinding(findings, {
      code: "appointment_after_travel_date",
      severity: "warning",
      applicantId,
      applicantName,
      sourceField: "schedule_date1",
      fieldLabel: "Желаемая дата записи",
      problem: "One preferred appointment date is after the intended arrival date.",
      reason:
        "Appointment dates should normally be before travel; this may indicate shifted travel or appointment data.",
      requiredAction: `Confirm appointment preferences against travel dates for ${applicantName}.`,
    });
  }

  const durationText = cleanText(applicant.stay_duration);
  if (durationText && !/^\d+$/.test(durationText)) {
    addBlsFieldFinding(findings, {
      code: "non_numeric_duration",
      severity: "blocking",
      applicantId,
      applicantName,
      sourceField: "stay_duration",
      fieldLabel: "Stay Duration in Days",
      problem: "Stay Duration in Days is not numeric.",
      reason: "Duration must be a number before it can be compared with trip dates.",
      requiredAction: `Enter numeric stay duration for ${applicantName}.`,
    });
  } else if (arrivalDate && departureDate && durationText) {
    const duration = Number(durationText);
    const days = Math.round(
      (departureDate.getTime() - arrivalDate.getTime()) / 86_400_000,
    );
    if (Number.isFinite(duration) && Math.abs(duration - days) > 1) {
      addBlsFieldFinding(findings, {
        code: "duration_dates_mismatch",
        severity: "warning",
        applicantId,
        applicantName,
        sourceField: "stay_duration",
        fieldLabel: "Stay Duration in Days",
        problem: "Stay duration does not match arrival/departure dates.",
        reason:
          "This may be valid depending on counting rules, but it should be checked.",
        requiredAction: `Confirm stay duration against trip dates for ${applicantName}.`,
      });
    }
  }

  if (
    normalizedText(applicant.host_country) &&
    normalizedText(applicant.host_country) !== "spain"
  ) {
    addBlsFieldFinding(findings, {
      code: "host_country_unexpected",
      severity: "warning",
      applicantId,
      applicantName,
      sourceField: "host_country",
      fieldLabel: "Host Country",
      problem: "Host country is not Spain.",
      reason:
        "This may be intentional, but for a Spain BLS route it deserves manual confirmation.",
      requiredAction: `Confirm host country for ${applicantName}.`,
    });
  }

  if (normalizedText(applicant.host_country) === "spain") {
    const hostPostal = cleanText(applicant.host_postal);
    if (hostPostal && !/^\d{5}$/.test(hostPostal)) {
      addBlsFieldFinding(findings, {
        code: "spanish_host_postal_invalid",
        severity: "warning",
        applicantId,
        applicantName,
        sourceField: "host_postal",
        fieldLabel: "Host Postal Code",
        problem: "Spanish host postal code does not look like 5 digits.",
        reason:
          "Spanish accommodation postal codes are normally 5 digits; a different value should be checked.",
        requiredAction: `Confirm host postal code for ${applicantName}.`,
      });
    }

    const hostPhone = phoneDigits(cleanText(applicant.host_phone));
    const looksSpanishPhone =
      hostPhone.length === 9 || (hostPhone.startsWith("34") && hostPhone.length === 11);
    if (hostPhone && !looksSpanishPhone) {
      addBlsFieldFinding(findings, {
        code: "spanish_host_phone_unexpected",
        severity: "warning",
        applicantId,
        applicantName,
        sourceField: "host_phone",
        fieldLabel: "Host Contact Number",
        problem:
          "Spanish host phone does not look like a local 9-digit number or +34 number.",
        reason:
          "Accommodation contact numbers can vary, but this value should be easy for an operator to verify.",
        requiredAction: `Confirm host phone number for ${applicantName}.`,
      });
    }
  }

  const submissionCity = canonicalSubmissionCity(appointment.city);
  const residenceCity = canonicalSubmissionCity(applicant.addr_city);
  if (submissionCity && residenceCity && submissionCity !== residenceCity) {
    addBlsFieldFinding(findings, {
      code: "residence_submission_city_mismatch",
      severity: "warning",
      applicantId,
      applicantName,
      sourceField: "addr_city",
      fieldLabel: "City",
      problem: "Residence city differs from the selected submission city.",
      reason:
        "This can be valid, but the agent should confirm residence/registration and the chosen BLS center before handoff.",
      requiredAction: `Confirm residence/registration route for ${applicantName}.`,
    });
  }

  const occupation = normalizedComparableText(applicant.occupation);
  if (occupation === "minor" && birthDate && (arrivalDate || travelDate)) {
    const referenceDate = arrivalDate ?? travelDate;
    if (referenceDate && ageAt(birthDate, referenceDate) >= 18) {
      addBlsFieldFinding(findings, {
        code: "minor_occupation_age_mismatch",
        severity: "warning",
        applicantId,
        applicantName,
        sourceField: "occupation",
        fieldLabel: "Occupation",
        problem: "Occupation is MINOR but applicant is 18 or older at travel date.",
        reason:
          "Age and occupation status may have been copied from another applicant.",
        requiredAction: `Confirm occupation status for ${applicantName}.`,
      });
    }
  }

  const applicantPhone = phoneDigits(cleanText(applicant.phone));
  const workPhone = phoneDigits(cleanText(applicant.work_phone));
  if (applicantPhone && workPhone && applicantPhone === workPhone) {
    addBlsFieldFinding(findings, {
      code: "employer_contact_matches_applicant",
      severity: "warning",
      applicantId,
      applicantName,
      sourceField: "work_phone",
      fieldLabel: "Employer Contact Number",
      problem: "Employer contact number matches applicant contact number.",
      reason:
        "This can be valid for self-employed applicants, but often indicates copied contact data.",
      requiredAction: `Confirm employer contact number for ${applicantName}.`,
    });
  }

  if (
    occupation !== "selfemployed" &&
    normalizedComparableText(applicant.address_line1) &&
    normalizedComparableText(applicant.address_line1) ===
      normalizedComparableText(applicant.work_address)
  ) {
    addBlsFieldFinding(findings, {
      code: "employer_address_matches_home",
      severity: "warning",
      applicantId,
      applicantName,
      sourceField: "work_address",
      fieldLabel: "Employer Address",
      problem: "Employer address matches home address.",
      reason:
        "This may be valid, but for non self-employed applicants it often means the work address was copied from residence data.",
      requiredAction: `Confirm employer address for ${applicantName}.`,
    });
  }
}

function addBlsCrossApplicantFindings(
  applicants: BlsApplicantTextFields[],
  findings: TextIntakeReviewFinding[],
): void {
  const passportOwners = new Map<string, string[]>();
  const emailOwners = new Map<string, string[]>();
  const phoneOwners = new Map<string, string[]>();
  const tripOwners = new Map<string, string[]>();

  applicants.forEach((applicant, index) => {
    const name = blsApplicantName(applicant, index);
    const passport = normalizePassport(cleanText(applicant.passport_number));
    const email = normalizeContact(cleanText(applicant.email));
    const phone = phoneDigits(cleanText(applicant.phone));
    const arrivalDate = parseDmyDate(applicant.arrival_date);
    const departureDate = parseDmyDate(applicant.departure_date);

    if (passport)
      passportOwners.set(passport, [...(passportOwners.get(passport) ?? []), name]);
    if (email) emailOwners.set(email, [...(emailOwners.get(email) ?? []), name]);
    if (phone) phoneOwners.set(phone, [...(phoneOwners.get(phone) ?? []), name]);
    if (arrivalDate && departureDate) {
      const signature = `${arrivalDate.toISOString().slice(0, 10)}:${departureDate
        .toISOString()
        .slice(0, 10)}`;
      tripOwners.set(signature, [...(tripOwners.get(signature) ?? []), name]);
    }
  });

  for (const names of passportOwners.values()) {
    if (names.length < 2) continue;
    addBlsFieldFinding(findings, {
      code: "duplicate_passport",
      severity: "blocking",
      scope: "submission",
      sourceField: "passport_number",
      fieldLabel: "Passport No",
      problem: "Two or more BLS applicants use the same passport number.",
      reason: "Duplicate passport numbers usually indicate copied applicant data.",
      requiredAction: `Check passport numbers for: ${names.join(", ")}.`,
    });
  }

  for (const [sourceField, groups] of [
    ["email", emailOwners.values()],
    ["phone", phoneOwners.values()],
  ] as const) {
    for (const names of groups) {
      if (names.length < 2) continue;
      addBlsFieldFinding(findings, {
        code: "shared_contact_requires_review",
        severity: "warning",
        scope: "submission",
        sourceField,
        fieldLabel: sourceField === "email" ? "Email" : "Contact Number",
        problem: "Multiple BLS applicants share the same contact value.",
        reason: "Shared contacts can be valid for families, but should be intentional.",
        requiredAction: `Confirm shared contact data for: ${names.join(", ")}.`,
      });
    }
  }

  if (applicants.length > 1 && tripOwners.size > 1) {
    const groups = Array.from(tripOwners.values())
      .map((names) => names.join(", "))
      .join(" / ");
    addBlsFieldFinding(findings, {
      code: "family_trip_mismatch",
      severity: "warning",
      scope: "submission",
      sourceField: "arrival_date",
      fieldLabel: "Travel dates",
      problem: "Family applicants have different arrival/departure date ranges.",
      reason:
        "Family members can travel separately, but copied or shifted dates are a common intake error.",
      requiredAction: `Confirm family travel dates for: ${groups}.`,
    });
  }
}

function calculateBlsReadiness(input: BlsTextQuestionnaireInput): number {
  const appointmentRequired = blsAppointmentFields.filter((field) => field.required);
  const applicantRequired = blsApplicantFields.filter((field) => field.required);
  const total =
    appointmentRequired.length +
    input.applicants.length * applicantRequired.length +
    Math.max(0, input.applicants.length - 1);
  if (total === 0) return 0;

  let filled = appointmentRequired.filter((field) => {
    const value = cleanText(input.appointment[field.key]);
    return value && !isPlaceholder(value);
  }).length;

  for (const applicant of input.applicants) {
    filled += applicantRequired.filter((field) => {
      const value = cleanText(applicant[field.key]);
      return value && !isPlaceholder(value);
    }).length;
  }
  for (const applicant of input.applicants.slice(1)) {
    const relation = cleanText(applicant.relation_to_primary);
    if (relation && !isPlaceholder(relation)) filled += 1;
  }

  return Math.round((filled / total) * 100);
}

function reviewedBlsFieldCount(input: BlsTextQuestionnaireInput): number {
  return (
    blsAppointmentFields.length +
    input.applicants.reduce(
      (total, _applicant, index) =>
        total + blsApplicantFields.length - (index === 0 ? 1 : 0),
      0,
    )
  );
}

export function reviewBlsTextQuestionnaire(
  input: BlsTextQuestionnaireInput,
): TextIntakeReviewResult {
  const findings: TextIntakeReviewFinding[] = [];
  addBlsAppointmentFindings(input.appointment, findings);

  input.applicants.forEach((applicant, index) => {
    const applicantId = blsApplicantIdentity(applicant, index);
    const applicantName = blsApplicantName(applicant, index);
    addBlsApplicantRequiredFindings(
      applicant,
      index,
      applicantId,
      applicantName,
      findings,
    );
    addBlsApplicantConsistencyFindings(
      input.appointment,
      applicant,
      applicantId,
      applicantName,
      findings,
    );
  });
  addBlsCrossApplicantFindings(input.applicants, findings);

  const uniqueFindings = Array.from(
    new Map(findings.map((finding) => [finding.id, finding])).values(),
  );

  return {
    status: reviewStatus(uniqueFindings),
    readiness: calculateBlsReadiness(input),
    reviewedApplicants: input.applicants.length,
    reviewedFields: reviewedBlsFieldCount(input),
    findings: uniqueFindings,
    correctionCandidates: uniqueFindings.map(toCorrectionCandidate),
    guardrails: textReviewGuardrails,
  };
}

function toCorrectionCandidate(finding: TextIntakeReviewFinding): CorrectionNote {
  return {
    id: `text-review:${finding.id}`,
    target: finding.fieldLabel
      ? `${finding.applicantName ?? "Case"} · ${finding.fieldLabel}`
      : (finding.applicantName ?? "Case questionnaire"),
    text: `${finding.problem} ${finding.requiredAction}`,
    scope: finding.scope,
    applicantId: finding.applicantId,
    fieldKey: finding.fieldKey,
    severity: finding.severity === "blocking" ? "blocking" : "note",
    status: "open",
  };
}

function reviewStatus(
  findings: TextIntakeReviewFinding[],
): TextIntakeReviewResult["status"] {
  if (findings.some((finding) => finding.severity === "blocking")) {
    return "needs_correction";
  }
  if (findings.length) return "needs_review";
  return "clear";
}

export function reviewTextIntake(submission: Submission): TextIntakeReviewResult {
  const normalized = normalizeSubmission(submission);
  const findings: TextIntakeReviewFinding[] = [];

  normalized.applicants.forEach((applicant, index) => {
    const applicantId = applicantIdentity(applicant, index);
    addRequiredFieldFindings(normalized, applicant, applicantId, findings);
    addFormatAndDateFindings(normalized, applicant, applicantId, findings);
  });
  addCrossApplicantFindings(normalized, findings);

  const uniqueFindings = Array.from(
    new Map(findings.map((finding) => [finding.id, finding])).values(),
  );

  return {
    status: reviewStatus(uniqueFindings),
    readiness: readiness(normalized),
    reviewedApplicants: normalized.applicants.length,
    reviewedFields: normalized.applicants.length * requiredApplicantFields.length,
    findings: uniqueFindings,
    correctionCandidates: uniqueFindings.map(toCorrectionCandidate),
    guardrails: textReviewGuardrails,
  };
}

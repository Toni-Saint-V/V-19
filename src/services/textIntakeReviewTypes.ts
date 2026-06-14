import type { Applicant, CorrectionNote } from "../types/domain";

export type TextIntakeReviewSeverity = "blocking" | "warning" | "info";

export const textIntakeReviewCodes = [
  "missing_required_text",
  "missing_conditional_text",
  "placeholder_text",
  "invalid_email",
  "weak_phone",
  "invalid_date_format",
  "invalid_birth_date",
  "birth_date_in_future",
  "passport_expired_before_travel",
  "passport_issued_after_expiry",
  "date_order_inconsistent",
  "duration_dates_mismatch",
  "non_numeric_duration",
  "weak_passport_number",
  "passport_number_unexpected_format",
  "passport_validity_too_short_after_departure",
  "passport_validity_period_unexpected",
  "latin_text_expected",
  "family_trip_mismatch",
  "residence_submission_city_mismatch",
  "home_address_incomplete",
  "host_country_unexpected",
  "spanish_host_postal_invalid",
  "spanish_host_phone_unexpected",
  "appointment_after_travel_date",
  "minor_occupation_age_mismatch",
  "employer_contact_matches_applicant",
  "employer_address_matches_home",
  "submission_applicant_country_mismatch",
  "submission_applicant_city_mismatch",
  "trip_dates_not_machine_readable",
  "travel_date_outside_trip_dates",
  "duplicate_passport",
  "shared_contact_requires_review",
  "name_too_short",
  "family_role_unconfirmed",
] as const;

export type TextIntakeReviewCode = (typeof textIntakeReviewCodes)[number];

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
  relatedApplicantNames?: string[];
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

export interface BlsAppointmentFieldSpec {
  key: BlsAppointmentTextKey;
  label: string;
  required: boolean;
  date?: boolean;
}

export interface BlsApplicantFieldSpec {
  key: BlsApplicantTextKey;
  label: string;
  required: boolean;
  date?: boolean;
  email?: boolean;
  phone?: boolean;
  latin?: boolean;
  passport?: boolean;
}

import type {
  BlsApplicantTextFields,
  BlsTextQuestionnaireInput,
  TextIntakeReviewCode,
} from "./textIntakeReviewer";

export type TextIntakeTrainingCategory =
  | "required-fields"
  | "format"
  | "dates"
  | "passport"
  | "family"
  | "host"
  | "residence"
  | "work"
  | "conditional";

export interface BlsTextReviewTrainingCase {
  id: string;
  title: string;
  category: TextIntakeTrainingCategory;
  input: BlsTextQuestionnaireInput;
  expectedFindingCodes: TextIntakeReviewCode[];
}

const baseAppointment: BlsTextQuestionnaireInput["appointment"] = {
  city: "Moscow",
  visa_type: "Schengen",
  visa_category: "Normal",
  schedule_date1: "20.08.2026",
  schedule_date2: "",
  schedule_date3: "",
  note: "",
};

const baseApplicant: BlsApplicantTextFields = {
  id: "synthetic-primary",
  label: "Synthetic Applicant",
  first_name: "ARTEM",
  last_name: "SOKOLOV",
  maiden_name: "SOKOLOV",
  surname_at_birth: "SOKOLOV",
  birth_date: "12.05.1988",
  birth_place: "MOSCOW",
  birth_country: "Russian Federation",
  current_nationality: "Russian Federation",
  gender: "Male",
  marital_status: "Married",
  passport_type: "Ordinary Passport",
  passport_number: "721190482",
  passport_issued_at: "10.01.2020",
  passport_expires_at: "10.01.2030",
  travel_date: "20.08.2026",
  address_line1: "Moscow, Test Street 1",
  country: "Russian Federation",
  addr_city: "Moscow",
  postal_code: "101000",
  phone: "+79990000000",
  email: "synthetic.applicant@example.test",
  employer_name: "Synthetic Company",
  occupation: "ENGINEER",
  occupation_other: "",
  work_phone: "+79990000001",
  work_address: "Moscow, Office 1",
  trip_purpose: "TOURISM",
  stay_duration: "10",
  entries_number: "Single Entry",
  arrival_date: "20.08.2026",
  departure_date: "30.08.2026",
  host_type: "Hotel",
  host_name: "Synthetic Hotel",
  host_country: "Spain",
  host_city: "Madrid",
  host_postal: "28013",
  host_address: "Gran Via 1",
  host_email: "hotel@example.test",
  host_phone: "+34911234567",
  cost_covered_by: "By the applicant",
  means_of_support: "Credit card",
};

function applicant(
  overrides: Partial<BlsApplicantTextFields> = {},
): BlsApplicantTextFields {
  return { ...baseApplicant, ...overrides };
}

function questionnaire(
  applicantOverrides: Partial<BlsApplicantTextFields>,
  appointmentOverrides: Partial<BlsTextQuestionnaireInput["appointment"]> = {},
): BlsTextQuestionnaireInput {
  return {
    appointment: { ...baseAppointment, ...appointmentOverrides },
    applicants: [applicant(applicantOverrides)],
  };
}

export function buildBlsTextReviewPositiveExample(): BlsTextQuestionnaireInput {
  return {
    appointment: { ...baseAppointment },
    applicants: [applicant()],
  };
}

export function buildBlsTextReviewTrainingCorpus(): BlsTextReviewTrainingCase[] {
  return [
    {
      id: "missing-appointment-city",
      title: "Appointment city left empty",
      category: "required-fields",
      input: questionnaire({}, { city: "" }),
      expectedFindingCodes: ["missing_required_text"],
    },
    {
      id: "appointment-placeholder",
      title: "Appointment city still on placeholder",
      category: "required-fields",
      input: questionnaire({}, { city: "—" }),
      expectedFindingCodes: ["placeholder_text"],
    },
    {
      id: "missing-primary-name",
      title: "Primary first name missing",
      category: "required-fields",
      input: questionnaire({ first_name: "" }),
      expectedFindingCodes: ["missing_required_text"],
    },
    {
      id: "placeholder-surname",
      title: "Surname contains a fake placeholder",
      category: "required-fields",
      input: questionnaire({ last_name: "test" }),
      expectedFindingCodes: ["placeholder_text"],
    },
    {
      id: "cyrillic-passport-name",
      title: "Passport name entered in Cyrillic",
      category: "format",
      input: questionnaire({ first_name: "АРТЕМ" }),
      expectedFindingCodes: ["latin_text_expected"],
    },
    {
      id: "invalid-contact-values",
      title: "Email and phone are malformed",
      category: "format",
      input: questionnaire({ email: "not-email", phone: "12345" }),
      expectedFindingCodes: ["invalid_email", "weak_phone"],
    },
    {
      id: "invalid-date-format",
      title: "Date field uses ISO instead of BLS DD.MM.YYYY",
      category: "dates",
      input: questionnaire({ birth_date: "1988-05-12" }),
      expectedFindingCodes: ["invalid_date_format"],
    },
    {
      id: "future-birth-date",
      title: "Birth date is in the future",
      category: "dates",
      input: questionnaire({ birth_date: "01.01.2099" }),
      expectedFindingCodes: ["birth_date_in_future"],
    },
    {
      id: "passport-date-range-impossible",
      title: "Passport issue date is after expiry",
      category: "passport",
      input: questionnaire({
        passport_issued_at: "10.01.2031",
        passport_expires_at: "10.01.2030",
      }),
      expectedFindingCodes: ["passport_issued_after_expiry"],
    },
    {
      id: "passport-expired-before-trip",
      title: "Passport expires before travel date",
      category: "passport",
      input: questionnaire({
        passport_expires_at: "19.08.2026",
        travel_date: "20.08.2026",
      }),
      expectedFindingCodes: ["passport_expired_before_travel"],
    },
    {
      id: "weak-passport-number",
      title: "Passport number is too short",
      category: "passport",
      input: questionnaire({ passport_number: "123" }),
      expectedFindingCodes: ["weak_passport_number"],
    },
    {
      id: "russian-passport-format-unexpected",
      title: "Russian passport number is not the usual 9-digit format",
      category: "passport",
      input: questionnaire({ passport_number: "AB123456" }),
      expectedFindingCodes: ["passport_number_unexpected_format"],
    },
    {
      id: "passport-validity-too-short-after-departure",
      title: "Passport expires too soon after departure",
      category: "passport",
      input: questionnaire({
        passport_expires_at: "15.10.2026",
        departure_date: "30.08.2026",
      }),
      expectedFindingCodes: ["passport_validity_too_short_after_departure"],
    },
    {
      id: "passport-validity-period-unexpected",
      title: "Passport issue and expiry dates imply more than 10 years validity",
      category: "passport",
      input: questionnaire({
        passport_issued_at: "10.01.2020",
        passport_expires_at: "10.07.2031",
      }),
      expectedFindingCodes: ["passport_validity_period_unexpected"],
    },
    {
      id: "arrival-after-departure",
      title: "Arrival date is after departure date",
      category: "dates",
      input: questionnaire({
        arrival_date: "30.08.2026",
        departure_date: "20.08.2026",
      }),
      expectedFindingCodes: ["date_order_inconsistent"],
    },
    {
      id: "travel-date-outside-range",
      title: "Travel date falls outside arrival/departure range",
      category: "dates",
      input: questionnaire({
        travel_date: "19.08.2026",
        arrival_date: "20.08.2026",
        departure_date: "30.08.2026",
      }),
      expectedFindingCodes: ["travel_date_outside_trip_dates"],
    },
    {
      id: "duration-not-numeric",
      title: "Stay duration is written as text",
      category: "dates",
      input: questionnaire({ stay_duration: "ten" }),
      expectedFindingCodes: ["non_numeric_duration"],
    },
    {
      id: "duration-date-mismatch",
      title: "Stay duration conflicts with dates",
      category: "dates",
      input: questionnaire({ stay_duration: "2" }),
      expectedFindingCodes: ["duration_dates_mismatch"],
    },
    {
      id: "other-occupation-without-detail",
      title: "Occupation OTHER lacks detail",
      category: "conditional",
      input: questionnaire({ occupation: "OTHER", occupation_other: "" }),
      expectedFindingCodes: ["missing_conditional_text"],
    },
    {
      id: "host-country-not-spain",
      title: "Host country is not Spain",
      category: "host",
      input: questionnaire({ host_country: "France" }),
      expectedFindingCodes: ["host_country_unexpected"],
    },
    {
      id: "spanish-host-postal-invalid",
      title: "Spanish accommodation postal code is malformed",
      category: "host",
      input: questionnaire({ host_postal: "28A13" }),
      expectedFindingCodes: ["spanish_host_postal_invalid"],
    },
    {
      id: "spanish-host-phone-unexpected",
      title: "Spanish accommodation phone does not look local or +34",
      category: "host",
      input: questionnaire({ host_phone: "+1 555 0101" }),
      expectedFindingCodes: ["spanish_host_phone_unexpected"],
    },
    {
      id: "appointment-after-travel",
      title: "Preferred appointment date is after arrival",
      category: "dates",
      input: questionnaire({}, { schedule_date1: "21.08.2026" }),
      expectedFindingCodes: ["appointment_after_travel_date"],
    },
    {
      id: "home-address-incomplete",
      title: "Home address lacks street or building details",
      category: "residence",
      input: questionnaire({ address_line1: "Moscow" }),
      expectedFindingCodes: ["home_address_incomplete"],
    },
    {
      id: "residence-submission-city-mismatch",
      title: "Residence city and submission center differ",
      category: "residence",
      input: questionnaire({ addr_city: "Yekaterinburg" }, { city: "Moscow" }),
      expectedFindingCodes: ["residence_submission_city_mismatch"],
    },
    {
      id: "minor-occupation-adult-age",
      title: "Adult applicant has MINOR occupation status",
      category: "work",
      input: questionnaire({ occupation: "MINOR" }),
      expectedFindingCodes: ["minor_occupation_age_mismatch"],
    },
    {
      id: "employer-phone-copied-from-applicant",
      title: "Employer phone equals applicant phone",
      category: "work",
      input: questionnaire({ work_phone: "+79990000000" }),
      expectedFindingCodes: ["employer_contact_matches_applicant"],
    },
    {
      id: "employer-address-copied-from-home",
      title: "Employer address equals home address",
      category: "work",
      input: questionnaire({ work_address: "Moscow, Test Street 1" }),
      expectedFindingCodes: ["employer_address_matches_home"],
    },
    {
      id: "family-missing-relation",
      title: "Secondary applicant lacks relation to primary",
      category: "family",
      input: {
        appointment: { ...baseAppointment },
        applicants: [
          applicant({ id: "primary" }),
          applicant({
            id: "secondary",
            first_name: "MARIA",
            passport_number: "721190483",
            email: "secondary@example.test",
            phone: "+79990000002",
            relation_to_primary: "",
          }),
        ],
      },
      expectedFindingCodes: ["missing_required_text"],
    },
    {
      id: "family-copy-paste-passport",
      title: "Family applicant copied primary passport",
      category: "family",
      input: {
        appointment: { ...baseAppointment },
        applicants: [
          applicant({ id: "primary" }),
          applicant({
            id: "secondary",
            first_name: "MARIA",
            passport_number: "721190482",
            email: "secondary@example.test",
            phone: "+79990000002",
            relation_to_primary: "spouse",
          }),
        ],
      },
      expectedFindingCodes: ["duplicate_passport"],
    },
    {
      id: "family-shared-contact",
      title: "Family applicants share contacts",
      category: "family",
      input: {
        appointment: { ...baseAppointment },
        applicants: [
          applicant({ id: "primary", email: "family@example.test" }),
          applicant({
            id: "secondary",
            first_name: "MARIA",
            passport_number: "721190483",
            email: "family@example.test",
            phone: "+79990000000",
            relation_to_primary: "spouse",
          }),
        ],
      },
      expectedFindingCodes: ["shared_contact_requires_review"],
    },
    {
      id: "family-trip-date-mismatch",
      title: "Family applicants have different travel windows",
      category: "family",
      input: {
        appointment: { ...baseAppointment },
        applicants: [
          applicant({ id: "primary" }),
          applicant({
            id: "secondary",
            first_name: "MARIA",
            passport_number: "721190483",
            email: "secondary@example.test",
            phone: "+79990000002",
            relation_to_primary: "spouse",
            arrival_date: "22.08.2026",
            departure_date: "31.08.2026",
          }),
        ],
      },
      expectedFindingCodes: ["family_trip_mismatch"],
    },
  ];
}

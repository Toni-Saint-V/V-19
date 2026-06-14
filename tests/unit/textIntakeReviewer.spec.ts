import { describe, expect, test } from "vitest";
import { buildTextIntakeReview } from "../../src/services/aiHelperService";
import {
  reviewBlsTextQuestionnaire,
  reviewTextIntake,
  type BlsApplicantTextFields,
  type BlsTextQuestionnaireInput,
} from "../../src/services/textIntakeReviewer";
import {
  buildBlsTextReviewPositiveExample,
  buildBlsTextReviewTrainingCorpus,
} from "../../src/services/textIntakeTrainingCorpus";
import type { Applicant, Submission } from "../../src/types/domain";

const appointment: BlsTextQuestionnaireInput["appointment"] = {
  city: "Moscow",
  visa_type: "Schengen",
  visa_category: "Normal",
  schedule_date1: "20.08.2026",
  schedule_date2: "",
  schedule_date3: "",
  note: "",
};

function blsApplicant(
  overrides: Partial<BlsApplicantTextFields> = {},
): BlsApplicantTextFields {
  return {
    id: "applicant-1",
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
    address_line1: "Moscow Test Street 1",
    country: "Russian Federation",
    addr_city: "Moscow",
    postal_code: "101000",
    phone: "+79990000000",
    email: "artem@example.com",
    employer_name: "Demo Company",
    occupation: "ENGINEER",
    occupation_other: "",
    work_phone: "+79990000001",
    work_address: "Moscow office",
    trip_purpose: "TOURISM",
    stay_duration: "10",
    entries_number: "Single Entry",
    arrival_date: "20.08.2026",
    departure_date: "30.08.2026",
    host_type: "Hotel",
    host_name: "Demo Hotel",
    host_country: "Spain",
    host_city: "Madrid",
    host_postal: "28013",
    host_address: "Gran Via 1",
    host_email: "hotel@example.es",
    host_phone: "+34911234567",
    cost_covered_by: "By the applicant",
    means_of_support: "Credit card",
    ...overrides,
  };
}

const completeApplicant: Applicant = {
  id: "applicant-1",
  name: "Artem Sokolov",
  role: "Applicant",
  passport: "72 1190482",
  form: 100,
  media: 0,
  mediaRequired: 0,
  birthDate: "1988-05-12",
  citizenship: "Russian Federation",
  address: "Moscow",
  phone: "+79990000000",
  email: "artem@example.com",
  passportIssuedAt: "2020-01-10",
  passportExpiresAt: "2030-01-10",
  country: "Spain",
  city: "Madrid",
  tripDates: "2026-08-20 - 2026-08-30",
  hotelName: "Demo Hotel",
  hotelAddress: "Gran Via 1",
};

function submission(applicants: Applicant[] = [completeApplicant]): Submission {
  return {
    id: "VF-TEXT",
    title: "Text Review",
    type: applicants.length > 1 ? "family" : "single",
    agentId: "agent-1",
    agentName: "Demo Agent",
    country: "Spain",
    city: "Madrid",
    travelDate: "2026-08-20",
    updated: "2026-06-12T10:00:00.000Z",
    status: "draft",
    appointment: "not_started",
    priority: "Средний",
    fields: 100,
    media: 0,
    mediaRequired: 0,
    applicants,
    mediaRows: [],
    notes: [],
  };
}

describe("text intake reviewer", () => {
  test("reviews a complete single-applicant BLS questionnaire without findings", () => {
    const result = reviewBlsTextQuestionnaire({
      appointment,
      applicants: [blsApplicant()],
    });

    expect(result.status).toBe("clear");
    expect(result.readiness).toBe(100);
    expect(result.reviewedApplicants).toBe(1);
    expect(result.reviewedFields).toBe(48);
    expect(result.findings).toEqual([]);
  });

  test("requires relation for secondary BLS applicants and preserves 90-field family coverage", () => {
    const result = reviewBlsTextQuestionnaire({
      appointment,
      applicants: [
        blsApplicant({ id: "primary" }),
        blsApplicant({
          id: "secondary",
          first_name: "MARIA",
          passport_number: "721190482",
          email: "artem@example.com",
          phone: "+79990000000",
          relation_to_primary: "",
        }),
      ],
    });

    expect(result.reviewedApplicants).toBe(2);
    expect(result.reviewedFields).toBe(90);
    expect(result.status).toBe("needs_correction");
    expect(result.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining([
        "missing_required_text",
        "duplicate_passport",
        "shared_contact_requires_review",
      ]),
    );
    expect(
      result.findings.some((finding) => finding.sourceField === "relation_to_primary"),
    ).toBe(true);
  });

  test("flags BLS date, duration, conditional occupation and host-country risks", () => {
    const result = reviewBlsTextQuestionnaire({
      appointment,
      applicants: [
        blsApplicant({
          occupation: "OTHER",
          occupation_other: "",
          birth_date: "2099-01-01",
          passport_issued_at: "10.01.2031",
          passport_expires_at: "10.01.2030",
          travel_date: "20.08.2031",
          arrival_date: "30.08.2026",
          departure_date: "20.08.2026",
          stay_duration: "ten",
          host_country: "France",
        }),
      ],
    });

    expect(result.status).toBe("needs_correction");
    expect(result.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining([
        "missing_conditional_text",
        "invalid_date_format",
        "passport_issued_after_expiry",
        "passport_expired_before_travel",
        "date_order_inconsistent",
        "non_numeric_duration",
        "host_country_unexpected",
      ]),
    );
  });

  test("covers a synthetic human-error corpus with expected finding codes", () => {
    const positive = reviewBlsTextQuestionnaire(buildBlsTextReviewPositiveExample());
    expect(positive.status).toBe("clear");

    const cases = buildBlsTextReviewTrainingCorpus();
    expect(cases).toHaveLength(32);

    for (const item of cases) {
      const result = reviewBlsTextQuestionnaire(item.input);
      expect(result.status, item.id).not.toBe("clear");
      expect(
        result.findings.map((finding) => finding.code),
        item.id,
      ).toEqual(expect.arrayContaining(item.expectedFindingCodes));
    }
  });

  test("keeps the synthetic corpus free from observed live BLS personal values", () => {
    const corpusJson = JSON.stringify([
      buildBlsTextReviewPositiveExample(),
      ...buildBlsTextReviewTrainingCorpus().map((item) => item.input),
    ]).toLowerCase();

    for (const forbiddenValue of [
      "pavlova",
      "iaroslavtseva",
      "778829783",
      "nastik.pav",
      "apartamentos navio",
    ]) {
      expect(corpusJson).not.toContain(forbiddenValue);
    }
  });

  test("keeps existing app submission reviewer and AI helper bounded to text review", () => {
    const review = reviewTextIntake(
      submission([
        {
          ...completeApplicant,
          email: "not-an-email",
          passportExpiresAt: "2026-01-01",
        },
      ]),
    );
    const helper = buildTextIntakeReview(submission());

    expect(review.status).toBe("needs_correction");
    expect(review.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining(["invalid_email", "passport_expired_before_travel"]),
    );
    expect(helper.intent).toBe("text_intake_review");
    expect(helper.textReview?.status).toBe("clear");
    expect(helper.guardrails.join(" ")).toContain(
      "not outcome decisions or authority claims",
    );
  });
});

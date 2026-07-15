import { describe, expect, test } from "vitest";

import { productionCohortExportDataGate } from "../../scripts/lib/production-cohort-export-data-gate.mjs";

const requiredValues = {
  "birth-date": "01.01.1990",
  "contact-number": "+7 900 111-22-33",
  email: "family@example.invalid",
  "first-name": "IVAN",
  "passport-no": "981234567",
  surname: "IVANOV",
};

function answersFor(
  submissionId: string,
  applicantId: string,
  overrides: Partial<typeof requiredValues> = {},
) {
  const values = { ...requiredValues, ...overrides };
  return Object.entries(values).map(([fieldId, value]) => ({
    applicant_id: applicantId,
    field_id: fieldId,
    submission_id: submissionId,
    value,
  }));
}

function applicant(
  id: string,
  submissionId: string,
  overrides: Partial<{
    birth_date: string;
    email: string;
    passport_number: string;
    phone: string;
  }> = {},
) {
  return {
    birth_date: "1990-01-01",
    email: "family@example.invalid",
    id,
    passport_number: "981234567",
    phone: "+7 900 111-22-33",
    submission_id: submissionId,
    ...overrides,
  };
}

describe("production cohort questionnaire/Excel data gate", () => {
  test("accepts unique identities and one shared family contact", () => {
    const result = productionCohortExportDataGate({
      submissions: [{ id: "family-1", type: "family" }],
      applicants: [
        applicant("applicant-1", "family-1"),
        applicant("applicant-2", "family-1", {
          birth_date: "1992-02-02",
          passport_number: "981234568",
        }),
      ],
      answers: [
        ...answersFor("family-1", "applicant-1"),
        ...answersFor("family-1", "applicant-2", {
          "birth-date": "02.02.1992",
          "first-name": "MARIA",
          "passport-no": "981234568",
          surname: "IVANOVA",
        }),
      ],
    });

    expect(result).toEqual({ findings: [], ok: true });
  });

  test("fails closed for different family contacts", () => {
    const result = productionCohortExportDataGate({
      submissions: [{ id: "family-1", type: "family" }],
      applicants: [
        applicant("applicant-1", "family-1"),
        applicant("applicant-2", "family-1", {
          birth_date: "1992-02-02",
          email: "other@example.invalid",
          passport_number: "981234568",
        }),
      ],
      answers: [
        ...answersFor("family-1", "applicant-1"),
        ...answersFor("family-1", "applicant-2", {
          "birth-date": "02.02.1992",
          email: "other@example.invalid",
          "first-name": "MARIA",
          "passport-no": "981234568",
          surname: "IVANOVA",
        }),
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.findings.map((finding) => finding.code)).toContain(
      "family_contact_mismatch",
    );
  });

  test("fails closed for repeated passports and exact identities", () => {
    const result = productionCohortExportDataGate({
      submissions: [
        { id: "single-1", type: "single" },
        { id: "single-2", type: "single" },
      ],
      applicants: [
        applicant("applicant-1", "single-1"),
        applicant("applicant-2", "single-2"),
      ],
      answers: [
        ...answersFor("single-1", "applicant-1"),
        ...answersFor("single-2", "applicant-2"),
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining(["duplicate_identity", "duplicate_passport"]),
    );
  });

  test("fails closed for missing, malformed, duplicate-key, and cross-owner data", () => {
    const validAnswers = answersFor("single-1", "applicant-1", {
      "contact-number": "+34 600 123 456",
      "passport-no": "BAD-PASSPORT",
    });
    const result = productionCohortExportDataGate({
      submissions: [{ id: "single-1", type: "single" }],
      applicants: [applicant("applicant-1", "single-1")],
      answers: [
        ...validAnswers.filter((answer) => answer.field_id !== "email"),
        validAnswers[0]!,
        {
          applicant_id: "applicant-1",
          field_id: "surname",
          submission_id: "other-submission",
          value: "WRONG OWNER",
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining([
        "answer_ownership_mismatch",
        "duplicate_answer_key",
        "invalid_applicant_phone",
        "invalid_passport",
        "missing_export_field",
      ]),
    );
  });

  test("fails closed when applicant projections drift from questionnaire values", () => {
    const result = productionCohortExportDataGate({
      submissions: [{ id: "single-1", type: "single" }],
      applicants: [
        applicant("applicant-1", "single-1", {
          birth_date: "1999-09-09",
          email: "projection@example.invalid",
          passport_number: "989999999",
          phone: "+7 999 999-99-99",
        }),
      ],
      answers: answersFor("single-1", "applicant-1"),
    });

    expect(result.ok).toBe(false);
    expect(result.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining([
        "applicant_projection_birth_date_mismatch",
        "applicant_projection_email_mismatch",
        "applicant_projection_passport_mismatch",
        "applicant_projection_phone_mismatch",
      ]),
    );
  });
});

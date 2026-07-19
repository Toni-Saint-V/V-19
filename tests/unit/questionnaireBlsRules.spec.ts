import { describe, expect, test } from "vitest";

import {
  blsApplicantQuestionnaireStatus,
  blsStayDurationFromDates,
  blsQuestionnaireReadiness,
  isBlsQuestionnaireFieldRequired,
  isBlsQuestionnaireFieldReady,
  validateBlsQuestionnaireField,
  type BlsFormData,
} from "../../src/modules/submissions/questionnaireBlsRules";
import { normalizeSubmissionQuestionnaire } from "../../src/modules/submissions/questionnaire";
import { submitForReview } from "../../src/modules/submissions/domainEngine";
import {
  createDraftSubmission,
  updateQuestionnaireField,
  uploadRequiredFiles,
} from "../../src/modules/submissions/submissionActions";
import {
  calculateSubmissionProgress,
  canPerformAction,
  hasMissingRequiredWork,
} from "../../src/modules/submissions/status";
import type { Applicant, Submission } from "../../src/modules/submissions/types";
import { fillRequiredQuestionnaireForTest } from "./helpers/questionnaireTestFill";

function setApplicantField(
  submission: Submission,
  applicantIndex: number,
  fieldId: string,
  value: string,
) {
  const applicant = submission.applicants[applicantIndex];
  const section = applicant?.sections.find((candidate) =>
    candidate.fields.some((field) => field.id === fieldId),
  );
  if (!applicant || !section) throw new Error(`Missing questionnaire field: ${fieldId}`);

  return updateQuestionnaireField(submission, {
    applicantId: applicant.id,
    fieldId,
    sectionId: section.id,
    value,
  });
}

function readySingleSubmission() {
  return uploadRequiredFiles(
    fillRequiredQuestionnaireForTest(
      createDraftSubmission({
        city: "Москва",
        familyCount: 1,
        submissions: [],
        type: "single",
      }),
    ),
  );
}

function expectReadyParity(submission: Submission) {
  const inProgress = { ...submission, status: "in_progress" as const };

  expect(blsQuestionnaireReadiness(inProgress).ready).toBe(true);
  expect(calculateSubmissionProgress(inProgress).questionnaire).toBe(100);
  expect(hasMissingRequiredWork(inProgress)).toBe(false);
  expect(canPerformAction(inProgress, "submit_for_review", "agent").ok).toBe(true);
}

describe("canonical BLS questionnaire readiness", () => {
  test("derives an inclusive stay duration from valid travel dates", () => {
    expect(blsStayDurationFromDates("15.01.2027", "22.01.2027")).toBe("8");
    expect(blsStayDurationFromDates("15.01.2027", "15.01.2027")).toBe("1");
    expect(blsStayDurationFromDates("22.01.2027", "15.01.2027")).toBe("");
    expect(blsStayDurationFromDates("15.01", "22.01.2027")).toBe("");
  });

  test("treats the automatically calculated stay duration as ready", () => {
    const field = {
      error: undefined,
      id: "stay-duration",
      label: "Длительность пребывания",
      required: true,
      reviewState: "confirmed" as const,
      value: "",
    };
    const formData = {
      travelEnd: "02.09.2026",
      travelStart: "18.08.2026",
    };

    expect(isBlsQuestionnaireFieldReady({ field, formData })).toBe(true);
    expect(
      validateBlsQuestionnaireField({ field, formData }),
    ).toBeUndefined();

    expect(
      validateBlsQuestionnaireField({
        field: { ...field, value: "366" },
        formData: {
          travelEnd: "11.02.2027",
          travelStart: "11.02.2026",
        },
      }),
    ).toBeUndefined();
  });

  test("keeps adult working-applicant readiness aligned with submit policy", () => {
    expectReadyParity(readySingleSubmission());
  });

  test("does not require employer fields for a non-working applicant", () => {
    let submission = readySingleSubmission();
    submission = setApplicantField(submission, 0, "occupation", "UNEMPLOYED");
    submission = setApplicantField(submission, 0, "employer-name", "");
    submission = setApplicantField(submission, 0, "employer-contact", "");
    submission = setApplicantField(submission, 0, "employer-address", "");

    expectReadyParity(submission);
  });

  test("keeps guardian data optional for a minor", () => {
    let submission = readySingleSubmission();
    submission = setApplicantField(submission, 0, "birth-date", "20.08.2012");
    submission = setApplicantField(submission, 0, "guardian-info", "");

    expectReadyParity(submission);
  });

  test("keeps surname at birth optional when it is empty", () => {
    let submission = readySingleSubmission();
    submission = setApplicantField(submission, 0, "previous-surname", "");

    expect(
      isBlsQuestionnaireFieldRequired({
        applicantRole: "main",
        field: {
          id: "previous-surname",
          label: "Фамилия при рождении / предыдущие фамилии",
          required: true,
          value: "",
        },
        formData: {},
      }),
    ).toBe(false);

    const legacySubmission = {
      ...submission,
      applicants: submission.applicants.map((applicant) => ({
        ...applicant,
        sections: applicant.sections.map((section) => ({
          ...section,
          fields: section.fields.map((field) =>
            field.id === "previous-surname"
              ? { ...field, error: "Обязательное поле", required: true }
              : field,
          ),
        })),
      })),
    };
    const normalized = normalizeSubmissionQuestionnaire(legacySubmission);
    const normalizedField = normalized.applicants
      .flatMap((applicant) => applicant.sections)
      .flatMap((section) => section.fields)
      .find((field) => field.id === "previous-surname");

    expect(normalizedField).toMatchObject({ error: undefined, required: false, value: "" });
    expectReadyParity(normalized);
  });

  test("keeps guardian data optional for the canonical child role", () => {
    const field = {
      error: undefined,
      id: "guardian-info",
      label: "Родитель/опекун несовершеннолетнего",
      required: false,
      value: "",
    };
    const formData = { dob: "" } satisfies BlsFormData;

    expect(
      isBlsQuestionnaireFieldRequired({
        applicantRole: "child" satisfies Applicant["role"],
        field,
        formData,
      }),
    ).toBe(false);
  });

  test("does not require employer data from a child until a working or study occupation is selected", () => {
    const field = {
      error: undefined,
      id: "employer-name",
      label: "Работодатель / учебное заведение",
      required: true,
      value: "",
    };

    expect(
      isBlsQuestionnaireFieldRequired({
        applicantRole: "child",
        field,
        formData: { occupation: "" },
      }),
    ).toBe(false);
    expect(
      isBlsQuestionnaireFieldRequired({
        applicantRole: "child",
        field,
        formData: { occupation: "MINOR" },
      }),
    ).toBe(false);
    expect(
      isBlsQuestionnaireFieldRequired({
        applicantRole: "child",
        field,
        formData: { occupation: "STUDENT" },
      }),
    ).toBe(true);
    expect(
      isBlsQuestionnaireFieldRequired({
        applicantRole: "main",
        field,
        formData: { occupation: "" },
      }),
    ).toBe(true);
  });

  test("keeps a family package ready when a minor child has no employer", () => {
    let submission = uploadRequiredFiles(
      fillRequiredQuestionnaireForTest(
        createDraftSubmission({
          city: "Москва",
          familyCount: 3,
          submissions: [],
          type: "family",
        }),
      ),
    );
    const childIndex = submission.applicants.findIndex(
      (applicant) => applicant.role === "child",
    );
    if (childIndex < 0) throw new Error("Expected a child applicant fixture.");

    submission = setApplicantField(submission, childIndex, "occupation", "MINOR");
    submission = setApplicantField(submission, childIndex, "employer-name", "");
    submission = setApplicantField(submission, childIndex, "employer-contact", "");
    submission = setApplicantField(submission, childIndex, "employer-address", "");

    expectReadyParity(submission);
    expect(
      blsApplicantQuestionnaireStatus(submission.applicants[childIndex]),
    ).toBe("complete");
  });

  test("keeps payment compatibility defaults outside the visible questionnaire", () => {
    let submission = readySingleSubmission();
    submission = setApplicantField(submission, 0, "cost-covered-by", "Сам заявитель");
    submission = setApplicantField(submission, 0, "means-of-support", "Наличные");

    expectReadyParity(submission);
  });

  test("requires company fields only for company or business submissions", () => {
    let submission = readySingleSubmission();
    submission = setApplicantField(submission, 0, "company-phone", "");
    expect(blsQuestionnaireReadiness(submission).ready).toBe(false);

    submission = setApplicantField(
      submission,
      0,
      "inviting-party-type",
      "Гостиница/временное жилье",
    );
    submission = setApplicantField(submission, 0, "purpose", "TOURISM");
    submission = setApplicantField(submission, 0, "company-org-details", "");
    submission = setApplicantField(submission, 0, "company-contact-person", "");

    expectReadyParity(submission);
  });

  test("requires the complete residence permit group when applicable", () => {
    let submission = readySingleSubmission();
    submission = setApplicantField(
      submission,
      0,
      "lives-outside-citizenship",
      "Да",
    );

    expect(blsQuestionnaireReadiness(submission).ready).toBe(false);

    submission = setApplicantField(submission, 0, "residence-permit-type", "Residence permit");
    submission = setApplicantField(submission, 0, "residence-permit-number", "QA-12345");
    submission = setApplicantField(
      submission,
      0,
      "residence-permit-valid-until",
      "20.08.2030",
    );
    expectReadyParity(submission);
  });

  test("requires a biometrics date only after a positive answer", () => {
    let submission = readySingleSubmission();
    submission = setApplicantField(submission, 0, "previous-biometrics", "Да");
    submission = setApplicantField(submission, 0, "previous-biometrics-date", "");
    expect(blsQuestionnaireReadiness(submission).ready).toBe(false);

    submission = setApplicantField(
      submission,
      0,
      "previous-biometrics-date",
      "20.08.2024",
    );
    expectReadyParity(submission);
  });

  test("blocks a populated optional field with an invalid value", () => {
    let submission = readySingleSubmission();
    submission = setApplicantField(submission, 0, "hotel-email", "invalid-email");

    const readiness = blsQuestionnaireReadiness(submission);
    expect(readiness.percent).toBe(100);
    expect(readiness.blockingIssueCount).toBeGreaterThan(0);
    expect(readiness.ready).toBe(false);
    expect(hasMissingRequiredWork(submission)).toBe(true);
    expect(
      submitForReview({ ...submission, status: "in_progress" }, "agent").ok,
    ).toBe(false);
  });

  test("blocks OCR-derived values until the applicant explicitly confirms them", () => {
    let submission = readySingleSubmission();
    const applicant = submission.applicants[0];
    const personalSection = applicant?.sections.find((section) =>
      section.fields.some((field) => field.id === "birth-place"),
    );
    if (!applicant || !personalSection) throw new Error("Missing birth-place field");

    submission = updateQuestionnaireField(submission, {
      applicantId: applicant.id,
      fieldId: "birth-place",
      reviewSource: "passport_ocr",
      reviewState: "needs_review",
      sectionId: personalSection.id,
      value: "MOSCOW",
    });

    expect(blsQuestionnaireReadiness(submission).ready).toBe(false);
    expect(blsQuestionnaireReadiness(submission).blockingIssueCount).toBeGreaterThan(0);

    submission = updateQuestionnaireField(submission, {
      applicantId: applicant.id,
      fieldId: "birth-place",
      reviewOriginSource: "passport_ocr",
      reviewSource: "manual",
      reviewState: "confirmed",
      sectionId: personalSection.id,
      value: "MOSCOW",
    });

    expectReadyParity(submission);
  });
});

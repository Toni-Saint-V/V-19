import { describe, expect, test } from "vitest";

import {
  blsStayDurationFromDates,
  blsQuestionnaireReadiness,
  isBlsQuestionnaireFieldRequired,
  type BlsFormData,
} from "../../src/modules/submissions/questionnaireBlsRules";
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

  test("requires guardian data for every minor, including a single applicant", () => {
    let submission = readySingleSubmission();
    submission = setApplicantField(submission, 0, "birth-date", "20.08.2012");
    submission = setApplicantField(submission, 0, "guardian-info", "");

    expect(blsQuestionnaireReadiness(submission).ready).toBe(false);
    expect(hasMissingRequiredWork(submission)).toBe(true);

    submission = setApplicantField(submission, 0, "guardian-info", "TEST GUARDIAN");
    expectReadyParity(submission);
  });

  test("requires guardian data for the canonical child role", () => {
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
    ).toBe(true);
  });

  test("switches from applicant means to sponsor requirements", () => {
    let submission = readySingleSubmission();
    submission = setApplicantField(submission, 0, "cost-covered-by", "Спонсор");
    submission = setApplicantField(submission, 0, "means-of-support", "");
    submission = setApplicantField(submission, 0, "sponsor-in-host-fields", "Да");
    submission = setApplicantField(submission, 0, "sponsor-means", "Наличные");

    expectReadyParity(submission);

    submission = setApplicantField(submission, 0, "sponsor-means", "");
    expect(blsQuestionnaireReadiness(submission).ready).toBe(false);
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

import { describe, expect, it } from "vitest";

import { applicantWorkflowActions } from "../../src/modules/submissions/applicantWorkflow";
import {
  createDraftSubmission,
  ensureApplicantMediaSlot,
  updateQuestionnaireField,
  uploadRequiredFile,
} from "../../src/modules/submissions/submissionActions";
import { calculateSubmissionProgress } from "../../src/modules/submissions/status";
import { fillRequiredQuestionnaireForTest } from "./helpers/questionnaireTestFill";

function draft(type: "family" | "single" = "single") {
  return createDraftSubmission({
    city: "Москва",
    familyCount: type === "family" ? 2 : 1,
    submissions: [],
    type,
  });
}

describe("applicant workflow actions", () => {
  it("shows the canonical partial questionnaire and three missing media actions", () => {
    const submission = draft();
    const applicant = submission.applicants[0]!;

    expect(applicantWorkflowActions(submission, applicant)).toMatchObject([
      { kind: "questionnaire", state: "attention" },
      { kind: "selfie", state: "missing" },
      { kind: "selfie_2", state: "missing" },
      { kind: "passport_scan", state: "missing" },
    ]);
  });

  it("focuses a partial questionnaire and marks a completed one ready", () => {
    const submission = draft();
    const applicant = submission.applicants[0]!;
    const section = applicant.sections.find((candidate) =>
      candidate.fields.some((field) => field.id === "surname"),
    )!;
    const partial = updateQuestionnaireField(submission, {
      applicantId: applicant.id,
      fieldId: "surname",
      sectionId: section.id,
      value: "IVANOV",
    });
    const attention = applicantWorkflowActions(
      partial,
      partial.applicants[0]!,
    )[0];
    expect(attention).toMatchObject({ kind: "questionnaire", state: "attention" });
    expect(attention?.field).toBeTruthy();

    const complete = fillRequiredQuestionnaireForTest(submission);
    expect(applicantWorkflowActions(complete, complete.applicants[0]!)[0]).toMatchObject({
      kind: "questionnaire",
      state: "ready",
    });
  });

  it("gives active file remarks precedence over uploaded state", () => {
    const submission = draft();
    const passport = submission.files.find((file) => file.type === "passport_scan")!;
    const uploaded = uploadRequiredFile(submission, passport.id);
    const withIssue = {
      ...uploaded,
      issues: [
        {
          id: "issue-passport",
          type: "file" as const,
          target: {
            applicantId: uploaded.applicants[0]!.id,
            applicantName: uploaded.applicants[0]!.fullName,
            fileType: "passport_scan" as const,
          },
          reason: "Нечитаемый скан",
          comment: "Загрузите новый паспорт",
          severity: "blocker" as const,
          status: "open" as const,
          createdBy: "admin" as const,
          createdAt: new Date().toISOString(),
        },
      ],
    };

    expect(
      applicantWorkflowActions(withIssue, withIssue.applicants[0]!).find(
        (action) => action.kind === "passport_scan",
      ),
    ).toMatchObject({ issueId: "issue-passport", state: "attention" });
  });

  it("creates optional secondary selfies only during a real upload", () => {
    const submission = draft("family");
    const secondary = submission.applicants[1]!;
    const beforeProgress = calculateSubmissionProgress(submission);
    expect(
      applicantWorkflowActions(submission, secondary).map((action) => action.kind),
    ).toEqual(["questionnaire", "passport_scan"]);
    expect(
      submission.files.some(
        (file) => file.applicantId === secondary.id && file.type === "selfie",
      ),
    ).toBe(false);

    const prepared = ensureApplicantMediaSlot(submission, secondary.id, "selfie");
    const uploaded = uploadRequiredFile(prepared.submission, prepared.file.id);
    expect(
      uploaded.files.find(
        (file) => file.applicantId === secondary.id && file.type === "selfie",
      )?.status,
    ).toBe("uploaded");
    expect(calculateSubmissionProgress(uploaded)).toEqual(beforeProgress);
  });
});

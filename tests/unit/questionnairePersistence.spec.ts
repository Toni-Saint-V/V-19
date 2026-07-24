import { describe, expect, test } from "vitest";
import {
  addPreciseAdminIssue,
  completeQuestionnaire,
  createDraftSubmission,
  updateQuestionnaireField,
} from "../../src/modules/submissions/submissionActions";
import type { Submission } from "../../src/modules/submissions/types";

function sectionIdForField(submission: Submission, fieldId: string) {
  const section = submission.applicants[0]?.sections.find((item) =>
    item.fields.some((field) => field.id === fieldId),
  );
  if (!section) throw new Error(`expected section for ${fieldId}`);
  return section.id;
}

function fieldValue(submission: Submission, fieldId: string) {
  return (
    submission.applicants[0]?.sections
      .flatMap((section) => section.fields)
      .find((field) => field.id === fieldId)?.value ?? ""
  );
}

function setField(submission: Submission, fieldId: string, value: string) {
  const applicantId = submission.applicants[0]?.id;
  if (!applicantId) throw new Error("expected applicant");

  return updateQuestionnaireField(submission, {
    applicantId,
    fieldId,
    sectionId: sectionIdForField(submission, fieldId),
    value,
  });
}

describe("questionnaire persistence", () => {
  test("completeQuestionnaire preserves existing answers and does not auto-fill blanks", () => {
    const draft = createDraftSubmission({
      applicantNames: ["VOLKOV ANTON"],
      city: "Москва",
      familyCount: 1,
      idScheme: "local",
      submissions: [],
      type: "single",
    });
    const submission = [
      ["surname", "VOLKOV"],
      ["first-name", "ANTON"],
      ["passport-no", "752869613"],
      ["passport-expiry-date", "26.02.2026"],
    ].reduce(
      (current, [fieldId, value]) => setField(current, fieldId, value),
      draft,
    );

    const completed = completeQuestionnaire(submission);

    expect(fieldValue(completed, "surname")).toBe("VOLKOV");
    expect(fieldValue(completed, "first-name")).toBe("ANTON");
    expect(fieldValue(completed, "passport-no")).toBe("752869613");
    expect(fieldValue(completed, "passport-expiry-date")).toBe("26.02.2026");
    expect(fieldValue(completed, "employer-name")).toBe("");
    expect(completed.history[0]?.text).toBe("Анкета сохранена");
  });

  test("maps legacy issue labels to renamed fields and clears guidance after edit", () => {
    const draft = createDraftSubmission({
      applicantNames: ["VOLKOV ANTON"],
      city: "Москва",
      familyCount: 1,
      idScheme: "local",
      submissions: [],
      type: "single",
    });
    const submitted = { ...draft, status: "submitted_for_review" as const };
    const applicant = submitted.applicants[0];
    if (!applicant) throw new Error("expected applicant");

    const withIssue = addPreciseAdminIssue(submitted, {
      applicantId: applicant.id,
      comment: "Проверьте срок действия паспорта.",
      field: "Дата окончания паспорта",
      reason: "Требует проверки",
      section: "Паспорт",
      severity: "blocker",
      type: "field",
    });

    const edited = updateQuestionnaireField(withIssue, {
      applicantId: applicant.id,
      fieldId: "passport-expiry-date",
      sectionId: sectionIdForField(withIssue, "passport-expiry-date"),
      value: "26.02.2026",
    });

    expect(
      edited.applicants[0]?.sections
        .flatMap((section) => section.fields)
        .find((field) => field.id === "passport-expiry-date")?.error,
    ).toBeUndefined();
    expect(edited.issues[0]).toMatchObject({
      status: "open",
      targetRevision: 1,
    });
  });
});

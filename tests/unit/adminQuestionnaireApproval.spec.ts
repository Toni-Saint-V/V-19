import { describe, expect, test } from "vitest";
import { initialSubmissions } from "../../src/modules/submissions/mockData";
import {
  addPreciseAdminIssue,
  approveQuestionnaireFieldForAdmin,
  updateQuestionnaireField,
} from "../../src/modules/submissions/submissionActions";

function reviewFixture() {
  const submission = initialSubmissions.find((candidate) => candidate.id === "ПД-1053");
  if (!submission) throw new Error("Expected admin review fixture.");
  const applicant = submission.applicants[0];
  if (!applicant) throw new Error("Expected applicant fixture.");
  const section = applicant.sections.find((candidate) =>
    candidate.fields.some((field) => field.value.trim() && !field.error),
  );
  const field = section?.fields.find((candidate) => candidate.value.trim() && !candidate.error);
  if (!section || !field) throw new Error("Expected approvable field fixture.");
  return { applicant, field, section, submission };
}

describe("admin questionnaire field approval", () => {
  test("persists explicit admin approval and clears it after a value change", () => {
    const { applicant, field, section, submission } = reviewFixture();
    const approved = approveQuestionnaireFieldForAdmin(
      submission,
      {
        applicantId: applicant.id,
        fieldId: field.id,
        sectionId: section.id,
      },
      "admin-reviewer",
      "2026-07-15T06:30:00.000Z",
    );
    const approvedField = approved.applicants[0]?.sections
      .flatMap((candidate) => candidate.fields)
      .find((candidate) => candidate.id === field.id);

    expect(approvedField).toMatchObject({
      adminReviewApprovedAtIso: "2026-07-15T06:30:00.000Z",
      adminReviewApprovedBy: "admin-reviewer",
    });

    const edited = updateQuestionnaireField(approved, {
      applicantId: applicant.id,
      fieldId: field.id,
      sectionId: section.id,
      value: `${field.value} обновлено`,
    });
    const editedField = edited.applicants[0]?.sections
      .flatMap((candidate) => candidate.fields)
      .find((candidate) => candidate.id === field.id);

    expect(editedField?.adminReviewApprovedAtIso).toBeUndefined();
    expect(editedField?.adminReviewApprovedBy).toBeUndefined();
  });

  test("blocks approval for blank fields and fields with an open remark", () => {
    const { applicant, field, section, submission } = reviewFixture();
    const blankField = applicant.sections
      .flatMap((candidate) => candidate.fields)
      .find((candidate) => !candidate.value.trim());
    if (!blankField) throw new Error("Expected blank field fixture.");
    const blankSection = applicant.sections.find((candidate) =>
      candidate.fields.some((candidateField) => candidateField.id === blankField.id),
    );
    if (!blankSection) throw new Error("Expected blank field section.");

    expect(
      approveQuestionnaireFieldForAdmin(
        submission,
        {
          applicantId: applicant.id,
          fieldId: blankField.id,
          sectionId: blankSection.id,
        },
        "admin-reviewer",
      ),
    ).toBe(submission);

    const withIssue = {
      ...submission,
      issues: [
        {
          id: "issue-field-approval",
          type: "field" as const,
          target: {
            applicantId: applicant.id,
            applicantName: applicant.fullName,
            field: field.label,
          },
          reason: "Проверить значение",
          comment: "Есть расхождение",
          severity: "warning" as const,
          status: "open" as const,
          createdBy: "admin" as const,
          createdAt: "сейчас",
        },
        ...submission.issues,
      ],
    };

    expect(
      approveQuestionnaireFieldForAdmin(
        withIssue,
        {
          applicantId: applicant.id,
          fieldId: field.id,
          sectionId: section.id,
        },
        "admin-reviewer",
      ),
    ).toBe(withIssue);
  });

  test("revokes an existing approval when admin adds a field remark", () => {
    const { applicant, field, section, submission } = reviewFixture();
    const approved = approveQuestionnaireFieldForAdmin(
      submission,
      {
        applicantId: applicant.id,
        fieldId: field.id,
        sectionId: section.id,
      },
      "admin-reviewer",
      "2026-07-15T06:30:00.000Z",
    );
    const withRemark = addPreciseAdminIssue(
      { ...approved, status: "submitted_for_review" },
      {
        applicantId: applicant.id,
        comment: "Значение не совпадает с документом",
        field: field.label,
        reason: "Проверить значение",
        severity: "warning",
        type: "field",
      },
      "admin-reviewer",
    );
    const remarkedField = withRemark.applicants[0]?.sections
      .flatMap((candidate) => candidate.fields)
      .find((candidate) => candidate.id === field.id);

    expect(remarkedField?.adminReviewApprovedAtIso).toBeUndefined();
    expect(remarkedField?.adminReviewApprovedBy).toBeUndefined();
    expect(remarkedField?.error).toBe("Проверить значение");
  });
});

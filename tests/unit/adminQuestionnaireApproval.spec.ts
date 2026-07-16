import { describe, expect, test } from "vitest";
import { initialSubmissions } from "../../src/modules/submissions/mockData";
import {
  addPreciseAdminIssue,
  approveQuestionnaireFieldForAdmin,
  createDraftSubmission,
  updateQuestionnaireField,
} from "../../src/modules/submissions/submissionActions";
import { adminQuestionnaireReviewReadiness } from "../../src/modules/submissions/status";
import {
  adminApproveQuestionnaireForTest,
  fillRequiredQuestionnaireForTest,
} from "./helpers/questionnaireTestFill";

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

  test("allows admin to confirm a correction marked fixed by the agent", () => {
    const { applicant, field, section, submission } = reviewFixture();
    const corrected = {
      ...submission,
      issues: [
        {
          id: "issue-fixed-field-approval",
          type: "field" as const,
          target: {
            applicantId: applicant.id,
            applicantName: applicant.fullName,
            field: field.label,
          },
          reason: "Проверить исправление",
          comment: "Агент обновил значение",
          severity: "warning" as const,
          status: "fixed_by_agent" as const,
          createdBy: "admin" as const,
          createdAt: "сейчас",
        },
      ],
    };

    const approved = approveQuestionnaireFieldForAdmin(
      corrected,
      {
        applicantId: applicant.id,
        fieldId: field.id,
        sectionId: section.id,
      },
      "admin-reviewer",
      "2026-07-16T07:00:00.000Z",
    );

    expect(approved).not.toBe(corrected);
    expect(
      approved.applicants[0]?.sections
        .flatMap((candidate) => candidate.fields)
        .find((candidate) => candidate.id === field.id),
    ).toMatchObject({
      adminReviewApprovedAtIso: "2026-07-16T07:00:00.000Z",
      adminReviewApprovedBy: "admin-reviewer",
    });
  });

  test("fails closed until every populated questionnaire field is approved", () => {
    const { field, submission } = reviewFixture();
    const approved = adminApproveQuestionnaireForTest(submission);
    const pending = {
      ...approved,
      applicants: approved.applicants.map((applicant) => ({
        ...applicant,
        sections: applicant.sections.map((section) => ({
          ...section,
          fields: section.fields.map((candidate) =>
            candidate.id === field.id
              ? {
                  ...candidate,
                  adminReviewApprovedAtIso: undefined,
                  adminReviewApprovedBy: undefined,
                }
              : candidate,
          ),
        })),
      })),
    };

    expect(adminQuestionnaireReviewReadiness(pending)).toEqual({
      ok: false,
      reason: "Подтвердите заполненные поля анкеты перед принятием",
    });
    expect(adminQuestionnaireReviewReadiness(approved)).toEqual({ ok: true });
  });

  test("ignores stale errors on blank child employer fields but reviews populated values", () => {
    let submission = fillRequiredQuestionnaireForTest(
      createDraftSubmission({
        city: "Москва",
        familyCount: 3,
        submissions: [],
        type: "family",
      }),
    );
    const child = submission.applicants.find((applicant) => applicant.role === "child");
    if (!child) throw new Error("Expected a child applicant fixture.");
    const workSection = child.sections.find((section) =>
      section.fields.some((field) => field.id === "occupation"),
    );
    if (!workSection) throw new Error("Expected a child work section fixture.");

    submission = updateQuestionnaireField(submission, {
      applicantId: child.id,
      fieldId: "occupation",
      sectionId: workSection.id,
      value: "MINOR",
    });
    const employerFieldIds = new Set([
      "employer-name",
      "employer-contact",
      "employer-address",
    ]);
    const withBlankEmployerErrors = {
      ...submission,
      applicants: submission.applicants.map((applicant) =>
        applicant.id !== child.id
          ? applicant
          : {
              ...applicant,
              sections: applicant.sections.map((section) => ({
                ...section,
                fields: section.fields.map((field) =>
                  employerFieldIds.has(field.id)
                    ? {
                        ...field,
                        adminReviewApprovedAtIso: undefined,
                        adminReviewApprovedBy: undefined,
                        error: "Обязательное поле",
                        value: "",
                      }
                    : field,
                ),
              })),
            },
      ),
    };
    const approved = adminApproveQuestionnaireForTest(withBlankEmployerErrors);

    expect(adminQuestionnaireReviewReadiness(approved)).toEqual({ ok: true });

    const populatedEmployer = updateQuestionnaireField(approved, {
      applicantId: child.id,
      fieldId: "employer-name",
      sectionId: workSection.id,
      value: "SCHOOL",
    });
    expect(adminQuestionnaireReviewReadiness(populatedEmployer)).toEqual({
      ok: false,
      reason: "Подтвердите заполненные поля анкеты перед принятием",
    });

    const employerApproved = approveQuestionnaireFieldForAdmin(
      populatedEmployer,
      {
        applicantId: child.id,
        fieldId: "employer-name",
        sectionId: workSection.id,
      },
      "admin-reviewer",
    );
    expect(adminQuestionnaireReviewReadiness(employerApproved)).toEqual({ ok: true });
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

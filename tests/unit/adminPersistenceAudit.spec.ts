import { describe, expect, test } from "vitest";

import { initialSubmissions } from "../../src/modules/submissions/mockData";
import { addPreciseAdminIssue } from "../../src/modules/submissions/submissionActions";

describe("admin persistence audit regressions", () => {
  test("records a unique audit-history event for every saved admin issue", () => {
    const submission = initialSubmissions.find(
      (candidate) => candidate.status === "submitted_for_review",
    );
    const applicant = submission?.applicants[0];
    const field = applicant?.sections.flatMap((section) => section.fields)[0];
    if (!submission || !applicant || !field) {
      throw new Error(
        "Expected a submitted review fixture with a questionnaire field.",
      );
    }

    const withFirstIssue = addPreciseAdminIssue(
      submission,
      {
        applicantId: applicant.id,
        comment: "Контрольное замечание ADM-AUDIT-1",
        field: field.label,
        reason: "Первая независимая проверка",
        severity: "warning",
        type: "field",
      },
      "admin-audit-reviewer",
    );
    const withSecondIssue = addPreciseAdminIssue(
      withFirstIssue,
      {
        applicantId: applicant.id,
        comment: "Контрольное замечание ADM-AUDIT-2",
        field: field.label,
        reason: "Вторая независимая проверка",
        severity: "warning",
        type: "field",
      },
      "admin-audit-reviewer",
    );
    const issueHistory = withSecondIssue.history.filter(
      (item) => item.text === "Администратор добавил точное замечание",
    );

    expect(issueHistory).toHaveLength(2);
    expect(new Set(issueHistory.map((item) => item.id)).size).toBe(2);
  });
});

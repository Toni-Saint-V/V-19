// tests/unit/adminAiReviewModel.spec.ts
import { describe, expect, test } from "vitest";
import {
  adminAiReviewProviderContext,
  buildAdminAiReviewModel,
} from "../../src/modules/submissions/adminAiReviewModel";
import { buildAdminAiReviewContext } from "../../src/modules/submissions/adminAiAssistance";
import { initialSubmissions } from "../../src/modules/submissions/mockData";
import type { Submission } from "../../src/modules/submissions/types";

function reviewSubmission(): Submission {
  const submission = initialSubmissions.find((item) => item.id === "ПД-1048");
  if (!submission) throw new Error("Expected review fixture.");
  return structuredClone(submission);
}

describe("local admin AI review model", () => {
  test("produces deterministic evidence, next action, checks, and questions offline", () => {
    const model = buildAdminAiReviewModel(reviewSubmission());

    expect(model.modelVersion).toBe("local-admin-copilot-v2");
    expect(model.evidenceScore).toBeGreaterThanOrEqual(0);
    expect(model.evidenceScore).toBeLessThanOrEqual(100);
    expect(model.nextAction).toBeTruthy();
    expect(model.nextActionReason).toBeTruthy();
    expect(model.checklist.length).toBeGreaterThan(0);
    expect(model.guardrails).toContain(
      "AI не принимает заявку, не закрывает замечания и не меняет статус.",
    );
  });

  test("provider context contains only aggregate states and no PII or raw issue text", () => {
    const submission = reviewSubmission();
    const model = buildAdminAiReviewModel(submission);
    const context = {
      ...buildAdminAiReviewContext(submission, model),
      ...adminAiReviewProviderContext(model),
    };
    const serialized = JSON.stringify(context);

    expect(serialized).not.toContain(submission.id);
    expect(serialized).not.toContain(submission.city);
    expect(serialized).not.toContain(submission.title);
    for (const applicant of submission.applicants) {
      expect(serialized).not.toContain(applicant.id);
      expect(serialized).not.toContain(applicant.fullName);
    }
    for (const issue of submission.issues) {
      expect(serialized).not.toContain(issue.id);
      expect(serialized).not.toContain(issue.reason);
      expect(serialized).not.toContain(issue.comment);
    }
    expect(context).toMatchObject({
      feature: "review",
      applicantCount: submission.applicants.length,
      openIssueCount: 2,
      requiresAction: true,
    });
  });

  test("low evidence never becomes an autonomous decision", () => {
    const submission = reviewSubmission();
    submission.completeness.questionnaire = 0;
    submission.files = submission.files.map((file) => ({
      ...file,
      status: "missing",
    }));
    const model = buildAdminAiReviewModel(submission);

    expect(model.confidence).toBe("low");
    expect(model.evidenceScore).toBeLessThan(55);
    expect(model.questions.some((question) => question.priority === "required")).toBe(
      true,
    );
    expect(model.guardrails.join(" ")).toMatch(/ручн|не принимает/iu);
  });
});

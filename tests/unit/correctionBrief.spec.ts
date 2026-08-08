// tests/unit/correctionBrief.spec.ts
import { describe, expect, test } from "vitest";
import {
  buildCorrectionBrief,
  critiqueCorrectionBriefText,
  mergeAssistantLead,
} from "../../src/modules/submissions/correctionBrief";
import { initialSubmissions } from "../../src/modules/submissions/mockData";
import type { Issue, Submission } from "../../src/modules/submissions/types";
import type { AiHelperResult } from "../../src/shared/ai-helper-contract";

function correctionSubmission(): Submission {
  const submission = initialSubmissions.find((item) => item.id === "ПД-1048");
  if (!submission) throw new Error("Expected correction fixture.");
  return structuredClone(submission);
}

function providerResult(summary: string): AiHelperResult {
  return {
    intent: "correction_draft",
    title: "Вступление",
    summary,
    suggestions: [],
    blockers: [],
    guardrails: ["Оператор проверяет текст вручную."],
    source: "edge-provider",
  };
}

describe("correction brief", () => {
  test("collects only open issues, groups by applicant, and keeps blockers first", () => {
    const submission = correctionSubmission();
    const closedIssue: Issue = {
      ...submission.issues[0]!,
      id: "closed-issue",
      status: "closed_by_admin",
      comment: "Этот пункт не должен попасть в сообщение.",
    };
    submission.issues.push(closedIssue);

    const brief = buildCorrectionBrief(submission);

    expect(brief.issueCount).toBe(2);
    expect(brief.blockerCount).toBe(2);
    expect(brief.groups).toHaveLength(2);
    expect(brief.text).toContain("Мария Иванова");
    expect(brief.text).toContain("София Иванова");
    expect(brief.text).not.toContain("Этот пункт не должен попасть");
    expect(
      brief.groups
        .flatMap((group) => group.issues)
        .every((issue) => issue.severity === "blocker"),
    ).toBe(true);
  });

  test("deduplicates repeated issues and removes unsafe promises and contact data", () => {
    const submission = correctionSubmission();
    const source = submission.issues[0]!;
    submission.issues.push({
      ...source,
      id: "duplicate",
    });
    submission.issues.push({
      ...source,
      id: "unsafe-sensitive",
      target: {
        applicantId: source.target.applicantId,
        applicantName: source.target.applicantName,
        field: "Контакт",
        section: "Контакты",
      },
      reason: "Мы гарантируем одобрение визы.",
      comment:
        "Мы гарантируем одобрение визы. Напишите test@example.com или +7 999 123-45-67.",
    });

    const brief = buildCorrectionBrief(submission);

    expect(brief.duplicateCount).toBe(1);
    expect(brief.redactionCount).toBeGreaterThan(0);
    expect(brief.text).not.toMatch(/гарантир|test@example\.com|999 123/iu);
    expect(brief.text).toContain("[email скрыт]");
    expect(brief.text).toContain("[телефон скрыт]");
  });

  test("accepts only concise Russian provider copy and never provider facts", () => {
    const fallback =
      "Здравствуйте! Для продолжения работы нужно исправить несколько пунктов.";

    expect(
      mergeAssistantLead(
        providerResult(
          "Здравствуйте! Чтобы продолжить проверку без задержек, пожалуйста, исправьте перечисленные ниже пункты.",
        ),
        fallback,
      ),
    ).toMatchObject({ accepted: true, reason: "accepted" });

    expect(
      mergeAssistantLead(
        providerResult("Please upload the missing passport and wait for approval."),
        fallback,
      ),
    ).toMatchObject({ accepted: false, intro: fallback, reason: "format" });

    expect(
      mergeAssistantLead(
        providerResult("Мы гарантируем одобрение визы после исправления."),
        fallback,
      ),
    ).toMatchObject({ accepted: false, intro: fallback, reason: "unsafe" });

    expect(
      mergeAssistantLead(
        providerResult("Напишите оператору на test@example.com для продолжения."),
        fallback,
      ),
    ).toMatchObject({ accepted: false, intro: fallback, reason: "sensitive" });

    expect(
      mergeAssistantLead(
        providerResult(
          "Здравствуйте! Загрузите паспорт и банковскую справку, затем продолжим.",
        ),
        fallback,
      ),
    ).toMatchObject({ accepted: false, intro: fallback, reason: "scope" });

    expect(
      mergeAssistantLead(
        providerResult(
          "Здравствуйте, Иван Иванов! Чтобы продолжить работу, проверьте перечисленные ниже пункты.",
        ),
        fallback,
      ),
    ).toMatchObject({ accepted: false, intro: fallback, reason: "sensitive" });

    expect(
      mergeAssistantLead(
        providerResult(
          "Здравствуйте! Для продолжения сообщите код 12 34 56 789 оператору.",
        ),
        fallback,
      ),
    ).toMatchObject({ accepted: false, intro: fallback, reason: "sensitive" });
  });

  test("critic blocks copying when an exact correction fact is removed or altered", () => {
    const brief = buildCorrectionBrief(correctionSubmission());
    const firstInstruction = brief.groups[0]?.issues[0]?.instruction;
    if (!firstInstruction) throw new Error("Expected correction instruction.");

    const missing = critiqueCorrectionBriefText(
      brief.text.replace(`• ${firstInstruction}`, ""),
      brief,
    );
    expect(missing.copyReady).toBe(false);
    expect(missing.missingIssueIds).toContain(brief.groups[0]?.issues[0]?.id);

    const changed = critiqueCorrectionBriefText(
      brief.text.replace(firstInstruction, "Не выполняйте этот пункт."),
      brief,
    );
    expect(changed.copyReady).toBe(false);

    const invented = critiqueCorrectionBriefText(
      `${brief.text}\n• Оплатите дополнительный сбор в размере 500 евро.`,
      brief,
    );
    expect(invented.copyReady).toBe(false);
    expect(invented.unexpectedInstructions).toEqual([
      "Оплатите дополнительный сбор в размере 500 евро.",
    ]);
    expect(
      invented.questions.some((question) => question.id === "remove-unverified-items"),
    ).toBe(true);

    const numbered = critiqueCorrectionBriefText(
      `${brief.text}\n1. Оплатите дополнительный сервисный сбор.`,
      brief,
    );
    expect(numbered.copyReady).toBe(false);
    expect(numbered.unexpectedInstructions).toContain(
      "Оплатите дополнительный сервисный сбор.",
    );

    const unbulleted = critiqueCorrectionBriefText(
      `${brief.text}\nПредоставьте дополнительную банковскую справку.`,
      brief,
    );
    expect(unbulleted.copyReady).toBe(false);
    expect(unbulleted.unexpectedInstructions).toContain(
      "Предоставьте дополнительную банковскую справку.",
    );
  });

  test("asks required questions when a correction target is ambiguous", () => {
    const submission = correctionSubmission();
    const source = submission.issues[0]!;
    submission.issues = [
      {
        ...source,
        id: "ambiguous",
        target: {
          applicantId: source.target.applicantId,
          applicantName: source.target.applicantName,
        },
        reason: "Нужно уточнить.",
        comment: "Нужно уточнить.",
      },
    ];

    const brief = buildCorrectionBrief(submission);

    expect(
      brief.questions.some(
        (question) =>
          question.priority === "required" && question.id.startsWith("target-"),
      ),
    ).toBe(true);
    expect(brief.checks.find((check) => check.id === "specificity")?.status).toBe(
      "warning",
    );
  });
});

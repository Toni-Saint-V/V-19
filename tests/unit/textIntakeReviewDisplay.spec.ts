import { describe, expect, test } from "vitest";
import { buildTextIntakeReviewDisplay } from "../../src/services/textIntakeReviewDisplay";
import {
  reviewBlsTextQuestionnaire,
  textIntakeReviewCodes,
  type BlsTextQuestionnaireInput,
} from "../../src/services/textIntakeReviewer";
import type {
  TextIntakeReviewCode,
  TextIntakeReviewFinding,
  TextIntakeReviewResult,
} from "../../src/services/textIntakeReviewer";
import { buildBlsTextReviewTrainingCorpus } from "../../src/services/textIntakeTrainingCorpus";

const allReviewCodes: TextIntakeReviewCode[] = [...textIntakeReviewCodes];

function finding(code: TextIntakeReviewCode): TextIntakeReviewFinding {
  const scope = code === "duplicate_passport" ? "submission" : "field";
  const applicantId = scope === "submission" ? undefined : "applicant-1";
  const relatedApplicantNames =
    code === "duplicate_passport" ||
    code === "shared_contact_requires_review" ||
    code === "family_trip_mismatch"
      ? ["Artem Sokolov", "Maria Sokolova"]
      : undefined;
  const fieldKey =
    scope === "submission"
      ? undefined
      : code === "invalid_email"
        ? "email"
        : "name";

  return {
    id: `${applicantId ?? "submission"}:${fieldKey ?? scope}:${code}`,
    code,
    severity: code === "name_too_short" ? "warning" : "blocking",
    scope,
    applicantId,
    applicantName: applicantId ? "Artem Sokolov" : undefined,
    fieldKey,
    fieldLabel: fieldKey === "email" ? "Email" : "ФИО",
    relatedApplicantNames,
    problem: `${code} raw English problem`,
    reason: `${code} raw English reason`,
    requiredAction:
      code === "duplicate_passport"
        ? "Check passport numbers for: Artem Sokolov, Maria Sokolova."
        : code === "shared_contact_requires_review"
          ? "Confirm shared contact data for: Artem Sokolov, Maria Sokolova."
          : code === "family_trip_mismatch"
            ? "Confirm family travel dates for: Artem Sokolov / Maria Sokolova."
            : `${code} raw English action`,
  };
}

function review(findings: TextIntakeReviewFinding[]): TextIntakeReviewResult {
  return {
    status: "needs_correction",
    readiness: 80,
    reviewedApplicants: 1,
    reviewedFields: 14,
    findings,
    correctionCandidates: findings.map((item) => ({
      id: `text-review:${item.id}`,
      target: item.fieldLabel ?? "Заявка",
      text: `${item.problem} ${item.requiredAction}`,
      scope: item.scope,
      applicantId: item.applicantId,
      fieldKey: item.fieldKey,
      severity: item.severity === "blocking" ? "blocking" : "note",
      status: "open",
    })),
    guardrails: [],
  };
}

describe("text intake review display adapter", () => {
  test("localizes every finding code before UI consumption", () => {
    const display = buildTextIntakeReviewDisplay(
      review(allReviewCodes.map(finding)),
    );
    const visibleCopy = [
      ...display.review.findings.flatMap((item) => [
        item.problem,
        item.reason,
        item.requiredAction,
      ]),
      ...display.review.correctionCandidates.map((item) => item.text),
      ...display.operatorSummary,
      ...display.agentFollowUpDrafts,
    ].join(" ");

    expect(new Set(display.review.findings.map((item) => item.code))).toEqual(
      new Set(allReviewCodes),
    );
    expect(display.review.correctionCandidates).toHaveLength(allReviewCodes.length);
    expect(visibleCopy).toContain("Email указан в некорректном формате");
    expect(visibleCopy).toContain("Проверьте номера паспортов для:");
    expect(visibleCopy).toContain("Подтвердите общий контакт для:");
    expect(visibleCopy).toContain("Подтвердите семейные даты поездки для:");
    expect(visibleCopy).not.toMatch(
      /raw English|Check passport|Confirm shared|Confirm family/i,
    );
  });

  test("prepares real BLS questionnaire findings for future UI without raw English actions", () => {
    const corpus: BlsTextQuestionnaireInput[] =
      buildBlsTextReviewTrainingCorpus().map((item) => item.input);
    const displayCopy = corpus
      .map((input) => buildTextIntakeReviewDisplay(reviewBlsTextQuestionnaire(input)))
      .flatMap((display) => [
        ...display.review.findings.flatMap((finding) => [
          finding.problem,
          finding.reason,
          finding.requiredAction,
        ]),
        ...display.review.correctionCandidates.map((candidate) => candidate.text),
        ...display.operatorSummary,
        ...display.agentFollowUpDrafts,
      ])
      .join(" ");

    expect(displayCopy).not.toMatch(
      /is missing|is invalid|Confirm |Correct |Check |Fill |Use DD\.MM\.YYYY|Enter numeric|raw English/i,
    );
    expect(displayCopy).toContain("Email указан в некорректном формате");
    expect(displayCopy).toContain("Паспорт заканчивается до даты поездки");
  });
});

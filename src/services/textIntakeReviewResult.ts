import type { CorrectionNote } from "../types/domain";
import type {
  TextIntakeReviewCode,
  TextIntakeReviewFinding,
  TextIntakeReviewResult,
  TextIntakeReviewSeverity,
} from "./textIntakeReviewTypes";

const severityRank: Record<TextIntakeReviewSeverity, number> = {
  blocking: 0,
  warning: 1,
  info: 2,
};

const scopeRank: Record<TextIntakeReviewFinding["scope"], number> = {
  field: 0,
  applicant: 1,
  submission: 2,
};

const codeRank: Partial<Record<TextIntakeReviewCode, number>> = {
  invalid_email: 10,
  weak_phone: 20,
  weak_passport_number: 30,
  passport_number_unexpected_format: 40,
  passport_expired_before_travel: 50,
  passport_issued_after_expiry: 60,
  passport_validity_too_short_after_departure: 70,
  passport_validity_period_unexpected: 80,
};

function findingFieldRank(finding: TextIntakeReviewFinding): number {
  switch (finding.fieldKey) {
    case "email":
      return 10;
    case "phone":
      return 20;
    case "passport":
      return 30;
    case "passportExpiresAt":
      return 40;
    case "passportIssuedAt":
      return 50;
    case "tripDates":
      return 60;
    default:
      return 100;
  }
}

function textKey(value: string | undefined): string {
  return value ?? "";
}

export function sortTextReviewFindings(
  findings: TextIntakeReviewFinding[],
): TextIntakeReviewFinding[] {
  return [...findings].sort((left, right) => {
    const severityDelta = severityRank[left.severity] - severityRank[right.severity];
    if (severityDelta) return severityDelta;

    const scopeDelta = scopeRank[left.scope] - scopeRank[right.scope];
    if (scopeDelta) return scopeDelta;

    const applicantDelta = [
      textKey(left.applicantName),
      textKey(left.applicantId),
    ]
      .join("|")
      .localeCompare([textKey(right.applicantName), textKey(right.applicantId)].join("|"));
    if (applicantDelta) return applicantDelta;

    const fieldDelta = findingFieldRank(left) - findingFieldRank(right);
    if (fieldDelta) return fieldDelta;

    const codeDelta = (codeRank[left.code] ?? 1_000) - (codeRank[right.code] ?? 1_000);
    if (codeDelta) return codeDelta;

    return [
      textKey(left.fieldLabel),
      textKey(left.fieldKey ? String(left.fieldKey) : undefined),
      left.code,
      left.id,
    ]
      .join("|")
      .localeCompare(
        [
          textKey(right.fieldLabel),
          textKey(right.fieldKey ? String(right.fieldKey) : undefined),
          right.code,
          right.id,
        ].join("|"),
      );
  });
}

export function uniqueTextReviewFindings(
  findings: TextIntakeReviewFinding[],
): TextIntakeReviewFinding[] {
  return sortTextReviewFindings(
    Array.from(new Map(findings.map((finding) => [finding.id, finding])).values()),
  );
}

export function toCorrectionCandidate(
  finding: TextIntakeReviewFinding,
): CorrectionNote {
  return {
    id: `text-review:${finding.id}`,
    target: finding.fieldLabel
      ? `${finding.applicantName ?? "Case"} · ${finding.fieldLabel}`
      : (finding.applicantName ?? "Case questionnaire"),
    text: `${finding.problem} ${finding.requiredAction}`,
    scope: finding.scope,
    applicantId: finding.applicantId,
    fieldKey: finding.fieldKey,
    severity: finding.severity === "blocking" ? "blocking" : "note",
    status: "open",
  };
}

export function reviewStatus(
  findings: TextIntakeReviewFinding[],
): TextIntakeReviewResult["status"] {
  if (findings.some((finding) => finding.severity === "blocking")) {
    return "needs_correction";
  }
  if (findings.length) return "needs_review";
  return "clear";
}

import type { CorrectionNote } from "../types/domain";
import type {
  TextIntakeReviewFinding,
  TextIntakeReviewResult,
} from "./textIntakeReviewTypes";

export function uniqueTextReviewFindings(
  findings: TextIntakeReviewFinding[],
): TextIntakeReviewFinding[] {
  return Array.from(new Map(findings.map((finding) => [finding.id, finding])).values());
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

import type { Issue, Submission } from "./types";

export function currentIssueTargetRevision(issue: Issue): number {
  return Number.isSafeInteger(issue.targetRevision) && (issue.targetRevision ?? 0) >= 0
    ? issue.targetRevision ?? 0
    : 0;
}

export function bumpOpenIssueTargetRevisions(
  submission: Submission,
  matchesTarget: (issue: Issue) => boolean,
): Submission {
  let changed = false;
  const issues = submission.issues.map((issue) => {
    if (issue.status !== "open" || !matchesTarget(issue)) return issue;
    changed = true;
    return {
      ...issue,
      agentConfirmation: undefined,
      targetRevision: currentIssueTargetRevision(issue) + 1,
    };
  });

  return changed ? { ...submission, issues } : submission;
}

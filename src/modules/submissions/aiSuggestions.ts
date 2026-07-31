import { generateAiSuggestions } from "./aiRules";
import {
  resolveAdminIssueTarget,
  type ResolvedAdminIssueTarget,
} from "./adminIssueTargetContract";
import { questionnaireFieldMatchesTarget } from "./questionnaire";
import { fileTypeLabels } from "./status";
import type { AiSuggestion, Issue, Role, Submission, SubmissionFile } from "./types";

export type AiReviewSurface = "agent" | "review" | "export";

const manageableAiStatuses = new Set<Submission["status"]>([
  "submitted_for_review",
  "corrections_received",
]);

const agentRunnableAiStatuses = new Set<Submission["status"]>([
  "draft",
  "in_progress",
  "requires_action",
  "returned",
]);

export function canManageAiSuggestions(submission: Submission, role: Role) {
  return role === "admin" && manageableAiStatuses.has(submission.status);
}

export function canRunAiReview(
  submission: Submission,
  role: Role,
  surface: AiReviewSurface,
) {
  if (surface === "export") return false;
  if (role === "admin") {
    return surface === "review" && manageableAiStatuses.has(submission.status);
  }
  return surface === "agent" && agentRunnableAiStatuses.has(submission.status);
}

export function runAiReview(submission: Submission): Submission {
  const generated = generateAiSuggestions(submission);
  const previous = submission.aiSuggestions ?? [];
  const retained = previous.filter((suggestion) => suggestion.status !== "suggested");
  const suggestions = [
    ...generated.filter(
      (suggestion) => !retained.some((item) => item.id === suggestion.id),
    ),
    ...retained,
  ];
  const activeCount = suggestions.filter(
    (suggestion) => suggestion.status === "suggested",
  ).length;

  return {
    ...submission,
    aiReviewState: "ready",
    aiSuggestions: suggestions,
    updatedAt: "сейчас",
    history: [
      {
        id: `и-${submission.id}-бб-проверка-${submission.history.length + 1}`,
        text: "ББ-проверка запущена",
        detail: `Активных подсказок для ручной проверки: ${activeCount}`,
        source: "bb",
        at: "сейчас",
      },
      ...submission.history,
    ],
  };
}

export function acceptAiSuggestionAsIssue(
  submission: Submission,
  suggestionId: string,
  role: Role,
): Submission {
  if (!canManageAiSuggestions(submission, role)) return submission;

  const suggestion = submission.aiSuggestions?.find((item) => item.id === suggestionId);
  if (!suggestion || suggestion.status !== "suggested") {
    return submission;
  }

  let resolvedTarget: ResolvedAdminIssueTarget;
  try {
    resolvedTarget = resolveAdminIssueTarget(submission, {
      applicantId: suggestion.target.applicantId,
      field: suggestion.target.field,
      fileType: suggestion.target.fileType,
      type: suggestion.type,
    });
  } catch {
    return submission;
  }

  const issue = issueFromSuggestion(submission, suggestion, resolvedTarget);
  if (hasMatchingIssue(submission, issue)) return submission;
  const withTargetFlag = markSuggestionTargetForReplacement(submission, issue);

  return {
    ...withTargetFlag,
    issues: [issue, ...withTargetFlag.issues],
    aiSuggestions: withTargetFlag.aiSuggestions?.map((item) =>
      item.id === suggestionId ? { ...item, status: "accepted_by_admin" } : item,
    ),
    updatedAt: "сейчас",
    history: [
      {
        id: `и-${submission.id}-бб-замечание-${submission.history.length + 1}`,
        text: "Подсказка ББ принята администратором",
        detail: suggestionAuditTarget(suggestion),
        source: "bb",
        at: "сейчас",
      },
      ...withTargetFlag.history,
    ],
  };
}

export function dismissAiSuggestion(
  submission: Submission,
  suggestionId: string,
  role: Role,
): Submission {
  if (!canManageAiSuggestions(submission, role)) return submission;
  const suggestion = submission.aiSuggestions?.find((item) => item.id === suggestionId);
  if (!suggestion || suggestion.status !== "suggested") return submission;

  return {
    ...submission,
    aiSuggestions: submission.aiSuggestions?.map((suggestion) =>
      suggestion.id === suggestionId
        ? { ...suggestion, status: "dismissed_by_admin" }
        : suggestion,
    ),
    updatedAt: "сейчас",
    history: [
      {
        id: `и-${submission.id}-бб-отклонено-${submission.history.length + 1}`,
        text: "Подсказка ББ отклонена администратором",
        detail: suggestionAuditTarget(suggestion),
        source: "bb",
        at: "сейчас",
      },
      ...submission.history,
    ],
  };
}

export function activeAiSuggestions(submission: Submission) {
  return (submission.aiSuggestions ?? []).filter(
    (suggestion) => suggestion.status === "suggested",
  );
}

function issueFromSuggestion(
  submission: Submission,
  suggestion: AiSuggestion,
  resolvedTarget: ResolvedAdminIssueTarget,
): Issue {
  const target =
    resolvedTarget.kind === "field"
      ? {
          applicantId: resolvedTarget.applicant.id,
          applicantName: resolvedTarget.applicant.fullName,
          field: resolvedTarget.field,
          section: suggestion.target.section,
        }
      : {
          applicantId: resolvedTarget.applicant.id,
          applicantName: resolvedTarget.applicant.fullName,
          fileType: resolvedTarget.fileType,
          section: suggestion.target.section,
        };

  return {
    id: `зм-${submission.id}-бб-${submission.issues.length + 1}`,
    type: resolvedTarget.kind === "field" ? "field" : "file",
    target,
    reason: suggestion.title,
    comment: `${suggestion.reason} Рекомендация требует человеческого подтверждения.`,
    severity: suggestion.severity,
    status: "open",
    createdBy: "admin",
    createdAt: "сейчас",
    snapshot: suggestionSnapshot(submission, target),
  };
}

function suggestionAuditTarget(suggestion: AiSuggestion) {
  const parts = [
    suggestion.target.applicantName,
    suggestion.target.section,
    suggestion.target.field,
    suggestion.target.fileType ? fileTypeLabels[suggestion.target.fileType] : undefined,
  ];
  return parts.filter(Boolean).join(" · ");
}

function hasMatchingIssue(submission: Submission, candidate: Issue) {
  return submission.issues.some(
    (issue) =>
      issue.target.applicantId === candidate.target.applicantId &&
      issue.target.field === candidate.target.field &&
      issue.target.fileType === candidate.target.fileType &&
      issue.status !== "closed_by_admin",
  );
}

function suggestionSnapshot(submission: Submission, target: Issue["target"]) {
  if (target.fileType) {
    return submission.files.find(
      (file) =>
        file.applicantId === target.applicantId && file.type === target.fileType,
    )?.status;
  }

  const applicant = submission.applicants.find(
    (item) => item.id === target.applicantId,
  );
  return applicant?.sections
    .flatMap((section) => section.fields)
    .find((field) => questionnaireFieldMatchesTarget(field, target.field))?.value;
}

function markSuggestionTargetForReplacement(
  submission: Submission,
  issue: Issue,
): Submission {
  if (!issue.target.fileType) return submission;
  const files = submission.files.map((file) =>
    file.applicantId === issue.target.applicantId && file.type === issue.target.fileType
      ? { ...file, status: "needs_replacement" as const, linkedIssueId: issue.id }
      : file,
  );
  const filePercent = fileCompleteness(files);

  return {
    ...submission,
    applicants: submission.applicants.map((applicant) =>
      applicant.id === issue.target.applicantId
        ? { ...applicant, fileStatus: "needs_fix" }
        : applicant,
    ),
    files,
    completeness: {
      ...submission.completeness,
      files: filePercent,
      total: Math.round((submission.completeness.questionnaire + filePercent) / 2),
    },
  };
}

function fileCompleteness(files: SubmissionFile[]) {
  if (!files.length) return 0;
  const ready = files.filter(
    (file) => file.status !== "missing" && file.status !== "needs_replacement",
  ).length;
  return Math.round((ready / files.length) * 100);
}

import type { AiHelperActor, AiHelperResult } from "../../shared/ai-helper-contract";
import {
  acceptanceBlockingIssueCount,
  blockerCount,
  canPerformAction,
  fixedIssueCount,
  openIssueCount,
} from "./status";
import type { Issue, Submission } from "./types";

export type AdminAiRunStatus = "idle" | "loading" | "ready" | "unavailable" | "failed";

export type AdminAiFeatureKey =
  | "review"
  | "nextAction"
  | "issueDraft"
  | "readiness";

export interface AdminAiDrawerState {
  error?: string;
  nextAction?: AiHelperResult;
  readiness?: AiHelperResult;
  review?: AiHelperResult;
  status: AdminAiRunStatus;
}

export interface AdminAiRemarkDraftState {
  error?: string;
  status: AdminAiRunStatus;
}

export const adminAiActor: AiHelperActor = {
  id: "admin-drawer",
  role: "admin",
  canUseAI: true,
};

const unavailableCopy = "Недоступно: локальный AI не настроен";

function issueCodeFor(issue: Issue): string {
  if (issue.status === "open" && issue.severity === "blocker") {
    return "blocking_issue_open";
  }
  if (issue.target.fileType === "passport_scan") return "missing_passport_scan";
  if (issue.target.fileType === "selfie") return "missing_selfie";
  if (issue.target.fileType === "selfie_2") return "missing_selfie_2";
  if (issue.type === "file" || issue.type === "media") return "missing_media";
  return "questionnaire_incomplete";
}

function applicantContext(submission: Submission) {
  return submission.applicants.map((applicant) => {
    const applicantIssues = submission.issues.filter(
      (issue) => issue.target.applicantId === applicant.id,
    );

    return {
      role: applicant.role,
      readinessState: applicant.questionnaireStatus,
      fieldCompletion: applicant.questionnaireStatus === "complete" ? 100 : 0,
      mediaUploaded: submission.files.filter(
        (file) => file.applicantId === applicant.id && file.status !== "missing",
      ).length,
      mediaRequired: submission.files.filter(
        (file) => file.applicantId === applicant.id,
      ).length,
      findings: applicantIssues.map((issue) => ({
        code: issueCodeFor(issue),
        severity: issue.severity,
        status: issue.status,
      })),
    };
  });
}

export function buildAdminAiContext(
  submission: Submission,
  feature: AdminAiFeatureKey,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const acceptedMedia = submission.files.filter(
    (file) => file.status === "accepted",
  ).length;
  const uploadedMedia = submission.files.filter(
    (file) => file.status !== "missing",
  ).length;
  const canAccept = canPerformAction(submission, "accept", "admin");
  const canCloseAndAccept = canPerformAction(
    submission,
    "close_issues_accept",
    "admin",
  );
  const canExport = canPerformAction(submission, "generate_export", "admin");

  return {
    feature,
    submissionId: submission.id,
    type: submission.type,
    status: submission.status,
    country: submission.country,
    countryCode: submission.countryCode ?? "ES",
    submissionCity: submission.city,
    applicantCount: submission.applicants.length,
    fieldCompletion: submission.completeness.questionnaire,
    mediaRequired: submission.files.length,
    mediaUploaded: uploadedMedia,
    mediaAccepted: acceptedMedia,
    openIssueCount: openIssueCount(submission),
    blockingIssueCount: blockerCount(submission),
    warningIssueCount: submission.issues.filter(
      (issue) => issue.status === "open" && issue.severity === "warning",
    ).length,
    fixedIssueCount: fixedIssueCount(submission),
    acceptanceBlockingIssueCount: acceptanceBlockingIssueCount(submission),
    canSubmit: canAccept.ok || canCloseAndAccept.ok,
    canExport: canExport.ok,
    issues: submission.issues.map((issue) => ({
      code: issueCodeFor(issue),
      severity: issue.severity,
      status: issue.status,
    })),
    applicants: applicantContext(submission),
    ...extra,
  };
}

export function buildAdminIssueDraftContext(input: {
  field: string;
  reason: string;
  sectionLabel?: string;
  submission: Submission;
  targetType: string;
}): Record<string, unknown> {
  return buildAdminAiContext(input.submission, "issueDraft", {
    target: {
      state: "needs_correction",
      section: input.sectionLabel ? "questionnaire_incomplete" : "missing_media",
      type: input.targetType,
    },
    draftBasis: {
      code: input.field ? "questionnaire_incomplete" : "missing_media",
      severity: "blocking",
      status: "open",
      reasonState: input.reason ? "needs_correction" : "missing",
    },
  });
}

export function nextActionCopy(
  state: AdminAiDrawerState,
  fallbackActionLabel: string,
): string {
  if (state.status === "loading") {
    return "Следующее действие: идет предварительная проверка AI-помощником.";
  }

  if (state.status === "unavailable") {
    return `Следующее действие: ручная проверка администратором. ${unavailableCopy}.`;
  }

  if (state.status === "failed") {
    return "Следующее действие: ручная проверка администратором. AI-помощник не дал безопасный результат.";
  }

  const suggested =
    state.nextAction?.nextAction ||
    state.nextAction?.suggestions[0] ||
    state.review?.nextAction ||
    state.review?.suggestions[0];

  return `Следующее действие: ${suggested ?? fallbackActionLabel}. Администратор подтверждает вручную.`;
}

export function unavailableAdminAiState(): AdminAiDrawerState {
  return {
    status: "unavailable",
    error: unavailableCopy,
  };
}

export function failedAdminAiState(): AdminAiDrawerState {
  return {
    status: "failed",
    error: "AI-помощник не вернул безопасный результат.",
  };
}

// src/modules/submissions/adminAiAssistance.ts
import type { AiHelperActor, AiHelperResult } from "../../shared/ai-helper-contract";
import type { AdminAiReviewModel } from "./adminAiReviewModel";
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
  | "readiness"
  | "correctionBrief";

export interface AdminAiDrawerState {
  error?: string;
  localReview?: AdminAiReviewModel;
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

const providerDecisionPattern =
  /(?:гарантир|одобрен|принят|готов\w*\s+к\s+выгруз|(?:пакет|заявк|документ)\w*\s+(?:полностью\s+)?готов|можно\s+(?:принять|выгружать|закрыть)|(?:ошиб|блокер|замечан)\w*\s+(?:не\s+)?(?:найден|нет)|данн\w*\s+(?:корректн|совпад)|выгруз(?:ить|ите)|закры(?:ть|вайте)\s+замеч|смен(?:ить|ите)\s+статус|автоматическ\w*\s+(?:прин|верн|отправ|закр)|ocr|mrz|паспорт\w*\s+(?:подтвержд|проверен))/iu;
const providerSensitivePattern =
  /(?:https?:\/\/|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b(?:\d[\s-]?){8}\d\b|\+?\d[\d\s().-]{8,}\d|\b[А-ЯЁ][а-яё]{2,}\s+[А-ЯЁ][а-яё]{2,}\b|здравствуйте\s*,\s*[А-ЯЁ][а-яё]{2,})/iu;
const providerMarkdownPattern = /```|~~~|^\s{0,3}#{1,6}\s/mu;
const providerInvisiblePattern = /[\u200B-\u200D\u2060\uFEFF]/u;
const providerReviewCuePattern =
  /(?:проверь|уточн|подтверд|свер|оцен|недостат|неясн|ручн|вопрос|риск|данн)/iu;
const cyrillicPattern = /[А-ЯЁа-яё]/gu;

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

function applicantContext(submission: Submission, issues: Issue[] = submission.issues) {
  return submission.applicants.map((applicant, index) => {
    const applicantIssues = issues.filter(
      (issue) => issue.target.applicantId === applicant.id,
    );

    return {
      index: index + 1,
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

function privacySafeSubmissionContext(
  submission: Submission,
  issues: Issue[] = submission.issues,
): Record<string, unknown> {
  return {
    type: submission.type,
    status: submission.status,
    countryCode: submission.countryCode ?? "ES",
    applicantCount: submission.applicants.length,
    fieldCompletion: submission.completeness.questionnaire,
    mediaRequired: submission.files.length,
    mediaUploaded: submission.files.filter((file) => file.status !== "missing").length,
    mediaAccepted: submission.files.filter((file) => file.status === "accepted").length,
    issues: issues.map((issue) => ({
      code: issueCodeFor(issue),
      severity: issue.severity,
      status: issue.status,
    })),
    applicants: applicantContext(submission, issues),
  };
}

export function buildAdminAiContext(
  submission: Submission,
  feature: AdminAiFeatureKey,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const canAccept = canPerformAction(submission, "accept", "admin");
  const canCloseAndAccept = canPerformAction(
    submission,
    "close_issues_accept",
    "admin",
  );
  const canExport = canPerformAction(submission, "generate_export", "admin");

  return {
    feature,
    ...privacySafeSubmissionContext(submission),
    openIssueCount: openIssueCount(submission),
    blockingIssueCount: blockerCount(submission),
    warningIssueCount: submission.issues.filter(
      (issue) => issue.status === "open" && issue.severity === "warning",
    ).length,
    fixedIssueCount: fixedIssueCount(submission),
    acceptanceBlockingIssueCount: acceptanceBlockingIssueCount(submission),
    canSubmit: canAccept.ok || canCloseAndAccept.ok,
    canExport: canExport.ok,
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

export function buildAdminCorrectionBriefContext(
  submission: Submission,
  localReview?: AdminAiReviewModel,
): Record<string, unknown> {
  const openIssues = submission.issues.filter((issue) => issue.status === "open");

  return {
    feature: "correctionBrief",
    ...privacySafeSubmissionContext(submission, openIssues),
    openIssueCount: openIssues.length,
    blockingIssueCount: openIssues.filter((issue) => issue.severity === "blocker")
      .length,
    warningIssueCount: openIssues.filter((issue) => issue.severity === "warning")
      .length,
    requiresAction: openIssues.length > 0,
    localEvidenceScore: localReview?.evidenceScore,
    questionCount: localReview?.questions.length,
  };
}

export function buildAdminAiReviewContext(
  submission: Submission,
  localReview: AdminAiReviewModel,
): Record<string, unknown> {
  const canAccept = canPerformAction(submission, "accept", "admin");
  const canCloseAndAccept = canPerformAction(
    submission,
    "close_issues_accept",
    "admin",
  );
  const canExport = canPerformAction(submission, "generate_export", "admin");

  return {
    ...buildAdminCorrectionBriefContext(submission, localReview),
    feature: "review",
    acceptanceBlockingIssueCount: acceptanceBlockingIssueCount(submission),
    canSubmit: canAccept.ok || canCloseAndAccept.ok,
    canExport: canExport.ok,
    readinessState: localReview.status,
  };
}

export function safeAdminProviderNotes(result: AiHelperResult | undefined): string[] {
  if (!result) return [];

  const candidates = [
    ...(result.operatorSummary ?? []),
    ...(result.adminReviewChecklist ?? []),
    ...(result.suggestions ?? []),
    result.readinessExplanation,
    result.summary,
  ];
  const unique = new Set<string>();
  const notes: string[] = [];

  for (const candidate of candidates) {
    const normalized = candidate?.replace(/\s+/gu, " ").trim() ?? "";
    if (normalized.length < 24 || normalized.length > 280) continue;
    if (
      providerDecisionPattern.test(normalized) ||
      providerSensitivePattern.test(normalized) ||
      providerMarkdownPattern.test(normalized) ||
      providerInvisiblePattern.test(normalized) ||
      !providerReviewCuePattern.test(normalized)
    ) {
      continue;
    }

    const cyrillicLetters = normalized.match(cyrillicPattern) ?? [];
    cyrillicPattern.lastIndex = 0;
    if (cyrillicLetters.length < 8) continue;

    const comparisonKey = normalized.toLocaleLowerCase("ru");
    if (unique.has(comparisonKey)) continue;
    unique.add(comparisonKey);
    notes.push(normalized);
    if (notes.length === 3) break;
  }

  return notes;
}

export function nextActionCopy(
  state: AdminAiDrawerState,
  fallbackActionLabel: string,
): string {
  const localSuggestion = state.localReview?.nextAction;
  if (localSuggestion) {
    const providerNote =
      state.status === "loading"
        ? "AI-пояснение загружается; локальная рекомендация уже рассчитана."
        : state.status === "unavailable"
          ? `${unavailableCopy}; локальная рекомендация сохранена.`
          : state.status === "failed"
            ? "Ответ AI отклонён; локальная рекомендация сохранена."
            : "";

    return [
      `Следующее действие: ${withoutTerminalPunctuation(localSuggestion)}.`,
      providerNote,
      "Администратор подтверждает вручную.",
    ]
      .filter(Boolean)
      .join(" ");
  }

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
    state.review?.suggestions[0] ||
    fallbackActionLabel;

  return `Следующее действие: ${withoutTerminalPunctuation(suggested)}. Администратор подтверждает вручную.`;
}

function withoutTerminalPunctuation(value: string): string {
  return value.trim().replace(/[.!?]+$/u, "");
}

export function unavailableAdminAiState(
  localReview?: AdminAiReviewModel,
): AdminAiDrawerState {
  return {
    status: "unavailable",
    error: unavailableCopy,
    localReview,
  };
}

export function failedAdminAiState(
  localReview?: AdminAiReviewModel,
): AdminAiDrawerState {
  return {
    status: "failed",
    error: "AI-помощник не вернул безопасный результат.",
    localReview,
  };
}

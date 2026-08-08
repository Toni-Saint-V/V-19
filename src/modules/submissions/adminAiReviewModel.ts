// src/modules/submissions/adminAiReviewModel.ts
import {
  buildCaseCopilotBrief,
  formatCaseCopilotHighlight,
  type CaseCopilotHighlight,
  type CaseCopilotStatus,
} from "./caseCopilot";
import { buildCorrectionBrief, type CorrectionBriefQuestion } from "./correctionBrief";
import { buildIdentityConsistencyReport } from "./identityConsistency";
import {
  blockerCount,
  fixedIssueCount,
  openIssueCount,
  unresolvedOpenIssueCount,
} from "./status";
import type { Submission, SubmissionFileStatus } from "./types";

export type AdminAiEvidenceConfidence = "high" | "medium" | "low";

export interface AdminAiReviewSignal {
  detail: string;
  id: string;
  label: string;
  source: string;
  status: CaseCopilotStatus;
}

export interface AdminAiReviewQuestion {
  id: string;
  priority: "required" | "recommended";
  question: string;
  reason: string;
}

export interface AdminAiReviewModel {
  blockerCount: number;
  checklist: string[];
  confidence: AdminAiEvidenceConfidence;
  evidenceScore: number;
  guardrails: string[];
  headline: string;
  issueCount: number;
  modelVersion: "local-admin-copilot-v2";
  nextAction: string;
  nextActionReason: string;
  providerRecommended: boolean;
  questions: AdminAiReviewQuestion[];
  signals: AdminAiReviewSignal[];
  status: CaseCopilotStatus;
  summary: string;
  unresolvedCount: number;
}

export function buildAdminAiReviewModel(submission: Submission): AdminAiReviewModel {
  const copilot = buildCaseCopilotBrief({
    role: "admin",
    submission,
    surface: "review",
  });
  const identity = buildIdentityConsistencyReport(submission);
  const correction = buildCorrectionBrief(submission);
  const fileCounts = submissionFileCounts(submission);
  const questions = buildReviewQuestions({
    correctionQuestions: correction.questions,
    fileCounts,
    identity,
    submission,
  });
  const requiredQuestions = questions.filter(
    (question) => question.priority === "required",
  ).length;
  const evidenceScore = adminEvidenceScore({
    correctionScore: correction.qualityScore,
    fileCounts,
    identityBlocked: identity.totals.blocked,
    identityNeedsReview: identity.totals.needsReview,
    questionnaireCompletion: submission.completeness.questionnaire,
    requiredQuestions,
  });
  const confidence = confidenceFor(evidenceScore, requiredQuestions);
  const signals = copilot.highlights.map((highlight) => reviewSignal(highlight));
  const checklist = reviewChecklist(copilot.highlights, correction.checks);

  return {
    blockerCount: blockerCount(submission) + identity.totals.blocked,
    checklist,
    confidence,
    evidenceScore,
    guardrails: [
      "Факты и доступность действий определяются только доменными правилами.",
      "AI не принимает заявку, не закрывает замечания и не меняет статус.",
      "Перед отправкой сообщения оператор проверяет формулировки вручную.",
    ],
    headline: headlineFor(copilot.status, questions.length),
    issueCount: openIssueCount(submission),
    modelVersion: "local-admin-copilot-v2",
    nextAction: copilot.nextStep.label,
    nextActionReason: copilot.reason,
    providerRecommended:
      questions.length > 0 ||
      correction.qualityScore < 90 ||
      copilot.status === "needs_review",
    questions,
    signals,
    status: copilot.status,
    summary: summaryFor({
      confidence,
      evidenceScore,
      fileCounts,
      fixedIssues: fixedIssueCount(submission),
      identityFindings: identity.totals.findings,
      questionnaireCompletion: submission.completeness.questionnaire,
      unresolvedIssues: unresolvedOpenIssueCount(submission),
    }),
    unresolvedCount: unresolvedOpenIssueCount(submission) + identity.totals.findings,
  };
}

export function adminAiReviewProviderContext(
  model: AdminAiReviewModel,
): Record<string, unknown> {
  return {
    localEvidenceScore: model.evidenceScore,
    blockingIssueCount: model.blockerCount,
    openIssueCount: model.issueCount,
    requiresAction: model.status === "blocked" || model.status === "needs_review",
    questions: model.questions.map((question) => ({
      severity: question.priority === "required" ? "blocking" : "warning",
      status: "open",
    })),
    readinessState: model.status,
  };
}

function reviewSignal(highlight: CaseCopilotHighlight): AdminAiReviewSignal {
  return {
    detail: formatCaseCopilotHighlight(highlight),
    id: `${highlight.kind}-${highlight.source}`,
    label: highlight.label,
    source: highlight.source,
    status: highlight.status,
  };
}

function reviewChecklist(
  highlights: CaseCopilotHighlight[],
  checks: ReturnType<typeof buildCorrectionBrief>["checks"],
): string[] {
  const attentionSignals = highlights
    .filter(
      (highlight) =>
        highlight.status === "blocked" ||
        highlight.status === "needs_review" ||
        highlight.status === "waiting",
    )
    .slice(0, 4)
    .map((highlight) => `${highlight.label}: ${highlight.summary}`);
  const qualityWarnings = checks
    .filter((check) => check.status !== "pass")
    .slice(0, 2)
    .map((check) => `${check.label}: ${check.detail}`);

  if (attentionSignals.length || qualityWarnings.length) {
    return [...attentionSignals, ...qualityWarnings].slice(0, 5);
  }

  return highlights
    .slice(0, 4)
    .map((highlight) => `${highlight.label}: ${highlight.summary}`);
}

function buildReviewQuestions(input: {
  correctionQuestions: CorrectionBriefQuestion[];
  fileCounts: Record<SubmissionFileStatus, number>;
  identity: ReturnType<typeof buildIdentityConsistencyReport>;
  submission: Submission;
}): AdminAiReviewQuestion[] {
  const questions: AdminAiReviewQuestion[] = input.correctionQuestions
    .slice(0, 4)
    .map((question) => ({
      id: `correction-${question.id}`,
      priority: question.priority,
      question: question.question,
      reason: question.reason,
    }));

  if (input.identity.totals.blocked || input.identity.totals.needsReview) {
    questions.unshift({
      id: "identity-source",
      priority: input.identity.totals.blocked ? "required" : "recommended",
      question:
        "Какой подтверждённый источник использовать для каждого расхождения личности?",
      reason: "Анкета, распознавание паспорта и PDF могут содержать разные значения.",
    });
  }

  if (input.fileCounts.missing > 0) {
    questions.push({
      id: "missing-required-media",
      priority: "required",
      question: "Какие обязательные файлы отсутствуют и у кого их нужно запросить?",
      reason: `Отсутствуют обязательные файлы: ${input.fileCounts.missing}.`,
    });
  }

  if (input.fileCounts.pending_review > 0) {
    questions.push({
      id: "pending-media-review",
      priority: "required",
      question: "Каждый ожидающий файл просмотрен визуально в полном размере?",
      reason: `Ожидают ручной проверки: ${input.fileCounts.pending_review}.`,
    });
  }

  if (input.fileCounts.needs_replacement > 0) {
    questions.push({
      id: "replacement-reason",
      priority: "required",
      question: "Для каждого заменяемого файла указана точная и проверяемая причина?",
      reason: `Требуют замены: ${input.fileCounts.needs_replacement}.`,
    });
  }

  if (
    input.submission.completeness.questionnaire < 100 &&
    !questions.some((question) => question.id.startsWith("correction-"))
  ) {
    questions.push({
      id: "questionnaire-gap",
      priority: "recommended",
      question: "Какое обязательное поле анкеты ещё не подтверждено?",
      reason: `Заполнение анкеты: ${input.submission.completeness.questionnaire}%.`,
    });
  }

  return uniqueQuestions(questions).slice(0, 6);
}

function submissionFileCounts(
  submission: Submission,
): Record<SubmissionFileStatus, number> {
  const counts: Record<SubmissionFileStatus, number> = {
    accepted: 0,
    missing: 0,
    needs_replacement: 0,
    pending_review: 0,
    uploaded: 0,
  };

  for (const file of submission.files) {
    counts[file.status] += 1;
  }

  return counts;
}

function adminEvidenceScore(input: {
  correctionScore: number;
  fileCounts: Record<SubmissionFileStatus, number>;
  identityBlocked: number;
  identityNeedsReview: number;
  questionnaireCompletion: number;
  requiredQuestions: number;
}): number {
  const fileUncertainty =
    input.fileCounts.pending_review * 6 +
    input.fileCounts.needs_replacement * 10 +
    input.fileCounts.missing * 12;
  const identityUncertainty =
    input.identityBlocked * 18 + input.identityNeedsReview * 10;
  const questionnaireUncertainty = Math.round(
    Math.max(0, 100 - input.questionnaireCompletion) * 0.18,
  );
  const questionUncertainty = input.requiredQuestions * 8;
  const correctionUncertainty = Math.round(
    Math.max(0, 100 - input.correctionScore) * 0.25,
  );

  return clamp(
    100 -
      fileUncertainty -
      identityUncertainty -
      questionnaireUncertainty -
      questionUncertainty -
      correctionUncertainty,
  );
}

function confidenceFor(
  score: number,
  requiredQuestions: number,
): AdminAiEvidenceConfidence {
  if (score >= 82 && requiredQuestions === 0) return "high";
  if (score >= 55 && requiredQuestions <= 2) return "medium";
  return "low";
}

function headlineFor(status: CaseCopilotStatus, questionCount: number): string {
  if (status === "blocked") return "Сначала закройте проверяемые блокеры";
  if (status === "needs_review") {
    return questionCount
      ? "Есть вопросы перед решением"
      : "Нужна точечная ручная проверка";
  }
  if (status === "waiting") return "Пакет ожидает внешний шаг";
  if (status === "ready") return "Данные готовы к ручному решению";
  return "Работа по пакету завершена";
}

function summaryFor(input: {
  confidence: AdminAiEvidenceConfidence;
  evidenceScore: number;
  fileCounts: Record<SubmissionFileStatus, number>;
  fixedIssues: number;
  identityFindings: number;
  questionnaireCompletion: number;
  unresolvedIssues: number;
}): string {
  const confidenceLabel = {
    high: "высокая",
    medium: "средняя",
    low: "низкая",
  }[input.confidence];

  return [
    `Достаточность проверяемых данных: ${input.evidenceScore}/100 (${confidenceLabel}).`,
    `Анкета ${input.questionnaireCompletion}%.`,
    `Открытых замечаний ${input.unresolvedIssues}, исправлений на сверке ${input.fixedIssues}.`,
    `Файлов на проверке ${input.fileCounts.pending_review}, на замене ${input.fileCounts.needs_replacement}.`,
    `Расхождений личности ${input.identityFindings}.`,
  ].join(" ");
}

function uniqueQuestions(questions: AdminAiReviewQuestion[]): AdminAiReviewQuestion[] {
  const seen = new Set<string>();
  const result: AdminAiReviewQuestion[] = [];

  for (const question of questions) {
    const key = question.question.toLocaleLowerCase("ru").trim();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(question);
  }

  return result.sort((left, right) => {
    if (left.priority === right.priority) return 0;
    return left.priority === "required" ? -1 : 1;
  });
}

function clamp(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

import type { Submission } from "../types/domain";
import {
  blockers,
  familySuggestion,
  mediaLifecycleCounts,
  readiness,
  submissionPreflight,
  typeLabel,
} from "../lib/workflow";
import { buildExportPlan } from "./exportService";
import { buildTextIntakeReviewDisplay } from "./textIntakeReviewDisplay";
import { reviewTextIntake, type TextIntakeReviewResult } from "./textIntakeReviewer";

export type AiHelperIntent =
  | "readiness_summary"
  | "text_intake_review"
  | "admin_review"
  | "correction_draft"
  | "export_guard";

export interface AiHelperResult {
  intent: AiHelperIntent;
  title: string;
  summary: string;
  suggestions: string[];
  blockers: string[];
  guardrails: string[];
  source: "local-stub" | "edge-stub";
  textReview?: TextIntakeReviewResult;
  operatorSummary?: string[];
  agentFollowUpDrafts?: string[];
}

const helperGuardrails = [
  "Подсказка не является решением.",
  "Детерминированные проверки остаются источником истины.",
  "Оператор принимает медиа и заявку вручную.",
];

export function buildReadinessSummary(submission: Submission): AiHelperResult {
  const preflight = submissionPreflight(submission);
  const family = familySuggestion(submission);
  const suggestions = preflight.canSubmit
    ? ["Проверьте комплект визуально и передайте заявку оператору."]
    : preflight.blockers.slice(0, 3).map((blocker) => `Закрыть: ${blocker}`);

  if (submission.type === "family" && family.suggested) {
    suggestions.push(
      submission.familyIntelligence?.status === "confirmed"
        ? "Семейные роли уже подтверждены агентом."
        : "Подтвердите семейную группу вручную перед передачей.",
    );
  }

  return {
    intent: "readiness_summary",
    title: preflight.canSubmit ? "Пакет выглядит готовым" : "Есть блокеры",
    summary: `Готовность ${preflight.readiness}%. Загружено ${preflight.media.uploaded}/${preflight.media.required}, принято оператором ${preflight.media.accepted}/${preflight.media.required}.`,
    suggestions,
    blockers: preflight.blockers,
    guardrails: helperGuardrails,
    source: "local-stub",
  };
}

export function buildTextIntakeReview(submission: Submission): AiHelperResult {
  const review = reviewTextIntake(submission);
  const display = buildTextIntakeReviewDisplay(review);

  return {
    intent: "text_intake_review",
    title:
      review.status === "clear"
        ? "Текст анкеты без явных блокеров"
        : review.status === "needs_correction"
          ? "Текст анкеты требует исправлений"
          : "Текст анкеты требует ручной проверки",
    summary: `Проверено ${review.reviewedApplicants} заявителя(ей), ${review.reviewedFields} текстовых полей. Найдено ${review.findings.length} замечаний.`,
    suggestions: display.topFindings.length
      ? display.topFindings.map((finding) => finding.requiredAction)
      : ["Можно продолжать deterministic readiness/preflight перед передачей."],
    blockers: display.blockingFindings.map((finding) =>
      finding.applicantName
        ? `${finding.applicantName}: ${finding.problem}`
        : finding.problem,
    ),
    guardrails: [...helperGuardrails, ...review.guardrails],
    source: "local-stub",
    textReview: display.review,
    operatorSummary: display.operatorSummary,
    agentFollowUpDrafts: display.agentFollowUpDrafts,
  };
}

export function buildAdminReviewSummary(submission: Submission): AiHelperResult {
  const media = mediaLifecycleCounts(submission);
  const openBlockers = blockers(submission);
  const suggestions = [
    `Сначала проверьте ${typeLabel(submission.type).toLowerCase()} и ${submission.applicants.length} заявителя(ей).`,
    `Медиа: ${media.uploaded}/${media.required} загружено, ${media.accepted}/${media.required} принято оператором.`,
  ];

  if (openBlockers.length) {
    suggestions.push("Верните точечные замечания агенту вместо общего комментария.");
  } else if (media.accepted < media.required) {
    suggestions.push("Примите каждый файл вручную или запросите замену с причиной.");
  } else {
    suggestions.push("Если визуальная проверка завершена, можно принять заявку.");
  }

  return {
    intent: "admin_review",
    title: openBlockers.length ? "Нужна ручная проверка блокеров" : "Фокус проверки",
    summary: `Статус: ${submission.status}. Готовность ${readiness(submission)}%.`,
    suggestions,
    blockers: openBlockers,
    guardrails: helperGuardrails,
    source: "local-stub",
  };
}

export function draftCorrectionText(
  submission: Submission,
  targetLabel: string,
): AiHelperResult {
  const isMedia = targetLabel.toLowerCase().includes("медиа");
  const isApplicant = targetLabel.toLowerCase().includes("заявитель");
  const draft = isMedia
    ? "Загрузите новый файл для выбранного медиа. Убедитесь, что изображение читаемое и соответствует нужному типу файла."
    : isApplicant
      ? "Уточните данные выбранного заявителя и сохраните правку перед повторной передачей оператору."
      : "Уточните данные заявки и повторно передайте пакет оператору после исправления.";

  return {
    intent: "correction_draft",
    title: "Черновик замечания",
    summary: draft,
    suggestions: [
      "Проверьте текст перед отправкой агенту.",
      "Укажите один точный объект исправления.",
    ],
    blockers: blockers(submission),
    guardrails: helperGuardrails,
    source: "local-stub",
  };
}

export function buildExportGuard(submissions: Submission[]): AiHelperResult {
  const plan = buildExportPlan(submissions);
  const blockedSubmissions = new Set(plan.blocked.map((item) => item.submissionId));

  return {
    intent: "export_guard",
    title: plan.blocked.length
      ? "Выгружайте только принятые строки"
      : "Выгрузка готова",
    summary: `К выгрузке: ${plan.readySubmissions.length} заявок, ${plan.applicantRowCount} строк. Семейные заявки сохраняют соседние строки.`,
    suggestions: plan.blocked.length
      ? ["Оставьте черновики, возвраты и заявки с блокерами вне выгрузки."]
      : ["Проверьте предпросмотр строк перед созданием файла."],
    blockers: Array.from(blockedSubmissions).map((id) => {
      const reasons = plan.blocked
        .filter((item) => item.submissionId === id)
        .map((item) => item.reason)
        .slice(0, 2)
        .join("; ");
      return `${id}: ${reasons}`;
    }),
    guardrails: [
      ...helperGuardrails,
      "Одна строка выгрузки соответствует одному заявителю.",
    ],
    source: "local-stub",
  };
}

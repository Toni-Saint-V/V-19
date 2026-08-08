// src/modules/submissions/correctionBrief.ts
import { fileTypeLabels } from "./status";
import type { AiHelperResult } from "../../shared/ai-helper-contract";
import type { Issue, IssueSeverity, Submission } from "./types";

export type CorrectionBriefTone = "neutral" | "warm" | "formal";
export type CorrectionBriefCheckStatus = "pass" | "warning" | "fail";
export type CorrectionBriefQuestionPriority = "required" | "recommended";

export interface CorrectionBriefIssue {
  applicantId: string;
  applicantName: string;
  fingerprint: string;
  id: string;
  instruction: string;
  severity: IssueSeverity;
  targetLabel: string;
}

export interface CorrectionBriefGroup {
  applicantId: string;
  applicantName: string;
  issues: CorrectionBriefIssue[];
}

export interface CorrectionBriefQuestion {
  id: string;
  issueIds: string[];
  priority: CorrectionBriefQuestionPriority;
  question: string;
  reason: string;
}

export interface CorrectionBriefCheck {
  detail: string;
  id: "coverage" | "specificity" | "consistency" | "safety" | "length";
  label: string;
  status: CorrectionBriefCheckStatus;
}

export interface CorrectionBrief {
  blockerCount: number;
  checks: CorrectionBriefCheck[];
  copyReady: boolean;
  duplicateCount: number;
  footer: string;
  groups: CorrectionBriefGroup[];
  intro: string;
  issueCount: number;
  qualityScore: number;
  questions: CorrectionBriefQuestion[];
  redactionCount: number;
  signature: string;
  text: string;
  title: string;
  tone: CorrectionBriefTone;
  warningCount: number;
}

export interface CorrectionBriefCritique {
  checks: CorrectionBriefCheck[];
  copyReady: boolean;
  missingIssueIds: string[];
  qualityScore: number;
  questions: CorrectionBriefQuestion[];
  unexpectedInstructions: string[];
}

export interface AssistantLeadMerge {
  accepted: boolean;
  intro: string;
  reason:
    | "accepted"
    | "empty"
    | "too_long"
    | "too_short"
    | "unsafe"
    | "sensitive"
    | "question"
    | "scope"
    | "format";
  source?: AiHelperResult["source"];
}

const unsafePromisePattern =
  /(?:гарантир|одобрен|вероятност\w*\s+(?:выдач|одобр)|ш[а]нс\w*\s+(?:на\s+)?виз|официальн\w*\s+провер|точн\w*\s+срок\w*\s+рассмотр|visa\s+(?:guarantee|odds)|approval\s+(?:odds|probability)|guaranteed)/iu;
const markdownFencePattern = /```|~~~|^\s{0,3}#{1,6}\s/mu;
const cyrillicLetterPattern = /[А-ЯЁа-яё]/gu;
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu;
const urlPattern = /https?:\/\/\S+/giu;
const documentNumberPattern = /\b(?:\d[\s-]?){8}\d\b/gu;
const phoneCandidatePattern = /\+?\d[\d\s().-]{8,}\d/gu;
const providerFullNamePattern = /\b[А-ЯЁ][а-яё]{2,}\s+[А-ЯЁ][а-яё]{2,}\b/u;
const providerPersonalGreetingPattern = /здравствуйте\s*,\s*[А-ЯЁ][а-яё]{2,}/iu;
const actionVerbPattern =
  /^(?:пожалуйста,\s*)?(?:добавьте|замените|загрузите|исправьте|уточните|укажите|заполните|предоставьте|подтвердите|обновите|проверьте|удалите|приложите|сверьте)\b/iu;
const genericIssuePattern =
  /^(?:требуется\s+уточнение|нужно\s+(?:уточнить|проверить|исправить)|проверьте|исправьте|ошибка|не\s+соответствует|данные\s+некорректны)[.!]?$/iu;
const concreteProviderFactPattern =
  /\d|(?:паспорт|документ|файл|фото|селфи|анк[её]т|справк|брон|страхов|маршрут|поездк|дат[ауые]|город|адрес|телефон|почт|заявител|реб[её]н|супруг|работодател|банк|доход|оплат|евро|рубл|доллар)/iu;
const instructionLinePattern = /^\s*(?:[•*-]|\d+[.)])\s+(.+)$/gmu;
const instructionCandidatePattern =
  /^(?:пожалуйста,\s*)?(?:(?:добавьте|замените|загрузите|исправьте|уточните|укажите|заполните|предоставьте|подтвердите|обновите|проверьте|удалите|приложите|сверьте|оплатите)|(?:добавить|заменить|загрузить|исправить|уточнить|указать|заполнить|предоставить|подтвердить|обновить|проверить|удалить|приложить|сверить|оплатить)|(?:нужно|необходимо|требуется|следует)\s+)/iu;
const zeroWidthPattern = /[\u200B-\u200D\u2060\uFEFF]/gu;

const toneCopy: Record<
  CorrectionBriefTone,
  { footer: string; intro: string; title: string }
> = {
  neutral: {
    title: "Что нужно исправить",
    intro:
      "Здравствуйте! Для продолжения работы по заявке нужно исправить следующие пункты.",
    footer:
      "После исправления проверьте каждый пункт и повторно отправьте заявку на проверку.",
  },
  warm: {
    title: "Давайте уточним несколько пунктов",
    intro:
      "Здравствуйте! Чтобы мы могли продолжить работу без задержек, пожалуйста, уточните и исправьте следующие пункты.",
    footer:
      "Когда всё будет готово, проверьте пункты ещё раз и отправьте заявку на повторную проверку.",
  },
  formal: {
    title: "Перечень необходимых исправлений",
    intro:
      "Здравствуйте. Для продолжения рассмотрения заявки просим устранить следующие замечания.",
    footer:
      "После внесения исправлений просим проверить комплект и повторно направить заявку на проверку.",
  },
};

interface PreparedIssue {
  issue: CorrectionBriefIssue;
  originalUnsafe: boolean;
  redactions: number;
  specificityConcern: boolean;
  targetMissing: boolean;
}

export function hasOpenCorrectionIssues(submission: Submission): boolean {
  return submission.issues.some((issue) => issue.status === "open");
}

export function buildCorrectionBrief(
  submission: Submission,
  tone: CorrectionBriefTone = "neutral",
): CorrectionBrief {
  const openIssues = submission.issues.filter((issue) => issue.status === "open");
  const applicantOrder = new Map(
    submission.applicants.map((applicant, index) => [applicant.id, index]),
  );
  const prepared = openIssues.map((issue) => prepareIssue(submission, issue));
  const unique = deduplicatePreparedIssues(prepared);
  const sorted = unique.items.sort((left, right) => {
    const leftApplicant =
      applicantOrder.get(left.issue.applicantId) ?? Number.MAX_SAFE_INTEGER;
    const rightApplicant =
      applicantOrder.get(right.issue.applicantId) ?? Number.MAX_SAFE_INTEGER;
    if (leftApplicant !== rightApplicant) return leftApplicant - rightApplicant;
    return severityRank(left.issue.severity) - severityRank(right.issue.severity);
  });
  const groups = groupIssues(sorted.map((item) => item.issue));
  const redactionCount = sorted.reduce((sum, item) => sum + item.redactions, 0);
  const unsafeCount = sorted.filter((item) => item.originalUnsafe).length;
  const specificityConcerns = sorted.filter(
    (item) => item.specificityConcern || item.targetMissing,
  );
  const questions = buildQuestions({
    duplicateCount: unique.duplicateCount,
    groups,
    prepared: sorted,
    submission,
  });
  const checks = buildBaseChecks({
    duplicateCount: unique.duplicateCount,
    issueCount: openIssues.length,
    redactionCount,
    specificityCount: specificityConcerns.length,
    uniqueIssueCount: sorted.length,
    unsafeCount,
  });
  const copy = toneCopy[tone];
  const draft = renderCorrectionBrief({
    footer: copy.footer,
    groups,
    intro: copy.intro,
    title: copy.title,
  });
  const lengthStatus = lengthCheck(draft.length);
  const completedChecks = checks.map((check) =>
    check.id === "length" ? lengthStatus : check,
  );
  const qualityScore = scoreChecks(completedChecks, unique.duplicateCount);
  const copyReady = !completedChecks.some((check) => check.status === "fail");

  return {
    blockerCount: sorted.filter((item) => item.issue.severity === "blocker").length,
    checks: completedChecks,
    copyReady,
    duplicateCount: unique.duplicateCount,
    footer: copy.footer,
    groups,
    intro: copy.intro,
    issueCount: sorted.length,
    qualityScore,
    questions,
    redactionCount,
    signature: briefSignature(sorted.map((item) => item.issue)),
    text: draft,
    title: copy.title,
    tone,
    warningCount: sorted.filter((item) => item.issue.severity === "warning").length,
  };
}

export function withCorrectionBriefIntro(
  brief: CorrectionBrief,
  intro: string,
): CorrectionBrief {
  const normalizedIntro = cleanText(intro);
  const text = renderCorrectionBrief({
    footer: brief.footer,
    groups: brief.groups,
    intro: normalizedIntro,
    title: brief.title,
  });
  const critique = critiqueCorrectionBriefText(text, brief);

  return {
    ...brief,
    checks: critique.checks,
    copyReady: critique.copyReady,
    intro: normalizedIntro,
    qualityScore: critique.qualityScore,
    questions: critique.questions,
    text,
  };
}

export function mergeAssistantLead(
  result: AiHelperResult | null,
  fallbackIntro: string,
): AssistantLeadMerge {
  if (!result) {
    return { accepted: false, intro: fallbackIntro, reason: "empty" };
  }

  const rawCandidate =
    result.issueRemarkDraft ?? result.agentFollowUpDrafts?.[0] ?? result.summary ?? "";

  if (cleanText(rawCandidate).length > 260) {
    return {
      accepted: false,
      intro: fallbackIntro,
      reason: "too_long",
      source: result.source,
    };
  }
  if (unsafePromisePattern.test(rawCandidate)) {
    return {
      accepted: false,
      intro: fallbackIntro,
      reason: "unsafe",
      source: result.source,
    };
  }
  if (containsProviderSensitiveCopy(rawCandidate)) {
    return {
      accepted: false,
      intro: fallbackIntro,
      reason: "sensitive",
      source: result.source,
    };
  }
  if (
    concreteProviderFactPattern.test(rawCandidate) ||
    markdownFencePattern.test(rawCandidate)
  ) {
    return {
      accepted: false,
      intro: fallbackIntro,
      reason: "scope",
      source: result.source,
    };
  }

  const candidate = normalizeAssistantLead(rawCandidate);

  if (!candidate) {
    return {
      accepted: false,
      intro: fallbackIntro,
      reason: rawCandidate.trim() ? "format" : "empty",
      source: result.source,
    };
  }
  if (candidate.length < 24) {
    return {
      accepted: false,
      intro: fallbackIntro,
      reason: "too_short",
      source: result.source,
    };
  }
  if (candidate.length > 260) {
    return {
      accepted: false,
      intro: fallbackIntro,
      reason: "too_long",
      source: result.source,
    };
  }
  const cyrillicLetters = candidate.match(cyrillicLetterPattern) ?? [];
  cyrillicLetterPattern.lastIndex = 0;
  if (cyrillicLetters.length < 8) {
    return {
      accepted: false,
      intro: fallbackIntro,
      reason: "format",
      source: result.source,
    };
  }
  if (unsafePromisePattern.test(candidate)) {
    return {
      accepted: false,
      intro: fallbackIntro,
      reason: "unsafe",
      source: result.source,
    };
  }
  if (containsProviderSensitiveCopy(candidate)) {
    return {
      accepted: false,
      intro: fallbackIntro,
      reason: "sensitive",
      source: result.source,
    };
  }
  if (concreteProviderFactPattern.test(candidate)) {
    return {
      accepted: false,
      intro: fallbackIntro,
      reason: "scope",
      source: result.source,
    };
  }
  if (candidate.includes("?")) {
    return {
      accepted: false,
      intro: fallbackIntro,
      reason: "question",
      source: result.source,
    };
  }
  if (markdownFencePattern.test(candidate) || candidate.split("\n").length > 2) {
    return {
      accepted: false,
      intro: fallbackIntro,
      reason: "format",
      source: result.source,
    };
  }

  return {
    accepted: true,
    intro: ensureSentence(candidate),
    reason: "accepted",
    source: result.source,
  };
}

export function critiqueCorrectionBriefText(
  text: string,
  brief: CorrectionBrief,
): CorrectionBriefCritique {
  const cleaned = text.trim();
  const expectedInstructions = new Set(
    brief.groups
      .flatMap((group) => group.issues)
      .map((issue) => normalizeForComparison(issue.instruction)),
  );
  const missingIssueIds = brief.groups
    .flatMap((group) => group.issues)
    .filter((issue) => !containsInstruction(cleaned, issue.instruction))
    .map((issue) => issue.id);
  const unexpectedInstructions = extractInstructionCandidates(cleaned).filter(
    (instruction) => !expectedInstructions.has(normalizeForComparison(instruction)),
  );
  const hasUnsafeCopy = unsafePromisePattern.test(cleaned);
  const hasSensitiveCopy = containsSensitiveContact(cleaned);
  const questions = [...brief.questions];

  if (missingIssueIds.length) {
    questions.unshift({
      id: "restore-missing-items",
      issueIds: missingIssueIds,
      priority: "required",
      question: "Вернуть в текст все удалённые пункты замечаний?",
      reason: `В черновике отсутствуют ${missingIssueIds.length} обязательных пункта.`,
    });
  }
  if (unexpectedInstructions.length) {
    questions.unshift({
      id: "remove-unverified-items",
      issueIds: [],
      priority: "required",
      question: "Убрать добавленные пункты, которых нет в открытых замечаниях?",
      reason: `Неподтверждённых пунктов: ${unexpectedInstructions.length}.`,
    });
  }
  if (hasUnsafeCopy) {
    questions.unshift({
      id: "remove-unsafe-promise",
      issueIds: [],
      priority: "required",
      question: "Убрать обещание результата или срока из сообщения?",
      reason: "Операторский текст не должен обещать решение консульства или срок.",
    });
  }
  if (hasSensitiveCopy) {
    questions.unshift({
      id: "remove-sensitive-contact",
      issueIds: [],
      priority: "required",
      question: "Убрать из сообщения лишние контактные или документные данные?",
      reason:
        "Черновик содержит строку, похожую на email, телефон, ссылку или номер документа.",
    });
  }

  const checks: CorrectionBriefCheck[] = brief.checks.map((check) => {
    if (check.id === "coverage") {
      return {
        ...check,
        detail: missingIssueIds.length
          ? `Не найдены пункты: ${missingIssueIds.join(", ")}.`
          : unexpectedInstructions.length
            ? `Добавлены неподтверждённые пункты: ${unexpectedInstructions.length}.`
            : `Все ${brief.issueCount} пункта сохранены без добавлений.`,
        status:
          missingIssueIds.length || unexpectedInstructions.length ? "fail" : "pass",
      };
    }
    if (check.id === "safety") {
      return {
        ...check,
        detail:
          hasUnsafeCopy || hasSensitiveCopy
            ? "Найдена формулировка, которую нужно убрать перед копированием."
            : brief.redactionCount
              ? `Лишние данные автоматически скрыты: ${brief.redactionCount}.`
              : "Запрещённые обещания и лишние контакты не найдены.",
        status: hasUnsafeCopy || hasSensitiveCopy ? "fail" : check.status,
      };
    }
    if (check.id === "length") {
      return lengthCheck(cleaned.length);
    }
    return check;
  });
  const copyReady =
    Boolean(cleaned) && !checks.some((check) => check.status === "fail");
  const qualityScore = scoreChecks(checks, brief.duplicateCount);

  return {
    checks,
    copyReady,
    missingIssueIds,
    qualityScore,
    questions: uniqueQuestions(questions),
    unexpectedInstructions,
  };
}

export function correctionBriefClipboardText(brief: CorrectionBrief): string {
  return brief.text.trim();
}

function prepareIssue(submission: Submission, issue: Issue): PreparedIssue {
  const applicant =
    submission.applicants.find((item) => item.id === issue.target.applicantId) ?? null;
  const applicantName =
    cleanText(applicant?.fullName ?? issue.target.applicantName) || "Заявитель";
  const targetLabel = safeTargetLabel(issueTargetLabel(issue));
  const rawInstruction = cleanText(issue.comment || issue.reason);
  const originalUnsafe = unsafePromisePattern.test(rawInstruction);
  const withoutUnsafePromises = removeUnsafePromiseSentences(rawInstruction);
  const redacted = redactSensitiveCopy(withoutUnsafePromises);
  const instruction = ensureActionableInstruction(redacted.text, targetLabel, issue);
  const targetMissing =
    !issue.target.field && !issue.target.fileType && !issue.target.section;
  const specificityConcern =
    genericIssuePattern.test(cleanText(rawInstruction)) ||
    instruction.length < 32 ||
    (!actionVerbPattern.test(instruction) && !/[.:;]/u.test(instruction));

  return {
    issue: {
      applicantId: issue.target.applicantId,
      applicantName,
      fingerprint: normalizeForComparison(
        `${issue.target.applicantId}|${targetLabel}|${instruction}`,
      ),
      id: issue.id,
      instruction,
      severity: issue.severity,
      targetLabel,
    },
    originalUnsafe,
    redactions: redacted.count,
    specificityConcern,
    targetMissing,
  };
}

function deduplicatePreparedIssues(items: PreparedIssue[]) {
  const unique: PreparedIssue[] = [];
  const fingerprints = new Set<string>();
  let duplicateCount = 0;

  for (const item of items) {
    if (fingerprints.has(item.issue.fingerprint)) {
      duplicateCount += 1;
      continue;
    }
    fingerprints.add(item.issue.fingerprint);
    unique.push(item);
  }

  return { duplicateCount, items: unique };
}

function groupIssues(issues: CorrectionBriefIssue[]): CorrectionBriefGroup[] {
  const groups = new Map<string, CorrectionBriefGroup>();

  for (const issue of issues) {
    const key = issue.applicantId || issue.applicantName;
    const group = groups.get(key) ?? {
      applicantId: issue.applicantId,
      applicantName: issue.applicantName,
      issues: [],
    };
    group.issues.push(issue);
    groups.set(key, group);
  }

  return [...groups.values()];
}

function buildQuestions(input: {
  duplicateCount: number;
  groups: CorrectionBriefGroup[];
  prepared: PreparedIssue[];
  submission: Submission;
}): CorrectionBriefQuestion[] {
  const questions: CorrectionBriefQuestion[] = [];

  for (const item of input.prepared) {
    if (item.targetMissing) {
      questions.push({
        id: `target-${item.issue.id}`,
        issueIds: [item.issue.id],
        priority: "required",
        question: `К какому конкретному полю или файлу относится пункт «${item.issue.targetLabel}»?`,
        reason: "Без точного объекта агенту сложно понять, что исправлять.",
      });
    }
    if (item.specificityConcern) {
      questions.push({
        id: `specificity-${item.issue.id}`,
        issueIds: [item.issue.id],
        priority: "recommended",
        question: `Какое конкретное действие и ожидаемый результат нужны по пункту «${item.issue.targetLabel}»?`,
        reason: "Формулировка выглядит общей и может вызвать повторный возврат.",
      });
    }
    if (item.originalUnsafe) {
      questions.push({
        id: `unsafe-${item.issue.id}`,
        issueIds: [item.issue.id],
        priority: "required",
        question: `Чем заменить обещание результата в пункте «${item.issue.targetLabel}»?`,
        reason: "Сообщение должно описывать только необходимые исправления.",
      });
    }
  }

  if (input.duplicateCount) {
    questions.push({
      id: "duplicates",
      issueIds: [],
      priority: "recommended",
      question: "Проверить, можно ли объединить повторяющиеся замечания?",
      reason: `Автоматически убрано дублей: ${input.duplicateCount}.`,
    });
  }

  const conflictingTargets = new Map<string, CorrectionBriefIssue[]>();
  for (const issue of input.groups.flatMap((group) => group.issues)) {
    const key = normalizeForComparison(`${issue.applicantId}|${issue.targetLabel}`);
    const bucket = conflictingTargets.get(key) ?? [];
    bucket.push(issue);
    conflictingTargets.set(key, bucket);
  }
  for (const issues of conflictingTargets.values()) {
    const instructions = new Set(issues.map((issue) => issue.fingerprint));
    if (issues.length > 1 && instructions.size > 1) {
      questions.push({
        id: `conflict-${issues.map((issue) => issue.id).join("-")}`,
        issueIds: issues.map((issue) => issue.id),
        priority: "required",
        question: `Какое требование приоритетно для «${issues[0]?.targetLabel ?? "пункта"}»?`,
        reason: "Для одного объекта найдено несколько разных инструкций.",
      });
    }
  }

  if (input.submission.type === "family" && input.groups.length === 1) {
    questions.push({
      id: "family-scope",
      issueIds: input.groups.flatMap((group) => group.issues.map((issue) => issue.id)),
      priority: "recommended",
      question:
        "Эти замечания относятся только к указанному заявителю или ко всей семье?",
      reason:
        "В семейной заявке сообщение должно однозначно показывать область исправления.",
    });
  }

  if (input.prepared.length > 6) {
    questions.push({
      id: "message-volume",
      issueIds: input.prepared.map((item) => item.issue.id),
      priority: "recommended",
      question:
        "Удобнее отправить все пункты одним сообщением или разделить по заявителям?",
      reason: "Большой список сложнее выполнить без повторной проверки.",
    });
  }

  return uniqueQuestions(questions);
}

function buildBaseChecks(input: {
  duplicateCount: number;
  issueCount: number;
  redactionCount: number;
  specificityCount: number;
  uniqueIssueCount: number;
  unsafeCount: number;
}): CorrectionBriefCheck[] {
  return [
    {
      id: "coverage",
      label: "Полнота",
      status: "pass",
      detail: `Включено ${input.uniqueIssueCount} из ${input.issueCount} открытых замечаний.`,
    },
    {
      id: "specificity",
      label: "Конкретность",
      status: input.specificityCount ? "warning" : "pass",
      detail: input.specificityCount
        ? `Требуют уточнения формулировки: ${input.specificityCount}.`
        : "Каждый пункт содержит объект и действие.",
    },
    {
      id: "consistency",
      label: "Согласованность",
      status: input.duplicateCount ? "warning" : "pass",
      detail: input.duplicateCount
        ? `Повторяющиеся пункты объединены: ${input.duplicateCount}.`
        : "Повторяющиеся пункты не найдены.",
    },
    {
      id: "safety",
      label: "Безопасность",
      status: input.unsafeCount ? "warning" : "pass",
      detail: input.unsafeCount
        ? `Удалены небезопасные обещания: ${input.unsafeCount}.`
        : input.redactionCount
          ? `Лишние данные скрыты: ${input.redactionCount}.`
          : "Обещания результата и лишние контакты не найдены.",
    },
    lengthCheck(0),
  ];
}

function renderCorrectionBrief(input: {
  footer: string;
  groups: CorrectionBriefGroup[];
  intro: string;
  title: string;
}): string {
  const groupText = input.groups
    .map((group) => {
      const items = group.issues.map((issue) => `• ${issue.instruction}`).join("\n");
      return `${group.applicantName}\n${items}`;
    })
    .join("\n\n");

  return [input.intro, input.title, groupText, input.footer]
    .filter(Boolean)
    .join("\n\n");
}

function issueTargetLabel(issue: Issue): string {
  if (issue.target.fileType) {
    return fileTypeLabels[issue.target.fileType] ?? "Файл";
  }
  return (
    cleanText(issue.target.field ?? issue.target.section ?? issue.reason) ||
    "Пункт заявки"
  );
}

function ensureActionableInstruction(
  value: string,
  targetLabel: string,
  issue: Issue,
): string {
  const normalized = ensureSentence(cleanText(value));
  if (actionVerbPattern.test(normalized)) return normalized;

  const action = issue.target.fileType
    ? issue.target.fileType === "passport_scan"
      ? "Загрузите читаемый файл"
      : "Замените файл"
    : issue.type === "section"
      ? "Заполните раздел"
      : "Уточните поле";
  const quotedTarget = targetLabel ? ` «${targetLabel}»` : "";

  return ensureSentence(
    normalized
      ? `${action}${quotedTarget}: ${lowercaseFirst(normalized)}`
      : `${action}${quotedTarget}`,
  );
}

function removeUnsafePromiseSentences(value: string): string {
  const sentences = value
    .split(/(?<=[.!?])\s+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .filter((sentence) => !unsafePromisePattern.test(sentence));

  return cleanText(sentences.join(" "));
}

function redactSensitiveCopy(value: string): { count: number; text: string } {
  let count = 0;
  let text = value.replace(emailPattern, () => {
    count += 1;
    return "[email скрыт]";
  });
  text = text.replace(urlPattern, () => {
    count += 1;
    return "[ссылка скрыта]";
  });
  text = text.replace(documentNumberPattern, () => {
    count += 1;
    return "[номер документа скрыт]";
  });
  text = text.replace(phoneCandidatePattern, (candidate) => {
    const digits = candidate.replace(/\D/gu, "");
    if (digits.length < 10) return candidate;
    count += 1;
    return "[телефон скрыт]";
  });

  return { count, text: cleanText(text) };
}

function containsSensitiveContact(value: string): boolean {
  if (
    emailPattern.test(value) ||
    urlPattern.test(value) ||
    documentNumberPattern.test(value)
  ) {
    resetGlobalPatterns();
    return true;
  }
  resetGlobalPatterns();
  const phoneMatches = value.match(phoneCandidatePattern) ?? [];
  resetGlobalPatterns();
  return phoneMatches.some((candidate) => candidate.replace(/\D/gu, "").length >= 10);
}

function containsProviderSensitiveCopy(value: string): boolean {
  return (
    containsSensitiveContact(value) ||
    providerFullNamePattern.test(value) ||
    providerPersonalGreetingPattern.test(value)
  );
}

function resetGlobalPatterns() {
  emailPattern.lastIndex = 0;
  urlPattern.lastIndex = 0;
  documentNumberPattern.lastIndex = 0;
  phoneCandidatePattern.lastIndex = 0;
}

function normalizeAssistantLead(value: string): string {
  const withoutMarkdown = value
    .replace(/```[\s\S]*?```/gu, " ")
    .replace(/^\s*[-*•]\s+/gmu, "")
    .replace(/^\s{0,3}#{1,6}\s+/gmu, "")
    .trim();
  const sentenceMatches = withoutMarkdown.match(/[^.!?]+[.!?]?/gu) ?? [];
  return cleanText(sentenceMatches.slice(0, 2).join(" "));
}

function containsInstruction(text: string, instruction: string): boolean {
  const normalizedInstruction = normalizeForComparison(instruction);
  if (!normalizedInstruction) return true;

  return normalizeForComparison(text).includes(normalizedInstruction);
}

function extractInstructionCandidates(value: string): string[] {
  const instructions = new Set<string>();
  instructionLinePattern.lastIndex = 0;
  for (const match of value.matchAll(instructionLinePattern)) {
    const instruction = cleanText(match[1] ?? "");
    if (instruction) instructions.add(instruction);
  }
  instructionLinePattern.lastIndex = 0;

  for (const line of value.split(/\r?\n/u)) {
    const instruction = cleanText(line.replace(/^\s*(?:[•*-]|\d+[.)])\s+/u, ""));
    if (instruction && instructionCandidatePattern.test(instruction)) {
      instructions.add(instruction);
    }
  }

  return [...instructions];
}

function safeTargetLabel(value: string): string {
  const withoutUnsafe = removeUnsafePromiseSentences(cleanText(value));
  const redacted = redactSensitiveCopy(withoutUnsafe).text;
  return redacted || "Пункт заявки";
}

function lengthCheck(length: number): CorrectionBriefCheck {
  if (length === 0) {
    return {
      id: "length",
      label: "Объём",
      status: "pass",
      detail: "Объём будет проверяться при редактировании.",
    };
  }
  if (length > 5000) {
    return {
      id: "length",
      label: "Объём",
      status: "fail",
      detail: `Черновик слишком длинный: ${length} символов.`,
    };
  }
  if (length > 3200) {
    return {
      id: "length",
      label: "Объём",
      status: "warning",
      detail: `Черновик длинный: ${length} символов. Стоит сократить.`,
    };
  }
  return {
    id: "length",
    label: "Объём",
    status: "pass",
    detail: `Удобный объём: ${length} символов.`,
  };
}

function scoreChecks(checks: CorrectionBriefCheck[], duplicateCount: number): number {
  const penalty = checks.reduce(
    (sum, check) => {
      if (check.status === "fail") return sum + 32;
      if (check.status === "warning") return sum + 12;
      return sum;
    },
    Math.min(10, duplicateCount * 2),
  );

  return Math.max(0, Math.min(100, 100 - penalty));
}

function briefSignature(issues: CorrectionBriefIssue[]): string {
  return hashText(
    issues
      .map((issue) => `${issue.id}|${issue.severity}|${issue.fingerprint}`)
      .sort()
      .join("||"),
  );
}

function hashText(value: string): string {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return `cb-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function severityRank(severity: IssueSeverity): number {
  if (severity === "blocker") return 0;
  if (severity === "warning") return 1;
  return 2;
}

function normalizeForComparison(value: string): string {
  return cleanText(value)
    .toLocaleLowerCase("ru")
    .replace(/[«»"'`()[\]{}.,:;!?—–-]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function cleanText(value: string): string {
  return value.replace(zeroWidthPattern, "").replace(/\s+/gu, " ").trim();
}

function ensureSentence(value: string): string {
  const trimmed = cleanText(value);
  if (!trimmed) return "";
  return /[.!?]$/u.test(trimmed) ? trimmed : `${trimmed}.`;
}

function lowercaseFirst(value: string): string {
  if (!value) return value;
  return `${value[0]?.toLocaleLowerCase("ru") ?? ""}${value.slice(1)}`;
}

function uniqueQuestions(
  questions: CorrectionBriefQuestion[],
): CorrectionBriefQuestion[] {
  const seen = new Set<string>();
  const unique: CorrectionBriefQuestion[] = [];

  for (const question of questions) {
    const key = normalizeForComparison(question.question);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(question);
  }

  return unique.sort((left, right) => {
    if (left.priority === right.priority) return 0;
    return left.priority === "required" ? -1 : 1;
  });
}

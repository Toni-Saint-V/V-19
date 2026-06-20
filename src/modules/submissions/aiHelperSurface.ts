import {
  buildSubmissionNextStepBrief,
  type SubmissionNextStepBrief,
  type SubmissionNextStepAction,
} from "./submissionNextStepEngine";
import { buildPassportExtractionBrief } from "./passportExtractionBrief";
import { fileStatusLabels, fileTypeLabels } from "./status";
import type { Role, Submission } from "./types";

export type AiHelperCaseStatus =
  | "ready"
  | "blocked"
  | "waiting"
  | "needs_review"
  | "complete";

export type AiHelperHighlightKind =
  | "passport"
  | "questionnaire"
  | "files"
  | "issues"
  | "export"
  | "family";

export type AiHelperHighlightSource =
  | "status"
  | "passport"
  | "questionnaire"
  | "files"
  | "issues"
  | "export";

type AiHelperSectionId =
  | "blockers"
  | "actions"
  | "why_now"
  | "highlights"
  | "drafts"
  | "guardrails";

export type AiHelperDraft = {
  audience: Role;
  body: string;
  title: string;
};

export type AiHelperHighlight = {
  detail: string;
  kind: AiHelperHighlightKind;
  label: string;
  source: AiHelperHighlightSource;
};

export type AiHelperSurfaceModel = {
  ariaLabel: string;
  drafts: AiHelperDraft[];
  guardrails: string[];
  highlights: AiHelperHighlight[];
  modelVersion: "local-case-helper-v1";
  nextStep: string;
  owner: Role | "system";
  primaryAction: SubmissionNextStepAction;
  summary: string;
  status: AiHelperCaseStatus;
  title: string;
  sections: Array<{
    id: AiHelperSectionId;
    title: string;
    items: string[];
  }>;
};

export function buildSubmissionAiHelperSurface({
  role,
  submission,
  surface,
}: {
  role: Role;
  submission: Submission;
  surface: "agent" | "review" | "export";
}): AiHelperSurfaceModel {
  const brief = buildSubmissionNextStepBrief({ role, submission, surface });
  const status = caseStatusFor({ brief, role, submission, surface });
  const owner = submission.status === "exported" ? "system" : brief.owner;
  const highlights = buildHighlights(submission, surface);
  const drafts = buildDrafts({ role, submission, surface });
  const nextStep = nextStepFor(brief.primaryAction);

  return ensureSafeHelperModel({
    ariaLabel: brief.ariaLabel,
    drafts,
    guardrails: brief.guardrails,
    highlights,
    modelVersion: "local-case-helper-v1",
    nextStep,
    owner,
    primaryAction: brief.primaryAction,
    summary: brief.summary,
    status,
    title: brief.title,
    sections: compactSections([
      {
        id: "blockers",
        title: role === "admin" ? "Что проверить" : "Что мешает движению",
        items: brief.blockers,
      },
      {
        id: "actions",
        title: "Следующие действия",
        items: brief.actions,
      },
      {
        id: "why_now",
        title: "Почему сейчас",
        items: [whyNow({ brief, highlights, owner, status, submission })],
      },
      {
        id: "highlights",
        title: "Сигналы",
        items: highlights.map(formatHighlight),
      },
      {
        id: "drafts",
        title: "Черновик",
        items: drafts.map((draft) => `${draft.title}: ${draft.body}`),
      },
      {
        id: "guardrails",
        title: "Границы подсказки",
        items: brief.guardrails,
      },
    ]),
  });
}

function compactSections(
  sections: AiHelperSurfaceModel["sections"],
): AiHelperSurfaceModel["sections"] {
  return sections
    .map((section) => ({
      ...section,
      items: section.items.map((item) => item.trim()).filter(Boolean),
    }))
    .filter((section) => section.items.length > 0);
}

function caseStatusFor({
  brief,
  role,
  submission,
  surface,
}: {
  brief: SubmissionNextStepBrief;
  role: Role;
  submission: Submission;
  surface: "agent" | "review" | "export";
}): AiHelperCaseStatus {
  if (submission.status === "exported" || brief.status === "complete") {
    return "complete";
  }
  if (brief.status === "waiting") return "waiting";
  if (
    role === "admin" &&
    surface === "review" &&
    (submission.status === "submitted_for_review" ||
      submission.status === "corrections_received")
  ) {
    return "needs_review";
  }
  if (brief.status === "ready_for_action") return "ready";
  return "blocked";
}

function buildHighlights(
  submission: Submission,
  surface: "agent" | "review" | "export",
): AiHelperHighlight[] {
  const highlights: AiHelperHighlight[] = [
    {
      detail: `${submission.completeness.questionnaire}% заполнено`,
      kind: "questionnaire",
      label: "Анкета",
      source: "questionnaire",
    },
    fileHighlight(submission),
  ];
  const passport = passportHighlight(submission);
  if (passport) highlights.unshift(passport);
  const issues = issueHighlight(submission);
  if (issues) highlights.push(issues);
  if (submission.type === "family") {
    highlights.push({
      detail: `${applicantCountLabel(submission.applicants.length)}, сигналы считаются по каждому`,
      kind: "family",
      label: "Семейная подача",
      source: "status",
    });
  }
  if (
    surface === "export" ||
    submission.status === "ready_for_export" ||
    submission.status === "exported"
  ) {
    highlights.push({
      detail:
        submission.status === "exported"
          ? "Подача уже отмечена выгруженной"
          : `Состояние выгрузки: ${submission.exportState ?? "not_ready"}`,
      kind: "export",
      label: "Выгрузка",
      source: "export",
    });
  }

  return highlights;
}

function passportHighlight(submission: Submission): AiHelperHighlight | null {
  const passportBrief = buildPassportExtractionBrief(submission);
  if (passportBrief.status === "not_started") return null;

  if (passportBrief.status === "extracting") {
    return {
      detail: "Распознавание выполняется, редактируемый шаг заблокирован ожиданием",
      kind: "passport",
      label: "Паспорт",
      source: "passport",
    };
  }
  if (passportBrief.metrics.conflicts > 0) {
    return {
      detail: `${passportBrief.metrics.conflicts} конфликтных полей требуют ручного выбора`,
      kind: "passport",
      label: "Паспорт",
      source: "passport",
    };
  }
  if (passportBrief.metrics.safeFieldsToApply > 0) {
    return {
      detail: `${passportBrief.metrics.safeFieldsToApply} безопасных полей можно применить после проверки`,
      kind: "passport",
      label: "Паспорт",
      source: "passport",
    };
  }
  if (passportBrief.status === "failed" || passportBrief.status === "unavailable") {
    return {
      detail: "Автозаполнение недоступно, нужен ручной ввод",
      kind: "passport",
      label: "Паспорт",
      source: "passport",
    };
  }

  return {
    detail: passportBrief.summary,
    kind: "passport",
    label: "Паспорт",
    source: "passport",
  };
}

function fileHighlight(submission: Submission): AiHelperHighlight {
  const missing = submission.files.filter((file) => file.status === "missing");
  const replacement = submission.files.filter(
    (file) => file.status === "needs_replacement",
  );
  const pending = submission.files.filter((file) => file.status === "pending_review");

  if (replacement.length > 0) {
    return {
      detail: `${replacement.length} файл(а) требуют замены: ${fileList(replacement)}`,
      kind: "files",
      label: "Файлы",
      source: "files",
    };
  }
  if (missing.length > 0) {
    return {
      detail: `${missing.length} файл(а) отсутствуют: ${fileList(missing)}`,
      kind: "files",
      label: "Файлы",
      source: "files",
    };
  }
  if (pending.length > 0) {
    return {
      detail: `${pending.length} файл(а) ожидают ручной проверки администратора`,
      kind: "files",
      label: "Файлы",
      source: "files",
    };
  }

  return {
    detail: `Действий по файлам нет; всего ${submission.files.length}, статус: ${fileStatusLabels.accepted.toLowerCase()} или не требует действия`,
    kind: "files",
    label: "Файлы",
    source: "files",
  };
}

function issueHighlight(submission: Submission): AiHelperHighlight | null {
  const open = submission.issues.filter((issue) => issue.status === "open");
  const fixed = submission.issues.filter((issue) => issue.status === "fixed_by_agent");
  if (!open.length && !fixed.length) return null;

  return {
    detail: [
      open.length ? `${open.length} открыто` : "",
      fixed.length ? `${fixed.length} ждёт закрытия администратором` : "",
    ]
      .filter(Boolean)
      .join(", "),
    kind: "issues",
    label: "Замечания",
    source: "issues",
  };
}

function buildDrafts({
  role,
  submission,
  surface,
}: {
  role: Role;
  submission: Submission;
  surface: "agent" | "review" | "export";
}): AiHelperDraft[] {
  const firstOpenIssue = submission.issues.find((issue) => issue.status === "open");
  const firstFixedIssue = submission.issues.find(
    (issue) => issue.status === "fixed_by_agent",
  );

  if (role === "admin" && surface === "review" && firstOpenIssue) {
    return [
      {
        audience: "admin",
        title: "Текст замечания",
        body: `Вернуть агенту: ${issueTargetLabel(firstOpenIssue)}. Укажите конкретную причину после ручной проверки.`,
      },
    ];
  }
  if (role === "admin" && surface === "review" && firstFixedIssue) {
    return [
      {
        audience: "admin",
        title: "Сводка исправления",
        body: `Проверить исправление: ${issueTargetLabel(firstFixedIssue)}. Закрывайте только после ручной проверки.`,
      },
    ];
  }
  if (
    role === "agent" &&
    (submission.status === "returned" || submission.status === "requires_action") &&
    firstOpenIssue
  ) {
    return [
      {
        audience: "agent",
        title: "Ответ агенту",
        body: `Исправить: ${issueTargetLabel(firstOpenIssue)}. После проверки отправить исправления администратору.`,
      },
    ];
  }

  return [];
}

function whyNow({
  brief,
  highlights,
  owner,
  status,
  submission,
}: {
  brief: SubmissionNextStepBrief;
  highlights: AiHelperHighlight[];
  owner: Role | "system";
  status: AiHelperCaseStatus;
  submission: Submission;
}) {
  if (status === "waiting") {
    return `${ownerLabel(owner)} владеет следующим шагом; агенту не нужно выполнять редактируемое действие. ${brief.primaryAction.reason ?? brief.primaryAction.label}`;
  }
  if (status === "complete") {
    return "Подача в терминальном состоянии для этого сценария; безопасное действие - смотреть историю.";
  }
  const issueSignal = highlights.find((highlight) => highlight.kind === "issues");
  if (issueSignal) {
    return `Замечания влияют на движение подачи: ${issueSignal.detail}. Следующий шаг: ${brief.primaryAction.label}.`;
  }
  const passportSignal = highlights.find((highlight) => highlight.kind === "passport");
  if (passportSignal && brief.primaryAction.kind === "passport_review") {
    return `${passportSignal.detail}. Следующий шаг: ${brief.primaryAction.label}.`;
  }
  if (
    submission.completeness.questionnaire < 100 ||
    submission.completeness.files < 100
  ) {
    return "Пакет ещё не готов к ручной проверке; помощник ведёт к первому незакрытому полю или файлу.";
  }
  return `Блокеров по локальным правилам не найдено. Следующий шаг: ${brief.primaryAction.label}.`;
}

function nextStepFor(primaryAction: SubmissionNextStepAction) {
  return primaryAction.reason
    ? `${primaryAction.label}. ${primaryAction.reason}`
    : primaryAction.label;
}

function formatHighlight(highlight: AiHelperHighlight) {
  return `${highlight.label}: ${highlight.detail}. Источник: ${sourceLabel(highlight.source)}.`;
}

function fileList(files: Submission["files"]) {
  return files
    .slice(0, 3)
    .map((file) => fileTypeLabels[file.type])
    .join(", ");
}

function issueTargetLabel(issue: Submission["issues"][number]) {
  if (issue.target.fileType) {
    return `${issue.target.applicantName} → Файлы → ${fileTypeLabels[issue.target.fileType]}`;
  }
  return [issue.target.applicantName, issue.target.section, issue.target.field]
    .filter(Boolean)
    .join(" → ");
}

function ownerLabel(owner: Role | "system") {
  if (owner === "admin") return "Администратор";
  if (owner === "agent") return "Агент";
  return "Система";
}

function applicantCountLabel(count: number) {
  if (count % 10 === 1 && count % 100 !== 11) return `${count} заявитель`;
  if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) {
    return `${count} заявителя`;
  }
  return `${count} заявителей`;
}

function sourceLabel(source: AiHelperHighlightSource) {
  const labels: Record<AiHelperHighlightSource, string> = {
    export: "выгрузка",
    files: "файлы",
    issues: "замечания",
    passport: "паспорт",
    questionnaire: "анкета",
    status: "статус подачи",
  };
  return labels[source];
}

const forbiddenTrustCopy =
  /approved|guaranteed|officially verified|approval odds|visa odds|одобрен|гарантир|официально провер|шанс[а-я\s]+визы|ии решил|ai decided|ocr confirmed/i;

function ensureSafeHelperModel(model: AiHelperSurfaceModel): AiHelperSurfaceModel {
  return {
    ...model,
    ariaLabel: safeHelperText(model.ariaLabel),
    drafts: model.drafts.map((draft) => ({
      ...draft,
      body: safeHelperText(draft.body),
      title: safeHelperText(draft.title),
    })),
    guardrails: model.guardrails.map(safeHelperText),
    highlights: model.highlights.map((highlight) => ({
      ...highlight,
      detail: safeHelperText(highlight.detail),
      label: safeHelperText(highlight.label),
    })),
    nextStep: safeHelperText(model.nextStep),
    sections: model.sections.map((section) => ({
      ...section,
      items: section.items.map(safeHelperText),
      title: safeHelperText(section.title),
    })),
    summary: safeHelperText(model.summary),
    title: safeHelperText(model.title),
  };
}

function safeHelperText(value: string) {
  return value.replace(forbiddenTrustCopy, "требует ручной проверки");
}

import {
  fixedIssueCount,
  canPerformAction,
  openIssueCount,
  unresolvedOpenIssueCount,
} from "./status";
import { formatAgentActionRowText } from "./listFormatters";
import { applicantCountLabel, submissionSearchText } from "./selectors";
import type { DrawerTab, Submission, SubmissionFile } from "./types";

export type AgentActionDue = "overdue" | "today" | "week" | "completed";
export type AgentActionSeverity = "blocker" | "warning" | "ready" | "info";

export type AgentActionBadge = {
  label: string;
  tone: "amber" | "blue" | "danger" | "muted" | "teal";
};

export type AgentActionItem = {
  badges: AgentActionBadge[];
  completed: boolean;
  context: string;
  cta: string;
  due: AgentActionDue;
  dueLabel: string;
  id: string;
  searchText: string;
  severity: AgentActionSeverity;
  submission: Submission;
  tab: DrawerTab;
  title: string;
};

export type AgentActionSummary = {
  completed: number;
  open: number;
  overdue: number;
  today: number;
  week: number;
};

export type OperationalInboxEvent = {
  action: string;
  badge: string;
  context: string;
  id: string;
  needsAction: boolean;
  read: boolean;
  submission: Submission;
  tab: DrawerTab;
  time: string;
  title: string;
  tone: "amber" | "blue" | "danger" | "muted" | "teal";
};

export function agentActionQueue(submissions: Submission[]) {
  const open = sortAgentActions(submissions.flatMap(agentOpenActions)).map(
    withSearchText,
  );
  const completed = sortAgentActions(
    submissions.flatMap(agentCompletedActions),
  ).map(withSearchText);

  return {
    completed,
    open,
    summary: summarizeAgentActions(open, completed),
  };
}

export function adminActionQueue(submissions: Submission[]) {
  const open = sortAgentActions(submissions.flatMap(adminOpenActions)).map(
    withSearchText,
  );
  const completed = sortAgentActions(
    submissions.flatMap(adminCompletedActions),
  ).map(withSearchText);

  return {
    completed,
    open,
    summary: summarizeAgentActions(open, completed),
  };
}

export function adminInboxEvents(submissions: Submission[]): OperationalInboxEvent[] {
  return submissions.flatMap((submission): OperationalInboxEvent[] => {
    if (submission.status === "corrections_received") {
      const fixed = fixedIssueCount(submission);
      return [
        {
          action: "Проверить исправления",
          badge: "Исправления",
          context: `${fixed || openIssueCount(submission)} замечания`,
          id: `admin-work-corrections-${submission.id}`,
          needsAction: true,
          read: false,
          submission,
          tab: "issues",
          time: "12 мин назад",
          title: `Агент отправил исправления по «${submission.title}»`,
          tone: "blue",
        },
      ];
    }

    if (submission.status === "submitted_for_review") {
      return [
        {
          action: "Открыть проверку",
          badge: "Проверка",
          context: `${applicantCountLabel(submission.applicants.length)} · ${submission.city}`,
          id: `admin-work-review-${submission.id}`,
          needsAction: true,
          read: false,
          submission,
          tab: "overview",
          time: "34 мин назад",
          title: `Подача «${submission.title}» ждёт проверки`,
          tone: "amber",
        },
      ];
    }

    if (submission.status === "ready_for_export") {
      return [
        {
          action: "Проверить пакет",
          badge: "К выгрузке",
          context: `${applicantCountLabel(submission.applicants.length)} · Excel`,
          id: `admin-work-export-${submission.id}`,
          needsAction: true,
          read: false,
          submission,
          tab: "overview",
          time: "1 ч назад",
          title: `Подача «${submission.title}» принята для выгрузки`,
          tone: "teal",
        },
      ];
    }

    return [];
  });
}

export function searchAgentActions(actions: AgentActionItem[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return actions;
  return actions.filter((action) => action.searchText.includes(normalized));
}

function agentOpenActions(submission: Submission): AgentActionItem[] {
  const actions: AgentActionItem[] = [];

  const replacementFile = submission.files.find(
    (file) => file.status === "needs_replacement" && isActiveAgentFile(file),
  );
  if (replacementFile) {
    const applicantName = applicantNameForFile(submission, replacementFile);
    const rowText = formatAgentActionRowText({
      applicantName,
      fileType: replacementFile.type,
      kind: "replace_file",
    });
    actions.push({
      badges: [
        { label: "Блокер", tone: "danger" },
        { label: shortFileTypeLabel(replacementFile.type), tone: "amber" },
      ],
      completed: false,
      context: rowText.subtitle,
      cta: "Исправить",
      due: "overdue",
      dueLabel: "Требует исправления",
      id: `replace-${submission.id}-${replacementFile.id}`,
      searchText: "",
      severity: "blocker",
      submission,
      tab: "files",
      title: rowText.title,
    });
  }

  const readyToSubmitCorrections =
    canPerformAction(submission, "submit_corrections", "agent").ok &&
    unresolvedOpenIssueCount(submission) === 0;
  if (readyToSubmitCorrections && !replacementFile) {
    const rowText = formatAgentActionRowText({
      kind: "submit_corrections",
      submission,
    });
    return [
      {
        badges: [{ label: "Готово", tone: "teal" }],
        completed: false,
        context: rowText.subtitle,
        cta: "Отправить",
        due: "week",
        dueLabel: "Готово к отправке",
        id: `submit-corrections-${submission.id}`,
        searchText: "",
        severity: "ready",
        submission,
        tab: "issues",
        title: rowText.title,
      },
    ];
  }

  const questionnaireApplicant = submission.applicants.find((applicant) =>
    ["empty", "partial", "needs_fix"].includes(applicant.questionnaireStatus),
  );
  if (questionnaireApplicant) {
    const missingSection = questionnaireApplicant.sections.find(
      (section) => section.missing,
    );
    const missing = missingSection?.missing;
    const rowText = formatAgentActionRowText({
      applicantName: questionnaireApplicant.fullName,
      fieldSummary: questionnaireMissingLabel(missing),
      kind: "fill_questionnaire",
      sectionTitle: missing?.toLowerCase().includes("поезд")
        ? missingSection?.title
        : undefined,
    });
    actions.push({
      badges: [{ label: "Анкета", tone: "blue" }],
      completed: false,
      context: rowText.subtitle,
      cta: "Продолжить",
      due: "today",
      dueLabel: "Нужно заполнить",
      id: `questionnaire-${submission.id}-${questionnaireApplicant.id}`,
      searchText: "",
      severity: "warning",
      submission,
      tab: "questionnaire",
      title: rowText.title,
    });
  }

  const missingFiles = submission.files.filter(isMissingAgentFile);
  const visibleMissingFiles =
    submission.status === "draft" ? missingFiles.slice(0, 1) : missingFiles;
  for (const file of visibleMissingFiles) {
    const applicantName = applicantNameForFile(submission, file);
    const rowText = formatAgentActionRowText({
      applicantName,
      fileType: file.type,
      kind: "add_file",
    });
    actions.push({
      badges: [{ label: "Файлы", tone: "amber" }],
      completed: false,
      context: rowText.subtitle,
      cta: "Добавить",
      due: "week",
      dueLabel: "Нужно добавить",
      id: `missing-file-${submission.id}-${file.id}`,
      searchText: "",
      severity: "warning",
      submission,
      tab: "files",
      title: rowText.title,
    });
  }

  return actions;
}

function agentCompletedActions(submission: Submission): AgentActionItem[] {
  if (!["submitted_for_review", "corrections_received", "ready_for_export"].includes(
    submission.status,
  )) {
    return [];
  }

  const rowText = formatAgentActionRowText({
    kind: "completed",
    status: submission.status,
    submission,
  });

  return [
    {
      badges: [{ label: "Выполнено", tone: "teal" }],
      completed: true,
      context: rowText.subtitle,
      cta: "Смотреть",
      due: "completed",
      dueLabel: "Выполнено",
      id: `completed-${submission.id}`,
      searchText: "",
      severity: "info",
      submission,
      tab: "history",
      title: rowText.title,
    },
  ];
}

function adminOpenActions(submission: Submission): AgentActionItem[] {
  if (submission.status === "submitted_for_review") {
    return [
      {
        badges: [{ label: "Проверка", tone: "amber" }],
        completed: false,
        context: `${applicantCountLabel(submission.applicants.length)} · ${submission.city}`,
        cta: "Проверить",
        due: "today",
        dueLabel: "Ждёт проверки",
        id: `admin-review-${submission.id}`,
        searchText: "",
        severity: "warning",
        submission,
        tab: "overview",
        title: "Проверить пакет",
      },
    ];
  }

  if (submission.status === "corrections_received") {
    const fixed = fixedIssueCount(submission);
    return [
      {
        badges: [{ label: "Исправления", tone: "blue" }],
        completed: false,
        context: `${fixed || openIssueCount(submission)} замечания · ${submission.city}`,
        cta: "Проверить",
        due: "overdue",
        dueLabel: "Исправления получены",
        id: `admin-corrections-${submission.id}`,
        searchText: "",
        severity: "blocker",
        submission,
        tab: "issues",
        title: "Проверить исправления",
      },
    ];
  }

  if (submission.status === "ready_for_export") {
    return [
      {
        badges: [{ label: "К выгрузке", tone: "teal" }],
        completed: false,
        context: `${applicantCountLabel(submission.applicants.length)} · Excel`,
        cta: "Пакет",
        due: "week",
        dueLabel: "Готово к пакету",
        id: `admin-export-${submission.id}`,
        searchText: "",
        severity: "ready",
        submission,
        tab: "overview",
        title: "Проверить пакет выгрузки",
      },
    ];
  }

  return [];
}

function adminCompletedActions(submission: Submission): AgentActionItem[] {
  if (submission.status !== "exported") return [];

  return [
    {
      badges: [{ label: "Выгружено", tone: "teal" }],
      completed: true,
      context: `${applicantCountLabel(submission.applicants.length)} · Excel`,
      cta: "История",
      due: "completed",
      dueLabel: "Пакет выгружен",
      id: `admin-completed-export-${submission.id}`,
      searchText: "",
      severity: "info",
      submission,
      tab: "history",
      title: "Пакет выгружен",
    },
  ];
}

function sortAgentActions(actions: AgentActionItem[]) {
  return [...actions].sort((left, right) => {
    const severity = severityRank(left.severity) - severityRank(right.severity);
    if (severity !== 0) return severity;
    const due = dueRank(left.due) - dueRank(right.due);
    if (due !== 0) return due;
    return right.submission.updatedAt.localeCompare(left.submission.updatedAt);
  });
}

function summarizeAgentActions(
  open: AgentActionItem[],
  completed: AgentActionItem[],
): AgentActionSummary {
  const overdue = open.filter((action) => action.due === "overdue").length;
  const today = open.filter((action) => action.due === "today").length;
  const week = open
    .filter((action) => action.due === "today" || action.due === "week")
    .slice(0, 4).length;

  return {
    completed: completed.length,
    open: open.length,
    overdue,
    today,
    week,
  };
}

function withSearchText(action: AgentActionItem): AgentActionItem {
  return {
    ...action,
    searchText: [
      action.title,
      action.context,
      action.cta,
      action.dueLabel,
      action.submission.id,
      action.submission.title,
      action.submission.city,
      submissionSearchText(action.submission),
      ...action.badges.map((badge) => badge.label),
    ]
      .join(" ")
      .toLowerCase(),
  };
}

function severityRank(severity: AgentActionSeverity) {
  if (severity === "blocker") return 0;
  if (severity === "warning") return 1;
  if (severity === "ready") return 2;
  return 3;
}

function dueRank(due: AgentActionDue) {
  if (due === "overdue") return 0;
  if (due === "today") return 1;
  if (due === "week") return 2;
  return 3;
}

function applicantNameForFile(submission: Submission, file: SubmissionFile) {
  return (
    submission.applicants.find((applicant) => applicant.id === file.applicantId)
      ?.fullName ?? "Новый заявитель"
  );
}

function questionnaireMissingLabel(missing?: string) {
  if (!missing) return "4 поля";
  if (missing.includes("поля")) return missing;
  return "4 поля";
}

function isMissingAgentFile(file: SubmissionFile) {
  return file.status === "missing" && isActiveAgentFile(file);
}

function isActiveAgentFile(file: SubmissionFile) {
  return (
    file.type === "selfie" ||
    file.type === "selfie_2" ||
    file.type === "passport_scan"
  );
}

function shortFileTypeLabel(type: SubmissionFile["type"]) {
  if (type === "selfie_2") return "Селфи 2";
  if (type === "passport_scan") return "Паспорт";
  if (type === "selfie") return "Селфи 1";
  return "Файл";
}

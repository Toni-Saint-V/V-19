import {
  canPerformAction,
  fileTypeLabels,
  unresolvedOpenIssueCount,
} from "./status";
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

export function searchAgentActions(actions: AgentActionItem[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return actions;
  return actions.filter((action) => action.searchText.includes(normalized));
}

function agentOpenActions(submission: Submission): AgentActionItem[] {
  const actions: AgentActionItem[] = [];

  const replacementFile = submission.files.find(
    (file) => file.status === "needs_replacement",
  );
  if (replacementFile) {
    const applicantName = applicantNameForFile(submission, replacementFile);
    actions.push({
      badges: [
        { label: "Блокер", tone: "danger" },
        { label: shortFileTypeLabel(replacementFile.type), tone: "amber" },
      ],
      completed: false,
      context: `${submission.title} · заменить файл`,
      cta: "Исправить",
      due: "overdue",
      dueLabel: "Требует исправления",
      id: `replace-${submission.id}-${replacementFile.id}`,
      searchText: "",
      severity: "blocker",
      submission,
      tab: "media",
      title: `Заменить ${shortFileTypeName(replacementFile.type)} ${applicantName}`,
    });
  }

  const readyToSubmitCorrections =
    canPerformAction(submission, "submit_corrections", "agent").ok &&
    unresolvedOpenIssueCount(submission) === 0;
  if (readyToSubmitCorrections && !replacementFile) {
    return [
      {
        badges: [{ label: "Готово", tone: "teal" }],
        completed: false,
        context: `${submission.title} · все замечания отмечены`,
        cta: "Отправить",
        due: "week",
        dueLabel: "Готово к отправке",
        id: `submit-corrections-${submission.id}`,
        searchText: "",
        severity: "ready",
        submission,
        tab: "issues",
        title: "Отправить исправления на проверку",
      },
    ];
  }

  const questionnaireApplicant = submission.applicants.find((applicant) =>
    ["empty", "partial", "needs_fix"].includes(applicant.questionnaireStatus),
  );
  if (questionnaireApplicant) {
    const missing = questionnaireApplicant.sections.find((section) => section.missing)
      ?.missing;
    actions.push({
      badges: [{ label: "Анкета", tone: "blue" }],
      completed: false,
      context: `${questionnaireApplicant.fullName} · ${questionnaireMissingLabel(
        missing,
      )}`,
      cta: "Продолжить",
      due: "today",
      dueLabel: "Нужно заполнить",
      id: `questionnaire-${submission.id}-${questionnaireApplicant.id}`,
      searchText: "",
      severity: "warning",
      submission,
      tab: "data",
      title: missing?.toLowerCase().includes("поезд")
        ? "Заполнить раздел «Поездка»"
        : `Заполнить анкету ${questionnaireApplicant.fullName}`,
    });
  }

  const missingFiles = submission.files.filter(isMissingAgentFile);
  const visibleMissingFiles =
    submission.status === "draft" ? missingFiles.slice(0, 1) : missingFiles;
  for (const file of visibleMissingFiles) {
    const applicantName = applicantNameForFile(submission, file);
    actions.push({
      badges: [{ label: "Файлы", tone: "amber" }],
      completed: false,
      context: `${submission.title} · добавить файл`,
      cta: "Добавить",
      due: "week",
      dueLabel: "Нужно добавить",
      id: `missing-file-${submission.id}-${file.id}`,
      searchText: "",
      severity: "warning",
      submission,
      tab: "media",
      title: `Добавить ${shortFileTypeName(file.type)} ${applicantName}`,
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

  return [
    {
      badges: [{ label: "Выполнено", tone: "teal" }],
      completed: true,
      context: `${submission.title} · доменный переход выполнен`,
      cta: "Смотреть",
      due: "completed",
      dueLabel: "Выполнено",
      id: `completed-${submission.id}`,
      searchText: "",
      severity: "info",
      submission,
      tab: "history",
      title:
        submission.status === "corrections_received"
          ? "Исправления отправлены на проверку"
          : "Подача передана дальше",
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
      ?.fullName ?? "заявителя"
  );
}

function questionnaireMissingLabel(missing?: string) {
  if (!missing) return "нужно заполнить";
  if (missing.includes("поля")) return missing;
  return "4 поля";
}

function isMissingAgentFile(file: SubmissionFile) {
  return (
    file.status === "missing" &&
    (file.type === "selfie" || file.type === "passport_scan")
  );
}

function shortFileTypeLabel(type: SubmissionFile["type"]) {
  if (type === "video") return "Видео";
  if (type === "passport_scan") return "Паспорт";
  if (type === "photo") return "Фото";
  return "Файлы";
}

function shortFileTypeName(type: SubmissionFile["type"]) {
  if (type === "video") return "видео";
  if (type === "passport_scan") return "загранпаспорт";
  if (type === "selfie") return "селфи";
  if (type === "selfie_2") return "селфи";
  return fileTypeLabels[type].toLowerCase();
}

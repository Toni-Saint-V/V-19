import {
  blockerCount,
  canAgentEditSubmission,
  fixedIssueCount,
  canPerformAction,
  openIssueCount,
  statusLabelFor,
  unresolvedOpenIssueCount,
} from "./status";
import { formatAgentActionRowText } from "./listFormatters";
import { applicantCountLabel, submissionSearchText } from "./selectors";
import type { DrawerTab, Submission, SubmissionFile } from "./types";
import {
  targetForIssue,
  type WorkspaceTarget,
} from "./workspaceModel";

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

export type AgentActionTaskStatus =
  | "action_required"
  | "blocked"
  | "error"
  | "in_review"
  | "ready";

export type AgentActionTaskTarget =
  | "application"
  | "export"
  | "files"
  | "form"
  | "history"
  | "issues";

export type AgentActionTaskReadiness = {
  files: {
    label: string;
    state: "missing_documents" | "ready";
  };
  finalResult: {
    label: string;
    state: "can_continue" | "cannot_continue";
  };
  form: {
    label: string;
    state: "has_errors" | "ready";
  };
  overallPercent: number;
  review: {
    label: string;
    state: "passed" | "pending";
  };
};

export type AgentActionTaskPriority = {
  label: string;
  level: "high" | "low" | "medium" | "urgent";
  reason: string;
  source: "deadline" | "none" | "sla" | "trip_date";
};

export type AgentActionTaskProgressSummary = {
  files: string;
  form: string;
  review: string;
};

export type AgentActionTask = {
  action: AgentActionItem;
  applicantName: string;
  destination: string;
  id: string;
  nextAction: {
    detail: string;
    label: string;
    primaryLabel: string;
    tab: DrawerTab;
    target: AgentActionTaskTarget;
  };
  priority: AgentActionTaskPriority;
  problem: string;
  problemDetail: string;
  problemScope: "applicant" | "submission";
  progressSummary: AgentActionTaskProgressSummary;
  readiness: AgentActionTaskReadiness;
  importanceText: string;
  reason: string;
  secondaryAction: {
    label: "Открыть подачу";
    tab: DrawerTab;
    target: "application";
  };
  status: AgentActionTaskStatus;
  statusLabel: string;
  statusLine: string;
  submission: Submission;
  title: string;
  travelDates: {
    end: string;
    start: string;
  };
};

export type AgentActionTaskSummary = {
  actionRequired: number;
  all: number;
  blocked: number;
  errors: number;
  inReview: number;
  ready: number;
};

export type OperationalWorkEvent = {
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

export function agentActionWorkspaceTarget(
  action: AgentActionItem,
): WorkspaceTarget | undefined {
  const { submission } = action;

  for (const prefix of ["replace", "missing-file"]) {
    const file = submission.files.find(
      (candidate) => action.id === `${prefix}-${submission.id}-${candidate.id}`,
    );
    if (file) {
      return {
        applicantId: file.applicantId,
        fileType: file.type,
        tab: "files",
      };
    }
  }

  const questionnaireApplicant = submission.applicants.find(
    (candidate) => action.id === `questionnaire-${submission.id}-${candidate.id}`,
  );
  if (questionnaireApplicant) {
    const questionnaireIssue = submission.issues.find(
      (issue) =>
        issue.status === "open" &&
        issue.target.applicantId === questionnaireApplicant.id &&
        !issue.target.fileType,
    );
    if (questionnaireIssue) return targetForIssue(questionnaireIssue);

    const incompleteSection = questionnaireApplicant.sections.find(
      (section) => section.status !== "complete",
    );
    const incompleteField = incompleteSection?.fields.find(
      (field) =>
        field.reviewState === "needs_review" ||
        Boolean(field.error?.trim()) ||
        !field.value.trim(),
    );
    return {
      applicantId: questionnaireApplicant.id,
      field: incompleteField?.id,
      section: incompleteSection?.title,
      tab: "questionnaire",
    };
  }

  if (action.id === `submit-corrections-${submission.id}`) {
    const issue =
      submission.issues.find((candidate) => candidate.status === "fixed_by_agent") ??
      submission.issues.find((candidate) => candidate.status === "open");
    return { issueId: issue?.id, tab: "issues" };
  }

  if (action.tab === "issues") {
    const issue =
      submission.issues.find((candidate) => candidate.status === "open") ??
      submission.issues.find((candidate) => candidate.status === "fixed_by_agent");
    return { issueId: issue?.id, tab: "issues" };
  }

  return undefined;
}

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

export function adminWorkEvents(submissions: Submission[]): OperationalWorkEvent[] {
  return submissions.flatMap((submission): OperationalWorkEvent[] => {
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

export function buildAgentActionTasks(actions: AgentActionItem[]): AgentActionTask[] {
  const seenIds = new Map<string, number>();

  return actions.map((action) => {
    const duplicateIndex = seenIds.get(action.id) ?? 0;
    seenIds.set(action.id, duplicateIndex + 1);
    return toAgentActionTask(action, duplicateIndex);
  });
}

export function summarizeAgentActionTasks(
  tasks: AgentActionTask[],
): AgentActionTaskSummary {
  return {
    actionRequired: tasks.filter((task) => task.status === "action_required").length,
    all: tasks.length,
    blocked: tasks.filter((task) => task.status === "blocked").length,
    errors: tasks.filter((task) => task.status === "error").length,
    inReview: tasks.filter((task) => task.status === "in_review").length,
    ready: tasks.filter((task) => task.status === "ready").length,
  };
}

function toAgentActionTask(
  action: AgentActionItem,
  duplicateIndex = 0,
): AgentActionTask {
  const submission = action.submission;
  const status = actionTaskStatus(action);
  const nextAction = actionNextAction(action);
  const readiness = actionReadiness(submission, status);
  const problemScope = actionProblemScope(action);
  const problem = actionProblem(action);
  const statusLabel = actionTaskStatusLabel(status);

  return {
    action,
    applicantName: action.title,
    destination: `${submission.country} · ${submission.city}`,
    id: duplicateIndex === 0 ? action.id : `${action.id}-${duplicateIndex + 1}`,
    nextAction,
    priority: actionPriority(action, status),
    problem,
    problemDetail: actionProblemDetail(action),
    problemScope,
    progressSummary: actionProgressSummary(readiness),
    readiness,
    importanceText: actionImportanceText(action, status),
    reason: actionReason(action),
    secondaryAction: {
      label: "Открыть подачу",
      tab: "overview",
      target: "application",
    },
    status,
    statusLabel,
    statusLine: actionStatusLine(status, statusLabel, problem),
    submission,
    title: `${action.title} — ${submission.id}`,
    travelDates: {
      end: submission.tripDateTo,
      start: submission.tripDateFrom,
    },
  };
}

function actionTaskStatus(action: AgentActionItem): AgentActionTaskStatus {
  if (action.id.startsWith("completed-")) {
    if (
      action.submission.status === "submitted_for_review" ||
      action.submission.status === "corrections_received"
    ) {
      return "in_review";
    }

    return "ready";
  }

  if (action.id.startsWith("submit-corrections-")) return "ready";
  if (action.severity === "blocker" && action.id.startsWith("replace-")) {
    return "error";
  }
  if (action.severity === "blocker") return "blocked";
  if (action.severity === "warning") return "action_required";
  if (action.severity === "ready") return "ready";
  return "in_review";
}

function actionTaskStatusLabel(status: AgentActionTaskStatus) {
  if (status === "error") return "Требует исправления";
  if (status === "action_required") return "Действие";
  if (status === "ready") return "Готово";
  if (status === "blocked") return "Заблокировано";
  return "На проверке";
}

function actionPriority(
  action: AgentActionItem,
  status: AgentActionTaskStatus,
): AgentActionTask["priority"] {
  if (status === "error" || action.due === "overdue") {
    return {
      label: "Срочно",
      level: "urgent",
      reason: "Дедлайн сегодня",
      source: "deadline",
    };
  }
  if (action.due === "today") {
    return {
      label: "Срочно",
      level: "urgent",
      reason: "Дедлайн сегодня",
      source: "deadline",
    };
  }
  if (status === "blocked") {
    return {
      label: "Заблокировано",
      level: "high",
      reason: "Ждём внешнее событие",
      source: "none",
    };
  }
  return { label: "", level: "low", reason: "", source: "none" };
}

function actionNextAction(action: AgentActionItem): AgentActionTask["nextAction"] {
  if (action.id.startsWith("replace-")) {
    return {
      detail: `Заменить файл «${targetName(action)}».`,
      label: action.context,
      primaryLabel: "Заменить файл",
      tab: "files",
      target: "files",
    };
  }
  if (action.id.startsWith("missing-file-")) {
    return {
      detail: `Добавить обязательный файл «${targetName(action)}».`,
      label: "Открыть файлы",
      primaryLabel: "Добавить файл",
      tab: "files",
      target: "files",
    };
  }
  if (action.id.startsWith("questionnaire-")) {
    return {
      detail: "Открыть анкету заявителя и заполнить обязательные поля.",
      label: "Открыть анкету",
      primaryLabel: "Открыть анкету",
      tab: "questionnaire",
      target: "form",
    };
  }
  if (action.id.startsWith("submit-corrections-")) {
    return {
      detail: "Отправить исправления администратору после проверки замечаний.",
      label: "Отправить исправления",
      primaryLabel: "Отправить",
      tab: "issues",
      target: "issues",
    };
  }
  if (action.id.startsWith("completed-")) {
    if (action.submission.status === "ready_for_export") {
      return {
        detail:
          "Проверить статус выгрузки. Агент не выгружает пакет напрямую.",
        label: "Открыть статус выгрузки",
        primaryLabel: "Проверить статус",
        tab: "history",
        target: "history",
      };
    }

    return {
      detail: "Проверить историю передачи и дождаться решения администратора.",
      label: "Проверить историю",
      primaryLabel: "Проверить историю",
      tab: "history",
      target: "history",
    };
  }

  return {
    detail: action.context,
    label: action.cta,
    primaryLabel: action.cta,
    tab: action.tab,
    target: "application",
  };
}

function actionStatusLine(
  status: AgentActionTaskStatus,
  statusLabel: string,
  problem: string,
) {
  if (status === "error") return `${statusLabel}: ${lowercaseFirst(problem)}`;
  if (status === "action_required") {
    if (problem === "Анкета заполнена не полностью") {
      return `${statusLabel}: анкета неполная`;
    }
    return `${statusLabel}: ${lowercaseFirst(problem)}`;
  }
  if (status === "ready") {
    if (problem === "Подача готова к выгрузке") return `${statusLabel}: можно выгружать`;
    return `${statusLabel}: можно передавать дальше`;
  }
  if (status === "blocked") return `${statusLabel}: ждём внешнее событие`;
  return `${statusLabel}: ожидает решения`;
}

function actionProblem(action: AgentActionItem) {
  if (action.id.startsWith("replace-") || action.id.startsWith("missing-file-")) {
    return "Файлы не готовы";
  }
  if (action.id.startsWith("questionnaire-")) {
    return "Анкета заполнена не полностью";
  }
  if (action.id.startsWith("submit-corrections-")) {
    return "Исправления готовы к отправке";
  }
  if (action.id.startsWith("completed-")) {
    if (action.submission.status === "ready_for_export") {
      return "Подача готова к выгрузке";
    }
    if (action.submission.status === "submitted_for_review") {
      return "Подача на проверке";
    }
    if (action.submission.status === "corrections_received") {
      return "Исправления на проверке";
    }
    return "Подача передана дальше";
  }

  return statusLabelFor(action.submission.status);
}

function actionReason(action: AgentActionItem) {
  const submission = action.submission;
  const fileCounts = activeFileCounts(submission);

  if (action.id.startsWith("replace-")) {
    return `${action.context}: файл требует замены`;
  }
  if (action.id.startsWith("missing-file-")) {
    return `Файлы не готовы: ${fileCounts.ready}/${fileCounts.required} обязательных загружено`;
  }
  if (action.id.startsWith("questionnaire-")) {
    return action.context;
  }
  if (action.id.startsWith("submit-corrections-")) {
    return `${fixedIssueCount(submission)} замечания отмечены исправленными`;
  }
  if (action.id.startsWith("completed-")) {
    if (submission.status === "ready_for_export") {
      return "Администратор принял пакет; агентских прав на выгрузку нет";
    }
    if (submission.status === "submitted_for_review") {
      return "Пакет отправлен администратору и ожидает решения";
    }
    if (submission.status === "corrections_received") {
      return "Исправления отправлены администратору";
    }
  }

  return action.context;
}

function actionProblemScope(action: AgentActionItem): AgentActionTask["problemScope"] {
  if (
    action.id.startsWith("replace-") ||
    action.id.startsWith("missing-file-") ||
    action.id.startsWith("questionnaire-")
  ) {
    return "applicant";
  }

  return "submission";
}

function actionProblemDetail(action: AgentActionItem) {
  if (action.id.startsWith("replace-")) {
    return `Файл «${targetName(action)}» требует замены.`;
  }
  if (action.id.startsWith("missing-file-")) {
    return `Не загружен обязательный файл «${targetName(action)}».`;
  }
  if (action.id.startsWith("questionnaire-")) {
    return `У заявителя не заполнены обязательные поля анкеты: ${action.context}.`;
  }
  if (action.id.startsWith("submit-corrections-")) {
    return "Все замечания отмечены исправленными и готовы к отправке.";
  }
  if (action.id.startsWith("completed-")) {
    if (action.submission.status === "ready_for_export") {
      return "Подача принята администратором и готова к следующему этапу.";
    }
    return actionReason(action);
  }

  return actionReason(action);
}

function actionImportanceText(
  action: AgentActionItem,
  status: AgentActionTaskStatus,
) {
  if (status === "error") return "Без этого подачу нельзя продолжить.";
  if (status === "blocked") return "Агент не может продолжить без внешнего события.";
  if (status === "action_required") {
    return "Это действие нужно выполнить, чтобы подача не застряла в очереди.";
  }
  if (status === "ready") return "Подачу можно передавать дальше по процессу.";
  if (action.id.startsWith("completed-")) return "Решение ожидается на следующем этапе.";
  return "Статус нужно отслеживать до следующего решения.";
}

function actionReadiness(
  submission: Submission,
  status: AgentActionTaskStatus,
): AgentActionTaskReadiness {
  const files = activeFileCounts(submission);
  const formReady =
    submission.completeness.questionnaire >= 100 &&
    submission.applicants.every(
      (applicant) => applicant.questionnaireStatus === "complete",
    );
  const filesReady = files.required > 0 && files.ready >= files.required;
  const reviewPassed = ["ready_for_export", "exported"].includes(submission.status);
  const canContinue =
    status === "ready" ||
    (status !== "in_review" &&
      formReady &&
      filesReady &&
      blockerCount(submission) === 0);

  return {
    files: {
      label: filesReady
        ? "Файлы: готово"
        : `Файлы: ${files.ready} из ${files.required}`,
      state: filesReady ? "ready" : "missing_documents",
    },
    finalResult: {
      label: canContinue ? "Итог: можно продолжить" : "Итог: нельзя продолжить",
      state: canContinue ? "can_continue" : "cannot_continue",
    },
    form: {
      label: formReady ? "Анкета: готово" : "Анкета: есть ошибки",
      state: formReady ? "ready" : "has_errors",
    },
    overallPercent: submission.completeness.total,
    review: {
      label: reviewPassed ? "Проверка: пройдена" : "Проверка: ожидает",
      state: reviewPassed ? "passed" : "pending",
    },
  };
}

function actionProgressSummary(
  readiness: AgentActionTaskReadiness,
): AgentActionTaskProgressSummary {
  return {
    files:
      readiness.files.state === "ready"
        ? "Файлы готовы"
        : readiness.files.label.replace("Файлы: ", "Файлы "),
    form:
      readiness.form.state === "ready" ? "Анкета готова" : "Анкета с ошибками",
    review:
      readiness.review.state === "passed"
        ? "Проверка пройдена"
        : "Проверка ожидает",
  };
}

function targetName(action: AgentActionItem) {
  const normalized = action.context
    .replace(/^Заменить\s+/i, "")
    .replace(/^Добавить\s+/i, "")
    .trim();

  return normalized ? normalized.toLowerCase() : action.context.toLowerCase();
}

function lowercaseFirst(value: string) {
  if (!value) return value;
  return value[0].toLocaleLowerCase("ru-RU") + value.slice(1);
}

function activeFileCounts(submission: Submission) {
  const requiredFiles = submission.files.filter(isActiveAgentFile);
  return {
    ready: requiredFiles.filter(
      (file) => file.status !== "missing" && file.status !== "needs_replacement",
    ).length,
    required: requiredFiles.length,
  };
}

function agentOpenActions(submission: Submission): AgentActionItem[] {
  if (!canAgentEditSubmission(submission)) return [];

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
    submission.status === "draft"
      ? missingFiles.slice(0, 1)
      : firstMissingFilePerApplicant(missingFiles);
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

function firstMissingFilePerApplicant(files: SubmissionFile[]) {
  const seenApplicants = new Set<string>();

  return files.filter((file) => {
    const ownerKey = file.applicantId ?? "submission";
    if (seenApplicants.has(ownerKey)) return false;
    seenApplicants.add(ownerKey);
    return true;
  });
}

function agentCompletedActions(submission: Submission): AgentActionItem[] {
  if (
    ![
      "submitted_for_review",
      "corrections_received",
      "ready_for_export",
      "exported",
    ].includes(submission.status)
  ) {
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
  const status = actionTaskStatus(action);
  const statusLabel = actionTaskStatusLabel(status);
  const problem = actionProblem(action);
  const nextAction = actionNextAction(action);
  const readiness = actionReadiness(action.submission, status);

  return {
    ...action,
    searchText: [
      action.title,
      action.context,
      action.cta,
      action.dueLabel,
      statusLabel,
      actionStatusLine(status, statusLabel, problem),
      problem,
      actionProblemDetail(action),
      actionReason(action),
      nextAction.label,
      nextAction.primaryLabel,
      nextAction.detail,
      actionImportanceText(action, status),
      ...Object.values(actionProgressSummary(readiness)),
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

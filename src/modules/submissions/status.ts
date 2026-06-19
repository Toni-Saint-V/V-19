import type {
  ActionDecision,
  DrawerTab,
  Issue,
  Role,
  Submission,
  SubmissionAction,
  SubmissionFileStatus,
  SubmissionStatus,
} from "./types";
import { clearOpenQuestionnaireIssueErrors } from "./questionnaire";
import { requiresPassportExtractionReviewBeforeAction } from "./passportExtractionGuards";

export const statusLabels: Record<SubmissionStatus, string> = {
  draft: "Черновик",
  in_progress: "В работе",
  requires_action: "Действие",
  submitted_for_review: "Проверка",
  returned: "Возвращено",
  corrections_received: "Исправления",
  ready_for_export: "Готово",
  exported: "Выгружено",
};

export const statusTone = {
  draft: "muted",
  in_progress: "amber",
  requires_action: "danger",
  submitted_for_review: "blue",
  returned: "danger",
  corrections_received: "amber",
  ready_for_export: "teal",
  exported: "muted",
} satisfies Record<SubmissionStatus, "amber" | "blue" | "danger" | "muted" | "teal">;

export const fileStatusLabels: Record<SubmissionFileStatus, string> = {
  missing: "Нет файла",
  uploaded: "Загружено",
  needs_replacement: "Нужна замена",
  pending_review: "Ожидает проверки",
  accepted: "Принято",
};

export const fileTypeLabels = {
  photo: "Фото на белом фоне",
  selfie: "Селфи",
  selfie_2: "Селфи N2",
  passport_scan: "Загранпаспорт",
  video: "Видео 1 минута",
} satisfies Record<Submission["files"][number]["type"], string>;

export const typeLabels = {
  single: "Один заявитель",
  family: "Семья",
};

export const roleLabels: Record<Role, string> = {
  agent: "Агент",
  admin: "Администратор",
};

export const agentEditableStatuses: SubmissionStatus[] = [
  "draft",
  "in_progress",
  "requires_action",
  "returned",
];

export const adminIssueStatuses: SubmissionStatus[] = [
  "submitted_for_review",
  "corrections_received",
];

export function canAgentEditSubmissionContent(submission: Submission) {
  return agentEditableStatuses.includes(submission.status);
}

export function canAddAdminIssue(submission: Submission, role: Role) {
  return role === "admin" && adminIssueStatuses.includes(submission.status);
}

export const transitionMatrix: Record<
  SubmissionAction,
  { from: SubmissionStatus[]; to: SubmissionStatus; role: Role }
> = {
  save_progress: { from: ["draft"], to: "in_progress", role: "agent" },
  submit_for_review: {
    from: ["in_progress"],
    to: "submitted_for_review",
    role: "agent",
  },
  submit_corrections: {
    from: ["returned", "requires_action"],
    to: "corrections_received",
    role: "agent",
  },
  return_with_issues: {
    from: ["submitted_for_review"],
    to: "returned",
    role: "admin",
  },
  accept: {
    from: ["submitted_for_review"],
    to: "ready_for_export",
    role: "admin",
  },
  close_issues_accept: {
    from: ["corrections_received"],
    to: "ready_for_export",
    role: "admin",
  },
  return_again: {
    from: ["corrections_received"],
    to: "returned",
    role: "admin",
  },
  generate_export: {
    from: ["ready_for_export"],
    to: "ready_for_export",
    role: "admin",
  },
  mark_exported: {
    from: ["ready_for_export"],
    to: "exported",
    role: "admin",
  },
  open_history: {
    from: ["exported"],
    to: "exported",
    role: "admin",
  },
};

export function openIssueCount(submission: Submission) {
  return submission.issues.filter((issue) => issue.status === "open").length;
}

export function blockerCount(submission: Submission) {
  return submission.issues.filter(
    (issue) => issue.status === "open" && issue.severity === "blocker",
  ).length;
}

export function unresolvedOpenIssueCount(submission: Submission) {
  return submission.issues.filter(
    (issue) => issue.status === "open" && !isIssueResolved(submission, issue),
  ).length;
}

export function fixedIssueCount(submission: Submission) {
  return submission.issues.filter((issue) => issue.status === "fixed_by_manager")
    .length;
}

export function hasRequiredBasics(submission: Submission) {
  return submission.city && submission.applicants.length > 0;
}

export function hasMissingRequiredWork(submission: Submission) {
  return (
    submission.completeness.questionnaire < 100 ||
    submission.completeness.files < 100 ||
    submission.files.some(
      (file) => file.status === "missing" || file.status === "needs_replacement",
    )
  );
}

export function defaultDrawerTab(submission: Submission): DrawerTab {
  if (submission.status === "exported") return "history";
  if (openIssueCount(submission) > 0 || fixedIssueCount(submission) > 0)
    return "issues";
  if (
    submission.files.some(
      (file) => file.status === "needs_replacement" || file.status === "missing",
    )
  ) {
    return "media";
  }
  if (
    submission.applicants.some(
      (applicant) => applicant.questionnaireStatus === "needs_fix",
    )
  ) {
    return "data";
  }
  return "overview";
}

export function nextProblem(submission: Submission) {
  const blockers = blockerCount(submission);
  if (blockers > 0) return `${blockers} блокера мешают движению дальше`;
  if (unresolvedOpenIssueCount(submission) > 0) {
    return "Открытые замечания ждут точечного исправления";
  }
  const open = openIssueCount(submission);
  if (open > 0) return `${open} замечаний ожидают исправления`;
  if (fixedIssueCount(submission) > 0)
    return "Исправления ждут закрытия администратором";
  if (hasMissingRequiredWork(submission))
    return "Не все обязательные анкеты и файлы готовы";
  if (submission.status === "submitted_for_review")
    return "Ожидает внутренней проверки";
  if (submission.status === "ready_for_export") return "Подача готова к Эксель";
  if (submission.status === "exported") return "Подача уже выгружена";
  return "Блокеров нет";
}

export function responsibleRole(submission: Submission) {
  if (
    submission.status === "submitted_for_review" ||
    submission.status === "corrections_received" ||
    submission.status === "ready_for_export" ||
    submission.status === "exported"
  ) {
    return "Администратор";
  }
  return "Агент";
}

export function canPerformAction(
  submission: Submission,
  action: SubmissionAction,
  role: Role,
): { ok: boolean; reason?: string } {
  if (action === "open_history") return { ok: true };

  const transition = transitionMatrix[action];
  if (transition.role !== role) return { ok: false, reason: "Недостаточно прав" };
  if (!transition.from.includes(submission.status)) {
    return { ok: false, reason: "Действие недоступно в текущем статусе" };
  }

  if (action === "save_progress" && !hasRequiredBasics(submission)) {
    return { ok: false, reason: "Нужен город и хотя бы один заявитель" };
  }

  if (action === "submit_for_review" && hasMissingRequiredWork(submission)) {
    return { ok: false, reason: "Есть незаполненные поля или недостающие файлы" };
  }

  if (requiresPassportExtractionReviewBeforeAction(submission, action)) {
    return {
      ok: false,
      reason: "Проверьте распознанные паспортные данные перед отправкой",
    };
  }

  if (action === "submit_corrections" && openIssueCount(submission) === 0) {
    return { ok: false, reason: "Нет открытых замечаний для исправления" };
  }

  if (action === "submit_corrections" && unresolvedOpenIssueCount(submission) > 0) {
    return { ok: false, reason: "Сначала исправьте целевые замечания" };
  }

  if (action === "return_with_issues" && openIssueCount(submission) === 0) {
    return { ok: false, reason: "Нужно добавить точное замечание" };
  }

  if (action === "return_again" && openIssueCount(submission) === 0) {
    return { ok: false, reason: "Нужно добавить точное замечание" };
  }

  if (
    (action === "accept" || action === "close_issues_accept") &&
    blockerCount(submission) > 0
  ) {
    return { ok: false, reason: "Открытые блокеры не закрыты" };
  }

  if (action === "close_issues_accept" && fixedIssueCount(submission) === 0) {
    return { ok: false, reason: "Нет исправлений для закрытия" };
  }

  return { ok: true };
}

export function getCardActionLabel(submission: Submission, role: Role) {
  if (role === "agent") {
    const labels: Record<SubmissionStatus, string> = {
      draft: "Дозаполнить",
      in_progress: "Дозаполнить",
      requires_action: "Исправить",
      submitted_for_review: "Смотреть статус",
      returned: "Исправить",
      corrections_received: "Смотреть статус",
      ready_for_export: "К выгрузке",
      exported: "Открыть историю",
    };
    return labels[submission.status];
  }

  if (submission.status === "submitted_for_review") return "Проверить";
  if (submission.status === "corrections_received") return "Проверить исправления";
  if (submission.status === "ready_for_export") return "К выгрузке";
  if (submission.status === "exported") return "Открыть историю";
  return "Смотреть статус";
}

export function getPrimaryAction(
  submission: Submission,
  role: Role,
  surface: "agent" | "review" | "export",
): ActionDecision {
  if (surface === "export") {
    if (submission.status === "ready_for_export") {
      return { action: "generate_export", label: "Сформировать Эксель" };
    }
    return { action: "open_history", label: "Открыть историю", disabled: true };
  }

  if (role === "agent") {
    const byStatus: Record<SubmissionStatus, ActionDecision> = {
      draft: { action: "save_progress", label: "Сохранить черновик" },
      in_progress: { action: "submit_for_review", label: "Отправить" },
      requires_action: { action: "submit_corrections", label: "Отправить исправления" },
      returned: { action: "submit_corrections", label: "Отправить исправления" },
      submitted_for_review: { action: "open_history", label: "Смотреть статус" },
      corrections_received: { action: "open_history", label: "Смотреть статус" },
      ready_for_export: { action: "open_history", label: "К выгрузке" },
      exported: { action: "open_history", label: "Открыть историю" },
    };
    const decision = byStatus[submission.status];
    const guard = canPerformAction(submission, decision.action, role);
    return { ...decision, disabled: !guard.ok, reason: guard.reason };
  }

  if (submission.status === "corrections_received") {
    const decision = {
      action: "close_issues_accept",
      label: "Закрыть и принять",
    } as const;
    const guard = canPerformAction(submission, decision.action, role);
    return { ...decision, disabled: !guard.ok, reason: guard.reason };
  }

  if (submission.status === "submitted_for_review") {
    const decision = {
      action: openIssueCount(submission) > 0 ? "return_with_issues" : "accept",
      label: openIssueCount(submission) > 0 ? "Вернуть" : "Принять",
    } as const;
    const guard = canPerformAction(submission, decision.action, role);
    return { ...decision, disabled: !guard.ok, reason: guard.reason };
  }

  if (submission.status === "ready_for_export") {
    return { action: "generate_export", label: "Готово к выгрузке" };
  }

  return { action: "open_history", label: "Смотреть статус", disabled: false };
}

export function applySubmissionAction(
  submission: Submission,
  action: SubmissionAction,
  role: Role,
  actorId?: string,
): Submission {
  const guard = canPerformAction(submission, action, role);
  if (!guard.ok) return submission;

  if (action === "submit_corrections") {
    const corrected = clearOpenQuestionnaireIssueErrors(submission);

    return {
      ...corrected,
      status: "corrections_received",
      issues: corrected.issues.map((issue) =>
        issue.status === "open" ? { ...issue, status: "fixed_by_manager" } : issue,
      ),
      updatedAt: "сейчас",
      history: [
        {
          id: `и-${submission.id}-исправления`,
          text: "Агент отправил исправления",
          at: "сейчас",
          source: "agent",
        },
        ...corrected.history,
      ],
    };
  }

  if (action === "close_issues_accept") {
    const reviewedAtIso = new Date().toISOString();
    return {
      ...submission,
      status: "ready_for_export",
      exportState: "ready",
      files: markReviewFilesAccepted(submission.files, reviewedAtIso, actorId),
      issues: submission.issues.map((issue) =>
        issue.status === "fixed_by_manager"
          ? { ...issue, status: "closed_by_admin" }
          : issue,
      ),
      updatedAt: "сейчас",
      history: [
        {
          id: `и-${submission.id}-принято`,
          text: "Администратор закрыл исправления и принял подачу",
          at: "сейчас",
          source: "admin",
        },
        ...submission.history,
      ],
    };
  }

  if (action === "accept") {
    const reviewedAtIso = new Date().toISOString();
    return {
      ...submission,
      status: "ready_for_export",
      exportState: "ready",
      files: markReviewFilesAccepted(submission.files, reviewedAtIso, actorId),
      updatedAt: "сейчас",
      history: [
        {
          id: `и-${submission.id}-принято`,
          text: "Администратор принял подачу",
          at: "сейчас",
          source: "admin",
        },
        ...submission.history,
      ],
    };
  }

  if (action === "submit_for_review") {
    return {
      ...submission,
      status: "submitted_for_review",
      files: submission.files.map((file) =>
        file.status === "uploaded" ? { ...file, status: "pending_review" } : file,
      ),
      updatedAt: "сейчас",
      history: [
        {
          id: `и-${submission.id}-на-проверку`,
          text: "Агент отправил подачу на проверку",
          at: "сейчас",
          source: "agent",
        },
        ...submission.history,
      ],
    };
  }

  if (action === "mark_exported") {
    return {
      ...submission,
      status: "exported",
      exportState: "marked_exported",
      updatedAt: "сейчас",
      history: [
        {
          id: `и-${submission.id}-выгружено`,
          text: "Подача отмечена выгруженной",
          at: "сейчас",
          source: "admin",
        },
        ...submission.history,
      ],
    };
  }

  const transition = transitionMatrix[action];
  return {
    ...submission,
    status: transition.to,
    updatedAt: "сейчас",
    history: [
      {
        id: `и-${submission.id}-${action}`,
        text: `Статус изменен: ${statusLabels[transition.to]}`,
        at: "сейчас",
        source: role,
      },
      ...submission.history,
    ],
  };
}

function markReviewFilesAccepted(
  files: Submission["files"],
  reviewedAtIso: string,
  reviewedBy?: string,
): Submission["files"] {
  return files.map((file) => {
    if (
      file.status !== "uploaded" &&
      file.status !== "pending_review" &&
      file.status !== "accepted"
    ) {
      return file;
    }

    return {
      ...file,
      status: "accepted" as const,
      reviewedAtIso: file.reviewedAtIso ?? reviewedAtIso,
      reviewedBy: file.reviewedBy ?? reviewedBy,
      reviewStatus: "accepted" as const,
    };
  });
}

function isIssueResolved(submission: Submission, issue: Issue) {
  if (issue.target.fileType) {
    const file = submission.files.find(
      (item) =>
        item.applicantId === issue.target.applicantId &&
        item.type === issue.target.fileType,
    );
    if (!file || file.status === "missing" || file.status === "needs_replacement")
      return false;
    return issue.snapshot ? file.status !== issue.snapshot : true;
  }

  const applicant = submission.applicants.find(
    (item) => item.id === issue.target.applicantId,
  );
  if (!applicant) return false;

  if (issue.type === "section") {
    const section = applicant.sections.find(
      (item) =>
        item.title === issue.target.field || item.title === issue.target.section,
    );
    return Boolean(section && section.status === "complete");
  }

  const fields = applicant.sections.flatMap((section) => section.fields);
  const field = fields.find((item) => item.label === issue.target.field);
  if (!field) return false;

  const value = field.value.trim();
  if (!value) return false;
  return issue.snapshot ? value !== issue.snapshot : true;
}

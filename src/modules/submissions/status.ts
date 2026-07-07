import type {
  ActionDecision,
  CommandResult,
  DomainErrorCode,
  DrawerTab,
  Issue,
  Role,
  Submission,
  SubmissionAction,
  SubmissionFileStatus,
  SubmissionStatus,
} from "./types";
import { clearOpenQuestionnaireIssueErrors } from "./questionnaire";
import {
  passportGateIssues,
  passportGateReason,
  requiresPassportExtractionReviewBeforeAction,
  requiresPassportGateBeforeAction,
} from "./passportExtractionGuards";
import {
  canonicalRequiredMediaReadiness,
  isCanonicalSubmissionStatus,
  isIssueTransitionAllowed,
  isKnownContractRole,
  isStatusTransitionAllowed,
} from "./domainContract";
import { firstProductionReadinessBlocker } from "./productionReadinessGate";

const statusLabelVariants = {
  draft: { compact: "Черновик", full: "Черновик" },
  in_progress: { compact: "В работе", full: "В работе" },
  requires_action: { compact: "Возвращено", full: "Действие" },
  submitted_for_review: { compact: "Проверка", full: "На проверке" },
  returned: { compact: "Возвращено", full: "Возвращено" },
  corrections_received: {
    compact: "Исправление",
    full: "Исправления получены",
  },
  ready_for_export: { compact: "Готово", full: "Готово к выгрузке" },
  exported: { compact: "Выгружено", full: "Выгружено" },
} satisfies Record<SubmissionStatus, { compact: string; full: string }>;

export function statusLabelFor(
  status: SubmissionStatus,
  variant: "compact" | "full" = "full",
) {
  return statusLabelVariants[status][variant];
}

export const statusLabels: Record<SubmissionStatus, string> = {
  draft: statusLabelFor("draft"),
  in_progress: statusLabelFor("in_progress"),
  requires_action: statusLabelFor("requires_action"),
  submitted_for_review: statusLabelFor("submitted_for_review"),
  returned: statusLabelFor("returned"),
  corrections_received: statusLabelFor("corrections_received"),
  ready_for_export: statusLabelFor("ready_for_export"),
  exported: statusLabelFor("exported"),
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

export type AdminWorkTone = "info" | "success" | "warning";

export function adminWorkDrawerTabFor(submission: Submission): DrawerTab {
  if (submission.status === "corrections_received") return "issues";
  return "overview";
}

export function adminWorkPresentation(submission: Submission): {
  actionLabel: string;
  stage: string;
  tone: AdminWorkTone;
} {
  if (submission.status === "corrections_received") {
    return {
      actionLabel: "Проверить",
      stage: "Исправления",
      tone: "warning",
    };
  }

  if (submission.status === "ready_for_export") {
    return {
      actionLabel: "Пакет",
      stage: "К выгрузке",
      tone: "success",
    };
  }

  return {
    actionLabel: "Открыть",
    stage: "Новая проверка",
    tone: "info",
  };
}

export function adminWorkEventTitle(submission: Submission, fallback: string) {
  if (submission.status === "corrections_received") {
    return "Исправления получены";
  }

  if (submission.status === "submitted_for_review") {
    return "Новая подача на проверке";
  }

  if (submission.status === "ready_for_export") {
    return "Подача принята к выгрузке";
  }

  return fallback;
}

export const fileStatusLabels: Record<SubmissionFileStatus, string> = {
  missing: "Нет файла",
  uploaded: "Загружено",
  needs_replacement: "Заменить",
  pending_review: "Проверить",
  accepted: "Принято",
};

export const fileTypeLabels = {
  photo: "Фото",
  photo_white: "Фото",
  selfie: "Селфи 1",
  selfie_2: "Селфи 2",
  passport_scan: "Скан паспорта",
  video: "Видео",
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
  "returned",
];

export const adminIssueStatuses: SubmissionStatus[] = [
  "submitted_for_review",
  "corrections_received",
];

export function canAgentEditSubmissionContent(submission: Submission) {
  return agentEditableStatuses.includes(submission.status);
}

export function canEditSubmissionContent(submission: Submission, role: Role) {
  return role === "agent" && canAgentEditSubmissionContent(submission);
}

export function adminIssueGuard(
  submission: Submission,
  role: Role,
): { ok: true } | { ok: false; reason: string } {
  if (role !== "admin") return { ok: false, reason: "Недостаточно прав" };
  if (adminIssueStatuses.includes(submission.status)) return { ok: true };
  if (submission.status === "ready_for_export") {
    return {
      ok: false,
      reason: "Пакет уже принят. Новое замечание доступно только до принятия.",
    };
  }
  if (submission.status === "exported") {
    return {
      ok: false,
      reason: "Подача уже выгружена. Возврат из истории не выполняется.",
    };
  }
  return {
    ok: false,
    reason: "Возврат доступен только для подач на проверке или после исправлений.",
  };
}

export function canAddAdminIssue(submission: Submission, role: Role) {
  return adminIssueGuard(submission, role).ok;
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
    from: ["returned"],
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

const packageLevelExportActionReason =
  "Формирование Excel выполняется только через пакет выгрузки";
const missingTripDateRangeReason = "Укажите даты поездки перед отправкой";
const productionReadinessGateActions = new Set<SubmissionAction>([
  "submit_for_review",
  "submit_corrections",
  "accept",
  "close_issues_accept",
  "mark_exported",
]);

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
    (issue) => issue.status === "open" && !isSubmissionIssueResolved(submission, issue),
  ).length;
}

export function fixedIssueCount(submission: Submission) {
  return submission.issues.filter((issue) => isFixedIssueStatus(issue.status)).length;
}

export function isFixedIssueStatus(status: Issue["status"]) {
  return status === "fixed_by_agent";
}

export function acceptanceBlockingIssueCount(submission: Submission) {
  return submission.issues.filter(
    (issue) =>
      issue.severity === "blocker" &&
      (issue.status === "open" || isFixedIssueStatus(issue.status)),
  ).length;
}

export function hasRequiredBasics(submission: Submission) {
  return submission.city && submission.applicants.length > 0;
}

export function hasUsableTripDateRange(submission: Submission) {
  const from = submission.tripDateFrom.trim();
  const to = submission.tripDateTo.trim();
  return Boolean(from && to && from !== "не указано" && to !== "не указано");
}

export function hasMissingRequiredWork(submission: Submission) {
  const media = canonicalRequiredMediaReadiness(submission);

  return (
    submission.completeness.questionnaire < 100 ||
    submission.completeness.files < 100 ||
    !media.ok ||
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
    return "files";
  }
  if (
    submission.applicants.some(
      (applicant) => applicant.questionnaireStatus === "needs_fix",
    )
  ) {
    return "questionnaire";
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
  if (fixedIssueCount(submission) > 0) {
    if (submission.status === "returned") {
      if (requiresPassportGateBeforeAction(submission, "submit_corrections")) {
        return passportGateReason(submission);
      }
      return "Исправления готовы к отправке";
    }
    return "Исправления ждут закрытия администратором";
  }
  if (hasMissingRequiredWork(submission))
    return "Не все обязательные анкеты и файлы готовы";
  if (
    submission.status === "in_progress" &&
    requiresPassportGateBeforeAction(submission, "submit_for_review")
  ) {
    return passportGateReason(submission);
  }
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
  if (!isKnownContractRole(role)) return { ok: false, reason: "Недостаточно прав" };
  if (!isCanonicalSubmissionStatus(submission.status)) {
    return { ok: false, reason: "Действие недоступно в текущем статусе" };
  }
  const transition = transitionMatrix[action];
  if (transition.role !== role) return { ok: false, reason: "Недостаточно прав" };
  if (!transition.from.includes(submission.status)) {
    return { ok: false, reason: "Действие недоступно в текущем статусе" };
  }
  if (
    action !== "open_history" &&
    !isStatusTransitionAllowed(submission.status, transition.to, {
      mutating: true,
    })
  ) {
    return { ok: false, reason: "Действие недоступно в текущем статусе" };
  }

  if (action === "generate_export") {
    return { ok: false, reason: packageLevelExportActionReason };
  }

  if (action === "save_progress" && !hasRequiredBasics(submission)) {
    return { ok: false, reason: "Нужен город и хотя бы один заявитель" };
  }

  if (action === "submit_for_review" && hasMissingRequiredWork(submission)) {
    return { ok: false, reason: "Есть незаполненные поля или недостающие файлы" };
  }

  if (
    action === "submit_for_review" &&
    acceptanceBlockingIssueCount(submission) > 0
  ) {
    return { ok: false, reason: "Есть незакрытые замечания" };
  }

  if (requiresPassportGateBeforeAction(submission, action)) {
    return {
      ok: false,
      reason: passportGateReason(submission),
    };
  }

  if (requiresPassportExtractionReviewBeforeAction(submission, action)) {
    return {
      ok: false,
      reason: "Проверьте распознанные паспортные данные перед отправкой",
    };
  }

  if (action === "submit_for_review" && !hasUsableTripDateRange(submission)) {
    return { ok: false, reason: missingTripDateRangeReason };
  }

  if (
    action === "submit_corrections" &&
    fixedIssueCount(submission) === 0
  ) {
    return { ok: false, reason: "Сначала отметьте замечания исправленными" };
  }

  if (action === "submit_corrections" && openIssueCount(submission) > 0) {
    return { ok: false, reason: "Сначала отметьте замечания исправленными" };
  }

  if (action === "return_with_issues" && openIssueCount(submission) === 0) {
    return { ok: false, reason: "Нужно добавить точное замечание" };
  }

  if (action === "return_again" && openIssueCount(submission) === 0) {
    return { ok: false, reason: "Нужно добавить точное замечание" };
  }

  if (action === "accept" && acceptanceBlockingIssueCount(submission) > 0) {
    return { ok: false, reason: "Есть незакрытые замечания" };
  }

  if (
    (action === "accept" || action === "close_issues_accept") &&
    !hasUsableTripDateRange(submission)
  ) {
    return { ok: false, reason: missingTripDateRangeReason };
  }

  if (
    (action === "accept" || action === "close_issues_accept") &&
    !canonicalRequiredMediaReadiness(submission, { requireAccepted: false }).ok
  ) {
    return { ok: false, reason: "Есть незаполненные поля или недостающие файлы" };
  }

  if (action === "close_issues_accept" && blockerCount(submission) > 0) {
    return { ok: false, reason: "Есть незакрытые замечания" };
  }

  if (
    action === "mark_exported" &&
    (submission.exportState !== "file_downloaded" || !submission.exportPackage)
  ) {
    return { ok: false, reason: "Сначала сформируйте и скачайте пакет выгрузки" };
  }

  if (productionReadinessGateActions.has(action)) {
    const blocker = firstProductionReadinessBlocker(submission);
    if (blocker) return { ok: false, reason: blocker.detail };
  }

  return { ok: true };
}

export function markSubmissionIssueFixedResult(
  submission: Submission,
  issueId: string,
  role: Role,
): CommandResult<Submission> {
  if (role !== "agent") {
    return {
      ok: false,
      error: {
        code: "PERMISSION_DENIED",
        message: "Only agent can mark issue fixed.",
      },
    };
  }
  if (!isCanonicalSubmissionStatus(submission.status)) {
    return {
      ok: false,
      error: {
        code: "INVALID_TRANSITION",
        message: "Submission status is not canonical.",
      },
    };
  }
  if (submission.status === "exported") {
    return {
      ok: false,
      error: {
        code: "EXPORTED_TERMINAL",
        message: "Exported is terminal for V-19.",
      },
    };
  }
  if (submission.status !== "returned") {
    return {
      ok: false,
      error: {
        code: "INVALID_TRANSITION",
        message: "Issues can be marked fixed only after admin return.",
      },
    };
  }

  const issue = submission.issues.find((item) => item.id === issueId);
  if (!issue) {
    return {
      ok: false,
      error: { code: "ISSUE_NOT_FOUND", message: "Issue not found." },
    };
  }
  if (issue.status !== "open") {
    return {
      ok: false,
      error: {
        code: "ISSUE_NOT_FIXABLE",
        message: "Only open issues can be marked fixed.",
      },
    };
  }
  if (!isSubmissionIssueResolved(submission, issue)) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Issue target must be corrected before it can be marked fixed.",
      },
    };
  }

  const clearedSubmission = clearOpenQuestionnaireIssueErrors(submission);
  const withFixedIssue: Submission = {
    ...clearedSubmission,
    issues: clearedSubmission.issues.map((item) =>
      item.id === issueId && isIssueTransitionAllowed(item.status, "fixed_by_agent")
        ? { ...item, status: "fixed_by_agent" }
        : item,
    ),
    updatedAt: "сейчас",
    history: [
      {
        id: `и-${submission.id}-${issueId}-исправлено`,
        text: "Агент отметил замечание исправленным",
        at: "сейчас",
        source: "agent",
      },
      ...submission.history,
    ],
  };

  return { ok: true, data: withFixedIssue };
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
    if (decision.action === "open_history") return decision;

    const guard = canPerformAction(submission, decision.action, role);
    const waitsForPassportReview =
      requiresPassportExtractionReviewBeforeAction(submission, decision.action) &&
      guard.reason === "Проверьте распознанные паспортные данные перед отправкой";
    return {
      ...decision,
      disabled: !guard.ok && !waitsForPassportReview,
      reason: guard.reason,
    };
  }

  if (submission.status === "corrections_received") {
    const shouldReturnAgain = blockerCount(submission) > 0;
    const decision = {
      action: shouldReturnAgain ? "return_again" : "close_issues_accept",
      label: shouldReturnAgain ? "Вернуть снова" : "Закрыть и принять",
    } as const;
    const guard = canPerformAction(submission, decision.action, role);
    return { ...decision, disabled: !guard.ok, reason: guard.reason };
  }

  if (submission.status === "submitted_for_review") {
    const shouldReturn = blockerCount(submission) > 0;
    const decision = {
      action: shouldReturn ? "return_with_issues" : "accept",
      label: shouldReturn ? "Вернуть" : "Принять",
    } as const;
    const guard = canPerformAction(submission, decision.action, role);
    return { ...decision, disabled: !guard.ok, reason: guard.reason };
  }

  if (submission.status === "ready_for_export") {
    return { action: "generate_export", label: "Готово к выгрузке" };
  }

  const decision = { action: "open_history", label: "Смотреть статус" } as const;
  const guard = canPerformAction(submission, decision.action, role);
  return { ...decision, disabled: !guard.ok, reason: guard.reason };
}

export function applySubmissionAction(
  submission: Submission,
  action: SubmissionAction,
  role: Role,
  actorId?: string,
): Submission {
  const result = applySubmissionActionResult(submission, action, role, actorId);
  return result.ok ? result.data : submission;
}

export function applySubmissionActionResult(
  submission: Submission,
  action: SubmissionAction,
  role: Role,
  actorId?: string,
): CommandResult<Submission> {
  const guard = canPerformAction(submission, action, role);
  if (!guard.ok) {
    return submissionActionFailure(action, guard.reason);
  }
  if (action === "open_history") return { ok: true, data: submission };

  if (action === "submit_corrections") {
    const corrected = clearOpenQuestionnaireIssueErrors(submission);

    return {
      ok: true,
      data: {
        ...corrected,
        status: "corrections_received",
        issues: corrected.issues,
        updatedAt: "сейчас",
        history: [
          {
            id: `и-${submission.id}-исправления`,
            text: "Агент отправил исправления",
            at: "сейчас",
            fromStatus: submission.status,
            source: "agent",
            toStatus: "corrections_received",
          },
          ...corrected.history,
        ],
      },
    };
  }

  if (action === "close_issues_accept") {
    const reviewedAtIso = new Date().toISOString();
    return {
      ok: true,
      data: {
        ...submission,
        status: "ready_for_export",
        exportState: "ready",
        files: markReviewFilesAccepted(submission.files, reviewedAtIso, actorId),
        issues: submission.issues.map((issue) =>
          isIssueTransitionAllowed(issue.status, "closed_by_admin")
            ? { ...issue, status: "closed_by_admin" }
            : issue,
        ),
        updatedAt: "сейчас",
        history: [
          {
            id: `и-${submission.id}-принято`,
            text: "Администратор закрыл исправления и принял подачу",
            at: "сейчас",
            fromStatus: submission.status,
            source: "admin",
            toStatus: "ready_for_export",
          },
          ...submission.history,
        ],
      },
    };
  }

  if (action === "accept") {
    const reviewedAtIso = new Date().toISOString();
    return {
      ok: true,
      data: {
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
            fromStatus: submission.status,
            source: "admin",
            toStatus: "ready_for_export",
          },
          ...submission.history,
        ],
      },
    };
  }

  if (action === "submit_for_review") {
    return {
      ok: true,
      data: {
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
            fromStatus: submission.status,
            source: "agent",
            toStatus: "submitted_for_review",
          },
          ...submission.history,
        ],
      },
    };
  }

  if (action === "mark_exported") {
    return {
      ok: true,
      data: {
        ...submission,
        status: "exported",
        exportState: "marked_exported",
        updatedAt: "сейчас",
        history: [
          {
            id: `и-${submission.id}-выгружено`,
            text: "Подача отмечена выгруженной",
            at: "сейчас",
            fromStatus: submission.status,
            source: "admin",
            toStatus: "exported",
          },
          ...submission.history,
        ],
      },
    };
  }

  const transition = transitionMatrix[action];
  return {
    ok: true,
    data: {
      ...submission,
      status: transition.to,
      updatedAt: "сейчас",
      history: [
        {
          id: `и-${submission.id}-${action}`,
          text: `Статус изменен: ${statusLabels[transition.to]}`,
          at: "сейчас",
          fromStatus: submission.status,
          source: role,
          toStatus: transition.to,
        },
        ...submission.history,
      ],
    },
  };
}

function submissionActionFailure(
  action: SubmissionAction,
  reason = "Действие заблокировано доменными правилами.",
): CommandResult<Submission> {
  return {
    ok: false,
    error: {
      code: domainErrorCodeForBlockedAction(action, reason),
      message: reason,
    },
  };
}

function domainErrorCodeForBlockedAction(
  action: SubmissionAction,
  reason: string,
): DomainErrorCode {
  if (reason === "Недостаточно прав") return "PERMISSION_DENIED";
  if (reason === "Действие недоступно в текущем статусе") {
    return "INVALID_TRANSITION";
  }
  if (action === "generate_export" || action === "mark_exported") {
    return "EXPORT_NOT_READY";
  }
  return "VALIDATION_ERROR";
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

export function isSubmissionIssueResolved(submission: Submission, issue: Issue) {
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

  if (isPassportExtractionReviewIssue(issue)) {
    return !passportGateIssues(submission).some(
      (passportIssue) => passportIssue.applicantId === issue.target.applicantId,
    );
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

function isPassportExtractionReviewIssue(issue: Issue) {
  return (
    issue.target.section === "Паспорт" &&
    issue.target.field === "Распознанные данные паспорта"
  );
}

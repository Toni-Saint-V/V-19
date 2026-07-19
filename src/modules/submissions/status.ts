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
  SubmissionHistorySource,
  SubmissionStatus,
} from "./types";
import {
  clearOpenQuestionnaireIssueErrors,
  questionnaireFieldMatchesTarget,
} from "./questionnaire";
import { applicantFileStatusForFiles } from "./fileAsset";
import {
  passportGateIssues,
  passportGateReason,
  requiresPassportExtractionReviewBeforeAction,
  requiresPassportGateBeforeAction,
} from "./passportExtractionGuards";
import {
  canonicalRequiredMediaReadiness,
  canonicalRequiredMediaTypesForApplicant,
  isCanonicalSubmissionStatus,
  isIssueTransitionAllowed,
  isKnownContractRole,
  isStatusTransitionAllowed,
} from "./domainContract";
import {
  ADMIN_PASSPORT_REVIEW_FIELD_IDS,
  hasAdminPassportReviewValue,
  requiredPassportReviewMediaSlots,
} from "./passportReviewContract";
import {
  blsApplicantQuestionnaireStatus,
  blsQuestionnaireReadiness,
  isBlsQuestionnaireFileReady,
} from "./questionnaireBlsRules";

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

export function canAgentEditSubmission(submission: Submission) {
  return agentEditableStatuses.includes(submission.status);
}

export function canAgentEditSubmissionContent(submission: Submission) {
  return canAgentEditSubmission(submission);
}

export type AgentQuestionnaireStatusPresentation = {
  canEdit: boolean;
  completionLabel: "Отправить исправления" | "Отправить на проверку";
  drawerActionLabel: "Исправить анкету" | "Открыть анкету" | "Смотреть анкету";
  drawerDescription: string;
  readOnly?: {
    label: string;
    mobileLabel: string;
    message: string;
  };
};

/**
 * One role-aware presentation contract for the agent questionnaire entrypoint.
 * It keeps the read-only admin stages from looking like broken agent work.
 */
export function agentQuestionnaireStatusPresentation(
  status: SubmissionStatus,
): AgentQuestionnaireStatusPresentation {
  if (status === "returned") {
    return {
      canEdit: true,
      completionLabel: "Отправить исправления",
      drawerActionLabel: "Исправить анкету",
      drawerDescription:
        "Исправьте замечания в анкете и отправьте пакет на повторную проверку.",
    };
  }

  if (status === "requires_action") {
    return {
      canEdit: false,
      completionLabel: "Отправить исправления",
      drawerActionLabel: "Смотреть анкету",
      drawerDescription:
        "Статус подачи обновляется. Откройте актуальную подачу после синхронизации.",
      readOnly: {
        label: "Статус обновляется",
        mobileLabel: "Обновляется",
        message:
          "Подача временно доступна только для просмотра, пока статус не синхронизирован.",
      },
    };
  }

  if (status === "submitted_for_review") {
    return {
      canEdit: false,
      completionLabel: "Отправить на проверку",
      drawerActionLabel: "Смотреть анкету",
      drawerDescription:
        "Подача уже отправлена. Сейчас её проверяет администратор; редактирование недоступно.",
      readOnly: {
        label: "На проверке",
        mobileLabel: "На проверке",
        message:
          "Подача отправлена на проверку. Редактирование станет доступно, если администратор вернёт её с замечаниями.",
      },
    };
  }

  if (status === "corrections_received") {
    return {
      canEdit: false,
      completionLabel: "Отправить исправления",
      drawerActionLabel: "Смотреть анкету",
      drawerDescription:
        "Исправления отправлены. Сейчас подачу проверяет администратор; редактирование недоступно.",
      readOnly: {
        label: "Исправления на проверке",
        mobileLabel: "Исправления",
        message:
          "Исправления отправлены администратору. Пока идёт проверка, анкета доступна только для просмотра.",
      },
    };
  }

  if (status === "ready_for_export") {
    return {
      canEdit: false,
      completionLabel: "Отправить на проверку",
      drawerActionLabel: "Смотреть анкету",
      drawerDescription:
        "Подача принята к выгрузке и доступна только для просмотра.",
      readOnly: {
        label: "Готово к выгрузке",
        mobileLabel: "К выгрузке",
        message: "Подача принята администратором и ожидает выгрузки.",
      },
    };
  }

  if (status === "exported") {
    return {
      canEdit: false,
      completionLabel: "Отправить на проверку",
      drawerActionLabel: "Смотреть анкету",
      drawerDescription: "Подача выгружена и доступна только для просмотра.",
      readOnly: {
        label: "Выгружено",
        mobileLabel: "Выгружено",
        message: "Подача уже выгружена. История и данные остаются доступны для просмотра.",
      },
    };
  }

  return {
    canEdit: true,
    completionLabel: "Отправить на проверку",
    drawerActionLabel: "Открыть анкету",
    drawerDescription:
      "Проверьте готовность заявителей и продолжите заполнение в рабочей анкете.",
  };
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

export function hasBlockingIssues(submission: Submission) {
  return submission.issues.some(
    (issue) => issue.status === "open" || isFixedIssueStatus(issue.status),
  );
}

export function hasRequiredDocuments(submission: Submission) {
  return canonicalRequiredMediaReadiness(submission).ok;
}

export type ApplicantChecklistStatus =
  | "ready"
  | "missing_docs"
  | "in_progress";

export function applicantChecklistStatus(
  submission: Submission,
  applicantId: string,
): ApplicantChecklistStatus {
  const applicantIndex = submission.applicants.findIndex(
    (candidate) => candidate.id === applicantId,
  );
  const applicant = submission.applicants[applicantIndex];
  if (!applicant) return "in_progress";

  const requiredFileTypes = canonicalRequiredMediaTypesForApplicant(
    submission,
    applicant.id,
  );
  const requiredFiles = requiredFileTypes.map((type) =>
    submission.files.find(
      (file) => file.applicantId === applicant.id && file.type === type,
    ),
  );
  const questionnaireStatus = blsApplicantQuestionnaireStatus(applicant);
  const questionnaireReady = questionnaireStatus === "complete";
  const filesReady = requiredFiles.every(isBlsQuestionnaireFileReady);

  if (questionnaireReady && filesReady) return "ready";
  if (
    questionnaireStatus === "needs_fix" ||
    requiredFiles.some(
      (file) =>
        !file ||
        file.status === "missing" ||
        file.status === "needs_replacement" ||
        file.uploadStatus === "failed" ||
        file.reviewStatus === "replace_required" ||
        file.reviewStatus === "poor_quality",
    )
  ) {
    return "missing_docs";
  }
  return "in_progress";
}

function requiredSubmissionFiles(submission: Submission) {
  return submission.applicants.flatMap((applicant) =>
    canonicalRequiredMediaTypesForApplicant(submission, applicant.id).map((type) =>
      submission.files.find(
        (file) => file.applicantId === applicant.id && file.type === type,
      ),
    ),
  );
}

export function calculateSubmissionProgress(
  submission: Submission,
): Submission["completeness"] {
  const questionnaire = blsQuestionnaireReadiness(submission).percent;
  const requiredFiles = requiredPassportReviewMediaSlots(submission).map((slot) =>
    submission.files.find(
      (file) => file.applicantId === slot.applicantId && file.type === slot.type,
    ),
  );
  const readyFiles = requiredFiles.filter(
    (file): file is Submission["files"][number] =>
      Boolean(file && isFileReadyForProgress(file)),
  );
  const files = percent(readyFiles.length, requiredFiles.length);
  let total = Math.round((questionnaire + files) / 2);

  if (submission.status !== "exported") {
    if (submission.issues.some((issue) => issue.status === "open")) {
      total = Math.min(total, 90);
    } else if (submission.issues.some((issue) => isFixedIssueStatus(issue.status))) {
      total = Math.min(total, 95);
    }
  }

  return { files, questionnaire, total };
}

function isFileReadyForProgress(file: Submission["files"][number]) {
  if (file.status === "missing" || file.status === "needs_replacement") return false;
  if (file.uploadStatus && file.uploadStatus !== "uploaded") return false;
  if (
    file.reviewStatus === "replace_required" ||
    file.reviewStatus === "poor_quality"
  ) {
    return false;
  }
  return true;
}

function percent(ready: number, total: number) {
  if (total === 0) return 0;
  return Math.round((ready / total) * 100);
}

export function withRecalculatedSubmissionProgress(
  submission: Submission,
): Submission {
  return {
    ...submission,
    applicants: submission.applicants.map((applicant) => ({
      ...applicant,
      fileStatus: applicantFileStatusForFiles(
        submission.files.filter((file) => file.applicantId === applicant.id),
      ),
    })),
    completeness: calculateSubmissionProgress(submission),
  };
}

export function canAgentSubmitForReview(submission: Submission) {
  const questionnaire = blsQuestionnaireReadiness(submission);

  return (
    submission.status === "in_progress" &&
    questionnaire.ready &&
    hasRequiredDocuments(submission) &&
    !hasBlockingIssues(submission) &&
    hasUsableTripDateRange(submission) &&
    !requiresPassportGateBeforeAction(submission, "submit_for_review") &&
    !requiresPassportExtractionReviewBeforeAction(submission, "submit_for_review")
  );
}

export function agentQuestionnaireCompletionDecision(
  submission: Submission,
): {
  action: "submit_corrections" | "submit_for_review";
  ok: boolean;
  reason?: string;
} {
  const action =
    submission.status === "returned"
      ? "submit_corrections"
      : "submit_for_review";
  const candidate =
    submission.status === "draft"
      ? { ...submission, status: "in_progress" as const }
      : submission;
  const decision = canPerformAction(candidate, action, "agent");

  return { action, ...decision };
}

export function canAdminReturnSubmission(submission: Submission) {
  return adminIssueStatuses.includes(submission.status) && openIssueCount(submission) > 0;
}

export function canAdminApproveForExport(submission: Submission) {
  return (
    (submission.status === "submitted_for_review" ||
      submission.status === "corrections_received") &&
    !hasBlockingIssues(submission) &&
    !hasMissingRequiredWork(submission) &&
    adminQuestionnaireReviewReadiness(submission).ok &&
    canonicalRequiredMediaReadiness(submission, { requireAccepted: true }).ok &&
    hasUsableTripDateRange(submission)
  );
}

export function canAdminMarkExported(submission: Submission) {
  return (
    submission.status === "ready_for_export" &&
    submission.exportState === "file_downloaded" &&
    Boolean(submission.exportPackage)
  );
}

export function canReplaceDocument(
  submission: Submission,
  file: Submission["files"][number],
) {
  return (
    canAgentEditSubmission(submission) &&
    (file.status === "missing" || file.status === "needs_replacement")
  );
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
  const progress = calculateSubmissionProgress(submission);
  const questionnaire = blsQuestionnaireReadiness(submission);

  return (
    !questionnaire.ready ||
    progress.files < 100 ||
    !media.ok
  );
}

export function adminQuestionnaireReviewReadiness(submission: Submission): {
  ok: boolean;
  reason?: string;
} {
  const fields = submission.applicants.flatMap((applicant) => {
    const fieldsById = new Map(
      applicant.sections
        .flatMap((section) => section.fields)
        .map((field) => [field.id, field] as const),
    );

    return ADMIN_PASSPORT_REVIEW_FIELD_IDS.map((fieldId) =>
      fieldsById.get(fieldId),
    );
  });

  if (fields.some((field) => !field || !hasAdminPassportReviewValue(field.value))) {
    return {
      ok: false,
      reason: "Заполните паспортные поля перед принятием",
    };
  }

  const passportFields = fields.filter(
    (field): field is NonNullable<typeof field> => Boolean(field),
  );

  if (passportFields.some((field) => Boolean(field.error))) {
    return {
      ok: false,
      reason: "В паспортных данных есть поля, требующие исправления",
    };
  }

  const hasUnapprovedValue = passportFields.some(
    (field) =>
      (!field.adminReviewApprovedAtIso || !field.adminReviewApprovedBy),
  );

  return hasUnapprovedValue
    ? {
        ok: false,
        reason: "Подтвердите паспортные поля перед принятием",
      }
    : { ok: true };
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
  return validateSubmissionActionPolicy(submission, action, role);
}

function validateSubmissionActionPolicy(
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

  if (action === "submit_for_review" && hasBlockingIssues(submission)) {
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

  if (action === "return_with_issues" && !canAdminReturnSubmission(submission)) {
    return { ok: false, reason: "Нужно добавить точное замечание" };
  }

  if (action === "return_again" && !canAdminReturnSubmission(submission)) {
    return { ok: false, reason: "Нужно добавить точное замечание" };
  }

  if (action === "accept" && hasBlockingIssues(submission)) {
    return { ok: false, reason: "Есть незакрытые замечания" };
  }

  if (action === "close_issues_accept" && openIssueCount(submission) > 0) {
    return { ok: false, reason: "Есть незакрытые замечания" };
  }

  if (
    (action === "accept" || action === "close_issues_accept") &&
    hasMissingRequiredWork(submission)
  ) {
    return { ok: false, reason: "Не все обязательные анкеты и файлы готовы" };
  }

  if (action === "accept" || action === "close_issues_accept") {
    const questionnaireReview = adminQuestionnaireReviewReadiness(submission);
    if (!questionnaireReview.ok) return questionnaireReview;
  }

  if (
    (action === "accept" || action === "close_issues_accept") &&
    !hasUsableTripDateRange(submission)
  ) {
    return { ok: false, reason: missingTripDateRangeReason };
  }

  if (
    (action === "accept" || action === "close_issues_accept") &&
    !canonicalRequiredMediaReadiness(submission, { requireAccepted: true }).ok
  ) {
    return { ok: false, reason: "Подтвердите обязательные файлы перед принятием" };
  }

  if (
    action === "mark_exported" &&
    !canAdminMarkExported(submission)
  ) {
    return { ok: false, reason: "Сначала сформируйте и скачайте пакет выгрузки" };
  }

  return { ok: true };
}

const directStatusTransitionActions = Object.entries(transitionMatrix).filter(
  ([action]) => action !== "generate_export" && action !== "open_history",
) as Array<
  [
    SubmissionAction,
    { from: SubmissionStatus[]; to: SubmissionStatus; role: Role },
  ]
>;

function submissionActionForStatusTransition(
  fromStatus: SubmissionStatus,
  toStatus: SubmissionStatus,
  role: Role,
): SubmissionAction | undefined {
  return directStatusTransitionActions.find(
    ([, transition]) =>
      transition.role === role &&
      transition.to === toStatus &&
      transition.from.includes(fromStatus),
  )?.[0];
}

export type SubmissionStatusTransitionInput = {
  actorId?: string;
  actorRole: Role;
  nextStatus: SubmissionStatus;
  note?: string;
  nowIso?: string;
  source: SubmissionHistorySource;
  submissionId: string;
};

export function transitionSubmissionById(
  submissions: Submission[],
  input: SubmissionStatusTransitionInput,
): CommandResult<Submission[]> {
  let matchedSubmission = false;
  const nextSubmissions: Submission[] = [];

  for (const submission of submissions) {
    if (submission.id !== input.submissionId) {
      nextSubmissions.push(submission);
      continue;
    }

    matchedSubmission = true;
    const result = transitionSubmissionStatus(submission, input);
    if (!result.ok) return result;
    nextSubmissions.push(result.data);
  }

  if (!matchedSubmission) {
    return {
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "Подача не найдена" },
    };
  }

  return { ok: true, data: nextSubmissions };
}

export function transitionSubmissionStatus(
  submission: Submission,
  input: Omit<SubmissionStatusTransitionInput, "submissionId">,
): CommandResult<Submission> {
  if (!isCanonicalSubmissionStatus(submission.status)) {
    return {
      ok: false,
      error: {
        code: "INVALID_TRANSITION",
        message: "Submission status is not canonical.",
      },
    };
  }
  if (!isCanonicalSubmissionStatus(input.nextStatus)) {
    return {
      ok: false,
      error: {
        code: "INVALID_TRANSITION",
        message: "Target status is not canonical.",
      },
    };
  }
  if (submission.status === "exported") {
    return {
      ok: false,
      error: { code: "EXPORTED_TERMINAL", message: "Exported is terminal for V-19." },
    };
  }
  const statusTransitionAllowed = isStatusTransitionAllowed(
    submission.status,
    input.nextStatus,
    { mutating: true },
  );
  if (!statusTransitionAllowed) {
    return {
      ok: false,
      error: {
        code: "INVALID_TRANSITION",
        message: "Действие недоступно в текущем статусе",
      },
    };
  }
  if (!isTransitionRoleAllowed(submission.status, input.nextStatus, input.actorRole)) {
    return {
      ok: false,
      error: {
        code: "PERMISSION_DENIED",
        message: "Действие недоступно в текущем статусе",
      },
    };
  }
  const action = submissionActionForStatusTransition(
    submission.status,
    input.nextStatus,
    input.actorRole,
  );
  if (!action) {
    return {
      ok: false,
      error: {
        code: "INVALID_TRANSITION",
        message: "Действие недоступно в текущем статусе",
      },
    };
  }
  const actionGuard = validateSubmissionActionPolicy(
    submission,
    action,
    input.actorRole,
  );
  if (!actionGuard.ok) {
    return {
      ok: false,
      error: {
        code: domainErrorCodeForBlockedAction(
          action,
          actionGuard.reason ?? "Действие заблокировано доменными правилами.",
        ),
        message: actionGuard.reason ?? "Действие заблокировано доменными правилами.",
      },
    };
  }
  const preparedSnapshotGuard = validatePreparedTransitionSnapshot(
    submission,
    input.nextStatus,
  );
  if (!preparedSnapshotGuard.ok) {
    return {
      ok: false,
      error: {
        code: domainErrorCodeForBlockedAction(action, preparedSnapshotGuard.reason),
        message: preparedSnapshotGuard.reason,
      },
    };
  }

  const now = input.nowIso ?? "сейчас";
  const text = `Статус изменен: ${statusLabels[input.nextStatus]}`;

  return {
    ok: true,
    data: withRecalculatedSubmissionProgress({
      ...submission,
      status: input.nextStatus,
      updatedAt: now,
      history: [
        {
          id: `и-${submission.id}-${submission.status}-${input.nextStatus}-${submission.history.length + 1}`,
          actorId: input.actorId,
          at: now,
          createdAt: now,
          fromStatus: submission.status,
          note: input.note,
          source: input.source,
          text: input.note ? `${text}: ${input.note}` : text,
          toStatus: input.nextStatus,
        },
        ...submission.history,
      ],
    }),
  };
}

function isTransitionRoleAllowed(
  fromStatus: SubmissionStatus,
  toStatus: SubmissionStatus,
  role: Role,
) {
  return Boolean(submissionActionForStatusTransition(fromStatus, toStatus, role));
}

function validatePreparedTransitionSnapshot(
  submission: Submission,
  nextStatus: SubmissionStatus,
): { ok: true } | { ok: false; reason: string } {
  if (nextStatus !== "ready_for_export") return { ok: true };
  if (hasBlockingIssues(submission)) {
    return { ok: false, reason: "Есть незакрытые замечания" };
  }
  if (
    !canonicalRequiredMediaReadiness(submission, {
      requireAccepted: true,
    }).ok
  ) {
    return { ok: false, reason: "Есть незаполненные поля или недостающие файлы" };
  }
  if (submission.exportState !== "ready") {
    return { ok: false, reason: "Пакет выгрузки ещё не готов" };
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

  const adminReviewActions = getAdminReviewActions(submission, role);
  if (adminReviewActions) {
    return openIssueCount(submission) > 0
      ? adminReviewActions.returnForCorrection
      : adminReviewActions.acceptForExport;
  }

  if (submission.status === "ready_for_export") {
    return { action: "generate_export", label: "Готово к выгрузке" };
  }

  const decision = { action: "open_history", label: "Смотреть статус" } as const;
  const guard = canPerformAction(submission, decision.action, role);
  return { ...decision, disabled: !guard.ok, reason: guard.reason };
}

export function getAdminReviewActions(
  submission: Submission,
  role: Role = "admin",
): {
  acceptForExport: ActionDecision;
  returnForCorrection: ActionDecision;
} | null {
  if (
    submission.status !== "submitted_for_review" &&
    submission.status !== "corrections_received"
  ) {
    return null;
  }

  const acceptAction =
    submission.status === "corrections_received"
      ? "close_issues_accept"
      : "accept";
  const returnAction =
    submission.status === "corrections_received"
      ? "return_again"
      : "return_with_issues";
  const acceptGuard = canPerformAction(submission, acceptAction, role);
  const returnGuard = canPerformAction(submission, returnAction, role);

  return {
    acceptForExport: {
      action: acceptAction,
      label: "Принять на выгрузку",
      disabled: !acceptGuard.ok,
      reason: acceptGuard.reason,
    },
    returnForCorrection: {
      action: returnAction,
      label: "Отправить на исправление",
      disabled: !returnGuard.ok,
      reason: returnGuard.reason,
    },
  };
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

    return transitionSubmissionStatus(corrected, {
      actorId,
      actorRole: role,
      nextStatus: "corrections_received",
      note: "Агент отправил исправления",
      nowIso: "сейчас",
      source: role,
    });
  }

  if (action === "close_issues_accept") {
    const prepared: Submission = {
      ...submission,
      exportState: "ready",
      issues: submission.issues.map((issue) =>
        isIssueTransitionAllowed(issue.status, "closed_by_admin")
          ? { ...issue, status: "closed_by_admin" }
          : issue,
      ),
    };

    return transitionSubmissionStatus(prepared, {
      actorId,
      actorRole: role,
      nextStatus: "ready_for_export",
      note: "Администратор закрыл исправления и принял подачу",
      nowIso: "сейчас",
      source: role,
    });
  }

  if (action === "accept") {
    const prepared: Submission = {
      ...submission,
      exportState: "ready",
    };

    return transitionSubmissionStatus(prepared, {
      actorId,
      actorRole: role,
      nextStatus: "ready_for_export",
      note: "Администратор принял подачу",
      nowIso: "сейчас",
      source: role,
    });
  }

  if (action === "submit_for_review") {
    const prepared: Submission = {
      ...submission,
      files: submission.files.map((file) =>
        file.status === "uploaded" ? { ...file, status: "pending_review" } : file,
      ),
    };

    return transitionSubmissionStatus(prepared, {
      actorId,
      actorRole: role,
      nextStatus: "submitted_for_review",
      note: "Агент отправил подачу на проверку",
      nowIso: "сейчас",
      source: role,
    });
  }

  if (action === "mark_exported") {
    const transitioned = transitionSubmissionStatus(submission, {
      actorId,
      actorRole: role,
      nextStatus: "exported",
      note: "Подача отмечена выгруженной",
      nowIso: "сейчас",
      source: role,
    });
    return transitioned.ok
      ? { ok: true, data: { ...transitioned.data, exportState: "marked_exported" } }
      : transitioned;
  }

  const transition = transitionMatrix[action];
  return transitionSubmissionStatus(submission, {
    actorId,
    actorRole: role,
    nextStatus: transition.to,
    nowIso: "сейчас",
    source: role,
  });
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
  const field = fields.find((item) =>
    questionnaireFieldMatchesTarget(item, issue.target.field),
  );
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

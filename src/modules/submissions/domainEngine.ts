import {
  buildExportPackageIdentity,
  exportPackageIdentityMatches,
  exportSummary,
  type ExportSummary,
} from "./exportRules";
import { createDraftSubmission, type CreateDraftInput } from "./submissionActions";
import {
  adminQuestionnaireReviewReadiness,
  canPerformAction,
  blockerCount,
  calculateSubmissionProgress,
  defaultDrawerTab,
  hasBlockingIssues,
  hasMissingRequiredWork,
  hasUsableTripDateRange,
  isFixedIssueStatus,
  markSubmissionIssueFixedResult,
  transitionSubmissionStatus,
} from "./status";
import {
  canonicalRequiredMediaReadiness,
  isCanonicalSubmissionStatus,
  isExportedTerminal,
  isIssueTransitionAllowed,
} from "./domainContract";
import { blsQuestionnaireReadiness } from "./questionnaireBlsRules";
import {
  resolveQuestionnaireIssueInputIdentity,
  resolveQuestionnaireTargetField,
} from "./questionnaire";
import { requiredPassportReviewMediaTypesForApplicant } from "./passportReviewContract";
import type {
  ActionDecision,
  CommandResult,
  DomainErrorCode,
  ExportPackageIdentity,
  Issue,
  IssueInput,
  Role,
  Submission,
  SubmissionFileStatus,
} from "./types";
import { V19_FIXED_COUNTRY } from "./types";

export type SubmissionEditablePatch = Partial<
  Pick<Submission, "applicants" | "city" | "files" | "tripDateFrom" | "tripDateTo">
>;

export type OperationalBucket = "agent_work" | "admin_review" | "export" | "done";

export type ExportGuardResult = {
  packageIdentity: ExportPackageIdentity;
  summary: ExportSummary;
};

const terminalStatuses = new Set<Submission["status"]>(["exported"]);

export function createDraft(input: CreateDraftInput): CommandResult<Submission> {
  if (input.type !== "single" && input.type !== "family") {
    return failure(
      "INVALID_SUBMISSION_KIND",
      "Выберите индивидуальную или семейную подачу.",
    );
  }

  return success(withDerivedState(createDraftSubmission(input)));
}

export function updateSubmission(
  submission: Submission,
  role: Role,
  patch: SubmissionEditablePatch,
): CommandResult<Submission> {
  const terminal = ensureNotTerminal(submission);
  if (terminal) return terminal;
  if (role !== "agent") {
    return failure(
      "PERMISSION_DENIED",
      "Администратор не может изменять данные, которые заполняет агент.",
    );
  }
  if (!["draft", "in_progress", "returned"].includes(submission.status)) {
    return failure(
      "INVALID_TRANSITION",
      "В текущем статусе данные подачи доступны только для просмотра.",
    );
  }

  return success(
    withDerivedState({
      ...submission,
      ...patch,
      country: V19_FIXED_COUNTRY.label,
      countryCode: V19_FIXED_COUNTRY.code,
      updatedAt: "сейчас",
    }),
  );
}

export function submitForReview(
  submission: Submission,
  role: Role,
): CommandResult<Submission> {
  const terminal = ensureNotTerminal(submission);
  if (terminal) return terminal;
  if (role !== "agent") {
    return failure("PERMISSION_DENIED", "Отправить подачу может только агент.");
  }
  if (submission.status !== "in_progress") {
    return failure(
      "INVALID_TRANSITION",
      "Отправить на проверку можно только подачу в работе.",
    );
  }

  const completeness = getCompleteness(submission);
  if (
    !blsQuestionnaireReadiness(submission).ready ||
    completeness.total < 100 ||
    !canonicalRequiredMediaReadiness(submission).ok
  ) {
    return failure(
      "VALIDATION_ERROR",
      "Заполните обязательные поля анкеты и загрузите все нужные файлы.",
    );
  }
  if (!hasUsableTripDateRange(submission)) {
    return failure("VALIDATION_ERROR", "Укажите даты начала и окончания поездки.");
  }
  return transitionSubmissionStatus(
    withDerivedState({
      ...submission,
      files: submission.files.map((file) =>
        file.status === "uploaded" ? { ...file, status: "pending_review" } : file,
      ),
    }),
    {
      actorRole: role,
      nextStatus: "submitted_for_review",
      note: "Агент отправил подачу на проверку",
      nowIso: "сейчас",
      source: "agent",
    },
  );
}

export function returnWithIssues(
  submission: Submission,
  role: Role,
  issues: IssueInput[],
): CommandResult<Submission> {
  const terminal = ensureNotTerminal(submission);
  if (terminal) return terminal;
  if (role !== "admin") {
    return failure(
      "PERMISSION_DENIED",
      "Вернуть подачу с замечаниями может только администратор.",
    );
  }
  if (!["submitted_for_review", "corrections_received"].includes(submission.status)) {
    return failure("INVALID_TRANSITION", "Подача сейчас не находится на проверке.");
  }
  if (issues.length === 0) {
    return failure(
      "VALIDATION_ERROR",
      "Добавьте хотя бы одно точное замечание перед возвратом.",
    );
  }
  const invalidIssue = issues.find((issue) => !isValidIssueInput(submission, issue));
  if (invalidIssue) {
    return failure(
      "VALIDATION_ERROR",
      "Укажите корректное поле или файл, причину и понятный комментарий.",
    );
  }

  const nextIssues = issues.map((issue, index) =>
    createIssueFromInput(submission, issue, index),
  );

  return transitionSubmissionStatus(
    withDerivedState({
      ...submission,
      issues: [...nextIssues, ...submission.issues],
    }),
    {
      actorRole: role,
      nextStatus: "returned",
      note: "Администратор вернул подачу с замечаниями",
      nowIso: "сейчас",
      source: "admin",
    },
  );
}

export function markIssueFixed(
  submission: Submission,
  role: Role,
  issueId: string,
): CommandResult<Submission> {
  return markSubmissionIssueFixedResult(submission, issueId, role);
}

export function resubmitCorrections(
  submission: Submission,
  role: Role,
): CommandResult<Submission> {
  const terminal = ensureNotTerminal(submission);
  if (terminal) return terminal;
  if (role !== "agent") {
    return failure(
      "PERMISSION_DENIED",
      "Повторно отправить исправления может только агент.",
    );
  }
  if (submission.status !== "returned") {
    return failure(
      "INVALID_TRANSITION",
      "Подача уже перешла в другой статус. Обновите данные и повторите.",
    );
  }
  if (submission.issues.some((issue) => issue.status === "open")) {
    return failure(
      "VALIDATION_ERROR",
      "Сохраните все открытые исправления — после этого подача отправится автоматически.",
    );
  }

  return transitionSubmissionStatus(withDerivedState(submission), {
    actorRole: role,
    nextStatus: "corrections_received",
    note: "Агент отправил исправления",
    nowIso: "сейчас",
    source: "agent",
  });
}

export function closeIssue(
  submission: Submission,
  role: Role,
  issueId: string,
): CommandResult<Submission> {
  const terminal = ensureNotTerminal(submission);
  if (terminal) return terminal;
  if (role !== "admin") {
    return failure(
      "PERMISSION_DENIED",
      "Закрыть замечание может только администратор.",
    );
  }
  if (submission.status !== "corrections_received") {
    return failure(
      "INVALID_TRANSITION",
      "Закрыть замечание можно только во время проверки исправлений.",
    );
  }
  const issue = submission.issues.find((item) => item.id === issueId);
  if (!issue) return failure("ISSUE_NOT_FOUND", "Замечание не найдено.");
  if (!isFixedIssueStatus(issue.status)) {
    return failure(
      "ISSUE_NOT_FIXABLE",
      "Сначала агент должен сохранить и отправить это исправление.",
    );
  }

  return success(
    withDerivedState({
      ...submission,
      issues: submission.issues.map((item) =>
        item.id === issueId && isIssueTransitionAllowed(item.status, "closed_by_admin")
          ? { ...item, status: "closed_by_admin" }
          : item,
      ),
      updatedAt: "сейчас",
      history: [
        {
          id: `и-${submission.id}-${issueId}-закрыто`,
          text: "Администратор закрыл замечание",
          at: "сейчас",
          detail: issue.reason,
          source: "admin",
        },
        ...submission.history,
      ],
    }),
  );
}

export function acceptSubmission(
  submission: Submission,
  role: Role,
): CommandResult<Submission> {
  const terminal = ensureNotTerminal(submission);
  if (terminal) return terminal;
  if (role !== "admin") {
    return failure("PERMISSION_DENIED", "Принять подачу может только администратор.");
  }
  if (!["submitted_for_review", "corrections_received"].includes(submission.status)) {
    return failure("INVALID_TRANSITION", "Подача сейчас недоступна для принятия.");
  }
  if (hasBlockingIssues(submission)) {
    return failure(
      "ACCEPTANCE_BLOCKED",
      "Сначала закройте все замечания, затем примите подачу.",
    );
  }
  if (hasMissingRequiredWork(submission)) {
    return failure(
      "VALIDATION_ERROR",
      "Заполните обязательные поля анкеты и подготовьте все файлы.",
    );
  }
  const questionnaireReview = adminQuestionnaireReviewReadiness(submission);
  if (!questionnaireReview.ok) {
    return failure(
      "VALIDATION_ERROR",
      questionnaireReview.reason ?? "Завершите проверку анкеты.",
    );
  }
  const mediaReview = canonicalRequiredMediaReadiness(submission, {
    requireAccepted: true,
    requireReviewMetadata: true,
    requireStorageIdentity: true,
  });
  if (!mediaReview.ok) {
    return failure(
      "VALIDATION_ERROR",
      mediaReview.reason ?? "Примите обязательные файлы перед принятием подачи.",
    );
  }
  if (!hasUsableTripDateRange(submission)) {
    return failure("VALIDATION_ERROR", "Укажите даты начала и окончания поездки.");
  }

  return transitionSubmissionStatus(
    withDerivedState({
      ...submission,
      exportState: "ready",
    }),
    {
      actorRole: role,
      nextStatus: "ready_for_export",
      note: "Администратор принял подачу",
      nowIso: "сейчас",
      source: "admin",
    },
  );
}

export function generateExport(
  submissions: Submission[],
  role: Role,
): CommandResult<ExportGuardResult> {
  if (role !== "admin") {
    return failure(
      "PERMISSION_DENIED",
      "Сформировать выгрузку может только администратор.",
    );
  }
  const summary = exportSummary(submissions, "xlsx");
  const packageIdentity = buildExportPackageIdentity(submissions, "xlsx");
  if (!summary.canGenerate || !packageIdentity) {
    return failure("EXPORT_NOT_READY", "Выбранные подачи ещё не готовы к выгрузке.");
  }

  return success({ packageIdentity, summary });
}

export function markExported(
  submission: Submission,
  role: Role,
  packageIdentity?: ExportPackageIdentity,
): CommandResult<Submission> {
  if (role !== "admin") {
    return failure(
      "PERMISSION_DENIED",
      "Отметить подачу выгруженной может только администратор.",
    );
  }
  if (submission.status === "exported") {
    return failure(
      "EXPORTED_TERMINAL",
      "Подача уже выгружена, дальнейшие изменения недоступны.",
    );
  }
  if (
    submission.status !== "ready_for_export" ||
    submission.exportState !== "file_downloaded" ||
    !submission.exportPackage ||
    (packageIdentity &&
      !exportPackageIdentityMatches(submission.exportPackage, packageIdentity))
  ) {
    return failure(
      "EXPORT_NOT_READY",
      "Сначала сформируйте и скачайте пакет выгрузки.",
    );
  }

  const transitioned = transitionSubmissionStatus(withDerivedState(submission), {
    actorRole: role,
    nextStatus: "exported",
    note: "Подача отмечена выгруженной",
    nowIso: "сейчас",
    source: "admin",
  });
  return transitioned.ok
    ? {
        ok: true,
        data: withDerivedState({
          ...transitioned.data,
          exportState: "marked_exported",
        }),
      }
    : transitioned;
}

export function getCompleteness(submission: Submission) {
  return calculateSubmissionProgress(submission);
}

export function getFileState(submission: Submission): SubmissionFileStatus {
  if (submission.files.some((file) => file.status === "needs_replacement")) {
    return "needs_replacement";
  }
  if (
    submission.files.length === 0 ||
    submission.files.some((file) => file.status === "missing")
  ) {
    return "missing";
  }
  if (submission.files.some((file) => file.status === "pending_review")) {
    return "pending_review";
  }
  if (submission.files.every((file) => file.status === "accepted")) {
    return "accepted";
  }
  return "uploaded";
}

export function getOpenIssues(submission: Submission) {
  return submission.issues.filter((issue) => issue.status === "open");
}

export function getRequiresAction(submission: Submission) {
  if (submission.status === "returned") return true;
  if (getOpenIssues(submission).length > 0) return true;
  if (
    getFileState(submission) === "missing" ||
    getFileState(submission) === "needs_replacement"
  ) {
    return true;
  }
  return getCompleteness(submission).total < 100 && submission.status !== "exported";
}

export function getOperationalBucket(submission: Submission): OperationalBucket {
  if (submission.status === "exported") return "done";
  if (submission.status === "ready_for_export") return "export";
  if (["submitted_for_review", "corrections_received"].includes(submission.status)) {
    return "admin_review";
  }
  return "agent_work";
}

export function getNextAction(
  submission: Submission,
  role: Role,
): ActionDecision | null {
  if (role === "agent") {
    if (submission.status === "draft") {
      return guardedAction(submission, role, "save_progress", "Сохранить черновик");
    }
    if (submission.status === "in_progress") {
      return guardedAction(submission, role, "submit_for_review", "Отправить");
    }
    if (submission.status === "returned") {
      return guardedAction(
        submission,
        role,
        "submit_corrections",
        "Отправить исправления",
      );
    }
    return null;
  }

  if (submission.status === "submitted_for_review") {
    const blocked = acceptanceBlockingIssues(submission).length > 0;
    const action = blocked ? "return_with_issues" : "accept";
    return guardedAction(
      submission,
      role,
      action,
      blocked ? "Отправить на исправление" : "Принять на выгрузку",
    );
  }
  if (submission.status === "corrections_received") {
    const blocked = blockerCount(submission) > 0;
    return guardedAction(
      submission,
      role,
      blocked ? "return_again" : "close_issues_accept",
      blocked ? "Отправить на исправление" : "Принять на выгрузку",
    );
  }
  if (submission.status === "ready_for_export") {
    return { action: "generate_export", label: "Сформировать Эксель" };
  }
  return null;
}

function guardedAction(
  submission: Submission,
  role: Role,
  action: ActionDecision["action"],
  label: string,
): ActionDecision {
  const guard = canPerformAction(submission, action, role);
  return {
    action,
    disabled: guard.ok ? undefined : true,
    label,
    reason: guard.reason,
  };
}

export function getDefaultDrawerTab(submission: Submission) {
  return defaultDrawerTab(submission);
}

function withDerivedState(submission: Submission): Submission {
  return {
    ...submission,
    completeness: calculateSubmissionProgress(submission),
    country: V19_FIXED_COUNTRY.label,
    countryCode: V19_FIXED_COUNTRY.code,
  };
}

function ensureNotTerminal(submission: Submission): CommandResult<Submission> | null {
  if (!isCanonicalSubmissionStatus(submission.status)) {
    return failure(
      "INVALID_TRANSITION",
      "Статус подачи не распознан. Обновите данные и повторите.",
    );
  }
  if (
    terminalStatuses.has(submission.status) ||
    isExportedTerminal(submission.status)
  ) {
    return failure(
      "EXPORTED_TERMINAL",
      "Подача уже выгружена, дальнейшие изменения недоступны.",
    );
  }
  return null;
}

function acceptanceBlockingIssues(submission: Submission) {
  return submission.issues.filter(
    (issue) => issue.status === "open" || isFixedIssueStatus(issue.status),
  );
}

function createIssueFromInput(
  submission: Submission,
  input: IssueInput,
  index: number,
): Issue {
  const applicant = submission.applicants.find((item) => item.id === input.applicantId);
  if (!applicant) {
    throw new Error("Не удалось найти выбранный объект замечания.");
  }
  const targetIdentity = resolveQuestionnaireIssueInputIdentity(applicant, input);

  return {
    id: `зм-${submission.id}-domain-${submission.issues.length + index + 1}`,
    type: input.type,
    target: {
      applicantId: applicant.id,
      applicantName: applicant.fullName,
      field: input.field,
      fieldId: targetIdentity?.fieldId,
      fileType: input.fileType,
      section: input.section,
      sectionId: targetIdentity?.sectionId,
    },
    reason: input.reason.trim(),
    comment: input.comment.trim(),
    severity: input.severity,
    status: "open",
    createdBy: "admin",
    createdAt: "сейчас",
    snapshot: issueTargetSnapshot(submission, input),
  };
}

function isValidIssueInput(submission: Submission, input: IssueInput) {
  const applicant = submission.applicants.find((item) => item.id === input.applicantId);
  return Boolean(
    applicant &&
    input.reason.trim().length > 0 &&
    input.comment.trim().length > 0 &&
    isValidIssueTarget(submission, applicant, input),
  );
}

function issueTargetSnapshot(submission: Submission, input: IssueInput) {
  if (input.fileType) {
    return submission.files.find(
      (file) => file.applicantId === input.applicantId && file.type === input.fileType,
    )?.status;
  }

  const applicant = submission.applicants.find((item) => item.id === input.applicantId);
  if (!applicant) return undefined;
  return resolveQuestionnaireTargetField(applicant, input)?.field.value;
}

function isValidIssueTarget(
  submission: Submission,
  applicant: Submission["applicants"][number],
  input: IssueInput,
) {
  if (input.type === "file" || input.type === "media") {
    return Boolean(
      input.fileType &&
      requiredPassportReviewMediaTypesForApplicant(submission, applicant.id).some(
        (type) => type === input.fileType,
      ),
    );
  }

  if (input.fileType) return false;
  return Boolean(
    (input.type === "field" || input.type === "section") &&
    resolveQuestionnaireIssueInputIdentity(applicant, input),
  );
}

function success<T>(data: T): CommandResult<T> {
  return { ok: true, data };
}

function failure<T = Submission>(
  code: DomainErrorCode,
  message: string,
): CommandResult<T> {
  return { ok: false, error: { code, message } };
}

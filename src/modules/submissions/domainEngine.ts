import {
  buildExportPackageIdentity,
  exportPackageIdentityMatches,
  exportSummary,
  type ExportSummary,
} from "./exportRules";
import { createDraftSubmission, type CreateDraftInput } from "./submissionActions";
import { submissionBelongsToAgent } from "./ownership";
import {
  adminQuestionnaireReviewReadiness,
  applySubmissionActionResult,
  canPerformAction,
  blockerCount,
  calculateSubmissionProgress,
  defaultDrawerTab,
  hasBlockingIssues,
  hasMissingRequiredWork,
  hasUsableTripDateRange,
  isFixedIssueStatus,
  isSubmissionIssueResolved,
  transitionSubmissionStatus,
} from "./status";
import {
  canonicalRequiredMediaReadiness,
  isCanonicalSubmissionStatus,
  isExportedTerminal,
  isIssueTransitionAllowed,
} from "./domainContract";
import { questionnaireFieldMatchesTarget } from "./questionnaire";
import { requiredPassportReviewMediaTypesForApplicant } from "./passportReviewContract";
import type {
  ActionDecision,
  AgentOwnerId,
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
      "Submission type must be single or family.",
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
      "Admin cannot edit agent-owned submission data.",
    );
  }
  if (!["draft", "in_progress", "returned"].includes(submission.status)) {
    return failure(
      "INVALID_TRANSITION",
      "Submission data is not editable in this status.",
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
  actorId: AgentOwnerId,
): CommandResult<Submission> {
  if (role !== "agent") return failure("PERMISSION_DENIED", "Only agent can submit.");
  if (!submissionBelongsToAgent(submission, actorId)) {
    return failure("PERMISSION_DENIED", "Agent can submit only an owned submission.");
  }
  const terminal = ensureNotTerminal(submission);
  if (terminal) return terminal;

  const result = applySubmissionActionResult(
    submission,
    "submit_for_review",
    role,
    actorId,
  );
  if (result.ok) return result;

  if (
    submission.status === "in_progress" &&
    result.error.code === "VALIDATION_ERROR" &&
    result.error.message === "Есть незаполненные поля или недостающие файлы"
  ) {
    return failure("VALIDATION_ERROR", "Questionnaire and files must be complete.");
  }
  if (
    submission.status === "in_progress" &&
    result.error.code === "VALIDATION_ERROR" &&
    result.error.message === "Укажите даты поездки перед отправкой"
  ) {
    return failure("VALIDATION_ERROR", "Trip dates must be complete.");
  }
  if (
    result.error.code === "INVALID_TRANSITION" &&
    result.error.message === "Действие недоступно в текущем статусе"
  ) {
    return failure(
      "INVALID_TRANSITION",
      "Only in-progress or export-ready submissions can be submitted.",
    );
  }

  return result;
}

export function returnWithIssues(
  submission: Submission,
  role: Role,
  issues: IssueInput[],
): CommandResult<Submission> {
  const terminal = ensureNotTerminal(submission);
  if (terminal) return terminal;
  if (role !== "admin") {
    return failure("PERMISSION_DENIED", "Only admin can return with issues.");
  }
  if (!["submitted_for_review", "corrections_received"].includes(submission.status)) {
    return failure("INVALID_TRANSITION", "Submission is not in admin review.");
  }
  if (issues.length === 0) {
    return failure("VALIDATION_ERROR", "At least one issue is required.");
  }
  const invalidIssue = issues.find((issue) => !isValidIssueInput(submission, issue));
  if (invalidIssue) {
    return failure(
      "VALIDATION_ERROR",
      "Issue target, reason, and comment must be valid.",
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
  const terminal = ensureNotTerminal(submission);
  if (terminal) return terminal;
  if (role !== "agent") {
    return failure("PERMISSION_DENIED", "Only agent can mark issue fixed.");
  }
  if (submission.status !== "returned") {
    return failure(
      "INVALID_TRANSITION",
      "Issues can be marked fixed only after admin return.",
    );
  }
  const issue = submission.issues.find((item) => item.id === issueId);
  if (!issue) return failure("ISSUE_NOT_FOUND", "Issue not found.");
  if (issue.status !== "open") {
    return failure("ISSUE_NOT_FIXABLE", "Only open issues can be marked fixed.");
  }
  if (!isSubmissionIssueResolved(submission, issue)) {
    return failure(
      "VALIDATION_ERROR",
      "Issue target must be corrected before it can be marked fixed.",
    );
  }

  return success(
    withDerivedState({
      ...submission,
      issues: submission.issues.map((item) =>
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
          detail: issue.reason,
          source: "agent",
        },
        ...submission.history,
      ],
    }),
  );
}

export function resubmitCorrections(
  submission: Submission,
  role: Role,
): CommandResult<Submission> {
  const terminal = ensureNotTerminal(submission);
  if (terminal) return terminal;
  if (role !== "agent") {
    return failure("PERMISSION_DENIED", "Only agent can resubmit corrections.");
  }
  if (submission.status !== "returned") {
    return failure("INVALID_TRANSITION", "Submission is not waiting for corrections.");
  }
  if (submission.issues.some((issue) => issue.status === "open")) {
    return failure(
      "VALIDATION_ERROR",
      "Open issues must be fixed before resubmission.",
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
    return failure("PERMISSION_DENIED", "Only admin can close issues.");
  }
  if (submission.status !== "corrections_received") {
    return failure(
      "INVALID_TRANSITION",
      "Issues can be closed only during corrections review.",
    );
  }
  const issue = submission.issues.find((item) => item.id === issueId);
  if (!issue) return failure("ISSUE_NOT_FOUND", "Issue not found.");
  if (!isFixedIssueStatus(issue.status)) {
    return failure("ISSUE_NOT_FIXABLE", "Only fixed issues can be closed.");
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
    return failure("PERMISSION_DENIED", "Only admin can accept submissions.");
  }
  if (!["submitted_for_review", "corrections_received"].includes(submission.status)) {
    return failure("INVALID_TRANSITION", "Submission is not in admin acceptance.");
  }
  if (hasBlockingIssues(submission)) {
    return failure(
      "ACCEPTANCE_BLOCKED",
      "Acceptance is blocked until all issues are closed by admin.",
    );
  }
  if (hasMissingRequiredWork(submission)) {
    return failure("VALIDATION_ERROR", "Questionnaire and files must be complete.");
  }
  const questionnaireReview = adminQuestionnaireReviewReadiness(submission);
  if (!questionnaireReview.ok) {
    return failure(
      "VALIDATION_ERROR",
      questionnaireReview.reason ?? "Questionnaire review must be complete.",
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
      mediaReview.reason ?? "Required media must be accepted before acceptance.",
    );
  }
  if (!hasUsableTripDateRange(submission)) {
    return failure("VALIDATION_ERROR", "Trip dates must be complete.");
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
    return failure("PERMISSION_DENIED", "Only admin can generate export.");
  }
  const summary = exportSummary(submissions, "xlsx");
  const packageIdentity = buildExportPackageIdentity(submissions, "xlsx");
  if (!summary.canGenerate || !packageIdentity) {
    return failure("EXPORT_NOT_READY", "Export guard blocked this selection.");
  }

  return success({ packageIdentity, summary });
}

export function markExported(
  submission: Submission,
  role: Role,
  packageIdentity?: ExportPackageIdentity,
): CommandResult<Submission> {
  if (role !== "admin") {
    return failure("PERMISSION_DENIED", "Only admin can mark exported.");
  }
  if (submission.status === "exported") {
    return failure("EXPORTED_TERMINAL", "Exported is terminal for V-19.");
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
      "Submission must have a downloaded export package before marking exported.",
    );
  }

  const transitioned = transitionSubmissionStatus(withDerivedState(submission), {
      actorRole: role,
      nextStatus: "exported",
      note: "Подача отмечена выгруженной",
      nowIso: "сейчас",
      source: "admin",
    },
  );
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
    return failure("INVALID_TRANSITION", "Submission status is not canonical.");
  }
  if (
    terminalStatuses.has(submission.status) ||
    isExportedTerminal(submission.status)
  ) {
    return failure("EXPORTED_TERMINAL", "Exported is terminal for V-19.");
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
    throw new Error("Validated issue target is missing.");
  }

  return {
    id: `зм-${submission.id}-domain-${submission.issues.length + index + 1}`,
    type: input.type,
    target: {
      applicantId: applicant.id,
      applicantName: applicant.fullName,
      field: input.field,
      fileType: input.fileType,
      section: input.section,
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
  return applicant?.sections
    .flatMap((section) => section.fields)
    .find((field) => questionnaireFieldMatchesTarget(field, input.field))?.value;
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
  if (input.type === "section") {
    const target = (input.section ?? input.field ?? "").trim();
    return Boolean(
      target && applicant.sections.some((section) => section.title === target),
    );
  }

  return Boolean(
    input.type === "field" &&
    input.field &&
    applicant.sections
      .flatMap((section) => section.fields)
      .some((field) => questionnaireFieldMatchesTarget(field, input.field)),
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

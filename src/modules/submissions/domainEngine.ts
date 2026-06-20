import {
  buildExportPackageIdentity,
  exportPackageIdentityMatches,
  exportSummary,
  type ExportSummary,
} from "./exportRules";
import { createDraftSubmission, type CreateDraftInput } from "./submissionActions";
import { defaultDrawerTab, isFixedIssueStatus } from "./status";
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
  if (
    !["draft", "in_progress", "requires_action", "returned"].includes(submission.status)
  ) {
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
): CommandResult<Submission> {
  const terminal = ensureNotTerminal(submission);
  if (terminal) return terminal;
  if (role !== "agent") return failure("PERMISSION_DENIED", "Only agent can submit.");
  if (submission.status !== "in_progress") {
    return failure(
      "INVALID_TRANSITION",
      "Only in-progress submissions can be submitted.",
    );
  }

  const completeness = getCompleteness(submission);
  if (completeness.total < 100) {
    return failure("VALIDATION_ERROR", "Questionnaire and files must be complete.");
  }

  return success(
    withDerivedState({
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
    }),
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

  return success(
    withDerivedState({
      ...submission,
      status: "returned",
      issues: [...nextIssues, ...submission.issues],
      updatedAt: "сейчас",
      history: [
        {
          id: `и-${submission.id}-возврат`,
          text: "Администратор вернул подачу с замечаниями",
          at: "сейчас",
          source: "admin",
        },
        ...submission.history,
      ],
    }),
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
  const issue = submission.issues.find((item) => item.id === issueId);
  if (!issue) return failure("ISSUE_NOT_FOUND", "Issue not found.");
  if (issue.status !== "open") {
    return failure("ISSUE_NOT_FIXABLE", "Only open issues can be marked fixed.");
  }

  return success(
    withDerivedState({
      ...submission,
      issues: submission.issues.map((item) =>
        item.id === issueId ? { ...item, status: "fixed_by_agent" } : item,
      ),
      updatedAt: "сейчас",
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
  if (!["returned", "requires_action"].includes(submission.status)) {
    return failure("INVALID_TRANSITION", "Submission is not waiting for corrections.");
  }
  if (submission.issues.some((issue) => issue.status === "open")) {
    return failure(
      "VALIDATION_ERROR",
      "Open issues must be fixed before resubmission.",
    );
  }

  return success(
    withDerivedState({
      ...submission,
      status: "corrections_received",
      updatedAt: "сейчас",
      history: [
        {
          id: `и-${submission.id}-исправления`,
          text: "Агент отправил исправления",
          at: "сейчас",
          source: "agent",
        },
        ...submission.history,
      ],
    }),
  );
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
  const issue = submission.issues.find((item) => item.id === issueId);
  if (!issue) return failure("ISSUE_NOT_FOUND", "Issue not found.");
  if (!isFixedIssueStatus(issue.status)) {
    return failure("ISSUE_NOT_FIXABLE", "Only fixed issues can be closed.");
  }

  return success(
    withDerivedState({
      ...submission,
      issues: submission.issues.map((item) =>
        item.id === issueId ? { ...item, status: "closed_by_admin" } : item,
      ),
      updatedAt: "сейчас",
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
  if (acceptanceBlockingIssues(submission).length > 0) {
    return failure(
      "ACCEPTANCE_BLOCKED",
      "Acceptance is blocked until all issues are closed by admin.",
    );
  }

  return success(
    withDerivedState({
      ...submission,
      status: "ready_for_export",
      exportState: "ready",
      files: submission.files.map((file) =>
        file.status === "uploaded" || file.status === "pending_review"
          ? { ...file, status: "accepted" }
          : file,
      ),
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
    }),
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

  return success(
    withDerivedState({
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
    }),
  );
}

export function getCompleteness(submission: Submission) {
  const fields = submission.applicants.flatMap((applicant) =>
    applicant.sections.flatMap((section) => section.fields),
  );
  const requiredFields = fields.filter((field) => field.required);
  const readyFields = requiredFields.filter(
    (field) => field.value.trim().length > 0 && !field.error,
  );
  const questionnaire = percent(readyFields.length, requiredFields.length);
  const readyFiles = submission.files.filter((file) =>
    ["accepted", "pending_review", "uploaded"].includes(file.status),
  );
  const files = percent(readyFiles.length, submission.files.length);

  return {
    files,
    questionnaire,
    total: Math.round((questionnaire + files) / 2),
  };
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
  if (["requires_action", "returned"].includes(submission.status)) return true;
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
      return { action: "save_progress", label: "Сохранить черновик" };
    }
    if (submission.status === "in_progress") {
      const complete = getCompleteness(submission).total === 100;
      return {
        action: "submit_for_review",
        disabled: !complete,
        label: "Отправить",
        reason: complete ? undefined : "Есть незаполненные поля или недостающие файлы",
      };
    }
    if (["returned", "requires_action"].includes(submission.status)) {
      const hasOpen = getOpenIssues(submission).length > 0;
      return {
        action: "submit_corrections",
        disabled: hasOpen,
        label: "Отправить исправления",
        reason: hasOpen ? "Сначала отметьте замечания исправленными" : undefined,
      };
    }
    return null;
  }

  if (submission.status === "submitted_for_review") {
    const blocked = acceptanceBlockingIssues(submission).length > 0;
    return {
      action: blocked ? "return_with_issues" : "accept",
      disabled: false,
      label: blocked ? "Вернуть" : "Принять",
    };
  }
  if (submission.status === "corrections_received") {
    const hasOpen = getOpenIssues(submission).length > 0;
    return {
      action: "close_issues_accept",
      disabled: hasOpen,
      label: "Закрыть и принять",
      reason: hasOpen ? "Есть незакрытые замечания" : undefined,
    };
  }
  if (submission.status === "ready_for_export") {
    return { action: "generate_export", label: "Сформировать Эксель" };
  }
  return null;
}

export function getDefaultDrawerTab(submission: Submission) {
  return defaultDrawerTab(submission);
}

function withDerivedState(submission: Submission): Submission {
  return {
    ...submission,
    completeness: getCompleteness(submission),
    country: V19_FIXED_COUNTRY.label,
    countryCode: V19_FIXED_COUNTRY.code,
  };
}

function ensureNotTerminal(submission: Submission): CommandResult<Submission> | null {
  if (terminalStatuses.has(submission.status)) {
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
  };
}

function isValidIssueInput(submission: Submission, input: IssueInput) {
  return (
    submission.applicants.some((applicant) => applicant.id === input.applicantId) &&
    input.reason.trim().length > 0 &&
    input.comment.trim().length > 0
  );
}

function percent(ready: number, total: number) {
  if (total === 0) return 0;
  return Math.round((ready / total) * 100);
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

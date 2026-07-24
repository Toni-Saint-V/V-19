import { applySubmissionActionResult } from "./status";
import type {
  DomainError,
  DomainErrorCode,
  Role,
  Submission,
  SubmissionAction,
} from "./types";

type SubmissionActionErrorAction = SubmissionAction | "mark_issue_fixed";

export class SubmissionActionDomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(error: DomainError) {
    super(error.message);
    this.name = "SubmissionActionDomainError";
    this.code = error.code;
  }
}

export function isSubmissionActionDomainError(
  error: unknown,
): error is SubmissionActionDomainError {
  return error instanceof SubmissionActionDomainError;
}

export type SubmissionActionErrorState = {
  action: SubmissionActionErrorAction;
  code: DomainErrorCode;
  message: string;
  signature: string;
  submissionId: string;
};

export function createSubmissionActionErrorState({
  action,
  error,
  submission,
}: {
  action: SubmissionActionErrorAction;
  error: DomainError;
  submission: Submission;
}): SubmissionActionErrorState {
  return {
    action,
    code: error.code,
    message: error.message,
    signature: submissionActionSignature(submission),
    submissionId: submission.id,
  };
}

export function submissionActionErrorForSubmission(
  error: SubmissionActionErrorState | null,
  submission: Submission,
  role: Role,
) {
  if (!error) return "";
  if (error.submissionId !== submission.id) return "";
  if (error.signature !== submissionActionSignature(submission)) return "";
  if (error.action === "mark_issue_fixed") return error.message;

  const result = applySubmissionActionResult(submission, error.action, role);
  if (result.ok || result.error.code !== error.code) return "";

  return error.message;
}

function submissionActionSignature(submission: Submission) {
  const applicantsSignature = submission.applicants
    .map((applicant) =>
      [
        applicant.id,
        applicant.questionnaireStatus,
        applicant.fileStatus,
        applicant.sections
          .map((section) =>
            [
              section.id,
              section.status,
              section.fields
                .map((field) =>
                  [field.id, field.value, field.error ?? ""].join("="),
                )
                .join(","),
            ].join(":"),
          )
          .join("|"),
      ].join("~"),
    )
    .join(";");
  const filesSignature = submission.files
    .map((file) =>
      [
        file.id,
        file.status,
        file.reviewStatus ?? "",
        file.storagePath ?? "",
        file.uploadedAtIso ?? file.uploadedAt ?? "",
        String(file.sizeBytes ?? ""),
        file.linkedIssueId ?? "",
      ].join(":"),
    )
    .join("|");
  const issuesSignature = submission.issues
    .map((issue) => [issue.id, issue.status, issue.comment].join(":"))
    .join("|");

  return [
    submission.id,
    submission.status,
    submission.exportState ?? "",
    submission.completeness.questionnaire,
    submission.completeness.files,
    submission.completeness.total,
    applicantsSignature,
    filesSignature,
    issuesSignature,
  ].join("::");
}

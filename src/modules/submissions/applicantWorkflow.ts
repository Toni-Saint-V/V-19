import {
  blsApplicantQuestionnaireStatus,
  firstBlsQuestionnaireAttentionTarget,
  isBlsQuestionnaireFileReady,
} from "./questionnaireBlsRules";
import type {
  Applicant,
  Submission,
  SubmissionFile,
  SubmissionFileType,
} from "./types";

export type ApplicantWorkflowActionKind =
  | "questionnaire"
  | "selfie"
  | "selfie_2"
  | "passport_scan";
type ApplicantMediaActionKind = Exclude<
  ApplicantWorkflowActionKind,
  "questionnaire"
>;
export type ApplicantWorkflowActionState = "attention" | "missing" | "ready";

export type ApplicantWorkflowAction = {
  field?: string;
  file?: SubmissionFile;
  issueId?: string;
  kind: ApplicantWorkflowActionKind;
  section?: string;
  state: ApplicantWorkflowActionState;
};

const mainApplicantMediaActionKinds: ApplicantMediaActionKind[] = [
  "selfie",
  "selfie_2",
  "passport_scan",
];

const secondaryApplicantMediaActionKinds: ApplicantMediaActionKind[] = [
  "passport_scan",
];

function activeIssueFor(
  submission: Submission,
  applicantId: string,
  fileType?: SubmissionFileType,
) {
  return submission.issues.find(
    (issue) =>
      issue.status === "open" &&
      issue.target.applicantId === applicantId &&
      issue.target.fileType === fileType,
  );
}

function questionnaireAction(
  submission: Submission,
  applicant: Applicant,
): ApplicantWorkflowAction {
  const issue = activeIssueFor(submission, applicant.id);
  if (issue) {
    return {
      field: issue.target.field,
      issueId: issue.id,
      kind: "questionnaire",
      section: issue.target.section,
      state: "attention",
    };
  }

  const status = blsApplicantQuestionnaireStatus(applicant);
  if (status === "complete") {
    return { kind: "questionnaire", state: "ready" };
  }
  if (status === "empty") {
    return { kind: "questionnaire", state: "missing" };
  }
  return {
    kind: "questionnaire",
    state: "attention",
    ...firstBlsQuestionnaireAttentionTarget(applicant),
  };
}

function mediaAction(
  submission: Submission,
  applicant: Applicant,
  kind: ApplicantMediaActionKind,
): ApplicantWorkflowAction {
  const file = submission.files.find(
    (candidate) => candidate.applicantId === applicant.id && candidate.type === kind,
  );
  const issue = activeIssueFor(submission, applicant.id, kind);
  if (issue) {
    return { file, issueId: issue.id, kind, state: "attention" };
  }
  if (!file || file.status === "missing") {
    return { file, kind, state: "missing" };
  }
  if (!isBlsQuestionnaireFileReady(file)) {
    return { file, kind, state: "attention" };
  }
  return { file, kind, state: "ready" };
}

export function applicantWorkflowActions(
  submission: Submission,
  applicant: Applicant,
): ApplicantWorkflowAction[] {
  const mediaActionKinds =
    applicant.role === "main"
      ? mainApplicantMediaActionKinds
      : secondaryApplicantMediaActionKinds;

  return [
    questionnaireAction(submission, applicant),
    ...mediaActionKinds.map((kind) => mediaAction(submission, applicant, kind)),
  ];
}

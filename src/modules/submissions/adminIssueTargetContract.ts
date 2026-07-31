import {
  isCanonicalFrontendMediaType,
  type CanonicalFrontendMediaType,
} from "./canonicalMediaContract";
import { requiredPassportReviewMediaTypesForApplicant } from "./passportReviewContract";
import { questionnaireFieldMatchesTarget } from "./questionnaire";
import type { Applicant, Issue, IssueInput, Submission, SubmissionFile } from "./types";

export const adminIssueTargetErrorMessage =
  "Admin issue target must resolve to exactly one canonical questionnaire field or media file.";
export const mediaIssueEvidenceSnapshotPrefix = "media-evidence:v1:";

type AdminIssueTargetCandidate = Pick<
  IssueInput,
  "applicantId" | "field" | "fileType" | "type"
>;

export type ResolvedAdminIssueTarget =
  | {
      applicant: Applicant;
      field: string;
      kind: "field";
    }
  | {
      applicant: Applicant;
      fileType: CanonicalFrontendMediaType;
      kind: "media";
    };

export function resolveAdminIssueTarget(
  submission: Submission,
  input: AdminIssueTargetCandidate,
): ResolvedAdminIssueTarget {
  const applicants = submission.applicants.filter(
    (candidate) => candidate.id === input.applicantId,
  );
  if (applicants.length !== 1) {
    throw new Error(adminIssueTargetErrorMessage);
  }
  const applicant = applicants[0];
  const normalizedField = input.field?.trim() || undefined;
  const isMediaIssue = input.type === "file" || input.type === "media";
  const isFieldIssue = input.type === "field" || input.type === "section";
  if (!applicant || (!isMediaIssue && !isFieldIssue)) {
    throw new Error(adminIssueTargetErrorMessage);
  }

  if (isMediaIssue) {
    if (
      normalizedField ||
      !isCanonicalFrontendMediaType(input.fileType) ||
      !requiredPassportReviewMediaTypesForApplicant(submission, applicant.id).includes(
        input.fileType,
      )
    ) {
      throw new Error(adminIssueTargetErrorMessage);
    }
    const files = submission.files.filter(
      (file) => file.applicantId === applicant.id && file.type === input.fileType,
    );
    if (files.length !== 1) {
      throw new Error(adminIssueTargetErrorMessage);
    }
    return {
      applicant,
      fileType: input.fileType,
      kind: "media",
    };
  }

  if (input.fileType || !normalizedField) {
    throw new Error(adminIssueTargetErrorMessage);
  }
  const matchingFields = applicant.sections
    .flatMap((section) => section.fields)
    .filter((field) => questionnaireFieldMatchesTarget(field, normalizedField));
  const matchingField = matchingFields[0];
  if (matchingFields.length !== 1 || !matchingField) {
    throw new Error(adminIssueTargetErrorMessage);
  }
  return {
    applicant,
    field: matchingField.id,
    kind: "field",
  };
}

export function mediaIssueEvidenceSnapshot(
  file: Pick<SubmissionFile, "storageBucket" | "storagePath">,
): string | undefined {
  const bucket = file.storageBucket?.trim();
  const path = file.storagePath?.trim();
  if (!bucket || !path) return undefined;
  return `${mediaIssueEvidenceSnapshotPrefix}${JSON.stringify([bucket, path])}`;
}

export function submissionIssueTargetSnapshot(
  submission: Submission,
  input: Pick<IssueInput, "applicantId" | "field" | "fileType">,
): string | undefined {
  if (input.fileType) {
    const file = submission.files.find(
      (candidate) =>
        candidate.applicantId === input.applicantId &&
        candidate.type === input.fileType,
    );
    return file ? mediaIssueEvidenceSnapshot(file) : undefined;
  }

  const applicant = submission.applicants.find(
    (candidate) => candidate.id === input.applicantId,
  );
  return applicant?.sections
    .flatMap((section) => section.fields)
    .find((field) => questionnaireFieldMatchesTarget(field, input.field))?.value;
}

export function isSubmissionMediaIssueResolved(
  file: SubmissionFile,
  issue: Pick<Issue, "id" | "snapshot">,
): boolean {
  if (file.status === "missing" || file.status === "needs_replacement") {
    return false;
  }

  const currentEvidence = mediaIssueEvidenceSnapshot(file);
  if (issue.snapshot?.startsWith(mediaIssueEvidenceSnapshotPrefix)) {
    return Boolean(currentEvidence && currentEvidence !== issue.snapshot);
  }

  if (file.linkedIssueId !== issue.id || file.uploadStatus !== "uploaded") {
    return false;
  }
  if (file.storageAdapter === "supabase-private") {
    return Boolean(currentEvidence);
  }
  return true;
}

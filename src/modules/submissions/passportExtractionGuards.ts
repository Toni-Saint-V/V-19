import type { Submission, SubmissionAction } from "./types";

export function hasPassportExtractionReviewPending(submission: Submission) {
  return submission.applicants.some((applicant) => {
    const state = applicant.passportExtraction;
    return (
      state?.status === "ready" &&
      state.extractedFields.length > 0 &&
      !state.verifiedAtIso &&
      !state.dismissedAtIso
    );
  });
}

export function requiresPassportExtractionReviewBeforeAction(
  submission: Submission,
  action: SubmissionAction,
) {
  return (
    (action === "submit_for_review" || action === "submit_corrections") &&
    hasPassportExtractionReviewPending(submission)
  );
}

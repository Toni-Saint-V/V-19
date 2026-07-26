import { applySubmissionActionResult } from "./status";
import type { CommandResult, Submission } from "./types";

export function isFinalSubmissionPersistenceCheckpoint(
  index: number,
  checkpointCount: number,
) {
  return checkpointCount > 0 && index === checkpointCount - 1;
}

export function agentSubmissionPersistenceCheckpoints(
  currentSubmission: Submission,
  nextSubmission: Submission,
  actorId: string,
): CommandResult<Submission[]> {
  if (
    currentSubmission.status !== "draft" ||
    nextSubmission.status !== "submitted_for_review"
  ) {
    return { ok: true, data: [nextSubmission] };
  }

  const preparedResult = applySubmissionActionResult(
    currentSubmission,
    "save_progress",
    "agent",
    actorId,
  );
  if (!preparedResult.ok) return preparedResult;

  return {
    ok: true,
    data: [preparedResult.data, nextSubmission],
  };
}

import { applySubmissionActionResult } from "./status";
import type { CommandResult, Submission } from "./types";

function restorePreReviewFileStatuses(
  currentSubmission: Submission,
  nextSubmission: Submission,
) {
  const currentFilesById = new Map(
    currentSubmission.files.map((file) => [file.id, file]),
  );

  return nextSubmission.files.map((file) => {
    if (file.status !== "pending_review") return file;

    const currentStatus = currentFilesById.get(file.id)?.status;
    return {
      ...file,
      status: currentStatus === "accepted" ? "accepted" : "uploaded",
    } as const;
  });
}

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

  const preparedTransition = preparedResult.data.history[0];
  const preparedHistory = nextSubmission.history.filter(
    (item) =>
      item.id !== preparedTransition?.id &&
      !(
        item.fromStatus === "in_progress" &&
        item.toStatus === "submitted_for_review" &&
        item.source === "agent"
      ),
  );
  if (preparedTransition) preparedHistory.unshift(preparedTransition);

  const latestPreparedSubmission: Submission = {
    ...nextSubmission,
    files: restorePreReviewFileStatuses(currentSubmission, nextSubmission),
    history: preparedHistory,
    status: preparedResult.data.status,
    updatedAt: preparedResult.data.updatedAt,
  };

  return {
    ok: true,
    data: [latestPreparedSubmission, nextSubmission],
  };
}

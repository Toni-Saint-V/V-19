import type { Submission } from "./types";

export const agentDeletableSubmissionStatuses = ["draft", "in_progress"] as const;

export type AgentSubmissionDeletionDecision =
  | { ok: true }
  | {
      ok: false;
      reason: "forbidden" | "status";
      message: string;
    };

export function agentSubmissionDeletionDecision(
  submission: Pick<Submission, "agentId" | "status">,
  actorId: Submission["agentId"],
): AgentSubmissionDeletionDecision {
  if (submission.agentId !== actorId) {
    return {
      ok: false,
      reason: "forbidden",
      message: "Можно удалить только свою подачу.",
    };
  }

  if (
    !agentDeletableSubmissionStatuses.includes(
      submission.status as (typeof agentDeletableSubmissionStatuses)[number],
    )
  ) {
    return {
      ok: false,
      reason: "status",
      message: "Эту подачу уже нельзя удалить: она передана в обработку.",
    };
  }

  return { ok: true };
}

export function localDemoMediaPathsForSubmission(submission: Submission): string[] {
  return [
    ...new Set(
      submission.files.flatMap((file) =>
        file.localDemoMediaStored && file.storagePath ? [file.storagePath] : [],
      ),
    ),
  ];
}

type CommitLocalDemoSubmissionDeletionInput = {
  cleanupPaths: readonly string[];
  deleteStoredMedia: (path: string) => Promise<void>;
  persistCanonicalDeletion: () => Promise<void>;
};

export async function commitLocalDemoSubmissionDeletion({
  cleanupPaths,
  deleteStoredMedia,
  persistCanonicalDeletion,
}: CommitLocalDemoSubmissionDeletionInput): Promise<{
  cleanupPendingPaths: string[];
}> {
  await persistCanonicalDeletion();

  const cleanupPendingPaths: string[] = [];
  for (const path of cleanupPaths) {
    try {
      await deleteStoredMedia(path);
    } catch {
      cleanupPendingPaths.push(path);
    }
  }
  return { cleanupPendingPaths };
}

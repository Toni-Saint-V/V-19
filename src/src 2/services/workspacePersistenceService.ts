import type { AppSession } from "../types/session";
import { loadLocalSubmissions, saveLocalSubmissions } from "./localRepository";
import { listSubmissionsForRole, saveSubmissionDraft } from "./submissionService";
import type { Submission } from "../types/domain";

export function collectPersistedStatusHistoryIds(
  submissions: Submission[],
): Map<string, Set<string>> {
  const idsBySubmission = new Map<string, Set<string>>();

  for (const submission of submissions) {
    const ids = new Set<string>();
    for (const item of submission.timeline ?? []) {
      if (item.id) ids.add(item.id);
    }
    idsBySubmission.set(submission.id, ids);
  }

  return idsBySubmission;
}

export async function loadWorkspaceSubmissions(
  session: AppSession,
): Promise<Submission[]> {
  if (session.mode === "local-demo") return loadLocalSubmissions();

  return (await listSubmissionsForRole(session.profile.role, session.profile.id)) ?? [];
}

export function saveLocalWorkspaceSubmissions(submissions: Submission[]): void {
  saveLocalSubmissions(submissions);
}

export async function saveWorkspaceSubmission(
  session: AppSession,
  submission: Submission,
  persistedStatusHistoryIds?: ReadonlySet<string>,
): Promise<void> {
  if (session.mode === "local-demo") {
    return;
  }

  await saveSubmissionDraft(submission, {
    actorId: session.profile.id,
    role: session.profile.role,
    persistedStatusHistoryIds,
  });
}

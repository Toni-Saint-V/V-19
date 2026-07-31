import type { Submission } from "./types";

export type AgentSubmissionCardArchiveDecision =
  | { ok: true }
  | { ok: false; reason: string };

const archivableStatuses = new Set<Submission["status"]>(["draft", "in_progress"]);

export function agentSubmissionCardArchiveDecision(
  submission: Pick<Submission, "status">,
): AgentSubmissionCardArchiveDecision {
  if (archivableStatuses.has(submission.status)) return { ok: true };

  if (submission.status === "returned") {
    return {
      ok: false,
      reason:
        "Возвращённую подачу нельзя удалить: исправьте замечания и отправьте её повторно.",
    };
  }

  return {
    ok: false,
    reason: "Подачу после отправки на проверку нельзя удалить из рабочего процесса.",
  };
}

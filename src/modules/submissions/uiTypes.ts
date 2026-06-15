import type { Submission, Surface } from "./types";

export type AgentTab = "action" | "progress" | "review" | "done";
export type ReviewTab = "review" | "corrections" | "ready";
export type ExportTab = "ready" | "history";
export type CreateStep = "params" | "applicants" | "questionnaire" | "files";
export type DrawerMode = "closed" | "detail" | "create";

export function matchesAgentTab(tab: AgentTab) {
  return (submission: Submission) => {
    if (tab === "action")
      return ["requires_action", "returned"].includes(submission.status);
    if (tab === "progress") return ["draft", "in_progress"].includes(submission.status);
    if (tab === "review") {
      return ["submitted_for_review", "corrections_received"].includes(
        submission.status,
      );
    }
    return ["ready_for_export", "exported"].includes(submission.status);
  };
}

export function matchesReviewTab(tab: ReviewTab) {
  return (submission: Submission) => {
    if (tab === "review") return submission.status === "submitted_for_review";
    if (tab === "corrections") return submission.status === "corrections_received";
    return submission.status === "ready_for_export";
  };
}

export function surfaceTitle(surface: Surface) {
  if (surface === "agent-submissions") return "Мои подачи";
  if (surface === "admin-review") return "Проверка";
  return "Выгрузка";
}

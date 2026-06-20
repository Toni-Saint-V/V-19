import type { Submission, Surface } from "./types";

export type AgentTab = "all" | "action" | "progress" | "review" | "done";
export type ReviewTab = "all" | "review" | "corrections" | "ready";
export type ExportTab = "ready" | "history";
export type DrawerMode = "closed" | "detail" | "create";

export function matchesAgentTab(tab: AgentTab) {
  return (submission: Submission) => {
    if (tab === "all") return true;
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
    if (tab === "all") {
      return [
        "submitted_for_review",
        "corrections_received",
        "ready_for_export",
      ].includes(submission.status);
    }
    if (tab === "review") return submission.status === "submitted_for_review";
    if (tab === "corrections") return submission.status === "corrections_received";
    return submission.status === "ready_for_export";
  };
}

export function surfaceTitle(surface: Surface) {
  if (surface === "agent-actions") return "Мои действия";
  if (surface === "agent-inbox") return "Входящие";
  if (surface === "agent-submissions") return "Мои подачи";
  if (surface === "admin-review") return "Проверка подач";
  return "Выгрузка пакетов";
}

export function surfaceDescription(surface: Surface) {
  if (surface === "agent-actions") {
    return "Очередь точных действий по всем подачам агента.";
  }

  if (surface === "agent-inbox") {
    return "Новые события по подачам и точный переход к месту, где нужно действие.";
  }

  if (surface === "agent-submissions") {
    return "Держите в фокусе подачи, где нужно дозаполнить анкету, файлы или ответить на замечания.";
  }

  if (surface === "admin-review") {
    return "Сначала верхняя подача: проверьте пакет, примите или верните с точным замечанием.";
  }

  return "Соберите принятые подачи, проверьте состав пакета и зафиксируйте выгрузку.";
}

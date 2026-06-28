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
  if (surface === "agent-submissions") return "Заявители и Семьи";
  if (surface === "admin-review") return "Проверка";
  if (surface === "settings") return "Настройки";
  return "Выгрузка";
}

export function surfaceDescription(surface: Surface) {
  if (surface === "agent-actions") {
    return "Очередь подач, ошибок и проверки.";
  }

  if (surface === "agent-inbox") {
    return "События и реакции по подачам.";
  }

  if (surface === "agent-submissions") {
    return "Подачи, анкеты, файлы и замечания.";
  }

  if (surface === "admin-review") {
    return "Проверка без потери контекста.";
  }

  if (surface === "settings") {
    return "Роль, режим данных и безопасный выход.";
  }

  return "Безопасный Excel preview";
}

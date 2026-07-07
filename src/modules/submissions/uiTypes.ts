import type { DrawerTab, Role, Submission, Surface } from "./types";

export type AgentTab = "all" | "action" | "progress" | "review" | "done";
export type ReviewTab = "all" | "review" | "corrections" | "ready";
export type ExportTab = "ready" | "history";
export type DrawerMode = "closed" | "detail" | "create";

export type LegacySurfaceRoute =
  | "agent-drafts"
  | "agent-media"
  | "agent-applicants"
  | "agent-issues"
  | "drafts"
  | "media"
  | "files"
  | "applicants"
  | "issues";

export type LegacyRouteResolution = {
  agentTab?: AgentTab;
  drawerTab?: DrawerTab;
  surface: Surface;
};

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
  if (surface === "agent-documents") return "Сбор документов";
  if (surface === "agent-submissions") return "Мои подачи";
  if (surface === "admin-review") return "Проверка";
  if (surface === "settings") return "Настройки";
  return "Выгрузка";
}

export function surfaceDescription(surface: Surface) {
  if (surface === "agent-actions") {
    return "Очередь задач по подачам: блокеры, приоритет и следующий шаг.";
  }

  if (surface === "agent-documents") {
    return "Документы по каждой подаче: что собрано, что заменить и где открыт блокер.";
  }

  if (surface === "agent-submissions") {
    return "Все подачи агента: статус, готовность, блокеры и следующий переход.";
  }

  if (surface === "admin-review") {
    return "Админская очередь: новые проверки, полученные исправления и готовность к выгрузке.";
  }

  if (surface === "settings") {
    return "Роль, режим данных и безопасный выход.";
  }

  return "Пакеты Excel: готовые подачи, блокеры и состав выгрузки.";
}

export function resolveLegacySurfaceRoute(
  route: string | null | undefined,
  role: Role,
): LegacyRouteResolution | null {
  if (!route) return null;

  const normalized = route.trim().toLowerCase().replace(/^#\/?/, "");
  if (!normalized) return null;

  if (
    normalized === "agent-media" ||
    normalized === "media" ||
    normalized === "files"
  ) {
    return { drawerTab: "files", surface: "agent-documents" };
  }

  if (normalized === "agent-drafts") {
    return { drawerTab: "files", surface: "agent-documents" };
  }

  if (normalized === "drafts") {
    return { agentTab: "progress", surface: "agent-submissions" };
  }

  if (normalized === "agent-applicants" || normalized === "applicants") {
    return { drawerTab: "applicants", surface: "agent-submissions" };
  }

  if (normalized === "agent-issues" || normalized === "issues") {
    return {
      drawerTab: "issues",
      surface: role === "admin" ? "admin-review" : "agent-actions",
    };
  }

  return null;
}

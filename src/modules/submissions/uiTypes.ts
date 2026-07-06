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
  if (surface === "agent-drafts") return "Сбор документов";
  if (surface === "agent-applicants") return "Заявители / Семьи";
  if (surface === "agent-media") return "Файлы / Медиа";
  if (surface === "agent-issues") return "Замечания";
  if (surface === "agent-submissions") return "Мои подачи";
  if (surface === "admin-review") return "Проверка";
  if (surface === "admin-intake") return "Загрузка списков / PDF";
  if (surface === "admin-access") return "Заявки на доступ";
  if (surface === "settings") return "Настройки";
  return "Выгрузка";
}

export function surfaceDescription(surface: Surface) {
  if (surface === "agent-actions") {
    return "Очередь задач по подачам: блокеры, приоритет и следующий шаг.";
  }

  if (surface === "agent-drafts") {
    return "Документы по каждой подаче: что собрано, что заменить и где открыт блокер.";
  }

  if (surface === "agent-applicants") {
    return "Семьи и индивидуальные заявители с быстрым переходом в карточку и анкету.";
  }

  if (surface === "agent-media") {
    return "Единая очередь файлов: загрузка, замена, проверка и принятые медиа.";
  }

  if (surface === "agent-issues") {
    return "Открытые замечания администратора и исправления, ожидающие закрытия.";
  }

  if (surface === "agent-submissions") {
    return "Все подачи агента: статус, готовность, блокеры и следующий переход.";
  }

  if (surface === "admin-review") {
    return "Админская очередь: новые проверки, полученные исправления и готовность к выгрузке.";
  }

  if (surface === "admin-intake") {
    return "Загрузка листов записи, PDF анкет и план передачи пакетов агентам.";
  }

  if (surface === "admin-access") {
    return "Новые агенты: список заявок, принятие и отказ в доступе.";
  }

  if (surface === "settings") {
    return "Роль, режим данных и безопасный выход.";
  }

  return "Пакеты Excel: готовые подачи, блокеры и состав выгрузки.";
}

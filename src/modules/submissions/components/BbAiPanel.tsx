import { activeAiSuggestions, canManageAiSuggestions } from "../aiSuggestions";
import { fileTypeLabels } from "../status";
import type { AiReviewState, AiSuggestion, Role, Submission } from "../types";
import { EmptyState } from "./Primitives";

export function BbAiPanel({
  compact = false,
  onAccept,
  onDismiss,
  onRun,
  role,
  submission,
}: {
  compact?: boolean;
  onAccept: (suggestionId: string) => void;
  onDismiss: (suggestionId: string) => void;
  onRun: () => void;
  role: Role;
  submission: Submission;
}) {
  const suggestions = activeAiSuggestions(submission);
  const state = submission.aiReviewState ?? "idle";
  const canManage = canManageAiSuggestions(submission, role);
  const hasRun = state === "ready";

  return (
    <section
      className={`bb-panel ${compact ? "compact" : ""}`}
      aria-label="ББ-помощник"
    >
      <div className="bb-panel-header">
        <div>
          <p className="kicker">ББ-помощник</p>
          <h3>{compact ? "Подсказки для проверки" : "Возможные проблемы"}</h3>
          <p>
            ББ-помощник может подсветить возможную проблему, но не принимает визовое
            решение.
          </p>
        </div>
        <span className={`status-chip ${suggestions.length ? "amber" : "muted"}`}>
          {stateLabel(state, suggestions.length)}
        </span>
      </div>

      <div className="bb-actions">
        <button
          className="secondary-button"
          disabled={state === "checking"}
          type="button"
          onClick={onRun}
        >
          {hasRun ? "Проверить снова" : "Проверить ББ"}
        </button>
        <span>Повторы скрываются. Решение принимает администратор.</span>
      </div>

      {suggestions.length ? (
        <div className="bb-suggestions">
          {suggestions.map((suggestion) => (
            <AiSuggestionCard
              key={suggestion.id}
              onAccept={onAccept}
              onDismiss={onDismiss}
              canManage={canManage}
              role={role}
              suggestion={suggestion}
            />
          ))}
        </div>
      ) : state === "ready" ? (
        <EmptyState text="Активных подсказок нет." />
      ) : null}
    </section>
  );
}

function AiSuggestionCard({
  canManage,
  onAccept,
  onDismiss,
  role,
  suggestion,
}: {
  canManage: boolean;
  onAccept: (suggestionId: string) => void;
  onDismiss: (suggestionId: string) => void;
  role: Role;
  suggestion: AiSuggestion;
}) {
  return (
    <article className={`bb-suggestion ${suggestion.severity}`}>
      <span>{severityLabel(suggestion.severity)}</span>
      <div>
        <strong>{suggestionTarget(suggestion)}</strong>
        <p>{suggestion.title}</p>
        <small>{suggestion.reason}</small>
      </div>
      {canManage ? (
        <div className="bb-suggestion-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={() => onAccept(suggestion.id)}
          >
            Добавить как замечание
          </button>
          <button
            className="ghost-button"
            type="button"
            onClick={() => onDismiss(suggestion.id)}
          >
            Отклонить
          </button>
        </div>
      ) : (
        <em>
          {role === "admin" ? "Доступно только на проверке" : "Проверит администратор"}
        </em>
      )}
    </article>
  );
}

function stateLabel(state: AiReviewState, activeCount: number) {
  if (state === "checking") return "Проверяет";
  if (state === "failed") return "Ошибка";
  if (state === "ready") return activeCount ? "Есть подсказки" : "Подсказок нет";
  return "Не запускался";
}

function severityLabel(severity: AiSuggestion["severity"]) {
  if (severity === "blocker") return "Блокер";
  if (severity === "warning") return "Проверить";
  return "Инфо";
}

function suggestionTarget(suggestion: AiSuggestion) {
  const parts = [
    suggestion.target.applicantName,
    suggestion.target.section,
    suggestion.target.field,
    suggestion.target.fileType ? fileTypeLabels[suggestion.target.fileType] : undefined,
  ];
  return parts.filter(Boolean).join(" · ");
}

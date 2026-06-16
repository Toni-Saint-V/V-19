import { activeAiSuggestions, canManageAiSuggestions } from "../aiSuggestions";
import { fileTypeLabels } from "../status";
import type { AiReviewState, AiSuggestion, Role, Submission } from "../types";
import { Badge, Button, CardComponent } from "./magicpathPrimitives";
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
      aria-label="Панель подсказок ББ"
    >
      <div className="bb-panel-header">
        <div>
          <p className="kicker">ББ</p>
          <h3>{compact ? "Подсказки для проверки" : "Возможные проблемы"}</h3>
          <p>
            Подсвечивает возможные проблемы; решение остаётся за администратором.
          </p>
        </div>
        <Badge tone={suggestions.length ? "amber" : "muted"}>
          {stateLabel(state, suggestions.length)}
        </Badge>
      </div>

      <div className="bb-actions">
        <Button
          variant="secondary"
          disabled={state === "checking"}
          onClick={onRun}
        >
          {hasRun ? "Проверить снова" : "Запустить проверку"}
        </Button>
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
    <CardComponent as="article" className={`bb-suggestion ${suggestion.severity}`}>
      <span>{severityLabel(suggestion.severity)}</span>
      <div>
        <strong>{suggestionTarget(suggestion)}</strong>
        <p>{suggestion.title}</p>
        <small>{suggestion.reason}</small>
      </div>
      {canManage ? (
        <div className="bb-suggestion-actions">
          <Button variant="secondary" onClick={() => onAccept(suggestion.id)}>
            Добавить как замечание
          </Button>
          <Button variant="ghost" onClick={() => onDismiss(suggestion.id)}>
            Отклонить
          </Button>
        </div>
      ) : (
        <em>
          {role === "admin" ? "Доступно только на проверке" : "Проверит администратор"}
        </em>
      )}
    </CardComponent>
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

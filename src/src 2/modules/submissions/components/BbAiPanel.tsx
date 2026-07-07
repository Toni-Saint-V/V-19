import {
  activeAiSuggestions,
  canManageAiSuggestions,
  canRunAiReview,
  type AiReviewSurface,
} from "../aiSuggestions";
import { fileTypeLabels } from "../status";
import type { AiReviewState, AiSuggestion, Role, Submission } from "../types";
import { Badge, Button, CardComponent } from "../../../shared/ui/primitives";
import { EmptyState } from "./Primitives";

export function BbAiPanel({
  compact = false,
  onAccept,
  onDismiss,
  onRun,
  role,
  submission,
  surface,
}: {
  compact?: boolean;
  onAccept: (suggestionId: string) => void;
  onDismiss: (suggestionId: string) => void;
  onRun: () => void;
  role: Role;
  submission: Submission;
  surface: AiReviewSurface;
}) {
  const suggestions = activeAiSuggestions(submission);
  const state = submission.aiReviewState ?? "idle";
  const canManage = canManageAiSuggestions(submission, role);
  const canRun = canRunAiReview(submission, role, surface);
  const hasRun = state === "ready";

  return (
    <section
      className={`bb-panel ${compact ? "compact" : ""}`}
      aria-label="Панель подсказок ББ"
    >
      <div className="bb-panel-header">
        <div>
          <p className="kicker">ББ</p>
          <h3>{compact ? "Кандидаты замечаний" : "Кандидаты точечных замечаний"}</h3>
          <p>
            Локальные правила находят место проверки; решение остаётся за
            администратором.
          </p>
        </div>
        <Badge tone={suggestions.length ? "amber" : "muted"}>
          {stateLabel(state, suggestions.length)}
        </Badge>
      </div>

      <div className="bb-actions">
        <Button
          variant="secondary"
          disabled={state === "checking" || !canRun}
          onClick={onRun}
        >
          {hasRun ? "Обновить кандидаты" : "Найти кандидаты"}
        </Button>
        <span>
          {canRun
            ? "Запуск ручной. Повтор не создаёт дубли."
            : "Кандидаты недоступны в этом статусе."}
        </span>
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
        <EmptyState text="Кандидатов замечаний нет." />
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
  if (state === "ready") return activeCount ? `Найдено ${activeCount}` : "Не найдено";
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

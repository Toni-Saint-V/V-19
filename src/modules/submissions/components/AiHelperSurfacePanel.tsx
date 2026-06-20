import { Badge, Button, CardComponent } from "../../../shared/ui/primitives";
import { buildSubmissionAiHelperSurface } from "../aiHelperSurface";
import type { SubmissionNextStepAction } from "../submissionNextStepEngine";
import type { Role, Submission } from "../types";

export function AiHelperSurfacePanel({
  compact = false,
  onPrimaryAction,
  role,
  submission,
  surface,
}: {
  compact?: boolean;
  onPrimaryAction?: (action: SubmissionNextStepAction) => void;
  role: Role;
  submission: Submission;
  surface: "agent" | "review" | "export";
}) {
  const helper = buildSubmissionAiHelperSurface({
    role,
    submission,
    surface,
  });
  const primaryActionDisabled =
    helper.primaryAction.disabled ||
    helper.primaryAction.kind === "wait" ||
    helper.primaryAction.kind === "none";
  const actionButtonAriaLabel = primaryActionDisabled
    ? "ИИ-шаг недоступен"
    : "Выполнить ИИ-шаг";
  const actionButtonLabel = primaryActionDisabled
    ? "Недоступно"
    : "Выполнить";

  return (
    <CardComponent
      as="section"
      aria-label={helper.ariaLabel}
      className={`ai-helper-surface ${compact ? "compact" : ""}`}
    >
      <div className="ai-helper-surface-header">
        <div>
          <p className="kicker">ИИ-помощник</p>
          <h3>{helper.title}</h3>
          <p>{helper.summary}</p>
        </div>
        <div>
          <Badge tone="muted">Локальная проверка</Badge>
          <Button
            aria-label={actionButtonAriaLabel}
            disabled={primaryActionDisabled}
            variant="secondary"
            onClick={() => {
              if (primaryActionDisabled) return;
              onPrimaryAction?.(helper.primaryAction);
            }}
          >
            {actionButtonLabel}
          </Button>
        </div>
      </div>
      <div className="ai-helper-surface-sections">
        {helper.sections.map((section) => {
          const visibleItems = compact ? section.items.slice(0, 2) : section.items;
          const hiddenCount = section.items.length - visibleItems.length;

          return (
          <section key={section.id} className="ai-helper-surface-section">
            <h4>{section.title}</h4>
            <ul>
              {visibleItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            {hiddenCount > 0 ? <small>+{hiddenCount}</small> : null}
          </section>
          );
        })}
      </div>
    </CardComponent>
  );
}

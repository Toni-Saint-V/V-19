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
            disabled={primaryActionDisabled}
            variant="secondary"
            onClick={() => {
              if (primaryActionDisabled) return;
              onPrimaryAction?.(helper.primaryAction);
            }}
          >
            {helper.primaryAction.label}
          </Button>
        </div>
      </div>
      <div className="ai-helper-surface-sections">
        {helper.sections.map((section) => (
          <section key={section.id} className="ai-helper-surface-section">
            <h4>{section.title}</h4>
            <ul>
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </CardComponent>
  );
}

import { Badge, CardComponent } from "../../../shared/ui/primitives";
import { buildSubmissionAiHelperSurface } from "../aiHelperSurface";
import type { Role, Submission } from "../types";

export function AiHelperSurfacePanel({
  compact = false,
  role,
  submission,
  surface,
}: {
  compact?: boolean;
  role: Role;
  submission: Submission;
  surface: "agent" | "review" | "export";
}) {
  const helper = buildSubmissionAiHelperSurface({
    role,
    submission,
    surface,
  });

  return (
    <CardComponent
      as="section"
      aria-label={helper.ariaLabel}
      className={`ai-helper-surface ${compact ? "compact" : ""}`}
    >
      <div className="ai-helper-surface-header">
        <div>
          <p className="kicker">AI helper</p>
          <h3>{helper.title}</h3>
          <p>{helper.summary}</p>
        </div>
        <Badge tone="muted">Локальная проверка</Badge>
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

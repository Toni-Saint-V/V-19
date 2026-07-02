import { Bot, ExternalLink } from "lucide-react";
import { Badge, Button, CardComponent } from "../../../shared/ui/primitives";
import { buildReadinessQueue, type WorkspaceTarget } from "../workspaceModel";
import type { Submission } from "../types";

export function AiReadinessQueuePanel({
  onOpenTarget,
  submission,
}: {
  onOpenTarget: (target: WorkspaceTarget) => void;
  submission: Submission;
}) {
  const items = buildReadinessQueue(submission).filter((item) => item.source === "ai");

  if (!items.length) return null;

  return (
    <CardComponent
      as="section"
      className="ai-readiness-queue-panel"
      aria-label="AI-подсказки по подаче"
    >
      <header>
        <span>
          <Bot aria-hidden="true" size={17} />
          AI-подсказки
        </span>
        <Badge tone="blue">{items.length}</Badge>
      </header>
      <div className="ai-readiness-queue-items">
        {items.map((item) => (
          <article className={`ai-readiness-queue-item tone-${item.tone}`} key={item.id}>
            <div>
              <strong>{item.title}</strong>
              <p>{item.body}</p>
            </div>
            <Button variant="secondary" onClick={() => onOpenTarget(item.target)}>
              <ExternalLink aria-hidden="true" size={14} />
              {item.actionLabel}
            </Button>
          </article>
        ))}
      </div>
    </CardComponent>
  );
}

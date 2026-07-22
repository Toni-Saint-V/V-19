import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Check,
  CircleAlert,
  Clipboard,
  Clock3,
  FileSearch,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { cn } from "../../../shared/ui/cn";
import { Badge, Button } from "../../../shared/ui/primitives";
import {
  buildCaseCopilotBrief,
  formatCaseCopilotHighlight,
  type CaseCopilotHighlight,
  type CaseCopilotStatus,
} from "../caseCopilot";
import type { Role, Submission } from "../types";
import type { WorkspaceTarget } from "../workspaceModel";
import { agentInteractionProps } from "../agentInteractionContract";

type Props = {
  className?: string;
  compact?: boolean;
  onOpenTarget?: (target: WorkspaceTarget) => void;
  role: Role;
  submission: Submission;
  surface: "agent" | "review" | "export";
};

export function CaseCopilotBriefCard({
  className,
  compact = false,
  onOpenTarget,
  role,
  submission,
  surface,
}: Props) {
  const brief = useMemo(
    () => buildCaseCopilotBrief({ role, submission, surface }),
    [role, submission, surface],
  );
  const [copied, setCopied] = useState<"brief" | "draft" | null>(null);
  const [copyError, setCopyError] = useState(false);
  const resetTimerRef = useRef<number | undefined>(undefined);
  const meta = statusMeta(brief.status);
  const draft = brief.drafts[0];

  useEffect(
    () => () => {
      if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    },
    [],
  );

  async function handleCopy(kind: "brief" | "draft", text: string) {
    const success = await copyToClipboard(text);
    if (!success) {
      setCopied(null);
      setCopyError(true);
      return;
    }
    setCopyError(false);
    setCopied(kind);
    if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    resetTimerRef.current = window.setTimeout(() => setCopied(null), 1800);
  }

  return (
    <section
      aria-label="AI-сводка по подаче"
      className={cn(
        "v19-case-copilot",
        `is-${brief.status}`,
        compact && "is-compact",
        className,
      )}
      data-testid="case-copilot-brief"
    >
      <header className="v19-case-copilot-head">
        <span className="v19-case-copilot-mark" aria-hidden="true">
          <Sparkles />
        </span>
        <div className="v19-case-copilot-heading">
          <span>Case Copilot</span>
          <h4>{brief.title}</h4>
          <p>{brief.summary}</p>
        </div>
        <Badge className="v19-case-copilot-status" tone={meta.tone}>
          {meta.label}
        </Badge>
      </header>

      <div className="v19-case-copilot-why">
        <Bot aria-hidden="true" />
        <div>
          <small>Почему сейчас</small>
          <strong>{brief.reason}</strong>
        </div>
      </div>

      <div className="v19-case-copilot-signals" aria-label="Сигналы проверки">
        {brief.highlights.slice(0, compact ? 2 : 4).map((highlight) => (
          <CopilotSignal
            highlight={highlight}
            instrumentAgentInteraction={role === "agent"}
            key={`${highlight.kind}-${highlight.label}`}
            onOpenTarget={onOpenTarget}
          />
        ))}
      </div>

      {!compact && brief.actions.length ? (
        <div className="v19-case-copilot-plan">
          <small>Рекомендуемый план</small>
          <ol>
            {brief.actions.slice(0, 3).map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ol>
        </div>
      ) : null}

      <footer className="v19-case-copilot-footer">
        <span>
          <ShieldCheck aria-hidden="true" />
          Объяснимая подсказка. Данные меняются только после действия пользователя.
        </span>
        <div>
          {draft ? (
            <Button
              {...(role === "agent" ? agentInteractionProps("ai.copy-plan") : {})}
              className="v19-case-copilot-copy"
              variant="ghost"
              onClick={() =>
                void handleCopy("draft", `${draft.title}\n\n${draft.body}`)
              }
            >
              {copied === "draft" ? (
                <Check aria-hidden="true" />
              ) : (
                <Clipboard aria-hidden="true" />
              )}
              {copied === "draft" ? "Черновик скопирован" : "Черновик"}
            </Button>
          ) : null}
          <Button
            {...(role === "agent" ? agentInteractionProps("ai.copy-plan") : {})}
            className="v19-case-copilot-copy"
            variant="secondary"
            onClick={() => void handleCopy("brief", briefText(brief))}
          >
            {copied === "brief" ? (
              <Check aria-hidden="true" />
            ) : (
              <Clipboard aria-hidden="true" />
            )}
            {copied === "brief" ? "План скопирован" : "Скопировать план"}
          </Button>
        </div>
        {copyError ? (
          <p className="v19-case-copilot-copy-error" role="alert">
            Не удалось скопировать. Разрешите доступ к буферу и попробуйте ещё раз.
          </p>
        ) : null}
      </footer>
    </section>
  );
}

function CopilotSignal({
  highlight,
  instrumentAgentInteraction,
  onOpenTarget,
}: {
  highlight: CaseCopilotHighlight;
  instrumentAgentInteraction: boolean;
  onOpenTarget?: (target: WorkspaceTarget) => void;
}) {
  const Icon = signalIcon(highlight);
  const content = (
    <>
      <Icon aria-hidden="true" />
      <span>
        <small>{highlight.label}</small>
        <strong>{highlight.summary}</strong>
      </span>
    </>
  );

  return highlight.target && onOpenTarget ? (
    <button
      {...(instrumentAgentInteraction ? agentInteractionProps("ai.open-target") : {})}
      className={cn("v19-case-copilot-signal", `is-${highlight.status}`)}
      type="button"
      onClick={() => onOpenTarget(highlight.target!)}
    >
      {content}
    </button>
  ) : (
    <div className={cn("v19-case-copilot-signal", `is-${highlight.status}`)}>
      {content}
    </div>
  );
}

function signalIcon(highlight: CaseCopilotHighlight) {
  if (highlight.status === "blocked") return CircleAlert;
  if (highlight.status === "waiting") return Clock3;
  if (highlight.status === "ready" || highlight.status === "complete") {
    return ShieldCheck;
  }
  return FileSearch;
}

function statusMeta(status: CaseCopilotStatus): {
  label: string;
  tone: "amber" | "blue" | "danger" | "muted" | "teal";
} {
  if (status === "blocked") return { label: "Есть блокер", tone: "danger" };
  if (status === "needs_review") return { label: "Нужна проверка", tone: "amber" };
  if (status === "waiting") return { label: "Ожидание", tone: "blue" };
  if (status === "ready") return { label: "Готов к шагу", tone: "teal" };
  return { label: "Завершено", tone: "muted" };
}

function briefText(brief: ReturnType<typeof buildCaseCopilotBrief>) {
  const signals = brief.highlights
    .slice(0, 5)
    .map((highlight) => `• ${formatCaseCopilotHighlight(highlight)}`)
    .join("\n");
  const actions = brief.actions
    .slice(0, 5)
    .map((action, index) => `${index + 1}. ${action}`)
    .join("\n");

  return [
    brief.title,
    brief.summary,
    `Почему сейчас: ${brief.reason}`,
    signals ? `Сигналы:\n${signals}` : "",
    actions ? `План:\n${actions}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function copyToClipboard(text: string): Promise<boolean> {
  let textarea: HTMLTextAreaElement | null = null;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    return copied;
  } catch {
    return false;
  } finally {
    textarea?.remove();
  }
}

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Bot,
  Check,
  Clipboard,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { cn } from "../../../shared/ui/cn";
import { Button } from "../../../shared/ui/primitives";
import {
  buildWorkspaceIntelligence,
  workspaceIntelligenceClipboardText,
} from "../workspaceIntelligence";
import type { Role, Submission } from "../types";
import { agentInteractionProps } from "../agentInteractionContract";

type Props = {
  className?: string;
  onOpenSubmission?: (submissionId: string) => void;
  role: Role;
  submissions: Submission[];
};

export function WorkspaceIntelligencePulse({
  className,
  onOpenSubmission,
  role,
  submissions,
}: Props) {
  const intelligence = useMemo(
    () => buildWorkspaceIntelligence(submissions, role),
    [role, submissions],
  );
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const resetTimerRef = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    },
    [],
  );

  async function copyPlan() {
    const success = await copyToClipboard(
      workspaceIntelligenceClipboardText(intelligence),
    );
    if (!success) {
      setCopied(false);
      setCopyError(true);
      return;
    }
    setCopyError(false);
    setCopied(true);
    if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    resetTimerRef.current = window.setTimeout(() => setCopied(false), 1800);
  }

  const canOpenPriority = Boolean(intelligence.topSubmissionId && onOpenSubmission);

  return (
    <section
      aria-label="AI-приоритизация рабочей очереди"
      className={cn("v19-workspace-intelligence", `is-${intelligence.tone}`, className)}
      data-testid="workspace-intelligence-pulse"
    >
      <div className="v19-workspace-intelligence-score" aria-hidden="true">
        <svg viewBox="0 0 44 44" role="presentation">
          <circle cx="22" cy="22" r="18" />
          <circle
            className="is-progress"
            cx="22"
            cy="22"
            r="18"
            pathLength="100"
            strokeDasharray={`${intelligence.score} 100`}
          />
        </svg>
        <strong>{intelligence.score}</strong>
      </div>

      <div className="v19-workspace-intelligence-copy">
        <div className="v19-workspace-intelligence-kicker">
          <span>
            <Sparkles aria-hidden="true" />
            AI-пульс очереди
          </span>
          <em>объяснимый приоритет</em>
        </div>
        <h2>{intelligence.headline}</h2>
        <p>{intelligence.summary}</p>
        {intelligence.topReason ? (
          <div className="v19-workspace-intelligence-reason">
            <Bot aria-hidden="true" />
            <span>
              <small>Почему этот пакет выше</small>
              <strong>{intelligence.topReason}</strong>
            </span>
          </div>
        ) : null}
      </div>

      <div
        className="v19-workspace-intelligence-metrics"
        aria-label="Сводка по очереди"
      >
        {intelligence.metrics.map((metric) => (
          <span className={`is-${metric.tone}`} key={metric.label}>
            <strong>{metric.value}</strong>
            <small>{metric.label}</small>
          </span>
        ))}
      </div>

      <div className="v19-workspace-intelligence-actions">
        {canOpenPriority ? (
          <Button
            {...(role === "agent" ? agentInteractionProps("ai.open-target") : {})}
            className="v19-workspace-intelligence-primary"
            variant="primary"
            onClick={() => onOpenSubmission?.(intelligence.topSubmissionId!)}
          >
            <ArrowUpRight aria-hidden="true" />
            Открыть приоритет
          </Button>
        ) : null}
        <Button
          {...(role === "agent" ? agentInteractionProps("ai.copy-plan") : {})}
          className="v19-workspace-intelligence-secondary"
          variant="secondary"
          onClick={() => void copyPlan()}
        >
          {copied ? <Check aria-hidden="true" /> : <Clipboard aria-hidden="true" />}
          {copied ? "План скопирован" : "Скопировать план"}
        </Button>
        {copyError ? (
          <span className="v19-workspace-intelligence-copy-error" role="alert">
            Не удалось скопировать план. Попробуйте ещё раз.
          </span>
        ) : null}
        <span className="v19-workspace-intelligence-guardrail">
          <ShieldCheck aria-hidden="true" />
          Без автоприменения изменений
        </span>
      </div>
    </section>
  );
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

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type SetStateAction,
} from "react";

import { Badge, Button } from "../../../shared/ui/primitives";
import { cn } from "../../../shared/ui/cn";
import type { SubmissionHistoryItem } from "../types";
import { ProgressMeter, SvgIcon } from "./CollectionPrimitives";

export type RailBadgeTone = "amber" | "blue" | "danger" | "default" | "muted" | "teal";

export function useRailDisclosure({
  defaultOpen = false,
  enabled,
  onClose,
  transition,
}: {
  defaultOpen?: boolean;
  enabled: boolean;
  onClose?: () => void;
  transition?: (update: () => void) => void;
}) {
  const [open, setOpen] = useState(() => enabled && defaultOpen);
  const userClosedRef = useRef(false);
  const previousEnabledRef = useRef(enabled);
  const commit = useMemo(
    () => transition ?? ((update: () => void) => update()),
    [transition],
  );

  useEffect(() => {
    const wasEnabled = previousEnabledRef.current;
    previousEnabledRef.current = enabled;

    if (!enabled) {
      if (open) commit(() => setOpen(false));
      return;
    }

    if (!wasEnabled && defaultOpen && !userClosedRef.current) {
      commit(() => setOpen(true));
    }
  }, [commit, defaultOpen, enabled, open]);

  useEffect(() => {
    if (!enabled || !open) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      userClosedRef.current = true;
      commit(() => setOpen(false));
      onClose?.();
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [commit, enabled, onClose, open]);

  return {
    close: () => {
      userClosedRef.current = true;
      commit(() => setOpen(false));
      onClose?.();
    },
    open,
    setOpen: (nextValue: SetStateAction<boolean>) =>
      commit(() =>
        setOpen((current) => {
          const next =
            typeof nextValue === "function" ? nextValue(current) : nextValue;
          userClosedRef.current = !next;
          return next;
        }),
      ),
    toggle: () =>
      commit(() =>
        setOpen((value) => {
          const next = !value;
          userClosedRef.current = !next;
          return next;
        }),
      ),
  };
}

export function RailCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={cn("v19-rail-card", className)}>{children}</section>;
}

export function RailStatusLine({
  percent,
  tone,
  label,
}: {
  label: string;
  percent: number;
  tone: RailBadgeTone;
}) {
  return (
    <>
      <div className="v19-rail-statusline">
        <Badge tone={tone}>{label}</Badge>
        <strong>{percent}%</strong>
      </div>
      <ProgressMeter
        ariaHidden
        className="v19-rail-progress"
        tone={railProgressTone(tone)}
        value={percent}
      />
    </>
  );
}

function railProgressTone(tone: RailBadgeTone) {
  if (tone === "danger") return "danger";
  if (tone === "amber") return "warning";
  if (tone === "teal") return "success";
  return "muted";
}

export function RailActionCard({
  description,
  label,
  statusLabel,
  title,
  tone,
  onAction,
}: {
  description: ReactNode;
  label: string;
  statusLabel: string;
  title: string;
  tone: RailBadgeTone;
  onAction: () => void;
}) {
  return (
    <RailCard className="v19-rail-next-card">
      <div className="v19-rail-next-head">
        <p className="v19-rail-label">Следующее действие</p>
        <Badge tone={tone}>{statusLabel}</Badge>
      </div>
      <h3>{title}</h3>
      <p className="v19-rail-action-detail">{description}</p>
      <Button variant="primary" onClick={onAction}>
        {label}
      </Button>
    </RailCard>
  );
}

export function RailIssueList({
  count,
  issues,
}: {
  count: number;
  issues: Array<{
    id: string;
    reason: string;
    targetLine: string;
    tone: "danger" | "warning";
    onOpen: () => void;
  }>;
}) {
  if (count <= 0) return null;

  return (
    <RailCard className="v19-rail-issues-card">
      <p className="v19-rail-label">Открытые замечания · {count}</p>
      <div className="v19-rail-issue-list">
        {issues.map((issue) => (
          <button
            className="v19-rail-issue"
            key={issue.id}
            type="button"
            onClick={issue.onOpen}
          >
            <span className={`v19-rail-issue-dot tone-${issue.tone}`} aria-hidden="true" />
            <span>
              <strong>{issue.reason}</strong>
              <small>{issue.targetLine}</small>
            </span>
            <SvgIcon>
              <path d="M9 6l6 6-6 6" />
            </SvgIcon>
          </button>
        ))}
      </div>
    </RailCard>
  );
}

export function RailQuickLinks({
  links,
}: {
  links: Array<{
    icon: ReactNode;
    label: string;
    onClick: () => void;
  }>;
}) {
  return (
    <RailCard className="v19-rail-quick-card">
      <p className="v19-rail-label">Быстрые переходы</p>
      <div className="v19-rail-quick-links">
        {links.map((link) => (
          <Button key={link.label} variant="secondary" onClick={link.onClick}>
            {link.icon}
            {link.label}
          </Button>
        ))}
      </div>
    </RailCard>
  );
}

export function RailHistoryList({
  history,
}: {
  history: SubmissionHistoryItem[];
}) {
  return (
    <RailCard className="v19-rail-history-card">
      <p className="v19-rail-label">Последние изменения</p>
      <div className="v19-rail-history">
        {history.slice(0, 2).map((item) => (
          <span key={item.id}>
            <strong>{item.text}</strong>
            <small>
              {item.at}
              {item.detail ? ` · ${item.detail}` : ""}
            </small>
          </span>
        ))}
      </div>
    </RailCard>
  );
}

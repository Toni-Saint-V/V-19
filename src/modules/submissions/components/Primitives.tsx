import { type ReactNode, useEffect, useId, useRef } from "react";
import {
  Badge,
  Button,
  CardComponent,
  SegmentedTabs,
} from "../../../shared/ui/primitives";
import { statusLabels, statusTone } from "../status";
import type { Submission } from "../types";
import {
  agentInteractionProps,
  type AgentInteractionId,
} from "../agentInteractionContract";

export function PanelHeader<T extends string>({
  action,
  description,
  eyebrow,
  onTab,
  search,
  side,
  tabs,
  title,
  titleId,
  value,
}: {
  action?: ReactNode;
  description?: string;
  eyebrow?: string;
  onTab?: (tab: T) => void;
  search?: ReactNode;
  side?: ReactNode;
  tabs?: Array<[T, string]>;
  title: string;
  titleId?: string;
  value?: T;
}) {
  const renderTabs =
    tabs && tabs.length > 0 && value !== undefined && onTab !== undefined;
  const hasTabs = Boolean(renderTabs);

  return (
    <div className="panel-header">
      <div className="panel-header-title">
        {eyebrow ? <p className="kicker">{eyebrow}</p> : null}
        <h2 id={titleId}>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {side && hasTabs ? <div className="panel-header-side">{side}</div> : null}
      {hasTabs || side || search || action ? (
        <div className={`panel-controls ${hasTabs ? "" : "is-filter-search"}`}>
          {renderTabs ? (
            <div className="panel-tabs-group">
              <SegmentedTabs
                ariaLabel={title}
                tabs={tabs}
                value={value}
                onValueChange={onTab}
              />
              {action}
            </div>
          ) : side ? (
            <div className="panel-filter-slot">{side}</div>
          ) : null}
          {search ? <div className="panel-search-slot">{search}</div> : null}
          {!hasTabs && action ? (
            <div className="panel-action-slot">{action}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function SummaryRow({ chips }: { chips: Array<[string, string, string]> }) {
  return (
    <section className="summary-row" aria-label="Сводка">
      {chips.map(([tone, value, label]) => (
        <CardComponent
          as="article"
          className={`summary-chip ${tone}`}
          key={`${value}-${label}`}
          aria-label={`${value} ${label}`}
        >
          <span>{value}</span>
          <strong>{label}</strong>
        </CardComponent>
      ))}
    </section>
  );
}

export function StatusChip({ submission }: { submission: Submission }) {
  return (
    <Badge tone={statusTone[submission.status]}>
      {statusLabels[submission.status]}
    </Badge>
  );
}

export function EmptyState({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}

export function ConfirmationDialog({
  busy = false,
  cancelLabel = "Остаться",
  cancelInteractionId,
  confirmDanger = true,
  confirmLabel = "Закрыть без сохранения",
  confirmInteractionId,
  description = "Черновик изменён. Закрытие без сохранения потребует подтверждения.",
  error,
  kicker = "Несохранённые изменения",
  onCancel,
  onConfirm,
  title = "Закрыть панель?",
}: {
  busy?: boolean;
  cancelLabel?: string;
  cancelInteractionId?: AgentInteractionId;
  confirmDanger?: boolean;
  confirmLabel?: string;
  confirmInteractionId?: AgentInteractionId;
  description?: ReactNode;
  error?: ReactNode;
  kicker?: string;
  onCancel: () => void;
  onConfirm: () => void;
  title?: string;
}) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const focusRestoreFrameRef = useRef<number | null>(null);
  const focusRestoreTargetRef = useRef<HTMLElement | null>(null);
  const busyRef = useRef(busy);
  const onCancelRef = useRef(onCancel);
  const onConfirmRef = useRef(onConfirm);
  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();

  busyRef.current = busy;
  onCancelRef.current = onCancel;
  onConfirmRef.current = onConfirm;

  useEffect(() => {
    if (focusRestoreFrameRef.current !== null) {
      window.cancelAnimationFrame(focusRestoreFrameRef.current);
      focusRestoreFrameRef.current = null;
    }
    if (!focusRestoreTargetRef.current?.isConnected) {
      focusRestoreTargetRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    cancelButtonRef.current?.focus({ preventScroll: true });

    const handleKeyDown = (event: KeyboardEvent) => {
      const dialog = dialogRef.current;
      if (!dialog) return;

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (busyRef.current) return;
        onCancelRef.current();
        return;
      }

      if (event.key !== "Tab") return;

      const focusableElements = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter(
        (element) =>
          element.getAttribute("aria-hidden") !== "true" &&
          !element.hasAttribute("hidden"),
      );
      const firstElement = focusableElements[0];
      const lastElement = focusableElements.at(-1);
      if (!firstElement || !lastElement) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }

      if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? lastElement : firstElement).focus({ preventScroll: true });
      } else if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus({ preventScroll: true });
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus({ preventScroll: true });
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      focusRestoreFrameRef.current = window.requestAnimationFrame(() => {
        focusRestoreFrameRef.current = null;
        const previouslyFocusedElement = focusRestoreTargetRef.current;
        focusRestoreTargetRef.current = null;
        if (
          previouslyFocusedElement?.isConnected &&
          !previouslyFocusedElement.matches(":disabled") &&
          !previouslyFocusedElement.closest("[inert]")
        ) {
          previouslyFocusedElement.focus({ preventScroll: true });
        }
      });
    };
  }, []);

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className="confirmation-dialog"
        role="dialog"
        aria-modal="true"
        aria-busy={busy || undefined}
        aria-describedby={`${descriptionId}${error ? ` ${errorId}` : ""}`}
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <p className="kicker">{kicker}</p>
        <h2 id={titleId}>{title}</h2>
        <p id={descriptionId}>{description}</p>
        {error ? (
          <div id={errorId} role="alert">
            {error}
          </div>
        ) : null}
        <div className="dialog-actions">
          <Button
            {...(cancelInteractionId
              ? agentInteractionProps(cancelInteractionId)
              : {})}
            ref={cancelButtonRef}
            disabled={busy}
            variant="secondary"
            onClick={() => {
              if (!busyRef.current) onCancelRef.current();
            }}
          >
            {cancelLabel}
          </Button>
          <Button
            {...(confirmInteractionId
              ? agentInteractionProps(confirmInteractionId)
              : {})}
            danger={confirmDanger}
            loading={busy}
            onClick={() => {
              if (!busyRef.current) onConfirmRef.current();
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </section>
    </div>
  );
}

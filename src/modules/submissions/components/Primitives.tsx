import { type KeyboardEvent, type ReactNode, useEffect, useRef } from "react";
import { statusLabels, statusTone } from "../status";
import type { Submission } from "../types";

export function PanelHeader<T extends string>({
  action,
  eyebrow,
  onTab,
  search,
  tabs,
  title,
  titleId,
  value,
}: {
  action?: ReactNode;
  eyebrow: string;
  onTab: (tab: T) => void;
  search?: ReactNode;
  tabs: Array<[T, string]>;
  title: string;
  titleId?: string;
  value: T;
}) {
  const tabRefs = useRef(new Map<T, HTMLButtonElement>());

  function focusTab(index: number) {
    const [id] = tabs[index];
    onTab(id);
    requestAnimationFrame(() => {
      tabRefs.current.get(id)?.focus({ preventScroll: true });
    });
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const lastIndex = tabs.length - 1;
    let nextIndex: number | null = null;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = index === lastIndex ? 0 : index + 1;
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = index === 0 ? lastIndex : index - 1;
    }

    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = lastIndex;

    if (nextIndex === null) return;

    event.preventDefault();
    focusTab(nextIndex);
  }

  return (
    <div className="panel-header">
      <div className="panel-header-title">
        <p className="kicker">{eyebrow}</p>
        <h2 id={titleId}>{title}</h2>
      </div>
      <div className="panel-controls">
        {search ? <div className="panel-search-slot">{search}</div> : null}
        <div className="tabs" role="tablist" aria-label={title}>
          {tabs.map(([id, label], index) => {
            const selected = value === id;

            return (
              <button
                className={selected ? "is-active" : ""}
                key={id}
                type="button"
                role="tab"
                aria-selected={selected}
                ref={(node) => {
                  if (node) tabRefs.current.set(id, node);
                  else tabRefs.current.delete(id);
                }}
                tabIndex={selected ? 0 : -1}
                onClick={() => focusTab(index)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
              >
                {label}
              </button>
            );
          })}
        </div>
        {action}
      </div>
    </div>
  );
}

export function SummaryRow({ chips }: { chips: Array<[string, string, string]> }) {
  return (
    <section className="summary-row" aria-label="Сводка">
      {chips.map(([tone, value, label]) => (
        <article
          className={`summary-chip ${tone}`}
          key={`${value}-${label}`}
          aria-label={`${value} ${label}`}
        >
          <span>{value}</span>
          <strong>{label}</strong>
        </article>
      ))}
    </section>
  );
}

export function StatusChip({ submission }: { submission: Submission }) {
  return (
    <span className={`status-chip ${statusTone[submission.status]}`}>
      {statusLabels[submission.status]}
    </span>
  );
}

export function EmptyState({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}

export function ConfirmationDialog({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    cancelButtonRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="confirmation-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.stopPropagation();
          onCancel();
        }}
      >
        <p className="kicker">Несохранённые изменения</p>
        <h2 id="confirm-title">Закрыть панель?</h2>
        <p>Черновик изменён. Закрытие без сохранения потребует подтверждения.</p>
        <div className="dialog-actions">
          <button
            className="secondary-button"
            type="button"
            ref={cancelButtonRef}
            onClick={onCancel}
          >
            Остаться
          </button>
          <button
            className="primary-button danger-action"
            type="button"
            onClick={onConfirm}
          >
            Закрыть без сохранения
          </button>
        </div>
      </section>
    </div>
  );
}

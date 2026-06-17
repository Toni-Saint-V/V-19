import { type ReactNode, useEffect, useRef } from "react";
import {
  Badge,
  Button,
  CardComponent,
  SegmentedTabs,
} from "../../../shared/ui/primitives";
import { statusLabels, statusTone } from "../status";
import type { Submission } from "../types";

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
  eyebrow: string;
  onTab: (tab: T) => void;
  search?: ReactNode;
  side?: ReactNode;
  tabs: Array<[T, string]>;
  title: string;
  titleId?: string;
  value: T;
}) {
  return (
    <div className="panel-header">
      <div className="panel-header-title">
        <p className="kicker">{eyebrow}</p>
        <h2 id={titleId}>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {side ? <div className="panel-header-side">{side}</div> : null}
      <div className="panel-controls">
        <div className="panel-tabs-group">
          <SegmentedTabs
            ariaLabel={title}
            tabs={tabs}
            value={value}
            onValueChange={onTab}
          />
          {action}
        </div>
        {search ? <div className="panel-search-slot">{search}</div> : null}
      </div>
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
          <Button variant="secondary" ref={cancelButtonRef} onClick={onCancel}>
            Остаться
          </Button>
          <Button danger onClick={onConfirm}>
            Закрыть без сохранения
          </Button>
        </div>
      </section>
    </div>
  );
}

import { useMemo, useState, type ReactNode } from "react";
import {
  vfFilterWorkItems,
  vfMakeWorkItemFromAction,
  vfMakeWorkItemFromEvent,
  type VfActionInput,
  type VfEventInput,
  type VfTone,
  type VfWorkItem,
  type VfWorkOpenTarget,
  type VfWorkTab,
} from "./visaflow-v19-ui-ideal-adapter-v17.3";

export type VfAgentWorkCenterProps<TSubmission = unknown> = {
  events: Array<VfEventInput<TSubmission>>;
  openActions: Array<VfActionInput<TSubmission>>;
  completedActions?: Array<VfActionInput<TSubmission>>;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  onOpen: (target: VfWorkOpenTarget<TSubmission>) => void;
  onRoute?: (route: string) => void;
  renderIcon?: (name: string) => ReactNode;
};

const tabLabels: Array<{ id: VfWorkTab; label: string }> = [
  { id: "now", label: "Сейчас" },
  { id: "events", label: "События" },
  { id: "actions", label: "Действия" },
  { id: "done", label: "Выполнено" },
];

function toneClass(tone?: VfTone) {
  return tone ? `is-${tone}` : "is-neutral";
}

function Dot({ tone }: { tone?: VfTone }) {
  return <span className={`v19-ideal-dot ${toneClass(tone)}`} aria-hidden="true" />;
}

function Icon({ name, renderIcon }: { name: string; renderIcon?: (name: string) => ReactNode }) {
  return <>{renderIcon ? renderIcon(name) : <span aria-hidden="true">›</span>}</>;
}

function WorkRow<TSubmission>({ item, onOpen, renderIcon }: {
  item: VfWorkItem<TSubmission>;
  onOpen: (target: VfWorkOpenTarget<TSubmission>) => void;
  renderIcon?: (name: string) => ReactNode;
}) {
  return (
    <article
      className={`v19-ideal-work-row ${item.unread ? "is-unread" : ""}`}
      tabIndex={0}
      aria-label={[item.title, item.objectTitle].filter(Boolean).join(" · ")}
      onClick={() => onOpen(item.open)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(item.open);
        }
      }}
    >
      <Dot tone={item.tone} />
      <div className="v19-ideal-row-main">
        <span className="v19-ideal-kind">{item.kind === "event" ? "Событие" : "Действие"}</span>
        <strong>{item.title}</strong>
        {item.meta ? <small>{item.meta}</small> : null}
      </div>
      <div className="v19-ideal-row-object">
        <strong>{item.objectTitle}</strong>
        {item.objectMeta ? <small>{item.objectMeta}</small> : null}
      </div>
      <div className="v19-ideal-row-due">
        <span>{item.dueLabel}</span>
        <strong>{item.dueValue}</strong>
      </div>
      <span className={`v19-ideal-chip ${toneClass(item.stateTone ?? item.tone)}`}>{item.stateLabel}</span>
      <button
        className="v19-ideal-row-cta"
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onOpen(item.open);
        }}
      >
        <span>{item.cta}</span>
        <Icon name="arrow" renderIcon={renderIcon} />
      </button>
    </article>
  );
}

export function VfAgentWorkCenter<TSubmission = unknown>({
  completedActions = [],
  events,
  onOpen,
  onRoute,
  onSearchChange,
  openActions,
  renderIcon,
  searchValue,
}: VfAgentWorkCenterProps<TSubmission>) {
  const [localQuery, setLocalQuery] = useState("");
  const [tab, setTab] = useState<VfWorkTab>("now");
  const query = searchValue ?? localQuery;
  const items = useMemo(
    () => [
      ...events.map(vfMakeWorkItemFromEvent),
      ...openActions.map(vfMakeWorkItemFromAction),
      ...completedActions.map((action) => vfMakeWorkItemFromAction({ ...action, completed: true })),
    ],
    [events, openActions, completedActions],
  );
  const visibleItems = useMemo(() => vfFilterWorkItems(items, tab, query), [items, query, tab]);
  const counts: Record<VfWorkTab, number> = {
    now: vfFilterWorkItems(items, "now").length,
    events: vfFilterWorkItems(items, "events").length,
    actions: vfFilterWorkItems(items, "actions").length,
    done: vfFilterWorkItems(items, "done").length,
  };
  const mainFocus = vfFilterWorkItems(items, "now")[0];

  return (
    <section className="v19-ideal-work" aria-label="Работа агента">
      {mainFocus ? (
        <div className="v19-ideal-focus">
          <div><Dot tone={mainFocus.tone} /><strong>Главный фокус:</strong><span>{mainFocus.objectTitle} · {mainFocus.objectMeta || mainFocus.dueValue}</span></div>
          <button type="button" className="v19-ideal-focus-cta" onClick={() => onOpen(mainFocus.open)}><span>{mainFocus.cta}</span><Icon name="arrow" renderIcon={renderIcon} /></button>
          {onRoute ? <button type="button" onClick={() => onRoute("agent-submissions")}>Мои подачи</button> : null}
        </div>
      ) : null}

      <div className="v19-ideal-toolbar">
        <div className="v19-ideal-tabs" role="tablist" aria-label="Фильтр работы">
          {tabLabels.map((item) => (
            <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? "is-active" : ""} onClick={() => setTab(item.id)}>
              {item.label}<span>{counts[item.id]}</span>
            </button>
          ))}
        </div>
        <label className="v19-ideal-search">
          <span className="sr-only">Поиск по работе</span>
          <input
            type="search"
            value={query}
            placeholder="Поиск по работе"
            onChange={(event) => {
              setLocalQuery(event.currentTarget.value);
              onSearchChange?.(event.currentTarget.value);
            }}
          />
        </label>
      </div>

      <div className="v19-ideal-cols" aria-hidden="true">
        <span />
        <span>Работа</span>
        <span>Объект</span>
        <span>Срок</span>
        <span>Состояние</span>
        <span />
      </div>
      <div className="v19-ideal-list">
        {visibleItems.length ? visibleItems.map((item) => <WorkRow key={item.id} item={item} onOpen={onOpen} renderIcon={renderIcon} />) : (
          <div className="v19-ideal-empty"><strong>Очередь пуста</strong><span>Новые события и действия появятся после изменений в подачах.</span></div>
        )}
      </div>
    </section>
  );
}

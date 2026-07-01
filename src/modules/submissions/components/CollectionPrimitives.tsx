import {
  type ButtonHTMLAttributes,
  type Ref,
  type ReactNode,
  useId,
  useRef,
  useState,
} from "react";
import {
  Badge,
  BottomSheet,
  Button,
  CardComponent,
  IconButton,
  StatusTabs,
  TabCount,
} from "../../../shared/ui/primitives";
import { cn } from "../../../shared/ui/cn";
import {
  V19ProgressMeter,
  V19SubmissionCollectionRow,
  type V19BadgeTone,
} from "../../../shared/ui/v19-design-system";
import type { SubmissionStatus } from "../types";

type CollectionTab<T extends string> = {
  count?: number;
  id: T;
  label: string;
};

type CollectionToolbarProps<T extends string> = {
  activeFilters?: CollectionActiveFilter[];
  ariaLabel: string;
  cityControl?: ReactNode;
  className?: string;
  filterTabs?: ReactNode;
  filters?: ReactNode;
  mobileCityControl?: ReactNode;
  onClearActiveFilters?: () => void;
  onTabChange: (value: T) => void;
  search: ReactNode;
  tabs: Array<CollectionTab<T>>;
  tabsAriaLabel?: string;
  tools?: ReactNode;
  value: T;
};

export type CollectionActiveFilter =
  | string
  | {
      id: string;
      label: string;
      onRemove?: () => void;
    };

type SummaryFilterTone = "amber" | "danger" | "neutral";

type SummaryFilterTab<T extends string> = {
  count: number;
  disabled?: boolean;
  disabledReason?: string;
  id: T;
  label: string;
  note?: string;
  tone?: SummaryFilterTone;
};

export type MobileFilterOption<T extends string> = {
  count?: number;
  id: T;
  label: string;
};

export function CollectionToolbar<T extends string>({
  activeFilters = [],
  ariaLabel,
  cityControl,
  className,
  filterTabs,
  filters,
  mobileCityControl,
  onClearActiveFilters,
  onTabChange,
  search,
  tabs,
  tabsAriaLabel,
  tools = null,
  value,
}: CollectionToolbarProps<T>) {
  return (
    <>
      <div
        className={cn(
          "v19-collection-toolbar",
          tabs.length > 3 && "has-many-tabs",
          (cityControl != null || filters != null) && "has-control-stack",
          cityControl != null && "has-city-control",
          mobileCityControl != null && "has-mobile-city-control",
          filters != null && "has-filter-control",
          filterTabs != null && "has-filter-tabs",
          tools != null && "has-toolbar-tools",
          className,
        )}
        aria-label={ariaLabel}
      >
        <div className="v19-toolbar-primary-row">
          <ToolbarControlStack filters={filters} search={search} />
          {tools}
        </div>
        {filterTabs ? (
          <div className="v19-toolbar-filter-row">{filterTabs}</div>
        ) : null}
        <div className="v19-toolbar-secondary-row">
          <StatusTabs
            ariaLabel={tabsAriaLabel ?? "Состояние списка"}
            onValueChange={onTabChange}
            tabs={tabs}
            value={value}
          />
          {cityControl ? (
            <div className="v19-toolbar-city-slot">{cityControl}</div>
          ) : null}
          {mobileCityControl ? (
            <div className="v19-toolbar-city-slot v19-mobile-city-control">
              {mobileCityControl}
            </div>
          ) : null}
        </div>
      </div>

      {activeFilters.length ? (
        <ActiveFiltersRow
          filters={activeFilters}
          onClear={onClearActiveFilters}
        />
      ) : null}
    </>
  );
}

export function ListToolbar<T extends string>(props: CollectionToolbarProps<T>) {
  return <CollectionToolbar {...props} />;
}

function ActiveFiltersRow({
  filters,
  onClear,
}: {
  filters: CollectionActiveFilter[];
  onClear?: () => void;
}) {
  return (
    <div
      className="active-filters v19-active-filters"
      aria-label="Активные фильтры"
    >
      {filters.map((filter) => {
        const chip =
          typeof filter === "string"
            ? { id: filter, label: filter, onRemove: undefined }
            : filter;

        return (
          <span className="filter-chip" key={chip.id}>
            {chip.label}
            {chip.onRemove ? (
              <button
                aria-label={`Удалить фильтр ${chip.label}`}
                type="button"
                onClick={chip.onRemove}
              >
                <svg className="icon sm" aria-hidden="true" viewBox="0 0 24 24">
                  <path d="m6 6 12 12M18 6 6 18" />
                </svg>
              </button>
            ) : null}
          </span>
        );
      })}
      {onClear ? (
        <button
          className="btn ghost small v19-active-filters-reset"
          type="button"
          onClick={onClear}
        >
          Сбросить
        </button>
      ) : null}
    </div>
  );
}

export function ToolbarTools({ children = null }: { children?: ReactNode }) {
  return <div className="v19-toolbar-tools">{children}</div>;
}

export function MobileFilterSheet<T extends string>({
  label,
  onValueChange,
  options,
  title,
  value,
}: {
  label: string;
  onValueChange: (value: T) => void;
  options: Array<MobileFilterOption<T>>;
  title: string;
  value: T;
}) {
  const [open, setOpen] = useState(false);
  const sheetId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);

  function handleValueChange(nextValue: T) {
    onValueChange(nextValue);
    setOpen(false);
  }

  return (
    <div className="v19-mobile-filter">
      <ToolbarIconButton
        className="v19-mobile-filter-trigger"
        icon="filter"
        label={label}
        pressed={open}
        ref={triggerRef}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? sheetId : undefined}
        onClick={() => setOpen((current) => !current)}
      />
      <BottomSheet
        className="v19-mobile-filter-sheet"
        closeLabel="Закрыть фильтры"
        id={sheetId}
        open={open}
        title={title}
        onClose={() => setOpen(false)}
      >
        <div className="v19-mobile-filter-options">
          {options.map((option) => (
            <Button
              aria-pressed={value === option.id}
              className={cn(
                "v19-mobile-filter-choice",
                value === option.id && "is-active",
              )}
              key={option.id}
              variant="plain"
              onClick={() => handleValueChange(option.id)}
            >
              <span>{option.label}</span>
              {typeof option.count === "number" ? <em>{option.count}</em> : null}
            </Button>
          ))}
        </div>
      </BottomSheet>
    </div>
  );
}

function ToolbarControlStack({
  className,
  filters,
  search,
}: {
  className?: string;
  filters?: ReactNode;
  search: ReactNode;
}) {
  return (
    <div
      className={cn(
        "v19-toolbar-control-stack",
        filters != null && "has-filter-control",
        className,
      )}
    >
      {search}
      {filters}
    </div>
  );
}

export function SummaryFilterTabs<T extends string>({
  ariaLabel,
  onValueChange,
  tabs,
  value,
}: {
  ariaLabel: string;
  onValueChange: (value: T) => void;
  tabs: Array<SummaryFilterTab<T>>;
  value: T | null;
}) {
  return (
    <StatusSummaryStrip
      ariaLabel={ariaLabel}
      items={tabs.map((tab) => ({
        disabled: tab.disabled,
        disabledReason: tab.disabledReason,
        id: tab.id,
        label: tab.label,
        note: tab.note,
        tone: tab.tone,
        value: tab.count,
      }))}
      selectedId={value}
      onSelect={onValueChange}
    />
  );
}

export function StatusSummaryStrip<T extends string>({
  ariaLabel,
  items,
  selectedId = null,
  onSelect,
}: {
  ariaLabel: string;
  items: Array<{
    disabled?: boolean;
    disabledReason?: string;
    id: T;
    label: string;
    note?: string;
    tone?: SummaryFilterTone;
    value: number | string;
  }>;
  selectedId?: T | null;
  onSelect?: (value: T) => void;
}) {
  return (
    <div className="v19-summary-filters" aria-label={ariaLabel}>
      {items.map((item) => {
        const selected = selectedId === item.id;
        const tone = item.tone ?? "neutral";
        const disabledReasonId = item.disabledReason
          ? `summary-${item.id}-reason`
          : undefined;

        return (
          <Button
            aria-describedby={disabledReasonId}
            aria-pressed={selected}
            className={cn(
              "v19-summary-filter-tab",
              `tone-${tone}`,
              selected && "is-active",
            )}
            disabled={item.disabled}
            key={item.id}
            variant="plain"
            type="button"
            onClick={() => onSelect?.(item.id)}
          >
            <span>{item.label}</span>
            <TabCount>{item.value}</TabCount>
            {item.note ? <em>{item.note}</em> : null}
            {item.disabledReason ? (
              <small id={disabledReasonId}>{item.disabledReason}</small>
            ) : null}
          </Button>
        );
      })}
    </div>
  );
}

export const StatusSummaryGrid = StatusSummaryStrip;

export function CollectionGroupLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("v19-group-label", className)}>{children}</div>;
}

export type ToolbarIconName = "filter" | "panel" | "sort" | "view";

export function ToolbarIconButton({
  icon,
  label,
  pressed,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  icon: ToolbarIconName;
  label: string;
  pressed: boolean;
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <IconButton
      {...props}
      className={cn("v19-toolbar-icon", props.className)}
      icon={<ToolbarIcon icon={icon} />}
      label={label}
      pressed={pressed}
    />
  );
}

export function ContextPanel({
  children,
  className,
  footer,
  header,
  label,
}: {
  children: ReactNode;
  className?: string;
  footer?: ReactNode;
  header?: ReactNode;
  label: string;
}) {
  return (
    <CardComponent
      as="aside"
      className={cn("v19-context-panel", className)}
      aria-label={label}
    >
      {header}
      <div className="v19-context-panel-body">{children}</div>
      {footer ? <div className="v19-context-panel-footer">{footer}</div> : null}
    </CardComponent>
  );
}

export function ContextRail({
  children,
  className,
  footer,
  label,
  onClose,
  showHeader = true,
  title,
}: {
  children: ReactNode;
  className?: string;
  footer?: ReactNode;
  label: string;
  onClose: () => void;
  showHeader?: boolean;
  title: string;
}) {
  const header = showHeader ? (
    <div className="v19-rail-header">
      <div>
        <p className="kicker">{label}</p>
        <h2>{title}</h2>
      </div>
      <button
        className="v19-rail-close"
        type="button"
        aria-label="Скрыть контекст"
        onClick={onClose}
      >
        <SvgIcon>
          <path d="m6 6 12 12M18 6 6 18" />
        </SvgIcon>
      </button>
    </div>
  ) : null;

  return (
    <ContextPanel
      className={cn("v19-context-rail", className)}
      footer={footer}
      header={header}
      label={label}
    >
      {children}
    </ContextPanel>
  );
}

type PanelFooterAction = {
  disabled?: boolean;
  disabledReason?: string;
  label: string;
  variant?: "primary" | "secondary" | "ghost";
  onClick: () => void;
};

export function PanelActionFooter({
  primary,
  secondary,
  status,
}: {
  primary: PanelFooterAction;
  secondary?: PanelFooterAction | PanelFooterAction[];
  status?: ReactNode;
}) {
  const statusId = useId();
  const secondaryBaseReasonId = useId();
  const secondaryActions = Array.isArray(secondary)
    ? secondary
    : secondary
      ? [secondary]
      : [];
  const actions = [...secondaryActions, primary];
  const statusText = typeof status === "string" ? status.trim() : "";
  const disabledReasons = Array.from(
    new Set(
      actions
        .map((action) =>
          action.disabled && action.disabledReason
            ? action.disabledReason.trim()
            : "",
        )
        .filter((reason) => reason && reason !== statusText),
    ),
  );
  const reasonIds = new Map(
    disabledReasons.map((reason, index) => [
      reason,
      `${secondaryBaseReasonId}-${index}`,
    ]),
  );
  const describedBy = (action: PanelFooterAction) => {
    if (!action.disabled || !action.disabledReason) return undefined;
    const reason = action.disabledReason.trim();
    if (statusText && reason === statusText) return statusId;
    return reasonIds.get(reason);
  };

  return (
    <div className="v19-panel-action-footer">
      {status ? (
        <p className="v19-panel-action-status" id={statusId} role="status">
          {status}
        </p>
      ) : null}
      <div className="v19-panel-action-buttons">
        {secondaryActions.map((action) => (
          <Button
            aria-describedby={describedBy(action)}
            disabled={action.disabled}
            key={action.label}
            variant={action.variant ?? "secondary"}
            onClick={action.onClick}
          >
            {action.label}
          </Button>
        ))}
        <Button
          aria-describedby={describedBy(primary)}
          disabled={primary.disabled}
          variant={primary.variant ?? "primary"}
          onClick={primary.onClick}
        >
          {primary.label}
        </Button>
      </div>
      {disabledReasons.map((reason) => (
        <small id={reasonIds.get(reason)} key={reason}>
          {reason}
        </small>
      ))}
    </div>
  );
}

export function CollectionRow({
  action,
  badge,
  family,
  meta,
  onAction,
  passport,
  read,
  title,
  tone,
  trip,
}: {
  action: string;
  badge: string;
  family?: boolean;
  meta: ReactNode;
  onAction: () => void;
  passport: string;
  read: boolean;
  title: string;
  tone: "amber" | "blue" | "danger" | "muted" | "teal";
  trip: string;
}) {
  return (
    <div
      className={cn(
        "v19-event-row",
        read ? "is-read" : "is-unread",
        `tone-${tone}`,
      )}
    >
      <span className={cn("v19-event-tone-strip", `tone-${tone}`)} aria-hidden="true" />
      <span className="v19-unread-dot" aria-hidden="true" />
      <span className="v19-event-cell">
        <span
          className={cn(
            "v19-event-persona-icon",
            family ? "is-family" : "is-single",
          )}
          aria-hidden="true"
        >
          {family ? (
            <SvgIcon>
              <path d="M15.5 18.5v-1a3.5 3.5 0 0 0-7 0v1" />
              <circle cx="12" cy="8.5" r="3" />
              <path d="M20 18.5v-.8a3.1 3.1 0 0 0-2.3-3" />
              <path d="M16.9 5.8a2.8 2.8 0 0 1 0 5.4" />
              <path d="M4 18.5v-.8a3.1 3.1 0 0 1 2.3-3" />
              <path d="M7.1 5.8a2.8 2.8 0 0 0 0 5.4" />
            </SvgIcon>
          ) : (
            <SvgIcon>
              <path d="M18 20a6 6 0 0 0-12 0" />
              <circle cx="12" cy="8" r="4" />
              <path d="M18.5 8.5h2" />
              <path d="M19.5 7.5v2" />
            </SvgIcon>
          )}
        </span>
        <span className="v19-event-main">
          <strong>{title}</strong>
          <em className="sr-only">{meta}</em>
        </span>
      </span>
      <span className="v19-event-passport">{passport}</span>
      <span className="v19-event-trip">{trip}</span>
      <Badge tone={tone}>{badge}</Badge>
      <button
        className="v19-event-action"
        type="button"
        aria-label={`${action}: ${title}`}
        onClick={onAction}
      >
        {action}
      </button>
    </div>
  );
}

export function ActionRow({
  badges,
  context,
  cta,
  dueLabel,
  submissionId,
  onOpen,
  selected = false,
  severity,
  title,
}: {
  badges: Array<{
    label: string;
    tone: "amber" | "blue" | "danger" | "muted" | "teal";
  }>;
  context: ReactNode;
  cta: string;
  dueLabel: string;
  submissionId?: string;
  onOpen: () => void;
  selected?: boolean;
  severity: "blocker" | "info" | "ready" | "warning";
  title: string;
}) {
  return (
    <button
      className={cn(
        "v19-event-row",
        "v19-action-row",
        `severity-${severity}`,
        selected && "is-selected",
      )}
      aria-current={selected ? "true" : undefined}
      aria-label={`${cta}: ${title}. ${dueLabel}. ${context}`}
      data-submission-card={submissionId ? "" : undefined}
      data-submission-id={submissionId}
      type="button"
      onClick={onOpen}
    >
      <span className="v19-action-severity" aria-hidden="true" />
      <span className="v19-event-main">
        <span className="v19-action-row-kicker">
          <span>{dueLabel}</span>
          {submissionId ? <small>{submissionId}</small> : null}
        </span>
        <strong>{title}</strong>
        <em>{context}</em>
      </span>
      <span className="v19-action-badges">
        {badges.map((badge) => (
          <Badge key={`${badge.label}-${badge.tone}`} tone={badge.tone}>
            {badge.label}
          </Badge>
        ))}
      </span>
      <span className="v19-event-action">
        <span className="v19-event-action-label">{cta}</span>
        <SvgIcon>
          <path d="M9 6l6 6-6 6" />
        </SvgIcon>
      </span>
    </button>
  );
}

export function SubmissionCollectionRow({
  action,
  completeness,
  compact = false,
  extraTagCount = 0,
  extraTagLabel,
  fileDetail,
  fileState,
  fileTone,
  kind = "family",
  meta,
  onOpen,
  searchText,
  selected = false,
  status,
  statusDetail,
  statusLabel,
  submissionId,
  title,
  routeDetail,
  routeLabel,
  trip,
  tripDetail,
}: {
  action: string;
  completeness: string;
  compact?: boolean;
  extraTagCount?: number;
  extraTagLabel?: string;
  fileDetail?: string;
  fileState: string;
  fileTone: "amber" | "muted" | "teal";
  kind?: "family" | "single";
  meta?: ReactNode;
  onOpen: () => void;
  searchText?: string;
  selected?: boolean;
  status: SubmissionStatus;
  statusDetail?: string;
  statusLabel: string;
  submissionId: string;
  title: string;
  routeDetail?: string;
  routeLabel?: string;
  trip?: string;
  tripDetail?: string;
}) {
  return (
    <V19SubmissionCollectionRow
      action={action}
      compact={compact}
      completeness={completeness}
      extraTagCount={extraTagCount}
      extraTagLabel={extraTagLabel}
      fileDetail={fileDetail}
      fileState={fileState}
      fileTone={fileTone}
      kind={kind}
      meta={meta}
      routeDetail={routeDetail}
      routeLabel={routeLabel}
      onOpen={onOpen}
      searchText={searchText}
      selected={selected}
      statusClassName={status}
      statusDetail={statusDetail}
      statusLabel={statusLabel}
      statusTone={submissionStatusTone(status)}
      submissionId={submissionId}
      title={title}
      trip={trip}
      tripDetail={tripDetail}
    />
  );
}

export function ProgressMeter({
  ariaHidden = false,
  className,
  label,
  max = 100,
  tone = "accent",
  value,
}: {
  ariaHidden?: boolean;
  className?: string;
  label?: string;
  max?: number;
  tone?: "accent" | "danger" | "muted" | "success" | "warning";
  value: number;
}) {
  return (
    <V19ProgressMeter
      ariaHidden={ariaHidden}
      className={className}
      label={label}
      max={max}
      tone={tone}
      value={value}
    />
  );
}

function submissionStatusTone(
  status: SubmissionStatus,
): V19BadgeTone {
  if (status === "ready_for_export") return "teal";
  if (status === "exported") return "muted";
  if (status === "submitted_for_review") return "blue";
  if (status === "returned" || status === "requires_action") return "danger";
  if (status === "draft") return "muted";
  return "amber";
}

export function SvgIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      focusable="false"
      height="16"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width="16"
    >
      {children}
    </svg>
  );
}

function ToolbarIcon({ icon }: { icon: ToolbarIconName }) {
  if (icon === "filter") {
    return (
      <SvgIcon>
        <path d="M4 6h16" />
        <path d="M7 12h10" />
        <path d="M10 18h4" />
      </SvgIcon>
    );
  }

  if (icon === "view") {
    return (
      <SvgIcon>
        <path d="M4 6.5h16" />
        <path d="M4 12h16" />
        <path d="M4 17.5h16" />
      </SvgIcon>
    );
  }

  if (icon === "sort") {
    return (
      <SvgIcon>
        <path d="M8 5v14" />
        <path d="m5 16 3 3 3-3" />
        <path d="M16 19V5" />
        <path d="m13 8 3-3 3 3" />
      </SvgIcon>
    );
  }

  return (
    <SvgIcon>
      <rect x="3" y="4" width="18" height="16" rx="1" />
      <path d="M15 4v16" />
    </SvgIcon>
  );
}

import {
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  Badge,
  Button,
  CardComponent,
  IconButton,
  StateTabs,
  TabCount,
} from "../../../shared/ui/primitives";
import { cn } from "../../../shared/ui/cn";
import type { SubmissionStatus } from "../types";

type CollectionTab<T extends string> = {
  count?: number;
  id: T;
  label: string;
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
  id: T;
  label: string;
  tone?: SummaryFilterTone;
};

export function CollectionToolbar<T extends string>({
  activeFilters = [],
  ariaLabel,
  cityControl,
  className,
  filterTabs,
  filters,
  mobileCityControl,
  mobileTitle,
  onClearActiveFilters,
  onTabChange,
  search,
  tabs,
  tabsAriaLabel,
  tools = null,
  value,
}: {
  activeFilters?: CollectionActiveFilter[];
  ariaLabel: string;
  cityControl?: ReactNode;
  className?: string;
  filterTabs?: ReactNode;
  filters?: ReactNode;
  mobileCityControl?: ReactNode;
  mobileTitle?: string;
  onClearActiveFilters?: () => void;
  onTabChange: (value: T) => void;
  search: ReactNode;
  tabs: Array<CollectionTab<T>>;
  tabsAriaLabel?: string;
  tools?: ReactNode;
  value: T;
}) {
  return (
    <>
      <div
        className={cn(
          "v19-collection-toolbar",
          tabs.length > 3 && "has-many-tabs",
          (cityControl != null || filters != null) && "has-control-stack",
          cityControl != null && "has-city-control",
          filters != null && "has-filter-control",
          tools != null && "has-toolbar-tools",
          className,
        )}
        aria-label={ariaLabel}
      >
        {mobileTitle ? (
          <h2 className="v19-mobile-toolbar-title">{mobileTitle}</h2>
        ) : null}
        <StateTabs
          ariaLabel={tabsAriaLabel ?? "Состояние списка"}
          onValueChange={onTabChange}
          tabs={tabs}
          value={value}
        />
        <ToolbarControlStack
          cityControl={cityControl}
          filters={filters}
          mobileCityControl={mobileCityControl}
          search={search}
        />
        {tools}
      </div>

      {filterTabs ? (
        <div className="v19-toolbar-filter-row">{filterTabs}</div>
      ) : null}

      {activeFilters.length ? (
        <ActiveFiltersRow
          filters={activeFilters}
          onClear={onClearActiveFilters}
        />
      ) : null}
    </>
  );
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

function ToolbarControlStack({
  cityControl,
  className,
  filters,
  mobileCityControl,
  search,
}: {
  cityControl?: ReactNode;
  className?: string;
  filters?: ReactNode;
  mobileCityControl?: ReactNode;
  search: ReactNode;
}) {
  return (
    <div
      className={cn(
        "v19-toolbar-control-stack",
        cityControl != null && "has-city-control",
        filters != null && "has-filter-control",
        className,
      )}
    >
      {search}
      {filters}
      {cityControl}
      {mobileCityControl ? (
        <div className="v19-mobile-city-control">{mobileCityControl}</div>
      ) : null}
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
    <div className="v19-summary-filters" aria-label={ariaLabel}>
      {tabs.map((tab) => {
        const selected = value === tab.id;
        const tone = tab.tone ?? "neutral";

        return (
          <Button
            aria-pressed={selected}
            className={cn(
              "v19-summary-filter-tab",
              `tone-${tone}`,
              selected && "is-active",
            )}
            key={tab.id}
            variant="plain"
            type="button"
            onClick={() => onValueChange(tab.id)}
          >
            {tab.label} <TabCount>{tab.count}</TabCount>
          </Button>
        );
      })}
    </div>
  );
}

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
  label,
}: {
  children: ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <CardComponent
      as="aside"
      className={cn("v19-context-panel", className)}
      aria-label={label}
    >
      {children}
    </CardComponent>
  );
}

export function ContextRail({
  children,
  className,
  label,
  onClose,
  title,
}: {
  children: ReactNode;
  className?: string;
  label: string;
  onClose: () => void;
  title: string;
}) {
  return (
    <ContextPanel className={cn("v19-context-rail", className)} label={label}>
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
      {children}
    </ContextPanel>
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
      <button className="v19-event-action" type="button" onClick={onAction}>
        {action}
      </button>
    </div>
  );
}

export function ActionRow({
  badges,
  context,
  cta,
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
      type="button"
      onClick={onOpen}
    >
      <span className="v19-action-severity" aria-hidden="true" />
      <span className="v19-event-main">
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
      <span className="v19-event-action">{cta}</span>
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
  status,
  statusDetail,
  statusLabel,
  submissionId,
  title,
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
  status: SubmissionStatus;
  statusDetail?: string;
  statusLabel: string;
  submissionId: string;
  title: string;
  trip?: string;
  tripDetail?: string;
}) {
  return (
    <button
      className={cn(
        "v19-submission-row",
        compact ? "is-rail-compact" : "is-rail-full",
        (status === "returned" || status === "requires_action") && "is-attention",
      )}
      data-submission-card=""
      data-submission-id={submissionId}
      type="button"
      onClick={onOpen}
    >
      <span className="v19-event-main">
        <span className="v19-submission-kind-icon" aria-hidden="true">
          <SvgIcon>
            {kind === "family" ? (
              <>
                <path d="M16 21v-2a4 4 0 0 0-8 0v2" />
                <circle cx="12" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                <path d="M2 21v-2a4 4 0 0 1 3-3.87" />
                <path d="M8 3.13a4 4 0 0 0 0 7.75" />
              </>
            ) : (
              <>
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </>
            )}
          </SvgIcon>
        </span>
        <strong title={title}>{title}</strong>
        {searchText ? <span className="sr-only">{searchText}</span> : null}
        {meta ? <em>{meta}</em> : null}
      </span>
      {trip ? (
        <span className="v19-submission-trip">
          <strong title={trip}>{trip}</strong>
          {tripDetail ? <em>{tripDetail}</em> : null}
        </span>
      ) : null}
      <span className="v19-submission-status-tag" aria-label={`Статус: ${statusLabel}`}>
        <Badge
          className={cn(extraTagCount > 0 && "has-status-suffix")}
          tone={submissionStatusTone(status)}
        >
          {statusLabel}
          {extraTagCount > 0 ? (
            <span className="v19-status-chip-suffix">
              {extraTagLabel ?? `+${extraTagCount}`}
            </span>
          ) : null}
        </Badge>
        {statusDetail ? <em>{statusDetail}</em> : null}
      </span>
      {!compact ? (
        <span className="v19-submission-file-tag" aria-label={`Файлы: ${fileState}`}>
          <Badge tone={fileTone}>{fileState}</Badge>
          {fileDetail ? <em>{fileDetail}</em> : null}
        </span>
      ) : null}
      <span
        className="v19-submission-percent-tag"
        aria-label={`Готовность: ${completeness}`}
      >
        <ProgressCell value={completeness} />
      </span>
      <span
        className="v19-event-action"
        aria-label={`${action}: ${title}`}
        title={action}
      >
        <span className="v19-event-action-label">{action}</span>
        <SvgIcon>
          <path d="M9 6l6 6-6 6" />
        </SvgIcon>
      </span>
    </button>
  );
}

function ProgressCell({ value }: { value: string }) {
  const percent = Number.parseInt(value.replace("%", ""), 10);
  const safePercent = Number.isFinite(percent)
    ? Math.min(Math.max(percent, 0), 100)
    : 0;

  return (
    <span
      className={cn(
        "v19-progress-cell",
        safePercent === 100
          ? "is-complete"
          : safePercent <= 5
            ? "is-empty"
            : "is-partial",
      )}
      style={{ "--progress": `${safePercent}%` } as CSSProperties}
    >
      <span className="v19-progress-value">{value}</span>
      <span className="v19-progress-track" aria-hidden="true" />
    </span>
  );
}

function submissionStatusTone(
  status: SubmissionStatus,
): "amber" | "blue" | "danger" | "muted" | "teal" {
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

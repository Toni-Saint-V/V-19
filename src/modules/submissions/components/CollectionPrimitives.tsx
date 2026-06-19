import type { ButtonHTMLAttributes, ReactNode } from "react";
import {
  Badge,
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
  className,
  onTabChange,
  search,
  tabs,
  tools,
  value,
}: {
  activeFilters?: string[];
  ariaLabel: string;
  className?: string;
  onTabChange: (value: T) => void;
  search: ReactNode;
  tabs: Array<CollectionTab<T>>;
  tools: ReactNode;
  value: T;
}) {
  return (
    <>
      <div className={cn("v19-collection-toolbar", className)} aria-label={ariaLabel}>
        <StateTabs
          ariaLabel="Состояние событий"
          onValueChange={onTabChange}
          tabs={tabs}
          value={value}
        />
        {search}
        {tools}
      </div>

      {activeFilters.length ? (
        <div className="v19-active-filters" aria-label="Активные фильтры">
          {activeFilters.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
      ) : null}
    </>
  );
}

export function ToolbarTools({ children }: { children: ReactNode }) {
  return <div className="v19-toolbar-tools">{children}</div>;
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
          <button
            aria-pressed={selected}
            className={cn("v19-summary-filter-tab", `tone-${tone}`, selected && "is-active")}
            key={tab.id}
            type="button"
            onClick={() => onValueChange(tab.id)}
          >
            {tab.label} <TabCount>{tab.count}</TabCount>
          </button>
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

export function CollectionRow({
  action,
  badge,
  icon,
  meta,
  onOpen,
  read,
  title,
  tone,
}: {
  action: string;
  badge: string;
  icon: ReactNode;
  meta: ReactNode;
  onOpen: () => void;
  read: boolean;
  title: string;
  tone: "amber" | "blue" | "danger" | "muted" | "teal";
}) {
  return (
    <button
      className={cn("v19-event-row", read ? "is-read" : "is-unread")}
      type="button"
      onClick={onOpen}
    >
      <span className="v19-unread-dot" aria-hidden="true" />
      <span className={cn("v19-event-icon", `tone-${tone}`)} aria-hidden="true">
        {icon}
      </span>
      <span className="v19-event-main">
        <strong>{title}</strong>
        <em>{meta}</em>
      </span>
      <Badge tone={tone}>{badge}</Badge>
      <span className="v19-event-action">{action}</span>
    </button>
  );
}

export function ActionRow({
  badges,
  context,
  cta,
  onOpen,
  severity,
  title,
}: {
  badges: Array<{ label: string; tone: "amber" | "blue" | "danger" | "muted" | "teal" }>;
  context: ReactNode;
  cta: string;
  onOpen: () => void;
  severity: "blocker" | "info" | "ready" | "warning";
  title: string;
}) {
  return (
    <button
      className={cn("v19-event-row", "v19-action-row", `severity-${severity}`)}
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
  extraTagCount = 0,
  extraTagLabel,
  fileState,
  fileTone,
  meta,
  onOpen,
  searchText,
  status,
  statusLabel,
  submissionId,
  title,
}: {
  action: string;
  completeness: string;
  extraTagCount?: number;
  extraTagLabel?: string;
  fileState: string;
  fileTone: "amber" | "muted" | "teal";
  meta?: ReactNode;
  onOpen: () => void;
  searchText?: string;
  status: SubmissionStatus;
  statusLabel: string;
  submissionId: string;
  title: string;
}) {
  return (
    <button
      className="v19-submission-row"
      data-submission-card=""
      data-submission-id={submissionId}
      type="button"
      onClick={onOpen}
    >
      <span className={cn("v19-submission-dot", `status-${status}`)} aria-hidden="true" />
      <span className="v19-event-main">
        <strong title={title}>{title}</strong>
        {searchText ? <span className="sr-only">{searchText}</span> : null}
        {meta ? <em>{meta}</em> : null}
      </span>
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
      </span>
      <span className="v19-submission-file-tag" aria-label={`Файлы: ${fileState}`}>
        <Badge tone={fileTone}>{fileState}</Badge>
      </span>
      <span className="v19-submission-percent-tag" aria-label={`Готовность: ${completeness}`}>
        <Badge tone={completeness === "100%" ? "teal" : "muted"}>
          {completeness}
        </Badge>
      </span>
      <span className="v19-event-action" aria-label={`${action}: ${title}`} title={action}>
        <SvgIcon>
          <path d="M9 6l6 6-6 6" />
        </SvgIcon>
      </span>
    </button>
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
        <path d="m5 8 3-3 3 3" />
        <path d="M16 19V5" />
        <path d="m13 16 3 3 3-3" />
      </SvgIcon>
    );
  }

  return (
    <SvgIcon>
      <path d="M5 5h14v14H5V5Z" />
      <path d="M14 5v14" />
    </SvgIcon>
  );
}

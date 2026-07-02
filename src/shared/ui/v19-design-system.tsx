import {
  type ButtonHTMLAttributes,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Columns3,
  Folder,
  List,
  Search,
  User,
  Users,
} from "lucide-react";
import { motion } from "motion/react";
import { cn } from "./cn";
import { Badge } from "./primitives";

export type V19VisualTone = "blue" | "danger" | "green" | "indigo" | "warning";

export type V19EntityViewMode = "all" | "family" | "single";

export type V19ToolbarTab<T extends string> = {
  compactLabel?: string;
  count: number;
  id: T;
  label: string;
};

export type V19DrawerTab<T extends string> = {
  count?: number;
  id: T;
  isWarning?: boolean;
  label: string;
};

export type V19MemberStatusTone = "issue" | "progress" | "ready";

export type V19BadgeTone = "amber" | "blue" | "danger" | "muted" | "teal";

export type V19AiTriageTone =
  | "attention"
  | "critical"
  | "done"
  | "ready"
  | "waiting";

export type V19AiTriageSummary = {
  bandLabel: string;
  identityLabel: string;
  nextAction: string;
  score: number;
  tone: V19AiTriageTone;
};

export type V19SignalButtonTone =
  | "amber"
  | "black"
  | "blue"
  | "danger"
  | "green"
  | "muted";

export type V19FamilyMember = {
  initials: string;
  name: string;
  role: string;
  statusTone: V19MemberStatusTone;
};

export function V19SignalButton({
  active = false,
  ariaLabel,
  className,
  label,
  note,
  tone = "blue",
  value,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  ariaLabel: string;
  label: string;
  note: string;
  tone?: V19SignalButtonTone;
  value: number | string;
}) {
  return (
    <button
      {...props}
      aria-label={ariaLabel}
      aria-pressed={active}
      className={cn("v19-signal-button", `tone-${tone}`, active && "is-active", className)}
      type={props.type ?? "button"}
    >
      <span className="v19-signal-button-label">{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
      <span className="v19-signal-button-mark" aria-hidden="true" />
    </button>
  );
}

export function V19EntityTypeSwitch({
  actionLabel,
  allLabel = "Все",
  counts,
  familyLabel = "Семейные",
  onAction,
  onChange,
  singleLabel = "Одиночные",
  value,
}: {
  actionLabel?: string;
  allLabel?: string;
  counts: Record<V19EntityViewMode, number>;
  familyLabel?: string;
  onAction?: () => void;
  onChange: (value: V19EntityViewMode) => void;
  singleLabel?: string;
  value: V19EntityViewMode;
}) {
  const options: Array<{ icon: ReactNode; id: V19EntityViewMode; label: string }> = [
    {
      icon: <List aria-hidden="true" size={16} />,
      id: "all",
      label: allLabel,
    },
    {
      icon: <Users aria-hidden="true" size={16} />,
      id: "family",
      label: familyLabel,
    },
    {
      icon: <User aria-hidden="true" size={16} />,
      id: "single",
      label: singleLabel,
    },
  ];

  return (
    <div className="v19-entity-switchbar">
      <div className="v19-entity-switch" role="tablist" aria-label="Тип подачи">
        {options.map((option) => (
          <button
            aria-selected={value === option.id}
            className={value === option.id ? "is-active" : ""}
            key={option.id}
            role="tab"
            type="button"
            onClick={() => onChange(option.id)}
          >
            {option.icon}
            <span>{option.label}</span>
            <em>{counts[option.id]}</em>
          </button>
        ))}
      </div>
      {actionLabel && onAction ? (
        <button className="v19-entity-switch-action" type="button" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

function activateKeyboardCard(event: KeyboardEvent<HTMLElement>, action: () => void) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  action();
}

export function V19StatusDot({ tone }: { tone: V19VisualTone }) {
  return <span className={`vf-figma-dot vf-figma-dot-${tone}`} aria-hidden="true" />;
}

export function V19StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: V19VisualTone;
}) {
  return (
    <span className={`vf-figma-status is-${tone}`}>
      <V19ToneIcon tone={tone} />
      {label}
    </span>
  );
}

export function V19ToneIcon({
  size = 15,
  tone,
}: {
  size?: number;
  tone: V19VisualTone;
}) {
  if (tone === "green") return <CheckCircle2 aria-hidden="true" size={size} />;
  if (tone === "indigo" || tone === "blue") {
    return <Clock aria-hidden="true" size={size} />;
  }
  return <AlertCircle aria-hidden="true" size={size} />;
}

export function V19MemberStatusIcon({ tone }: { tone: V19MemberStatusTone }) {
  if (tone === "issue") {
    return <AlertCircle className="vf-figma-member-issue" aria-hidden="true" size={15} />;
  }

  if (tone === "progress") {
    return <span className="vf-figma-member-progress" aria-hidden="true" />;
  }

  return <CheckCircle2 className="vf-figma-member-ready" aria-hidden="true" size={15} />;
}

export function V19UnifiedToolbar<T extends string>({
  cityFilter,
  cityOptions,
  onCityFilter,
  onQuery,
  onTab,
  onViewMode,
  query,
  searchLabel,
  searchPlaceholder = "Поиск...",
  tabs,
  tabsLabel,
  value,
  viewMode,
}: {
  cityFilter: string;
  cityOptions: string[];
  onCityFilter: (city: string) => void;
  onQuery: (query: string) => void;
  onTab: (value: T) => void;
  onViewMode: (mode: "columns" | "list") => void;
  query: string;
  searchLabel: string;
  searchPlaceholder?: string;
  tabs: Array<V19ToolbarTab<T>>;
  tabsLabel: string;
  value: T;
  viewMode: "columns" | "list";
}) {
  function chooseViewMode(mode: "columns" | "list") {
    onViewMode(mode);
    window.requestAnimationFrame(() => {
      document.querySelector(".vf-figma-screen")?.scrollTo({ left: 0 });
    });
  }

  return (
    <div className="vf-figma-actions-toolbar">
      <div className="vf-figma-toolbar-topline">
        <div className="vf-figma-tabs" aria-label={tabsLabel} role="tablist">
          {tabs.map((tab) => (
            <button
              aria-label={tab.label}
              aria-selected={value === tab.id}
              className={value === tab.id ? "is-active" : ""}
              key={tab.id}
              role="tab"
              type="button"
              onClick={() => onTab(tab.id)}
            >
              <span className="vf-figma-tab-label vf-figma-tab-label-full">{tab.label}</span>
              <span aria-hidden="true" className="vf-figma-tab-label vf-figma-tab-label-compact">
                {tab.compactLabel ?? tab.label}
              </span>
              <span className="vf-figma-tab-badge">{tab.count}</span>
            </button>
          ))}
        </div>
        <label className="vf-figma-city-filter">
          <span className="sr-only">Город</span>
          <select
            className="vf-figma-city-select"
            value={cityFilter}
            onChange={(event) => onCityFilter(event.target.value)}
          >
            <option value="all">Все</option>
            {cityOptions.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="vf-figma-tools">
        <div className="vf-figma-search">
          <Search aria-hidden="true" size={20} />
          <input
            aria-label={searchLabel}
            placeholder={searchPlaceholder}
            type="search"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
          />
        </div>
        <div className="vf-figma-view-toggle" aria-label="Вид списка">
          <button
            aria-label="Показать списком"
            aria-pressed={viewMode === "list"}
            className={viewMode === "list" ? "is-active" : ""}
            title="Список"
            type="button"
            onClick={() => chooseViewMode("list")}
          >
            <List aria-hidden="true" size={16} />
            <span className="vf-figma-view-toggle-label">Список</span>
          </button>
          <button
            aria-label="Показать колонками"
            aria-pressed={viewMode === "columns"}
            className={viewMode === "columns" ? "is-active" : ""}
            title="Колонки"
            type="button"
            onClick={() => chooseViewMode("columns")}
          >
            <Columns3 aria-hidden="true" size={16} />
            <span className="vf-figma-view-toggle-label">Колонки</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function V19LongListCell({
  city,
  cta,
  dates,
  id,
  onOpen,
  peopleCount,
  peopleLabel,
  statusLabel,
  statusTone,
  title,
  triage,
  type,
  updated,
}: {
  city: string;
  cta: string;
  dates: string;
  id: string;
  onOpen: () => void;
  peopleCount: number;
  peopleLabel: string;
  statusLabel: string;
  statusTone: V19VisualTone;
  title: string;
  triage?: V19AiTriageSummary;
  type: "family" | "single";
  updated: string;
}) {
  return (
    <button
      aria-label={`Открыть подачу: ${title}, ${id}`}
      className={cn("vf-figma-action-row", triage && "has-ai-triage")}
      data-submission-id={id}
      type="button"
      onClick={onOpen}
    >
      <V19StatusDot tone={statusTone} />
      <span className="vf-figma-action-title">
        <strong>{title}</strong>
        <em>
          <span className="vf-figma-action-id">{id}</span>
          <span className="vf-figma-action-updated">Обновлено: {updated}</span>
        </em>
      </span>
      <span className="vf-figma-mobile-route">
        <strong>{city}</strong>
        <em>{dates}</em>
      </span>
      {type === "family" ? (
        <span className="vf-figma-mobile-people" aria-hidden="true">
          <Users aria-hidden="true" size={14} />
          {peopleCount}
        </span>
      ) : null}
      <span className="vf-figma-action-meta">
        <strong>{city}</strong>
        <em>
          {type === "family" ? (
            <Users aria-hidden="true" size={14} />
          ) : (
            <User aria-hidden="true" size={14} />
          )}
          {peopleLabel}
        </em>
      </span>
      <span className="vf-figma-action-dates">
        <strong>{dates}</strong>
        <em>Даты поездки</em>
      </span>
      {triage ? (
        <span
          className={`vf-figma-ai-triage tone-${triage.tone}`}
          data-ai-band={triage.tone}
        >
          <span className="vf-figma-ai-triage-score">
            <strong>{triage.score}</strong>
            <em>{triage.bandLabel}</em>
          </span>
          <span className="vf-figma-ai-triage-identity">
            {triage.identityLabel}
          </span>
          <span className="vf-figma-ai-triage-action">
            {triage.nextAction}
          </span>
        </span>
      ) : null}
      <span className="vf-figma-action-status">
        <V19StatusBadge label={statusLabel} tone={statusTone} />
      </span>
      <span className="vf-figma-open-button" aria-hidden="true">
        {cta}
      </span>
    </button>
  );
}

export function V19ActionBoardCard({
  blocker,
  city,
  dates,
  id,
  onOpen,
  peopleCount,
  progress,
  title,
  tone,
  type,
}: {
  blocker?: string;
  city: string;
  dates: string;
  id: string;
  onOpen: () => void;
  peopleCount: number;
  progress: number;
  title: string;
  tone: V19VisualTone;
  type: "family" | "single";
}) {
  const showRail = tone !== "blue";

  return (
    <button
      aria-label={`Открыть подачу: ${title}, ${id}`}
      className="vf-figma-column-card"
      data-submission-id={id}
      type="button"
      onClick={onOpen}
    >
      {showRail ? <span className={`vf-figma-card-rail is-${tone}`} /> : null}
      <span className="vf-figma-column-card-head">
        <span>{id}</span>
        <em>
          {type === "family" ? (
            <Users aria-hidden="true" size={12} />
          ) : (
            <User aria-hidden="true" size={12} />
          )}
          {peopleCount}
        </em>
      </span>
      <strong>{title}</strong>
      <span className="vf-figma-column-subline">
        {city} <i aria-hidden="true" /> {dates}
      </span>
      <span className="vf-figma-column-footer">
        {blocker ? (
          <span className={`is-${tone}`}>
            <V19ToneIcon tone={tone} />
            {blocker}
          </span>
        ) : (
          <>
            <progress
              aria-hidden="true"
              className={`v19-progress-track vf-figma-progress tone-${
                tone === "green" ? "success" : tone === "warning" ? "warning" : "accent"
              }`}
              max={100}
              value={Math.min(Math.max(progress, 0), 100)}
            />
            <em>{progress}%</em>
          </>
        )}
      </span>
    </button>
  );
}

export function V19SubmissionCollectionRow({
  action,
  compact = false,
  completeness,
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
  statusClassName,
  statusDetail,
  statusLabel,
  statusTone,
  submissionId,
  title,
  routeDetail,
  routeLabel,
  trip,
  tripDetail,
}: {
  action: string;
  compact?: boolean;
  completeness: string;
  extraTagCount?: number;
  extraTagLabel?: string;
  fileDetail?: string;
  fileState: string;
  fileTone: V19BadgeTone;
  kind?: "family" | "single";
  meta?: ReactNode;
  onOpen: () => void;
  searchText?: string;
  selected?: boolean;
  statusClassName: string;
  statusDetail?: string;
  statusLabel: string;
  statusTone: V19BadgeTone;
  submissionId: string;
  title: string;
  routeDetail?: string;
  routeLabel?: string;
  trip?: string;
  tripDetail?: string;
}) {
  const displayRouteLabel = routeLabel ?? trip;
  const displayRouteDetail = routeDetail ?? tripDetail ?? fileDetail;
  const mobilePrimaryDetail = displayRouteLabel;
  const mobileSecondaryDetail = displayRouteDetail;
  const accessibleDetails = [
    statusLabel,
    statusDetail,
    displayRouteLabel && displayRouteDetail
      ? `${displayRouteLabel}: ${displayRouteDetail}`
      : displayRouteLabel,
    fileDetail ? `Файлы: ${fileDetail}` : null,
    completeness ? `Готовность: ${completeness}` : null,
  ].filter(Boolean);

  return (
    <button
      aria-current={selected ? "true" : undefined}
      aria-label={`${action}: ${title}, ${submissionId}. ${accessibleDetails.join(". ")}`}
      className={cn(
        "v19-submission-row",
        compact ? "is-rail-compact" : "is-rail-full",
        `status-${statusClassName}`,
        (statusClassName === "returned" || statusClassName === "requires_action") &&
          "is-attention",
        selected && "is-selected",
      )}
      data-submission-card=""
      data-submission-id={submissionId}
      type="button"
      onClick={onOpen}
    >
      <span className="v19-mobile-summary-head" aria-hidden="true">
        <span className="v19-mobile-summary-id">{submissionId}</span>
        <span className="v19-mobile-summary-status">
          <Badge tone={statusTone}>{statusLabel}</Badge>
        </span>
      </span>
      <span className="v19-event-main">
        <span className="v19-submission-kind-icon" aria-hidden="true">
          <V19SvgIcon>
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
          </V19SvgIcon>
        </span>
        <strong title={title}>{title}</strong>
        {searchText ? <span className="sr-only">{searchText}</span> : null}
        {meta ? <em>{meta}</em> : null}
      </span>
      <span className="v19-mobile-summary-title">{title}</span>
      {displayRouteLabel ? (
        <span className="v19-submission-route">
          <strong title={displayRouteLabel}>{displayRouteLabel}</strong>
          {displayRouteDetail ? <em>{displayRouteDetail}</em> : null}
        </span>
      ) : null}
      <span className="v19-submission-status-tag" aria-label={`Статус: ${statusLabel}`}>
        <Badge
          className={cn(extraTagCount > 0 && "has-status-suffix")}
          tone={statusTone}
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
      <span className="v19-submission-progress-ring-cell">
        <V19CircularProgress value={completeness} />
      </span>
      <span
        aria-label={`${action}: ${title}`}
        className="v19-event-action"
        title={action}
      >
        <span className="v19-event-action-label">{action}</span>
        <V19SvgIcon>
          <path d="M9 6l6 6-6 6" />
        </V19SvgIcon>
      </span>
      <span className="v19-mobile-summary-foot" aria-hidden="true">
        <span className="v19-mobile-summary-route">
          {mobilePrimaryDetail ? <strong>{mobilePrimaryDetail}</strong> : null}
          {mobileSecondaryDetail ? <em>{mobileSecondaryDetail}</em> : null}
        </span>
        <span className="v19-mobile-summary-tail">
          <V19SvgIcon>
            <path d="M9 6l6 6-6 6" />
          </V19SvgIcon>
        </span>
      </span>
    </button>
  );
}

export function V19CircularProgress({ value }: { value: string }) {
  const percent = Number.parseInt(value.replace("%", ""), 10);
  const isPercentLabel = value.trim().endsWith("%") && Number.isFinite(percent);
  const safePercent = isPercentLabel ? Math.min(Math.max(percent, 0), 100) : 100;
  const style = {
    "--v19b-circular-progress": `${safePercent}%`,
  } as CSSProperties;

  return (
    <span
      aria-label={`Готовность: ${value}`}
      className={cn(
        "v19-circular-progress",
        !isPercentLabel
          ? "is-label"
          : safePercent === 100
            ? "is-complete"
            : safePercent <= 5
              ? "is-empty"
              : "is-partial",
      )}
      role="img"
      style={style}
    >
      <span>{isPercentLabel ? safePercent : value.replace("%", "")}</span>
    </span>
  );
}

export function V19ProgressCell({ value }: { value: string }) {
  const percent = Number.parseInt(value.replace("%", ""), 10);
  const isPercentLabel = value.trim().endsWith("%") && Number.isFinite(percent);
  const safePercent = isPercentLabel ? Math.min(Math.max(percent, 0), 100) : 100;

  return (
    <span
      className={cn(
        "v19-progress-cell",
        !isPercentLabel
          ? "is-label"
          : safePercent === 100
            ? "is-complete"
            : safePercent <= 5
              ? "is-empty"
              : "is-partial",
      )}
    >
      <span className="v19-progress-value">{value}</span>
      <V19ProgressMeter value={safePercent} ariaHidden />
    </span>
  );
}

export function V19ProgressMeter({
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
  const safeMax = Number.isFinite(max) && max > 0 ? max : 100;
  const safeValue = Number.isFinite(value)
    ? Math.min(Math.max(value, 0), safeMax)
    : 0;

  return (
    <progress
      aria-hidden={ariaHidden || label == null ? true : undefined}
      aria-label={label}
      className={cn("v19-progress-track", `tone-${tone}`, className)}
      max={safeMax}
      value={safeValue}
    />
  );
}

export function V19SvgIcon({ children }: { children: ReactNode }) {
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

export function V19DrawerHeader<T extends string>({
  activeTab,
  layoutId = "drawerActiveTab",
  meta,
  onTab,
  status,
  tabs,
  tabsRef,
  title,
}: {
  activeTab: T;
  layoutId?: string;
  meta: [string, string];
  onTab: (tab: T) => void;
  status: string;
  tabs: Array<V19DrawerTab<T>>;
  tabsRef?: RefObject<HTMLDivElement | null>;
  title: string;
}) {
  return (
    <header className="v19-figma-drawer-header">
      <div className="v19-figma-drawer-title-row">
        <div className="v19-figma-drawer-title-block">
          <div className="v19-figma-drawer-meta">
            <span>{meta[0]}</span>
            <span aria-hidden="true">·</span>
            <span>{meta[1]}</span>
            <span className="v19-figma-drawer-header-status">{status}</span>
          </div>
          <h2 className="v19-figma-drawer-heading">{title}</h2>
        </div>
      </div>

      <div className="v19-figma-drawer-tabs-scroll" ref={tabsRef}>
        <div className="v19-figma-drawer-tabs">
          {tabs.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                className={`v19-figma-drawer-tab ${isActive ? "is-active" : ""}`}
                data-drawer-tab={item.id}
                key={item.id}
                onClick={() => onTab(item.id)}
                type="button"
              >
                <span>{item.label}</span>
                {item.count && item.count > 0 ? (
                  <span className={item.isWarning ? "is-warning" : ""}>
                    {item.count}
                  </span>
                ) : null}
                {isActive ? (
                  <motion.div
                    className="v19-figma-drawer-active-tab"
                    initial={false}
                    layoutId={layoutId}
                    transition={{ bounce: 0.2, duration: 0.5, type: "spring" }}
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
}

export function V19FamilyProfileCard({
  ariaLabel,
  dataSubmissionId,
  footerLabel,
  members,
  onMemberOpen,
  onOpen,
  packageLabel,
  title,
  totalLabel,
}: {
  ariaLabel?: string;
  dataSubmissionId?: string;
  footerLabel: string;
  members: V19FamilyMember[];
  onMemberOpen?: () => void;
  onOpen?: () => void;
  packageLabel: string;
  title: string;
  totalLabel: string;
}) {
  return (
    <article
      aria-label={ariaLabel ?? `Открыть семейную подачу: ${title}`}
      className="vf-figma-family-card"
      data-submission-id={dataSubmissionId}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => activateKeyboardCard(event, () => onOpen?.())}
    >
      <span className="vf-figma-family-head">
        <span className="vf-figma-family-icon">
          <Users aria-hidden="true" size={26} />
        </span>
        <span>
          <strong>{title}</strong>
          <em>{totalLabel}</em>
        </span>
      </span>
      <span className="vf-figma-member-list">
        {members.map((member) => (
          <button
            aria-label={`Открыть заявителя: ${member.name}, ${title}`}
            className="vf-figma-member-row"
            key={`${member.name}-${member.role}`}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onMemberOpen?.();
            }}
          >
            <em>{member.initials}</em>
            <strong>{member.name}</strong>
            <small>{member.role}</small>
            <V19MemberStatusIcon tone={member.statusTone} />
          </button>
        ))}
      </span>
      <span className="vf-figma-family-footer">
        <span>{footerLabel}</span>
        <em>
          <Folder aria-hidden="true" size={17} />
          {packageLabel}
        </em>
      </span>
    </article>
  );
}

export function V19IndividualProfileCard({
  ariaLabel,
  dataSubmissionId,
  footerLabel,
  initials,
  onOpen,
  packageLabel,
  statusLabel,
  statusTone,
  title,
}: {
  ariaLabel?: string;
  dataSubmissionId?: string;
  footerLabel: string;
  initials: string;
  onOpen?: () => void;
  packageLabel: string;
  statusLabel: string;
  statusTone: V19MemberStatusTone;
  title: string;
}) {
  return (
    <button
      aria-label={ariaLabel ?? `Открыть заявителя: ${title}`}
      className="vf-figma-individual-card"
      data-submission-id={dataSubmissionId}
      type="button"
      onClick={onOpen}
    >
      <span className="vf-figma-avatar">{initials}</span>
      <span>
        <strong>{title}</strong>
        <em>
          <V19MemberStatusIcon tone={statusTone} />
          {statusLabel}
        </em>
      </span>
      <span className="vf-figma-family-footer">
        <span>{footerLabel}</span>
        <em>
          <Folder aria-hidden="true" size={17} />
          {packageLabel}
        </em>
      </span>
    </button>
  );
}

export function V19SectionEmpty({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <div className="vf-figma-column-card vf-figma-board-empty" role="status">
      <strong>{title}</strong>
      <span className="vf-figma-column-subline">{children}</span>
    </div>
  );
}

import {
  type ButtonHTMLAttributes,
  type CSSProperties,
  type InputHTMLAttributes,
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
  Sparkles,
  User,
  Users,
  X,
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

type V19DossierChipTone = "danger" | "muted" | "primary" | "success" | "warning";

export type V19DossierChip = {
  label: string;
  tone?: V19DossierChipTone;
};

export type V19DossierProgressItem = {
  label: string;
  tone?: "accent" | "danger" | "muted" | "success" | "warning";
  value: number;
};

function V19DossierMetaRow({ items }: { items?: string[] }) {
  const visibleItems = items?.filter(Boolean) ?? [];
  if (!visibleItems.length) return null;

  return (
    <span className="v19-dossier-meta-row">
      {visibleItems.map((item, index) => (
        <span key={`${item}-${index}`}>
          {index > 0 ? <i aria-hidden="true" /> : null}
          {item}
        </span>
      ))}
    </span>
  );
}

function V19DossierNextAction({ label }: { label?: string }) {
  if (!label) return null;

  return (
    <span className="v19-dossier-next-action">
      <small>Действие</small>
      <strong>{label}</strong>
    </span>
  );
}

function V19DossierProgress({ items }: { items?: V19DossierProgressItem[] }) {
  const visibleItems = items?.filter((item) => Number.isFinite(item.value)) ?? [];
  if (!visibleItems.length) return null;

  return (
    <span className="v19-dossier-progress-list">
      <small className="v19-dossier-progress-title">Готовность</small>
      {visibleItems.map((item) => (
        <span className="v19-dossier-progress-item" key={item.label}>
          <span>
            <small>{item.label}</small>
            <em>{Math.round(item.value)}%</em>
          </span>
          <V19ProgressMeter
            ariaHidden
            className="v19-dossier-progress"
            tone={item.tone}
            value={item.value}
          />
        </span>
      ))}
    </span>
  );
}

function V19DossierChips({ chips }: { chips?: V19DossierChip[] }) {
  const visibleChips = chips?.filter((chip) => chip.label.trim()) ?? [];
  if (!visibleChips.length) return null;

  return (
    <span className="v19-dossier-chip-row">
      {visibleChips.map((chip) => (
        <span
          className={cn("v19-dossier-chip", `tone-${chip.tone ?? "muted"}`)}
          key={`${chip.tone ?? "muted"}-${chip.label}`}
        >
          {chip.label}
        </span>
      ))}
    </span>
  );
}

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
    <div className="v19-entity-switchbar" data-entity-mode={value}>
      <div className="v19-entity-switch" role="tablist" aria-label="Тип подачи">
        {options.map((option) => (
          <button
            aria-label={option.label}
            aria-selected={value === option.id}
            className={value === option.id ? "is-active" : ""}
            key={option.id}
            role="tab"
            title={option.label}
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

export function V19ReadinessCard({
  description,
  detail,
  label = "AI readiness",
  scoreLabel,
  tone = "accent",
  value,
}: {
  description?: ReactNode;
  detail?: ReactNode;
  label?: ReactNode;
  scoreLabel: ReactNode;
  tone?: "accent" | "danger" | "muted" | "success" | "warning";
  value: number;
}) {
  return (
    <section className="v19-readiness-card" aria-label="Готовность подачи">
      <div className="v19-readiness-kicker">
        <Sparkles aria-hidden="true" size={14} />
        {label}
      </div>
      <div className="v19-readiness-score-row">
        <strong>{scoreLabel}</strong>
        {detail != null ? <span>{detail}</span> : null}
      </div>
      <div className="v19-readiness-track">
        <V19ProgressMeter
          ariaHidden
          className="v19-readiness-progress-meter"
          tone={tone}
          value={value}
        />
      </div>
      {description != null ? <p>{description}</p> : null}
    </section>
  );
}

export function V19SearchField({
  className,
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
}) {
  return (
    <label className={cn("v19-search-field", className)}>
      <span className="sr-only">{label}</span>
      <Search aria-hidden="true" size={16} />
      <input {...props} type={props.type ?? "search"} />
    </label>
  );
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
  testId,
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
  testId?: string;
  title: string;
  triage?: V19AiTriageSummary;
  type: "family" | "single";
  updated: string;
}) {
  return (
    <button
      aria-label={`Открыть подачу: ${title}, ${id}`}
      className={cn("vf-figma-action-row", triage && "has-ai-triage")}
      data-people-count={peopleCount}
      data-submission-id={id}
      data-testid={testId}
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
      <span className="vf-figma-mobile-people" aria-hidden="true">
        {type === "family" ? (
          <Users aria-hidden="true" size={14} />
        ) : (
          <User aria-hidden="true" size={14} />
        )}
        {peopleLabel}
      </span>
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
  operationalDetails = [],
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
  operationalDetails?: Array<{ label: string; value: string }>;
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
    ...operationalDetails.map((detail) => `${detail.label}: ${detail.value}`),
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
      {operationalDetails.length ? (
        <span className="v19-submission-operational-lines">
          {operationalDetails.map((detail) => (
            <span key={`${detail.label}-${detail.value}`}>
              <strong>{detail.label}</strong>
              <em>{detail.value}</em>
            </span>
          ))}
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
      {operationalDetails.length ? (
        <span className="v19-mobile-summary-details">
          {operationalDetails.map((detail) => (
            <span key={`mobile-${detail.label}-${detail.value}`}>
              <strong>{detail.label}</strong>
              <em>{detail.value}</em>
            </span>
          ))}
        </span>
      ) : null}
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
  closeLabel = "Закрыть подачу",
  layoutId = "drawerActiveTab",
  meta,
  onClose,
  onTab,
  status,
  statusTone,
  tabs,
  tabsRef,
  title,
  updated,
}: {
  activeTab: T;
  closeLabel?: string;
  layoutId?: string;
  meta: [string, string];
  onClose?: () => void;
  onTab: (tab: T) => void;
  status: string;
  statusTone?: "danger" | "neutral";
  tabs: Array<V19DrawerTab<T>>;
  tabsRef?: RefObject<HTMLDivElement | null>;
  title: string;
  updated?: string;
}) {
  return (
    <header className="v19-figma-drawer-header">
      <div className="v19-figma-drawer-title-row">
        <div className="v19-figma-drawer-title-block">
          <div className="v19-figma-drawer-meta">
            <span>{meta[0]}</span>
            <span aria-hidden="true">·</span>
            <span>{meta[1]}</span>
          </div>
          <h2 className="v19-figma-drawer-heading">{title}</h2>
          <div className="v19-figma-drawer-status-row">
            <span
              className="v19-figma-drawer-header-status"
              data-status-tone={statusTone}
            >
              {status}
            </span>
            {updated ? (
              <span className="v19-figma-drawer-updated">
                <Clock aria-hidden="true" size={12} />
                Обновлено {updated}
              </span>
            ) : null}
          </div>
        </div>
        {onClose ? (
          <button
            aria-label={closeLabel}
            className="v19-figma-drawer-close"
            type="button"
            onClick={onClose}
          >
            <X aria-hidden="true" size={20} />
          </button>
        ) : null}
      </div>

      <div className="v19-figma-drawer-tabs-scroll" ref={tabsRef}>
        <div className="v19-figma-drawer-tabs" role="tablist" aria-label="Разделы подачи">
          {tabs.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                aria-selected={isActive}
                className={`v19-figma-drawer-tab ${isActive ? "is-active" : ""}`}
                data-drawer-tab={item.id}
                key={item.id}
                onClick={() => onTab(item.id)}
                role="tab"
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
  chips,
  dataSubmissionId,
  footerActivityLabel,
  footerLabel,
  members,
  metaItems,
  nextActionLabel,
  onMemberOpen,
  onOpen,
  packageLabel,
  progressItems,
  title,
  totalLabel,
}: {
  ariaLabel?: string;
  chips?: V19DossierChip[];
  dataSubmissionId?: string;
  footerActivityLabel?: string;
  footerLabel: string;
  members: V19FamilyMember[];
  metaItems?: string[];
  nextActionLabel?: string;
  onMemberOpen?: () => void;
  onOpen?: () => void;
  packageLabel: string;
  progressItems?: V19DossierProgressItem[];
  title: string;
  totalLabel: string;
}) {
  return (
    <article
      aria-label={ariaLabel ?? `Открыть семейную подачу: ${title}`}
      className="vf-figma-family-card v19-dossier-card"
      data-submission-id={dataSubmissionId}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => activateKeyboardCard(event, () => onOpen?.())}
    >
      <V19DossierMetaRow items={metaItems} />
      <span className="vf-figma-family-footer">
        <span>{footerActivityLabel ?? footerLabel}</span>
        <em>
          <Folder aria-hidden="true" size={17} />
          {packageLabel}
        </em>
      </span>
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
      <V19DossierProgress items={progressItems} />
      <V19DossierChips chips={chips} />
      <V19DossierNextAction label={nextActionLabel} />
    </article>
  );
}

export function V19IndividualProfileCard({
  ariaLabel,
  chips,
  dataSubmissionId,
  footerActivityLabel,
  footerLabel,
  initials,
  metaItems,
  nextActionLabel,
  onOpen,
  packageLabel,
  progressItems,
  statusLabel,
  statusTone,
  title,
}: {
  ariaLabel?: string;
  chips?: V19DossierChip[];
  dataSubmissionId?: string;
  footerActivityLabel?: string;
  footerLabel: string;
  initials: string;
  metaItems?: string[];
  nextActionLabel?: string;
  onOpen?: () => void;
  packageLabel: string;
  progressItems?: V19DossierProgressItem[];
  statusLabel: string;
  statusTone: V19MemberStatusTone;
  title: string;
}) {
  return (
    <button
      aria-label={ariaLabel ?? `Открыть заявителя: ${title}`}
      className="vf-figma-individual-card v19-dossier-card"
      data-submission-id={dataSubmissionId}
      type="button"
      onClick={onOpen}
    >
      <V19DossierMetaRow items={metaItems} />
      <span className="vf-figma-family-footer">
        <span>{footerActivityLabel ?? footerLabel}</span>
        <em>
          <Folder aria-hidden="true" size={17} />
          {packageLabel}
        </em>
      </span>
      <span className="vf-figma-avatar">{initials}</span>
      <span>
        <strong>{title}</strong>
        <em>
          <V19MemberStatusIcon tone={statusTone} />
          {statusLabel}
        </em>
      </span>
      <V19DossierProgress items={progressItems} />
      <V19DossierChips chips={chips} />
      <V19DossierNextAction label={nextActionLabel} />
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

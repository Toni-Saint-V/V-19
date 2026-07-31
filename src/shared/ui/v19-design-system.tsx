import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ComponentPropsWithoutRef,
  type ElementType,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import {
  AlertCircle,
  CalendarRange,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Columns3,
  FileCheck2,
  Filter,
  Flame,
  Folder,
  List,
  MapPin,
  Menu,
  FileText,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  Users,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import visaflowLogo from "../../assets/v-logo-premium-black-style.webp";
import { cn } from "./cn";
import { Badge, Button, IconButton } from "./primitives";

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

export type V19AiTriageTone = "attention" | "critical" | "done" | "ready" | "waiting";

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

export type V19MetricTone = "danger" | "green" | "neutral";

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
      className={cn(
        "v19-signal-button",
        `tone-${tone}`,
        active && "is-active",
        className,
      )}
      type={props.type ?? "button"}
    >
      <span className="v19-signal-button-label">{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
      <span className="v19-signal-button-mark" aria-hidden="true" />
    </button>
  );
}

export type V19SurfaceIcon = ElementType;

type V19QueueCardProps<T extends ElementType> = {
  as?: T;
  className?: string;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "className">;

/**
 * Shared interactive surface for operational queue items. Layout and content
 * stay screen-specific; border, radius, focus and interaction state stay here.
 */
export function V19QueueCard<T extends ElementType = "div">({
  as,
  className,
  ...props
}: V19QueueCardProps<T>) {
  const Component = as ?? "div";

  return <Component {...props} className={cn("v19-queue-card", className)} />;
}

/**
 * Shared application navigation surface. Role-specific navigation stays in the
 * shell adapter; the responsive drawer surface is owned by the design system.
 */
export type V19SideMenuMode = "regular" | "compact";
export type V19SideMenuTone = "default" | "danger" | "warning" | "success";
export type V19SideMenuRole = "admin" | "agent";
export type V19SideMenuItem = {
  active?: boolean;
  count?: number;
  disabled?: boolean;
  icon: string;
  id: string;
  interactionId?: string;
  label: string;
  meta: string;
  onClick: () => void;
  quickAction?: string;
  tone?: V19SideMenuTone;
};

export const v19SideMenuId = "v19-operational-side-menu";
export const v19SideMenuDesktopMinWidth = 1025;

export type V19SideMenuProps = {
  ariaLabel: string;
  className?: string;
  createAction?: { active?: boolean; label: string; onClick: () => void };
  displayMode: V19SideMenuMode;
  inactive?: boolean;
  items: V19SideMenuItem[];
  mobileCloseLabel?: string;
  mobileOpen: boolean;
  mobileTitle: string;
  onCommandSearch?: () => void;
  onCloseMobile: () => void;
  onResetWorkspace: () => void | Promise<void>;
  role: V19SideMenuRole;
  sessionDisplayName: string;
  sessionInitials: string;
  sessionRoleLabel: string;
  sidebarId?: string;
};

export function V19SideMenu({
  ariaLabel,
  className,
  createAction,
  displayMode,
  inactive = false,
  items,
  mobileCloseLabel = "Закрыть меню",
  mobileOpen,
  mobileTitle,
  onCommandSearch,
  onCloseMobile,
  onResetWorkspace,
  role,
  sessionDisplayName,
  sessionInitials,
  sessionRoleLabel,
  sidebarId,
}: V19SideMenuProps) {
  const signOutPendingRef = useRef(false);
  const reduceMotion = useReducedMotion();
  const [signOutPending, setSignOutPending] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const menuItems =
    role === "agent" &&
    createAction &&
    !items.some((item) => item.id === "agent-create")
      ? [
          ...items.slice(0, 2),
          {
            active: createAction.active,
            icon: "+",
            id: "agent-create",
            interactionId: "shell.create-submission",
            label: createAction.label,
            meta: "Создание подачи",
            onClick: createAction.onClick,
          },
          ...items.slice(2),
        ]
      : items;
  const navItems = menuItems.map((item) => ({
    ...item,
    onClick: () => {
      item.onClick();
      onCloseMobile();
    },
  }));
  const id = sidebarId ?? v19SideMenuId;
  const settingsItem = items.find((item) => item.id.includes("settings"));

  const handleSignOut = async () => {
    if (signOutPendingRef.current) return;
    signOutPendingRef.current = true;
    setSignOutPending(true);
    setSignOutError("");
    try {
      await onResetWorkspace();
      onCloseMobile();
    } catch {
      setSignOutError("Не удалось выйти из аккаунта. Повторите попытку.");
    } finally {
      signOutPendingRef.current = false;
      setSignOutPending(false);
    }
  };

  return (
    <>
      <motion.aside
        animate={{
          "--v19-side-menu-motion-opacity": mobileOpen ? 1 : 0,
          "--v19-side-menu-motion-x": mobileOpen ? "0%" : "-100%",
        }}
        aria-hidden={inactive ? "true" : undefined}
        aria-label={ariaLabel}
        aria-modal={mobileOpen ? "true" : undefined}
        className={cn(
          "v19-ds-side-menu ops-sidebar opsu-sidebar",
          `is-${displayMode}`,
          className,
        )}
        data-open={mobileOpen ? "true" : "false"}
        data-side-menu-mode={displayMode}
        data-v19-component="side-menu"
        id={id}
        inert={inactive ? true : undefined}
        initial={false}
        role={mobileOpen ? "dialog" : undefined}
        transition={
          reduceMotion ? { duration: 0 } : { duration: 0.26, ease: [0.22, 1, 0.36, 1] }
        }
      >
        <div className="ops-mobile-screen-title" aria-label={mobileTitle}>
          <strong>{mobileTitle}</strong>
          <span aria-hidden="true">VF</span>
        </div>
        <div className="ops-brand opsu-brand flex items-center gap-2.5 px-2 pb-4 mb-2">
          <img
            src={visaflowLogo}
            alt="VisaFlow"
            className="ops-brand-logo h-8 w-8 shrink-0 rounded-lg object-cover"
          />
          <div className="ops-brand-copy opsu-brand-copy flex-1 min-w-0">
            <strong className="opsu-wordmark vf-brand-wordmark text-sm font-semibold tracking-tight">
              VisaFlow V-19
            </strong>
            <small className="v19-ds-side-menu-subtitle text-[11px] text-white/50">
              {role === "agent" ? "Кабинет агента" : "Кабинет администратора"}
            </small>
          </div>
          <IconButton
            className="ops-mobile-close opsu-mobile-close"
            icon={
              <X aria-hidden="true" focusable="false" size={18} strokeWidth={1.9} />
            }
            label={mobileCloseLabel}
            data-v19-interaction-id={
              role === "agent" ? "shell.toggle-mobile-menu" : undefined
            }
            onClick={onCloseMobile}
          />
        </div>
        <button
          data-v19-interaction-id={
            role === "agent" ? "shell.open-command-palette" : undefined
          }
          className="ops-sidebar-search"
          type="button"
          aria-label="Открыть командную палитру"
          onClick={onCommandSearch}
        >
          <Search aria-hidden="true" focusable="false" size={16} strokeWidth={1.8} />
          <span>Поиск...</span>
          <kbd>⌘K</kbd>
        </button>
        <nav className="ops-nav opsu-nav" aria-label="Операционные разделы">
          <span className="ops-nav-group-label">Работа</span>
          {navItems.map((item, index) => (
            <Button
              aria-current={item.active ? "page" : undefined}
              aria-label={item.label}
              className={cn(
                "ops-nav-item opsu-nav-item v19-agent-sidebar-nav-item",
                item.active && "is-active",
                item.tone && `tone-${item.tone}`,
              )}
              data-nav-id={item.id}
              data-v19-interaction-id={item.interactionId}
              disabled={item.disabled}
              key={item.id}
              variant="ghost"
              onClick={item.onClick}
            >
              <span
                className={cn(
                  "ops-nav-icon opsu-nav-icon v19-agent-sidebar-nav-icon",
                  item.active && "is-active",
                )}
                aria-hidden="true"
              >
                <V19SideMenuIcon index={index} fallback={item.icon} />
              </span>
              <span className="ops-nav-copy opsu-nav-copy">
                <strong>{item.label}</strong>
              </span>
              {typeof item.count === "number" ? (
                <span
                  className={cn(
                    "ops-nav-count v19-agent-sidebar-nav-count",
                    item.active && "is-active",
                  )}
                  aria-label={`${item.count}`}
                >
                  {item.count}
                </span>
              ) : null}
              {item.quickAction ? (
                <em className="ops-nav-action opsu-nav-action">{item.quickAction}</em>
              ) : null}
            </Button>
          ))}
        </nav>
        <div className="ops-sidebar-footer opsu-sidebar-footer">
          <Button
            data-v19-interaction-id={
              role === "agent" ? "shell.navigate-settings" : undefined
            }
            className="ops-session v19-ds-side-menu-profile v19-agent-sidebar-profile"
            aria-label="Открыть профиль"
            variant="ghost"
            onClick={() => {
              settingsItem?.onClick();
              onCloseMobile();
            }}
          >
            <span className="v19-agent-sidebar-avatar">{sessionInitials}</span>
            <div>
              <strong>{sessionDisplayName}</strong>
              <small className="v19-agent-sidebar-profile-meta">
                {sessionRoleLabel}
              </small>
            </div>
            <SlidersHorizontal
              className="ops-user-more v19-agent-sidebar-profile-icon"
              aria-hidden="true"
            />
          </Button>
          {signOutError ? (
            <p
              className="m-0 px-2 text-[12px] leading-snug text-[var(--v19b-status-danger-text)]"
              role="alert"
            >
              {signOutError}
            </p>
          ) : null}
          <Button
            data-v19-interaction-id={role === "agent" ? "shell.sign-out" : undefined}
            className="v19-ds-side-menu-signout"
            aria-label="Выйти"
            aria-busy={signOutPending || undefined}
            disabled={signOutPending}
            variant="secondary"
            onClick={() => void handleSignOut()}
          >
            {signOutPending ? "Выходим…" : "Выйти"}
          </Button>
        </div>
      </motion.aside>
      <AnimatePresence initial={false}>
        {mobileOpen ? (
          <motion.button
            animate={{ opacity: 1 }}
            aria-controls={id}
            aria-label="Закрыть меню"
            className="ops-mobile-menu-backdrop"
            data-v19-interaction-id={
              role === "agent" ? "shell.toggle-mobile-menu" : undefined
            }
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }
            }
            type="button"
            onClick={onCloseMobile}
          />
        ) : null}
      </AnimatePresence>
    </>
  );
}

const v19SideMenuSlotIcons: LucideIcon[] = [Menu, FileText, Users, SlidersHorizontal];

function V19SideMenuIcon({ fallback, index }: { fallback: string; index: number }) {
  const Icon = v19SideMenuSlotIcons[index];
  if (!Icon) return <span>{fallback}</span>;
  return <Icon aria-hidden="true" focusable="false" size={17} strokeWidth={1.8} />;
}

export function V19OperationalCardGrid({
  className,
  ...props
}: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      {...props}
      className={cn("v19-operational-card-grid", className)}
      data-v19-component="operational-card-grid"
    />
  );
}

export function V19OperationalProgressLine({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <span className="v19-operational-progress-line">
      <span>
        <span>{label}</span>
        <span>{value}%</span>
      </span>
      <span aria-hidden="true">
        <span style={{ width: `${value}%` }} />
      </span>
    </span>
  );
}

type V19OperationalCardProps<T extends ElementType> = V19QueueCardProps<T> & {
  actionIcon?: ElementType;
  actionLabel?: string;
  actionText: string;
  city?: string;
  footer?: ReactNode;
  metaDetail?: string;
  peopleCount: number;
  progress?: ReactNode;
  publicId: string;
  queuePosition?: number;
  shellDetail?: string;
  shellIcon?: ElementType;
  shellLabel?: string;
  shellMeta?: string;
  title: string;
  tripDates?: string;
};

/**
 * Canonical two-surface queue card used by both agent actions and admin review.
 * The shared layer owns identity, the inset next-action surface and shell;
 * screen-specific progress and footer signals are supplied as slots.
 */
export function V19OperationalCard<T extends ElementType = "button">({
  actionIcon: ActionIcon = FileCheck2,
  actionLabel = "Следующий шаг",
  actionText,
  as,
  city,
  className,
  footer,
  metaDetail,
  peopleCount,
  progress,
  publicId,
  queuePosition,
  shellDetail,
  shellIcon: ShellIcon = FileCheck2,
  shellLabel = "Задача",
  shellMeta,
  title,
  tripDates,
  ...props
}: V19OperationalCardProps<T>) {
  const Component = as ?? "button";

  return (
    <Component
      {...props}
      className={cn("v19-queue-card", "v19-operational-card", className)}
      data-v19-component="operational-card"
    >
      <span className="v19-operational-card-shell-header">
        <span className="v19-operational-card-shell-heading">
          <span className="v19-operational-card-shell-icon" aria-hidden="true">
            <ShellIcon />
          </span>
          <span>
            <strong>{shellLabel}</strong>
            {shellDetail ? <small>{shellDetail}</small> : null}
          </span>
        </span>
        {shellMeta ? (
          <span className="v19-operational-card-shell-meta">{shellMeta}</span>
        ) : null}
      </span>

      <span className="v19-operational-card-body">
        <span className="v19-operational-card-header">
          <span className="v19-operational-card-identity">
            <span className="v19-operational-card-meta">
              {queuePosition ? (
                <span
                  aria-label={`Позиция в очереди: ${queuePosition}`}
                  className="v19-operational-card-sequence"
                >
                  {queuePosition}
                </span>
              ) : null}
              <span className="v19-operational-card-id v19-admin-review-card-id">
                {publicId}
              </span>
              <i aria-hidden="true" />
              <span className="v19-operational-card-people">
                {peopleCount > 1 ? (
                  <UsersRound aria-hidden="true" />
                ) : (
                  <UserRound aria-hidden="true" />
                )}
                <span>{peopleCount} чел.</span>
              </span>
              {metaDetail ? <i aria-hidden="true" /> : null}
              {metaDetail ? <span>{metaDetail}</span> : null}
            </span>
            <strong className="v19-operational-card-title" title={title}>
              {title}
            </strong>
          </span>
          {city || tripDates ? (
            <span className="v19-operational-card-route">
              {city ? (
                <span className="v19-operational-card-location">
                  <MapPin aria-hidden="true" />
                  <span>{city}</span>
                </span>
              ) : null}
              <V19SubmissionTripDates dates={tripDates} />
            </span>
          ) : null}
        </span>

        <span className="v19-operational-card-action">
          <span aria-hidden="true">
            <ActionIcon />
          </span>
          <span>
            <small>{actionLabel}</small>
            <strong>{actionText}</strong>
          </span>
        </span>

        {progress ? (
          <span className="v19-operational-card-progress">{progress}</span>
        ) : null}
        {footer ? <span className="v19-operational-card-footer">{footer}</span> : null}
        <span className="v19-operational-card-open" aria-hidden="true">
          <ChevronRight />
        </span>
      </span>
    </Component>
  );
}

export function V19SubmissionIdentity({
  city,
  className,
  peopleCount,
  publicId,
  title,
  tripDates,
}: {
  city?: string;
  className?: string;
  peopleCount: number;
  publicId: string;
  title: string;
  tripDates?: string;
}) {
  return (
    <span
      className={cn("v19-submission-identity", className)}
      data-v19-component="submission-identity"
    >
      <span className="v19-submission-identity-tags">
        <span className="v19-submission-identity-id">{publicId}</span>
        {peopleCount > 1 ? (
          <>
            <span aria-hidden="true" className="v19-submission-identity-separator">
              ·
            </span>
            <span
              aria-label={`Количество человек: ${peopleCount}`}
              className="v19-submission-identity-people"
            >
              <UsersRound aria-hidden="true" />
              <span>{peopleCount}</span>
            </span>
          </>
        ) : null}
      </span>
      <strong className="v19-submission-identity-title" title={title}>
        {title}
      </strong>
      {city || tripDates ? (
        <span className="v19-submission-identity-route">
          <V19SubmissionCity city={city} />
          <V19SubmissionTripDates dates={tripDates} />
        </span>
      ) : null}
    </span>
  );
}

export function V19SubmissionCity({
  city,
  className,
}: {
  city?: string;
  className?: string;
}) {
  if (!city) return null;

  return (
    <span className={cn("v19-submission-identity-city", className)}>
      <MapPin aria-hidden="true" />
      <span>{city}</span>
    </span>
  );
}

export function V19SubmissionTripDates({
  className,
  dates,
}: {
  className?: string;
  dates?: string;
}) {
  if (!dates) return null;

  return (
    <span className={cn("v19-submission-trip-dates", className)}>
      <CalendarRange aria-hidden="true" />
      <span>{dates}</span>
    </span>
  );
}

export function V19MetricStrip({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("v19-metric-strip", className)}
      data-v19-component="operational-metrics"
    >
      {children}
    </div>
  );
}

export function V19MetricCard({
  active = false,
  detail,
  icon,
  interactionId,
  label,
  onClick,
  tone = "neutral",
  value,
}: {
  active?: boolean;
  detail?: ReactNode;
  icon: V19SurfaceIcon;
  interactionId?: string;
  label: string;
  onClick?: () => void;
  tone?: string;
  value: ReactNode;
}) {
  const mappedTone: V19MetricTone =
    tone === "green" ? "green" : tone === "red" ? "danger" : "neutral";
  const Icon = icon;
  const content = (
    <>
      <span className="v19-metric-card-label">{label}</span>
      <span className="v19-metric-card-value">
        <strong>{value}</strong>
        {detail ? <small>{detail}</small> : null}
      </span>
      <span className="v19-metric-card-icon" aria-hidden="true">
        <Icon />
      </span>
    </>
  );

  if (onClick) {
    return (
      <button
        aria-label={label}
        aria-pressed={active}
        className={cn("v19-metric-card", `tone-${mappedTone}`, active && "is-active")}
        data-v19-interaction-id={interactionId}
        type="button"
        onClick={onClick}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      aria-label={label}
      className={cn("v19-metric-card", `tone-${mappedTone}`)}
      role="group"
    >
      {content}
    </div>
  );
}

export function V19ContextToggle({
  badge,
  badgeClassName = "",
  className = "",
  detail,
  expanded,
  icon: Icon,
  onClick,
  title,
}: {
  badge: ReactNode;
  badgeClassName?: string;
  className?: string;
  detail: ReactNode;
  expanded: boolean;
  icon: V19SurfaceIcon;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      aria-expanded={expanded}
      className={`v19-admin-context-toggle ${className}`}
      type="button"
      onClick={onClick}
    >
      <Icon aria-hidden="true" />
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      <em className={badgeClassName}>{badge}</em>
      <ChevronRight aria-hidden="true" />
    </button>
  );
}

export function V19PriorityHero({
  actionAriaLabel,
  actionCount,
  actionIcon: ActionIcon = Flame,
  hasBlockers,
  onAction,
  title,
}: {
  actionAriaLabel: string;
  actionCount: number;
  actionIcon?: V19SurfaceIcon;
  hasBlockers: boolean;
  onAction: () => void;
  title: string;
}) {
  return (
    <section
      aria-label={title}
      className={`v19-priority-hero ${hasBlockers ? "has-blockers" : "is-clear"}`}
      data-v19-component="priority-hero"
    >
      <h2>{title}</h2>
      <div className="v19-priority-hero-action">
        <button
          aria-label={actionAriaLabel}
          className={`v19-priority-hero-trigger ${hasBlockers ? "has-blockers" : "is-empty"}`}
          type="button"
          onClick={onAction}
        >
          <ActionIcon aria-hidden="true" />
          <span className="v19-priority-hero-count" aria-hidden="true">
            {actionCount}
          </span>
        </button>
      </div>
    </section>
  );
}

export function V19ListHeader({
  actionDisabled = false,
  actionLabel,
  className = "",
  countLabel,
  interactionId,
  onAction,
  title,
}: {
  actionDisabled?: boolean;
  actionLabel?: string;
  className?: string;
  countLabel: string;
  interactionId?: string;
  onAction?: () => void;
  title: string;
}) {
  return (
    <div className={`v19-admin-list-header ${className}`}>
      <div>
        <strong>{title}</strong>
        <small>{countLabel}</small>
      </div>
      {actionLabel && onAction ? (
        <button
          data-v19-interaction-id={interactionId}
          disabled={actionDisabled}
          type="button"
          onClick={onAction}
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

export function V19ToolbarSelect<T extends string>({
  ariaLabel,
  className = "",
  icon: Icon,
  interactionId,
  label,
  onChange,
  options,
  value,
}: {
  ariaLabel?: string;
  className?: string;
  icon?: V19SurfaceIcon;
  interactionId?: string;
  label: string;
  onChange: (value: T) => void;
  options: Array<{ label: string; value: T }>;
  value: T;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedOption = options.find((option) => option.value === value);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  useEffect(() => {
    if (!open) return;

    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const frame = window.requestAnimationFrame(() => {
      optionRefs.current[selectedIndex]?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, selectedIndex]);

  const closeAndRestoreTriggerFocus = () => {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const moveOptionFocus = (index: number) => {
    optionRefs.current[index]?.focus();
  };

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!options.length) return;

    const focusedIndex = optionRefs.current.findIndex(
      (option) => option === document.activeElement,
    );
    const currentIndex = focusedIndex >= 0 ? focusedIndex : selectedIndex;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveOptionFocus((currentIndex + 1) % options.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveOptionFocus((currentIndex - 1 + options.length) % options.length);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      moveOptionFocus(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      moveOptionFocus(options.length - 1);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeAndRestoreTriggerFocus();
    }
  };

  return (
    <div
      ref={rootRef}
      className={`v19-admin-toolbar-select ${Icon ? "has-icon" : ""} ${open ? "is-open" : ""} ${className}`}
    >
      <button
        ref={triggerRef}
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`${ariaLabel ?? label}: ${selectedOption?.label ?? ""}`}
        className="v19-admin-toolbar-select-trigger"
        data-v19-interaction-id={interactionId}
        title={Icon ? `${label}: ${selectedOption?.label ?? ""}` : undefined}
        type="button"
        onClick={() => setOpen((current) => !current)}
      >
        {Icon ? (
          <Icon aria-hidden="true" className="v19-admin-toolbar-select-icon" />
        ) : null}
        <span className="v19-admin-toolbar-select-label">{label}</span>
        <span className="v19-admin-toolbar-select-value">{selectedOption?.label}</span>
        <ChevronDown aria-hidden="true" className="v19-admin-toolbar-select-chevron" />
      </button>
      {open ? (
        <div
          id={menuId}
          className="v19-admin-toolbar-select-menu"
          role="listbox"
          aria-label={ariaLabel ?? label}
          onKeyDown={handleMenuKeyDown}
        >
          {options.map((option, index) => (
            <button
              ref={(element) => {
                optionRefs.current[index] = element;
              }}
              key={option.value}
              aria-selected={option.value === value}
              className={option.value === value ? "is-selected" : ""}
              data-v19-interaction-id={interactionId}
              role="option"
              tabIndex={option.value === value ? 0 : -1}
              type="button"
              onClick={() => {
                onChange(option.value);
                closeAndRestoreTriggerFocus();
              }}
            >
              <span>{option.label}</span>
              {option.value === value ? <Check aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function V19QueueToolbar({
  actionDisabled = false,
  actionIcon: ActionIcon = Filter,
  cityFilter,
  cityOptions,
  controls,
  filterLabel = "Фильтры",
  interactionIds,
  onCityFilterChange,
  onFilterClick,
  onSearchChange,
  searchAriaLabel,
  searchPlaceholder,
  searchValue,
  showCityFilter = true,
}: {
  actionDisabled?: boolean;
  actionIcon?: V19SurfaceIcon;
  cityFilter: string;
  cityOptions: string[];
  controls?: ReactNode;
  filterLabel?: string;
  interactionIds?: {
    cityFilter?: string;
    reset?: string;
    search?: string;
  };
  onCityFilterChange: (city: string) => void;
  onFilterClick?: () => void;
  onSearchChange: (value: string) => void;
  searchAriaLabel?: string;
  searchPlaceholder: string;
  searchValue: string;
  showCityFilter?: boolean;
}) {
  const cityActive = cityFilter !== "Все города";

  return (
    <V19TwoRowToolbar
      className="v19-admin-queue-toolbar border-b border-[#242529] p-4 lg:p-5"
      filters={
        <>
          {controls ? (
            <div className="v19-admin-toolbar-controls">{controls}</div>
          ) : null}
          {showCityFilter ? (
            <V19ToolbarSelect<string>
              ariaLabel="Фильтр городов"
              className={`v19-admin-city-filter ${cityActive ? "is-active" : ""}`}
              icon={MapPin}
              interactionId={interactionIds?.cityFilter}
              label="Город"
              options={cityOptions.map((city) => ({
                label: city === "Все города" ? "Города" : city,
                value: city,
              }))}
              value={cityFilter}
              onChange={onCityFilterChange}
            />
          ) : null}
        </>
      }
      search={
        <div className="v19-admin-queue-toolbar-search relative min-w-[220px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/38" />
          <input
            aria-label={searchAriaLabel ?? searchPlaceholder}
            name="queue-search"
            type="search"
            className="h-10 w-full rounded-[10px] border border-[#242529] bg-[#111113] pl-9 pr-3 text-[11px] font-medium text-white/70 placeholder:text-[#525151] outline-none focus:border-[#6f64ff]/55"
            data-v19-interaction-id={interactionIds?.search}
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(event) => onSearchChange(event.currentTarget.value)}
          />
        </div>
      }
      action={
        onFilterClick ? (
          <button
            aria-label={filterLabel}
            title={filterLabel}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-[#242529] bg-[#111113] text-white/55 hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
            data-v19-interaction-id={interactionIds?.reset}
            disabled={actionDisabled}
            type="button"
            onClick={onFilterClick}
          >
            <ActionIcon className="h-3.5 w-3.5" />
          </button>
        ) : undefined
      }
    />
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
      icon: <UsersRound aria-hidden="true" size={16} />,
      id: "family",
      label: familyLabel,
    },
    {
      icon: <UserRound aria-hidden="true" size={16} />,
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
    return (
      <AlertCircle className="vf-figma-member-issue" aria-hidden="true" size={15} />
    );
  }

  if (tone === "progress") {
    return <span className="vf-figma-member-progress" aria-hidden="true" />;
  }

  return (
    <CheckCircle2 className="vf-figma-member-ready" aria-hidden="true" size={15} />
  );
}

export function V19ReadinessCard({
  description,
  detail,
  label = "Готовность по правилам BLS",
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
        <ShieldCheck aria-hidden="true" size={14} />
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

export function V19TwoRowToolbar({
  action,
  className,
  filters,
  search,
}: {
  action?: ReactNode;
  className?: string;
  filters: ReactNode;
  search: ReactNode;
}) {
  return (
    <div className={cn("v19-two-row-toolbar", className)}>
      <div className="v19-two-row-toolbar-filters">{filters}</div>
      <div className="v19-two-row-toolbar-search-row">
        {search}
        {action}
      </div>
    </div>
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
    <V19TwoRowToolbar
      className="vf-figma-actions-toolbar"
      filters={
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
                <span className="vf-figma-tab-label vf-figma-tab-label-full">
                  {tab.label}
                </span>
                <span
                  aria-hidden="true"
                  className="vf-figma-tab-label vf-figma-tab-label-compact"
                >
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
      }
      search={
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
      }
    />
  );
}

export function V19LongListCell({
  city,
  cta,
  dates,
  id,
  onOpen,
  peopleCount,
  statusLabel,
  statusTone,
  testId,
  title,
  triage,
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
      <V19SubmissionIdentity
        city={city}
        className="vf-figma-action-title"
        peopleCount={peopleCount}
        publicId={id}
        title={title}
      />
      <span className="vf-figma-mobile-route">
        <strong>{dates}</strong>
        <em>Даты поездки</em>
      </span>
      <span className="vf-figma-action-meta">
        <strong>{updated}</strong>
        <em>Обновлено</em>
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
          <span className="vf-figma-ai-triage-identity">{triage.identityLabel}</span>
          <span className="vf-figma-ai-triage-action">{triage.nextAction}</span>
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
      <V19SubmissionIdentity
        city={city}
        peopleCount={peopleCount}
        publicId={id}
        title={title}
      />
      <span className="vf-figma-column-subline">{dates}</span>
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
          {kind === "family" ? <UsersRound size={16} /> : <UserRound size={16} />}
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
        <ChevronRight aria-hidden="true" size={16} />
      </span>
      <span className="v19-mobile-summary-foot" aria-hidden="true">
        <span className="v19-mobile-summary-route">
          {mobilePrimaryDetail ? <strong>{mobilePrimaryDetail}</strong> : null}
          {mobileSecondaryDetail ? <em>{mobileSecondaryDetail}</em> : null}
        </span>
        <span className="v19-mobile-summary-tail">
          <ChevronRight aria-hidden="true" size={16} />
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
  const safeValue = Number.isFinite(value) ? Math.min(Math.max(value, 0), safeMax) : 0;

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
        <div
          className="v19-figma-drawer-tabs"
          role="tablist"
          aria-label="Разделы подачи"
        >
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
          <UsersRound aria-hidden="true" size={26} />
        </span>
        <span>
          <strong>{title}</strong>
          <em>{totalLabel}</em>
        </span>
      </span>
      <span className="vf-figma-member-list">
        {members.map((member) => (
          <span
            aria-label={`Заявитель: ${member.name}, ${title}`}
            className="vf-figma-member-row"
            key={`${member.name}-${member.role}`}
          >
            <em>{member.initials}</em>
            <strong>{member.name}</strong>
            <small>{member.role}</small>
            <V19MemberStatusIcon tone={member.statusTone} />
          </span>
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

export function V19ProductEmptyState({
  description,
  eyebrow = "Раздел продукта",
  icon: Icon = Folder,
  title,
}: {
  description: ReactNode;
  eyebrow?: string;
  icon?: LucideIcon;
  title: string;
}) {
  const titleId = useId();

  return (
    <section
      aria-labelledby={titleId}
      className="v19-product-empty-state"
      data-v19-component="product-empty-state"
      role="status"
    >
      <span className="v19-product-empty-state-icon" aria-hidden="true">
        <Icon focusable="false" />
      </span>
      <div className="v19-product-empty-state-copy">
        <span className="v19-product-empty-state-eyebrow">{eyebrow}</span>
        <h2 id={titleId}>{title}</h2>
        <p>{description}</p>
      </div>
      <span className="v19-product-empty-state-rail" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    </section>
  );
}

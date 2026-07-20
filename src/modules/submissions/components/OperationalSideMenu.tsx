import {
  ArrowLeftRight,
  ContactRound,
  Ellipsis,
  FileClock,
  FileSpreadsheet,
  FileStack,
  Files,
  Images,
  ListChecks,
  Plus,
  ScanSearch,
  Search,
  SlidersHorizontal,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "../../../shared/ui/cn";
import { Button, IconButton, NavCount } from "../../../shared/ui/primitives";
import { V19SideMenuSurface } from "../../../shared/ui/v19-design-system";
import type { Role } from "../types";

export const operationalSideMenuId = "v19-operational-side-menu";

type OperationalNavTone = "default" | "danger" | "warning" | "success";
type OperationalSideMenuMode = "regular" | "compact";

type OperationalNavItem = {
  active?: boolean;
  count?: number;
  disabled?: boolean;
  icon: string;
  id: string;
  label: string;
  meta: string;
  onClick: () => void;
  quickAction?: string;
  tone?: OperationalNavTone;
};

export function OperationalSideMenu({
  ariaLabel,
  displayMode,
  inactive = false,
  items,
  mobileOpen,
  mobileTitle,
  sidebarId,
  mobileCloseLabel,
  createAction,
  onChooseRole,
  onCommandSearch,
  onCloseMobile,
  onResetWorkspace,
  role,
  sessionDisplayName,
  sessionInitials,
  sessionRoleLabel,
  showWorkspaceSwitch,
}: {
  ariaLabel: string;
  createAction?: {
    label: string;
    onClick: () => void;
  };
  displayMode: OperationalSideMenuMode;
  inactive?: boolean;
  items: OperationalNavItem[];
  mobileOpen: boolean;
  mobileCloseLabel?: string;
  mobileTitle: string;
  onChooseRole: (role: Role) => void;
  onCommandSearch?: () => void;
  onCloseMobile: () => void;
  onResetWorkspace: () => void | Promise<void>;
  role: Role;
  sessionDisplayName: string;
  sessionInitials: string;
  sessionRoleLabel: string;
  sidebarId?: string;
  showWorkspaceSwitch: boolean;
}) {
  const navItems = items.map((item) => ({
    ...item,
    onClick: () => {
      item.onClick();
      onCloseMobile();
    },
  }));
  const sidebarCreateAction = createAction
    ? {
        ...createAction,
        onClick: () => {
          createAction.onClick();
          onCloseMobile();
        },
      }
    : undefined;
  const workspaceSwitchButton = showWorkspaceSwitch ? (
    <Button
      className="vf-figma-admin-zone"
      aria-label={role === "agent" ? "В админскую зону" : "В агентскую зону"}
      variant="secondary"
      onClick={() => {
        onChooseRole(role === "agent" ? "admin" : "agent");
        onCloseMobile();
      }}
    >
      <ArrowLeftRight aria-hidden="true" />
      {role === "agent" ? "В админскую зону" : "В агентскую зону"}
    </Button>
  ) : null;
  const id = sidebarId ?? operationalSideMenuId;

  return (
    <>
      <V19SideMenuSurface
        id={id}
        className={cn("ops-sidebar opsu-sidebar", `is-${displayMode}`)}
        open={mobileOpen}
        data-side-menu-mode={displayMode}
        aria-label={ariaLabel}
        aria-hidden={inactive ? "true" : undefined}
        aria-modal={mobileOpen ? "true" : undefined}
        inert={inactive ? true : undefined}
        role={mobileOpen ? "dialog" : undefined}
      >
        <div className="ops-mobile-screen-title" aria-label={mobileTitle}>
          <strong>{mobileTitle}</strong>
          <span aria-hidden="true">VF</span>
        </div>
        <div className="ops-brand opsu-brand">
          <span
            className="ops-brand-logo ops-brand-mark opsu-brand-mark"
            aria-hidden="true"
          >
            <span className="ops-brand-letter">V</span>
          </span>
          <div className="ops-brand-copy opsu-brand-copy">
            <strong className="opsu-wordmark vf-brand-wordmark">VisaFlow</strong>
          </div>
          <IconButton
            className="ops-mobile-close opsu-mobile-close"
            icon={
              <X aria-hidden="true" focusable="false" size={18} strokeWidth={1.9} />
            }
            label={mobileCloseLabel ?? "Закрыть меню"}
            onClick={onCloseMobile}
          />
        </div>
        {onCommandSearch ? (
          <button
            className="ops-sidebar-search"
            type="button"
            aria-label="Открыть командную палитру"
            onClick={onCommandSearch}
          >
            <Search aria-hidden="true" focusable="false" size={16} strokeWidth={1.8} />
            <span>Поиск...</span>
            <kbd>⌘K</kbd>
          </button>
        ) : null}
        <nav className="ops-nav opsu-nav" aria-label="Операционные разделы">
          <span className="ops-nav-group-label">Работа</span>
          {navItems.map((item) => (
            <Button
              aria-current={item.active ? "page" : undefined}
              aria-label={item.label}
              className={cn(
                "ops-nav-item opsu-nav-item",
                item.active && "is-active",
                item.tone && `tone-${item.tone}`,
              )}
              data-nav-id={item.id}
              disabled={item.disabled}
              key={item.id}
              variant="ghost"
              onClick={item.onClick}
            >
              <span className="ops-nav-icon opsu-nav-icon" aria-hidden="true">
                <OperationalIcon id={item.id} fallback={item.icon} />
              </span>
              <span className="ops-nav-copy opsu-nav-copy">
                <strong>{item.label}</strong>
              </span>
              {typeof item.count === "number" ? (
                <NavCount label={`${item.count}`}>{item.count}</NavCount>
              ) : null}
              {item.quickAction ? (
                <em className="ops-nav-action opsu-nav-action">{item.quickAction}</em>
              ) : null}
            </Button>
          ))}
        </nav>
        {sidebarCreateAction ? (
          <Button
            className="ops-sidebar-create opsu-sidebar-create"
            aria-label={sidebarCreateAction.label}
            variant="plain"
            onClick={sidebarCreateAction.onClick}
          >
            <span aria-hidden="true">
              <Plus focusable="false" />
            </span>
            <strong>{sidebarCreateAction.label}</strong>
          </Button>
        ) : null}
        <div className="ops-sidebar-footer opsu-sidebar-footer">
          {workspaceSwitchButton}
          <Button
            className="ops-session"
            aria-label="Выйти"
            variant="ghost"
            onClick={() => {
              void onResetWorkspace();
              onCloseMobile();
            }}
          >
            <span>{sessionInitials}</span>
            <div>
              <strong>{sessionDisplayName}</strong>
              <small>{sessionRoleLabel}</small>
            </div>
            <Ellipsis className="ops-user-more" aria-hidden="true" />
          </Button>
        </div>
      </V19SideMenuSurface>
      {mobileOpen ? (
        <button
          className="ops-mobile-menu-backdrop"
          type="button"
          aria-label="Закрыть меню"
          aria-controls={id}
          onClick={onCloseMobile}
        />
      ) : null}
    </>
  );
}

const operationalIconMap: Array<[needle: string, Icon: LucideIcon]> = [
  ["actions", ListChecks],
  ["documents", Files],
  ["drafts", FileClock],
  ["applicants", ContactRound],
  ["media", Images],
  ["issues", TriangleAlert],
  ["submissions", FileStack],
  ["users", ContactRound],
  ["review", ScanSearch],
  ["work", ListChecks],
  ["export", FileSpreadsheet],
  ["settings", SlidersHorizontal],
];

function OperationalIcon({ fallback, id }: { fallback: string; id: string }) {
  const match = operationalIconMap.find(([needle]) => id.includes(needle));

  if (match) {
    const Icon = match[1];
    return <Icon aria-hidden="true" focusable="false" size={17} strokeWidth={1.8} />;
  }

  return <span>{fallback}</span>;
}

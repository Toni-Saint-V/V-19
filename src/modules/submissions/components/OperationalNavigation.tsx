import type { ReactNode } from "react";
import {
  ContactRound,
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

export type OperationalNavTone = "default" | "danger" | "warning" | "success";
export type OperationalSideMenuMode = "regular" | "compact";

export type OperationalNavItem = {
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

export function OperationalSidebar({
  ariaLabel,
  createAction,
  displayMode,
  footer,
  id,
  inactive,
  items,
  mobileCloseLabel,
  mobileOpen,
  onCommandSearch,
  onMobileClose,
  mobileTitle,
}: {
  ariaLabel: string;
  brand?: string;
  createAction?: {
    label: string;
    onClick: () => void;
  };
  displayMode: OperationalSideMenuMode;
  footer: ReactNode;
  id?: string;
  inactive?: boolean;
  items: OperationalNavItem[];
  mobileCloseLabel?: string;
  mobileOpen: boolean;
  onCommandSearch?: () => void;
  onMobileClose?: () => void;
  mobileTitle?: string;
}) {
  return (
    <aside
      id={id}
      className={cn("ops-sidebar opsu-sidebar", `is-${displayMode}`)}
      data-side-menu-mode={displayMode}
      aria-label={ariaLabel}
      aria-hidden={inactive ? "true" : undefined}
      aria-modal={mobileOpen ? "true" : undefined}
      inert={inactive ? true : undefined}
      role={mobileOpen ? "dialog" : undefined}
    >
      {mobileTitle ? (
        <div className="ops-mobile-screen-title" aria-label={mobileTitle}>
          <strong>{mobileTitle}</strong>
          <span aria-hidden="true">VF</span>
        </div>
      ) : null}
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
        {onMobileClose ? (
          <IconButton
            className="ops-mobile-close opsu-mobile-close"
            icon={
              <X aria-hidden="true" focusable="false" size={18} strokeWidth={1.9} />
            }
            label={mobileCloseLabel ?? "Закрыть меню"}
            onClick={onMobileClose}
          />
        ) : null}
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
        {items.map((item) => (
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
      {createAction ? (
        <Button
          className="ops-sidebar-create opsu-sidebar-create"
          aria-label={createAction.label}
          variant="plain"
          onClick={createAction.onClick}
        >
          <span aria-hidden="true">
            <Plus focusable="false" />
          </span>
          <strong>{createAction.label}</strong>
        </Button>
      ) : null}
      <div className="ops-sidebar-footer opsu-sidebar-footer">{footer}</div>
    </aside>
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

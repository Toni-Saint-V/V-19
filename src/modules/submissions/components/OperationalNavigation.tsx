import type { ReactNode } from "react";
import {
  ClipboardCheck,
  FileText,
  FileWarning,
  FileSpreadsheet,
  ImageIcon,
  Menu,
  Settings,
  Search,
  Users,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import visaOpsLogo from "../../../assets/visaflow-logo.png";
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
  createAction,
  displayMode,
  footer,
  id,
  items,
  onCommandSearch,
  onMobileClose,
  mobileTitle,
}: {
  brand?: string;
  createAction?: {
    label: string;
    onClick: () => void;
  };
  displayMode: OperationalSideMenuMode;
  footer: ReactNode;
  id?: string;
  items: OperationalNavItem[];
  onCommandSearch?: () => void;
  onMobileClose?: () => void;
  mobileTitle?: string;
}) {
  return (
    <aside
      id={id}
      className={cn("ops-sidebar opsu-sidebar", `is-${displayMode}`)}
      data-side-menu-mode={displayMode}
      aria-label="Операционный центр"
    >
      {mobileTitle ? (
        <div className="ops-mobile-screen-title" aria-label={mobileTitle}>
          <strong>{mobileTitle}</strong>
          <span aria-hidden="true">VF</span>
        </div>
      ) : null}
      <div className="ops-brand opsu-brand">
        <span
          className="ops-brand-logo ops-brand-mark opsu-brand-mark vf-brand-capital vf-brand-capital--nav"
          aria-hidden="true"
        >
          <img
            className="opsu-brand-image vf-brand-capital-image"
            src={visaOpsLogo}
            alt=""
          />
        </span>
        <div className="ops-brand-copy opsu-brand-copy">
          <strong className="opsu-wordmark vf-brand-wordmark">VisaFlow</strong>
        </div>
        {onMobileClose ? (
          <IconButton
            className="ops-mobile-close opsu-mobile-close"
            icon={<X aria-hidden="true" focusable="false" size={18} strokeWidth={1.9} />}
            label="Закрыть меню"
            onClick={onMobileClose}
          />
        ) : null}
      </div>
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
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </span>
          <strong>{createAction.label}</strong>
        </Button>
      ) : null}
      <div className="ops-sidebar-footer opsu-sidebar-footer">{footer}</div>
    </aside>
  );
}

const operationalIconMap: Array<[needle: string, Icon: LucideIcon]> = [
  ["actions", Menu],
  ["documents", FileText],
  ["drafts", FileText],
  ["applicants", Users],
  ["media", ImageIcon],
  ["issues", FileWarning],
  ["submissions", UsersRound],
  ["review", ClipboardCheck],
  ["work", ClipboardCheck],
  ["export", FileSpreadsheet],
  ["settings", Settings],
];

function OperationalIcon({ fallback, id }: { fallback: string; id: string }) {
  const match = operationalIconMap.find(([needle]) => id.includes(needle));

  if (match) {
    const Icon = match[1];
    return <Icon aria-hidden="true" focusable="false" size={17} strokeWidth={1.8} />;
  }

  return <span>{fallback}</span>;
}

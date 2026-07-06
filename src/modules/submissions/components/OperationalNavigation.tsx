import type { ReactNode } from "react";
import {
  ClipboardCheck,
  FileText,
  FileWarning,
  FileSpreadsheet,
  ImageIcon,
  Menu,
  Plus,
  Settings,
  Search,
  Users,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import visaOpsLogo from "../../../assets/visaflow-logo.png";
import { cn } from "../../../shared/ui/cn";
import { IconButton } from "../../../shared/ui/primitives";
import { SideMenuButton } from "../../../shared/ui/SideMenuButton";

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
          <SideMenuButton
            active={item.active}
            className={cn(
              "ops-nav-item opsu-nav-item",
              item.active && "is-active",
              item.tone && `tone-${item.tone}`,
            )}
            collapsed={displayMode === "compact"}
            count={item.count}
            data-nav-id={item.id}
            description={item.meta}
            disabled={item.disabled}
            icon={<OperationalIcon id={item.id} fallback={item.icon} />}
            key={item.id}
            label={item.label}
            labelText={item.label}
            shortcut={item.quickAction}
            tone={item.tone}
            onClick={item.onClick}
          />
        ))}
      </nav>
      {createAction ? (
        <SideMenuButton
          appearance="action"
          className="ops-sidebar-create opsu-sidebar-create"
          collapsed={displayMode === "compact"}
          icon={<Plus aria-hidden="true" focusable="false" size={17} strokeWidth={2} />}
          label={createAction.label}
          labelText={createAction.label}
          onClick={createAction.onClick}
        />
      ) : null}
      <div className="ops-sidebar-footer opsu-sidebar-footer">{footer}</div>
    </aside>
  );
}

const operationalIconMap: Array<[needle: string, Icon: LucideIcon]> = [
  ["actions", Menu],
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

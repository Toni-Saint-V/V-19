import type { ReactNode } from "react";
import {
  ClipboardCheck,
  FileSpreadsheet,
  Inbox,
  ListChecks,
  Settings,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import visaOpsLogo from "../../../assets/visaflow-logo.png";
import { cn } from "../../../shared/ui/cn";
import { Button, NavCount } from "../../../shared/ui/primitives";

export type OperationalNavTone = "default" | "danger" | "warning" | "success";

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

export type OperationalSidebarVariant = "desktop" | "mobile" | "single";

export function OperationalSidebar({
  createAction,
  footer,
  items,
  onMobileClose,
  mobileTitle,
  variant = "single",
}: {
  brand?: string;
  createAction?: {
    label: string;
    onClick: () => void;
  };
  footer: ReactNode;
  items: OperationalNavItem[];
  onMobileClose?: () => void;
  mobileTitle?: string;
  variant?: OperationalSidebarVariant;
}) {
  return (
    <aside
      className={cn("ops-sidebar opsu-sidebar", `opsu-sidebar--${variant}`)}
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
          <strong className="opsu-wordmark vf-brand-wordmark">
            <span className="vf-brand-tail" aria-hidden="true">
              VisaFlow
            </span>
            <span className="vf-brand-comma-version" aria-hidden="true">
              19
            </span>
          </strong>
          <em>Workspace</em>
        </div>
        {onMobileClose ? (
          <Button
            aria-label="Закрыть меню"
            className="ops-mobile-close opsu-mobile-close"
            variant="ghost"
            onClick={onMobileClose}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </Button>
        ) : null}
      </div>
      <nav className="ops-nav opsu-nav" aria-label="Операционные разделы">
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
        <button
          className="ops-sidebar-create opsu-sidebar-create"
          type="button"
          aria-label={createAction.label}
          onClick={createAction.onClick}
        >
          <span aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </span>
          <strong>{createAction.label}</strong>
        </button>
      ) : null}
      <div className="ops-sidebar-footer opsu-sidebar-footer">{footer}</div>
    </aside>
  );
}

export function OperationalMobileTabBar({ items }: { items: OperationalNavItem[] }) {
  return (
    <nav className="ops-mobile-tabbar" aria-label="Нижняя навигация">
      {items.map((item) => (
        <button
          aria-current={item.active ? "page" : undefined}
          aria-label={item.label}
          className={cn("ops-mobile-tabbar-item", item.active && "is-active")}
          data-nav-id={item.id}
          disabled={item.disabled}
          key={item.id}
          type="button"
          onClick={item.onClick}
        >
          <span className="ops-mobile-tabbar-icon" aria-hidden="true">
            <OperationalIcon id={item.id} fallback={item.icon} />
          </span>
          <span className="ops-mobile-tabbar-label">{item.label}</span>
          {typeof item.count === "number" ? (
            <NavCount label={`${item.count}`}>{item.count}</NavCount>
          ) : null}
        </button>
      ))}
    </nav>
  );
}

const operationalIconMap: Array<[needle: string, Icon: LucideIcon]> = [
  ["inbox", Inbox],
  ["actions", ListChecks],
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

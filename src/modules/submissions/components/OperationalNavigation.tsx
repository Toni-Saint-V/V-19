import { Button, NavCount } from "../../../shared/ui/primitives";
import type { ReactNode, SVGProps } from "react";
import logoUrl from "../../../assets/visaflow-logo.png";

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

export function OperationalSidebar({
  brand = "VisaFlow",
  createAction,
  footer,
  items,
  mobileTitle,
}: {
  brand?: string;
  createAction?: {
    label: string;
    onClick: () => void;
  };
  footer: ReactNode;
  items: OperationalNavItem[];
  mobileTitle?: string;
}) {
  return (
    <aside className="ops-sidebar" aria-label="Операционный центр">
      {mobileTitle ? (
        <div className="ops-mobile-screen-title" aria-label={mobileTitle}>
          <strong>{mobileTitle}</strong>
          <span aria-hidden="true">VF</span>
        </div>
      ) : null}
      <div className="ops-brand" aria-label={brand}>
        <img className="ops-brand-logo" src={logoUrl} alt="" aria-hidden="true" />
        <div className="ops-brand-copy">
          <strong>VisaFlow</strong>
        </div>
      </div>
      <nav className="ops-nav" aria-label="Операционные разделы">
        {items.map((item) => (
          <Button
            aria-current={item.active ? "page" : undefined}
            aria-label={`${item.label}. ${item.meta}`}
            className={`ops-nav-item ${item.active ? "is-active" : ""} ${
              item.tone ? `tone-${item.tone}` : ""
            }`}
            disabled={item.disabled}
            key={item.id}
            variant="ghost"
            onClick={item.onClick}
          >
            <span className="ops-nav-icon" aria-hidden="true">
              <OperationalIcon id={item.id} fallback={item.icon} />
            </span>
            <span className="ops-nav-copy">
              <strong>{item.label}</strong>
            </span>
            {typeof item.count === "number" ? (
              <NavCount label={`${item.count}`}>{item.count}</NavCount>
            ) : null}
            {item.quickAction ? (
              <em className="ops-nav-action">{item.quickAction}</em>
            ) : null}
          </Button>
        ))}
      </nav>
      {createAction ? (
        <button
          className="ops-sidebar-create"
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
      <div className="ops-sidebar-footer">{footer}</div>
    </aside>
  );
}

export function OperationalMobileTabBar({
  items,
}: {
  items: OperationalNavItem[];
}) {
  return (
    <nav className="ops-mobile-tabbar" aria-label="Мобильная навигация агента">
      {items.map((item) => (
        <button
          aria-current={item.active ? "page" : undefined}
          aria-label={`${item.label}. ${item.meta}`}
          className={`ops-mobile-tabbar-item ${item.active ? "is-active" : ""} ${
            item.tone ? `tone-${item.tone}` : ""
          }`}
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

function OperationalIcon({ fallback, id }: { fallback: string; id: string }) {
  const common = {
    fill: "none",
    focusable: "false",
    height: "17",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: "1.8",
    viewBox: "0 0 24 24",
    width: "17",
  } satisfies SVGProps<SVGSVGElement>;

  if (id.includes("inbox")) {
    return (
      <svg {...common}>
        <path d="M4 4h16v13H4z" />
        <path d="M4 13h4l2 3h4l2-3h4" />
      </svg>
    );
  }

  if (id.includes("actions")) {
    return (
      <svg {...common}>
        <path d="m4 7 2 2 4-4" />
        <path d="M13 7h7" />
        <path d="m4 14 2 2 4-4" />
        <path d="M13 14h7" />
        <path d="M4 21h16" />
      </svg>
    );
  }

  if (id.includes("submissions")) {
    return (
      <svg {...common}>
        <path d="M6 3h8l4 4v14H6z" />
        <path d="M14 3v5h5" />
        <path d="M9 13h6M9 17h6" />
      </svg>
    );
  }

  if (id.includes("review") || id.includes("work")) {
    return (
      <svg {...common}>
        <path d="M5 4h14v16H5z" />
        <path d="M8 8h8M8 12h5" />
        <path d="m14 16 2 2 4-4" />
      </svg>
    );
  }

  if (id.includes("export")) {
    return (
      <svg {...common}>
        <path d="M5 4h14v16H5z" />
        <path d="M8 8h8M8 12h8M8 16h5" />
        <path d="M16 14v6m0 0-2-2m2 2 2-2" />
      </svg>
    );
  }

  if (id.includes("settings")) {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="3" />
        <path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1A8 8 0 0 0 15 6l-.3-2.6h-4L10.4 6a8 8 0 0 0-1.5.9l-2.4-1-2 3.4 2 1.5a7 7 0 0 0 0 2.2l-2 1.5 2 3.4 2.4-1a8 8 0 0 0 1.5.9l.3 2.6h4l.3-2.6a8 8 0 0 0 1.5-.9l2.4 1 2-3.4-2-1.5a7 7 0 0 0 .1-1z" />
      </svg>
    );
  }

  return <span>{fallback}</span>;
}

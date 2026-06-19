import { Button, NavCount } from "../../../shared/ui/primitives";
import type { ReactNode, SVGProps } from "react";

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
  footer,
  items,
  roleLabel,
}: {
  brand?: string;
  footer: ReactNode;
  items: OperationalNavItem[];
  roleLabel: string;
}) {
  return (
    <aside className="left-rail ops-sidebar" aria-label="Операционный центр">
      <div className="rail-mark ops-brand" aria-label={brand}>
        <span>VF</span>
        <strong>{brand}</strong>
        <em>{roleLabel}</em>
        <button aria-label="Командное меню" type="button">
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
            <path d="M12 5.5h.01" />
            <path d="M12 12h.01" />
            <path d="M12 18.5h.01" />
          </svg>
        </button>
      </div>
      <nav className="rail-nav ops-nav" aria-label="Операционные разделы">
        {items.map((item) => (
          <Button
            aria-current={item.active ? "page" : undefined}
            aria-label={`${item.label}. ${item.meta}`}
            className={`rail-item ops-nav-item ${item.active ? "is-active" : ""} ${
              item.tone ? `tone-${item.tone}` : ""
            }`}
            disabled={item.disabled}
            key={item.id}
            variant="ghost"
            onClick={item.onClick}
          >
            <span className="rail-icon ops-nav-icon" aria-hidden="true">
              <OperationalIcon id={item.id} fallback={item.icon} />
            </span>
            <span className="ops-nav-copy">
              <strong>{item.label}</strong>
              <small>{item.meta}</small>
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
      <div className="ops-sidebar-footer">{footer}</div>
    </aside>
  );
}

function OperationalIcon({ fallback, id }: { fallback: string; id: string }) {
  const common = {
    fill: "none",
    focusable: "false",
    height: "16",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: "1.8",
    viewBox: "0 0 24 24",
    width: "16",
  } satisfies SVGProps<SVGSVGElement>;

  if (id.includes("inbox")) {
    return (
      <svg {...common}>
        <path d="M4 7.5h16l-2.2 9H6.2L4 7.5Z" />
        <path d="M8.2 12.5h2.1l1 1.6h1.4l1-1.6h2.1" />
      </svg>
    );
  }

  if (id.includes("actions")) {
    return (
      <svg {...common}>
        <path d="m5 12 4 4L19 6" />
        <path d="M4 19h16" />
      </svg>
    );
  }

  if (id.includes("submissions") || id.includes("review")) {
    return (
      <svg {...common}>
        <path d="M7 4.5h7l3 3V19.5H7V4.5Z" />
        <path d="M14 4.5v4h4" />
        <path d="M9.5 12h5" />
        <path d="M9.5 15.5h4" />
      </svg>
    );
  }

  if (id.includes("export")) {
    return (
      <svg {...common}>
        <path d="M12 4v10" />
        <path d="m8.5 10.5 3.5 3.5 3.5-3.5" />
        <path d="M5 19h14" />
      </svg>
    );
  }

  if (id.includes("settings")) {
    return (
      <svg {...common}>
        <path d="M12 8.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Z" />
        <path d="M12 3.5v2" />
        <path d="M12 18.5v2" />
        <path d="M4.6 7.2l1.7 1" />
        <path d="m17.7 15.8 1.7 1" />
        <path d="m4.6 16.8 1.7-1" />
        <path d="m17.7 8.2 1.7-1" />
      </svg>
    );
  }

  return <span>{fallback}</span>;
}

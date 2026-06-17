import { Button } from "../../../shared/ui/primitives";
import type { ReactNode } from "react";

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
}: {
  brand?: string;
  footer: ReactNode;
  items: OperationalNavItem[];
}) {
  return (
    <aside className="left-rail ops-sidebar" aria-label="Операционный центр">
      <div className="rail-mark ops-brand" aria-label={brand}>
        <span>VF</span>
        <strong>{brand}</strong>
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
              {item.icon}
            </span>
            <span className="ops-nav-copy">
              <strong>{item.label}</strong>
              <small>{item.meta}</small>
            </span>
            {typeof item.count === "number" ? (
              <span className="ops-nav-count" aria-label={`${item.count}`}>
                {item.count}
              </span>
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

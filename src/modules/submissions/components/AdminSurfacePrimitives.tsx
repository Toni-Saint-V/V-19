import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export type AdminSurfaceMetricTone =
  | "green"
  | "neutral"
  | "orange"
  | "red"
  | "review"
  | "success"
  | "warning";

export function AdminSurfaceMetricCard({
  className,
  detail,
  icon: Icon,
  iconClassName,
  label,
  tone = "neutral",
  value,
}: {
  className: string;
  detail?: ReactNode;
  icon: LucideIcon;
  iconClassName?: string;
  label: string;
  tone?: AdminSurfaceMetricTone;
  value: ReactNode;
}) {
  return (
    <div className={`${className} tone-${tone}`}>
      <div>
        <span>{label}</span>
        <Icon
          aria-hidden="true"
          className={iconClassName ?? `tone-${tone}`}
          focusable="false"
          size={16}
          strokeWidth={1.8}
        />
      </div>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

export type AdminSurfaceToolbarTab = {
  count?: number;
  icon?: LucideIcon;
  id: string;
  label: string;
  tone?: string;
};

export function AdminSurfaceToolbar({
  activeTab,
  ariaLabel,
  className,
  onTabChange,
  search,
  tabs,
  tools,
}: {
  activeTab: string;
  ariaLabel: string;
  className: string;
  onTabChange: (tab: string) => void;
  search: ReactNode;
  tabs: AdminSurfaceToolbarTab[];
  tools?: ReactNode;
}) {
  return (
    <div className={className}>
      <div className="v19-admin-cockpit-tabs" role="tablist" aria-label={ariaLabel}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              aria-selected={active}
              className={active ? ["is-active", tab.tone ? `tone-${tab.tone}` : ""].filter(Boolean).join(" ") : ""}
              key={tab.id}
              role="tab"
              type="button"
              onClick={() => onTabChange(tab.id)}
            >
              {Icon ? <Icon aria-hidden="true" size={14} strokeWidth={1.8} /> : null}
              {tab.label}
              {typeof tab.count === "number" ? <span>{tab.count}</span> : null}
            </button>
          );
        })}
      </div>
      <div className="v19-admin-cockpit-tools">
        <div className="v19-admin-cockpit-search">{search}</div>
        {tools}
      </div>
    </div>
  );
}

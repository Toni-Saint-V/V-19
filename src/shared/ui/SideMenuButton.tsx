import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "./cn";

export type SideMenuButtonTone = "default" | "danger" | "warning" | "success";
export type SideMenuButtonAppearance = "navigation" | "action" | "utility";

export interface SideMenuButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  active?: boolean;
  appearance?: SideMenuButtonAppearance;
  badge?: ReactNode;
  collapsed?: boolean;
  count?: number;
  description?: ReactNode;
  icon: ReactNode;
  label: ReactNode;
  labelText?: string;
  shortcut?: ReactNode;
  tone?: SideMenuButtonTone;
}

export function SideMenuButton({
  active = false,
  appearance = "navigation",
  badge,
  className,
  collapsed = false,
  count,
  description,
  disabled,
  icon,
  label,
  labelText,
  shortcut,
  tone = "default",
  type = "button",
  ...props
}: SideMenuButtonProps) {
  const accessibleLabel =
    labelText ?? (typeof label === "string" ? label : undefined);
  const visibleBadge = badge ?? (typeof count === "number" ? count : null);

  return (
    <button
      {...props}
      aria-current={props["aria-current"] ?? (active ? "page" : undefined)}
      aria-label={props["aria-label"] ?? accessibleLabel}
      className={cn(
        "vf-side-menu-button",
        `appearance-${appearance}`,
        `tone-${tone}`,
        active && "is-active",
        collapsed && "is-collapsed",
        disabled && "is-disabled",
        className,
      )}
      data-active={active ? "true" : "false"}
      data-collapsed={collapsed ? "true" : "false"}
      disabled={disabled}
      type={type}
    >
      <span className="vf-side-menu-button__rail" aria-hidden="true" />
      <span className="vf-side-menu-button__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="vf-side-menu-button__copy">
        <strong>{label}</strong>
        {description ? <small>{description}</small> : null}
      </span>
      {visibleBadge !== null && visibleBadge !== undefined ? (
        <span className="vf-side-menu-button__badge" aria-hidden="true">
          {visibleBadge}
        </span>
      ) : null}
      {shortcut ? (
        <kbd className="vf-side-menu-button__shortcut" aria-hidden="true">
          {shortcut}
        </kbd>
      ) : null}
      {collapsed && accessibleLabel ? (
        <span className="vf-side-menu-button__tooltip" role="tooltip">
          {accessibleLabel}
        </span>
      ) : null}
    </button>
  );
}

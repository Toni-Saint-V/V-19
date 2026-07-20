import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import { Menu, X } from "lucide-react";

import { cn } from "../../../shared/ui/cn";
import { IconButton } from "../../../shared/ui/primitives";
import { OperationalSideMenu } from "./OperationalSideMenu";

type AppShellProps = {
  children: ReactNode;
  className?: string;
  header: ReactNode;
  inactive?: boolean;
  mobileNavOpen: boolean;
  role: string;
  sideMenu: ComponentProps<typeof OperationalSideMenu>;
  sideMenuMode: "regular" | "compact";
  surface: string;
  collectionSurface?: boolean;
  drawerOpen?: boolean;
  label?: string;
  overlays?: ReactNode;
  workspaceInactive?: boolean;
};

export function AppShell({
  children,
  className,
  collectionSurface = false,
  drawerOpen = false,
  header,
  inactive = false,
  label = "Рабочая область подач",
  mobileNavOpen,
  overlays = null,
  role,
  sideMenu,
  sideMenuMode,
  surface,
  workspaceInactive = false,
}: AppShellProps) {
  return (
    <main
      className={cn(
        "ops-shell",
        "has-unified-side-menu",
        "is-operational-shell-source-actions",
        `surface-${surface}`,
        collectionSurface && "is-v19-collection-surface",
        `role-${role}`,
        `is-side-menu-${sideMenuMode}`,
        drawerOpen && "has-open-drawer",
        mobileNavOpen && "is-mobile-nav-open",
        className,
      )}
      aria-label={label}
      aria-hidden={inactive ? "true" : undefined}
      inert={inactive ? true : undefined}
    >
      <OperationalSideMenu {...sideMenu} />
      <section
        className="workspace"
        aria-hidden={workspaceInactive ? "true" : undefined}
        inert={workspaceInactive ? true : undefined}
      >
        {header}
        {children}
      </section>
      {overlays}
    </main>
  );
}

type PageHeaderProps = {
  title: string;
  actions?: ReactNode;
  className?: string;
  description?: ReactNode;
  menuButton?: ReactNode;
};

export function PageHeader({
  actions = null,
  className,
  description = null,
  menuButton = null,
  title,
}: PageHeaderProps) {
  return (
    <header className={cn("topbar", "v19-page-header", className)}>
      {menuButton}
      <div className="topbar-heading">
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="v19-page-header-actions">{actions}</div> : null}
    </header>
  );
}

type PageHeaderMenuButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> & {
  closedLabel?: string;
  controls: string;
  openLabel?: string;
  open: boolean;
};

export function PageHeaderMenuButton({
  className,
  closedLabel = "Меню",
  controls,
  open,
  openLabel = "Закрыть меню",
  ...props
}: PageHeaderMenuButtonProps) {
  const label = open ? openLabel : closedLabel;
  const Icon = open ? X : Menu;

  return (
    <IconButton
      {...props}
      aria-controls={controls}
      aria-expanded={open}
      className={cn("v19-topbar-menu", className)}
      icon={<Icon aria-hidden="true" focusable="false" size={18} strokeWidth={1.9} />}
      label={label}
    />
  );
}

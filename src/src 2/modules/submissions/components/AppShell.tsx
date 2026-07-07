import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Menu, X } from "lucide-react";

import { cn } from "../../../shared/ui/cn";
import { IconButton } from "../../../shared/ui/primitives";

type AppShellProps = {
  children: ReactNode;
  header: ReactNode;
  mobileNavOpen: boolean;
  role: string;
  sidebar: ReactNode;
  sideMenuMode: "regular" | "compact";
  surface: string;
  collectionSurface?: boolean;
  drawerOpen?: boolean;
  label?: string;
  overlays?: ReactNode;
};

export function AppShell({
  children,
  collectionSurface = false,
  drawerOpen = false,
  header,
  label = "Рабочая область подач",
  mobileNavOpen,
  overlays = null,
  role,
  sidebar,
  sideMenuMode,
  surface,
}: AppShellProps) {
  return (
    <main
      className={cn(
        "ops-shell",
        "has-unified-side-menu",
        `surface-${surface}`,
        collectionSurface && "is-v19-collection-surface",
        `role-${role}`,
        `is-side-menu-${sideMenuMode}`,
        drawerOpen && "has-open-drawer",
        mobileNavOpen && "is-mobile-nav-open",
      )}
      aria-label={label}
    >
      {sidebar}
      <section className="workspace">
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
      {actions}
    </header>
  );
}

type PageHeaderMenuButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> & {
  controls: string;
  open: boolean;
};

export function PageHeaderMenuButton({
  className,
  controls,
  open,
  ...props
}: PageHeaderMenuButtonProps) {
  const label = open ? "Закрыть меню" : "Меню";
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

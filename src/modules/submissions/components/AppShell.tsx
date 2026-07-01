import type { ReactNode } from "react";

import { cn } from "../../../shared/ui/cn";

type AppShellProps = {
  children: ReactNode;
  header: ReactNode;
  mobileNavOpen: boolean;
  role: string;
  sidebar: ReactNode;
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

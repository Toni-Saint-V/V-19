import {
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ComponentProps,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { Menu, X } from "lucide-react";

import { cn } from "../../../shared/ui/cn";
import { IconButton } from "../../../shared/ui/primitives";
import {
  V19SideMenu,
  type V19SideMenuMode,
} from "../../../shared/ui/v19-design-system";

type MobileNavInitialFocus = "close-control" | "first-control";

type AppShellProps = {
  children: ReactNode;
  className?: string;
  header: ReactNode;
  inactive?: boolean;
  mobileNavInitialFocus?: MobileNavInitialFocus;
  mobileNavOpen: boolean;
  onSideMenuModeChange: (mode: V19SideMenuMode) => void;
  role: string;
  sideMenu: Omit<
    ComponentProps<typeof V19SideMenu>,
    "displayMode" | "onDisplayModeChange"
  >;
  sideMenuMode: V19SideMenuMode;
  surface: string;
  collectionSurface?: boolean;
  drawerOpen?: boolean;
  label?: string;
  overlays?: ReactNode;
  workspaceInactive?: boolean;
};

const mobileMenuFocusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function getMobileMenuFocusableElements(container: HTMLElement | null) {
  if (!container) return [];

  return Array.from(
    container.querySelectorAll<HTMLElement>(mobileMenuFocusableSelector),
  ).filter((element) => {
    const style = window.getComputedStyle(element);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      !element.closest('[aria-hidden="true"], [inert]')
    );
  });
}

function canRestoreFocus(element: HTMLElement | null): element is HTMLElement {
  if (!element?.isConnected || element.closest("[inert]")) return false;
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

export function AppShell({
  children,
  className,
  collectionSurface = false,
  drawerOpen = false,
  header,
  inactive = false,
  label = "Рабочая область подач",
  mobileNavInitialFocus = "first-control",
  mobileNavOpen,
  onSideMenuModeChange,
  overlays = null,
  role,
  sideMenu,
  sideMenuMode,
  surface,
  workspaceInactive = false,
}: AppShellProps) {
  const shellRef = useRef<HTMLElement>(null);
  const mobileNavOpenerRef = useRef<HTMLElement | null>(null);
  const mobileNavWasOpenRef = useRef(false);
  const [inactiveFocusReleased, setInactiveFocusReleased] = useState(false);
  const shellInactiveRequested = inactive || workspaceInactive;

  useLayoutEffect(() => {
    if (!shellInactiveRequested) {
      setInactiveFocusReleased(false);
      return;
    }

    const activeElement = document.activeElement;
    if (
      activeElement instanceof HTMLElement &&
      shellRef.current?.contains(activeElement)
    ) {
      activeElement.blur();
    }
    setInactiveFocusReleased(true);
  }, [shellInactiveRequested]);

  useLayoutEffect(() => {
    const wasOpen = mobileNavWasOpenRef.current;
    const sideMenuElement =
      shellRef.current?.querySelector<HTMLElement>(
        '[data-v19-component="side-menu"]',
      ) ?? null;

    if (mobileNavOpen && !wasOpen) {
      const activeElement = document.activeElement;
      mobileNavOpenerRef.current =
        activeElement instanceof HTMLElement &&
        !sideMenuElement?.contains(activeElement)
          ? activeElement
          : null;
      const focusableElements = getMobileMenuFocusableElements(sideMenuElement);
      const initialFocus =
        mobileNavInitialFocus === "close-control"
          ? (sideMenuElement?.querySelector<HTMLElement>(
              '[data-v19-side-menu-control="mobile-close"]',
            ) ?? focusableElements[0])
          : focusableElements[0];
      initialFocus?.focus({
        preventScroll: true,
      });
    } else if (!mobileNavOpen && wasOpen) {
      const opener = mobileNavOpenerRef.current;
      mobileNavOpenerRef.current = null;
      const restoreTarget = canRestoreFocus(opener)
        ? opener
        : getMobileMenuFocusableElements(sideMenuElement)[0];
      restoreTarget?.focus({ preventScroll: true });
    }

    mobileNavWasOpenRef.current = mobileNavOpen;
  }, [mobileNavInitialFocus, mobileNavOpen]);

  const shellInactive = shellInactiveRequested && inactiveFocusReleased;
  const workspaceSuppressed = workspaceInactive || mobileNavOpen;

  const handleMobileNavKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (!mobileNavOpen) return;

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      sideMenu.onCloseMobile();
      return;
    }
    if (event.key !== "Tab") return;

    const sideMenuElement =
      shellRef.current?.querySelector<HTMLElement>(
        '[data-v19-component="side-menu"]',
      ) ?? null;
    const focusableElements = getMobileMenuFocusableElements(sideMenuElement);
    const firstElement = focusableElements[0];
    const lastElement = focusableElements.at(-1);
    if (!firstElement || !lastElement) {
      event.preventDefault();
      return;
    }

    const activeElement = document.activeElement;
    if (
      event.shiftKey &&
      (activeElement === firstElement ||
        !(activeElement instanceof Node) ||
        !sideMenuElement?.contains(activeElement))
    ) {
      event.preventDefault();
      lastElement.focus({ preventScroll: true });
    } else if (
      !event.shiftKey &&
      (activeElement === lastElement ||
        !(activeElement instanceof Node) ||
        !sideMenuElement?.contains(activeElement))
    ) {
      event.preventDefault();
      firstElement.focus({ preventScroll: true });
    }
  };

  return (
    <main
      ref={shellRef}
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
      aria-hidden={shellInactive ? "true" : undefined}
      inert={shellInactive ? true : undefined}
      onKeyDown={handleMobileNavKeyDown}
    >
      <V19SideMenu
        {...sideMenu}
        displayMode={sideMenuMode}
        onDisplayModeChange={onSideMenuModeChange}
      />
      <section
        className="workspace"
        aria-hidden={workspaceSuppressed ? "true" : undefined}
        inert={workspaceSuppressed ? true : undefined}
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

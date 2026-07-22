import { useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Button } from "../../../shared/ui/primitives";
import {
  V19SideMenu,
  type V19SideMenuItem,
  type V19SideMenuMode,
} from "../../../shared/ui/v19-design-system";
import type { Role } from "../types";

export const operationalSideMenuId = "v19-operational-side-menu";
export const operationalSideMenuDesktopMinWidth = 1025;

export function OperationalSideMenu({
  ariaLabel,
  createAction,
  displayMode,
  inactive = false,
  items,
  mobileOpen,
  mobileTitle,
  sidebarId,
  mobileCloseLabel,
  onCommandSearch,
  onCloseMobile,
  onResetWorkspace,
  role,
  sessionDisplayName,
  sessionInitials,
  sessionRoleLabel,
}: {
  ariaLabel: string;
  createAction?: { label: string; onClick: () => void };
  displayMode: V19SideMenuMode;
  inactive?: boolean;
  items: V19SideMenuItem[];
  mobileOpen: boolean;
  mobileCloseLabel?: string;
  mobileTitle: string;
  onChooseRole: (role: Role) => void;
  onCommandSearch?: () => void;
  onCloseMobile: () => void;
  onResetWorkspace: () => void | Promise<void>;
  role: Role;
  sessionDisplayName: string;
  sessionInitials: string;
  sessionRoleLabel: string;
  sidebarId?: string;
  showWorkspaceSwitch: boolean;
}) {
  const signOutPendingRef = useRef(false);
  const reduceMotion = useReducedMotion();
  const [signOutPending, setSignOutPending] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const menuItems =
    role === "agent" &&
    createAction &&
    !items.some((item) => item.id === "agent-create")
      ? [
          ...items.slice(0, 2),
          {
            active: false,
            icon: "+",
            id: "agent-create",
            interactionId: "shell.create-submission",
            label: createAction.label,
            meta: "Создание подачи",
            onClick: createAction.onClick,
          },
          ...items.slice(2),
        ]
      : items;
  const navItems = menuItems.map((item) => ({
    ...item,
    onClick: () => {
      item.onClick();
      onCloseMobile();
    },
  }));
  const id = sidebarId ?? operationalSideMenuId;
  const settingsItem = items.find((item) => item.id.includes("settings"));
  const handleSignOut = async () => {
    if (signOutPendingRef.current) return;
    signOutPendingRef.current = true;
    setSignOutPending(true);
    setSignOutError("");
    try {
      await onResetWorkspace();
      onCloseMobile();
    } catch {
      setSignOutError("Не удалось выйти из аккаунта. Повторите попытку.");
    } finally {
      signOutPendingRef.current = false;
      setSignOutPending(false);
    }
  };
  const footer = (
    <>
      <Button
        data-v19-interaction-id={
          role === "agent" ? "shell.navigate-settings" : undefined
        }
        className="ops-session v19-ds-side-menu-profile v19-agent-sidebar-profile"
        aria-label="Открыть профиль"
        variant="ghost"
        onClick={() => {
          settingsItem?.onClick();
          onCloseMobile();
        }}
      >
        <span className="v19-agent-sidebar-avatar">{sessionInitials}</span>
        <div>
          <strong>{sessionDisplayName}</strong>
          <small className="v19-agent-sidebar-profile-meta">{sessionRoleLabel}</small>
        </div>
        <SlidersHorizontal
          className="ops-user-more v19-agent-sidebar-profile-icon"
          aria-hidden="true"
        />
      </Button>
      {signOutError ? (
        <p
          className="m-0 px-2 text-[12px] leading-snug text-[var(--v19b-status-danger-text)]"
          role="alert"
        >
          {signOutError}
        </p>
      ) : null}
      <Button
        data-v19-interaction-id={role === "agent" ? "shell.sign-out" : undefined}
        className="v19-ds-side-menu-signout"
        aria-label="Выйти"
        aria-busy={signOutPending || undefined}
        disabled={signOutPending}
        variant="secondary"
        onClick={() => void handleSignOut()}
      >
        {signOutPending ? "Выходим…" : "Выйти"}
      </Button>
    </>
  );

  return (
    <>
      <V19SideMenu
        ariaLabel={ariaLabel}
        brandSubtitle={role === "agent" ? "Кабинет агента" : "Кабинет администратора"}
        commandInteractionId={
          role === "agent" ? "shell.open-command-palette" : undefined
        }
        displayMode={displayMode}
        footer={footer}
        id={id}
        inactive={inactive}
        items={navItems}
        mobileCloseLabel={mobileCloseLabel}
        mobileCloseInteractionId={
          role === "agent" ? "shell.toggle-mobile-menu" : undefined
        }
        mobileOpen={mobileOpen}
        mobileTitle={mobileTitle}
        onCommandSearch={onCommandSearch}
        onMobileClose={onCloseMobile}
      />
      <AnimatePresence initial={false}>
        {mobileOpen ? (
          <motion.button
            animate={{ opacity: 1 }}
            aria-controls={id}
            aria-label="Закрыть меню"
            className="ops-mobile-menu-backdrop"
            data-v19-interaction-id={
              role === "agent" ? "shell.toggle-mobile-menu" : undefined
            }
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.18 }}
            type="button"
            onClick={onCloseMobile}
          />
        ) : null}
      </AnimatePresence>
    </>
  );
}

import { ArrowLeftRight, SlidersHorizontal } from "lucide-react";
import { Button } from "../../../shared/ui/primitives";
import {
  V19SideMenu,
  type V19SideMenuItem,
  type V19SideMenuMode,
} from "../../../shared/ui/v19-design-system";
import type { Role } from "../types";

export const operationalSideMenuId = "v19-operational-side-menu";

export function OperationalSideMenu({
  ariaLabel,
  displayMode,
  inactive = false,
  items,
  mobileOpen,
  mobileTitle,
  sidebarId,
  mobileCloseLabel,
  createAction,
  onChooseRole,
  onCommandSearch,
  onCloseMobile,
  onResetWorkspace,
  role,
  sessionDisplayName,
  sessionInitials,
  sessionRoleLabel,
  showWorkspaceSwitch,
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
  const navItems = items.map((item) => ({
    ...item,
    onClick: () => {
      item.onClick();
      onCloseMobile();
    },
  }));
  const sidebarCreateAction = createAction
    ? {
        ...createAction,
        onClick: () => {
          createAction.onClick();
          onCloseMobile();
        },
      }
    : undefined;
  const id = sidebarId ?? operationalSideMenuId;
  const settingsItem = items.find((item) => item.id.includes("settings"));
  const footer = (
    <>
      {showWorkspaceSwitch ? (
        <Button
          className="vf-figma-admin-zone"
          aria-label={role === "agent" ? "В админскую зону" : "В агентскую зону"}
          variant="secondary"
          onClick={() => {
            onChooseRole(role === "agent" ? "admin" : "agent");
            onCloseMobile();
          }}
        >
          <ArrowLeftRight aria-hidden="true" />
          {role === "agent" ? "В админскую зону" : "В агентскую зону"}
        </Button>
      ) : null}
      <Button
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
      <Button
        className="v19-ds-side-menu-signout"
        aria-label="Выйти"
        variant="secondary"
        onClick={() => {
          void onResetWorkspace();
          onCloseMobile();
        }}
      >
        Выйти
      </Button>
    </>
  );

  return (
    <>
      <V19SideMenu
        ariaLabel={ariaLabel}
        brandSubtitle={role === "agent" ? "Кабинет агента" : "Кабинет администратора"}
        createAction={sidebarCreateAction}
        displayMode={displayMode}
        footer={footer}
        id={id}
        inactive={inactive}
        items={navItems}
        mobileCloseLabel={mobileCloseLabel}
        mobileOpen={mobileOpen}
        mobileTitle={mobileTitle}
        onCommandSearch={onCommandSearch}
        onMobileClose={onCloseMobile}
      />
      {mobileOpen ? (
        <button
          className="ops-mobile-menu-backdrop"
          type="button"
          aria-label="Закрыть меню"
          aria-controls={id}
          onClick={onCloseMobile}
        />
      ) : null}
    </>
  );
}

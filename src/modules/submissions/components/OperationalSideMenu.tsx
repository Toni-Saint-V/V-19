import { ArrowLeftRight, Ellipsis } from "lucide-react";
import { Button } from "../../../shared/ui/primitives";
import type { Role } from "../types";
import {
  OperationalSidebar,
  type OperationalNavItem,
  type OperationalSideMenuMode,
} from "./OperationalNavigation";

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
  createAction?: {
    label: string;
    onClick: () => void;
  };
  displayMode: OperationalSideMenuMode;
  inactive?: boolean;
  items: OperationalNavItem[];
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
  const workspaceSwitchButton = showWorkspaceSwitch ? (
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
  ) : null;
  const footer = (
    <>
      {workspaceSwitchButton}
      <Button
        className="ops-session"
        aria-label="Выйти"
        variant="ghost"
        onClick={() => {
          void onResetWorkspace();
          onCloseMobile();
        }}
      >
        <span>{sessionInitials}</span>
        <div>
          <strong>{sessionDisplayName}</strong>
          <small>{sessionRoleLabel}</small>
        </div>
        <Ellipsis className="ops-user-more" aria-hidden="true" />
      </Button>
    </>
  );

  return (
    <>
      <OperationalSidebar
        ariaLabel={ariaLabel}
        createAction={sidebarCreateAction}
        displayMode={displayMode}
        footer={footer}
        id={sidebarId ?? operationalSideMenuId}
        inactive={inactive}
        items={navItems}
        mobileCloseLabel={mobileCloseLabel}
        mobileOpen={mobileOpen}
        onCommandSearch={onCommandSearch}
        mobileTitle={mobileTitle}
        onMobileClose={onCloseMobile}
      />
      {mobileOpen ? (
        <button
          className="ops-mobile-menu-backdrop"
          type="button"
          aria-label="Закрыть меню"
          aria-controls={sidebarId ?? operationalSideMenuId}
          onClick={onCloseMobile}
        />
      ) : null}
    </>
  );
}

import { Button } from "../../../shared/ui/primitives";
import type { Role } from "../types";
import {
  OperationalSidebar,
  type OperationalNavItem,
} from "./OperationalNavigation";

export function OperationalSideMenu({
  items,
  mobileOpen,
  mobileTitle,
  sidebarId,
  createAction,
  onChooseRole,
  onCloseMobile,
  onResetWorkspace,
  role,
  sessionDisplayName,
  sessionInitials,
  sessionRoleLabel,
  showAdminZoneSwitch,
  showRoleSwitcher,
}: {
  createAction?: {
    label: string;
    onClick: () => void;
  };
  items: OperationalNavItem[];
  mobileOpen: boolean;
  mobileTitle: string;
  onChooseRole: (role: Role) => void;
  onCloseMobile: () => void;
  onResetWorkspace: () => void | Promise<void>;
  role: Role;
  sessionDisplayName: string;
  sessionInitials: string;
  sessionRoleLabel: string;
  sidebarId?: string;
  showAdminZoneSwitch: boolean;
  showRoleSwitcher: boolean;
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
  const footer = (
    <>
      {showRoleSwitcher ? (
        <>
          {showAdminZoneSwitch ? (
            <Button
              className="vf-figma-admin-zone"
              aria-label="В админскую зону"
              variant="secondary"
              onClick={() => {
                onChooseRole("admin");
                onCloseMobile();
              }}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M7 7h10M7 7l3-3M7 7l3 3" />
                <path d="M17 17H7m10 0-3-3m3 3-3 3" />
              </svg>
              В админскую зону
            </Button>
          ) : null}
          <Button
            className="ops-session"
            aria-label="Сменить роль"
            variant="ghost"
            onClick={() => {
              onChooseRole(role === "agent" ? "admin" : "agent");
              onCloseMobile();
            }}
          >
            <span>{role === "agent" ? "ТН" : "АД"}</span>
            <div>
              <strong>
                {role === "agent" ? "Татьяна Николаева" : "Ирина Лебедева"}
              </strong>
              <small>{role === "agent" ? "Visa Center Spb" : "Админ"}</small>
            </div>
            <svg className="ops-user-more" aria-hidden="true" viewBox="0 0 24 24">
              <circle cx="5" cy="12" r="1" />
              <circle cx="12" cy="12" r="1" />
              <circle cx="19" cy="12" r="1" />
            </svg>
          </Button>
        </>
      ) : (
        <Button
          className="ops-session"
          aria-label="Выйти из рабочей области"
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
          <svg className="ops-user-more" aria-hidden="true" viewBox="0 0 24 24">
            <circle cx="5" cy="12" r="1" />
            <circle cx="12" cy="12" r="1" />
            <circle cx="19" cy="12" r="1" />
          </svg>
        </Button>
      )}
    </>
  );

  return (
    <>
      <OperationalSidebar
        createAction={sidebarCreateAction}
        footer={footer}
        id={sidebarId}
        items={navItems}
        mobileTitle={mobileTitle}
        onMobileClose={onCloseMobile}
      />
      {mobileOpen ? (
        <button
          className="ops-mobile-menu-backdrop"
          type="button"
          aria-label="Закрыть меню"
          aria-controls={sidebarId}
          onClick={onCloseMobile}
        />
      ) : null}
    </>
  );
}

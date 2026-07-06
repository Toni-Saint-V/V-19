import { Button } from "../../../shared/ui/primitives";
import type { Role } from "../types";
import {
  OperationalSidebar,
  type OperationalNavItem,
  type OperationalSideMenuMode,
} from "./OperationalNavigation";

export function OperationalSideMenu({
  displayMode,
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
  displayMode: OperationalSideMenuMode;
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
  const navItems = buildUnifiedSideMenuItems(items).map((item) => ({
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
  const adminZoneButton = showAdminZoneSwitch ? (
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
  ) : null;
  const agentZoneButton =
    null;
  const useReferenceAgentFooter = showAdminZoneSwitch && role === "agent";
  const useReferenceAdminFooter = role === "admin";
  const footerInitials = useReferenceAgentFooter
    ? "ТН"
    : useReferenceAdminFooter
      ? "ИЛ"
      : sessionInitials;
  const footerName = useReferenceAgentFooter
    ? "Татьяна Николаева"
    : useReferenceAdminFooter
      ? "Ирина Лебедева"
      : sessionDisplayName;
  const footerRole = useReferenceAgentFooter
    ? "Visa Center Spb"
    : useReferenceAdminFooter
      ? "Администратор"
      : sessionRoleLabel;
  const footer = (
    <>
      {adminZoneButton}
      {agentZoneButton}
      {showRoleSwitcher ? (
        <>
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
              <small>{role === "agent" ? "Visa Center Spb" : "Администратор"}</small>
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
          <span>{footerInitials}</span>
          <div>
            <strong>{footerName}</strong>
            <small>{footerRole}</small>
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
        displayMode={displayMode}
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

function buildUnifiedSideMenuItems(items: OperationalNavItem[]) {
  const actions = items.find((item) => item.id === "agent-actions");
  const submissions = items.find((item) => item.id === "agent-submissions");
  const settings = items.find((item) => item.id === "agent-settings");

  if (!actions || !submissions || !settings) return items;

  return [
    actions,
    {
      ...submissions,
      count: undefined,
      icon: "З",
      id: "agent-submissions-applicants",
      label: "Заявители / семейные",
      meta: "Профили",
    },
    settings,
  ];
}

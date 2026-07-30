import { readFileSync } from "node:fs";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { AppShell } from "../../src/modules/submissions/components/AppShell";
import { V19SideMenu } from "../../src/shared/ui/v19-design-system";

afterEach(cleanup);

const operationalSideMenuCss = readFileSync(
  `${process.cwd()}/src/shared/ui/operational-side-menu.css`,
  "utf8",
).replace(/\s+/g, " ");

function deferred() {
  let resolve!: () => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function renderAgentMenu({
  createAction,
  displayMode = "regular",
  onCloseMobile = vi.fn(),
  onCommandSearch,
  onDisplayModeChange,
  onResetWorkspace,
}: {
  createAction?: { active?: boolean; label: string; onClick: () => void };
  displayMode?: "regular" | "compact";
  onCloseMobile?: ReturnType<typeof vi.fn>;
  onCommandSearch?: () => void;
  onDisplayModeChange?: (mode: "regular" | "compact") => void;
  onResetWorkspace: () => void | Promise<void>;
}) {
  render(
    <V19SideMenu
      ariaLabel="Навигация агента"
      createAction={createAction}
      displayMode={displayMode}
      items={[
        {
          icon: "A",
          id: "agent-actions",
          interactionId: "shell.navigate-actions",
          label: "Мои действия",
          meta: "Очередь",
          onClick: vi.fn(),
        },
        {
          icon: "S",
          id: "agent-settings",
          label: "Настройки",
          meta: "Интерфейс",
          onClick: vi.fn(),
        },
      ]}
      mobileOpen
      mobileTitle="Меню"
      onCloseMobile={onCloseMobile}
      onCommandSearch={onCommandSearch}
      onDisplayModeChange={onDisplayModeChange}
      onResetWorkspace={onResetWorkspace}
      role="agent"
      sessionDisplayName="CODEX E2E Agent"
      sessionInitials="CE"
      sessionRoleLabel="Агент"
    />,
  );

  expect(screen.getByRole("dialog", { name: "Навигация агента" })).toHaveAttribute(
    "data-v19-component",
    "side-menu",
  );

  return { onCloseMobile };
}

function agentShell({
  mobileNavInitialFocus,
  mobileNavOpen,
  onCloseMobile,
  onSideMenuModeChange = vi.fn(),
  sideMenuMode = "regular",
}: {
  mobileNavInitialFocus?: "close-control" | "first-control";
  mobileNavOpen: boolean;
  onCloseMobile: () => void;
  onSideMenuModeChange?: (mode: "regular" | "compact") => void;
  sideMenuMode?: "regular" | "compact";
}) {
  return (
    <AppShell
      header={<button type="button">Меню</button>}
      mobileNavInitialFocus={mobileNavInitialFocus}
      mobileNavOpen={mobileNavOpen}
      onSideMenuModeChange={onSideMenuModeChange}
      role="agent"
      sideMenu={{
        ariaLabel: "Навигация агента",
        items: [
          {
            icon: "A",
            id: "agent-actions",
            interactionId: "shell.navigate-actions",
            label: "Мои действия",
            meta: "Очередь",
            onClick: vi.fn(),
          },
        ],
        mobileOpen: mobileNavOpen,
        mobileTitle: "Меню",
        onCloseMobile,
        onResetWorkspace: vi.fn(),
        role: "agent",
        sessionDisplayName: "CODEX E2E Agent",
        sessionInitials: "CE",
        sessionRoleLabel: "Агент",
      }}
      sideMenuMode={sideMenuMode}
      surface="agent-actions"
    >
      <button type="button">Действие рабочей области</button>
    </AppShell>
  );
}

describe("V19SideMenu adaptive design-system contract", () => {
  test("scopes internal selectors to the direct side-menu owner", () => {
    const owner =
      '.v19-ds-side-menu.ops-sidebar.opsu-sidebar[data-v19-component="side-menu"]';
    const ownerlessInternalSelector =
      /#root \.ops-shell\.has-unified-side-menu(?:\.is-side-menu-compact)? (?!>)(?=[^{]*(?:\.ops-mobile-screen-title|\.v19-side-menu-|\.ops-mobile-close|\.ops-nav(?:-|\b)|\.ops-sidebar-footer|\.v19-ds-side-menu-signout|\.ops-mobile-menu-backdrop))/;

    expect(operationalSideMenuCss).not.toMatch(ownerlessInternalSelector);
    expect(operationalSideMenuCss).toContain(
      `#root .ops-shell.has-unified-side-menu > ${owner} .ops-nav`,
    );
    expect(operationalSideMenuCss).toContain(
      `#root .ops-shell.has-unified-side-menu > ${owner} + .ops-mobile-menu-backdrop`,
    );
    expect(operationalSideMenuCss).toContain(
      `#root .ops-shell.has-unified-side-menu > ${owner} :is(`,
    );
    expect(operationalSideMenuCss).not.toContain(`${owner} .v19-ds-side-menu :is(`);
  });

  test("requests the compact variant from the single canonical component", () => {
    const onDisplayModeChange = vi.fn();
    renderAgentMenu({
      onDisplayModeChange,
      onResetWorkspace: vi.fn(),
    });

    fireEvent.click(screen.getByRole("button", { name: "Свернуть меню" }));

    expect(onDisplayModeChange).toHaveBeenCalledWith("compact");
    expect(onDisplayModeChange).toHaveBeenCalledTimes(1);
  });

  test("renders compact navigation labels for the visual flyout", () => {
    renderAgentMenu({
      displayMode: "compact",
      onResetWorkspace: vi.fn(),
    });

    expect(
      screen.getByText("Мои действия", {
        selector: ".v19-side-menu-compact-flyout strong",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Очередь", {
        selector: ".v19-side-menu-compact-flyout small",
      }),
    ).toBeInTheDocument();
  });

  test("exposes the project command search and role-specific section label", () => {
    const onCommandSearch = vi.fn();
    renderAgentMenu({
      onCommandSearch,
      onResetWorkspace: vi.fn(),
    });

    expect(screen.getByText("РАБОТА")).toBeInTheDocument();
    expect(screen.getByText("Поиск")).toBeInTheDocument();
    const searchButton = screen.getByRole("button", {
      name: "Открыть командную палитру",
    });
    expect(searchButton).toHaveAttribute("aria-keyshortcuts", "Meta+K Control+K");

    fireEvent.click(searchButton);
    expect(onCommandSearch).toHaveBeenCalledTimes(1);
  });

  test("keeps the create action functional and outside primary navigation", () => {
    const onCreate = vi.fn();
    renderAgentMenu({
      createAction: {
        label: "Новая подача",
        onClick: onCreate,
      },
      onResetWorkspace: vi.fn(),
    });

    expect(
      within(
        screen.getByRole("navigation", { name: "Операционные разделы" }),
      ).queryByRole("button", { name: "Новая подача" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Новая подача" }));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });
});

describe("AppShell mobile side-menu focus lifecycle", () => {
  test("traps focus, closes exactly once on Escape, suppresses the workspace, and restores the trigger", () => {
    const onCloseMobile = vi.fn();
    const { rerender } = render(agentShell({ mobileNavOpen: false, onCloseMobile }));
    const trigger = screen.getByRole("button", { name: "Меню" });
    trigger.focus();

    rerender(agentShell({ mobileNavOpen: true, onCloseMobile }));

    const dialog = screen.getByRole("dialog", { name: "Навигация агента" });
    const firstControl = within(dialog).getByRole("button", {
      name: "Открыть профиль",
    });
    const lastControl = within(dialog).getByRole("button", { name: "Выйти" });
    const workspace = screen
      .getByRole("main", { name: "Рабочая область подач" })
      .querySelector<HTMLElement>(".workspace");

    expect(firstControl).toHaveFocus();
    expect(workspace).toHaveAttribute("aria-hidden", "true");
    expect(workspace).toHaveAttribute("inert");

    lastControl.focus();
    fireEvent.keyDown(lastControl, { key: "Tab" });
    expect(firstControl).toHaveFocus();

    fireEvent.keyDown(firstControl, { key: "Tab", shiftKey: true });
    expect(lastControl).toHaveFocus();

    fireEvent.keyDown(lastControl, { key: "Escape" });
    expect(onCloseMobile).toHaveBeenCalledTimes(1);

    rerender(agentShell({ mobileNavOpen: false, onCloseMobile }));

    expect(trigger).toHaveFocus();
    expect(workspace).not.toHaveAttribute("aria-hidden");
    expect(workspace).not.toHaveAttribute("inert");
  });

  test("keeps display mode controlled and forwards one mode-change request", () => {
    const onCloseMobile = vi.fn();
    const onSideMenuModeChange = vi.fn();
    const { rerender } = render(
      agentShell({
        mobileNavOpen: false,
        onCloseMobile,
        onSideMenuModeChange,
        sideMenuMode: "regular",
      }),
    );
    const sideMenu = screen.getByRole("complementary", {
      name: "Навигация агента",
    });
    expect(sideMenu).toHaveAttribute("data-side-menu-mode", "regular");

    fireEvent.click(screen.getByRole("button", { name: "Свернуть меню" }));
    expect(onSideMenuModeChange).toHaveBeenCalledWith("compact");
    expect(onSideMenuModeChange).toHaveBeenCalledTimes(1);
    expect(sideMenu).toHaveAttribute("data-side-menu-mode", "regular");

    rerender(
      agentShell({
        mobileNavOpen: false,
        onCloseMobile,
        onSideMenuModeChange,
        sideMenuMode: "compact",
      }),
    );
    expect(sideMenu).toHaveAttribute("data-side-menu-mode", "compact");
    expect(screen.getByRole("main", { name: "Рабочая область подач" })).toHaveClass(
      "is-side-menu-compact",
    );
  });

  test("restores focus to the desktop menu when the mobile trigger becomes hidden", () => {
    const onCloseMobile = vi.fn();
    const { rerender } = render(agentShell({ mobileNavOpen: false, onCloseMobile }));
    const trigger = screen.getByRole("button", { name: "Меню" });
    trigger.focus();

    rerender(agentShell({ mobileNavOpen: true, onCloseMobile }));
    const profile = screen.getByRole("button", { name: "Открыть профиль" });
    expect(profile).toHaveFocus();

    const mobileClose = within(
      screen.getByRole("dialog", { name: "Навигация агента" }),
    ).getByRole("button", { name: "Закрыть меню" });
    mobileClose.focus();
    mobileClose.style.display = "none";
    trigger.style.display = "none";
    rerender(agentShell({ mobileNavOpen: false, onCloseMobile }));

    expect(profile).toHaveFocus();
  });
});

describe("V19SideMenu sign out", () => {
  test("keeps the active workspace open and exposes a retry after rejection", async () => {
    const onResetWorkspace = vi
      .fn()
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce(undefined);
    const { onCloseMobile } = renderAgentMenu({ onResetWorkspace });

    fireEvent.click(screen.getByRole("button", { name: "Выйти" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Не удалось выйти из аккаунта. Повторите попытку.",
    );
    expect(onCloseMobile).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Выйти" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Выйти" }));

    await waitFor(() => expect(onResetWorkspace).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(onCloseMobile).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("coalesces a rapid double click into one sign-out request", async () => {
    const signOut = deferred();
    const onResetWorkspace = vi.fn().mockReturnValue(signOut.promise);
    const { onCloseMobile } = renderAgentMenu({ onResetWorkspace });
    const button = screen.getByRole("button", { name: "Выйти" });

    fireEvent.click(button);
    fireEvent.click(button);

    expect(onResetWorkspace).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Выйти" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Выйти" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(onCloseMobile).not.toHaveBeenCalled();

    signOut.resolve();

    await waitFor(() => expect(onCloseMobile).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Выйти" })).toBeEnabled();
  });
});

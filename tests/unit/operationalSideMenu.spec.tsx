import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { OperationalSideMenu } from "../../src/modules/submissions/components/OperationalSideMenu";

afterEach(cleanup);

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
  onCloseMobile = vi.fn(),
  onResetWorkspace,
}: {
  onCloseMobile?: ReturnType<typeof vi.fn>;
  onResetWorkspace: () => void | Promise<void>;
}) {
  render(
    <OperationalSideMenu
      ariaLabel="Навигация агента"
      displayMode="regular"
      items={[
        {
          icon: "A",
          id: "agent-actions",
          interactionId: "shell.navigate-actions",
          label: "Мои действия",
          meta: "Очередь",
          onClick: vi.fn(),
        },
      ]}
      mobileOpen
      mobileTitle="Меню"
      onChooseRole={vi.fn()}
      onCloseMobile={onCloseMobile}
      onResetWorkspace={onResetWorkspace}
      role="agent"
      sessionDisplayName="CODEX E2E Agent"
      sessionInitials="CE"
      sessionRoleLabel="Агент"
      showWorkspaceSwitch={false}
    />,
  );

  return { onCloseMobile };
}

describe("OperationalSideMenu sign out", () => {
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

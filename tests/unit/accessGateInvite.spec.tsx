import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { AccessGate } from "../../src/components/AccessGate";
import { auditAgentInteractionControls } from "../../src/modules/submissions/agentInteractionContract";

afterEach(() => {
  cleanup();
});

describe("AccessGate invite password setup", () => {
  test("deduplicates rapid login submissions", async () => {
    let resolveLogin!: () => void;
    const login = new Promise<void>((resolve) => {
      resolveLogin = resolve;
    });
    const onLogin = vi.fn(() => login);

    const view = render(
      <AccessGate
        error=""
        inviteSetupEmail=""
        recoverySetupEmail=""
        pendingSession={null}
        onCompleteInvite={vi.fn(async () => undefined)}
        onCompleteRecovery={vi.fn(async () => undefined)}
        onLogin={onLogin}
        onRegister={vi.fn(async () => undefined)}
        onResetPassword={vi.fn(async () => "")}
        onSignOut={vi.fn(async () => undefined)}
      />,
    );

    expect(auditAgentInteractionControls(view.container)).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "Уже есть доступ? Войти" }));
    expect(auditAgentInteractionControls(view.container)).toEqual([]);
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "agent@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Пароль"), {
      target: { value: "synthetic-password" },
    });
    const submit = screen.getByRole("button", { name: "Войти в кабинет" });
    fireEvent.click(submit);
    fireEvent.click(submit);

    expect(onLogin).toHaveBeenCalledTimes(1);
    expect(submit).toBeDisabled();
    resolveLogin();
    await waitFor(() => expect(submit).toBeEnabled());
  });

  test("keeps a pending session visible when sign-out fails and allows retry", async () => {
    const onSignOut = vi
      .fn()
      .mockRejectedValueOnce(new Error("Не удалось завершить сессию. Повторите попытку."))
      .mockResolvedValueOnce(undefined);

    render(
      <AccessGate
        error=""
        inviteSetupEmail=""
        recoverySetupEmail=""
        pendingSession={{
          approvalStatus: "pending",
          companyName: "CODEX E2E",
          createdAt: "2026-07-22T00:00:00.000Z",
          email: "pending.agent@example.test",
          fullName: "CODEX E2E AGENT",
          role: "agent",
          status: "pending",
          userId: "synthetic-user",
        }}
        onCompleteInvite={vi.fn(async () => undefined)}
        onCompleteRecovery={vi.fn(async () => undefined)}
        onLogin={vi.fn(async () => undefined)}
        onRegister={vi.fn(async () => undefined)}
        onResetPassword={vi.fn(async () => "")}
        onSignOut={onSignOut}
      />,
    );

    const signOut = screen.getByRole("button", { name: "Выйти" });
    fireEvent.click(signOut);
    fireEvent.click(signOut);

    expect(onSignOut).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Не удалось завершить сессию. Повторите попытку.",
    );
    expect(screen.getByRole("heading", { name: "Ожидает подтверждения" })).toBeVisible();
    await waitFor(() => expect(signOut).toBeEnabled());

    fireEvent.click(signOut);
    await waitFor(() => expect(onSignOut).toHaveBeenCalledTimes(2));
  });

  test("collects and validates the password for a Supabase access request", async () => {
    const onRegister = vi.fn(async () => undefined);

    render(
      <AccessGate
        error=""
        inviteSetupEmail=""
        recoverySetupEmail=""
        pendingSession={null}
        usesSupabase
        onCompleteInvite={vi.fn(async () => undefined)}
        onLogin={vi.fn(async () => undefined)}
        onRegister={onRegister}
        onResetPassword={vi.fn(async () => "")}
        onSignOut={vi.fn(async () => undefined)}
      />,
    );

    expect(screen.getByLabelText("Пароль", { exact: true })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Имя и фамилия"), {
      target: { value: "Test Agent" },
    });
    fireEvent.change(screen.getByLabelText("Агентство / компания"), {
      target: { value: "Test Company" },
    });
    fireEvent.change(screen.getByLabelText("Город"), {
      target: { value: "Москва" },
    });
    fireEvent.change(screen.getByLabelText("Телефон"), {
      target: { value: "+7 900 000-00-00" },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "new.agent@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Пароль", { exact: true }), {
      target: { value: "short" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Подать заявку на доступ" }));

    expect(
      await screen.findByText("Пароль должен содержать не меньше 12 символов"),
    ).toBeVisible();
    expect(onRegister).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Пароль", { exact: true }), {
      target: { value: "Unique-E2E-password-2026" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Подать заявку на доступ" }));

    await waitFor(() => expect(onRegister).toHaveBeenCalledTimes(1));
    expect(onRegister.mock.calls[0]?.[0]).toMatchObject({
      email: "new.agent@example.test",
      password: "Unique-E2E-password-2026",
    });
  });

  test("requires matching passwords and returns to ordinary login after setup", async () => {
    const onCompleteInvite = vi.fn(async () => undefined);

    render(
      <AccessGate
        error=""
        inviteSetupEmail="invite.user@example.test"
        recoverySetupEmail=""
        pendingSession={null}
        onCompleteInvite={onCompleteInvite}
        onLogin={vi.fn(async () => undefined)}
        onRegister={vi.fn(async () => undefined)}
        onResetPassword={vi.fn(async () => "")}
        onSignOut={vi.fn(async () => undefined)}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Создайте пароль" }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Новый пароль"), {
      target: { value: "Unique-E2E-password-2026" },
    });
    fireEvent.change(screen.getByLabelText("Повторите пароль"), {
      target: { value: "different-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить пароль" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Пароли не совпадают");
    expect(onCompleteInvite).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Повторите пароль"), {
      target: { value: "Unique-E2E-password-2026" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить пароль" }));

    await waitFor(() => {
      expect(onCompleteInvite).toHaveBeenCalledWith("Unique-E2E-password-2026");
    });
    expect(await screen.findByRole("heading", { name: "Вход" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Пароль сохранён");
  });
});

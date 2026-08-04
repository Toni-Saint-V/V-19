import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { AccessGate } from "../../src/components/AccessGate";
import { auditAgentInteractionControls } from "../../src/modules/submissions/agentInteractionContract";

afterEach(cleanup);

const commonProps = {
  error: "",
  inviteSetupEmail: "",
  recoverySetupEmail: "",
  pendingSession: null,
  onCompleteInvite: vi.fn(async () => undefined),
  onCompleteRecovery: vi.fn(async () => undefined),
  onLogin: vi.fn(async () => undefined),
  onRegister: vi.fn(async () => undefined),
  onResetPassword: vi.fn(async () => ""),
  onSignOut: vi.fn(async () => undefined),
};

describe("AccessGate invite password setup", () => {
  test("deduplicates rapid login submissions", async () => {
    let resolveLogin!: () => void;
    const login = new Promise<void>((resolve) => {
      resolveLogin = resolve;
    });
    const onLogin = vi.fn(() => login);

    const view = render(<AccessGate {...commonProps} onLogin={onLogin} />);
    expect(auditAgentInteractionControls(view.container)).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "Уже есть доступ? Войти" }));
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

  test("shows a pending request without exposing a product workspace", () => {
    render(
      <AccessGate
        {...commonProps}
        pendingSession={{
          approvalStatus: "pending",
          companyName: "Visa Test",
          createdAt: "2026-08-04T00:00:00.000Z",
          email: "pending.agent@example.test",
          fullName: "Pending Agent",
          role: "agent",
          status: "pending",
          userId: "pending-pending.agent@example.test",
        }}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Ожидает подтверждения" }),
    ).toBeVisible();
    expect(screen.queryByText("Мои действия")).not.toBeInTheDocument();
  });

  test("submits a Supabase access request without asking for a password", async () => {
    const onRegister = vi.fn(async () => undefined);
    render(
      <AccessGate {...commonProps} usesSupabase onRegister={onRegister} />,
    );

    expect(screen.queryByLabelText("Пароль", { exact: true })).not.toBeInTheDocument();
    expect(screen.getByText(/защищённую ссылку для создания пароля/)).toBeVisible();

    for (const [label, value] of [
      ["Имя и фамилия", "Test Agent"],
      ["Агентство / компания", "Test Company"],
      ["Город", "Москва"],
      ["Телефон", "+7 900 000-00-00"],
      ["Email", "new.agent@example.test"],
    ] as const) {
      fireEvent.change(screen.getByLabelText(label, { exact: true }), {
        target: { value },
      });
    }
    fireEvent.click(screen.getByRole("button", { name: "Подать заявку на доступ" }));

    await waitFor(() => expect(onRegister).toHaveBeenCalledTimes(1));
    expect(onRegister).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "new.agent@example.test",
        password: "",
      }),
    );
  });

  test("requires mailbox invite ownership before setting a password", async () => {
    const onCompleteInvite = vi.fn(async () => undefined);
    render(
      <AccessGate
        {...commonProps}
        inviteSetupEmail="invite.user@example.test"
        onCompleteInvite={onCompleteInvite}
      />,
    );

    expect(screen.getByRole("heading", { name: "Создайте пароль" })).toBeVisible();
    fireEvent.change(screen.getByLabelText("Новый пароль"), {
      target: { value: "Unique-E2E-password-2026" },
    });
    fireEvent.change(screen.getByLabelText("Повторите пароль"), {
      target: { value: "Unique-E2E-password-2026" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить пароль" }));

    await waitFor(() =>
      expect(onCompleteInvite).toHaveBeenCalledWith("Unique-E2E-password-2026"),
    );
    expect(await screen.findByRole("heading", { name: "Вход" })).toBeVisible();
  });
});

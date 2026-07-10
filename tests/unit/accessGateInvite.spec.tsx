import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { AccessGate } from "../../src/components/AccessGate";

afterEach(() => {
  cleanup();
});

describe("AccessGate invite password setup", () => {
  test("does not collect an unused password for a Supabase access request", async () => {
    const onRegister = vi.fn(async () => undefined);

    render(
      <AccessGate
        error=""
        inviteSetupEmail=""
        pendingSession={null}
        usesSupabase
        onCompleteInvite={vi.fn(async () => undefined)}
        onLogin={vi.fn(async () => undefined)}
        onRegister={onRegister}
        onResetPassword={vi.fn(async () => "")}
        onSignOut={vi.fn(async () => undefined)}
      />,
    );

    expect(screen.queryByLabelText("Пароль", { exact: true })).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "Подать заявку на доступ" }));

    await waitFor(() => expect(onRegister).toHaveBeenCalledTimes(1));
    expect(onRegister.mock.calls[0]?.[0]).toMatchObject({
      email: "new.agent@example.test",
      password: "",
    });
  });

  test("requires matching passwords and returns to ordinary login after setup", async () => {
    const onCompleteInvite = vi.fn(async () => undefined);

    render(
      <AccessGate
        error=""
        inviteSetupEmail="invite.user@example.test"
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

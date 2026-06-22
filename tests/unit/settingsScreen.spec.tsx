import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import SettingsScreen from "../../src/modules/submissions/pages/SettingsScreen";

const baseSettings = {
  compactLists: true,
  digest: "instant" as const,
  drawerHints: true,
};

function renderSettings(
  overrides: Partial<Parameters<typeof SettingsScreen>[0]> = {},
) {
  const props: Parameters<typeof SettingsScreen>[0] = {
    confirmLeave: false,
    dirty: false,
    email: "admin@visaflow.local",
    isSupabaseMode: false,
    onCancelLeave: vi.fn(),
    onConfirmLeave: vi.fn(),
    onReset: vi.fn(),
    onSave: vi.fn(),
    onSettings: vi.fn(),
    onSignOut: vi.fn(),
    role: "admin",
    saveState: "idle",
    settings: baseSettings,
    ...overrides,
  };

  render(<SettingsScreen {...props} />);

  return props;
}

afterEach(() => {
  cleanup();
});

describe("SettingsScreen", () => {
  test("exposes access context and keeps email in a dedicated full-width cell", () => {
    renderSettings();

    const headerState = screen.getByLabelText("Состояние рабочего места");
    const summary = screen.getByLabelText("Параметры рабочего места");

    expect(headerState).toHaveTextContent("Администратор");
    expect(headerState).toHaveTextContent("Локальный демо-режим");
    expect(headerState).toHaveTextContent("Без изменений");
    expect(summary).toHaveTextContent("Администратор");
    expect(summary).toHaveTextContent("Локальный демо-режим");
    expect(summary).toHaveTextContent("admin@visaflow.local");
    expect(screen.getByText("Почта").parentElement).toHaveClass(
      "settings-access-email",
    );
  });

  test("announces dirty, saved, and disabled save states", () => {
    const dirtyProps = renderSettings({ dirty: true });

    expect(screen.getByLabelText("Состояние рабочего места")).toHaveTextContent(
      "Есть изменения",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Есть несохранённые изменения",
    );
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(dirtyProps.onSave).toHaveBeenCalledTimes(1);

    cleanup();
    renderSettings({ dirty: false, saveState: "saved" });

    expect(screen.getByLabelText("Состояние рабочего места")).toHaveTextContent(
      "Сохранено",
    );
    expect(screen.getByRole("status")).toHaveTextContent("Настройки сохранены");
    expect(screen.getByRole("button", { name: "Отменить" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeDisabled();
  });

  test("keeps leave confirmation keyboard-safe", () => {
    const props = renderSettings({ confirmLeave: true, dirty: true });
    const dialog = screen.getByRole("dialog", { name: "Уйти без сохранения?" });

    expect(screen.getByRole("button", { name: "Остаться" })).toHaveFocus();

    fireEvent.keyDown(dialog, { key: "Escape" });

    expect(props.onCancelLeave).toHaveBeenCalledTimes(1);
    expect(props.onConfirmLeave).not.toHaveBeenCalled();
  });
});

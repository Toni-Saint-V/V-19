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
  test("renders prototype settings sections and profile context", () => {
    renderSettings();

    const sections = screen.getByRole("navigation", {
      name: "Разделы настроек",
    });

    expect(sections).toHaveTextContent("Профиль");
    expect(sections).toHaveTextContent("Команда и роли");
    expect(sections).toHaveTextContent("Уведомления");
    expect(sections).toHaveTextContent("Выгрузка");
    expect(sections).toHaveTextContent("Интерфейс");
    expect(screen.getByRole("heading", { name: "Уведомления" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Профиль" }));

    expect(screen.getByRole("heading", { name: "Профиль" })).toBeVisible();
    expect(screen.getByDisplayValue("Ирина Лебедева")).toBeVisible();
    expect(screen.getByDisplayValue("admin@visaflow.local")).toBeVisible();
  });

  test("keeps agent settings scoped to profile, notifications, and interface", () => {
    renderSettings({ role: "agent" });

    const sections = screen.getByRole("navigation", {
      name: "Разделы настроек",
    });

    expect(sections).toHaveTextContent("Профиль");
    expect(sections).toHaveTextContent("Уведомления");
    expect(sections).toHaveTextContent("Интерфейс");
    expect(sections).not.toHaveTextContent("Команда и роли");
    expect(sections).not.toHaveTextContent("Выгрузка");
  });

  test("updates notification and interface settings through prototype controls", () => {
    const props = renderSettings({ role: "agent" });

    fireEvent.click(screen.getByRole("switch", { name: "Возврат подачи" }));
    expect(props.onSettings).toHaveBeenCalledWith({ digest: "daily" });

    fireEvent.click(screen.getByRole("switch", { name: "Новые замечания" }));
    expect(props.onSettings).toHaveBeenCalledWith({ drawerHints: false });
    expect(screen.getByRole("switch", { name: "Ошибки выгрузки" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Интерфейс" }));
    fireEvent.change(screen.getByLabelText("Плотность списков"), {
      target: { value: "comfortable" },
    });
    expect(props.onSettings).toHaveBeenCalledWith({ compactLists: false });

    expect(screen.getByRole("button", { name: "Тёмная" })).toBeDisabled();
  });

  test("keeps admin-only export and role controls disabled", () => {
    renderSettings();

    fireEvent.click(screen.getByRole("button", { name: "Команда и роли" }));
    expect(
      screen.getByRole("switch", { name: "Строгое разделение ролей" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Администратор" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Выгрузка" }));
    expect(screen.getByDisplayValue("VF_{city}_{date}_{batch}")).toBeVisible();
    expect(screen.getByRole("switch", { name: "Fail closed" })).toBeDisabled();
  });

  test("allows profile sign out action from settings profile section", () => {
    const props = renderSettings();

    fireEvent.click(screen.getByRole("button", { name: "Профиль" }));
    fireEvent.click(
      screen.getByRole("button", {
        name: props.isSupabaseMode ? "Выйти" : "Сбросить почту",
      }),
    );

    expect(props.onSignOut).toHaveBeenCalledTimes(1);
  });

  test("announces dirty, saved, and disabled save states", () => {
    const dirtyProps = renderSettings({ dirty: true });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Есть несохранённые изменения",
    );
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(dirtyProps.onSave).toHaveBeenCalledTimes(1);

    cleanup();
    renderSettings({ dirty: false, saveState: "saved" });

    expect(screen.getByRole("status")).toHaveTextContent("Настройки сохранены");
    expect(screen.queryByRole("button", { name: "Отменить" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Сохранить" })).toBeNull();
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

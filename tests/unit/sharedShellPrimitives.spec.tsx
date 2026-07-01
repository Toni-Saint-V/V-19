import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  BottomSheet,
  StatusTabs,
} from "../../src/shared/ui/primitives";
import {
  ContextPanel,
  PanelActionFooter,
} from "../../src/modules/submissions/components/CollectionPrimitives";

afterEach(() => {
  cleanup();
});

describe("shared shell primitives", () => {
  test("announces active status tabs and keeps keyboard/click selection wired", () => {
    const handleChange = vi.fn();

    render(
      <StatusTabs
        ariaLabel="Статус"
        tabs={[
          { count: 2, id: "open", label: "Открытые" },
          { count: 1, id: "done", label: "Готово" },
        ]}
        value="open"
        onValueChange={handleChange}
      />,
    );

    expect(screen.getByRole("tab", { name: /Открытые/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    fireEvent.click(screen.getByRole("tab", { name: /Готово/ }));

    expect(handleChange).toHaveBeenCalledWith("done");
  });

  test("renders a shared bottom sheet with labelled close and sticky footer slot", () => {
    const handleClose = vi.fn();

    render(
      <BottomSheet
        footer={<button type="button">Применить</button>}
        open
        title="Фильтры"
        onClose={handleClose}
      >
        <button type="button">Требуют действия</button>
      </BottomSheet>,
    );

    expect(screen.getByRole("dialog", { name: "Фильтры" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));

    expect(handleClose).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Применить" })).toBeInTheDocument();
  });

  test("keeps context panel body scroll and disabled footer reason accessible", () => {
    render(
      <ContextPanel
        footer={
          <PanelActionFooter
            primary={{
              disabled: true,
              disabledReason: "Выберите хотя бы одну подачу",
              label: "Сформировать Excel",
              onClick: () => undefined,
            }}
          />
        }
        label="Контекст выгрузки"
      >
        <p>Контракт строк</p>
      </ContextPanel>,
    );

    const action = screen.getByRole("button", { name: "Сформировать Excel" });
    const reasonId = action.getAttribute("aria-describedby");

    expect(action).toBeDisabled();
    expect(reasonId).toBeTruthy();
    expect(document.getElementById(reasonId ?? "")).toHaveTextContent(
      "Выберите хотя бы одну подачу",
    );
    expect(screen.getByText("Контракт строк").closest(".v19-context-panel-body"))
      .not.toBeNull();
  });
});

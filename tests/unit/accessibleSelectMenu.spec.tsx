import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { AccessibleSelectMenu } from "../../src/shared/ui/AccessibleSelectMenu";

const options = [
  {
    description: "Готово · 43 из 43",
    label: "Anton Volkov",
    tone: "muted" as const,
    value: "anton",
  },
  {
    description: "Есть замечание · 19 из 43",
    label: "Maria Volkova",
    tone: "warning" as const,
    value: "maria",
  },
];

describe("AccessibleSelectMenu", () => {
  test("shows a completed applicant as a muted option", () => {
    render(
      <AccessibleSelectMenu
        ariaLabel="Выбрать туриста"
        onValueChange={vi.fn()}
        options={options}
        value="maria"
        variant="questionnaire-tourist"
      />,
    );

    fireEvent.click(screen.getByLabelText("Выбрать туриста"));

    const completeOption = screen.getByRole("option", {
      name: /Anton Volkov\s*Готово · 43 из 43/iu,
    });
    expect(completeOption).toHaveClass("is-tone-muted");
  });

  test("supports keyboard selection without a native select", () => {
    const onValueChange = vi.fn();
    render(
      <AccessibleSelectMenu
        ariaLabel="Город подачи"
        onValueChange={onValueChange}
        options={[
          { label: "Москва", value: "Москва" },
          { label: "Казань", value: "Казань" },
        ]}
        value=""
        variant="city"
      />,
    );

    const trigger = screen.getByRole("combobox", { name: "Город подачи" });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(trigger, { key: "Enter" });

    expect(onValueChange).toHaveBeenCalledWith("Казань");
  });
});

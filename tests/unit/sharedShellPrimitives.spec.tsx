import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { BottomSheet, StatusTabs } from "../../src/shared/ui/primitives";
import {
  ContextPanel,
  PanelActionFooter,
} from "../../src/modules/submissions/components/CollectionPrimitives";
import {
  V19MetricCard,
  V19MetricStrip,
  V19OperationalCard,
  V19OperationalCardGrid,
  V19PriorityHero,
} from "../../src/shared/ui/v19-design-system";

function TestIcon() {
  return <svg aria-hidden="true" />;
}

afterEach(() => {
  cleanup();
});

describe("shared shell primitives", () => {
  test("owns operational metrics through one canonical design-system class", () => {
    const { container } = render(
      <V19MetricStrip>
        <V19MetricCard detail="в работе" icon={TestIcon} label="Открыто" value={26} />
      </V19MetricStrip>,
    );

    const strip = container.querySelector('[data-v19-component="operational-metrics"]');
    expect(strip).toHaveClass("v19-metric-strip");
    expect(strip).not.toHaveClass("v19-admin-metric-strip", "v19-operational-metrics");
    expect(container.querySelector(".v19-summary-tile")).not.toBeInTheDocument();
    expect(container.querySelector(".v19-metric-card")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Открыто" })).toBeInTheDocument();
  });

  test("keeps the priority hero informational and makes only the flame trigger actionable", () => {
    const handleAction = vi.fn();

    const { container } = render(
      <V19PriorityHero
        actionAriaLabel="Открыть блокеры"
        actionCount={0}
        hasBlockers={false}
        title="Очередь готова к работе"
        onAction={handleAction}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Открыть блокеры" });
    expect(
      container.querySelector('[data-v19-component="priority-hero"]'),
    ).toHaveClass("v19-priority-hero");
    expect(container.querySelector(".v19-admin-review-hero")).not.toBeInTheDocument();
    expect(trigger).toHaveClass("v19-priority-hero-trigger");
    expect(trigger).toBeEnabled();
    expect(trigger).toHaveTextContent("0");

    fireEvent.click(trigger);
    expect(handleAction).toHaveBeenCalledTimes(1);
  });

  test("uses one two-surface operational card for agent and admin queues", () => {
    const handleOpen = vi.fn();
    const { container } = render(
      <V19OperationalCardGrid>
        <V19OperationalCard
          actionIcon={TestIcon}
          actionText="Добавить селфи 1"
          city="Москва"
          footer={
            <span className="v19-operational-card-signals">
              <span className="tone-warning">Нужно добавить</span>
            </span>
          }
          peopleCount={2}
          publicId="VF-1060"
          title="ANTON VOLKOV"
          onClick={handleOpen}
        />
      </V19OperationalCardGrid>,
    );

    expect(
      container.querySelector('[data-v19-component="operational-card-grid"]'),
    ).toHaveClass("v19-operational-card-grid");
    expect(
      container.querySelector('[data-v19-component="operational-card"]'),
    ).toHaveClass("v19-operational-card");
    expect(screen.getByText("Следующий шаг")).toBeInTheDocument();
    expect(screen.getByText("Добавить селфи 1")).toBeInTheDocument();
    expect(container.querySelector(".v19-admin-review-card")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /ANTON VOLKOV/ }));
    expect(handleOpen).toHaveBeenCalledTimes(1);
  });

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
    expect(
      screen.getByText("Контракт строк").closest(".v19-context-panel-body"),
    ).not.toBeNull();
  });
});

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AgentActionsCommandCockpit } from "../../src/modules/submissions/components/AgentActionsCommandCockpit";
import {
  agentActionQueue,
  buildAgentActionTasks,
  summarizeAgentActionTasks,
} from "../../src/modules/submissions/agentActions";
import { initialSubmissions } from "../../src/modules/submissions/mockData";

describe("AgentActionsCommandCockpit", () => {
  it("keeps exactly one desktop task expanded and moves detail with selection", () => {
    const queue = agentActionQueue(initialSubmissions);
    const tasks = buildAgentActionTasks([...queue.open, ...queue.completed]).slice(0, 2);
    const firstTask = tasks[0];
    const secondTask = tasks[1];

    if (!firstTask || !secondTask) {
      throw new Error("Expected at least two action tasks in the local-demo seed.");
    }

    const onOpenPrimary = vi.fn();
    const onOpenSecondary = vi.fn();
    const onSelectTask = vi.fn();
    const props = {
      actionGroupLabel: "Открытые действия",
      desktopContextMode: "inline" as const,
      emptyState: { action: "Новая подача", body: "Нет действий", title: "Пусто" },
      summary: summarizeAgentActionTasks(tasks),
      tasks,
      onEmptyAction: vi.fn(),
      onOpenIssue: vi.fn(),
      onOpenPrimary,
      onOpenSecondary,
      onOpenTab: vi.fn(),
      onSelectTask,
    };

    const { rerender } = render(
      <AgentActionsCommandCockpit {...props} selectedTask={firstTask} />,
    );

    const rows = screen.getAllByTestId("agent-action-queue-item");
    expect(rows[0]).toHaveAttribute("aria-expanded", "true");
    expect(rows[1]).toHaveAttribute("aria-expanded", "false");
    expect(screen.getAllByTestId("agent-action-inline-detail")).toHaveLength(1);

    const firstDetail = screen.getByTestId("agent-action-inline-detail");
    expect(firstDetail).toHaveAttribute("data-agent-action-id", firstTask.id);
    expect(rows[0]?.nextElementSibling).toBe(firstDetail);

    fireEvent.click(rows[1]);

    expect(onSelectTask).toHaveBeenCalledWith(secondTask);
    expect(onOpenPrimary).not.toHaveBeenCalled();
    expect(onOpenSecondary).not.toHaveBeenCalled();

    rerender(<AgentActionsCommandCockpit {...props} selectedTask={secondTask} />);

    const updatedRows = screen.getAllByTestId("agent-action-queue-item");
    const secondDetail = screen.getByTestId("agent-action-inline-detail");
    expect(updatedRows[0]).toHaveAttribute("aria-expanded", "false");
    expect(updatedRows[1]).toHaveAttribute("aria-expanded", "true");
    expect(secondDetail).toHaveAttribute("data-agent-action-id", secondTask.id);
    expect(updatedRows[1]?.nextElementSibling).toBe(secondDetail);

    fireEvent.click(within(secondDetail).getByRole("button", { name: /Открыть подачу/ }));
    expect(onOpenSecondary).toHaveBeenCalledWith(secondTask);
  });

  it("explains a disabled primary action inside the inline detail", () => {
    const queue = agentActionQueue(initialSubmissions);
    const tasks = buildAgentActionTasks([...queue.open, ...queue.completed]);
    const task = tasks[0];

    if (!task) {
      throw new Error("Expected an action task in the local-demo seed.");
    }

    const blockedTask = { ...task, status: "blocked" as const };

    render(
      <AgentActionsCommandCockpit
        actionGroupLabel="Открытые действия"
        desktopContextMode="inline"
        emptyState={{ action: "Новая подача", body: "Нет действий", title: "Пусто" }}
        selectedTask={blockedTask}
        summary={summarizeAgentActionTasks([blockedTask])}
        tasks={[blockedTask]}
        onEmptyAction={vi.fn()}
        onOpenIssue={vi.fn()}
        onOpenPrimary={vi.fn()}
        onOpenSecondary={vi.fn()}
        onOpenTab={vi.fn()}
        onSelectTask={vi.fn()}
      />,
    );

    const primaryAction = within(
      screen.getByTestId("agent-action-inline-detail"),
    ).getByRole("button", { name: blockedTask.nextAction.primaryLabel });

    expect(primaryAction).toBeDisabled();
    expect(primaryAction).toHaveAccessibleDescription(
      "Действие недоступно: агент ждёт внешнее событие.",
    );
  });

  it("opens the submission drawer directly from a mobile action card", () => {
    const queue = agentActionQueue(initialSubmissions);
    const task = buildAgentActionTasks([...queue.open, ...queue.completed])[0];

    if (!task) {
      throw new Error("Expected an action task in the local-demo seed.");
    }

    const onOpenSecondary = vi.fn();
    const onSelectTask = vi.fn();

    render(
      <AgentActionsCommandCockpit
        actionGroupLabel="Открытые действия"
        emptyState={{ action: "Новая подача", body: "Нет действий", title: "Пусто" }}
        summary={summarizeAgentActionTasks([task])}
        tasks={[task]}
        onEmptyAction={vi.fn()}
        onOpenIssue={vi.fn()}
        onOpenPrimary={vi.fn()}
        onOpenSecondary={onOpenSecondary}
        onOpenTab={vi.fn()}
        onSelectTask={onSelectTask}
      />,
    );

    const mobileTimeline = screen.getByTestId("agent-action-timeline");
    fireEvent.click(
      within(mobileTimeline).getByRole("button", { name: /Открыть действие:/ }),
    );

    expect(onSelectTask).toHaveBeenCalledWith(task);
    expect(onOpenSecondary).toHaveBeenCalledWith(task);
    expect(screen.queryByTestId("agent-action-mobile-detail")).not.toBeInTheDocument();
  });
});

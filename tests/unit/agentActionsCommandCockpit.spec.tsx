import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AgentActionsCommandCockpit } from "../../src/modules/submissions/components/AgentActionsCommandCockpit";
import { retainExpandedActionTaskIds } from "../../src/modules/submissions/components/agentActionsCommandCockpitState";
import {
  agentActionQueue,
  buildAgentActionTasks,
  groupAgentActionTasksByApplicant,
  summarizeAgentActionTasks,
} from "../../src/modules/submissions/agentActions";
import { initialSubmissions } from "../../src/modules/submissions/mockData";

describe("AgentActionsCommandCockpit", () => {
  it("shows one applicant card with every action available inside", () => {
    const queue = agentActionQueue(
      initialSubmissions.filter((submission) => submission.id === "ПД-1051"),
    );
    const tasks = groupAgentActionTasksByApplicant(buildAgentActionTasks(queue.open));
    const task = tasks[0];

    expect(tasks).toHaveLength(1);
    expect(task?.applicantName).toBe("Артём Соколов");
    expect(
      [task, ...(task?.relatedTasks ?? [])].map((item) => item?.action.tab),
    ).toEqual(["questionnaire", "files"]);

    if (!task) throw new Error("Expected a grouped applicant task.");
    const onOpenPrimary = vi.fn();
    render(
      <AgentActionsCommandCockpit
        actionGroupLabel="Открытые действия"
        desktopContextMode="inline"
        emptyState={{ action: "Новая подача", body: "Нет действий", title: "Пусто" }}
        expandedTaskIds={new Set([task.id])}
        summary={summarizeAgentActionTasks(tasks)}
        tasks={tasks}
        onEmptyAction={vi.fn()}
        onOpenIssue={vi.fn()}
        onOpenPrimary={onOpenPrimary}
        onOpenSecondary={vi.fn()}
        onOpenTab={vi.fn()}
        onSelectTask={vi.fn()}
      />,
    );

    expect(screen.getAllByTestId("agent-action-queue-item")).toHaveLength(1);
    const detail = screen.getByTestId("agent-action-inline-detail");
    fireEvent.click(within(detail).getByRole("button", { name: "Добавить селфи 1" }));
    expect(onOpenPrimary).toHaveBeenCalledWith(task.relatedTasks?.[0]);
  });

  it("labels and routes multiple replacement files for the same applicant", () => {
    const source = initialSubmissions.find((submission) => submission.id === "ПД-1048");
    const maria = source?.applicants.find(
      (applicant) => applicant.fullName === "Мария Иванова",
    );
    if (!source || !maria) throw new Error("Expected returned family fixture");

    const submission = {
      ...source,
      files: source.files.map((file) =>
        file.applicantId === maria.id && file.type === "selfie_2"
          ? { ...file, status: "needs_replacement" as const }
          : file,
      ),
    };
    const queue = agentActionQueue([submission]);
    const tasks = groupAgentActionTasksByApplicant(buildAgentActionTasks(queue.open));
    const task = tasks.find((candidate) => candidate.applicantName === maria.fullName);
    const relatedTask = task?.relatedTasks?.[0];
    if (!task || !relatedTask) {
      throw new Error("Expected two grouped replacement tasks for Maria");
    }

    const onOpenPrimary = vi.fn();
    render(
      <AgentActionsCommandCockpit
        actionGroupLabel="Открытые действия"
        desktopContextMode="inline"
        emptyState={{ action: "Новая подача", body: "Нет действий", title: "Пусто" }}
        expandedTaskIds={new Set([task.id])}
        summary={summarizeAgentActionTasks(tasks)}
        tasks={tasks}
        onEmptyAction={vi.fn()}
        onOpenIssue={vi.fn()}
        onOpenPrimary={onOpenPrimary}
        onOpenSecondary={vi.fn()}
        onOpenTab={vi.fn()}
        onSelectTask={vi.fn()}
      />,
    );

    const detail = screen.getByTestId("agent-action-inline-detail");
    const selfieOne = within(detail).getByRole("button", {
      name: "Заменить селфи 1",
    });
    const selfieTwo = within(detail).getByRole("button", {
      name: "Заменить селфи 2",
    });
    expect(selfieOne).toBeVisible();
    expect(selfieTwo).toBeVisible();

    fireEvent.click(selfieOne);
    fireEvent.click(selfieTwo);
    expect(onOpenPrimary).toHaveBeenNthCalledWith(1, task);
    expect(onOpenPrimary).toHaveBeenNthCalledWith(2, relatedTask);
  });

  it("forgets expanded tasks that disappear from the current queue", () => {
    const queue = agentActionQueue(initialSubmissions);
    const tasks = buildAgentActionTasks([...queue.open, ...queue.completed]).slice(
      0,
      2,
    );
    const firstTask = tasks[0];
    const secondTask = tasks[1];

    if (!firstTask || !secondTask) {
      throw new Error("Expected at least two action tasks in the local-demo seed.");
    }

    const afterRemoval = retainExpandedActionTaskIds(
      new Set([firstTask.id, secondTask.id]),
      [secondTask],
    );
    const afterReappearance = retainExpandedActionTaskIds(afterRemoval, tasks);

    expect([...afterRemoval]).toEqual([secondTask.id]);
    expect(afterReappearance.has(firstTask.id)).toBe(false);
    expect(afterReappearance.has(secondTask.id)).toBe(true);
  });

  it("opens and closes desktop disclosures independently", () => {
    const queue = agentActionQueue(initialSubmissions);
    const tasks = buildAgentActionTasks([...queue.open, ...queue.completed]).slice(
      0,
      2,
    );
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

    const { rerender } = render(<AgentActionsCommandCockpit {...props} />);

    const rows = screen.getAllByTestId("agent-action-queue-item");
    expect(rows[0]).toHaveAttribute("aria-expanded", "false");
    expect(rows[1]).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("agent-action-inline-detail")).not.toBeInTheDocument();

    fireEvent.click(rows[0]);
    expect(onSelectTask).toHaveBeenLastCalledWith(firstTask);
    rerender(
      <AgentActionsCommandCockpit
        {...props}
        expandedTaskIds={new Set([firstTask.id])}
      />,
    );

    const firstOpenRows = screen.getAllByTestId("agent-action-queue-item");
    const firstDetail = screen.getByTestId("agent-action-inline-detail");
    expect(firstOpenRows[0]).toHaveAttribute("aria-expanded", "true");
    expect(firstDetail).toHaveAttribute("data-agent-action-id", firstTask.id);
    expect(firstOpenRows[0]?.nextElementSibling).toBe(firstDetail);

    fireEvent.click(firstOpenRows[0]);
    expect(onSelectTask).toHaveBeenLastCalledWith(firstTask);
    rerender(<AgentActionsCommandCockpit {...props} expandedTaskIds={new Set()} />);
    expect(screen.getAllByTestId("agent-action-queue-item")[0]).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByTestId("agent-action-inline-detail")).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByTestId("agent-action-queue-item")[1]);

    expect(onSelectTask).toHaveBeenLastCalledWith(secondTask);
    expect(onOpenPrimary).not.toHaveBeenCalled();
    expect(onOpenSecondary).not.toHaveBeenCalled();

    rerender(
      <AgentActionsCommandCockpit
        {...props}
        expandedTaskIds={new Set([firstTask.id, secondTask.id])}
      />,
    );

    const updatedRows = screen.getAllByTestId("agent-action-queue-item");
    const details = screen.getAllByTestId("agent-action-inline-detail");
    const secondDetail = details[1];
    if (!secondDetail) throw new Error("Expected the second independent detail.");
    expect(updatedRows[0]).toHaveAttribute("aria-expanded", "true");
    expect(updatedRows[1]).toHaveAttribute("aria-expanded", "true");
    expect(details).toHaveLength(2);
    expect(secondDetail).toHaveAttribute("data-agent-action-id", secondTask.id);
    expect(updatedRows[1]?.nextElementSibling).toBe(secondDetail);

    fireEvent.click(
      within(secondDetail).getByRole("button", { name: /Открыть подачу/ }),
    );
    expect(onOpenSecondary).toHaveBeenCalledWith(secondTask);

    fireEvent.click(updatedRows[0]);
    rerender(
      <AgentActionsCommandCockpit
        {...props}
        expandedTaskIds={new Set([secondTask.id])}
      />,
    );
    expect(screen.getAllByTestId("agent-action-queue-item")[0]).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getAllByTestId("agent-action-queue-item")[1]).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getAllByTestId("agent-action-inline-detail")).toHaveLength(1);
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

  it("opens mobile detail first and routes through its existing action", () => {
    const queue = agentActionQueue(initialSubmissions);
    const task = buildAgentActionTasks([...queue.open, ...queue.completed])[0];

    if (!task) {
      throw new Error("Expected an action task in the local-demo seed.");
    }

    const onOpenSecondary = vi.fn();
    const onSelectTask = vi.fn();

    const { rerender } = render(
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
    const disclosure = within(mobileTimeline).getByRole("button", {
      name: /Выбрать действие:/,
    });
    expect(disclosure).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(disclosure);

    expect(onSelectTask).toHaveBeenCalledWith(task);
    expect(onOpenSecondary).not.toHaveBeenCalled();

    rerender(
      <AgentActionsCommandCockpit
        actionGroupLabel="Открытые действия"
        emptyState={{ action: "Новая подача", body: "Нет действий", title: "Пусто" }}
        expandedTaskIds={new Set([task.id])}
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

    expect(
      within(screen.getByTestId("agent-action-timeline")).getByRole("button", {
        name: /Выбрать действие:/,
      }),
    ).toHaveAttribute("aria-expanded", "true");
    const mobileDetail = screen.getByTestId("agent-action-mobile-detail");
    expect(mobileDetail).toHaveAttribute("data-agent-action-id", task.id);

    fireEvent.click(
      within(mobileDetail).getByRole("button", {
        name: task.secondaryAction.label,
      }),
    );
    expect(onOpenSecondary).toHaveBeenCalledWith(task);
  });
});

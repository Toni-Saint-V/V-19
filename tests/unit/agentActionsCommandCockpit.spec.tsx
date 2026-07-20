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
  it("opens the submission drawer directly from a mobile action card", () => {
    const queue = agentActionQueue(initialSubmissions);
    const task = buildAgentActionTasks([...queue.open, ...queue.completed])[0]!;
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

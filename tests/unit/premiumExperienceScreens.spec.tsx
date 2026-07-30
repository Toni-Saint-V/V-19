import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import { AdminSystemSettingsScreen } from "../../src/components/AdminSystemSettingsScreen";
import { AdminUsersAccessScreen } from "../../src/components/AdminUsersAccessScreen";
import { initialSubmissions } from "../../src/modules/submissions/mockData";
import { CommandPalette } from "../../src/modules/submissions/components/CommandPalette";
import { WorkspaceIntelligencePulse } from "../../src/modules/submissions/components/WorkspaceIntelligencePulse";
import type { AccessRequest } from "../../src/shared/authContract";
import { experiencePreferencesStorageKey } from "../../src/shared/ui/experiencePreferences";

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

const pendingRequest: AccessRequest = {
  city: "Москва",
  companyName: "Northstar Travel",
  createdAt: "2026-07-20T12:00:00.000Z",
  email: "agent@example.test",
  fullName: "Мария Соколова",
  id: "request-1",
  phone: "+7 900 000-00-00",
  requestedRole: "agent",
  status: "pending",
  userId: "user-1",
};

describe("premium product experience screens", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.body.innerHTML = "";
  });

  test("turns access requests into an actionable admin queue", async () => {
    const onApprove = vi.fn().mockResolvedValue(undefined);
    render(
      <AdminUsersAccessScreen
        currentIdentity="qa-admin@example.test"
        onApprove={onApprove}
        onReject={vi.fn()}
        requests={[pendingRequest]}
        usesSupabase
      />,
    );

    expect(screen.getByRole("heading", { name: "Заявки и роли" })).toBeVisible();
    expect(screen.getByText("Мария Соколова")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Одобрить" }));

    await waitFor(() => expect(onApprove).toHaveBeenCalledWith("request-1"));
    expect(await screen.findByText(/доступ для мария соколова одобрен/i)).toBeVisible();
  });

  test("filters access requests without losing status context", () => {
    render(
      <AdminUsersAccessScreen
        currentIdentity="Администратор"
        requests={[
          pendingRequest,
          {
            ...pendingRequest,
            email: "approved@example.test",
            fullName: "Антон Волков",
            id: "request-2",
            status: "approved",
            userId: "user-2",
          },
        ]}
      />,
    );

    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "Антон" },
    });
    expect(screen.getByText("Совпадений нет")).toBeVisible();

    const approvedMetric = screen.getByRole("button", {
      exact: true,
      name: "Одобрено",
    });
    fireEvent.click(approvedMetric);
    expect(approvedMetric).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("tab", { name: /одобрено/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("Антон Волков")).toBeVisible();
    expect(screen.queryByText("Мария Соколова")).not.toBeInTheDocument();
  });

  test("persists visible interface preferences and applies them immediately", async () => {
    render(
      <AdminSystemSettingsScreen
        currentIdentity="qa-admin@example.test"
        usesSupabase={false}
      />,
    );

    fireEvent.click(screen.getByRole("switch", { name: "Компактная плотность" }));
    fireEvent.click(screen.getByRole("switch", { name: "Повышенный контраст" }));
    fireEvent.click(screen.getByRole("switch", { name: "AI-контекст в работе" }));

    await waitFor(() => {
      expect(document.documentElement.dataset).toMatchObject({
        v19AiContext: "off",
        v19Contrast: "high",
        v19Density: "compact",
      });
    });
    expect(window.localStorage.getItem(experiencePreferencesStorageKey)).toContain(
      '"compactDensity":true',
    );
  });

  test("opens the queue priority from the explainable AI pulse", () => {
    const onOpenSubmission = vi.fn();
    render(
      <WorkspaceIntelligencePulse
        onOpenSubmission={onOpenSubmission}
        role="admin"
        submissions={initialSubmissions}
      />,
    );

    expect(screen.getByText("AI-пульс очереди")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Открыть приоритет" }));
    expect(onOpenSubmission).toHaveBeenCalledTimes(1);
    expect(
      initialSubmissions.some(
        (submission) => submission.id === onOpenSubmission.mock.calls[0]?.[0],
      ),
    ).toBe(true);
  });

  test("exposes admin navigation and AI focus through the command palette", () => {
    const onNavigateAdminReview = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <CommandPalette
        onNavigateAdminReview={onNavigateAdminReview}
        onNavigateSettings={vi.fn()}
        onNavigateUsers={vi.fn()}
        onOpenChange={onOpenChange}
        onOpenSubmission={vi.fn()}
        open
        role="admin"
        submissions={initialSubmissions}
      />,
    );

    expect(
      screen.getByRole("dialog", { name: /командная палитра администратора/i }),
    ).toBeVisible();
    expect(screen.getByText("AI-фокус")).toBeVisible();
    fireEvent.click(screen.getByText("Очередь на проверку"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

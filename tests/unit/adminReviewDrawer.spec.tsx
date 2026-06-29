import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { AdminReviewDrawer } from "../../src/modules/submissions/components/AdminReviewDrawer";
import { initialSubmissions } from "../../src/modules/submissions/mockData";
import type { DrawerTab, IssueInput, Submission } from "../../src/modules/submissions/types";

afterEach(() => {
  cleanup();
});

Object.defineProperty(HTMLElement.prototype, "scrollTo", {
  configurable: true,
  value: vi.fn(),
});

function adminReviewSubmission(): Submission {
  const submission = initialSubmissions.find((item) => item.id === "ПД-1053");
  if (!submission) throw new Error("Expected admin review fixture.");
  return submission;
}

function renderDrawer({
  activeTab = "overview",
  onAddIssue = vi.fn(),
}: {
  activeTab?: DrawerTab;
  onAddIssue?: (input: IssueInput) => void;
} = {}) {
  return {
    onAddIssue,
    ...render(
      <AdminReviewDrawer
        activeTab={activeTab}
        issueComposerRequest={null}
        submission={adminReviewSubmission()}
        onAcceptAiSuggestion={() => undefined}
        onAction={() => undefined}
        onAddIssue={onAddIssue}
        onClose={() => undefined}
        onDismissAiSuggestion={() => undefined}
        onIssueComposerConsumed={() => undefined}
        onRunAiReview={() => undefined}
        onTab={() => undefined}
      />,
    ),
  };
}

describe("AdminReviewDrawer", () => {
  test("shows real admin review metadata and six canonical tabs", () => {
    renderDrawer();

    expect(screen.getByRole("heading", { level: 2, name: "Нина Волкова" })).toBeVisible();
    expect(screen.getAllByText("ПД-1053")[0]).toBeVisible();
    expect(screen.getAllByText("Казань")[0]).toBeVisible();
    expect(screen.getAllByText("На проверке")[0]).toBeVisible();
    expect(screen.getByText("Агент: Татьяна Николаева")).toBeVisible();

    for (const tab of ["Обзор", "Заявители", "Анкета", "Файлы", "Замечания", "История"]) {
      expect(screen.getByRole("tab", { name: new RegExp(`^${tab}`) })).toBeVisible();
    }
  });

  test("creates only canonical admin issue targets", () => {
    const onAddIssue = vi.fn();
    renderDrawer({ activeTab: "issues", onAddIssue });

    fireEvent.click(screen.getByRole("button", { name: "Добавить замечание" }));

    expect(screen.getByLabelText("Новое замечание")).toBeVisible();
    expect(screen.getByRole("button", { name: "Анкета" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Скан загранпаспорта" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Селфи" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Селфи N2" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Документ" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Скан загранпаспорта" }));
    fireEvent.click(screen.getByRole("button", { name: "Создать замечание" }));

    expect(onAddIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        fileType: "passport_scan",
        section: "Файлы",
        type: "file",
      }),
    );
  });
});

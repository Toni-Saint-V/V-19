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
  test("shows real admin review metadata and canonical review tabs", () => {
    const { container } = renderDrawer();

    expect(screen.getByRole("heading", { level: 2, name: "Нина Волкова" })).toBeVisible();
    expect(screen.getAllByText("ПД-1053")[0]).toBeVisible();
    expect(container.querySelector(".admin-review-meta")?.textContent).toContain(
      "Казань",
    );
    expect(screen.getAllByText("На проверке")[0]).toBeVisible();
    expect(container.querySelector(".admin-review-meta")?.textContent).toContain(
      "Агент: Татьяна Николаева",
    );

    for (const tab of ["Паспорт", "Селфи", "Анкета", "Замечания"]) {
      expect(screen.getByRole("tab", { name: new RegExp(`^${tab}`) })).toBeVisible();
    }
  });

  test("creates only canonical admin issue targets", () => {
    const onAddIssue = vi.fn();
    renderDrawer({ activeTab: "issues", onAddIssue });

    fireEvent.click(screen.getByRole("button", { name: "Добавить замечание" }));

    expect(screen.getByLabelText("Новое замечание")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Анкета" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Скан загранпаспорта" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Селфи" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Селфи N2" })).toBeInTheDocument();
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

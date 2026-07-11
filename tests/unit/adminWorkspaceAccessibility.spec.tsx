import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { AdminWorkspace } from "../../src/components/AdminWorkspace";
import { VisaflowBusinessBridgeProvider } from "../../src/integration/visaflowBusinessBridge";
import { initialSubmissions } from "../../src/modules/submissions/mockData";
import type { Submission } from "../../src/modules/submissions/types";

const originalInnerWidth = window.innerWidth;

function submissionFixture(
  status: Submission["status"],
  id: string,
  title: string,
): Submission {
  const source = initialSubmissions.find(
    (submission) =>
      submission.id ===
      (status === "ready_for_export" ? "ПД-1056" : "ПД-1053"),
  );
  if (!source) throw new Error("Missing admin review fixture.");

  return {
    ...source,
    completeness:
      status === "ready_for_export"
        ? { ...source.completeness, files: 100, total: 100 }
        : source.completeness,
    files:
      status === "ready_for_export"
        ? source.files.filter((file) =>
            ["passport_scan", "selfie", "selfie_2"].includes(file.type),
          )
        : source.files,
    id,
    issues: status === "ready_for_export" ? [] : source.issues,
    listTitle: title,
    status,
    title,
    exportState: status === "ready_for_export" ? "ready" : "not_ready",
  };
}

function acceptableReviewSubmission(): Submission {
  const source = submissionFixture(
    "submitted_for_review",
    "review-async-failure",
    "Асинхронная проверка",
  );

  return {
    ...source,
    completeness: { ...source.completeness, files: 100, total: 100 },
    files: source.files.filter((file) =>
      ["passport_scan", "selfie", "selfie_2"].includes(file.type),
    ),
    issues: [],
  };
}

afterEach(() => {
  cleanup();
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: originalInnerWidth,
  });
});

describe("AdminWorkspace production navigation", () => {
  test("moves canonical cards out of Review and into Export without duplication", async () => {
    const review = submissionFixture(
      "submitted_for_review",
      "review-card",
      "Только проверка",
    );
    const corrections = submissionFixture(
      "corrections_received",
      "corrections-card",
      "Только исправления",
    );
    const returned = submissionFixture(
      "returned",
      "returned-card",
      "Только агенту",
    );
    const ready = submissionFixture(
      "ready_for_export",
      "ready-card",
      "Только выгрузка",
    );

    const { container } = render(
      <AdminWorkspace
        currentEmail="qa-admin@example.test"
        onSignOut={vi.fn()}
        submissions={[review, corrections, returned, ready]}
        usesSupabase
      />,
    );

    expect(
      within(screen.getByRole("button", { name: "Проверка" })).getByText("2"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("button", { name: "Выгрузка" })).getByText("1"),
    ).toBeInTheDocument();
    expect(container.querySelector('[data-submission-id="review-card"]')).not.toBeNull();
    expect(container.querySelector('[data-submission-id="corrections-card"]')).not.toBeNull();
    expect(container.querySelector('[data-submission-id="returned-card"]')).toBeNull();
    expect(container.querySelector('[data-submission-id="ready-card"]')).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Готово" }));

    expect((await screen.findAllByText("Только выгрузка")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Только проверка")).not.toBeInTheDocument();
    expect(screen.queryByText("Только агенту")).not.toBeInTheDocument();
  });

  test("keeps the review drawer open and reports a rejected admin transition", async () => {
    const onSubmissionAction = vi.fn().mockRejectedValue(new Error("persistence failed"));
    const onAdminNavChange = vi.fn();
    const submission = acceptableReviewSubmission();
    const { container } = render(
      <VisaflowBusinessBridgeProvider
        bridge={{ onAdminNavChange, onSubmissionAction }}
      >
        <AdminWorkspace
          currentEmail="qa-admin@example.test"
          onSignOut={vi.fn()}
          submissions={[submission]}
          usesSupabase
        />
      </VisaflowBusinessBridgeProvider>,
    );

    const card = container.querySelector<HTMLButtonElement>(
      '[data-submission-id="review-async-failure"]',
    );
    if (!card) throw new Error("Review card was not rendered.");
    fireEvent.click(card);
    const acceptButton = await screen.findByRole("button", { name: "Принять" });
    fireEvent.click(acceptButton);
    fireEvent.click(acceptButton);

    expect(
      await screen.findByText(/Не удалось применить действие/),
    ).toBeInTheDocument();
    expect(onSubmissionAction).toHaveBeenCalledTimes(1);
    expect(onAdminNavChange).not.toHaveBeenCalledWith("export");
    expect(screen.getByRole("button", { name: "Принять" })).toBeInTheDocument();
  });

  test("reports rejected issue creation without an unhandled promise", async () => {
    const onAdminIssueAdd = vi.fn().mockRejectedValue(new Error("write failed"));
    const submission = acceptableReviewSubmission();
    const { container } = render(
      <VisaflowBusinessBridgeProvider bridge={{ onAdminIssueAdd }}>
        <AdminWorkspace
          currentEmail="qa-admin@example.test"
          onSignOut={vi.fn()}
          submissions={[submission]}
          usesSupabase
        />
      </VisaflowBusinessBridgeProvider>,
    );

    const card = container.querySelector<HTMLButtonElement>(
      '[data-submission-id="review-async-failure"]',
    );
    if (!card) throw new Error("Review card was not rendered.");
    fireEvent.click(card);
    fireEvent.click(
      (await screen.findAllByRole("button", { name: "Добавить замечание" }))[0]!,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Отправить замечание" }),
    );

    expect(
      await screen.findByText(/Не удалось добавить замечание/),
    ).toBeInTheDocument();
    expect(onAdminIssueAdd).toHaveBeenCalledTimes(1);
  });

  test("reports a rejected sign-out and keeps the active session UI", async () => {
    const onSignOut = vi.fn().mockRejectedValue(new Error("sign out failed"));
    render(
      <AdminWorkspace
        currentEmail="qa-admin@example.test"
        onSignOut={onSignOut}
        onSwitchWorkspace={vi.fn()}
        submissions={[]}
        usesSupabase
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Профиль администратора" }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Выйти" }));

    expect(
      await screen.findByText(/Не удалось выйти из аккаунта/),
    ).toBeInTheDocument();
    expect(onSignOut).toHaveBeenCalledTimes(1);
    expect(screen.getByText("qa-admin@example.test")).toBeInTheDocument();
  });

  test("uses real counts and identity without exposing no-op production settings", () => {
    render(
      <AdminWorkspace
        currentEmail="qa-admin@example.test"
        onSignOut={vi.fn()}
        onSwitchWorkspace={vi.fn()}
        submissions={[]}
        usesSupabase
      />,
    );

    expect(
      within(screen.getByRole("button", { name: "Проверка" })).getByText("0"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("button", { name: "Выгрузка" })).getByText("0"),
    ).toBeInTheDocument();
    expect(screen.getByText("qa-admin@example.test")).toBeInTheDocument();
    expect(screen.queryByText("Алексей Дмитриев")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Настройки" }),
    ).not.toBeInTheDocument();
  });

  test("labels the mobile menu and restores focus after Escape", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });

    render(
      <AdminWorkspace
        currentEmail="qa-admin@example.test"
        onSignOut={vi.fn()}
        submissions={[]}
        usesSupabase
      />,
    );

    const trigger = screen.getByRole("button", {
      name: "Открыть меню администратора",
    });
    expect(trigger).toHaveAttribute("type", "button");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveAttribute("aria-controls", "admin-mobile-navigation");

    trigger.focus();
    fireEvent.click(trigger);

    const dialog = await screen.findByRole("dialog", {
      name: "Меню администратора",
    });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    const closeButton = within(dialog).getByRole("button", {
      name: "Закрыть меню администратора",
    });
    await waitFor(() => expect(closeButton).toHaveFocus());

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(trigger).toHaveAttribute("aria-expanded", "false");
      expect(trigger).toHaveFocus();
    });
  });
});

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { AdminWorkspace } from "../../src/components/AdminWorkspace";
import { VisaflowBusinessBridgeProvider } from "../../src/integration/visaflowBusinessBridge";
import { initialSubmissions } from "../../src/modules/submissions/mockData";
import { addPreciseAdminIssue } from "../../src/modules/submissions/submissionActions";
import { saveCockpitSubmissionsForProfile } from "../../src/modules/submissions/supabasePersistence";
import type { Submission } from "../../src/modules/submissions/types";
import type { AppProfile } from "../../src/types/session";

const persistenceRuntime = vi.hoisted(() => ({
  rpc: vi.fn(async () => ({ error: null })),
}));

vi.mock("../../src/lib/supabase/client", () => ({
  getSupabaseClient: () => ({ rpc: persistenceRuntime.rpc }),
}));

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
  const source = initialSubmissions.find((submission) => submission.id === "ПД-1056");
  if (!source) throw new Error("Missing acceptance-ready admin review fixture.");

  return {
    ...source,
    id: "review-async-failure",
    issues: [],
    listTitle: "Асинхронная проверка",
    status: "submitted_for_review",
    exportState: "not_ready",
    title: "Асинхронная проверка",
  };
}

function productionLikePartialFamily(): Submission {
  const source = acceptableReviewSubmission();
  const sourceApplicant = source.applicants[0];
  if (!sourceApplicant) throw new Error("Missing source applicant");
  const id = "production-like-family-review";
  const applicants = Array.from({ length: 6 }, (_, index) => {
    const applicantId = `production-like-applicant-${index + 1}`;
    return {
      ...sourceApplicant,
      id: applicantId,
      fullName: `Production Family Member ${index + 1}`,
      questionnaireStatus: index < 2 ? ("complete" as const) : ("partial" as const),
      sections: sourceApplicant.sections.map((section) => ({
        ...section,
        id: `${section.id}-${index + 1}`,
        fields: section.fields.map((field) => ({
          ...field,
          id: `${field.id}-${index + 1}`,
        })),
      })),
    };
  });
  const files = applicants.flatMap((applicant) =>
    source.files.map((file) => ({
      ...file,
      applicantId: applicant.id,
      generatedFileName: `${applicant.id}-${file.type}.jpg`,
      id: `${applicant.id}-${file.type}`,
      mimeType: "image/jpeg",
      status: "pending_review" as const,
      storageAdapter: "supabase-private" as const,
      storageBucket: "submission-media",
      storagePath: `${id}/${applicant.id}/${file.type}/${applicant.id}-${file.type}.jpg`,
      uploadStatus: "uploaded" as const,
      uploadedAtIso: "2026-07-12T10:00:00.000Z",
    })),
  );

  return {
    ...source,
    agentId: "00000000-0000-4000-8000-000000000101",
    applicants,
    files,
    history: [
      {
        actorId: "00000000-0000-4000-8000-000000000101",
        at: "2026-07-12T10:00:00.000Z",
        createdAt: "2026-07-12T10:00:00.000Z",
        fromStatus: "in_progress",
        id: "production-like-submit-history",
        source: "agent",
        text: "Агент отправил подачу на проверку",
        toStatus: "submitted_for_review",
      },
    ],
    id,
    issues: [],
    title: "Production-like Family Review",
    type: "family",
    updatedAt: "2026-07-12T10:00:00.000Z",
  };
}

const adminProfile: AppProfile = {
  displayName: "Production Admin",
  email: "production-admin@example.test",
  id: "00000000-0000-4000-8000-000000000201",
  organizationName: "VisaFlow",
  role: "admin",
};

beforeEach(() => {
  persistenceRuntime.rpc.mockClear();
});

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
    const acceptButton = await screen.findByRole("button", {
      name: "Принять на выгрузку",
    });
    fireEvent.click(acceptButton);
    fireEvent.click(acceptButton);

    expect(
      await screen.findByText(/Не удалось применить действие/),
    ).toBeInTheDocument();
    expect(onSubmissionAction).toHaveBeenCalledTimes(1);
    expect(onAdminNavChange).not.toHaveBeenCalledWith("export");
    expect(
      screen.getByRole("button", { name: "Принять на выгрузку" }),
    ).toBeInTheDocument();
  });

  test("shows one contextual footer decision and keeps closing on the header icon", async () => {
    const submission = acceptableReviewSubmission();
    const { container, rerender } = render(
      <AdminWorkspace
        currentEmail="qa-admin@example.test"
        onSignOut={vi.fn()}
        submissions={[submission]}
        usesSupabase
      />,
    );

    const openDrawer = () => {
      const card = container.querySelector<HTMLButtonElement>(
        '[data-submission-id="review-async-failure"]',
      );
      if (!card) throw new Error("Review card was not rendered.");
      fireEvent.click(card);
    };

    openDrawer();
    expect(
      await screen.findByRole("button", { name: "Принять на выгрузку" }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Отправить на исправление" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Закрыть" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Закрыть проверку" }));
    const applicant = submission.applicants[0];
    if (!applicant) throw new Error("Review applicant was not rendered.");
    const withIssue = addPreciseAdminIssue(submission, {
      applicantId: applicant.id,
      comment: "Исправьте номер паспорта перед повторной проверкой.",
      field: "Номер паспорта",
      reason: "Значение не совпадает со сканом паспорта.",
      severity: "blocker",
      type: "field",
    });
    rerender(
      <AdminWorkspace
        currentEmail="qa-admin@example.test"
        onSignOut={vi.fn()}
        submissions={[withIssue]}
        usesSupabase
      />,
    );

    openDrawer();
    expect(
      await screen.findByRole("button", { name: "Отправить на исправление" }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Принять на выгрузку" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Закрыть" })).not.toBeInTheDocument();
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
      (await screen.findAllByRole("button", { name: /^Добавить замечание/ }))[0]!,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Отправить замечание" }),
    );

    expect(
      await screen.findByText(/Не удалось добавить замечание/),
    ).toBeInTheDocument();
    expect(onAdminIssueAdd).toHaveBeenCalledTimes(1);
  });

  test("persists one remark for a submitted six-person partial family", async () => {
    let submission = productionLikePartialFamily();
    const onAdminIssueAdd = vi.fn(async ({ input }: { input: Parameters<typeof addPreciseAdminIssue>[1] }) => {
      submission = addPreciseAdminIssue(submission, input, adminProfile.id);
      await saveCockpitSubmissionsForProfile(
        adminProfile,
        [submission],
        new Map([[submission.id, submission.agentId]]),
      );
    });
    const { container } = render(
      <VisaflowBusinessBridgeProvider bridge={{ onAdminIssueAdd }}>
        <AdminWorkspace
          currentEmail={adminProfile.email}
          onSignOut={vi.fn()}
          submissions={[submission]}
          usesSupabase
        />
      </VisaflowBusinessBridgeProvider>,
    );

    const card = container.querySelector<HTMLButtonElement>(
      '[data-submission-id="production-like-family-review"]',
    );
    if (!card) throw new Error("Production-like review card was not rendered.");
    fireEvent.click(card);
    fireEvent.click(
      (await screen.findAllByRole("button", { name: /^Добавить замечание/ }))[0]!,
    );
    fireEvent.change(
      await screen.findByPlaceholderText("Опишите, что именно нужно исправить..."),
      { target: { value: "Production lifecycle field correction" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Отправить замечание" }),
    );

    await waitFor(() => expect(persistenceRuntime.rpc).toHaveBeenCalledTimes(1));
    expect(onAdminIssueAdd).toHaveBeenCalledTimes(1);
    expect(persistenceRuntime.rpc).toHaveBeenCalledWith(
      "save_submission_draft",
      expect.objectContaining({ payload: expect.any(Object) }),
    );
    expect(submission.issues).toHaveLength(1);
    expect(submission.issues[0]).toMatchObject({
      comment: "Production lifecycle field correction",
      status: "open",
    });
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

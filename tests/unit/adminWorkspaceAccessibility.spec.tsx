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
import { saveAdminCockpitSubmissionsIfCurrent } from "../../src/modules/submissions/supabasePersistence";
import type { Submission } from "../../src/modules/submissions/types";
import type { AppProfile } from "../../src/types/session";
import {
  adminAcceptRequiredMediaForTest,
  adminApproveQuestionnaireForTest,
  withCanonicalPrivateMediaIdentityForTest,
} from "./helpers/questionnaireTestFill";

const persistenceRuntime = vi.hoisted(() => ({
  rpc: vi.fn(async (_name: string, args: Record<string, unknown>) => {
    const payloads = args.payloads as Array<{ submission: { id: string } }>;
    return {
      data: {
        caseRevisions: Object.fromEntries(
          payloads.map((payload) => [payload.submission.id, 1]),
        ),
        operationId: args.operation_id,
        results: [],
      },
      error: null,
    };
  }),
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
      submission.id === (status === "ready_for_export" ? "ПД-1056" : "ПД-1053"),
  );
  if (!source) throw new Error("Missing admin review fixture.");

  const fixture: Submission = {
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
  return status === "ready_for_export"
    ? adminAcceptRequiredMediaForTest(
        withCanonicalPrivateMediaIdentityForTest(fixture),
      )
    : fixture;
}

function acceptableReviewSubmission(): Submission {
  const source = initialSubmissions.find((submission) => submission.id === "ПД-1056");
  if (!source) throw new Error("Missing acceptance-ready admin review fixture.");

  return adminApproveQuestionnaireForTest({
    ...source,
    id: "review-async-failure",
    issues: [],
    listTitle: "Асинхронная проверка",
    status: "submitted_for_review",
    exportState: "not_ready",
    title: "Асинхронная проверка",
  });
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
    const returned = submissionFixture("returned", "returned-card", "Только агенту");
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
    expect(
      container.querySelector('[data-submission-id="review-card"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-submission-id="corrections-card"]'),
    ).not.toBeNull();
    expect(container.querySelector('[data-submission-id="returned-card"]')).toBeNull();
    expect(container.querySelector('[data-submission-id="ready-card"]')).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Готово" }));

    expect((await screen.findAllByText("Только выгрузка")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Только проверка")).not.toBeInTheDocument();
    expect(screen.queryByText("Только агенту")).not.toBeInTheDocument();
  });

  test("opens the passport workspace directly with its lifecycle decision", async () => {
    const onAdminReviewOpen = vi.fn();
    const onVerifyDocument = vi.fn();
    const submission = acceptableReviewSubmission();
    const { container } = render(
      <VisaflowBusinessBridgeProvider bridge={{ onAdminReviewOpen, onVerifyDocument }}>
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
    expect(
      await screen.findByRole("dialog", { name: "Сверка паспорта" }),
    ).toBeVisible();
    expect(screen.getByRole("tab", { name: "Паспорт" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "Селфи 1" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "Селфи 2" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Принять на выгрузку" })).toBeVisible();
    expect(onAdminReviewOpen).toHaveBeenCalledWith(submission.id);
    expect(onVerifyDocument).toHaveBeenCalledWith(submission.id);
  });

  test("returns to the review queue when the selected submission disappears on refresh", async () => {
    const submission = acceptableReviewSubmission();
    const onSignOut = vi.fn();
    const view = render(
      <AdminWorkspace
        currentEmail="qa-admin@example.test"
        onSignOut={onSignOut}
        submissions={[submission]}
        usesSupabase
      />,
    );

    const card = view.container.querySelector<HTMLButtonElement>(
      '[data-submission-id="review-async-failure"]',
    );
    if (!card) throw new Error("Review card was not rendered.");
    fireEvent.click(card);
    expect(
      await screen.findByRole("dialog", { name: "Сверка паспорта" }),
    ).toBeVisible();

    view.rerender(
      <AdminWorkspace
        currentEmail="qa-admin@example.test"
        onSignOut={onSignOut}
        submissions={[]}
        usesSupabase
      />,
    );

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Сверка паспорта" }),
      ).not.toBeInTheDocument();
      expect(view.container.querySelector('main[aria-hidden="true"]')).toBeNull();
    });
  });

  test("keeps the drawer to two screens and restores the queue focus on back", async () => {
    const submission = acceptableReviewSubmission();
    const { container } = render(
      <AdminWorkspace
        currentEmail="qa-admin@example.test"
        onSignOut={vi.fn()}
        submissions={[submission]}
        usesSupabase
      />,
    );

    const card = container.querySelector<HTMLButtonElement>(
      '[data-submission-id="review-async-failure"]',
    );
    if (!card) throw new Error("Review card was not rendered.");
    card.focus();
    fireEvent.click(card);

    const reviewDialog = await screen.findByRole("dialog", {
      name: "Сверка паспорта",
    });
    await waitFor(() => expect(reviewDialog).toBeVisible());
    expect(container.querySelector('main[aria-hidden="true"]')).toHaveAttribute(
      "inert",
    );
    expect(container.querySelector('aside[aria-hidden="true"]')).toHaveAttribute(
      "inert",
    );
    fireEvent.click(screen.getByRole("button", { name: "Вернуться к очереди" }));
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Сверка паспорта" }),
      ).not.toBeInTheDocument();
      expect(card).toHaveFocus();
    });
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
      await screen.findByRole("button", {
        name: "Добавить замечание: Скан загранпаспорта",
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Отправить замечание" }));

    expect(
      await screen.findByText(/Не удалось добавить замечание/),
    ).toBeInTheDocument();
    expect(onAdminIssueAdd).toHaveBeenCalledTimes(1);
  });

  test("persists one remark for a submitted six-person partial family", async () => {
    let submission = productionLikePartialFamily();
    const onAdminIssueAdd = vi.fn(
      async ({ input }: { input: Parameters<typeof addPreciseAdminIssue>[1] }) => {
        submission = addPreciseAdminIssue(submission, input, adminProfile.id);
        await saveAdminCockpitSubmissionsIfCurrent(
          adminProfile,
          [submission],
          new Map([[submission.id, submission.agentId]]),
          new Map([[submission.id, 0]]),
        );
      },
    );
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
      await screen.findByRole("button", {
        name: "Добавить замечание: Скан загранпаспорта",
      }),
    );
    fireEvent.change(
      await screen.findByPlaceholderText("Опишите, что именно нужно исправить..."),
      { target: { value: "Production lifecycle field correction" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Отправить замечание" }));

    await waitFor(() => expect(persistenceRuntime.rpc).toHaveBeenCalledTimes(1));
    expect(onAdminIssueAdd).toHaveBeenCalledTimes(1);
    expect(persistenceRuntime.rpc).toHaveBeenCalledWith(
      "save_admin_submission_batch_if_current",
      expect.objectContaining({ payloads: expect.any(Array) }),
    );
    expect(submission.issues).toHaveLength(1);
    expect(submission.issues[0]).toMatchObject({
      comment: "Production lifecycle field correction",
      status: "open",
      target: { applicantId: submission.applicants[0]?.id },
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

    fireEvent.click(screen.getByRole("button", { name: "Выйти" }));

    expect(await screen.findByText(/Не удалось выйти из аккаунта/)).toBeInTheDocument();
    expect(onSignOut).toHaveBeenCalledTimes(1);
    expect(screen.getByTitle("qa-admin@example.test")).toBeInTheDocument();
  });

  test("uses real counts and identity in the inserted admin shell", () => {
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
    expect(screen.getByTitle("qa-admin@example.test")).toBeInTheDocument();
    expect(screen.queryByText("Алексей Дмитриев")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Настройки" })).toBeVisible();
  });

  test("keeps the shared collection shell geometry across admin sections", () => {
    render(
      <AdminWorkspace
        currentEmail="qa-admin@example.test"
        onSignOut={vi.fn()}
        submissions={[]}
        usesSupabase
      />,
    );
    const workspace = screen.getByRole("main", {
      name: "Рабочая область администратора",
    });

    expect(workspace).toHaveClass("is-v19-collection-surface", "v19-admin-shell-frame");

    for (const section of ["Выгрузка", "Пользователи", "Настройки", "Проверка"]) {
      fireEvent.click(screen.getByRole("button", { name: section }));
      expect(workspace).toHaveClass("is-v19-collection-surface");
    }
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
    expect(trigger).toHaveAttribute("aria-controls", "v19-operational-side-menu");
    expect(document.querySelectorAll("#v19-operational-side-menu")).toHaveLength(1);

    trigger.focus();
    fireEvent.click(trigger);

    const dialog = await screen.findByRole("dialog", {
      name: "Меню администратора",
    });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(document.querySelectorAll("#v19-operational-side-menu")).toHaveLength(1);
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

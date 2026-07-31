import { useState } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { AdminReviewDrawer } from "../../src/components/AdminReviewDrawer";
import { ReviewScreen } from "../../src/components/AdminScreens";
import { AdminWorkspace } from "../../src/components/AdminWorkspace";
import { ReviewWorkspace } from "../../src/components/ReviewWorkspace";
import { VisaflowBusinessBridgeProvider } from "../../src/integration/visaflowBusinessBridge";
import * as mediaStorage from "../../src/modules/submissions/mediaStorage";
import { buildMediaStoragePath } from "../../src/modules/submissions/mediaStoragePolicy";
import { initialSubmissions } from "../../src/modules/submissions/mockData";
import { addPreciseAdminIssue } from "../../src/modules/submissions/submissionActions";
import { applySubmissionActionResult } from "../../src/modules/submissions/status";
import type {
  Applicant,
  Submission,
  SubmissionAction,
  SubmissionFile,
} from "../../src/modules/submissions/types";
import {
  adminAcceptRequiredMediaForTest,
  adminApprovePassportFieldsForTest,
  adminApproveQuestionnaireForTest,
  fillRequiredQuestionnaireForTest,
} from "./helpers/questionnaireTestFill";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function deferred<T>() {
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, reject: rejectPromise, resolve: resolvePromise };
}

function reviewReadySubmission(submissionId = "ПД-1056"): Submission {
  const source = initialSubmissions.find((item) => item.id === submissionId);
  if (!source) {
    throw new Error(`Expected ready export fixture ${submissionId}.`);
  }

  let submission: Submission = {
    ...source,
    exportState: "not_ready",
    issues: [],
    status: "submitted_for_review",
  };
  submission = fillRequiredQuestionnaireForTest(submission);
  submission = adminApprovePassportFieldsForTest(submission);
  submission = adminAcceptRequiredMediaForTest(submission);
  return submission;
}

function AdminReviewExportHarness({
  initialSubmission,
  onAction,
}: {
  initialSubmission: Submission;
  onAction: (payload: {
    action: SubmissionAction;
    source: "agent" | "admin";
    submissionId: string;
  }) => void;
}) {
  const [submissions, setSubmissions] = useState([initialSubmission]);

  return (
    <VisaflowBusinessBridgeProvider
      bridge={{
        onSubmissionAction: async (payload) => {
          onAction(payload);
          const currentSubmission = submissions.find(
            (submission) => submission.id === payload.submissionId,
          );
          if (!currentSubmission) throw new Error("Submission not found.");
          const result = applySubmissionActionResult(
            currentSubmission,
            payload.action,
            payload.source,
            "admin-test",
          );
          if (!result.ok) throw new Error(result.error.message);
          setSubmissions((current) =>
            current.map((submission) =>
              submission.id === result.data.id ? result.data : submission,
            ),
          );
        },
      }}
    >
      <AdminWorkspace
        currentEmail="qa-admin@example.test"
        onSignOut={() => undefined}
        submissions={submissions}
        usesSupabase
      />
    </VisaflowBusinessBridgeProvider>
  );
}

describe("AdminReviewDrawer visual hierarchy", () => {
  test("routes the four review outcomes through the canonical admin actions", () => {
    const corrections = initialSubmissions.find((item) => item.id === "ПД-1055");
    if (!corrections) throw new Error("Expected corrections-received fixture.");
    const acceptedCorrections = adminAcceptRequiredMediaForTest(
      adminApproveQuestionnaireForTest(corrections),
    );
    const reviewedCorrections: Submission = {
      ...acceptedCorrections,
      issues: acceptedCorrections.issues.map((issue) => ({
        ...issue,
        target: {
          ...issue.target,
          field: "Номер паспорта",
          section: "Паспорт",
        },
      })),
    };
    const cleanReview = {
      ...reviewedCorrections,
      status: "submitted_for_review" as const,
      issues: [],
    };
    const reviewWithIssue = addPreciseAdminIssue(cleanReview, {
      applicantId: cleanReview.applicants[0]?.id ?? "",
      comment: "Исправьте значение перед повторной проверкой.",
      field: "Адрес",
      reason: "Адрес отеля требует исправления",
      severity: "blocker",
      type: "field",
    });
    const correctionsWithIssue = addPreciseAdminIssue(reviewedCorrections, {
      applicantId: reviewedCorrections.applicants[0]?.id ?? "",
      comment: "Исправление не прошло повторную проверку.",
      field: "Адрес",
      reason: "Адрес отеля всё ещё требует исправления",
      severity: "blocker",
      type: "field",
    });
    const scenarios = [
      { submission: cleanReview, button: "Принять на выгрузку", action: "accept" },
      {
        submission: reviewWithIssue,
        button: "Отправить на исправление",
        action: "return_with_issues",
      },
      {
        submission: reviewedCorrections,
        button: "Закрыть исправления и принять",
        action: "close_issues_accept",
      },
      {
        submission: correctionsWithIssue,
        button: "Отправить на исправление",
        action: "return_again",
      },
    ] as const;

    for (const scenario of scenarios) {
      const onPrimaryAction = vi.fn();
      const rendered = render(
        <AdminReviewDrawer
          isOpen
          submission={scenario.submission}
          submissionId={scenario.submission.id}
          onAddRemark={vi.fn()}
          onClose={vi.fn()}
          onPrimaryAction={onPrimaryAction}
          onVerifyDocument={vi.fn()}
        />,
      );

      const action = screen.getByRole("button", { name: scenario.button });
      expect(action).toBeEnabled();
      fireEvent.click(action);
      expect(onPrimaryAction).toHaveBeenCalledWith(
        scenario.submission.id,
        scenario.action,
      );
      rendered.unmount();
    }
  });

  test("keeps the reviewed family open and shows persisted read-only feedback after acceptance", async () => {
    const submission = reviewReadySubmission("SUB-1102");
    const onAction = vi.fn();
    vi.spyOn(mediaStorage, "createMediaSignedUrl").mockImplementation(
      async ({ path }) => `https://example.test/${encodeURIComponent(path)}`,
    );

    const { container } = render(
      <AdminReviewExportHarness initialSubmission={submission} onAction={onAction} />,
    );

    const opener = container.querySelector<HTMLButtonElement>(
      `[data-submission-id="${submission.id}"]`,
    );
    if (!opener) throw new Error("Review queue opener was not rendered.");
    fireEvent.click(opener);

    expect(
      await screen.findByRole("dialog", { name: "Сверка паспорта" }),
    ).toBeVisible();
    const acceptButton = screen.getByRole("button", {
      name: "Принять на выгрузку",
    });
    expect(acceptButton).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Отправить на исправление" }),
    ).toBeDisabled();

    fireEvent.click(acceptButton);

    await waitFor(() =>
      expect(onAction).toHaveBeenCalledWith({
        action: "accept",
        source: "admin",
        submissionId: submission.id,
      }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Сверка паспорта" }),
      ).not.toBeInTheDocument(),
    );
  });

  test("opens a field remark at its exact questionnaire field", async () => {
    const source = initialSubmissions.find((item) => item.id === "ПД-1053");
    const applicant = source?.applicants[0];
    const field = applicant?.sections.flatMap((section) => section.fields)[0];
    if (!source || !applicant || !field) {
      throw new Error("Expected admin review field fixture.");
    }
    const submission = addPreciseAdminIssue(source, {
      applicantId: applicant.id,
      comment: "Проверьте исправленное значение поля.",
      field: field.label,
      reason: `Требуется исправить поле «${field.label}»`,
      severity: "warning",
      type: "field",
    });

    render(
      <AdminReviewDrawer
        isOpen
        submission={submission}
        submissionId={submission.id}
        onAddRemark={vi.fn()}
        onClose={vi.fn()}
        onVerifyDocument={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /Замечания/ }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: `Открыть замечание: Требуется исправить поле «${field.label}»`,
      }),
    );

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /Анкета/ })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(
        document.getElementById(`admin-review-field-${applicant.id}-${field.id}`),
      ).toHaveFocus();
    });
  });

  test("opens a file remark at the exact applicant document", async () => {
    const submission = initialSubmissions.find((item) => item.id === "ПД-1048");
    const issue = submission?.issues.find((item) => item.target.fileType === "selfie");
    const file = submission?.files.find(
      (item) =>
        item.applicantId === issue?.target.applicantId &&
        item.type === issue?.target.fileType,
    );
    if (!submission || !issue || !file) {
      throw new Error("Expected returned file issue fixture.");
    }

    render(
      <AdminReviewDrawer
        isOpen
        submission={submission}
        submissionId={submission.id}
        onAddRemark={vi.fn()}
        onClose={vi.fn()}
        onVerifyDocument={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /Замечания/ }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: `Открыть замечание: ${issue.reason}`,
      }),
    );

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /Файлы/ })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(document.getElementById(`admin-review-file-${file.id}`)).toHaveFocus();
    });
  });

  test("offers close-and-accept when all remaining issues are fixed by the agent", () => {
    const submission = initialSubmissions.find((item) => item.id === "ПД-1055");
    if (!submission) throw new Error("Expected corrections-received fixture.");
    const acceptedSubmission = adminAcceptRequiredMediaForTest(
      adminApproveQuestionnaireForTest(submission),
    );
    const reviewedSubmission: Submission = {
      ...acceptedSubmission,
      issues: acceptedSubmission.issues.map((issue) => ({
        ...issue,
        target: {
          ...issue.target,
          field: "Номер паспорта",
          section: "Паспорт",
        },
      })),
    };
    const onPrimaryAction = vi.fn();

    render(
      <AdminReviewDrawer
        isOpen
        submission={reviewedSubmission}
        submissionId={reviewedSubmission.id}
        onAddRemark={vi.fn()}
        onClose={vi.fn()}
        onPrimaryAction={onPrimaryAction}
        onVerifyDocument={vi.fn()}
      />,
    );

    const accept = screen.getByRole("button", {
      name: "Закрыть исправления и принять",
    });
    expect(accept).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Отправить на исправление" }),
    ).not.toBeInTheDocument();
    fireEvent.click(accept);
    expect(onPrimaryAction).toHaveBeenCalledWith(
      reviewedSubmission.id,
      "close_issues_accept",
    );
  });

  test("uses roving tab focus and arrow, Home, and End navigation", async () => {
    const submission = initialSubmissions.find((item) => item.id === "ПД-1053");
    if (!submission) throw new Error("Expected admin review fixture.");

    render(
      <AdminReviewDrawer
        isOpen
        submission={submission}
        submissionId={submission.id}
        onAddRemark={vi.fn()}
        onClose={vi.fn()}
        onVerifyDocument={vi.fn()}
      />,
    );

    const topTabs = within(screen.getByRole("tablist", { name: "Разделы проверки" }));
    const tabs = topTabs.getAllByRole("tab");
    expect(tabs).toHaveLength(2);
    expect(tabs.filter((tab) => tab.getAttribute("tabindex") === "0")).toHaveLength(1);

    const applicantsTab = topTabs.getByRole("tab", { name: /Заявители/ });
    fireEvent.keyDown(applicantsTab, { key: "ArrowRight" });
    await waitFor(() =>
      expect(topTabs.getByRole("tab", { name: /Анкета/ })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );

    fireEvent.keyDown(topTabs.getByRole("tab", { name: /Анкета/ }), { key: "Home" });
    await waitFor(() =>
      expect(topTabs.getByRole("tab", { name: /Заявители/ })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );

    fireEvent.keyDown(topTabs.getByRole("tab", { name: /Заявители/ }), { key: "End" });
    await waitFor(() =>
      expect(topTabs.getByRole("tab", { name: /Анкета/ })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
  });

  test("renders queue cards in the prioritized queue and exposes lane filters", () => {
    const review = initialSubmissions.find((item) => item.id === "ПД-1053");
    const returned = initialSubmissions.find((item) => item.id === "ПД-1055");
    if (!review || !returned) throw new Error("Expected review queue fixtures.");

    const { container } = render(
      <ReviewScreen
        onOpenDrawer={vi.fn()}
        onOpenExport={vi.fn()}
        submissions={[review, returned]}
      />,
    );

    expect(
      container.querySelector(
        '[data-submission-id="ПД-1053"] .v19-admin-review-card-id',
      ),
    ).toHaveTextContent("VF-1053");
    expect(
      container.querySelectorAll(".v19-review-queue-list [data-submission-card]"),
    ).toHaveLength(2);
    expect(screen.getByRole("tab", { name: /Первичная проверка/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Исправления/ })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Начать проверку/ }),
    ).not.toBeInTheDocument();
  });

  test("distinguishes a genuinely empty queue from a filtered-empty result", () => {
    const { rerender } = render(
      <ReviewScreen onOpenDrawer={vi.fn()} onOpenExport={vi.fn()} submissions={[]} />,
    );

    expect(screen.getByText("Очередь пуста")).toBeInTheDocument();
    expect(
      screen.getByText(/Подачи появятся здесь после отправки агентом/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Показать всю очередь" }),
    ).not.toBeInTheDocument();

    const review = initialSubmissions.find((item) => item.id === "ПД-1053");
    if (!review) throw new Error("Expected review queue fixture.");
    rerender(
      <ReviewScreen
        onOpenDrawer={vi.fn()}
        onOpenExport={vi.fn()}
        submissions={[review]}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("ID, семья или агент"), {
      target: { value: "нет такого пакета" },
    });

    expect(screen.getByText("Ничего не найдено")).toBeInTheDocument();
    expect(
      screen.getByText(/Измените фокус очереди или сбросьте фильтры/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Показать всю очередь" }));
    expect(screen.getByText("Нина Волкова")).toBeInTheDocument();
  });

  test("keeps blocker styling and applicant metadata on the colored card", () => {
    const source = initialSubmissions.find((item) => item.id === "ПД-1053");
    const applicantId = source?.applicants[0]?.id;
    if (!source || !applicantId) throw new Error("Expected review fixture.");
    const blocker = addPreciseAdminIssue(source, {
      applicantId,
      comment: "Нужно исправить значение перед проверкой.",
      field: "Адрес",
      reason: "Адрес отеля требует исправления",
      severity: "blocker",
      type: "field",
    });

    const { container } = render(
      <ReviewScreen
        onOpenDrawer={vi.fn()}
        onOpenExport={vi.fn()}
        submissions={[blocker]}
      />,
    );

    const card = container.querySelector('[data-submission-id="ПД-1053"]');
    expect(card).toHaveClass("has-blocker");
    expect(card).toHaveTextContent("1 чел.");
    expect(card).toHaveTextContent("1 блокер");
  });

  test("does not expose internal questionnaire status values", async () => {
    const source = initialSubmissions.find((item) => item.id === "ПД-1053");
    const applicant = source?.applicants[0];
    if (!source || !applicant) throw new Error("Expected admin review fixture.");
    const errorField = applicant.sections
      .flatMap((section) => section.fields)
      .find((field) => field.id === "appointment-city");
    if (!errorField) throw new Error("Expected questionnaire field fixture.");
    const submission = {
      ...source,
      applicants: [
        {
          ...applicant,
          questionnaireStatus: "needs_fix" as const,
          sections: applicant.sections.map((section) => ({
            ...section,
            fields: section.fields.map((field) =>
              field.id === errorField.id
                ? { ...field, error: "Нужно исправить значение" }
                : field,
            ),
          })),
        },
      ],
    };

    render(
      <AdminReviewDrawer
        isOpen
        submission={submission}
        submissionId={submission.id}
        onAddRemark={() => undefined}
        onClose={() => undefined}
        onVerifyDocument={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /Заявители/ }));
    await waitFor(() => {
      expect(screen.getByText("Нужны исправления")).toBeVisible();
    });
    expect(screen.queryByText("needs_fix")).not.toBeInTheDocument();
  });

  test("keeps the selected tourist when moving from applicants to questionnaire", async () => {
    const submission = initialSubmissions.find((item) => item.applicants.length > 1);
    const secondApplicant = submission?.applicants[1];
    if (!submission || !secondApplicant) {
      throw new Error("Expected a family submission fixture.");
    }
    const isReviewable = (value: string) => {
      const normalized = value.trim().toLocaleLowerCase("ru-RU");
      return Boolean(normalized) && normalized !== "—" && normalized !== "не заполнено";
    };
    const applicantReviewableFields = secondApplicant.sections
      .flatMap((section) => section.fields)
      .filter((field) => isReviewable(field.value));
    const applicantApprovedFields = applicantReviewableFields.filter(
      (field) => field.adminReviewApprovedAtIso && field.adminReviewApprovedBy,
    );
    const packageReviewableFieldCount = submission.applicants
      .flatMap((applicant) => applicant.sections.flatMap((section) => section.fields))
      .filter((field) => isReviewable(field.value)).length;

    render(
      <AdminReviewDrawer
        isOpen
        submission={submission}
        submissionId={submission.id}
        onAddRemark={() => undefined}
        onClose={() => undefined}
        onVerifyDocument={() => undefined}
      />,
    );

    const applicantName = screen.getByText(secondApplicant.fullName, {
      selector: "nav[aria-label='Заявители пакета'] strong",
    });
    fireEvent.click(applicantName.closest("button") as HTMLButtonElement);
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: secondApplicant.fullName }),
      ).toBeVisible(),
    );

    fireEvent.click(screen.getByRole("tab", { name: /Анкета/ }));

    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: `Выбранный заявитель: ${secondApplicant.fullName}`,
        }),
      ).toBeVisible(),
    );
    expect(
      screen.getByRole("button", {
        name: new RegExp(
          `Проверено\\s+${applicantApprovedFields.length}\\s+из\\s+${applicantReviewableFields.length}\\s+заполненных`,
        ),
      }),
    ).toBeVisible();
    const questionnaireTab = screen.getByRole("tab", { name: /Анкета/ });
    expect(questionnaireTab).toHaveTextContent(String(packageReviewableFieldCount));
    expect(questionnaireTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByText(/Проверено \d+ из \d+ заполненных/)).not.toHaveLength(0);
  });

  test("uses truthful field labels and an accessible review dialog", async () => {
    const submission = initialSubmissions.find((item) => item.id === "ПД-1053");
    if (!submission) throw new Error("Expected admin review fixture.");
    const expectedFieldCount =
      submission.applicants[0]?.sections.reduce(
        (count, section) => count + section.fields.length,
        0,
      ) ?? 0;
    const onApproveQuestionnaireField = vi.fn();

    const { container } = render(
      <AdminReviewDrawer
        isOpen
        submission={submission}
        submissionId={submission.id}
        onAddRemark={() => undefined}
        onApproveQuestionnaireField={onApproveQuestionnaireField}
        onClose={() => undefined}
        onVerifyDocument={() => undefined}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Проверка пакета" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "admin-review-drawer-heading");
    expect(screen.getByText("ПД-1053")).toBeInTheDocument();
    expect(screen.getByText("На проверке")).toHaveClass("is-blue");
    expect(container.querySelector(".admin-review-footer")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Файлы/ }));
    expect(
      await screen.findByTestId("admin-review-verify-passport"),
    ).toBeInTheDocument();
    expect(screen.getAllByTestId("admin-review-add-file-remark")[0]!).toHaveTextContent(
      "Замечание",
    );
    expect(screen.getByRole("tab", { name: /Файлы/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    fireEvent.click(screen.getByRole("tab", { name: /Анкета/ }));
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /Анкета/ })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
    expect(
      (await screen.findAllByTestId("admin-review-add-remark")).length,
    ).toBeGreaterThan(0);
    expect(container.querySelectorAll(".admin-review-field-row")).toHaveLength(
      expectedFieldCount,
    );
    expect(screen.queryByText("Заполнено")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("admin-review-approve-field")).toHaveLength(
      expectedFieldCount,
    );
    expect(
      container.querySelectorAll(
        '.admin-review-field-row[data-review-state="approved"]',
      ),
    ).toHaveLength(0);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Не все обязательные анкеты и файлы готовы",
    );
    expect(screen.getByRole("button", { name: "Принять на выгрузку" })).toHaveAttribute(
      "aria-describedby",
      "admin-review-primary-action-reason",
    );
    expect(
      screen.queryByRole("button", { name: "Отправить на исправление" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Закрыть" })).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Закрыть проверку" }),
    ).toBeInTheDocument();
    expect(container.querySelectorAll("details")).not.toHaveLength(0);
  });

  test("uses an in-drawer applicant menu and keeps Escape scoped to the menu", async () => {
    const submission = initialSubmissions.find((item) => item.id === "ПД-1053");
    if (!submission) throw new Error("Expected admin review fixture.");
    const additionalApplicant = {
      ...submission.applicants[0],
      id: "applicant-review-menu-second",
      fullName: "Ирина Петрова",
    };
    const twoApplicantSubmission = {
      ...submission,
      applicants: [...submission.applicants, additionalApplicant],
    };
    const onClose = vi.fn();
    const onVerifyDocument = vi.fn();
    const onApproveQuestionnaireField = vi.fn();

    render(
      <AdminReviewDrawer
        isOpen
        submission={twoApplicantSubmission}
        submissionId={twoApplicantSubmission.id}
        onAddRemark={() => undefined}
        onApproveQuestionnaireField={onApproveQuestionnaireField}
        onClose={onClose}
        onVerifyDocument={onVerifyDocument}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /Анкета/ }));
    const trigger = await screen.findByRole("button", {
      name: "Выбранный заявитель: Нина Волкова",
    });
    fireEvent.click(trigger);

    expect(
      await screen.findByRole("listbox", { name: "Выберите заявителя" }),
    ).toBeInTheDocument();
    const secondApplicantOption = await screen.findByRole("option", {
      name: "Ирина Петрова",
    });
    fireEvent.click(secondApplicantOption);

    await waitFor(() => {
      expect(
        screen.queryByRole("listbox", { name: "Выберите заявителя" }),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", {
        name: "Выбранный заявитель: Ирина Петрова",
      }),
    ).toBeInTheDocument();
    const approveButton = (
      await screen.findAllByRole("button", { name: /^Апрув:/ })
    ).find((button) => !(button as HTMLButtonElement).disabled);
    if (!approveButton) throw new Error("Expected an approvable questionnaire field.");
    fireEvent.click(approveButton);
    await waitFor(() =>
      expect(onApproveQuestionnaireField).toHaveBeenCalledWith(
        expect.objectContaining({ applicantId: "applicant-review-menu-second" }),
      ),
    );
    expect(onVerifyDocument).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Выбранный заявитель: Ирина Петрова",
      }),
    );
    fireEvent.keyDown(
      screen.getByRole("button", {
        name: "Выбранный заявитель: Ирина Петрова",
      }),
      { key: "Escape" },
    );

    expect(
      screen.queryByRole("listbox", { name: "Выберите заявителя" }),
    ).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  test("approves every eligible field in a questionnaire section sequentially", async () => {
    const submission = initialSubmissions.find((item) => item.id === "ПД-1053");
    const applicant = submission?.applicants[0];
    const section = applicant?.sections[0];
    if (!submission || !applicant || !section) {
      throw new Error("Expected questionnaire section fixture.");
    }
    const onApproveQuestionnaireField = vi.fn().mockResolvedValue(true);

    render(
      <AdminReviewDrawer
        isOpen
        submission={submission}
        submissionId={submission.id}
        onAddRemark={() => undefined}
        onApproveQuestionnaireField={onApproveQuestionnaireField}
        onClose={() => undefined}
        onVerifyDocument={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /Анкета/ }));
    const sectionApprove = await screen.findByRole("button", {
      name: `Апрув всей секции: ${section.title}`,
    });
    const sectionElement = sectionApprove.closest("details");
    if (!sectionElement) throw new Error("Expected questionnaire section element.");
    const eligibleFieldIds = Array.from(
      sectionElement.querySelectorAll<HTMLButtonElement>(
        '[data-testid="admin-review-approve-field"]',
      ),
    )
      .filter((button) => !button.disabled)
      .map((button) =>
        button
          .closest(".admin-review-field-row")
          ?.id.replace(`admin-review-field-${applicant.id}-`, ""),
      )
      .filter((fieldId): fieldId is string => Boolean(fieldId));
    expect(eligibleFieldIds.length).toBeGreaterThan(0);

    fireEvent.click(sectionApprove);

    await waitFor(() => {
      expect(onApproveQuestionnaireField).toHaveBeenCalledTimes(
        eligibleFieldIds.length,
      );
    });
    expect(onApproveQuestionnaireField.mock.calls).toEqual(
      eligibleFieldIds.map((fieldId) => [
        {
          applicantId: applicant.id,
          fieldId,
          sectionId: section.id,
        },
      ]),
    );
  });

  test("keeps cells red until persisted admin approval and shows blank fields", async () => {
    const submission = initialSubmissions.find((item) => item.id === "ПД-1053");
    if (!submission) throw new Error("Expected admin review fixture.");
    const applicant = submission.applicants[0];
    if (!applicant) throw new Error("Expected questionnaire applicant.");
    const field = applicant.sections
      .flatMap((section) => section.fields)
      .find((candidate) => candidate.value.trim());
    const blankField = applicant.sections
      .flatMap((section) => section.fields)
      .find((candidate) => !candidate.value.trim());
    if (!field || !blankField) {
      throw new Error("Expected filled and blank questionnaire fields.");
    }

    const approvedSubmission = {
      ...submission,
      applicants: submission.applicants.map((candidate) =>
        candidate.id !== applicant.id
          ? candidate
          : {
              ...candidate,
              sections: candidate.sections.map((section) => ({
                ...section,
                fields: section.fields.map((candidateField) =>
                  candidateField.id === field.id
                    ? {
                        ...candidateField,
                        adminReviewApprovedAtIso: "2026-07-15T06:30:00.000Z",
                        adminReviewApprovedBy: "admin-reviewer",
                      }
                    : candidateField,
                ),
              })),
            },
      ),
    };

    const { container } = render(
      <AdminReviewDrawer
        isOpen
        submission={approvedSubmission}
        submissionId={approvedSubmission.id}
        onAddRemark={() => undefined}
        onApproveQuestionnaireField={() => true}
        onClose={() => undefined}
        onVerifyDocument={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /Анкета/ }));
    await waitFor(() => {
      expect(
        container.querySelector(`#admin-review-field-${applicant.id}-${field.id}`),
      ).toHaveAttribute("data-review-state", "approved");
    });
    expect(
      container.querySelector(`#admin-review-field-${applicant.id}-${blankField.id}`),
    ).toHaveAttribute("data-review-state", "pending");
    expect(
      screen.getByRole("button", { name: `Проверено: ${field.label}` }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: `Апрув: ${blankField.label}` }),
    ).toBeDisabled();
    expect(
      container.querySelector(
        `#admin-review-field-${applicant.id}-${field.id} .admin-review-row-review-status`,
      ),
    ).toHaveTextContent("Подтверждено документом");
    expect(
      container.querySelector(
        `#admin-review-field-${applicant.id}-${blankField.id} .admin-review-row-review-status`,
      ),
    ).toHaveTextContent("Поле не заполнено");
  });

  test("keeps document comparison and remarks on distinct controls", async () => {
    const submission = initialSubmissions.find((item) => item.id === "ПД-1053");
    if (!submission) throw new Error("Expected admin review fixture.");
    const onVerifyDocument = vi.fn();
    const onAddRemark = vi.fn();
    const onApproveQuestionnaireField = vi.fn();

    render(
      <AdminReviewDrawer
        isOpen
        submission={submission}
        submissionId={submission.id}
        onAddRemark={onAddRemark}
        onApproveQuestionnaireField={onApproveQuestionnaireField}
        onClose={() => undefined}
        onVerifyDocument={onVerifyDocument}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /Файлы/ }));
    fireEvent.click(await screen.findByTestId("admin-review-verify-passport"));
    expect(onVerifyDocument).toHaveBeenCalledTimes(1);
    expect(onAddRemark).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("tab", { name: /Анкета/ }));
    await waitFor(() =>
      expect(screen.getAllByTestId("admin-review-add-remark").length).toBeGreaterThan(
        0,
      ),
    );
    fireEvent.click(screen.getAllByTestId("admin-review-add-remark")[0]!);
    expect(onAddRemark).toHaveBeenCalledTimes(1);
    expect(onVerifyDocument).toHaveBeenCalledTimes(1);

    const approveButton = screen
      .getAllByTestId("admin-review-approve-field")
      .find((button) => !(button as HTMLButtonElement).disabled);
    if (!approveButton) throw new Error("Expected an approvable questionnaire field.");
    fireEvent.click(approveButton);
    await waitFor(() => expect(onApproveQuestionnaireField).toHaveBeenCalledTimes(1));
    expect(onAddRemark).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("tab", { name: /Заявители/ }));
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /Файлы/ })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("tab", { name: /Файлы/ }));
    await waitFor(() => {
      expect(screen.getByTestId("admin-review-verify-passport")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("admin-review-verify-passport"));
    expect(onVerifyDocument).toHaveBeenCalledTimes(2);
  });

  test("switches one applicant subview at a time", async () => {
    const submission = initialSubmissions.find((item) => item.id === "ПД-1053");
    if (!submission) throw new Error("Expected admin review fixture.");

    render(
      <AdminReviewDrawer
        isOpen
        submission={submission}
        submissionId={submission.id}
        onAddRemark={() => undefined}
        onClose={() => undefined}
        onVerifyDocument={() => undefined}
      />,
    );

    const applicantTabs = screen.getByRole("tablist", {
      name: /Разделы заявителя/,
    });
    expect(within(applicantTabs).getByRole("tab", { name: "Обзор" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.click(within(applicantTabs).getByRole("tab", { name: /Файлы/ }));

    await waitFor(() => {
      expect(within(applicantTabs).getByRole("tab", { name: /Файлы/ })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    });
    expect(
      await screen.findByTestId("admin-review-verify-passport"),
    ).toBeInTheDocument();
  });

  test("does not present a blocked package as a successful empty issues state", async () => {
    const submission = initialSubmissions.find((item) => item.id === "ПД-1053");
    if (!submission) throw new Error("Expected admin review fixture.");

    render(
      <AdminReviewDrawer
        isOpen
        submission={submission}
        submissionId={submission.id}
        onAddRemark={() => undefined}
        onClose={() => undefined}
        onVerifyDocument={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /Замечания/ }));
    await waitFor(() => {
      expect(
        screen.getByRole("heading", {
          name: "Замечаний нет, но пакет ещё не готов",
        }),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText("Замечаний нет, но пакет ещё не готов").parentElement,
    ).not.toHaveClass("is-success");
  });

  test("keeps applicant history inside the selected traveler workspace", async () => {
    const submission = initialSubmissions.find((item) => item.id === "ПД-1053");
    if (!submission) throw new Error("Expected admin review fixture.");
    const onClose = vi.fn();

    render(
      <AdminReviewDrawer
        isOpen
        submission={submission}
        submissionId={submission.id}
        onAddRemark={() => undefined}
        onClose={onClose}
        onVerifyDocument={() => undefined}
      />,
    );

    const historyTab = screen.getByRole("tab", { name: /История/ });
    expect(historyTab).toBeInTheDocument();
    fireEvent.click(historyTab);

    await waitFor(() => {
      expect(historyTab).toHaveAttribute("aria-selected", "true");
    });
    await waitFor(() => {
      expect(screen.getByText("Агент отправил подачу на проверку")).toBeVisible();
    });
    expect(
      screen.queryByRole("button", { name: /Агент отправил подачу на проверку/ }),
    ).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("shows explicit empty states for applicants and nested applicant content", async () => {
    const submission = initialSubmissions.find((item) => item.id === "ПД-1053");
    if (!submission) throw new Error("Expected admin review fixture.");
    const emptySubmission = {
      ...submission,
      applicants: [],
      files: [],
      history: [],
    };

    render(
      <AdminReviewDrawer
        isOpen
        submission={emptySubmission}
        submissionId={emptySubmission.id}
        onAddRemark={() => undefined}
        onClose={() => undefined}
        onVerifyDocument={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /Заявители/ }));
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Заявителей пока нет" }),
      ).toBeInTheDocument();
    });

    cleanup();
    const applicantWithoutAssets = {
      ...submission,
      files: [],
      history: [],
    };
    render(
      <AdminReviewDrawer
        isOpen
        submission={applicantWithoutAssets}
        submissionId={applicantWithoutAssets.id}
        onAddRemark={() => undefined}
        onClose={() => undefined}
        onVerifyDocument={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /Файлы/ }));
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Файлов пока нет" }),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("tab", { name: /История/ }));
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "История пока пуста" }),
      ).toBeInTheDocument();
    });
  });
});

describe("ReviewWorkspace passport section contract", () => {
  const passportValues: Record<string, string> = {
    "first-name": "NINA",
    surname: "VOLKOVA",
    "birth-date": "20.08.1990",
    "birth-place": "KAZAN",
    "birth-country": "RUSSIAN FEDERATION",
    "passport-no": "661053001",
    "passport-expiry-date": "26.02.2032",
    "passport-issue-place": "FMS 16001",
  };

  function withPassportValues(applicant: Applicant): Applicant {
    return {
      ...applicant,
      sections: applicant.sections.map((section) => ({
        ...section,
        fields: section.fields.map((field) => ({
          ...field,
          value: passportValues[field.id] ?? field.value,
        })),
      })),
    };
  }

  function protectedFile(
    submissionId: string,
    applicantId: string,
    type: "passport_scan" | "selfie" | "selfie_2",
  ): SubmissionFile {
    const generatedFileName = `${applicantId.replace(/\D/g, "")}_${type}.jpg`;
    const target = buildMediaStoragePath(
      submissionId,
      applicantId,
      type,
      generatedFileName,
    );
    return {
      applicantId,
      generatedFileName,
      id: `${applicantId}-${type}`,
      localDemoSeedMedia: true,
      mimeType: "image/jpeg",
      status: "pending_review",
      storageAdapter: "supabase-private",
      storageBucket: target.bucket,
      storagePath: target.path,
      type,
      uploadStatus: "uploaded",
    };
  }

  function singleSubmission(): Submission {
    const source = initialSubmissions.find((item) => item.id === "ПД-1053");
    const applicant = source?.applicants[0];
    if (!source || !applicant) throw new Error("Expected admin review fixture.");

    const reviewApplicant = withPassportValues(applicant);
    return {
      ...source,
      applicants: [reviewApplicant],
      files: [
        protectedFile(source.id, reviewApplicant.id, "passport_scan"),
        protectedFile(source.id, reviewApplicant.id, "selfie"),
        protectedFile(source.id, reviewApplicant.id, "selfie_2"),
      ],
      type: "single",
    };
  }

  function visitPrimaryIdentityMedia() {
    fireEvent.click(screen.getByRole("tab", { name: "Селфи 1" }));
    fireEvent.click(screen.getByRole("tab", { name: "Селфи 2" }));
  }

  test("shows exactly eight canonical passport fields, per-item remarks, and one confirmation", () => {
    const submission = singleSubmission();
    const { container } = render(
      <ReviewWorkspace
        applicantId={submission.applicants[0]?.id}
        onAddRemark={() => undefined}
        onBack={() => undefined}
        submission={submission}
        submissionId={submission.id}
      />,
    );

    expect(
      Array.from(container.querySelectorAll("[data-passport-field-id]")).map((field) =>
        field.getAttribute("data-passport-field-id"),
      ),
    ).toEqual([
      "first-name",
      "surname",
      "passport-no",
      "birth-date",
      "passport-issue-place",
      "passport-expiry-date",
      "birth-place",
      "birth-country",
    ]);
    expect(container.querySelectorAll(".v19-admin-passport-field-remark")).toHaveLength(
      Object.keys(passportValues).length,
    );
    expect(container.querySelectorAll("[data-review-media]")).toHaveLength(3);
    expect(
      screen.queryByRole("button", { name: /^Подтвердить:/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("button", {
        name: /Подтвердить паспортную секцию|Перейти к следующему шагу в паспортной секции/,
      }),
    ).toHaveLength(1);
  });

  test("shows a compact document summary without technical guard blocks", () => {
    const submission = singleSubmission();

    render(
      <ReviewWorkspace
        applicantId={submission.applicants[0]?.id}
        onAddRemark={() => undefined}
        onBack={() => undefined}
        submission={submission}
        submissionId={submission.id}
      />,
    );

    expect(
      screen.queryByRole("region", { name: "Необязательный просмотр анкеты" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Посмотреть" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Готовность паспортной проверки")).toBeInTheDocument();
    const reviewStatus = screen.getByRole("status", { name: "Состояние проверки" });
    expect(reviewStatus).toHaveTextContent("Поля");
    expect(reviewStatus).toHaveTextContent("Оригиналы");
    expect(reviewStatus).toHaveTextContent("Замечания");
    expect(screen.queryByText("Пакетный guard")).not.toBeInTheDocument();
    expect(screen.queryByText(/исправлено агентом/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/закрыто администратором/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/AI-подсказ/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("img", { name: /Готовность \d+%/ }),
    ).not.toBeInTheDocument();
  });

  test("surfaces corrected questionnaire issues before the admin closes them", () => {
    const source = singleSubmission();
    const applicant = source.applicants[0];
    if (!applicant) throw new Error("Expected review applicant.");
    const submission: Submission = {
      ...source,
      issues: [
        {
          comment: "Адрес заменён на актуальный.",
          createdAt: "2026-07-26T12:00:00.000Z",
          createdBy: "admin",
          id: "corrected-hotel-address",
          reason: "Проверьте новый адрес отеля",
          severity: "blocker",
          status: "fixed_by_agent",
          target: {
            applicantId: applicant.id,
            applicantName: applicant.fullName,
            field: "Адрес отеля",
            section: "Поездка",
          },
          type: "field",
        },
      ],
      status: "corrections_received",
    };

    render(
      <ReviewWorkspace
        applicantId={applicant.id}
        onAddRemark={() => undefined}
        onBack={() => undefined}
        onReviewAction={vi.fn().mockResolvedValue(true)}
        submission={submission}
        submissionId={submission.id}
      />,
    );

    const correctedIssues = screen.getByRole("region", {
      name: "Исправления к закрытию",
    });
    expect(correctedIssues).toHaveTextContent("Проверьте новый адрес отеля");
    expect(correctedIssues).toHaveTextContent("Адрес заменён на актуальный.");
    expect(correctedIssues).toHaveTextContent(
      `${applicant.fullName} · Поездка · Адрес отеля`,
    );
    expect(
      screen.getByRole("button", { name: "Закрыть исправления и принять" }),
    ).toBeInTheDocument();
    expect(screen.getByText("К закрытию 1")).toBeVisible();
    expect(screen.queryByText("Без замечаний")).not.toBeInTheDocument();
  });

  test.each([
    "draft",
    "in_progress",
    "returned",
    "ready_for_export",
    "exported",
  ] as const)("renders %s as an explained read-only workspace", (status) => {
    const source = singleSubmission();
    const submission: Submission = { ...source, status };
    vi.spyOn(mediaStorage, "createMediaSignedUrl").mockImplementation(
      () => new Promise(() => undefined),
    );

    render(
      <ReviewWorkspace
        applicantId={submission.applicants[0]?.id}
        onAddRemark={vi.fn()}
        onApproveSection={vi.fn()}
        onBack={() => undefined}
        onReviewAction={vi.fn()}
        submission={submission}
        submissionId={submission.id}
      />,
    );

    expect(screen.getByText("Просмотр без изменений")).toBeVisible();
    expect(screen.getAllByText(/доступен только для чтения/).length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("button", {
        name: /Подтвердить паспортную секцию|Перейти к следующему шагу в паспортной секции/,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Принять на выгрузку" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Отправить на исправление" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Добавить замечание:/ }),
    ).not.toBeInTheDocument();
  });

  test("keeps media tabs keyboard-operable and disables unavailable preview tools", () => {
    const submission = singleSubmission();

    render(
      <ReviewWorkspace
        applicantId={submission.applicants[0]?.id}
        onAddRemark={() => undefined}
        onBack={() => undefined}
        submission={submission}
        submissionId={submission.id}
      />,
    );

    const passportTab = screen.getByRole("tab", { name: "Паспорт" });
    const firstSelfieTab = screen.getByRole("tab", { name: "Селфи 1" });
    const secondSelfieTab = screen.getByRole("tab", { name: "Селфи 2" });

    expect(
      screen.getByRole("button", { name: "Увеличить изображение" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Повернуть изображение" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Открыть на весь экран" }),
    ).toBeDisabled();

    passportTab.focus();
    fireEvent.keyDown(passportTab, { key: "ArrowRight" });

    expect(firstSelfieTab).toHaveFocus();
    expect(firstSelfieTab).toHaveAttribute("aria-selected", "true");
    expect(firstSelfieTab).toHaveAttribute("aria-controls");
    expect(screen.getByRole("tabpanel")).toHaveAttribute(
      "aria-labelledby",
      firstSelfieTab.id,
    );

    fireEvent.keyDown(firstSelfieTab, { key: "End" });

    expect(secondSelfieTab).toHaveFocus();
    expect(secondSelfieTab).toHaveAttribute("aria-selected", "true");
  });

  test("falls back to the first current applicant when the selected applicant disappears", async () => {
    const submission = singleSubmission();
    const selectedApplicant = submission.applicants[0];
    if (!selectedApplicant) throw new Error("Expected selected applicant.");
    const replacementApplicant: Applicant = {
      ...selectedApplicant,
      fullName: "Replacement Applicant",
      id: "replacement-applicant",
    };
    const refreshedSubmission: Submission = {
      ...submission,
      applicants: [replacementApplicant],
      files: [],
    };
    const onApplicantChange = vi.fn();
    const view = render(
      <ReviewWorkspace
        applicantId={selectedApplicant.id}
        onAddRemark={() => undefined}
        onApplicantChange={onApplicantChange}
        onBack={() => undefined}
        submission={submission}
        submissionId={submission.id}
      />,
    );

    view.rerender(
      <ReviewWorkspace
        applicantId={selectedApplicant.id}
        onAddRemark={() => undefined}
        onApplicantChange={onApplicantChange}
        onBack={() => undefined}
        submission={refreshedSubmission}
        submissionId={refreshedSubmission.id}
      />,
    );

    await waitFor(() =>
      expect(onApplicantChange).toHaveBeenLastCalledWith(replacementApplicant.id),
    );
    expect(screen.getByRole("dialog", { name: "Сверка паспорта" })).toBeInTheDocument();
    expect(screen.getByLabelText("Контекст проверки подачи")).toHaveTextContent(
      `${replacementApplicant.fullName}${refreshedSubmission.id}`,
    );
  });

  test("uses canonical review guards for final production decisions", async () => {
    const readySubmission = reviewReadySubmission();
    const submission: Submission = {
      ...readySubmission,
      applicants: readySubmission.applicants.map((applicant) => ({
        ...applicant,
        sections: applicant.sections.map((section) => ({
          ...section,
          fields: section.fields.map((field) => ({
            ...field,
            adminReviewApprovedAtIso: undefined,
            adminReviewApprovedBy: undefined,
          })),
        })),
      })),
    };
    const onReviewAction = vi.fn().mockResolvedValue(true);
    const view = render(
      <ReviewWorkspace
        applicantId={submission.applicants[0]?.id}
        onAddRemark={() => undefined}
        onBack={() => undefined}
        onReviewAction={onReviewAction}
        submission={submission}
        submissionId={submission.id}
      />,
    );

    expect(screen.getByRole("button", { name: "Принять на выгрузку" })).toBeDisabled();
    expect(
      screen.getAllByText("Подтвердите паспортные поля перед принятием"),
    ).toHaveLength(1);

    const approvedSubmission = adminApprovePassportFieldsForTest(submission);
    view.rerender(
      <ReviewWorkspace
        applicantId={approvedSubmission.applicants[0]?.id}
        onAddRemark={() => undefined}
        onBack={() => undefined}
        onReviewAction={onReviewAction}
        submission={approvedSubmission}
        submissionId={approvedSubmission.id}
      />,
    );

    const acceptButton = screen.getByRole("button", {
      name: "Принять на выгрузку",
    });
    expect(acceptButton).toBeEnabled();
    expect(screen.getAllByText("Проверка готова к решению.")).toHaveLength(1);
    expect(
      screen.queryByText("Нужно добавить точное замечание"),
    ).not.toBeInTheDocument();
    fireEvent.click(acceptButton);
    await waitFor(() => expect(onReviewAction).toHaveBeenCalledWith("accept"));
  });

  test("keeps the section action disabled when any passport field is invalid", () => {
    const submission = singleSubmission();
    const invalidSubmission: Submission = {
      ...submission,
      applicants: submission.applicants.map((applicant) => ({
        ...applicant,
        sections: applicant.sections.map((section) => ({
          ...section,
          fields: section.fields.map((field) =>
            field.id === "passport-no"
              ? { ...field, error: "Неверный формат номера" }
              : field,
          ),
        })),
      })),
    };

    render(
      <ReviewWorkspace
        applicantId={invalidSubmission.applicants[0]?.id}
        onAddRemark={() => undefined}
        onApproveSection={vi.fn()}
        onBack={() => undefined}
        submission={invalidSubmission}
        submissionId={invalidSubmission.id}
      />,
    );

    expect(
      screen.getByRole("button", {
        name: /Подтвердить паспортную секцию|Перейти к следующему шагу в паспортной секции/,
      }),
    ).toBeEnabled();
    expect(
      screen.getByText(/Заполнены не все паспортные поля или в данных есть ошибка/),
    ).toBeInTheDocument();
  });

  test("uses the canonical passport field ID when a display label is duplicated", () => {
    const submission = singleSubmission();
    const applicant = submission.applicants[0];
    if (!applicant) throw new Error("Expected applicant.");
    const onAddRemark = vi.fn();

    render(
      <ReviewWorkspace
        applicantId={applicant.id}
        onAddRemark={onAddRemark}
        onBack={() => undefined}
        submission={submission}
        submissionId={submission.id}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Добавить замечание: Срок действия" }),
    );
    expect(onAddRemark).toHaveBeenCalledWith(
      "passport-expiry-date",
      applicant.fullName,
      undefined,
      applicant.id,
      "Срок действия",
    );
  });

  test("confirms the primary passport section through one batch callback", async () => {
    const submission = singleSubmission();
    const applicant = submission.applicants[0];
    if (!applicant) throw new Error("Expected applicant.");
    const onApproveSection = vi.fn().mockResolvedValue(true);
    const onReviewAction = vi.fn().mockResolvedValue(true);
    const onBack = vi.fn();
    vi.spyOn(mediaStorage, "createMediaSignedUrl").mockImplementation(
      async ({ path }) => `https://example.test/${encodeURIComponent(path)}.jpg`,
    );

    render(
      <ReviewWorkspace
        applicantId={applicant.id}
        onAddRemark={() => undefined}
        onApproveSection={onApproveSection}
        onBack={onBack}
        onReviewAction={onReviewAction}
        submission={submission}
        submissionId={submission.id}
      />,
    );
    const acceptButton = screen.getByRole("button", {
      name: "Принять на выгрузку",
    });
    expect(acceptButton).toBeDisabled();

    await waitFor(() =>
      expect(screen.getByTestId("protected-media-preview-passport_scan")).toBeVisible(),
    );
    fireEvent.click(screen.getByRole("tab", { name: "Селфи 1" }));
    await waitFor(() =>
      expect(screen.getByTestId("protected-media-preview-selfie")).toBeVisible(),
    );
    expect(
      screen.getByRole("group", {
        name: "Сравнение паспорта и селфи 1",
      }),
    ).toBeVisible();
    expect(screen.getByTestId("protected-media-preview-passport_scan")).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "Селфи 2" }));
    await waitFor(() =>
      expect(screen.getByTestId("protected-media-preview-selfie_2")).toBeVisible(),
    );
    const confirmButton = screen.getByRole("button", {
      name: /Подтвердить паспортную секцию|Перейти к следующему шагу в паспортной секции/,
    });
    await waitFor(() => expect(confirmButton).toBeEnabled());
    fireEvent.click(confirmButton);

    await waitFor(() => expect(onApproveSection).toHaveBeenCalledTimes(1));
    expect(onApproveSection).toHaveBeenCalledWith({ applicantId: applicant.id });
    await waitFor(() => expect(screen.getByText("Секция подтверждена")).toBeVisible());
    expect(acceptButton).toBeDisabled();
    fireEvent.click(acceptButton);
    expect(onReviewAction).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
  });

  test("blocks confirmation when a family has more than one primary applicant", async () => {
    const source = singleSubmission();
    const primary = source.applicants[0];
    if (!primary) throw new Error("Expected applicant.");
    const duplicatePrimary = {
      ...primary,
      fullName: "Ирина Волкова",
      id: `${primary.id}-duplicate-main`,
      role: "main" as const,
    };
    const submission: Submission = {
      ...source,
      applicants: [primary, duplicatePrimary],
      files: [
        ...source.files,
        protectedFile(source.id, duplicatePrimary.id, "passport_scan"),
      ],
      type: "family",
    };
    vi.spyOn(mediaStorage, "createMediaSignedUrl").mockResolvedValue(
      "https://example.test/ambiguous-primary.jpg",
    );

    render(
      <ReviewWorkspace
        applicantId={primary.id}
        onAddRemark={() => undefined}
        onApproveSection={vi.fn()}
        onBack={() => undefined}
        submission={submission}
        submissionId={submission.id}
      />,
    );

    const confirmButton = screen.getByRole("button", {
      name: /Подтвердить паспортную секцию|Перейти к следующему шагу в паспортной секции/,
    });
    await waitFor(() => expect(confirmButton).toBeEnabled());
    expect(screen.getByText(/ровно один основной заявитель/)).toBeInTheDocument();
    expect(
      screen.queryByTestId("protected-media-preview-selfie"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("protected-media-preview-selfie_2"),
    ).not.toBeInTheDocument();
  });

  test("does not treat broad personal or passport section issues as passport-review issues", async () => {
    const source = singleSubmission();
    const applicant = source.applicants[0];
    if (!applicant) throw new Error("Expected applicant.");
    const submission: Submission = {
      ...source,
      issues: [
        {
          comment: "Проверить прежнюю фамилию.",
          createdAt: "2026-07-17T03:00:00.000Z",
          createdBy: "admin",
          id: "personal-section-non-passport-field",
          reason: "Уточнить личные данные",
          severity: "warning",
          status: "open",
          target: {
            applicantId: applicant.id,
            applicantName: applicant.fullName,
            field: "Прежняя фамилия",
            section: "Личные данные заявителя",
          },
          type: "section",
        },
        {
          comment: "Проверить дополнительную информацию.",
          createdAt: "2026-07-17T03:00:00.000Z",
          createdBy: "admin",
          id: "passport-section-non-passport-field",
          reason: "Уточнить дополнительную информацию",
          severity: "warning",
          status: "open",
          target: {
            applicantId: applicant.id,
            applicantName: applicant.fullName,
            field: "Дополнительная информация",
            section: "Паспортные данные",
          },
          type: "section",
        },
      ],
    };
    vi.spyOn(mediaStorage, "createMediaSignedUrl").mockResolvedValue(
      "https://example.test/non-passport-section-issue.jpg",
    );

    render(
      <ReviewWorkspace
        applicantId={applicant.id}
        onAddRemark={() => undefined}
        onApproveSection={vi.fn().mockResolvedValue(true)}
        onBack={() => undefined}
        submission={submission}
        submissionId={submission.id}
      />,
    );

    visitPrimaryIdentityMedia();
    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: /Подтвердить паспортную секцию|Перейти к следующему шагу в паспортной секции/,
        }),
      ).toBeEnabled(),
    );
    expect(
      screen.queryByText(/Есть открытое замечание паспортной секции/),
    ).not.toBeInTheDocument();
  });

  test("wires the workspace confirmation to one persisted passport-section command", async () => {
    const submission = singleSubmission();
    const applicant = submission.applicants[0];
    if (!applicant) throw new Error("Expected applicant.");
    const onAdminPassportSectionApprove = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(mediaStorage, "createMediaSignedUrl").mockResolvedValue(
      "https://example.test/protected-passport-section.jpg",
    );

    const { container } = render(
      <VisaflowBusinessBridgeProvider
        bridge={{
          onAdminPassportSectionApprove,
        }}
      >
        <AdminWorkspace
          currentEmail="qa-admin@example.test"
          onSignOut={() => undefined}
          submissions={[submission]}
          usesSupabase
        />
      </VisaflowBusinessBridgeProvider>,
    );

    const opener = container.querySelector<HTMLButtonElement>(
      `[data-submission-id="${submission.id}"]`,
    );
    if (!opener) throw new Error("Review queue opener was not rendered.");
    fireEvent.click(opener);
    expect(
      await screen.findByRole("dialog", { name: "Сверка паспорта" }),
    ).toBeVisible();

    const confirmButton = await screen.findByRole("button", {
      name: /Подтвердить паспортную секцию|Перейти к следующему шагу в паспортной секции/,
    });
    visitPrimaryIdentityMedia();
    await waitFor(() => expect(confirmButton).toBeEnabled());
    fireEvent.click(confirmButton);

    await waitFor(() =>
      expect(onAdminPassportSectionApprove).toHaveBeenCalledWith({
        applicantId: applicant.id,
        submissionId: submission.id,
      }),
    );
    expect(onAdminPassportSectionApprove).toHaveBeenCalledTimes(1);
  });

  test.each([
    {
      error: new Error("revision conflict"),
      expected:
        "Данные уже изменены другим администратором. Обновите подачу и проверьте её заново.",
    },
    {
      error: new Error("permission lost for current session"),
      expected:
        "Сессия или права доступа изменились. Войдите снова; подача не была изменена.",
    },
  ])(
    "preserves exact bridge failure feedback in the active workspace: $expected",
    async ({ error, expected }) => {
      const submission = reviewReadySubmission();
      const onSubmissionAction = vi.fn().mockRejectedValue(error);
      vi.spyOn(mediaStorage, "createMediaSignedUrl").mockResolvedValue(
        "https://example.test/protected-review.jpg",
      );
      const { container } = render(
        <VisaflowBusinessBridgeProvider bridge={{ onSubmissionAction }}>
          <AdminWorkspace
            currentEmail="qa-admin@example.test"
            onSignOut={() => undefined}
            submissions={[submission]}
            usesSupabase
          />
        </VisaflowBusinessBridgeProvider>,
      );

      const opener = container.querySelector<HTMLButtonElement>(
        `[data-submission-id="${submission.id}"]`,
      );
      if (!opener) throw new Error("Review queue opener was not rendered.");
      fireEvent.click(opener);
      fireEvent.click(
        await screen.findByRole("button", { name: "Принять на выгрузку" }),
      );

      expect(await screen.findByText(expected)).toBeVisible();
      expect(screen.getByRole("dialog", { name: "Сверка паспорта" })).toBeVisible();
      expect(onSubmissionAction).toHaveBeenCalledTimes(1);
    },
  );

  test("preserves revision-conflict feedback from the passport-section bridge", async () => {
    const submission = singleSubmission();
    const onAdminPassportSectionApprove = vi
      .fn()
      .mockRejectedValue(new Error("revision conflict"));
    vi.spyOn(mediaStorage, "createMediaSignedUrl").mockResolvedValue(
      "https://example.test/protected-passport-section.jpg",
    );
    const { container } = render(
      <VisaflowBusinessBridgeProvider bridge={{ onAdminPassportSectionApprove }}>
        <AdminWorkspace
          currentEmail="qa-admin@example.test"
          onSignOut={() => undefined}
          submissions={[submission]}
          usesSupabase
        />
      </VisaflowBusinessBridgeProvider>,
    );

    const opener = container.querySelector<HTMLButtonElement>(
      `[data-submission-id="${submission.id}"]`,
    );
    if (!opener) throw new Error("Review queue opener was not rendered.");
    fireEvent.click(opener);
    visitPrimaryIdentityMedia();
    const confirmButton = await screen.findByRole("button", {
      name: /Подтвердить паспортную секцию|Перейти к следующему шагу в паспортной секции/,
    });
    await waitFor(() => expect(confirmButton).toBeEnabled());
    fireEvent.click(confirmButton);

    expect(
      await screen.findByText(
        "Данные уже изменены другим администратором. Обновите подачу и проверьте её заново.",
      ),
    ).toBeVisible();
    expect(onAdminPassportSectionApprove).toHaveBeenCalledTimes(1);
  });

  test("submits a file remark through the canonical Files target", async () => {
    const submission = singleSubmission();
    const onAdminIssueAdd = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(mediaStorage, "createMediaSignedUrl").mockResolvedValue(
      "https://example.test/protected-passport-section.jpg",
    );
    const { container } = render(
      <VisaflowBusinessBridgeProvider bridge={{ onAdminIssueAdd }}>
        <AdminWorkspace
          currentEmail="qa-admin@example.test"
          onSignOut={() => undefined}
          submissions={[submission]}
          usesSupabase
        />
      </VisaflowBusinessBridgeProvider>,
    );

    const opener = container.querySelector<HTMLButtonElement>(
      `[data-submission-id="${submission.id}"]`,
    );
    if (!opener) throw new Error("Review queue opener was not rendered.");
    fireEvent.click(opener);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Добавить замечание: Скан загранпаспорта",
      }),
    );
    fireEvent.change(screen.getByLabelText("Текст для клиента"), {
      target: { value: "Загрузите новый читаемый оригинал паспорта." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Отправить замечание" }));

    await waitFor(() => expect(onAdminIssueAdd).toHaveBeenCalledTimes(1));
    expect(onAdminIssueAdd).toHaveBeenCalledWith({
      input: expect.objectContaining({
        applicantId: submission.applicants[0]?.id,
        fileType: "passport_scan",
        section: "Файлы",
        type: "file",
      }),
      submissionId: submission.id,
    });
  });

  test("submits a canonical field target with human-readable remark copy", async () => {
    const submission = singleSubmission();
    const onAdminIssueAdd = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <VisaflowBusinessBridgeProvider bridge={{ onAdminIssueAdd }}>
        <AdminWorkspace
          currentEmail="qa-admin@example.test"
          onSignOut={() => undefined}
          submissions={[submission]}
          usesSupabase
        />
      </VisaflowBusinessBridgeProvider>,
    );

    const opener = container.querySelector<HTMLButtonElement>(
      `[data-submission-id="${submission.id}"]`,
    );
    if (!opener) throw new Error("Review queue opener was not rendered.");
    fireEvent.click(opener);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Добавить замечание: Срок действия",
      }),
    );

    expect(screen.getByLabelText("Текст для клиента")).toHaveValue(
      "Проверьте «Срок действия».",
    );
    expect(
      screen.getByRole("dialog", { name: "Добавить замечание" }),
    ).not.toHaveTextContent("passport-expiry-date");
    fireEvent.click(screen.getByRole("button", { name: "Отправить замечание" }));

    await waitFor(() => expect(onAdminIssueAdd).toHaveBeenCalledTimes(1));
    expect(onAdminIssueAdd).toHaveBeenCalledWith({
      input: expect.objectContaining({
        applicantId: submission.applicants[0]?.id,
        field: "passport-expiry-date",
        reason: "Требуется исправить поле «Срок действия»",
        type: "field",
      }),
      submissionId: submission.id,
    });
  });

  test("keeps revision-conflict feedback inside the open remark form", async () => {
    const submission = singleSubmission();
    const onAdminIssueAdd = vi.fn().mockRejectedValue(new Error("revision conflict"));
    vi.spyOn(mediaStorage, "createMediaSignedUrl").mockResolvedValue(
      "https://example.test/protected-passport-section.jpg",
    );
    const { container } = render(
      <VisaflowBusinessBridgeProvider bridge={{ onAdminIssueAdd }}>
        <AdminWorkspace
          currentEmail="qa-admin@example.test"
          onSignOut={() => undefined}
          submissions={[submission]}
          usesSupabase
        />
      </VisaflowBusinessBridgeProvider>,
    );

    const opener = container.querySelector<HTMLButtonElement>(
      `[data-submission-id="${submission.id}"]`,
    );
    if (!opener) throw new Error("Review queue opener was not rendered.");
    fireEvent.click(opener);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Добавить замечание: Скан загранпаспорта",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Отправить замечание" }));

    expect(
      await screen.findAllByText(
        "Данные уже изменены другим администратором. Обновите подачу и проверьте её заново.",
      ),
    ).toHaveLength(2);
    expect(
      screen.getByRole("dialog", { name: "Добавить замечание" }),
    ).toBeInTheDocument();
    expect(onAdminIssueAdd).toHaveBeenCalledTimes(1);
  });

  test("confirms only passport media for a non-primary family member", async () => {
    const source = singleSubmission();
    const primary = source.applicants[0];
    if (!primary) throw new Error("Expected primary applicant.");
    const secondary: Applicant = {
      ...withPassportValues(primary),
      fullName: "Ирина Волкова",
      id: "з-1053-2",
      role: "spouse",
    };
    const family: Submission = {
      ...source,
      applicants: [primary, secondary],
      files: [...source.files, protectedFile(source.id, secondary.id, "passport_scan")],
      type: "family",
    };
    const onApproveSection = vi.fn().mockResolvedValue(true);
    const onReviewAction = vi.fn().mockResolvedValue(true);
    vi.spyOn(mediaStorage, "createMediaSignedUrl").mockResolvedValue(
      "https://example.test/family-passport.jpg",
    );

    const { container } = render(
      <ReviewWorkspace
        applicantId={secondary.id}
        onAddRemark={() => undefined}
        onApproveSection={onApproveSection}
        onBack={() => undefined}
        onReviewAction={onReviewAction}
        submission={family}
        submissionId={family.id}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId("protected-media-preview-passport_scan")).toBeVisible(),
    );
    expect(container.querySelectorAll("[data-review-media]")).toHaveLength(1);
    expect(
      screen.queryByTestId("protected-media-preview-selfie"),
    ).not.toBeInTheDocument();
    const confirmButton = screen.getByRole("button", {
      name: /Подтвердить паспортную секцию|Перейти к следующему шагу в паспортной секции/,
    });
    await waitFor(() => expect(confirmButton).toBeEnabled());
    fireEvent.click(confirmButton);

    await waitFor(() => expect(onApproveSection).toHaveBeenCalledTimes(1));
    expect(onApproveSection).toHaveBeenCalledWith({ applicantId: secondary.id });
    const acceptButton = screen.getByRole("button", {
      name: "Принять на выгрузку",
    });
    expect(acceptButton).toBeDisabled();
    fireEvent.click(acceptButton);
    expect(onReviewAction).not.toHaveBeenCalled();
  });

  test("shows a protected legacy secondary selfie only while its correction awaits review", async () => {
    const source = singleSubmission();
    const primary = source.applicants[0];
    if (!primary) throw new Error("Expected primary applicant.");
    const secondary: Applicant = {
      ...withPassportValues(primary),
      fullName: "Ирина Волкова",
      id: "з-1053-2",
      role: "spouse",
    };
    const legacySelfie = protectedFile(source.id, secondary.id, "selfie");
    const family: Submission = {
      ...source,
      applicants: [primary, secondary],
      files: [
        ...source.files,
        protectedFile(source.id, secondary.id, "passport_scan"),
        legacySelfie,
      ],
      issues: [
        {
          comment: "Селфи заменено агентом.",
          createdAt: "2026-07-17T03:00:00.000Z",
          createdBy: "admin",
          id: "legacy-secondary-selfie-issue",
          reason: "Проверьте заменённое селфи",
          severity: "warning",
          status: "fixed_by_agent",
          target: {
            applicantId: secondary.id,
            applicantName: secondary.fullName,
            field: "Селфи 1",
            fileType: "selfie",
            section: "Файлы",
          },
          type: "file",
        },
      ],
      status: "corrections_received",
      type: "family",
    };
    const correctedSelfie = deferred<string>();
    vi.spyOn(mediaStorage, "createMediaSignedUrl").mockImplementation(
      async ({ path }) =>
        path.includes("/selfie/")
          ? correctedSelfie.promise
          : "https://example.test/secondary-passport.jpg",
    );

    const { container } = render(
      <ReviewWorkspace
        applicantId={secondary.id}
        onAddRemark={() => undefined}
        onApproveSection={vi.fn().mockResolvedValue(true)}
        onBack={() => undefined}
        submission={family}
        submissionId={family.id}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Селфи 1" }));
    expect(
      screen.getByRole("button", {
        name: /Подтвердить паспортную секцию|Перейти к следующему шагу в паспортной секции/,
      }),
    ).toBeEnabled();
    await act(async () => {
      correctedSelfie.resolve("https://example.test/legacy-secondary-selfie.jpg");
      await correctedSelfie.promise;
    });
    await waitFor(() =>
      expect(screen.getByTestId("protected-media-preview-selfie")).toBeVisible(),
    );
    expect(container.querySelectorAll("[data-review-media]")).toHaveLength(2);
    expect(
      screen.queryByTestId("protected-media-preview-selfie_2"),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: /Подтвердить паспортную секцию|Перейти к следующему шагу в паспортной секции/,
        }),
      ).toBeEnabled(),
    );
  });
});

describe("AdminReviewDrawer document comparison", () => {
  test("opens document comparison directly and restores the original queue focus", async () => {
    const submission = initialSubmissions.find((item) => item.id === "ПД-1053");
    if (!submission) throw new Error("Expected admin review fixture.");
    const onVerifyDocument = vi.fn();

    const { container } = render(
      <VisaflowBusinessBridgeProvider bridge={{ onVerifyDocument }}>
        <AdminWorkspace
          currentEmail="qa-admin@example.test"
          onSignOut={() => undefined}
          submissions={[submission]}
          usesSupabase
        />
      </VisaflowBusinessBridgeProvider>,
    );

    const opener = container.querySelector<HTMLButtonElement>(
      '[data-submission-id="ПД-1053"]',
    );
    if (!opener) throw new Error("Review queue opener was not rendered.");
    opener.focus();
    fireEvent.click(opener);

    expect(onVerifyDocument).toHaveBeenCalledWith(submission.id);
    expect(
      await screen.findByRole("dialog", { name: "Сверка паспорта" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: `Сверка паспорта · ${submission.id}` }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Контекст проверки подачи")).toHaveTextContent(
      `${submission.applicants[0]?.fullName}${submission.id}`,
    );
    expect(screen.getByLabelText("Скачать файл")).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Добавить замечание" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Вернуться к очереди" }));

    await waitFor(() => expect(opener).toHaveFocus());
  });
});

describe("Admin document-review target safety", () => {
  test("does not redirect a family remark to the first applicant when its ID is invalid", () => {
    const source = initialSubmissions.find((item) => item.id === "ПД-1053");
    if (!source) throw new Error("Expected admin review fixture.");
    const firstApplicant = source.applicants[0];
    if (!firstApplicant) throw new Error("Expected applicant.");
    const family = {
      ...source,
      applicants: [firstApplicant, { ...firstApplicant, id: "з-1053-2" }],
    };

    expect(
      addPreciseAdminIssue(family, {
        applicantId: firstApplicant.id,
        comment: "Контрольная запись для проверки допустимого адресата.",
        field: "Номер паспорта",
        reason: "Требуется исправление поля.",
        severity: "blocker",
        type: "field",
      }),
    ).not.toBe(family);

    expect(() =>
      addPreciseAdminIssue(family, {
        applicantId: "missing-applicant",
        comment: "Точный комментарий для проверки fail-closed поведения.",
        field: "Номер паспорта",
        reason: "Требуется исправление поля.",
        severity: "blocker",
        type: "field",
      }),
    ).toThrow(
      "Admin issue target must resolve to exactly one canonical questionnaire field or media file.",
    );
    expect(family.issues).toHaveLength(source.issues.length);
  });
});

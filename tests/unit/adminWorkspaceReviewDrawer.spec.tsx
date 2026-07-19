import {
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
import type {
  Applicant,
  Submission,
  SubmissionFile,
} from "../../src/modules/submissions/types";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AdminReviewDrawer visual hierarchy", () => {
  test("routes the four review outcomes through the canonical admin actions", () => {
    const corrections = initialSubmissions.find((item) => item.id === "ПД-1055");
    if (!corrections) throw new Error("Expected corrections-received fixture.");
    const cleanReview = {
      ...corrections,
      status: "submitted_for_review" as const,
      issues: [],
    };
    const reviewWithIssue = addPreciseAdminIssue(cleanReview, {
      applicantId: cleanReview.applicants[0]?.id ?? "",
      comment: "Исправьте значение перед повторной проверкой.",
      field: "Адрес отеля",
      reason: "Адрес отеля требует исправления",
      severity: "blocker",
      type: "field",
    });
    const correctionsWithIssue = addPreciseAdminIssue(corrections, {
      applicantId: corrections.applicants[0]?.id ?? "",
      comment: "Исправление не прошло повторную проверку.",
      field: "Адрес отеля",
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
        submission: corrections,
        button: "Принять на выгрузку",
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

  test("moves a clean accepted submission directly to the export workspace", async () => {
    const corrections = initialSubmissions.find((item) => item.id === "ПД-1055");
    if (!corrections) throw new Error("Expected corrections-received fixture.");
    const cleanReview = {
      ...corrections,
      status: "submitted_for_review" as const,
      issues: [],
    };
    const onSubmissionAction = vi.fn().mockResolvedValue(undefined);

    const { container } = render(
      <VisaflowBusinessBridgeProvider bridge={{ onSubmissionAction }}>
        <AdminWorkspace
          currentEmail="qa-admin@example.test"
          onSignOut={() => undefined}
          submissions={[cleanReview]}
          usesSupabase
        />
      </VisaflowBusinessBridgeProvider>,
    );

    const opener = container.querySelector<HTMLButtonElement>(
      `[data-submission-id="${cleanReview.id}"]`,
    );
    if (!opener) throw new Error("Review queue opener was not rendered.");
    fireEvent.click(opener);
    fireEvent.click(await screen.findByRole("button", { name: "Принять на выгрузку" }));

    await waitFor(() => {
      expect(onSubmissionAction).toHaveBeenCalledWith({
        action: "accept",
        source: "admin",
        submissionId: cleanReview.id,
      });
      expect(screen.getByRole("heading", { name: "Выгрузка" })).toBeVisible();
    });
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
    const onPrimaryAction = vi.fn();

    render(
      <AdminReviewDrawer
        isOpen
        submission={submission}
        submissionId={submission.id}
        onAddRemark={vi.fn()}
        onClose={vi.fn()}
        onPrimaryAction={onPrimaryAction}
        onVerifyDocument={vi.fn()}
      />,
    );

    const accept = screen.getByRole("button", { name: "Принять на выгрузку" });
    expect(accept).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Отправить на исправление" }),
    ).not.toBeInTheDocument();
    fireEvent.click(accept);
    expect(onPrimaryAction).toHaveBeenCalledWith(submission.id, "close_issues_accept");
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

  test("renders queue cards as one flat ordered grid without lane divisions", () => {
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
    expect(container.querySelectorAll(".v19-admin-review-card-grid")).toHaveLength(1);
    expect(
      container.querySelectorAll(".v19-admin-review-card-grid > [data-submission-card]"),
    ).toHaveLength(2);
    expect(container.querySelector(".v19-admin-review-lane")).toBeNull();
    expect(container.querySelector(".v19-admin-review-lane-header")).toBeNull();
  });

  test("renders the agent display name and compact card identity", () => {
    const source = initialSubmissions.find((item) => item.id === "ПД-1053");
    if (!source) throw new Error("Expected review queue fixture.");

    const submission: Submission = {
      ...source,
      agentDisplayName: "Антон Волков",
      updatedAt: "2026-07-17T12:26:26.214Z",
    };
    const { container } = render(
      <ReviewScreen onOpenDrawer={vi.fn()} submissions={[submission]} />,
    );

    expect(container.querySelector(".v19-admin-review-card-agent")).toHaveTextContent(
      "Антон Волков",
    );
    expect(container.querySelector(".v19-admin-review-card-meta")).toHaveTextContent(
      "1 чел.",
    );
    expect(container.querySelector(".v19-admin-review-card-location")).toHaveTextContent(
      "Казань",
    );
    expect(container).not.toHaveTextContent("17 июл., 15:26");
    expect(container).not.toHaveTextContent(source.agentId);
    expect(container).not.toHaveTextContent("2026-07-17T12:26:26.214Z");
  });

  test("does not expose internal questionnaire status values", async () => {
    const source = initialSubmissions.find((item) => item.id === "ПД-1053");
    const applicant = source?.applicants[0];
    if (!source || !applicant) throw new Error("Expected admin review fixture.");
    const submission = {
      ...source,
      applicants: [{ ...applicant, questionnaireStatus: "needs_fix" as const }],
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
  const reviewFieldValues: Record<string, string> = {
    surname: "VOLKOVA",
    "first-name": "NINA",
    "birth-date": "20.08.1990",
    "birth-place": "KAZAN",
    "passport-no": "661053001",
    "passport-issue-place": "FMS 16001",
    "passport-issue-date": "26.02.2016",
    "passport-expiry-date": "26.02.2032",
  };

  function withReviewFieldValues(applicant: Applicant): Applicant {
    return {
      ...applicant,
      sections: applicant.sections.map((section) => ({
        ...section,
        fields: section.fields.map((field) => ({
          ...field,
          value: reviewFieldValues[field.id] ?? field.value,
        })),
      })),
    };
  }

  function protectedReviewFile(
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
      mimeType: "image/jpeg",
      status: "pending_review",
      storageAdapter: "supabase-private",
      storageBucket: target.bucket,
      storagePath: target.path,
      type,
      uploadStatus: "uploaded",
    };
  }

  function singleReviewSubmission(): Submission {
    const source = initialSubmissions.find((item) => item.id === "ПД-1053");
    const applicant = source?.applicants[0];
    if (!source || !applicant) throw new Error("Expected admin review fixture.");

    return {
      ...source,
      applicants: [withReviewFieldValues(applicant)],
      files: [
        protectedReviewFile(source.id, applicant.id, "passport_scan"),
        protectedReviewFile(source.id, applicant.id, "selfie"),
        protectedReviewFile(source.id, applicant.id, "selfie_2"),
      ],
    };
  }

  test("shows exactly eight passport-backed fields and one section confirmation", () => {
    const submission = singleReviewSubmission();
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
      "surname",
      "first-name",
      "birth-date",
      "birth-place",
      "passport-no",
      "passport-issue-place",
      "passport-issue-date",
      "passport-expiry-date",
    ]);
    expect(screen.queryByText("Город подачи")).not.toBeInTheDocument();
    expect(screen.queryByText("Тип визы")).not.toBeInTheDocument();
    expect(screen.queryByText("Текущее гражданство")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Подтвердить:/ })).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Подтвердить паспортную секцию" }),
    ).toHaveLength(1);
  });

  test("keeps a field remark attached to the exact applicant and field", () => {
    const submission = singleReviewSubmission();
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
      screen.getByRole("button", { name: "Добавить замечание: Номер паспорта" }),
    );
    expect(onAddRemark).toHaveBeenCalledWith(
      "Номер паспорта",
      applicant.fullName,
      undefined,
      applicant.id,
    );
  });

  test("shows passport and both selfies for single and confirms them with one action", async () => {
    const submission = singleReviewSubmission();
    const applicant = submission.applicants[0];
    if (!applicant) throw new Error("Expected applicant.");
    const onAcceptFile = vi.fn().mockResolvedValue(true);
    vi.spyOn(mediaStorage, "createMediaSignedUrl").mockImplementation(async ({ path }) =>
      `https://example.test/${encodeURIComponent(path)}.jpg`,
    );

    const { container } = render(
      <ReviewWorkspace
        applicantId={applicant.id}
        onAcceptFile={onAcceptFile}
        onAddRemark={() => undefined}
        onBack={() => undefined}
        submission={submission}
        submissionId={submission.id}
      />,
    );

    await waitFor(() =>
      expect(container.querySelectorAll("[data-review-media]")).toHaveLength(3),
    );
    await waitFor(() => {
      expect(screen.getByTestId("protected-media-preview-passport_scan")).toBeVisible();
    }, { timeout: 5_000 });
    expect(screen.getByTestId("protected-media-preview-selfie")).toBeVisible();
    expect(screen.getByTestId("protected-media-preview-selfie_2")).toBeVisible();

    const confirmButton = screen.getByRole("button", {
      name: "Подтвердить паспортную секцию",
    });
    await waitFor(() => expect(confirmButton).toBeEnabled());
    fireEvent.click(confirmButton);

    await waitFor(() => expect(onAcceptFile).toHaveBeenCalledTimes(3));
    expect(onAcceptFile).toHaveBeenNthCalledWith(1, {
      applicantId: applicant.id,
      fileType: "passport_scan",
    });
    expect(onAcceptFile).toHaveBeenNthCalledWith(2, {
      applicantId: applicant.id,
      fileType: "selfie",
    });
    expect(onAcceptFile).toHaveBeenNthCalledWith(3, {
      applicantId: applicant.id,
      fileType: "selfie_2",
    });
    await waitFor(() => expect(screen.getByText("Секция подтверждена")).toBeVisible());
  });

  test("fails closed when a protected path belongs to another applicant", () => {
    const submission = singleReviewSubmission();
    const applicant = submission.applicants[0];
    if (!applicant) throw new Error("Expected applicant.");
    const foreignPassport = protectedReviewFile(
      submission.id,
      "з-9999-1",
      "passport_scan",
    );
    const mismatchedSubmission: Submission = {
      ...submission,
      files: submission.files.map((file) =>
        file.type === "passport_scan"
          ? { ...foreignPassport, applicantId: applicant.id }
          : file,
      ),
    };
    const createSignedUrl = vi.spyOn(mediaStorage, "createMediaSignedUrl");

    render(
      <ReviewWorkspace
        applicantId={applicant.id}
        onAcceptFile={vi.fn()}
        onAddRemark={() => undefined}
        onBack={() => undefined}
        submission={mismatchedSubmission}
        submissionId={submission.id}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Подтвердить паспортную секцию" }),
    ).toBeDisabled();
    expect(createSignedUrl).toHaveBeenCalledTimes(2);
  });

  test("shows and confirms only the passport for a non-primary family member", async () => {
    const source = singleReviewSubmission();
    const primaryApplicant = source.applicants[0];
    if (!primaryApplicant) throw new Error("Expected primary applicant.");
    const secondApplicant: Applicant = {
      ...withReviewFieldValues(primaryApplicant),
      fullName: "Ирина Волкова",
      id: "з-1053-2",
      role: "spouse",
    };
    const familySubmission: Submission = {
      ...source,
      applicants: [primaryApplicant, secondApplicant],
      files: [
        ...source.files,
        protectedReviewFile(source.id, secondApplicant.id, "passport_scan"),
      ],
      title: "Семья Волковых",
      type: "family",
    };
    const onAcceptFile = vi.fn().mockResolvedValue(true);
    vi.spyOn(mediaStorage, "createMediaSignedUrl").mockResolvedValue(
      "https://example.test/family-passport.jpg",
    );

    const { container } = render(
      <ReviewWorkspace
        applicantId={secondApplicant.id}
        onAcceptFile={onAcceptFile}
        onAddRemark={() => undefined}
        onBack={() => undefined}
        submission={familySubmission}
        submissionId={familySubmission.id}
      />,
    );

    expect(await screen.findByTestId("protected-media-preview-passport_scan")).toBeVisible();
    expect(container.querySelectorAll("[data-review-media]")).toHaveLength(1);
    expect(screen.queryByTestId("protected-media-preview-selfie")).not.toBeInTheDocument();
    expect(screen.queryByTestId("protected-media-preview-selfie_2")).not.toBeInTheDocument();

    const confirmButton = screen.getByRole("button", {
      name: "Подтвердить паспортную секцию",
    });
    await waitFor(() => expect(confirmButton).toBeEnabled());
    fireEvent.click(confirmButton);

    await waitFor(() =>
      expect(onAcceptFile).toHaveBeenCalledWith({
        applicantId: secondApplicant.id,
        fileType: "passport_scan",
      }),
    );
    expect(onAcceptFile).toHaveBeenCalledTimes(1);
  });
});

describe("AdminReviewDrawer document comparison", () => {
  test("keeps document comparison separate from remarks and restores the original queue focus", async () => {
    const submission = initialSubmissions.find((item) => item.id === "ПД-1053");
    if (!submission) throw new Error("Expected admin review fixture.");

    const { container } = render(
      <AdminWorkspace
        currentEmail="qa-admin@example.test"
        onSignOut={() => undefined}
        submissions={[submission]}
        usesSupabase
      />,
    );

    const opener = container.querySelector<HTMLButtonElement>(
      '[data-submission-id="ПД-1053"]',
    );
    if (!opener) throw new Error("Review queue opener was not rendered.");
    opener.focus();
    fireEvent.click(opener);

    fireEvent.click(await screen.findByRole("tab", { name: /Файлы/ }));
    const passportFileLabel = await screen.findByText("Скан паспорта", {
      selector: ".v19-drawer-file-title",
    });
    const passportFileItem = passportFileLabel.closest(".admin-review-file-item");
    if (!passportFileItem) throw new Error("Passport file row was not rendered.");
    fireEvent.click(within(passportFileItem).getByRole("button", { name: "Проверить" }));

    expect(
      await screen.findByRole("dialog", { name: "Сверка паспорта" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: `Паспортная секция · ${submission.id}` }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Добавить замечание" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Вернуться к подаче" }));
    fireEvent.keyDown(document, { key: "Escape" });

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

    const unchanged = addPreciseAdminIssue(family, {
      applicantId: "missing-applicant",
      comment: "Точный комментарий для проверки fail-closed поведения.",
      field: "Номер паспорта",
      reason: "Требуется исправление поля.",
      severity: "blocker",
      type: "field",
    });

    expect(unchanged).toBe(family);
  });
});

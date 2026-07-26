import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApplicantsScreen } from "../../src/components/ApplicantsScreen";
import {
  createDraftSubmission,
  uploadRequiredFiles,
} from "../../src/modules/submissions/submissionActions";
import { SubmissionActionDomainError } from "../../src/modules/submissions/submissionActionErrors";
import {
  applyAgentSubmitForReviewResult,
  applySubmissionActionResult,
  canPerformAction,
} from "../../src/modules/submissions/status";
import type { Submission } from "../../src/modules/submissions/types";
import { isAdminReviewQueueSubmission } from "../../src/modules/submissions/uiTypes";
import { mapSupabasePersistenceError } from "../../src/services/persistenceObservability";
import { fillRequiredQuestionnaireForTest } from "./helpers/questionnaireTestFill";

let submissionSequence = 0;
const originalScrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollIntoView",
);

function createSubmission(
  type: Submission["type"] = "single",
  createdAt = "2026-07-19T10:00:00.000Z",
): Submission {
  const submission = createDraftSubmission({
    city: "Москва",
    familyCount: type === "family" ? 2 : 1,
    submissions: [],
    type,
  });
  submissionSequence += 1;
  return {
    ...submission,
    createdAt,
    id: `test-submission-${submissionSequence}`,
  };
}

function readySubmission(type: Submission["type"]) {
  const complete = fillRequiredQuestionnaireForTest(createSubmission(type));
  return {
    ...uploadRequiredFiles(complete),
    status: "in_progress" as const,
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  submissionSequence = 0;
  if (originalScrollIntoViewDescriptor) {
    Object.defineProperty(
      HTMLElement.prototype,
      "scrollIntoView",
      originalScrollIntoViewDescriptor,
    );
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  }
});

function visibleSubmissionIds() {
  return [...document.querySelectorAll<HTMLElement>("[data-submission-id]")].map(
    (card) => card.dataset.submissionId,
  );
}

describe("ApplicantsScreen interactions", () => {
  it("renders four accessible actions and no readiness percentage", () => {
    const submission = createSubmission();
    render(
      <ApplicantsScreen
        onOpenDrawer={vi.fn()}
        submissions={[submission]}
        typeFilter="single"
      />,
    );

    expect(
      screen.getByRole("button", { name: /Анкета: нужна доработка/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Селфи 1: не добавлено/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Селфи 2: не добавлено/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Паспорт: не добавлено/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/% готово/)).not.toBeInTheDocument();
    expect(document.querySelector("time.v19-applicant-created-at")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /^Открыть:/ })).not.toBeInTheDocument();

    const card = screen.getByRole("article", {
      name: `Подача ${submission.applicants[0]!.fullName}`,
    });
    const footer = card.querySelector(".v19-applicant-card-footer");
    expect(footer).not.toBeNull();
    expect(within(footer as HTMLElement).getAllByRole("button")).toHaveLength(4);
  });

  it("opens the matching drawer from the card without stealing nested actions", () => {
    const submission = createSubmission("single");
    const onOpenDrawer = vi.fn();
    render(
      <ApplicantsScreen
        onOpenDrawer={onOpenDrawer}
        submissions={[submission]}
        typeFilter="single"
      />,
    );

    const card = screen.getByRole("article", {
      name: `Подача ${submission.applicants[0]!.fullName}`,
    });
    fireEvent.click(card);
    expect(onOpenDrawer).toHaveBeenCalledOnce();
    expect(onOpenDrawer).toHaveBeenCalledWith(submission.id);

    fireEvent.keyDown(card, { key: "Enter" });
    fireEvent.keyDown(card, { key: " " });
    expect(onOpenDrawer).toHaveBeenCalledTimes(3);

    fireEvent.click(within(card).getByRole("button", { name: /Анкета:/ }));
    expect(onOpenDrawer).toHaveBeenCalledTimes(3);
  });

  it("animates the card action into the workflow slot only after every action is ready", () => {
    const submission = createSubmission("single");
    const view = render(
      <ApplicantsScreen
        onOpenDrawer={vi.fn()}
        submissions={[submission]}
        typeFilter="single"
      />,
    );
    const card = screen.getByRole("article", {
      name: `Подача ${submission.applicants[0]!.fullName}`,
    });
    const workflowSwitch = card.querySelector(".v19-applicant-workflow-switch");
    expect(workflowSwitch).toHaveAttribute("data-ready", "false");
    expect(
      within(card).queryByRole("button", { name: /^Открыть:/ }),
    ).not.toBeInTheDocument();

    const ready = {
      ...uploadRequiredFiles(fillRequiredQuestionnaireForTest(submission)),
      status: "submitted_for_review" as const,
    };
    view.rerender(
      <ApplicantsScreen
        onOpenDrawer={vi.fn()}
        submissions={[ready]}
        typeFilter="single"
      />,
    );

    expect(workflowSwitch).toHaveAttribute("data-ready", "true");
    expect(within(card).getByRole("button", { name: /^Открыть:/ })).toBeInTheDocument();
    expect(
      within(card).queryByRole("button", { name: /Паспорт: готово/ }),
    ).not.toBeInTheDocument();
    expect(card.querySelector(".v19-applicant-workflow-actions")).toHaveClass(
      "is-replaced",
    );
    expect(card.querySelector(".v19-applicant-status-action")).toHaveClass(
      "is-visible",
    );
  });

  it("shows selfies only for the main family applicant", () => {
    const submission = createSubmission("family");
    render(
      <ApplicantsScreen
        onOpenDrawer={vi.fn()}
        submissions={[submission]}
        typeFilter="family"
      />,
    );

    const documentGroups = screen.getAllByRole("group", { name: /^Документы:/ });
    expect(document.querySelectorAll(".v19-applicant-member-role")).toHaveLength(0);
    expect(screen.queryByText(/^Супруг(?:\/супруга)?$/)).not.toBeInTheDocument();
    expect(screen.getByText("Заявитель 2")).toBeInTheDocument();
    expect(screen.getByText("VF—")).toHaveClass("v19-applicant-public-id");
    expect(within(documentGroups[0]!).getAllByRole("button")).toHaveLength(4);
    expect(within(documentGroups[1]!).getAllByRole("button")).toHaveLength(2);
    expect(
      within(documentGroups[1]!).queryByRole("button", { name: /Селфи/ }),
    ).not.toBeInTheDocument();
    expect(
      within(documentGroups[1]!).getByRole("button", { name: /Анкета:/ }),
    ).toBeInTheDocument();
    expect(
      within(documentGroups[1]!).getByRole("button", { name: /Паспорт:/ }),
    ).toBeInTheDocument();
  });

  it("uploads a missing selfie through the exact applicant slot", async () => {
    const submission = createSubmission();
    const onUploadApplicantFile = vi.fn().mockResolvedValue(undefined);
    render(
      <ApplicantsScreen
        onOpenDrawer={vi.fn()}
        onUploadApplicantFile={onUploadApplicantFile}
        submissions={[submission]}
        typeFilter="single"
      />,
    );

    const file = new File(["selfie"], "selfie.jpg", { type: "image/jpeg" });
    fireEvent.change(
      screen.getByLabelText(
        `Выбрать файл: Селфи 1, ${submission.applicants[0]!.fullName}`,
      ),
      { target: { files: [file] } },
    );

    await waitFor(() =>
      expect(onUploadApplicantFile).toHaveBeenCalledWith(
        submission.id,
        submission.applicants[0]!.id,
        "selfie",
        file,
      ),
    );
  });

  it("opens the exact remark and exact ready file target", () => {
    const base = uploadRequiredFiles(createSubmission());
    const applicant = base.applicants[0]!;
    const withIssue: Submission = {
      ...base,
      issues: [
        {
          id: "issue-passport",
          type: "file",
          target: {
            applicantId: applicant.id,
            applicantName: applicant.fullName,
            fileType: "passport_scan",
          },
          reason: "Нечитаемый скан",
          comment: "Загрузите новый паспорт",
          severity: "blocker",
          status: "open",
          createdBy: "admin",
          createdAt: new Date().toISOString(),
        },
      ],
    };
    const onOpenWorkspaceTarget = vi.fn();
    render(
      <ApplicantsScreen
        onOpenDrawer={vi.fn()}
        onOpenWorkspaceTarget={onOpenWorkspaceTarget}
        submissions={[withIssue]}
        typeFilter="single"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Паспорт: нужна доработка/ }));
    expect(onOpenWorkspaceTarget).toHaveBeenLastCalledWith(withIssue.id, {
      issueId: "issue-passport",
      tab: "issues",
    });

    fireEvent.click(screen.getByRole("button", { name: /Селфи 1: готово/ }));
    expect(onOpenWorkspaceTarget).toHaveBeenLastCalledWith(withIssue.id, {
      applicantId: applicant.id,
      fileType: "selfie",
      tab: "files",
    });
  });

  it("alerts for a completed questionnaire", () => {
    const submission = fillRequiredQuestionnaireForTest(createSubmission());
    const alert = vi.spyOn(window, "alert").mockImplementation(() => undefined);
    render(
      <ApplicantsScreen
        onOpenDrawer={vi.fn()}
        submissions={[submission]}
        typeFilter="single"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Анкета: готово/ }));
    expect(alert).toHaveBeenCalledWith("Анкета уже заполнена");
  });

  it("filters all, family, and single submissions through the type control", () => {
    const olderSingle = createSubmission("single", "2026-07-18T10:00:00.000Z");
    const newerFamily = createSubmission("family", "2026-07-19T10:00:00.000Z");
    render(
      <ApplicantsScreen
        onOpenDrawer={vi.fn()}
        submissions={[olderSingle, newerFamily]}
      />,
    );

    expect(visibleSubmissionIds()).toEqual([olderSingle.id]);

    fireEvent.click(screen.getByRole("button", { name: "Тип подачи: Заявитель" }));
    fireEvent.click(screen.getByRole("option", { name: "Семья" }));
    expect(visibleSubmissionIds()).toEqual([newerFamily.id]);

    fireEvent.click(screen.getByRole("button", { name: "Тип подачи: Семья" }));
    fireEvent.click(screen.getByRole("option", { name: "Все" }));
    expect(visibleSubmissionIds()).toEqual([newerFamily.id, olderSingle.id]);
  });

  it("shows only the currently visible card count next to the list title", () => {
    const first = {
      ...createSubmission("single"),
      publicNumber: 731,
    } satisfies Submission;
    const second = {
      ...createSubmission("single"),
      publicNumber: 84,
    } satisfies Submission;
    render(
      <ApplicantsScreen
        onOpenDrawer={vi.fn()}
        submissions={[first, second]}
        typeFilter="single"
      />,
    );

    const header = document.querySelector<HTMLElement>(
      ".v19-agent-submissions-board .v19-admin-list-header",
    );
    expect(header).not.toBeNull();
    expect(header?.querySelector("strong")).toHaveTextContent("Мои подачи");
    expect(header?.querySelector("small")).toHaveTextContent("2");
    expect(header).not.toHaveTextContent("Сначала новые");

    fireEvent.change(screen.getByRole("textbox", { name: "Поиск по подачам" }), {
      target: { value: "VF-731" },
    });

    expect(header?.querySelector("small")).toHaveTextContent("1");
  });

  it("sorts each visible type group by createdAt in direct and reverse order", () => {
    const oldest = createSubmission("single", "2026-07-17T10:00:00.000Z");
    const newest = createSubmission("family", "2026-07-19T10:00:00.000Z");
    const middle = createSubmission("single", "2026-07-18T10:00:00.000Z");
    render(
      <ApplicantsScreen
        onOpenDrawer={vi.fn()}
        submissions={[oldest, newest, middle]}
        typeFilter="all"
      />,
    );

    expect(visibleSubmissionIds()).toEqual([newest.id, middle.id, oldest.id]);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Сортировка подач: Сначала новые",
      }),
    );
    fireEvent.click(screen.getByRole("option", { name: "Сначала старые" }));
    expect(visibleSubmissionIds()).toEqual([newest.id, oldest.id, middle.id]);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Сортировка подач: Сначала старые",
      }),
    );
    fireEvent.click(screen.getByRole("option", { name: "Сначала новые" }));
    expect(visibleSubmissionIds()).toEqual([newest.id, middle.id, oldest.id]);
  });

  it("finds a submission by its assigned VF number", () => {
    const matched = {
      ...createSubmission("single"),
      publicNumber: 731,
    } satisfies Submission;
    const other = {
      ...createSubmission("family"),
      publicNumber: 84,
    } satisfies Submission;
    render(
      <ApplicantsScreen
        onOpenDrawer={vi.fn()}
        submissions={[other, matched]}
        typeFilter="all"
      />,
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Поиск по подачам" }), {
      target: { value: "VF-731" },
    });

    expect(visibleSubmissionIds()).toEqual([matched.id]);
  });

  it("finds a legacy submission by the same derived VF number shown on its card", () => {
    const matched = createSubmission("single");
    matched.id = "ПД-1052";
    delete matched.publicNumber;
    const other = createSubmission("single");

    render(
      <ApplicantsScreen
        onOpenDrawer={vi.fn()}
        submissions={[other, matched]}
        typeFilter="single"
      />,
    );

    expect(screen.getByText("VF-1052")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Поиск по подачам" }), {
      target: { value: "VF-1052" },
    });

    expect(visibleSubmissionIds()).toEqual([matched.id]);
  });

  it("uses one system confirmation request for the review handoff", async () => {
    const single = readySubmission("single");
    const family = readySubmission("family");
    expect(canPerformAction(single, "submit_for_review", "agent").ok).toBe(true);
    expect(canPerformAction(family, "submit_for_review", "agent").ok).toBe(true);
    const nativeConfirm = vi.spyOn(window, "confirm");
    let resolveSubmission: (() => void) | undefined;
    const submissionPromise = new Promise<void>((resolve) => {
      resolveSubmission = resolve;
    });
    const onSubmitForReview = vi.fn().mockReturnValue(submissionPromise);
    const view = render(
      <ApplicantsScreen
        onOpenDrawer={vi.fn()}
        onSubmitForReview={onSubmitForReview}
        submissions={[single, family]}
        typeFilter="all"
      />,
    );

    const submitButtons = screen.getAllByRole("button", {
      name: /Отправить на проверку:/,
    });
    expect(submitButtons).toHaveLength(2);
    const familyCard = screen.getByRole("article", { name: /Подача Семья/ });
    expect(
      within(familyCard).getAllByRole("group", { name: /^Документы:/ }),
    ).toHaveLength(2);
    expect(screen.getAllByText("В работе")).toHaveLength(2);
    const singleCard = document.querySelector<HTMLElement>(
      `[data-submission-id="${single.id}"]`,
    );
    expect(singleCard).not.toBeNull();
    fireEvent.click(
      within(singleCard as HTMLElement).getByRole("button", {
        name: /Отправить на проверку:/,
      }),
    );
    expect(nativeConfirm).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", {
      name: "Отправить на проверку администратору?",
    });
    expect(dialog).toHaveTextContent(
      "После отправки подача перейдёт в очередь проверки администратора.",
    );
    expect(within(dialog).getByRole("button", { name: "Отмена" })).toHaveFocus();

    const submitButton = within(dialog).getByRole("button", { name: "Отправить" });
    fireEvent.click(submitButton);
    fireEvent.click(submitButton);

    expect(onSubmitForReview).toHaveBeenCalledTimes(1);
    expect(onSubmitForReview).toHaveBeenCalledWith(single.id);
    expect(submitButton).toBeDisabled();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(dialog).toBeInTheDocument();

    resolveSubmission?.();
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", {
          name: "Отправить на проверку администратору?",
        }),
      ).not.toBeInTheDocument(),
    );

    const transition = applySubmissionActionResult(
      single,
      "submit_for_review",
      "agent",
      single.agentId,
    );
    expect(transition.ok).toBe(true);
    if (!transition.ok) {
      return;
    }
    expect(transition.data.status).toBe("submitted_for_review");
    expect(isAdminReviewQueueSubmission(transition.data)).toBe(true);

    view.rerender(
      <ApplicantsScreen
        onOpenDrawer={vi.fn()}
        onSubmitForReview={onSubmitForReview}
        submissions={[transition.data]}
        typeFilter="single"
      />,
    );
    expect(screen.getByText("На проверке")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Отправить на проверку:/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Открыть:/ })).toBeInTheDocument();
  });

  it("keeps review confirmation cancel and focus behavior keyboard-safe", () => {
    const submission = readySubmission("single");
    const nativeConfirm = vi.spyOn(window, "confirm");
    const onOpenDrawer = vi.fn();
    const onSubmitForReview = vi.fn().mockResolvedValue(undefined);

    render(
      <ApplicantsScreen
        onOpenDrawer={onOpenDrawer}
        onSubmitForReview={onSubmitForReview}
        submissions={[submission]}
        typeFilter="single"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Отправить на проверку:/ }));

    const dialog = screen.getByRole("dialog", {
      name: "Отправить на проверку администратору?",
    });
    const cancelButton = within(dialog).getByRole("button", { name: "Отмена" });
    const submitButton = within(dialog).getByRole("button", { name: "Отправить" });
    expect(cancelButton).toHaveFocus();

    fireEvent.keyDown(cancelButton, { key: "Tab", shiftKey: true });
    expect(submitButton).toHaveFocus();
    fireEvent.keyDown(submitButton, { key: "Tab" });
    expect(cancelButton).toHaveFocus();

    fireEvent.click(dialog.parentElement!);
    expect(dialog).toBeInTheDocument();

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(
      screen.queryByRole("dialog", {
        name: "Отправить на проверку администратору?",
      }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Отправить на проверку:/ }));
    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));

    expect(nativeConfirm).not.toHaveBeenCalled();
    expect(onSubmitForReview).not.toHaveBeenCalled();
    expect(onOpenDrawer).not.toHaveBeenCalled();
  });

  it("keeps a failed review handoff visible and retryable in the dialog", async () => {
    const submission = readySubmission("single");
    const onSubmitForReview = vi.fn().mockRejectedValue(
      new SubmissionActionDomainError({
        code: "VALIDATION_ERROR",
        message: "Заполните обязательные поля анкеты.",
      }),
    );

    render(
      <ApplicantsScreen
        onOpenDrawer={vi.fn()}
        onSubmitForReview={onSubmitForReview}
        submissions={[submission]}
        typeFilter="single"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Отправить на проверку:/ }));
    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Заполните обязательные поля анкеты.");
    expect(
      screen.getByRole("dialog", {
        name: "Отправить на проверку администратору?",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Отправить" })).toBeEnabled();
  });

  it("shows a safe Russian message instead of an internal RPC error", async () => {
    const submission = readySubmission("single");
    const persistenceError = mapSupabasePersistenceError(
      {
        code: "42703",
        message: "column submissions.public_number does not exist",
      },
      {
        operation: "rpc.save_submission_draft",
        fallbackKind: "save",
      },
    );
    const onSubmitForReview = vi.fn().mockRejectedValue(persistenceError);

    render(
      <ApplicantsScreen
        onOpenDrawer={vi.fn()}
        onSubmitForReview={onSubmitForReview}
        submissions={[submission]}
        typeFilter="single"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Отправить на проверку:/ }));
    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Не удалось сохранить изменения. Загружена последняя сохранённая версия; повторите действие.",
    );
    expect(alert).not.toHaveTextContent("42703");
    expect(alert).not.toHaveTextContent("failed safely");
    expect(alert).not.toHaveTextContent("public_number");
  });

  it("does not trust a Russian-looking infrastructure error as domain validation", async () => {
    const submission = readySubmission("single");
    const onSubmitForReview = vi
      .fn()
      .mockRejectedValue(
        new Error(
          'Ошибка SQL: update public.submissions set status = "waiting_review"',
        ),
      );

    render(
      <ApplicantsScreen
        onOpenDrawer={vi.fn()}
        onSubmitForReview={onSubmitForReview}
        submissions={[submission]}
        typeFilter="single"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Отправить на проверку:/ }));
    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Не удалось отправить подачу на проверку. Повторите действие.",
    );
    expect(alert).not.toHaveTextContent("Ошибка SQL");
    expect(alert).not.toHaveTextContent("public.submissions");
  });

  it("sends an export-ready package back to admin review from the card action", async () => {
    const ready = readySubmission("single");
    const accepted: Submission = {
      ...ready,
      exportState: "ready",
      files: ready.files.map((file) => ({ ...file, status: "accepted" })),
      status: "ready_for_export",
    };
    const onOpenDrawer = vi.fn();
    const onSubmitForReview = vi.fn().mockResolvedValue(undefined);

    render(
      <ApplicantsScreen
        onOpenDrawer={onOpenDrawer}
        onSubmitForReview={onSubmitForReview}
        submissions={[accepted]}
        typeFilter="single"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Вернуть на проверку:/ }));
    const confirmation = screen.getByRole("dialog", {
      name: "Вернуть подачу на проверку?",
    });
    expect(confirmation).toHaveTextContent(
      "готовность к выгрузке будет сброшена канонической командой",
    );
    fireEvent.click(
      within(confirmation).getByRole("button", { name: "Вернуть на проверку" }),
    );
    await waitFor(() => expect(onSubmitForReview).toHaveBeenCalledWith(accepted.id));
    expect(onOpenDrawer).not.toHaveBeenCalled();

    const transition = applyAgentSubmitForReviewResult(accepted, accepted.agentId);
    expect(transition.ok).toBe(true);
    if (!transition.ok) {
      return;
    }
    expect(transition.data.status).toBe("submitted_for_review");
    expect(transition.data.exportState).toBe("not_ready");
    expect(
      transition.data.files.every((file) => file.status === "pending_review"),
    ).toBe(true);
  });

  it("resubmits an accepted legacy package without reopening completed intake gates", async () => {
    const ready = readySubmission("single");
    const acceptedLegacy: Submission = {
      ...ready,
      applicants: ready.applicants.map((applicant) => ({
        ...applicant,
        sections: applicant.sections.map((section) => ({
          ...section,
          fields: section.fields.map((field, index) =>
            index === 0 ? { ...field, value: "" } : field,
          ),
        })),
      })),
      exportState: "ready",
      files: ready.files.map((file) => ({ ...file, status: "accepted" })),
      status: "ready_for_export",
    };
    const onOpenDrawer = vi.fn();
    const onSubmitForReview = vi.fn().mockResolvedValue(undefined);

    expect(canPerformAction(acceptedLegacy, "submit_for_review", "agent").ok).toBe(
      true,
    );

    render(
      <ApplicantsScreen
        onOpenDrawer={onOpenDrawer}
        onSubmitForReview={onSubmitForReview}
        submissions={[acceptedLegacy]}
        typeFilter="single"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Вернуть на проверку:/ }));
    fireEvent.click(
      within(
        screen.getByRole("dialog", { name: "Вернуть подачу на проверку?" }),
      ).getByRole("button", { name: "Вернуть на проверку" }),
    );
    await waitFor(() =>
      expect(onSubmitForReview).toHaveBeenCalledWith(acceptedLegacy.id),
    );
    expect(onOpenDrawer).not.toHaveBeenCalled();

    const transition = applyAgentSubmitForReviewResult(
      acceptedLegacy,
      acceptedLegacy.agentId,
    );
    expect(transition.ok).toBe(true);
    if (!transition.ok) return;
    expect(transition.data.status).toBe("submitted_for_review");
  });

  it("opens an export-ready package from its visible status action", () => {
    const ready = readySubmission("single");
    const accepted: Submission = {
      ...ready,
      exportState: "ready",
      files: ready.files.map((file) => ({ ...file, status: "accepted" })),
      status: "ready_for_export",
    };
    const onOpenDrawer = vi.fn();

    render(
      <ApplicantsScreen
        onOpenDrawer={onOpenDrawer}
        submissions={[accepted]}
        typeFilter="single"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Готово к выгрузке" }));
    expect(onOpenDrawer).toHaveBeenCalledWith(accepted.id);
  });

  it("submits a ready saved draft through the canonical review handoff", async () => {
    const readyDraft = {
      ...readySubmission("single"),
      status: "draft" as const,
    };
    const onSubmitForReview = vi.fn().mockResolvedValue(undefined);

    render(
      <ApplicantsScreen
        onOpenDrawer={vi.fn()}
        onSubmitForReview={onSubmitForReview}
        submissions={[readyDraft]}
        typeFilter="single"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Отправить на проверку:/ }));
    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));
    await waitFor(() => expect(onSubmitForReview).toHaveBeenCalledWith(readyDraft.id));

    const transition = applyAgentSubmitForReviewResult(readyDraft, readyDraft.agentId);
    expect(transition.ok).toBe(true);
    if (!transition.ok) return;
    expect(transition.data.status).toBe("submitted_for_review");
    expect(transition.data.history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fromStatus: "draft",
          toStatus: "in_progress",
        }),
        expect.objectContaining({
          fromStatus: "in_progress",
          toStatus: "submitted_for_review",
        }),
      ]),
    );
  });

  it("resets filters and ordering, then scrolls the saved card into view", async () => {
    const older = createSubmission("family", "2026-07-18T10:00:00.000Z");
    const focused = createSubmission("family", "2026-07-19T10:00:00.000Z");
    const scrolledElements: HTMLElement[] = [];
    const scrollIntoView = vi.fn(function (this: HTMLElement) {
      scrolledElements.push(this);
    });
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
      writable: true,
    });
    vi.stubGlobal("CSS", {
      ...(globalThis.CSS ?? {}),
      escape: (value: string) => value,
    });
    const onTypeFilterChange = vi.fn();
    const view = render(
      <ApplicantsScreen
        onOpenDrawer={vi.fn()}
        onTypeFilterChange={onTypeFilterChange}
        submissions={[older, focused]}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Сортировка подач: Сначала новые",
      }),
    );
    fireEvent.click(screen.getByRole("option", { name: "Сначала старые" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Поиск по подачам" }), {
      target: { value: "нет такой подачи" },
    });
    expect(screen.getByRole("status")).toHaveTextContent("Ничего не найдено");

    view.rerender(
      <ApplicantsScreen
        focusRequest={{
          revision: 1,
          submissionId: focused.id,
          type: "family",
        }}
        onOpenDrawer={vi.fn()}
        onTypeFilterChange={onTypeFilterChange}
        submissions={[older, focused]}
      />,
    );

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    expect(onTypeFilterChange).toHaveBeenCalledWith("family");
    expect(visibleSubmissionIds()).toEqual([focused.id, older.id]);
    expect(scrolledElements).toContain(
      document.querySelector(`[data-submission-id="${focused.id}"]`),
    );
  });
});

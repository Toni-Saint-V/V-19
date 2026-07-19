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
import {
  applyAgentSubmitForReviewResult,
  applySubmissionActionResult,
  canPerformAction,
} from "../../src/modules/submissions/status";
import type { Submission } from "../../src/modules/submissions/types";
import { isAdminReviewQueueSubmission } from "../../src/modules/submissions/uiTypes";
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
    expect(
      screen.queryByRole("button", { name: /^Открыть:/ }),
    ).not.toBeInTheDocument();

    const card = screen.getByRole("article", {
      name: `Подача ${submission.applicants[0]!.fullName}`,
    });
    const footer = card.querySelector(".v19-applicant-card-footer");
    expect(footer).not.toBeNull();
    expect(
      within(footer as HTMLElement).getAllByRole("button"),
    ).toHaveLength(4);
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
      screen.getByLabelText(`Выбрать файл: Селфи 1, ${submission.applicants[0]!.fullName}`),
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

    fireEvent.click(
      screen.getByRole("button", { name: "Тип подачи: Заявитель" }),
    );
    fireEvent.click(screen.getByRole("option", { name: "Семья" }));
    expect(visibleSubmissionIds()).toEqual([newerFamily.id]);

    fireEvent.click(screen.getByRole("button", { name: "Тип подачи: Семья" }));
    fireEvent.click(screen.getByRole("option", { name: "Все" }));
    expect(visibleSubmissionIds()).toEqual([newerFamily.id, olderSingle.id]);
  });

  it("sorts the combined queue by createdAt in direct and reverse order", () => {
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
    expect(visibleSubmissionIds()).toEqual([oldest.id, middle.id, newest.id]);

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

    fireEvent.change(
      screen.getByRole("textbox", { name: "Поиск по подачам" }),
      { target: { value: "VF-731" } },
    );

    expect(visibleSubmissionIds()).toEqual([matched.id]);
  });

  it("shows and executes the direct submit action for ready single and family cards", async () => {
    const single = readySubmission("single");
    const family = readySubmission("family");
    expect(canPerformAction(single, "submit_for_review", "agent").ok).toBe(true);
    expect(canPerformAction(family, "submit_for_review", "agent").ok).toBe(true);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const onSubmitForReview = vi.fn().mockResolvedValue(undefined);
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
    fireEvent.click(submitButtons[0]!);
    expect(confirm).toHaveBeenCalledWith(
      "Отправить на проверку администратору?",
    );
    await waitFor(() => expect(onSubmitForReview).toHaveBeenCalledTimes(1));

    const transition = applySubmissionActionResult(
      single,
      "submit_for_review",
      "agent",
      single.agentId,
    );
    expect(transition.ok).toBe(true);
    if (!transition.ok) return;
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
  });

  it("sends an export-ready package back to admin review", async () => {
    const ready = readySubmission("single");
    const accepted: Submission = {
      ...ready,
      exportState: "ready",
      files: ready.files.map((file) => ({ ...file, status: "accepted" })),
      status: "ready_for_export",
    };
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
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

    fireEvent.click(
      screen.getByRole("button", { name: /К выгрузке:/ }),
    );

    expect(confirm).toHaveBeenCalledWith(
      "Отправить на проверку администратору?",
    );
    await waitFor(() =>
      expect(onSubmitForReview).toHaveBeenCalledWith(accepted.id),
    );
    expect(onOpenDrawer).not.toHaveBeenCalled();

    const transition = applyAgentSubmitForReviewResult(
      accepted,
      accepted.agentId,
    );
    expect(transition.ok).toBe(true);
    if (!transition.ok) return;
    expect(transition.data.status).toBe("submitted_for_review");
    expect(transition.data.exportState).toBe("not_ready");
    expect(
      transition.data.files.every((file) => file.status === "pending_review"),
    ).toBe(true);
  });

  it("does not send an export-ready package when confirmation is declined", () => {
    const ready = readySubmission("single");
    const accepted: Submission = {
      ...ready,
      exportState: "ready",
      files: ready.files.map((file) => ({ ...file, status: "accepted" })),
      status: "ready_for_export",
    };
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
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

    fireEvent.click(
      screen.getByRole("button", { name: /К выгрузке:/ }),
    );

    expect(confirm).toHaveBeenCalledWith(
      "Отправить на проверку администратору?",
    );
    expect(onSubmitForReview).not.toHaveBeenCalled();
    expect(onOpenDrawer).not.toHaveBeenCalled();
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
    fireEvent.change(
      screen.getByRole("textbox", { name: "Поиск по подачам" }),
      { target: { value: "нет такой подачи" } },
    );
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

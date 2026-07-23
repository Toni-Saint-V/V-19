import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { Drawer } from "../../src/components/Drawer";
import { auditAgentInteractionControls } from "../../src/modules/submissions/agentInteractionContract";
import { initialSubmissions } from "../../src/modules/submissions/mockData";
import { requiredPassportReviewMediaSlots } from "../../src/modules/submissions/passportReviewContract";
import {
  createDraftSubmission,
  uploadRequiredFiles,
} from "../../src/modules/submissions/submissionActions";
import type {
  DrawerTab,
  Submission,
  SubmissionAction,
  SubmissionStatus,
} from "../../src/modules/submissions/types";
import {
  targetElementId,
  type WorkspaceTarget,
} from "../../src/modules/submissions/workspaceModel";
import { linearDrawerMotion } from "../../src/shared/ui/drawer/linearDrawerMotion";
import { fillRequiredQuestionnaireForTest } from "./helpers/questionnaireTestFill";

function deferred<T>() {
  let reject!: (reason?: unknown) => void;
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

type RenderDrawerOptions = {
  activeTab?: DrawerTab;
  focusTarget?: WorkspaceTarget;
  onAction?: (action: SubmissionAction) => void | Promise<void>;
  onClearFocusTarget?: () => void;
  onClose?: () => void;
  onOpenQuestionnaire?: (target?: {
    applicantId?: string;
    field?: string;
    section?: string;
  }) => void;
  onOpenWorkspaceTarget?: (target: WorkspaceTarget) => void;
  onUploadApplicantFile?: (
    submissionId: string,
    applicantId: string,
    fileType: "passport_scan" | "selfie" | "selfie_2",
    file: File,
  ) => Promise<unknown>;
  submission?: Submission;
};

function returnedSubmission() {
  const submission = initialSubmissions.find((item) => item.id === "ПД-1048");
  if (!submission) throw new Error("Expected returned submission fixture.");
  return submission;
}

function readySubmission(): Submission {
  const draft = createDraftSubmission({
    city: "Москва",
    familyCount: 1,
    submissions: [],
    type: "single",
  });
  return {
    ...uploadRequiredFiles(fillRequiredQuestionnaireForTest(draft)),
    status: "in_progress",
  };
}

function renderDrawer({
  activeTab = "overview",
  focusTarget,
  onAction = vi.fn(),
  onClearFocusTarget = vi.fn(),
  onClose = vi.fn(),
  onOpenQuestionnaire = vi.fn(),
  onOpenWorkspaceTarget = vi.fn(),
  onUploadApplicantFile = vi.fn().mockResolvedValue(undefined),
  submission = returnedSubmission(),
}: RenderDrawerOptions = {}) {
  return {
    onAction,
    onClearFocusTarget,
    onClose,
    onOpenQuestionnaire,
    onOpenWorkspaceTarget,
    onUploadApplicantFile,
    ...render(
      <Drawer
        activeTab={activeTab}
        focusTarget={focusTarget}
        isOpen
        submission={submission}
        onAction={onAction}
        onClearFocusTarget={onClearFocusTarget}
        onClose={onClose}
        onOpenQuestionnaire={onOpenQuestionnaire}
        onOpenWorkspaceTarget={onOpenWorkspaceTarget}
        onUploadApplicantFile={onUploadApplicantFile}
      />,
    ),
  };
}

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Drawer interactions", () => {
  test("keeps the original motion timings and reduced-motion duration", () => {
    expect(linearDrawerMotion).toEqual({
      overlay: { duration: 0.25 },
      panel: { damping: 28, mass: 0.8, stiffness: 240, type: "spring" },
      reduced: { duration: 0.01 },
      tab: { duration: 0.2 },
      tabIndicator: { bounce: 0.2, duration: 0.5, type: "spring" },
    });
  });

  test("renders the canonical label and original semantic tone for every lifecycle status", () => {
    const expectations = [
      { label: "Черновик", status: "draft", toneClassName: "text-white/70" },
      { label: "В работе", status: "in_progress", toneClassName: "text-blue-400" },
      {
        label: "Возвращено",
        status: "requires_action",
        toneClassName: "text-orange-400",
      },
      {
        label: "На проверке",
        status: "submitted_for_review",
        toneClassName: "text-[#8fa3ff]",
      },
      { label: "Возвращено", status: "returned", toneClassName: "text-orange-400" },
      {
        label: "Исправления получены",
        status: "corrections_received",
        toneClassName: "text-[#8fa3ff]",
      },
      {
        label: "Готово к выгрузке",
        status: "ready_for_export",
        toneClassName: "text-emerald-400",
      },
      {
        label: "Выгружено",
        status: "exported",
        toneClassName: "text-emerald-400",
      },
    ] satisfies ReadonlyArray<{
      label: string;
      status: SubmissionStatus;
      toneClassName: string;
    }>;

    for (const expectation of expectations) {
      cleanup();
      renderDrawer({
        submission: { ...readySubmission(), status: expectation.status },
      });

      const badge = screen.getByTestId("drawer-status-badge");
      expect(badge).toHaveTextContent(expectation.label);
      expect(badge).toHaveClass(expectation.toneClassName);
    }
  });

  test("keeps the visible identity above the tabs and switches every tab", async () => {
    const { container } = renderDrawer();

    const dialog = screen.getByRole("dialog", { name: "Семья Ивановых" });
    const lifecycleContext = within(dialog).getByTestId("drawer-lifecycle-context");
    const lifecycleHeader = lifecycleContext.closest("header");
    if (!lifecycleHeader) throw new Error("Expected lifecycle header.");
    expect(within(lifecycleContext).getByText("VF-1048")).toBeInTheDocument();
    expect(within(lifecycleContext).getByText("Семья Ивановых")).toBeVisible();
    expect(
      within(dialog).getByRole("button", {
        name: "Загрузить: Мария Иванова • Селфи 1",
      }),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("Мария Иванова")).toBeInTheDocument();
    expect(within(dialog).queryByText("Семья Петровых")).not.toBeInTheDocument();
    expect(auditAgentInteractionControls(container)).toEqual([]);

    fireEvent.click(within(dialog).getByRole("tab", { name: "Анкета" }));
    await waitFor(() =>
      expect(within(dialog).getByText("Прогресс заполнения")).toBeInTheDocument(),
    );
    expect(auditAgentInteractionControls(container)).toEqual([]);

    fireEvent.click(within(dialog).getByRole("tab", { name: /Замечания/ }));
    await waitFor(() =>
      expect(
        within(dialog).getByText("Лицо обрезано. Загрузите селфи 1."),
      ).toBeInTheDocument(),
    );
    expect(auditAgentInteractionControls(container)).toEqual([]);

    fireEvent.click(within(dialog).getByRole("tab", { name: "История" }));
    await waitFor(() =>
      expect(
        within(dialog).getByText("Подача возвращена: 2 замечания"),
      ).toBeInTheDocument(),
    );
    expect(auditAgentInteractionControls(container)).toEqual([]);

    fireEvent.click(within(dialog).getByRole("tab", { name: "Обзор" }));
    await waitFor(() =>
      expect(within(dialog).getByText("Чеклист документов")).toBeInTheDocument(),
    );
    expect(auditAgentInteractionControls(container)).toEqual([]);
  });

  test("supports keyboard tab navigation and restores each tab scroll position", async () => {
    const { container } = renderDrawer();
    const dialog = screen.getByRole("dialog", { name: "Семья Ивановых" });
    const body = container.querySelector<HTMLElement>(".v19-submission-drawer-body");
    if (!body) throw new Error("Expected drawer scroll body.");

    const overviewTab = within(dialog).getByRole("tab", { name: "Обзор" });
    body.scrollTop = 180;
    fireEvent.keyDown(overviewTab, { key: "ArrowRight" });
    await waitFor(() =>
      expect(within(dialog).getByRole("tab", { name: "Анкета" })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );

    body.scrollTop = 72;
    fireEvent.keyDown(within(dialog).getByRole("tab", { name: "Анкета" }), {
      key: "Home",
    });
    await waitFor(() => expect(overviewTab).toHaveAttribute("aria-selected", "true"));
    await waitFor(() => expect(body.scrollTop).toBe(180));

    fireEvent.keyDown(overviewTab, { key: "End" });
    await waitFor(() =>
      expect(within(dialog).getByRole("tab", { name: "История" })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
  });

  test("traps focus inside the drawer and returns it to the opener", async () => {
    const opener = document.createElement("button");
    opener.textContent = "Открыть подачу";
    document.body.append(opener);
    opener.focus();

    const { unmount } = renderDrawer();
    const dialog = screen.getByRole("dialog", { name: "Семья Ивановых" });
    await waitFor(() => expect(dialog).toHaveFocus());

    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        "button:not([disabled]),[href],[tabindex]:not([tabindex='-1'])",
      ),
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) throw new Error("Expected drawer focus targets.");
    for (const element of focusable) {
      Object.defineProperty(element, "offsetParent", {
        configurable: true,
        get: () => document.body,
      });
    }

    first.focus();
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();

    fireEvent.keyDown(last, { key: "Tab" });
    expect(first).toHaveFocus();

    unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });

  test("routes questionnaire and issue clicks to their exact targets", async () => {
    const { onOpenQuestionnaire, onUploadApplicantFile } = renderDrawer();
    const dialog = screen.getByRole("dialog", { name: "Семья Ивановых" });

    fireEvent.click(within(dialog).getByRole("tab", { name: "Анкета" }));
    await waitFor(() => within(dialog).getByText("Прогресс заполнения"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Исправить анкету" }));
    expect(onOpenQuestionnaire).toHaveBeenCalledWith();

    fireEvent.click(within(dialog).getByRole("button", { name: /Личные данные/ }));
    expect(onOpenQuestionnaire).toHaveBeenLastCalledWith(
      expect.objectContaining({ applicantId: "з-1048-1" }),
    );

    fireEvent.click(within(dialog).getByRole("tab", { name: /Замечания/ }));
    const replaceButtons = await within(dialog).findAllByRole("button", {
      name: "Перезагрузить файл",
    });
    fireEvent.click(replaceButtons[0]!);
    fireEvent.change(
      within(dialog).getByLabelText("Выбрать файл: Мария Иванова • Селфи 1", {
        selector: "input",
      }),
      {
        target: {
          files: [new File(["replacement"], "selfie.png", { type: "image/png" })],
        },
      },
    );
    await waitFor(() =>
      expect(onUploadApplicantFile).toHaveBeenCalledWith(
        "ПД-1048",
        "з-1048-1",
        "selfie",
        expect.objectContaining({ name: "selfie.png" }),
      ),
    );
  });

  test("executes a ready lifecycle action and routes blocked corrections to the exact upload", async () => {
    const onAction = vi.fn().mockResolvedValue(undefined);
    renderDrawer({ onAction, submission: readySubmission() });

    const submit = screen.getByRole("button", { name: "Отправить на проверку" });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    await waitFor(() => expect(onAction).toHaveBeenCalledWith("submit_for_review"));

    cleanup();
    const returnedAction = vi.fn();
    renderDrawer({
      onAction: returnedAction,
      submission: returnedSubmission(),
    });
    const exactUpload = screen.getByRole("button", {
      name: "Загрузить: Мария Иванова • Селфи 1",
    });
    expect(exactUpload).toBeEnabled();
    expect(exactUpload).toHaveAttribute(
      "data-v19-interaction-id",
      "drawer.upload-file",
    );
    expect(screen.getByTestId("drawer-blocker-reason")).not.toBeEmptyDOMElement();
    fireEvent.click(exactUpload);
    expect(returnedAction).not.toHaveBeenCalled();
  });

  test("keeps rejected primary-action feedback visible and associated with the CTA", async () => {
    const onAction = vi.fn().mockRejectedValue(new Error("network failed"));
    renderDrawer({ onAction, submission: readySubmission() });

    const primaryAction = screen.getByRole("button", {
      name: "Отправить на проверку",
    });
    fireEvent.click(primaryAction);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Состояние подачи не изменено");
    expect(alert).not.toHaveClass("hidden");
    expect(primaryAction).toHaveAttribute("aria-describedby", alert.id);
  });

  test("keeps upload pending and errors isolated to the submission that started them", async () => {
    const uploadA = deferred<unknown>();
    const onUploadApplicantFile = vi
      .fn()
      .mockImplementationOnce(() => uploadA.promise)
      .mockResolvedValueOnce(undefined);
    const submissionA = { ...returnedSubmission(), id: "upload-submission-a" };
    const submissionB = { ...returnedSubmission(), id: "upload-submission-b" };
    const drawerProps = {
      activeTab: "issues" as const,
      isOpen: true,
      onAction: vi.fn(),
      onClose: vi.fn(),
      onOpenQuestionnaire: vi.fn(),
      onOpenWorkspaceTarget: vi.fn(),
      onUploadApplicantFile,
    };
    const { rerender } = render(<Drawer {...drawerProps} submission={submissionA} />);

    fireEvent.change(
      screen.getByLabelText("Выбрать файл: Мария Иванова • Селфи 1", {
        selector: "input",
      }),
      { target: { files: [new File(["a"], "a.png", { type: "image/png" })] } },
    );
    await waitFor(() => expect(onUploadApplicantFile).toHaveBeenCalledTimes(1));
    const pendingUpload = screen.getByRole("button", { name: "Загрузка…" });
    expect(pendingUpload).toBeDisabled();
    expect(pendingUpload).toHaveAttribute("aria-busy", "true");
    expect(pendingUpload).toHaveAttribute(
      "aria-describedby",
      expect.stringContaining("upload-status"),
    );

    rerender(<Drawer {...drawerProps} submission={submissionB} />);
    const submissionBButtons = await screen.findAllByRole("button", {
      name: "Перезагрузить файл",
    });
    for (const button of submissionBButtons) {
      expect(button).toBeEnabled();
    }

    await act(async () => {
      uploadA.reject(new Error("Submission A failed late."));
      await uploadA.promise.catch(() => undefined);
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    fireEvent.change(
      screen.getByLabelText("Выбрать файл: Мария Иванова • Селфи 1", {
        selector: "input",
      }),
      { target: { files: [new File(["b"], "b.png", { type: "image/png" })] } },
    );
    await waitFor(() =>
      expect(onUploadApplicantFile).toHaveBeenLastCalledWith(
        "upload-submission-b",
        "з-1048-1",
        "selfie",
        expect.objectContaining({ name: "b.png" }),
      ),
    );
  });

  test("counts only open issues as requiring correction", async () => {
    const [fixedIssue, openIssue] = returnedSubmission().issues;
    if (!fixedIssue || !openIssue) {
      throw new Error("Expected two issue fixtures.");
    }
    const submission = {
      ...returnedSubmission(),
      issues: [
        { ...fixedIssue, status: "fixed_by_agent" as const },
        { ...openIssue, status: "open" as const },
      ],
    };
    renderDrawer({ activeTab: "issues", submission });

    expect(await screen.findByTestId("drawer-open-issues-count")).toHaveTextContent(
      "Открыто: 1",
    );
    const issuesTab = screen.getByRole("tab", {
      name: /Замечания.*исправлено и ждёт проверки: 1.*1/i,
    });
    expect(
      issuesTab.querySelector(".v19-submission-drawer-tab-count"),
    ).toHaveTextContent("1");
    expect(screen.getByText("Нужно исправить")).toBeInTheDocument();
    expect(screen.getByText("Исправлено, ждёт проверки")).toBeInTheDocument();
  });

  test("keeps submission B pending when submission A settles after the drawer switches", async () => {
    const actionA = deferred<void>();
    const actionB = deferred<void>();
    const onAction = vi
      .fn()
      .mockImplementationOnce(() => actionA.promise)
      .mockImplementationOnce(() => actionB.promise);
    const submissionA = { ...readySubmission(), id: "submission-a" };
    const submissionB = { ...readySubmission(), id: "submission-b" };
    const drawerProps = {
      activeTab: "overview" as const,
      isOpen: true,
      onAction,
      onClose: vi.fn(),
      onOpenQuestionnaire: vi.fn(),
      onOpenWorkspaceTarget: vi.fn(),
    };
    const { rerender } = render(<Drawer {...drawerProps} submission={submissionA} />);

    fireEvent.click(screen.getByRole("button", { name: "Отправить на проверку" }));
    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(1));

    rerender(<Drawer {...drawerProps} submission={submissionB} />);
    const submissionBAction = await screen.findByRole("button", {
      name: "Отправить на проверку",
    });
    await waitFor(() => expect(submissionBAction).toBeEnabled());
    fireEvent.click(submissionBAction);
    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(2));
    expect(submissionBAction).toBeDisabled();
    expect(submissionBAction).toHaveAttribute("aria-busy", "true");

    await act(async () => {
      actionA.reject(new Error("Submission A failed late."));
      await actionA.promise.catch(() => undefined);
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(submissionBAction).toBeDisabled();
    expect(submissionBAction).toHaveAttribute("aria-busy", "true");
    fireEvent.click(submissionBAction);
    expect(onAction).toHaveBeenCalledTimes(2);

    await act(async () => {
      actionB.resolve();
      await actionB.promise;
    });
    await waitFor(() => expect(submissionBAction).toBeEnabled());
  });

  test("opens history for read-only status without sending a mutation", async () => {
    const onAction = vi.fn();
    renderDrawer({
      onAction,
      submission: { ...readySubmission(), status: "submitted_for_review" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Открыть историю" }));
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "История" })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
    expect(onAction).not.toHaveBeenCalled();
  });

  test("uses canonical family media slots and honest applicant-aware questionnaire progress", async () => {
    const submission = returnedSubmission();
    const requiredSlotCount = requiredPassportReviewMediaSlots(submission).length;
    renderDrawer({ submission });

    expect(
      screen.getByText(new RegExp(`\\d/${requiredSlotCount}`)),
    ).toBeInTheDocument();
    expect(screen.getAllByText("разделов готово")).toHaveLength(
      submission.applicants.length,
    );
    expect(screen.queryByText("готовность анкеты")).not.toBeInTheDocument();
    expect(screen.queryByText(/^Фото/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Видео/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Анкета" }));
    await screen.findByText("Прогресс заполнения");
    expect(screen.queryByText("40%")).not.toBeInTheDocument();
    expect(screen.queryByText("65%")).not.toBeInTheDocument();
    expect(screen.getAllByText(/заявителей$/).length).toBeGreaterThan(0);
  });

  test("keeps read-only questionnaire and issue controls navigational", async () => {
    renderDrawer({
      activeTab: "questionnaire",
      submission: { ...returnedSubmission(), status: "submitted_for_review" },
    });

    expect(screen.getByRole("button", { name: "Смотреть анкету" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Замечания/ }));
    await screen.findByText("Замечания администратора");
    expect(
      screen.queryByRole("button", { name: "Перезагрузить файл" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Открыть файл" })).toHaveLength(2);
  });

  test("confirms, cancels and retries ready-for-export resubmission", async () => {
    const onAction = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce(undefined);
    const { container } = renderDrawer({
      onAction,
      submission: { ...readySubmission(), status: "ready_for_export" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Вернуть на проверку" }));
    const confirmation = screen.getByRole("dialog", {
      name: "Вернуть подачу на проверку?",
    });
    expect(
      within(confirmation).getByRole("button", {
        name: "Оставить готовой к выгрузке",
      }),
    ).toBeInTheDocument();
    expect(container.querySelector(".v19-agent-drawer")).toHaveAttribute("inert");

    fireEvent.click(
      within(confirmation).getByRole("button", {
        name: "Оставить готовой к выгрузке",
      }),
    );
    expect(onAction).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Вернуть на проверку" })).toHaveFocus(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Вернуть на проверку" }));
    fireEvent.click(screen.getByRole("button", { name: "Вернуть на проверку" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Состояние подачи не изменено",
    );
    expect(onAction).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Вернуть на проверку" }));
    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Вернуть подачу на проверку?" }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getByText("Подача возвращена на проверку администратору."),
    ).toBeInTheDocument();
  });

  test("supports every close path and focuses a requested issue", async () => {
    const issue = returnedSubmission().issues.find(
      (candidate) => candidate.status !== "closed_by_admin",
    );
    if (!issue) throw new Error("Expected issue fixture.");
    const { container, onClearFocusTarget, onClose } = renderDrawer({
      focusTarget: { issueId: issue.id, tab: "issues" as const },
    });

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /Замечания/ })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
    await waitFor(() => expect(onClearFocusTarget).toHaveBeenCalled());
    const focusedIssue = document.getElementById(
      targetElementId({ issueId: issue.id, tab: "issues" }),
    );
    expect(focusedIssue).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "Закрыть подачу" }));
    fireEvent.keyDown(window, { key: "Escape" });
    const overlay = container.querySelector<HTMLElement>(
      '[aria-hidden="true"].fixed.inset-0',
    );
    if (!overlay) throw new Error("Expected drawer overlay.");
    fireEvent.click(overlay);

    expect(onClose).toHaveBeenCalledTimes(3);
  });

  test("reports a missing requested issue target without breaking navigation", async () => {
    const { onClearFocusTarget } = renderDrawer({
      focusTarget: { issueId: "missing-issue", tab: "issues" },
    });

    expect(
      await screen.findByText(
        "Точный объект замечания не найден. Откройте список замечаний и выберите доступную задачу.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Замечания/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(onClearFocusTarget).toHaveBeenCalledOnce();
  });
});

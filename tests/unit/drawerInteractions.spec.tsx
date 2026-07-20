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
import { initialSubmissions } from "../../src/modules/submissions/mockData";
import {
  createDraftSubmission,
  uploadRequiredFiles,
} from "../../src/modules/submissions/submissionActions";
import type {
  DrawerTab,
  Submission,
  SubmissionAction,
} from "../../src/modules/submissions/types";
import type { WorkspaceTarget } from "../../src/modules/submissions/workspaceModel";
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
  test("keeps the visible identity above the tabs and switches every tab", async () => {
    renderDrawer();

    const dialog = screen.getByRole("dialog", { name: "Семья Ивановых" });
    const lifecycleContext = within(dialog).getByTestId("drawer-lifecycle-context");
    const lifecycleHeader = lifecycleContext.closest("header");
    if (!lifecycleHeader) throw new Error("Expected lifecycle header.");
    expect(within(lifecycleContext).getByText("VF-1048")).toBeInTheDocument();
    expect(within(lifecycleContext).getByText("Семья Ивановых")).toBeVisible();
    expect(
      within(dialog).getByRole("button", { name: "Отправить исправления" }),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("Мария Иванова")).toBeInTheDocument();
    expect(within(dialog).queryByText("Семья Петровых")).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("tab", { name: "Анкета" }));
    await waitFor(() =>
      expect(within(dialog).getByText("Прогресс заполнения")).toBeInTheDocument(),
    );

    fireEvent.click(within(dialog).getByRole("tab", { name: /Замечания/ }));
    await waitFor(() =>
      expect(
        within(dialog).getByText("Лицо обрезано. Загрузите селфи 1."),
      ).toBeInTheDocument(),
    );

    fireEvent.click(within(dialog).getByRole("tab", { name: "История" }));
    await waitFor(() =>
      expect(
        within(dialog).getByText("Подача возвращена: 2 замечания"),
      ).toBeInTheDocument(),
    );

    fireEvent.click(within(dialog).getByRole("tab", { name: "Обзор" }));
    await waitFor(() =>
      expect(within(dialog).getByText("Чеклист документов")).toBeInTheDocument(),
    );
  });

  test("routes questionnaire and issue clicks to their exact targets", async () => {
    const { onOpenQuestionnaire, onUploadApplicantFile } = renderDrawer();
    const dialog = screen.getByRole("dialog", { name: "Семья Ивановых" });

    fireEvent.click(within(dialog).getByRole("tab", { name: "Анкета" }));
    await waitFor(() => within(dialog).getByText("Прогресс заполнения"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Открыть анкету" }));
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
      { target: { files: [new File(["replacement"], "selfie.png", { type: "image/png" })] } },
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

  test("executes the real primary action and blocks an invalid correction send", async () => {
    const onAction = vi.fn().mockResolvedValue(undefined);
    renderDrawer({ onAction, submission: readySubmission() });

    const submit = screen.getByRole("button", { name: "Отправить на проверку" });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    await waitFor(() => expect(onAction).toHaveBeenCalledWith("submit_for_review"));

    cleanup();
    renderDrawer({ submission: returnedSubmission() });
    expect(
      screen.getByRole("button", { name: "Отправить исправления" }),
    ).toBeDisabled();
    expect(
      screen.getByText("Сначала отметьте замечания исправленными"),
    ).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole("button", { name: "Смотреть статус" }));
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "История" })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
    expect(onAction).not.toHaveBeenCalled();
  });

  test("supports every close path and focuses a requested issue", async () => {
    const issue = returnedSubmission().issues[0];
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

    fireEvent.click(screen.getByRole("button", { name: "Закрыть подачу" }));
    fireEvent.click(screen.getByRole("button", { name: "Отменить и закрыть подачу" }));
    fireEvent.keyDown(window, { key: "Escape" });
    const overlay = container.querySelector<HTMLElement>(
      '[aria-hidden="true"].fixed.inset-0',
    );
    if (!overlay) throw new Error("Expected drawer overlay.");
    fireEvent.click(overlay);

    expect(onClose).toHaveBeenCalledTimes(4);
  });
});

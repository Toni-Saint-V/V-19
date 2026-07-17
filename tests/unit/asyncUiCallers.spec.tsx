import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { Drawer } from "../../src/components/Drawer";
import { PreUploadScreen } from "../../src/components/PreUploadScreen";
import { VisaflowBusinessBridgeProvider } from "../../src/integration/visaflowBusinessBridge";
import { FigmaSubmissionDrawer } from "../../src/modules/submissions/components/adminAiAssistance";
import { initialSubmissions } from "../../src/modules/submissions/mockData";
import type { Submission } from "../../src/modules/submissions/types";

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      addEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: true,
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
    })),
  });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function draftSubmission(): Submission {
  const submission = initialSubmissions.find((item) => item.id === "ПД-1052");
  if (!submission) throw new Error("Missing draft fixture ПД-1052.");
  return submission;
}

function correctionsSubmission(): Submission {
  const submission = initialSubmissions.find((item) => item.id === "ПД-1055");
  if (!submission) throw new Error("Missing corrections fixture ПД-1055.");
  return submission;
}

function appointmentCitySubmission(): Submission {
  const submission = initialSubmissions.find((item) => item.id === "SUB-1103");
  if (!submission) throw new Error("Missing appointment-city fixture SUB-1103.");
  return submission;
}

describe("async UI callers", () => {
  test("pre-upload prevents duplicate persistence, exposes rejection, and allows one retry", async () => {
    let rejectFirstSave: ((reason?: unknown) => void) | undefined;
    const firstSave = new Promise<void>((_resolve, reject) => {
      rejectFirstSave = reject;
    });
    const onSaveDraft = vi
      .fn()
      .mockImplementationOnce(() => firstSave)
      .mockResolvedValueOnce(undefined);

    render(
      <PreUploadScreen
        onBack={vi.fn()}
        onSaveDraft={onSaveDraft}
      />,
    );

    const saveButton = screen.getByRole("button", { name: "Сохранить черновик" });
    fireEvent.click(saveButton);
    fireEvent.click(saveButton);

    expect(onSaveDraft).toHaveBeenCalledTimes(1);
    expect(saveButton).toBeDisabled();
    expect(screen.getByRole("button", { name: "Назад" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Закрыть создание" })).toBeDisabled();

    await act(async () => {
      rejectFirstSave?.(new Error("database details must stay private"));
      await expect(firstSave).rejects.toThrow("database details must stay private");
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Не удалось сохранить черновик. Повторите попытку.",
    );
    expect(screen.queryByText("database details must stay private")).not.toBeInTheDocument();
    await waitFor(() => expect(saveButton).not.toBeDisabled());

    fireEvent.click(saveButton);
    await waitFor(() => expect(onSaveDraft).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  test("legacy Drawer moves focus into the modal and exposes roving tabs", async () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();
    const onClose = vi.fn();
    const submission = draftSubmission();

    render(
      <Drawer
        isOpen
        onClose={onClose}
        submission={submission}
        submissionId={submission.id}
      />,
    );

    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(dialog).toHaveFocus());
    const tabs = await screen.findAllByRole("tab");
    expect(tabs).toHaveLength(6);
    expect(tabs.filter((tab) => tab.getAttribute("tabindex") === "0")).toHaveLength(1);
    expect(tabs[0]).toHaveAttribute("aria-controls", "submission-drawer-panel-overview");

    fireEvent.keyDown(tabs[0], { key: "ArrowRight" });
    await waitFor(() => expect(tabs[1]).toHaveAttribute("aria-selected", "true"));
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("legacy Drawer presents missing dates and document types without storage noise", async () => {
    const submission = draftSubmission();
    const sourceFile = initialSubmissions.find((item) => item.id === "ПД-1053")?.files[0];
    if (!sourceFile) throw new Error("Missing document fixture.");

    render(
      <Drawer
        isOpen
        onClose={vi.fn()}
        submission={{
          ...submission,
          tripDateFrom: "",
          tripDateTo: "",
          updatedAt: "15.06",
          files: [{ ...sourceFile, originalFileName: "storage-token-should-not-be-visible" }],
        }}
        submissionId={submission.id}
      />,
    );

    expect(await screen.findByText("Даты не указаны")).toBeInTheDocument();
    expect(screen.getByText("Обновлено 15.06")).toBeInTheDocument();
    expect(screen.queryByText("storage-token-should-not-be-visible")).not.toBeInTheDocument();
  });

  test("legacy Drawer routes incomplete files and file issues to document collection", async () => {
    const submission = initialSubmissions.find((item) => item.id === "ПД-1048");
    if (!submission) throw new Error("Missing returned fixture ПД-1048.");
    const onOpenDocuments = vi.fn();

    render(
      <Drawer
        isOpen
        onClose={vi.fn()}
        onOpenDocuments={onOpenDocuments}
        submission={submission}
        submissionId={submission.id}
      />,
    );

    fireEvent.click(await screen.findByRole("tab", { name: /Файлы/ }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Перейти к сбору документов" }),
    );
    expect(onOpenDocuments).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("tab", { name: /Замечания/ }));
    const fileActions = await screen.findAllByRole("button", { name: "Исправить файл" });
    expect(fileActions).toHaveLength(2);
    fireEvent.click(fileActions[0]);
    expect(onOpenDocuments).toHaveBeenCalledTimes(2);
  });

  test("legacy Drawer keeps the corrections lifecycle label from the canonical submission", async () => {
    const submission = correctionsSubmission();

    render(
      <Drawer
        isOpen
        onClose={vi.fn()}
        submission={submission}
        submissionId={submission.id}
      />,
    );

    expect(await screen.findByText("Исправления получены")).toBeInTheDocument();
    expect(screen.queryByText("Черновик")).not.toBeInTheDocument();
    expect(screen.getByText("Агент Тони")).toBeInTheDocument();
    expect(screen.queryByText("local-agent-tony")).not.toBeInTheDocument();
  });

  test("legacy Drawer presents the appointment city used by the submission queue", async () => {
    const submission = appointmentCitySubmission();

    render(
      <Drawer
        isOpen
        onClose={vi.fn()}
        submission={submission}
        submissionId={submission.id}
      />,
    );

    const cityLabel = await screen.findByText("Визовый центр подачи");
    expect(cityLabel.parentElement).toHaveTextContent("Москва");
    expect(cityLabel.parentElement).not.toHaveTextContent("Санкт-Петербург");
  });

  test("legacy Drawer history keeps compact event types and valid fallback dates", async () => {
    const submission = draftSubmission();
    render(
      <Drawer
        isOpen
        onClose={vi.fn()}
        submission={{
          ...submission,
          history: [
            { id: "file", at: "15.06", source: "agent", text: "Файл загружен: Селфи 2 · Антон" },
            { id: "status", at: "сейчас", source: "agent", text: "Статус изменён: В работе" },
          ],
        }}
        submissionId={submission.id}
      />,
    );

    fireEvent.click(await screen.findByRole("tab", { name: "История" }));
    expect(await screen.findByText("Документ")).toBeInTheDocument();
    expect(screen.getByText("Статус")).toBeInTheDocument();
    expect(screen.getByText("15.06")).toBeInTheDocument();
    expect(screen.queryByText("Invalid Date")).not.toBeInTheDocument();
  });

  test("legacy Drawer makes the empty issue state explain the review stage", async () => {
    const submission = draftSubmission();
    render(
      <Drawer
        isOpen
        onClose={vi.fn()}
        submission={{ ...submission, issues: [], status: "in_progress" }}
        submissionId={submission.id}
      />,
    );

    fireEvent.click(await screen.findByRole("tab", { name: "Замечания" }));
    expect(await screen.findByText("До первой проверки")).toHaveAttribute("role", "status");
    expect(screen.getByText("Подача ещё не отправлялась на проверку.")).toBeInTheDocument();
  });

  test("legacy Drawer keeps demo fallback explicit and fail-closed", async () => {
    const onSubmissionAction = vi.fn();
    render(
      <Drawer
        allowDemoFallback
        isOpen
        onClose={vi.fn()}
        onSubmissionAction={onSubmissionAction}
        submissionId="FAM-001"
      />,
    );

    expect(await screen.findByLabelText("Демо-данные")).toBeInTheDocument();
    const action = screen.getByRole("button", { name: "Действия отключены" });
    expect(action).toBeDisabled();
    fireEvent.click(action);
    expect(onSubmissionAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("tab", { name: /Замечания/ }));
    expect(await screen.findByText("Подача ещё не отправлялась на проверку.")).toBeInTheDocument();
  });

  test("legacy Drawer does not fabricate a submission outside demo mode", async () => {
    render(
      <Drawer isOpen onClose={vi.fn()} submissionId="missing-submission" />,
    );

    expect(await screen.findByText("Данные подачи недоступны")).toBeInTheDocument();
    expect(screen.queryByText("Семья Петровых")).not.toBeInTheDocument();
  });

  test("legacy Drawer awaits one explicit action handler and renders rejection", async () => {
    const explicitAction = vi.fn().mockRejectedValue(new Error("write failed"));
    const bridgeAction = vi.fn();
    const submission = draftSubmission();

    render(
      <VisaflowBusinessBridgeProvider
        bridge={{ onSubmissionAction: bridgeAction }}
      >
        <Drawer
          isOpen
          onClose={vi.fn()}
          onSubmissionAction={explicitAction}
          submission={submission}
          submissionId={submission.id}
        />
      </VisaflowBusinessBridgeProvider>,
    );

    const saveButton = await screen.findByRole("button", {
      name: "Сохранить прогресс",
    });
    fireEvent.click(saveButton);
    fireEvent.click(saveButton);

    expect(
      await screen.findByText(/Не удалось сохранить действие/),
    ).toBeInTheDocument();
    expect(explicitAction).toHaveBeenCalledTimes(1);
    expect(bridgeAction).not.toHaveBeenCalled();
  });

  test("operational drawer catches rejected actions and keeps the action available", async () => {
    const onAction = vi.fn().mockRejectedValue(new Error("write failed"));
    const submission = draftSubmission();
    const { container } = render(
      <FigmaSubmissionDrawer
        activeTab="overview"
        onAction={onAction}
        onClose={vi.fn()}
        onOpenQuestionnaireWorkspace={vi.fn()}
        role="agent"
        submission={submission}
        surface="agent"
      />,
    );

    const primaryButton = await waitFor(() => {
      const button = container.querySelector<HTMLButtonElement>(
        ".v20-action-button.is-primary",
      );
      if (!button) throw new Error("Primary action was not rendered.");
      return button;
    });
    fireEvent.click(primaryButton);
    fireEvent.click(primaryButton);

    expect(
      await screen.findByText(/Не удалось сохранить действие/),
    ).toBeInTheDocument();
    expect(onAction).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(primaryButton).not.toBeDisabled());
  });

  test("operational drawer keeps the four canonical reference tabs with roving focus", async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        addEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
        matches: false,
        media: query,
        onchange: null,
        removeEventListener: vi.fn(),
      })),
    });
    const submission = draftSubmission();
    render(
      <FigmaSubmissionDrawer
        activeTab="overview"
        onAction={vi.fn()}
        onClose={vi.fn()}
        onOpenQuestionnaireWorkspace={vi.fn()}
        role="agent"
        submission={submission}
        surface="agent"
      />,
    );

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAttribute("aria-labelledby", "v20-submission-drawer-heading");

    const tablist = await screen.findByRole("tablist", { name: "Разделы подачи" });
    const tabs = Array.from(tablist.querySelectorAll<HTMLElement>('[role="tab"]'));
    expect(tabs).toHaveLength(4);
    expect(tabs.filter((tab) => tab.getAttribute("tabindex") === "0")).toHaveLength(1);
    expect(tabs[0]).toHaveAttribute(
      "aria-controls",
      "v20-submission-drawer-panel-overview",
    );

    fireEvent.keyDown(tabs[0]!, { key: "ArrowRight" });
    await waitFor(() => {
      expect(tabs[1]).toHaveAttribute("aria-selected", "true");
      expect(tabs[1]).toHaveFocus();
    });
    expect(await screen.findByRole("tabpanel")).toHaveAttribute(
      "aria-labelledby",
      "v20-submission-drawer-tab-questionnaire",
    );

    expect(screen.queryByRole("button", { name: "Ещё" })).not.toBeInTheDocument();
  });

  test("operational drawer derives questionnaire preview from the real submission", async () => {
    const source = draftSubmission();
    const submission: Submission = {
      ...source,
      completeness: {
        ...source.completeness,
        questionnaire: 100,
        total: 100,
      },
      applicants: source.applicants.map((applicant) => ({
        ...applicant,
        questionnaireStatus: "complete",
        sections: applicant.sections.map((section) => ({
          ...section,
          status: "complete",
        })),
      })),
    };

    render(
      <FigmaSubmissionDrawer
        activeTab="questionnaire"
        onAction={vi.fn()}
        onClose={vi.fn()}
        onOpenQuestionnaireWorkspace={vi.fn()}
        role="agent"
        submission={submission}
        surface="agent"
      />,
    );

    expect(await screen.findByText("Все блоки данных заполнены")).toBeInTheDocument();
    expect(screen.queryByText("Осталось заполнить 2 блока данных")).not.toBeInTheDocument();
    expect(screen.getAllByText("100%")).toHaveLength(6);
  });

  test("operational drawer leads a returned submission through one exact correction at a time", async () => {
    const submission = initialSubmissions.find((item) => item.id === "ПД-1048");
    if (!submission) throw new Error("Missing returned fixture ПД-1048.");
    const onOpenQuestionnaireWorkspace = vi.fn();

    render(
      <FigmaSubmissionDrawer
        activeTab="issues"
        onAction={vi.fn()}
        onClose={vi.fn()}
        onOpenQuestionnaireWorkspace={onOpenQuestionnaireWorkspace}
        role="agent"
        submission={submission}
        surface="agent"
      />,
    );

    expect(await screen.findByRole("heading", { name: "Список задач по замечаниям" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Селфи 1" })).toBeInTheDocument();
    expect(screen.getByText("Лицо обрезано. Загрузите селфи 1.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Скан паспорта" })).toBeInTheDocument();

    const reloadButtons = screen.getAllByRole("button", { name: "Перезагрузить файл" });
    fireEvent.click(reloadButtons[1]!);
    await waitFor(() =>
      expect(screen.getByRole("tabpanel")).toHaveAttribute(
        "aria-labelledby",
        "v20-submission-drawer-heading",
      ),
    );
    expect(onOpenQuestionnaireWorkspace).not.toHaveBeenCalled();
  });

  test("operational drawer never presents fixed-by-agent issues as actionable corrections", async () => {
    const source = initialSubmissions.find((item) => item.id === "ПД-1048");
    if (!source) throw new Error("Missing returned fixture ПД-1048.");
    const firstIssue = source.issues[0];
    const secondIssue = source.issues[1];
    if (!firstIssue || !secondIssue) throw new Error("Expected two correction issues.");
    const submission: Submission = {
      ...source,
      issues: [
        { ...firstIssue, status: "fixed_by_agent" },
        secondIssue,
      ],
    };

    render(
      <FigmaSubmissionDrawer
        activeTab="overview"
        onAction={vi.fn()}
        onClose={vi.fn()}
        onMarkIssueFixed={vi.fn()}
        onOpenQuestionnaireWorkspace={vi.fn()}
        role="agent"
        submission={submission}
        surface="agent"
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /Замечания/ }));
    expect(
      await screen.findByRole("heading", { name: "Список задач по замечаниям" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Ждет проверки")).toBeInTheDocument();
    expect(screen.getAllByText("Blocker")).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Перезагрузить файл" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Отметить исправленным" })).not.toBeInTheDocument();
  });

  test("operational drawer restores a pre-existing body scroll lock", async () => {
    document.body.style.overflow = "clip";
    const submission = draftSubmission();
    const { unmount } = render(
      <FigmaSubmissionDrawer
        activeTab="overview"
        onAction={vi.fn()}
        onClose={vi.fn()}
        onOpenQuestionnaireWorkspace={vi.fn()}
        role="agent"
        submission={submission}
        surface="agent"
      />,
    );

    await screen.findByRole("dialog");
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("clip");
    document.body.style.overflow = "";
  });

  test("operational drawer catches a rejected file upload", async () => {
    const onUploadFile = vi.fn().mockRejectedValue(new Error("upload failed"));
    const submission = draftSubmission();
    const { container } = render(
      <FigmaSubmissionDrawer
        activeTab="files"
        onAction={vi.fn()}
        onClose={vi.fn()}
        onOpenQuestionnaireWorkspace={vi.fn()}
        onUploadFile={onUploadFile}
        role="agent"
        submission={submission}
        surface="agent"
      />,
    );

    const fileInput = await waitFor(() => {
      const input = container.querySelector<HTMLInputElement>('input[type="file"]');
      if (!input) throw new Error("File input was not rendered.");
      return input;
    });
    fireEvent.change(fileInput, {
      target: {
        files: [new File(["passport"], "passport.jpg", { type: "image/jpeg" })],
      },
    });
    fireEvent.change(fileInput, {
      target: {
        files: [new File(["passport"], "passport.jpg", { type: "image/jpeg" })],
      },
    });

    expect(
      await screen.findByText(/Не удалось загрузить файл/),
    ).toBeInTheDocument();
    expect(onUploadFile).toHaveBeenCalledTimes(1);
  });

  test("operational drawer awaits mark-fixed and shows an inline error without a false fixed state", async () => {
    const source = initialSubmissions.find((item) => item.status === "returned");
    if (!source) throw new Error("Missing returned submission fixture.");
    const firstIssue = source.issues[0];
    if (!firstIssue) throw new Error("Missing returned issue fixture.");
    const submission: Submission = {
      ...source,
      issues: [{ ...firstIssue, type: "section", target: { ...firstIssue.target, fileType: undefined } }],
    };
    let rejectMarkFixed: ((reason?: unknown) => void) | undefined;
    const pendingMarkFixed = new Promise<void>((_resolve, reject) => {
      rejectMarkFixed = reject;
    });
    const onMarkIssueFixed = vi.fn(() => pendingMarkFixed);

    render(
      <FigmaSubmissionDrawer
        activeTab="issues"
        onAction={vi.fn()}
        onClose={vi.fn()}
        onMarkIssueFixed={onMarkIssueFixed}
        onOpenQuestionnaireWorkspace={vi.fn()}
        role="agent"
        submission={submission}
        surface="agent"
      />,
    );

    const markFixedButton = (
      await screen.findAllByRole("button", { name: "Отметить исправленным" })
    )[0];
    if (!markFixedButton) throw new Error("Missing mark-fixed action.");
    fireEvent.click(markFixedButton);
    fireEvent.click(markFixedButton);

    expect(markFixedButton).toBeDisabled();
    expect(markFixedButton).toHaveAttribute("aria-busy", "true");
    expect(markFixedButton).toHaveTextContent("Отмечаем…");
    expect(onMarkIssueFixed).toHaveBeenCalledTimes(1);

    await act(async () => {
      rejectMarkFixed?.(
        new Error("Issue target must be corrected before it can be marked fixed."),
      );
      await pendingMarkFixed.catch(() => undefined);
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Сначала внесите и сохраните исправление",
    );
    expect(markFixedButton).not.toBeDisabled();
    expect(markFixedButton).toHaveAttribute("aria-busy", "false");
    expect(screen.queryByText("Исправлено")).not.toBeInTheDocument();
    expect(screen.getAllByText("Blocker").length).toBeGreaterThan(0);
  });
});

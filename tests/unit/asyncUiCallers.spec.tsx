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

describe("async UI callers", () => {
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
    const submission = initialSubmissions.find((item) => item.status === "returned");
    if (!submission) throw new Error("Missing returned submission fixture.");
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

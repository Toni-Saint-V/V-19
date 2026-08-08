// tests/unit/aiCorrectionBriefComposer.spec.tsx
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AiCorrectionBriefComposer } from "../../src/modules/submissions/components/AiCorrectionBriefComposer";
import { buildAdminAiReviewModel } from "../../src/modules/submissions/adminAiReviewModel";
import { buildCorrectionBrief } from "../../src/modules/submissions/correctionBrief";
import { initialSubmissions } from "../../src/modules/submissions/mockData";
import type { Submission } from "../../src/modules/submissions/types";

const aiMocks = vi.hoisted(() => ({
  invokeAiHelperEdgeCached: vi.fn(),
}));

vi.mock("../../src/services/aiEdgeClient", () => ({
  invokeAiHelperEdgeCached: aiMocks.invokeAiHelperEdgeCached,
}));

function correctionSubmission(): Submission {
  const submission = initialSubmissions.find((item) => item.id === "ПД-1048");
  if (!submission) throw new Error("Expected correction fixture.");
  return structuredClone(submission);
}

function renderComposer(submission = correctionSubmission()) {
  return render(
    <AiCorrectionBriefComposer
      localReview={buildAdminAiReviewModel(submission)}
      submission={submission}
    />,
  );
}

beforeEach(() => {
  aiMocks.invokeAiHelperEdgeCached.mockReset();
  aiMocks.invokeAiHelperEdgeCached.mockResolvedValue(null);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: vi.fn().mockResolvedValue(undefined),
    },
  });
});

afterEach(() => {
  cleanup();
});

describe("AiCorrectionBriefComposer", () => {
  test("renders a complete local draft without spending an AI request", () => {
    const submission = correctionSubmission();
    const brief = buildCorrectionBrief(submission);
    renderComposer(submission);

    expect(screen.getByTestId("ai-correction-draft")).toHaveValue(brief.text);
    expect(screen.getByText("Сообщение на доработку")).toBeVisible();
    expect(screen.getByText("Приватность по умолчанию")).toBeVisible();
    expect(aiMocks.invokeAiHelperEdgeCached).not.toHaveBeenCalled();
  });

  test("requires deterministic checks and explicit human confirmation before copy", () => {
    renderComposer();

    const copyButton = screen.getByRole("button", {
      name: /Скопировать сообщение:/,
    });
    expect(copyButton).toBeDisabled();
    expect(screen.getByText("Подтвердите ручную проверку")).toBeVisible();

    fireEvent.click(screen.getByRole("checkbox", { name: /Проверил текст вручную/ }));

    expect(copyButton).toBeEnabled();
    expect(screen.getByText("Можно копировать")).toBeVisible();
  });

  test("blocks copy when an exact issue instruction is removed", () => {
    const submission = correctionSubmission();
    const brief = buildCorrectionBrief(submission);
    const instruction = brief.groups[0]?.issues[0]?.instruction;
    if (!instruction) throw new Error("Expected instruction.");
    renderComposer(submission);

    const editor = screen.getByTestId("ai-correction-draft");
    fireEvent.change(editor, {
      target: {
        value: brief.text.replace(`• ${instruction}`, ""),
      },
    });

    expect(screen.getByText("Нужна правка")).toBeVisible();
    expect(screen.getByText(/Не найдены пункты:/)).toBeVisible();
    expect(
      screen.getByRole("button", { name: /Скопировать сообщение:/ }),
    ).toBeDisabled();
  });

  test("uses at most one provider call and applies only a safe Russian intro", async () => {
    const submission = correctionSubmission();
    const brief = buildCorrectionBrief(submission);
    const instruction = brief.groups[0]?.issues[0]?.instruction;
    if (!instruction) throw new Error("Expected instruction.");
    aiMocks.invokeAiHelperEdgeCached.mockResolvedValue({
      intent: "correction_draft",
      title: "Вступление",
      summary:
        "Здравствуйте! Чтобы продолжить проверку без задержек, пожалуйста, исправьте перечисленные ниже пункты.",
      suggestions: [],
      blockers: [],
      guardrails: ["Оператор проверяет текст вручную."],
      source: "edge-provider",
    });
    renderComposer(submission);

    fireEvent.click(screen.getByRole("button", { name: "Улучшить вступление" }));

    await screen.findByText("Безопасное улучшение принято");
    expect(aiMocks.invokeAiHelperEdgeCached).toHaveBeenCalledTimes(1);
    expect(aiMocks.invokeAiHelperEdgeCached).toHaveBeenCalledWith(
      "correction_draft",
      expect.any(Object),
      expect.objectContaining({ role: "admin" }),
    );
    expect(
      (screen.getByTestId("ai-correction-draft") as HTMLTextAreaElement).value,
    ).toContain(instruction);
    expect(screen.getByText("Что изменил AI")).toBeVisible();
    expect(screen.getByRole("button", { name: "Вступление улучшено" })).toBeDisabled();
  });

  test("rejects an English or unsafe provider answer and keeps the local draft", async () => {
    const submission = correctionSubmission();
    const brief = buildCorrectionBrief(submission);
    aiMocks.invokeAiHelperEdgeCached.mockResolvedValue({
      intent: "correction_draft",
      title: "Intro",
      summary: "We guarantee approval after you upload your passport.",
      suggestions: [],
      blockers: [],
      guardrails: ["Manual review."],
      source: "edge-provider",
    });
    renderComposer(submission);

    fireEvent.click(screen.getByRole("button", { name: "Улучшить вступление" }));

    await screen.findByText("Ответ AI отклонён критиком");
    expect(screen.getByTestId("ai-correction-draft")).toHaveValue(brief.text);
    expect(aiMocks.invokeAiHelperEdgeCached).toHaveBeenCalledTimes(1);
  });

  test("ignores a stale provider response after the operator edits the draft", async () => {
    const submission = correctionSubmission();
    const brief = buildCorrectionBrief(submission);
    let resolveProvider:
      | ((value: {
          intent: "correction_draft";
          title: string;
          summary: string;
          suggestions: string[];
          blockers: string[];
          guardrails: string[];
          source: "edge-provider";
        }) => void)
      | undefined;
    const providerPromise = new Promise<{
      intent: "correction_draft";
      title: string;
      summary: string;
      suggestions: string[];
      blockers: string[];
      guardrails: string[];
      source: "edge-provider";
    }>((resolve) => {
      resolveProvider = resolve;
    });
    aiMocks.invokeAiHelperEdgeCached.mockReturnValue(providerPromise);
    renderComposer(submission);

    fireEvent.click(screen.getByRole("button", { name: "Улучшить вступление" }));
    expect(screen.getByRole("button", { name: "Улучшаем" })).toBeDisabled();

    const manualDraft = `${brief.text}\n\nЛокальная заметка оператора.`;
    fireEvent.change(screen.getByTestId("ai-correction-draft"), {
      target: { value: manualDraft },
    });

    await act(async () => {
      resolveProvider?.({
        intent: "correction_draft",
        title: "Вступление",
        summary:
          "Здравствуйте! Чтобы продолжить проверку без задержек, пожалуйста, исправьте перечисленные ниже пункты.",
        suggestions: [],
        blockers: [],
        guardrails: ["Оператор проверяет текст вручную."],
        source: "edge-provider",
      });
      await providerPromise;
    });

    expect(screen.getByTestId("ai-correction-draft")).toHaveValue(manualDraft);
    expect(screen.queryByText("Безопасное улучшение принято")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Улучшить вступление" })).toBeEnabled();
  });

  test("switching tone is local and resets manual confirmation", async () => {
    renderComposer();
    const confirmation = screen.getByRole("checkbox", {
      name: /Проверил текст вручную/,
    });
    fireEvent.click(confirmation);
    expect(confirmation).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Формально" }));

    await waitFor(() => expect(confirmation).not.toBeChecked());
    expect(
      (screen.getByTestId("ai-correction-draft") as HTMLTextAreaElement).value,
    ).toContain("Перечень необходимых исправлений");
    expect(aiMocks.invokeAiHelperEdgeCached).not.toHaveBeenCalled();
  });
});

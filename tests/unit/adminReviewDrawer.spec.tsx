import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AdminReviewDrawer } from "../../src/modules/submissions/components/AdminReviewDrawer";
import { initialSubmissions } from "../../src/modules/submissions/mockData";
import type { DrawerTab, IssueInput, Submission } from "../../src/modules/submissions/types";

const aiMocks = vi.hoisted(() => ({
  invokeAiHelperEdge: vi.fn(),
}));

vi.mock("../../src/services/aiEdgeClient", () => ({
  invokeAiHelperEdge: aiMocks.invokeAiHelperEdge,
}));

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  aiMocks.invokeAiHelperEdge.mockReset();
  aiMocks.invokeAiHelperEdge.mockResolvedValue(null);
});

Object.defineProperty(HTMLElement.prototype, "scrollTo", {
  configurable: true,
  value: vi.fn(),
});

function adminReviewSubmission(): Submission {
  const submission = initialSubmissions.find((item) => item.id === "ПД-1053");
  if (!submission) throw new Error("Expected admin review fixture.");
  return submission;
}

function renderDrawer({
  activeTab = "overview",
  onAcceptAiSuggestion = vi.fn(),
  onAddIssue = vi.fn(),
  onAction = vi.fn(),
  onDismissAiSuggestion = vi.fn(),
  onRunAiReview = vi.fn(),
}: {
  activeTab?: DrawerTab;
  onAction?: () => void;
  onAcceptAiSuggestion?: (suggestionId: string) => void;
  onAddIssue?: (input: IssueInput) => void;
  onDismissAiSuggestion?: (suggestionId: string) => void;
  onRunAiReview?: () => void;
} = {}) {
  return {
    onAcceptAiSuggestion,
    onAction,
    onAddIssue,
    onDismissAiSuggestion,
    onRunAiReview,
    ...render(
      <AdminReviewDrawer
        activeTab={activeTab}
        actionError=""
        focusTarget={undefined}
        submission={adminReviewSubmission()}
        onAction={onAction}
        onAcceptAiSuggestion={onAcceptAiSuggestion}
        onAddIssue={onAddIssue}
        onClose={() => undefined}
        onClearFocusTarget={() => undefined}
        onDismissAiSuggestion={onDismissAiSuggestion}
        onReviewFileAccept={() => undefined}
        onRunAiReview={onRunAiReview}
        onTab={() => undefined}
      />,
    ),
  };
}

describe("AdminReviewDrawer", () => {
  test("shows real admin review metadata and canonical review tabs", () => {
    const { container } = renderDrawer();

    expect(screen.getAllByText("Нина Волкова")[0]).toBeVisible();
    expect(screen.getAllByText("ПД-1053")[0]).toBeVisible();
    expect(container.querySelector(".admin-review-meta")?.textContent).toContain(
      "Казань",
    );
    expect(screen.getAllByText("На проверке")[0]).toBeVisible();

    for (const tab of [
      /^Обзор$/,
      /^Заявители/,
      /^Анкета/,
      /^Файлы$/,
      /^Замечания/,
      /^История/,
    ]) {
      expect(screen.getByRole("tab", { name: tab })).toBeVisible();
    }
  });

  test("opens overview, applicant, and history admin subscreens from tabs", async () => {
    renderDrawer();

    expect(screen.getByLabelText("Сводка пакета")).toBeInTheDocument();
    expect(screen.getByLabelText("Маршрут проверки")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /^Заявители/ }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Паспорт" })).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Селфи" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /^История/ }));
    await waitFor(() =>
      expect(screen.getByLabelText("История подачи")).toBeInTheDocument(),
    );
    expect(screen.getByText("Агент отправил подачу на проверку")).toBeInTheDocument();
  });

  test("creates only canonical admin issue targets", () => {
    const onAddIssue = vi.fn();
    renderDrawer({ activeTab: "issues", onAddIssue });

    fireEvent.click(screen.getByRole("button", { name: "Добавить замечание" }));

    expect(screen.getByLabelText("Новое замечание")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Анкета" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Скан загранпаспорта" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Селфи" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Селфи N2" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Документ" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Скан загранпаспорта" }));
    fireEvent.change(screen.getByPlaceholderText("Что именно не так..."), {
      target: { value: "Паспорт не совпадает с анкетой." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Отправить замечание" }));

    expect(onAddIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        fileType: "passport_scan",
        section: "Файлы",
        type: "file",
      }),
    );
  });

  test("runs admin drawer AI through the edge helper and fails closed when unavailable", async () => {
    const onAction = vi.fn();
    renderDrawer({ activeTab: "files", onAction });

    fireEvent.click(screen.getByRole("button", { name: "Проверить AI" }));

    await waitFor(() =>
      expect(screen.getAllByText(/локальный AI не настроен/).length).toBeGreaterThan(0),
    );
    expect(aiMocks.invokeAiHelperEdge).toHaveBeenCalledTimes(3);
    expect(aiMocks.invokeAiHelperEdge.mock.calls.map((call) => call[0])).toEqual([
      "admin_review",
      "admin_next_action",
      "admin_readiness_explanation",
    ]);
    expect(JSON.stringify(aiMocks.invokeAiHelperEdge.mock.calls)).not.toContain(
      "Нина Волкова",
    );
    expect(onAction).not.toHaveBeenCalled();
  });

  test("renders safe admin AI review output without autonomous accept or export", async () => {
    const onAction = vi.fn();
    aiMocks.invokeAiHelperEdge
      .mockResolvedValueOnce({
        intent: "admin_review",
        title: "Предварительная проверка",
        summary: "Проверьте комплект вручную.",
        suggestions: ["Проверьте паспорт и селфи."],
        blockers: ["Есть открытое замечание."],
        guardrails: ["Подсказка не является решением."],
        source: "edge-provider",
        adminReviewChecklist: ["Сверить анкету с файлами."],
      })
      .mockResolvedValueOnce({
        intent: "admin_next_action",
        title: "Следующее действие",
        summary: "Верните точечное замечание.",
        suggestions: ["Добавьте одно точное замечание и проверьте текст."],
        blockers: [],
        guardrails: ["Администратор подтверждает вручную."],
        source: "edge-provider",
        nextAction: "Добавьте одно точное замечание и проверьте текст.",
      })
      .mockResolvedValueOnce({
        intent: "admin_readiness_explanation",
        title: "Готовность",
        summary: "Пакет не готов из-за открытого замечания.",
        suggestions: ["Закройте замечание после проверки."],
        blockers: ["Открытое замечание блокирует движение дальше."],
        guardrails: ["Действия остаются ручными."],
        source: "edge-provider",
        readinessExplanation: "Пакет не готов из-за открытого замечания.",
      });
    renderDrawer({ activeTab: "files", onAction });

    fireEvent.click(screen.getByRole("button", { name: "Проверить AI" }));

    await screen.findByText("Сверить анкету с файлами.");
    expect(screen.getByText("Пакет не готов из-за открытого замечания.")).toBeVisible();
    expect(screen.getByText(/Принятие и выгрузка остаются ручными/)).toBeVisible();
    expect(onAction).not.toHaveBeenCalled();
  });

  test("drafts an agent-facing remark for admin review without sending it", async () => {
    const onAddIssue = vi.fn();
    aiMocks.invokeAiHelperEdge.mockResolvedValue({
      intent: "admin_issue_remark_draft",
      title: "Черновик замечания",
      summary: "Уточните маршрут поездки и приложите корректные данные.",
      suggestions: ["Проверьте текст перед отправкой агенту."],
      blockers: [],
      guardrails: ["Администратор проверяет текст вручную."],
      source: "edge-provider",
      issueRemarkDraft: "Уточните маршрут поездки и приложите корректные данные.",
    });
    renderDrawer({ activeTab: "issues", onAddIssue });

    fireEvent.click(screen.getByRole("button", { name: "Добавить замечание" }));
    fireEvent.click(screen.getByRole("button", { name: "Сформулировать с AI" }));

    await waitFor(() =>
      expect(screen.getByPlaceholderText("Конкретное действие для агента")).toHaveValue(
        "Уточните маршрут поездки и приложите корректные данные.",
      ),
    );
    expect(onAddIssue).not.toHaveBeenCalled();
    expect(screen.getByText(/Проверьте и отредактируйте/)).toBeInTheDocument();
  });
});

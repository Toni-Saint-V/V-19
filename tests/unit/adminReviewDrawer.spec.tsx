import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AdminReviewDrawer } from "../../src/modules/submissions/components/AdminReviewDrawer";
import { initialSubmissions } from "../../src/modules/submissions/mockData";
import { ADMIN_PASSPORT_REVIEW_FIELD_IDS } from "../../src/modules/submissions/passportReviewContract";
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
  onClose = vi.fn(),
  onVerifyDocument = vi.fn(),
  submission = adminReviewSubmission(),
}: {
  activeTab?: DrawerTab;
  onAction?: () => void;
  onAcceptAiSuggestion?: (suggestionId: string) => void;
  onAddIssue?: (input: IssueInput) => void;
  onDismissAiSuggestion?: (suggestionId: string) => void;
  onRunAiReview?: () => void;
  onClose?: () => void;
  onVerifyDocument?: (applicantId: string) => void;
  submission?: Submission;
} = {}) {
  return {
    onAcceptAiSuggestion,
    onAction,
    onAddIssue,
    onDismissAiSuggestion,
    onRunAiReview,
    onClose,
    onVerifyDocument,
    ...render(
      <AdminReviewDrawer
        activeTab={activeTab}
        actionError=""
        focusTarget={undefined}
        submission={submission}
        onAction={onAction}
        onAcceptAiSuggestion={onAcceptAiSuggestion}
        onAddIssue={onAddIssue}
        onClose={onClose}
        onClearFocusTarget={() => undefined}
        onDismissAiSuggestion={onDismissAiSuggestion}
        onRunAiReview={onRunAiReview}
        onTab={() => undefined}
        onVerifyDocument={onVerifyDocument}
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

  test("exposes roving tabs, traps Escape at the top layer, and restores opener focus", async () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const onClose = vi.fn();
    const { unmount } = renderDrawer({ onClose });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Закрыть проверку" })).toHaveFocus(),
    );
    const tablist = screen.getByRole("tablist", { name: "Рабочие вкладки проверки" });
    const tabs = within(tablist).getAllByRole("tab");
    expect(tabs.filter((tab) => tab.getAttribute("tabindex") === "0")).toHaveLength(1);
    expect(tabs[0]).toHaveAttribute("aria-controls", "admin-review-panel-overview");

    fireEvent.keyDown(tabs[0]!, { key: "ArrowRight" });
    await waitFor(() => {
      expect(tabs[1]).toHaveAttribute("aria-selected", "true");
      expect(tabs[1]).toHaveFocus();
    });
    await waitFor(() =>
      expect(screen.getByRole("tabpanel")).toHaveAttribute(
        "aria-labelledby",
        "admin-review-tab-applicants",
      ),
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });

  test("owns remark focus, traps Tab, closes on Escape, and restores the trigger", async () => {
    const onClose = vi.fn();
    const { container } = renderDrawer({ activeTab: "issues", onClose });

    const trigger = screen.getByRole("button", { name: "Добавить замечание" });
    trigger.focus();
    fireEvent.click(trigger);

    const remarkDialog = screen.getByRole("dialog", { name: "Новое замечание" });
    const drawer = container.querySelector(".admin-review-drawer");
    const closeRemark = within(remarkDialog).getByRole("button", {
      name: "Закрыть форму замечания",
    });
    const submitRemark = within(remarkDialog).getByRole("button", {
      name: "Отправить замечание",
    });

    await waitFor(() =>
      expect(
        within(remarkDialog).getByPlaceholderText("Что именно не так..."),
      ).toHaveFocus(),
    );
    expect(drawer).toHaveAttribute("aria-hidden", "true");
    expect(drawer).toHaveAttribute("inert");

    closeRemark.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(submitRemark).toHaveFocus();

    fireEvent.keyDown(document, { key: "Tab" });
    expect(closeRemark).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Новое замечание" })).not.toBeInTheDocument(),
    );
    expect(onClose).not.toHaveBeenCalled();
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(drawer).not.toHaveAttribute("aria-hidden");
    expect(drawer).not.toHaveAttribute("inert");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("keeps a family file remark attached to the file applicant", () => {
    const source = adminReviewSubmission();
    const firstApplicant = source.applicants[0];
    const passport = source.files.find((file) => file.type === "passport_scan");
    if (!firstApplicant || !passport) throw new Error("Expected applicant and passport fixture.");
    const secondApplicant = {
      ...firstApplicant,
      fullName: "Ирина Волкова",
      id: "family-second-applicant",
    };
    const secondPassport = {
      ...passport,
      applicantId: secondApplicant.id,
      id: "family-second-passport",
    };
    const submission: Submission = {
      ...source,
      applicants: [firstApplicant, secondApplicant],
      files: [...source.files, secondPassport],
      title: "Семья Волковых",
      type: "family",
    };
    const onAddIssue = vi.fn();
    renderDrawer({ activeTab: "files", onAddIssue, submission });

    const targetFile = document.getElementById(
      "workspace-media-family-second-applicant-passport_scan",
    );
    if (!targetFile) throw new Error("Expected second applicant passport row.");
    fireEvent.click(
      within(targetFile).getByRole("button", {
        name: "Создать замечание: Скан паспорта",
      }),
    );

    expect(screen.getByRole("combobox", { name: /Заявитель/ })).toHaveValue(
      secondApplicant.id,
    );
    fireEvent.click(screen.getByRole("button", { name: "Отправить замечание" }));
    expect(onAddIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        applicantId: secondApplicant.id,
        fileType: "passport_scan",
        type: "file",
      }),
    );
  });

  test("jumps from an issue to its exact questionnaire field", async () => {
    const source = adminReviewSubmission();
    const applicant = source.applicants[0];
    const section = applicant?.sections.find((candidate) =>
      candidate.fields.some((field) => field.id === "passport-no"),
    );
    const field = section?.fields.find((candidate) => candidate.id === "passport-no");
    if (!applicant || !section || !field) throw new Error("Expected questionnaire fixture.");
    const submission: Submission = {
      ...source,
      issues: [
        {
          comment: "Исправьте точное поле.",
          createdAt: "сейчас",
          createdBy: "admin",
          id: "exact-field-issue",
          reason: "Поле требует уточнения",
          severity: "blocker",
          status: "open",
          target: {
            applicantId: applicant.id,
            applicantName: applicant.fullName,
            field: field.id,
            section: section.title,
          },
          type: "field",
        },
      ],
    };
    const { container } = renderDrawer({ activeTab: "issues", submission });

    fireEvent.click(screen.getByRole("button", { name: "Перейти к месту" }));
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /^Анкета/ })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(container.querySelector(".admin-review-field-row.is-ai-target")).toBeTruthy();
    });
    expect(container.querySelector(".admin-review-field-row.is-ai-target")).toHaveTextContent(
      field.label,
    );
  });

  test("renders truthful zero states without exposing a no-op remark action", async () => {
    const source = adminReviewSubmission();
    const submission: Submission = {
      ...source,
      applicants: [],
      completeness: { files: 0, questionnaire: 0, total: 0 },
      files: [],
      history: [],
      issues: [],
    };
    renderDrawer({ activeTab: "files", submission });

    expect(screen.getByText("Файлы для проверки не загружены")).toBeInTheDocument();
    expect(screen.getByText("0/0")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /^Заявители/ }));
    expect(await screen.findByText("Заявители не добавлены")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /^История/ }));
    expect(await screen.findByText("История пока пуста")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /^Замечания/ }));
    expect(await screen.findByText("Открытых замечаний нет")).toBeInTheDocument();
    expect(screen.queryByText(/Пакет можно принимать/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Добавить замечание" })).toBeDisabled();
  });

  test("opens overview, applicant, and history admin subscreens from tabs", async () => {
    renderDrawer();

    expect(screen.getByLabelText("Сводка пакета")).toBeInTheDocument();
    expect(screen.getByLabelText("Маршрут проверки")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /^Заявители/ }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Паспорт и селфи" }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: "Селфи" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /^История/ }));
    await waitFor(() =>
      expect(screen.getByLabelText("История подачи")).toBeInTheDocument(),
    );
    expect(screen.getByText("Агент отправил подачу на проверку")).toBeInTheDocument();
  });

  test("shows only the eight scan-verifiable passport fields in legacy review tabs", async () => {
    const { container } = renderDrawer();

    fireEvent.click(screen.getByRole("tab", { name: /^Анкета/ }));
    const questionnairePane = await screen.findByRole("region", {
      name: "Поля анкеты",
    });
    expect(
      questionnairePane.querySelectorAll(".admin-review-field-row"),
    ).toHaveLength(8);
    expect(questionnairePane).toHaveTextContent("Фамилия");
    expect(questionnairePane).toHaveTextContent("Номер паспорта");
    expect(questionnairePane).not.toHaveTextContent("Тип паспорта");
    expect(questionnairePane).not.toHaveTextContent("Страна выдачи");
    expect(container.querySelector(".admin-review-field-section")).toHaveTextContent(
      "Паспортные данные",
    );
  });

  test("reports the atomic admin approval state as eight of eight", async () => {
    const source = adminReviewSubmission();
    const approvedAtIso = "2026-07-17T09:00:00.000Z";
    const submission: Submission = {
      ...source,
      issues: [],
      applicants: source.applicants.map((applicant) => ({
        ...applicant,
        sections: applicant.sections.map((section) => ({
          ...section,
          fields: section.fields.map((field) =>
            ADMIN_PASSPORT_REVIEW_FIELD_IDS.some((fieldId) => fieldId === field.id)
              ? {
                  ...field,
                  adminReviewApprovedAtIso: approvedAtIso,
                  adminReviewApprovedBy: "admin-reviewer",
                  value: field.value || "APPROVED",
                }
              : field,
          ),
        })),
      })),
    };
    const { container } = renderDrawer({ activeTab: "questionnaire", submission });

    expect(await screen.findByText("8 / 8 ok")).toBeInTheDocument();
    expect(container.querySelectorAll(".admin-review-field-row.is-ok")).toHaveLength(8);
    expect(screen.getByText("8 проверено")).toBeInTheDocument();
    expect(screen.getByText("0 осталось")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /^Заявители/ }));
    expect(await screen.findByText("8/8")).toBeInTheDocument();
  });

  test("keeps a legacy secondary selfie correction in the admin file review", () => {
    const source = adminReviewSubmission();
    const primary = source.applicants[0];
    const primarySelfie = source.files.find((file) => file.type === "selfie");
    if (!primary || !primarySelfie) throw new Error("Expected passport fixture.");
    const secondary = {
      ...primary,
      fullName: "Ирина Волкова",
      id: "з-1053-legacy-secondary",
      role: "spouse" as const,
    };
    const legacySelfie = {
      ...primarySelfie,
      applicantId: secondary.id,
      id: `${secondary.id}-selfie`,
      linkedIssueId: "legacy-secondary-selfie-issue",
      status: "pending_review" as const,
    };
    const submission: Submission = {
      ...source,
      applicants: [primary, secondary],
      files: [...source.files, legacySelfie],
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
    const onVerifyDocument = vi.fn();

    renderDrawer({ activeTab: "files", onVerifyDocument, submission });

    const secondarySection = screen
      .getByText("Ирина Волкова", { selector: ".v19-drawer-file-section-title" })
      .closest(".v19-drawer-file-section");
    const legacyTitle = secondarySection
      ? within(secondarySection as HTMLElement).getByText("Селфи 1", {
          selector: ".v19-drawer-file-title",
        })
      : undefined;
    const legacyRow = legacyTitle?.closest(".admin-review-file-item");
    if (!legacyRow) throw new Error("Legacy secondary selfie row was not rendered.");
    expect(
      within(legacyRow).queryByRole("button", {
        name: "Создать замечание: Селфи 1",
      }),
    ).not.toBeInTheDocument();
    expect(within(legacyRow).getByText("Только просмотр")).toBeInTheDocument();
    fireEvent.click(within(legacyRow).getByRole("button", { name: "Проверить" }));
    expect(onVerifyDocument).toHaveBeenCalledWith(secondary.id);
  });

  test("does not offer selfie remarks after selecting a secondary family applicant", () => {
    const source = adminReviewSubmission();
    const primary = source.applicants[0];
    if (!primary) throw new Error("Expected primary applicant.");
    const secondary = {
      ...primary,
      fullName: "Ирина Волкова",
      id: "family-secondary-remark-target",
      role: "spouse" as const,
    };
    const submission: Submission = {
      ...source,
      applicants: [primary, secondary],
      type: "family",
    };

    renderDrawer({ activeTab: "issues", submission });
    fireEvent.click(screen.getByRole("button", { name: "Добавить замечание" }));
    fireEvent.change(screen.getByRole("combobox", { name: /Заявитель/ }), {
      target: { value: secondary.id },
    });

    expect(screen.getByRole("button", { name: "Скан паспорта" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Селфи 1" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Селфи 2" })).not.toBeInTheDocument();
  });

  test("creates only canonical admin issue targets", () => {
    const onAddIssue = vi.fn();
    renderDrawer({ activeTab: "issues", onAddIssue });

    fireEvent.click(screen.getByRole("button", { name: "Добавить замечание" }));

    expect(screen.getByLabelText("Новое замечание")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Анкета" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Скан паспорта" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Селфи 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Селфи 2" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Документ" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Скан паспорта" }));
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

  test("gives a general questionnaire remark a stable canonical field target", () => {
    const onAddIssue = vi.fn();
    renderDrawer({ activeTab: "issues", onAddIssue });

    fireEvent.click(screen.getByRole("button", { name: "Добавить замечание" }));
    fireEvent.click(screen.getByRole("button", { name: "Отправить замечание" }));

    expect(onAddIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        field: expect.any(String),
        fieldId: expect.any(String),
        sectionId: expect.any(String),
        type: "field",
      }),
    );
  });

  test("routes the selected passport into the protected review workspace", () => {
    const submission = adminReviewSubmission();
    const applicant = submission.applicants[0];
    if (!applicant) throw new Error("Expected applicant.");
    const onVerifyDocument = vi.fn();
    renderDrawer({ activeTab: "files", onVerifyDocument, submission });

    fireEvent.click(screen.getAllByRole("button", { name: "Проверить" }).at(-1)!);

    expect(onVerifyDocument).toHaveBeenCalledWith(applicant.id);
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

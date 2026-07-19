import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AdminReviewDrawer } from "../../src/modules/submissions/components/AdminReviewDrawer";
import * as mediaStorage from "../../src/modules/submissions/mediaStorage";
import { initialSubmissions } from "../../src/modules/submissions/mockData";
import { ADMIN_PASSPORT_REVIEW_FIELD_IDS } from "../../src/modules/submissions/passportReviewContract";
import type {
  DrawerTab,
  IssueInput,
  Submission,
  SubmissionFile,
} from "../../src/modules/submissions/types";

const aiMocks = vi.hoisted(() => ({
  invokeAiHelperEdge: vi.fn(),
}));

vi.mock("../../src/services/aiEdgeClient", () => ({
  invokeAiHelperEdge: aiMocks.invokeAiHelperEdge,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
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

function submissionWithProtectedPassport({
  extension = "jpg",
  mimeType = "image/jpeg",
  pathApplicantId,
}: {
  extension?: "jpg" | "pdf";
  mimeType?: "application/pdf" | "image/jpeg";
  pathApplicantId?: string;
} = {}) {
  const submission = adminReviewSubmission();
  const applicant = submission.applicants[0];
  const passport = submission.files.find(
    (file) => file.applicantId === applicant?.id && file.type === "passport_scan",
  );
  if (!applicant || !passport) throw new Error("Expected passport review fixture.");

  const generatedFileName = `${applicant.id.replace(/\D/g, "")}_passport_scan.${extension}`;
  const target = mediaStorage.buildMediaStoragePath(
    submission.id,
    pathApplicantId ?? applicant.id,
    "passport_scan",
    generatedFileName,
  );
  const protectedPassport: SubmissionFile = {
    ...passport,
    generatedFileName,
    mimeType,
    originalFileName: `passport.${extension}`,
    status: "pending_review",
    storageAdapter: "supabase-private",
    storageBucket: target.bucket,
    storagePath: target.path,
    uploadStatus: "uploaded",
  };

  return {
    ...submission,
    files: submission.files.map((file) =>
      file.id === passport.id ? protectedPassport : file,
    ),
  };
}

function submissionWithProtectedMedia() {
  const submission = adminReviewSubmission();
  return {
    ...submission,
    files: submission.files.map((file): SubmissionFile => {
      if (
        file.type !== "passport_scan" &&
        file.type !== "selfie" &&
        file.type !== "selfie_2"
      ) {
        return file;
      }
      const generatedFileName = `${file.applicantId.replace(/\D/g, "")}_${file.type}.jpg`;
      const target = mediaStorage.buildMediaStoragePath(
        submission.id,
        file.applicantId,
        file.type,
        generatedFileName,
      );
      return {
        ...file,
        generatedFileName,
        mimeType: "image/jpeg",
        originalFileName: `${file.type}.jpg`,
        status: "pending_review",
        storageAdapter: "supabase-private",
        storageBucket: target.bucket,
        storagePath: target.path,
        uploadStatus: "uploaded",
      };
    }),
  };
}

async function openPassportReview(submission: Submission) {
  const applicant = submission.applicants[0];
  if (!applicant) throw new Error("Expected applicant.");
  renderDrawer({ activeTab: "files", submission });
  const passportFile = document.getElementById(
    `workspace-media-${applicant.id}-passport_scan`,
  );
  if (!passportFile) throw new Error("Expected passport file row.");
  fireEvent.click(within(passportFile).getByRole("button", { name: "Проверить" }));
  const reviewPane = await screen.findByLabelText("Сверка паспорта");
  return {
    acceptButton: within(reviewPane).getByRole("button", { name: "Принять" }),
    applicant,
  };
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

  test("jumps from a passport field issue to its visible passport comparison row", async () => {
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
      expect(screen.getByRole("tab", { name: /^Файлы$/ })).toHaveAttribute(
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
    expect(screen.getByText("—")).toBeInTheDocument();

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
    expect(screen.queryByRole("button", { name: "Анкета" })).toBeNull();
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

  test("keeps a passport field remark attached to the exact field", async () => {
    const source = adminReviewSubmission();
    const applicant = source.applicants[0];
    const passportSection = applicant?.sections.find((section) =>
      `${section.id} ${section.title}`.toLowerCase().includes("passport"),
    );
    const passportField = passportSection?.fields[0];
    if (!applicant || !passportSection || !passportField) {
      throw new Error("Expected passport field fixture.");
    }
    const onAddIssue = vi.fn();
    renderDrawer({
      activeTab: "files",
      onAddIssue,
      submission: { ...source, issues: [] },
    });

    const passportFile = document.getElementById(
      `workspace-media-${applicant.id}-passport_scan`,
    );
    if (!passportFile) throw new Error("Expected passport file.");
    fireEvent.click(within(passportFile).getByRole("button", { name: "Проверить" }));

    const fieldRow = await screen.findByText(passportField.label);
    const fieldCard = fieldRow.closest(".admin-review-field-row");
    if (!fieldCard) throw new Error("Expected passport field row.");
    fireEvent.click(
      within(fieldCard).getByRole("button", {
        name: `Создать замечание: ${passportField.label}`,
      }),
    );

    expect(screen.getByRole("button", { name: "Поле паспорта" })).toHaveClass(
      "is-active",
    );
    fireEvent.click(screen.getByRole("button", { name: "Отправить замечание" }));

    expect(onAddIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        applicantId: applicant.id,
        field: passportField.label,
        fileType: undefined,
        section: "Паспорт",
        type: "field",
      }),
    );
  });

  test("counts only accepted selfies and confirmed passport fields as reviewed", () => {
    const source = adminReviewSubmission();
    const submission: Submission = {
      ...source,
      applicants: source.applicants.map((applicant) => ({
        ...applicant,
        sections: applicant.sections.map((section) => ({
          ...section,
          fields: section.fields.map((field) => ({
            ...field,
            adminReviewApprovedAtIso: undefined,
            adminReviewApprovedBy: undefined,
            reviewConfirmedAtIso: undefined,
            reviewConfirmedBy: undefined,
            reviewState: "needs_review",
          })),
        })),
      })),
      files: source.files.map((file) =>
        file.type === "selfie" || file.type === "selfie_2"
          ? { ...file, status: "pending_review" as const }
          : file,
      ),
    };
    renderDrawer({ submission });

    const metrics = screen.getByLabelText("Метрики проверки");
    expect(within(metrics).getByText("0/2")).toBeInTheDocument();
    expect(within(metrics).getByText("0%")).toBeInTheDocument();
    expect(within(metrics).queryByText(`${submission.completeness.total}%`)).toBeNull();
  });

  test("opens selected passport in the persistent comparison surface", async () => {
    const submission = adminReviewSubmission();
    const applicant = submission.applicants[0];
    if (!applicant) throw new Error("Expected applicant.");
    const onVerifyDocument = vi.fn();
    renderDrawer({ activeTab: "files", onVerifyDocument, submission });

    const passportFile = document.getElementById(
      `workspace-media-${applicant.id}-passport_scan`,
    );
    if (!passportFile) throw new Error("Expected passport file.");
    fireEvent.click(within(passportFile).getByRole("button", { name: "Проверить" }));

    expect(onVerifyDocument).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /^Файлы$/ })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(screen.getByRole("heading", { name: "Паспорт + ключевые поля" })).toBeVisible();
    });
  });

  test("loads an exact protected passport image and keeps Accept fail-closed until ready", async () => {
    const submission = submissionWithProtectedPassport();
    const passport = submission.files.find((file) => file.type === "passport_scan");
    if (!passport?.storagePath) throw new Error("Expected protected passport path.");
    let resolveSignedUrl: (url: string | null) => void = () => undefined;
    const signedUrlPromise = new Promise<string | null>((resolve) => {
      resolveSignedUrl = resolve;
    });
    const createSignedUrl = vi
      .spyOn(mediaStorage, "createMediaSignedUrl")
      .mockReturnValue(signedUrlPromise);

    const { acceptButton } = await openPassportReview(submission);

    expect(acceptButton).toBeDisabled();
    await waitFor(() =>
      expect(createSignedUrl).toHaveBeenCalledWith({
        bucket: mediaStorage.mediaStorageBucket,
        path: passport.storagePath,
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Загружаем защищённый оригинал",
    );

    await act(async () => {
      resolveSignedUrl("https://example.test/protected-passport.jpg");
      await signedUrlPromise;
    });

    const image = await screen.findByTestId(
      "protected-media-preview-passport_scan",
    );
    expect(image.tagName).toBe("IMG");
    expect(image).toHaveAttribute(
      "src",
      "https://example.test/protected-passport.jpg",
    );
    expect(acceptButton).toBeEnabled();
    expect(screen.queryByText("PASSPORT")).not.toBeInTheDocument();

    fireEvent.error(image);
    expect(
      await screen.findByTestId("protected-media-unavailable-passport_scan"),
    ).toBeInTheDocument();
    expect(acceptButton).toBeDisabled();
  });

  test("renders a protected passport PDF through the signed URL", async () => {
    const submission = submissionWithProtectedPassport({
      extension: "pdf",
      mimeType: "application/pdf",
    });
    vi.spyOn(mediaStorage, "createMediaSignedUrl").mockResolvedValue(
      "https://example.test/protected-passport.pdf",
    );

    const { acceptButton } = await openPassportReview(submission);
    const preview = await screen.findByTestId(
      "protected-media-preview-passport_scan",
    );

    expect(preview.tagName).toBe("OBJECT");
    expect(preview).toHaveAttribute(
      "data",
      "https://example.test/protected-passport.pdf",
    );
    expect(preview).toHaveAttribute("type", "application/pdf");
    expect(acceptButton).toBeEnabled();
  });

  test("shows both protected selfie targets together", async () => {
    const submission = submissionWithProtectedMedia();
    const applicant = submission.applicants[0];
    if (!applicant) throw new Error("Expected applicant.");
    const createSignedUrl = vi
      .spyOn(mediaStorage, "createMediaSignedUrl")
      .mockImplementation(async ({ path }) => `https://example.test/${encodeURIComponent(path)}`);
    renderDrawer({ activeTab: "files", submission });
    const selfieFile = document.getElementById(
      `workspace-media-${applicant.id}-selfie`,
    );
    if (!selfieFile) throw new Error("Expected selfie file row.");

    fireEvent.click(within(selfieFile).getByRole("button", { name: "Проверить" }));

    const firstSelfiePane = await screen.findByLabelText("Проверка Селфи 1");
    const secondSelfiePane = await screen.findByLabelText("Проверка Селфи 2");
    expect(
      await screen.findByTestId("protected-media-preview-selfie"),
    ).toBeInTheDocument();
    expect(
      await screen.findByTestId("protected-media-preview-selfie_2"),
    ).toBeInTheDocument();
    expect(
      within(firstSelfiePane).getByRole("button", { name: "Принять" }),
    ).toBeEnabled();
    expect(
      within(secondSelfiePane).getByRole("button", { name: "Принять" }),
    ).toBeEnabled();
    expect(createSignedUrl).toHaveBeenCalledTimes(2);
  });

  test("rejects a private path from another applicant before requesting a signed URL", async () => {
    const submission = submissionWithProtectedPassport({
      pathApplicantId: "foreign-applicant",
    });
    const createSignedUrl = vi
      .spyOn(mediaStorage, "createMediaSignedUrl")
      .mockResolvedValue("https://example.test/must-not-render.jpg");

    const { acceptButton } = await openPassportReview(submission);

    expect(
      await screen.findByTestId("protected-media-unavailable-passport_scan"),
    ).toBeInTheDocument();
    expect(createSignedUrl).not.toHaveBeenCalled();
    expect(
      screen.queryByTestId("protected-media-preview-passport_scan"),
    ).not.toBeInTheDocument();
    expect(acceptButton).toBeDisabled();
  });

  test("keeps the manual review surface limited to passport fields and both selfies", () => {
    renderDrawer({ activeTab: "files" });

    expect(screen.queryByRole("button", { name: "Проверить AI" })).toBeNull();
    expect(screen.queryByText("AI-конфликты личности")).toBeNull();
    expect(aiMocks.invokeAiHelperEdge).not.toHaveBeenCalled();
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

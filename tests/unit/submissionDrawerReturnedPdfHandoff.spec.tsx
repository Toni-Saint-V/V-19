import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  buildAppointmentPdfStorageTarget,
  buildVisaApplicationPdfStorageTarget,
  mediaStorageBucket,
} from "../../src/modules/submissions/mediaStorage";
import { SubmissionDrawer } from "../../src/modules/submissions/components/SubmissionDrawer";
import type { IssueInput, Submission } from "../../src/modules/submissions/types";

afterEach(() => {
  cleanup();
});

Object.defineProperty(HTMLElement.prototype, "scrollTo", {
  configurable: true,
  value: vi.fn(),
});

function readyReturnedPdfSubmission(): Submission {
  const submissionId = "ПД-HANDOFF";
  const applicantId = "з-handoff-1";
  const passportNumber = "669308614";
  const applicationSha = "a".repeat(64);
  const appointmentSha = "b".repeat(64);
  const exportPackage = {
    contentFingerprint: "xlsx|returned-pdf-handoff|ПД-HANDOFF",
    fileName: "visaflow-export-returned-pdf-handoff.xlsx",
    format: "xlsx" as const,
    idempotencyKey: "returned-pdf-handoff",
    rowCount: 1,
    submissionIds: [submissionId],
  };
  const applicationTarget = buildVisaApplicationPdfStorageTarget({
    applicantId,
    sha256: applicationSha,
    submissionId,
  });
  const appointmentTarget = buildAppointmentPdfStorageTarget({
    sha256: appointmentSha,
    submissionId,
  });

  return {
    id: submissionId,
    agentId: "agent-1",
    title: "Returned PDF handoff",
    type: "single",
    country: "Испания",
    countryCode: "ES",
    city: "Москва",
    tripDateFrom: "22.07",
    tripDateTo: "31.07",
    status: "exported",
    exportPackage,
    returnedPdfPackage: {
      commonAppointmentPdf: {
        fileName: `${passportNumber}_appointment.pdf`,
        mimeType: "application/pdf",
        sha256: appointmentSha,
        sizeBytes: 32_000,
        storageBucket: mediaStorageBucket,
        storagePath: appointmentTarget.path,
        uploadedAtIso: "2026-06-27T10:00:00.000Z",
      },
      exportPackageId: exportPackage.idempotencyKey,
      ownerAgentId: "agent-1",
      ownerAgentName: "Nord Travel",
    },
    visaApplicationPdfReviews: [
      {
        applicantId,
        applicantName: "Мария Иванова",
        artifact: {
          fileName: `${passportNumber}_application.pdf`,
          mimeType: "application/pdf",
          sha256: applicationSha,
          sizeBytes: 48_000,
          storageBucket: mediaStorageBucket,
          storagePath: applicationTarget.path,
          uploadedAtIso: "2026-06-27T10:01:00.000Z",
        },
        checkedAtIso: "2026-06-27T10:02:00.000Z",
        data: {
          passportNumber,
        },
        fileName: `${passportNumber}_application.pdf`,
        findings: [],
        handoffStatus: "ready_for_agent",
        id: "visa-pdf-handoff-1",
        status: "clear",
      },
    ],
    applicants: [
      {
        id: applicantId,
        fullName: "Мария Иванова",
        role: "main",
        questionnaireStatus: "complete",
        fileStatus: "complete",
        sections: [
          {
            id: "passport",
            title: "Паспорт",
            status: "complete",
            fields: [
              {
                id: "passport-no",
                label: "Номер паспорта",
                required: true,
                value: passportNumber,
              },
            ],
          },
        ],
      },
    ],
    issues: [],
    files: [
      {
        id: "file-passport",
        applicantId,
        type: "passport_scan",
        status: "accepted",
      },
      { id: "file-selfie", applicantId, type: "selfie", status: "accepted" },
      { id: "file-selfie-2", applicantId, type: "selfie_2", status: "accepted" },
    ],
    completeness: { questionnaire: 100, files: 100, total: 100 },
    createdAt: "2026-06-27T09:00:00.000Z",
    updatedAt: "2026-06-27T10:02:00.000Z",
    history: [],
  };
}

function adminReviewFamilySubmission(): Submission {
  return {
    id: "ПД-REVIEW",
    agentId: "agent-1",
    title: "Семья Петровых",
    type: "family",
    country: "Испания",
    countryCode: "ES",
    city: "Москва",
    tripDateFrom: "22.07",
    tripDateTo: "31.07",
    status: "submitted_for_review",
    applicants: [
      {
        id: "app-main",
        fullName: "Иван Петров",
        role: "main",
        questionnaireStatus: "complete",
        fileStatus: "complete",
        sections: [
          {
            id: "app-main-personal",
            title: "Личные данные",
            status: "complete",
            fields: [
              {
                id: "first-name",
                label: "Имя",
                required: true,
                value: "Иван",
              },
            ],
          },
          {
            id: "app-main-passport",
            title: "Паспорт",
            status: "complete",
            fields: [
              {
                id: "passport-number",
                label: "Номер паспорта",
                required: true,
                value: "AA123456",
              },
            ],
          },
        ],
      },
      {
        id: "app-spouse",
        fullName: "Анна Петрова",
        role: "spouse",
        questionnaireStatus: "complete",
        fileStatus: "partial",
        sections: [
          {
            id: "app-spouse-personal",
            title: "Личные данные",
            status: "complete",
            fields: [
              {
                id: "first-name",
                label: "Имя",
                required: true,
                value: "Анна",
              },
            ],
          },
          {
            id: "app-spouse-contacts",
            title: "Адрес и контакты",
            status: "complete",
            fields: [
              {
                id: "home-address",
                label: "Домашний адрес",
                required: true,
                value: "Москва",
              },
            ],
          },
        ],
      },
    ],
    issues: [],
    files: [
      { id: "file-main-passport", applicantId: "app-main", type: "passport_scan", status: "accepted" },
      { id: "file-main-selfie", applicantId: "app-main", type: "selfie", status: "accepted" },
      { id: "file-main-selfie-2", applicantId: "app-main", type: "selfie_2", status: "accepted" },
      { id: "file-spouse-passport", applicantId: "app-spouse", type: "passport_scan", status: "accepted" },
      { id: "file-spouse-selfie", applicantId: "app-spouse", type: "selfie", status: "accepted" },
      { id: "file-spouse-selfie-2", applicantId: "app-spouse", type: "selfie_2", status: "missing" },
    ],
    completeness: { questionnaire: 100, files: 83, total: 92 },
    createdAt: "2026-06-27T09:00:00.000Z",
    updatedAt: "2026-06-27T10:02:00.000Z",
    history: [],
  };
}

type RenderReviewDrawerOptions = {
  activeTab?: React.ComponentProps<typeof SubmissionDrawer>["activeTab"];
  initialTarget?: React.ComponentProps<typeof SubmissionDrawer>["initialTarget"];
  issueComposerRequest?: React.ComponentProps<typeof SubmissionDrawer>["issueComposerRequest"];
  onAddIssue?: (input: IssueInput) => void;
  onIssueComposerConsumed?: () => void;
  onTab?: (tab: React.ComponentProps<typeof SubmissionDrawer>["activeTab"]) => void;
  submission?: Submission;
};

function reviewDrawerElement({
  activeTab = "overview",
  initialTarget = null,
  issueComposerRequest = null,
  onAddIssue = () => undefined,
  onIssueComposerConsumed = () => undefined,
  onTab = () => undefined,
  submission = adminReviewFamilySubmission(),
}: RenderReviewDrawerOptions = {}) {
  return (
    <SubmissionDrawer
      activeTab={activeTab}
      initialTarget={initialTarget}
      issueComposerRequest={issueComposerRequest}
      role="admin"
      submission={submission}
      surface="review"
      onAcceptAiSuggestion={() => undefined}
      onAction={() => undefined}
      onAddIssue={onAddIssue}
      onApplyPassportField={() => undefined}
      onClose={() => undefined}
      onConfirmVisaApplicationPdfReview={() => undefined}
      onDismissAiSuggestion={() => undefined}
      onDismissVisaApplicationPdfReview={() => undefined}
      onExtractPassport={() => undefined}
      onIssueComposerConsumed={onIssueComposerConsumed}
      onMarkIssueFixed={() => undefined}
      onPublishReturnedPdfHandoff={async () => undefined}
      onQuestionnaireField={() => undefined}
      onReviewVisaApplicationPdf={async () => undefined}
      onRunAiReview={() => undefined}
      onTab={onTab}
      onUploadFile={() => undefined}
    />
  );
}

function renderReviewDrawer(options: RenderReviewDrawerOptions = {}) {
  return render(reviewDrawerElement(options));
}

describe("SubmissionDrawer returned PDF handoff", () => {
  test("executes the admin publish action when the returned PDF package is ready", async () => {
    const onPublishReturnedPdfHandoff = vi.fn().mockResolvedValue(undefined);

    render(
      <SubmissionDrawer
        activeTab="files"
        issueComposerRequest={null}
        role="admin"
        submission={readyReturnedPdfSubmission()}
        surface="review"
        onAcceptAiSuggestion={() => undefined}
        onAction={() => undefined}
        onAddIssue={() => undefined}
        onApplyPassportField={() => undefined}
        onClose={() => undefined}
        onConfirmVisaApplicationPdfReview={() => undefined}
        onDismissAiSuggestion={() => undefined}
        onDismissVisaApplicationPdfReview={() => undefined}
        onExtractPassport={() => undefined}
        onIssueComposerConsumed={() => undefined}
        onMarkIssueFixed={() => undefined}
        onPublishReturnedPdfHandoff={onPublishReturnedPdfHandoff}
        onQuestionnaireField={() => undefined}
        onReviewVisaApplicationPdf={async () => undefined}
        onRunAiReview={() => undefined}
        onTab={() => undefined}
        onUploadFile={() => undefined}
      />,
    );

    const publishButton = screen.getByRole("button", {
      name: /Открыть агенту комплект PDF/,
    });
    expect(publishButton).not.toHaveAttribute("disabled");

    fireEvent.click(publishButton);

    await waitFor(() => {
      expect(onPublishReturnedPdfHandoff).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText("Комплект PDF опубликован агенту.")).toBeVisible();
  });
});

describe("SubmissionDrawer admin review targeting", () => {
  test("maps an initial selfie target to the selfie tab and selected family applicant", async () => {
    const onTab = vi.fn();

    renderReviewDrawer({
      initialTarget: {
        applicantId: "app-spouse",
        fileType: "selfie_2",
        tab: "files",
      },
      onTab,
    });

    await waitFor(() => {
      expect(onTab).toHaveBeenCalledWith("applicants");
    });
    expect(screen.getByRole("button", { name: /Анна Петрова/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("keeps selfie review blocked and targets selfie_2 when the second selfie is missing", async () => {
    const onAddIssue = vi.fn();

    renderReviewDrawer({
      activeTab: "applicants",
      initialTarget: {
        applicantId: "app-spouse",
        fileType: "selfie_2",
        tab: "files",
      },
      onAddIssue,
    });

    expect(await screen.findByText("Селфи не готово к проверке")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Замечание к Селфи N2" }));
    fireEvent.click(screen.getByRole("button", { name: "Создать замечание" }));

    await waitFor(() => {
      expect(onAddIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          applicantId: "app-spouse",
          fileType: "selfie_2",
          type: "file",
        }),
      );
    });
  });

  test("maps family and global questionnaire targets to a deterministic review group", async () => {
    const { rerender } = renderReviewDrawer({
      activeTab: "questionnaire",
      initialTarget: {
        applicantId: "app-main",
        section: "Семья",
        tab: "questionnaire",
      },
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Семья/ })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });

    rerender(
      <SubmissionDrawer
        activeTab="questionnaire"
        initialTarget={{
          applicantId: "app-main",
          section: "Вся подача",
          tab: "questionnaire",
        }}
        issueComposerRequest={null}
        role="admin"
        submission={adminReviewFamilySubmission()}
        surface="review"
        onAcceptAiSuggestion={() => undefined}
        onAction={() => undefined}
        onAddIssue={() => undefined}
        onApplyPassportField={() => undefined}
        onClose={() => undefined}
        onConfirmVisaApplicationPdfReview={() => undefined}
        onDismissAiSuggestion={() => undefined}
        onDismissVisaApplicationPdfReview={() => undefined}
        onExtractPassport={() => undefined}
        onIssueComposerConsumed={() => undefined}
        onMarkIssueFixed={() => undefined}
        onPublishReturnedPdfHandoff={async () => undefined}
        onQuestionnaireField={() => undefined}
        onReviewVisaApplicationPdf={async () => undefined}
        onRunAiReview={() => undefined}
        onTab={() => undefined}
        onUploadFile={() => undefined}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Семья/ })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });
  });

  test("keeps section and global contextual remarks scoped without field fallback", async () => {
    const onAddIssue = vi.fn();
    const { container } = renderReviewDrawer({
      activeTab: "questionnaire",
      onAddIssue,
    });

    fireEvent.click(screen.getByRole("button", { name: "Есть замечание" }));
    fireEvent.click(screen.getByRole("button", { name: "Создать замечание" }));

    await waitFor(() => {
      expect(onAddIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          field: undefined,
          section: "Личные данные",
          type: "section",
        }),
      );
    });

    onAddIssue.mockClear();
    const globalRemarkButton = container.querySelector(
      ".drawer-footer-context-action",
    ) as HTMLButtonElement | null;
    expect(globalRemarkButton).not.toBeNull();
    fireEvent.click(globalRemarkButton as HTMLButtonElement);
    fireEvent.click(screen.getByRole("button", { name: "Создать замечание" }));

    await waitFor(() => {
      expect(onAddIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          field: undefined,
          section: "Вся подача",
          type: "section",
        }),
      );
    });
  });

  test("uses the real passport section for synthetic document group remarks and target reopen", async () => {
    const onAddIssue = vi.fn();
    renderReviewDrawer({
      activeTab: "questionnaire",
      onAddIssue,
    });

    fireEvent.click(screen.getByRole("button", { name: /Документы/ }));
    fireEvent.click(screen.getByRole("button", { name: "Есть замечание" }));
    fireEvent.click(screen.getByRole("button", { name: "Создать замечание" }));

    await waitFor(() => {
      expect(onAddIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          field: undefined,
          section: "Паспорт",
          type: "section",
        }),
      );
    });

    const submission = adminReviewFamilySubmission();
    submission.issues = [
      {
        id: "issue-passport-section",
        type: "section",
        target: {
          applicantId: "app-main",
          applicantName: "Иван Петров",
          section: "Паспорт",
        },
        reason: "Анкета: Проверить раздел: Паспорт",
        comment: "Проверьте паспортные поля анкеты.",
        severity: "warning",
        status: "open",
        createdBy: "admin",
        createdAt: "2026-06-27T10:15:00.000Z",
      },
    ];

    cleanup();
    renderReviewDrawer({
      activeTab: "questionnaire",
      initialTarget: {
        applicantId: "app-main",
        section: "Паспорт",
        tab: "questionnaire",
      },
      submission,
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Документы/ })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });
    expect(screen.getByText("1 полей · проверено 1 · замечаний 1")).toBeVisible();
  });

  test("clears contextual composer state when Escape closes before a generic reopen", async () => {
    const submission = adminReviewFamilySubmission();
    const onAddIssue = vi.fn();
    const onIssueComposerConsumed = vi.fn();
    const { container, rerender } = renderReviewDrawer({
      activeTab: "questionnaire",
      onAddIssue,
      onIssueComposerConsumed,
      submission,
    });

    fireEvent.click(screen.getByRole("button", { name: "Есть замечание" }));
    expect(await screen.findByText("Контекст")).toBeVisible();

    const drawer = container.querySelector(".submission-drawer") as HTMLElement | null;
    expect(drawer).not.toBeNull();
    fireEvent.keyDown(drawer as HTMLElement, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByText("Контекст")).toBeNull();
    });

    rerender(
      reviewDrawerElement({
        activeTab: "questionnaire",
        issueComposerRequest: {
          submissionId: submission.id,
          token: 1,
        },
        onAddIssue,
        onIssueComposerConsumed,
        submission,
      }),
    );

    await waitFor(() => {
      expect(onIssueComposerConsumed).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText("Контекст")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Создать замечание" }));

    await waitFor(() => {
      expect(onAddIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          field: "Имя",
          section: "Данные",
          type: "field",
        }),
      );
    });
  });

  test("keeps section acceptance disabled without a real handler", () => {
    renderReviewDrawer({ activeTab: "questionnaire" });

    const acceptSectionButton = screen.getByRole("button", {
      name: "Принять секцию",
    });
    expect(acceptSectionButton).toHaveAttribute("disabled");
    expect(acceptSectionButton).toHaveAttribute(
      "title",
      "Секционное принятие пока не поддержано текущими handlers.",
    );
  });
});

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  buildAppointmentPdfStorageTarget,
  buildVisaApplicationPdfStorageTarget,
  mediaStorageBucket,
} from "../../src/modules/submissions/mediaStorage";
import { SubmissionDrawer } from "../../src/modules/submissions/components/SubmissionDrawer";
import { buildExportPackageIdentity } from "../../src/modules/submissions/exportRules";
import type { Submission } from "../../src/modules/submissions/types";

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
  const applicationTarget = buildVisaApplicationPdfStorageTarget({
    applicantId,
    sha256: applicationSha,
    submissionId,
  });
  const appointmentTarget = buildAppointmentPdfStorageTarget({
    sha256: appointmentSha,
    submissionId,
  });

  const submission: Submission = {
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

  const exportPackage = buildExportPackageIdentity([submission]);
  if (!exportPackage) throw new Error("Expected export package identity.");

  return {
    ...submission,
    exportPackage,
  };
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

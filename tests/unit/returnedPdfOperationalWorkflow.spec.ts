import { describe, expect, test } from "vitest";
import {
  buildAgentHandoffPackage,
  buildReturnedPdfAgentHandoffGate,
  type ReturnedPdfArtifact,
} from "../../src/modules/submissions/operationalWorkflow";
import { buildExportPackageIdentity } from "../../src/modules/submissions/exportRules";
import { initialSubmissions } from "../../src/modules/submissions/mockData";
import {
  buildAppointmentPdfStorageTarget,
  buildVisaApplicationPdfStorageTarget,
} from "../../src/modules/submissions/mediaStoragePolicy";
import type {
  Submission,
  VisaApplicationPdfReviewState,
} from "../../src/modules/submissions/types";

describe("returned PDF operational handoff gate", () => {
  test("blocks mixed-agent appointment list handoff until package is split or scoped", () => {
    const primary = exportedSubmission("ПД-1056", "local-agent-tony");
    const secondary = {
      ...exportedSubmission("ПД-1056", "local-agent-partner"),
      exportPackage: primary.exportPackage,
      id: "ПД-MIXED-PDF",
      title: "Mixed agent package member",
    };
    const cleanPrimary = {
      ...primary,
      visaApplicationPdfReviews: [cleanApplicationPdfReview(primary)],
    };
    const appointmentPdf = appointmentPdfArtifact(primary);

    expect(
      buildAgentHandoffPackage(cleanPrimary, {
        commonAppointmentPdf: appointmentPdf,
      }).ready,
    ).toBe(true);
    expect(
      buildReturnedPdfAgentHandoffGate(
        cleanPrimary,
        [cleanPrimary, secondary],
        { commonAppointmentPdf: appointmentPdf },
      ),
    ).toMatchObject({
      ready: false,
      mappings: [],
      blockers: expect.arrayContaining([
        "Mixed-agent appointment list PDF is admin-only until the export package is split or scoped.",
      ]),
    });
  });
});

function exportedSubmission(id: string, agentId: string): Submission {
  const source = initialSubmissions.find((submission) => submission.id === id);
  if (!source) throw new Error(`Missing fixture ${id}`);
  const submission = {
    ...source,
    agentId,
    exportState: "marked_exported" as const,
    status: "exported" as const,
  };
  const exportPackage = buildExportPackageIdentity([submission], "xlsx");

  return {
    ...submission,
    exportPackage: exportPackage ?? undefined,
  };
}

function cleanApplicationPdfReview(
  submission: Submission,
): VisaApplicationPdfReviewState {
  const applicant = submission.applicants[0];
  if (!applicant) throw new Error("Missing applicant.");
  const sha256 = "b".repeat(64);
  const storageTarget = buildVisaApplicationPdfStorageTarget({
    applicantId: applicant.id,
    sha256,
    submissionId: submission.id,
  });

  return {
    applicantId: applicant.id,
    applicantName: applicant.fullName,
    artifact: {
      fileName: "778194570_application.pdf",
      mimeType: "application/pdf",
      sha256,
      sizeBytes: 32_000,
      storageBucket: storageTarget.bucket,
      storagePath: storageTarget.path,
      uploadStatus: "uploaded",
      uploadedAtIso: "2026-06-29T08:00:00.000Z",
    },
    checkedAtIso: "2026-06-29T08:01:00.000Z",
    data: {
      passportNumber: "778194570",
    },
    fileName: "778194570_application.pdf",
    findings: [],
    handoffStatus: "ready_for_agent",
    id: `visa-pdf-${submission.id}`,
    status: "clear",
  };
}

function appointmentPdfArtifact(submission: Submission): ReturnedPdfArtifact {
  const sha256 = "a".repeat(64);
  const storageTarget = buildAppointmentPdfStorageTarget({
    sha256,
    submissionId: submission.id,
  });

  return {
    fileName: "778194570_appointment.pdf",
    mimeType: "application/pdf",
    sha256,
    sizeBytes: 24_000,
    storageBucket: storageTarget.bucket,
    storagePath: storageTarget.path,
    uploadStatus: "uploaded",
    uploadedAtIso: "2026-06-29T08:02:00.000Z",
  };
}

import { describe, expect, test } from "vitest";
import { buildIdentityConsistencyReport } from "../../src/modules/submissions/identityConsistency";
import {
  applySafePassportExtractionFields,
  finishPassportExtraction,
} from "../../src/modules/submissions/passportExtraction";
import {
  createDraftSubmission,
  uploadRequiredFiles,
} from "../../src/modules/submissions/submissionActions";
import type { PassportExtractionResult } from "../../src/modules/submissions/passportExtractionContract";
import type {
  Submission,
  VisaApplicationPdfReviewState,
} from "../../src/modules/submissions/types";
import { fillRequiredQuestionnaireForTest } from "./helpers/questionnaireTestFill";

function baseSubmission(): Submission {
  return uploadRequiredFiles(
    fillRequiredQuestionnaireForTest(
      createDraftSubmission({
        applicantNames: ["Мария Иванова"],
        city: "Москва",
        familyCount: 1,
        idScheme: "supabase",
        submissions: [],
        type: "single",
      }),
    ),
  );
}

function withVisaPdfReview(
  submission: Submission,
  data: VisaApplicationPdfReviewState["data"],
  status: VisaApplicationPdfReviewState["status"] = "clear",
): Submission {
  const applicant = submission.applicants[0];
  if (!applicant) throw new Error("expected applicant");

  const review: VisaApplicationPdfReviewState = {
    applicantId: applicant.id,
    applicantName: applicant.fullName,
    checkedAtIso: "2026-07-01T12:00:00.000Z",
    data,
    findings: [],
    handoffStatus: status === "clear" ? "ready_for_agent" : "blocked",
    id: `pdf-review-${applicant.id}`,
    status,
  };

  return {
    ...submission,
    visaApplicationPdfReview: review,
    visaApplicationPdfReviews: [review],
  };
}

describe("identity consistency report", () => {
  test("does not reopen a persisted confirmed passport review", () => {
    const submission = baseSubmission();
    const applicant = submission.applicants[0];
    const passportFile = submission.files.find(
      (file) => file.applicantId === applicant?.id && file.type === "passport_scan",
    );
    if (!applicant || !passportFile) throw new Error("expected passport fixture");
    const extraction: PassportExtractionResult = {
      fields: [
        {
          confidence: "high",
          key: "passportNumber",
          needsManualReview: true,
          value: "765432100",
        },
      ],
      guardrails: [],
      source: "local-ocr",
      status: "extracted",
      summary: "Паспортные данные подготовлены.",
    };
    const applied = applySafePassportExtractionFields(
      finishPassportExtraction(submission, passportFile, extraction),
      applicant.id,
    );
    const persisted: Submission = {
      ...applied,
      applicants: applied.applicants.map((candidate) => ({
        ...candidate,
        passportExtraction: candidate.passportExtraction
          ? {
              ...candidate.passportExtraction,
              verifiedAtIso: undefined,
            }
          : undefined,
        sections: candidate.sections.map((section) => ({
          ...section,
          fields: section.fields.map((field) =>
            field.reviewOriginSource === "passport_ocr"
              ? {
                  ...field,
                  reviewConfirmedAtIso: "2026-07-24T08:00:00.000Z",
                  reviewConfirmedBy: "agent-reviewer",
                  reviewSource: "manual" as const,
                  reviewState: "confirmed" as const,
                }
              : field,
          ),
        })),
      })),
    };

    const report = buildIdentityConsistencyReport(persisted);

    expect(
      report.findings.some((finding) => finding.code === "passport_ocr_unverified"),
    ).toBe(false);
  });

  test("blocks when questionnaire and PDF/passport disagree on passport number", () => {
    const submission = withVisaPdfReview(baseSubmission(), {
      passportNumber: "990000001",
    });
    const applicant = submission.applicants[0];
    if (!applicant) throw new Error("expected applicant");
    const withPassportOcr: Submission = {
      ...submission,
      applicants: [
        {
          ...applicant,
          passportExtraction: {
            appliedFieldKeys: [],
            extractedFields: [
              {
                confidence: "high",
                key: "passportNumber",
                needsManualReview: true,
                source: "passport_scan",
                value: "990000001",
              },
            ],
            status: "ready",
          },
        },
      ],
    };

    const report = buildIdentityConsistencyReport(withPassportOcr);

    expect(report.status).toBe("blocked");
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "identity_source_mismatch",
          field: "passportNumber",
          severity: "critical",
        }),
      ]),
    );
    expect(report.nextActions[0]).toContain("Номер паспорта");
  });

  test("accepts equivalent date formats between questionnaire and PDF", () => {
    const submission = withVisaPdfReview(baseSubmission(), {
      birthDate: "1990-08-20",
    });

    const report = buildIdentityConsistencyReport(submission);

    expect(report.findings.some((finding) => finding.field === "birthDate")).toBe(
      false,
    );
  });
});

import { describe, expect, test } from "vitest";
import { buildIdentityConsistencyReport } from "../../src/modules/submissions/identityConsistency";
import {
  completeQuestionnaire,
  createDraftSubmission,
  uploadRequiredFiles,
} from "../../src/modules/submissions/submissionActions";
import type { Submission, VisaApplicationPdfReviewState } from "../../src/modules/submissions/types";

function baseSubmission(): Submission {
  return uploadRequiredFiles(
    completeQuestionnaire(
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
      birthDate: "1990-01-01",
    });

    const report = buildIdentityConsistencyReport(submission);

    expect(report.findings.some((finding) => finding.field === "birthDate")).toBe(
      false,
    );
  });
});

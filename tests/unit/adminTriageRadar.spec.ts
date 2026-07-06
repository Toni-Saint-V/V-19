import { describe, expect, test } from "vitest";
import { buildAdminTriageRadar } from "../../src/modules/submissions/adminTriageRadar";
import {
  createDraftSubmission,
  uploadRequiredFiles,
} from "../../src/modules/submissions/submissionActions";
import type { Submission, VisaApplicationPdfReviewState } from "../../src/modules/submissions/types";
import { fillRequiredQuestionnaireForTest } from "./helpers/questionnaireTestFill";

function readySubmission(idOffset = 0): Submission {
  const draft = createDraftSubmission({
    applicantNames: [`Мария Иванова ${idOffset}`],
    city: "Москва",
    familyCount: 1,
    idScheme: "supabase",
    submissions: [],
    type: "single",
  });

  return {
    ...uploadRequiredFiles(fillRequiredQuestionnaireForTest(draft)),
    id: `ПД-${2000 + idOffset}`,
    status: "submitted_for_review",
    updatedAt: `15.0${idOffset + 1}`,
  };
}

function withBlockingIdentitySignal(submission: Submission): Submission {
  const applicant = submission.applicants[0];
  if (!applicant) throw new Error("expected applicant");
  const review: VisaApplicationPdfReviewState = {
    applicantId: applicant.id,
    applicantName: applicant.fullName,
    checkedAtIso: "2026-07-01T12:00:00.000Z",
    data: {
      passportNumber: "990000001",
    },
    findings: [],
    handoffStatus: "ready_for_agent",
    id: `pdf-review-${applicant.id}`,
    status: "clear",
  };

  return {
    ...submission,
    visaApplicationPdfReview: review,
    visaApplicationPdfReviews: [review],
  };
}

describe("admin triage radar", () => {
  test("raises identity conflicts above ordinary submitted cases", () => {
    const ordinary = readySubmission(1);
    const identityConflict = withBlockingIdentitySignal(readySubmission(2));

    const radar = buildAdminTriageRadar([ordinary, identityConflict]);

    expect(radar.items[0]).toMatchObject({
      band: "critical",
      identityStatus: "blocked",
      submissionId: identityConflict.id,
    });
    expect(radar.items[0]?.nextAction).toContain("Сверить");
  });

  test("keeps exported cases in done band after active work", () => {
    const active = withBlockingIdentitySignal(readySubmission(3));
    const exported: Submission = {
      ...readySubmission(4),
      status: "exported",
    };

    const radar = buildAdminTriageRadar([exported, active]);

    expect(radar.items.at(-1)).toMatchObject({
      band: "done",
      submissionId: exported.id,
    });
  });
});

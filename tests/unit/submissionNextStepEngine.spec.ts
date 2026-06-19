import { describe, expect, test } from "vitest";
import { applySubmissionAction } from "../../src/modules/submissions/status";
import {
  finishPassportExtraction,
  startPassportExtraction,
} from "../../src/modules/submissions/passportExtraction";
import {
  completeQuestionnaire,
  createDraftSubmission,
  updateQuestionnaireField,
  uploadRequiredFiles,
} from "../../src/modules/submissions/submissionActions";
import { buildSubmissionNextStepBrief } from "../../src/modules/submissions/submissionNextStepEngine";
import type { PassportExtractionResult } from "../../src/modules/submissions/passportExtractionContract";
import type { Issue, Submission } from "../../src/modules/submissions/types";

const forbiddenTrustCopy =
  /approved|guaranteed|officially verified|approval odds|visa odds|одобрен|гарантир|официально провер|шанс[а-я\s]+визы/i;

const extractedPassport: PassportExtractionResult = {
  fields: [
    {
      confidence: "high",
      key: "passportNumber",
      needsManualReview: true,
      value: "765432100",
    },
    {
      confidence: "medium",
      key: "surname",
      needsManualReview: true,
      value: "IVANOVA",
    },
  ],
  guardrails: [],
  source: "local-ocr",
  status: "extracted",
  summary: "Локальный OCR нашёл 2 поля MRZ.",
};

function draftSubmission(): Submission {
  return createDraftSubmission({
    applicantNames: ["Мария Иванова"],
    city: "Москва",
    familyCount: 1,
    idScheme: "supabase",
    submissions: [],
    type: "single",
  });
}

function passportFile(submission: Submission) {
  const file = submission.files.find((item) => item.type === "passport_scan");
  if (!file) throw new Error("expected passport slot");
  return file;
}

function applicantId(submission: Submission) {
  const id = submission.applicants[0]?.id;
  if (!id) throw new Error("expected applicant");
  return id;
}

function sectionIdForField(submission: Submission, fieldId: string) {
  const section = submission.applicants[0]?.sections.find((item) =>
    item.fields.some((field) => field.id === fieldId),
  );
  if (!section) throw new Error(`expected section for ${fieldId}`);
  return section.id;
}

function readyForReviewSubmission(): Submission {
  const draft = draftSubmission();
  return {
    ...uploadRequiredFiles(completeQuestionnaire(draft)),
    status: "in_progress",
  };
}

function visibleCopy(brief: ReturnType<typeof buildSubmissionNextStepBrief>) {
  return [
    brief.title,
    brief.summary,
    brief.primaryAction.label,
    ...brief.blockers,
    ...brief.actions,
    ...brief.guardrails,
  ].join(" ");
}

describe("submission next-step engine", () => {
  test("prioritizes safe passport field application before submit handoff", () => {
    const draft = draftSubmission();
    const withPassport = finishPassportExtraction(draft, passportFile(draft), extractedPassport);

    const brief = buildSubmissionNextStepBrief({
      role: "agent",
      submission: withPassport,
      surface: "agent",
    });

    expect(brief.primaryAction).toMatchObject({
      id: "apply_passport_fields",
      kind: "passport_review",
      target: {
        applicantId: applicantId(withPassport),
        field: "Номер паспорта",
        tab: "data",
      },
    });
    expect(brief.primaryAction.label).toContain("Примените");
    expect(visibleCopy(brief)).not.toMatch(forbiddenTrustCopy);
  });

  test("prioritizes passport conflicts over queue and lifecycle actions", () => {
    const draft = draftSubmission();
    const withExistingPassport = updateQuestionnaireField(draft, {
      applicantId: applicantId(draft),
      fieldId: "passport-no",
      sectionId: sectionIdForField(draft, "passport-no"),
      value: "OLD-PASSPORT",
    });
    const withPassport = finishPassportExtraction(
      withExistingPassport,
      passportFile(draft),
      extractedPassport,
    );

    const brief = buildSubmissionNextStepBrief({
      role: "agent",
      submission: withPassport,
      surface: "agent",
    });

    expect(brief.status).toBe("blocked");
    expect(brief.primaryAction).toMatchObject({
      id: "resolve_passport_conflicts",
      kind: "passport_review",
      target: {
        field: "Номер паспорта",
        tab: "data",
      },
    });
    expect(brief.primaryAction.label).toContain("конфликт");
  });

  test("waits when passport extraction is still running", () => {
    const draft = draftSubmission();
    const extracting = startPassportExtraction(draft, passportFile(draft));

    const brief = buildSubmissionNextStepBrief({
      role: "agent",
      submission: extracting,
      surface: "agent",
    });

    expect(brief.status).toBe("waiting");
    expect(brief.primaryAction).toMatchObject({
      id: "wait_passport_extraction",
      kind: "wait",
    });
  });

  test("opens the first actionable queue target before generic lifecycle action", () => {
    const ready = readyForReviewSubmission();
    const issue: Issue = {
      id: "issue-email",
      type: "field",
      target: {
        applicantId: applicantId(ready),
        applicantName: "Мария Иванова",
        section: "Анкета",
        field: "Email",
      },
      reason: "Email требует проверки",
      comment: "Введите корректный email.",
      severity: "blocker",
      status: "open",
      createdBy: "admin",
      createdAt: "сейчас",
    };

    const brief = buildSubmissionNextStepBrief({
      role: "agent",
      submission: { ...ready, issues: [issue] },
      surface: "agent",
    });

    expect(brief.primaryAction).toMatchObject({
      id: "open_first_queue_item",
      kind: "navigate_target",
      target: {
        field: "Email",
        tab: "data",
      },
    });
  });

  test("returns submit action for a clean in-progress agent package", () => {
    const ready = readyForReviewSubmission();

    const brief = buildSubmissionNextStepBrief({
      role: "agent",
      submission: ready,
      surface: "agent",
    });

    expect(brief.status).toBe("ready_for_action");
    expect(brief.primaryAction).toMatchObject({
      kind: "submission_action",
      submissionAction: "submit_for_review",
    });
  });

  test("returns admin accept and export actions from lifecycle state", () => {
    const submitted = applySubmissionAction(readyForReviewSubmission(), "submit_for_review", "agent");
    const adminReview = buildSubmissionNextStepBrief({
      role: "admin",
      submission: submitted,
      surface: "review",
    });
    const exportBrief = buildSubmissionNextStepBrief({
      role: "admin",
      submission: {
        ...submitted,
        exportState: "ready",
        status: "ready_for_export",
      },
      surface: "export",
    });

    expect(adminReview.primaryAction).toMatchObject({
      kind: "submission_action",
      submissionAction: "accept",
    });
    expect(exportBrief.primaryAction).toMatchObject({
      kind: "submission_action",
      submissionAction: "generate_export",
    });
  });
});

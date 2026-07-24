import { describe, expect, test } from "vitest";
import { applySubmissionAction } from "../../src/modules/submissions/status";
import {
  applySafePassportExtractionFields,
  finishPassportExtraction,
  startPassportExtraction,
} from "../../src/modules/submissions/passportExtraction";
import {
  createDraftSubmission,
  updateQuestionnaireField,
  uploadRequiredFiles,
} from "../../src/modules/submissions/submissionActions";
import { buildSubmissionNextStepBrief } from "../../src/modules/submissions/submissionNextStepEngine";
import type { PassportExtractionResult } from "../../src/modules/submissions/passportExtractionContract";
import type { Issue, Submission } from "../../src/modules/submissions/types";
import {
  adminAcceptRequiredMediaForTest,
  adminApprovePassportFieldsForTest,
  fillRequiredQuestionnaireForTest,
} from "./helpers/questionnaireTestFill";

const forbiddenTrustCopy =
  /approved|guaranteed|officially verified|approval odds|visa odds|одобрен|гарантир|официально провер|ш[а]нс[а-я\s]+визы/i;

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
    ...uploadRequiredFiles(fillRequiredQuestionnaireForTest(draft)),
    status: "in_progress",
    tripDateFrom: "2026-07-10",
    tripDateTo: "2026-07-18",
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
    const withPassport = finishPassportExtraction(
      draft,
      passportFile(draft),
      extractedPassport,
    );

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
        field: "passport-no",
        tab: "questionnaire",
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
        field: "passport-no",
        tab: "questionnaire",
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

  test("does not repeat passport review after confirmed OCR fields survive without aggregate metadata", () => {
    const draft = draftSubmission();
    const withPassport = finishPassportExtraction(
      draft,
      passportFile(draft),
      extractedPassport,
    );
    const applied = applySafePassportExtractionFields(
      withPassport,
      applicantId(withPassport),
    );
    const persisted = {
      ...applied,
      applicants: applied.applicants.map((applicant) => ({
        ...applicant,
        passportExtraction: applicant.passportExtraction
          ? {
              ...applicant.passportExtraction,
              verifiedAtIso: undefined,
            }
          : undefined,
        sections: applicant.sections.map((section) => ({
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

    const brief = buildSubmissionNextStepBrief({
      role: "agent",
      submission: persisted,
      surface: "agent",
    });

    expect(brief.primaryAction.id).not.toBe("verify_passport_review");
    expect(brief.primaryAction.kind).not.toBe("passport_review");
    expect(visibleCopy(brief)).not.toContain(
      "Подтвердите ручную проверку паспортных данных",
    );
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
        tab: "questionnaire",
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
    const submitted = adminAcceptRequiredMediaForTest(
      adminApprovePassportFieldsForTest(
        applySubmissionAction(
          readyForReviewSubmission(),
          "submit_for_review",
          "agent",
        ),
      ),
    );
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

  test("treats agent submitted review as waiting for admin, not an action", () => {
    const submitted = applySubmissionAction(
      readyForReviewSubmission(),
      "submit_for_review",
      "agent",
    );

    const brief = buildSubmissionNextStepBrief({
      role: "agent",
      submission: submitted,
      surface: "agent",
    });

    expect(brief.status).toBe("waiting");
    expect(brief.owner).toBe("admin");
    expect(brief.primaryAction).toMatchObject({
      disabled: true,
      id: "wait_admin_review",
      kind: "wait",
    });
    expect(visibleCopy(brief)).not.toMatch(forbiddenTrustCopy);
  });

  test("keeps agent waiting after review handoff even when passport rows need review", () => {
    const ready = readyForReviewSubmission();
    const withExistingPassport = updateQuestionnaireField(ready, {
      applicantId: applicantId(ready),
      fieldId: "passport-no",
      sectionId: sectionIdForField(ready, "passport-no"),
      value: "OLD-PASSPORT",
    });
    const submitted = applySubmissionAction(
      withExistingPassport,
      "submit_for_review",
      "agent",
    );
    const withPassport = finishPassportExtraction(
      submitted,
      passportFile(submitted),
      extractedPassport,
    );

    const brief = buildSubmissionNextStepBrief({
      role: "agent",
      submission: withPassport,
      surface: "agent",
    });

    expect(brief.status).toBe("waiting");
    expect(brief.owner).toBe("admin");
    expect(brief.primaryAction).toMatchObject({
      disabled: true,
      id: "wait_admin_review",
      kind: "wait",
    });
  });

  test("keeps agent waiting after review handoff even when queue blockers exist", () => {
    const ready = readyForReviewSubmission();
    const submitted = applySubmissionAction(ready, "submit_for_review", "agent");
    const issue: Issue = {
      id: "issue-email-after-handoff",
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
      submission: { ...submitted, issues: [issue] },
      surface: "agent",
    });

    expect(brief.status).toBe("waiting");
    expect(brief.owner).toBe("admin");
    expect(brief.primaryAction).toMatchObject({
      disabled: true,
      id: "wait_admin_review",
      kind: "wait",
    });
  });

  test("treats agent correction review as waiting for admin", () => {
    const brief = buildSubmissionNextStepBrief({
      role: "agent",
      submission: { ...readyForReviewSubmission(), status: "corrections_received" },
      surface: "agent",
    });

    expect(brief.status).toBe("waiting");
    expect(brief.owner).toBe("admin");
    expect(brief.primaryAction).toMatchObject({
      disabled: true,
      id: "wait_admin_corrections_review",
      kind: "wait",
    });
  });

  test("treats accepted package as waiting for admin export on agent surface", () => {
    const brief = buildSubmissionNextStepBrief({
      role: "agent",
      submission: {
        ...readyForReviewSubmission(),
        exportState: "ready",
        status: "ready_for_export",
      },
      surface: "agent",
    });

    expect(brief.status).toBe("waiting");
    expect(brief.owner).toBe("admin");
    expect(brief.primaryAction).toMatchObject({
      disabled: true,
      id: "wait_admin_export",
      kind: "wait",
    });
  });

  test("blocks corrected acceptance for a fixed issue outside passport scope", () => {
    const ready = adminAcceptRequiredMediaForTest(
      adminApprovePassportFieldsForTest(readyForReviewSubmission()),
    );
    const fixedIssue: Issue = {
      id: "issue-fixed-email",
      type: "field",
      target: {
        applicantId: applicantId(ready),
        applicantName: "Мария Иванова",
        section: "Анкета",
        field: "Email",
      },
      reason: "Email исправлен агентом",
      comment: "Проверьте новое значение.",
      severity: "blocker",
      status: "fixed_by_agent",
      createdBy: "admin",
      createdAt: "сейчас",
    };

    const brief = buildSubmissionNextStepBrief({
      role: "admin",
      submission: {
        ...ready,
        issues: [fixedIssue],
        status: "corrections_received",
      },
      surface: "review",
    });

    expect(brief.status).toBe("blocked");
    expect(brief.owner).toBe("admin");
    expect(brief.blockers).not.toContain("1 исправлений ждут закрытия администратором");
    expect(brief.primaryAction).toMatchObject({
      disabled: true,
      kind: "none",
      reason: "Есть исправленные замечания вне паспортной проверки",
      submissionAction: "close_issues_accept",
    });
  });
});

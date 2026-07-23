import { describe, expect, it } from "vitest";
import { buildExportPackageIdentity } from "../../src/modules/submissions/exportRules";
import {
  acceptSubmission,
  closeIssue,
  createDraft,
  generateExport,
  getCompleteness,
  getDefaultDrawerTab,
  getFileState,
  getNextAction,
  getOpenIssues,
  getOperationalBucket,
  getRequiresAction,
  markExported,
  markIssueFixed,
  resubmitCorrections,
  returnWithIssues,
  submitForReview,
  updateSubmission,
} from "../../src/modules/submissions/domainEngine";
import { initialSubmissions } from "../../src/modules/submissions/mockData";
import {
  applySubmissionAction,
  canAdminApproveForExport,
  canAgentSubmitForReview,
  canPerformAction,
  hasRequiredDocuments,
  transitionSubmissionStatus,
} from "../../src/modules/submissions/status";
import { reviewHandoffPersistenceIssues } from "../../src/modules/submissions/supabasePersistence";
import type {
  CommandResult,
  IssueInput,
  Submission,
} from "../../src/modules/submissions/types";
import {
  adminAcceptRequiredMediaForTest,
  adminApprovePassportFieldsForTest,
  fillRequiredQuestionnaireForTest,
} from "./helpers/questionnaireTestFill";

function byId(id: string): Submission {
  const submission = initialSubmissions.find((item) => item.id === id);
  if (!submission) throw new Error(`Missing fixture ${id}`);
  return structuredClone(submission);
}

function canonicalMediaSubmission(submission: Submission): Submission {
  return {
    ...submission,
    files: submission.files.filter(
      (file) =>
        file.type === "passport_scan" ||
        file.type === "selfie" ||
        file.type === "selfie_2",
    ),
  };
}

function unwrap<T>(result: CommandResult<T>): T {
  if (!result.ok) throw new Error(result.error.code);
  return result.data;
}

function firstIssueInput(submission: Submission): IssueInput {
  const applicant = submission.applicants[0];
  if (!applicant) throw new Error("Missing applicant");

  return {
    applicantId: applicant.id,
    comment: "Нужно уточнить маршрут поездки.",
    field: "Маршрут поездки",
    reason: "Маршрут не конкретен",
    section: "Анкета",
    severity: "blocker",
    type: "field",
  };
}

function changeRouteIssueTarget(
  submission: Submission,
  value = "Madrid, Barcelona, Madrid",
): Submission {
  return {
    ...submission,
    applicants: submission.applicants.map((applicant) => ({
      ...applicant,
      sections: applicant.sections.map((section) => ({
        ...section,
        fields: section.fields.map((field) =>
          field.id === "first-entry-country" ? { ...field, value } : field,
        ),
      })),
    })),
  };
}

function completeInProgressSubmission(): Submission {
  return adminAcceptRequiredMediaForTest(
    adminApprovePassportFieldsForTest({
      ...fillRequiredQuestionnaireForTest(canonicalMediaSubmission(byId("ПД-1056"))),
      status: "in_progress",
      exportState: "not_ready",
    }),
  );
}

describe("V-19 domain engine", () => {
  it("creates only single/family Spain submissions with derived completeness", () => {
    const draft = unwrap(
      createDraft({
        city: "Москва",
        familyCount: 1,
        submissions: [],
        type: "single",
      }),
    );

    expect(draft.type).toBe("single");
    expect(draft.country).toBe("Испания");
    expect(draft.countryCode).toBe("ES");
    expect(draft.status).toBe("draft");
    expect(draft.completeness).toEqual(getCompleteness(draft));
  });

  it("keeps agent and admin command ownership separated", () => {
    const ready = completeInProgressSubmission();

    expect(updateSubmission(ready, "admin", { city: "Казань" })).toEqual({
      ok: false,
      error: {
        code: "PERMISSION_DENIED",
        message: "Admin cannot edit agent-owned submission data.",
      },
    });
    expect(submitForReview(ready, "admin")).toEqual({
      ok: false,
      error: { code: "PERMISSION_DENIED", message: "Only agent can submit." },
    });
    expect(returnWithIssues(ready, "agent", [firstIssueInput(ready)])).toEqual({
      ok: false,
      error: {
        code: "PERMISSION_DENIED",
        message: "Only admin can return with issues.",
      },
    });
    expect(acceptSubmission(ready, "agent")).toEqual({
      ok: false,
      error: {
        code: "PERMISSION_DENIED",
        message: "Only admin can accept submissions.",
      },
    });
  });

  it("submits only complete in-progress submissions and ignores stale persisted completeness", () => {
    const stale = {
      ...completeInProgressSubmission(),
      completeness: { questionnaire: 0, files: 0, total: 0 },
    };

    const submitted = unwrap(submitForReview(stale, "agent"));

    expect(submitted.status).toBe("submitted_for_review");
    expect(submitted.completeness.total).toBe(100);
  });

  it("blocks submission when derived questionnaire or file completeness is incomplete", () => {
    const incomplete = {
      ...completeInProgressSubmission(),
      files: completeInProgressSubmission().files.map((file, index) =>
        index === 0 ? { ...file, status: "missing" as const } : file,
      ),
      completeness: { questionnaire: 100, files: 100, total: 100 },
    };

    expect(submitForReview(incomplete, "agent")).toEqual({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Questionnaire and files must be complete.",
      },
    });
  });

  it("keeps acceptance fail-closed while any required questionnaire field is incomplete", () => {
    const readyForReview: Submission = {
      ...completeInProgressSubmission(),
      status: "submitted_for_review",
    };
    const incompleteQuestionnaire: Submission = {
      ...readyForReview,
      applicants: readyForReview.applicants.map((applicant) => ({
        ...applicant,
        sections: applicant.sections.map((section) => ({
          ...section,
          fields: section.fields.map((field) =>
            field.id === "hotel-name" ? { ...field, value: "" } : field,
          ),
        })),
      })),
    };

    expect(canAdminApproveForExport(incompleteQuestionnaire)).toBe(false);
    const accepted = acceptSubmission(incompleteQuestionnaire, "admin");
    expect(accepted).toEqual({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Questionnaire and files must be complete.",
      },
    });
    expect(incompleteQuestionnaire.status).toBe("submitted_for_review");
  });

  it("fails closed outside the canonical issue correction and review stages", () => {
    const submitted = {
      ...completeInProgressSubmission(),
      status: "submitted_for_review" as const,
    };
    const returned = unwrap(
      returnWithIssues(submitted, "admin", [firstIssueInput(submitted)]),
    );
    const issueId = returned.issues[0]?.id;
    if (!issueId) throw new Error("Missing issue");

    expect(markIssueFixed(returned, "agent", issueId)).toEqual({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Issue target must be corrected before it can be marked fixed.",
      },
    });

    const corrected = changeRouteIssueTarget(returned);
    expect(
      markIssueFixed(
        { ...corrected, status: "submitted_for_review" },
        "agent",
        issueId,
      ),
    ).toEqual({
      ok: false,
      error: {
        code: "INVALID_TRANSITION",
        message: "Issues can be marked fixed only after admin return.",
      },
    });

    const fixed = unwrap(markIssueFixed(corrected, "agent", issueId));
    expect(closeIssue(fixed, "admin", issueId)).toEqual({
      ok: false,
      error: {
        code: "INVALID_TRANSITION",
        message: "Issues can be closed only during corrections review.",
      },
    });
  });

  it("runs issue lifecycle open to fixed_by_agent to closed_by_admin", () => {
    const submitted = {
      ...completeInProgressSubmission(),
      status: "submitted_for_review" as const,
    };
    const returned = unwrap(
      returnWithIssues(submitted, "admin", [firstIssueInput(submitted)]),
    );
    const issueId = returned.issues[0]?.id;
    if (!issueId) throw new Error("Missing issue");

    expect(returned.status).toBe("returned");
    expect(returned.issues[0]?.status).toBe("open");
    expect(resubmitCorrections(returned, "agent")).toEqual({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Open issues must be fixed before resubmission.",
      },
    });

    const fixed = unwrap(
      markIssueFixed(changeRouteIssueTarget(returned), "agent", issueId),
    );
    expect(fixed.issues[0]?.status).toBe("fixed_by_agent");

    const resubmitted = unwrap(resubmitCorrections(fixed, "agent"));
    expect(resubmitted.status).toBe("corrections_received");
    expect(acceptSubmission(resubmitted, "admin")).toEqual({
      ok: false,
      error: {
        code: "ACCEPTANCE_BLOCKED",
        message: "Acceptance is blocked until all issues are closed by admin.",
      },
    });

    const closed = unwrap(closeIssue(resubmitted, "admin", issueId));
    expect(closed.issues[0]?.status).toBe("closed_by_admin");
    expect(unwrap(acceptSubmission(closed, "admin")).status).toBe("ready_for_export");
  });

  it("rejects invalid issue targets and empty issue text", () => {
    const submitted = {
      ...completeInProgressSubmission(),
      status: "submitted_for_review" as const,
    };

    expect(
      returnWithIssues(submitted, "admin", [
        { ...firstIssueInput(submitted), applicantId: "missing-applicant" },
      ]),
    ).toEqual({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Issue target, reason, and comment must be valid.",
      },
    });
    expect(
      returnWithIssues(submitted, "admin", [
        { ...firstIssueInput(submitted), field: "Несуществующее поле" },
      ]),
    ).toEqual({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Issue target, reason, and comment must be valid.",
      },
    });
    expect(
      returnWithIssues(submitted, "admin", [
        {
          ...firstIssueInput(submitted),
          field: undefined,
          fileType: "video",
          section: "Файлы",
          type: "file",
        },
      ]),
    ).toEqual({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Issue target, reason, and comment must be valid.",
      },
    });
    expect(
      returnWithIssues(submitted, "admin", [
        { ...firstIssueInput(submitted), comment: " " },
      ]),
    ).toEqual({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Issue target, reason, and comment must be valid.",
      },
    });
  });

  it("keeps reachable status actions aligned with canonical issue lifecycle", () => {
    const submitted = {
      ...completeInProgressSubmission(),
      status: "submitted_for_review" as const,
    };
    const returned = unwrap(
      returnWithIssues(submitted, "admin", [firstIssueInput(submitted)]),
    );
    const issueId = returned.issues[0]?.id;
    if (!issueId) throw new Error("Missing issue");

    expect(canPerformAction(returned, "submit_corrections", "agent")).toEqual({
      ok: false,
      reason: "Сначала отметьте замечания исправленными",
    });

    const fixed = unwrap(
      markIssueFixed(changeRouteIssueTarget(returned), "agent", issueId),
    );
    const corrected = applySubmissionAction(fixed, "submit_corrections", "agent");

    expect(corrected.status).toBe("corrections_received");
    expect(corrected.issues[0]?.status).toBe("fixed_by_agent");
    expect(canPerformAction(corrected, "accept", "admin")).toEqual({
      ok: false,
      reason: "Действие недоступно в текущем статусе",
    });
    expect(canPerformAction(corrected, "close_issues_accept", "admin")).toEqual({
      ok: false,
      reason: "Есть исправленные замечания вне паспортной проверки",
    });
    expect(
      applySubmissionAction(corrected, "close_issues_accept", "admin").issues[0]
        ?.status,
    ).toBe("fixed_by_agent");
  });

  it("blocks acceptance for any open issue, not only blockers", () => {
    const submitted = {
      ...completeInProgressSubmission(),
      issues: [
        {
          ...firstIssueInput(completeInProgressSubmission()),
          createdAt: "сейчас",
          createdBy: "admin" as const,
          id: "warning-issue",
          status: "open" as const,
          target: {
            applicantId: completeInProgressSubmission().applicants[0]?.id ?? "",
            applicantName: completeInProgressSubmission().applicants[0]?.fullName ?? "",
            field: "Маршрут поездки",
            section: "Анкета",
          },
        },
      ],
      status: "submitted_for_review" as const,
    };

    expect(acceptSubmission(submitted, "admin")).toEqual({
      ok: false,
      error: {
        code: "ACCEPTANCE_BLOCKED",
        message: "Acceptance is blocked until all issues are closed by admin.",
      },
    });
    expect(canPerformAction(submitted, "accept", "admin")).toEqual({
      ok: false,
      reason: "Есть незакрытые замечания",
    });
  });

  it("keeps every acceptance API fail-closed until questionnaire review is complete", () => {
    const reviewed = completeInProgressSubmission();
    const submitted: Submission = {
      ...reviewed,
      applicants: reviewed.applicants.map((applicant) => ({
        ...applicant,
        sections: applicant.sections.map((section) => ({
          ...section,
          fields: section.fields.map((field) =>
            field.id === "surname"
              ? {
                  ...field,
                  adminReviewApprovedAtIso: undefined,
                  adminReviewApprovedBy: undefined,
                }
              : field,
          ),
        })),
      })),
      status: "submitted_for_review",
    };

    expect(acceptSubmission(submitted, "admin")).toEqual({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Подтвердите паспортные поля перед принятием",
      },
    });
    expect(canAdminApproveForExport(submitted)).toBe(false);
  });

  it("ignores non-passport field approvals but never auto-accepts required media", () => {
    const ready: Submission = {
      ...completeInProgressSubmission(),
      status: "submitted_for_review",
    };
    const pendingMedia: Submission = {
      ...ready,
      files: ready.files.map((file) => ({
        ...file,
        reviewStatus: "not_reviewed",
        status: "pending_review",
      })),
    };

    expect(canAdminApproveForExport(ready)).toBe(true);
    expect(unwrap(acceptSubmission(ready, "admin")).status).toBe(
      "ready_for_export",
    );
    expect(acceptSubmission(pendingMedia, "admin")).toEqual({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Required passport_scan is not accepted.",
      },
    });
    expect(pendingMedia.files.every((file) => file.status === "pending_review")).toBe(
      true,
    );
  });

  it.each([
    ["wrong adapter", { storageAdapter: "local-dev" as const }],
    ["wrong bucket", { storageBucket: "other-bucket" }],
    ["wrong target", { storagePath: "submissions/wrong/applicants/wrong/passport_scan/file.jpg" }],
    ["unfinished upload", { uploadStatus: "pending" as const }],
  ])("fails every acceptance boundary for %s media identity", (_label, filePatch) => {
    const ready: Submission = {
      ...completeInProgressSubmission(),
      status: "submitted_for_review",
    };
    const invalid: Submission = {
      ...ready,
      files: ready.files.map((file) =>
        file.type === "passport_scan" ? { ...file, ...filePatch } : file,
      ),
    };
    const before = structuredClone(invalid);

    expect(canAdminApproveForExport(invalid)).toBe(false);
    expect(canPerformAction(invalid, "accept", "admin")).toMatchObject({
      ok: false,
    });
    expect(acceptSubmission(invalid, "admin")).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
    expect(
      reviewHandoffPersistenceIssues(
        { ...invalid, exportState: "ready", status: "ready_for_export" },
        "admin",
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("requires accepted canonical media"),
      ]),
    );
    expect(invalid).toEqual(before);
  });

  it("treats exported as terminal for mutation commands", () => {
    const exported = byId("ПД-1057");

    expect(updateSubmission(exported, "agent", { city: "Казань" })).toEqual({
      ok: false,
      error: { code: "EXPORTED_TERMINAL", message: "Exported is terminal for V-19." },
    });
    expect(markIssueFixed(exported, "agent", "missing")).toEqual({
      ok: false,
      error: { code: "EXPORTED_TERMINAL", message: "Exported is terminal for V-19." },
    });
  });

  it("uses fail-closed export guards and marks exported only after download", () => {
    const ready = adminAcceptRequiredMediaForTest(
      fillRequiredQuestionnaireForTest(canonicalMediaSubmission(byId("ПД-1056"))),
    );
    const notReady = completeInProgressSubmission();

    expect(generateExport([notReady], "admin")).toEqual({
      ok: false,
      error: {
        code: "EXPORT_NOT_READY",
        message: "Export guard blocked this selection.",
      },
    });
    expect(generateExport([ready], "agent")).toEqual({
      ok: false,
      error: {
        code: "PERMISSION_DENIED",
        message: "Only admin can generate export.",
      },
    });
    expect(generateExport([ready], "admin").ok).toBe(true);
    expect(markExported(ready, "admin")).toEqual({
      ok: false,
      error: {
        code: "EXPORT_NOT_READY",
        message:
          "Submission must have a downloaded export package before marking exported.",
      },
    });

    const packageIdentity = buildExportPackageIdentity([ready]);
    if (!packageIdentity) throw new Error("Missing export package identity");
    const downloaded = {
      ...ready,
      exportPackage: packageIdentity,
      exportState: "file_downloaded" as const,
    };
    expect(unwrap(markExported(downloaded, "admin", packageIdentity)).status).toBe(
      "exported",
    );
    expect(canPerformAction(downloaded, "mark_exported", "admin")).toEqual({
      ok: true,
    });
  });

  it("derives selectors from submission data instead of persisted status labels", () => {
    const returned = byId("ПД-1048");

    expect(getFileState(returned)).toBe("needs_replacement");
    expect(getOpenIssues(returned)).toHaveLength(2);
    expect(getRequiresAction(returned)).toBe(true);
    expect(getOperationalBucket(returned)).toBe("agent_work");
    expect(getNextAction(returned, "agent")).toMatchObject({
      action: "submit_corrections",
      disabled: true,
    });
    expect(getDefaultDrawerTab(returned)).toBe("issues");
  });

  it("keeps next action helpers aligned with submit guards", () => {
    const missingTripDates = {
      ...completeInProgressSubmission(),
      tripDateFrom: "не указано",
      tripDateTo: "не указано",
    };

    expect(canPerformAction(missingTripDates, "submit_for_review", "agent")).toEqual({
      ok: false,
      reason: "Укажите даты поездки перед отправкой",
    });
    expect(getNextAction(missingTripDates, "agent")).toEqual({
      action: "submit_for_review",
      disabled: true,
      label: "Отправить",
      reason: "Укажите даты поездки перед отправкой",
    });
  });

  it("uses typed status transition helper for allowed draft to in_progress", () => {
    const draft = unwrap(
      createDraft({
        city: "Москва",
        familyCount: 1,
        submissions: [],
        type: "single",
      }),
    );

    const transitioned = unwrap(
      transitionSubmissionStatus(draft, {
        actorId: "agent-typed",
        actorRole: "agent",
        nextStatus: "in_progress",
        source: "agent",
      }),
    );

    expect(transitioned.status).toBe("in_progress");
    expect(transitioned.history[0]).toMatchObject({
      actorId: "agent-typed",
      createdAt: "сейчас",
      fromStatus: "draft",
      source: "agent",
      toStatus: "in_progress",
    });
  });

  it("rejects forbidden role and direct status transitions", () => {
    const ready = completeInProgressSubmission();

    expect(
      transitionSubmissionStatus(ready, {
        actorRole: "agent",
        nextStatus: "ready_for_export",
        source: "agent",
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "INVALID_TRANSITION" },
    });
    expect(
      transitionSubmissionStatus(ready, {
        actorRole: "admin",
        nextStatus: "exported",
        source: "admin",
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "INVALID_TRANSITION" },
    });
  });

  it("blocks review/export transitions on bad required documents and open issues", () => {
    const ready = completeInProgressSubmission();
    const badFile = {
      ...ready,
      files: ready.files.map((file, index) =>
        index === 0
          ? {
              ...file,
              reviewStatus: "replace_required" as const,
              status: "needs_replacement" as const,
            }
          : file,
      ),
    };

    expect(hasRequiredDocuments(badFile)).toBe(false);
    expect(canAgentSubmitForReview(badFile)).toBe(false);

    const submittedWithIssue = {
      ...ready,
      issues: [
        {
          ...firstIssueInput(ready),
          createdAt: "сейчас",
          createdBy: "admin" as const,
          id: "open-warning",
          severity: "warning" as const,
          status: "open" as const,
          target: {
            applicantId: ready.applicants[0]?.id ?? "",
            applicantName: ready.applicants[0]?.fullName ?? "",
            field: "Маршрут поездки",
            section: "Анкета",
          },
        },
      ],
      status: "submitted_for_review" as const,
    };

    expect(canAdminApproveForExport(submittedWithIssue)).toBe(false);
    expect(acceptSubmission(submittedWithIssue, "admin")).toMatchObject({
      ok: false,
      error: { code: "ACCEPTANCE_BLOCKED" },
    });
  });

  it("keeps exported terminal in the shared transition helper", () => {
    const exported = byId("ПД-1057");

    expect(
      transitionSubmissionStatus(exported, {
        actorRole: "admin",
        nextStatus: "returned",
        source: "admin",
      }),
    ).toEqual({
      ok: false,
      error: {
        code: "EXPORTED_TERMINAL",
        message: "Exported is terminal for V-19.",
      },
    });
  });
});

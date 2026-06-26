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
  canPerformAction,
} from "../../src/modules/submissions/status";
import type {
  CommandResult,
  IssueInput,
  Submission,
} from "../../src/modules/submissions/types";

function byId(id: string): Submission {
  const submission = initialSubmissions.find((item) => item.id === id);
  if (!submission) throw new Error(`Missing fixture ${id}`);
  return structuredClone(submission);
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

function completeInProgressSubmission(): Submission {
  const base = byId("ПД-1056");
  return {
    ...byId("ПД-1056"),
    id: "ПД-DOMAIN-READY",
    status: "in_progress",
    exportState: "not_ready",
    files: base.files.filter((file) => file.type !== "photo"),
  };
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

    const fixed = unwrap(markIssueFixed(returned, "agent", issueId));
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
    const corrected = applySubmissionAction(returned, "submit_corrections", "agent");

    expect(corrected.status).toBe("corrections_received");
    expect(corrected.issues[0]?.status).toBe("fixed_by_agent");
    expect(canPerformAction(corrected, "accept", "admin")).toEqual({
      ok: false,
      reason: "Действие недоступно в текущем статусе",
    });
    expect(canPerformAction(corrected, "close_issues_accept", "admin")).toEqual({
      ok: true,
    });
    expect(
      applySubmissionAction(corrected, "close_issues_accept", "admin").issues[0]
        ?.status,
    ).toBe("closed_by_admin");
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
    const ready = byId("ПД-1056");
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
});

import { describe, expect, it } from "vitest";
import { buildExportPackageIdentity } from "../../src/modules/submissions/exportRules";
import { initialSubmissions } from "../../src/modules/submissions/mockData";
import {
  acceptSubmission,
  closeIssue,
  createDraft,
  generateExport,
  getDefaultDrawerTab,
  getNextAction,
  markExported,
  markIssueFixed,
  resubmitCorrections,
  returnWithIssues,
  submitForReview,
} from "../../src/modules/submissions/domainEngine";
import {
  applySubmissionActionResult,
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

function readyInProgressSubmission(): Submission {
  return {
    ...canonicalMediaSubmission(byId("ПД-1056")),
    id: "ПД-PILOT-READY",
    files: canonicalMediaSubmission(byId("ПД-1056")).files.map((file) => ({
      ...file,
      status: "uploaded",
    })),
    status: "in_progress",
    exportState: "not_ready",
  };
}

function fieldIssueInput(submission: Submission): IssueInput {
  const applicant = submission.applicants[0];
  if (!applicant) throw new Error("Missing applicant");

  return {
    applicantId: applicant.id,
    comment: "Укажите точный маршрут поездки.",
    field: "Маршрут поездки",
    reason: "Маршрут поездки должен быть конкретным",
    section: "Анкета",
    severity: "blocker",
    type: "field",
  };
}

describe("V-19 pilot click logic state machine", () => {
  it("keeps local draft creation locked to Spain single/family submissions", () => {
    const draft = unwrap(
      createDraft({
        city: "Москва",
        familyCount: 2,
        submissions: initialSubmissions,
        type: "family",
      }),
    );

    expect(draft).toMatchObject({
      country: "Испания",
      countryCode: "ES",
      status: "draft",
      type: "family",
    });
    expect(draft.applicants).toHaveLength(2);
    expect(
      createDraft({
        city: "Москва",
        familyCount: 1,
        submissions: [],
        type: "group" as never,
      }),
    ).toEqual({
      ok: false,
      error: {
        code: "INVALID_SUBMISSION_KIND",
        message: "Submission type must be single or family.",
      },
    });
  });

  it("blocks incomplete submit and allows complete submit to review", () => {
    const incomplete = {
      ...readyInProgressSubmission(),
      files: readyInProgressSubmission().files.map((file, index) =>
        index === 0 ? { ...file, status: "missing" as const } : file,
      ),
    };
    const missingTripDates = {
      ...readyInProgressSubmission(),
      tripDateFrom: "не указано",
      tripDateTo: "",
    };
    const ready = readyInProgressSubmission();

    expect(submitForReview(incomplete, "agent")).toEqual({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Questionnaire and files must be complete.",
      },
    });
    expect(submitForReview(missingTripDates, "agent")).toEqual({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Trip dates must be complete.",
      },
    });

    const submitted = unwrap(submitForReview(ready, "agent"));
    expect(submitted.status).toBe("submitted_for_review");
    expect(submitted.files.every((file) => file.status === "pending_review")).toBe(true);
  });

  it("runs return, fix, resubmit, close, and accept with blocker guards", () => {
    const submitted = {
      ...readyInProgressSubmission(),
      status: "submitted_for_review" as const,
    };
    const returned = unwrap(
      returnWithIssues(submitted, "admin", [fieldIssueInput(submitted)]),
    );
    const issueId = returned.issues[0]?.id;
    if (!issueId) throw new Error("Missing issue");

    expect(returned.status).toBe("returned");
    expect(getDefaultDrawerTab(returned)).toBe("issues");
    expect(getNextAction(returned, "agent")).toEqual({
      action: "submit_corrections",
      disabled: true,
      label: "Отправить исправления",
      reason: "Сначала отметьте замечания исправленными",
    });
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

  it("keeps export package-level, Excel-only, and download-gated", () => {
    const ready = canonicalMediaSubmission(byId("ПД-1056"));
    const packageIdentity = buildExportPackageIdentity([ready], "xlsx");
    if (!packageIdentity) throw new Error("Missing package identity");

    expect(canPerformAction(ready, "generate_export", "admin")).toEqual({
      ok: false,
      reason: "Формирование Excel выполняется только через пакет выгрузки",
    });
    expect(generateExport([ready], "agent")).toEqual({
      ok: false,
      error: {
        code: "PERMISSION_DENIED",
        message: "Only admin can generate export.",
      },
    });

    const exportGuard = unwrap(generateExport([ready], "admin"));
    expect(exportGuard.packageIdentity).toMatchObject({
      format: "xlsx",
      rowCount: 1,
      submissionIds: ["ПД-1056"],
    });
    expect(exportGuard.packageIdentity.fileName).toMatch(/\.xlsx$/);
    expect(markExported(ready, "admin", packageIdentity)).toEqual({
      ok: false,
      error: {
        code: "EXPORT_NOT_READY",
        message:
          "Submission must have a downloaded export package before marking exported.",
      },
    });

    const downloaded = {
      ...ready,
      exportPackage: packageIdentity,
      exportState: "file_downloaded" as const,
    };
    expect(unwrap(markExported(downloaded, "admin", packageIdentity))).toMatchObject({
      exportState: "marked_exported",
      status: "exported",
    });
  });

  it("returns typed failures instead of silent UI-local no-ops", () => {
    const returned = byId("ПД-1048");
    const ready = canonicalMediaSubmission(byId("ПД-1056"));

    expect(applySubmissionActionResult(returned, "accept", "agent")).toEqual({
      ok: false,
      error: {
        code: "PERMISSION_DENIED",
        message: "Недостаточно прав",
      },
    });
    expect(applySubmissionActionResult(ready, "generate_export", "admin")).toEqual({
      ok: false,
      error: {
        code: "EXPORT_NOT_READY",
        message: "Формирование Excel выполняется только через пакет выгрузки",
      },
    });
  });
});

import { describe, expect, test, vi } from "vitest";
import {
  businessClickContractFor,
  isBusinessClickIntent,
  V19_BUSINESS_CLICK_CONTRACTS,
  V19_BUSINESS_CLICK_CONTRACT_LIST,
  V19_SUBMISSION_ACTION_CLICK_CONTRACTS,
} from "../../src/modules/submissions/businessClickContract";
import {
  createDraft,
  generateExport,
  type ExportGuardResult,
} from "../../src/modules/submissions/domainEngine";
import { completeExportPackage } from "../../src/modules/submissions/exportWorkflow";
import {
  buildExportPackageIdentity,
  exportSummary,
} from "../../src/modules/submissions/exportRules";
import {
  addPreciseAdminIssue,
  applyExportStateToSelection,
  createDraftSubmission,
  uploadRequiredFile,
  uploadRequiredFiles,
  updateQuestionnaireField,
} from "../../src/modules/submissions/submissionActions";
import {
  applyAgentSubmitForReviewResult,
  applySubmissionActionResult,
  canPerformAction,
  transitionMatrix,
} from "../../src/modules/submissions/status";
import type {
  IssueInput,
  Role,
  Submission,
  SubmissionAction,
} from "../../src/modules/submissions/types";
import {
  adminAcceptRequiredMediaForTest,
  adminApprovePassportFieldsForTest,
  fillRequiredQuestionnaireForTest,
  withCanonicalPrivateMediaIdentityForTest,
} from "./helpers/questionnaireTestFill";

const allContracts = V19_BUSINESS_CLICK_CONTRACT_LIST;
const actionContracts = V19_SUBMISSION_ACTION_CLICK_CONTRACTS;

describe("V-19 business click contract", () => {
  test("covers every SubmissionAction exactly once for future UI wiring", () => {
    const transitionActions = Object.keys(transitionMatrix).sort();
    const contractActions = actionContracts
      .map((contract) => contract.submissionAction)
      .sort();

    expect(contractActions).toEqual(transitionActions);
    expect(new Set(contractActions).size).toBe(contractActions.length);
  });

  test("keeps click contracts aligned with the canonical transition matrix", () => {
    for (const contract of actionContracts) {
      const transition = transitionMatrix[contract.submissionAction];

      expect(contract.ownerRole).toBe(transition.role);
      expect(contract.transition).toEqual({
        from: transition.from,
        to: transition.to,
      });
    }
  });

  test("keeps every business click bound to a real production logic owner", () => {
    for (const [intent, contract] of Object.entries(V19_BUSINESS_CLICK_CONTRACTS)) {
      expect(contract.productionLogic, intent).toMatch(
        /^src\/modules\/submissions\/[a-zA-Z]+/,
      );
      expect(contract.surfaces.length, intent).toBeGreaterThan(0);
    }
  });

  test("keeps applicants and family work inside My submissions", () => {
    const surfaces = new Set<string>(
      allContracts.flatMap((contract) => contract.surfaces),
    );

    expect(surfaces.has("agent-submissions")).toBe(true);
    expect(surfaces.has("agent-applicants")).toBe(false);
    expect(surfaces.has("agent-family")).toBe(false);
    expect(surfaces.has("agent-media")).toBe(false);
  });

  test("executes the combined draft-to-review intent through the canonical lifecycle", () => {
    expect(businessClickContractFor("prepare_and_submit_for_review")).toMatchObject({
      executionPath: "applyAgentSubmitForReviewResult",
      ownerRole: "agent",
      transition: {
        from: ["draft", "in_progress"],
        to: "submitted_for_review",
      },
    });
    const draftReady = { ...inProgressReadyFixture(), status: "draft" as const };

    const result = applyAgentSubmitForReviewResult(
      draftReady,
      draftReady.agentId,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe("submitted_for_review");
    expect(result.data.history.slice(0, 2).map((item) => item.toStatus)).toEqual([
      "submitted_for_review",
      "in_progress",
    ]);
  });

  test("runs every submission lifecycle click through guard and mutation logic", () => {
    for (const contract of actionContracts) {
      const fixture = successFixtureFor(contract.submissionAction);

      if (contract.executionPath === "exportSummary") {
        expect(canPerformAction(fixture, "generate_export", "admin")).toEqual({
          ok: false,
          reason: "Формирование Excel выполняется только через пакет выгрузки",
        });
        const exportGuard = generateExport([fixture], "admin");
        expect(exportGuard.ok).toBe(true);
        if (exportGuard.ok) assertExportGuard(exportGuard.data, fixture);
        continue;
      }

      if (contract.executionPath === "completeExportPackage") {
        expect(canPerformAction(fixture, "mark_exported", "admin")).toEqual({
          ok: true,
        });
        continue;
      }

      const guard = canPerformAction(
        fixture,
        contract.submissionAction,
        contract.ownerRole,
      );
      expect(guard, contract.submissionAction).toEqual({ ok: true });

      const result = applySubmissionActionResult(
        fixture,
        contract.submissionAction,
        contract.ownerRole,
        contract.ownerRole === "agent" ? fixture.agentId : "admin-reviewer",
      );

      expect(result.ok, contract.submissionAction).toBe(true);
      if (!result.ok) continue;

      expect(result.data.status, contract.submissionAction).toBe(
        contract.transition?.to,
      );
      if (contract.submissionAction === "open_history") {
        expect(result.data).toBe(fixture);
      } else {
        expect(result.data.history[0]?.toStatus, contract.submissionAction).toBe(
          contract.transition?.to,
        );
      }
    }
  });

  test("blocks wrong-role lifecycle clicks without mutating the submission", () => {
    for (const contract of actionContracts) {
      const fixture = successFixtureFor(contract.submissionAction);
      const wrongRole = oppositeRole(contract.ownerRole);
      const result = applySubmissionActionResult(
        fixture,
        contract.submissionAction,
        wrongRole,
      );

      expect(result.ok, contract.submissionAction).toBe(false);
      if (!result.ok) {
        expect(result.error.code, contract.submissionAction).toBe("PERMISSION_DENIED");
      }
    }
  });

  test("proves non-status business clicks with production helpers", async () => {
    const created = createDraft({
      applicantNames: ["Новая Подача"],
      city: "Москва",
      familyCount: 1,
      idScheme: "supabase",
      submissions: [],
      type: "single",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error(created.error.message);

    expect(created.data).toMatchObject({
      country: "Испания",
      countryCode: "ES",
      status: "draft",
      type: "single",
    });

    const withTripDate = updateQuestionnaireField(created.data, {
      applicantId: created.data.applicants[0]?.id ?? "",
      fieldId: "arrival-date",
      sectionId: `${created.data.applicants[0]?.id ?? ""}-trip`,
      value: "2026-08-11",
    });
    expect(withTripDate.tripDateFrom).toBe("2026-08-11");

    const uploaded = uploadRequiredFile(created.data, created.data.files[0]?.id ?? "");
    expect(uploaded.files[0]).toMatchObject({
      status: "uploaded",
      type: "passport_scan",
    });

    const submitted = submittedFixture();
    const withIssue = addPreciseAdminIssue(submitted, fileIssueInput(submitted));
    const returned = applySubmissionActionResult(
      withIssue,
      "return_with_issues",
      "admin",
    );
    expect(returned.ok).toBe(true);
    if (!returned.ok) return;
    expect(returned.data.status).toBe("returned");
    expect(returned.data.issues[0]).toMatchObject({ status: "open" });

    const fileToReplace = returned.data.files.find(
      (file) =>
        file.applicantId === returned.data.issues[0]?.target.applicantId &&
        file.type === returned.data.issues[0]?.target.fileType,
    );
    if (!fileToReplace) throw new Error("Missing issue target file.");

    const fixedFile = uploadRequiredFile(returned.data, fileToReplace.id);
    expect(fixedFile.issues[0]?.status).toBe("open");

    const readyForExport = readyForExportFixture();
    const generated = applyExportStateToSelection(
      [readyForExport],
      [readyForExport.id],
      "file_generated",
    );
    expect(generated[0]).toMatchObject({ exportState: "file_generated" });

    const downloaded = applyExportStateToSelection(
      generated,
      [readyForExport.id],
      "file_downloaded",
    );
    expect(downloaded[0]).toMatchObject({ exportState: "file_downloaded" });

    const packageIdentity = buildExportPackageIdentity(downloaded, "xlsx");
    if (!packageIdentity) throw new Error("Missing export package identity.");
    const documentExport = {
      applicantCount: 1,
      assetIds: [
        "00000000-0000-4000-8000-000000000911",
        "00000000-0000-4000-8000-000000000912",
        "00000000-0000-4000-8000-000000000913",
      ],
      fileCount: 3,
      workbookFileName: packageIdentity.fileName,
      zipFileName: `visaflow-export-${packageIdentity.idempotencyKey}_documents.zip`,
    };
    const commitPackage = vi.fn(async (batch, committedDocumentExport) => ({
      batch,
      changedSubmissions: downloaded.length,
      documentExport: committedDocumentExport,
      duplicate: false,
      statusHistory: downloaded.length,
    }));
    const exported = await completeExportPackage(downloaded, {
      batchId: "00000000-0000-4000-8000-000000000901",
      commitPackage,
      createdAt: "2026-07-04T19:20:00.000Z",
      createdBy: "00000000-0000-4000-8000-000000000902",
      documentExport,
      format: "xlsx",
    });

    expect(exported.status).toBe("exported");
    if (exported.status === "exported") {
      expect(exported.submissions[0]).toMatchObject({
        exportState: "marked_exported",
        status: "exported",
      });
    }
  });

  test("does not allow unregistered business click intents", () => {
    expect(isBusinessClickIntent("submit_for_review")).toBe(true);
    expect(isBusinessClickIntent("constructor")).toBe(false);
    expect(isBusinessClickIntent("toString")).toBe(false);

    expect(businessClickContractFor("submit_for_review")).toMatchObject({
      executionPath: "applySubmissionActionResult",
      submissionAction: "submit_for_review",
    });

    expect(
      (allContracts.map((_contract, index) => index) satisfies number[]).length,
    ).toBe(Object.keys(V19_BUSINESS_CLICK_CONTRACTS).length);
  });
});

function successFixtureFor(action: SubmissionAction): Submission {
  switch (action) {
    case "save_progress":
      return draftFixture();
    case "submit_for_review":
      return inProgressReadyFixture();
    case "submit_corrections":
      return returnedWithFixedIssueFixture();
    case "return_with_issues":
      return submittedWithOpenIssueFixture();
    case "accept":
      return approvedSubmittedFixture();
    case "close_issues_accept": {
      const corrected = adminAcceptRequiredMediaForTest(
        adminApprovePassportFieldsForTest(
          correctionsReceivedWithFixedIssueFixture(),
        ),
      );
      return {
        ...corrected,
        issues: corrected.issues.map((issue) => ({
          ...issue,
          target: {
            ...issue.target,
            field: "Номер паспорта",
            section: "Паспорт",
          },
        })),
      };
    }
    case "return_again":
      return correctionsReceivedWithOpenIssueFixture();
    case "generate_export":
      return readyForExportFixture();
    case "mark_exported":
      return downloadedExportFixture();
    case "open_history":
      return exportedFixture();
  }
}

function draftFixture(): Submission {
  return createDraftSubmission({
    applicantNames: ["Мария Иванова"],
    city: "Москва",
    familyCount: 1,
    idScheme: "supabase",
    preliminaryIntake: {
      arrivalPlace: "",
      homeAddress: "",
      sameArrivalPlace: false,
      sameHomeAddress: false,
      sameSpainStay: false,
      sameTripDates: true,
      spainStayAddress: "",
      spainStayCity: "",
      spainStayName: "",
      tripDateFrom: "2026-08-11",
      tripDateTo: "2026-08-20",
    },
    submissions: [],
    type: "single",
  });
}

function inProgressReadyFixture(): Submission {
  return {
    ...uploadRequiredFiles(fillRequiredQuestionnaireForTest(draftFixture())),
    status: "in_progress",
    tripDateFrom: "2026-08-11",
    tripDateTo: "2026-08-20",
  };
}

function submittedFixture(): Submission {
  const submission = inProgressReadyFixture();
  const result = applySubmissionActionResult(
    submission,
    "submit_for_review",
    "agent",
    submission.agentId,
  );
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}

function approvedSubmittedFixture(): Submission {
  return adminAcceptRequiredMediaForTest(
    adminApprovePassportFieldsForTest(submittedFixture()),
  );
}

function submittedWithOpenIssueFixture(): Submission {
  const submitted = submittedFixture();
  return addPreciseAdminIssue(submitted, routeIssueInput(submitted));
}

function returnedWithFixedIssueFixture(): Submission {
  const submitted = adminAcceptRequiredMediaForTest(
    withCanonicalPrivateMediaIdentityForTest(submittedFixture()),
  );
  const issue = routeIssueInput(submitted);
  return {
    ...submitted,
    status: "returned",
    issues: [
      {
        createdAt: "сейчас",
        createdBy: "admin",
        id: "issue-fixed",
        reason: issue.reason,
        severity: issue.severity,
        status: "fixed_by_agent",
        target: {
          applicantId: issue.applicantId,
          applicantName: submitted.applicants[0]?.fullName ?? "",
          field: issue.field,
          section: issue.section,
        },
        type: issue.type,
        comment: issue.comment,
      },
    ],
  };
}

function correctionsReceivedWithFixedIssueFixture(): Submission {
  return {
    ...returnedWithFixedIssueFixture(),
    status: "corrections_received",
  };
}

function correctionsReceivedWithOpenIssueFixture(): Submission {
  const submitted = submittedFixture();
  const issue = routeIssueInput(submitted);
  return {
    ...submitted,
    status: "corrections_received",
    issues: [
      {
        createdAt: "сейчас",
        createdBy: "admin",
        id: "issue-open",
        reason: issue.reason,
        severity: issue.severity,
        status: "open",
        target: {
          applicantId: issue.applicantId,
          applicantName: submitted.applicants[0]?.fullName ?? "",
          field: issue.field,
          section: issue.section,
        },
        type: issue.type,
        comment: issue.comment,
      },
    ],
  };
}

function readyForExportFixture(): Submission {
  const result = applySubmissionActionResult(
    approvedSubmittedFixture(),
    "accept",
    "admin",
  );
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}

function downloadedExportFixture(): Submission {
  const ready = readyForExportFixture();
  const generated = applyExportStateToSelection([ready], [ready.id], "file_generated");
  const downloaded = applyExportStateToSelection(
    generated,
    [ready.id],
    "file_downloaded",
  );
  const submission = downloaded[0];
  if (!submission) throw new Error("Missing downloaded export fixture.");
  return submission;
}

function exportedFixture(): Submission {
  return {
    ...downloadedExportFixture(),
    exportState: "marked_exported",
    status: "exported",
  };
}

function routeIssueInput(submission: Submission): IssueInput {
  const applicant = submission.applicants[0];
  if (!applicant) throw new Error("Missing applicant");

  return {
    applicantId: applicant.id,
    comment: "Маршрут поездки должен быть конкретным.",
    field: "Маршрут поездки",
    reason: "Нужно уточнить маршрут поездки",
    section: "Анкета",
    severity: "blocker",
    type: "field",
  };
}

function fileIssueInput(submission: Submission): IssueInput {
  const applicant = submission.applicants[0];
  if (!applicant) throw new Error("Missing applicant");

  return {
    applicantId: applicant.id,
    comment: "Загрузите новый скан паспорта.",
    fileType: "passport_scan",
    reason: "Скан паспорта нужно заменить",
    section: "Файлы",
    severity: "blocker",
    type: "file",
  };
}

function assertExportGuard(data: ExportGuardResult, fixture: Submission): void {
  expect(data.summary.canGenerate).toBe(true);
  expect(data.packageIdentity).toEqual(buildExportPackageIdentity([fixture]));
  expect(exportSummary([fixture]).canGenerate).toBe(true);
}

function oppositeRole(role: Role): Role {
  return role === "agent" ? "admin" : "agent";
}

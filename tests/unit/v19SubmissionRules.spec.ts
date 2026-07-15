import { afterEach, describe, expect, it } from "vitest";
import type { Json } from "../../src/lib/supabase/database.types";
import { generateAiSuggestions } from "../../src/modules/submissions/aiRules";
import {
  acceptAiSuggestionAsIssue,
  activeAiSuggestions,
  canRunAiReview,
  dismissAiSuggestion,
  runAiReview,
} from "../../src/modules/submissions/aiSuggestions";
import {
  adminActionQueue,
  adminWorkEvents,
  agentActionQueue,
  buildAgentActionTasks,
} from "../../src/modules/submissions/agentActions";
import {
  buildExportMappingAudit,
  buildExportPackageIdentity,
  buildExportRows,
  exportPackageIdentityMatches,
  exportSummary,
  exportSummaryForSelectedIds,
  getExportBlockers,
  getExportWarnings,
} from "../../src/modules/submissions/exportRules";
import { initialSubmissions } from "../../src/modules/submissions/mockData";
import {
  alternateLocalAgentOwnerId,
  defaultLocalAgentOwnerId,
} from "../../src/modules/submissions/ownership";
import {
  clearSubmissions,
  loadSubmissions,
  saveSubmissions,
} from "../../src/modules/submissions/persistence";
import { agentQueue } from "../../src/modules/submissions/selectors";
import {
  cockpitSnapshotKey,
  cockpitSnapshotStatus,
  cockpitSnapshotStorageField,
  cockpitSnapshotVersion,
  readCockpitSnapshot,
  toCockpitDraftPersistencePayload,
} from "../../src/modules/submissions/supabasePersistence";
import { buildMediaStoragePath } from "../../src/modules/submissions/mediaStorage";
import { withRecomputedFileCompletion } from "../../src/modules/submissions/fileAsset";
import {
  applySafePassportExtractionFields,
  failPassportExtraction,
  finishPassportExtraction,
  markPassportExtractionReviewed,
  passportExtractionRows,
} from "../../src/modules/submissions/passportExtraction";
import {
  addPreciseAdminIssue,
  applyUploadedFileMetadata,
  applyExportStateToSelection,
  createDraftSubmission,
  generatedCockpitMediaFileName,
  markSelectedExported,
  mediaSlotTypeForSubmissionFileType,
  mergeUploadedFileMetadataIntoSubmissions,
  normalizeSubmissionForCanonicalRuntime,
  uploadRequiredFile,
  uploadRequiredFiles,
  updateQuestionnaireField,
} from "../../src/modules/submissions/submissionActions";
import {
  adminIssueGuard,
  adminWorkDrawerTabFor,
  adminWorkEventTitle,
  adminWorkPresentation,
  applySubmissionAction,
  canAddAdminIssue,
  canEditSubmissionContent,
  canPerformAction,
  defaultDrawerTab,
  hasMissingRequiredWork,
  markSubmissionIssueFixedResult,
  transitionMatrix,
} from "../../src/modules/submissions/status";
import type {
  IssueInput,
  Role,
  Submission,
  SubmissionAction,
  SubmissionStatus,
} from "../../src/modules/submissions/types";
import { matchesReviewTab } from "../../src/modules/submissions/uiTypes";
import { fillRequiredQuestionnaireForTest } from "./helpers/questionnaireTestFill";

const canonicalMediaTypes = ["passport_scan", "selfie", "selfie_2"] as const;

function byId(id: string) {
  const submission = initialSubmissions.find((item) => item.id === id);
  if (!submission) throw new Error(`Missing fixture ${id}`);
  return submission;
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

afterEach(() => {
  clearSubmissions();
});

function installStorageStub() {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
}

function testStorage() {
  return (
    globalThis as unknown as {
      localStorage: { setItem(key: string, value: string): void };
    }
  ).localStorage;
}

function readyClone(patch: Partial<Submission>): Submission {
  return {
    ...fillRequiredQuestionnaireForTest(
      canonicalMediaSubmission(byId("ПД-1056")),
    ),
    id: patch.id ?? "ПД-ТЕСТ",
    title: patch.title ?? "Тестовая подача",
    ...patch,
  };
}

function datedPreliminaryIntake() {
  return {
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
  };
}

function canonicalMediaSubmission(submission: Submission): Submission {
  const files = submission.files.filter((file) =>
    canonicalMediaTypes.includes(file.type as (typeof canonicalMediaTypes)[number]),
  );

  return {
    ...submission,
    files,
    completeness: { ...submission.completeness, files: 100, total: 100 },
  };
}

function questionnaireCompleteness(submission: Submission) {
  const fields = submission.applicants.flatMap((applicant) =>
    applicant.sections.flatMap((section) => section.fields),
  );
  const ready = fields.filter(
    (field) => !field.required || Boolean(field.value.trim() && !field.error),
  );

  return fields.length ? Math.round((ready.length / fields.length) * 100) : 0;
}

function questionnaireValue(
  submission: Submission,
  fieldId: string,
  applicantIndex = 0,
) {
  return (
    submission.applicants[applicantIndex]?.sections
      .flatMap((section) => section.fields)
      .find((field) => field.id === fieldId)?.value ?? ""
  );
}

describe("V-19 submission status rules", () => {
  it("keeps the exact centralized transition matrix", () => {
    const expected = {
      save_progress: { from: ["draft"], to: "in_progress", role: "agent" },
      submit_for_review: {
        from: ["in_progress"],
        to: "submitted_for_review",
        role: "agent",
      },
      submit_corrections: {
        from: ["returned"],
        to: "corrections_received",
        role: "agent",
      },
      return_with_issues: {
        from: ["submitted_for_review"],
        to: "returned",
        role: "admin",
      },
      accept: {
        from: ["submitted_for_review"],
        to: "ready_for_export",
        role: "admin",
      },
      close_issues_accept: {
        from: ["corrections_received"],
        to: "ready_for_export",
        role: "admin",
      },
      return_again: {
        from: ["corrections_received"],
        to: "returned",
        role: "admin",
      },
      generate_export: {
        from: ["ready_for_export"],
        to: "ready_for_export",
        role: "admin",
      },
      mark_exported: {
        from: ["ready_for_export"],
        to: "exported",
        role: "admin",
      },
      open_history: {
        from: ["exported"],
        to: "exported",
        role: "admin",
      },
    } satisfies Record<
      SubmissionAction,
      { from: SubmissionStatus[]; to: SubmissionStatus; role: Role }
    >;

    expect(transitionMatrix).toEqual(expected);
  });

  it("keeps action ownership separated by role", () => {
    const agentActions: SubmissionAction[] = [
      "save_progress",
      "submit_for_review",
      "submit_corrections",
    ];
    const adminActions: SubmissionAction[] = [
      "return_with_issues",
      "accept",
      "close_issues_accept",
      "return_again",
      "generate_export",
      "mark_exported",
      "open_history",
    ];

    for (const action of agentActions)
      expect(transitionMatrix[action].role).toBe("agent");
    for (const action of adminActions)
      expect(transitionMatrix[action].role).toBe("admin");
  });

  it("routes returned submissions directly to issues", () => {
    expect(defaultDrawerTab(byId("ПД-1048"))).toBe("issues");
  });

  it("blocks role-incompatible actions", () => {
    const submitted = canonicalMediaSubmission(
      fillRequiredQuestionnaireForTest(byId("ПД-1053")),
    );

    expect(canPerformAction(submitted, "accept", "agent")).toEqual({
      ok: false,
      reason: "Недостаточно прав",
    });
    expect(canPerformAction(submitted, "accept", "admin")).toEqual({ ok: true });
  });

  it("blocks review submission while required work is missing", () => {
    expect(canPerformAction(byId("ПД-1051"), "submit_for_review", "agent")).toEqual({
      ok: false,
      reason: "Есть незаполненные поля или недостающие файлы",
    });
  });

  it("fails closed for admin acceptance while required questionnaire work is incomplete", () => {
    const complete = canonicalMediaSubmission(
      fillRequiredQuestionnaireForTest(byId("ПД-1053")),
    );
    const incomplete: Submission = {
      ...complete,
      applicants: complete.applicants.map((applicant) => ({
        ...applicant,
        sections: applicant.sections.map((section) => ({
          ...section,
          fields: section.fields.map((field) =>
            field.id === "surname" ? { ...field, value: "" } : field,
          ),
        })),
      })),
    };
    const corrected: Submission = { ...incomplete, status: "corrections_received" };

    expect(hasMissingRequiredWork(incomplete)).toBe(true);
    expect(canPerformAction(incomplete, "accept", "admin")).toEqual({
      ok: false,
      reason: "Не все обязательные анкеты и файлы готовы",
    });
    expect(canPerformAction(corrected, "close_issues_accept", "admin")).toEqual({
      ok: false,
      reason: "Не все обязательные анкеты и файлы готовы",
    });
    expect(applySubmissionAction(incomplete, "accept", "admin")).toBe(incomplete);
  });

  it("keeps the corrected demo family ready for explicit admin closeout", () => {
    const corrected = byId("ПД-1055");

    expect(hasMissingRequiredWork(corrected)).toBe(false);
    expect(canPerformAction(corrected, "close_issues_accept", "admin")).toEqual({
      ok: true,
    });

    const accepted = applySubmissionAction(
      corrected,
      "close_issues_accept",
      "admin",
      "local-demo-admin",
    );

    expect(accepted.status).toBe("ready_for_export");
    expect(accepted.issues.every((issue) => issue.status === "closed_by_admin")).toBe(
      true,
    );
  });

  it("blocks review submission while trip dates are missing", () => {
    const draft = createDraftSubmission({
      city: "Москва",
      familyCount: 1,
      submissions: [],
      type: "single",
    });
    const filled = {
      ...uploadRequiredFiles(fillRequiredQuestionnaireForTest(draft)),
      status: "in_progress" as const,
      tripDateFrom: "не указано",
      tripDateTo: "не указано",
    };

    expect(canPerformAction(filled, "submit_for_review", "agent")).toEqual({
      ok: false,
      reason: "Укажите даты поездки перед отправкой",
    });
  });

  it("allows admin issues only while a submission is under active review", () => {
    expect(canAddAdminIssue(byId("ПД-1053"), "admin")).toBe(true);
    expect(canAddAdminIssue(byId("ПД-1056"), "admin")).toBe(false);
    expect(canAddAdminIssue(byId("ПД-1053"), "agent")).toBe(false);
    expect(adminIssueGuard(byId("ПД-1053"), "admin")).toEqual({ ok: true });
    expect(adminIssueGuard(byId("ПД-1056"), "admin")).toEqual({
      ok: false,
      reason: "Пакет уже принят. Новое замечание доступно только до принятия.",
    });
    expect(adminIssueGuard(byId("ПД-1053"), "agent")).toEqual({
      ok: false,
      reason: "Недостаточно прав",
    });
  });

  it("keeps submission content editing agent-only and status-gated", () => {
    expect(canEditSubmissionContent(byId("ПД-1048"), "agent")).toBe(true);
    expect(canEditSubmissionContent(byId("ПД-1048"), "admin")).toBe(false);
    expect(canEditSubmissionContent(byId("ПД-1053"), "agent")).toBe(false);
  });

  it("keeps admin review tab status selection outside React screens", () => {
    const base = byId("ПД-1053");
    const statuses: SubmissionStatus[] = [
      "draft",
      "in_progress",
      "submitted_for_review",
      "returned",
      "corrections_received",
      "ready_for_export",
      "exported",
    ];
    const matchingStatuses = (tab: Parameters<typeof matchesReviewTab>[0]) =>
      statuses.filter((status) => matchesReviewTab(tab)({ ...base, status }));

    expect(matchingStatuses("all")).toEqual([
      "submitted_for_review",
      "corrections_received",
    ]);
    expect(matchingStatuses("review")).toEqual(["submitted_for_review"]);
    expect(matchingStatuses("corrections")).toEqual(["corrections_received"]);
    expect(matchingStatuses("ready")).toEqual(["ready_for_export"]);
  });

  it("keeps admin work presentation decisions outside React screens", () => {
    expect(adminWorkDrawerTabFor(byId("ПД-1053"))).toBe("overview");
    expect(adminWorkDrawerTabFor(byId("ПД-1055"))).toBe("issues");
    expect(adminWorkPresentation(byId("ПД-1053"))).toEqual({
      actionLabel: "Открыть",
      stage: "Новая проверка",
      tone: "info",
    });
    expect(adminWorkPresentation(byId("ПД-1055"))).toEqual({
      actionLabel: "Проверить",
      stage: "Исправления",
      tone: "warning",
    });
    expect(adminWorkPresentation(byId("ПД-1056"))).toEqual({
      actionLabel: "Пакет",
      stage: "К выгрузке",
      tone: "success",
    });
    expect(adminWorkEventTitle(byId("ПД-1055"), "fallback")).toBe(
      "Исправления получены",
    );
    expect(adminWorkEventTitle(byId("ПД-1053"), "fallback")).toBe(
      "Новая подача на проверке",
    );
    expect(adminWorkEventTitle(byId("ПД-1056"), "fallback")).toBe(
      "Подача принята к выгрузке",
    );
    expect(adminWorkEventTitle(byId("ПД-1048"), "fallback")).toBe("fallback");
  });
});

describe("V-19 export rules", () => {
  it("exports one row per applicant and keeps family rows together", () => {
    const rows = buildExportRows([byId("ПД-1048")]);
    expect(rows).toHaveLength(4);
    expect(rows.map((row) => row.submissionId)).toEqual([
      "ПД-1048",
      "ПД-1048",
      "ПД-1048",
      "ПД-1048",
    ]);
  });

  it("allows a single ready submission", () => {
    expect(getExportBlockers([readyClone({ id: "ПД-1056" })])).toEqual([]);
  });

  it("builds the export mapping audit from the actual 56-column contract", () => {
    const summary = exportSummary([readyClone({ id: "ПД-1056" })]);
    const audit = buildExportMappingAudit(summary.preview);

    expect(audit.rows).toHaveLength(56);
    expect(audit).toMatchObject({
      mappedCount: 53,
      derivedCount: 3,
      unresolvedCount: 0,
    });
    expect(audit.rows.filter((row) => row.state === "unresolved")).toEqual([]);
    expect(audit.rows.find((row) => row.header === "Visa Sub Type")).toMatchObject({
      state: "mapped",
    });
    expect(
      audit.rows.find((row) => row.header === "Nationality At Birth"),
    ).toMatchObject({
      state: "mapped",
    });
  });

  it("blocks export when trip dates are missing", () => {
    const blockers = getExportBlockers([
      readyClone({
        id: "ПД-БЕЗ-ДАТ",
        tripDateFrom: "не указано",
        tripDateTo: "",
      }),
    ]).map((blocker) => blocker.reason);

    expect(blockers).toContain("В выборке есть подачи без дат поездки");
  });

  it("exports only ready_for_export submissions", () => {
    for (const status of [
      "submitted_for_review",
      "returned",
      "corrections_received",
      "exported",
    ] as const) {
      const blocked = readyClone({
        id: `ПД-${status}`,
        exportState: status === "exported" ? "marked_exported" : "ready",
        status,
      });
      const summary = exportSummary([blocked]);

      expect(summary).toMatchObject({
        canGenerate: false,
        canDownload: false,
        canMarkExported: false,
        ready: false,
      });
      expect(summary.blockers.map((blocker) => blocker.reason)).toContain(
        status === "exported"
          ? "В выборке есть уже выгруженные подачи"
          : "В выборке есть подачи не готовые к выгрузке",
      );
    }
  });

  it("normalizes legacy statuses before export decisions", () => {
    const legacyReady = readyClone({
      id: "ПД-LEGACY-READY",
      status: "ready_for_excel" as Submission["status"],
    });

    expect(exportSummary([legacyReady])).toMatchObject({
      canGenerate: true,
      ready: true,
      rowCount: 1,
    });
  });

  it("treats legacy terminal statuses with exported timestamp as exported", () => {
    const legacyExported = {
      ...readyClone({
        id: "ПД-LEGACY-EXPORTED",
        status: "completed" as Submission["status"],
      }),
      exportedAt: "2026-06-26T10:00:00.000Z",
    } as Submission;

    expect(
      exportSummary([legacyExported]).blockers.map((blocker) => blocker.reason),
    ).toContain("В выборке есть уже выгруженные подачи");
    expect(exportSummary([legacyExported])).toMatchObject({
      canGenerate: false,
      ready: false,
    });
  });

  it("blocks export when legacy media remains attached to a canonical package", () => {
    const canonical = readyClone({ id: "ПД-LEGACY-ATTACHED" });
    const applicantId = canonical.applicants[0]?.id ?? "applicant-1";
    const withLegacyMedia: Submission = {
      ...canonical,
      files: [
        ...canonical.files,
        {
          applicantId,
          id: "legacy-photo",
          status: "accepted",
          type: "photo",
        },
      ],
    };

    expect(
      exportSummary([withLegacyMedia]).blockers.map((blocker) => blocker.reason),
    ).toContain("В выборке есть подачи без полного канонического пакета медиа");
    expect(exportSummary([withLegacyMedia])).toMatchObject({
      canGenerate: false,
      ready: false,
    });
  });

  it("does not let legacy media satisfy export readiness", () => {
    const applicantId = readyClone({}).applicants[0]?.id ?? "applicant-1";
    const legacyMediaOnly = readyClone({
      id: "ПД-LEGACY-MEDIA",
      files: [
        {
          applicantId,
          id: "legacy-photo",
          status: "accepted",
          type: "photo",
        },
        {
          applicantId,
          id: "legacy-photo-white",
          status: "accepted",
          type: "photo_white",
        },
        {
          applicantId,
          id: "legacy-video",
          status: "accepted",
          type: "video",
        },
      ],
    });

    expect(
      exportSummary([legacyMediaOnly]).blockers.map((blocker) => blocker.reason),
    ).toContain("В выборке есть подачи без полного канонического пакета медиа");
    expect(exportSummary([legacyMediaOnly])).toMatchObject({
      canGenerate: false,
      ready: false,
    });
  });

  it("blocks mixed city, owner agent, trip date, and already exported packages", () => {
    const blockers = getExportBlockers([
      readyClone({ id: "ПД-1056" }),
      readyClone({ id: "ПД-ГОРОД", city: "Казань" }),
      readyClone({ agentId: alternateLocalAgentOwnerId, id: "ПД-ДРУГОЙ-АГЕНТ" }),
      readyClone({ id: "ПД-ДАТА", tripDateFrom: "10.10", tripDateTo: "20.10" }),
      readyClone({ id: "ПД-СЕМЬЯ", type: "family" }),
      byId("ПД-1057"),
    ]).map((blocker) => blocker.reason);

    expect(blockers).toContain("В выборке есть подачи не готовые к выгрузке");
    expect(blockers).toContain("В выборке есть уже выгруженные подачи");
    expect(blockers).toContain("Нельзя смешивать разные города");
    expect(blockers).not.toContain("Нельзя смешивать разные даты поездки");
    expect(blockers).not.toContain("Нельзя смешивать одинарные и семейные подачи");
    expect(
      getExportWarnings([
        readyClone({ id: "ПД-1056" }),
        readyClone({ id: "ПД-ДАТА", tripDateFrom: "10.10", tripDateTo: "20.10" }),
      ]).map((warning) => warning.reason),
    ).toContain(
      "В одном городе разные даты поездки. Excel и ZIP доступны, проверьте слот/дату перед BLS выгрузкой.",
    );
  });

  it("allows one city export batch to mix family and single submissions", () => {
    const submissions = [
      readyClone({ id: "ПД-1056" }),
      readyClone({ id: "ПД-СЕМЬЯ", type: "family" }),
    ];
    const summary = exportSummary(submissions);
    const generated = applyExportStateToSelection(
      submissions,
      ["ПД-1056", "ПД-СЕМЬЯ"],
      "file_generated",
    );

    expect(summary).toMatchObject({
      canGenerate: true,
      ready: true,
      rowCount: 2,
    });
    expect(summary.rows.map((row) => row.submissionId)).toEqual([
      "ПД-СЕМЬЯ",
      "ПД-1056",
    ]);
    expect(generated).not.toBe(submissions);
    expect(generated[0]?.exportState).toBe("file_generated");
    expect(generated[1]?.exportState).toBe("file_generated");
  });

  it("keeps download and exported actions locked to the generated selection", () => {
    const submissions = [
      readyClone({ id: "ПД-1056" }),
      readyClone({ id: "ПД-1058", title: "Вторая готовая подача" }),
    ];
    const generated = applyExportStateToSelection(
      submissions,
      ["ПД-1056"],
      "file_generated",
    );

    expect(generated[0]?.exportPackage).toMatchObject({
      contentFingerprint: expect.stringContaining("ПД-1056"),
      fileName: expect.stringMatching(/^visaflow-export-.+\.xlsx$/),
      format: "xlsx",
      rowCount: 1,
      submissionIds: ["ПД-1056"],
    });
    expect(exportSummary([generated[0]])).toMatchObject({
      canDownload: true,
      canGenerate: false,
      canMarkExported: false,
    });
    expect(exportSummary([generated[1]])).toMatchObject({
      canDownload: false,
      canGenerate: true,
      canMarkExported: false,
    });
    expect(
      exportSummary(generated).blockers.map((blocker) => blocker.reason),
    ).toContain("В выборке разные состояния выгрузки");
  });

  it("rebuilds export readiness from current selected ids before async state changes", () => {
    const submissions = [
      readyClone({ id: "ПД-1056" }),
      readyClone({ id: "ПД-1058", title: "Вторая готовая подача" }),
    ];
    const initialSubmission = submissions[0];
    const currentSubmission = submissions[1];
    if (!initialSubmission || !currentSubmission) {
      throw new Error("Missing export fixtures");
    }

    const initialPlan = exportSummaryForSelectedIds(submissions, ["ПД-1056"]);
    const currentPlan = exportSummaryForSelectedIds(submissions, ["ПД-1058"]);
    const initialIdentity = buildExportPackageIdentity([initialSubmission]);
    const currentIdentity = buildExportPackageIdentity([currentSubmission]);
    if (!initialIdentity || !currentIdentity) {
      throw new Error("Missing export package identity");
    }

    expect(initialPlan).toMatchObject({
      canGenerate: true,
      canDownload: false,
      rowCount: 1,
    });
    expect(currentPlan).toMatchObject({
      canGenerate: true,
      canDownload: false,
      rowCount: 1,
    });
    expect(exportPackageIdentityMatches(initialIdentity, currentIdentity)).toBe(false);
  });

  it("keeps export state unchanged for invalid package generation attempts", () => {
    const submissions = [
      readyClone({ id: "ПД-1056" }),
      readyClone({ id: "ПД-ГОРОД", city: "Казань" }),
      byId("ПД-1051"),
    ];

    expect(
      applyExportStateToSelection(
        submissions,
        ["ПД-1056", "ПД-ГОРОД"],
        "file_generated",
      ),
    ).toBe(submissions);
    expect(
      applyExportStateToSelection(submissions, ["ПД-1051"], "file_generated"),
    ).toBe(submissions);
  });

  it("fails closed when a ready selection cannot produce safe export rows", () => {
    const noApplicants = readyClone({
      id: "ПД-БЕЗ-ЗАЯВИТЕЛЕЙ",
      applicants: [],
    });
    const blankApplicantName = readyClone({
      id: "ПД-БЕЗ-ФИО",
      applicants: [
        {
          ...byId("ПД-1056").applicants[0]!,
          fullName: " ",
        },
      ],
    });
    const noApplicantSelection = [noApplicants];

    expect(exportSummary([noApplicants])).toMatchObject({
      rowCount: 0,
      ready: false,
      canGenerate: false,
      canDownload: false,
      canMarkExported: false,
    });
    expect(
      exportSummary([noApplicants]).blockers.map((blocker) => blocker.reason),
    ).toContain("В выборке есть подачи без заявителей");
    expect(
      applyExportStateToSelection(
        noApplicantSelection,
        ["ПД-БЕЗ-ЗАЯВИТЕЛЕЙ"],
        "file_generated",
      ),
    ).toBe(noApplicantSelection);

    expect(
      exportSummary([blankApplicantName]).blockers.map((blocker) => blocker.reason),
    ).toContain("В строках выгрузки есть заявители без ФИО");
    expect(exportSummary([blankApplicantName])).toMatchObject({
      ready: false,
      canGenerate: false,
    });
  });

  it("keeps download state locked until the selected package is generated", () => {
    const submissions = [
      fillRequiredQuestionnaireForTest(readyClone({ id: "ПД-1056" })),
    ];

    expect(
      applyExportStateToSelection(submissions, ["ПД-1056"], "file_downloaded"),
    ).toBe(submissions);

    const generated = applyExportStateToSelection(
      submissions,
      ["ПД-1056"],
      "file_generated",
    );
    const downloaded = applyExportStateToSelection(
      generated,
      ["ПД-1056"],
      "file_downloaded",
    );

    expect(downloaded[0]?.exportState).toBe("file_downloaded");
    expect(downloaded[0]?.exportPackage).toEqual(generated[0]?.exportPackage);
    expect(generated[0]?.updatedAt).toBe("сейчас");
    expect(downloaded[0]?.updatedAt).toBe("сейчас");
    const exportDraftPayload = toCockpitDraftPersistencePayload(
      downloaded[0]!,
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
      "admin",
    );
    const persistedUpdatedAt = exportDraftPayload.submission.updated_at;
    if (typeof persistedUpdatedAt !== "string") {
      throw new Error("Expected export persistence timestamp.");
    }
    expect(Date.parse(persistedUpdatedAt)).not.toBeNaN();
    expect(exportDraftPayload.submission.accepted_at).toBe(
      persistedUpdatedAt,
    );
    expect(
      readCockpitSnapshot(
        exportDraftPayload.submission.family_intelligence as Json,
      )?.updatedAt,
    ).toBe("сейчас");
    expect(generated[0]?.history).toEqual(submissions[0]?.history);
    expect(downloaded[0]?.history).toEqual(submissions[0]?.history);
    expect(
      downloaded[0]?.history.some((item) => item.id.includes("-export-file_")),
    ).toBe(false);
  });

  it("blocks download and export when generated package content becomes stale", () => {
    const generated = applyExportStateToSelection(
      [readyClone({ id: "ПД-1056" })],
      ["ПД-1056"],
      "file_generated",
    );
    const generatedSubmission = generated[0];
    if (!generatedSubmission) throw new Error("Missing generated submission");
    const staleGenerated = [
      { ...generatedSubmission, title: "Изменено после генерации" },
    ];

    expect(exportSummary(staleGenerated)).toMatchObject({
      canDownload: false,
      canGenerate: true,
      canMarkExported: false,
    });
    expect(
      exportSummary(staleGenerated).blockers.map((blocker) => blocker.reason),
    ).toContain("Выбор изменился. Сформируйте Excel заново");
    expect(
      applyExportStateToSelection(staleGenerated, ["ПД-1056"], "file_downloaded"),
    ).toBe(staleGenerated);

    const downloaded = applyExportStateToSelection(
      generated,
      ["ПД-1056"],
      "file_downloaded",
    );
    const downloadedSubmission = downloaded[0];
    if (!downloadedSubmission) throw new Error("Missing downloaded submission");
    const staleDownloaded = [
      { ...downloadedSubmission, title: "Изменено после скачивания" },
    ];

    expect(markSelectedExported(staleDownloaded, ["ПД-1056"])).toBe(staleDownloaded);
  });

  it("keeps exported state locked until the selected package is downloaded", () => {
    const submissions = [readyClone({ id: "ПД-1056" })];

    expect(markSelectedExported(submissions, ["ПД-1056"])).toBe(submissions);

    const generated = applyExportStateToSelection(
      submissions,
      ["ПД-1056"],
      "file_generated",
    );
    expect(markSelectedExported(generated, ["ПД-1056"])).toBe(generated);

    const downloaded = applyExportStateToSelection(
      generated,
      ["ПД-1056"],
      "file_downloaded",
    );
    expect(markSelectedExported(downloaded, ["ПД-1056"])[0]?.status).toBe("exported");
  });
});

describe("V-19 submission actions", () => {
  it("derives agent action queue from submission state", () => {
    const queue = agentActionQueue(
      agentQueue(initialSubmissions, defaultLocalAgentOwnerId),
    );

    expect(queue.summary).toMatchObject({
      open: 6,
      overdue: 1,
      today: 3,
      week: 4,
    });
    expect(queue.open[0]).toMatchObject({
      cta: "Исправить",
      severity: "blocker",
      tab: "files",
    });
    expect(queue.open.some((action) => action.context.includes("Заполнить"))).toBe(
      true,
    );
    expect(queue.open.some((action) => action.title.includes("Заполнить"))).toBe(false);
    expect(queue.open.some((action) => action.cta === "Добавить")).toBe(true);
  });

  it("shows one next missing-file action per applicant instead of duplicate rows", () => {
    const queue = agentActionQueue([byId("ПД-1051")]);
    const missingFileActions = queue.open.filter((action) =>
      action.id.startsWith("missing-file-"),
    );

    expect(missingFileActions).toHaveLength(1);
    expect(missingFileActions[0]).toMatchObject({
      context: "Добавить селфи 1",
      title: "Артём Соколов",
    });
  });

  it.each<{
    completedCount: number;
    openCount: number;
    status: SubmissionStatus;
  }>([
    { completedCount: 0, openCount: 2, status: "draft" },
    { completedCount: 0, openCount: 2, status: "in_progress" },
    { completedCount: 0, openCount: 2, status: "returned" },
    { completedCount: 1, openCount: 0, status: "submitted_for_review" },
    { completedCount: 1, openCount: 0, status: "corrections_received" },
    { completedCount: 1, openCount: 0, status: "ready_for_export" },
    { completedCount: 1, openCount: 0, status: "exported" },
    { completedCount: 0, openCount: 0, status: "requires_action" },
  ])(
    "derives open and closed agent queues for partial data in $status",
    ({ completedCount, openCount, status }) => {
      const source = byId("ПД-1053");
      const submission: Submission = {
        ...source,
        id: `queue-matrix-${status}`,
        status,
        applicants: source.applicants.map((applicant, index) =>
          index === 0
            ? { ...applicant, questionnaireStatus: "partial" }
            : applicant,
        ),
        files: source.files.map((file, index) =>
          index === 0 ? { ...file, status: "missing" } : file,
        ),
      };
      const queue = agentActionQueue([submission]);

      expect(queue.open).toHaveLength(openCount);
      expect(queue.completed).toHaveLength(completedCount);
      expect(queue.open.every((action) => action.completed === false)).toBe(true);
      expect(queue.completed.every((action) => action.completed === true)).toBe(
        true,
      );
      if (status === "exported") {
        expect(queue.completed[0]).toMatchObject({
          context: "Пакет выгружен",
          cta: "Смотреть",
          tab: "history",
        });
      }
    },
  );

  it("derives agent action tasks with status, reason, readiness, and fail-closed export CTA", () => {
    const queue = agentActionQueue(
      agentQueue(initialSubmissions, defaultLocalAgentOwnerId),
    );
    const tasks = buildAgentActionTasks([...queue.open, ...queue.completed]);

    const fileErrorTask = tasks.find((task) => task.id.startsWith("replace-"));
    expect(fileErrorTask).toMatchObject({
      nextAction: {
        detail: "Заменить файл «селфи 1».",
        label: "Заменить селфи 1",
        primaryLabel: "Заменить файл",
        tab: "files",
        target: "files",
      },
      priority: {
        label: "Срочно",
        reason: "Дедлайн сегодня",
        source: "deadline",
      },
      problem: "Файлы не готовы",
      problemDetail: "Файл «селфи 1» требует замены.",
      problemScope: "applicant",
      progressSummary: {
        files: "Файлы 4/6",
        form: "Анкета с ошибками",
        review: "Проверка ожидает",
      },
      status: "error",
      statusLabel: "Требует исправления",
      statusLine: "Требует исправления: файлы не готовы",
    });
    expect(fileErrorTask?.importanceText).toBe("Без этого подачу нельзя продолжить.");
    expect(fileErrorTask?.reason).toContain("файл требует замены");
    expect(fileErrorTask?.readiness.files.label).toContain("Файлы:");
    expect(fileErrorTask?.readiness.finalResult.label).toBe(
      "Итог: нельзя продолжить",
    );

    const questionnaireTask = tasks.find((task) => task.id.startsWith("questionnaire-"));
    expect(questionnaireTask).toMatchObject({
      nextAction: { label: "Открыть анкету", tab: "questionnaire", target: "form" },
      priority: { label: "Срочно", reason: "Дедлайн сегодня" },
      problem: "Анкета заполнена не полностью",
      status: "action_required",
      statusLabel: "Требует действия",
      statusLine: "Требует действия: анкета неполная",
    });

    const exportReadyTask = tasks.find(
      (task) => task.submission.status === "ready_for_export",
    );
    expect(exportReadyTask).toMatchObject({
      nextAction: {
        label: "Открыть статус выгрузки",
        primaryLabel: "Проверить статус",
        tab: "history",
        target: "history",
      },
      problem: "Подача готова к выгрузке",
      priority: { label: "", reason: "", source: "none" },
      problemScope: "submission",
      status: "ready",
      statusLabel: "Готово",
      statusLine: "Готово: можно выгружать",
    });
    expect(exportReadyTask?.reason).toContain("агентских прав на выгрузку нет");
  });

  it("derives admin work events and action queues from review and export states", () => {
    const queue = adminActionQueue(initialSubmissions);
    const workEvents = adminWorkEvents(initialSubmissions);

    expect(queue.summary.open).toBe(queue.open.length);
    expect(queue.summary.completed).toBe(queue.completed.length);
    expect(queue.open.map((action) => action.title)).toEqual(
      expect.arrayContaining([
        "Проверить пакет",
        "Проверить исправления",
        "Проверить пакет выгрузки",
      ]),
    );
    expect(queue.completed).toHaveLength(1);
    expect(queue.completed[0]).toMatchObject({
      cta: "История",
      tab: "history",
      title: "Пакет выгружен",
    });
    expect(queue.open.some((action) => action.cta === "Добавить")).toBe(false);
    expect(queue.open.some((action) => action.cta === "Исправить")).toBe(false);
    expect(workEvents.map((event) => event.badge)).toEqual(
      expect.arrayContaining(["Проверка", "Исправления", "К выгрузке"]),
    );
    expect(workEvents.every((event) => event.id.startsWith("admin-work-"))).toBe(true);
  });

  it("derives submit corrections only after all targeted file replacements are uploaded", () => {
    const returned = byId("ПД-1048");
    const selfieFile = returned.files.find(
      (file) => file.applicantId === "з-1048-1" && file.type === "selfie",
    );
    const passportFile = returned.files.find(
      (file) => file.applicantId === "з-1048-3" && file.type === "passport_scan",
    );
    if (!selfieFile || !passportFile) throw new Error("Missing replacement files");

    expect(canPerformAction(returned, "submit_corrections", "agent")).toEqual({
      ok: false,
      reason: "Сначала отметьте замечания исправленными",
    });

    const withSelfieReplacement = applyUploadedFileMetadata(returned, selfieFile.id, {
      generatedFileName: "v19replacement_selfie.jpg",
      mimeType: "image/jpeg",
      originalFileName: "selfie-fixed.jpg",
      sizeBytes: 180_000,
      storageBucket: "submission-media",
      storagePath: "ПД-1048/з-1048-1/selfie/v19replacement_selfie.jpg",
      uploadedAtIso: "2026-06-21T10:00:00.000Z",
    });

    expect(
      withSelfieReplacement.files.find((file) => file.id === selfieFile.id),
    ).toMatchObject({
      originalFileName: "selfie-fixed.jpg",
      reviewStatus: "not_reviewed",
      reviewedBy: undefined,
      status: "uploaded",
    });
    expect(
      canPerformAction(withSelfieReplacement, "submit_corrections", "agent"),
    ).toEqual({
      ok: false,
      reason: "Сначала отметьте замечания исправленными",
    });

    const withAllReplacements = applyUploadedFileMetadata(
      withSelfieReplacement,
      passportFile.id,
      {
        generatedFileName: "v19replacement_passport_scan.pdf",
        mimeType: "application/pdf",
        originalFileName: "passport-fixed.pdf",
        sizeBytes: 420_000,
        storageBucket: "submission-media",
        storagePath: "ПД-1048/з-1048-3/passport_scan/v19replacement_passport_scan.pdf",
        uploadedAtIso: "2026-06-21T10:01:00.000Z",
      },
    );
    expect(
      canPerformAction(withAllReplacements, "submit_corrections", "agent"),
    ).toEqual({ ok: true });

    const withExtractedPassport = finishPassportExtraction(
      withAllReplacements,
      withAllReplacements.files.find((file) => file.id === passportFile.id) ??
        passportFile,
      {
        fields: [
          {
            confidence: "high",
            key: "passportType",
            needsManualReview: true,
            value: "Ordinary Passport",
          },
          {
            confidence: "high",
            key: "passportNumber",
            needsManualReview: true,
            value: "778194571",
          },
        ],
        guardrails: [],
        source: "local-ocr",
        status: "extracted",
        summary: "Паспорт подтвержден.",
      },
    );
    const withVerifiedPassport = markPassportExtractionReviewed(
      withExtractedPassport,
      "verified",
    );

    expect(
      canPerformAction(withVerifiedPassport, "submit_corrections", "agent"),
    ).toEqual({
      ok: true,
    });

    const withFixedIssues = withVerifiedPassport;
    const queue = agentActionQueue([withFixedIssues]);

    expect(
      canPerformAction(withFixedIssues, "submit_corrections", "agent"),
    ).toEqual({
      ok: true,
    });
    expect(queue.open).toHaveLength(1);
    expect(queue.open[0]).toMatchObject({
      context: "Отправить исправления",
      cta: "Отправить",
      tab: "issues",
      title: "Ивановы",
    });

    const submittedCorrections = applySubmissionAction(
      withFixedIssues,
      "submit_corrections",
      "agent",
    );

    expect(submittedCorrections.status).toBe("corrections_received");
    expect(submittedCorrections.issues.map((issue) => issue.status)).toEqual([
      "fixed_by_agent",
      "fixed_by_agent",
    ]);
  });

  it("keeps the local agent queue scoped to the current owner", () => {
    const defaultAgentTitles = agentQueue(
      initialSubmissions,
      defaultLocalAgentOwnerId,
    ).map((submission) => submission.title);
    const alternateAgentTitles = agentQueue(
      initialSubmissions,
      alternateLocalAgentOwnerId,
    ).map((submission) => submission.title);

    expect(defaultAgentTitles).toContain("Семья Ивановых");
    expect(defaultAgentTitles).not.toContain("Ольга Фролова");
    expect(defaultAgentTitles).not.toContain("Ольга Морозова");
    expect(alternateAgentTitles).toEqual(["Ольга Фролова", "Ольга Морозова"]);
  });

  it("creates a Spain-only family draft inside the submission model", () => {
    const draft = createDraftSubmission({
      city: "Казань",
      familyCount: 3,
      submissions: initialSubmissions,
      type: "family",
    });

    expect(draft.country).toBe("Испания");
    expect(draft.agentId).toBe(defaultLocalAgentOwnerId);
    expect(draft.city).toBe("Казань");
    expect(draft.type).toBe("family");
    expect(draft.status).toBe("draft");
    expect(draft.applicants).toHaveLength(3);
    expect(draft.files).toHaveLength(9);
    expect(draft.history[0].source).toBe("agent");
  });

  it("assigns a draft to the explicit current agent owner", () => {
    const draft = createDraftSubmission({
      agentId: alternateLocalAgentOwnerId,
      city: "Москва",
      familyCount: 1,
      submissions: initialSubmissions,
      type: "single",
    });

    expect(draft.agentId).toBe(alternateLocalAgentOwnerId);
  });

  it("applies preliminary family intake to the detailed questionnaire", () => {
    const draft = createDraftSubmission({
      city: "Москва",
      familyCount: 3,
      preliminaryIntake: {
        arrivalPlace: "Москва, Барселона, Москва",
        homeAddress: "AKADEMIKA KOROLEVA STREET 4 1 149",
        sameArrivalPlace: true,
        sameHomeAddress: true,
        sameSpainStay: true,
        sameTripDates: true,
        spainStayAddress: "CALLE RAMON TUR 196-198",
        spainStayCity: "BARCELONA",
        spainStayName: "HOTEL ILUNION BARCELONA",
        tripDateFrom: "19.08.2026",
        tripDateTo: "27.08.2026",
      },
      submissions: initialSubmissions,
      type: "family",
    });

    expect(draft.tripDateFrom).toBe("19.08.2026");
    expect(draft.tripDateTo).toBe("27.08.2026");
    expect(questionnaireValue(draft, "home-address", 2)).toBe(
      "AKADEMIKA KOROLEVA STREET 4 1 149",
    );
    expect(questionnaireValue(draft, "arrival-date", 1)).toBe("19.08.2026");
    expect(questionnaireValue(draft, "departure-date", 1)).toBe("27.08.2026");
    expect(questionnaireValue(draft, "hotel-name", 2)).toBe("HOTEL ILUNION BARCELONA");
    expect(questionnaireValue(draft, "hotel-address", 2)).toBe(
      "CALLE RAMON TUR 196-198",
    );
    expect(questionnaireValue(draft, "first-entry-country", 2)).toBe(
      "Москва, Барселона, Москва",
    );
    expect(draft.applicants[0]?.questionnaireStatus).toBe("partial");
  });

  it("creates ASCII ids for Supabase cockpit drafts and storage paths", () => {
    const draft = createDraftSubmission({
      city: "Москва",
      familyCount: 2,
      idScheme: "supabase",
      submissions: initialSubmissions,
      type: "single",
    });

    const supabaseDraftToken = /\d+-[a-z0-9]+-[a-z0-9]+-[a-z0-9]+/;
    expect(draft.id).toMatch(new RegExp(`^VF-${supabaseDraftToken.source}$`));
    expect(draft.applicants[0]?.id).toMatch(
      new RegExp(`^app-${supabaseDraftToken.source}-1$`),
    );
    expect(draft.files[0]?.id).toMatch(
      new RegExp(`^file-${supabaseDraftToken.source}-1-1$`),
    );
  });

  it("creates globally unique Supabase draft ids without relying on the local list", () => {
    const first = createDraftSubmission({
      city: "Москва",
      familyCount: 1,
      idScheme: "supabase",
      submissions: [],
      type: "single",
    });
    const second = createDraftSubmission({
      city: "Москва",
      familyCount: 1,
      idScheme: "supabase",
      submissions: [],
      type: "single",
    });

    expect(second.id).not.toBe(first.id);
    expect(second.applicants[0]?.id).not.toBe(first.applicants[0]?.id);
    expect(second.files[0]?.id).not.toBe(first.files[0]?.id);
  });

  it("generates a new safe storage file name for each Supabase upload attempt", () => {
    const first = generatedCockpitMediaFileName({
      applicantId: "app-1059-1",
      fileType: "selfie_2",
      mimeType: "image/jpeg",
      submissionId: "VF-1059",
      uploadNonce: "2026-06-17T10:00:00.000Z:first",
    });
    const second = generatedCockpitMediaFileName({
      applicantId: "app-1059-1",
      fileType: "selfie_2",
      mimeType: "image/jpeg",
      submissionId: "VF-1059",
      uploadNonce: "2026-06-17T10:00:01.000Z:second",
    });

    expect(first).toMatch(/^v19[a-z0-9]+_selfie_2\.jpg$/);
    expect(second).toMatch(/^v19[a-z0-9]+_selfie_2\.jpg$/);
    expect(second).not.toBe(first);
  });

  it("does not hard-throw for legacy local media slot names", () => {
    expect(mediaSlotTypeForSubmissionFileType("photo")).toBe("photo");
    expect(mediaSlotTypeForSubmissionFileType("photo_white")).toBe("photo_white");
    expect(mediaSlotTypeForSubmissionFileType("video")).toBe("video");
    expect(
      generatedCockpitMediaFileName({
        applicantId: "app-1059-1",
        fileType: "photo",
        mimeType: "image/jpeg",
        submissionId: "VF-1059",
        uploadNonce: "2026-06-17T10:00:00.000Z:legacy-photo",
      }),
    ).toMatch(/^v19[a-z0-9]+_photo\.jpg$/);
    expect(
      generatedCockpitMediaFileName({
        applicantId: "app-1059-1",
        fileType: "photo_white",
        mimeType: "image/png",
        submissionId: "VF-1059",
        uploadNonce: "2026-06-17T10:00:00.000Z:legacy-photo-white",
      }),
    ).toMatch(/^v19[a-z0-9]+_photo_white\.png$/);
    expect(
      generatedCockpitMediaFileName({
        applicantId: "app-1059-1",
        fileType: "video",
        mimeType: "video/mp4",
        submissionId: "VF-1059",
        uploadNonce: "2026-06-17T10:00:00.000Z:legacy",
      }),
    ).toMatch(/^v19[a-z0-9]+_video\.mp4$/);
  });

  it("rejects legacy media slots at the Supabase storage boundary", () => {
    for (const type of ["photo", "photo_white", "video"] as const) {
      expect(() =>
        buildMediaStoragePath("VF-1059", "app-1059-1", type, `v19legacy_${type}.jpg`),
      ).toThrow(/invalid slot type|not canonical/i);
    }

    expect(
      buildMediaStoragePath(
        "VF-1059",
        "app-1059-1",
        "selfie_2",
        "v19canonical_selfie_2.jpg",
      ),
    ).toMatchObject({
      path: "submissions/VF-1059/applicants/app-1059-1/selfie_2/v19canonical_selfie_2.jpg",
    });
  });

  it("fills a draft enough to submit it for review", () => {
    const draft = createDraftSubmission({
      city: "Москва",
      familyCount: 2,
      preliminaryIntake: datedPreliminaryIntake(),
      submissions: initialSubmissions,
      type: "single",
    });
    const filled = uploadRequiredFiles(fillRequiredQuestionnaireForTest(draft));
    const inProgress = applySubmissionAction(filled, "save_progress", "agent");

    expect(canPerformAction(inProgress, "submit_for_review", "agent")).toEqual({
      ok: true,
    });
    const submitted = applySubmissionAction(inProgress, "submit_for_review", "agent");
    expect(submitted.status).toBe("submitted_for_review");
    expect(submitted.files.every((file) => file.status === "pending_review")).toBe(
      true,
    );
    expect(submitted.history[0].source).toBe("agent");
  });

  it("requires a completed passport upload for every family applicant", () => {
    const draft = createDraftSubmission({
      applicantNames: ["IVANOV IVAN", "IVANOVA ANNA"],
      city: "Москва",
      familyCount: 2,
      preliminaryIntake: datedPreliminaryIntake(),
      submissions: initialSubmissions,
      type: "family",
    });
    const filled = uploadRequiredFiles(fillRequiredQuestionnaireForTest(draft));
    const spouse = filled.applicants[1];
    const spousePassport = filled.files.find(
      (file) => file.applicantId === spouse?.id && file.type === "passport_scan",
    );
    if (!spousePassport) throw new Error("Missing spouse passport file");

    for (const uploadStatus of ["failed", "deleted"] as const) {
      const withBrokenPassport = withRecomputedFileCompletion({
        ...filled,
        files: filled.files.map((file) =>
          file.id === spousePassport.id
            ? { ...file, status: "uploaded" as const, uploadStatus }
            : file,
        ),
      });
      const inProgress = applySubmissionAction(
        withBrokenPassport,
        "save_progress",
        "agent",
      );

      expect(withBrokenPassport.completeness.files).toBeLessThan(100);
      expect(withBrokenPassport.applicants[1]?.fileStatus).toBe("partial");
      expect(canPerformAction(inProgress, "submit_for_review", "agent")).toEqual({
        ok: false,
        reason: "Есть незаполненные поля или недостающие файлы",
      });
    }
  });

  it("blocks review submission when extracted passport is expired", () => {
    const draft = createDraftSubmission({
      applicantNames: ["VOLKOV ANTON"],
      city: "Москва",
      familyCount: 1,
      preliminaryIntake: datedPreliminaryIntake(),
      submissions: initialSubmissions,
      type: "single",
    });
    const filled = uploadRequiredFiles(fillRequiredQuestionnaireForTest(draft));
    const passportFile = filled.files.find(
      (file) =>
        file.type === "passport_scan" && file.applicantId === filled.applicants[0]?.id,
    );
    if (!passportFile) throw new Error("Missing passport file");

    const withExpiredPassport = finishPassportExtraction(filled, passportFile, {
      fields: [
        {
          confidence: "high",
          key: "passportType",
          needsManualReview: true,
          value: "Ordinary Passport",
        },
        {
          confidence: "high",
          key: "passportNumber",
          needsManualReview: true,
          value: "752869613",
        },
        {
          confidence: "medium",
          key: "passportIssuedAt",
          needsManualReview: true,
          value: "26.02.2016",
        },
        {
          confidence: "medium",
          key: "passportExpiresAt",
          needsManualReview: true,
          value: "26.02.2026",
        },
      ],
      guardrails: [],
      source: "local-ocr",
      status: "extracted",
      summary: "Локальный OCR нашел паспорт.",
    });
    const inProgress = applySubmissionAction(
      withExpiredPassport,
      "save_progress",
      "agent",
    );

    expect(canPerformAction(inProgress, "submit_for_review", "agent")).toEqual({
      ok: false,
      reason: "Паспорт 752869613 просрочен.",
    });
  });

  it("allows manual review submission when OCR fails after passport upload", () => {
    const draft = createDraftSubmission({
      applicantNames: ["IVANOV IVAN"],
      city: "Москва",
      familyCount: 1,
      preliminaryIntake: datedPreliminaryIntake(),
      submissions: initialSubmissions,
      type: "single",
    });
    const filled = uploadRequiredFiles(fillRequiredQuestionnaireForTest(draft));
    const passportFile = filled.files.find(
      (file) =>
        file.type === "passport_scan" && file.applicantId === filled.applicants[0]?.id,
    );
    if (!passportFile) throw new Error("Missing passport file");

    const withRealPassportUpload = {
      ...filled,
      files: filled.files.map((file) =>
        file.id === passportFile.id
          ? {
              ...file,
              mimeType: "image/jpeg",
              originalFileName: "document.jpg",
              storageBucket: "submission-media",
              storagePath: "submissions/document.jpg",
            }
          : file,
      ),
    };
    const inProgress = applySubmissionAction(
      withRealPassportUpload,
      "save_progress",
      "agent",
    );

    expect(canPerformAction(inProgress, "submit_for_review", "agent")).toEqual({
      ok: false,
      reason: "Скан паспорта не проверен.",
    });

    const failed = failPassportExtraction(inProgress, passportFile, "Не распознано");
    expect(canPerformAction(failed, "submit_for_review", "agent")).toEqual({
      ok: true,
    });
  });

  it("does not allow failed OCR fallback when the passport upload failed", () => {
    const draft = createDraftSubmission({
      applicantNames: ["IVANOV IVAN"],
      city: "Москва",
      familyCount: 1,
      preliminaryIntake: datedPreliminaryIntake(),
      submissions: initialSubmissions,
      type: "single",
    });
    const filled = uploadRequiredFiles(fillRequiredQuestionnaireForTest(draft));
    const passportFile = filled.files.find(
      (file) =>
        file.type === "passport_scan" && file.applicantId === filled.applicants[0]?.id,
    );
    if (!passportFile) throw new Error("Missing passport file");

    const brokenUpload = withRecomputedFileCompletion({
      ...filled,
      files: filled.files.map((file) =>
        file.id === passportFile.id
          ? { ...file, status: "uploaded" as const, uploadStatus: "failed" as const }
          : file,
      ),
    });
    const inProgress = applySubmissionAction(brokenUpload, "save_progress", "agent");
    const failedExtraction = failPassportExtraction(
      inProgress,
      { ...passportFile, uploadStatus: "failed" },
      "Не распознано",
    );

    expect(canPerformAction(failedExtraction, "submit_for_review", "agent")).toEqual({
      ok: false,
      reason: "Есть незаполненные поля или недостающие файлы",
    });
  });

  it("uploads one file without marking the whole package complete", () => {
    const draft = createDraftSubmission({
      city: "Москва",
      familyCount: 2,
      submissions: initialSubmissions,
      type: "single",
    });
    const firstFile = draft.files[0];
    if (!firstFile) throw new Error("Missing draft file");

    const updated = uploadRequiredFile(fillRequiredQuestionnaireForTest(draft), firstFile.id);

    expect(updated.files[0]?.status).toBe("uploaded");
    expect(updated.completeness.files).toBe(33);
    expect(updated.applicants[0]?.fileStatus).toBe("partial");
    const inProgress = applySubmissionAction(updated, "save_progress", "agent");

    expect(canPerformAction(inProgress, "submit_for_review", "agent")).toEqual({
      ok: false,
      reason: "Есть незаполненные поля или недостающие файлы",
    });
  });

  it("merges uploaded media metadata without dropping concurrent submission edits", () => {
    const draft = fillRequiredQuestionnaireForTest(
      createDraftSubmission({
        city: "Москва",
        familyCount: 1,
        submissions: initialSubmissions,
        type: "single",
      }),
    );
    const firstFile = draft.files[0];
    if (!firstFile) throw new Error("Missing draft file");
    const editedDuringUpload = {
      ...draft,
      title: "Edited while upload was in flight",
    };

    const updated = applyUploadedFileMetadata(editedDuringUpload, firstFile.id, {
      generatedFileName: "v19abc123_passport_scan.jpg",
      mimeType: "image/jpeg",
      originalFileName: "passport-scan.jpg",
      sizeBytes: 2048,
      storageBucket: "submission-media",
      storagePath: `${draft.id}/${firstFile.applicantId}/passport_scan/v19abc123_passport_scan.jpg`,
      uploadedAtIso: "2026-06-17T10:00:00.000Z",
    });

    expect(updated.title).toBe("Edited while upload was in flight");
    expect(updated.files[0]).toMatchObject({
      generatedFileName: "v19abc123_passport_scan.jpg",
      originalFileName: "passport-scan.jpg",
      status: "uploaded",
      storageBucket: "submission-media",
      uploadStatus: "uploaded",
    });
  });

  it("commits uploaded media metadata into the latest submission after remote save resolves", () => {
    const draft = fillRequiredQuestionnaireForTest(
      createDraftSubmission({
        city: "Москва",
        familyCount: 1,
        submissions: initialSubmissions,
        type: "single",
      }),
    );
    const firstFile = draft.files[0];
    if (!firstFile) throw new Error("Missing draft file");
    const metadata = {
      generatedFileName: "v19late01_passport_scan.jpg",
      mimeType: "image/jpeg",
      originalFileName: "late-edit-passport.jpg",
      sizeBytes: 4096,
      storageBucket: "submission-media",
      storagePath: `${draft.id}/${firstFile.applicantId}/passport_scan/v19late01_passport_scan.jpg`,
      uploadedAtIso: "2026-06-17T11:00:00.000Z",
    };
    const savedBeforeLateEdit = applyUploadedFileMetadata(
      draft,
      firstFile.id,
      metadata,
    );
    const editedWhileSaveWasPending = {
      ...draft,
      title: "Edited while remote save was pending",
    };

    const result = mergeUploadedFileMetadataIntoSubmissions(
      [editedWhileSaveWasPending],
      savedBeforeLateEdit.id,
      firstFile.id,
      metadata,
    );

    expect(result.submission?.title).toBe("Edited while remote save was pending");
    expect(result.submissions[0]).toBe(result.submission);
    expect(result.submission?.files[0]).toMatchObject({
      generatedFileName: "v19late01_passport_scan.jpg",
      originalFileName: "late-edit-passport.jpg",
      status: "uploaded",
      storageBucket: "submission-media",
      storagePath: `${draft.id}/${firstFile.applicantId}/passport_scan/v19late01_passport_scan.jpg`,
      uploadStatus: "uploaded",
    });
  });

  it("keeps replacement passport upload metadata available for immediate OCR review", () => {
    const returned = byId("ПД-1048");
    const passportFile = returned.files.find(
      (file) => file.applicantId === "з-1048-3" && file.type === "passport_scan",
    );
    if (!passportFile) throw new Error("Missing Sofia passport replacement file");
    const metadata = {
      generatedFileName: "v19sofia_passport_scan.jpg",
      mimeType: "image/jpeg",
      originalFileName: "sofia-passport-live.jpg",
      sizeBytes: 1_340_672,
      storageAdapter: "local-dev" as const,
      storageBucket: "",
      storagePath: "",
      uploadedAtIso: "2026-07-01T01:00:00.000Z",
    };

    const result = mergeUploadedFileMetadataIntoSubmissions(
      [returned],
      returned.id,
      passportFile.id,
      metadata,
    );
    const updatedSubmission = result.submission;
    const uploadedPassport = updatedSubmission?.files.find(
      (file) => file.id === passportFile.id,
    );
    if (!updatedSubmission || !uploadedPassport) {
      throw new Error("Expected uploaded passport replacement");
    }

    const withExtractedPassport = finishPassportExtraction(
      updatedSubmission,
      uploadedPassport,
      {
        fields: [
          {
            confidence: "high",
            key: "surname",
            needsManualReview: true,
            value: "VOLKOV",
          },
          {
            confidence: "high",
            key: "firstName",
            needsManualReview: true,
            value: "ANTON",
          },
          {
            confidence: "high",
            key: "passportNumber",
            needsManualReview: true,
            value: "752869613",
          },
        ],
        guardrails: [],
        source: "local-ocr",
        status: "extracted",
        summary: "Паспорт распознан.",
      },
    );
    const autofilled = applySafePassportExtractionFields(
      withExtractedPassport,
      passportFile.applicantId,
    );
    const sofia = autofilled.applicants.find(
      (applicant) => applicant.id === passportFile.applicantId,
    );
    if (!sofia) throw new Error("Expected Sofia applicant");
    const sofiaFields = new Map(
      sofia.sections.flatMap((section) =>
        section.fields.map((field) => [field.id, field.value] as const),
      ),
    );

    expect(uploadedPassport).toMatchObject({
      originalFileName: "sofia-passport-live.jpg",
      status: "uploaded",
      uploadStatus: "uploaded",
    });
    expect(sofiaFields.get("surname")).toBe("VOLKOV");
    expect(sofiaFields.get("first-name")).toBe("ANTON");
    expect(sofiaFields.get("passport-no")).toBe("660010483");
    expect(passportExtractionRows(sofia)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          conflict: false,
          currentValue: "VOLKOV",
          extractedValue: "VOLKOV",
          key: "surname",
        }),
        expect.objectContaining({
          conflict: false,
          currentValue: "ANTON",
          extractedValue: "ANTON",
          key: "firstName",
        }),
        expect.objectContaining({
          conflict: true,
          currentValue: "660010483",
          extractedValue: "752869613",
          key: "passportNumber",
        }),
      ]),
    );
    expect(autofilled.applicants[0]?.sections.flatMap((section) => section.fields)).not
      .toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "passport-no", value: "752869613" }),
        ]),
      );
  });

  it("blocks file uploads after the submission leaves editable agent states", () => {
    const draft = createDraftSubmission({
      city: "Москва",
      familyCount: 1,
      submissions: initialSubmissions,
      type: "single",
    });
    const firstFile = draft.files[0];
    if (!firstFile) throw new Error("Missing draft file");

    const locked = {
      ...draft,
      status: "submitted_for_review" as const,
    };

    expect(uploadRequiredFile(locked, firstFile.id)).toBe(locked);
  });

  it("does not mutate state for legacy media upload targets", () => {
    const draft = fillRequiredQuestionnaireForTest(
      createDraftSubmission({
        city: "Москва",
        familyCount: 1,
        submissions: initialSubmissions,
        type: "single",
      }),
    );
    const metadata = {
      generatedFileName: "v19legacy_photo.jpg",
      mimeType: "image/jpeg",
      originalFileName: "legacy-photo.jpg",
      sizeBytes: 2048,
      storageBucket: "submission-media",
      storagePath: `${draft.id}/${draft.applicants[0]?.id ?? "applicant-1"}/photo/v19legacy_photo.jpg`,
      uploadedAtIso: "2026-06-17T10:00:00.000Z",
    };

    for (const type of ["photo", "photo_white", "video"] as const) {
      const legacySubmission: Submission = {
        ...draft,
        files: [
          {
            id: `legacy-${type}`,
            applicantId: draft.applicants[0]?.id ?? "applicant-1",
            status: "missing",
            type,
          },
        ],
      };

      expect(uploadRequiredFile(legacySubmission, `legacy-${type}`, metadata)).toBe(
        legacySubmission,
      );
      const result = mergeUploadedFileMetadataIntoSubmissions(
        [legacySubmission],
        legacySubmission.id,
        `legacy-${type}`,
        metadata,
      );
      expect(result.submission).toBe(legacySubmission);
      expect(result.submissions[0]).toBe(legacySubmission);
    }
  });

  it("updates questionnaire fields and recalculates readiness", () => {
    const draft = createDraftSubmission({
      city: "Москва",
      familyCount: 1,
      submissions: initialSubmissions,
      type: "single",
    });
    const applicant = draft.applicants[0];
    if (!applicant) throw new Error("Missing draft applicant");
    const firstSection = applicant.sections[0];
    const firstField = firstSection?.fields[0];
    if (!firstSection || !firstField) throw new Error("Missing questionnaire field");

    const updated = updateQuestionnaireField(draft, {
      applicantId: applicant.id,
      sectionId: firstSection.id,
      fieldId: firstField.id,
      value: "Иван Иванов",
    });

    expect(updated.applicants[0]?.sections[0]?.fields[0]?.value).toBe("Иван Иванов");
    expect(updated.applicants[0]?.sections[0]?.status).toBe("partial");
    expect(updated.applicants[0]?.questionnaireStatus).toBe("partial");
    expect(updated.completeness.questionnaire).toBe(questionnaireCompleteness(updated));
    expect(canPerformAction(updated, "submit_for_review", "agent").ok).toBe(false);
  });

  it("syncs questionnaire trip fields into the submission trip range", () => {
    const draft = createDraftSubmission({
      city: "Москва",
      familyCount: 1,
      submissions: initialSubmissions,
      type: "single",
    });
    const applicant = draft.applicants[0];
    const tripSection = applicant?.sections.find((section) =>
      section.id.endsWith("-trip"),
    );
    if (!applicant || !tripSection) throw new Error("Missing trip section");

    const withArrival = updateQuestionnaireField(draft, {
      applicantId: applicant.id,
      sectionId: tripSection.id,
      fieldId: "arrival-date",
      value: "19.08.2026",
    });
    const withDeparture = updateQuestionnaireField(withArrival, {
      applicantId: applicant.id,
      sectionId: tripSection.id,
      fieldId: "departure-date",
      value: "27.08.2026",
    });

    expect(withDeparture.tripDateFrom).toBe("19.08.2026");
    expect(withDeparture.tripDateTo).toBe("27.08.2026");
  });

  it("adds a precise admin issue with a target", () => {
    const submission = canonicalMediaSubmission(byId("ПД-1053"));
    const updated = addPreciseAdminIssue(submission, routeIssueInput(submission));
    expect(updated.issues[0]).toMatchObject({
      severity: "blocker",
      status: "open",
      target: {
        applicantName: "Нина Волкова",
        section: "Анкета",
        field: "Маршрут поездки",
      },
    });
    expect(updated.history[0].source).toBe("admin");
  });

  it("records the admin reviewer when accepting uploaded media", () => {
    const adminProfileId = "00000000-0000-4000-8000-000000000002";
    const submission = canonicalMediaSubmission(
      fillRequiredQuestionnaireForTest(byId("ПД-1053")),
    );
    const reviewableFiles = submission.files.filter((file) =>
      ["uploaded", "pending_review", "accepted"].includes(file.status),
    );

    const accepted = applySubmissionAction(
      submission,
      "accept",
      "admin",
      adminProfileId,
    );

    expect(reviewableFiles.length).toBeGreaterThan(0);
    for (const file of reviewableFiles) {
      expect(accepted.files.find((item) => item.id === file.id)).toMatchObject({
        reviewStatus: "accepted",
        reviewedBy: adminProfileId,
        status: "accepted",
      });
    }
  });

  it("does not add issues to export-ready submissions", () => {
    const submission = readyClone({ id: "ПД-1056" });
    const updated = addPreciseAdminIssue(submission, routeIssueInput(submission));

    expect(updated).toBe(submission);
    expect(exportSummary([updated])).toMatchObject({
      canGenerate: true,
      rowCount: submission.applicants.length,
    });
  });

  it("recalculates file completeness from the actual family file count", () => {
    const draft = createDraftSubmission({
      city: "Москва",
      familyCount: 4,
      preliminaryIntake: datedPreliminaryIntake(),
      submissions: initialSubmissions,
      type: "family",
    });
    const filled = uploadRequiredFiles(fillRequiredQuestionnaireForTest(draft));
    const inProgress = applySubmissionAction(filled, "save_progress", "agent");
    const submitted = applySubmissionAction(inProgress, "submit_for_review", "agent");
    const applicant = submitted.applicants[0];
    if (!applicant) throw new Error("Missing applicant");

    const withIssue = addPreciseAdminIssue(
      submitted,
      {
        applicantId: applicant.id,
        comment: "Замените фото и отправьте исправление.",
        fileType: "selfie_2",
        reason: "Файл требует замены",
        section: "Файлы",
        severity: "blocker",
        type: "file",
      },
      "00000000-0000-4000-8000-000000000002",
    );

    expect(withIssue.files).toHaveLength(12);
    expect(withIssue.completeness.files).toBe(92);
    expect(withIssue.completeness.total).toBe(96);
    expect(
      withIssue.files.find(
        (file) => file.applicantId === applicant.id && file.type === "selfie_2",
      ),
    ).toMatchObject({
      reviewStatus: "replace_required",
      reviewedBy: "00000000-0000-4000-8000-000000000002",
      status: "needs_replacement",
    });
  });

  it("keeps a field issue open until the agent marks it fixed and submits corrections", () => {
    const submission = byId("ПД-1053");
    const withIssue = addPreciseAdminIssue(submission, routeIssueInput(submission));
    const applicant = withIssue.applicants[0];
    if (!applicant) throw new Error("Missing applicant");
    const tripSection = applicant.sections.find(
      (section) => section.title === "Поездка",
    );
    const routeField = tripSection?.fields.find(
      (field) => field.label === "Страна первого въезда",
    );
    if (!tripSection || !routeField) throw new Error("Missing route field");

    const edited = updateQuestionnaireField(withIssue, {
      applicantId: applicant.id,
      sectionId: tripSection.id,
      fieldId: routeField.id,
      value: "Москва, Барселона, Мадрид, Москва",
    });

    expect(edited.issues[0]?.status).toBe("open");
    expect(
      edited.applicants[0]?.sections
        .find((section) => section.title === "Поездка")
        ?.fields.find((field) => field.label === "Страна первого въезда")?.error,
    ).toBe("Нужно уточнить маршрут поездки");

    const returned = applySubmissionAction(edited, "return_with_issues", "admin");
    expect(canPerformAction(returned, "submit_corrections", "agent")).toEqual({
      ok: false,
      reason: "Сначала отметьте замечания исправленными",
    });

    const fixed = markSubmissionIssueFixedResult(
      returned,
      returned.issues[0]?.id ?? "",
      "agent",
    );
    if (!fixed.ok) throw new Error(fixed.error.code);
    const corrected = applySubmissionAction(
      fixed.data,
      "submit_corrections",
      "agent",
    );

    expect(corrected.issues[0]?.status).toBe("fixed_by_agent");
    expect(
      corrected.applicants[0]?.sections
        .find((section) => section.title === "Поездка")
        ?.fields.find((field) => field.label === "Страна первого въезда")?.error,
    ).toBeUndefined();
    expect(corrected.applicants[0]?.questionnaireStatus).toBe("partial");
  });

  it("blocks marking a returned issue fixed until its target changes", () => {
    const submission = byId("ПД-1053");
    const withIssue = addPreciseAdminIssue(submission, routeIssueInput(submission));
    const returned = applySubmissionAction(
      withIssue,
      "return_with_issues",
      "admin",
    );
    const issueId = returned.issues[0]?.id;
    if (!issueId) throw new Error("Missing issue");

    expect(markSubmissionIssueFixedResult(returned, issueId, "agent")).toEqual({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Issue target must be corrected before it can be marked fixed.",
      },
    });
  });

  it("updates export state and marks downloaded submissions exported", () => {
    const submissions = initialSubmissions.map((submission) =>
      submission.id === "ПД-1056" ? readyClone({ id: "ПД-1056" }) : submission,
    );
    const generated = applyExportStateToSelection(
      submissions,
      ["ПД-1056"],
      "file_generated",
    );
    expect(
      generated.find((submission) => submission.id === "ПД-1056")?.exportState,
    ).toBe("file_generated");

    const downloaded = applyExportStateToSelection(
      generated,
      ["ПД-1056"],
      "file_downloaded",
    );
    const exported = markSelectedExported(downloaded, ["ПД-1056"]);
    expect(exported.find((submission) => submission.id === "ПД-1056")?.status).toBe(
      "exported",
    );
    expect(
      exported.find((submission) => submission.id === "ПД-1056")?.history[0].source,
    ).toBe("admin");
  });
});

describe("V-19 ББ helper suggestions", () => {
  it("generates exact targets without changing submission status", () => {
    const submission = byId("ПД-1051");
    const reviewed = runAiReview(submission);
    const suggestions = activeAiSuggestions(reviewed);
    const fileSuggestion = suggestions.find(
      (suggestion) => suggestion.target.fileType === "selfie",
    );

    expect(reviewed.status).toBe(submission.status);
    expect(reviewed.aiReviewState).toBe("ready");
    expect(reviewed.history[0]).toMatchObject({
      text: "ББ-проверка запущена",
      detail: expect.stringContaining("Активных подсказок для ручной проверки"),
      source: "bb",
    });
    expect(suggestions.length).toBeGreaterThan(0);
    expect(fileSuggestion).toMatchObject({
      severity: "blocker",
      title: "Нет файла: Селфи 1",
      reason: "Артём Соколов: загрузите файл.",
      target: {
        applicantId: "з-1051-1",
        applicantName: "Артём Соколов",
        section: "Файлы",
        fileType: "selfie",
      },
    });
  });

  it("surfaces passport gate blockers as ББ suggestions", () => {
    const draft = createDraftSubmission({
      applicantNames: ["VOLKOV ANTON"],
      city: "Москва",
      familyCount: 1,
      preliminaryIntake: datedPreliminaryIntake(),
      submissions: initialSubmissions,
      type: "single",
    });
    const passportFile = draft.files.find(
      (file) =>
        file.type === "passport_scan" && file.applicantId === draft.applicants[0]?.id,
    );
    if (!passportFile) throw new Error("Missing passport file");

    const withExpiredPassport = finishPassportExtraction(draft, passportFile, {
      fields: [
        {
          confidence: "high",
          key: "passportType",
          needsManualReview: true,
          value: "Ordinary Passport",
        },
        {
          confidence: "high",
          key: "passportNumber",
          needsManualReview: true,
          value: "752869613",
        },
        {
          confidence: "medium",
          key: "passportExpiresAt",
          needsManualReview: true,
          value: "26.02.2026",
        },
      ],
      guardrails: [],
      source: "local-ocr",
      status: "extracted",
      summary: "Локальный OCR нашел паспорт.",
    });
    const reviewed = runAiReview(withExpiredPassport);
    const passportSuggestion = activeAiSuggestions(reviewed).find(
      (suggestion) => suggestion.title === "Паспорт просрочен",
    );

    expect(passportSuggestion).toMatchObject({
      confidence: "high",
      severity: "blocker",
      reason: "Паспорт 752869613 просрочен.",
      target: {
        applicantId: draft.applicants[0]?.id,
        applicantName: "VOLKOV ANTON",
        section: "Паспорт",
        field: "Дата окончания паспорта",
      },
    });
  });

  it("lets reviewed passport OCR resolve a ББ passport review issue", () => {
    const draft = createDraftSubmission({
      applicantNames: ["VOLKOV ANTON"],
      city: "Москва",
      familyCount: 1,
      preliminaryIntake: datedPreliminaryIntake(),
      submissions: initialSubmissions,
      type: "single",
    });
    const filled = uploadRequiredFiles(fillRequiredQuestionnaireForTest(draft));
    const passportFile = filled.files.find(
      (file) =>
        file.type === "passport_scan" &&
        file.applicantId === filled.applicants[0]?.id,
    );
    if (!passportFile) throw new Error("Missing passport file");

    const withPassportReviewPending = {
      ...finishPassportExtraction(filled, passportFile, {
        fields: [
          {
            confidence: "high",
            key: "passportType",
            needsManualReview: true,
            value: "Ordinary Passport",
          },
          {
            confidence: "high",
            key: "passportNumber",
            needsManualReview: true,
            value: "752869613",
          },
          {
            confidence: "medium",
            key: "passportExpiresAt",
            needsManualReview: true,
            value: "10.01.2031",
          },
        ],
        guardrails: [],
        source: "local-ocr",
        status: "extracted",
        summary: "Локальный OCR нашел паспорт.",
      }),
      status: "submitted_for_review" as const,
    };
    const reviewed = runAiReview(withPassportReviewPending);
    const passportReviewSuggestion = activeAiSuggestions(reviewed).find(
      (suggestion) =>
        suggestion.target.section === "Паспорт" &&
        suggestion.target.field === "Распознанные данные паспорта",
    );
    if (!passportReviewSuggestion) throw new Error("Missing passport review suggestion");

    const withIssue = acceptAiSuggestionAsIssue(
      reviewed,
      passportReviewSuggestion.id,
      "admin",
    );
    const returned = applySubmissionAction(withIssue, "return_with_issues", "admin");
    const verified = markPassportExtractionReviewed(returned, "verified");
    const fixed = markSubmissionIssueFixedResult(
      verified,
      withIssue.issues[0]?.id ?? "",
      "agent",
    );

    expect(returned.status).toBe("returned");
    expect(fixed).toMatchObject({
      ok: true,
      data: {
        issues: [expect.objectContaining({ status: "fixed_by_agent" })],
      },
    });
  });

  it("does not duplicate suggestions that already have open issues", () => {
    const suggestions = generateAiSuggestions(byId("ПД-1048"));

    expect(
      suggestions.some(
        (suggestion) =>
          suggestion.target.applicantName === "Мария Иванова" &&
          suggestion.target.section === "Файлы" &&
          suggestion.target.fileType === "selfie",
      ),
    ).toBe(false);
  });

  it("keeps agents from converting suggestions into issues", () => {
    const reviewed = runAiReview(byId("ПД-1051"));
    const suggestionId = activeAiSuggestions(reviewed)[0]?.id;
    if (!suggestionId) throw new Error("Нет подсказки для проверки");

    const next = acceptAiSuggestionAsIssue(reviewed, suggestionId, "agent");

    expect(next).toBe(reviewed);
    expect(next.issues).toHaveLength(0);
    expect(activeAiSuggestions(next)).toHaveLength(
      activeAiSuggestions(reviewed).length,
    );
  });

  it("blocks ББ issue actions outside active review statuses", () => {
    const reviewed = {
      ...runAiReview(byId("ПД-1051")),
      status: "ready_for_export" as const,
    };
    const suggestionId = activeAiSuggestions(reviewed)[0]?.id;
    if (!suggestionId) throw new Error("Нет подсказки для проверки");

    expect(acceptAiSuggestionAsIssue(reviewed, suggestionId, "admin")).toBe(reviewed);
    expect(dismissAiSuggestion(reviewed, suggestionId, "admin")).toBe(reviewed);
  });

  it("allows ББ runs only in role-owned active work surfaces", () => {
    expect(canRunAiReview(byId("ПД-1048"), "agent", "agent")).toBe(true);
    expect(canRunAiReview(byId("ПД-1053"), "admin", "review")).toBe(true);

    expect(canRunAiReview(byId("ПД-1056"), "admin", "export")).toBe(false);
    expect(canRunAiReview(byId("ПД-1056"), "admin", "review")).toBe(false);
    expect(canRunAiReview(byId("ПД-1057"), "admin", "review")).toBe(false);
    expect(canRunAiReview(byId("ПД-1053"), "agent", "agent")).toBe(false);
  });

  it("lets admins convert a suggestion into a precise issue", () => {
    const reviewed = runAiReview(byId("ПД-1053"));
    const fileSuggestion = activeAiSuggestions(reviewed).find(
      (suggestion) => suggestion.target.fileType === "selfie",
    );
    if (!fileSuggestion) throw new Error("Нет файловой подсказки для проверки");

    const next = acceptAiSuggestionAsIssue(reviewed, fileSuggestion.id, "admin");

    expect(next.status).toBe(reviewed.status);
    expect(next.issues[0]).toMatchObject({
      createdBy: "admin",
      status: "open",
      severity: "warning",
      target: {
        applicantName: "Нина Волкова",
        section: "Файлы",
        fileType: "selfie",
      },
    });
    expect(
      activeAiSuggestions(next).some(
        (suggestion) => suggestion.id === fileSuggestion.id,
      ),
    ).toBe(false);
    expect(next.history[0]).toMatchObject({
      text: "Подсказка ББ принята администратором",
      detail: "Нина Волкова · Файлы · Селфи 1",
      source: "bb",
    });
  });

  it("lets admins dismiss a suggestion without creating an issue", () => {
    const reviewed = runAiReview(byId("ПД-1053"));
    const suggestionId = activeAiSuggestions(reviewed)[0]?.id;
    if (!suggestionId) throw new Error("Нет подсказки для проверки");

    const next = dismissAiSuggestion(reviewed, suggestionId, "admin");

    expect(next.status).toBe(reviewed.status);
    expect(next.issues).toHaveLength(0);
    expect(next.history[0]).toMatchObject({
      text: "Подсказка ББ отклонена администратором",
      source: "bb",
    });
    expect(
      activeAiSuggestions(next).some((suggestion) => suggestion.id === suggestionId),
    ).toBe(false);
  });
});

describe("V-19 persistence boundary", () => {
  it("saves and loads submissions", () => {
    installStorageStub();
    const draft = createDraftSubmission({
      city: "Москва",
      familyCount: 2,
      submissions: initialSubmissions,
      type: "single",
    });

    expect(saveSubmissions([draft, ...initialSubmissions])).toEqual({ ok: true });
    expect(loadSubmissions()[0].id).toBe(draft.id);
  });

  it("reports local save failures instead of swallowing them", () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: () => null,
        removeItem: () => undefined,
        setItem: () => {
          throw new Error("quota exceeded");
        },
      },
    });

    const result = saveSubmissions([initialSubmissions[0]!]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("Локальное сохранение не прошло");
    }
  });

  it("falls back to initial submissions for invalid storage", () => {
    installStorageStub();
    testStorage().setItem("visaflow.v19.submissions.v1", "{bad");
    expect(loadSubmissions()[0].id).toBe(initialSubmissions[0].id);

    testStorage().setItem("visaflow.v19.submissions.v1", "[]");
    expect(loadSubmissions()[0].id).toBe(initialSubmissions[0].id);
  });

  it("normalizes legacy local submissions without an agent owner", () => {
    installStorageStub();
    const legacySubmission = { ...byId("ПД-1051") } as Omit<Submission, "agentId"> & {
      agentId?: string;
    };
    delete legacySubmission.agentId;

    testStorage().setItem(
      "visaflow.v19.submissions.v1",
      JSON.stringify([legacySubmission]),
    );

    expect(loadSubmissions()[0]?.agentId).toBe(defaultLocalAgentOwnerId);
  });

  it("normalizes legacy local status and media into canonical runtime slots", () => {
    installStorageStub();
    const draft = fillRequiredQuestionnaireForTest(
      createDraftSubmission({
        city: "Москва",
        familyCount: 1,
        submissions: initialSubmissions,
        type: "single",
      }),
    );
    const legacySubmission: Submission = {
      ...draft,
      status: "requires_action",
      files: [
        {
          id: "legacy-photo",
          applicantId: draft.applicants[0]?.id ?? "applicant-1",
          status: "uploaded",
          type: "photo",
        },
        {
          id: "legacy-photo-white",
          applicantId: draft.applicants[0]?.id ?? "applicant-1",
          status: "uploaded",
          type: "photo_white",
        },
        {
          id: "legacy-video",
          applicantId: draft.applicants[0]?.id ?? "applicant-1",
          status: "uploaded",
          type: "video",
        },
      ],
      completeness: { questionnaire: 100, files: 100, total: 100 },
    };

    testStorage().setItem(
      "visaflow.v19.submissions.v1",
      JSON.stringify([legacySubmission]),
    );

    const loaded = loadSubmissions()[0];
    expect(loaded?.status).toBe("returned");
    expect(loaded?.files.map((file) => file.type)).toEqual([
      "passport_scan",
      "selfie",
      "selfie_2",
    ]);
    expect(loaded?.files.every((file) => file.status === "missing")).toBe(true);
    expect(loaded?.completeness.files).toBe(0);
    expect(
      canPerformAction(
        { ...(loaded as Submission), status: "in_progress" },
        "submit_for_review",
        "agent",
      ).ok,
    ).toBe(false);
  });

  it("maps legacy returned photo issues to the canonical selfie replacement slot", () => {
    const source = byId("ПД-1048");
    const legacyIssue = source.issues.find((item) => item.id === "зм-1048-1");
    if (!legacyIssue) throw new Error("Missing returned issue");
    const legacySubmission: Submission = {
      ...source,
      issues: source.issues.map((issue) =>
        issue.id === legacyIssue.id
          ? {
              ...issue,
              target: {
                ...issue.target,
                fileType: "photo",
              },
            }
          : issue,
      ),
      files: [
        ...source.files.filter(
          (file) =>
            !(
              file.applicantId === legacyIssue.target.applicantId &&
              file.type === "selfie"
            ),
        ),
        {
          id: "legacy-photo",
          applicantId: legacyIssue.target.applicantId,
          status: "needs_replacement",
          type: "photo",
          linkedIssueId: legacyIssue.id,
        },
      ],
    };
    const normalized = normalizeSubmissionForCanonicalRuntime(legacySubmission);
    const issue = normalized.issues.find((item) => item.id === "зм-1048-1");
    if (!issue) throw new Error("Missing returned issue");

    expect(issue.target.fileType).toBe("selfie");
    const targetFile = normalized.files.find(
      (file) =>
        file.applicantId === issue.target.applicantId &&
        file.type === issue.target.fileType,
    );
    if (!targetFile) throw new Error("Missing canonical replacement file");

    expect(targetFile).toMatchObject({
      linkedIssueId: issue.id,
      status: "needs_replacement",
    });
    expect(markSubmissionIssueFixedResult(normalized, issue.id, "agent")).toEqual({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Issue target must be corrected before it can be marked fixed.",
      },
    });

    const uploaded = uploadRequiredFile(normalized, targetFile.id);

    expect(uploaded.issues.find((item) => item.id === issue.id)?.status).toBe(
      "fixed_by_agent",
    );
  });

  it("builds a Supabase draft payload from the current cockpit model", () => {
    const submission = byId("ПД-1048");
    const payload = toCockpitDraftPersistencePayload(
      submission,
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
    );

    expect(payload.submission).toMatchObject({
      id: "ПД-1048",
      agent_id: "00000000-0000-4000-8000-000000000002",
      status: "returned",
      readiness_percent: submission.completeness.total,
    });
    expect(payload.applicants).toHaveLength(submission.applicants.length);
    expect(payload.corrections).toHaveLength(submission.issues.length);
    expect(payload.status_history).toHaveLength(0);
    expect(payload.media_assets).toEqual([]);
  });

  it("returns a canonical cockpit snapshot without relying on fake uploads", () => {
    const submission = byId("ПД-1051");
    const payload = toCockpitDraftPersistencePayload(
      submission,
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000001",
    );

    const snapshot = readCockpitSnapshot(
      payload.submission.family_intelligence as Json,
    );

    expect(snapshot).toMatchObject({
      agentId: "00000000-0000-4000-8000-000000000001",
      id: submission.id,
      status: submission.status,
    });
    expect(snapshot?.files.map((file) => file.type)).toEqual([
      "passport_scan",
      "selfie",
      "selfie_2",
    ]);
  });

  it("normalizes legacy cockpit snapshots before returning them", () => {
    const submission = byId("ПД-1051");
    const applicantId = submission.applicants[0]?.id ?? "applicant-1";
    const legacySnapshot: Submission = {
      ...submission,
      status: "requires_action",
      files: [
        {
          id: "legacy-photo",
          applicantId,
          status: "uploaded",
          type: "photo",
        },
        {
          id: "legacy-photo-white",
          applicantId,
          status: "uploaded",
          type: "photo_white",
        },
        {
          id: "legacy-video",
          applicantId,
          status: "uploaded",
          type: "video",
        },
      ],
      completeness: { questionnaire: 100, files: 100, total: 100 },
    };

    const snapshot = readCockpitSnapshot({
      status: cockpitSnapshotStatus,
      [cockpitSnapshotKey]: {
        version: cockpitSnapshotVersion,
        submission: legacySnapshot as unknown as Json,
      },
    });

    expect(snapshot?.status).toBe("returned");
    expect(snapshot?.files.map((file) => file.type)).toEqual([
      "passport_scan",
      "selfie",
      "selfie_2",
    ]);
    expect(snapshot?.files.every((file) => file.status === "missing")).toBe(true);
    expect(snapshot?.completeness.files).toBe(0);
  });

  it("keeps the cockpit snapshot storage contract explicit", () => {
    const payload = toCockpitDraftPersistencePayload(
      byId("ПД-1051"),
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000001",
    );
    const familyIntelligence = payload.submission.family_intelligence as Record<
      string,
      unknown
    >;
    const envelope = familyIntelligence[cockpitSnapshotKey] as Record<string, unknown>;

    expect(cockpitSnapshotStorageField).toBe(
      "submissions.family_intelligence.v19CockpitSnapshot",
    );
    expect(familyIntelligence.status).toBe(cockpitSnapshotStatus);
    expect(envelope.version).toBe(cockpitSnapshotVersion);
  });
});

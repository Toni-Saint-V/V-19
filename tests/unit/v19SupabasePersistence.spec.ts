import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialSubmissions } from "../../src/modules/submissions/mockData";
import type { Submission } from "../../src/modules/submissions/types";
import type { AppProfile } from "../../src/types/session";
import type { Json } from "../../src/lib/supabase/database.types";
import { fillRequiredQuestionnaireForTest } from "./helpers/questionnaireTestFill";

const mockState = vi.hoisted(() => ({
  archivedSubmissionError: null as unknown | null,
  archivedSubmissionRows: [] as unknown[],
  applicantRows: [] as unknown[],
  correctionRows: [] as unknown[],
  exportBatchRows: [] as unknown[],
  fromCalls: [] as string[],
  gtCalls: [] as Array<{ column: string; value: string }>,
  mediaAssetRows: [] as unknown[],
  profileRows: [] as unknown[],
  questionnaireRows: [] as unknown[],
  relatedErrors: {} as Record<string, unknown>,
  relatedStatuses: {} as Record<string, number>,
  rpcCalls: [] as Array<{
    args: Record<string, unknown>;
    name: string;
  }>,
  rpcResults: [] as Array<{ data?: unknown; error: unknown | null }>,
  submissionError: null as unknown | null,
  submissionRows: [] as unknown[],
  submissionStatus: 200,
  statusHistoryRows: [] as unknown[],
}));

vi.mock("../../src/lib/supabase/client", () => {
  function queryResult(
    rows: unknown[],
    error: unknown | null = null,
    status = error ? 400 : 200,
  ) {
    const fieldValue = (row: unknown, column: string) =>
      typeof row === "object" && row !== null
        ? (row as Record<string, unknown>)[column]
        : undefined;

    let filteredRows = [...rows];
    let rowLimit: number | null = null;
    let range: [number, number] | null = null;
    const result = {
      eq(column: string, value: unknown) {
        filteredRows = filteredRows.filter(
          (row) => fieldValue(row, column) === value,
        );
        return result;
      },
      in(column: string, values: unknown[]) {
        filteredRows = filteredRows.filter((row) =>
          values.includes(fieldValue(row, column)),
        );
        return result;
      },
      gt(column: string, value: string) {
        mockState.gtCalls.push({ column, value });
        filteredRows = filteredRows.filter((row) => {
          const rowValue = fieldValue(row, column);
          return typeof rowValue === "string" && rowValue > value;
        });
        return result;
      },
      overlaps(column: string, values: unknown[]) {
        filteredRows = filteredRows.filter((row) => {
          const rowValue = fieldValue(row, column);
          return (
            Array.isArray(rowValue) &&
            rowValue.some((value) => values.includes(value))
          );
        });
        return result;
      },
      limit(value: number) {
        rowLimit = value;
        return result;
      },
      order() {
        return result;
      },
      range(from: number, to: number) {
        range = [from, to];
        return result;
      },
      then(
        resolve: (value: {
          data: unknown[];
          error: unknown | null;
          status: number;
        }) => unknown,
        reject?: (reason: unknown) => unknown,
      ) {
        const rangedRows = range
          ? filteredRows.slice(range[0], range[1] + 1)
          : filteredRows;
        const data = rowLimit === null ? rangedRows : rangedRows.slice(0, rowLimit);
        return Promise.resolve({ data, error, status }).then(resolve, reject);
      },
    };
    return result;
  }

  return {
    getSupabaseClient: () => ({
      from: (table: string) => {
        mockState.fromCalls.push(table);
        return {
          select: () => {
            const rows =
              table === "submissions"
                ? mockState.submissionRows
                : table === "agent_submission_card_archives"
                  ? mockState.archivedSubmissionRows
                : table === "applicants"
                  ? mockState.applicantRows
                  : table === "questionnaire_answers"
                    ? mockState.questionnaireRows
                  : table === "media_assets"
                      ? mockState.mediaAssetRows
                      : table === "corrections"
                        ? mockState.correctionRows
                      : table === "status_history"
                      ? mockState.statusHistoryRows
                      : table === "profiles"
                        ? mockState.profileRows
                        : mockState.exportBatchRows;
            const error =
              mockState.relatedErrors[table] ??
              (table === "submissions"
                ? mockState.submissionError
                : table === "agent_submission_card_archives"
                  ? mockState.archivedSubmissionError
                  : null);
            return queryResult(
              rows,
              error,
              mockState.relatedStatuses[table] ??
                (table === "submissions" ? mockState.submissionStatus : undefined),
            );
          },
        };
      },
      rpc: (name: string, args: Record<string, unknown>) => {
        mockState.rpcCalls.push({ args, name });
        const queued = mockState.rpcResults.shift();
        if (queued?.error) return Promise.resolve(queued);
        if (name === "save_agent_submission_if_current") {
          const payload = args.payload as {
            submission: { id: string };
          };
          return Promise.resolve({
            data:
              queued?.data ??
              {
                caseRevision:
                  typeof args.expected_revision === "number"
                    ? args.expected_revision + 1
                    : 0,
                operationId: args.operation_id,
                result: {},
                submissionId: payload.submission.id,
              },
            error: null,
          });
        }
        return Promise.resolve(queued ?? { error: null });
      },
    }),
  };
});

import {
  buildExportPackageIdentity,
  exportSummaryForSelectedIds,
} from "../../src/modules/submissions/exportRules";
import { submitForReview } from "../../src/modules/submissions/domainEngine";
import {
  createDraftSubmission,
  generatedCockpitMediaFileName,
  normalizeSubmissionForCanonicalRuntime,
  updateQuestionnaireField,
  uploadRequiredFile,
} from "../../src/modules/submissions/submissionActions";
import {
  buildMediaStoragePath,
  mediaStorageBucket,
} from "../../src/modules/submissions/mediaStoragePolicy";
import { confirmApplicantPassportReview } from "../../src/modules/submissions/passportExtraction";
import {
  applyAgentSubmitForReviewResult,
  markSubmissionIssueFixedResult,
} from "../../src/modules/submissions/status";
import {
  archiveAgentSubmissionCard,
  changedCockpitSubmissions,
  cockpitSnapshotKey,
  cockpitSnapshotStatus,
  cockpitSnapshotVersion,
  cockpitSubmissionFingerprintMap,
  ensureSubmissionPublicNumber,
  isAdminSubmissionConcurrencyConflict,
  loadCockpitSubmissionsForProfile,
  readCockpitSnapshot,
  reviewHandoffPersistenceIssues,
  saveAdminCockpitSubmissionsIfCurrent,
  saveCockpitSubmissionsForProfile,
  toCockpitDraftPersistencePayload,
  toCockpitQuestionnaireAnswerInserts,
} from "../../src/modules/submissions/supabasePersistence";
import { PersistenceObservableError } from "../../src/services/persistenceObservability";

const agentProfile: AppProfile = {
  displayName: "Agent",
  email: "agent@visaflow.local",
  id: "00000000-0000-4000-8000-000000000001",
  organizationName: "VisaFlow",
  role: "agent",
};

const adminProfile: AppProfile = {
  ...agentProfile,
  displayName: "Admin",
  email: "admin@visaflow.local",
  id: "00000000-0000-4000-8000-000000000002",
  role: "admin",
};

const otherAgentProfile: AppProfile = {
  ...agentProfile,
  displayName: "Second Agent",
  email: "second-agent@visaflow.local",
  id: "00000000-0000-4000-8000-000000000003",
};

function payloadSubmission(callIndex = 0) {
  const draftCalls = mockState.rpcCalls;
  return (
    draftCalls[callIndex]?.args.payload as {
      submission: { agent_id: string; id: string; title: string };
    }
  ).submission;
}

function rpcNames() {
  return mockState.rpcCalls.map((call) => call.name);
}

function draftPayload(submission: Submission) {
  return toCockpitDraftPersistencePayload(submission, agentProfile.id, agentProfile.id);
}

function completeAgentSubmissionPackage(
  type: Submission["type"],
  applicantNames: string[],
) {
  const draft = createDraftSubmission({
    agentId: agentProfile.id,
    applicantNames,
    city: "Санкт-Петербург",
    familyCount: applicantNames.length,
    idScheme: "supabase",
    submissions: [],
    type,
  });
  let filled = fillRequiredQuestionnaireForTest(draft);
  for (const [index, applicant] of filled.applicants.entries()) {
    const passportSection = applicant.sections.find((section) =>
      section.fields.some((field) => field.id === "passport-no"),
    );
    if (!passportSection) {
      throw new Error("Expected applicant passport number field.");
    }
    filled = updateQuestionnaireField(filled, {
      applicantId: applicant.id,
      fieldId: "passport-no",
      sectionId: passportSection.id,
      value: `76543210${index}`,
    });
  }
  const primary = filled.applicants[0];
  const surnameSection = primary?.sections.find((section) =>
    section.fields.some((field) => field.id === "surname"),
  );
  if (!primary || !surnameSection) {
    throw new Error("Expected primary applicant surname field.");
  }

  let prepared = updateQuestionnaireField(filled, {
    applicantId: primary.id,
    fieldId: "surname",
    sectionId: surnameSection.id,
    value: "UPDATED-SURNAME",
  });
  for (const file of prepared.files) {
    const generatedFileName = generatedCockpitMediaFileName({
      applicantId: file.applicantId,
      fileType: file.type,
      mimeType: "image/jpeg",
      submissionId: prepared.id,
    });
    const target = buildMediaStoragePath(
      prepared.id,
      file.applicantId,
      file.type,
      generatedFileName,
    );
    prepared = uploadRequiredFile(prepared, file.id, {
      generatedFileName,
      mimeType: "image/jpeg",
      originalFileName:
        file.type === "selfie" ? "selfie_1.jpg" : `${file.type}.jpg`,
      sizeBytes: 2_048,
      storageAdapter: "supabase-private",
      storageBucket: mediaStorageBucket,
      storagePath: target.path,
      uploadedAtIso: "2026-07-29T10:00:00.000Z",
    });
  }
  for (const applicant of prepared.applicants) {
    prepared = confirmApplicantPassportReview(
      prepared,
      applicant.id,
      agentProfile.id,
    );
  }

  const submitted = applyAgentSubmitForReviewResult(
    prepared,
    agentProfile.id,
  );
  if (!submitted.ok) throw new Error(submitted.error.message);
  return submitted.data;
}

beforeEach(() => {
  mockState.archivedSubmissionError = null;
  mockState.archivedSubmissionRows = [];
  mockState.applicantRows = [];
  mockState.correctionRows = [];
  mockState.exportBatchRows = [];
  mockState.fromCalls = [];
  mockState.gtCalls = [];
  mockState.mediaAssetRows = [];
  mockState.profileRows = [];
  mockState.questionnaireRows = [];
  mockState.relatedErrors = {};
  mockState.relatedStatuses = {};
  mockState.rpcCalls = [];
  mockState.rpcResults = [];
  mockState.submissionError = null;
  mockState.submissionRows = [];
  mockState.submissionStatus = 200;
  mockState.statusHistoryRows = [];
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("V-19 Supabase cockpit persistence", () => {
  it("preserves the PostgREST HTTP 402 status for the workspace circuit breaker", async () => {
    mockState.submissionError = {
      message: "provider response intentionally omitted",
    };
    mockState.submissionStatus = 402;

    try {
      await loadCockpitSubmissionsForProfile(agentProfile);
      throw new Error("Expected the restricted Supabase read to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(PersistenceObservableError);
      expect((error as PersistenceObservableError).diagnostics).toMatchObject({
        httpStatus: 402,
        operation: "submissions.list",
        retryable: false,
      });
    }
  });

  it("preserves HTTP 402 from a related canonical read after submissions load", async () => {
    const submission = {
      ...(initialSubmissions[0] as Submission),
      agentId: agentProfile.id,
      id: "submission-related-read-402",
    };
    const payload = toCockpitDraftPersistencePayload(
      submission,
      agentProfile.id,
      agentProfile.id,
    );
    mockState.submissionRows = [
      {
        ...payload.submission,
        case_revision: 4,
        created_at: submission.createdAt,
        updated_at: submission.updatedAt,
      },
    ];
    mockState.relatedErrors.applicants = {
      message: "provider response intentionally omitted",
    };
    mockState.relatedStatuses.applicants = 402;

    try {
      await loadCockpitSubmissionsForProfile(agentProfile);
      throw new Error("Expected the related restricted Supabase read to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(PersistenceObservableError);
      expect((error as PersistenceObservableError).diagnostics).toMatchObject({
        httpStatus: 402,
        operation: "applicants.list",
        retryable: false,
      });
    }
  });

  it("rejects corrupt correction targets before building a Supabase payload", () => {
    const submission = normalizeSubmissionForCanonicalRuntime({
      ...(initialSubmissions.find((item) => item.id === "ПД-1053") as Submission),
      agentId: agentProfile.id,
    });
    const applicant = submission.applicants[0];
    if (!applicant) throw new Error("Missing applicant");
    const baseIssue: Submission["issues"][number] = {
      comment: "Исправьте точную цель.",
      createdAt: "сейчас",
      createdBy: "admin",
      id: "зм-invalid-target",
      reason: "Некорректная цель замечания",
      severity: "blocker",
      status: "open",
      target: {
        applicantId: applicant.id,
        applicantName: applicant.fullName,
        section: "Анкета",
      },
      type: "field",
    };
    const invalidIssues: Submission["issues"] = [
      {
        ...baseIssue,
        id: "зм-mixed-target",
        target: {
          ...baseIssue.target,
          field: "Маршрут поездки",
          fileType: "passport_scan",
        },
      },
      {
        ...baseIssue,
        id: "зм-legacy-media-target",
        target: { ...baseIssue.target, fileType: "photo" },
        type: "file",
      },
      {
        ...baseIssue,
        id: "зм-missing-field-target",
        target: {
          ...baseIssue.target,
          field: "Несуществующее поле анкеты",
        },
      },
      {
        ...baseIssue,
        id: "зм-missing-file-target",
        target: { ...baseIssue.target, fileType: "passport_scan" },
        type: "file",
      },
    ];

    for (const issue of invalidIssues) {
      const candidate: Submission = {
        ...submission,
        files:
          issue.id === "зм-missing-file-target"
            ? submission.files.filter(
                (file) =>
                  file.applicantId !== applicant.id ||
                  file.type !== "passport_scan",
              )
            : submission.files,
        issues: [issue],
      };

      expect(() =>
        toCockpitDraftPersistencePayload(
          candidate,
          adminProfile.id,
          candidate.agentId,
        ),
      ).toThrow(
        "Admin issue target must resolve to exactly one canonical questionnaire field or media file.",
      );
    }
  });

  it("archives one card through the revision-aware Supabase RPC", async () => {
    mockState.rpcResults = [
      {
        data: {
          archivedAt: "2026-07-28T16:30:00.000Z",
          caseRevision: 7,
          idempotent: false,
          submissionId: "submission-archive-1",
        },
        error: null,
      },
    ];

    await expect(
      archiveAgentSubmissionCard("submission-archive-1", 7),
    ).resolves.toEqual({
      archivedAt: "2026-07-28T16:30:00.000Z",
      caseRevision: 7,
      idempotent: false,
      submissionId: "submission-archive-1",
    });
    expect(mockState.rpcCalls).toEqual([
      {
        args: {
          expected_case_revision: 7,
          submission_id: "submission-archive-1",
        },
        name: "archive_agent_submission_card",
      },
    ]);
  });

  it("filters archived cards from an agent readback without hiding them from admin audit", async () => {
    const submission = {
      ...(initialSubmissions[0] as Submission),
      agentId: agentProfile.id,
      id: "submission-archive-readback",
    };
    const payload = toCockpitDraftPersistencePayload(
      submission,
      agentProfile.id,
      agentProfile.id,
    );
    mockState.submissionRows = [
      {
        ...payload.submission,
        case_revision: 4,
        created_at: submission.createdAt,
        updated_at: submission.updatedAt,
      },
    ];
    mockState.archivedSubmissionRows = [
      {
        agent_id: agentProfile.id,
        archived_at: "2026-07-28T16:30:00.000Z",
        case_revision: 4,
        submission_id: submission.id,
      },
    ];

    const agentLoaded = await loadCockpitSubmissionsForProfile(agentProfile);
    expect(agentLoaded.submissions).toEqual([]);
    expect(mockState.fromCalls).toContain("agent_submission_card_archives");

    mockState.fromCalls = [];
    const adminLoaded = await loadCockpitSubmissionsForProfile(adminProfile);
    expect(adminLoaded.submissions).toHaveLength(1);
    expect(mockState.fromCalls).not.toContain("agent_submission_card_archives");
  });

  it("fails closed when archive visibility is denied instead of re-exposing cards", async () => {
    const submission = {
      ...(initialSubmissions[0] as Submission),
      agentId: agentProfile.id,
      id: "submission-archive-permission-denied",
    };
    const payload = toCockpitDraftPersistencePayload(
      submission,
      agentProfile.id,
      agentProfile.id,
    );
    mockState.submissionRows = [
      {
        ...payload.submission,
        case_revision: 4,
        created_at: submission.createdAt,
        updated_at: submission.updatedAt,
      },
    ];
    mockState.archivedSubmissionError = {
      code: "42501",
      message:
        "permission denied for table agent_submission_card_archives",
    };

    await expect(
      loadCockpitSubmissionsForProfile(agentProfile),
    ).rejects.toBeInstanceOf(PersistenceObservableError);
  });

  it.each(["42P01", "PGRST205"])(
    "uses the staged compatibility fallback only for exact missing-schema code %s",
    async (code) => {
      const submission = {
        ...(initialSubmissions[0] as Submission),
        agentId: agentProfile.id,
        id: `submission-archive-missing-${code}`,
      };
      const payload = toCockpitDraftPersistencePayload(
        submission,
        agentProfile.id,
        agentProfile.id,
      );
      mockState.submissionRows = [
        {
          ...payload.submission,
          case_revision: 4,
          created_at: submission.createdAt,
          updated_at: submission.updatedAt,
        },
      ];
      mockState.archivedSubmissionError = {
        code,
        message: "agent_submission_card_archives is unavailable",
      };

      const loaded = await loadCockpitSubmissionsForProfile(agentProfile);
      expect(loaded.submissions).toHaveLength(1);
    },
  );

  it.each([
    {
      applicantNames: ["ANTON VOLKOV"],
      expectedMediaCount: 3,
      expectedRoles: ["main"],
      label: "single",
      type: "single" as const,
    },
    {
      applicantNames: ["ANTON VOLKOV", "MARIA VOLKOVA", "IVAN VOLKOV"],
      expectedMediaCount: 5,
      expectedRoles: ["main", "spouse", "child"],
      label: "family",
      type: "family" as const,
    },
  ])(
    "persists and admin-reloads the complete $label agent package",
    async ({
      applicantNames,
      expectedMediaCount,
      expectedRoles,
      type,
    }) => {
      const submitted = completeAgentSubmissionPackage(type, applicantNames);
      const payload = toCockpitDraftPersistencePayload(
        submitted,
        agentProfile.id,
        agentProfile.id,
      );
      const expectedQuestionnaireRows = submitted.applicants.reduce(
        (total, applicant) =>
          total +
          applicant.sections.reduce(
            (sectionTotal, section) => sectionTotal + section.fields.length,
            0,
          ),
        0,
      );
      const questionnaireAnswers = payload.questionnaire_answers ?? [];

      expect(submitted.id).toMatch(/^VF-/);
      expect(new Set(submitted.applicants.map((applicant) => applicant.id)).size).toBe(
        submitted.applicants.length,
      );
      expect(submitted.applicants.map((applicant) => applicant.role)).toEqual(
        expectedRoles,
      );
      expect(payload.submission).toMatchObject({
        agent_id: agentProfile.id,
        city: "Санкт-Петербург",
        id: submitted.id,
        status: "waiting_review",
        type,
      });
      expect(payload.submission.submitted_at).toMatch(
        /^\d{4}-\d{2}-\d{2}T/,
      );
      expect(payload.submission.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(payload.applicants).toHaveLength(applicantNames.length);
      expect(
        payload.applicants.every(
          (applicant) => applicant.submission_id === submitted.id,
        ),
      ).toBe(true);
      expect(questionnaireAnswers).toHaveLength(expectedQuestionnaireRows);
      expect(
        questionnaireAnswers.find(
          (answer) =>
            answer.applicant_id === submitted.applicants[0]?.id &&
            answer.field_id === "surname",
        )?.value,
      ).toBe("UPDATED-SURNAME");
      expect(payload.media_assets).toHaveLength(expectedMediaCount);
      expect(new Set(payload.media_assets.map((asset) => asset.type))).toEqual(
        new Set(["passport_scan", "selfie", "selfie_2"]),
      );
      expect(
        payload.media_assets.every(
          (asset) =>
            asset.storage_bucket === mediaStorageBucket &&
            asset.storage_path.startsWith(
              `submissions/${submitted.id}/applicants/${asset.applicant_id}/${asset.type}/`,
            ),
        ),
      ).toBe(true);
      expect(payload.status_history.map((row) => row.to_status)).toEqual([
        "submitted_for_review",
        "in_progress",
      ]);
      expect(reviewHandoffPersistenceIssues(submitted, "agent")).toEqual([]);

      const saved = await saveCockpitSubmissionsForProfile(
        agentProfile,
        [submitted],
        new Map(),
        new Map(),
      );
      expect(rpcNames()).toEqual(["save_agent_submission_if_current"]);
      expect(mockState.rpcCalls[0]?.args).toMatchObject({
        actor_id: agentProfile.id,
        expected_revision: null,
        operation_id: expect.any(String),
      });
      expect(saved.caseRevisionsBySubmissionId.get(submitted.id)).toBe(0);
      expect(saved.ownerIdsBySubmissionId.get(submitted.id)).toBe(agentProfile.id);
      expect(saved.operationIdsBySubmissionId.get(submitted.id)).toBe(
        mockState.rpcCalls[0]?.args.operation_id,
      );
      expect(mockState.rpcCalls[0]?.args.payload).toMatchObject({
        applicants: payload.applicants,
        media_assets: payload.media_assets,
        questionnaire_answers: payload.questionnaire_answers,
        submission: {
          agent_id: agentProfile.id,
          id: submitted.id,
          status: "waiting_review",
        },
        status_history: [
          expect.objectContaining({
            from_status: "in_progress",
            to_status: "submitted_for_review",
          }),
          expect.objectContaining({
            from_status: "draft",
            to_status: "in_progress",
          }),
        ],
      });

      mockState.submissionRows = [
        {
          ...payload.submission,
          created_at: submitted.createdAt,
          updated_at: payload.submission.updated_at,
        },
      ];
      mockState.applicantRows = payload.applicants;
      mockState.questionnaireRows = questionnaireAnswers;
      mockState.mediaAssetRows = payload.media_assets;
      mockState.statusHistoryRows = payload.status_history;
      mockState.profileRows = [
        {
          display_name: agentProfile.displayName,
          id: agentProfile.id,
        },
      ];

      const adminReadback = await loadCockpitSubmissionsForProfile(adminProfile);
      const restored = adminReadback.submissions[0];

      expect(adminReadback.ownerIdsBySubmissionId.get(submitted.id)).toBe(
        agentProfile.id,
      );
      expect(restored).toMatchObject({
        agentDisplayName: agentProfile.displayName,
        city: "Санкт-Петербург",
        createdAt: submitted.createdAt,
        id: submitted.id,
        status: "submitted_for_review",
        type,
      });
      expect(restored?.applicants.map((applicant) => applicant.role)).toEqual(
        expectedRoles,
      );
      expect(
        restored?.applicants[0]?.sections
          .flatMap((section) => section.fields)
          .find((field) => field.id === "surname")?.value,
      ).toBe("UPDATED-SURNAME");
      expect(restored?.files).toHaveLength(expectedMediaCount);
      expect(
        restored?.files.every(
          (file) =>
            file.storageAdapter === "supabase-private" &&
            file.storagePath?.startsWith(
              `submissions/${submitted.id}/applicants/${file.applicantId}/${file.type}/`,
            ),
        ),
      ).toBe(true);
    },
  );

  it("retries an atomic review handoff after a transient transport failure", async () => {
    const submitted = completeAgentSubmissionPackage("single", [
      "ANTON VOLKOV",
    ]);
    mockState.rpcResults = [
      {
        error: {
          message: "Failed to fetch",
          name: "FetchError",
        },
      },
      { error: null },
    ];

    await saveCockpitSubmissionsForProfile(
      agentProfile,
      [submitted],
      new Map(),
      new Map(),
    );

    expect(rpcNames()).toEqual([
      "save_agent_submission_if_current",
      "save_agent_submission_if_current",
    ]);
    expect(mockState.rpcCalls[1]?.args).toEqual(mockState.rpcCalls[0]?.args);
  });

  it("persists explicit family relationships for Admin readback", () => {
    const family = createDraftSubmission({
      agentId: agentProfile.id,
      applicantNames: ["PARENT PERSON", "CHILD PERSON"],
      applicantRoles: ["main", "child"],
      city: "Москва",
      familyCount: 2,
      idScheme: "supabase",
      submissions: [],
      type: "family",
    });
    const payload = toCockpitDraftPersistencePayload(
      family,
      agentProfile.id,
      agentProfile.id,
    );

    expect(payload.applicants.map((applicant) => applicant.role)).toEqual([
      "Основной заявитель",
      "Ребёнок",
    ]);
    expect(
      payload.applicants.every((applicant) => applicant.role_confirmed),
    ).toBe(true);
  });

  it("reloads an accepted resubmission with pending media and inactive package identity", async () => {
    const acceptedBase = normalizeSubmissionForCanonicalRuntime(
      fillRequiredQuestionnaireForTest({
        ...(initialSubmissions.find((item) => item.id === "ПД-1056") as Submission),
        agentId: agentProfile.id,
        id: "ПД-ACCEPTED-RESUBMISSION-RELOAD",
      }),
    );
    const exportPackage = buildExportPackageIdentity([acceptedBase]);
    if (!exportPackage) throw new Error("Expected export package identity");
    const accepted: Submission = {
      ...acceptedBase,
      exportPackage,
    };
    const result = submitForReview(accepted, "agent", agentProfile.id);
    if (!result.ok) throw new Error(result.error.message);
    const payload = toCockpitDraftPersistencePayload(
      result.data,
      agentProfile.id,
      agentProfile.id,
    );

    mockState.submissionRows = [
      {
        ...payload.submission,
        created_at: "2026-07-26T12:00:00.000Z",
        updated_at: "2026-07-26T12:01:00.000Z",
      },
    ];
    mockState.mediaAssetRows = payload.media_assets;

    const loaded = await loadCockpitSubmissionsForProfile(agentProfile);
    const reloaded = loaded.submissions[0];

    expect(reloaded).toMatchObject({
      exportState: "not_ready",
      status: "submitted_for_review",
    });
    expect(reloaded?.exportPackage).toBeUndefined();
    expect(
      reloaded?.files.every(
        (file) =>
          file.status === "pending_review" &&
          file.reviewStatus === "not_reviewed" &&
          file.reviewedAtIso === undefined &&
          file.reviewedBy === undefined,
      ),
    ).toBe(true);
    expect(reloaded?.history[0]).toMatchObject({
      actorId: agentProfile.id,
      fromStatus: "ready_for_export",
      toStatus: "submitted_for_review",
    });
  });

  it("assigns a submission public number through the protected RPC", async () => {
    mockState.rpcResults = [
      {
        data: { assignedNow: true, caseRevision: 8, publicNumber: 1059 },
        error: null,
      },
    ];

    await expect(ensureSubmissionPublicNumber("VF-DRAFT-1059")).resolves.toEqual({
      assignedNow: true,
      caseRevision: 8,
      publicNumber: 1059,
    });
    expect(mockState.rpcCalls).toEqual([
      {
        args: { submission_id: "VF-DRAFT-1059" },
        name: "ensure_submission_public_number",
      },
    ]);
  });

  it.each([
    null,
    { assignedNow: true, publicNumber: 1059 },
    { assignedNow: true, caseRevision: 8, publicNumber: "1059" },
    { assignedNow: true, caseRevision: 8, publicNumber: 10_000 },
  ])("rejects an invalid public-number RPC payload: %j", async (data) => {
    mockState.rpcResults = [{ data, error: null }];

    await expect(ensureSubmissionPublicNumber("VF-DRAFT-1059")).rejects.toThrow(
      /некорректн(ый|ое).*(номер|результат)/i,
    );
  });

  it("maps a public-number RPC failure to observable persistence diagnostics", async () => {
    mockState.rpcResults = [
      {
        data: null,
        error: { code: "42501", message: "permission denied" },
      },
    ];

    const error = await ensureSubmissionPublicNumber("VF-DRAFT-1059").catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(PersistenceObservableError);
    expect((error as PersistenceObservableError).diagnostics).toMatchObject({
      kind: "rls",
      operation: "rpc.ensure_submission_public_number",
      retryable: false,
      safeCode: "rpc.ensure_submission_public_number:rls:42501",
      supabaseCode: "42501",
    });
  });

  it("keeps an empty remote workspace empty instead of loading local demo data", async () => {
    const loaded = await loadCockpitSubmissionsForProfile(agentProfile);

    expect(loaded.submissions).toEqual([]);
    expect(loaded.ownerIdsBySubmissionId.size).toBe(0);
    expect(mockState.fromCalls).toEqual(["submissions"]);
  });

  it("loads every canonical submission beyond the first 100 rows", async () => {
    const source = initialSubmissions[0] as Submission;
    mockState.submissionRows = Array.from({ length: 101 }, (_, index) => {
      const submission = {
        ...source,
        id: `VF-PAGE-${String(index).padStart(3, "0")}`,
      };
      const payload = toCockpitDraftPersistencePayload(
        submission,
        agentProfile.id,
        agentProfile.id,
      );
      return {
        ...payload.submission,
        case_revision: index,
        created_at: "2026-07-22T10:00:00.000Z",
        updated_at: `2026-07-22T10:00:${String(index % 60).padStart(2, "0")}.000Z`,
      };
    });

    const loaded = await loadCockpitSubmissionsForProfile(agentProfile);

    expect(loaded.submissions).toHaveLength(101);
    expect(loaded.caseRevisionsBySubmissionId.size).toBe(101);
    expect(
      mockState.fromCalls.filter((table) => table === "submissions"),
    ).toHaveLength(2);
    expect(mockState.gtCalls).toEqual([
      { column: "id", value: "VF-PAGE-099" },
    ]);
  });

  it("quarantines a corrupt snapshot without blocking healthy submissions", async () => {
    const source = initialSubmissions[0] as Submission;
    const corruptSubmission = { ...source, id: "VF-CORRUPT-001" };
    const healthySubmission = { ...source, id: "VF-HEALTHY-002" };
    const corruptPayload = toCockpitDraftPersistencePayload(
      corruptSubmission,
      agentProfile.id,
      agentProfile.id,
    );
    const healthyPayload = toCockpitDraftPersistencePayload(
      healthySubmission,
      agentProfile.id,
      agentProfile.id,
    );
    mockState.submissionRows = [
      {
        ...corruptPayload.submission,
        family_intelligence: {
          [cockpitSnapshotKey]: { submission: {}, version: 999 },
        },
        created_at: "2026-07-22T10:00:00.000Z",
        updated_at: "2026-07-22T10:00:00.000Z",
      },
      {
        ...healthyPayload.submission,
        created_at: "2026-07-22T10:00:00.000Z",
        updated_at: "2026-07-22T10:00:00.000Z",
      },
    ];

    const loaded = await loadCockpitSubmissionsForProfile(agentProfile);

    expect(loaded.submissions.map((submission) => submission.id)).toEqual([
      "VF-CORRUPT-001",
      "VF-HEALTHY-002",
    ]);
    expect(loaded.submissions[0]?.issues).toEqual([
      expect.objectContaining({
        createdBy: "system",
        reason: expect.stringMatching(/повреждённый cockpit snapshot/i),
        severity: "blocker",
        status: "open",
      }),
    ]);
    expect(loaded.submissions[1]?.issues).toEqual(healthySubmission.issues);
    expect([...loaded.quarantinedSubmissionIds]).toEqual(["VF-CORRUPT-001"]);
  });

  it("recovers durable applicant roles and corrections when the snapshot is absent", async () => {
    const submission = initialSubmissions[0] as Submission;
    const payload = toCockpitDraftPersistencePayload(
      submission,
      agentProfile.id,
      agentProfile.id,
    );
    mockState.submissionRows = [
      {
        ...payload.submission,
        family_intelligence: null,
        created_at: "2026-07-22T10:00:00.000Z",
        updated_at: "2026-07-22T10:00:00.000Z",
      },
    ];
    mockState.applicantRows = [
      {
        full_name: submission.applicants[0]?.fullName,
        id: submission.applicants[0]?.id,
        media_percent: 100,
        questionnaire_percent: 100,
        role: "Супруг",
        submission_id: submission.id,
      },
    ];
    mockState.correctionRows = [
      {
        applicant_id: submission.applicants[0]?.id,
        created_at: "2026-07-22T10:05:00.000Z",
        created_by: adminProfile.id,
        field_key: "passport-no",
        fixed_at: null,
        id: "00000000-0000-4000-8000-000000000777",
        media_type: null,
        reason: "Проверьте номер паспорта",
        scope: "field",
        severity: "blocking",
        status: "open",
        submission_id: submission.id,
      },
    ];

    const loaded = await loadCockpitSubmissionsForProfile(agentProfile);

    expect(loaded.submissions[0]?.applicants[0]?.role).toBe("spouse");
    expect(loaded.submissions[0]?.issues).toEqual([
      expect.objectContaining({
        id: "00000000-0000-4000-8000-000000000777",
        reason: "Проверьте номер паспорта",
        severity: "blocker",
        status: "open",
      }),
    ]);
  });

  it("detects only changed cockpit submissions against the remote baseline", () => {
    const first = initialSubmissions[0] as Submission;
    const second = initialSubmissions[1] as Submission;
    const baseline = cockpitSubmissionFingerprintMap([first, second]);
    const changedSecond = { ...second, title: `${second.title} updated` };

    expect(changedCockpitSubmissions([first, second], baseline)).toEqual([]);
    expect(changedCockpitSubmissions([first, changedSecond], baseline)).toEqual([
      changedSecond,
    ]);
  });

  it("keeps profile display names out of the persisted cockpit snapshot", () => {
    const submission: Submission = {
      ...(initialSubmissions[0] as Submission),
      agentDisplayName: "Антон Волков",
    };

    const payload = toCockpitDraftPersistencePayload(
      submission,
      agentProfile.id,
      submission.agentId,
    );

    expect(JSON.stringify(payload.submission.family_intelligence)).not.toContain(
      "agentDisplayName",
    );
  });

  it("saves only the dirty submissions passed by the cockpit effect", async () => {
    const changedSubmission = {
      ...(initialSubmissions[0] as Submission),
      title: "Изменённая подача",
    };

    await saveCockpitSubmissionsForProfile(
      agentProfile,
      [changedSubmission],
      new Map(),
      new Map(),
    );

    expect(rpcNames()).toEqual(["save_agent_submission_if_current"]);
    expect(payloadSubmission()).toMatchObject({
      agent_id: agentProfile.id,
      id: changedSubmission.id,
      title: changedSubmission.title,
    });
  });

  it("sends and advances the loaded Agent case revision", async () => {
    const changedSubmission = {
      ...(initialSubmissions[0] as Submission),
      title: "Revision checked",
    };

    const saved = await saveCockpitSubmissionsForProfile(
      agentProfile,
      [changedSubmission],
      new Map([[changedSubmission.id, agentProfile.id]]),
      new Map([[changedSubmission.id, 8]]),
    );

    expect(mockState.rpcCalls[0]?.args).toMatchObject({
      actor_id: agentProfile.id,
      expected_revision: 8,
      operation_id: expect.any(String),
    });
    expect(saved.caseRevisionsBySubmissionId.get(changedSubmission.id)).toBe(9);
  });

  it("fails closed when an existing Agent submission has no server revision", async () => {
    const changedSubmission = {
      ...(initialSubmissions[0] as Submission),
      title: "Missing revision",
    };

    await expect(
      saveCockpitSubmissionsForProfile(
        agentProfile,
        [changedSubmission],
        new Map([[changedSubmission.id, agentProfile.id]]),
        new Map(),
      ),
    ).rejects.toThrow("не имеет server revision");
    expect(rpcNames()).toEqual([]);
  });

  it("retries a transient idempotent draft save once", async () => {
    const changedSubmission = {
      ...(initialSubmissions[0] as Submission),
      title: "Повторяемая отправка",
    };
    mockState.rpcResults = [
      {
        error: {
          message: "Failed to fetch",
          name: "FetchError",
        },
      },
      { error: null },
    ];

    await saveCockpitSubmissionsForProfile(
      agentProfile,
      [changedSubmission],
      new Map(),
      new Map(),
    );

    expect(rpcNames()).toEqual([
      "save_agent_submission_if_current",
      "save_agent_submission_if_current",
    ]);
  });

  it("writes separate trip date range columns while keeping legacy travel_date", () => {
    const submission: Submission = {
      ...(initialSubmissions[0] as Submission),
      tripDateFrom: "2026-08-11",
      tripDateTo: "2026-08-20",
    };
    const payload = toCockpitDraftPersistencePayload(
      submission,
      agentProfile.id,
      agentProfile.id,
    );

    expect(payload.submission).toMatchObject({
      travel_date: "2026-08-11 - 2026-08-20",
      trip_date_from: "2026-08-11",
      trip_date_to: "2026-08-20",
    });
  });

  it("persists returned common appointment PDF in the cockpit snapshot", async () => {
    const submission: Submission = {
      ...(initialSubmissions[0] as Submission),
      id: "ПД-PDF-PACKAGE",
      returnedPdfPackage: {
        commonAppointmentPdf: {
          fileName: "appointment-list.pdf",
          mimeType: "application/pdf",
          sha256: "a".repeat(64),
          sizeBytes: 24_000,
          storageBucket: "submission-media",
          storagePath:
            "ПД-PDF-PACKAGE/common/appointment_pdf/aaaaaaaaaaaaaaaa_appointment_pdf.pdf",
          uploadedAtIso: "2026-06-27T10:00:00.000Z",
          uploadedBy: adminProfile.id,
        },
        reviewedAtIso: "2026-06-27T10:05:00.000Z",
        reviewedBy: adminProfile.id,
      },
    };
    const payload = toCockpitDraftPersistencePayload(
      submission,
      adminProfile.id,
      agentProfile.id,
    );
    const snapshot = readCockpitSnapshot(
      payload.submission.family_intelligence as Json,
    );

    expect(snapshot?.returnedPdfPackage).toEqual(submission.returnedPdfPackage);

    mockState.submissionRows = [
      {
        ...payload.submission,
        created_at: "2026-06-27T10:00:00.000Z",
        updated_at: "2026-06-27T10:05:00.000Z",
      },
    ];

    const loaded = await loadCockpitSubmissionsForProfile(agentProfile);

    expect(loaded.submissions[0]?.returnedPdfPackage).toEqual(
      submission.returnedPdfPackage,
    );
  });

  it("keeps submissions created by different agents under their own owners", async () => {
    const firstAgentSubmission = {
      ...(initialSubmissions[0] as Submission),
      id: "ПД-MULTI-1",
      title: "Первый агент создал семью",
    };
    const secondAgentSubmission = {
      ...(initialSubmissions[1] as Submission),
      id: "ПД-MULTI-2",
      title: "Второй агент создал заявителя",
    };

    await saveCockpitSubmissionsForProfile(
      agentProfile,
      [firstAgentSubmission],
      new Map(),
      new Map(),
    );
    await saveCockpitSubmissionsForProfile(
      otherAgentProfile,
      [secondAgentSubmission],
      new Map(),
      new Map(),
    );

    expect(rpcNames()).toEqual([
      "save_agent_submission_if_current",
      "save_agent_submission_if_current",
    ]);
    expect(payloadSubmission(0)).toMatchObject({
      agent_id: agentProfile.id,
      id: firstAgentSubmission.id,
      title: firstAgentSubmission.title,
    });
    expect(payloadSubmission(1)).toMatchObject({
      agent_id: otherAgentProfile.id,
      id: secondAgentSubmission.id,
      title: secondAgentSubmission.title,
    });
  });

  it("uses one atomic RPC when submitting fixed corrections for review", async () => {
    const returnedSubmission = initialSubmissions.find(
      (submission) => submission.status === "returned",
    ) as Submission;
    const correctedSubmission: Submission = {
      ...returnedSubmission,
      updatedAt: "сейчас",
      status: "corrections_received",
      issues: returnedSubmission.issues.map((issue) =>
        issue.status === "open" ? { ...issue, status: "fixed_by_agent" } : issue,
      ),
      files: returnedSubmission.files.map((file) =>
        file.linkedIssueId
          ? {
              ...file,
              generatedFileName: `replacement-${file.id}.jpg`,
              reviewStatus: "not_reviewed",
              status: "uploaded",
              storageAdapter: "supabase-private",
              storageBucket: "submission-media",
              storagePath: `submissions/${returnedSubmission.id}/applicants/${file.applicantId}/${file.type}/replacement-${file.id}.jpg`,
              uploadStatus: "uploaded",
              uploadedAtIso: "2026-06-27T10:00:00.000Z",
            }
          : file,
      ),
      history: [
        {
          id: "и-corrections-handoff",
          text: "Агент отправил исправления",
          at: "сейчас",
          fromStatus: "returned",
          source: "agent",
          toStatus: "corrections_received",
        },
        ...returnedSubmission.history,
      ],
    };

    await saveCockpitSubmissionsForProfile(
      agentProfile,
      [correctedSubmission],
      new Map(),
      new Map(),
    );

    expect(rpcNames()).toEqual(["save_agent_submission_if_current"]);
    expect(
      (
        mockState.rpcCalls.find(
          (call) => call.name === "save_agent_submission_if_current",
        )?.args.payload as {
          submission: { status: string };
        }
    ).submission.status,
    ).toBe("waiting_review");
  });

  it("uses the draft RPC when an admin reviews an existing correction handoff", async () => {
    const returnedSubmission = initialSubmissions.find(
      (submission) => submission.status === "returned",
    ) as Submission;
    const handedOffSubmission: Submission = {
      ...returnedSubmission,
      updatedAt: "2026-07-16T12:30:00.000Z",
      status: "corrections_received",
      issues: returnedSubmission.issues.map((issue) =>
        issue.status === "open" ? { ...issue, status: "fixed_by_agent" } : issue,
      ),
      files: returnedSubmission.files.map((file) =>
        file.linkedIssueId
          ? {
              ...file,
              generatedFileName: `replacement-${file.id}.jpg`,
              reviewStatus: "not_reviewed",
              status: "uploaded",
              storageAdapter: "supabase-private",
              storageBucket: "submission-media",
              storagePath: `submissions/${returnedSubmission.id}/applicants/${file.applicantId}/${file.type}/replacement-${file.id}.jpg`,
              uploadStatus: "uploaded",
              uploadedAtIso: "2026-06-27T10:00:00.000Z",
            }
          : file,
      ),
      history: [
        {
          id: "и-existing-corrections-handoff",
          text: "Агент отправил исправления",
          at: "2026-07-16T12:25:00.000Z",
          fromStatus: "returned",
          source: "agent",
          toStatus: "corrections_received",
        },
        ...returnedSubmission.history,
      ],
    };
    const operationId = "00000000-0000-4000-8000-000000000881";
    vi.spyOn(crypto, "randomUUID").mockReturnValue(operationId);
    mockState.rpcResults = [
      {
        data: {
          caseRevisions: { [handedOffSubmission.id]: 1 },
          operationId,
          results: [],
        },
        error: null,
      },
    ];

    await saveAdminCockpitSubmissionsIfCurrent(
      adminProfile,
      [handedOffSubmission],
      new Map([[handedOffSubmission.id, agentProfile.id]]),
      new Map([[handedOffSubmission.id, 0]]),
    );

    expect(rpcNames()).toEqual(["save_admin_submission_batch_if_current"]);
    expect(
      (
        mockState.rpcCalls[0]?.args.payloads as Array<{
          submission: { status: string };
        }>
      )[0]?.submission.status,
    ).toBe("waiting_review");
  });

  it("fails closed before RPC when fixed issues do not resolve their targets", async () => {
    const returnedSubmission = initialSubmissions.find(
      (submission) => submission.status === "returned",
    ) as Submission;
    const invalidCorrections: Submission = {
      ...returnedSubmission,
      updatedAt: "сейчас",
      status: "corrections_received",
      issues: returnedSubmission.issues.map((issue) =>
        issue.status === "open" ? { ...issue, status: "fixed_by_agent" } : issue,
      ),
      history: [
        {
          id: "и-corrections-invalid-target",
          text: "Агент отправил исправления",
          at: "сейчас",
          fromStatus: "returned",
          source: "agent",
          toStatus: "corrections_received",
        },
        ...returnedSubmission.history,
      ],
    };

    expect(reviewHandoffPersistenceIssues(invalidCorrections)).toContain(
      "corrections_received fixed issues must resolve their targets",
    );
    await expect(
      saveCockpitSubmissionsForProfile(
        agentProfile,
        [invalidCorrections],
        new Map(),
        new Map(),
      ),
    ).rejects.toMatchObject({
      diagnostics: {
        safeCode: "rpc.save_agent_submission_if_current:save:HANDOFF_CONSISTENCY",
      },
    });
    expect(rpcNames()).toEqual([]);
  });

  it("canonicalizes a label target across Admin snapshot, correction, and Agent fix", async () => {
    const submitted = initialSubmissions.find(
      (submission) => submission.status === "submitted_for_review",
    ) as Submission;
    const applicant = submitted.applicants[0];
    if (!applicant) throw new Error("Missing applicant");
    const returned: Submission = {
      ...submitted,
      status: "returned",
      updatedAt: "сейчас",
      issues: [
        {
          id: "зм-return-contract",
          type: "field",
          target: {
            applicantId: applicant.id,
            applicantName: applicant.fullName,
            field: "Маршрут поездки",
            section: "Анкета",
          },
          reason: "Маршрут не конкретен",
          comment: "Нужно уточнить маршрут.",
          severity: "blocker",
          status: "open",
          createdBy: "admin",
          createdAt: "сейчас",
        },
      ],
      history: [
        {
          id: "и-return-contract",
          text: "Администратор вернул подачу с замечаниями",
          at: "сейчас",
          fromStatus: "submitted_for_review",
          note: "Нужно уточнить маршрут.",
          source: "admin",
          toStatus: "returned",
        },
        ...submitted.history,
      ],
    };

    const operationId = "00000000-0000-4000-8000-000000000882";
    vi.spyOn(crypto, "randomUUID").mockReturnValue(operationId);
    mockState.rpcResults = [
      {
        data: {
          caseRevisions: { [returned.id]: 1 },
          operationId,
          results: [],
        },
        error: null,
      },
    ];

    await saveAdminCockpitSubmissionsIfCurrent(
      adminProfile,
      [returned],
      new Map([[returned.id, returned.agentId]]),
      new Map([[returned.id, 0]]),
    );

    expect(rpcNames()).toEqual(["save_admin_submission_batch_if_current"]);
    const persistedPayload = (
      mockState.rpcCalls[0]?.args.payloads as Array<{
        corrections: Array<{ field_key: string | null }>;
        submission: { family_intelligence: Json | null };
        status_history: Array<{
          from_status: string | null;
          note: string | null;
          source: string;
          to_status: string;
        }>;
      }>
    )[0];
    if (!persistedPayload) throw new Error("Missing Admin persistence payload");
    const persistedSnapshot = readCockpitSnapshot(
      persistedPayload.submission.family_intelligence,
    );
    const persistedIssue = persistedSnapshot?.issues[0];
    const persistedApplicant = persistedSnapshot?.applicants[0];
    const persistedTarget = persistedApplicant?.sections
      .flatMap((section) =>
        section.fields.map((field) => ({ field, sectionId: section.id })),
      )
      .find(({ field }) => field.id === "first-entry-country");
    if (
      !persistedSnapshot ||
      !persistedIssue ||
      !persistedApplicant ||
      !persistedTarget
    ) {
      throw new Error("Missing canonical Admin issue readback");
    }
    expect(persistedIssue).toMatchObject({
      snapshot: persistedTarget.field.value,
      target: { field: "first-entry-country" },
    });
    expect(persistedPayload.corrections[0]?.field_key).toBe(
      "first-entry-country",
    );

    const corrected = updateQuestionnaireField(persistedSnapshot, {
      applicantId: persistedApplicant.id,
      fieldId: persistedTarget.field.id,
      sectionId: persistedTarget.sectionId,
      value: `${persistedTarget.field.value} · исправлено`,
    });
    const fixed = markSubmissionIssueFixedResult(
      corrected,
      persistedIssue.id,
      "agent",
    );
    if (!fixed.ok) throw new Error(fixed.error.message);
    const agentPayload = toCockpitDraftPersistencePayload(
      fixed.data,
      persistedSnapshot.agentId,
      persistedSnapshot.agentId,
    );
    const agentSnapshot = readCockpitSnapshot(
      agentPayload.submission.family_intelligence as Json,
    );
    expect(agentSnapshot?.issues[0]).toMatchObject({
      status: "fixed_by_agent",
      target: { field: "first-entry-country" },
    });
    expect(agentPayload.corrections[0]?.field_key).toBe("first-entry-country");
    expect(
      persistedPayload.status_history[0],
    ).toMatchObject({
      from_status: "submitted_for_review",
      note: "Нужно уточнить маршрут.",
      source: "admin",
      to_status: "returned",
    });
  });

  it("fails closed before RPC when a current return omits typed handoff history", async () => {
    const submitted = initialSubmissions.find(
      (submission) => submission.status === "submitted_for_review",
    ) as Submission;
    const applicant = submitted.applicants[0];
    if (!applicant) throw new Error("Missing applicant");
    const invalidReturned: Submission = {
      ...submitted,
      status: "returned",
      updatedAt: "сейчас",
      issues: [
        {
          id: "зм-missing-handoff-history",
          type: "field",
          target: {
            applicantId: applicant.id,
            applicantName: applicant.fullName,
            field: "Маршрут поездки",
            section: "Анкета",
          },
          reason: "Маршрут не конкретен",
          comment: "Нужно уточнить маршрут.",
          severity: "blocker",
          status: "open",
          createdBy: "admin",
          createdAt: "сейчас",
        },
      ],
      history: submitted.history,
    };

    expect(reviewHandoffPersistenceIssues(invalidReturned)).toContain(
      "returned requires matching admin history",
    );
    await expect(
      saveAdminCockpitSubmissionsIfCurrent(
        adminProfile,
        [invalidReturned],
        new Map([[invalidReturned.id, invalidReturned.agentId]]),
        new Map([[invalidReturned.id, 0]]),
      ),
    ).rejects.toMatchObject({
      diagnostics: {
        safeCode: "rpc.save_agent_submission_if_current:save:HANDOFF_CONSISTENCY",
      },
    });
    expect(rpcNames()).toEqual([]);
  });

  it("rehydrates typed status history rows over snapshot-only status events", async () => {
    const submitted = initialSubmissions.find(
      (submission) => submission.status === "submitted_for_review",
    ) as Submission;
    const payload = toCockpitDraftPersistencePayload(
      submitted,
      adminProfile.id,
      submitted.agentId,
    );
    mockState.submissionRows = [
      {
        ...payload.submission,
        created_at: "2026-06-16T09:00:00.000Z",
        updated_at: "2026-06-16T09:10:00.000Z",
      },
    ];
    mockState.statusHistoryRows = [
      {
        id: "00000000-0000-4000-8000-000000000777",
        entity_type: "submission",
        entity_id: submitted.id,
        from_status: "in_progress",
        to_status: "submitted_for_review",
        comment: "Агент отправил подачу на проверку",
        source: "agent",
        note: "Все обязательные файлы загружены",
        changed_by: agentProfile.id,
        changed_at: "2026-06-16T09:10:00.000Z",
      },
    ];

    const loaded = await loadCockpitSubmissionsForProfile(adminProfile);

    expect(loaded.submissions[0]?.history[0]).toMatchObject({
      actorId: agentProfile.id,
      createdAt: "2026-06-16T09:10:00.000Z",
      fromStatus: "in_progress",
      note: "Все обязательные файлы загружены",
      source: "agent",
      toStatus: "submitted_for_review",
    });

    const reserialized = toCockpitDraftPersistencePayload(
      loaded.submissions[0]!,
      agentProfile.id,
      submitted.agentId,
      "agent",
    );
    expect(reserialized.status_history).toHaveLength(1);
    expect(reserialized.status_history[0]).toMatchObject({
      id: "00000000-0000-4000-8000-000000000777",
      from_status: "in_progress",
      to_status: "submitted_for_review",
    });
  });

  it("fails closed before RPC when acceptance keeps fixed issues unresolved", async () => {
    const corrections = initialSubmissions.find(
      (submission) => submission.status === "corrections_received",
    ) as Submission;
    const invalidAccepted: Submission = {
      ...corrections,
      status: "ready_for_export",
      exportState: "ready",
      updatedAt: "сейчас",
      issues: corrections.issues.map((issue) => ({
        ...issue,
        status: "fixed_by_agent",
      })),
      history: [
        {
          id: "и-accept-with-unresolved",
          text: "Администратор закрыл исправления и принял подачу",
          at: "сейчас",
          fromStatus: "corrections_received",
          source: "admin",
          toStatus: "ready_for_export",
        },
        ...corrections.history,
      ],
    };

    expect(reviewHandoffPersistenceIssues(invalidAccepted)).toContain(
      "ready_for_export cannot persist unresolved issues",
    );
    await expect(
      saveAdminCockpitSubmissionsIfCurrent(
        adminProfile,
        [invalidAccepted],
        new Map([[invalidAccepted.id, invalidAccepted.agentId]]),
        new Map([[invalidAccepted.id, 0]]),
      ),
    ).rejects.toMatchObject({
      diagnostics: {
        safeCode: "rpc.save_agent_submission_if_current:save:HANDOFF_CONSISTENCY",
      },
    });
    expect(rpcNames()).toEqual([]);
  });

  it("persists questionnaire projection without embedding a normalized snapshot", async () => {
    const submission = initialSubmissions[0] as Submission;
    const payload = toCockpitDraftPersistencePayload(
      submission,
      agentProfile.id,
      agentProfile.id,
    );
    mockState.submissionRows = [
      {
        ...payload.submission,
        created_at: "2026-06-16T09:00:00.000Z",
        case_revision: 14,
        updated_at: "2026-06-16T09:00:00.000Z",
      },
    ];
    mockState.applicantRows = [
      {
        id: submission.applicants[0].id,
        submission_id: submission.id,
        full_name: submission.applicants[0].fullName,
        role: "Основной заявитель",
        questionnaire_percent: 100,
        media_percent: 100,
      },
    ];

    const loaded = await loadCockpitSubmissionsForProfile(agentProfile);
    const savedPayload = toCockpitDraftPersistencePayload(
      loaded.submissions[0] as Submission,
      agentProfile.id,
      agentProfile.id,
    );
    const savedSnapshot = readCockpitSnapshot(
      savedPayload.submission.family_intelligence as Json,
    );

    expect(savedPayload.applicants[0]).toMatchObject({
      birth_date: null,
      email: null,
      passport_number: "660010481",
      phone: null,
    });
    expect(savedSnapshot?.applicants[0]).not.toHaveProperty("normalizedProfile");
  });

  it("hydrates fallback submissions from normalized questionnaire answers", async () => {
    const submission = fillRequiredQuestionnaireForTest(
      initialSubmissions[0] as Submission,
    );
    const payload = toCockpitDraftPersistencePayload(
      submission,
      agentProfile.id,
      agentProfile.id,
    );
    const sourceAnswer = payload.questionnaire_answers?.find((answer) => answer.value);
    if (!sourceAnswer) throw new Error("expected questionnaire answer");
    mockState.submissionRows = [
      {
        ...payload.submission,
        family_intelligence: null,
        created_at: "2026-06-16T09:00:00.000Z",
        updated_at: "2026-06-16T09:00:00.000Z",
      },
    ];
    mockState.applicantRows = [
      {
        id: sourceAnswer.applicant_id,
        submission_id: submission.id,
        full_name: submission.applicants[0]?.fullName,
        role: "Основной заявитель",
        questionnaire_percent: 100,
        media_percent: 100,
      },
    ];
    mockState.questionnaireRows = [
      {
        ...sourceAnswer,
        id: "00000000-0000-4000-8000-000000000333",
        created_at: "2026-06-16T09:00:00.000Z",
        updated_at: "2026-06-16T09:00:00.000Z",
      },
    ];

    const loaded = await loadCockpitSubmissionsForProfile(agentProfile);
    const field = loaded.submissions[0]?.applicants[0]?.sections
      .flatMap((section) => section.fields)
      .find((candidate) => candidate.id === sourceAnswer.field_id);

    expect(mockState.fromCalls).toEqual([
      "submissions",
      "agent_submission_card_archives",
      "applicants",
      "questionnaire_answers",
      "media_assets",
      "corrections",
      "status_history",
    ]);
    expect(field).toMatchObject({
      id: sourceAnswer.field_id,
      label: sourceAnswer.label,
      value: sourceAnswer.value,
    });
  });

  it("hydrates normalized trip date range without relying on cockpit snapshot", async () => {
    const submission = initialSubmissions[0] as Submission;
    const payload = toCockpitDraftPersistencePayload(
      submission,
      agentProfile.id,
      agentProfile.id,
    );
    mockState.submissionRows = [
      {
        ...payload.submission,
        family_intelligence: null,
        travel_date: "legacy collapsed date",
        trip_date_from: "2026-08-11",
        trip_date_to: "2026-08-20",
        created_at: "2026-06-16T09:00:00.000Z",
        updated_at: "2026-06-16T09:00:00.000Z",
      },
    ];
    mockState.applicantRows = [];

    const loaded = await loadCockpitSubmissionsForProfile(agentProfile);

    expect(loaded.submissions[0]).toMatchObject({
      tripDateFrom: "2026-08-11",
      tripDateTo: "2026-08-20",
    });
  });

  it("recovers corrections_received from durable history without cockpit snapshot", async () => {
    const submission = {
      ...(initialSubmissions[0] as Submission),
      status: "corrections_received" as const,
    };
    const payload = toCockpitDraftPersistencePayload(
      submission,
      agentProfile.id,
      agentProfile.id,
    );
    mockState.submissionRows = [
      {
        ...payload.submission,
        family_intelligence: null,
        status: "waiting_review",
        created_at: "2026-06-16T09:00:00.000Z",
        updated_at: "2026-06-16T09:00:00.000Z",
      },
    ];
    mockState.applicantRows = [
      {
        id: submission.applicants[0]?.id,
        submission_id: submission.id,
        full_name: submission.applicants[0]?.fullName,
        role: "Основной заявитель",
        questionnaire_percent: 100,
        media_percent: 100,
      },
    ];
    mockState.statusHistoryRows = [
      {
        id: "00000000-0000-4000-8000-000000000456",
        entity_type: "submission",
        entity_id: submission.id,
        from_status: null,
        to_status: "corrections_received",
        comment: "Агент отправил исправления",
        source: "agent",
        note: "Повторная отправка",
        changed_by: agentProfile.id,
        changed_at: "2026-06-16T10:00:00.000Z",
      },
    ];

    const loaded = await loadCockpitSubmissionsForProfile(agentProfile);

    expect(loaded.submissions[0]).toMatchObject({
      status: "corrections_received",
    });
    expect(loaded.submissions[0]?.history[0]).toMatchObject({
      fromStatus: undefined,
      source: "agent",
      toStatus: "corrections_received",
    });
  });

  it("does not hydrate empty fallback questionnaire work as complete", async () => {
    const submission = initialSubmissions[0] as Submission;
    const payload = toCockpitDraftPersistencePayload(
      submission,
      agentProfile.id,
      agentProfile.id,
    );
    mockState.submissionRows = [
      {
        ...payload.submission,
        family_intelligence: null,
        readiness_percent: 100,
        created_at: "2026-06-16T09:00:00.000Z",
        updated_at: "2026-06-16T09:00:00.000Z",
      },
    ];
    mockState.applicantRows = [];

    const loaded = await loadCockpitSubmissionsForProfile(agentProfile);

    expect(loaded.submissions[0]?.completeness).toMatchObject({
      questionnaire: 0,
      files: 0,
      total: 0,
    });
  });

  it("keeps backward-compatible trip date fallback for legacy rows", async () => {
    const submission = initialSubmissions[0] as Submission;
    const payload = toCockpitDraftPersistencePayload(
      submission,
      agentProfile.id,
      agentProfile.id,
    );
    mockState.submissionRows = [
      {
        ...payload.submission,
        family_intelligence: null,
        travel_date: "2026-08-11",
        trip_date_from: null,
        trip_date_to: null,
        created_at: "2026-06-16T09:00:00.000Z",
        updated_at: "2026-06-16T09:00:00.000Z",
      },
    ];

    const loaded = await loadCockpitSubmissionsForProfile(agentProfile);

    expect(loaded.submissions[0]).toMatchObject({
      tripDateFrom: "2026-08-11",
      tripDateTo: "2026-08-11",
    });
  });

  it("splits legacy travel_date ranges when trip date columns are absent", async () => {
    const submission = initialSubmissions[0] as Submission;
    const payload = toCockpitDraftPersistencePayload(
      submission,
      agentProfile.id,
      agentProfile.id,
    );
    mockState.submissionRows = [
      {
        ...payload.submission,
        family_intelligence: null,
        travel_date: "2026-08-11 - 2026-08-20",
        trip_date_from: null,
        trip_date_to: null,
        created_at: "2026-06-16T09:00:00.000Z",
        updated_at: "2026-06-16T09:00:00.000Z",
      },
    ];

    const loaded = await loadCockpitSubmissionsForProfile(agentProfile);

    expect(loaded.submissions[0]).toMatchObject({
      tripDateFrom: "2026-08-11",
      tripDateTo: "2026-08-20",
    });
  });

  it("persists and hydrates questionnaire review metadata in answer values", async () => {
    const sourceSubmission = initialSubmissions[0] as Submission;
    const sourceApplicant = sourceSubmission.applicants[0];
    const sourceSection = sourceApplicant?.sections[0];
    const sourceField = sourceSection?.fields[0];
    if (!sourceApplicant || !sourceSection || !sourceField) {
      throw new Error("expected source questionnaire field");
    }

    const submission: Submission = {
      ...sourceSubmission,
      applicants: sourceSubmission.applicants.map((applicant) =>
        applicant.id === sourceApplicant.id
          ? {
              ...applicant,
              sections: applicant.sections.map((section) =>
                section.id === sourceSection.id
                  ? {
                      ...section,
                      fields: section.fields.map((field) =>
                        field.id === sourceField.id
                          ? {
                            ...field,
                            adminReviewApprovedAtIso: "2026-07-15T06:30:00.000Z",
                            adminReviewApprovedBy: "admin-reviewer",
                            reviewOriginSource: "passport_ocr",
                              reviewSource: "passport_ocr",
                              reviewState: "needs_review",
                            }
                          : field,
                      ),
                    }
                  : section,
              ),
            }
          : applicant,
      ),
    };
    const payload = toCockpitDraftPersistencePayload(
      submission,
      agentProfile.id,
      agentProfile.id,
    );
    const sourceAnswer = payload.questionnaire_answers?.find(
      (answer) => answer.field_id === sourceField.id,
    );
    if (!sourceAnswer) throw new Error("expected questionnaire answer");

    expect(sourceAnswer.value).toEqual({
      adminReviewApprovedAtIso: "2026-07-15T06:30:00.000Z",
      adminReviewApprovedBy: "admin-reviewer",
      kind: "v19_questionnaire_field",
      reviewOriginSource: "passport_ocr",
      reviewSource: "passport_ocr",
      reviewState: "needs_review",
      value: sourceField.value,
      version: 1,
    });

    mockState.submissionRows = [
      {
        ...payload.submission,
        family_intelligence: null,
        created_at: "2026-06-16T09:00:00.000Z",
        updated_at: "2026-06-16T09:00:00.000Z",
      },
    ];
    mockState.applicantRows = [
      {
        id: sourceApplicant.id,
        submission_id: submission.id,
        full_name: sourceApplicant.fullName,
        role: "Основной заявитель",
        questionnaire_percent: 100,
        media_percent: 100,
      },
    ];
    mockState.questionnaireRows = [
      {
        ...sourceAnswer,
        id: "00000000-0000-4000-8000-000000000444",
        created_at: "2026-06-16T09:00:00.000Z",
        updated_at: "2026-06-16T09:00:00.000Z",
      },
    ];

    const loaded = await loadCockpitSubmissionsForProfile(agentProfile);
    const field = loaded.submissions[0]?.applicants[0]?.sections
      .flatMap((section) => section.fields)
      .find((candidate) => candidate.id === sourceField.id);

    expect(field).toMatchObject({
      adminReviewApprovedAtIso: "2026-07-15T06:30:00.000Z",
      adminReviewApprovedBy: "admin-reviewer",
      id: sourceField.id,
      reviewOriginSource: "passport_ocr",
      reviewSource: "passport_ocr",
      reviewState: "needs_review",
      value: sourceField.value,
    });

    mockState.submissionRows = [
      {
        ...payload.submission,
        created_at: "2026-06-16T09:00:00.000Z",
        updated_at: "2026-06-16T09:00:00.000Z",
      },
    ];
    mockState.questionnaireRows = [
      {
        ...sourceAnswer,
        id: "00000000-0000-4000-8000-000000000445",
        value: {
          kind: "v19_questionnaire_field",
          reviewConfirmedAtIso: "2026-06-27T08:10:00.000Z",
          reviewConfirmedBy: agentProfile.id,
          reviewOriginSource: "passport_ocr",
          reviewSource: "manual",
          reviewState: "confirmed",
          value: "ROW OVERRIDE",
          version: 1,
        },
        created_at: "2026-06-16T09:00:00.000Z",
        updated_at: "2026-06-27T08:10:00.000Z",
      },
    ];

    const loadedFromSnapshot = await loadCockpitSubmissionsForProfile(agentProfile);
    const overlaidField = loadedFromSnapshot.submissions[0]?.applicants[0]?.sections
      .flatMap((section) => section.fields)
      .find((candidate) => candidate.id === sourceField.id);

    expect(overlaidField).toMatchObject({
      id: sourceField.id,
      reviewConfirmedAtIso: "2026-06-27T08:10:00.000Z",
      reviewConfirmedBy: agentProfile.id,
      reviewOriginSource: "passport_ocr",
      reviewSource: "manual",
      reviewState: "confirmed",
      value: "ROW OVERRIDE",
    });

    mockState.questionnaireRows = [
      {
        ...sourceAnswer,
        id: "00000000-0000-4000-8000-000000000446",
        value: {
          kind: "v19_questionnaire_field",
          reviewSource: "passport_ocr",
          reviewState: "needs_review",
          value: "UNSUPPORTED VERSION VALUE",
          version: 999,
        },
        created_at: "2026-06-16T09:00:00.000Z",
        updated_at: "2026-06-27T08:20:00.000Z",
      },
    ];

    const loadedUnsupportedVersion =
      await loadCockpitSubmissionsForProfile(agentProfile);
    const unsupportedVersionField =
      loadedUnsupportedVersion.submissions[0]?.applicants[0]?.sections
        .flatMap((section) => section.fields)
        .find((candidate) => candidate.id === sourceField.id);

    expect(unsupportedVersionField).toMatchObject({
      id: sourceField.id,
      value: "UNSUPPORTED VERSION VALUE",
    });
    expect(unsupportedVersionField?.reviewSource).toBeUndefined();
    expect(unsupportedVersionField?.reviewState).toBeUndefined();

    mockState.questionnaireRows = [
      {
        ...sourceAnswer,
        id: "00000000-0000-4000-8000-000000000447",
        value: {
          adminReviewApprovedAtIso: "2026-06-27T08:30:00.000Z",
          adminReviewApprovedBy: "unversioned-admin",
          kind: "v19_questionnaire_field",
          reviewSource: "passport_ocr",
          reviewState: "confirmed",
          value: "UNVERSIONED VALUE",
        },
        created_at: "2026-06-16T09:00:00.000Z",
        updated_at: "2026-06-27T08:30:00.000Z",
      },
    ];

    const loadedUnversioned =
      await loadCockpitSubmissionsForProfile(agentProfile);
    const unversionedField =
      loadedUnversioned.submissions[0]?.applicants[0]?.sections
        .flatMap((section) => section.fields)
        .find((candidate) => candidate.id === sourceField.id);

    expect(unversionedField).toMatchObject({
      id: sourceField.id,
      value: "UNVERSIONED VALUE",
    });
    expect(unversionedField?.adminReviewApprovedAtIso).toBeUndefined();
    expect(unversionedField?.adminReviewApprovedBy).toBeUndefined();
    expect(unversionedField?.reviewSource).toBeUndefined();
    expect(unversionedField?.reviewState).toBeUndefined();
  });

  it("rejects an unknown applicant role before building a Supabase write", () => {
    const sourceSubmission = initialSubmissions[0] as Submission;
    const submissionWithUnknownRole: Submission = {
      ...sourceSubmission,
      applicants: sourceSubmission.applicants.map((applicant, index) =>
        index === 0
          ? {
              ...applicant,
              role: "guardian" as Submission["applicants"][number]["role"],
            }
          : applicant,
      ),
    };

    expect(() =>
      toCockpitDraftPersistencePayload(
        submissionWithUnknownRole,
        agentProfile.id,
        agentProfile.id,
      ),
    ).toThrow(/Unknown canonical applicant role/);
  });

  it("does not reuse normalized applicant rows after loading remote data", async () => {
    const submission = initialSubmissions[0] as Submission;
    const payload = toCockpitDraftPersistencePayload(
      submission,
      agentProfile.id,
      agentProfile.id,
    );
    mockState.submissionRows = [
      {
        ...payload.submission,
        created_at: "2026-06-16T09:00:00.000Z",
        updated_at: "2026-06-16T09:00:00.000Z",
      },
    ];
    mockState.applicantRows = [
      {
        id: submission.applicants[0].id,
        submission_id: submission.id,
        full_name: submission.applicants[0].fullName,
        role: "Основной заявитель",
        questionnaire_percent: 100,
        media_percent: 100,
      },
    ];

    await loadCockpitSubmissionsForProfile(agentProfile);
    const unscopedPayload = toCockpitDraftPersistencePayload(
      submission,
      agentProfile.id,
      agentProfile.id,
    );

    expect(unscopedPayload.applicants[0]).toMatchObject({
      birth_date: null,
      email: null,
      passport_number: "660010481",
    });
  });

  it("hydrates legacy cockpit snapshots with the row owner", async () => {
    const submission = { ...(initialSubmissions[0] as Submission) } as Omit<
      Submission,
      "agentId"
    > & {
      agentId?: string;
    };
    delete submission.agentId;
    const payload = toCockpitDraftPersistencePayload(
      initialSubmissions[0] as Submission,
      adminProfile.id,
      otherAgentProfile.id,
    );
    mockState.submissionRows = [
      {
        ...payload.submission,
        agent_id: otherAgentProfile.id,
        family_intelligence: {
          status: cockpitSnapshotStatus,
          [cockpitSnapshotKey]: {
            version: cockpitSnapshotVersion,
            submission,
          },
        },
        created_at: "2026-06-16T09:00:00.000Z",
        case_revision: 14,
        updated_at: "2026-06-16T09:00:00.000Z",
      },
    ];

    const loaded = await loadCockpitSubmissionsForProfile(adminProfile);

    expect(loaded.submissions[0]?.agentId).toBe(otherAgentProfile.id);
    expect(loaded.caseRevisionsBySubmissionId.get(submission.id)).toBe(14);
    expect(loaded.ownerIdsBySubmissionId.get(submission.id)).toBe(otherAgentProfile.id);
  });

  it("normalizes legacy snapshot status and drops legacy media before runtime use", async () => {
    const sourceSubmission = initialSubmissions[1] as Submission;
    const legacySnapshot: Submission = {
      ...sourceSubmission,
      status: "requires_action",
      files: [
        {
          id: "legacy-photo",
          applicantId: sourceSubmission.applicants[0]?.id ?? "applicant-1",
          status: "uploaded",
          type: "photo",
        },
        {
          id: "legacy-photo-white",
          applicantId: sourceSubmission.applicants[0]?.id ?? "applicant-1",
          status: "uploaded",
          type: "photo_white",
        },
        {
          id: "legacy-video",
          applicantId: sourceSubmission.applicants[0]?.id ?? "applicant-1",
          status: "uploaded",
          type: "video",
        },
      ],
    };
    const payload = toCockpitDraftPersistencePayload(
      sourceSubmission,
      adminProfile.id,
      agentProfile.id,
    );
    mockState.submissionRows = [
      {
        ...payload.submission,
        family_intelligence: {
          status: cockpitSnapshotStatus,
          [cockpitSnapshotKey]: {
            version: cockpitSnapshotVersion,
            submission: legacySnapshot,
          },
        },
        status: "requires_action",
        created_at: "2026-06-16T09:00:00.000Z",
        updated_at: "2026-06-16T09:00:00.000Z",
      },
    ];

    const loaded = await loadCockpitSubmissionsForProfile(agentProfile);
    const submission = loaded.submissions[0];

    expect(submission?.status).toBe("returned");
    expect(submission?.files.map((file) => file.type)).toEqual([
      "passport_scan",
      "selfie",
      "selfie_2",
    ]);
    expect(submission?.files.every((file) => file.status === "missing")).toBe(true);
    expect(submission?.completeness.files).toBe(0);
  });

  it("does not load another agent row for agent profile", async () => {
    const submission = initialSubmissions[0] as Submission;
    const payload = toCockpitDraftPersistencePayload(
      submission,
      adminProfile.id,
      otherAgentProfile.id,
    );
    mockState.submissionRows = [
      {
        ...payload.submission,
        agent_id: otherAgentProfile.id,
        created_at: "2026-06-16T09:00:00.000Z",
        updated_at: "2026-06-16T09:00:00.000Z",
      },
    ];

    const loaded = await loadCockpitSubmissionsForProfile(agentProfile);

    expect(loaded.submissions).toEqual([]);
    expect(loaded.ownerIdsBySubmissionId.size).toBe(0);
  });

  it("persists cockpit media rows only after real private storage upload metadata exists", () => {
    const submission = initialSubmissions[2] as Submission;
    const withoutStorageMetadata = draftPayload({
      ...submission,
      files: [
        {
          ...submission.files[0],
          status: "uploaded",
        },
      ],
    });
    expect(withoutStorageMetadata.media_assets).toEqual([]);

    const passportFile = submission.files.find((file) => file.type === "passport_scan");
    if (!passportFile) throw new Error("Missing passport file");

    const withStorageMetadata = draftPayload({
      ...submission,
      files: [
        {
          ...passportFile,
          generatedFileName: "v1900abcde_passport_scan.jpg",
          mimeType: "image/jpeg",
          originalFileName: "passport-scan.jpg",
          reviewedBy: adminProfile.id,
          reviewStatus: "accepted",
          sizeBytes: 2048,
          status: "accepted",
          storageAdapter: "supabase-private",
          storageBucket: "submission-media",
          storagePath: "ПД-1052/з-1052-1/passport_scan/v1900abcde_passport_scan.jpg",
          uploadedAtIso: "2026-06-16T10:00:00.000Z",
          uploadStatus: "uploaded",
        },
      ],
    });

    expect(withStorageMetadata.media_assets[0]).toMatchObject({
      applicant_id: "з-1052-1",
      generated_file_name: "v1900abcde_passport_scan.jpg",
      original_file_name: "passport-scan.jpg",
      review_status: "accepted",
      reviewed_by: adminProfile.id,
      storage_bucket: "submission-media",
      storage_path: "ПД-1052/з-1052-1/passport_scan/v1900abcde_passport_scan.jpg",
      submission_id: "ПД-1052",
      type: "passport_scan",
      upload_status: "uploaded",
    });
  });

  it("restores durable private file metadata from media_assets after reload", async () => {
    const submission = initialSubmissions[2] as Submission;
    const passportFile = submission.files.find((file) => file.type === "passport_scan");
    if (!passportFile) throw new Error("Missing passport file");
    const staleSnapshot: Submission = {
      ...submission,
      files: submission.files.map((file) => ({
        ...file,
        generatedFileName: undefined,
        mimeType: undefined,
        originalFileName: undefined,
        sizeBytes: undefined,
        status: "missing",
        storageAdapter: undefined,
        storageBucket: undefined,
        storagePath: undefined,
        uploadStatus: "none",
        uploadedAtIso: undefined,
      })),
    };
    const payload = toCockpitDraftPersistencePayload(
      staleSnapshot,
      agentProfile.id,
      agentProfile.id,
    );

    mockState.submissionRows = [
      {
        ...payload.submission,
        created_at: "2026-06-16T09:00:00.000Z",
        updated_at: "2026-06-16T09:00:00.000Z",
      },
    ];
    mockState.mediaAssetRows = [
      {
        id: "00000000-0000-4000-8000-000000000777",
        applicant_id: passportFile.applicantId,
        submission_id: submission.id,
        type: "passport_scan",
        original_file_name: "passport-scan.jpg",
        generated_file_name: "v1900abcde_passport_scan.jpg",
        storage_bucket: "submission-media",
        storage_path: `${submission.id}/${passportFile.applicantId}/passport_scan/v1900abcde_passport_scan.jpg`,
        mime_type: "image/jpeg",
        size_bytes: 2048,
        upload_status: "uploaded",
        review_status: "not_reviewed",
        uploaded_at: "2026-06-16T10:00:00.000Z",
        reviewed_at: null,
        reviewed_by: null,
      },
    ];

    const loaded = await loadCockpitSubmissionsForProfile(agentProfile);
    const restoredPassport = loaded.submissions[0]?.files.find(
      (file) => file.type === "passport_scan",
    );

    expect(restoredPassport).toMatchObject({
      generatedFileName: "v1900abcde_passport_scan.jpg",
      originalFileName: "passport-scan.jpg",
      status: "uploaded",
      storageAdapter: "supabase-private",
      storageBucket: "submission-media",
      storagePath: `${submission.id}/${passportFile.applicantId}/passport_scan/v1900abcde_passport_scan.jpg`,
      uploadStatus: "uploaded",
    });
    expect(loaded.submissions[0]?.completeness.files).toBeGreaterThan(0);
  });

  it("does not rehydrate legacy media_assets rows into V-19 runtime files", async () => {
    const submission = initialSubmissions[2] as Submission;
    const passportFile = submission.files.find((file) => file.type === "passport_scan");
    if (!passportFile) throw new Error("Missing passport file");
    const payload = toCockpitDraftPersistencePayload(
      submission,
      agentProfile.id,
      agentProfile.id,
    );

    mockState.submissionRows = [
      {
        ...payload.submission,
        created_at: "2026-06-16T09:00:00.000Z",
        updated_at: "2026-06-16T09:00:00.000Z",
      },
    ];
    mockState.mediaAssetRows = [
      {
        id: "00000000-0000-4000-8000-000000000777",
        applicant_id: passportFile.applicantId,
        submission_id: submission.id,
        type: "passport_scan",
        original_file_name: "passport-scan.jpg",
        generated_file_name: "v1900abcde_passport_scan.jpg",
        storage_bucket: "submission-media",
        storage_path: `${submission.id}/${passportFile.applicantId}/passport_scan/v1900abcde_passport_scan.jpg`,
        mime_type: "image/jpeg",
        size_bytes: 2048,
        upload_status: "uploaded",
        review_status: "not_reviewed",
        uploaded_at: "2026-06-16T10:00:00.000Z",
        reviewed_at: null,
        reviewed_by: null,
      },
      {
        id: "00000000-0000-4000-8000-000000000778",
        applicant_id: passportFile.applicantId,
        submission_id: submission.id,
        type: "photo",
        original_file_name: "legacy-photo.jpg",
        generated_file_name: "legacy_photo.jpg",
        storage_bucket: "submission-media",
        storage_path: `${submission.id}/${passportFile.applicantId}/photo/legacy_photo.jpg`,
        mime_type: "image/jpeg",
        size_bytes: 2048,
        upload_status: "uploaded",
        review_status: "not_reviewed",
        uploaded_at: "2026-06-16T10:00:00.000Z",
        reviewed_at: null,
        reviewed_by: null,
      },
      {
        id: "00000000-0000-4000-8000-000000000779",
        applicant_id: passportFile.applicantId,
        submission_id: submission.id,
        type: "video",
        original_file_name: "legacy-video.mp4",
        generated_file_name: "legacy_video.mp4",
        storage_bucket: "submission-media",
        storage_path: `${submission.id}/${passportFile.applicantId}/video/legacy_video.mp4`,
        mime_type: "video/mp4",
        size_bytes: 4096,
        upload_status: "uploaded",
        review_status: "not_reviewed",
        uploaded_at: "2026-06-16T10:00:00.000Z",
        reviewed_at: null,
        reviewed_by: null,
      },
    ];

    const loaded = await loadCockpitSubmissionsForProfile(agentProfile);
    const files = loaded.submissions[0]?.files ?? [];

    expect(files.map((file) => file.type)).toEqual([
      "passport_scan",
      "selfie",
      "selfie_2",
    ]);
    expect(files.find((file) => file.type === "passport_scan")).toMatchObject({
      generatedFileName: "v1900abcde_passport_scan.jpg",
      storageAdapter: "supabase-private",
    });
  });

  it("does not restore another agent's media rows through the agent load path", async () => {
    const submission = initialSubmissions[2] as Submission;
    const payload = toCockpitDraftPersistencePayload(
      submission,
      agentProfile.id,
      agentProfile.id,
    );

    mockState.submissionRows = [
      {
        ...payload.submission,
        created_at: "2026-06-16T09:00:00.000Z",
        updated_at: "2026-06-16T09:00:00.000Z",
      },
      {
        ...payload.submission,
        id: "OTHER-AGENT-SUBMISSION",
        agent_id: otherAgentProfile.id,
        title: "Other agent submission",
        created_at: "2026-06-16T09:00:00.000Z",
        updated_at: "2026-06-16T09:00:00.000Z",
      },
    ];
    mockState.mediaAssetRows = [
      {
        id: "00000000-0000-4000-8000-000000000778",
        applicant_id: "other-agent-applicant",
        submission_id: "OTHER-AGENT-SUBMISSION",
        type: "passport_scan",
        original_file_name: "other-passport.jpg",
        generated_file_name: "other_passport_scan.jpg",
        storage_bucket: "submission-media",
        storage_path: "OTHER-AGENT-SUBMISSION/other-agent-applicant/passport_scan/other_passport_scan.jpg",
        mime_type: "image/jpeg",
        size_bytes: 2048,
        upload_status: "uploaded",
        review_status: "not_reviewed",
        uploaded_at: "2026-06-16T10:00:00.000Z",
        reviewed_at: null,
        reviewed_by: null,
      },
    ];

    const loaded = await loadCockpitSubmissionsForProfile(agentProfile);

    expect(loaded.submissions).toHaveLength(1);
    expect(loaded.submissions[0]?.id).toBe(submission.id);
    expect(
      loaded.submissions[0]?.files.some(
        (file) => file.generatedFileName === "other_passport_scan.jpg",
      ),
    ).toBe(false);
  });

  it("allows admin reload to restore media rows for selected submissions", async () => {
    const submission = {
      ...(initialSubmissions[2] as Submission),
      agentId: otherAgentProfile.id,
    };
    const passportFile = submission.files.find((file) => file.type === "passport_scan");
    if (!passportFile) throw new Error("Missing passport file");
    const payload = toCockpitDraftPersistencePayload(
      submission,
      adminProfile.id,
      otherAgentProfile.id,
    );

    mockState.submissionRows = [
      {
        ...payload.submission,
        created_at: "2026-06-16T09:00:00.000Z",
        updated_at: "2026-06-16T09:00:00.000Z",
      },
    ];
    mockState.mediaAssetRows = [
      {
        id: "00000000-0000-4000-8000-000000000779",
        applicant_id: passportFile.applicantId,
        submission_id: submission.id,
        type: "passport_scan",
        original_file_name: "admin-visible-passport.jpg",
        generated_file_name: "admin_visible_passport_scan.jpg",
        storage_bucket: "submission-media",
        storage_path: `${submission.id}/${passportFile.applicantId}/passport_scan/admin_visible_passport_scan.jpg`,
        mime_type: "image/jpeg",
        size_bytes: 2048,
        upload_status: "uploaded",
        review_status: "not_reviewed",
        uploaded_at: "2026-06-16T10:00:00.000Z",
        reviewed_at: null,
        reviewed_by: null,
      },
    ];

    const loaded = await loadCockpitSubmissionsForProfile(adminProfile);

    expect(loaded.ownerIdsBySubmissionId.get(submission.id)).toBe(
      otherAgentProfile.id,
    );
    expect(
      loaded.submissions[0]?.files.find((file) => file.type === "passport_scan"),
    ).toMatchObject({
      generatedFileName: "admin_visible_passport_scan.jpg",
      storageAdapter: "supabase-private",
      uploadStatus: "uploaded",
    });
  });

  it("keeps durable export batch metadata on the admin-only read path", async () => {
    const submission = normalizeSubmissionForCanonicalRuntime(
      fillRequiredQuestionnaireForTest(
        initialSubmissions.find((item) => item.id === "ПД-1056") as Submission,
      ),
    );
    const identity = buildExportPackageIdentity([submission], "xlsx");
    if (!identity) throw new Error("Expected export package identity");
    const payload = toCockpitDraftPersistencePayload(
      submission,
      adminProfile.id,
      agentProfile.id,
    );

    mockState.submissionRows = [
      {
        ...payload.submission,
        status: "ready_for_excel",
        created_at: "2026-06-16T09:00:00.000Z",
        updated_at: "2026-06-16T09:00:00.000Z",
      },
    ];
    mockState.exportBatchRows = [
      {
        id: "00000000-0000-4000-8000-000000000905",
        content_fingerprint: identity.contentFingerprint,
        created_at: "2026-06-16T09:30:00.000Z",
        file_name: identity.fileName,
        format: "xlsx",
        idempotency_key: identity.idempotencyKey,
        row_count: identity.rowCount,
        submission_ids: identity.submissionIds,
      },
    ];
    mockState.profileRows = [
      {
        id: agentProfile.id,
        display_name: "Антон Волков",
      },
    ];

    const loaded = await loadCockpitSubmissionsForProfile(adminProfile);
    const plan = exportSummaryForSelectedIds(loaded.submissions, [submission.id]);

    expect(mockState.fromCalls).toEqual([
      "submissions",
      "applicants",
      "questionnaire_answers",
      "media_assets",
      "corrections",
      "status_history",
      "export_batches",
      "profiles",
    ]);
    expect(loaded.submissions[0]).toMatchObject({
      agentDisplayName: "Антон Волков",
      id: submission.id,
      exportPackage: identity,
      exportState: "file_generated",
      status: "ready_for_export",
    });
    expect(plan).toMatchObject({
      canDownload: true,
      downloadPackageIdentity: identity,
      exportState: "file_generated",
      ready: true,
    });
  });

  it("does not expose durable export batch membership during agent load", async () => {
    const submission = initialSubmissions.find(
      (item) => item.id === "ПД-1056",
    ) as Submission;
    const identity = buildExportPackageIdentity([submission], "xlsx");
    if (!identity) throw new Error("Expected export package identity");
    const payload = toCockpitDraftPersistencePayload(
      submission,
      adminProfile.id,
      agentProfile.id,
    );

    mockState.submissionRows = [
      {
        ...payload.submission,
        status: "ready_for_excel",
        created_at: "2026-06-16T09:00:00.000Z",
        updated_at: "2026-06-16T09:00:00.000Z",
      },
    ];
    mockState.exportBatchRows = [
      {
        id: "00000000-0000-4000-8000-000000000908",
        content_fingerprint: identity.contentFingerprint,
        created_at: "2026-06-16T09:30:00.000Z",
        file_name: identity.fileName,
        format: "xlsx",
        idempotency_key: identity.idempotencyKey,
        row_count: identity.rowCount,
        submission_ids: [...identity.submissionIds, "OTHER-AGENT-SUBMISSION"],
      },
    ];

    const loaded = await loadCockpitSubmissionsForProfile(agentProfile);

    expect(mockState.fromCalls).toEqual([
      "submissions",
      "agent_submission_card_archives",
      "applicants",
      "questionnaire_answers",
      "media_assets",
      "corrections",
      "status_history",
    ]);
    expect(loaded.submissions[0]).toMatchObject({
      exportPackage: undefined,
      exportState: "ready",
      status: "ready_for_export",
    });
  });

  it("rehydrates the latest durable xlsx export package identity after admin reload", async () => {
    const submission: Submission = {
      ...(initialSubmissions[0] as Submission),
      id: "ПД-EXPORT-RELOAD",
      exportPackage: undefined,
      exportState: "ready",
      status: "ready_for_export",
    };
    const payload = toCockpitDraftPersistencePayload(
      submission,
      adminProfile.id,
      agentProfile.id,
    );

    mockState.submissionRows = [
      {
        ...payload.submission,
        family_intelligence: null,
        status: "ready_for_excel",
        created_at: "2026-06-16T09:00:00.000Z",
        updated_at: "2026-06-16T09:00:00.000Z",
      },
    ];
    mockState.exportBatchRows = [
      {
        id: "00000000-0000-4000-8000-000000000902",
        content_fingerprint: "older-fingerprint",
        created_at: "2026-06-16T08:00:00.000Z",
        file_name: "visaflow-export-older.xlsx",
        format: "xlsx",
        idempotency_key: "older-key",
        row_count: 1,
        submission_ids: [submission.id],
      },
      {
        id: "00000000-0000-4000-8000-000000000903",
        content_fingerprint: "latest-fingerprint",
        created_at: "2026-06-16T09:30:00.000Z",
        file_name: "visaflow-export-latest.xlsx",
        format: "xlsx",
        idempotency_key: "latest-key",
        row_count: 1,
        submission_ids: [submission.id],
      },
    ];

    const loaded = await loadCockpitSubmissionsForProfile(adminProfile);

    expect(loaded.submissions[0]).toMatchObject({
      id: submission.id,
      exportPackage: {
        contentFingerprint: "latest-fingerprint",
        fileName: "visaflow-export-latest.xlsx",
        format: "xlsx",
        idempotencyKey: "latest-key",
        rowCount: 1,
        submissionIds: [submission.id],
      },
      exportState: "ready",
      status: "ready_for_export",
    });
  });

  it("ignores newer legacy csv batches in the Excel-only pilot", async () => {
    const submission = normalizeSubmissionForCanonicalRuntime(
      fillRequiredQuestionnaireForTest(
        initialSubmissions.find((item) => item.id === "ПД-1056") as Submission,
      ),
    );
    const identity = buildExportPackageIdentity([submission], "xlsx");
    if (!identity) throw new Error("Expected export package identity");
    const payload = toCockpitDraftPersistencePayload(
      submission,
      adminProfile.id,
      agentProfile.id,
    );

    mockState.submissionRows = [
      {
        ...payload.submission,
        status: "ready_for_excel",
        created_at: "2026-06-16T09:00:00.000Z",
        updated_at: "2026-06-16T09:00:00.000Z",
      },
    ];
    mockState.exportBatchRows = [
      {
        id: "00000000-0000-4000-8000-000000000906",
        content_fingerprint: identity.contentFingerprint,
        created_at: "2026-06-16T09:30:00.000Z",
        file_name: identity.fileName,
        format: "xlsx",
        idempotency_key: identity.idempotencyKey,
        row_count: identity.rowCount,
        submission_ids: identity.submissionIds,
      },
      {
        id: "00000000-0000-4000-8000-000000000907",
        content_fingerprint: "legacy-csv-fingerprint",
        created_at: "2026-06-16T10:30:00.000Z",
        file_name: "legacy-export.csv",
        format: "csv",
        idempotency_key: "legacy-csv-key",
        row_count: identity.rowCount,
        submission_ids: identity.submissionIds,
      },
    ];

    const loaded = await loadCockpitSubmissionsForProfile(adminProfile);
    const plan = exportSummaryForSelectedIds(loaded.submissions, [submission.id]);

    expect(loaded.submissions[0]).toMatchObject({
      exportPackage: identity,
      exportState: "file_generated",
      status: "ready_for_export",
    });
    expect(plan).toMatchObject({
      canDownload: true,
      downloadPackageIdentity: identity,
    });
  });

  it("clears snapshot-only export package identity when no durable batch exists", async () => {
    const submission: Submission = {
      ...(initialSubmissions[0] as Submission),
      id: "ПД-EXPORT-NO-BATCH",
      exportPackage: {
        contentFingerprint: "snapshot-only-fingerprint",
        fileName: "visaflow-export-snapshot.xlsx",
        format: "xlsx",
        idempotencyKey: "snapshot-only-key",
        rowCount: 1,
        submissionIds: ["ПД-EXPORT-NO-BATCH"],
      },
      exportState: "file_downloaded",
      status: "ready_for_export",
    };
    const payload = toCockpitDraftPersistencePayload(
      submission,
      adminProfile.id,
      agentProfile.id,
    );

    mockState.submissionRows = [
      {
        ...payload.submission,
        status: "ready_for_excel",
        created_at: "2026-06-16T09:00:00.000Z",
        updated_at: "2026-06-16T09:00:00.000Z",
      },
    ];

    const loaded = await loadCockpitSubmissionsForProfile(adminProfile);

    expect(loaded.submissions[0]).toMatchObject({
      id: submission.id,
      exportPackage: undefined,
      exportState: "ready",
      status: "ready_for_export",
    });
  });

  it("ignores incomplete durable export batch identity after reload", async () => {
    const submission: Submission = {
      ...(initialSubmissions[0] as Submission),
      id: "ПД-EXPORT-INCOMPLETE-BATCH",
      exportPackage: {
        contentFingerprint: "snapshot-fingerprint",
        fileName: "visaflow-export-snapshot.xlsx",
        format: "xlsx",
        idempotencyKey: "snapshot-key",
        rowCount: 1,
        submissionIds: ["ПД-EXPORT-INCOMPLETE-BATCH"],
      },
      exportState: "file_downloaded",
      status: "ready_for_export",
    };
    const payload = toCockpitDraftPersistencePayload(
      submission,
      adminProfile.id,
      agentProfile.id,
    );

    mockState.submissionRows = [
      {
        ...payload.submission,
        status: "ready_for_excel",
        created_at: "2026-06-16T09:00:00.000Z",
        updated_at: "2026-06-16T09:00:00.000Z",
      },
    ];
    mockState.exportBatchRows = [
      {
        id: "00000000-0000-4000-8000-000000000904",
        content_fingerprint: "durable-fingerprint",
        created_at: "2026-06-16T09:30:00.000Z",
        file_name: "visaflow-export-empty.xlsx",
        format: "xlsx",
        idempotency_key: "durable-key",
        row_count: 0,
        submission_ids: [submission.id],
      },
    ];

    const loaded = await loadCockpitSubmissionsForProfile(adminProfile);

    expect(loaded.submissions[0]).toMatchObject({
      id: submission.id,
      exportPackage: undefined,
      exportState: "ready",
      status: "ready_for_export",
    });
  });

  it("ignores durable export batch identity when the row is no longer export-ready", async () => {
    const submission: Submission = {
      ...(initialSubmissions[0] as Submission),
      id: "ПД-EXPORT-REGRESSED",
      exportPackage: undefined,
      exportState: "not_ready",
      status: "returned",
    };
    const payload = toCockpitDraftPersistencePayload(
      submission,
      adminProfile.id,
      agentProfile.id,
    );

    mockState.submissionRows = [
      {
        ...payload.submission,
        status: "returned",
        created_at: "2026-06-16T09:00:00.000Z",
        updated_at: "2026-06-16T09:00:00.000Z",
      },
    ];
    mockState.exportBatchRows = [
      {
        id: "00000000-0000-4000-8000-000000000909",
        content_fingerprint: "regressed-fingerprint",
        created_at: "2026-06-16T09:30:00.000Z",
        file_name: "visaflow-export-regressed.xlsx",
        format: "xlsx",
        idempotency_key: "regressed-key",
        row_count: 1,
        submission_ids: [submission.id],
      },
    ];

    const loaded = await loadCockpitSubmissionsForProfile(adminProfile);

    expect(loaded.submissions[0]).toMatchObject({
      id: submission.id,
      exportPackage: undefined,
      exportState: "not_ready",
      status: "returned",
    });
  });

  it("persists detailed questionnaire fields as normalized answer rows", () => {
    const submission = initialSubmissions[0] as Submission;
    const answers = toCockpitQuestionnaireAnswerInserts(submission, agentProfile.id);
    const firstField = submission.applicants[0]?.sections[0]?.fields[0];

    expect(answers.length).toBeGreaterThan(0);
    expect(answers[0]).toMatchObject({
      applicant_id: submission.applicants[0]?.id,
      field_id: firstField?.id,
      label: firstField?.label,
      section_id: submission.applicants[0]?.sections[0]?.id,
      submission_id: submission.id,
      updated_by: agentProfile.id,
      value: firstField?.value,
    });

    const payload = draftPayload(submission);
    expect(payload.questionnaire_answers).toEqual(answers);
  });

  it("rejects the legacy revision-blind admin writer before any RPC", async () => {
    const changedSubmission = {
      ...(initialSubmissions[0] as Submission),
      title: "Admin edit",
    };
    const ownerIds = new Map([
      [changedSubmission.id, "00000000-0000-4000-8000-000000000111"],
    ]);

    await expect(
      saveCockpitSubmissionsForProfile(
        adminProfile,
        [changedSubmission],
        ownerIds,
        new Map(),
      ),
    ).rejects.toThrow(
      "Administrators must use the revision-checked admin concurrency writer.",
    );
    expect(rpcNames()).toEqual([]);
  });

  it("saves an admin batch with expected aggregate revisions and returns new ones", async () => {
    const operationId = "00000000-0000-4000-8000-000000000901";
    vi.spyOn(crypto, "randomUUID").mockReturnValue(operationId);
    const first = {
      ...(initialSubmissions[0] as Submission),
      title: "Admin review A",
    };
    const second = {
      ...(initialSubmissions[1] as Submission),
      title: "Admin review B",
    };
    const ownerIds = new Map([
      [first.id, otherAgentProfile.id],
      [second.id, agentProfile.id],
    ]);
    const revisions = new Map([
      [first.id, 7],
      [second.id, 11],
    ]);
    mockState.rpcResults = [
      {
        data: {
          caseRevisions: { [first.id]: 12, [second.id]: 16 },
          operationId,
          results: [],
        },
        error: null,
      },
    ];

    const saved = await saveAdminCockpitSubmissionsIfCurrent(
      adminProfile,
      [first, second],
      ownerIds,
      revisions,
    );

    expect(rpcNames()).toEqual(["save_admin_submission_batch_if_current"]);
    expect(mockState.rpcCalls[0]?.args).toMatchObject({
      actor_id: adminProfile.id,
      expected_revisions: { [first.id]: 7, [second.id]: 11 },
      operation_id: operationId,
      payloads: [
        { submission: { agent_id: otherAgentProfile.id, id: first.id } },
        { submission: { agent_id: agentProfile.id, id: second.id } },
      ],
    });
    expect(saved.caseRevisionsBySubmissionId).toEqual(
      new Map([
        [first.id, 12],
        [second.id, 16],
      ]),
    );
  });

  it("reports a conflicting second admin without blind CAS retry", async () => {
    const operationId = "00000000-0000-4000-8000-000000000902";
    vi.spyOn(crypto, "randomUUID").mockReturnValue(operationId);
    const submission = initialSubmissions[0] as Submission;
    const ownerIds = new Map([[submission.id, agentProfile.id]]);
    const staleRevisions = new Map([[submission.id, 7]]);
    mockState.rpcResults = [
      {
        data: null,
        error: {
          code: "40001",
          message: "V19_ADMIN_SUBMISSION_CONFLICT",
        },
      },
    ];

    const conflict = await saveAdminCockpitSubmissionsIfCurrent(
      adminProfile,
      [submission],
      ownerIds,
      staleRevisions,
    ).catch((error: unknown) => error);

    expect(isAdminSubmissionConcurrencyConflict(conflict)).toBe(true);
    expect(mockState.rpcCalls).toHaveLength(1);
  });

  it("reports a stale Agent snapshot as the same canonical concurrency conflict", async () => {
    const operationId = "00000000-0000-4000-8000-000000000904";
    vi.spyOn(crypto, "randomUUID").mockReturnValue(operationId);
    const submission = initialSubmissions[0] as Submission;
    mockState.rpcResults = [
      {
        data: null,
        error: {
          code: "40001",
          message: "V19_AGENT_SUBMISSION_CONFLICT",
        },
      },
    ];

    const conflict = await saveCockpitSubmissionsForProfile(
      agentProfile,
      [submission],
      new Map([[submission.id, agentProfile.id]]),
      new Map([[submission.id, 7]]),
    ).catch((error: unknown) => error);

    expect(isAdminSubmissionConcurrencyConflict(conflict)).toBe(true);
    expect(mockState.rpcCalls).toHaveLength(1);
    expect(mockState.rpcCalls[0]?.args.operation_id).toBe(operationId);
  });

  it("retries a lost admin CAS response once with the same durable operation id", async () => {
    const operationId = "00000000-0000-4000-8000-000000000903";
    vi.spyOn(crypto, "randomUUID").mockReturnValue(operationId);
    const submission = initialSubmissions[0] as Submission;
    const ownerIds = new Map([[submission.id, agentProfile.id]]);
    const revisions = new Map([[submission.id, 7]]);
    mockState.rpcResults = [
      { data: null, error: new TypeError("Failed to fetch") },
      {
        data: {
          caseRevisions: { [submission.id]: 9 },
          operationId,
          results: [],
        },
        error: null,
      },
    ];

    await expect(
      saveAdminCockpitSubmissionsIfCurrent(
        adminProfile,
        [submission],
        ownerIds,
        revisions,
      ),
    ).resolves.toMatchObject({ operationId });

    expect(mockState.rpcCalls).toHaveLength(2);
    expect(mockState.rpcCalls[0]?.args.operation_id).toBe(operationId);
    expect(mockState.rpcCalls[1]?.args.operation_id).toBe(operationId);
    expect(mockState.rpcCalls[1]?.args).toEqual(mockState.rpcCalls[0]?.args);
  });

  it("reconciles a stale cockpit snapshot after atomic export completion", async () => {
    const staleSnapshot = {
      ...(initialSubmissions.find(
        (submission) => submission.id === "ПД-1056",
      ) as Submission),
      exportState: "file_downloaded" as const,
      status: "ready_for_export" as const,
    };
    const payload = toCockpitDraftPersistencePayload(
      staleSnapshot,
      adminProfile.id,
      agentProfile.id,
    );

    mockState.submissionRows = [
      {
        ...payload.submission,
        exported_at: "2026-06-16T09:01:00.000Z",
        status: "exported",
        updated_at: "2026-06-16T09:01:00.000Z",
      },
    ];

    const loaded = await loadCockpitSubmissionsForProfile(agentProfile);

    expect(loaded.submissions[0]).toMatchObject({
      exportState: "marked_exported",
      status: "exported",
      updatedAt: "2026-06-16T09:01:00.000Z",
    });
    expect(loaded.submissions[0]?.history[0]).toMatchObject({
      source: "system",
      text: "Подача синхронизирована с завершенной выгрузкой",
    });
  });
});

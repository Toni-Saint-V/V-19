import { beforeEach, describe, expect, it, vi } from "vitest";
import { initialSubmissions } from "../../src/modules/submissions/mockData";
import type { Submission } from "../../src/modules/submissions/types";
import type { AppProfile } from "../../src/types/session";
import type { Json } from "../../src/lib/supabase/database.types";
import { fillRequiredQuestionnaireForTest } from "./helpers/questionnaireTestFill";

const mockState = vi.hoisted(() => ({
  applicantRows: [] as unknown[],
  exportBatchRows: [] as unknown[],
  fromCalls: [] as string[],
  mediaAssetRows: [] as unknown[],
  questionnaireRows: [] as unknown[],
  rpcCalls: [] as Array<{
    args: { answers?: unknown; payload?: unknown };
    name: string;
  }>,
  rpcResults: [] as Array<{ error: unknown | null }>,
  submissionRows: [] as unknown[],
  statusHistoryRows: [] as unknown[],
}));

vi.mock("../../src/lib/supabase/client", () => {
  function queryResult(rows: unknown[]) {
    const fieldValue = (row: unknown, column: string) =>
      typeof row === "object" && row !== null
        ? (row as Record<string, unknown>)[column]
        : undefined;

    return {
      eq: (column: string, value: unknown) =>
        Promise.resolve({
          data: rows.filter((row) => fieldValue(row, column) === value),
          error: null,
        }),
      in: (column: string, values: unknown[]) =>
        Promise.resolve({
          data: rows.filter((row) => values.includes(fieldValue(row, column))),
          error: null,
        }),
      overlaps: (column: string, values: unknown[]) =>
        Promise.resolve({
          data: rows.filter((row) => {
            const rowValue = fieldValue(row, column);
            return (
              Array.isArray(rowValue) &&
              rowValue.some((value) => values.includes(value))
            );
          }),
          error: null,
        }),
      limit() {
        return this;
      },
      order() {
        return this;
      },
      then(
        resolve: (value: { data: unknown[]; error: null }) => unknown,
        reject?: (reason: unknown) => unknown,
      ) {
        return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
      },
    };
  }

  return {
    getSupabaseClient: () => ({
      from: (table: string) => {
        mockState.fromCalls.push(table);
        return {
          select: () =>
            queryResult(
              table === "submissions"
                ? mockState.submissionRows
                : table === "applicants"
                  ? mockState.applicantRows
                  : table === "questionnaire_answers"
                    ? mockState.questionnaireRows
                    : table === "media_assets"
                      ? mockState.mediaAssetRows
                      : table === "status_history"
                        ? mockState.statusHistoryRows
                        : mockState.exportBatchRows,
            ),
        };
      },
      rpc: (name: string, args: { answers?: unknown; payload?: unknown }) => {
        mockState.rpcCalls.push({ args, name });
        return Promise.resolve(mockState.rpcResults.shift() ?? { error: null });
      },
    }),
  };
});

import {
  buildExportPackageIdentity,
  exportSummaryForSelectedIds,
} from "../../src/modules/submissions/exportRules";
import {
  changedCockpitSubmissions,
  cockpitSnapshotKey,
  cockpitSnapshotStatus,
  cockpitSnapshotVersion,
  cockpitSubmissionFingerprintMap,
  loadCockpitSubmissionsForProfile,
  readCockpitSnapshot,
  reviewHandoffPersistenceIssues,
  saveCockpitSubmissionsForProfile,
  toCockpitDraftPersistencePayload,
  toCockpitQuestionnaireAnswerInserts,
} from "../../src/modules/submissions/supabasePersistence";

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

beforeEach(() => {
  mockState.applicantRows = [];
  mockState.exportBatchRows = [];
  mockState.fromCalls = [];
  mockState.mediaAssetRows = [];
  mockState.questionnaireRows = [];
  mockState.rpcCalls = [];
  mockState.rpcResults = [];
  mockState.submissionRows = [];
  mockState.statusHistoryRows = [];
});

describe("V-19 Supabase cockpit persistence", () => {
  it("keeps an empty remote workspace empty instead of loading local demo data", async () => {
    const loaded = await loadCockpitSubmissionsForProfile(agentProfile);

    expect(loaded.submissions).toEqual([]);
    expect(loaded.ownerIdsBySubmissionId.size).toBe(0);
    expect(mockState.fromCalls).toEqual(["submissions"]);
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

  it("saves only the dirty submissions passed by the cockpit effect", async () => {
    const changedSubmission = {
      ...(initialSubmissions[0] as Submission),
      title: "Изменённая подача",
    };

    await saveCockpitSubmissionsForProfile(
      agentProfile,
      [changedSubmission],
      new Map(),
    );

    expect(rpcNames()).toEqual(["save_submission_draft"]);
    expect(payloadSubmission()).toMatchObject({
      agent_id: agentProfile.id,
      id: changedSubmission.id,
      title: changedSubmission.title,
    });
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
    );

    expect(rpcNames()).toEqual([
      "save_submission_draft",
      "save_submission_draft",
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
    );
    await saveCockpitSubmissionsForProfile(
      otherAgentProfile,
      [secondAgentSubmission],
      new Map(),
    );

    expect(rpcNames()).toEqual(["save_submission_draft", "save_submission_draft"]);
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
              reviewStatus: "accepted",
              status: "accepted",
              storageBucket: "visa-documents",
              storagePath: `submissions/${returnedSubmission.id}/${file.id}`,
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
    );

    expect(rpcNames()).toEqual(["submit_corrections_handoff"]);
    expect(
      (
        mockState.rpcCalls.find((call) => call.name === "submit_corrections_handoff")
          ?.args.payload as {
          submission: { status: string };
        }
    ).submission.status,
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
      ),
    ).rejects.toMatchObject({
      diagnostics: {
        safeCode: "rpc.submit_corrections_handoff:save:HANDOFF_CONSISTENCY",
      },
    });
    expect(rpcNames()).toEqual([]);
  });

  it("persists admin return handoff history as a matching status row", async () => {
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

    await saveCockpitSubmissionsForProfile(
      adminProfile,
      [returned],
      new Map([[returned.id, returned.agentId]]),
    );

    expect(rpcNames()).toEqual(["save_submission_draft"]);
    expect(
      (
        mockState.rpcCalls[0]?.args.payload as {
          status_history: Array<{
            from_status: string | null;
            note: string | null;
            source: string;
            to_status: string;
          }>;
        }
      ).status_history[0],
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
      saveCockpitSubmissionsForProfile(
        adminProfile,
        [invalidReturned],
        new Map([[invalidReturned.id, invalidReturned.agentId]]),
      ),
    ).rejects.toMatchObject({
      diagnostics: {
        safeCode: "rpc.save_submission_draft:save:HANDOFF_CONSISTENCY",
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
      saveCockpitSubmissionsForProfile(
        adminProfile,
        [invalidAccepted],
        new Map([[invalidAccepted.id, invalidAccepted.agentId]]),
      ),
    ).rejects.toMatchObject({
      diagnostics: {
        safeCode: "rpc.save_submission_draft:save:HANDOFF_CONSISTENCY",
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
        updated_at: "2026-06-16T09:00:00.000Z",
      },
    ];
    mockState.applicantRows = [
      {
        id: submission.applicants[0].id,
        submission_id: submission.id,
        full_name: submission.applicants[0].fullName,
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
      "applicants",
      "questionnaire_answers",
      "media_assets",
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
        updated_at: "2026-06-16T09:00:00.000Z",
      },
    ];

    const loaded = await loadCockpitSubmissionsForProfile(adminProfile);

    expect(loaded.submissions[0]?.agentId).toBe(otherAgentProfile.id);
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

    const loaded = await loadCockpitSubmissionsForProfile(adminProfile);
    const plan = exportSummaryForSelectedIds(loaded.submissions, [submission.id]);

    expect(mockState.fromCalls).toEqual([
      "submissions",
      "applicants",
      "questionnaire_answers",
      "media_assets",
      "status_history",
      "export_batches",
    ]);
    expect(loaded.submissions[0]).toMatchObject({
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
      "applicants",
      "questionnaire_answers",
      "media_assets",
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

  it("preserves the original owner when an admin saves a dirty submission", async () => {
    const changedSubmission = {
      ...(initialSubmissions[0] as Submission),
      title: "Admin edit",
    };
    const untouchedSubmission = initialSubmissions[1] as Submission;
    const ownerIds = new Map([
      [changedSubmission.id, "00000000-0000-4000-8000-000000000111"],
      [untouchedSubmission.id, "00000000-0000-4000-8000-000000000222"],
    ]);

    const nextOwnerIds = await saveCockpitSubmissionsForProfile(
      adminProfile,
      [changedSubmission],
      ownerIds,
    );

    expect(rpcNames()).toEqual(["save_submission_draft"]);
    expect(payloadSubmission().agent_id).toBe("00000000-0000-4000-8000-000000000111");
    expect(nextOwnerIds.get(untouchedSubmission.id)).toBe(
      "00000000-0000-4000-8000-000000000222",
    );
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

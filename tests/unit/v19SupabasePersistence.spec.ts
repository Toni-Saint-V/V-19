import { beforeEach, describe, expect, it, vi } from "vitest";
import { initialSubmissions } from "../../src/modules/submissions/mockData";
import type { Submission } from "../../src/modules/submissions/types";
import type { AppProfile } from "../../src/types/session";
import type { Json } from "../../src/lib/supabase/database.types";

const mockState = vi.hoisted(() => ({
  applicantRows: [] as unknown[],
  fromCalls: [] as string[],
  rpcCalls: [] as Array<{ args: { payload: unknown }; name: string }>,
  submissionRows: [] as unknown[],
}));

vi.mock("../../src/lib/supabase/client", () => {
  function queryResult(rows: unknown[]) {
    return {
      eq: () => Promise.resolve({ data: rows, error: null }),
      in: () => Promise.resolve({ data: rows, error: null }),
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
                : mockState.applicantRows,
            ),
        };
      },
      rpc: (name: string, args: { payload: unknown }) => {
        mockState.rpcCalls.push({ args, name });
        return Promise.resolve({ error: null });
      },
    }),
  };
});

import {
  changedCockpitSubmissions,
  cockpitSubmissionFingerprintMap,
  loadCockpitSubmissionsForProfile,
  readCockpitSnapshot,
  saveCockpitSubmissionsForProfile,
  toCockpitDraftPersistencePayload,
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
  return (
    mockState.rpcCalls[callIndex]?.args.payload as {
      submission: { agent_id: string; id: string; title: string };
    }
  ).submission;
}

function draftPayload(submission: Submission) {
  return toCockpitDraftPersistencePayload(submission, agentProfile.id, agentProfile.id);
}

beforeEach(() => {
  mockState.applicantRows = [];
  mockState.fromCalls = [];
  mockState.rpcCalls = [];
  mockState.submissionRows = [];
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

    expect(mockState.rpcCalls).toHaveLength(1);
    expect(mockState.rpcCalls[0]?.name).toBe("save_submission_draft");
    expect(payloadSubmission()).toMatchObject({
      agent_id: agentProfile.id,
      id: changedSubmission.id,
      title: changedSubmission.title,
    });
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

    expect(mockState.rpcCalls).toHaveLength(2);
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
      status: "corrections_received",
      issues: returnedSubmission.issues.map((issue) =>
        issue.status === "open" ? { ...issue, status: "fixed_by_manager" } : issue,
      ),
    };

    await saveCockpitSubmissionsForProfile(
      agentProfile,
      [correctedSubmission],
      new Map(),
    );

    expect(mockState.rpcCalls).toHaveLength(1);
    expect(mockState.rpcCalls[0]?.name).toBe("submit_corrections_handoff");
    expect(
      (
        mockState.rpcCalls[0]?.args.payload as {
          submission: { status: string };
        }
      ).submission.status,
    ).toBe("waiting_review");
  });

  it("keeps normalized applicant projection out of the cockpit payload and snapshot", async () => {
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
      passport_number: "",
      phone: null,
    });
    expect(savedSnapshot?.applicants[0]).not.toHaveProperty("normalizedProfile");
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
      passport_number: "",
    });
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

    const withStorageMetadata = draftPayload({
      ...submission,
      files: [
        {
          ...submission.files[0],
          generatedFileName: "v1900abcde_photo_white.jpg",
          mimeType: "image/jpeg",
          originalFileName: "phone-photo.jpg",
          reviewedBy: adminProfile.id,
          reviewStatus: "accepted",
          sizeBytes: 2048,
          status: "accepted",
          storageBucket: "submission-media",
          storagePath: "ПД-1052/з-1052-1/photo_white/v1900abcde_photo_white.jpg",
          uploadedAtIso: "2026-06-16T10:00:00.000Z",
          uploadStatus: "uploaded",
        },
      ],
    });

    expect(withStorageMetadata.media_assets[0]).toMatchObject({
      applicant_id: "з-1052-1",
      generated_file_name: "v1900abcde_photo_white.jpg",
      original_file_name: "phone-photo.jpg",
      review_status: "accepted",
      reviewed_by: adminProfile.id,
      storage_bucket: "submission-media",
      storage_path: "ПД-1052/з-1052-1/photo_white/v1900abcde_photo_white.jpg",
      submission_id: "ПД-1052",
      type: "photo_white",
      upload_status: "uploaded",
    });
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

    expect(mockState.rpcCalls).toHaveLength(1);
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

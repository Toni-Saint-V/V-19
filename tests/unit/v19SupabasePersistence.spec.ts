import { beforeEach, describe, expect, it, vi } from "vitest";
import { initialSubmissions } from "../../src/modules/submissions/mockData";
import type { Submission } from "../../src/modules/submissions/types";
import type { AppProfile } from "../../src/types/session";

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

function payloadSubmission(callIndex = 0) {
  return (
    mockState.rpcCalls[callIndex]?.args.payload as {
      submission: { agent_id: string; id: string; title: string };
    }
  ).submission;
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

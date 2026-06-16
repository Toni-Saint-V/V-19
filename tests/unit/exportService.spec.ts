import { describe, expect, test } from "vitest";
import { buildMediaSlot, normalizeSubmission } from "../../src/lib/workflow";
import {
  applyExportPackageDraft,
  buildExportPackageDraft,
} from "../../src/services/exportService";
import type { Applicant, ExportBatch, Submission } from "../../src/types/domain";

const createdAt = "2026-06-16T06:30:00.000Z";
const createdBy = "00000000-0000-4000-8000-000000000001";

function applicant(overrides: Partial<Applicant> = {}): Applicant {
  const base: Applicant = {
    id: overrides.id ?? "applicant-1",
    name: overrides.name ?? "Ivan Petrov",
    role: "Заявитель",
    passport: "75 1234567",
    form: 100,
    media: 3,
    mediaRequired: 3,
    birthDate: "1990-02-10",
    citizenship: "РФ",
    address: "Moscow",
    phone: "+79001234567",
    email: "ivan@example.com",
    passportIssuedAt: "2021-03-12",
    passportExpiresAt: "2031-03-12",
    country: "Испания",
    city: "Мадрид",
    tripDates: "2026-08-20 - 2026-08-30",
    hotelName: "Madrid Central",
    hotelAddress: "Gran Via 21",
    ...overrides,
  };

  return {
    ...base,
    mediaSlots: [
      buildMediaSlot(base, "photo_white", "accepted"),
      buildMediaSlot(base, "selfie", "accepted"),
      buildMediaSlot(base, "video", "accepted"),
    ],
  };
}

function acceptedSubmission(overrides: Partial<Submission> = {}): Submission {
  const applicants = overrides.applicants ?? [applicant()];

  return normalizeSubmission({
    id: "VF-1001",
    title: "Ivan Petrov",
    type: "single",
    agentId: "agent-1",
    agentName: "Nord Travel",
    country: "Испания",
    city: "Мадрид",
    travelDate: "2026-08-20",
    updated: "2026-06-15T10:00:00.000Z",
    status: "accepted",
    appointment: "not_started",
    priority: "Средний",
    fields: 100,
    media: 3,
    mediaRequired: 3,
    applicants,
    mediaRows: [],
    notes: [],
    acceptedAt: "2026-06-15T10:00:00.000Z",
    ...overrides,
  });
}

describe("durable export package service", () => {
  test("blocks non-accepted submissions even when they look Excel-ready", () => {
    const draft = buildExportPackageDraft(
      [acceptedSubmission({ status: "ready_for_excel" })],
      {
        batchId: "batch-ready-for-excel",
        createdAt,
        createdBy,
        format: "xlsx",
      },
    );

    expect(draft.status).toBe("blocked");
    if (draft.status === "blocked") {
      expect(draft.blockers.map((blocker) => blocker.reason).join(" ")).toContain(
        "статус Готово к Excel",
      );
      return;
    }
    throw new Error("expected blocked draft");
  });

  test("builds a durable xlsx package draft with stable submission identity", () => {
    const first = acceptedSubmission({ id: "VF-1001", title: "Ivan Petrov" });
    const second = acceptedSubmission({
      id: "VF-1002",
      title: "Anna Petrova",
      applicants: [
        applicant({
          id: "applicant-2",
          name: "Anna Petrova",
          passport: "76 7654321",
        }),
      ],
    });

    const draft = buildExportPackageDraft([second, first], {
      batchId: "batch-100",
      createdAt,
      createdBy,
      format: "xlsx",
    });
    const reordered = buildExportPackageDraft([first, second], {
      batchId: "batch-101",
      createdAt,
      createdBy,
      format: "xlsx",
    });

    if (draft.status !== "ready" || reordered.status !== "ready") {
      throw new Error("expected export drafts to be ready");
    }

    expect(draft.batch).toMatchObject({
      id: "batch-100",
      createdAt,
      createdBy,
      format: "xlsx",
      rowCount: 2,
      submissionIds: ["VF-1001", "VF-1002"],
    });
    expect(draft.artifact.contentType).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(draft.artifact.fileName).toMatch(/^visaflow-export-[a-z0-9]+\.xlsx$/);
    expect(draft.artifact.blob.size).toBeGreaterThan(0);
    expect(draft.idempotencyKey).toBe(reordered.idempotencyKey);
    expect(draft.rows.map((row) => row["ID заявки"])).toEqual(["VF-1001", "VF-1002"]);
    expect(reordered.rows.map((row) => row["ID заявки"])).toEqual([
      "VF-1001",
      "VF-1002",
    ]);
    expect(draft.batch).toMatchObject({
      idempotencyKey: draft.idempotencyKey,
      contentFingerprint: expect.stringContaining("VF-1001"),
      fileName: draft.artifact.fileName,
    });
  });

  test("applies an export package once and records one batch per submission", () => {
    const submission = acceptedSubmission();
    const draft = buildExportPackageDraft([submission], {
      batchId: "batch-once",
      createdAt,
      createdBy,
      format: "csv",
    });

    if (draft.status !== "ready") throw new Error("expected ready draft");

    const exported = applyExportPackageDraft([submission], draft);
    expect(exported[0]).toMatchObject({
      status: "exported",
      exportedAt: createdAt,
      exportHistory: [draft.batch],
    });

    const appliedTwice = applyExportPackageDraft(exported, draft);
    expect(appliedTwice[0]?.exportHistory).toHaveLength(1);
    expect(appliedTwice[0]?.timeline).toHaveLength(exported[0]?.timeline?.length ?? 0);
  });

  test("keeps stale package drafts from exporting changed submissions", () => {
    const submission = acceptedSubmission();
    const draft = buildExportPackageDraft([submission], {
      batchId: "batch-stale",
      createdAt,
      createdBy,
      format: "csv",
    });

    if (draft.status !== "ready") throw new Error("expected ready draft");

    const staleSubmission = acceptedSubmission({
      status: "returned",
      updated: "2026-06-16T08:00:00.000Z",
    });
    const result = applyExportPackageDraft([staleSubmission], draft);

    expect(result).toEqual([staleSubmission]);
    expect(result[0]?.status).toBe("returned");
    expect(result[0]?.exportHistory).toBeUndefined();
  });

  test("detects duplicate package drafts from existing export history", () => {
    const initial = acceptedSubmission();
    const initialDraft = buildExportPackageDraft([initial], {
      batchId: "batch-existing",
      createdAt,
      createdBy,
      format: "csv",
    });

    if (initialDraft.status !== "ready") throw new Error("expected ready draft");

    const submission = acceptedSubmission({ exportHistory: [initialDraft.batch] });

    const draft = buildExportPackageDraft([submission], {
      batchId: "batch-new",
      createdAt,
      createdBy,
      format: "csv",
    });

    expect(draft.status).toBe("duplicate");
    if (draft.status !== "duplicate") throw new Error("expected duplicate draft");
    expect(draft.batch).toBe(initialDraft.batch);
  });

  test("does not mark legacy export history as duplicate without content identity", () => {
    const legacyBatch: ExportBatch = {
      id: "batch-legacy",
      createdAt,
      createdBy,
      format: "csv",
      rowCount: 1,
      submissionIds: ["VF-1001"],
    };
    const submission = acceptedSubmission({ exportHistory: [legacyBatch] });

    const draft = buildExportPackageDraft([submission], {
      batchId: "batch-with-content-identity",
      createdAt,
      createdBy,
      format: "csv",
    });

    expect(draft.status).toBe("ready");
  });

  test("does not mark changed export rows as duplicate for the same submission ids", () => {
    const initial = acceptedSubmission();
    const initialDraft = buildExportPackageDraft([initial], {
      batchId: "batch-original-content",
      createdAt,
      createdBy,
      format: "csv",
    });

    if (initialDraft.status !== "ready") throw new Error("expected ready draft");

    const changed = acceptedSubmission({
      applicants: [applicant({ passport: "99 9999999" })],
      exportHistory: [initialDraft.batch],
    });
    const draft = buildExportPackageDraft([changed], {
      batchId: "batch-changed-content",
      createdAt,
      createdBy,
      format: "csv",
    });

    expect(draft.status).toBe("ready");
    if (draft.status !== "ready") throw new Error("expected changed-content draft");
    expect(draft.idempotencyKey).not.toBe(initialDraft.idempotencyKey);
  });
});

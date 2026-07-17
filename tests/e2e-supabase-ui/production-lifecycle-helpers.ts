import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { normalizeLegacySubmissionStatus } from "../../src/modules/submissions/domainContract";
import { questionnaireFieldMatchesTarget } from "../../src/modules/submissions/questionnaire";
import { addPreciseAdminIssue } from "../../src/modules/submissions/submissionActions";
import { markSubmissionIssueFixedResult } from "../../src/modules/submissions/status";
import type { Submission } from "../../src/modules/submissions/types";

import { testArtifactPath } from "../support/artifacts";
import {
  PRODUCTION_PROJECT_REF,
  buildProductionCohortPlan,
  loadCohortResumeState,
  requiredProductionRunMarker,
  type CohortMutationSummary,
  type ProductionCohortCase,
} from "./production-cohort-helpers";

export const REQUIRED_PRODUCTION_LIFECYCLE_WRITE_UNLOCK =
  "I_UNDERSTAND_EXISTING_COHORT_LIFECYCLE_MUTATIONS";
export const REQUIRED_PRODUCTION_A2_S1_LIFECYCLE_WRITE_UNLOCK =
  "I_UNDERSTAND_A2_S1_EXISTING_COHORT_LIFECYCLE_MUTATIONS";
export const REQUIRED_PRODUCTION_A1_F6_LIFECYCLE_WRITE_UNLOCK =
  "I_APPROVE_NEW_A1_F6_LIFECYCLE_FOR_FAMILY_EXPORT_PROOF";
/** Legacy terminal case kept exclusively for the A1-F6 export proof. */
export const FOCUSED_PRODUCTION_LIFECYCLE_CASE_KEY = "A1-F6";
/** The original single-record production mutation target. */
export const PRODUCTION_A2_S1_LIFECYCLE_CASE_KEY = "A2-S1";

const allowedProductionLifecycleCaseKeys = [
  FOCUSED_PRODUCTION_LIFECYCLE_CASE_KEY,
  PRODUCTION_A2_S1_LIFECYCLE_CASE_KEY,
] as const;

export type ProductionSingleCaseKey = `A${1 | 2 | 3}-S${1 | 2 | 3}`;

export function requiredProductionLifecycleCaseKey():
  (typeof allowedProductionLifecycleCaseKeys)[number] {
  const caseKey = process.env.V19_PRODUCTION_COHORT_CASE_KEY?.trim();
  invariant(
    allowedProductionLifecycleCaseKeys.includes(
      caseKey as (typeof allowedProductionLifecycleCaseKeys)[number],
    ),
    "V19_PRODUCTION_COHORT_CASE_KEY must be exactly A2-S1 or A1-F6 for this production lifecycle rollout.",
  );
  return caseKey as (typeof allowedProductionLifecycleCaseKeys)[number];
}

export const RESUMABLE_PRODUCTION_LIFECYCLE_CASE_KEY =
  process.env.V19_PRODUCTION_COHORT_CASE_KEY ===
  FOCUSED_PRODUCTION_LIFECYCLE_CASE_KEY
    ? FOCUSED_PRODUCTION_LIFECYCLE_CASE_KEY
    : PRODUCTION_A2_S1_LIFECYCLE_CASE_KEY;

export type ProductionLifecycleCaseKey =
  | typeof FOCUSED_PRODUCTION_LIFECYCLE_CASE_KEY
  | ProductionSingleCaseKey;

export type ProductionLifecycleStage =
  | "pending_review"
  | "adding_issue"
  | "issue_added"
  | "returning"
  | "returned"
  | "fixing_issue"
  | "marking_issue_fixed"
  | "agent_fixed"
  | "resubmitting"
  | "resubmitted"
  | "accepting"
  | "accepted";

export type ProductionLifecycleCaseRef = {
  caseKey: ProductionLifecycleCaseKey;
  ownerKey: string;
  submissionId: string;
};

export type ProductionLifecycleState = {
  acceptanceProof?: {
    caseMarkerDigest: string;
    issueMarkerDigest: string;
    issueStatus: "fixed_by_agent";
  };
  case: ProductionLifecycleCaseRef;
  projectRef: typeof PRODUCTION_PROJECT_REF;
  runMarker: string;
  schemaVersion: 1;
  stage: ProductionLifecycleStage;
  updatedAt: string;
};

export type ResolvedProductionLifecycleState = {
  cohortCase: ProductionCohortCase;
  state: ProductionLifecycleState;
};

export type ProductionDraftPayloadMutationContract = {
  applicantProjection?:
    | { mode: "exact" }
    | {
        applicants: readonly {
          applicantId: string;
          expectedContentDigest: string;
          expectedFieldDigests?: Readonly<Record<string, string | null>>;
        }[];
        mode: "replace_exact";
      }
    | {
        applicantId: string;
        expectedContentDigest: string;
        mode: "replace_email";
      };
  correction: {
    applicantId?: string;
    baseReason?: string;
    fieldKey?: string;
    mode: "append" | "exact" | "existing";
    reasonIncludes: string;
    status: "closed" | "fixed" | "open";
  };
  draft: ProductionDraftPayloadIdentityContract;
  history: ProductionDraftHistoryExpectation;
  historyProjection?: {
    mode: "replace_exact";
    rows: readonly ProductionDraftProjectedStatusHistoryIdentity[];
  };
  mediaProjection?: {
    actorId: string;
    media: readonly {
      expectedStaticContentDigest: string;
      mediaId: string;
    }[];
    mode: "accept_exact";
  };
  mode: "export" | "lifecycle";
  /**
   * A lifecycle action may alter one precisely described snapshot field and
   * append one local-only audit entry. Any other snapshot delta remains
   * fail-closed.
   */
  snapshotMutation?: ProductionDraftSnapshotMutation;
  /** Exact source-serializer projection for lifecycle actions without issue mutation. */
  snapshotProjection?: {
    expectedLifecycleContentDigest: string;
    projectionDigests: ProductionDraftSnapshotProjectionDigests;
    updatedAtMode: "action_iso" | "now_literal";
  };
  snapshotHistoryProjection?: {
    typed: readonly ProductionDraftSnapshotHistoryIdentity[];
    untypedDigests: readonly string[];
  };
  /**
   * Browser-created persistence timestamps must be generated by the action
   * currently under the mutation gate, rather than being arbitrary ISO text.
   */
  timestampWindow?: ProductionMutationTimestampWindow;
  ownerId: string;
  questionnaire:
    | { mode: "exact" }
    | {
        applicantId: string;
        expectedValueDigest: string;
        fieldId: string;
        mode: "replace";
        sectionId: string;
      };
  questionnaireProjection?: {
    answers: readonly ProductionDraftQuestionnaireIdentity[];
    mode: "replace_exact";
  };
  submissionId: string;
  submissionProjection?: {
    expectedStaticContentDigest: string;
    mode: "replace_readiness_percent";
  };
};

export type ProductionMutationTimestampWindow = {
  notAfter: string;
  notBefore: string;
};

export type ProductionDraftSnapshotMutation =
  | {
      /** Full digest of the source-derived domain action result. */
      expectedContentDigest: string;
      projectionDigests?: ProductionDraftSnapshotProjectionDigests;
      fieldError: {
        applicantId: string;
        expectedValue: string;
        fieldId: string;
        sectionId: string;
      };
      mode: "add_issue";
      untypedHistory: {
        id: string;
        source: "admin";
        text: string;
      };
    }
  | {
      /** Full digest of the source-derived domain action result. */
      expectedContentDigest: string;
      projectionDigests?: ProductionDraftSnapshotProjectionDigests;
      fieldError: {
        applicantId: string;
        expectedValue: string;
        fieldId: string;
        sectionId: string;
      };
      mode: "mark_issue_fixed";
      untypedHistory: {
        id: string;
        source: "agent";
        text: string;
      };
    };

type ProductionDraftSnapshotProjectionDigests = {
  applicants: string;
  files: string;
  history: string;
  issues: string;
  root: string;
};

/**
 * A source-derived local action intent. The read-only resolver turns this into
 * an exact post-action digest while the production snapshot stays in memory.
 */
export type ProductionDraftSnapshotMutationIntent =
  | {
      applicantId?: string;
      comment: string;
      fieldId?: string;
      fieldLabel: string;
      mode: "add_issue";
      reason: string;
      /** Matches the active UI input exactly; absence is meaningful. */
      section?: string;
    }
  | {
      applicantId?: string;
      comment: string;
      fieldId?: string;
      fieldLabel: string;
      mode: "mark_issue_fixed";
      reason: string;
    };

export type ProductionLifecycleMutationContract =
  ProductionDraftPayloadMutationContract & {
  submissionStatus: "ready_for_excel" | "returned" | "waiting_review";
  };

/**
 * Raw identifiers are deliberately confined to the in-memory browser gate.
 * These values must not be written to checkpoint or evidence files.
 */
export type ProductionDraftPayloadIdentityContract = {
  applicants: readonly ProductionDraftApplicantIdentity[];
  corrections: readonly ProductionDraftCorrectionIdentity[];
  effectiveHistoryCount: number;
  mediaAssets: readonly ProductionDraftMediaIdentity[];
  questionnaireAnswers: readonly ProductionDraftQuestionnaireIdentity[];
  snapshot: ProductionDraftSnapshotIdentity;
  snapshotHistory: readonly ProductionDraftSnapshotHistoryIdentity[];
  snapshotIssueCount: number;
  snapshotIssues: readonly ProductionDraftSnapshotIssueIdentity[];
  snapshotUntypedHistoryDigests: readonly string[];
  statusHistory: readonly ProductionDraftStatusHistoryIdentity[];
  submission: ProductionDraftSubmissionIdentity;
};

export type ProductionDraftApplicantIdentity = {
  contentDigest: string;
  id: string;
  submissionId: string;
};

export type ProductionDraftMediaIdentity = {
  applicantId: string;
  contentDigest: string;
  id: string;
  storageBucket: string;
  storagePathDigest: string;
  submissionId: string;
  type: string;
};

export type ProductionDraftSubmissionIdentity = {
  staticContentDigest: string;
};

export type ProductionDraftSnapshotIdentity = {
  exportContentDigest: string;
  lifecycleContentDigest: string;
};

export type ProductionDraftSnapshotHistoryIdentity = {
  commentDigest: string;
  contentDigest: string;
  fromStatus: string | null;
  id: string;
  noteDigest: string | null;
  source: "admin" | "agent" | "bb" | "system";
  toStatus: string;
};

export type ProductionDraftSnapshotIssueIdentity = {
  contentDigest: string;
  id: string;
  status: "closed_by_admin" | "fixed_by_agent" | "open";
  withoutStatusDigest: string;
};

export type ProductionDraftQuestionnaireIdentity = {
  applicantId: string;
  fieldId: string;
  labelDigest: string;
  logicalValueDigest: string;
  sectionId: string;
  snapshotErrorDigest: string | null;
  submissionId: string;
  valueDigest: string;
  valueStructureDigest: string;
};

export type ProductionDraftCorrectionIdentity = {
  applicantId: string | null;
  createdAt: string;
  fieldKey: string | null;
  fixedAt: string | null;
  id: string;
  mediaType: string | null;
  reasonDigest: string;
  scope: string;
  severity: string;
  status: string;
  submissionId: string;
  targetMarker: boolean;
};

export type ProductionDraftStatusHistoryIdentity = {
  changedAt: string;
  commentDigest: string;
  entityId: string;
  entityType: "submission";
  fromStatus: string | null;
  id: string;
  noteDigest: string | null;
  source: "admin" | "agent" | "bb" | "system";
  toStatus: string;
};

export type ProductionDraftProjectedStatusHistoryIdentity = {
  changedAt: "action" | string;
  changedBy: string;
  commentDigest: string;
  entityId: string;
  entityType: "submission";
  fromStatus: string | null;
  id: string;
  noteDigest: string | null;
  source: "admin" | "agent";
  toStatus: string;
};

export type ProductionDraftHistoryExpectation = {
  actorId: string;
  actorSource: "admin" | "agent";
  snapshotStatus:
    | "corrections_received"
    | "ready_for_export"
    | "returned"
    | "submitted_for_review";
  transition?: {
    comment: string;
    fromStatus: string;
    note: string | null;
    toStatus: string;
  };
};

export type ProductionCohortMutationLane = "export" | "lifecycle";

const lifecycleStages = new Set<ProductionLifecycleStage>([
  "pending_review",
  "adding_issue",
  "issue_added",
  "returning",
  "returned",
  "fixing_issue",
  "marking_issue_fixed",
  "agent_fixed",
  "resubmitting",
  "resubmitted",
  "accepting",
  "accepted",
]);

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type JsonRecord = Record<string, unknown>;

function jsonRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function canonicalJson(value: unknown): string | null {
  if (value === null) return "null";
  if (typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return Number.isFinite(value) ? JSON.stringify(value) : null;
  if (Array.isArray(value)) {
    const items = value.map((item) => canonicalJson(item));
    return items.every((item): item is string => item !== null)
      ? `[${items.join(",")}]`
      : null;
  }
  const record = jsonRecord(value);
  if (!record) return null;
  const entries = Object.keys(record)
    .sort()
    .map((key) => {
      const serialized = canonicalJson(record[key]);
      return serialized === null ? null : `${JSON.stringify(key)}:${serialized}`;
    });
  return entries.every((entry): entry is string => entry !== null)
    ? `{${entries.join(",")}}`
    : null;
}

/** Hashes a value in memory without retaining its potentially sensitive text. */
export function productionDraftValueDigest(value: unknown) {
  const serialized = canonicalJson(value);
  return serialized === null ? null : createHash("sha256").update(serialized).digest("hex");
}

/** Mirrors the deterministic persistence identity used by cockpit draft writes. */
export function productionDraftStableUuid(seed: string) {
  let hashA = 0x811c9dc5;
  let hashB = 0x01000193;

  for (const char of seed) {
    const code = char.codePointAt(0) ?? 0;
    hashA ^= code;
    hashA = Math.imul(hashA, 0x01000193);
    hashB ^= code + hashA;
    hashB = Math.imul(hashB, 0x85ebca6b);
  }

  const hex = [hashA, hashB, hashA ^ hashB, hashA + hashB]
    .map((value) => (value >>> 0).toString(16).padStart(8, "0"))
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function productionDraftDurableUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

/** Mirrors the serializer: durable audit rows keep their database UUID. */
export function productionDraftHistoryPayloadId(submissionId: string, historyId: string) {
  return productionDraftDurableUuid(historyId)
    ? historyId
    : productionDraftStableUuid(`history:${submissionId}:${historyId}`);
}

function identityKey(...values: unknown[]) {
  return JSON.stringify(values);
}

function recordArray(value: unknown): JsonRecord[] | null {
  if (!Array.isArray(value)) return null;
  const records = value.map(jsonRecord);
  return records.every((record): record is JsonRecord => record !== null) ? records : null;
}

function text(value: unknown) {
  return typeof value === "string" ? value : null;
}

function nullableText(value: unknown) {
  return value === null || typeof value === "string" ? value : undefined;
}

function exactIdentitySet(
  actual: readonly string[],
  expected: readonly string[],
) {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  return (
    actual.length === expected.length &&
    actualSet.size === actual.length &&
    expectedSet.size === expected.length &&
    actualSet.size === expectedSet.size &&
    [...actualSet].every((value) => expectedSet.has(value))
  );
}

function exactIdentityMultiset(
  actual: readonly string[],
  expected: readonly string[],
) {
  if (actual.length !== expected.length) return false;
  const counts = new Map<string, number>();
  for (const value of expected) counts.set(value, (counts.get(value) ?? 0) + 1);
  for (const value of actual) {
    const count = counts.get(value) ?? 0;
    if (count === 0) return false;
    if (count === 1) counts.delete(value);
    else counts.set(value, count - 1);
  }
  return counts.size === 0;
}

const submissionPayloadKeys = [
  "accepted_at",
  "agent_id",
  "appointment_status",
  "city",
  "country",
  "exported_at",
  "family_intelligence",
  "id",
  "priority",
  "readiness_percent",
  "review_started_at",
  "status",
  "submitted_at",
  "title",
  "travel_date",
  "trip_date_from",
  "trip_date_to",
  "type",
  "updated_at",
] as const;

const submissionStaticPayloadKeys = [
  "agent_id",
  "city",
  "country",
  "id",
  "readiness_percent",
  "title",
  "travel_date",
  "trip_date_from",
  "trip_date_to",
  "type",
] as const;

const applicantPayloadKeys = [
  "address",
  "birth_date",
  "citizenship",
  "city",
  "country",
  "email",
  "full_name",
  "hotel_address",
  "hotel_name",
  "id",
  "media_percent",
  "passport_expires_at",
  "passport_issued_at",
  "passport_number",
  "patronymic",
  "phone",
  "questionnaire_percent",
  "role",
  "role_confirmed",
  "submission_id",
  "suggested_role",
  "trip_dates",
] as const;

const mediaPayloadKeys = [
  "applicant_id",
  "generated_file_name",
  "id",
  "mime_type",
  "original_file_name",
  "review_status",
  "reviewed_at",
  "reviewed_by",
  "size_bytes",
  "storage_bucket",
  "storage_path",
  "submission_id",
  "type",
  "upload_status",
  "uploaded_at",
] as const;

const questionnaireAnswerPayloadKeys = [
  "applicant_id",
  "field_id",
  "label",
  "section_id",
  "submission_id",
  "updated_by",
  "value",
] as const;

const correctionPayloadKeys = [
  "applicant_id",
  "created_at",
  "created_by",
  "field_key",
  "fixed_at",
  "id",
  "media_type",
  "reason",
  "scope",
  "severity",
  "status",
  "submission_id",
] as const;

const statusHistoryPayloadKeys = [
  "changed_at",
  "changed_by",
  "comment",
  "entity_id",
  "entity_type",
  "from_status",
  "id",
  "note",
  "source",
  "to_status",
] as const;

const draftPayloadKeys = [
  "applicants",
  "corrections",
  "media_assets",
  "questionnaire_answers",
  "status_history",
  "submission",
] as const;

function exactRecordKeys(value: JsonRecord, expected: readonly string[]) {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function contentDigestForKeys(value: JsonRecord, keys: readonly string[]) {
  const projection = Object.fromEntries(keys.map((key) => [key, value[key]]));
  return productionDraftValueDigest(projection);
}

function normalizedTimestamp(value: unknown) {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

/** Full applicant payload digest; DB-maintained timestamps are intentionally absent. */
export function productionDraftApplicantContentDigest(value: unknown) {
  const record = jsonRecord(value);
  return record && exactRecordKeys(record, applicantPayloadKeys)
    ? productionDraftValueDigest(record)
    : null;
}

/** Full media payload digest with equivalent timestamptz spellings canonicalized. */
export function productionDraftMediaContentDigest(value: unknown) {
  const record = jsonRecord(value);
  if (!record || !exactRecordKeys(record, mediaPayloadKeys)) return null;
  const uploadedAt = normalizedTimestamp(record.uploaded_at);
  const reviewedAt = normalizedTimestamp(record.reviewed_at);
  if (uploadedAt === undefined || reviewedAt === undefined) return null;
  return productionDraftValueDigest({
    ...record,
    reviewed_at: reviewedAt,
    uploaded_at: uploadedAt,
  });
}

export function productionDraftMediaStaticContentDigest(value: unknown) {
  const record = jsonRecord(value);
  if (!record || !exactRecordKeys(record, mediaPayloadKeys)) return null;
  const uploadedAt = normalizedTimestamp(record.uploaded_at);
  if (uploadedAt === undefined) return null;
  const staticRecord = Object.fromEntries(
    Object.entries(record).filter(
      ([key]) =>
        key !== "review_status" &&
        key !== "reviewed_at" &&
        key !== "reviewed_by",
    ),
  );
  return productionDraftValueDigest({
    ...staticRecord,
    uploaded_at: uploadedAt,
  });
}

/** Canonical digest of root fields that a draft action is never allowed to change. */
export function productionDraftSubmissionStaticContentDigest(value: unknown) {
  const record = jsonRecord(value);
  return record ? contentDigestForKeys(record, submissionStaticPayloadKeys) : null;
}

function canonicalSnapshot(value: unknown) {
  const intelligence = jsonRecord(value);
  if (
    !intelligence ||
    !exactRecordKeys(intelligence, ["status", "v19CockpitSnapshot"]) ||
    intelligence.status !== "unreviewed"
  ) {
    return null;
  }
  const envelope = jsonRecord(intelligence.v19CockpitSnapshot);
  if (
    !envelope ||
    !exactRecordKeys(envelope, ["submission", "version"]) ||
    envelope.version !== 1
  ) {
    return null;
  }
  const snapshot = jsonRecord(envelope.submission);
  return snapshot ? { envelope, intelligence, snapshot } : null;
}

function canonicalClone(value: JsonRecord) {
  const serialized = canonicalJson(value);
  return serialized ? (JSON.parse(serialized) as JsonRecord) : null;
}

/** Full canonical snapshot digest with no action-owned fields normalized away. */
export function productionDraftSnapshotFullContentDigest(value: unknown) {
  const canonical = canonicalSnapshot(value);
  return canonical ? productionDraftValueDigest(canonical.snapshot) : null;
}

type SnapshotFieldTarget = {
  applicantId: string;
  field: { error?: string; id: string; label: string; value: string };
  sectionId: string;
};

function snapshotFieldTarget(
  submission: Submission,
  fieldLabel: string,
  options: { applicantId?: string; fieldId?: string } = {},
): SnapshotFieldTarget | null {
  const matches: SnapshotFieldTarget[] = [];
  for (const applicant of submission.applicants) {
    if (options.applicantId && applicant.id !== options.applicantId) continue;
    for (const section of applicant.sections) {
      for (const field of section.fields) {
        if (options.fieldId && field.id !== options.fieldId) continue;
        if (!questionnaireFieldMatchesTarget(field, fieldLabel)) continue;
        matches.push({
          applicantId: applicant.id,
          field,
          sectionId: section.id,
        });
      }
    }
  }
  return matches.length === 1 ? matches[0]! : null;
}

function persistedSnapshotContentDigest(value: Submission) {
  try {
    const serialized = JSON.stringify(value);
    return productionDraftValueDigest(JSON.parse(serialized));
  } catch {
    return null;
  }
}

function normalizeSnapshotFileReviewTimestamps(snapshot: JsonRecord) {
  const files = recordArray(snapshot.files);
  if (!files) return;
  for (const file of files) {
    if (isSnapshotTimestamp(file.reviewedAtIso)) {
      file.reviewedAtIso = "__V19_FILE_REVIEW_TIMESTAMP__";
    }
  }
}

export function productionDraftSnapshotProjectionDigests(
  value: unknown,
  options: { normalizeFileReviewTimestamps?: boolean } = {},
): ProductionDraftSnapshotProjectionDigests | null {
  const canonical = canonicalSnapshot(value);
  const direct = jsonRecord(value);
  const source = canonical?.snapshot ?? direct;
  const snapshot = (() => {
    if (!source) return null;
    try {
      return jsonRecord(JSON.parse(JSON.stringify(source)));
    } catch {
      return null;
    }
  })();
  if (!snapshot) return null;
  if (options.normalizeFileReviewTimestamps) {
    normalizeSnapshotFileReviewTimestamps(snapshot);
  }
  const projectionDigest = (key: "applicants" | "files" | "history" | "issues") =>
    productionDraftValueDigest(
      Object.hasOwn(snapshot, key)
        ? snapshot[key]
        : { absentSnapshotProjection: key },
    );
  const applicants = projectionDigest("applicants");
  const files = projectionDigest("files");
  const history = projectionDigest("history");
  const issues = projectionDigest("issues");
  delete snapshot.applicants;
  delete snapshot.files;
  delete snapshot.history;
  delete snapshot.issues;
  if (isSnapshotTimestamp(snapshot.updatedAt)) {
    snapshot.updatedAt = "__V19_SNAPSHOT_TIMESTAMP__";
  }
  const root = productionDraftValueDigest(snapshot);
  return applicants && files && history && issues && root
    ? { applicants, files, history, issues, root }
    : null;
}

/**
 * Derives the exact snapshot after the source domain action rather than
 * whitelisting a broad JSON region. The raw baseline exists only transiently
 * during the read-only preflight; the returned contract retains a digest.
 */
export function productionDraftSnapshotMutationFromBaseline(
  value: unknown,
  intent: ProductionDraftSnapshotMutationIntent,
  options?: { projectPersistedSnapshot?: (submission: Submission) => Submission },
): ProductionDraftSnapshotMutation | null {
  const canonical = canonicalSnapshot(value);
  const snapshot = canonical && canonicalClone(canonical.snapshot);
  if (!snapshot) return null;
  const submission = snapshot as unknown as Submission;

  if (intent.mode === "add_issue") {
    const target = snapshotFieldTarget(submission, intent.fieldLabel, intent);
    if (!target || target.field.error !== undefined) return null;
    const next = addPreciseAdminIssue(
      submission,
      {
        applicantId: target.applicantId,
        comment: intent.comment,
        field: target.field.label,
        reason: intent.reason,
        section: intent.section,
        severity: "blocker",
        type: "field",
      },
      "admin",
    );
    const issue = next.issues[0];
    const persistedNext = options?.projectPersistedSnapshot?.(next) ?? next;
    const expectedContentDigest = persistedSnapshotContentDigest(persistedNext);
    const projectionDigests = productionDraftSnapshotProjectionDigests(persistedNext);
    if (
      next === submission ||
      !issue ||
      issue.status !== "open" ||
      issue.reason !== intent.reason ||
      issue.comment !== intent.comment ||
      issue.target.applicantId !== target.applicantId ||
      issue.target.field !== target.field.label ||
      !expectedContentDigest ||
      !projectionDigests
    ) {
      return null;
    }
    return {
      expectedContentDigest,
      projectionDigests,
      fieldError: {
        applicantId: target.applicantId,
        expectedValue: intent.reason,
        fieldId: target.field.id,
        sectionId: target.sectionId,
      },
      mode: "add_issue",
      untypedHistory: {
        id: `и-${submission.id}-замечание`,
        source: "admin",
        text: "Администратор добавил точное замечание",
      },
    };
  }

  const matchingIssues = submission.issues.filter(
    (issue) =>
      issue.type === "field" &&
      issue.status === "open" &&
      issue.reason === intent.reason &&
      issue.comment === intent.comment,
  );
  if (matchingIssues.length !== 1) return null;
  const issue = matchingIssues[0]!;
  const target = snapshotFieldTarget(submission, intent.fieldLabel, intent);
  if (
    !target ||
    target.applicantId !== issue.target.applicantId ||
    (target.field.error !== undefined && target.field.error !== intent.reason)
  ) {
    return null;
  }
  const result = markSubmissionIssueFixedResult(submission, issue.id, "agent");
  if (!result.ok) return null;
  const persistedResult =
    options?.projectPersistedSnapshot?.(result.data) ?? result.data;
  const expectedContentDigest = persistedSnapshotContentDigest(persistedResult);
  const projectionDigests = productionDraftSnapshotProjectionDigests(persistedResult);
  if (!expectedContentDigest || !projectionDigests) return null;
  return {
    expectedContentDigest,
    projectionDigests,
    fieldError: {
      applicantId: target.applicantId,
      expectedValue: intent.reason,
      fieldId: target.field.id,
      sectionId: target.sectionId,
    },
    mode: "mark_issue_fixed",
    untypedHistory: {
      id: `и-${submission.id}-${issue.id}-исправлено`,
      source: "agent",
      text: "Агент отметил замечание исправленным",
    },
  };
}

/**
 * Full snapshot digest with only separately validated action-owned fields
 * normalized away. Unknown keys and all other nested content remain bound.
 */
export function productionDraftSnapshotContentDigest(
  value: unknown,
  mode: "export" | "lifecycle",
  options: { normalizeFileReviewTimestamps?: boolean } = {},
) {
  const canonical = canonicalSnapshot(value);
  if (!canonical) return null;
  const snapshot = canonicalClone(canonical.snapshot);
  if (!snapshot) return null;
  if (options.normalizeFileReviewTimestamps) {
    normalizeSnapshotFileReviewTimestamps(snapshot);
  }
  const applicants = recordArray(snapshot.applicants);
  if (!applicants) return null;
  for (const applicant of applicants) {
    const sections = recordArray(applicant.sections);
    if (!sections) return null;
    for (const section of sections) {
      const fields = recordArray(section.fields);
      if (!fields) return null;
      for (const field of fields) {
        if (!("value" in field)) return null;
        field.value = "__V19_QUESTIONNAIRE_VALUE__";
      }
    }
  }

  delete snapshot.history;
  delete snapshot.updatedAt;
  if (mode === "export") {
    delete snapshot.exportPackage;
    delete snapshot.exportState;
  } else {
    delete snapshot.issues;
    delete snapshot.status;
  }
  return productionDraftValueDigest(snapshot);
}

export function productionDraftSnapshotFieldErrorIdentities(value: unknown) {
  const canonical = canonicalSnapshot(value);
  if (!canonical) return null;
  const applicants = recordArray(canonical.snapshot.applicants);
  if (!applicants) return null;

  const identities: Array<{
    applicantId: string;
    errorDigest: string | null;
    fieldId: string;
    sectionId: string;
  }> = [];
  const keys = new Set<string>();
  for (const applicant of applicants) {
    const applicantId = text(applicant.id);
    const sections = recordArray(applicant.sections);
    if (!applicantId || !sections) return null;
    for (const section of sections) {
      const sectionId = text(section.id);
      const fields = recordArray(section.fields);
      if (!sectionId || !fields) return null;
      for (const field of fields) {
        const fieldId = text(field.id);
        if (!fieldId) return null;
        const errorDigest =
          field.error === undefined ? null : productionDraftValueDigest(field.error);
        if (field.error !== undefined && !errorDigest) return null;
        const key = identityKey(applicantId, sectionId, fieldId);
        if (keys.has(key)) return null;
        keys.add(key);
        identities.push({ applicantId, errorDigest, fieldId, sectionId });
      }
    }
  }
  return identities;
}

function isIsoTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    Number.isFinite(Date.parse(value)) &&
    /^\d{4}-\d{2}-\d{2}T/.test(value)
  );
}

function timestampMatches(value: unknown, expected: string) {
  return (
    isIsoTimestamp(value) &&
    isIsoTimestamp(expected) &&
    Date.parse(value) === Date.parse(expected)
  );
}

function timestampFallsWithinWindow(
  value: unknown,
  window: ProductionMutationTimestampWindow | undefined,
) {
  if (!isIsoTimestamp(value)) return false;
  if (!window) return true;
  if (!isIsoTimestamp(window.notBefore) || !isIsoTimestamp(window.notAfter)) {
    return false;
  }
  const at = Date.parse(value);
  return at >= Date.parse(window.notBefore) && at <= Date.parse(window.notAfter);
}

function timestampMatchesBaselineOrAction(
  value: unknown,
  baseline: string | null,
  window: ProductionMutationTimestampWindow | undefined,
) {
  return (
    (baseline !== null && timestampMatches(value, baseline)) ||
    timestampFallsWithinWindow(value, window)
  );
}

function isSnapshotTimestamp(value: unknown) {
  return value === "сейчас" || isIsoTimestamp(value);
}

function applicantKey(value: ProductionDraftApplicantIdentity) {
  return identityKey(value.id, value.submissionId, value.contentDigest);
}

function applicantPayloadKey(value: JsonRecord) {
  const id = text(value.id);
  const submissionId = text(value.submission_id);
  const contentDigest = productionDraftApplicantContentDigest(value);
  return id && submissionId && contentDigest
    ? identityKey(id, submissionId, contentDigest)
    : null;
}

function applicantsMatch(
  actualRows: readonly JsonRecord[],
  contract: ProductionDraftPayloadMutationContract,
) {
  if (actualRows.length !== contract.draft.applicants.length) return false;
  const mutation = contract.applicantProjection;
  const exactProjection =
    mutation?.mode === "replace_exact"
      ? new Map(
          mutation.applicants.map((applicant) => [
            applicant.applicantId,
            applicant.expectedContentDigest,
          ]),
        )
      : null;
  const expectedKeys = contract.draft.applicants.map((applicant) =>
    applicantKey(
      mutation?.mode === "replace_email" && applicant.id === mutation.applicantId
        ? { ...applicant, contentDigest: mutation.expectedContentDigest }
        : exactProjection?.has(applicant.id)
          ? {
              ...applicant,
              contentDigest: exactProjection.get(applicant.id)!,
            }
          : applicant,
    ),
  );
  const actualKeys = actualRows.map(applicantPayloadKey);
  return (
    actualKeys.every((key): key is string => key !== null) &&
    exactIdentitySet(actualKeys, expectedKeys) &&
    (mutation?.mode !== "replace_exact" ||
      (exactProjection?.size === contract.draft.applicants.length &&
        contract.draft.applicants.every((applicant) =>
          exactProjection.has(applicant.id),
        ))) &&
    (mutation?.mode !== "replace_email" ||
      contract.draft.applicants.some(
        (applicant) => applicant.id === mutation.applicantId,
      ))
  );
}

function applicantPayloadMismatchCode(
  actualRows: readonly JsonRecord[],
  contract: ProductionDraftPayloadMutationContract,
) {
  if (actualRows.length !== contract.draft.applicants.length) {
    return `count_${actualRows.length}_${contract.draft.applicants.length}`;
  }
  const projection = contract.applicantProjection;
  if (projection?.mode !== "replace_exact") return "content";
  const expectedById = new Map(
    projection.applicants.map((applicant) => [applicant.applicantId, applicant]),
  );
  for (const actual of actualRows) {
    const applicantId = text(actual.id);
    if (!applicantId) return "shape";
    const expected = expectedById.get(applicantId);
    if (!expected) return "identity";
    if (
      productionDraftApplicantContentDigest(actual) ===
      expected.expectedContentDigest
    ) {
      continue;
    }
    for (const field of applicantPayloadKeys) {
      const expectedDigest = expected.expectedFieldDigests?.[field];
      if (
        expectedDigest !== undefined &&
        productionDraftValueDigest(actual[field]) !== expectedDigest
      ) {
        return `field_${field}`;
      }
    }
    return "content";
  }
  return "content";
}

function mediaKey(value: ProductionDraftMediaIdentity) {
  return identityKey(
    value.id,
    value.applicantId,
    value.submissionId,
    value.type,
    value.storageBucket,
    value.storagePathDigest,
    value.contentDigest,
  );
}

function mediaPayloadKey(value: JsonRecord) {
  const id = text(value.id);
  const applicantId = text(value.applicant_id);
  const submissionId = text(value.submission_id);
  const type = text(value.type);
  const storageBucket = text(value.storage_bucket);
  const storagePathDigest = productionDraftValueDigest(value.storage_path);
  const contentDigest = productionDraftMediaContentDigest(value);
  return id && applicantId && submissionId && type && storageBucket && storagePathDigest && contentDigest
    ? identityKey(
        id,
        applicantId,
        submissionId,
        type,
        storageBucket,
        storagePathDigest,
        contentDigest,
      )
    : null;
}

function mediaRowsMatch(
  actualRows: readonly JsonRecord[],
  contract: ProductionDraftPayloadMutationContract,
) {
  const projection = contract.mediaProjection;
  if (!projection) {
    const mediaKeys = actualRows.map(mediaPayloadKey);
    return (
      mediaKeys.every((key): key is string => key !== null) &&
      exactIdentitySet(
        mediaKeys,
        contract.draft.mediaAssets.map(mediaKey),
      )
    );
  }
  if (
    actualRows.length !== contract.draft.mediaAssets.length ||
    projection.media.length !== contract.draft.mediaAssets.length
  ) {
    return false;
  }
  const projectedById = new Map(
    projection.media.map((media) => [media.mediaId, media]),
  );
  const actualIds = actualRows.map((row) => text(row.id));
  if (
    projectedById.size !== projection.media.length ||
    actualIds.some((mediaId) => !mediaId) ||
    !exactIdentitySet(
      actualIds as string[],
      projection.media.map((media) => media.mediaId),
    )
  ) {
    return false;
  }
  return actualRows.every((row) => {
    const mediaId = text(row.id);
    const expected = mediaId ? projectedById.get(mediaId) : undefined;
    return Boolean(
      expected &&
        row.review_status === "accepted" &&
        row.reviewed_by === projection.actorId &&
        timestampFallsWithinWindow(row.reviewed_at, contract.timestampWindow) &&
        productionDraftMediaStaticContentDigest(row) ===
          expected.expectedStaticContentDigest,
    );
  });
}

function questionnaireLogicalValue(value: unknown) {
  const envelope = jsonRecord(value);
  return envelope?.kind === "v19_questionnaire_field" ? envelope.value : value;
}

function submissionPayloadMatchesContract(
  submission: JsonRecord,
  contract: ProductionDraftPayloadMutationContract,
) {
  if (!exactRecordKeys(submission, submissionPayloadKeys)) return false;
  const staticContentDigest = productionDraftSubmissionStaticContentDigest(submission);
  const expectedStaticContentDigest =
    contract.submissionProjection?.mode === "replace_readiness_percent"
      ? contract.submissionProjection.expectedStaticContentDigest
      : contract.draft.submission.staticContentDigest;
  if (staticContentDigest !== expectedStaticContentDigest) return false;
  const expectedStatus =
    contract.history.snapshotStatus === "returned"
      ? "returned"
      : contract.history.snapshotStatus === "ready_for_export"
        ? "ready_for_excel"
        : "waiting_review";
  if (
    submission.status !== expectedStatus ||
    submission.priority !== (expectedStatus === "returned" ? "Высокий" : "Средний") ||
    submission.appointment_status !== "not_started" ||
    submission.review_started_at !== null ||
    submission.exported_at !== null ||
    !timestampFallsWithinWindow(submission.updated_at, contract.timestampWindow)
  ) {
    return false;
  }
  const submittedAtValid =
    contract.history.snapshotStatus === "submitted_for_review"
      ? isIsoTimestamp(submission.submitted_at) &&
        submission.submitted_at === submission.updated_at
      : submission.submitted_at === null;
  const acceptedAtValid =
    contract.history.snapshotStatus === "ready_for_export"
      ? isIsoTimestamp(submission.accepted_at) &&
        submission.accepted_at === submission.updated_at
      : submission.accepted_at === null;
  return submittedAtValid && acceptedAtValid;
}

function submissionPayloadMismatchCode(
  submission: JsonRecord,
  contract: ProductionDraftPayloadMutationContract,
) {
  if (!exactRecordKeys(submission, submissionPayloadKeys)) return "shape";
  const expectedStaticContentDigest =
    contract.submissionProjection?.mode === "replace_readiness_percent"
      ? contract.submissionProjection.expectedStaticContentDigest
      : contract.draft.submission.staticContentDigest;
  if (
    productionDraftSubmissionStaticContentDigest(submission) !==
    expectedStaticContentDigest
  ) {
    return contract.submissionProjection ? "static_projection" : "static";
  }
  const expectedStatus =
    contract.history.snapshotStatus === "returned"
      ? "returned"
      : contract.history.snapshotStatus === "ready_for_export"
        ? "ready_for_excel"
        : "waiting_review";
  if (submission.status !== expectedStatus) return "status";
  if (
    submission.priority !==
    (expectedStatus === "returned" ? "Высокий" : "Средний")
  ) {
    return "priority";
  }
  if (submission.appointment_status !== "not_started") return "appointment";
  if (submission.review_started_at !== null) return "review_started";
  if (submission.exported_at !== null) return "exported_at";
  if (!timestampFallsWithinWindow(submission.updated_at, contract.timestampWindow)) {
    return "updated_at";
  }
  if (contract.history.snapshotStatus === "submitted_for_review") {
    return isIsoTimestamp(submission.submitted_at) &&
      submission.submitted_at === submission.updated_at
      ? "match"
      : "submitted_at";
  }
  if (submission.submitted_at !== null) return "submitted_at";
  if (contract.history.snapshotStatus === "ready_for_export") {
    return isIsoTimestamp(submission.accepted_at) &&
      submission.accepted_at === submission.updated_at
      ? "match"
      : "accepted_at";
  }
  return submission.accepted_at === null ? "match" : "accepted_at";
}

function questionnaireValueStructureDigest(value: unknown) {
  const envelope = jsonRecord(value);
  if (envelope?.kind !== "v19_questionnaire_field") {
    return productionDraftValueDigest("__V19_QUESTIONNAIRE_VALUE__");
  }
  const normalized = canonicalClone(envelope);
  if (!normalized || !("value" in normalized)) return null;
  normalized.value = "__V19_QUESTIONNAIRE_VALUE__";
  return productionDraftValueDigest(normalized);
}

export function productionDraftQuestionnaireValueIdentity(value: unknown) {
  const logicalValueDigest = productionDraftValueDigest(questionnaireLogicalValue(value));
  const valueDigest = productionDraftValueDigest(value);
  const valueStructureDigest = questionnaireValueStructureDigest(value);
  return logicalValueDigest && valueDigest && valueStructureDigest
    ? { logicalValueDigest, valueDigest, valueStructureDigest }
    : null;
}

function answerPayloadIdentity(value: JsonRecord) {
  if (!exactRecordKeys(value, questionnaireAnswerPayloadKeys)) return null;
  const submissionId = text(value.submission_id);
  const applicantId = text(value.applicant_id);
  const sectionId = text(value.section_id);
  const fieldId = text(value.field_id);
  const labelDigest = productionDraftValueDigest(value.label);
  const valueIdentity = productionDraftQuestionnaireValueIdentity(value.value);
  const updatedBy = text(value.updated_by);
  return submissionId && applicantId && sectionId && fieldId && labelDigest && valueIdentity && updatedBy
    ? {
        applicantId,
        fieldId,
        labelDigest,
        logicalValueDigest: valueIdentity.logicalValueDigest,
        sectionId,
        submissionId,
        updatedBy,
        valueDigest: valueIdentity.valueDigest,
        valueStructureDigest: valueIdentity.valueStructureDigest,
      }
    : null;
}

function questionnaireAnswersMatch(
  actualRows: readonly JsonRecord[],
  contract: ProductionDraftPayloadMutationContract,
) {
  if (actualRows.length !== contract.draft.questionnaireAnswers.length) return false;
  const actualByKey = new Map<string, ReturnType<typeof answerPayloadIdentity>>();
  for (const row of actualRows) {
    const identity = answerPayloadIdentity(row);
    if (!identity) return false;
    const key = identityKey(
      identity.submissionId,
      identity.applicantId,
      identity.sectionId,
      identity.fieldId,
    );
    if (actualByKey.has(key)) return false;
    actualByKey.set(key, identity);
  }

  let replacementCount = 0;
  const questionnaire = contract.questionnaire;
  const projection = contract.questionnaireProjection;
  const projectedByKey = new Map(
    (projection?.answers ?? []).map((answer) => [
      identityKey(
        answer.submissionId,
        answer.applicantId,
        answer.sectionId,
        answer.fieldId,
      ),
      answer,
    ]),
  );
  if (
    projection?.mode === "replace_exact" &&
    (projectedByKey.size !== contract.draft.questionnaireAnswers.length ||
      projection.answers.length !== contract.draft.questionnaireAnswers.length)
  ) {
    return false;
  }
  for (const expected of contract.draft.questionnaireAnswers) {
    const key = identityKey(
      expected.submissionId,
      expected.applicantId,
      expected.sectionId,
      expected.fieldId,
    );
    const actual = actualByKey.get(key);
    const projected = projectedByKey.get(key) ?? expected;
    if (
      !actual ||
      actual.labelDigest !== projected.labelDigest ||
      actual.updatedBy !== contract.history.actorId
    ) {
      return false;
    }
    const isReplacement =
      questionnaire.mode === "replace" &&
      expected.applicantId === questionnaire.applicantId &&
      expected.sectionId === questionnaire.sectionId &&
      expected.fieldId === questionnaire.fieldId;
    if (isReplacement) {
      replacementCount += 1;
      if (
        actual.valueStructureDigest !== projected.valueStructureDigest ||
        (questionnaire.mode === "replace" &&
          actual.logicalValueDigest !== questionnaire.expectedValueDigest) ||
        (projection?.mode === "replace_exact" &&
          actual.valueDigest !== projected.valueDigest)
      ) {
        return false;
      }
    } else if (actual.valueDigest !== projected.valueDigest) {
      return false;
    }
  }
  return questionnaire.mode === "exact" || replacementCount === 1;
}

type ExpectedCorrectionIdentity = Omit<
  ProductionDraftCorrectionIdentity,
  "createdAt" | "fixedAt"
> & {
  createdAt: "action" | string;
  fixedAt: "action" | string | null;
};

function correctionKey(value: ExpectedCorrectionIdentity) {
  return identityKey(
    value.id,
    value.submissionId,
    value.applicantId,
    value.scope,
    value.fieldKey,
    value.mediaType,
    value.reasonDigest,
    value.severity,
    value.status,
  );
}

type CorrectionPayloadRecord = {
  createdAt: string;
  createdBy: string;
  fixedAt: string | null;
  key: string;
};

function correctionPayloadRecord(value: JsonRecord): CorrectionPayloadRecord | null {
  if (!exactRecordKeys(value, correctionPayloadKeys)) return null;
  const id = text(value.id);
  const submissionId = text(value.submission_id);
  const applicantId = nullableText(value.applicant_id);
  const scope = text(value.scope);
  const fieldKey = nullableText(value.field_key);
  const mediaType = nullableText(value.media_type);
  const reasonDigest = productionDraftValueDigest(value.reason);
  const severity = text(value.severity);
  const status = text(value.status);
  const createdBy = text(value.created_by);
  const createdAt = text(value.created_at);
  if (
    !id ||
    !submissionId ||
    applicantId === undefined ||
    !scope ||
    fieldKey === undefined ||
    mediaType === undefined ||
    !reasonDigest ||
    !severity ||
    !status ||
    !createdBy ||
    !isIsoTimestamp(createdAt)
  ) {
    return null;
  }
  const fixedAt = value.fixed_at;
  if (
    (status === "open" && fixedAt !== null) ||
    ((status === "fixed" || status === "closed") && !isIsoTimestamp(fixedAt))
  ) {
    return null;
  }
  return {
    createdAt,
    createdBy,
    fixedAt: fixedAt === null ? null : (fixedAt as string),
    key: identityKey(
      id,
      submissionId,
      applicantId,
      scope,
      fieldKey,
      mediaType,
      reasonDigest,
      severity,
      status,
    ),
  };
}

type ExpectedStatusHistoryPayload = {
  changedAt: "action" | string;
  changedBy: string;
  commentDigest: string;
  entityId: string;
  entityType: "submission";
  fromStatus: string | null;
  id: string;
  noteDigest: string | null;
  source: "admin" | "agent";
  toStatus: string;
};

function historyPayloadKey(value: ExpectedStatusHistoryPayload) {
  return identityKey(
    value.id,
    value.entityType,
    value.entityId,
    value.fromStatus,
    value.toStatus,
    value.source,
    value.commentDigest,
    value.noteDigest,
    value.changedBy,
  );
}

type StatusHistoryPayloadRecord = Omit<ExpectedStatusHistoryPayload, "changedAt"> & {
  changedAt: string;
};

function historyPayloadRecord(value: JsonRecord): StatusHistoryPayloadRecord | null {
  if (!exactRecordKeys(value, statusHistoryPayloadKeys)) return null;
  const id = text(value.id);
  const entityType = text(value.entity_type);
  const entityId = text(value.entity_id);
  const fromStatus = nullableText(value.from_status);
  const toStatus = text(value.to_status);
  const source = text(value.source);
  const commentDigest = productionDraftValueDigest(value.comment);
  const noteDigest = value.note === null ? null : productionDraftValueDigest(value.note);
  const changedBy = text(value.changed_by);
  const changedAt = text(value.changed_at);
  if (
    !id ||
    entityType !== "submission" ||
    !entityId ||
    fromStatus === undefined ||
    !toStatus ||
    (source !== "admin" && source !== "agent") ||
    !commentDigest ||
    noteDigest === null && value.note !== null ||
    !changedBy ||
    !isIsoTimestamp(changedAt)
  ) {
    return null;
  }
  return {
    changedAt,
    changedBy,
    commentDigest,
    entityId,
    entityType,
    fromStatus,
    id,
    noteDigest,
    source,
    toStatus,
  };
}

function expectedHistoryPayload(
  contract: ProductionDraftPayloadMutationContract,
): ExpectedStatusHistoryPayload[] {
  if (contract.historyProjection?.mode === "replace_exact") {
    return contract.historyProjection.rows.map((row) => ({ ...row }));
  }
  const expected = contract.draft.statusHistory
    .filter((item) => item.source === contract.history.actorSource)
    .map((item) => ({
      changedAt: item.changedAt,
      changedBy: contract.history.actorId,
      commentDigest: item.commentDigest,
      entityId: item.entityId,
      entityType: item.entityType,
      fromStatus: item.fromStatus,
      id: productionDraftHistoryPayloadId(contract.submissionId, item.id),
      noteDigest: item.noteDigest,
      source: contract.history.actorSource,
      toStatus: item.toStatus,
    }));
  const transition = contract.history.transition;
  if (!transition) return expected;
  const commentDigest = productionDraftValueDigest(transition.comment);
  const noteDigest =
    transition.note === null
      ? null
      : productionDraftValueDigest(transition.note);
  if (!commentDigest || (transition.note !== null && !noteDigest)) return [];
  return [
    ...expected,
    {
      changedAt: "action",
      changedBy: contract.history.actorId,
      commentDigest,
      entityId: contract.submissionId,
      entityType: "submission",
      fromStatus: transition.fromStatus,
      id: productionDraftStableUuid(
        `history:${contract.submissionId}:и-${contract.submissionId}-${transition.fromStatus}-${transition.toStatus}-${contract.draft.effectiveHistoryCount + 1}`,
      ),
      noteDigest,
      source: contract.history.actorSource,
      toStatus: transition.toStatus,
    },
  ];
}

function expectedCorrections(
  contract: ProductionDraftPayloadMutationContract,
): ExpectedCorrectionIdentity[] | null {
  const markerRows = contract.draft.corrections.filter((item) => item.targetMarker);
  if (contract.correction.mode === "exact") return [...contract.draft.corrections];
  if (contract.correction.mode === "existing") {
    if (markerRows.length !== 1) return null;
    return contract.draft.corrections.map((item) =>
      item.targetMarker
        ? {
            ...item,
            fixedAt:
              item.status === contract.correction.status
                ? item.fixedAt
                : "action",
            status: contract.correction.status,
          }
        : item,
    );
  }
  if (markerRows.length !== 0) return null;
  const applicantId =
    contract.correction.applicantId ??
    (contract.draft.applicants.length === 1
      ? contract.draft.applicants[0]!.id
      : null);
  const fieldKey = contract.correction.fieldKey ?? "Примечание";
  const baseReason =
    contract.correction.baseReason ?? "Требуется исправить поле «Примечание»";
  if (
    !applicantId ||
    !contract.draft.applicants.some((applicant) => applicant.id === applicantId)
  ) {
    return null;
  }
  const reasonDigest = productionDraftValueDigest(
    `${baseReason} — ${contract.correction.reasonIncludes}`,
  );
  if (!reasonDigest) return null;
  return [
    ...contract.draft.corrections,
    {
      applicantId,
      createdAt: "action",
      fieldKey,
      fixedAt: null,
      id: productionDraftStableUuid(
        `correction:${contract.submissionId}:зм-${contract.submissionId}-новое-${contract.draft.snapshotIssueCount + 1}`,
      ),
      mediaType: null,
      reasonDigest,
      scope: "field",
      severity: "blocking",
      status: "open",
      submissionId: contract.submissionId,
      targetMarker: true,
    },
  ];
}

function snapshotStatusForCorrection(status: ExpectedCorrectionIdentity["status"]) {
  return status === "open"
    ? "open"
    : status === "fixed"
      ? "fixed_by_agent"
      : "closed_by_admin";
}

function snapshotIssuesMatchDraft(
  familyIntelligence: unknown,
  contract: ProductionDraftPayloadMutationContract,
  expectedCorrections: readonly ExpectedCorrectionIdentity[],
) {
  const actual = productionDraftSnapshotIssueIdentities(familyIntelligence);
  if (
    !actual ||
    actual.length !== contract.draft.snapshotIssues.length ||
    expectedCorrections.length !== contract.draft.snapshotIssues.length
  ) {
    return false;
  }
  const actualById = new Map(actual.map((issue) => [issue.id, issue]));
  const correctionsById = new Map(expectedCorrections.map((item) => [item.id, item]));
  if (
    actualById.size !== actual.length ||
    correctionsById.size !== expectedCorrections.length
  ) {
    return false;
  }

  return contract.draft.snapshotIssues.every((baseline) => {
    const actualIssue = actualById.get(baseline.id);
    const correction = correctionsById.get(
      productionDraftStableUuid(`correction:${contract.submissionId}:${baseline.id}`),
    );
    if (!actualIssue || !correction) return false;
    const expectedStatus = snapshotStatusForCorrection(correction.status);
    if (actualIssue.status !== expectedStatus) return false;
    return expectedStatus === baseline.status
      ? actualIssue.contentDigest === baseline.contentDigest
      : actualIssue.withoutStatusDigest === baseline.withoutStatusDigest;
  });
}

function correctionPayloadTimestampsMatch(
  actual: readonly CorrectionPayloadRecord[],
  expected: readonly ExpectedCorrectionIdentity[],
  contract: ProductionDraftPayloadMutationContract,
) {
  const actualByKey = new Map(actual.map((item) => [item.key, item]));
  if (actualByKey.size !== actual.length) return false;
  for (const expectedItem of expected) {
    const item = actualByKey.get(correctionKey(expectedItem));
    if (!item || item.createdBy !== contract.history.actorId) return false;
    const createdAtValid =
      expectedItem.createdAt === "action"
        ? timestampFallsWithinWindow(item.createdAt, contract.timestampWindow)
        : timestampMatchesBaselineOrAction(
            item.createdAt,
            expectedItem.createdAt,
            contract.timestampWindow,
          );
    const fixedAtValid =
      expectedItem.fixedAt === null
        ? item.fixedAt === null
        : expectedItem.fixedAt === "action"
          ? timestampFallsWithinWindow(item.fixedAt, contract.timestampWindow)
          : timestampMatchesBaselineOrAction(
              item.fixedAt,
              expectedItem.fixedAt,
              contract.timestampWindow,
            );
    if (!createdAtValid || !fixedAtValid) return false;
  }
  return true;
}

function statusHistoryPayloadTimestampsMatch(
  actual: readonly StatusHistoryPayloadRecord[],
  expected: readonly ExpectedStatusHistoryPayload[],
  contract: ProductionDraftPayloadMutationContract,
) {
  const actualByKey = new Map(actual.map((item) => [historyPayloadKey(item), item]));
  if (actualByKey.size !== actual.length) return false;
  return expected.every((expectedItem) => {
    const item = actualByKey.get(historyPayloadKey(expectedItem));
    return Boolean(
      item &&
        (expectedItem.changedAt === "action"
          ? timestampFallsWithinWindow(item.changedAt, contract.timestampWindow)
          : timestampMatches(item.changedAt, expectedItem.changedAt)),
    );
  });
}

function snapshotMediaType(value: unknown) {
  const type = text(value);
  if (!type) return null;
  return type === "selfie_1" ? "selfie" : type;
}

/**
 * Binds the complete persisted issue model. A lifecycle transition may change
 * only the source-owned status; target, creator, timestamp, and snapshot stay
 * bound by the status-free digest.
 */
export function productionDraftSnapshotIssueIdentities(value: unknown) {
  const canonical = canonicalSnapshot(value);
  const issues = canonical && recordArray(canonical.snapshot.issues);
  if (!canonical || !issues) return null;

  const identities: ProductionDraftSnapshotIssueIdentity[] = [];
  const ids = new Set<string>();
  for (const issue of issues) {
    const id = text(issue.id);
    const status = issue.status;
    const contentDigest = productionDraftValueDigest(issue);
    const withoutStatus = canonicalClone(issue);
    if (
      !id ||
      ids.has(id) ||
      (status !== "open" && status !== "fixed_by_agent" && status !== "closed_by_admin") ||
      !contentDigest ||
      !withoutStatus
    ) {
      return null;
    }
    delete withoutStatus.status;
    const withoutStatusDigest = productionDraftValueDigest(withoutStatus);
    if (!withoutStatusDigest) return null;
    ids.add(id);
    identities.push({ contentDigest, id, status, withoutStatusDigest });
  }
  return identities;
}

function normalizedHistorySource(value: unknown): "admin" | "agent" | "bb" | "system" {
  return value === "admin" || value === "agent" || value === "bb" || value === "system"
    ? value
    : "system";
}

function canonicalHistoryStatus(value: unknown) {
  const normalized = normalizeLegacySubmissionStatus(value);
  return normalized.ok ? normalized.data : null;
}

function snapshotHistoryMatchKey(value: JsonRecord) {
  return `${text(value.fromStatus) ?? ""}:${text(value.toStatus) ?? ""}:${text(value.source) ?? ""}:${text(value.note) ?? ""}`;
}

function normalizedSnapshotHistoryContentDigest(value: JsonRecord) {
  if (
    ("at" in value && !isSnapshotTimestamp(value.at)) ||
    ("createdAt" in value && !isSnapshotTimestamp(value.createdAt))
  ) {
    return null;
  }
  return productionDraftValueDigest(value);
}

function snapshotHistoryIdentity(
  value: JsonRecord,
): ProductionDraftSnapshotHistoryIdentity | null {
  const id = text(value.id);
  const fromStatus = nullableText(value.fromStatus);
  const toStatus = text(value.toStatus);
  const source = text(value.source);
  const textValue = text(value.text);
  const detail = nullableText(value.detail);
  const noteDigest =
    value.note === undefined || value.note === null
      ? null
      : productionDraftValueDigest(value.note);
  const commentDigest = productionDraftValueDigest(
    textValue === null ? undefined : detail ? `${textValue} — ${detail}` : textValue,
  );
  const contentDigest = normalizedSnapshotHistoryContentDigest(value);
  return (
    id &&
    fromStatus !== undefined &&
    toStatus &&
    (source === "admin" || source === "agent" || source === "bb" || source === "system") &&
    commentDigest &&
    contentDigest
      ? { commentDigest, contentDigest, fromStatus, id, noteDigest, source, toStatus }
      : null
  );
}

function snapshotHistoryIdentityKey(value: ProductionDraftSnapshotHistoryIdentity) {
  return identityKey(
    value.id,
    value.fromStatus,
    value.toStatus,
    value.source,
    value.commentDigest,
    value.noteDigest,
    value.contentDigest,
  );
}

function snapshotHistorySemanticKey(value: JsonRecord) {
  const identity = snapshotHistoryIdentity(value);
  return identity ? snapshotHistoryIdentityKey(identity) : null;
}

/** Exact, value-free semantic projection of the serializer-owned snapshot history. */
export function productionDraftSnapshotHistoryProjection(value: unknown) {
  const canonical = canonicalSnapshot(value);
  const history = canonical && recordArray(canonical.snapshot.history);
  if (!canonical || !history) return null;
  const typed: ProductionDraftSnapshotHistoryIdentity[] = [];
  const untypedDigests: string[] = [];
  for (const item of history) {
    const identity = snapshotHistoryIdentity(item);
    if (identity) typed.push(identity);
    else {
      const digest = normalizedSnapshotHistoryContentDigest(item);
      if (!digest) return null;
      untypedDigests.push(digest);
    }
  }
  return { typed, untypedDigests };
}

/** Mirrors attachDurableStatusHistoryRows without retaining raw snapshot content. */
export function productionDraftEffectiveSnapshotHistory(input: {
  familyIntelligence: unknown;
  statusHistory: readonly unknown[];
}) {
  const canonical = canonicalSnapshot(input.familyIntelligence);
  const snapshotHistory = canonical && recordArray(canonical.snapshot.history);
  if (!canonical || !snapshotHistory) return null;

  const durableHistory = input.statusHistory
    .map((rawRow) => {
      const row = jsonRecord(rawRow);
      if (!row || row.entity_type !== "submission") return null;
      const id = text(row.id);
      const entityId = text(row.entity_id);
      const changedBy = text(row.changed_by);
      const changedAt = text(row.changed_at);
      const comment = text(row.comment);
      const toStatus = canonicalHistoryStatus(row.to_status);
      const fromStatus = canonicalHistoryStatus(row.from_status);
      if (!id || !entityId || !changedBy || !changedAt || !comment || !toStatus) return null;
      const item: JsonRecord = {
        actorId: changedBy,
        at: changedAt,
        createdAt: changedAt,
        id,
        source: normalizedHistorySource(row.source),
        text: comment,
        toStatus,
      };
      if (fromStatus) item.fromStatus = fromStatus;
      const note = typeof row.note === "string" ? row.note.trim() : "";
      if (note) item.note = note;
      return { changedAt, item };
    })
    .filter(
      (entry): entry is { changedAt: string; item: JsonRecord } => Boolean(entry),
    )
    .sort((left, right) => right.changedAt.localeCompare(left.changedAt));

  const durableKeys = new Set(
    durableHistory.map((entry) => snapshotHistoryMatchKey(entry.item)),
  );
  const effectiveHistory =
    durableHistory.length === 0
      ? snapshotHistory
      : [
          ...durableHistory.map((entry) => entry.item),
          ...snapshotHistory.filter((item) => {
            const fromStatus = text(item.fromStatus);
            const toStatus = text(item.toStatus);
            if (!fromStatus || !toStatus) return true;
            return !durableKeys.has(snapshotHistoryMatchKey(item));
          }),
        ];

  const typed: ProductionDraftSnapshotHistoryIdentity[] = [];
  const untypedDigests: string[] = [];
  for (const item of effectiveHistory) {
    const identity = snapshotHistoryIdentity(item);
    if (identity) typed.push(identity);
    else {
      const digest = normalizedSnapshotHistoryContentDigest(item);
      if (!digest) return null;
      untypedDigests.push(digest);
    }
  }
  return {
    effectiveHistoryCount: effectiveHistory.length,
    snapshotHistory: typed,
    snapshotUntypedHistoryDigests: untypedDigests,
  };
}

function expectedSnapshotHistoryKeys(
  contract: ProductionDraftPayloadMutationContract,
) {
  if (contract.snapshotHistoryProjection) {
    return contract.snapshotHistoryProjection.typed.map(snapshotHistoryIdentityKey);
  }
  const base = contract.draft.snapshotHistory.map(snapshotHistoryIdentityKey);
  const transition = contract.history.transition;
  if (!transition) return base;
  const transitionIdentity = snapshotHistoryIdentity({
    actorId: contract.history.actorId,
    at: "сейчас",
    createdAt: "сейчас",
    fromStatus: transition.fromStatus,
    id: `и-${contract.submissionId}-${transition.fromStatus}-${transition.toStatus}-${contract.draft.effectiveHistoryCount + 1}`,
    note: transition.note,
    source: contract.history.actorSource,
    text: transition.comment,
    toStatus: transition.toStatus,
  });
  return transitionIdentity
    ? [...base, snapshotHistoryIdentityKey(transitionIdentity)]
    : [];
}

function expectedSnapshotUntypedHistoryDigests(
  contract: ProductionDraftPayloadMutationContract,
) {
  if (contract.snapshotHistoryProjection) {
    return [...contract.snapshotHistoryProjection.untypedDigests];
  }
  const base = [...contract.draft.snapshotUntypedHistoryDigests];
  const mutation = contract.snapshotMutation;
  if (!mutation) return base;
  const digest = normalizedSnapshotHistoryContentDigest({
    at: "сейчас",
    id: mutation.untypedHistory.id,
    source: mutation.untypedHistory.source,
    text: mutation.untypedHistory.text,
  });
  return digest ? [...base, digest] : [];
}

type SnapshotDraftPayloadInput = {
  applicants: readonly JsonRecord[];
  corrections: readonly JsonRecord[];
  expectedCorrections: readonly ExpectedCorrectionIdentity[];
  history: readonly JsonRecord[];
  media: readonly JsonRecord[];
  payloadSubmission: JsonRecord;
  questionnaireAnswers: readonly JsonRecord[];
  contract: ProductionDraftPayloadMutationContract;
};

function snapshotDraftPayloadMismatchCode(
  input: SnapshotDraftPayloadInput,
): string | null {
  const canonical = canonicalSnapshot(input.payloadSubmission.family_intelligence);
  if (!canonical) return "shape";
  const { snapshot } = canonical;
  if (
    snapshot?.id !== input.contract.submissionId ||
    snapshot.agentId !== input.contract.ownerId ||
    snapshot.status !== input.contract.history.snapshotStatus
  ) {
    return "identity";
  }
  const snapshotTimestampValid = input.contract.timestampWindow
    ? input.contract.snapshotProjection?.updatedAtMode === "action_iso"
      ? typeof snapshot.updatedAt === "string" &&
        timestampFallsWithinWindow(
          snapshot.updatedAt,
          input.contract.timestampWindow,
        )
      : snapshot.updatedAt === "сейчас"
    : isSnapshotTimestamp(snapshot.updatedAt);
  if (!snapshotTimestampValid) {
    return "timestamp";
  }
  if (input.contract.mode === "export") {
    const exportPackage = jsonRecord(snapshot.exportPackage);
    if (
      snapshot.exportState !== "file_downloaded" ||
      !exportPackage ||
      !exactRecordKeys(exportPackage, [
        "contentFingerprint",
        "fileName",
        "format",
        "idempotencyKey",
        "rowCount",
        "submissionIds",
      ]) ||
      exportPackage.format !== "xlsx" ||
      exportPackage.rowCount !== 1 ||
      !exactIdentitySet(
        Array.isArray(exportPackage.submissionIds)
          ? exportPackage.submissionIds.filter(
              (value): value is string => typeof value === "string",
            )
          : [],
        [input.contract.submissionId],
      ) ||
      typeof exportPackage.contentFingerprint !== "string" ||
      typeof exportPackage.fileName !== "string" ||
      typeof exportPackage.idempotencyKey !== "string"
    ) {
      return "export_package";
    }
  }

  const snapshotApplicants = recordArray(snapshot.applicants);
  if (!snapshotApplicants) return "applicant_shape";
  const expectedApplicantIds = input.applicants.map((item) => text(item.id)).filter(
    (item): item is string => Boolean(item),
  );
  const actualApplicantIds = snapshotApplicants
    .map((item) => text(item.id))
    .filter((item): item is string => Boolean(item));
  if (!exactIdentitySet(actualApplicantIds, expectedApplicantIds)) {
    return "applicant_identity";
  }

  const expectedAnswerKeys = input.questionnaireAnswers.map((answer) => {
    const identity = answerPayloadIdentity(answer);
    return identity
      ? identityKey(
          identity.applicantId,
          identity.sectionId,
          identity.fieldId,
          identity.labelDigest,
          identity.logicalValueDigest,
        )
      : null;
  });
  if (expectedAnswerKeys.some((key) => key === null)) return "answer_payload";
  const actualAnswerKeys: string[] = [];
  for (const applicant of snapshotApplicants) {
    const applicantId = text(applicant.id);
    const sections = recordArray(applicant.sections);
    if (!applicantId || !sections) return "answer_shape";
    for (const section of sections) {
      const sectionId = text(section.id);
      const fields = recordArray(section.fields);
      if (!sectionId || !fields) return "answer_shape";
      for (const field of fields) {
        const fieldId = text(field.id);
        const labelDigest = productionDraftValueDigest(field.label);
        const valueDigest = productionDraftValueDigest(field.value);
        if (!fieldId || !labelDigest || !valueDigest) return "answer_shape";
        actualAnswerKeys.push(
          identityKey(applicantId, sectionId, fieldId, labelDigest, valueDigest),
        );
      }
    }
  }
  if (!exactIdentitySet(actualAnswerKeys, expectedAnswerKeys as string[])) {
    return "answers";
  }

  const snapshotFiles = recordArray(snapshot.files);
  if (!snapshotFiles) return "file_shape";
  const expectedFiles = input.media.map((media) => {
    const applicantId = text(media.applicant_id);
    const type = text(media.type);
    const bucket = text(media.storage_bucket);
    const pathDigest = productionDraftValueDigest(media.storage_path);
    return applicantId && type && bucket && pathDigest
      ? identityKey(applicantId, type, bucket, pathDigest)
      : null;
  });
  const actualFiles = snapshotFiles.map((file) => {
    const applicantId = text(file.applicantId);
    const type = snapshotMediaType(file.type);
    const bucket = text(file.storageBucket);
    const pathDigest = productionDraftValueDigest(file.storagePath);
    return applicantId && type && bucket && pathDigest
      ? identityKey(applicantId, type, bucket, pathDigest)
      : null;
  });
  if (
    expectedFiles.some((key) => key === null) ||
    actualFiles.some((key) => key === null) ||
    !exactIdentitySet(actualFiles as string[], expectedFiles as string[])
  ) {
    return "files";
  }

  if (
    !input.contract.snapshotMutation &&
    !snapshotIssuesMatchDraft(
      input.payloadSubmission.family_intelligence,
      input.contract,
      input.expectedCorrections,
    )
  ) {
    return "issues";
  }

  const snapshotHistory = recordArray(snapshot.history);
  if (!snapshotHistory) return "history_shape";
  const actualHistory: string[] = [];
  const actualUntypedHistoryDigests: string[] = [];
  for (const item of snapshotHistory) {
    const key = snapshotHistorySemanticKey(item);
    if (key) actualHistory.push(key);
    else {
      const digest = normalizedSnapshotHistoryContentDigest(item);
      if (!digest) return "history_shape";
      actualUntypedHistoryDigests.push(digest);
    }
  }
  const expectedHistory = expectedSnapshotHistoryKeys(input.contract);
  if (!exactIdentityMultiset(actualHistory, expectedHistory)) {
    return "history_typed";
  }
  if (
    !exactIdentityMultiset(
      actualUntypedHistoryDigests,
      expectedSnapshotUntypedHistoryDigests(input.contract),
    )
  ) {
    return "history_untyped";
  }
  const contentMatches = input.contract.snapshotMutation
    ? productionDraftSnapshotFullContentDigest(
        input.payloadSubmission.family_intelligence,
      ) === input.contract.snapshotMutation.expectedContentDigest
    : productionDraftSnapshotContentDigest(
          input.payloadSubmission.family_intelligence,
          input.contract.mode,
          {
            normalizeFileReviewTimestamps: Boolean(
              input.contract.mediaProjection,
            ),
          },
        ) ===
        (input.contract.snapshotProjection && input.contract.mode === "lifecycle"
          ? input.contract.snapshotProjection.expectedLifecycleContentDigest
          : input.contract.mode === "export"
            ? input.contract.draft.snapshot.exportContentDigest
            : input.contract.draft.snapshot.lifecycleContentDigest);
  return contentMatches ? null : "content";
}

function snapshotMatchesDraftPayload(input: SnapshotDraftPayloadInput) {
  return snapshotDraftPayloadMismatchCode(input) === null;
}

/**
 * Exact nested-draft gate shared by lifecycle and export. It deliberately
 * evaluates browser request JSON only in memory and returns a boolean so raw
 * submission data cannot reach logs, checkpoints, or evidence.
 */
export function productionDraftPayloadMatches(
  payload: JsonRecord,
  contract: ProductionDraftPayloadMutationContract,
) {
  if (!exactRecordKeys(payload, draftPayloadKeys)) return false;
  const submission = jsonRecord(payload.submission);
  const applicants = recordArray(payload.applicants);
  const media = recordArray(payload.media_assets);
  const questionnaireAnswers = recordArray(payload.questionnaire_answers);
  const corrections = recordArray(payload.corrections);
  const history = recordArray(payload.status_history);
  const expectedCorrectionRows = expectedCorrections(contract);
  if (
    !submission ||
    submission.id !== contract.submissionId ||
    submission.agent_id !== contract.ownerId ||
    !submissionPayloadMatchesContract(submission, contract) ||
    !applicants ||
    !media ||
    !questionnaireAnswers ||
    !corrections ||
    !history ||
    !expectedCorrectionRows
  ) {
    return false;
  }

  const expectedHistoryRows = expectedHistoryPayload(contract);
  const mediaKeys = media.map(mediaPayloadKey);
  const correctionRecords = corrections.map(correctionPayloadRecord);
  const historyRecords = history.map(historyPayloadRecord);
  const correctionKeys = correctionRecords.map((record) => record?.key ?? null);
  const historyKeys = historyRecords.map((record) =>
    record ? historyPayloadKey(record) : null,
  );
  if (
    mediaKeys.some((key) => key === null) ||
    correctionKeys.some((key) => key === null) ||
    historyKeys.some((key) => key === null)
  ) {
    return false;
  }

  if (
    !applicantsMatch(applicants, contract) ||
    !mediaRowsMatch(media, contract) ||
    !questionnaireAnswersMatch(questionnaireAnswers, contract) ||
    !exactIdentitySet(
      correctionKeys as string[],
      expectedCorrectionRows.map(correctionKey),
    ) ||
    !exactIdentityMultiset(
      historyKeys as string[],
      expectedHistoryRows.map(historyPayloadKey),
    ) ||
    !correctionPayloadTimestampsMatch(
      correctionRecords as CorrectionPayloadRecord[],
      expectedCorrectionRows,
      contract,
    ) ||
    !statusHistoryPayloadTimestampsMatch(
      historyRecords as StatusHistoryPayloadRecord[],
      expectedHistoryRows,
      contract,
    )
  ) {
    return false;
  }

  return snapshotMatchesDraftPayload({
    applicants,
    contract,
    corrections,
    expectedCorrections: expectedCorrectionRows,
    history,
    media,
    payloadSubmission: submission,
    questionnaireAnswers,
  });
}

/**
 * Parses a browser-owned RPC body only in memory and returns a boolean so
 * production request payloads never appear in diagnostics or evidence.
 */
export function productionLifecycleMutationPayloadMatches(
  body: string | null,
  contract: ProductionLifecycleMutationContract,
) {
  if (!body) return false;
  try {
    const request = jsonRecord(JSON.parse(body));
    if (!request || !exactRecordKeys(request, ["payload"])) return false;
    const payload = jsonRecord(request?.payload);
    const submission = jsonRecord(payload?.submission);
    if (
      submission?.id !== contract.submissionId ||
      submission.agent_id !== contract.ownerId ||
      submission.status !== contract.submissionStatus
    ) {
      return false;
    }
    return payload !== null && productionDraftPayloadMatches(payload, contract);
  } catch {
    return false;
  }
}

/**
 * Returns only a structural mismatch category. Raw production payload values
 * remain browser-memory-only and are never included in diagnostics.
 */
export function productionLifecycleMutationPayloadMismatchCode(
  body: string | null,
  contract: ProductionLifecycleMutationContract,
) {
  if (!body) return "body_absent";
  try {
    const request = jsonRecord(JSON.parse(body));
    if (!request || !exactRecordKeys(request, ["payload"])) {
      return "request_shape";
    }
    const payload = jsonRecord(request.payload);
    if (!payload || !exactRecordKeys(payload, draftPayloadKeys)) {
      return "payload_shape";
    }
    const submission = jsonRecord(payload.submission);
    const applicants = recordArray(payload.applicants);
    const media = recordArray(payload.media_assets);
    const questionnaireAnswers = recordArray(payload.questionnaire_answers);
    const corrections = recordArray(payload.corrections);
    const history = recordArray(payload.status_history);
    const expectedCorrectionRows = expectedCorrections(contract);
    if (!submission) return "submission_shape";
    if (
      submission.id !== contract.submissionId ||
      submission.agent_id !== contract.ownerId ||
      submission.status !== contract.submissionStatus
    ) {
      return "submission_identity";
    }
    if (!submissionPayloadMatchesContract(submission, contract)) {
      return `submission_${submissionPayloadMismatchCode(submission, contract)}`;
    }
    if (
      !applicants ||
      !media ||
      !questionnaireAnswers ||
      !corrections ||
      !history
    ) {
      return "nested_shape";
    }
    if (!expectedCorrectionRows) return "expected_corrections";
    if (!applicantsMatch(applicants, contract)) {
      return `applicants_${applicantPayloadMismatchCode(applicants, contract)}`;
    }

    if (!mediaRowsMatch(media, contract)) {
      return "media";
    }
    if (!questionnaireAnswersMatch(questionnaireAnswers, contract)) {
      return "questionnaire";
    }

    const correctionRecords = corrections.map(correctionPayloadRecord);
    const correctionKeys = correctionRecords.map((record) => record?.key ?? null);
    if (
      correctionKeys.some((key) => key === null) ||
      !exactIdentitySet(
        correctionKeys as string[],
        expectedCorrectionRows.map(correctionKey),
      )
    ) {
      return "corrections";
    }
    if (
      !correctionPayloadTimestampsMatch(
        correctionRecords as CorrectionPayloadRecord[],
        expectedCorrectionRows,
        contract,
      )
    ) {
      return "correction_timestamps";
    }

    const expectedHistoryRows = expectedHistoryPayload(contract);
    const historyRecords = history.map(historyPayloadRecord);
    const historyKeys = historyRecords.map((record) =>
      record ? historyPayloadKey(record) : null,
    );
    if (historyKeys.some((key) => key === null)) return "history_shape";
    if (historyKeys.length !== expectedHistoryRows.length) {
      return `history_count_${historyKeys.length}_${expectedHistoryRows.length}`;
    }
    const typedHistoryRecords = historyRecords as StatusHistoryPayloadRecord[];
    const actualHistoryById = new Map(
      typedHistoryRecords.map((record) => [record.id, record]),
    );
    if (
      actualHistoryById.size !== expectedHistoryRows.length ||
      expectedHistoryRows.some((record) => !actualHistoryById.has(record.id))
    ) {
      return "history_id";
    }
    for (const expected of expectedHistoryRows) {
      const actual = actualHistoryById.get(expected.id)!;
      for (const field of [
        "entityId",
        "entityType",
        "fromStatus",
        "toStatus",
        "source",
        "commentDigest",
        "noteDigest",
        "changedBy",
      ] as const) {
        if (actual[field] !== expected[field]) return `history_${field}`;
      }
    }
    if (
      !exactIdentityMultiset(
        historyKeys as string[],
        expectedHistoryRows.map(historyPayloadKey),
      )
    ) {
      return "history_identity";
    }
    if (
      !statusHistoryPayloadTimestampsMatch(
        historyRecords as StatusHistoryPayloadRecord[],
        expectedHistoryRows,
        contract,
      )
    ) {
      return "history_timestamps";
    }
    if (
      !snapshotMatchesDraftPayload({
        applicants,
        contract,
        corrections,
        expectedCorrections: expectedCorrectionRows,
        history,
        media,
        payloadSubmission: submission,
        questionnaireAnswers,
      })
    ) {
      const expectedProjections =
        contract.snapshotMutation?.projectionDigests ??
        contract.snapshotProjection?.projectionDigests;
      const actualProjections = productionDraftSnapshotProjectionDigests(
        submission.family_intelligence,
        {
          normalizeFileReviewTimestamps: Boolean(contract.mediaProjection),
        },
      );
      if (expectedProjections && actualProjections) {
        for (const key of [
          "root",
          "applicants",
          "files",
          "issues",
          "history",
        ] as const) {
          if (expectedProjections[key] !== actualProjections[key]) {
            return `snapshot_${key}`;
          }
        }
      }
      return `snapshot_${
        snapshotDraftPayloadMismatchCode({
          applicants,
          contract,
          corrections,
          expectedCorrections: expectedCorrectionRows,
          history,
          media,
          payloadSubmission: submission,
          questionnaireAnswers,
        }) ?? "unknown"
      }`;
    }
    return "match";
  } catch {
    return "parse";
  }
}

export function assertProductionLifecycleMutationAudit(
  mutationSummary: CohortMutationSummary[],
  allowedAuthAttemptCount: number,
) {
  invariant(
    allowedAuthAttemptCount >= 1 && allowedAuthAttemptCount <= 6,
    "Production lifecycle auth attempts exceeded the bounded retry contract.",
  );

  const authRecords = mutationSummary.filter(
    (record) => record.method === "POST" && record.path === "/auth/v1/token",
  );
  const observedAuthAttemptCount = authRecords.reduce(
    (total, record) => total + record.count,
    0,
  );
  invariant(
    observedAuthAttemptCount === allowedAuthAttemptCount,
    "Production lifecycle auth audit is missing a terminal request outcome.",
  );

  const successfulAuthAttemptCount = authRecords
    .filter((record) => record.status >= 200 && record.status < 300)
    .reduce((total, record) => total + record.count, 0);
  invariant(
    successfulAuthAttemptCount === 1,
    "Production lifecycle auth did not recover to exactly one successful response.",
  );
  invariant(
    authRecords.every(
      (record) =>
        record.status === 0 || (record.status >= 200 && record.status < 300),
    ),
    "Production lifecycle auth emitted a non-retryable HTTP failure.",
  );

  const failedBusinessMutation = mutationSummary.find(
    (record) =>
      !(record.method === "POST" && record.path === "/auth/v1/token") &&
      (record.status < 200 || record.status >= 300),
  );
  invariant(
    !failedBusinessMutation,
    `Production lifecycle business mutation failed (${failedBusinessMutation?.path ?? "unknown"}).`,
  );
}

export function createProductionMutationDiagnosticError(input: {
  alertTexts: string[];
  gateCode?: string;
  gateMessage: string;
  label: string;
  operationMessage: string;
  phase: "action" | "response";
  remarkFormVisible: boolean;
}) {
  const alertDigests = [
    ...new Set(input.alertTexts.filter(Boolean).map(evidenceDigest)),
  ];
  return new Error(
    `${input.label}: ${input.phase} failed before a production response (` +
      `remark_form=${input.remarkFormVisible ? "visible" : "closed"};` +
      `alert_digests=${alertDigests.length ? alertDigests.join(",") : "none"};` +
      `operation=${evidenceDigest(input.operationMessage)};` +
      `gate_code=${input.gateCode ?? "unavailable"};` +
      `gate=${evidenceDigest(input.gateMessage)}).`,
  );
}

export function createProductionResponseDiagnosticError(input: {
  label: string;
  responseBody: string;
  status: number;
}) {
  return new Error(
    `${input.label}: production response failed (` +
      `status=${input.status};body=${evidenceDigest(input.responseBody)}).`,
  );
}

export async function runWithFailurePreservingCleanup<T>(
  operation: () => Promise<T>,
  cleanup: () => Promise<void>,
): Promise<T> {
  let operationResult: T | undefined;
  let operationFailure: unknown;
  let operationFailed = false;
  try {
    operationResult = await operation();
  } catch (error) {
    operationFailed = true;
    operationFailure = error;
  }

  let cleanupFailure: unknown;
  let cleanupFailed = false;
  try {
    await cleanup();
  } catch (error) {
    cleanupFailed = true;
    cleanupFailure = error;
  }

  if (operationFailed) throw operationFailure;
  if (cleanupFailed) throw cleanupFailure;
  return operationResult as T;
}

async function readJson<T>(path: string): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    throw new Error(`Required lifecycle JSON is missing or invalid: ${path}`);
  }
}

async function writeJsonAtomic(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  });
  await rename(temporaryPath, path);
}

export function assertProductionLifecycleWriteUnlock() {
  const caseKey = requiredProductionLifecycleCaseKey();
  invariant(
    process.env.SUPABASE_PRODUCTION_E2E_UNLOCK === "1",
    "SUPABASE_PRODUCTION_E2E_UNLOCK=1 is required.",
  );
  invariant(
    process.env.V19_PRODUCTION_LIFECYCLE_WRITE_UNLOCK ===
      REQUIRED_PRODUCTION_LIFECYCLE_WRITE_UNLOCK,
    "The dedicated production lifecycle write unlock is absent.",
  );
  if (caseKey === PRODUCTION_A2_S1_LIFECYCLE_CASE_KEY) {
    invariant(
      process.env.V19_PRODUCTION_A2_S1_LIFECYCLE_WRITE_UNLOCK ===
        REQUIRED_PRODUCTION_A2_S1_LIFECYCLE_WRITE_UNLOCK,
      "The dedicated A2-S1 production lifecycle write unlock is absent.",
    );
  } else {
    invariant(
      process.env.V19_PRODUCTION_A1_F6_LIFECYCLE_WRITE_UNLOCK ===
        REQUIRED_PRODUCTION_A1_F6_LIFECYCLE_WRITE_UNLOCK,
      "The dedicated A1-F6 production lifecycle write unlock is absent.",
    );
  }
  invariant(
    process.env.V19_PRODUCTION_COHORT_CONFIRM_PROJECT_REF === PRODUCTION_PROJECT_REF,
    "The production lifecycle project-ref confirmation is absent or wrong.",
  );
}

export function productionLifecycleStatePath(
  runMarker: string,
  caseKey = FOCUSED_PRODUCTION_LIFECYCLE_CASE_KEY,
) {
  const suffix =
    caseKey === FOCUSED_PRODUCTION_LIFECYCLE_CASE_KEY ? "" : `-${caseKey}`;
  return resolve(process.cwd(), `.production-lifecycle-${runMarker}${suffix}.state.local.json`);
}

function productionCohortMutationLockPath(runMarker: string) {
  return resolve(process.cwd(), `.production-cohort-${runMarker}.mutation.lock.local`);
}

export async function acquireProductionCohortMutationLock(
  runMarker: string,
  lane: ProductionCohortMutationLane,
) {
  const path = productionCohortMutationLockPath(runMarker);
  const token = randomUUID();
  let handle;
  try {
    handle = await open(path, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(
        `Another production cohort mutation process holds the run-marker lock; refusing concurrent ${lane} mutations.`,
      );
    }
    throw error;
  }

  try {
    await handle.writeFile(
      `${JSON.stringify({
        acquiredAt: new Date().toISOString(),
        lane,
        pid: process.pid,
        runMarker,
        token,
      })}\n`,
    );
  } finally {
    await handle.close();
  }

  return async () => {
    const lock = await readJson<{
      lane?: ProductionCohortMutationLane;
      runMarker?: string;
      token?: string;
    }>(path);
    invariant(
      lock.lane === lane && lock.runMarker === runMarker && lock.token === token,
      "Production cohort mutation lock ownership changed; refusing to remove it.",
    );
    await unlink(path);
  };
}

export async function acquireProductionLifecycleLock(runMarker: string) {
  return acquireProductionCohortMutationLock(runMarker, "lifecycle");
}

export function productionLifecycleIssueMarker(state: ProductionLifecycleState) {
  return `${state.runMarker} ${state.case.caseKey}: обновить поле «Примечание» на «${productionLifecycleCorrectedNote(state)}» и отправить повторно.`;
}

export function productionLifecycleCorrectedNote(state: ProductionLifecycleState) {
  return `PRODUCTION QA ${state.runMarker}-${state.case.caseKey} | LIFECYCLE RETURN FIXED`;
}

function focusedSubmittedCase(runMarker: string) {
  const cohortCase = buildProductionCohortPlan(runMarker).find(
    (candidate) => candidate.caseKey === RESUMABLE_PRODUCTION_LIFECYCLE_CASE_KEY,
  );
  invariant(
    cohortCase,
    `Focused ${RESUMABLE_PRODUCTION_LIFECYCLE_CASE_KEY} case is absent from the production plan.`,
  );
  const expectedApplicantCount =
    RESUMABLE_PRODUCTION_LIFECYCLE_CASE_KEY ===
    FOCUSED_PRODUCTION_LIFECYCLE_CASE_KEY
      ? 6
      : 1;
  invariant(
    cohortCase.applicantCount === expectedApplicantCount &&
      cohortCase.type === (expectedApplicantCount === 6 ? "family" : "single"),
    `${RESUMABLE_PRODUCTION_LIFECYCLE_CASE_KEY} has an unexpected technical case shape.`,
  );
  return cohortCase;
}

function submittedCaseRef(
  cohortCase: ProductionCohortCase,
  checkpoint:
    | {
        caseMarker: string;
        stage: string;
        submissionId?: string;
      }
    | undefined,
): ProductionLifecycleCaseRef {
  invariant(
    checkpoint?.stage === "submitted" && checkpoint.submissionId,
    `${RESUMABLE_PRODUCTION_LIFECYCLE_CASE_KEY} must reach the submitted cohort checkpoint before lifecycle mutations.`,
  );
  invariant(
    checkpoint.caseMarker === cohortCase.caseMarker,
    `${RESUMABLE_PRODUCTION_LIFECYCLE_CASE_KEY} submitted checkpoint marker mismatch.`,
  );
  invariant(
    cohortCase.caseKey === RESUMABLE_PRODUCTION_LIFECYCLE_CASE_KEY,
    `Production lifecycle refuses a case other than ${RESUMABLE_PRODUCTION_LIFECYCLE_CASE_KEY}.`,
  );
  return {
    caseKey: RESUMABLE_PRODUCTION_LIFECYCLE_CASE_KEY,
    ownerKey: cohortCase.ownerKey,
    submissionId: checkpoint.submissionId,
  };
}

function validateStoredState(
  state: ProductionLifecycleState,
  runMarker: string,
  expectedCase: ProductionLifecycleCaseRef,
  expectedCaseMarker: string,
) {
  invariant(state.schemaVersion === 1, "Unsupported lifecycle checkpoint schema.");
  invariant(
    state.projectRef === PRODUCTION_PROJECT_REF,
    "Lifecycle project ref mismatch.",
  );
  invariant(state.runMarker === runMarker, "Lifecycle run marker mismatch.");
  invariant(lifecycleStages.has(state.stage), "Lifecycle stage is invalid.");
  invariant(
    state.case.caseKey === RESUMABLE_PRODUCTION_LIFECYCLE_CASE_KEY &&
      state.case.ownerKey === expectedCase.ownerKey &&
      state.case.submissionId === expectedCase.submissionId,
    `Lifecycle state no longer matches the submitted ${RESUMABLE_PRODUCTION_LIFECYCLE_CASE_KEY} cohort checkpoint.`,
  );
  if (["accepting", "accepted"].includes(state.stage)) {
    assertProductionLifecycleAcceptanceProof(state, expectedCaseMarker);
  }
}

export async function loadOrCreateProductionLifecycleState(): Promise<ResolvedProductionLifecycleState> {
  assertProductionLifecycleWriteUnlock();
  const runMarker = requiredProductionRunMarker();
  const cohortState = await loadCohortResumeState(runMarker);
  const cohortCase = focusedSubmittedCase(runMarker);
  const expectedCase = submittedCaseRef(
    cohortCase,
    cohortState.cases[RESUMABLE_PRODUCTION_LIFECYCLE_CASE_KEY],
  );
  const path = productionLifecycleStatePath(
    runMarker,
    RESUMABLE_PRODUCTION_LIFECYCLE_CASE_KEY,
  );

  if (existsSync(path)) {
    const state = await readJson<ProductionLifecycleState>(path);
    validateStoredState(state, runMarker, expectedCase, cohortCase.caseMarker);
    return { cohortCase, state };
  }

  const state: ProductionLifecycleState = {
    case: expectedCase,
    projectRef: PRODUCTION_PROJECT_REF,
    runMarker,
    schemaVersion: 1,
    stage: "pending_review",
    updatedAt: new Date().toISOString(),
  };
  await saveProductionLifecycleState(state);
  return { cohortCase, state };
}

export async function saveProductionLifecycleState(state: ProductionLifecycleState) {
  state.updatedAt = new Date().toISOString();
  await writeJsonAtomic(
    productionLifecycleStatePath(state.runMarker, state.case.caseKey),
    state,
  );
}

export async function writeProductionLifecycleEvidence(
  runMarker: string,
  value: unknown,
) {
  const evidenceLane = `production-lifecycle-${RESUMABLE_PRODUCTION_LIFECYCLE_CASE_KEY.toLowerCase()}`;
  const path = testArtifactPath("playwright", evidenceLane, runMarker, "evidence.json");
  await writeJsonAtomic(path, value);
  return path;
}

export function recordProductionLifecycleAcceptanceProof(
  state: ProductionLifecycleState,
  caseMarker: string,
) {
  state.acceptanceProof = {
    caseMarkerDigest: lifecycleProofDigest(caseMarker),
    issueMarkerDigest: lifecycleProofDigest(productionLifecycleIssueMarker(state)),
    issueStatus: "fixed_by_agent",
  };
}

export function assertProductionLifecycleAcceptanceProof(
  state: ProductionLifecycleState,
  caseMarker: string,
) {
  invariant(
    state.acceptanceProof?.caseMarkerDigest === lifecycleProofDigest(caseMarker) &&
      state.acceptanceProof.issueMarkerDigest ===
        lifecycleProofDigest(productionLifecycleIssueMarker(state)) &&
      state.acceptanceProof.issueStatus === "fixed_by_agent",
    `Acceptance intent is missing the exact ${state.case.caseKey} fixed-issue proof.`,
  );
}

function lifecycleProofDigest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function evidenceDigest(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

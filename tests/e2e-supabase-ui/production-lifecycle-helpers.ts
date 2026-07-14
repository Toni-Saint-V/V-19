import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

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
/** Legacy terminal case kept exclusively for the A1-F6 export proof. */
export const FOCUSED_PRODUCTION_LIFECYCLE_CASE_KEY = "A1-F6";
/** The only production mutation target authorized for this rollout. */
export const PRODUCTION_A2_S1_LIFECYCLE_CASE_KEY = "A2-S1";

export type ProductionSingleCaseKey = `A${1 | 2 | 3}-S${1 | 2 | 3}`;

export function requiredProductionLifecycleCaseKey(): typeof PRODUCTION_A2_S1_LIFECYCLE_CASE_KEY {
  const caseKey = process.env.V19_PRODUCTION_COHORT_CASE_KEY?.trim();
  invariant(
    caseKey === PRODUCTION_A2_S1_LIFECYCLE_CASE_KEY,
    "V19_PRODUCTION_COHORT_CASE_KEY=A2-S1 is required for this production lifecycle rollout.",
  );
  return PRODUCTION_A2_S1_LIFECYCLE_CASE_KEY;
}

export const RESUMABLE_PRODUCTION_LIFECYCLE_CASE_KEY =
  PRODUCTION_A2_S1_LIFECYCLE_CASE_KEY;

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
  correction: {
    mode: "append" | "exact" | "existing";
    reasonIncludes: string;
    status: "closed" | "fixed" | "open";
  };
  draft: ProductionDraftPayloadIdentityContract;
  history: ProductionDraftHistoryExpectation;
  ownerId: string;
  submissionId: string;
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
  mediaAssets: readonly ProductionDraftMediaIdentity[];
  questionnaireAnswers: readonly ProductionDraftQuestionnaireIdentity[];
  snapshotHistoryCount: number;
  snapshotIssueCount: number;
  statusHistory: readonly ProductionDraftStatusHistoryIdentity[];
};

export type ProductionDraftApplicantIdentity = {
  id: string;
  submissionId: string;
};

export type ProductionDraftMediaIdentity = {
  applicantId: string;
  id: string;
  storageBucket: string;
  storagePathDigest: string;
  submissionId: string;
  type: string;
};

export type ProductionDraftQuestionnaireIdentity = {
  applicantId: string;
  fieldId: string;
  labelDigest: string;
  sectionId: string;
  submissionId: string;
  valueDigest: string;
};

export type ProductionDraftCorrectionIdentity = {
  applicantId: string | null;
  fieldKey: string | null;
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
  commentDigest: string;
  entityId: string;
  entityType: "submission";
  fromStatus: string | null;
  id: string;
  noteDigest: string | null;
  source: "admin" | "agent" | "bb" | "system";
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
    note: string;
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

function isIsoTimestamp(value: unknown) {
  return (
    typeof value === "string" &&
    Number.isFinite(Date.parse(value)) &&
    /^\d{4}-\d{2}-\d{2}T/.test(value)
  );
}

function applicantKey(value: ProductionDraftApplicantIdentity) {
  return identityKey(value.id, value.submissionId);
}

function applicantPayloadKey(value: JsonRecord) {
  const id = text(value.id);
  const submissionId = text(value.submission_id);
  return id && submissionId ? identityKey(id, submissionId) : null;
}

function mediaKey(value: ProductionDraftMediaIdentity) {
  return identityKey(
    value.id,
    value.applicantId,
    value.submissionId,
    value.type,
    value.storageBucket,
    value.storagePathDigest,
  );
}

function mediaPayloadKey(value: JsonRecord) {
  const id = text(value.id);
  const applicantId = text(value.applicant_id);
  const submissionId = text(value.submission_id);
  const type = text(value.type);
  const storageBucket = text(value.storage_bucket);
  const storagePathDigest = productionDraftValueDigest(value.storage_path);
  return id && applicantId && submissionId && type && storageBucket && storagePathDigest
    ? identityKey(id, applicantId, submissionId, type, storageBucket, storagePathDigest)
    : null;
}

function answerKey(value: ProductionDraftQuestionnaireIdentity) {
  return identityKey(
    value.submissionId,
    value.applicantId,
    value.sectionId,
    value.fieldId,
    value.labelDigest,
    value.valueDigest,
  );
}

function answerPayloadKey(value: JsonRecord) {
  const submissionId = text(value.submission_id);
  const applicantId = text(value.applicant_id);
  const sectionId = text(value.section_id);
  const fieldId = text(value.field_id);
  const labelDigest = productionDraftValueDigest(value.label);
  const valueDigest = productionDraftValueDigest(value.value);
  return submissionId && applicantId && sectionId && fieldId && labelDigest && valueDigest
    ? identityKey(submissionId, applicantId, sectionId, fieldId, labelDigest, valueDigest)
    : null;
}

function correctionKey(value: ProductionDraftCorrectionIdentity) {
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

function correctionPayloadKey(value: JsonRecord) {
  const id = text(value.id);
  const submissionId = text(value.submission_id);
  const applicantId = nullableText(value.applicant_id);
  const scope = text(value.scope);
  const fieldKey = nullableText(value.field_key);
  const mediaType = nullableText(value.media_type);
  const reasonDigest = productionDraftValueDigest(value.reason);
  const severity = text(value.severity);
  const status = text(value.status);
  if (
    !id ||
    !submissionId ||
    applicantId === undefined ||
    !scope ||
    fieldKey === undefined ||
    mediaType === undefined ||
    !reasonDigest ||
    !severity ||
    !status
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
  return identityKey(
    id,
    submissionId,
    applicantId,
    scope,
    fieldKey,
    mediaType,
    reasonDigest,
    severity,
    status,
  );
}

type ExpectedStatusHistoryPayload = {
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

function historyPayloadRecordKey(value: JsonRecord) {
  const id = text(value.id);
  const entityType = text(value.entity_type);
  const entityId = text(value.entity_id);
  const fromStatus = nullableText(value.from_status);
  const toStatus = text(value.to_status);
  const source = text(value.source);
  const commentDigest = productionDraftValueDigest(value.comment);
  const noteDigest = value.note === null ? null : productionDraftValueDigest(value.note);
  const changedBy = text(value.changed_by);
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
    !isIsoTimestamp(value.changed_at)
  ) {
    return null;
  }
  return identityKey(
    id,
    entityType,
    entityId,
    fromStatus,
    toStatus,
    source,
    commentDigest,
    noteDigest,
    changedBy,
  );
}

function expectedHistoryPayload(
  contract: ProductionDraftPayloadMutationContract,
): ExpectedStatusHistoryPayload[] {
  const expected = contract.draft.statusHistory
    .filter((item) => item.source === contract.history.actorSource)
    .map((item) => ({
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
  const noteDigest = productionDraftValueDigest(transition.note);
  if (!commentDigest || !noteDigest) return [];
  return [
    ...expected,
    {
      changedBy: contract.history.actorId,
      commentDigest,
      entityId: contract.submissionId,
      entityType: "submission",
      fromStatus: transition.fromStatus,
      id: productionDraftStableUuid(
        `history:${contract.submissionId}:и-${contract.submissionId}-${transition.fromStatus}-${transition.toStatus}-${contract.draft.snapshotHistoryCount + 1}`,
      ),
      noteDigest,
      source: contract.history.actorSource,
      toStatus: transition.toStatus,
    },
  ];
}

function expectedCorrections(
  contract: ProductionDraftPayloadMutationContract,
): ProductionDraftCorrectionIdentity[] | null {
  const markerRows = contract.draft.corrections.filter((item) => item.targetMarker);
  if (contract.correction.mode === "exact") return [...contract.draft.corrections];
  if (contract.correction.mode === "existing") {
    if (markerRows.length !== 1) return null;
    return contract.draft.corrections.map((item) =>
      item.targetMarker ? { ...item, status: contract.correction.status } : item,
    );
  }
  if (markerRows.length !== 0 || contract.draft.applicants.length !== 1) return null;
  const applicantId = contract.draft.applicants[0]!.id;
  const reasonDigest = productionDraftValueDigest(
    `Требуется исправить поле «Примечание» — ${contract.correction.reasonIncludes}`,
  );
  if (!reasonDigest) return null;
  return [
    ...contract.draft.corrections,
    {
      applicantId,
      fieldKey: "Примечание",
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

function snapshotMediaType(value: unknown) {
  const type = text(value);
  if (!type) return null;
  return type === "selfie_1" ? "selfie" : type;
}

function snapshotIssueStatus(value: unknown) {
  if (value === "open") return "open";
  if (value === "fixed_by_agent") return "fixed";
  if (value === "closed_by_admin") return "closed";
  return null;
}

function snapshotIssueSeverity(value: unknown) {
  return value === "blocker" ? "blocking" : typeof value === "string" ? "note" : null;
}

function snapshotIssueKey(value: JsonRecord) {
  const target = jsonRecord(value.target);
  const applicantId = nullableText(target?.applicantId);
  const fieldKey = nullableText(target?.field);
  const mediaType =
    target?.fileType === undefined || target.fileType === null
      ? null
      : snapshotMediaType(target.fileType);
  const scope = value.type === "file" || value.type === "media" ? "media" : "field";
  const reason = text(value.reason);
  const comment = nullableText(value.comment);
  const reasonDigest = productionDraftValueDigest(
    reason === null ? undefined : comment ? `${reason} — ${comment}` : reason,
  );
  const severity = snapshotIssueSeverity(value.severity);
  const status = snapshotIssueStatus(value.status);
  return (
    applicantId !== undefined &&
    fieldKey !== undefined &&
    mediaType !== undefined &&
    reasonDigest &&
    severity &&
    status
      ? identityKey(applicantId, scope, fieldKey, mediaType, reasonDigest, severity, status)
      : null
  );
}

function correctionSnapshotKey(value: JsonRecord) {
  const applicantId = nullableText(value.applicant_id);
  const scope = text(value.scope);
  const fieldKey = nullableText(value.field_key);
  const mediaType = nullableText(value.media_type);
  const reasonDigest = productionDraftValueDigest(value.reason);
  const severity = text(value.severity);
  const status = text(value.status);
  return (
    applicantId !== undefined &&
    scope &&
    fieldKey !== undefined &&
    mediaType !== undefined &&
    reasonDigest &&
    severity &&
    status
      ? identityKey(applicantId, scope, fieldKey, mediaType, reasonDigest, severity, status)
      : null
  );
}

function snapshotHistorySemanticKey(value: JsonRecord) {
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
  return (
    id &&
    fromStatus !== undefined &&
    toStatus &&
    (source === "admin" || source === "agent" || source === "bb" || source === "system") &&
    commentDigest
      ? identityKey(id, fromStatus, toStatus, source, commentDigest, noteDigest)
      : null
  );
}

function expectedSnapshotHistoryKeys(
  contract: ProductionDraftPayloadMutationContract,
) {
  const base = contract.draft.statusHistory.map((item) =>
    identityKey(
      item.id,
      item.fromStatus,
      item.toStatus,
      item.source,
      item.commentDigest,
      item.noteDigest,
    ),
  );
  const transition = contract.history.transition;
  if (!transition) return base;
  const commentDigest = productionDraftValueDigest(transition.comment);
  const noteDigest = productionDraftValueDigest(transition.note);
  return commentDigest && noteDigest
    ? [
        ...base,
        identityKey(
          `и-${contract.submissionId}-${transition.fromStatus}-${transition.toStatus}-${contract.draft.snapshotHistoryCount + 1}`,
          transition.fromStatus,
          transition.toStatus,
          contract.history.actorSource,
          commentDigest,
          noteDigest,
        ),
      ]
    : [];
}

function snapshotMatchesDraftPayload(input: {
  applicants: readonly JsonRecord[];
  corrections: readonly JsonRecord[];
  history: readonly JsonRecord[];
  media: readonly JsonRecord[];
  payloadSubmission: JsonRecord;
  questionnaireAnswers: readonly JsonRecord[];
  contract: ProductionDraftPayloadMutationContract;
}) {
  const intelligence = jsonRecord(input.payloadSubmission.family_intelligence);
  if (intelligence?.status !== "unreviewed") return false;
  const envelope = jsonRecord(intelligence?.v19CockpitSnapshot);
  if (envelope?.version !== 1) return false;
  const snapshot = jsonRecord(envelope.submission);
  if (
    snapshot?.id !== input.contract.submissionId ||
    snapshot.agentId !== input.contract.ownerId ||
    snapshot.status !== input.contract.history.snapshotStatus
  ) {
    return false;
  }

  const snapshotApplicants = recordArray(snapshot.applicants);
  if (!snapshotApplicants) return false;
  const expectedApplicantIds = input.applicants.map((item) => text(item.id)).filter(
    (item): item is string => Boolean(item),
  );
  const actualApplicantIds = snapshotApplicants
    .map((item) => text(item.id))
    .filter((item): item is string => Boolean(item));
  if (!exactIdentitySet(actualApplicantIds, expectedApplicantIds)) return false;

  const expectedAnswerKeys = input.questionnaireAnswers.map((answer) => {
    const applicantId = text(answer.applicant_id);
    const sectionId = text(answer.section_id);
    const fieldId = text(answer.field_id);
    return applicantId && sectionId && fieldId
      ? identityKey(applicantId, sectionId, fieldId)
      : null;
  });
  if (expectedAnswerKeys.some((key) => key === null)) return false;
  const actualAnswerKeys: string[] = [];
  for (const applicant of snapshotApplicants) {
    const applicantId = text(applicant.id);
    const sections = recordArray(applicant.sections);
    if (!applicantId || !sections) return false;
    for (const section of sections) {
      const sectionId = text(section.id);
      const fields = recordArray(section.fields);
      if (!sectionId || !fields) return false;
      for (const field of fields) {
        const fieldId = text(field.id);
        if (!fieldId) return false;
        actualAnswerKeys.push(identityKey(applicantId, sectionId, fieldId));
      }
    }
  }
  if (!exactIdentitySet(actualAnswerKeys, expectedAnswerKeys as string[])) return false;

  const snapshotFiles = recordArray(snapshot.files);
  if (!snapshotFiles) return false;
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
    return false;
  }

  const snapshotIssues = recordArray(snapshot.issues);
  if (!snapshotIssues) return false;
  const expectedIssues = input.corrections.map(correctionSnapshotKey);
  const actualIssues = snapshotIssues.map(snapshotIssueKey);
  if (
    expectedIssues.some((key) => key === null) ||
    actualIssues.some((key) => key === null) ||
    !exactIdentitySet(actualIssues as string[], expectedIssues as string[])
  ) {
    return false;
  }

  const snapshotHistory = recordArray(snapshot.history);
  if (!snapshotHistory) return false;
  const actualHistory = snapshotHistory
    .filter((item) => item.fromStatus !== undefined || item.toStatus !== undefined)
    .map(snapshotHistorySemanticKey);
  const expectedHistory = expectedSnapshotHistoryKeys(input.contract);
  return (
    !actualHistory.some((key) => key === null) &&
    exactIdentitySet(actualHistory as string[], expectedHistory)
  );
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
  const applicantKeys = applicants.map(applicantPayloadKey);
  const mediaKeys = media.map(mediaPayloadKey);
  const answerKeys = questionnaireAnswers.map(answerPayloadKey);
  const correctionKeys = corrections.map(correctionPayloadKey);
  const historyKeys = history.map(historyPayloadRecordKey);
  if (
    applicantKeys.some((key) => key === null) ||
    mediaKeys.some((key) => key === null) ||
    answerKeys.some((key) => key === null) ||
    correctionKeys.some((key) => key === null) ||
    historyKeys.some((key) => key === null)
  ) {
    return false;
  }

  if (
    !exactIdentitySet(applicantKeys as string[], contract.draft.applicants.map(applicantKey)) ||
    !exactIdentitySet(mediaKeys as string[], contract.draft.mediaAssets.map(mediaKey)) ||
    !exactIdentitySet(
      answerKeys as string[],
      contract.draft.questionnaireAnswers.map(answerKey),
    ) ||
    !exactIdentitySet(
      correctionKeys as string[],
      expectedCorrectionRows.map(correctionKey),
    ) ||
    !exactIdentitySet(
      historyKeys as string[],
      expectedHistoryRows.map(historyPayloadKey),
    )
  ) {
    return false;
  }

  return snapshotMatchesDraftPayload({
    applicants,
    contract,
    corrections,
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
  requiredProductionLifecycleCaseKey();
  invariant(
    process.env.SUPABASE_PRODUCTION_E2E_UNLOCK === "1",
    "SUPABASE_PRODUCTION_E2E_UNLOCK=1 is required.",
  );
  invariant(
    process.env.V19_PRODUCTION_LIFECYCLE_WRITE_UNLOCK ===
      REQUIRED_PRODUCTION_LIFECYCLE_WRITE_UNLOCK,
    "The dedicated production lifecycle write unlock is absent.",
  );
  invariant(
    process.env.V19_PRODUCTION_A2_S1_LIFECYCLE_WRITE_UNLOCK ===
      REQUIRED_PRODUCTION_A2_S1_LIFECYCLE_WRITE_UNLOCK,
    "The dedicated A2-S1 production lifecycle write unlock is absent.",
  );
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
  invariant(
    cohortCase.type === "single" && cohortCase.applicantCount === 1,
    `${RESUMABLE_PRODUCTION_LIFECYCLE_CASE_KEY} is not the expected one-person technical case.`,
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
  const path = resolve(
    process.cwd(),
    "output",
    "playwright",
    evidenceLane,
    runMarker,
    "evidence.json",
  );
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

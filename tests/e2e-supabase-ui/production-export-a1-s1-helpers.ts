import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";
import type { BrowserContext, Download, Page, Request } from "@playwright/test";

import type { Database } from "../../src/lib/supabase/database.types";
import {
  addPreciseAdminIssue,
  updateQuestionnaireField,
} from "../../src/modules/submissions/submissionActions";
import {
  applySubmissionActionResult,
  markSubmissionIssueFixedResult,
  withRecalculatedSubmissionProgress,
} from "../../src/modules/submissions/status";
import { normalizeSubmissionQuestionnaire } from "../../src/modules/submissions/questionnaire";
import type {
  Role,
  Submission,
  SubmissionAction,
} from "../../src/modules/submissions/types";
import { testArtifactPath } from "../support/artifacts";
import {
  attachDurableMediaAssetRows,
  attachDurableStatusHistoryRows,
  readCockpitSnapshot,
  toCockpitDraftPersistencePayload,
  toCockpitQuestionnaireAnswerInserts,
} from "../../src/modules/submissions/supabasePersistence";
import {
  PRODUCTION_COHORT_APP_ORIGIN,
  PRODUCTION_PROJECT_REF,
  PRODUCTION_SUPABASE_ORIGIN,
  buildProductionCohortPlan,
  isPermittedCohortStaticRuntimeRequest,
  loadCohortResumeState,
  requiredProductionRunMarker,
  type CohortMutationSummary,
  type ProductionCohortAccount,
  type ProductionCohortCase,
} from "./production-cohort-helpers";
import {
  acquireProductionCohortMutationLock,
  assertProductionLifecycleAcceptanceProof,
  productionDraftApplicantContentDigest,
  productionDraftEffectiveSnapshotHistory,
  productionDraftMediaContentDigest,
  productionDraftMediaStaticContentDigest,
  productionDraftPayloadMatches,
  productionDraftQuestionnaireValueIdentity,
  productionDraftSnapshotFieldErrorIdentities,
  productionDraftSnapshotContentDigest,
  productionDraftSnapshotHistoryProjection,
  productionDraftSnapshotProjectionDigests,
  productionDraftSnapshotIssueIdentities,
  productionDraftSnapshotMutationFromBaseline,
  productionDraftSubmissionStaticContentDigest,
  productionDraftValueDigest,
  productionLifecycleStatePath,
  productionLifecycleMutationPayloadMismatchCode,
  requiredProductionLifecycleCaseKey,
  type ProductionDraftPayloadIdentityContract,
  type ProductionDraftPayloadMutationContract,
  type ProductionDraftHistoryExpectation,
  type ProductionDraftProjectedStatusHistoryIdentity,
  type ProductionDraftSnapshotMutation,
  type ProductionDraftSnapshotMutationIntent,
  type ProductionMutationTimestampWindow,
  type ProductionSingleCaseKey,
  type ProductionLifecycleState,
} from "./production-lifecycle-helpers";

export const REQUIRED_PRODUCTION_A1_S1_EXPORT_WRITE_UNLOCK =
  "I_UNDERSTAND_A1_S1_EXPORT_DOWNLOAD";
export const REQUIRED_PRODUCTION_A2_S1_EXPORT_WRITE_UNLOCK =
  "I_UNDERSTAND_A2_S1_EXPORT_DOWNLOAD";
export const REQUIRED_PRODUCTION_A2_S1_EXPORT_RESUME_UNLOCK =
  "I_UNDERSTAND_A2_S1_EXPORT_RETRY_AFTER_RECONCILIATION";
export const REQUIRED_PRODUCTION_A1_S1_EXPORT_REPAIR_UNLOCK =
  "I_UNDERSTAND_A1_S1_TERMINAL_REPAIR";
export const PRODUCTION_A1_S1_EXPORT_CASE_KEY = "A1-S1";
export const PRODUCTION_A2_S1_EXPORT_CASE_KEY = "A2-S1";

function requiredProductionExportCaseKey(): typeof PRODUCTION_A2_S1_EXPORT_CASE_KEY {
  const caseKey = requiredProductionLifecycleCaseKey();
  invariant(
    caseKey === PRODUCTION_A2_S1_EXPORT_CASE_KEY,
    "The production export runner must use the same explicit A2-S1 lifecycle case.",
  );
  return PRODUCTION_A2_S1_EXPORT_CASE_KEY;
}

export const PRODUCTION_EXPORT_CASE_KEY = PRODUCTION_A2_S1_EXPORT_CASE_KEY;

export type ProductionA1S1ExportStage =
  | "pending"
  | "excel_verified"
  | "exporting"
  | "artifact_verified"
  | "verified";

export type SanitizedA1S1WorkbookProof = {
  byteDigest: string;
  byteLength: number;
  columnCount: 56;
  dataRowCount: 1;
  dimension: "A1:BD2";
  markerRowCount: 1;
  sheetName: "Sheet1";
};

export type SanitizedA1S1ZipProof = {
  applicantCount: 1;
  byteDigest: string;
  byteLength: number;
  documentCount: 4;
  downloadWaitMs: number;
  entryCount: 7;
  questionnairePdfCount: 1;
  workbookDigest: string;
  workbookFileNameDigest: string;
  zipFileNameDigest: string;
};

export type ProductionA1S1ExportState = {
  caseKey: ProductionSingleCaseKey;
  caseMarkerDigest: string;
  excelProof?: SanitizedA1S1WorkbookProof;
  /**
   * Kept separate from ZIP byte proof: a browser can receive a valid archive
   * before the post-commit UI confirmation finishes rendering.
   */
  postCommitUiNoticeVerified?: true;
  /**
   * Recovery-only terminal proof: exact read-only audit reconciliation plus
   * fresh admin and owner UI state. It is stronger than a transient notice
   * when the original browser session has already closed.
   */
  postCommitTerminalProofVerified?: true;
  /** Strict read-only production facts captured before the first export write. */
  preflight?: ProductionA1S1ExportPreflight;
  projectRef: typeof PRODUCTION_PROJECT_REF;
  runMarker: string;
  schemaVersion: 1;
  stage: ProductionA1S1ExportStage;
  submissionDigest: string;
  updatedAt: string;
  zipProof?: SanitizedA1S1ZipProof;
};

export type ResolvedAcceptedA1S1ProductionExportCase = {
  cohortCase: ProductionCohortCase;
  lifecycleState: ProductionLifecycleState;
  state: ProductionA1S1ExportState;
};

export type ProductionA1S1ExportPreflight = {
  applicantDigest: string;
  documentAssetCount: 3;
  documentAssetIdentityDigest: string;
  mediaAssetCount: 3;
  mediaDigest: string;
  rawStatus: "ready_for_excel";
};

/**
 * Deliberately runtime-only: it binds the browser RPC gate to the exact
 * production rows just read by preflight. It must never be persisted in the
 * resumable checkpoint or evidence because it contains raw database IDs.
 */
export type ProductionA1S1ExportNetworkContract = {
  adminId: string;
  draft: ProductionDraftPayloadIdentityContract;
  documentAssetIds: readonly string[];
  ownerId: string;
  preCommitStatus: "ready_for_excel";
  submissionId: string;
};

/**
 * Derived from the already byte-verified ZIP manifest and kept in memory only.
 * Digests avoid persisting the PII-bearing export content fingerprint.
 */
export type ProductionA1S1VerifiedArtifactContract = {
  contentFingerprintDigest: string;
  idempotencyKeyDigest: string;
  workbookFileNameDigest: string;
  zipFileNameDigest: string;
};

export type ResolvedA1S1ProductionExportPreflight = {
  networkContract: ProductionA1S1ExportNetworkContract;
  preflight: ProductionA1S1ExportPreflight;
};

export type ProductionA1S1ExportFinalStateProof = {
  documentAssetCount: 3;
  documentEventCount: 1;
  exportBatchCount: 1;
  mediaDigest: string;
  rawStatus: "exported";
  statusHistoryExportedCount: 1;
};

export type ProductionA1S1ExportRepairProof = {
  outcome: "already_complete" | "repaired";
};

type ObservedMutation = {
  method: string;
  path: string;
  status: number;
};

type BlockedRequestReason =
  | "missing-release-gate"
  | "payload-contract"
  | "route-contract"
  | "verified-artifact-contract";

type ProductionSubmissionRow = {
  accepted_at: string | null;
  agent_id: string;
  appointment_status: string;
  city: string;
  country: string;
  exported_at: string | null;
  family_intelligence: unknown;
  id: string;
  priority: string;
  readiness_percent: number;
  review_started_at: string | null;
  status: string;
  submitted_at: string | null;
  title: string;
  travel_date: string;
  trip_date_from: string | null;
  trip_date_to: string | null;
  type: string;
  updated_at: string;
};

type ProductionDocumentAssetRow = {
  applicant_id: string;
  export_status: string;
  id: string;
  source_media_asset_id: string;
  submission_id: string;
  type: string;
  upload_status: string;
  validation_status: string;
};

type ProductionMediaAssetRow = {
  applicant_id: string;
  generated_file_name: string | null;
  id: string;
  mime_type: string | null;
  original_file_name: string | null;
  review_status: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  size_bytes: number | null;
  storage_bucket: string;
  storage_path: string;
  submission_id: string;
  type: string;
  upload_status: string;
  uploaded_at: string | null;
};

type ProductionCorrectionRow = {
  applicant_id: string | null;
  created_at: string;
  created_by: string;
  field_key: string | null;
  fixed_at: string | null;
  id: string;
  media_type: string | null;
  reason: string;
  severity: string;
  scope: string;
  status: string;
  submission_id: string;
};

type ProductionApplicantRow = {
  address: string | null;
  birth_date: string | null;
  citizenship: string | null;
  city: string;
  country: string;
  email: string | null;
  full_name: string;
  hotel_address: string | null;
  hotel_name: string | null;
  id: string;
  media_percent: number;
  passport_expires_at: string | null;
  passport_issued_at: string | null;
  passport_number: string;
  patronymic: string | null;
  phone: string | null;
  questionnaire_percent: number;
  role: string;
  role_confirmed: boolean;
  submission_id: string;
  suggested_role: string | null;
  trip_dates: string;
};

type ProductionQuestionnaireAnswerRow = {
  applicant_id: string;
  field_id: string;
  label: string;
  section_id: string;
  submission_id: string;
  value: unknown;
};

type ProductionExportBatchRow = {
  content_fingerprint: string | null;
  file_name: string | null;
  format: string;
  id: string;
  idempotency_key: string | null;
  row_count: number;
  submission_ids: string[];
};

type ProductionDocumentExportEventRow = {
  applicant_count: number;
  asset_ids: string[];
  file_count: number;
  package_identity_key: string;
  submission_ids: string[];
  workbook_file_name: string;
  zip_file_name: string;
};

type ProductionStatusHistoryRow = {
  changed_at: string;
  changed_by: string;
  comment: string;
  entity_id: string;
  entity_type: "submission";
  from_status: string | null;
  id: string;
  note: string | null;
  source: "admin" | "agent" | "bb" | "system";
  to_status: string;
};

const stages = new Set<ProductionA1S1ExportStage>([
  "pending",
  "excel_verified",
  "exporting",
  "artifact_verified",
  "verified",
]);

const businessMutationAllowlist = new Map<string, number>([
  // saveCockpitSubmissionsForProfile performs one explicit retry after a
  // retryable transport failure. Abort-only proof must contract-check and
  // abort both identical attempts instead of treating the retry as unknown.
  ["POST /rest/v1/rpc/save_submission_draft", 2],
  ["POST /rest/v1/rpc/complete_export_package", 1],
]);
// signInSupabaseWithPassword retries twice and each request uses three
// resilient-fetch attempts. This gate must allow that bounded 2 × 3 retry
// contract while still requiring exactly one successful password session.
const maxPasswordLoginAttempts = 6;

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type JsonRecord = Record<string, unknown>;

const rpcEnvelopeKeys = ["payload"] as const;
const terminalPayloadKeys = ["batch", "document_export"] as const;
const terminalBatchKeys = [
  "content_fingerprint",
  "file_name",
  "format",
  "id",
  "idempotency_key",
  "row_count",
  "submission_ids",
] as const;
const terminalDocumentExportKeys = [
  "applicant_count",
  "asset_ids",
  "file_count",
  "workbook_file_name",
  "zip_file_name",
] as const;

function jsonRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function exactRecordKeys(value: JsonRecord, expected: readonly string[]) {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function isUuid(value: unknown) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function exactStringSet(value: unknown, expected: readonly string[]) {
  if (
    !Array.isArray(value) ||
    value.length !== expected.length ||
    !value.every((item) => typeof item === "string")
  ) {
    return false;
  }
  const actual = new Set(value);
  const expectedSet = new Set(expected);
  return (
    actual.size === value.length &&
    expectedSet.size === expected.length &&
    actual.size === expectedSet.size &&
    [...actual].every((item) => expectedSet.has(item))
  );
}

/** Parses only in memory so request payloads cannot leak into diagnostics. */
function requestBodyJsonRecord(body: string | null): JsonRecord | null {
  if (!body) return null;
  try {
    return jsonRecord(JSON.parse(body));
  } catch {
    return null;
  }
}

export function productionA1S1ExportDigest(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function digestMatches(value: unknown, expectedDigest: string) {
  return (
    typeof value === "string" &&
    productionA1S1ExportDigest(value) === expectedDigest
  );
}

function exportPayloadRecord(body: string | null) {
  const envelope = requestBodyJsonRecord(body);
  if (!envelope || !exactRecordKeys(envelope, rpcEnvelopeKeys)) return null;
  return jsonRecord(envelope.payload);
}

/** Starts only at the explicit ZIP intent; preflight time is never accepted. */
function exportMutationTimestampWindow(): ProductionMutationTimestampWindow {
  const now = Date.now();
  return {
    notAfter: new Date(now + 120_000).toISOString(),
    notBefore: new Date(now - 1_000).toISOString(),
  };
}

function exportDraftPayloadContract(
  networkContract: ProductionA1S1ExportNetworkContract,
  timestampWindow: ProductionMutationTimestampWindow | null,
): ProductionDraftPayloadMutationContract | null {
  if (!timestampWindow) return null;
  return {
    correction: { mode: "exact", reasonIncludes: "", status: "closed" },
    draft: networkContract.draft,
    history: {
      actorId: networkContract.adminId,
      actorSource: "admin",
      snapshotStatus: "ready_for_export",
    },
    mode: "export",
    ownerId: networkContract.ownerId,
    questionnaire: { mode: "exact" },
    submissionId: networkContract.submissionId,
    timestampWindow,
  };
}

function baseExportPayloadMatches(
  body: string | null,
  key: string,
  networkContract: ProductionA1S1ExportNetworkContract,
  timestampWindow: ProductionMutationTimestampWindow | null,
) {
  const payload = exportPayloadRecord(body);
  if (!payload) return false;

  if (key === "POST /rest/v1/rpc/save_submission_draft") {
    const submission = jsonRecord(payload.submission);
    const draftContract = exportDraftPayloadContract(networkContract, timestampWindow);
    return Boolean(
      draftContract &&
      submission?.id === networkContract.submissionId &&
      submission.agent_id === networkContract.ownerId &&
      submission.status === networkContract.preCommitStatus &&
      submission.exported_at === null &&
      productionDraftPayloadMatches(payload, draftContract),
    );
  }

  if (key === "POST /rest/v1/rpc/complete_export_package") {
    const batch = jsonRecord(payload.batch);
    const documentExport = jsonRecord(payload.document_export);
    return (
      exactRecordKeys(payload, terminalPayloadKeys) &&
      batch !== null &&
      exactRecordKeys(batch, terminalBatchKeys) &&
      isUuid(batch.id) &&
      batch?.format === "xlsx" &&
      batch.row_count === 1 &&
      exactStringSet(batch.submission_ids, [networkContract.submissionId]) &&
      documentExport !== null &&
      exactRecordKeys(documentExport, terminalDocumentExportKeys) &&
      documentExport?.applicant_count === 1 &&
      documentExport.file_count === 4 &&
      exactStringSet(documentExport.asset_ids, networkContract.documentAssetIds)
    );
  }

  return false;
}

function baseExportPayloadMismatchCode(
  body: string | null,
  key: string,
  networkContract: ProductionA1S1ExportNetworkContract,
  timestampWindow: ProductionMutationTimestampWindow | null,
) {
  if (key !== "POST /rest/v1/rpc/save_submission_draft") {
    return "terminal_payload";
  }
  const draftContract = exportDraftPayloadContract(networkContract, timestampWindow);
  if (!draftContract) return "timestamp_window";
  return productionLifecycleMutationPayloadMismatchCode(body, {
    ...draftContract,
    submissionStatus: networkContract.preCommitStatus,
  });
}

/**
 * Compares a browser-owned terminal payload with the verified ZIP/XLSX
 * identity in memory. It deliberately returns only a boolean so raw export
 * contents and production IDs never reach evidence or diagnostics.
 */
export function productionA1S1ExportPayloadMatches(
  body: string | null,
  key: string,
  networkContract: ProductionA1S1ExportNetworkContract,
  artifactContract: ProductionA1S1VerifiedArtifactContract,
  timestampWindow: ProductionMutationTimestampWindow | null,
) {
  if (!baseExportPayloadMatches(body, key, networkContract, timestampWindow)) return false;
  const payload = exportPayloadRecord(body);
  if (!payload) return false;

  if (key === "POST /rest/v1/rpc/save_submission_draft") {
    const submission = jsonRecord(payload.submission);
    const intelligence = jsonRecord(submission?.family_intelligence);
    const snapshot = jsonRecord(intelligence?.v19CockpitSnapshot);
    const snapshotSubmission = jsonRecord(snapshot?.submission);
    const exportPackage = jsonRecord(snapshotSubmission?.exportPackage);
    return (
      snapshotSubmission?.id === networkContract.submissionId &&
      snapshotSubmission.agentId === networkContract.ownerId &&
      exportPackage?.format === "xlsx" &&
      exportPackage.rowCount === 1 &&
      exactStringSet(exportPackage.submissionIds, [networkContract.submissionId]) &&
      digestMatches(
        exportPackage.contentFingerprint,
        artifactContract.contentFingerprintDigest,
      ) &&
      digestMatches(exportPackage.idempotencyKey, artifactContract.idempotencyKeyDigest) &&
      digestMatches(exportPackage.fileName, artifactContract.workbookFileNameDigest)
    );
  }

  const batch = jsonRecord(payload.batch);
  const documentExport = jsonRecord(payload.document_export);
  return (
    digestMatches(batch?.content_fingerprint, artifactContract.contentFingerprintDigest) &&
    digestMatches(batch?.idempotency_key, artifactContract.idempotencyKeyDigest) &&
    digestMatches(batch?.file_name, artifactContract.workbookFileNameDigest) &&
    digestMatches(documentExport?.workbook_file_name, artifactContract.workbookFileNameDigest) &&
    digestMatches(documentExport?.zip_file_name, artifactContract.zipFileNameDigest)
  );
}

function digestFacts(values: string[]) {
  return productionA1S1ExportDigest([...values].sort().join("\n"));
}

async function readJson<T>(path: string): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    throw new Error(
      `Required ${PRODUCTION_EXPORT_CASE_KEY} export JSON is missing or invalid: ${path}`,
    );
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

export function assertProductionA1S1ExportWriteUnlock() {
  requiredProductionExportCaseKey();
  invariant(
    process.env.SUPABASE_PRODUCTION_E2E_UNLOCK === "1",
    "SUPABASE_PRODUCTION_E2E_UNLOCK=1 is required.",
  );
  invariant(
    process.env.V19_PRODUCTION_A2_S1_EXPORT_WRITE_UNLOCK ===
      REQUIRED_PRODUCTION_A2_S1_EXPORT_WRITE_UNLOCK,
    "The dedicated A2-S1 production export unlock is absent.",
  );
  invariant(
    process.env.V19_PRODUCTION_COHORT_CONFIRM_PROJECT_REF === PRODUCTION_PROJECT_REF,
    `The ${PRODUCTION_EXPORT_CASE_KEY} production export project-ref confirmation is absent or wrong.`,
  );
}

export function assertProductionA1S1ExportRepairUnlock() {
  throw new Error(
    "Terminal repair is prohibited for the A2-S1 production export rollout.",
  );
}

export function assertProductionA2S1ExportResumeUnlock() {
  assertProductionA1S1ExportWriteUnlock();
  invariant(
    process.env.V19_PRODUCTION_A2_S1_EXPORT_RESUME_UNLOCK ===
      REQUIRED_PRODUCTION_A2_S1_EXPORT_RESUME_UNLOCK,
    "The dedicated A2-S1 post-reconciliation export resume unlock is absent.",
  );
}

export function productionA1S1ExportStatePath(
  runMarker: string,
  caseKey = PRODUCTION_EXPORT_CASE_KEY,
) {
  return resolve(
    process.cwd(),
    `.production-export-${runMarker}-${caseKey}.state.local.json`,
  );
}

/**
 * The lock is intentionally run-wide. An export terminal transition and an
 * admin/agent lifecycle transition must never run concurrently for this cohort.
 */
export async function acquireProductionA1S1ExportLock(runMarker: string) {
  return acquireProductionCohortMutationLock(runMarker, "export");
}

function focusedA1S1Case(runMarker: string) {
  const cohortCase = buildProductionCohortPlan(runMarker).find(
    (candidate) => candidate.caseKey === PRODUCTION_EXPORT_CASE_KEY,
  );
  invariant(
    cohortCase,
    `${PRODUCTION_EXPORT_CASE_KEY} is absent from the production cohort plan.`,
  );
  invariant(
    cohortCase.applicantCount === 1 &&
      cohortCase.type === "single" &&
      /^A[1-3]-S[1-3]$/.test(cohortCase.caseKey),
    `${PRODUCTION_EXPORT_CASE_KEY} no longer matches the fixed one-person technical-case contract.`,
  );
  return cohortCase;
}

function validateA1S1ExportState(
  state: ProductionA1S1ExportState,
  input: { caseMarker: string; runMarker: string; submissionId: string },
) {
  invariant(state.schemaVersion === 1, "Unsupported A1-S1 production export schema.");
  invariant(
    state.projectRef === PRODUCTION_PROJECT_REF,
    "A1-S1 production export project ref mismatch.",
  );
  invariant(state.runMarker === input.runMarker, "A1-S1 export run marker mismatch.");
  invariant(
    state.caseKey === PRODUCTION_EXPORT_CASE_KEY,
    `${PRODUCTION_EXPORT_CASE_KEY} export refuses a different case checkpoint.`,
  );
  invariant(stages.has(state.stage), "A1-S1 production export stage is invalid.");
  invariant(
    state.caseMarkerDigest === productionA1S1ExportDigest(input.caseMarker) &&
      state.submissionDigest === productionA1S1ExportDigest(input.submissionId),
    "A1-S1 export checkpoint no longer matches the accepted production case.",
  );
  if (state.stage !== "pending") {
    invariant(
      state.excelProof && state.preflight,
      "A1-S1 export checkpoint lost its verified Excel or preflight proof.",
    );
  }
  if (state.stage === "artifact_verified" || state.stage === "verified") {
    invariant(state.zipProof, "A1-S1 export checkpoint lost its verified ZIP proof.");
  }
  if (state.stage === "verified") {
    invariant(
      state.postCommitUiNoticeVerified || state.postCommitTerminalProofVerified,
      "A1-S1 export checkpoint cannot claim a verified flow without post-commit proof.",
    );
  }
}

function sameProductionExportPreflight(
  left: ProductionA1S1ExportPreflight,
  right: ProductionA1S1ExportPreflight,
) {
  return (
    left.applicantDigest === right.applicantDigest &&
    left.documentAssetCount === right.documentAssetCount &&
    left.documentAssetIdentityDigest === right.documentAssetIdentityDigest &&
    left.mediaAssetCount === right.mediaAssetCount &&
    left.mediaDigest === right.mediaDigest &&
    left.rawStatus === right.rawStatus
  );
}

/**
 * A failed browser commit can leave a local artifact checkpoint even though
 * fresh production read-back is still pre-export. The dedicated resume path
 * may reuse the independently verified Excel only after an identical read-only
 * preflight, but it must discard ZIP/UI terminal claims before one retry.
 */
export function prepareProductionA2S1ExportRetryCheckpoint(
  state: ProductionA1S1ExportState,
  freshPreflight: ProductionA1S1ExportPreflight,
) {
  invariant(
    state.stage === "exporting" ||
      state.stage === "artifact_verified" ||
      state.stage === "verified",
    "A2-S1 retry checkpoint is not in an ambiguous export stage.",
  );
  invariant(
    state.preflight && state.excelProof,
    "Ambiguous A2-S1 retry requires its prior strict preflight and Excel proof.",
  );
  invariant(
    sameProductionExportPreflight(state.preflight, freshPreflight),
    "A2-S1 production facts changed after the ambiguous export attempt; retry is forbidden.",
  );
  if (state.stage === "exporting") {
    invariant(
      !state.zipProof,
      "An exporting checkpoint cannot carry a completed ZIP proof.",
    );
  } else {
    invariant(
      state.zipProof,
      "A post-artifact checkpoint lost the ZIP proof that made it ambiguous.",
    );
  }

  state.preflight = freshPreflight;
  state.stage = "excel_verified";
  delete state.zipProof;
  delete state.postCommitUiNoticeVerified;
  delete state.postCommitTerminalProofVerified;
  return state;
}

export function productionA2S1StartsInTerminalReadbackLane(
  stage: ProductionA1S1ExportState["stage"],
) {
  return stage === "artifact_verified" || stage === "verified";
}

export async function loadAcceptedA1S1ProductionExportCase(): Promise<ResolvedAcceptedA1S1ProductionExportCase> {
  assertProductionA1S1ExportWriteUnlock();
  const runMarker = requiredProductionRunMarker();
  const cohortCase = focusedA1S1Case(runMarker);
  const cohortState = await loadCohortResumeState(runMarker);
  const cohortCheckpoint = cohortState.cases[PRODUCTION_EXPORT_CASE_KEY];
  invariant(
    cohortCheckpoint?.stage === "submitted" && cohortCheckpoint.submissionId,
    `${PRODUCTION_EXPORT_CASE_KEY} must have a durable submitted cohort checkpoint before export.`,
  );
  invariant(
    cohortCheckpoint.caseMarker === cohortCase.caseMarker,
    `${PRODUCTION_EXPORT_CASE_KEY} cohort marker mismatch.`,
  );

  const lifecycleState = await readJson<ProductionLifecycleState>(
    productionLifecycleStatePath(
      runMarker,
      PRODUCTION_EXPORT_CASE_KEY,
    ),
  );
  invariant(
    lifecycleState.stage === "accepted",
    `${PRODUCTION_EXPORT_CASE_KEY} must complete admin-return-agent-fix-admin-accept before export.`,
  );
  invariant(
    lifecycleState.projectRef === PRODUCTION_PROJECT_REF &&
      lifecycleState.runMarker === runMarker &&
      lifecycleState.case.caseKey === PRODUCTION_EXPORT_CASE_KEY &&
      lifecycleState.case.ownerKey === cohortCase.ownerKey &&
      lifecycleState.case.submissionId === cohortCheckpoint.submissionId,
    `Accepted lifecycle checkpoint does not match submitted ${PRODUCTION_EXPORT_CASE_KEY}.`,
  );
  assertProductionLifecycleAcceptanceProof(lifecycleState, cohortCase.caseMarker);

  const path = productionA1S1ExportStatePath(runMarker);
  const state: ProductionA1S1ExportState = existsSync(path)
    ? await readJson<ProductionA1S1ExportState>(path)
    : {
        caseKey: PRODUCTION_EXPORT_CASE_KEY,
        caseMarkerDigest: productionA1S1ExportDigest(cohortCase.caseMarker),
        projectRef: PRODUCTION_PROJECT_REF,
        runMarker,
        schemaVersion: 1,
        stage: "pending",
        submissionDigest: productionA1S1ExportDigest(cohortCheckpoint.submissionId),
        updatedAt: new Date().toISOString(),
      };
  validateA1S1ExportState(state, {
    caseMarker: cohortCase.caseMarker,
    runMarker,
    submissionId: cohortCheckpoint.submissionId,
  });
  if (!existsSync(path)) await saveProductionA1S1ExportState(state);
  return { cohortCase, lifecycleState, state };
}

export async function saveProductionA1S1ExportState(state: ProductionA1S1ExportState) {
  state.updatedAt = new Date().toISOString();
  await writeJsonAtomic(
    productionA1S1ExportStatePath(state.runMarker, state.caseKey),
    state,
  );
}

export async function writeProductionA1S1ExportEvidence(
  runMarker: string,
  value: unknown,
) {
  const evidenceLane = `production-export-${PRODUCTION_EXPORT_CASE_KEY.toLowerCase()}`;
  const path = testArtifactPath("playwright", evidenceLane, runMarker, "evidence.json");
  await writeJsonAtomic(path, value);
  return path;
}

export async function writeProductionA2S1AbortEvidence(
  runMarker: string,
  value: unknown,
) {
  const path = testArtifactPath(
    "playwright",
    "production-export-a2-s1-abort",
    runMarker,
    "evidence.json",
  );
  await writeJsonAtomic(path, value);
  return path;
}

export async function writeProductionA2S1TerminalReadbackEvidence(
  runMarker: string,
  value: unknown,
) {
  const path = testArtifactPath(
    "playwright",
    "production-export-a2-s1-terminal-readback",
    runMarker,
    "evidence.json",
  );
  await writeJsonAtomic(path, value);
  return path;
}

export async function downloadA1S1ExportBytes(download: Download): Promise<Buffer> {
  const stream = await download.createReadStream();
  invariant(stream, "Browser download stream is unavailable.");
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const failure = await download.failure();
  invariant(!failure, "Browser download failed.");
  const bytes = Buffer.concat(chunks);
  invariant(bytes.byteLength > 0, "Browser download is empty.");
  return bytes;
}

function requestKey(request: Request) {
  const url = new URL(request.url());
  return `${request.method().toUpperCase()} ${url.pathname}`;
}

function isStaticAppRequest(request: Request) {
  const url = new URL(request.url());
  const method = request.method().toUpperCase();
  if (method !== "GET" || url.origin !== PRODUCTION_COHORT_APP_ORIGIN) {
    return false;
  }
  if (url.pathname === "/") return true;
  if (isPermittedCohortStaticRuntimeRequest(url, method)) return true;
  return (
    /^(document|font|image|script|stylesheet)$/.test(request.resourceType()) &&
    /^\/(?:assets\/)?[a-zA-Z0-9@%+.,_()/-]+\.(?:css|gif|ico|jpe?g|js|json|png|svg|webp|woff2?)$/.test(
      url.pathname,
    )
  );
}

/**
 * Browser writes are held until the downloaded ZIP has passed byte-level
 * inspection. Only the UI-owned draft and atomic completion RPCs can pass.
 */
export class StrictProductionA1S1ExportNetworkGate {
  #acceptedExportDraft: {
    payloadDigest: string;
    requestKey: "POST /rest/v1/rpc/save_submission_draft";
  } | null = null;
  #acceptedExportDraftPromise: Promise<{
    payloadDigest: string;
    requestKey: "POST /rest/v1/rpc/save_submission_draft";
  }> | null = null;
  #acceptedExportDraftResolve:
    | ((proof: {
        payloadDigest: string;
        requestKey: "POST /rest/v1/rpc/save_submission_draft";
      }) => void)
    | null = null;
  #businessPhase = false;
  #businessReleaseDecision: "cancel" | "release" | null = null;
  #businessReleasePromise: Promise<"cancel" | "release"> | null = null;
  #businessReleaseResolve: ((decision: "cancel" | "release") => void) | null = null;
  #exportMutationTimestampWindow: ProductionMutationTimestampWindow | null = null;
  #lastBasePayloadMismatchCode: string | null = null;
  readonly #networkContract: ProductionA1S1ExportNetworkContract | null;
  #verifiedArtifactContract: ProductionA1S1VerifiedArtifactContract | null = null;
  #passwordLoginAttempts = 0;
  #successfulPasswordLogins = 0;
  readonly #mutations: ObservedMutation[] = [];
  readonly #requestCounts = new Map<string, number>();
  #violations: Array<{ digest: string; reason: BlockedRequestReason }> = [];

  constructor(networkContract?: ProductionA1S1ExportNetworkContract) {
    if (!networkContract) {
      this.#networkContract = null;
      return;
    }
    invariant(
      networkContract.preCommitStatus === "ready_for_excel" &&
        typeof networkContract.adminId === "string" &&
        networkContract.adminId.length > 0 &&
        typeof networkContract.ownerId === "string" &&
        networkContract.ownerId.length > 0 &&
        typeof networkContract.submissionId === "string" &&
        networkContract.submissionId.length > 0 &&
        exactStringSet(networkContract.documentAssetIds, networkContract.documentAssetIds) &&
        networkContract.documentAssetIds.length === 3 &&
        networkContract.documentAssetIds.every((id) => id.length > 0),
      "A1-S1 export network gate requires an exact runtime-only preflight contract.",
    );
    this.#networkContract = {
      adminId: networkContract.adminId,
      draft: {
        applicants: networkContract.draft.applicants.map((item) => ({ ...item })),
        corrections: networkContract.draft.corrections.map((item) => ({ ...item })),
        effectiveHistoryCount: networkContract.draft.effectiveHistoryCount,
        mediaAssets: networkContract.draft.mediaAssets.map((item) => ({ ...item })),
        questionnaireAnswers: networkContract.draft.questionnaireAnswers.map((item) => ({
          ...item,
        })),
        snapshot: { ...networkContract.draft.snapshot },
        snapshotHistory: networkContract.draft.snapshotHistory.map((item) => ({ ...item })),
        snapshotIssueCount: networkContract.draft.snapshotIssueCount,
        snapshotIssues: networkContract.draft.snapshotIssues.map((item) => ({ ...item })),
        snapshotUntypedHistoryDigests: [
          ...networkContract.draft.snapshotUntypedHistoryDigests,
        ],
        statusHistory: networkContract.draft.statusHistory.map((item) => ({ ...item })),
        submission: { ...networkContract.draft.submission },
      },
      documentAssetIds: [...networkContract.documentAssetIds],
      ownerId: networkContract.ownerId,
      preCommitStatus: networkContract.preCommitStatus,
      submissionId: networkContract.submissionId,
    };
  }

  #recordBlockedRequest(request: Request, reason: BlockedRequestReason) {
    const url = new URL(request.url());
    this.#violations.push({
      digest: productionA1S1ExportDigest(
        `${request.method().toUpperCase()}:${url.origin}:${url.pathname}:${reason}`,
      ).slice(0, 16),
      reason,
    });
  }

  #hasBasePayload(request: Request, key: string) {
    const networkContract = this.#networkContract;
    if (!networkContract) return false;
    const timestampWindow =
      key === "POST /rest/v1/rpc/save_submission_draft"
        ? (this.#exportMutationTimestampWindow ?? exportMutationTimestampWindow())
        : null;
    const matches = baseExportPayloadMatches(
      request.postData(),
      key,
      networkContract,
      timestampWindow,
    );
    this.#lastBasePayloadMismatchCode = matches
      ? null
      : baseExportPayloadMismatchCode(
          request.postData(),
          key,
          networkContract,
          timestampWindow,
        );
    if (matches && timestampWindow && !this.#exportMutationTimestampWindow) {
      this.#exportMutationTimestampWindow = timestampWindow;
    }
    return matches;
  }

  #hasVerifiedArtifactPayload(request: Request, key: string) {
    const networkContract = this.#networkContract;
    const artifactContract = this.#verifiedArtifactContract;
    return Boolean(
      networkContract &&
        artifactContract &&
        productionA1S1ExportPayloadMatches(
          request.postData(),
          key,
          networkContract,
          artifactContract,
          this.#exportMutationTimestampWindow,
        ),
    );
  }

  async attach(context: BrowserContext) {
    context.on("response", (response) => {
      const request = response.request();
      const url = new URL(response.url());
      if (
        url.origin === PRODUCTION_SUPABASE_ORIGIN &&
        request.method().toUpperCase() === "POST" &&
        url.pathname === "/auth/v1/token" &&
        url.searchParams.get("grant_type") === "password" &&
        response.status() >= 200 &&
        response.status() < 300
      ) {
        this.#successfulPasswordLogins += 1;
      }
    });
    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const method = request.method().toUpperCase();
      if (isStaticAppRequest(request)) {
        await route.continue();
        return;
      }
      if (
        url.origin === PRODUCTION_SUPABASE_ORIGIN &&
        /^(GET|HEAD|OPTIONS)$/.test(method)
      ) {
        await route.continue();
        return;
      }
      if (
        url.origin === PRODUCTION_SUPABASE_ORIGIN &&
        method === "POST" &&
        url.pathname === "/auth/v1/token" &&
        url.searchParams.get("grant_type") === "password" &&
        this.#passwordLoginAttempts < maxPasswordLoginAttempts
      ) {
        this.#passwordLoginAttempts += 1;
        await route.continue();
        return;
      }
      if (
        url.origin === PRODUCTION_SUPABASE_ORIGIN &&
        method === "POST" &&
        url.pathname === "/auth/v1/token" &&
        url.searchParams.get("grant_type") === "refresh_token"
      ) {
        await route.continue();
        return;
      }

      const key = requestKey(request);
      const maxCount = businessMutationAllowlist.get(key);
      const count = this.#requestCounts.get(key) ?? 0;
      if (
        this.#businessPhase &&
        url.origin === PRODUCTION_SUPABASE_ORIGIN &&
        maxCount !== undefined &&
        count < maxCount
      ) {
        if (!this.#hasBasePayload(request, key)) {
          this.#recordBlockedRequest(request, "payload-contract");
          await route.abort("blockedbyclient");
          return;
        }
        const releasePromise = this.#businessReleasePromise;
        if (!releasePromise) {
          this.#recordBlockedRequest(request, "missing-release-gate");
          await route.abort("blockedbyclient");
          return;
        }
        this.#requestCounts.set(key, count + 1);
        if (key === "POST /rest/v1/rpc/save_submission_draft") {
          const acceptedExportDraft = {
            payloadDigest: productionA1S1ExportDigest(request.postData() ?? ""),
            requestKey: key,
          } as const;
          if (
            this.#acceptedExportDraft &&
            this.#acceptedExportDraft.payloadDigest !==
              acceptedExportDraft.payloadDigest
          ) {
            this.#recordBlockedRequest(request, "payload-contract");
            await route.abort("blockedbyclient");
            return;
          }
          if (!this.#acceptedExportDraft) {
            this.#acceptedExportDraft = acceptedExportDraft;
            this.#acceptedExportDraftResolve?.(acceptedExportDraft);
            this.#acceptedExportDraftResolve = null;
          }
        }
        const decision = await releasePromise;
        if (!this.#hasVerifiedArtifactPayload(request, key)) {
          this.#recordBlockedRequest(request, "verified-artifact-contract");
          await route.abort("blockedbyclient");
          return;
        }
        if (decision === "cancel") {
          await route.abort("blockedbyclient");
          return;
        }
        await route.continue();
        return;
      }

      this.#recordBlockedRequest(request, "route-contract");
      await route.abort("blockedbyclient");
    });
  }

  attachPage(page: Page) {
    page.on("requestfailed", (request) => {
      const url = new URL(request.url());
      if (
        url.origin === PRODUCTION_SUPABASE_ORIGIN &&
        /^(POST|PUT|PATCH|DELETE)$/.test(request.method()) &&
        !request.url().includes("/auth/v1/token")
      ) {
        this.#mutations.push({
          method: request.method().toUpperCase(),
          path: url.pathname,
          status: 0,
        });
      }
    });
    page.on("response", (response) => {
      const request = response.request();
      const url = new URL(response.url());
      if (
        url.origin === PRODUCTION_SUPABASE_ORIGIN &&
        /^(POST|PUT|PATCH|DELETE)$/.test(request.method()) &&
        !response.url().includes("/auth/v1/token")
      ) {
        this.#mutations.push({
          method: request.method().toUpperCase(),
          path: url.pathname,
          status: response.status(),
        });
      }
    });
  }

  assertLoginCompleted() {
    invariant(
      this.#passwordLoginAttempts > 0 &&
        this.#passwordLoginAttempts <= maxPasswordLoginAttempts,
      "Password login exceeded the bounded retry contract.",
    );
    invariant(
      this.#successfulPasswordLogins === 1,
      "Exactly one password login must succeed.",
    );
  }

  beginExport() {
    invariant(!this.#businessPhase, "Export mutation phase is already active.");
    invariant(
      this.#networkContract,
      "A1-S1 export mutations require the resolved read-only preflight contract.",
    );
    invariant(
      this.#mutations.length === 0,
      "Business mutation occurred before A1-S1 ZIP export intent.",
    );
    this.#businessPhase = true;
    this.#businessReleaseDecision = null;
    this.#lastBasePayloadMismatchCode = null;
    this.#acceptedExportDraft = null;
    this.#acceptedExportDraftPromise = new Promise((resolve) => {
      this.#acceptedExportDraftResolve = resolve;
    });
    this.#verifiedArtifactContract = null;
    this.#businessReleasePromise = new Promise((resolve) => {
      this.#businessReleaseResolve = resolve;
    });
  }

  bindVerifiedArtifact(contract: ProductionA1S1VerifiedArtifactContract) {
    invariant(this.#businessPhase, "Export mutation phase is not active.");
    invariant(
      this.#businessReleaseDecision === null,
      "Verified artifact cannot bind after the export decision.",
    );
    invariant(
      Object.values(contract).every(
        (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value),
      ),
      "Verified A2-S1 export artifact contract is invalid.",
    );
    this.#verifiedArtifactContract = { ...contract };
  }

  async waitForAcceptedExportDraft(timeoutMs = 90_000) {
    invariant(this.#businessPhase, "Export mutation phase is not active.");
    const acceptedExportDraftPromise = this.#acceptedExportDraftPromise;
    invariant(
      acceptedExportDraftPromise,
      "Accepted export draft capture is unavailable.",
    );
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        acceptedExportDraftPromise,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () =>
              reject(
                new Error(
                  `Timed out waiting for the accepted export draft (${this.#lastBasePayloadMismatchCode ?? "request_absent"}).`,
                ),
              ),
            timeoutMs,
          );
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  releaseExportMutations() {
    invariant(this.#businessPhase, "Export mutation phase is not active.");
    invariant(
      this.#businessReleaseDecision === null && this.#businessReleaseResolve,
      "Export mutation decision is already fixed.",
    );
    invariant(
      this.#verifiedArtifactContract,
      "Verified A2-S1 ZIP/XLSX artifact identity is required before release.",
    );
    this.#businessReleaseDecision = "release";
    this.#businessReleaseResolve("release");
    this.#businessReleaseResolve = null;
  }

  get hasReleasedExportMutations() {
    return this.#businessReleaseDecision === "release";
  }

  cancelExportMutations() {
    if (!this.#businessPhase || this.#businessReleaseDecision !== null) return;
    invariant(
      this.#businessReleaseResolve,
      "Export mutation cancellation cannot be delivered.",
    );
    this.#businessReleaseDecision = "cancel";
    this.#businessReleaseResolve("cancel");
    this.#businessReleaseResolve = null;
  }

  finishExport() {
    invariant(this.#businessPhase, "Export mutation phase is not active.");
    invariant(
      this.#businessReleaseDecision !== null,
      "Export mutation phase ended without an explicit release or cancellation.",
    );
    this.#businessPhase = false;
    this.#exportMutationTimestampWindow = null;
    this.#businessReleasePromise = null;
    this.#acceptedExportDraftPromise = null;
    this.#acceptedExportDraftResolve = null;
  }

  assertReadOnly() {
    invariant(!this.#businessPhase, "Export mutation phase remained active.");
    invariant(this.#mutations.length === 0, "Read-only export phase mutated data.");
    invariant(this.#violations.length === 0, "Unapproved network request was blocked.");
  }

  assertAbortedExportDraft() {
    invariant(!this.#businessPhase, "Export mutation phase remained active.");
    invariant(
      this.#businessReleaseDecision === "cancel",
      "Abort-only export did not end with an explicit cancellation.",
    );
    invariant(
      this.#acceptedExportDraft?.requestKey ===
        "POST /rest/v1/rpc/save_submission_draft" &&
        /^[a-f0-9]{64}$/.test(this.#acceptedExportDraft.payloadDigest),
      "Abort-only export did not capture an accepted draft identity.",
    );
    invariant(
      this.#verifiedArtifactContract,
      "Abort-only export did not bind the accepted draft to verified XLSX/ZIP bytes.",
    );
    invariant(this.#violations.length === 0, "Unapproved network request was blocked.");
    invariant(
      (this.#requestCounts.get("POST /rest/v1/rpc/save_submission_draft") ?? 0) ===
        2,
      "Abort-only export must capture the initial save and its one bounded retry.",
    );
    invariant(
      (this.#requestCounts.get("POST /rest/v1/rpc/complete_export_package") ??
        0) === 0,
      "Abort-only export must not start complete_export_package.",
    );
    invariant(
      this.#mutations.length === 2 &&
        this.#mutations.every(
          (mutation) =>
            mutation.method === "POST" &&
            mutation.path === "/rest/v1/rpc/save_submission_draft" &&
            mutation.status === 0,
        ),
      "Abort-only export must observe two client-aborted save attempts and no business response.",
    );
  }

  assertSuccessfulExport() {
    invariant(!this.#businessPhase, "Export mutation phase remained active.");
    invariant(
      this.#businessReleaseDecision === "release",
      "Production export mutations were not released after artifact verification.",
    );
    invariant(this.#violations.length === 0, "Unapproved network request was blocked.");
    const failed = this.#mutations.find(
      (mutation) => mutation.status < 200 || mutation.status >= 300,
    );
    invariant(
      !failed,
      `Production export mutation failed (${failed?.method ?? "unknown"} ${failed?.path ?? "unknown"}).`,
    );
    const keys = this.#mutations.map(
      (mutation) => `${mutation.method} ${mutation.path}`,
    );
    invariant(
      keys.filter((key) => key === "POST /rest/v1/rpc/save_submission_draft").length ===
        1,
      "Successful export must persist only the pre-commit downloaded state.",
    );
    invariant(
      keys.filter((key) => key === "POST /rest/v1/rpc/complete_export_package")
        .length === 1,
      "Successful export must call complete_export_package exactly once.",
    );
    invariant(
      !keys.includes("PATCH /rest/v1/document_assets"),
      "Successful export must not directly patch document assets outside complete_export_package.",
    );
    invariant(
      !keys.includes("POST /rest/v1/document_export_events"),
      "Successful export must not directly create document audit outside complete_export_package.",
    );
  }

  summary(): CohortMutationSummary[] {
    const grouped = new Map<string, CohortMutationSummary>();
    for (const mutation of this.#mutations) {
      const key = `${mutation.method} ${mutation.path} ${mutation.status}`;
      const current = grouped.get(key);
      grouped.set(key, {
        count: (current?.count ?? 0) + 1,
        method: mutation.method,
        path: mutation.path,
        status: mutation.status,
      });
    }
    return [...grouped.values()].sort((left, right) =>
      `${left.method} ${left.path} ${left.status}`.localeCompare(
        `${right.method} ${right.path} ${right.status}`,
      ),
    );
  }

  violationSummary() {
    const counts = new Map<BlockedRequestReason, number>();
    for (const violation of this.#violations) {
      counts.set(violation.reason, (counts.get(violation.reason) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([reason, count]) => ({ count, reason }))
      .sort((left, right) => left.reason.localeCompare(right.reason));
  }
}

function productionPublicEnvironment() {
  const path = resolve(
    process.cwd(),
    process.env.SUPABASE_UI_E2E_ENV_FILE ?? ".env.supabase-production.local",
  );
  invariant(existsSync(path), "The production public environment is absent.");
  const values: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    values[trimmed.slice(0, separator).trim()] = trimmed
      .slice(separator + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
  }
  invariant(
    values.VITE_SUPABASE_PROJECT_ID === PRODUCTION_PROJECT_REF,
    "A1-S1 export read-only preflight refuses an unapproved Supabase project ref.",
  );
  invariant(
    values.VITE_SUPABASE_URL === PRODUCTION_SUPABASE_ORIGIN,
    "A1-S1 export read-only preflight refuses an unapproved Supabase URL.",
  );
  invariant(
    values.VITE_SUPABASE_BACKEND_TARGET === "supabase",
    "A1-S1 export read-only preflight requires Supabase production.",
  );
  const publishableKey = values.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";
  invariant(
    publishableKey.startsWith("sb_publishable_"),
    "A1-S1 export read-only preflight is missing the production publishable key.",
  );
  return { publishableKey };
}

async function delay(milliseconds: number) {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

/**
 * This client is used exclusively for production read/auth preflight and
 * terminal reconciliation. Retries are deliberately unavailable to browser
 * business writes, which remain controlled by the Playwright route gate.
 */
async function resilientProductionReadFetch(
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
): Promise<Response> {
  const initial = new Request(input, init);
  const url = new URL(initial.url);
  const method = initial.method.toUpperCase();
  const isPasswordAuth = method === "POST" && url.pathname === "/auth/v1/token";
  const retryable = method === "GET" || method === "HEAD" || isPasswordAuth;
  const attempts = retryable ? 4 : 1;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(
        new Request(initial.clone(), { signal: controller.signal }),
      );
      if (
        attempt < attempts &&
        [408, 429, 500, 502, 503, 504].includes(response.status)
      ) {
        await delay(attempt * 500);
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await delay(attempt * 500);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError ?? new Error("A1-S1 production read retry loop exhausted.");
}

async function createReadOnlyProductionAdminClient(admin: ProductionCohortAccount) {
  invariant(admin.role === "admin", "A1-S1 export read-only preflight requires admin.");
  const { publishableKey } = productionPublicEnvironment();
  const client = createClient<Database>(PRODUCTION_SUPABASE_ORIGIN, publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: { fetch: resilientProductionReadFetch },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email: admin.email,
    password: admin.password,
  });
  invariant(
    !error && data.session?.access_token,
    "A1-S1 export read-only preflight admin sign-in failed.",
  );
  return client;
}

async function readA1S1ProductionRowsWithClient(input: {
  submissionId: string;
  client: ReturnType<typeof createClient<Database>>;
}) {
  const [
    submissionResult,
    applicantsResult,
    documentsResult,
    mediaResult,
    correctionsResult,
    questionnaireAnswersResult,
    historyResult,
  ] =
    await Promise.all([
      input.client
        .from("submissions")
        .select(
          "id,agent_id,type,title,country,city,travel_date,trip_date_from,trip_date_to,status,priority,readiness_percent,family_intelligence,appointment_status,submitted_at,review_started_at,accepted_at,exported_at,updated_at",
        )
        .eq("id", input.submissionId)
        .maybeSingle(),
      input.client
        .from("applicants")
        .select(
          "id,submission_id,full_name,role,suggested_role,role_confirmed,birth_date,patronymic,citizenship,address,phone,email,passport_number,passport_issued_at,passport_expires_at,country,city,trip_dates,hotel_name,hotel_address,questionnaire_percent,media_percent",
        )
        .eq("submission_id", input.submissionId),
      input.client
        .from("document_assets")
        .select(
          "id,source_media_asset_id,submission_id,applicant_id,type,upload_status,validation_status,export_status",
        )
        .eq("submission_id", input.submissionId),
      input.client
        .from("media_assets")
        .select(
          "id,applicant_id,submission_id,type,original_file_name,generated_file_name,storage_bucket,storage_path,mime_type,size_bytes,upload_status,review_status,uploaded_at,reviewed_at,reviewed_by",
        )
        .eq("submission_id", input.submissionId),
      input.client
        .from("corrections")
        .select(
          "id,submission_id,applicant_id,scope,field_key,media_type,reason,severity,status,created_by,created_at,fixed_at",
        )
        .eq("submission_id", input.submissionId),
      input.client
        .from("questionnaire_answers")
        .select("submission_id,applicant_id,section_id,field_id,label,value")
        .eq("submission_id", input.submissionId),
      input.client
        .from("status_history")
        .select(
          "id,entity_type,entity_id,from_status,to_status,comment,changed_by,changed_at,note,source",
        )
        .eq("entity_type", "submission")
        .eq("entity_id", input.submissionId),
    ]);
  invariant(!submissionResult.error && submissionResult.data, "A1-S1 submission is unreadable.");
  invariant(!applicantsResult.error, "A1-S1 applicants are unreadable.");
  invariant(!documentsResult.error, "A1-S1 document assets are unreadable.");
  invariant(!mediaResult.error, "A1-S1 media assets are unreadable.");
  invariant(!questionnaireAnswersResult.error, "A1-S1 questionnaire answers are unreadable.");
  invariant(!correctionsResult.error, "A1-S1 corrections are unreadable.");
  invariant(!historyResult.error, "A1-S1 status history is unreadable.");
  return {
    applicants: (applicantsResult.data ?? []) as unknown as ProductionApplicantRow[],
    corrections: (correctionsResult.data ?? []) as unknown as ProductionCorrectionRow[],
    documents: (documentsResult.data ?? []) as unknown as ProductionDocumentAssetRow[],
    history: (historyResult.data ?? []) as unknown as ProductionStatusHistoryRow[],
    media: (mediaResult.data ?? []) as unknown as ProductionMediaAssetRow[],
    questionnaireAnswers: (questionnaireAnswersResult.data ?? []) as unknown as ProductionQuestionnaireAnswerRow[],
    submission: submissionResult.data as unknown as ProductionSubmissionRow,
  };
}

async function readA1S1ProductionRows(input: {
  admin: ProductionCohortAccount;
  submissionId: string;
}) {
  const client = await createReadOnlyProductionAdminClient(input.admin);
  return readA1S1ProductionRowsWithClient({
    client,
    submissionId: input.submissionId,
  });
}

function requiredSnapshotFacts(
  value: unknown,
  historyRows: readonly ProductionStatusHistoryRow[],
  mediaRows: readonly ProductionMediaAssetRow[],
) {
  const intelligence = jsonRecord(value);
  const envelope = jsonRecord(intelligence?.v19CockpitSnapshot);
  const snapshot = jsonRecord(envelope?.submission);
  invariant(
    intelligence?.status === "unreviewed" && envelope?.version === 1 && snapshot,
    "A2-S1 draft identity requires the canonical v19 cockpit snapshot.",
  );
  invariant(
    Array.isArray(snapshot.history) && Array.isArray(snapshot.issues),
    "A2-S1 cockpit snapshot is missing history or issues identity arrays.",
  );
  const sourceSnapshot = readCockpitSnapshot(
    value as Database["public"]["Tables"]["submissions"]["Row"]["family_intelligence"],
  );
  invariant(sourceSnapshot, "A2-S1 cockpit snapshot cannot be hydrated.");
  const hydratedSnapshot = attachDurableMediaAssetRows(
    sourceSnapshot,
    mediaRows as Database["public"]["Tables"]["media_assets"]["Row"][],
  );
  const hydratedIntelligence = JSON.parse(
    JSON.stringify({
      ...intelligence,
      v19CockpitSnapshot: {
        ...envelope,
        submission: hydratedSnapshot,
      },
    }),
  ) as unknown;
  const exportContentDigest = productionDraftSnapshotContentDigest(
    hydratedIntelligence,
    "export",
  );
  const lifecycleContentDigest = productionDraftSnapshotContentDigest(
    hydratedIntelligence,
    "lifecycle",
  );
  const effectiveHistory = productionDraftEffectiveSnapshotHistory({
    familyIntelligence: value,
    statusHistory: historyRows,
  });
  invariant(
    exportContentDigest && lifecycleContentDigest && effectiveHistory,
    "A2-S1 canonical snapshot identity cannot be resolved.",
  );
  return {
    ...effectiveHistory,
    exportContentDigest,
    issueCount: snapshot.issues.length,
    lifecycleContentDigest,
  };
}

function draftPayloadIdentityFromRows(input: {
  correctionMarker?: string;
  expectedApplicantCount?: number;
  ownerId: string;
  rows: Awaited<ReturnType<typeof readA1S1ProductionRows>>;
  submissionId: string;
}): ProductionDraftPayloadIdentityContract {
  const { rows, submissionId } = input;
  const expectedApplicantCount = input.expectedApplicantCount ?? 1;
  invariant(
    rows.submission.id === submissionId && rows.submission.agent_id === input.ownerId,
    "A2-S1 draft identity owner or submission no longer matches the declared cohort target.",
  );
  invariant(
    Number.isInteger(expectedApplicantCount) &&
      expectedApplicantCount > 0 &&
      rows.applicants.length === expectedApplicantCount &&
      rows.applicants.every((row) => row.submission_id === submissionId),
    "Production draft identity applicant count does not match the exact target.",
  );
  invariant(
    rows.media.length === expectedApplicantCount * 3 &&
      rows.media.every((row) => row.submission_id === submissionId),
    "Production draft identity media count does not match the exact target.",
  );
  invariant(
    rows.questionnaireAnswers.length === expectedApplicantCount * 77 &&
      rows.questionnaireAnswers.every((row) => row.submission_id === submissionId),
    "Production draft identity questionnaire count does not match the exact target.",
  );
  const snapshotFacts = requiredSnapshotFacts(
    rows.submission.family_intelligence,
    rows.history,
    rows.media,
  );
  const snapshotFieldErrors = productionDraftSnapshotFieldErrorIdentities(
    rows.submission.family_intelligence,
  );
  const snapshotIssues = productionDraftSnapshotIssueIdentities(
    rows.submission.family_intelligence,
  );
  invariant(
    snapshotFieldErrors && snapshotIssues,
    "A2-S1 snapshot field-error or issue identity cannot be resolved.",
  );
  invariant(
    snapshotIssues.length === snapshotFacts.issueCount,
    "A2-S1 snapshot issue identity count is inconsistent.",
  );
  const snapshotErrorByQuestionnaireKey = new Map(
    snapshotFieldErrors.map((field) => [
      `${field.applicantId}\u0000${field.sectionId}\u0000${field.fieldId}`,
      field.errorDigest,
    ]),
  );
  const applicantIds = new Set(rows.applicants.map((row) => row.id));
  invariant(
    applicantIds.size === expectedApplicantCount &&
      rows.media.every((row) => applicantIds.has(row.applicant_id)) &&
      rows.questionnaireAnswers.every((row) => applicantIds.has(row.applicant_id)),
    "Production draft identity has a child outside its exact applicant set.",
  );

  const questionnaireAnswers = rows.questionnaireAnswers.map((row) => {
    const labelDigest = productionDraftValueDigest(row.label);
    const valueIdentity = productionDraftQuestionnaireValueIdentity(row.value);
    invariant(labelDigest && valueIdentity, "A2-S1 questionnaire identity cannot be digested.");
    const snapshotErrorDigest = snapshotErrorByQuestionnaireKey.get(
      `${row.applicant_id}\u0000${row.section_id}\u0000${row.field_id}`,
    );
    invariant(
      snapshotErrorDigest !== undefined ||
        snapshotErrorByQuestionnaireKey.has(
          `${row.applicant_id}\u0000${row.section_id}\u0000${row.field_id}`,
        ),
      "A2-S1 questionnaire row is absent from the cockpit snapshot.",
    );
    return {
      applicantId: row.applicant_id,
      fieldId: row.field_id,
      labelDigest,
      logicalValueDigest: valueIdentity.logicalValueDigest,
      sectionId: row.section_id,
      snapshotErrorDigest: snapshotErrorDigest ?? null,
      submissionId: row.submission_id,
      valueDigest: valueIdentity.valueDigest,
      valueStructureDigest: valueIdentity.valueStructureDigest,
    };
  });
  invariant(
    new Set(
      questionnaireAnswers.map((row) => `${row.applicantId}\u0000${row.sectionId}\u0000${row.fieldId}`),
    ).size === questionnaireAnswers.length &&
      snapshotErrorByQuestionnaireKey.size === questionnaireAnswers.length,
    "A2-S1 questionnaire identity contains duplicate answer keys.",
  );

  const mediaAssets = rows.media.map((row) => {
    const contentDigest = productionDraftMediaContentDigest(row);
    const storagePathDigest = productionDraftValueDigest(row.storage_path);
    invariant(
      contentDigest && storagePathDigest,
      "A2-S1 media content identity cannot be digested.",
    );
    return {
      applicantId: row.applicant_id,
      contentDigest,
      id: row.id,
      storageBucket: row.storage_bucket,
      storagePathDigest,
      submissionId: row.submission_id,
      type: row.type,
    };
  });
  invariant(
    new Set(mediaAssets.map((row) => row.id)).size === mediaAssets.length,
    "A2-S1 media identity contains duplicate asset IDs.",
  );

  const corrections = rows.corrections.map((row) => {
    const reasonDigest = productionDraftValueDigest(row.reason);
    invariant(reasonDigest, "A2-S1 correction identity cannot be digested.");
    return {
      applicantId: row.applicant_id,
      createdAt: row.created_at,
      fieldKey: row.field_key,
      fixedAt: row.fixed_at,
      id: row.id,
      mediaType: row.media_type,
      reasonDigest,
      scope: row.scope,
      severity: row.severity,
      status: row.status,
      submissionId: row.submission_id,
      targetMarker: Boolean(
        input.correctionMarker && row.reason.includes(input.correctionMarker),
      ),
    };
  });
  invariant(
    new Set(corrections.map((row) => row.id)).size === corrections.length &&
      corrections.every((row) => row.submissionId === submissionId),
    "A2-S1 correction identity contains duplicate or cross-submission rows.",
  );

  const effectiveHistoryById = new Map(
    snapshotFacts.snapshotHistory.map((row) => [row.id, row]),
  );
  const statusHistory = rows.history.flatMap((row) => {
    const effective = effectiveHistoryById.get(row.id);
    if (!effective || effective.fromStatus === null) return [];
    return [
      {
        changedAt: row.changed_at,
        commentDigest: effective.commentDigest,
        entityId: row.entity_id,
        entityType: row.entity_type,
        fromStatus: effective.fromStatus,
        id: row.id,
        noteDigest: effective.noteDigest,
        source: effective.source,
        toStatus: effective.toStatus,
      },
    ];
  });
  invariant(
    new Set(statusHistory.map((row) => row.id)).size === statusHistory.length &&
      statusHistory.every(
        (row) => row.entityType === "submission" && row.entityId === submissionId,
      ),
    "A2-S1 status-history identity contains duplicate or cross-submission rows.",
  );

  return {
    applicants: rows.applicants.map((row) => ({
      contentDigest: (() => {
        const digest = productionDraftApplicantContentDigest(row);
        invariant(digest, "A2-S1 applicant content identity cannot be digested.");
        return digest;
      })(),
      id: row.id,
      submissionId: row.submission_id,
    })),
    corrections,
    effectiveHistoryCount: snapshotFacts.effectiveHistoryCount,
    mediaAssets,
    questionnaireAnswers,
    snapshot: {
      exportContentDigest: snapshotFacts.exportContentDigest,
      lifecycleContentDigest: snapshotFacts.lifecycleContentDigest,
    },
    snapshotHistory: snapshotFacts.snapshotHistory,
    snapshotIssueCount: snapshotFacts.issueCount,
    snapshotIssues,
    snapshotUntypedHistoryDigests: snapshotFacts.snapshotUntypedHistoryDigests,
    statusHistory,
    submission: {
      staticContentDigest: (() => {
        const digest = productionDraftSubmissionStaticContentDigest(rows.submission);
        invariant(digest, "A2-S1 root submission identity cannot be digested.");
        return digest;
      })(),
    },
  };
}

export type ResolvedProductionCohortDraftPayloadIdentity = {
  applicantIdsInSnapshotOrder: string[];
  applicantProjection?: NonNullable<
    ProductionDraftPayloadMutationContract["applicantProjection"]
  >;
  draft: ProductionDraftPayloadIdentityContract;
  historyProjection?: {
    mode: "replace_exact";
    rows: readonly ProductionDraftProjectedStatusHistoryIdentity[];
  };
  historyTransition?: NonNullable<
    ProductionDraftHistoryExpectation["transition"]
  >;
  mediaProjection?: NonNullable<
    ProductionDraftPayloadMutationContract["mediaProjection"]
  >;
  questionnaireProjection?: NonNullable<
    ProductionDraftPayloadMutationContract["questionnaireProjection"]
  >;
  snapshotMutation?: ProductionDraftSnapshotMutation;
  snapshotHistoryProjection?: NonNullable<
    ProductionDraftPayloadMutationContract["snapshotHistoryProjection"]
  >;
  snapshotProjection?: NonNullable<
    ProductionDraftPayloadMutationContract["snapshotProjection"]
  >;
  submissionProjection?: NonNullable<
    ProductionDraftPayloadMutationContract["submissionProjection"]
  >;
};

/** Read-only, runtime-only nested identity for lifecycle and export network gates. */
export async function resolveProductionCohortDraftPayloadIdentity(input: {
  admin: ProductionCohortAccount;
  applicantEmailReplacement?: { applicantId: string; email: string };
  applicantSerializerProjection?: {
    actorId: string;
    allowedDriftFields: readonly ("email" | "questionnaire_percent")[];
  };
  questionnaireSerializerProjection?: {
    allowedLabelDriftFieldIds: readonly ("appointment-note" | "hotel-name")[];
  };
  submissionProjectionIntent?:
    | {
        actorId: string;
        intent: ProductionDraftSnapshotMutationIntent;
        mode: "snapshot_mutation";
      }
    | {
        actorId: string;
        applicantId: string;
        fieldId: string;
        mode: "questionnaire_replace";
        value: string;
      }
    | {
        action: SubmissionAction;
        actorId: string;
        mode: "submission_action";
        role: Role;
      };
  correctionMarker?: string;
  expectedApplicantCount?: number;
  ownerId: string;
  snapshotMutationIntent?: ProductionDraftSnapshotMutationIntent;
  submissionId: string;
}): Promise<ResolvedProductionCohortDraftPayloadIdentity> {
  const rows = await readA1S1ProductionRows(input);
  const draft = draftPayloadIdentityFromRows({
    ...input,
    expectedApplicantCount: input.expectedApplicantCount ?? 1,
    rows,
  });
  const hydratedSnapshot = (() => {
    const snapshot = readCockpitSnapshot(
      rows.submission.family_intelligence as Database["public"]["Tables"]["submissions"]["Row"]["family_intelligence"],
    );
    invariant(snapshot, "Production cockpit snapshot is unreadable for projection.");
    const withMedia = attachDurableMediaAssetRows(
      snapshot,
      rows.media as Database["public"]["Tables"]["media_assets"]["Row"][],
    );
    return attachDurableStatusHistoryRows(
      withMedia,
      rows.history as Database["public"]["Tables"]["status_history"]["Row"][],
    );
  })();
  const projectedSubmission = (() => {
    const intent = input.submissionProjectionIntent;
    if (!intent) return undefined;
    let projected: Submission;
    if (intent.mode === "submission_action") {
      const result = applySubmissionActionResult(
        hydratedSnapshot,
        intent.action,
        intent.role,
        intent.actorId,
      );
      invariant(result.ok, "Production submission action projection was rejected.");
      projected = result.data;
    } else if (intent.mode === "questionnaire_replace") {
      const applicant = hydratedSnapshot.applicants.find(
        (item) => item.id === intent.applicantId,
      );
      const section = applicant?.sections.find((candidate) =>
        candidate.fields.some((field) => field.id === intent.fieldId),
      );
      invariant(section, "Production questionnaire projection target is absent.");
      projected = withRecalculatedSubmissionProgress(
        normalizeSubmissionQuestionnaire({
          ...updateQuestionnaireField(hydratedSnapshot, {
            applicantId: intent.applicantId,
            fieldId: intent.fieldId,
            sectionId: section.id,
            value: intent.value,
          }),
          updatedAt: "сейчас",
        }),
      );
    } else if (intent.intent.mode === "add_issue") {
      const applicant = hydratedSnapshot.applicants.find(
        (item) =>
          !intent.intent.applicantId || item.id === intent.intent.applicantId,
      );
      const section = applicant?.sections.find((candidate) =>
        candidate.fields.some(
          (field) =>
            (!intent.intent.fieldId || field.id === intent.intent.fieldId) &&
            field.label === intent.intent.fieldLabel,
        ),
      );
      const field = section?.fields.find(
        (candidate) =>
          (!intent.intent.fieldId || candidate.id === intent.intent.fieldId) &&
          candidate.label === intent.intent.fieldLabel,
      );
      invariant(applicant && field, "Production issue projection target is absent.");
      projected = addPreciseAdminIssue(
        hydratedSnapshot,
        {
          applicantId: applicant.id,
          comment: intent.intent.comment,
          field: field.label,
          reason: intent.intent.reason,
          section: intent.intent.section,
          severity: "blocker",
          type: "field",
        },
        intent.actorId,
      );
      invariant(
        projected !== hydratedSnapshot,
        "Production issue projection did not mutate the snapshot.",
      );
    } else {
      const issue = hydratedSnapshot.issues.find(
        (candidate) =>
          candidate.status === "open" &&
          candidate.reason === intent.intent.reason &&
          candidate.comment === intent.intent.comment,
      );
      invariant(issue, "Production fixed-issue projection target is absent.");
      const result = markSubmissionIssueFixedResult(
        hydratedSnapshot,
        issue.id,
        "agent",
      );
      invariant(result.ok, "Production fixed-issue projection was rejected.");
      projected = result.data;
    }
    return projected;
  })();
  const submissionProjection = (() => {
    const intent = input.submissionProjectionIntent;
    if (!intent || !projectedSubmission) return undefined;
    // The questionnaire autosave persists the already-derived root readiness
    // unchanged; only the applicant/questionnaire/snapshot projections own
    // the exact field replacement in this action window.
    if (intent.mode === "questionnaire_replace") return undefined;
    const projectedPayload = toCockpitDraftPersistencePayload(
      projectedSubmission,
      intent.actorId,
      input.ownerId,
      intent.actorId === input.ownerId ? "agent" : "admin",
    ).submission;
    const staticFields = [
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
    const driftFields = staticFields.filter(
      (field) =>
        productionDraftValueDigest(rows.submission[field]) !==
        productionDraftValueDigest(projectedPayload[field]),
    );
    invariant(
      driftFields.every((field) => field === "readiness_percent"),
      "Production root serializer drift exceeded readiness_percent.",
    );
    const expectedStaticContentDigest =
      productionDraftSubmissionStaticContentDigest(projectedPayload);
    invariant(
      expectedStaticContentDigest,
      "Production root projection cannot be digested.",
    );
    return {
      expectedStaticContentDigest,
      mode: "replace_readiness_percent" as const,
    };
  })();
  const projectedHistoryPayload = (() => {
    const intent = input.submissionProjectionIntent;
    if (!intent || !projectedSubmission) return undefined;
    return toCockpitDraftPersistencePayload(
      projectedSubmission,
      intent.actorId,
      input.ownerId,
      intent.actorId === input.ownerId ? "agent" : "admin",
    ).status_history;
  })();
  const mediaProjection = (() => {
    const intent = input.submissionProjectionIntent;
    if (
      !intent ||
      intent.mode !== "submission_action" ||
      (intent.action !== "accept" && intent.action !== "close_issues_accept") ||
      !projectedSubmission
    ) {
      return undefined;
    }
    return {
      actorId: intent.actorId,
      media: rows.media.map((row) => {
        const mediaId = typeof row.id === "string" ? row.id : "";
        const expectedStaticContentDigest =
          productionDraftMediaStaticContentDigest(row);
        invariant(
          mediaId && expectedStaticContentDigest,
          "Production accepted-media projection cannot be digested.",
        );
        return { expectedStaticContentDigest, mediaId };
      }),
      mode: "accept_exact" as const,
    };
  })();
  const historyProjection = (() => {
    if (!projectedHistoryPayload) return undefined;
    const baselineIds = new Set(draft.statusHistory.map((row) => row.id));
    const rows = projectedHistoryPayload.map((row) => {
      const commentDigest = productionDraftValueDigest(row.comment);
      const noteDigest =
        row.note === null ? null : productionDraftValueDigest(row.note);
      invariant(
        typeof row.id === "string" &&
          row.entity_type === "submission" &&
          typeof row.entity_id === "string" &&
          (row.from_status === null || typeof row.from_status === "string") &&
          typeof row.to_status === "string" &&
          (row.source === "admin" || row.source === "agent") &&
          Boolean(commentDigest) &&
          (row.note === null || Boolean(noteDigest)) &&
          typeof row.changed_by === "string" &&
          typeof row.changed_at === "string",
        "Production history projection cannot be derived exactly.",
      );
      return {
        changedAt: baselineIds.has(row.id) ? row.changed_at : "action",
        changedBy: row.changed_by,
        commentDigest: commentDigest!,
        entityId: row.entity_id,
        entityType: "submission" as const,
        fromStatus: row.from_status,
        id: row.id,
        noteDigest,
        source: row.source,
        toStatus: row.to_status,
      } satisfies ProductionDraftProjectedStatusHistoryIdentity;
    });
    return { mode: "replace_exact" as const, rows };
  })();
  const historyTransition = (() => {
    if (
      input.submissionProjectionIntent?.mode !== "submission_action" ||
      !projectedSubmission
    ) {
      return undefined;
    }
    const actionHistory = projectedSubmission.history[0];
    invariant(
      actionHistory &&
        typeof actionHistory.fromStatus === "string" &&
        typeof actionHistory.toStatus === "string" &&
        typeof actionHistory.text === "string",
      "Production action history transition is absent.",
    );
    return {
      comment: actionHistory.text,
      fromStatus: actionHistory.fromStatus,
      note: actionHistory.note ?? null,
      toStatus: actionHistory.toStatus,
    };
  })();
  const snapshotProjection = (() => {
    const intent = input.submissionProjectionIntent;
    if (!intent || !projectedSubmission) return undefined;
    const projectedIntelligence = toCockpitDraftPersistencePayload(
      projectedSubmission,
      intent.actorId,
      input.ownerId,
      intent.actorId === input.ownerId ? "agent" : "admin",
    ).submission.family_intelligence;
    const persistedProjectedIntelligence = JSON.parse(
      JSON.stringify(projectedIntelligence),
    ) as unknown;
    const expectedLifecycleContentDigest = productionDraftSnapshotContentDigest(
      persistedProjectedIntelligence,
      "lifecycle",
      { normalizeFileReviewTimestamps: Boolean(mediaProjection) },
    );
    const projectionDigests = productionDraftSnapshotProjectionDigests(
      persistedProjectedIntelligence,
      { normalizeFileReviewTimestamps: Boolean(mediaProjection) },
    );
    invariant(
      expectedLifecycleContentDigest,
      "Production lifecycle snapshot content projection cannot be digested.",
    );
    invariant(
      projectionDigests,
      "Production lifecycle snapshot structural projections cannot be digested.",
    );
    return {
      expectedLifecycleContentDigest,
      projectionDigests,
      updatedAtMode:
        intent.mode === "questionnaire_replace"
          ? ("action_iso" as const)
          : ("now_literal" as const),
    };
  })();
  const snapshotHistoryProjection = (() => {
    const intent = input.submissionProjectionIntent;
    if (!intent || !projectedSubmission) return undefined;
    const projectedIntelligence = toCockpitDraftPersistencePayload(
      projectedSubmission,
      intent.actorId,
      input.ownerId,
      intent.actorId === input.ownerId ? "agent" : "admin",
    ).submission.family_intelligence;
    const persistedProjectedIntelligence = JSON.parse(
      JSON.stringify(projectedIntelligence),
    ) as unknown;
    const projection = productionDraftSnapshotHistoryProjection(
      persistedProjectedIntelligence,
    );
    invariant(
      projection,
      "Production lifecycle snapshot history projection cannot be derived.",
    );
    return projection;
  })();
  const applicantProjection = (() => {
    if (input.applicantSerializerProjection) {
      const snapshot = projectedSubmission ?? hydratedSnapshot;
      const emailReplacement = input.applicantEmailReplacement;
      const projected = toCockpitDraftPersistencePayload(
        snapshot,
        input.applicantSerializerProjection.actorId,
        input.ownerId,
        input.applicantSerializerProjection.actorId === input.ownerId
          ? "agent"
          : "admin",
      ).applicants.map((row) =>
        emailReplacement && emailReplacement.applicantId === row.id
          ? { ...row, email: emailReplacement.email }
          : row,
      );
      const projectedById = new Map(projected.map((row) => [row.id, row]));
      const allowedDriftFields = new Set<string>(
        input.applicantSerializerProjection.allowedDriftFields,
      );
      for (const row of rows.applicants) {
        const target = projectedById.get(row.id);
        invariant(target, "Production applicant projection changed row identity.");
        const driftFields = Object.keys(row).filter(
          (field) =>
            productionDraftValueDigest(row[field as keyof ProductionApplicantRow]) !==
            productionDraftValueDigest(target[field as keyof typeof target]),
        );
        invariant(
          driftFields.every(
            (field) =>
              allowedDriftFields.has(field) ||
              (field === "email" &&
                row.id === input.applicantEmailReplacement?.applicantId),
          ),
          "Production applicant serializer drift exceeded the explicit allowlist.",
        );
      }
      return {
        applicants: projected.map((row) => {
          const applicantId = typeof row.id === "string" ? row.id : "";
          invariant(applicantId, "Production applicant projection ID is absent.");
          const expectedContentDigest = productionDraftApplicantContentDigest(row);
          invariant(
            expectedContentDigest,
            "Production applicant projection cannot be digested.",
          );
          const expectedFieldDigests = Object.fromEntries(
            Object.entries(row).map(([field, value]) => [
              field,
              productionDraftValueDigest(value),
            ]),
          );
          return { applicantId, expectedContentDigest, expectedFieldDigests };
        }),
        mode: "replace_exact" as const,
      };
    }
    if (!input.applicantEmailReplacement) return undefined;
    const target = rows.applicants.find(
      (applicant) => applicant.id === input.applicantEmailReplacement?.applicantId,
    );
    const expectedContentDigest = target
      ? productionDraftApplicantContentDigest({
          ...target,
          email: input.applicantEmailReplacement.email,
        })
      : null;
    invariant(
      target && expectedContentDigest,
      "Production applicant email projection replacement cannot be resolved.",
    );
    return {
      applicantId: target.id,
      expectedContentDigest,
      mode: "replace_email" as const,
    };
  })();
  const questionnaireProjection = (() => {
    if (!input.questionnaireSerializerProjection) return undefined;
    const snapshot = projectedSubmission ?? hydratedSnapshot;
    const projectedRows = toCockpitQuestionnaireAnswerInserts(
      snapshot,
      input.applicantSerializerProjection?.actorId ?? input.ownerId,
    ) as unknown as Array<{
      applicant_id: string;
      field_id: string;
      label: string;
      section_id: string;
      submission_id: string;
      value: unknown;
    }>;
    const projectedAnswers = projectedRows.map((row) => {
      const baseline = draft.questionnaireAnswers.find(
        (answer) =>
          answer.submissionId === row.submission_id &&
          answer.applicantId === row.applicant_id &&
          answer.sectionId === row.section_id &&
          answer.fieldId === row.field_id,
      );
      invariant(baseline, "Production questionnaire projection changed answer identity.");
      const questionnaireReplacement =
        input.submissionProjectionIntent?.mode === "questionnaire_replace" &&
        input.submissionProjectionIntent.applicantId === row.applicant_id &&
        input.submissionProjectionIntent.fieldId === row.field_id
          ? input.submissionProjectionIntent.value
          : input.applicantEmailReplacement?.applicantId === row.applicant_id &&
              row.field_id === "email"
            ? input.applicantEmailReplacement.email
            : undefined;
      const value = (() => {
        if (questionnaireReplacement === undefined) return row.value;
        if (
          row.value &&
          typeof row.value === "object" &&
          !Array.isArray(row.value) &&
          (row.value as { kind?: unknown }).kind === "v19_questionnaire_field"
        ) {
          return {
            ...(row.value as Record<string, unknown>),
            value: questionnaireReplacement,
          };
        }
        return questionnaireReplacement;
      })();
      const identity = productionDraftQuestionnaireValueIdentity(value);
      const labelDigest = productionDraftValueDigest(row.label);
      invariant(
        identity && labelDigest,
        "Production questionnaire projection cannot be digested.",
      );
      return {
        ...baseline,
        labelDigest,
        logicalValueDigest: identity.logicalValueDigest,
        valueDigest: identity.valueDigest,
        valueStructureDigest: identity.valueStructureDigest,
      };
    });
    const allowedLabelDriftFieldIds = new Set<string>(
      input.questionnaireSerializerProjection.allowedLabelDriftFieldIds,
    );
    for (const projected of projectedAnswers) {
      const baseline = draft.questionnaireAnswers.find(
        (answer) =>
          answer.submissionId === projected.submissionId &&
          answer.applicantId === projected.applicantId &&
          answer.sectionId === projected.sectionId &&
          answer.fieldId === projected.fieldId,
      );
      invariant(baseline, "Production questionnaire baseline identity is absent.");
      const labelChanged = projected.labelDigest !== baseline.labelDigest;
      const valueChanged =
        projected.logicalValueDigest !== baseline.logicalValueDigest ||
        projected.valueDigest !== baseline.valueDigest ||
        projected.valueStructureDigest !== baseline.valueStructureDigest;
      const questionnaireReplacementMatches =
        input.submissionProjectionIntent?.mode === "questionnaire_replace" &&
        input.submissionProjectionIntent.applicantId === projected.applicantId &&
        input.submissionProjectionIntent.fieldId === projected.fieldId;
      const issueApprovalResetMatches =
        input.submissionProjectionIntent?.mode === "snapshot_mutation" &&
        input.submissionProjectionIntent.intent.mode === "add_issue" &&
        input.submissionProjectionIntent.intent.applicantId ===
          projected.applicantId &&
        input.submissionProjectionIntent.intent.fieldId === projected.fieldId &&
        projected.logicalValueDigest === baseline.logicalValueDigest;
      invariant(
        (!labelChanged || allowedLabelDriftFieldIds.has(projected.fieldId)) &&
          (!valueChanged ||
            questionnaireReplacementMatches ||
            issueApprovalResetMatches ||
            (projected.fieldId === "email" &&
              projected.applicantId ===
                input.applicantEmailReplacement?.applicantId)),
        "Production questionnaire serializer drift exceeded the explicit allowlist.",
      );
    }
    return { answers: projectedAnswers, mode: "replace_exact" as const };
  })();
  const snapshotMutation = input.snapshotMutationIntent
    ? productionDraftSnapshotMutationFromBaseline(
        rows.submission.family_intelligence,
        input.snapshotMutationIntent,
        {
          projectPersistedSnapshot: (submission) =>
            (() => {
              const [actionHistory, ...baselineHistory] = submission.history;
              invariant(
                actionHistory,
                "Production lifecycle action history is absent.",
              );
              const withMedia = attachDurableMediaAssetRows(
                { ...submission, history: baselineHistory },
                rows.media as Database["public"]["Tables"]["media_assets"]["Row"][],
              );
              const withDurableHistory = attachDurableStatusHistoryRows(
                withMedia,
                rows.history as Database["public"]["Tables"]["status_history"]["Row"][],
              );
              return {
                ...withDurableHistory,
                history: [actionHistory, ...withDurableHistory.history],
              };
            })(),
        },
      )
    : undefined;
  invariant(
    !input.snapshotMutationIntent || snapshotMutation,
    "A2-S1 lifecycle snapshot mutation cannot be derived from the current read-only state.",
  );
  const intelligence = jsonRecord(rows.submission.family_intelligence);
  const envelope = jsonRecord(intelligence?.v19CockpitSnapshot);
  const snapshot = jsonRecord(envelope?.submission);
  const snapshotApplicants = Array.isArray(snapshot?.applicants)
    ? snapshot.applicants
    : [];
  const applicantIdsInSnapshotOrder = snapshotApplicants.map((applicant) => {
    const record = jsonRecord(applicant);
    return typeof record?.id === "string" ? record.id : null;
  });
  invariant(
    applicantIdsInSnapshotOrder.every(
      (applicantId): applicantId is string => Boolean(applicantId),
    ) &&
      applicantIdsInSnapshotOrder.length === (input.expectedApplicantCount ?? 1) &&
      new Set(applicantIdsInSnapshotOrder).size ===
        applicantIdsInSnapshotOrder.length &&
      applicantIdsInSnapshotOrder.every((applicantId) =>
        rows.applicants.some((applicant) => applicant.id === applicantId),
      ),
    "Production snapshot applicant order cannot be resolved exactly.",
  );
  return {
    applicantIdsInSnapshotOrder: applicantIdsInSnapshotOrder as string[],
    applicantProjection,
    draft,
    historyProjection,
    historyTransition,
    mediaProjection,
    questionnaireProjection,
    snapshotMutation: snapshotMutation ?? undefined,
    snapshotHistoryProjection,
    snapshotProjection,
    submissionProjection,
  };
}

/** Read-only, PII-free lifecycle checkpoint for resumable production runners. */
export async function resolveProductionLifecycleMarkerReadback(input: {
  admin: ProductionCohortAccount;
  marker: string;
  submissionId: string;
}) {
  const rows = await readA1S1ProductionRows(input);
  const targetCorrections = rows.corrections.filter((row) =>
    row.reason.includes(input.marker),
  );
  const snapshotIssues = productionDraftSnapshotIssueIdentities(
    rows.submission.family_intelligence,
  );
  invariant(snapshotIssues, "Production lifecycle snapshot issues are unreadable.");
  return {
    applicantCount: rows.applicants.length,
    answerCount: rows.questionnaireAnswers.length,
    mediaCount: rows.media.length,
    snapshotIssueStatuses: snapshotIssues.map((issue) => issue.status),
    submissionStatus: rows.submission.status,
    targetCorrectionCount: targetCorrections.length,
    targetCorrectionStatuses: targetCorrections.map((row) => row.status),
  };
}

/** Read-only, PII-free agreement proof for one exact family contact value. */
export async function resolveProductionFamilyContactReadback(input: {
  admin: ProductionCohortAccount;
  expectedEmail: string;
  expectedIssueReason?: string;
  submissionId: string;
}) {
  const rows = await readA1S1ProductionRows(input);
  const snapshot = readCockpitSnapshot(
    rows.submission.family_intelligence as Database["public"]["Tables"]["submissions"]["Row"]["family_intelligence"],
  );
  invariant(snapshot, "Production cockpit snapshot is unreadable for contact readback.");
  const durableByApplicant = new Map(
    rows.applicants.map((row) => [row.id, row.email]),
  );
  const questionnaireByApplicant = new Map(
    rows.questionnaireAnswers
      .filter((row) => row.field_id === "email")
      .map((row) => {
        const envelope = jsonRecord(row.value);
        return [
          row.applicant_id,
          envelope?.kind === "v19_questionnaire_field"
            ? envelope.value
            : row.value,
        ];
      }),
  );
  const snapshotEmailEntries = snapshot.applicants.map((applicant) => {
    const matches = applicant.sections.flatMap((section) =>
      section.fields.filter((field) => field.id === "email"),
    );
    invariant(
      matches.length === 1,
      "Production snapshot must contain one personal Email field per applicant.",
    );
    return [applicant.id, matches[0]!.value] as const;
  });
  const snapshotEmailErrorStates = snapshot.applicants.reduce(
    (counts, applicant) => {
      const matches = applicant.sections.flatMap((section) =>
        section.fields.filter((field) => field.id === "email"),
      );
      invariant(
        matches.length === 1,
        "Production snapshot must contain one personal Email field per applicant.",
      );
      const error = matches[0]!.error;
      if (error === undefined) counts.absent += 1;
      else if (input.expectedIssueReason && error === input.expectedIssueReason) {
        counts.expected += 1;
      } else counts.other += 1;
      return counts;
    },
    { absent: 0, expected: 0, other: 0 },
  );
  const snapshotByApplicant = new Map(snapshotEmailEntries);
  const expectedDigest = productionDraftValueDigest(input.expectedEmail);
  invariant(expectedDigest, "Expected family contact cannot be digested.");
  const digest = (value: unknown) => productionDraftValueDigest(value);
  const applicantIds = snapshot.applicants.map((applicant) => applicant.id);
  const allDigests = applicantIds.flatMap((applicantId) => [
    digest(durableByApplicant.get(applicantId)),
    digest(questionnaireByApplicant.get(applicantId)),
    digest(snapshotByApplicant.get(applicantId)),
  ]);
  invariant(
    allDigests.every((value): value is string => Boolean(value)),
    "Production family contact layers contain an undigestible value.",
  );
  return {
    applicantCount: applicantIds.length,
    durableExpectedCount: applicantIds.filter(
      (applicantId) => digest(durableByApplicant.get(applicantId)) === expectedDigest,
    ).length,
    layerAgreementCount: applicantIds.filter((applicantId) => {
      const values = [
        digest(durableByApplicant.get(applicantId)),
        digest(questionnaireByApplicant.get(applicantId)),
        digest(snapshotByApplicant.get(applicantId)),
      ];
      return new Set(values).size === 1;
    }).length,
    questionnaireExpectedCount: applicantIds.filter(
      (applicantId) =>
        digest(questionnaireByApplicant.get(applicantId)) === expectedDigest,
    ).length,
    snapshotExpectedCount: applicantIds.filter(
      (applicantId) => digest(snapshotByApplicant.get(applicantId)) === expectedDigest,
    ).length,
    snapshotEmailErrorStates,
    distinctLayerValueDigestCount: new Set(allDigests).size,
  };
}

/**
 * Read-only and value-free diagnostic for differences between durable
 * applicant rows and the active cockpit serializer projection.
 */
export async function resolveProductionApplicantSerializerDrift(input: {
  actorId: string;
  admin: ProductionCohortAccount;
  ownerId: string;
  submissionId: string;
}) {
  const rows = await readA1S1ProductionRows(input);
  const snapshot = readCockpitSnapshot(
    rows.submission.family_intelligence as Database["public"]["Tables"]["submissions"]["Row"]["family_intelligence"],
  );
  invariant(snapshot, "Production cockpit snapshot is unreadable for applicant drift.");
  const projected = toCockpitDraftPersistencePayload(
    snapshot,
    input.actorId,
    input.ownerId,
    "admin",
  ).applicants;
  invariant(
    projected.length === rows.applicants.length,
    "Production applicant serializer changed row count.",
  );
  const projectedById = new Map(projected.map((row) => [row.id, row]));
  const fieldCounts = new Map<string, number>();
  let affectedApplicantCount = 0;
  for (const row of rows.applicants) {
    const target = projectedById.get(row.id);
    invariant(target, "Production applicant serializer changed row identity.");
    let affected = false;
    for (const field of Object.keys(row)) {
      if (
        productionDraftValueDigest(row[field as keyof ProductionApplicantRow]) !==
        productionDraftValueDigest(target[field as keyof typeof target])
      ) {
        fieldCounts.set(field, (fieldCounts.get(field) ?? 0) + 1);
        affected = true;
      }
    }
    if (affected) affectedApplicantCount += 1;
  }
  return {
    affectedApplicantCount,
    fieldCounts: Object.fromEntries([...fieldCounts.entries()].sort()),
    rowCount: rows.applicants.length,
  };
}

/** Read-only, value-free drift summary for root submission serialization. */
export async function resolveProductionSubmissionSerializerDrift(input: {
  actorId: string;
  admin: ProductionCohortAccount;
  ownerId: string;
  submissionId: string;
}) {
  const rows = await readA1S1ProductionRows(input);
  const snapshot = readCockpitSnapshot(
    rows.submission.family_intelligence as Database["public"]["Tables"]["submissions"]["Row"]["family_intelligence"],
  );
  invariant(snapshot, "Production cockpit snapshot is unreadable for root drift.");
  const projected = toCockpitDraftPersistencePayload(
    snapshot,
    input.actorId,
    input.ownerId,
    input.actorId === input.ownerId ? "agent" : "admin",
  ).submission;
  const staticFields = [
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
  const driftFields = staticFields.filter(
    (field) =>
      productionDraftValueDigest(rows.submission[field]) !==
      productionDraftValueDigest(projected[field]),
  );
  return { driftFields };
}

/** Read-only, value-free drift summary for questionnaire serialization. */
export async function resolveProductionQuestionnaireSerializerDrift(input: {
  actorId: string;
  admin: ProductionCohortAccount;
  ownerId: string;
  submissionId: string;
}) {
  const rows = await readA1S1ProductionRows(input);
  const snapshot = readCockpitSnapshot(
    rows.submission.family_intelligence as Database["public"]["Tables"]["submissions"]["Row"]["family_intelligence"],
  );
  invariant(snapshot, "Production cockpit snapshot is unreadable for questionnaire drift.");
  const projected = toCockpitQuestionnaireAnswerInserts(
    snapshot,
    input.actorId,
  ) as unknown as Array<{
    applicant_id: string;
    field_id: string;
    label: string;
    section_id: string;
    submission_id: string;
    value: unknown;
  }>;
  const key = (row: {
    applicant_id: string;
    field_id: string;
    section_id: string;
    submission_id: string;
  }) =>
    [row.submission_id, row.applicant_id, row.section_id, row.field_id].join(":");
  const projectedByKey = new Map(projected.map((row) => [key(row), row]));
  const fieldCounts = new Map<string, number>();
  const affectedFieldIdCounts = new Map<string, number>();
  let affectedAnswerCount = 0;
  for (const row of rows.questionnaireAnswers) {
    const target = projectedByKey.get(key(row));
    invariant(target, "Production questionnaire serializer changed answer identity.");
    const baselineValue = productionDraftQuestionnaireValueIdentity(row.value);
    const projectedValue = productionDraftQuestionnaireValueIdentity(target.value);
    invariant(
      baselineValue && projectedValue,
      "Production questionnaire value identity is unreadable.",
    );
    const driftFields = [
      productionDraftValueDigest(row.label) !==
      productionDraftValueDigest(target.label)
        ? "label"
        : null,
      baselineValue.logicalValueDigest !== projectedValue.logicalValueDigest
        ? "logical_value"
        : null,
      baselineValue.valueDigest !== projectedValue.valueDigest ? "value" : null,
      baselineValue.valueStructureDigest !== projectedValue.valueStructureDigest
        ? "value_structure"
        : null,
    ].filter((field): field is string => Boolean(field));
    for (const field of driftFields) {
      fieldCounts.set(field, (fieldCounts.get(field) ?? 0) + 1);
    }
    if (driftFields.length) {
      affectedAnswerCount += 1;
      affectedFieldIdCounts.set(
        row.field_id,
        (affectedFieldIdCounts.get(row.field_id) ?? 0) + 1,
      );
    }
  }
  return {
    affectedAnswerCount,
    affectedFieldIdCounts: Object.fromEntries(
      [...affectedFieldIdCounts.entries()].sort(),
    ),
    fieldCounts: Object.fromEntries([...fieldCounts.entries()].sort()),
    rowCount: rows.questionnaireAnswers.length,
  };
}

function assertA1S1ApplicantProjection(input: {
  documents: ProductionDocumentAssetRow[];
  media: ProductionMediaAssetRow[];
  submissionId: string;
}) {
  const expectedDocumentTypes = ["passport_scan", "selfie_1", "selfie_2"];
  const expectedMediaTypes = ["passport_scan", "selfie", "selfie_2"];
  const documentApplicantIds = new Set(input.documents.map((row) => row.applicant_id));
  const mediaApplicantIds = new Set(input.media.map((row) => row.applicant_id));
  const mediaById = new Map(input.media.map((row) => [row.id, row]));
  invariant(
    input.documents.length === 3 &&
      input.media.length === 3 &&
      documentApplicantIds.size === 1 &&
      mediaApplicantIds.size === 1 &&
      [...documentApplicantIds][0] === [...mediaApplicantIds][0] &&
      input.documents.every((row) => row.submission_id === input.submissionId) &&
      input.media.every((row) => row.submission_id === input.submissionId) &&
      expectedDocumentTypes.every(
        (type) => input.documents.filter((row) => row.type === type).length === 1,
      ) &&
      expectedMediaTypes.every(
        (type) => input.media.filter((row) => row.type === type).length === 1,
      ) &&
      input.documents.every((document) => {
        const source = mediaById.get(document.source_media_asset_id);
        const expectedDocumentType = source?.type === "selfie" ? "selfie_1" : source?.type;
        return (
          source?.applicant_id === document.applicant_id &&
          source?.submission_id === document.submission_id &&
          expectedDocumentType === document.type
        );
      }),
    "A1-S1 has an incomplete or cross-submission applicant document projection.",
  );
}

function documentAssetIdentityDigest(rows: ProductionDocumentAssetRow[]) {
  return digestFacts(rows.map((row) => `${row.id}:${row.applicant_id}:${row.type}`));
}

function mediaDigest(rows: ProductionMediaAssetRow[]) {
  return digestFacts(
    rows.map(
      (row) =>
        `${row.id}:${row.applicant_id}:${row.type}:${row.upload_status}:${row.review_status}:${row.storage_bucket}:${row.storage_path}`,
    ),
  );
}

export async function resolveA1S1ProductionExportPreflight(input: {
  admin: ProductionCohortAccount;
  ownerId: string;
  submissionId: string;
}): Promise<ResolvedA1S1ProductionExportPreflight> {
  const rows = await readA1S1ProductionRows(input);
  const draft = draftPayloadIdentityFromRows({ ...input, rows });
  assertA1S1ApplicantProjection({
    documents: rows.documents,
    media: rows.media,
    submissionId: input.submissionId,
  });
  invariant(
    rows.submission.status === "ready_for_excel" && !rows.submission.exported_at,
    "A1-S1 must be raw ready_for_excel without exported_at before terminal export.",
  );
  invariant(
    rows.submission.agent_id === input.ownerId,
    "A1-S1 production owner no longer matches the declared cohort agent.",
  );
  invariant(
    rows.documents.every(
      (row) =>
        row.upload_status === "uploaded" &&
        row.validation_status === "passed" &&
        row.export_status === "ready",
    ),
    "A1-S1 requires exactly three uploaded/passed/ready document assets before export.",
  );
  invariant(
    rows.media.every(
      (row) => row.upload_status === "uploaded" && row.review_status === "accepted",
    ),
    "A1-S1 requires exactly three uploaded/accepted media assets before export.",
  );
  invariant(
    !rows.corrections.some(
      (row) =>
        row.status === "open" &&
        (row.severity === "blocking" || row.severity === "blocker"),
    ),
    "A1-S1 has an open blocking correction and cannot be exported.",
  );

  const documentAssetIds = rows.documents.map((row) => row.id);
  invariant(
    exactStringSet(documentAssetIds, documentAssetIds) &&
      documentAssetIds.length === 3 &&
      documentAssetIds.every((id) => id.length > 0),
    "A1-S1 preflight did not resolve exactly three unique document asset IDs.",
  );

  return {
    networkContract: {
      adminId: input.admin.authUserId,
      draft,
      documentAssetIds,
      ownerId: input.ownerId,
      preCommitStatus: "ready_for_excel",
      submissionId: input.submissionId,
    },
    preflight: {
      applicantDigest: productionA1S1ExportDigest(rows.documents[0]!.applicant_id),
      documentAssetCount: 3,
      documentAssetIdentityDigest: documentAssetIdentityDigest(rows.documents),
      mediaAssetCount: 3,
      mediaDigest: mediaDigest(rows.media),
      rawStatus: "ready_for_excel",
    },
  };
}

/**
 * Read-only proof API for callers that must not retain the raw ID contract.
 * The production browser writer uses `resolve...` and keeps its contract only
 * in memory for the lifetime of the one export session.
 */
export async function verifyA1S1ProductionExportPreflight(input: {
  admin: ProductionCohortAccount;
  ownerId: string;
  submissionId: string;
}): Promise<ProductionA1S1ExportPreflight> {
  return (await resolveA1S1ProductionExportPreflight(input)).preflight;
}

/**
 * A tightly scoped production recovery action for the one historical state
 * that the pre-atomic RPC could leave behind. The server re-derives every
 * mutable fact and fails closed; this caller merely proves that the already
 * downloaded ZIP and workbook match the deterministic batch identity first.
 */
export async function repairIncompleteA1S1ProductionExport(input: {
  admin: ProductionCohortAccount;
  preflight: ProductionA1S1ExportPreflight;
  state: ProductionA1S1ExportState;
  submissionId: string;
}): Promise<ProductionA1S1ExportRepairProof> {
  assertProductionA1S1ExportRepairUnlock();
  invariant(input.state.zipProof, "A1-S1 repair requires verified ZIP proof.");
  const client = await createReadOnlyProductionAdminClient(input.admin);
  const [rows, batchesResult, eventsResult] = await Promise.all([
    readA1S1ProductionRowsWithClient({ client, submissionId: input.submissionId }),
    client
      .from("export_batches")
      .select(
        "id,format,file_name,content_fingerprint,idempotency_key,row_count,submission_ids",
      )
      .contains("submission_ids", [input.submissionId]),
    client
      .from("document_export_events")
      .select(
        "submission_ids,asset_ids,zip_file_name,file_count,applicant_count,workbook_file_name,package_identity_key",
      )
      .contains("submission_ids", [input.submissionId]),
  ]);
  invariant(!batchesResult.error, "A1-S1 repair cannot read export batches.");
  invariant(!eventsResult.error, "A1-S1 repair cannot read document audit events.");
  assertA1S1ApplicantProjection({
    documents: rows.documents,
    media: rows.media,
    submissionId: input.submissionId,
  });
  invariant(
    rows.submission.status === "exported" && Boolean(rows.submission.exported_at),
    "A1-S1 repair requires an already exported terminal submission.",
  );
  invariant(
    documentAssetIdentityDigest(rows.documents) ===
      input.preflight.documentAssetIdentityDigest &&
      mediaDigest(rows.media) === input.preflight.mediaDigest,
    "A1-S1 repair refuses changed document or media identity.",
  );

  const batches = (batchesResult.data ?? []) as unknown as ProductionExportBatchRow[];
  const matchingBatches = batches.filter(
    (batch) =>
      batch.format === "xlsx" &&
      batch.row_count === 1 &&
      batch.submission_ids.length === 1 &&
      batch.submission_ids[0] === input.submissionId &&
      Boolean(batch.idempotency_key) &&
      Boolean(batch.file_name) &&
      Boolean(batch.content_fingerprint),
  );
  invariant(
    matchingBatches.length === 1,
    "A1-S1 repair requires exactly one durable export batch.",
  );
  const batch = matchingBatches[0]!;
  const idempotencyKey = batch.idempotency_key!;
  const expectedZipFileName = `visaflow-export-${idempotencyKey}_documents.zip`;
  invariant(
    productionA1S1ExportDigest(batch.file_name ?? "") ===
      input.state.zipProof.workbookFileNameDigest &&
      productionA1S1ExportDigest(expectedZipFileName) ===
        input.state.zipProof.zipFileNameDigest,
    "A1-S1 repair refuses an artifact whose names do not match the durable batch.",
  );

  const events = (eventsResult.data ?? []) as unknown as ProductionDocumentExportEventRow[];
  const matchingEvents = events.filter(
    (event) =>
      event.package_identity_key === idempotencyKey &&
      event.submission_ids.length === 1 &&
      event.submission_ids[0] === input.submissionId,
  );
  const documentsExported = rows.documents.every(
    (document) =>
      document.upload_status === "uploaded" &&
      document.validation_status === "passed" &&
      document.export_status === "exported",
  );
  if (documentsExported && matchingEvents.length === 1) {
    return { outcome: "already_complete" };
  }

  invariant(
    matchingEvents.length === 0 &&
      rows.documents.every(
        (document) =>
          document.upload_status === "uploaded" &&
          document.validation_status === "passed" &&
          document.export_status === "ready",
      ),
    "A1-S1 repair refuses a mixed terminal document state.",
  );

  const { data, error } = await client.rpc(
    "repair_incomplete_export_document_completion",
    { p_idempotency_key: idempotencyKey },
  );
  invariant(!error && data, "A1-S1 terminal repair RPC failed.");
  invariant(
    data.repaired === true,
    "A1-S1 terminal repair did not create the missing document completion proof.",
  );
  return { outcome: "repaired" };
}

export async function verifyA1S1ProductionExportFinalState(input: {
  admin: ProductionCohortAccount;
  preflight: ProductionA1S1ExportPreflight;
  state: ProductionA1S1ExportState;
  submissionId: string;
}): Promise<ProductionA1S1ExportFinalStateProof> {
  invariant(input.state.zipProof, "A1-S1 terminal read-back requires verified ZIP proof.");
  const client = await createReadOnlyProductionAdminClient(input.admin);
  const [rows, batchesResult, eventsResult, historyResult] = await Promise.all([
    readA1S1ProductionRowsWithClient({ client, submissionId: input.submissionId }),
    client
      .from("export_batches")
      .select(
        "id,format,file_name,content_fingerprint,idempotency_key,row_count,submission_ids",
      )
      .contains("submission_ids", [input.submissionId]),
    client
      .from("document_export_events")
      .select(
        "submission_ids,asset_ids,zip_file_name,file_count,applicant_count,workbook_file_name,package_identity_key",
      )
      .contains("submission_ids", [input.submissionId]),
    client
      .from("status_history")
      .select("from_status,to_status")
      .eq("entity_type", "submission")
      .eq("entity_id", input.submissionId),
  ]);
  invariant(!batchesResult.error, "A1-S1 export batches are unreadable.");
  invariant(!eventsResult.error, "A1-S1 export audit events are unreadable.");
  invariant(!historyResult.error, "A1-S1 status history is unreadable.");
  assertA1S1ApplicantProjection({
    documents: rows.documents,
    media: rows.media,
    submissionId: input.submissionId,
  });
  invariant(
    rows.submission.status === "exported" && Boolean(rows.submission.exported_at),
    "A1-S1 did not reach the raw exported terminal state.",
  );
  invariant(
    rows.documents.every(
      (row) =>
        row.upload_status === "uploaded" &&
        row.validation_status === "passed" &&
        row.export_status === "exported",
    ),
    "A1-S1 document assets did not transition atomically to exported.",
  );
  invariant(
    documentAssetIdentityDigest(rows.documents) ===
      input.preflight.documentAssetIdentityDigest,
    "A1-S1 export changed the immutable document identity set.",
  );
  invariant(
    mediaDigest(rows.media) === input.preflight.mediaDigest,
    "A1-S1 export changed media rows outside the atomic document transition.",
  );

  const batches = (batchesResult.data ?? []) as unknown as ProductionExportBatchRow[];
  const matchingBatches = batches.filter(
    (batch) =>
      batch.format === "xlsx" &&
      batch.row_count === 1 &&
      batch.submission_ids.length === 1 &&
      batch.submission_ids[0] === input.submissionId &&
      Boolean(batch.idempotency_key) &&
      Boolean(batch.file_name) &&
      Boolean(batch.content_fingerprint),
  );
  invariant(
    matchingBatches.length === 1,
    "A1-S1 must have exactly one matching export batch.",
  );
  const batch = matchingBatches[0]!;
  invariant(
    productionA1S1ExportDigest(batch.file_name ?? "") ===
      input.state.zipProof.workbookFileNameDigest,
    "A1-S1 export batch workbook name does not match the downloaded ZIP.",
  );

  const events = (eventsResult.data ?? []) as unknown as ProductionDocumentExportEventRow[];
  const matchingEvents = events.filter(
    (event) =>
      event.package_identity_key === batch.idempotency_key &&
      event.submission_ids.length === 1 &&
      event.submission_ids[0] === input.submissionId &&
      event.applicant_count === 1 &&
      event.file_count === 4,
  );
  invariant(
    matchingEvents.length === 1,
    "A1-S1 must have exactly one matching document export audit event.",
  );
  const event = matchingEvents[0]!;
  invariant(
    productionA1S1ExportDigest(event.zip_file_name) ===
      input.state.zipProof.zipFileNameDigest &&
      productionA1S1ExportDigest(event.workbook_file_name) ===
        input.state.zipProof.workbookFileNameDigest,
    "A1-S1 document export audit names do not match the downloaded ZIP.",
  );
  invariant(
    digestFacts(event.asset_ids) === digestFacts(rows.documents.map((row) => row.id)),
    "A1-S1 document export audit asset identity differs from exported document assets.",
  );

  const history = (historyResult.data ?? []) as unknown as ProductionStatusHistoryRow[];
  const exportedHistory = history.filter(
    (row) =>
      row.to_status === "exported" &&
      (row.from_status === "ready_for_excel" || row.from_status === "accepted"),
  );
  invariant(
    exportedHistory.length === 1,
    "A1-S1 must have exactly one atomic exported status-history transition.",
  );

  return {
    documentAssetCount: 3,
    documentEventCount: 1,
    exportBatchCount: 1,
    mediaDigest: input.preflight.mediaDigest,
    rawStatus: "exported",
    statusHistoryExportedCount: 1,
  };
}

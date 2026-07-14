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
/** Legacy terminal case kept exclusively for the A1-F6 export proof. */
export const FOCUSED_PRODUCTION_LIFECYCLE_CASE_KEY = "A1-F6";
/** Dedicated non-terminal record for the resumable admin-agent lifecycle proof. */
export const RESUMABLE_PRODUCTION_LIFECYCLE_CASE_KEY = "A1-S1";

export type ProductionLifecycleCaseKey =
  | typeof FOCUSED_PRODUCTION_LIFECYCLE_CASE_KEY
  | typeof RESUMABLE_PRODUCTION_LIFECYCLE_CASE_KEY;

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

export function assertProductionLifecycleMutationAudit(
  mutationSummary: CohortMutationSummary[],
  allowedAuthAttemptCount: number,
) {
  invariant(
    allowedAuthAttemptCount >= 1 && allowedAuthAttemptCount <= 3,
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

function productionLifecycleLockPath(runMarker: string) {
  return resolve(process.cwd(), `.production-lifecycle-${runMarker}.lock.local`);
}

function productionExportLockPath(runMarker: string) {
  return resolve(process.cwd(), `.production-export-${runMarker}.lock.local`);
}

export async function acquireProductionLifecycleLock(runMarker: string) {
  invariant(
    !existsSync(productionExportLockPath(runMarker)),
    "The production export gate is active; lifecycle refuses concurrent state changes.",
  );
  const path = productionLifecycleLockPath(runMarker);
  const token = randomUUID();
  let handle;
  try {
    handle = await open(path, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(
        "Another production lifecycle process holds the run-marker lock; refusing concurrent mutations.",
      );
    }
    throw error;
  }

  try {
    await handle.writeFile(
      `${JSON.stringify({
        acquiredAt: new Date().toISOString(),
        pid: process.pid,
        runMarker,
        token,
      })}\n`,
    );
  } finally {
    await handle.close();
  }

  return async () => {
    const lock = await readJson<{ runMarker?: string; token?: string }>(path);
    invariant(
      lock.runMarker === runMarker && lock.token === token,
      "Production lifecycle lock ownership changed; refusing to remove it.",
    );
    await unlink(path);
  };
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
  invariant(cohortCase, "Focused A1-S1 case is absent from the production plan.");
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
    "A1-S1 must reach the submitted cohort checkpoint before lifecycle mutations.",
  );
  invariant(
    checkpoint.caseMarker === cohortCase.caseMarker,
    "A1-S1 submitted checkpoint marker mismatch.",
  );
  invariant(
    cohortCase.caseKey === RESUMABLE_PRODUCTION_LIFECYCLE_CASE_KEY,
    "Production lifecycle refuses a case other than A1-S1.",
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
    "Lifecycle state no longer matches the submitted A1-S1 cohort checkpoint.",
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
  const path = resolve(
    process.cwd(),
    "output",
    "playwright",
    "production-lifecycle",
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
    "Acceptance intent is missing the exact A1-F6 fixed-issue proof.",
  );
}

function lifecycleProofDigest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function evidenceDigest(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

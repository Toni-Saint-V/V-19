import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type { BrowserContext, Download, Page, Request } from "@playwright/test";

import { testArtifactPath } from "../support/artifacts";

import {
  PRODUCTION_COHORT_APP_ORIGIN,
  PRODUCTION_PROJECT_REF,
  PRODUCTION_SUPABASE_ORIGIN,
  buildProductionCohortPlan,
  isPermittedCohortStaticRuntimeRequest,
  loadCohortResumeState,
  requiredProductionRunMarker,
  type CohortMutationSummary,
  type ProductionCohortCase,
} from "./production-cohort-helpers";
import {
  FOCUSED_PRODUCTION_LIFECYCLE_CASE_KEY,
  assertProductionLifecycleAcceptanceProof,
  productionLifecycleStatePath,
  type ProductionLifecycleState,
} from "./production-lifecycle-helpers";

export const REQUIRED_PRODUCTION_EXPORT_WRITE_UNLOCK =
  "I_UNDERSTAND_A1_F6_EXPORT_DOWNLOAD";

export type ProductionExportStage =
  | "pending"
  | "excel_verified"
  | "exporting"
  | "artifact_verified"
  | "verified";

export type SanitizedWorkbookProof = {
  byteDigest: string;
  byteLength: number;
  columnCount: 56;
  dataRowCount: 6;
  dimension: "A1:BD7";
  markerRowCount: 6;
  sheetName: "Sheet1";
};

export type SanitizedZipProof = {
  applicantCount: 6;
  byteDigest: string;
  byteLength: number;
  downloadWaitMs: number;
  documentCount: 24;
  entryCount: 27;
  questionnairePdfCount: 6;
  workbookDigest: string;
};

export type ProductionExportState = {
  caseKey: typeof FOCUSED_PRODUCTION_LIFECYCLE_CASE_KEY;
  caseMarkerDigest: string;
  excelProof?: SanitizedWorkbookProof;
  /**
   * Kept separate from ZIP byte proof: an artifact can be verified even when
   * the post-commit UI confirmation itself did not render successfully.
   */
  postCommitUiNoticeVerified?: true;
  projectRef: typeof PRODUCTION_PROJECT_REF;
  runMarker: string;
  schemaVersion: 1;
  stage: ProductionExportStage;
  submissionDigest: string;
  updatedAt: string;
  zipProof?: SanitizedZipProof;
};

export type ResolvedAcceptedProductionExportCase = {
  cohortCase: ProductionCohortCase;
  lifecycleState: ProductionLifecycleState;
  state: ProductionExportState;
};

const stages = new Set<ProductionExportStage>([
  "pending",
  "excel_verified",
  "exporting",
  "artifact_verified",
  "verified",
]);
const businessMutationAllowlist = new Map<string, number>([
  ["POST /rest/v1/rpc/save_agent_submission_if_current", 1],
  ["POST /rest/v1/rpc/complete_export_package", 1],
]);

type ObservedMutation = {
  method: string;
  path: string;
  status: number;
};

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function productionExportDigest(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function readJson<T>(path: string): Promise<T> {
  return readFile(path, "utf8")
    .then((value) => JSON.parse(value) as T)
    .catch(() => {
      throw new Error(`Required export-gate JSON is missing or invalid: ${path}`);
    });
}

async function writeJsonAtomic(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  });
  await rename(temporaryPath, path);
}

export function assertProductionExportWriteUnlock() {
  invariant(
    process.env.SUPABASE_PRODUCTION_E2E_UNLOCK === "1",
    "SUPABASE_PRODUCTION_E2E_UNLOCK=1 is required.",
  );
  invariant(
    process.env.V19_PRODUCTION_EXPORT_WRITE_UNLOCK ===
      REQUIRED_PRODUCTION_EXPORT_WRITE_UNLOCK,
    "The dedicated A1-F6 production export unlock is absent.",
  );
  invariant(
    process.env.V19_PRODUCTION_COHORT_CONFIRM_PROJECT_REF === PRODUCTION_PROJECT_REF,
    "The production export project-ref confirmation is absent or wrong.",
  );
}

export function productionExportStatePath(runMarker: string) {
  return resolve(process.cwd(), `.production-export-${runMarker}.state.local.json`);
}

function productionExportLockPath(runMarker: string) {
  return resolve(process.cwd(), `.production-export-${runMarker}.lock.local`);
}

function lifecycleLockPath(runMarker: string) {
  return resolve(process.cwd(), `.production-lifecycle-${runMarker}.lock.local`);
}

export async function acquireProductionExportLock(runMarker: string) {
  invariant(
    !existsSync(lifecycleLockPath(runMarker)),
    "The production lifecycle gate is still active; export refuses concurrent state changes.",
  );
  const path = productionExportLockPath(runMarker);
  const token = randomUUID();
  let handle;
  try {
    handle = await open(path, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error("Another production export process holds the run-marker lock.");
    }
    throw error;
  }
  try {
    await handle.writeFile(
      `${JSON.stringify({ acquiredAt: new Date().toISOString(), pid: process.pid, runMarker, token })}\n`,
    );
  } finally {
    await handle.close();
  }

  return async () => {
    const lock = await readJson<{ runMarker?: string; token?: string }>(path);
    invariant(
      lock.runMarker === runMarker && lock.token === token,
      "Production export lock ownership changed.",
    );
    await unlink(path);
  };
}

function focusedCase(runMarker: string) {
  const cohortCase = buildProductionCohortPlan(runMarker).find(
    (candidate) => candidate.caseKey === FOCUSED_PRODUCTION_LIFECYCLE_CASE_KEY,
  );
  invariant(cohortCase, "A1-F6 is absent from the production cohort plan.");
  invariant(
    cohortCase.applicantCount === 6 &&
      cohortCase.type === "family" &&
      cohortCase.city === "Москва",
    "A1-F6 no longer matches the fixed six-person Moscow family contract.",
  );
  return cohortCase;
}

function validateExportState(
  state: ProductionExportState,
  input: {
    caseMarker: string;
    runMarker: string;
    submissionId: string;
  },
) {
  invariant(state.schemaVersion === 1, "Unsupported production export schema.");
  invariant(
    state.projectRef === PRODUCTION_PROJECT_REF,
    "Production export project ref mismatch.",
  );
  invariant(state.runMarker === input.runMarker, "Export run marker mismatch.");
  invariant(
    state.caseKey === FOCUSED_PRODUCTION_LIFECYCLE_CASE_KEY,
    "Production export refuses a case other than A1-F6.",
  );
  invariant(stages.has(state.stage), "Production export stage is invalid.");
  invariant(
    state.caseMarkerDigest === productionExportDigest(input.caseMarker) &&
      state.submissionDigest === productionExportDigest(input.submissionId),
    "Production export checkpoint no longer matches accepted A1-F6.",
  );
  if (state.stage !== "pending") {
    invariant(state.excelProof, "Export checkpoint lost its verified Excel proof.");
  }
  if (state.stage === "artifact_verified" || state.stage === "verified") {
    invariant(state.zipProof, "Export checkpoint lost its verified ZIP proof.");
  }
  if (state.stage === "verified") {
    invariant(
      state.postCommitUiNoticeVerified,
      "Export checkpoint cannot claim a verified flow without the post-commit ZIP notice.",
    );
  }
}

export async function loadAcceptedProductionExportCase(): Promise<ResolvedAcceptedProductionExportCase> {
  assertProductionExportWriteUnlock();
  const runMarker = requiredProductionRunMarker();
  const cohortCase = focusedCase(runMarker);
  const cohortState = await loadCohortResumeState(runMarker);
  const cohortCheckpoint = cohortState.cases[FOCUSED_PRODUCTION_LIFECYCLE_CASE_KEY];
  invariant(
    cohortCheckpoint?.stage === "submitted" && cohortCheckpoint.submissionId,
    "A1-F6 must have a durable submitted cohort checkpoint before export.",
  );
  invariant(
    cohortCheckpoint.caseMarker === cohortCase.caseMarker,
    "A1-F6 cohort marker mismatch.",
  );

  const lifecycleState = await readJson<ProductionLifecycleState>(
    productionLifecycleStatePath(runMarker),
  );
  invariant(
    lifecycleState.stage === "accepted",
    "A1-F6 must complete admin-return-agent-fix-admin-accept before export.",
  );
  invariant(
    lifecycleState.projectRef === PRODUCTION_PROJECT_REF &&
      lifecycleState.runMarker === runMarker &&
      lifecycleState.case.caseKey === FOCUSED_PRODUCTION_LIFECYCLE_CASE_KEY &&
      lifecycleState.case.ownerKey === cohortCase.ownerKey &&
      lifecycleState.case.submissionId === cohortCheckpoint.submissionId,
    "Accepted lifecycle checkpoint does not match submitted A1-F6.",
  );
  assertProductionLifecycleAcceptanceProof(lifecycleState, cohortCase.caseMarker);

  const path = productionExportStatePath(runMarker);
  const state: ProductionExportState = existsSync(path)
    ? await readJson<ProductionExportState>(path)
    : {
        caseKey: FOCUSED_PRODUCTION_LIFECYCLE_CASE_KEY,
        caseMarkerDigest: productionExportDigest(cohortCase.caseMarker),
        projectRef: PRODUCTION_PROJECT_REF,
        runMarker,
        schemaVersion: 1 as const,
        stage: "pending" as const,
        submissionDigest: productionExportDigest(cohortCheckpoint.submissionId),
        updatedAt: new Date().toISOString(),
      };
  validateExportState(state, {
    caseMarker: cohortCase.caseMarker,
    runMarker,
    submissionId: cohortCheckpoint.submissionId,
  });
  if (!existsSync(path)) await saveProductionExportState(state);
  return { cohortCase, lifecycleState, state };
}

export async function saveProductionExportState(state: ProductionExportState) {
  state.updatedAt = new Date().toISOString();
  await writeJsonAtomic(productionExportStatePath(state.runMarker), state);
}

export async function writeProductionExportEvidence(runMarker: string, value: unknown) {
  const path = testArtifactPath(
    "playwright",
    "production-export",
    runMarker,
    "evidence.json",
  );
  await writeJsonAtomic(path, value);
  return path;
}

export async function downloadBytes(download: Download): Promise<Buffer> {
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

export class StrictProductionExportNetworkGate {
  #businessPhase = false;
  #businessReleaseDecision: "cancel" | "release" | null = null;
  #businessReleasePromise: Promise<"cancel" | "release"> | null = null;
  #businessReleaseResolve: ((decision: "cancel" | "release") => void) | null = null;
  #loginCount = 0;
  readonly #mutations: ObservedMutation[] = [];
  readonly #requestCounts = new Map<string, number>();
  #violations: string[] = [];

  async attach(context: BrowserContext) {
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
        this.#loginCount === 0
      ) {
        this.#loginCount += 1;
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
        this.#requestCounts.set(key, count + 1);
        const decision = await this.#businessReleasePromise;
        if (decision === "cancel") {
          await route.abort("blockedbyclient");
          return;
        }
        await route.continue();
        return;
      }

      this.#violations.push(
        productionExportDigest(`${method}:${url.origin}:${url.pathname}`).slice(0, 16),
      );
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
    invariant(this.#loginCount === 1, "Exactly one password login is required.");
  }

  beginExport() {
    invariant(!this.#businessPhase, "Export mutation phase is already active.");
    invariant(
      this.#mutations.length === 0,
      "Business mutation occurred before ZIP export intent.",
    );
    this.#businessPhase = true;
    this.#businessReleaseDecision = null;
    this.#businessReleasePromise = new Promise((resolve) => {
      this.#businessReleaseResolve = resolve;
    });
  }

  releaseExportMutations() {
    invariant(this.#businessPhase, "Export mutation phase is not active.");
    invariant(
      this.#businessReleaseDecision === null && this.#businessReleaseResolve,
      "Export mutation decision is already fixed.",
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
    this.#businessReleasePromise = null;
  }

  assertReadOnly() {
    invariant(!this.#businessPhase, "Export mutation phase remained active.");
    invariant(this.#mutations.length === 0, "Read-only export phase mutated data.");
    invariant(this.#violations.length === 0, "Unapproved network request was blocked.");
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
      keys.filter((key) => key === "POST /rest/v1/rpc/save_agent_submission_if_current")
        .length === 1,
      "Successful export must persist only the pre-commit downloaded state; the terminal export is owned by complete_export_package.",
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
      "Successful export must not directly create a document audit outside complete_export_package.",
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
}

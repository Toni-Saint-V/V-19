import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { lstat, mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { expect, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { testArtifactPath } from "../support/artifacts";
import { clickWorkspaceButton } from "./ui-helpers";

export const PRODUCTION_PROJECT_REF = "tsymifccglpepvbmrcgh";
export const PRODUCTION_SUPABASE_ORIGIN = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;
export const PRODUCTION_COHORT_APP_ORIGIN = "http://127.0.0.1:4202";
export const REQUIRED_COHORT_WRITE_UNLOCK = "I_UNDERSTAND_12_SUBMISSIONS_27_APPLICANTS";

const cohortPath = resolve(process.cwd(), ".supabase-pilot-cohort.local.json");
const productionEnvPath = resolve(
  process.cwd(),
  process.env.SUPABASE_UI_E2E_ENV_FILE ?? ".env.supabase-production.local",
);
const qaAssetsDirectory = resolve(
  process.cwd(),
  "tests",
  "fixtures",
  "production-media",
);
const permittedQaAssetNames = [
  "E2E_TEST_PERSON_ONE_910000001.png",
  "E2E_TEST_PERSON_TWO_910000002.png",
  "селфи_И1.png",
  "селфи_И2.png",
  "селфи_М1.png",
  "селфи_М2.png",
] as const;
const permittedQaAssetHashes: Record<(typeof permittedQaAssetNames)[number], string> = {
  "E2E_TEST_PERSON_ONE_910000001.png":
    "73ae6faa3ba67faa184006409b1de80a7fa90c1127f014da85e009b9fd42d1ed",
  "E2E_TEST_PERSON_TWO_910000002.png":
    "c4d07e939e35eb244f4bbe0d2c61939654053ff63ed9ea27f26d95194ac5d063",
  "селфи_И1.png": "418bc7087111d32a2dd803dac320c83be31463c71be6185ec86f0854f510d071",
  "селфи_И2.png": "81647e502671b2f6992d6f1372222f9e88251f32797370a75211d711ecf25785",
  "селфи_М1.png": "eb07dba350fe77ccfd38183dc1a17d0ee75d338d59a31824fe21480f107228cf",
  "селфи_М2.png": "22c46fd1a9ca2f7b51c479747384a9883ffff53d751b9875396feedf221916d2",
};
const agentKeys = ["pilot-agent-02", "pilot-agent-03", "pilot-agent-04"] as const;
const adminKey = "pilot-admin-01";
const mutationMethod = /^(POST|PUT|PATCH|DELETE)$/;
const ignoredBrowserProblem =
  /ResizeObserver loop|favicon|net::ERR_ABORTED|Download the React DevTools/i;
const cohortReferenceDate = new Date();
cohortReferenceDate.setUTCHours(12, 0, 0, 0);
const productionWorkspaceReadyTimeoutMs = 120_000;
const maxProductionPasswordAuthAttempts = 6;

export type ProductionCohortAccount = {
  authUserId: string;
  email: string;
  key: string;
  password: string;
  role: "admin" | "agent";
};

type StoredPilotUser = ProductionCohortAccount & {
  exists?: boolean;
  roleVerified?: boolean;
  signInVerified?: boolean;
};

type StoredCohort = {
  pilotUsers?: StoredPilotUser[];
  productionNotSandboxConfirmed?: boolean;
  projectRef?: string;
};

export type CohortCaseStage =
  | "creating"
  | "created"
  | "questionnaire_saved"
  | "submitted";

export type CohortCaseCompletion = {
  lifecycle: "exported" | "submitted";
  submissionId: string;
};

export type CohortResumeState = {
  cases: Record<
    string,
    { caseMarker: string; stage: CohortCaseStage; submissionId?: string }
  >;
  projectRef: typeof PRODUCTION_PROJECT_REF;
  runMarker: string;
  schemaVersion: 1;
};

export type ProductionCohortCase = {
  accountIndex: number;
  applicantCount: number;
  caseKey: string;
  caseMarker: string;
  city: "Казань" | "Москва" | "Санкт-Петербург";
  ordinal: number;
  ownerKey: string;
  type: "family" | "single";
};

export type CohortMutationSummary = {
  count: number;
  method: string;
  path: string;
  status: number;
};

export type BrowserProblemEvidence = {
  count: number;
  digests: string[];
};

type MutationRecord = {
  method: string;
  path: string;
  status: number;
};

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function drawer(page: Page) {
  return page.locator('[role="dialog"]:visible').first();
}

async function isVisible(locator: Locator) {
  return locator.isVisible({ timeout: 750 }).catch(() => false);
}

async function clickFirstVisible(locator: Locator) {
  const count = await locator.count();
  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index);
    if (!(await isVisible(candidate))) continue;
    await candidate.click({ timeout: 15_000 });
    return;
  }
  throw new Error("No visible production UI control matched the requested action.");
}

async function openCreateSubmission(page: Page) {
  const create = page.getByRole("button", { name: /^(Создать пакет|Новая подача)$/ });
  if (!(await isVisible(create.first())))
    await clickWorkspaceButton(page, /Мои подачи/);
  await clickFirstVisible(create);
  await expect(drawer(page)).toBeVisible();
  await expect(
    drawer(page).getByRole("heading", { name: /Загрузка и первичная сборка/ }),
  ).toBeVisible();
}

async function waitForAgentSubmissionsSettled(page: Page) {
  await expect(page.locator('[aria-label="Загрузка подач"]')).toHaveCount(0, {
    timeout: 45_000,
  });
  const loadError = page
    .getByRole("alert")
    .filter({ hasText: "Не удалось загрузить подачи" });
  invariant(
    !(await isVisible(loadError.first())),
    "Production submissions failed to load.",
  );
}

async function openDrawerTab(page: Page, name: RegExp | string) {
  const root = drawer(page);
  const roleTab = root.getByRole("tab", { name }).first();
  const control = (await isVisible(roleTab))
    ? roleTab
    : root.getByRole("button", { name }).first();
  await expect(control).toBeVisible();
  await control.click();
}

async function openSubmissionById(page: Page, submissionId: string) {
  const search = page.getByRole("searchbox").first();
  if (await isVisible(search)) await search.fill(submissionId);
  const row = page.locator(`[data-submission-id="${submissionId}"]`).first();
  await expect(row).toBeVisible({ timeout: 45_000 });
  await row.click();
  await expect(drawer(page)).toBeVisible();
}

async function assertNoOverflow(page: Page) {
  const dimensions = await page.locator("html").evaluate((element) => {
    const root = element as unknown as { clientWidth: number; scrollWidth: number };
    return { clientWidth: root.clientWidth, scrollWidth: root.scrollWidth };
  });
  invariant(
    dimensions.scrollWidth <= dimensions.clientWidth,
    `Production UI horizontal overflow: ${dimensions.scrollWidth}/${dimensions.clientWidth}.`,
  );
}

async function assertAgentDrawerCaseContract(
  page: Page,
  cohortCase: ProductionCohortCase,
) {
  await openDrawerTab(page, /Обзор/);
  const root = drawer(page);
  await expect(root).toContainText(cohortCase.city);
  await expect(root).toContainText("Участники");
  await expect(root).toContainText(`${cohortCase.applicantCount} человек`);
  await expect(root.locator(".v20-person-row")).toHaveCount(cohortCase.applicantCount);
  await expect(root).toContainText(
    cohortCase.type === "family" ? /семейная/i : /индивидуальная/i,
  );
}

function parsedJson<T>(path: string): T {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    throw new Error(`Required local JSON is missing or invalid: ${path}`);
  }
}

function productionPublishableKey() {
  invariant(
    existsSync(productionEnvPath),
    ".env.supabase-production.local is required for production recovery.",
  );
  for (const line of readFileSync(productionEnvPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    if (trimmed.slice(0, separator).trim() !== "VITE_SUPABASE_PUBLISHABLE_KEY") {
      continue;
    }
    const value = trimmed
      .slice(separator + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
    invariant(value, "Production publishable key is absent.");
    return value;
  }
  throw new Error("Production publishable key is absent.");
}

function validatedAccount(
  user: StoredPilotUser | undefined,
  expectedRole: "admin" | "agent",
) {
  invariant(user, `Required production cohort account is absent (${expectedRole}).`);
  invariant(
    user.role === expectedRole,
    `Production cohort account role mismatch (${user.key}).`,
  );
  invariant(
    user.exists === true,
    `Production cohort account does not exist (${user.key}).`,
  );
  invariant(
    user.roleVerified === true,
    `Production cohort account role is unverified (${user.key}).`,
  );
  invariant(
    user.signInVerified === true,
    `Production cohort account sign-in is unverified (${user.key}).`,
  );
  invariant(
    user.email?.trim(),
    `Production cohort account email is absent (${user.key}).`,
  );
  invariant(
    user.password?.trim(),
    `Production cohort account password is absent (${user.key}).`,
  );
  invariant(
    user.authUserId?.trim(),
    `Production cohort account auth user id is absent (${user.key}).`,
  );
  return {
    authUserId: user.authUserId.trim(),
    email: user.email.trim(),
    key: user.key,
    password: user.password,
    role: expectedRole,
  } satisfies ProductionCohortAccount;
}

export function loadProductionCohortAccounts() {
  invariant(existsSync(cohortPath), ".supabase-pilot-cohort.local.json is required.");
  const stored = parsedJson<StoredCohort>(cohortPath);
  invariant(
    stored.projectRef === PRODUCTION_PROJECT_REF,
    "Production cohort file points to an unapproved Supabase project ref.",
  );
  invariant(
    stored.productionNotSandboxConfirmed === true,
    "Production cohort file does not confirm a production environment.",
  );
  invariant(
    Array.isArray(stored.pilotUsers),
    "Production cohort pilotUsers are absent.",
  );

  const byKey = new Map(stored.pilotUsers.map((user) => [user.key, user]));
  const agents = agentKeys.map((key) => validatedAccount(byKey.get(key), "agent"));
  const admin = validatedAccount(byKey.get(adminKey), "admin");
  invariant(
    new Set(agents.map((account) => account.email.toLowerCase())).size === 3,
    "Agent emails must be unique.",
  );

  return { admin, agents };
}

export function requiredProductionRunMarker() {
  const marker = process.env.V19_PRODUCTION_COHORT_RUN_MARKER?.trim() ?? "";
  invariant(
    /^V19QA-\d{8}-[A-Z0-9]{4,12}$/.test(marker),
    "V19_PRODUCTION_COHORT_RUN_MARKER must match V19QA-YYYYMMDD-XXXX.",
  );
  return marker;
}

export function assertProductionCohortWriteUnlock() {
  invariant(
    process.env.SUPABASE_PRODUCTION_E2E_UNLOCK === "1",
    "SUPABASE_PRODUCTION_E2E_UNLOCK=1 is required.",
  );
  invariant(
    process.env.V19_PRODUCTION_COHORT_WRITE_UNLOCK === REQUIRED_COHORT_WRITE_UNLOCK,
    "The dedicated production cohort write unlock is absent.",
  );
  invariant(
    process.env.V19_PRODUCTION_COHORT_CONFIRM_PROJECT_REF === PRODUCTION_PROJECT_REF,
    "The production cohort project-ref confirmation is absent or wrong.",
  );
}

export function buildProductionCohortPlan(runMarker: string) {
  const cities = ["Москва", "Санкт-Петербург", "Казань"] as const;
  const cases: ProductionCohortCase[] = [];

  cities.forEach((city, accountIndex) => {
    const ownerKey = agentKeys[accountIndex];
    const shapes: Array<{
      applicantCount: number;
      suffix: string;
      type: "family" | "single";
    }> = [
      { applicantCount: 6, suffix: "F6", type: "family" },
      { applicantCount: 1, suffix: "S1", type: "single" },
      { applicantCount: 1, suffix: "S2", type: "single" },
      { applicantCount: 1, suffix: "S3", type: "single" },
    ];

    shapes.forEach((shape) => {
      const caseKey = `A${accountIndex + 1}-${shape.suffix}`;
      cases.push({
        accountIndex,
        applicantCount: shape.applicantCount,
        caseKey,
        caseMarker: `${runMarker}-${caseKey}`,
        city,
        ordinal: cases.length,
        ownerKey,
        type: shape.type,
      });
    });
  });

  invariant(
    cases.length === 12,
    "The cohort plan must contain exactly 12 submissions.",
  );
  invariant(
    cases.reduce((total, cohortCase) => total + cohortCase.applicantCount, 0) === 27,
    "The cohort plan must contain exactly 27 applicants.",
  );
  const plannedPassportNumbers = cases.flatMap((cohortCase) =>
    Array.from({ length: cohortCase.applicantCount }, (_, index) =>
      passportNumber(cohortCase, index),
    ),
  );
  invariant(
    new Set(plannedPassportNumbers).size === plannedPassportNumbers.length,
    "The cohort plan generated duplicate technical passport numbers.",
  );
  for (const key of agentKeys) {
    invariant(
      cases
        .filter((cohortCase) => cohortCase.ownerKey === key)
        .reduce((total, cohortCase) => total + cohortCase.applicantCount, 0) === 9,
      `The cohort plan must contain exactly nine applicants for ${key}.`,
    );
  }

  return cases;
}

export function productionCohortContactEmail(
  cohortCase: ProductionCohortCase,
  applicantIndex: number,
) {
  const contactSlot = cohortCase.type === "family" ? "family" : applicantIndex + 1;
  return `v19qa.${cohortCase.caseKey.toLowerCase()}.${contactSlot}@example.invalid`;
}

function sha256(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function qaAssetPath(name: (typeof permittedQaAssetNames)[number]) {
  return resolve(qaAssetsDirectory, name);
}

export async function assertPermittedQaAssets() {
  invariant(
    !permittedQaAssetNames.includes("passport.jpeg" as never),
    "passport.jpeg must never be part of the production cohort asset allowlist.",
  );
  for (const name of permittedQaAssetNames) {
    const path = qaAssetPath(name);
    const metadata = await lstat(path).catch(() => null);
    invariant(
      metadata?.isFile() && !metadata.isSymbolicLink() && metadata.size > 0,
      `Required QA asset is absent: ${name}`,
    );
    invariant(
      (await realpath(path)) === path,
      `Required QA asset path is indirect: ${name}`,
    );
    const bytes = await readFile(path);
    const signature = bytes.subarray(0, 8);
    invariant(
      signature.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
      `Required QA asset is not a PNG: ${name}`,
    );
    invariant(
      sha256(bytes) === permittedQaAssetHashes[name],
      `Required QA asset hash mismatch: ${name}`,
    );
  }
}

async function passportAssetPayloads(cohortCase: ProductionCohortCase) {
  const names = permittedQaAssetNames.slice(0, 2);
  return Promise.all(
    Array.from({ length: cohortCase.applicantCount }, async (_, index) => {
      const sourceName = names[(cohortCase.ordinal + index) % names.length]!;
      return {
        buffer: await readFile(qaAssetPath(sourceName)),
        mimeType: "image/png",
        name: `${cohortCase.caseMarker}-passport-${index + 1}.png`,
      };
    }),
  );
}

export function selfieAssetPaths(globalApplicantIndex: number): [string, string] {
  const pairs = [
    ["селфи_И1.png", "селфи_И2.png"],
    ["селфи_М1.png", "селфи_М2.png"],
  ] as const;
  const pair = pairs[globalApplicantIndex % pairs.length]!;
  return [qaAssetPath(pair[0]), qaAssetPath(pair[1])];
}

export function cohortStatePath(runMarker: string) {
  return resolve(process.cwd(), `.production-cohort-${runMarker}.state.local.json`);
}

export async function loadCohortResumeState(
  runMarker: string,
): Promise<CohortResumeState> {
  const path = cohortStatePath(runMarker);
  if (!existsSync(path)) {
    return {
      cases: {},
      projectRef: PRODUCTION_PROJECT_REF,
      runMarker,
      schemaVersion: 1,
    };
  }
  const state = JSON.parse(await readFile(path, "utf8")) as CohortResumeState;
  invariant(
    state.schemaVersion === 1,
    "Unsupported production cohort checkpoint schema.",
  );
  invariant(
    state.projectRef === PRODUCTION_PROJECT_REF,
    "Checkpoint project ref mismatch.",
  );
  invariant(state.runMarker === runMarker, "Checkpoint run marker mismatch.");
  return state;
}

async function writeJsonAtomic(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  });
  await rename(temporaryPath, path);
}

export async function saveCohortResumeState(state: CohortResumeState) {
  await writeJsonAtomic(cohortStatePath(state.runMarker), state);
}

export async function writeCohortEvidence(runMarker: string, value: unknown) {
  const path = testArtifactPath(
    "playwright",
    "production-cohort",
    runMarker,
    "evidence.json",
  );
  await writeJsonAtomic(path, value);
  return path;
}

function sanitizeMutationPath(pathname: string) {
  const rpc = /^\/rest\/v1\/rpc\/([^/]+)$/.exec(pathname);
  if (rpc) return `/rest/v1/rpc/${rpc[1]}`;
  const rest = /^\/rest\/v1\/([^/?]+)/.exec(pathname);
  if (rest) return `/rest/v1/${rest[1]}`;
  const edge = /^\/functions\/v1\/([^/?]+)/.exec(pathname);
  if (edge) return `/functions/v1/${edge[1]}`;
  if (pathname.startsWith("/storage/v1/")) return "/storage/v1/object/*";
  if (pathname.startsWith("/auth/v1/")) return "/auth/v1/token";
  return "/unclassified";
}

function isProductionAuthMutation(record: MutationRecord) {
  return record.method === "POST" && record.path === "/auth/v1/token";
}

/**
 * Password login is retried by the production client (two auth-service
 * attempts × three resilient-fetch attempts). A recovered transport failure
 * is valid; an HTTP auth failure or any failed business mutation is not.
 */
export function assertProductionNetworkRecordsHealthy(
  records: readonly MutationRecord[],
  label: string,
) {
  invariant(records.length > 0, `${label}: no production mutation was observed.`);

  const authRecords = records.filter(isProductionAuthMutation);
  const businessRecords = records.filter((record) => !isProductionAuthMutation(record));
  const failedBusinessMutation = businessRecords.find(
    (record) => record.status < 200 || record.status >= 300,
  );
  invariant(
    !failedBusinessMutation,
    `${label}: production mutation failed (${failedBusinessMutation?.path ?? "unknown"}).`,
  );

  if (authRecords.length) {
    invariant(
      authRecords.length <= maxProductionPasswordAuthAttempts,
      `${label}: password auth exceeded the bounded retry contract.`,
    );
    invariant(
      authRecords.every(
        (record) =>
          record.status === 0 || (record.status >= 200 && record.status < 300),
      ),
      `${label}: password auth returned a non-retryable HTTP failure.`,
    );
    invariant(
      authRecords.some((record) => record.status >= 200 && record.status < 300),
      `${label}: password auth transport retry did not recover.`,
    );
  }
}

export function isPermittedCohortStaticRuntimeRequest(url: URL, method: string) {
  return (
    method === "GET" &&
    url.origin === PRODUCTION_COHORT_APP_ORIGIN &&
    (/^\/tesseract\/core\/[a-zA-Z0-9._-]+\.(?:js|wasm)$/.test(url.pathname) ||
      url.pathname === "/tesseract/lang/eng.traineddata.gz" ||
      url.pathname === "/tesseract/worker.min.js")
  );
}

export class ProductionNetworkLedger {
  readonly #mutations: MutationRecord[] = [];
  readonly #originViolations: string[] = [];

  attach(page: Page) {
    page.on("request", (request) => {
      const url = new URL(request.url());
      const method = request.method().toUpperCase();
      const isDataRequest =
        request.resourceType() === "fetch" || request.resourceType() === "xhr";
      const isPermittedStaticRuntimeAsset = isPermittedCohortStaticRuntimeRequest(
        url,
        method,
      );
      if (
        !isPermittedStaticRuntimeAsset &&
        ((url.hostname.endsWith(".supabase.co") &&
          url.origin !== PRODUCTION_SUPABASE_ORIGIN) ||
          (mutationMethod.test(method) && url.origin !== PRODUCTION_SUPABASE_ORIGIN) ||
          (isDataRequest && url.origin !== PRODUCTION_SUPABASE_ORIGIN))
      ) {
        this.#originViolations.push(
          sha256(`${method}:${url.origin}:${url.pathname}`).slice(0, 16),
        );
      }
    });
    page.on("requestfailed", (request) => {
      const url = new URL(request.url());
      const method = request.method().toUpperCase();
      if (url.origin === PRODUCTION_SUPABASE_ORIGIN && mutationMethod.test(method)) {
        this.#mutations.push({
          method,
          path: sanitizeMutationPath(url.pathname),
          status: 0,
        });
      }
    });
    page.on("response", (response) => {
      const request = response.request();
      if (!mutationMethod.test(request.method())) return;
      const url = new URL(response.url());
      if (url.origin !== PRODUCTION_SUPABASE_ORIGIN) return;
      this.#mutations.push({
        method: request.method(),
        path: sanitizeMutationPath(url.pathname),
        status: response.status(),
      });
    });
  }

  checkpoint() {
    return this.#mutations.length;
  }

  assertHealthySince(checkpoint: number, label: string) {
    invariant(
      this.#originViolations.length === 0,
      `${label}: an unapproved data source or origin was contacted.`,
    );
    const records = this.#mutations.slice(checkpoint);
    assertProductionNetworkRecordsHealthy(records, label);
  }

  assertNoOriginViolations() {
    invariant(
      this.#originViolations.length === 0,
      "An unapproved data source or origin was contacted.",
    );
  }

  summary(): CohortMutationSummary[] {
    const grouped = new Map<string, CohortMutationSummary>();
    for (const record of this.#mutations) {
      const key = `${record.method} ${record.path} ${record.status}`;
      const current = grouped.get(key);
      grouped.set(key, {
        count: (current?.count ?? 0) + 1,
        method: record.method,
        path: record.path,
        status: record.status,
      });
    }
    return [...grouped.values()].sort((left, right) =>
      `${left.method} ${left.path} ${left.status}`.localeCompare(
        `${right.method} ${right.path} ${right.status}`,
      ),
    );
  }
}

export function collectBrowserProblemEvidence(page: Page) {
  const messages: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !ignoredBrowserProblem.test(message.text())) {
      messages.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    if (!ignoredBrowserProblem.test(error.message)) messages.push(error.message);
  });
  return (): BrowserProblemEvidence => ({
    count: messages.length,
    digests: [...new Set(messages.map((message) => sha256(message).slice(0, 16)))],
  });
}

export async function signInCohortAccount(
  context: BrowserContext,
  account: ProductionCohortAccount,
) {
  const page = await context.newPage();
  const ledger = new ProductionNetworkLedger();
  const browserProblems = collectBrowserProblemEvidence(page);
  ledger.attach(page);
  await page.goto("/");
  const switchToLogin = page.getByRole("button", { name: "Уже есть доступ? Войти" });
  if (await isVisible(switchToLogin)) await switchToLogin.click();
  await expect(page.getByRole("heading", { level: 1, name: "Вход" })).toBeVisible({
    timeout: productionWorkspaceReadyTimeoutMs,
  });
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Пароль", { exact: true }).fill(account.password);
  const loginCheckpoint = ledger.checkpoint();
  await page.getByRole("button", { name: "Войти" }).click();
  const expectedHeading =
    account.role === "admin"
      ? /^(Проверка|Очередь на проверку|Работа)$/
      : /^(Мои действия|Мои подачи)$/;
  await expect(
    page.getByRole("heading", { level: 1, name: expectedHeading }),
  ).toBeVisible({
    timeout: productionWorkspaceReadyTimeoutMs,
  });
  // The heading proves the authenticated UI state. The ledger independently
  // proves the successful production token exchange without relying on a
  // brittle SDK query-string serialization detail.
  ledger.assertHealthySince(loginCheckpoint, `Production login (${account.key})`);
  ledger.assertNoOriginViolations();
  return { browserProblems, ledger, page };
}

function formatDate(date: Date) {
  return [
    String(date.getUTCDate()).padStart(2, "0"),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    date.getUTCFullYear(),
  ].join(".");
}

function futureDate(days: number) {
  const date = new Date(cohortReferenceDate);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
}

function passportNumber(cohortCase: ProductionCohortCase, applicantIndex: number) {
  const digest = Number.parseInt(
    sha256(`${cohortCase.caseMarker}:${applicantIndex}`).slice(0, 8),
    16,
  );
  return `98${String(digest % 10_000_000).padStart(7, "0")}`;
}

function applicantSurname(cohortCase: ProductionCohortCase, applicantIndex: number) {
  return `${cohortCase.caseMarker}P${applicantIndex + 1}`;
}

async function clickQuestionnaireSection(
  questionnaire: Locator,
  name: RegExp | string,
) {
  const section = questionnaire
    .locator(".v19-questionnaire-section-tab")
    .filter({ hasText: name });
  await clickFirstVisible(section);
  await expect(questionnaire.locator(".v19-questionnaire-work-panel")).toBeVisible();
}

async function questionnaireField(questionnaire: Locator, label: string) {
  const escapedLabel = label.replaceAll('"', '\\"');
  const exact = questionnaire.locator(`[data-field-label="${escapedLabel}"]`).first();
  if ((await exact.count()) > 0) return exact;
  return questionnaire
    .locator(".v19-questionnaire-work-panel [data-field-label]")
    .filter({ hasText: label })
    .first();
}

async function fillQuestionnaireField(
  questionnaire: Locator,
  label: string,
  value: string,
) {
  const field = await questionnaireField(questionnaire, label);
  await expect(field).toBeVisible();
  const control = field
    .locator("input:not([readonly]), textarea:not([readonly])")
    .first();
  await expect(control).toBeVisible();
  if ((await control.inputValue()) !== value) {
    await control.fill(value);
    await control.press("Tab");
  }
}

async function chooseQuestionnaireField(
  questionnaire: Locator,
  label: string,
  value: string,
) {
  const field = await questionnaireField(questionnaire, label);
  await expect(field).toBeVisible();
  const quick = field.getByRole("button", { exact: true, name: value });
  if (await isVisible(quick.first())) {
    if ((await quick.first().getAttribute("aria-pressed")) !== "true")
      await clickFirstVisible(quick);
    return;
  }

  const dropdown = field.locator("button.v19-questionnaire-field-control").first();
  await expect(dropdown).toBeVisible();
  if ((await dropdown.innerText()).trim().includes(value)) return;
  await dropdown.click();
  const search = field.getByRole("textbox", { name: `Поиск: ${label}` });
  if (await isVisible(search)) await search.fill(value);
  const option = field
    .locator(".v19-questionnaire-dropdown-option")
    .filter({ hasText: value });
  await expect(option.first()).toBeVisible();
  await option.first().click();
}

async function fillApplicantQuestionnaire(
  questionnaire: Locator,
  cohortCase: ProductionCohortCase,
  applicantIndex: number,
) {
  const contactEmail = productionCohortContactEmail(cohortCase, applicantIndex);
  const applicantTabs = questionnaire.locator(".v19-questionnaire-applicant-tab");
  const isChild = cohortCase.type === "family" && applicantIndex >= 2;
  await expect(applicantTabs).toHaveCount(cohortCase.applicantCount);
  if (cohortCase.applicantCount > 1) await applicantTabs.nth(applicantIndex).click();

  await clickQuestionnaireSection(questionnaire, /Запись/);
  await chooseQuestionnaireField(questionnaire, "Город подачи", cohortCase.city);
  await chooseQuestionnaireField(questionnaire, "Тип визы", "Шенгенская");
  await chooseQuestionnaireField(questionnaire, "Категория обслуживания", "Normal");
  await fillQuestionnaireField(questionnaire, "Желаемая дата 1", futureDate(30));
  await fillQuestionnaireField(
    questionnaire,
    "Примечание",
    `PRODUCTION QA ${cohortCase.caseMarker}`,
  );

  await clickQuestionnaireSection(questionnaire, /Личные данные/);
  await fillQuestionnaireField(
    questionnaire,
    "Фамилия",
    applicantSurname(cohortCase, applicantIndex),
  );
  await fillQuestionnaireField(questionnaire, "Имя", `QATEST${applicantIndex + 1}`);
  await fillQuestionnaireField(
    questionnaire,
    "Дата рождения",
    isChild
      ? `0${(applicantIndex % 8) + 1}.01.${2010 + applicantIndex}`
      : `0${(applicantIndex % 8) + 1}.01.1990`,
  );
  await fillQuestionnaireField(questionnaire, "Место рождения", "QA TEST CITY");
  await chooseQuestionnaireField(
    questionnaire,
    "Страна рождения",
    "Russian Federation",
  );
  await chooseQuestionnaireField(
    questionnaire,
    "Текущее гражданство",
    "Russian Federation",
  );
  await chooseQuestionnaireField(
    questionnaire,
    "Пол",
    applicantIndex % 2 === 0 ? "Мужской" : "Женский",
  );
  await chooseQuestionnaireField(
    questionnaire,
    "Семейное положение",
    "Холост/не замужем",
  );
  if (isChild) {
    await fillQuestionnaireField(
      questionnaire,
      "Родитель/опекун несовершеннолетнего",
      `${applicantSurname(cohortCase, 0)} QATEST1`,
    );
  }

  await clickQuestionnaireSection(questionnaire, /Паспорт/);
  await chooseQuestionnaireField(questionnaire, "Тип документа", "Ordinary Passport");
  await fillQuestionnaireField(
    questionnaire,
    "Номер паспорта",
    passportNumber(cohortCase, applicantIndex),
  );
  await fillQuestionnaireField(questionnaire, "Дата выдачи", "01.01.2024");
  await fillQuestionnaireField(questionnaire, "Действителен до", "01.01.2034");
  await chooseQuestionnaireField(questionnaire, "Страна выдачи", "Russian Federation");
  await fillQuestionnaireField(questionnaire, "Место выдачи", "QA AUTHORITY");

  await clickQuestionnaireSection(questionnaire, /Адрес и контакты/);
  await fillQuestionnaireField(
    questionnaire,
    "Домашний адрес",
    `QA TEST STREET ${cohortCase.accountIndex + 1}, ${cohortCase.city}`,
  );
  await fillQuestionnaireField(questionnaire, "Email", contactEmail);
  await fillQuestionnaireField(questionnaire, "Телефон", "+7 900 111 22 33");
  await chooseQuestionnaireField(
    questionnaire,
    "Страна проживания",
    "Russian Federation",
  );
  await fillQuestionnaireField(questionnaire, "Город проживания", cohortCase.city);
  await fillQuestionnaireField(questionnaire, "Почтовый индекс", "101000");
  await chooseQuestionnaireField(
    questionnaire,
    "Проживание не в стране гражданства",
    "Нет",
  );

  await clickQuestionnaireSection(questionnaire, /Работа \/ учеба/);
  await chooseQuestionnaireField(
    questionnaire,
    "Профессия",
    isChild ? "MINOR" : "IT PROFESSIONAL",
  );
  if (!isChild) {
    await fillQuestionnaireField(
      questionnaire,
      "Работодатель / учебное заведение",
      "V19 PRODUCTION QA LAB",
    );
    await fillQuestionnaireField(
      questionnaire,
      "Телефон работодателя / учебного заведения",
      "+7 900 222 33 44",
    );
    await fillQuestionnaireField(
      questionnaire,
      "Адрес работодателя / учебного заведения",
      "QA OFFICE STREET 2",
    );
  }

  await clickQuestionnaireSection(questionnaire, /Поездка/);
  await chooseQuestionnaireField(questionnaire, "Цель поездки", "TOURISM");
  await chooseQuestionnaireField(questionnaire, "Основная страна назначения", "Spain");
  await chooseQuestionnaireField(questionnaire, "Страна первого въезда", "Spain");
  await chooseQuestionnaireField(questionnaire, "Количество въездов", "Однократная");
  await fillQuestionnaireField(questionnaire, "Дата въезда", futureDate(120));
  await fillQuestionnaireField(questionnaire, "Дата выезда", futureDate(127));
  await expect(
    questionnaire.getByRole("spinbutton", {
      name: "Длительность пребывания",
    }),
  ).toHaveValue("8");
  await chooseQuestionnaireField(questionnaire, "Отпечатки ранее сдавались", "Нет");

  await clickQuestionnaireSection(questionnaire, /Отель \/ приглашение/);
  await chooseQuestionnaireField(
    questionnaire,
    "Тип принимающей стороны",
    "Гостиница/временное жилье",
  );
  await fillQuestionnaireField(
    questionnaire,
    "ФИО приглашающего лица или название отеля/компании",
    "HOTEL V19 QA MADRID",
  );
  await fillQuestionnaireField(questionnaire, "Адрес", "CALLE QA 10, MADRID");
  await chooseQuestionnaireField(questionnaire, "Страна", "Spain");
  await fillQuestionnaireField(questionnaire, "Город", "Madrid");
  await fillQuestionnaireField(questionnaire, "Почтовый индекс", "28001");
  await fillQuestionnaireField(questionnaire, "Email", contactEmail);
  await fillQuestionnaireField(questionnaire, "Телефон", "+34 600 123 456");

  await clickQuestionnaireSection(questionnaire, /Оплата поездки/);
  await chooseQuestionnaireField(
    questionnaire,
    "Кто оплачивает поездку",
    "Сам заявитель",
  );
  await chooseQuestionnaireField(questionnaire, "Средства заявителя", "Наличные");

  const confirmPassportReview = questionnaire.getByTestId(
    "questionnaire-confirm-passport-review",
  );
  if (await isVisible(confirmPassportReview)) {
    await confirmPassportReview.click();
    await expect(confirmPassportReview).toHaveCount(0, { timeout: 45_000 });
  }
}

async function uploadApplicantRequiredFiles(
  page: Page,
  questionnaire: Locator,
  cohortCase: ProductionCohortCase,
  applicantIndex: number,
  globalApplicantIndex: number,
) {
  const applicantTabs = questionnaire.locator(".v19-questionnaire-applicant-tab");
  if (cohortCase.applicantCount > 1) await applicantTabs.nth(applicantIndex).click();
  await clickQuestionnaireSection(questionnaire, /Файлы/);
  const selfiePaths = selfieAssetPaths(globalApplicantIndex);
  const passportPayload = (await passportAssetPayloads(cohortCase))[applicantIndex];
  invariant(
    passportPayload,
    `Passport recovery payload is absent (${cohortCase.caseKey}:${applicantIndex + 1}).`,
  );
  const slots = [
    { file: passportPayload, label: "Загранпаспорт" },
    { file: selfiePaths[0], label: "Селфи 1" },
    { file: selfiePaths[1], label: "Селфи 2" },
  ];
  for (const { file, label } of slots) {
    const slot = questionnaire
      .locator(".v19-questionnaire-file-slot")
      .filter({ hasText: label });
    await expect(slot).toBeVisible();
    const ready = slot.locator(".v19-questionnaire-file-status.is-ready");
    if (await isVisible(ready)) continue;
    const input = slot.locator('input[type="file"]');
    await expect(input).toHaveCount(1);
    await input.setInputFiles(file);
    await expect(ready).toBeVisible({ timeout: 45_000 });
  }
}

async function openQuestionnaireFromDrawer(page: Page) {
  await openDrawerTab(page, /Анкета/);
  const open = drawer(page).getByRole("button", {
    name: /Открыть анкету|Продолжить анкету|Смотреть анкету|Исправить анкету/,
  });
  await expect(open).toBeVisible({ timeout: 15_000 });
  await open.click();
  const questionnaire = page.locator(".vf-figma-questionnaire-screen").first();
  await expect(questionnaire).toBeVisible({ timeout: 45_000 });
  return questionnaire;
}

async function reopenQuestionnaireFromCanonicalState(page: Page, submissionId: string) {
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /^(Мои действия|Мои подачи)$/,
    }),
  ).toBeVisible({ timeout: 45_000 });
  await clickWorkspaceButton(page, /Мои подачи/);
  await waitForAgentSubmissionsSettled(page);
  await openSubmissionById(page, submissionId);
  return openQuestionnaireFromDrawer(page);
}

function questionnaireSubmitButton(questionnaire: Locator) {
  return questionnaire.locator(
    '.v19-questionnaire-complete-button.is-ready[aria-label="Отправить на проверку"]',
  );
}

async function questionnaireReadinessDiagnostic(
  questionnaire: Locator,
  cohortCase: ProductionCohortCase,
) {
  const headerText = await questionnaire
    .locator(".v19-questionnaire-screen-header")
    .innerText();
  const progress = /\d+%\s*·\s*\d+\/\d+/.exec(headerText)?.[0] ?? "unknown";
  const sectionSummaries = await questionnaire
    .locator(".v19-questionnaire-section-tab")
    .evaluateAll((elements) => [
      ...new Set(
        elements
          .map((element) =>
            (element as unknown as { textContent?: string | null }).textContent
              ?.replace(/\s+/g, " ")
              .trim(),
          )
          .filter((value): value is string => Boolean(value)),
      ),
    ]);
  return `Submission readiness is blocked (${cohortCase.caseKey}; ${progress}; ${sectionSummaries.join(" | ")}).`;
}

async function fillAndSaveQuestionnaire(
  questionnaire: Locator,
  cohortCase: ProductionCohortCase,
) {
  for (let index = 0; index < cohortCase.applicantCount; index += 1) {
    await fillApplicantQuestionnaire(questionnaire, cohortCase, index);
  }
  const save = questionnaire.getByRole("button", {
    name: "Сохранить и выйти",
    exact: true,
  });
  await expect(save).toBeEnabled();
  await save.click();
  await expect(questionnaire).toHaveCount(0, { timeout: 45_000 });
}

async function findCaseSubmissionId(page: Page, cohortCase: ProductionCohortCase) {
  await clickWorkspaceButton(page, /Мои подачи/);
  await waitForAgentSubmissionsSettled(page);
  const search = page.getByRole("searchbox").first();
  if (!(await isVisible(search))) return null;
  await search.fill(cohortCase.caseMarker);
  await page.waitForTimeout(500);
  const matches = page
    .locator("[data-submission-id]")
    .filter({ hasText: cohortCase.caseMarker });
  const uniqueIds = new Set<string>();
  for (let index = 0; index < (await matches.count()); index += 1) {
    const id = await matches.nth(index).getAttribute("data-submission-id");
    if (id) uniqueIds.add(id);
  }
  const ids = [...uniqueIds];
  invariant(
    ids.length <= 1,
    `Duplicate production cohort submissions detected (${cohortCase.caseKey}).`,
  );
  if (ids.length === 0) return null;
  const id = ids[0];
  invariant(id, `Submission id is missing (${cohortCase.caseKey}).`);
  return id;
}

async function findCreatingCaseByPassportMarker(
  page: Page,
  cohortCase: ProductionCohortCase,
) {
  await clickWorkspaceButton(page, /Мои подачи/);
  await waitForAgentSubmissionsSettled(page);
  const search = page.getByRole("searchbox").first();
  if (await isVisible(search)) await search.fill("");
  const cards = page.locator("[data-submission-id]");
  const uniqueIds = new Set<string>();
  for (let index = 0; index < (await cards.count()); index += 1) {
    const id = await cards.nth(index).getAttribute("data-submission-id");
    if (id) uniqueIds.add(id);
  }

  const matches: string[] = [];
  for (const submissionId of uniqueIds) {
    await openSubmissionById(page, submissionId);
    await expect(drawer(page)).toContainText(submissionId, { timeout: 45_000 });
    const filesTab = drawer(page).getByRole("tab", { name: /Файлы/ }).first();
    const filesButton = drawer(page).getByRole("button", { name: /Файлы/ }).first();
    const filesControl = (await isVisible(filesTab)) ? filesTab : filesButton;
    if (!(await isVisible(filesControl))) {
      await closeDrawerIfOpen(page);
      continue;
    }
    await filesControl.click();
    if ((await drawer(page).innerText()).includes(cohortCase.caseMarker)) {
      matches.push(submissionId);
    }
    await closeDrawerIfOpen(page);
  }
  invariant(
    matches.length <= 1,
    `Duplicate create checkpoints detected in production (${cohortCase.caseKey}).`,
  );
  return matches[0] ?? null;
}

async function findCreatingCaseByAuthenticatedMarkerRead(
  page: Page,
  cohortCase: ProductionCohortCase,
) {
  const result = await page.evaluate(
    async ({ caseMarker, projectRef, publishableKey, supabaseOrigin }) => {
      const browserGlobal = globalThis as unknown as {
        localStorage: { getItem(key: string): string | null };
      };
      const rawSession = browserGlobal.localStorage.getItem(
        `sb-${projectRef}-auth-token`,
      );
      if (!rawSession) return { ids: [] as string[], status: "session-absent" };

      let accessToken = "";
      try {
        const session = JSON.parse(rawSession) as {
          access_token?: unknown;
          currentSession?: { access_token?: unknown };
        };
        const candidate = session.access_token ?? session.currentSession?.access_token;
        if (typeof candidate === "string") accessToken = candidate;
      } catch {
        return { ids: [] as string[], status: "session-invalid" };
      }
      if (!accessToken) return { ids: [] as string[], status: "token-absent" };

      const readJson = async (url: URL) => {
        for (let attempt = 1; attempt <= 3; attempt += 1) {
          try {
            const response = await fetch(url, {
              headers: {
                apikey: publishableKey,
                authorization: `Bearer ${accessToken}`,
              },
            });
            if (response.ok) return { data: await response.json(), status: "ok" };
            if (
              attempt === 3 ||
              ![408, 429, 500, 502, 503, 504].includes(response.status)
            ) {
              return { data: [], status: `http-${response.status}` };
            }
          } catch {
            if (attempt === 3) return { data: [], status: "network-error" };
          }
          await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 400));
        }
        return { data: [], status: "retry-exhausted" };
      };

      const snapshotUrl = new URL("/rest/v1/submissions", supabaseOrigin);
      snapshotUrl.searchParams.set("select", "id,family_intelligence");
      const snapshotRead = await readJson(snapshotUrl);
      if (snapshotRead.status !== "ok") {
        return { ids: [] as string[], status: `snapshot-${snapshotRead.status}` };
      }
      const snapshotIds = (
        snapshotRead.data as Array<{
          family_intelligence?: {
            v19CockpitSnapshot?: {
              submission?: { files?: Array<{ originalFileName?: unknown }> };
            };
          };
          id?: unknown;
        }>
      )
        .filter((row) =>
          row.family_intelligence?.v19CockpitSnapshot?.submission?.files?.some(
            (file) =>
              typeof file.originalFileName === "string" &&
              file.originalFileName.startsWith(`${caseMarker}-passport-`),
          ),
        )
        .map((row) => row.id)
        .filter((id): id is string => typeof id === "string" && id.length > 0);

      const mediaUrl = new URL("/rest/v1/media_assets", supabaseOrigin);
      mediaUrl.searchParams.set("select", "submission_id");
      mediaUrl.searchParams.set("original_file_name", `like.${caseMarker}%`);
      const mediaRead = await readJson(mediaUrl);
      if (mediaRead.status !== "ok") {
        return { ids: [] as string[], status: `media-${mediaRead.status}` };
      }
      const mediaIds = (mediaRead.data as Array<{ submission_id?: unknown }>)
        .map((row) => row.submission_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0);
      return {
        ids: [...snapshotIds, ...mediaIds],
        status: "ok",
      };
    },
    {
      caseMarker: cohortCase.caseMarker,
      projectRef: PRODUCTION_PROJECT_REF,
      publishableKey: productionPublishableKey(),
      supabaseOrigin: PRODUCTION_SUPABASE_ORIGIN,
    },
  );
  invariant(
    result.status === "ok",
    `Production marker recovery read failed (${cohortCase.caseKey}:${result.status}).`,
  );
  const uniqueIds = [...new Set(result.ids)];
  invariant(
    uniqueIds.length <= 1,
    `Duplicate production marker rows detected (${cohortCase.caseKey}).`,
  );
  return uniqueIds[0] ?? null;
}

async function closeDrawerIfOpen(page: Page) {
  if (!(await isVisible(drawer(page)))) return;
  const close = drawer(page)
    .getByRole("button", { name: /Закрыть/ })
    .first();
  if (await isVisible(close)) {
    await close.click();
  } else {
    await page.keyboard.press("Escape");
  }
  await expect(drawer(page)).toHaveCount(0);
}

async function assertCheckpointMatchesCohortCase(
  page: Page,
  cohortCase: ProductionCohortCase,
  submissionId: string,
) {
  const filesTab = drawer(page).getByRole("tab", { name: /Файлы/ }).first();
  const filesButton = drawer(page).getByRole("button", { name: /Файлы/ }).first();
  const filesControl = (await isVisible(filesTab)) ? filesTab : filesButton;
  if (await isVisible(filesControl)) {
    await filesControl.click();
    await expect(drawer(page)).toContainText(cohortCase.caseMarker, {
      timeout: 45_000,
    });
  } else {
    const questionnaire = await openQuestionnaireFromDrawer(page);
    await clickQuestionnaireSection(questionnaire, /Личные данные/);
    await expect(
      questionnaire.locator('[data-field-label="Фамилия"] input').first(),
    ).toHaveValue(new RegExp(cohortCase.caseMarker), { timeout: 45_000 });
    await questionnaire.getByRole("button", { name: "Назад" }).click();
    await expect(questionnaire).toHaveCount(0);
    await openSubmissionById(page, submissionId);
    await expect(drawer(page)).toBeVisible();
    return;
  }
  await openDrawerTab(page, /Обзор/);
}

export async function createOrResumeCohortCase(input: {
  account: ProductionCohortAccount;
  cohortCase: ProductionCohortCase;
  ledger: ProductionNetworkLedger;
  page: Page;
  resumeState: CohortResumeState;
}): Promise<CohortCaseCompletion> {
  const { cohortCase, ledger, page, resumeState } = input;
  let checkpoint = resumeState.cases[cohortCase.caseKey];
  let questionnaire: Locator;

  await closeDrawerIfOpen(page);

  if (checkpoint) {
    invariant(
      checkpoint.caseMarker === cohortCase.caseMarker,
      `Checkpoint marker mismatch (${cohortCase.caseKey}).`,
    );
  }

  if (!checkpoint) {
    const recoveredId =
      (await findCaseSubmissionId(page, cohortCase)) ??
      (await findCreatingCaseByAuthenticatedMarkerRead(page, cohortCase)) ??
      (await findCreatingCaseByPassportMarker(page, cohortCase));
    if (recoveredId) {
      checkpoint = {
        caseMarker: cohortCase.caseMarker,
        stage: "created",
        submissionId: recoveredId,
      };
      resumeState.cases[cohortCase.caseKey] = checkpoint;
      await saveCohortResumeState(resumeState);
    }
  }

  if (checkpoint?.stage === "creating") {
    const recoveredId =
      (await findCaseSubmissionId(page, cohortCase)) ??
      (await findCreatingCaseByAuthenticatedMarkerRead(page, cohortCase)) ??
      (await findCreatingCaseByPassportMarker(page, cohortCase));
    invariant(
      recoveredId,
      `Unresolved create checkpoint (${cohortCase.caseKey}); refusing to create a possible duplicate.`,
    );
    checkpoint.stage = "created";
    checkpoint.submissionId = recoveredId;
    await saveCohortResumeState(resumeState);
  }

  if (checkpoint) {
    invariant(
      checkpoint.submissionId,
      `Checkpoint submission id is absent (${cohortCase.caseKey}).`,
    );
    await clickWorkspaceButton(page, /Мои подачи/);
    await waitForAgentSubmissionsSettled(page);
    await openSubmissionById(page, checkpoint.submissionId);
    await assertCheckpointMatchesCohortCase(page, cohortCase, checkpoint.submissionId);
    const visibleDrawerText = await drawer(page).innerText();
    const statusPill = drawer(page).locator(".v20-status-pill").first();
    const statusPillText = (await isVisible(statusPill))
      ? (await statusPill.innerText()).trim()
      : "";
    if (
      (await isVisible(statusPill)) &&
      /выгружено/i.test(await statusPill.innerText())
    ) {
      await expect(statusPill).toHaveText(/выгружено/i);
      await assertAgentDrawerCaseContract(page, cohortCase);
      await closeDrawerIfOpen(page);
      return { lifecycle: "exported", submissionId: checkpoint.submissionId };
    }
    if (
      checkpoint.stage === "submitted" ||
      /^(?:На проверке|Отправлено на проверку|проверка)$/i.test(statusPillText) ||
      /На проверке|Отправлено на проверку/i.test(visibleDrawerText)
    ) {
      if (statusPillText) {
        await expect(statusPill).toHaveText(
          /^(?:На проверке|Отправлено на проверку|проверка)$/i,
        );
      } else {
        await expect(drawer(page)).toContainText(/На проверке|Отправлено на проверку/i);
      }
      await assertAgentDrawerCaseContract(page, cohortCase);
      checkpoint.stage = "submitted";
      await saveCohortResumeState(resumeState);
      await closeDrawerIfOpen(page);
      return { lifecycle: "submitted", submissionId: checkpoint.submissionId };
    }
    questionnaire = await openQuestionnaireFromDrawer(page);
  } else {
    await openCreateSubmission(page);
    const create = drawer(page);
    const typeButton = create.getByRole("button", {
      exact: true,
      name: cohortCase.type === "family" ? "Семья" : "Заявитель",
    });
    await clickFirstVisible(typeButton);
    await expect(typeButton).toHaveAttribute("aria-pressed", "true");
    await create.getByLabel("Город подачи").click();
    await page.getByRole("option", { exact: true, name: cohortCase.city }).click();
    if (cohortCase.type === "family") {
      const add = create.getByRole("button", {
        name: "Добавить заявителя в семью",
      });
      for (let count = 2; count < cohortCase.applicantCount; count += 1)
        await clickFirstVisible(add);
    }
    await create
      .locator(".pi-file-input")
      .setInputFiles(await passportAssetPayloads(cohortCase));
    const createAndOpen = create.getByRole("button", {
      name: "Создать и открыть анкету",
    });
    await expect(createAndOpen).toBeEnabled({ timeout: 120_000 });
    checkpoint = {
      caseMarker: cohortCase.caseMarker,
      stage: "creating",
    };
    resumeState.cases[cohortCase.caseKey] = checkpoint;
    await saveCohortResumeState(resumeState);
    const mutationCheckpoint = ledger.checkpoint();
    await createAndOpen.click();
    questionnaire = page.locator(".vf-figma-questionnaire-screen").first();
    await expect(questionnaire).toBeVisible({ timeout: 60_000 });
    ledger.assertHealthySince(mutationCheckpoint, `create ${cohortCase.caseKey}`);
    const submissionId = await questionnaire.getAttribute("data-submission-id");
    invariant(submissionId, `Created submission id is absent (${cohortCase.caseKey}).`);
    checkpoint = {
      caseMarker: cohortCase.caseMarker,
      stage: "created",
      submissionId,
    };
    resumeState.cases[cohortCase.caseKey] = checkpoint;
    await saveCohortResumeState(resumeState);
  }

  if (checkpoint.stage === "created") {
    const mutationCheckpoint = ledger.checkpoint();
    let globalApplicantIndex = 0;
    const precedingCases = buildProductionCohortPlan(resumeState.runMarker).filter(
      (candidate) => candidate.ordinal < cohortCase.ordinal,
    );
    globalApplicantIndex = precedingCases.reduce(
      (total, candidate) => total + candidate.applicantCount,
      0,
    );
    for (let index = 0; index < cohortCase.applicantCount; index += 1) {
      await uploadApplicantRequiredFiles(
        page,
        questionnaire,
        cohortCase,
        index,
        globalApplicantIndex + index,
      );
    }
    await fillAndSaveQuestionnaire(questionnaire, cohortCase);
    await assertNoOverflow(page);
    ledger.assertHealthySince(mutationCheckpoint, `fill/upload ${cohortCase.caseKey}`);
    invariant(
      checkpoint.submissionId,
      `Created checkpoint id is absent (${cohortCase.caseKey}).`,
    );
    questionnaire = await reopenQuestionnaireFromCanonicalState(
      page,
      checkpoint.submissionId,
    );
    const canonicalSubmit = questionnaireSubmitButton(questionnaire);
    if (!(await canonicalSubmit.isEnabled())) {
      throw new Error(
        await questionnaireReadinessDiagnostic(questionnaire, cohortCase),
      );
    }
    checkpoint.stage = "questionnaire_saved";
    await saveCohortResumeState(resumeState);
  }

  if (checkpoint.stage === "questionnaire_saved") {
    let submit = questionnaireSubmitButton(questionnaire);
    if ((await submit.count()) !== 1 || !(await submit.isEnabled())) {
      const mutationCheckpoint = ledger.checkpoint();
      await fillAndSaveQuestionnaire(questionnaire, cohortCase);
      ledger.assertHealthySince(
        mutationCheckpoint,
        `questionnaire recovery ${cohortCase.caseKey}`,
      );
      invariant(
        checkpoint.submissionId,
        `Saved checkpoint id is absent (${cohortCase.caseKey}).`,
      );
      questionnaire = await reopenQuestionnaireFromCanonicalState(
        page,
        checkpoint.submissionId,
      );
      submit = questionnaireSubmitButton(questionnaire);
      if ((await submit.count()) !== 1 || !(await submit.isEnabled())) {
        throw new Error(
          await questionnaireReadinessDiagnostic(questionnaire, cohortCase),
        );
      }
    }
    await expect(submit).toBeEnabled({ timeout: 60_000 });
    const mutationCheckpoint = ledger.checkpoint();
    await submit.click();
    await expect(
      questionnaire.getByTestId("questionnaire-read-only-status"),
    ).toContainText("На проверке", { timeout: 60_000 });
    await questionnaire.getByRole("button", { name: "Назад" }).click();
    await expect(questionnaire).toHaveCount(0);
    invariant(
      checkpoint.submissionId,
      `Submitted checkpoint id is absent (${cohortCase.caseKey}).`,
    );
    await clickWorkspaceButton(page, /Мои подачи/);
    await waitForAgentSubmissionsSettled(page);
    await openSubmissionById(page, checkpoint.submissionId);
    await expect(drawer(page)).toContainText(/На проверке|Отправлено на проверку/, {
      timeout: 45_000,
    });
    ledger.assertHealthySince(mutationCheckpoint, `submit ${cohortCase.caseKey}`);
    await assertCheckpointMatchesCohortCase(page, cohortCase, checkpoint.submissionId);
    await assertAgentDrawerCaseContract(page, cohortCase);
    checkpoint.stage = "submitted";
    await saveCohortResumeState(resumeState);
  }

  await closeDrawerIfOpen(page);
  invariant(
    checkpoint.submissionId,
    `Completed checkpoint id is absent (${cohortCase.caseKey}).`,
  );
  return { lifecycle: "submitted", submissionId: checkpoint.submissionId };
}

export async function verifyAdminDoesNotSeeReviewCase(
  page: Page,
  submissionId: string,
) {
  await closeDrawerIfOpen(page);
  await clickWorkspaceButton(page, /Проверка|Работа/);
  await waitForAgentSubmissionsSettled(page);
  const search = page.getByRole("searchbox").first();
  if (await isVisible(search)) await search.fill(submissionId);
  await expect(page.locator(`[data-submission-id="${submissionId}"]`)).toHaveCount(0, {
    timeout: 45_000,
  });
}

export async function verifyAdminSeesSubmittedCase(
  page: Page,
  cohortCase: ProductionCohortCase,
  submissionId: string,
) {
  await closeDrawerIfOpen(page);
  await clickWorkspaceButton(page, /Проверка|Работа/);
  const search = page.getByRole("searchbox").first();
  if (await isVisible(search)) await search.fill(submissionId);
  const row = page.locator(`[data-submission-id="${submissionId}"]`).first();
  await expect(row).toBeVisible({ timeout: 45_000 });
  await expect(row).toContainText(/На проверке|Проверить|Новая/);
  await row.click();
  await expect(drawer(page)).toBeVisible();
  const overviewTab = drawer(page).getByRole("tab", { name: /Обзор/ }).first();
  const overviewButton = drawer(page).getByRole("button", { name: /Обзор/ }).first();
  const overviewControl = (await isVisible(overviewTab)) ? overviewTab : overviewButton;
  if (await isVisible(overviewControl)) await overviewControl.click();
  await expect(drawer(page)).toContainText(cohortCase.city);
  await expect(
    drawer(page).getByRole("tab", {
      name: new RegExp(`Заявители\\s+${cohortCase.applicantCount}`),
    }),
  ).toBeVisible();
  await openDrawerTab(page, /Заявители/);
  const applicantCards = drawer(page).locator(".admin-review-applicants-tab > article");
  if ((await applicantCards.count()) > 0) {
    await expect(applicantCards).toHaveCount(cohortCase.applicantCount);
  } else {
    const applicantOptions = drawer(page).locator(
      '[aria-label="Заявители в проверке"] select option',
    );
    if ((await applicantOptions.count()) > 0) {
      await expect(applicantOptions).toHaveCount(cohortCase.applicantCount);
    } else {
      await expect(
        drawer(page)
          .getByTestId("admin-review-travelers")
          .getByRole("navigation", { name: "Заявители пакета" })
          .locator("button"),
      ).toHaveCount(cohortCase.applicantCount);
    }
  }
  if (!(await drawer(page).innerText()).includes(cohortCase.caseMarker)) {
    await openDrawerTab(page, /Анкета/);
  }
  await expect(drawer(page)).toContainText(cohortCase.caseMarker);
  await expect(drawer(page)).toContainText(/На проверке|проверка/i);
  await closeDrawerIfOpen(page);
}

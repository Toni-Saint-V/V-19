import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

import { defineConfig } from "@playwright/test";

import { testArtifactPath } from "../../tests/support/artifacts";

import {
  PRODUCTION_COHORT_APP_ORIGIN,
  PRODUCTION_PROJECT_REF,
  PRODUCTION_SUPABASE_ORIGIN,
  loadProductionCohortAccounts,
  requiredProductionRunMarker,
} from "../../tests/e2e-supabase-ui/production-cohort-helpers";
import {
  PRODUCTION_EXPORT_CASE_KEY,
  assertProductionA1S1ExportWriteUnlock,
} from "../../tests/e2e-supabase-ui/production-export-a1-s1-helpers";

assertProductionA1S1ExportWriteUnlock();
requiredProductionRunMarker();
loadProductionCohortAccounts();

process.env.SUPABASE_UI_E2E_ENV_FILE = ".env.supabase-production.local";

const productionEnvPath = resolve(process.cwd(), ".env.supabase-production.local");
const verifiedDistUnlock = "I_UNDERSTAND_A2_S1_SCOPED_DIST_REUSE";
const scopedRuntimeSources = [
  "src/App.tsx",
  "src/components/AdminExportScreen.tsx",
  "src/modules/submissions/exportPackageDocumentCommit.ts",
  "src/modules/submissions/submissionActions.ts",
] as const;
const browserSafeEnvNames = [
  "VITE_SUPABASE_BACKEND_TARGET",
  "VITE_SUPABASE_BROWSER_KEY_AUDITED",
  "VITE_SUPABASE_BROWSER_QA_PASSED",
  "VITE_SUPABASE_EDGE_FUNCTIONS_URL",
  "VITE_SUPABASE_EDGE_FUNCTION_DRY_RUNS_PASSED",
  "VITE_SUPABASE_MIGRATIONS_APPLIED",
  "VITE_SUPABASE_MIGRATION_APPROVED",
  "VITE_SUPABASE_PRODUCTION_APPROVED",
  "VITE_SUPABASE_PROJECT_ID",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_RLS_POLICY_TESTS_PASSED",
  "VITE_SUPABASE_STORAGE_POLICY_TESTS_PASSED",
  "VITE_SUPABASE_TRANSACTIONAL_PERSISTENCE_TESTED",
  "VITE_SUPABASE_URL",
] as const;

function loadProductionEnv() {
  if (!existsSync(productionEnvPath)) {
    throw new Error(
      `.env.supabase-production.local is required for the ${PRODUCTION_EXPORT_CASE_KEY} production export gate.`,
    );
  }
  const values: Record<string, string> = {};
  for (const line of readFileSync(productionEnvPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    values[trimmed.slice(0, separator).trim()] = trimmed
      .slice(separator + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
  }

  if (values.VITE_SUPABASE_PROJECT_ID !== PRODUCTION_PROJECT_REF) {
    throw new Error(
      `${PRODUCTION_EXPORT_CASE_KEY} production export refuses an unapproved Supabase project ref.`,
    );
  }
  if (values.VITE_SUPABASE_URL !== PRODUCTION_SUPABASE_ORIGIN) {
    throw new Error(
      `${PRODUCTION_EXPORT_CASE_KEY} production export refuses an unapproved Supabase URL.`,
    );
  }
  if (values.VITE_SUPABASE_BACKEND_TARGET !== "supabase") {
    throw new Error(
      `${PRODUCTION_EXPORT_CASE_KEY} production export requires VITE_SUPABASE_BACKEND_TARGET=supabase.`,
    );
  }
  const functionsUrl = values.VITE_SUPABASE_EDGE_FUNCTIONS_URL?.trim();
  if (functionsUrl && new URL(functionsUrl).origin !== PRODUCTION_SUPABASE_ORIGIN) {
    throw new Error(
      `${PRODUCTION_EXPORT_CASE_KEY} production export refuses an unapproved Edge Functions origin.`,
    );
  }

  const selected: Record<string, string> = {};
  for (const name of browserSafeEnvNames) {
    const value = values[name]?.trim();
    if (value) selected[name] = value;
  }
  if (!selected.VITE_SUPABASE_PUBLISHABLE_KEY) {
    throw new Error(
      `VITE_SUPABASE_PUBLISHABLE_KEY is required for ${PRODUCTION_EXPORT_CASE_KEY} production export.`,
    );
  }
  return {
    ...selected,
    VITE_SUPABASE_ACTIVATION_TARGET: "production",
    VITE_SUPABASE_BACKEND_TARGET: "supabase",
    VITE_SUPABASE_RELEASE_ENABLED: "true",
    VITE_SUPABASE_SANDBOX_PROBE_ENABLED: "false",
  };
}

function productionServerCommand() {
  if (process.env.V19_PRODUCTION_A2_S1_VERIFIED_DIST_UNLOCK !== verifiedDistUnlock) {
    return "npm run build:supabase-production && npm run preview -- --host 127.0.0.1 --port 4202 --strictPort";
  }

  const distIndexPath = resolve(process.cwd(), "dist/index.html");
  if (!existsSync(distIndexPath)) {
    throw new Error("Scoped production dist reuse requires dist/index.html.");
  }
  const distMtime = statSync(distIndexPath).mtimeMs;
  for (const relativePath of scopedRuntimeSources) {
    const sourcePath = resolve(process.cwd(), relativePath);
    if (!existsSync(sourcePath) || statSync(sourcePath).mtimeMs > distMtime) {
      throw new Error(
        `Scoped production dist is stale for in-scope runtime source: ${relativePath}`,
      );
    }
  }

  return "npm run verify:production-bundle && npm run preview -- --host 127.0.0.1 --port 4202 --strictPort";
}

export default defineConfig({
  forbidOnly: true,
  fullyParallel: false,
  outputDir: testArtifactPath(
    "playwright",
    `production-export-${PRODUCTION_EXPORT_CASE_KEY.toLowerCase()}`,
  ),
  preserveOutput: "never",
  reporter: [["list"]],
  retries: 0,
  testDir: "../../tests/e2e-supabase-ui",
  testMatch: /production-export-a1-s1-resumable\.spec\.ts/,
  timeout: 1_800_000,
  use: {
    acceptDownloads: true,
    actionTimeout: 45_000,
    baseURL: PRODUCTION_COHORT_APP_ORIGIN,
    launchOptions: { args: ["--disable-ipv6"] },
    screenshot: "off",
    trace: "off",
    video: "off",
  },
  webServer: {
    cwd: "../..",
    command: productionServerCommand(),
    env: loadProductionEnv(),
    reuseExistingServer: false,
    timeout: 240_000,
    url: PRODUCTION_COHORT_APP_ORIGIN,
  },
  workers: 1,
});

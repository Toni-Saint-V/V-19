import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "@playwright/test";

import {
  PRODUCTION_PROJECT_REF,
  PRODUCTION_COHORT_APP_ORIGIN,
  PRODUCTION_SUPABASE_ORIGIN,
  assertProductionCohortWriteUnlock,
  loadProductionCohortAccounts,
  requiredProductionRunMarker,
} from "./tests/e2e-supabase-ui/production-cohort-helpers";

assertProductionCohortWriteUnlock();
requiredProductionRunMarker();
loadProductionCohortAccounts();

process.env.SUPABASE_UI_E2E_ENV_FILE = ".env.supabase-production.local";

const productionEnvPath = resolve(process.cwd(), ".env.supabase-production.local");
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
      ".env.supabase-production.local is required for the production cohort.",
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
    throw new Error("Production cohort refuses an unapproved Supabase project ref.");
  }
  if (values.VITE_SUPABASE_URL !== PRODUCTION_SUPABASE_ORIGIN) {
    throw new Error("Production cohort refuses an unapproved Supabase URL.");
  }
  if (values.VITE_SUPABASE_BACKEND_TARGET !== "supabase") {
    throw new Error(
      "Production cohort requires VITE_SUPABASE_BACKEND_TARGET=supabase.",
    );
  }
  const functionsUrl = values.VITE_SUPABASE_EDGE_FUNCTIONS_URL?.trim();
  if (functionsUrl && new URL(functionsUrl).origin !== PRODUCTION_SUPABASE_ORIGIN) {
    throw new Error("Production cohort refuses an unapproved Edge Functions origin.");
  }

  const selected: Record<string, string> = {};
  for (const name of browserSafeEnvNames) {
    const value = values[name]?.trim();
    if (value) selected[name] = value;
  }
  if (!selected.VITE_SUPABASE_PUBLISHABLE_KEY) {
    throw new Error(
      "VITE_SUPABASE_PUBLISHABLE_KEY is required for the production cohort.",
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

export default defineConfig({
  forbidOnly: true,
  fullyParallel: false,
  outputDir: "test-results/production-cohort",
  reporter: [["list"]],
  retries: 0,
  testDir: "./tests/e2e-supabase-ui",
  testMatch: /production-cohort-3x9\.spec\.ts/,
  timeout: 10_800_000,
  use: {
    actionTimeout: 45_000,
    baseURL: PRODUCTION_COHORT_APP_ORIGIN,
    launchOptions: { args: ["--disable-ipv6"] },
    screenshot: "off",
    trace: "off",
    video: "off",
  },
  webServer: {
    command:
      "npm run build:supabase-production && npm run preview -- --host 127.0.0.1 --port 4202 --strictPort",
    env: loadProductionEnv(),
    reuseExistingServer: false,
    timeout: 120_000,
    url: PRODUCTION_COHORT_APP_ORIGIN,
  },
  workers: 1,
});

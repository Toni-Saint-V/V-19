import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";

import { testArtifactPath } from "../../tests/support/artifacts";

const smokeEnvPath = resolve(process.cwd(), ".env.supabase-smoke.local");
const productionEnvPath = resolve(process.cwd(), ".env.supabase-production.local");
const browserAuditTarget =
  process.env.SUPABASE_BROWSER_AUDIT_ENV === "production" ? "production" : "sandbox";
const browserAuditEnvPath =
  browserAuditTarget === "production" ? productionEnvPath : smokeEnvPath;
const productionSmokeUnlock =
  browserAuditTarget === "production" &&
  process.env.SUPABASE_PRODUCTION_SMOKE_UNLOCK === "1";
const browserSafeEnvNames = [
  "VITE_SUPABASE_BACKEND_TARGET",
  "VITE_SUPABASE_SANDBOX_PROBE_ENABLED",
  "VITE_SUPABASE_RELEASE_ENABLED",
  "VITE_SUPABASE_PROJECT_ID",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_EDGE_FUNCTIONS_URL",
  "VITE_SUPABASE_ACTIVATION_TARGET",
] as const;

function loadEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};

  const values: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    values[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }

  return values;
}

function loadBrowserSafeSmokeEnv(): Record<string, string> {
  const smokeEnv = loadEnvFile(browserAuditEnvPath);
  const selectedEnv: Record<string, string> = {};

  for (const name of browserSafeEnvNames) {
    const value = smokeEnv[name]?.trim();
    if (value) selectedEnv[name] = value;
  }

  return {
    ...selectedEnv,
    VITE_SUPABASE_BACKEND_TARGET: "supabase",
    VITE_SUPABASE_SANDBOX_PROBE_ENABLED:
      browserAuditTarget === "production" ? "false" : "true",
    VITE_SUPABASE_RELEASE_ENABLED: productionSmokeUnlock ? "true" : "false",
    VITE_SUPABASE_ACTIVATION_TARGET: browserAuditTarget,
    ...(productionSmokeUnlock
      ? {
          VITE_SUPABASE_TRANSACTIONAL_PERSISTENCE_TESTED: "true",
          VITE_SUPABASE_MIGRATION_APPROVED: "true",
          VITE_SUPABASE_MIGRATIONS_APPLIED: "true",
          VITE_SUPABASE_RLS_POLICY_TESTS_PASSED: "true",
          VITE_SUPABASE_STORAGE_POLICY_TESTS_PASSED: "true",
          VITE_SUPABASE_EDGE_FUNCTION_DRY_RUNS_PASSED: "true",
          VITE_SUPABASE_BROWSER_QA_PASSED: "true",
          VITE_SUPABASE_BROWSER_KEY_AUDITED: "true",
          VITE_SUPABASE_PRODUCTION_APPROVED: "true",
        }
      : {}),
  };
}

export default defineConfig({
  outputDir: testArtifactPath("playwright", "supabase-browser"),
  preserveOutput: "never",
  testDir: "../../tests/e2e-supabase",
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4198",
    screenshot: "off",
    trace: "off",
    video: "off",
  },
  webServer: {
    command: "npm run dev -- --port 4198 --strictPort",
    env: loadBrowserSafeSmokeEnv(),
    url: "http://127.0.0.1:4198",
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: "supabase-sandbox-browser-key-audit",
      grep: /browser-safe Supabase values/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "supabase-production-browser-key-audit",
      grep: /browser-safe Supabase values/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "supabase-sandbox-auth-smoke",
      grep: /opens the workspace with a smoke agent|uploads private media|keeps admin return and agent correction/,
      use: {
        ...devices["Desktop Chrome"],
        screenshot: "off",
        trace: "off",
        video: "off",
      },
    },
  ],
});

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";

import { SUPABASE_PRODUCTION_TARGET } from "../supabase-production-target.mjs";
import { testArtifactPath } from "../../tests/support/artifacts";

if (process.env.SUPABASE_PRODUCTION_E2E_UNLOCK !== "1") {
  throw new Error(
    "Production UI E2E is locked. Set SUPABASE_PRODUCTION_E2E_UNLOCK=1 explicitly.",
  );
}

process.env.SUPABASE_UI_E2E_ENV_FILE ??= ".env.supabase-production.local";

const productionEnvPath = resolve(process.cwd(), ".env.supabase-production.local");
const expectedProductionProjectId = SUPABASE_PRODUCTION_TARGET.projectId;
const expectedProductionUrl = SUPABASE_PRODUCTION_TARGET.projectUrl;
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

function loadEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) {
    throw new Error(
      ".env.supabase-production.local is required for production UI E2E.",
    );
  }

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

function loadProductionBrowserEnv(): Record<string, string> {
  const productionEnv = loadEnvFile(productionEnvPath);
  const selectedEnv: Record<string, string> = {};

  for (const name of browserSafeEnvNames) {
    const value = productionEnv[name]?.trim();
    if (value) selectedEnv[name] = value;
  }

  const required = [
    "VITE_SUPABASE_PROJECT_ID",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
    "VITE_SUPABASE_URL",
  ];
  for (const name of required) {
    if (!selectedEnv[name])
      throw new Error(`${name} is required for production UI E2E.`);
  }

  if (selectedEnv.VITE_SUPABASE_PROJECT_ID !== expectedProductionProjectId) {
    throw new Error("Production UI E2E refuses an unapproved Supabase project ref.");
  }
  if (selectedEnv.VITE_SUPABASE_URL !== expectedProductionUrl) {
    throw new Error("Production UI E2E refuses an unapproved Supabase URL.");
  }

  return {
    ...selectedEnv,
    VITE_SUPABASE_BACKEND_TARGET: "supabase",
    VITE_SUPABASE_SANDBOX_PROBE_ENABLED: "false",
    VITE_SUPABASE_RELEASE_ENABLED: "true",
    VITE_SUPABASE_ACTIVATION_TARGET: "production",
  };
}

export default defineConfig({
  outputDir: testArtifactPath("playwright", "supabase-production-ui"),
  preserveOutput: "never",
  testDir: "../../tests/e2e-supabase-ui",
  reporter: [["list"]],
  timeout: 300_000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4201",
    launchOptions: { args: ["--disable-ipv6"] },
    screenshot: "off",
    trace: "off",
    video: "off",
  },
  testMatch: /production-readonly\.spec\.ts/,
  webServer: {
    cwd: "../..",
    command: "npm run dev -- --host 127.0.0.1 --port 4201 --strictPort",
    env: loadProductionBrowserEnv(),
    url: "http://127.0.0.1:4201",
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: "production-ui-desktop-1440",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "production-ui-desktop-1280",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      name: "production-ui-desktop-1024",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1024, height: 768 } },
    },
    {
      name: "production-ui-mobile-375",
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium",
        viewport: { width: 375, height: 812 },
      },
    },
    {
      name: "production-ui-mobile-390",
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "production-ui-mobile-430",
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium",
        viewport: { width: 430, height: 932 },
      },
    },
  ],
});

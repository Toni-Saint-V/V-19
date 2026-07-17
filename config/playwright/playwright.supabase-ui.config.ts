import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";

import { testArtifactPath } from "../../tests/support/artifacts";

const sandboxProjectId = "oevvaowoklqttqkraxho";
const sandboxOrigin = `https://${sandboxProjectId}.supabase.co`;
const smokeEnvPath = resolve(
  process.cwd(),
  process.env.SUPABASE_UI_E2E_ENV_FILE ?? ".env.supabase-smoke.local",
);
const uiEvidenceRunId = `sandbox-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const browserSafeEnvNames = [
  "VITE_SUPABASE_PROJECT_ID",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_EDGE_FUNCTIONS_URL",
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

function loadSandboxBrowserEnv(): Record<string, string> {
  const smokeEnv = loadEnvFile(smokeEnvPath);
  if (smokeEnv.VITE_SUPABASE_PROJECT_ID?.trim() !== sandboxProjectId) {
    throw new Error("Supabase UI E2E refused: project id is not the approved sandbox.");
  }
  const supabaseUrl = smokeEnv.VITE_SUPABASE_URL?.trim();
  if (!supabaseUrl)
    throw new Error("Supabase UI E2E refused: VITE_SUPABASE_URL is missing.");
  try {
    if (new URL(supabaseUrl).origin !== sandboxOrigin) {
      throw new Error(
        "Supabase UI E2E refused: VITE_SUPABASE_URL is not the approved sandbox.",
      );
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("Supabase UI E2E refused:")
    ) {
      throw error;
    }
    throw new Error("Supabase UI E2E refused: VITE_SUPABASE_URL is not a valid URL.");
  }
  const edgeFunctionsUrl = smokeEnv.VITE_SUPABASE_EDGE_FUNCTIONS_URL?.trim();
  if (!edgeFunctionsUrl) {
    throw new Error(
      "Supabase UI E2E refused: VITE_SUPABASE_EDGE_FUNCTIONS_URL is missing.",
    );
  }
  try {
    const edgeUrl = new URL(edgeFunctionsUrl);
    const approvedEdgeHost =
      edgeUrl.protocol === "https:" &&
      edgeUrl.hostname.includes(sandboxProjectId) &&
      edgeUrl.hostname.endsWith(".supabase.co");
    if (!approvedEdgeHost) {
      throw new Error(
        "Supabase UI E2E refused: VITE_SUPABASE_EDGE_FUNCTIONS_URL is not the approved sandbox.",
      );
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("Supabase UI E2E refused:")
    ) {
      throw error;
    }
    throw new Error(
      "Supabase UI E2E refused: VITE_SUPABASE_EDGE_FUNCTIONS_URL is not a valid URL.",
    );
  }
  const selectedEnv: Record<string, string> = {};

  for (const name of browserSafeEnvNames) {
    const value = smokeEnv[name]?.trim();
    if (value) selectedEnv[name] = value;
  }

  return {
    ...selectedEnv,
    VITE_SUPABASE_BACKEND_TARGET: "supabase",
    VITE_SUPABASE_SANDBOX_PROBE_ENABLED: "true",
    VITE_SUPABASE_RELEASE_ENABLED: "false",
    VITE_SUPABASE_ACTIVATION_TARGET: "sandbox",
  };
}

export default defineConfig({
  outputDir: testArtifactPath("playwright", "supabase-ui"),
  preserveOutput: "never",
  metadata: { uiEvidenceRunId },
  testDir: "../../tests/e2e-supabase-ui",
  reporter: [["list"]],
  timeout: 300_000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4199",
    launchOptions: { args: ["--disable-ipv6"] },
    screenshot: "off",
    trace: "off",
    video: "off",
  },
  testMatch: /sandbox-ui-flow\.spec\.ts/,
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4199 --strictPort",
    env: loadSandboxBrowserEnv(),
    url: "http://127.0.0.1:4199",
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: "supabase-ui-desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "supabase-ui-mobile-320",
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium",
        viewport: { width: 320, height: 740 },
      },
    },
    {
      name: "supabase-ui-mobile-390",
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "supabase-ui-mobile-430",
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium",
        viewport: { width: 430, height: 932 },
      },
    },
    {
      name: "supabase-ui-tablet-768",
      use: {
        ...devices["iPad (gen 7)"],
        browserName: "chromium",
        viewport: { width: 768, height: 1024 },
      },
    },
  ],
});

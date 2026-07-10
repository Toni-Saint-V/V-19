import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const smokeEnvPath = resolve(process.cwd(), ".env.supabase-smoke.local");
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
  testDir: "./tests/e2e-supabase-ui",
  reporter: [["list"]],
  timeout: 300_000,
  use: {
    baseURL: "http://127.0.0.1:4199",
    launchOptions: { args: ["--disable-ipv6"] },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
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
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "supabase-ui-mobile-390",
      use: { ...devices["iPhone 13"], browserName: "chromium" },
    },
    {
      name: "supabase-ui-mobile-430",
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium",
        viewport: { width: 430, height: 932 },
      },
    },
  ],
});

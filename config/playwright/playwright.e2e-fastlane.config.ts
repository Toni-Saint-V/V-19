import { defineConfig, devices } from "@playwright/test";

import { testArtifactPath } from "../../tests/support/artifacts";

const e2eHost = process.env.PW_BASE_HOST ?? "localhost";
const e2eServerHost = process.env.PW_SERVER_HOST ?? "0.0.0.0";
const e2ePort = process.env.PW_BASE_PORT ?? "4207";
const e2eUrl = `http://${e2eHost}:${e2ePort}`;
const e2eBrowserChannel =
  process.env.PW_BROWSER_CHANNEL === "chrome" ? "chrome" : undefined;

export default defineConfig({
  outputDir: testArtifactPath("playwright", "fastlane"),
  preserveOutput: "never",
  testDir: "../../tests/e2e",
  timeout: 60_000,
  expect: {
    timeout: 20_000,
  },
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: e2eUrl,
    channel: e2eBrowserChannel,
    trace: "off",
    screenshot: "off",
    video: "off",
    launchOptions: {
      args: [
        "--no-first-run",
        "--disable-default-apps",
        "--disable-dev-shm-usage",
        "--no-proxy-server",
        "--proxy-bypass-list=<-loopback>",
      ],
    },
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
    {
      name: "mobile-chromium",
      use: {
        ...devices["Pixel 5"],
      },
    },
  ],
  webServer: {
    cwd: "../..",
    command: `npx vite --host ${e2eServerHost} --port ${e2ePort} --strictPort`,
    url: e2eUrl,
    // Keep fastlane evidence bound to its own local-demo server as well.
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      V19_DISABLE_ENV_FILES: "1",
      VITE_SUPABASE_BACKEND_TARGET: "local-demo",
      VITE_SUPABASE_SANDBOX_PROBE_ENABLED: "false",
      VITE_SUPABASE_RELEASE_ENABLED: "false",
      VITE_E2E_PASSPORT_MOCK_ENABLED: "true",
    },
  },
});

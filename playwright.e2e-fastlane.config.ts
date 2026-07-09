import { defineConfig, devices } from "@playwright/test";

const e2eHost = process.env.PW_BASE_HOST ?? "localhost";
const e2eServerHost = process.env.PW_SERVER_HOST ?? "0.0.0.0";
const e2ePort = process.env.PW_BASE_PORT ?? "4207";
const e2eUrl = `http://${e2eHost}:${e2ePort}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: {
    timeout: 20_000,
  },
  fullyParallel: false,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report-e2e-fastlane", open: "never" }],
  ],
  use: {
    baseURL: e2eUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: process.env.PW_VIDEO === "1" ? "retain-on-failure" : "off",
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
  ],
  webServer: {
    command: `npx vite --host ${e2eServerHost} --port ${e2ePort} --strictPort`,
    url: e2eUrl,
    reuseExistingServer: process.env.CI ? false : true,
    timeout: 120_000,
    env: {
      VITE_SUPABASE_BACKEND_TARGET: "local-demo",
      VITE_SUPABASE_SANDBOX_PROBE_ENABLED: "false",
      VITE_SUPABASE_RELEASE_ENABLED: "false",
      VITE_E2E_PASSPORT_MOCK_ENABLED: "true",
    },
  },
});

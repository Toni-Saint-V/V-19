import { defineConfig, devices } from "@playwright/test";


const e2eHost = process.env.PW_BASE_HOST ?? "localhost";
const e2ePort = process.env.PW_BASE_PORT ?? "4207";
const e2eUrl = `http://${e2eHost}:${e2ePort}`;
export default defineConfig({
  testDir: "./tests/e2e",
  reporter: [["list"]],
  use: {
    baseURL: e2eUrl,
    trace: "retain-on-failure",
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
  webServer: {
    command: `npx vite --host ${process.env.PW_SERVER_HOST ?? "0.0.0.0"} --port ${e2ePort} --strictPort`,
    env: {
      VITE_SUPABASE_BACKEND_TARGET: "local-demo",
      VITE_E2E_PASSPORT_MOCK_ENABLED: "true",
      VITE_SUPABASE_SANDBOX_PROBE_ENABLED: "false",
      VITE_SUPABASE_RELEASE_ENABLED: "false",
    },
    url: e2eUrl,
    // Release evidence must come from the local-demo server configured above,
    // never from an arbitrary developer server already bound to the port.
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 5"] },
    },
  ],
});

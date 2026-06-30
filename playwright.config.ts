import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4197",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --port 4197 --strictPort",
    env: {
      VITE_SUPABASE_BACKEND_TARGET: "local-demo",
      VITE_E2E_PASSPORT_MOCK_ENABLED: "true",
      VITE_E2E_LOCAL_DEMO_AUTH_BYPASS: "true",
      VITE_SUPABASE_SANDBOX_PROBE_ENABLED: "false",
      VITE_SUPABASE_RELEASE_ENABLED: "false",
    },
    url: "http://127.0.0.1:4197",
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

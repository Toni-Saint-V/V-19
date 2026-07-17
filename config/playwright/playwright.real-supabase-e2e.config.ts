import { defineConfig, devices } from "@playwright/test";

import baseConfig from "./playwright.supabase-ui.config";
import { testArtifactPath } from "../../tests/support/artifacts";

export default defineConfig({
  ...baseConfig,
  outputDir: testArtifactPath("playwright", "real-supabase-e2e"),
  preserveOutput: "never",
  fullyParallel: false,
  projects: [
    {
      name: "real-supabase-family-e2e",
      use: {
        ...devices["Desktop Chrome"],
        browserName: "chromium",
        viewport: { height: 900, width: 1440 },
      },
    },
  ],
  testMatch: /real-new-user-family-zip\.spec\.ts/,
  timeout: 900_000,
  workers: 1,
});

import { defineConfig } from "@playwright/test";

import cohortConfig from "./playwright.supabase-production-cohort.config";

export default defineConfig(cohortConfig, {
  outputDir: "test-results/production-cohort-a1",
  testMatch: /production-cohort-resume-a1\.spec\.ts/,
  timeout: 1_800_000,
});

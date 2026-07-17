import { defineConfig } from "@playwright/test";

import cohortConfig from "./playwright.supabase-production-cohort.config";
import { testArtifactPath } from "../../tests/support/artifacts";

export default defineConfig(cohortConfig, {
  outputDir: testArtifactPath("playwright", "production-cohort-a1"),
  preserveOutput: "never",
  testMatch: /production-cohort-resume-a1\.spec\.ts/,
  timeout: 1_800_000,
});

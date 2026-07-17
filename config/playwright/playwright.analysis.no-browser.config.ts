import { defineConfig } from "@playwright/test";

import { testArtifactPath } from "../../tests/support/artifacts";

export default defineConfig({
  outputDir: testArtifactPath("playwright", "analysis"),
  preserveOutput: "never",
  testDir: "../../tests",
  testMatch: /.*(admin-production|export-package-real-documents)\.spec\.ts/,
  reporter: [["list"]],
});

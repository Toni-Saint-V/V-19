import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: /.*(admin-production|export-package-real-documents)\.spec\.ts/,
  reporter: [["list"]],
});

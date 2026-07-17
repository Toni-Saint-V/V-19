import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const configPath = path.join(
  root,
  "config",
  "playwright",
  "playwright.supabase-production-ui.config.ts",
);
const specPath = path.join(root, "tests/e2e-supabase-ui/production-readonly.spec.ts");
const helperPath = path.join(root, "tests/e2e-supabase-ui/ui-helpers.ts");
const required = [
  'SUPABASE_PRODUCTION_E2E_UNLOCK !== "1"',
  'VITE_SUPABASE_ACTIVATION_TARGET: "production"',
  'VITE_SUPABASE_RELEASE_ENABLED: "true"',
  'VITE_SUPABASE_SANDBOX_PROBE_ENABLED: "false"',
  'expectedProductionProjectId = "tsymifccglpepvbmrcgh"',
  "expectedProductionUrl = `https://${expectedProductionProjectId}.supabase.co`",
  "refuses an unapproved Supabase project ref",
  "refuses an unapproved Supabase URL",
  "testMatch: /production-readonly\\.spec\\.ts/",
  "collectSupabaseMutations",
  "expect(supabaseMutations()).toEqual([])",
];

const missingFiles = [configPath, specPath, helperPath].filter(
  (filePath) => !fs.existsSync(filePath),
);
if (missingFiles.length) {
  console.error("Production UI E2E contract failed: required files are missing.");
  for (const filePath of missingFiles)
    console.error(`- ${path.relative(root, filePath)}`);
  process.exit(1);
}

const contract = [configPath, specPath, helperPath]
  .map((filePath) => fs.readFileSync(filePath, "utf8"))
  .join("\n");
const missing = required.filter((entry) => !contract.includes(entry));
if (missing.length) {
  console.error("Production UI E2E contract failed:");
  for (const entry of missing) console.error(`- missing ${entry}`);
  process.exit(1);
}

console.log(
  "Production UI E2E contract passed: explicit unlock and production-only target are required.",
);

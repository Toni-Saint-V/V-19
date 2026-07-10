import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const configPath = path.join(root, "playwright.supabase-production-ui.config.ts");
const required = [
  'SUPABASE_PRODUCTION_E2E_UNLOCK !== "1"',
  'VITE_SUPABASE_ACTIVATION_TARGET: "production"',
  'VITE_SUPABASE_RELEASE_ENABLED: "true"',
  'VITE_SUPABASE_SANDBOX_PROBE_ENABLED: "false"',
  'expectedProductionProjectId = "tsymifccglpepvbmrcgh"',
  'expectedProductionUrl = `https://${expectedProductionProjectId}.supabase.co`',
  'refuses an unapproved Supabase project ref',
  'refuses an unapproved Supabase URL',
  'testMatch: /production-readonly\\.spec\\.ts/',
];

if (!fs.existsSync(configPath)) {
  console.error("Production UI E2E contract failed: config is missing.");
  process.exit(1);
}

const config = fs.readFileSync(configPath, "utf8");
const missing = required.filter((entry) => !config.includes(entry));
if (missing.length) {
  console.error("Production UI E2E contract failed:");
  for (const entry of missing) console.error(`- missing ${entry}`);
  process.exit(1);
}

console.log("Production UI E2E contract passed: explicit unlock and production-only target are required.");

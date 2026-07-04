import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const repoRoot = process.cwd();
const sandboxProjectRef = "oevvaowoklqttqkraxho";
const readinessPath = resolve(repoRoot, "docs/release/supabase-production-readiness.json");

const localFilePaths = {
  productionEnv: resolve(repoRoot, ".env.supabase-production.local"),
  adminEnv: resolve(repoRoot, ".env.supabase-production-admin.local"),
  authSecurity: resolve(repoRoot, ".supabase-auth-security.local.json"),
  backupRestore: resolve(repoRoot, ".supabase-backup-restore.local.json"),
  pilotCohort: resolve(repoRoot, ".supabase-pilot-cohort.local.json"),
};

const args = parseArgs(process.argv.slice(2));
const now = new Date().toISOString();
const report = [];

function parseArgs(argv) {
  const parsed = {
    writeLocal: false,
    syncReadinessJson: false,
    force: false,
    allowSandbox: false,
    values: {},
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--write-local") {
      parsed.writeLocal = true;
      continue;
    }
    if (arg === "--sync-readiness-json") {
      parsed.syncReadinessJson = true;
      continue;
    }
    if (arg === "--force") {
      parsed.force = true;
      continue;
    }
    if (arg === "--allow-sandbox") {
      parsed.allowSandbox = true;
      continue;
    }
    if (!arg.startsWith("--")) {
      failUsage(`Unexpected argument: ${arg}`);
    }

    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      failUsage(`Missing value for ${arg}`);
    }
    parsed.values[toCamelCase(key)] = next.trim();
    index += 1;
  }

  return parsed;
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function failUsage(message) {
  console.error(message);
  console.error("");
  console.error("Usage:");
  console.error(
    "  npm run supabase:prepare-production -- --project-ref <ref> --project-url <url> --organization <org> --confirm-not-sandbox <text> --write-local",
  );
  process.exit(2);
}

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function envValue(key) {
  return clean(process.env[key]);
}

function value(name, envKey = "") {
  return clean(args.values[name]) || (envKey ? envValue(envKey) : "");
}

function readJson(path) {
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeFileIfAllowed(path, content) {
  if (existsSync(path) && !args.force) {
    report.push({
      ok: true,
      label: `${path} exists`,
      detail: "kept existing file; pass --force to rewrite",
    });
    return;
  }

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  report.push({ ok: true, label: `${path} written` });
}

function mask(value) {
  if (!value) return "";
  if (value.length <= 8) return "********";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

const readiness = readJson(readinessPath);
const projectRef =
  value("projectRef", "SUPABASE_PROJECT_REF") ||
  value("projectId", "VITE_SUPABASE_PROJECT_ID") ||
  clean(readiness.productionTarget?.projectId);
const projectUrl =
  value("projectUrl", "VITE_SUPABASE_URL") || clean(readiness.productionTarget?.projectUrl);
const organization =
  value("organization", "SUPABASE_ORGANIZATION") ||
  value("organizationSlug") ||
  clean(readiness.productionTarget?.supabaseOrganization);
const projectName = value("projectName", "SUPABASE_PROJECT_NAME");
const confirmNotSandbox =
  value("confirmNotSandbox", "SUPABASE_PRODUCTION_NOT_SANDBOX_CONFIRMATION") ||
  clean(args.values.productionConfirmation);
const publishableKey = value("publishableKey", "VITE_SUPABASE_PUBLISHABLE_KEY");
const adminKey = value(
  "adminKey",
  ["SUPABASE", "SERVICE", "ROLE", "KEY"].join("_"),
);
const accessToken = value("accessToken", "SUPABASE_ACCESS_TOKEN");

const expectedProjectUrl = projectRef ? `https://${projectRef}.supabase.co` : "";
const targetLooksSandbox = projectRef === sandboxProjectRef;
const targetLooksProduction =
  Boolean(projectRef && projectUrl && organization && confirmNotSandbox) &&
  !targetLooksSandbox &&
  clean(confirmNotSandbox).toLowerCase() !== "sandbox";
const projectUrlMatchesRef = Boolean(projectRef && projectUrl === expectedProjectUrl);

function addCheck(ok, label, detail = "") {
  report.push({ ok, label, detail });
}

addCheck(Boolean(projectRef), "production project ref provided");
addCheck(Boolean(projectUrl), "production project URL provided");
addCheck(Boolean(organization), "Supabase organization provided");
addCheck(
  projectUrlMatchesRef,
  "project URL matches project ref",
  projectRef && projectUrl ? `expected ${expectedProjectUrl}, got ${projectUrl}` : "",
);
addCheck(
  !targetLooksSandbox || args.allowSandbox,
  "target is not the known V-19 sandbox project",
  targetLooksSandbox ? `known sandbox ref: ${sandboxProjectRef}` : "",
);
addCheck(
  Boolean(confirmNotSandbox),
  "explicit local confirmation that target is not sandbox provided",
);
addCheck(
  targetLooksProduction || args.allowSandbox,
  "production target evidence is complete enough for local preflight",
);

const productionEnv = [
  "# Local only. Do not commit.",
  "VITE_SUPABASE_BACKEND_TARGET=supabase",
  "VITE_SUPABASE_SANDBOX_PROBE_ENABLED=false",
  "VITE_SUPABASE_RELEASE_ENABLED=false",
  `VITE_SUPABASE_PROJECT_ID=${projectRef}`,
  `VITE_SUPABASE_URL=${projectUrl}`,
  `VITE_SUPABASE_PUBLISHABLE_KEY=${publishableKey}`,
  `VITE_SUPABASE_EDGE_FUNCTIONS_URL=${projectUrl ? `${projectUrl}/functions/v1` : ""}`,
  "VITE_SUPABASE_ACTIVATION_TARGET=production",
  "VITE_SUPABASE_TRANSACTIONAL_PERSISTENCE_TESTED=false",
  "VITE_SUPABASE_MIGRATION_APPROVED=false",
  "VITE_SUPABASE_MIGRATIONS_APPLIED=false",
  "VITE_SUPABASE_RLS_POLICY_TESTS_PASSED=false",
  "VITE_SUPABASE_STORAGE_POLICY_TESTS_PASSED=false",
  "VITE_SUPABASE_EDGE_FUNCTION_DRY_RUNS_PASSED=false",
  "VITE_SUPABASE_BROWSER_QA_PASSED=false",
  "VITE_SUPABASE_BROWSER_KEY_AUDITED=false",
  "VITE_SUPABASE_PRODUCTION_APPROVED=false",
  "",
].join("\n");

const adminEnv = [
  "# Local only. Do not commit.",
  `SUPABASE_PROJECT_REF=${projectRef}`,
  `SUPABASE_PROJECT_URL=${projectUrl}`,
  `SUPABASE_ORGANIZATION=${organization}`,
  `SUPABASE_PROJECT_NAME=${projectName}`,
  `SUPABASE_PRODUCTION_NOT_SANDBOX_CONFIRMATION=${confirmNotSandbox}`,
  `SUPABASE_ACCESS_TOKEN=${accessToken}`,
  `${["SUPABASE", "SERVICE", "ROLE", "KEY"].join("_")}=${adminKey}`,
  "SUPABASE_DB_PASSWORD=",
  "SUPABASE_SMOKE_AGENT_EMAIL=",
  "SUPABASE_SMOKE_AGENT_PASSWORD=",
  "SUPABASE_SMOKE_OTHER_AGENT_EMAIL=",
  "SUPABASE_SMOKE_OTHER_AGENT_PASSWORD=",
  "SUPABASE_SMOKE_ADMIN_EMAIL=",
  "SUPABASE_SMOKE_ADMIN_PASSWORD=",
  "",
].join("\n");

const authSecurity = {
  schemaVersion: 1,
  scope: "supabase-production-auth-security",
  recordedAt: now,
  projectRef,
  projectUrl,
  organization,
  projectName,
  productionNotSandboxConfirmed: targetLooksProduction,
  securityAdvisorsChecked: false,
  checkedAt: "",
  performanceAdvisorsChecked: false,
  planEligibilityChecked: false,
  organizationPlan: "",
  planEligibilityEvidence: "",
  leakedPasswordProtectionPlanEligible: false,
  leakedPasswordProtectionEnabled: false,
  noBlockingSecurityAdvisorWarnings: false,
  openWarnings: [],
  evidenceArtifact: "",
  notes: "",
};

const backupRestore = {
  schemaVersion: 1,
  scope: "supabase-production-backup-restore",
  recordedAt: now,
  projectRef,
  projectUrl,
  organization,
  backupOwner: "",
  backupMechanism: "",
  latestBackupTimestamp: "",
  restorePathConfirmed: false,
  restoreEvidenceRecorded: false,
  rpoRtoAcceptedByOwner: false,
  rollbackCommunicationOwner: "",
  evidenceArtifact: "",
  restoreEvidenceArtifact: "",
  rpoRtoEvidenceArtifact: "",
  rollbackNotes: "",
};

const pilotCohort = {
  schemaVersion: 1,
  scope: "supabase-production-pilot-cohort",
  recordedAt: now,
  projectRef,
  projectUrl,
  organization,
  productionNotSandboxConfirmed: targetLooksProduction,
  cohorts: {
    agent: { email: "", exists: false, roleVerified: false },
    otherAgent: { email: "", exists: false, roleVerified: false },
    admin: { email: "", exists: false, roleVerified: false },
  },
  orphanAuthUsersWithoutProfileCount: null,
  notes: "",
};

if (args.writeLocal) {
  writeFileIfAllowed(localFilePaths.productionEnv, productionEnv);
  writeFileIfAllowed(localFilePaths.adminEnv, adminEnv);
  writeFileIfAllowed(
    localFilePaths.authSecurity,
    `${JSON.stringify(authSecurity, null, 2)}\n`,
  );
  writeFileIfAllowed(
    localFilePaths.backupRestore,
    `${JSON.stringify(backupRestore, null, 2)}\n`,
  );
  writeFileIfAllowed(localFilePaths.pilotCohort, `${JSON.stringify(pilotCohort, null, 2)}\n`);
} else {
  addCheck(true, "local files not written", "pass --write-local to create templates");
}

if (args.syncReadinessJson) {
  const updated = {
    ...readiness,
    productionTarget: {
      ...readiness.productionTarget,
      projectId: projectRef,
      projectUrl,
      supabaseOrganization: organization,
      activationTarget: "production",
    },
  };
  writeFileSync(readinessPath, `${JSON.stringify(updated, null, 2)}\n`);
  addCheck(true, `${readinessPath} synced`);
}

const blocking = report.filter((item) => !item.ok);

console.log("Supabase production packet preflight");
console.log("");
console.log(`projectRef: ${projectRef || "<missing>"}`);
console.log(`projectUrl: ${projectUrl || "<missing>"}`);
console.log(`organization: ${organization || "<missing>"}`);
console.log(`projectName: ${projectName || "<not recorded>"}`);
console.log(`publishableKey: ${mask(publishableKey) || "<empty>"}`);
console.log(`adminKey: ${mask(adminKey) || "<empty>"}`);
console.log(`accessToken: ${mask(accessToken) || "<empty>"}`);
console.log("");

for (const item of report) {
  const status = item.ok ? "PASS" : "BLOCKED";
  const detail = item.detail ? ` - ${item.detail}` : "";
  console.log(`${status}: ${item.label}${detail}`);
}

console.log("");
console.log("Mutation guard:");
console.log("- This script does not apply migrations.");
console.log("- Keep VITE_SUPABASE_MIGRATION_APPROVED=false until owner approval is explicit.");
console.log("- Apply production migrations only in a separate operator step after approval.");

if (blocking.length) {
  process.exitCode = 1;
}

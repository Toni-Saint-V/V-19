import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = process.cwd();
const migrationsDir = resolve(repoRoot, "supabase/migrations");
const releaseRunbookPath = resolve(
  repoRoot,
  "docs/release/supabase-production-promotion.md",
);
const prPackagePath = resolve(
  repoRoot,
  "docs/release/supabase-workspace-pr-package.md",
);
const productionApprovalChecklistPath = resolve(
  repoRoot,
  "docs/release/supabase-production-approval-checklist.md",
);
const supabaseReadmePath = resolve(repoRoot, "supabase/README.md");
const liveSmokePath = resolve(repoRoot, "tests/integration/supabase-live.spec.ts");
const packagePath = resolve(repoRoot, "package.json");
const smokeEnvPath = resolve(repoRoot, ".env.supabase-smoke.local");
const allowedSandboxProjectId = "oevvaowoklqttqkraxho";

const requiredMigrationOrder = [
  "20260611000000_visaflow_mvp_foundation.sql",
  "20260612000000_visaflow_rls_performance_hardening.sql",
  "20260612001000_visaflow_rpc_corrections_persistence.sql",
  "20260613005039_visaflow_runtime_write_guards.sql",
  "20260613010029_visaflow_rpc_submit_boundary.sql",
  "20260614000000_ai_helper_audit_quota.sql",
  "20260615000000_ai_helper_security_advisor_hardening.sql",
];

const checks = [];

function pass(label) {
  checks.push({ ok: true, label });
}

function fail(label, detail) {
  checks.push({ ok: false, label, detail });
}

function readProjectFile(path, label) {
  if (!existsSync(path)) {
    fail(label, `${path} is missing`);
    return "";
  }

  return readFileSync(path, "utf8");
}

function parseEnvFile(path) {
  if (!existsSync(path)) return {};

  const values = {};
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    values[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }

  return values;
}

function expectContains(content, expected, label) {
  if (content.includes(expected)) {
    pass(label);
  } else {
    fail(label, `Missing expected text: ${expected}`);
  }
}

function normalizeSql(content) {
  return content.replace(/--.*$/gm, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

function sqlStatements(content) {
  return content
    .replace(/--.*$/gm, " ")
    .split(";")
    .map((statement) => normalizeSql(statement))
    .filter(Boolean);
}

function expectSqlStatement(content, statement, label) {
  const normalizedContent = normalizeSql(content);
  const normalizedStatement = normalizeSql(statement);

  if (normalizedContent.includes(normalizedStatement)) {
    pass(label);
  } else {
    fail(label, `Missing expected SQL statement: ${statement}`);
  }
}

function expectNoSqlStatement(content, statement, label) {
  const normalizedContent = normalizeSql(content);
  const normalizedStatement = normalizeSql(statement);

  if (normalizedContent.includes(normalizedStatement)) {
    fail(label, `Forbidden SQL statement found: ${statement}`);
  } else {
    pass(label);
  }
}

function expectNoQuotaExecuteGrantToRole(content, role, label) {
  const grantPrefix = normalizeSql(
    "grant execute on function public.consume_ai_helper_quota(text, text, text, text) to ",
  );
  const forbiddenRole = role.toLowerCase();
  const matchingStatement = sqlStatements(content).find((statement) => {
    if (!statement.startsWith(grantPrefix)) return false;

    return statement
      .slice(grantPrefix.length)
      .split(",")
      .map((candidateRole) => candidateRole.trim())
      .some(
        (candidateRole) =>
          candidateRole === forbiddenRole ||
          candidateRole.startsWith(`${forbiddenRole} `),
      );
  });

  if (matchingStatement) {
    fail(label, `Forbidden SQL grant found: ${matchingStatement}`);
  } else {
    pass(label);
  }
}

function verifyMigrationOrder() {
  const migrationFiles = readdirSync(migrationsDir)
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort();
  const migrationVersions = new Set();
  const duplicateVersions = [];

  for (const fileName of migrationFiles) {
    const version = fileName.split("_")[0];
    if (migrationVersions.has(version)) duplicateVersions.push(version);
    migrationVersions.add(version);
  }

  if (duplicateVersions.length) {
    fail(
      "Migration versions are unique",
      `Duplicate migration versions: ${duplicateVersions.join(", ")}`,
    );
  } else {
    pass("Migration versions are unique");
  }

  const missingMigrations = requiredMigrationOrder.filter(
    (fileName) => !migrationFiles.includes(fileName),
  );
  if (missingMigrations.length) {
    fail(
      "Required Supabase migrations are present",
      `Missing: ${missingMigrations.join(", ")}`,
    );
  } else {
    pass("Required Supabase migrations are present");
  }

  const actualRequiredOrder = migrationFiles.filter((fileName) =>
    requiredMigrationOrder.includes(fileName),
  );
  if (actualRequiredOrder.join("\n") !== requiredMigrationOrder.join("\n")) {
    fail(
      "Required Supabase migrations are in promotion order",
      `Expected ${requiredMigrationOrder.join(" -> ")}, got ${actualRequiredOrder.join(
        " -> ",
      )}`,
    );
  } else {
    pass("Required Supabase migrations are in promotion order");
  }
}

function verifyRuntimeGuards() {
  const runtimeGuards = readProjectFile(
    resolve(migrationsDir, "20260613005039_visaflow_runtime_write_guards.sql"),
    "Runtime write guard migration exists",
  );
  const rpcBoundary = readProjectFile(
    resolve(migrationsDir, "20260613010029_visaflow_rpc_submit_boundary.sql"),
    "RPC submit boundary migration exists",
  );

  expectContains(
    runtimeGuards,
    "create constraint trigger submissions_review_readiness_guard",
    "Review readiness trigger is declared",
  );
  expectContains(
    runtimeGuards,
    "create trigger corrections_actor_guard",
    "Correction actor trigger is declared",
  );
  expectContains(
    runtimeGuards,
    "media storage update editable owner or admin",
    "Storage update policy is status-gated",
  );
  expectContains(
    runtimeGuards,
    "media storage delete editable owner or admin",
    "Storage delete policy is status-gated",
  );
  expectContains(
    rpcBoundary,
    "can_write_children := actor_role = 'admin'",
    "RPC child writes remain admin-capable",
  );
  expectContains(
    rpcBoundary,
    "submission_record.status in ('draft', 'filling', 'returned', 'ready_for_review')",
    "RPC child writes stop before waiting_review handoff",
  );
}

function verifyAiHelperSecurityHardening() {
  const quotaMigration = readProjectFile(
    resolve(migrationsDir, "20260614000000_ai_helper_audit_quota.sql"),
    "AI helper quota migration exists",
  );
  const hardeningMigration = readProjectFile(
    resolve(migrationsDir, "20260615000000_ai_helper_security_advisor_hardening.sql"),
    "AI helper security advisor hardening migration exists",
  );

  expectContains(
    quotaMigration,
    "api_role is distinct from expected_api_role",
    "AI helper quota RPC requires service role claim",
  );
  expectSqlStatement(
    hardeningMigration,
    "revoke all on table public.ai_helper_audit_events from anon, authenticated;",
    "AI helper audit table grants are revoked from browser roles",
  );
  expectSqlStatement(
    hardeningMigration,
    "revoke all on table public.ai_helper_quota_counters from anon, authenticated;",
    "AI helper quota counters table grants are revoked from browser roles",
  );
  expectSqlStatement(
    hardeningMigration,
    "revoke all on table public.ai_helper_quota_receipts from anon, authenticated;",
    "AI helper quota receipts table grants are revoked from browser roles",
  );
  expectContains(
    hardeningMigration,
    'create policy "ai helper audit service only"',
    "AI helper audit table has explicit deny policy",
  );
  expectContains(
    hardeningMigration,
    'create policy "ai helper counters service only"',
    "AI helper quota counters table has explicit deny policy",
  );
  expectContains(
    hardeningMigration,
    'create policy "ai helper receipts service only"',
    "AI helper quota receipts table has explicit deny policy",
  );
  expectSqlStatement(
    hardeningMigration,
    "revoke execute on function public.consume_ai_helper_quota(text, text, text, text) from anon, authenticated;",
    "AI helper quota RPC execute is revoked from browser roles",
  );
  expectSqlStatement(
    hardeningMigration,
    "grant execute on function public.consume_ai_helper_quota(text, text, text, text) to service_role;",
    "AI helper quota RPC execute grant is explicit",
  );
  expectNoSqlStatement(
    hardeningMigration,
    "grant execute on function public.consume_ai_helper_quota(text, text, text, text) to public;",
    "AI helper quota RPC has no exact public execute grant",
  );
  expectNoQuotaExecuteGrantToRole(
    hardeningMigration,
    "public",
    "AI helper quota RPC is not granted to public",
  );
  expectNoQuotaExecuteGrantToRole(
    hardeningMigration,
    "anon",
    "AI helper quota RPC is not granted to anon",
  );
  expectNoQuotaExecuteGrantToRole(
    hardeningMigration,
    "authenticated",
    "AI helper quota RPC is not granted to authenticated",
  );
}

function verifySmokeGuard() {
  const liveSmoke = readProjectFile(liveSmokePath, "Supabase live smoke exists");

  expectContains(
    liveSmoke,
    'const allowedSmokeProjectId = "oevvaowoklqttqkraxho"',
    "Live smoke is allow-listed to the V-19 sandbox project",
  );
  expectContains(
    liveSmoke,
    'activationTarget !== "sandbox"',
    "Live smoke refuses non-sandbox activation targets",
  );
  expectContains(
    liveSmoke,
    ".env.supabase-smoke.local",
    "Live smoke reads only the dedicated smoke env file",
  );

  if (liveSmoke.includes('".env.local"') || liveSmoke.includes('".env"')) {
    fail(
      "Live smoke does not read app env files",
      "tests/integration/supabase-live.spec.ts references .env or .env.local",
    );
  } else {
    pass("Live smoke does not read app env files");
  }

  expectContains(
    liveSmoke,
    "ownerOverwriteAfterHandoffError",
    "Live smoke proves owner storage overwrite is blocked after handoff",
  );
  expectContains(
    liveSmoke,
    "blockedReviewError",
    "Live smoke proves incomplete review submit is rejected",
  );
  expectContains(
    liveSmoke,
    "waiting_review",
    "Live smoke proves the positive waiting_review transition",
  );

  const smokeEnv = parseEnvFile(smokeEnvPath);
  if (!Object.keys(smokeEnv).length) {
    pass("Dedicated smoke env is absent or intentionally local-only");
    return;
  }

  const activationTarget = smokeEnv.VITE_SUPABASE_ACTIVATION_TARGET;
  const projectId = smokeEnv.VITE_SUPABASE_PROJECT_ID;
  const url = smokeEnv.VITE_SUPABASE_URL;

  if (activationTarget === "sandbox") {
    pass("Dedicated smoke env targets sandbox");
  } else {
    fail(
      "Dedicated smoke env targets sandbox",
      "VITE_SUPABASE_ACTIVATION_TARGET is not sandbox",
    );
  }

  if (projectId === allowedSandboxProjectId) {
    pass("Dedicated smoke env project is allow-listed");
  } else {
    fail(
      "Dedicated smoke env project is allow-listed",
      "VITE_SUPABASE_PROJECT_ID is not the V-19 sandbox",
    );
  }

  if (url?.startsWith(`https://${allowedSandboxProjectId}.supabase.co`)) {
    pass("Dedicated smoke env URL matches the sandbox project");
  } else {
    fail(
      "Dedicated smoke env URL matches the sandbox project",
      "VITE_SUPABASE_URL does not match the allow-list",
    );
  }
}

function verifyDocsAndScripts() {
  const packageJson = JSON.parse(readProjectFile(packagePath, "package.json exists"));
  const readme = readProjectFile(supabaseReadmePath, "Supabase README exists");
  const runbook = readProjectFile(
    releaseRunbookPath,
    "Supabase production runbook exists",
  );
  const prPackage = readProjectFile(prPackagePath, "Supabase PR package exists");
  const approvalChecklist = readProjectFile(
    productionApprovalChecklistPath,
    "Supabase production approval checklist exists",
  );

  if (packageJson.scripts?.["verify:supabase-release"]) {
    pass("Package exposes verify:supabase-release");
  } else {
    fail("Package exposes verify:supabase-release", "Missing npm script");
  }

  if (packageJson.scripts?.["verify:full"]?.includes("verify:supabase-release")) {
    pass("verify:full includes Supabase release gate");
  } else {
    fail(
      "verify:full includes Supabase release gate",
      "npm run verify:full must include npm run verify:supabase-release",
    );
  }

  if (packageJson.scripts?.["verify:production-packet"]) {
    pass("Package exposes verify:production-packet");
  } else {
    fail("Package exposes verify:production-packet", "missing npm script");
  }

  if (packageJson.scripts?.["verify:full"]?.includes("verify:production-packet")) {
    pass("verify:full includes production packet gate");
  } else {
    fail(
      "verify:full includes production packet gate",
      "npm run verify:full must include npm run verify:production-packet",
    );
  }

  for (const expected of [
    "npm run verify:supabase-release",
    "npm run test:supabase-live",
    "production",
    "rollback",
  ]) {
    expectContains(readme, expected, `Supabase README documents ${expected}`);
  }

  for (const expected of [
    "Do not apply these migrations to production from Codex without explicit owner approval.",
    "supabase-workspace-pr-package.md",
    "supabase-production-approval-checklist.md",
    "Rollback Boundary",
    "Migration Order",
    "Final Sandbox RLS And Storage Smoke",
    "Auth Security Advisor Gate",
    "Auth plan eligibility",
    "Auth leaked password protection",
    "Auth/Profile Repair Gate",
    "Do not auto-create production profiles",
    "VITE_SUPABASE_PRODUCTION_APPROVED=true",
  ]) {
    expectContains(runbook, expected, `Production runbook documents ${expected}`);
  }

  for (const expected of [
    "768a3a4 Harden Supabase workspace write guards",
    "5d73f7d Add Supabase production promotion gate",
    "7f715e7 Harden AI helper Supabase security",
    "20260615000000_ai_helper_security_advisor_hardening.sql",
    "Ready for PR review",
    "Not ready for production activation until the production approval checklist is completed.",
  ]) {
    expectContains(prPackage, expected, `PR package documents ${expected}`);
  }

  for (const expected of [
    "Production project id:",
    "Rollout owner:",
    "20260611000000_visaflow_mvp_foundation.sql",
    "20260612000000_visaflow_rls_performance_hardening.sql",
    "20260612001000_visaflow_rpc_corrections_persistence.sql",
    "20260613005039_visaflow_runtime_write_guards.sql",
    "20260613010029_visaflow_rpc_submit_boundary.sql",
    "20260614000000_ai_helper_audit_quota.sql",
    "20260615000000_ai_helper_security_advisor_hardening.sql",
    "Agent smoke account exists.",
    "Backup owner:",
    "Supabase organization/project plan supports leaked password protection.",
    "Supabase plan eligibility for leaked password protection is confirmed.",
    "Auth leaked password protection is enabled.",
    "Production auth/profile discovery has no orphan auth users.",
    "Go / No-Go:",
    "VITE_SUPABASE_PRODUCTION_APPROVED=true",
  ]) {
    expectContains(
      approvalChecklist,
      expected,
      `Production approval checklist documents ${expected}`,
    );
  }
}

function report() {
  const failed = checks.filter((check) => !check.ok);
  for (const check of checks) {
    const prefix = check.ok ? "PASS" : "FAIL";
    console.log(`${prefix} ${check.label}`);
    if (!check.ok && check.detail) console.log(`  ${check.detail}`);
  }

  if (failed.length) {
    console.error(`Supabase release verification failed: ${failed.length} issue(s).`);
    process.exit(1);
  }

  console.log(`Supabase release verification passed: ${checks.length} checks.`);
}

verifyMigrationOrder();
verifyRuntimeGuards();
verifyAiHelperSecurityHardening();
verifySmokeGuard();
verifyDocsAndScripts();
report();

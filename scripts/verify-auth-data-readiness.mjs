import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  requiredMigrationOrder,
  requiredMigrationsInActualOrder,
  undeclaredMigrationFiles,
} from "./supabase-migration-contract.mjs";

const repoRoot = process.cwd();
const checks = [];

const rlsTables = [
  "profiles",
  "submissions",
  "applicants",
  "media_assets",
  "corrections",
  "export_batches",
  "appointments",
  "status_history",
];

const requiredIndexSnippets = [
  "create index if not exists submissions_agent_id_idx on public.submissions (agent_id)",
  "create index if not exists applicants_submission_id_idx on public.applicants (submission_id)",
  "create index if not exists media_assets_submission_id_idx on public.media_assets (submission_id)",
  "create index if not exists media_assets_reviewed_by_idx on public.media_assets (reviewed_by)",
  "create index if not exists corrections_submission_id_idx on public.corrections (submission_id)",
  "create index if not exists corrections_applicant_id_idx on public.corrections (applicant_id)",
  "create index if not exists corrections_created_by_idx on public.corrections (created_by)",
  "create index if not exists export_batches_created_by_idx on public.export_batches (created_by)",
  "create index if not exists appointments_submission_id_idx on public.appointments (submission_id)",
  "create index if not exists appointments_updated_by_idx on public.appointments (updated_by)",
  "create index if not exists status_history_changed_by_idx on public.status_history (changed_by)",
  "create index if not exists status_history_entity_id_idx on public.status_history (entity_id)",
];

const scannedPublicFiles = [
  ".env.example",
  "index.html",
  "supabase/README.md",
  "docs/release/auth-data-production-readiness.md",
  "docs/release/supabase-production-promotion.md",
  "docs/release/supabase-production-approval-checklist.md",
  "src/lib/supabase/config.ts",
  "src/vite-env.d.ts",
];

function pass(label) {
  checks.push({ ok: true, label });
}

function fail(label, detail) {
  checks.push({ ok: false, label, detail });
}

function readProjectFile(relativePath) {
  const path = resolve(repoRoot, relativePath);
  if (!existsSync(path)) {
    fail(`${relativePath} exists`, "missing");
    return "";
  }

  return readFileSync(path, "utf8");
}

function expectContains(content, expected, label) {
  if (content.includes(expected)) pass(label);
  else fail(label, `missing: ${expected}`);
}

function expectNotMatching(content, pattern, label) {
  const match = content.match(pattern);
  if (match) fail(label, `matched: ${match[0]}`);
  else pass(label);
}

function normalizedSql(content) {
  return content.replace(/--.*$/gm, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

function verifyPackageScript() {
  const packageJson = JSON.parse(readProjectFile("package.json") || "{}");
  if (packageJson.scripts?.["verify:auth-data-readiness"]) {
    pass("Package exposes verify:auth-data-readiness");
  } else {
    fail("Package exposes verify:auth-data-readiness", "missing npm script");
  }
}

function verifyNoFrontendSecrets() {
  const forbiddenPublicEnv =
    /\bVITE_[A-Z0-9_]*(SERVICE_ROLE|SECRET|PASSWORD|PRIVATE|TOKEN|OPENAI|ANTHROPIC|FUNCTION_ADMIN)[A-Z0-9_]*\b/;

  for (const relativePath of scannedPublicFiles) {
    const content = readProjectFile(relativePath);
    if (!content) continue;
    expectNotMatching(
      content,
      forbiddenPublicEnv,
      `${relativePath} exposes no secret-like VITE variables`,
    );
  }

  const config = readProjectFile("src/lib/supabase/config.ts");
  expectContains(
    config,
    "VITE_SUPABASE_PUBLISHABLE_KEY",
    "Frontend Supabase config uses publishable key naming",
  );
  expectContains(
    config,
    "VITE_SUPABASE_PRODUCTION_APPROVED",
    "Frontend Supabase production activation requires explicit approval flag",
  );
}

function verifyAuthProfileBoundary() {
  const authService = readProjectFile("src/services/authService.ts");
  const profileService = readProjectFile("src/services/profileService.ts");

  expectContains(
    authService,
    "client.auth.signInWithPassword",
    "Supabase sign-in uses Supabase Auth password flow",
  );
  expectContains(
    authService,
    "fetchCurrentProfile(data.session.user.id)",
    "Supabase sign-in requires matching profile lookup",
  );
  expectContains(
    authService,
    "Supabase profile was not found for this user.",
    "Supabase sign-in fails closed without a profile",
  );
  expectContains(
    profileService,
    "id,email,display_name,organization_name,role,created_at",
    "Profile reads include server-owned role",
  );
  expectNotMatching(
    profileService,
    /role:\s*profile\.role/,
    "Client profile upsert cannot write role from client state",
  );
}

function verifyMigrations() {
  const migrationsDir = resolve(repoRoot, "supabase/migrations");
  const migrationFiles = readdirSync(migrationsDir)
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort();
  const actualRequiredOrder = requiredMigrationsInActualOrder(migrationFiles);
  const undeclaredMigrations = undeclaredMigrationFiles(migrationFiles);

  if (actualRequiredOrder.join("\n") === requiredMigrationOrder.join("\n")) {
    pass("Required auth/data migrations are present in promotion order");
  } else {
    fail(
      "Required auth/data migrations are present in promotion order",
      `got: ${actualRequiredOrder.join(" -> ")}`,
    );
  }
  if (undeclaredMigrations.length) {
    fail(
      "No undeclared Supabase migrations exist outside promotion order",
      `undeclared: ${undeclaredMigrations.join(", ")}`,
    );
  } else {
    pass("No undeclared Supabase migrations exist outside promotion order");
  }

  const foundation = readProjectFile(
    "supabase/migrations/20260611000000_visaflow_mvp_foundation.sql",
  );
  const hardening = readProjectFile(
    "supabase/migrations/20260612000000_visaflow_rls_performance_hardening.sql",
  );
  const runtimeGuards = readProjectFile(
    "supabase/migrations/20260613005039_visaflow_runtime_write_guards.sql",
  );
  const passportStorage = readProjectFile(
    "supabase/migrations/20260617003000_passport_workspace_media_slots.sql",
  );
  const allSql = [foundation, hardening, runtimeGuards, passportStorage].join("\n");
  const normalized = normalizedSql(allSql);

  expectContains(
    foundation,
    "id uuid primary key references auth.users (id) on delete cascade",
    "Profiles are bound to Supabase auth.users",
  );
  expectContains(
    foundation,
    "create type public.profile_role as enum ('agent', 'admin')",
    "Profile roles are constrained to agent/admin",
  );
  for (const table of rlsTables) {
    expectContains(
      foundation,
      `alter table public.${table} enable row level security`,
      `RLS is enabled on public.${table}`,
    );
  }
  for (const snippet of requiredIndexSnippets) {
    expectContains(foundation, snippet, `Indexed FK/RLS path: ${snippet}`);
  }
  expectContains(
    foundation,
    "values ('submission-media', 'submission-media', false)",
    "submission-media Storage bucket is private",
  );
  expectContains(
    allSql,
    "(select auth.uid())",
    "RLS policies use cached auth.uid() subquery pattern",
  );
  expectContains(
    allSql,
    "(select app_private.current_profile_role())",
    "RLS policies use cached role helper pattern",
  );
  expectNotMatching(
    normalized,
    /\bgrant all\b/,
    "Supabase migrations do not grant broad ALL privileges",
  );
  expectContains(
    foundation,
    "grant update (email, display_name, organization_name) on public.profiles",
    "Profile update grant excludes role",
  );
  expectContains(
    allSql,
    "Agents cannot update submissions after handoff to operator review",
    "Post-handoff agent mutation is blocked by database trigger",
  );
}

function verifyRunbooks() {
  const runbook = readProjectFile("docs/release/supabase-production-promotion.md");
  const approvalChecklist = readProjectFile(
    "docs/release/supabase-production-approval-checklist.md",
  );
  const authDataRunbook = readProjectFile(
    "docs/release/auth-data-production-readiness.md",
  );

  for (const migration of requiredMigrationOrder) {
    expectContains(
      runbook,
      migration,
      `Production promotion runbook includes ${migration}`,
    );
    expectContains(
      approvalChecklist,
      migration,
      `Production approval checklist includes ${migration}`,
    );
  }

  for (const expected of [
    "Do not auto-create production profiles",
    "owner-approved role assignment",
    "Auth leaked password protection",
    "No service-role key",
    "Private media signed URL access is scoped correctly",
  ]) {
    expectContains(
      [runbook, approvalChecklist, authDataRunbook].join("\n"),
      expected,
      `Auth/data runbooks document ${expected}`,
    );
  }
}

verifyPackageScript();
verifyNoFrontendSecrets();
verifyAuthProfileBoundary();
verifyMigrations();
verifyRunbooks();

const failed = checks.filter((check) => !check.ok);
for (const check of checks) {
  const prefix = check.ok ? "PASS" : "FAIL";
  console.log(`${prefix} ${check.label}`);
  if (!check.ok && check.detail) console.log(`  ${check.detail}`);
}

if (failed.length) {
  console.error(`Auth/data readiness verification failed: ${failed.length} check(s).`);
  process.exit(1);
}

console.log(`Auth/data readiness verification passed: ${checks.length} checks.`);

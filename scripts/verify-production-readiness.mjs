import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = process.cwd();
const readinessPath = resolve(
  repoRoot,
  "docs/release/supabase-production-readiness.json",
);
const packagePath = resolve(repoRoot, "package.json");
const migrationsDir = resolve(repoRoot, "supabase/migrations");
const sandboxProjectId = "oevvaowoklqttqkraxho";
const expectBlocked = process.argv.includes("--expect-blocked");

const requiredMigrationOrder = [
  "20260611000000_visaflow_mvp_foundation.sql",
  "20260612000000_visaflow_rls_performance_hardening.sql",
  "20260612001000_visaflow_rpc_corrections_persistence.sql",
  "20260613005039_visaflow_runtime_write_guards.sql",
  "20260613010029_visaflow_rpc_submit_boundary.sql",
];

const blockers = [];
const passes = [];

function pass(label) {
  passes.push(label);
}

function block(label, detail) {
  blockers.push(detail ? `${label}: ${detail}` : label);
}

function readText(path, label) {
  if (!existsSync(path)) {
    block(label, `${path} is missing`);
    return "";
  }

  return readFileSync(path, "utf8");
}

function readJson(path, label) {
  const content = readText(path, label);
  if (!content) return {};

  try {
    return JSON.parse(content);
  } catch (error) {
    block(label, `Invalid JSON: ${error.message}`);
    return {};
  }
}

function present(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function bool(value) {
  return value === true;
}

function requirePresent(value, label) {
  if (present(value)) pass(label);
  else block(label, "missing");
}

function requireTrue(value, label) {
  if (bool(value)) pass(label);
  else block(label, "not confirmed");
}

function requireExistingProjectFile(value, label) {
  if (!present(value)) {
    block(label, "missing");
    return;
  }

  const path = resolve(repoRoot, value);
  if (existsSync(path)) pass(label);
  else block(label, `${value} does not exist`);
}

function verifyNoCommittedSecrets(content) {
  const forbidden = [
    /SUPABASE_SMOKE_[A-Z_]*PASSWORD/i,
    /SUPABASE_SERVICE_ROLE/i,
    /SUPABASE_FUNCTION_ADMIN_KEY/i,
    /OPENAI_API_KEY/i,
    /ANTHROPIC_API_KEY/i,
    /MODEL_PROVIDER_API_KEY/i,
    /sb_secret_/i,
    /sk-[A-Za-z0-9_-]{12,}/,
  ];

  const hit = forbidden.find((pattern) => pattern.test(content));
  if (hit) block("Production readiness packet contains forbidden secret marker", hit);
  else pass("Production readiness packet contains no forbidden secret markers");
}

function verifyMigrationOrder(packet) {
  if (!existsSync(migrationsDir)) {
    block("Supabase migrations directory exists", `${migrationsDir} is missing`);
    return;
  }

  const migrationFiles = readdirSync(migrationsDir)
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort();
  const actualRequiredOrder = migrationFiles.filter((fileName) =>
    requiredMigrationOrder.includes(fileName),
  );

  if (actualRequiredOrder.join("\n") === requiredMigrationOrder.join("\n")) {
    pass("Local required migration order is intact");
  } else {
    block(
      "Local required migration order is intact",
      `Expected ${requiredMigrationOrder.join(" -> ")}`,
    );
  }

  const packetOrder = packet.migrationContract?.requiredOrder ?? [];
  if (packetOrder.join("\n") === requiredMigrationOrder.join("\n")) {
    pass("Production packet records the required migration order");
  } else {
    block("Production packet records the required migration order", "mismatch");
  }
}

function verifyPackageScript() {
  const packageJson = readJson(packagePath, "package.json exists");
  if (packageJson.scripts?.["verify:production-readiness"]) {
    pass("Package exposes verify:production-readiness");
  } else {
    block("Package exposes verify:production-readiness", "missing npm script");
  }
}

function verifyPacket(packet, rawContent) {
  verifyNoCommittedSecrets(rawContent);

  if (packet.schemaVersion === 1) pass("Production readiness packet schema is v1");
  else block("Production readiness packet schema is v1", "schemaVersion must be 1");

  if (packet.scope === "supabase-production-activation") {
    pass("Production readiness packet scope is locked");
  } else {
    block("Production readiness packet scope is locked", "unexpected scope");
  }

  const sandbox = packet.sandboxReference ?? {};
  if (sandbox.projectId === sandboxProjectId) {
    pass("Sandbox reference project id is allow-listed");
  } else {
    block("Sandbox reference project id is allow-listed", "mismatch");
  }
  if (sandbox.activationTarget === "sandbox") {
    pass("Sandbox reference activation target is sandbox");
  } else {
    block("Sandbox reference activation target is sandbox", "mismatch");
  }
  requireExistingProjectFile(
    sandbox.evidenceArtifact,
    "Sandbox evidence artifact exists",
  );
  requireExistingProjectFile(
    sandbox.browserKeyAuditScreenshot,
    "Sandbox browser key audit screenshot exists",
  );

  const target = packet.productionTarget ?? {};
  requirePresent(target.projectId, "Production project id is recorded");
  requirePresent(target.projectUrl, "Production project URL is recorded");
  requirePresent(target.supabaseOrganization, "Supabase organization is recorded");
  if (target.projectId && target.projectId !== sandboxProjectId) {
    pass("Production project is not the sandbox project");
  } else {
    block("Production project is not the sandbox project", "missing or sandbox id");
  }
  if (target.activationTarget === "production") {
    pass("Production activation target is explicit");
  } else {
    block("Production activation target is explicit", "must be production");
  }

  const owners = packet.owners ?? {};
  requirePresent(owners.rolloutOwner, "Rollout owner is recorded");
  requirePresent(owners.technicalApprover, "Technical approver is recorded");
  requirePresent(owners.businessApprover, "Business approver is recorded");
  requirePresent(owners.rollbackDecisionOwner, "Rollback decision owner is recorded");
  requirePresent(owners.plannedPromotionWindow, "Promotion window is recorded");

  const migration = packet.migrationContract ?? {};
  requireTrue(migration.targetHistoryChecked, "Target migration history was checked");
  requireTrue(
    migration.targetHistoryCompatible,
    "Target migration history is compatible",
  );
  requireTrue(
    migration.ownerApprovedExactMigrationContract,
    "Owner approved exact migration contract",
  );
  requirePresent(
    migration.migrationApplyOperator,
    "Migration apply operator is recorded",
  );
  requireTrue(
    migration.expectedPostApplyMigrationListRecorded,
    "Expected post-apply migration list is recorded",
  );

  const smoke = packet.smokeAccounts ?? {};
  for (const [key, label] of [
    ["agent", "Agent smoke account"],
    ["otherAgent", "Other-agent smoke account"],
    ["admin", "Admin smoke account"],
  ]) {
    requireTrue(smoke[key]?.exists, `${label} exists`);
    requireTrue(smoke[key]?.roleVerified, `${label} role is verified`);
    requireTrue(smoke[key]?.identifierRecorded, `${label} identifier is recorded`);
  }

  const backup = packet.backupRestore ?? {};
  requirePresent(backup.backupOwner, "Backup owner is recorded");
  requirePresent(backup.backupMechanism, "Backup mechanism is recorded");
  requirePresent(backup.latestBackupTimestamp, "Latest backup timestamp is recorded");
  requireTrue(backup.restorePathConfirmed, "Restore path is confirmed");
  requireTrue(backup.restoreEvidenceRecorded, "Restore evidence is recorded");
  requireTrue(backup.rpoRtoAcceptedByOwner, "RPO/RTO is accepted by owner");
  requirePresent(
    backup.rollbackCommunicationOwner,
    "Rollback communication owner is recorded",
  );

  const pre = packet.preActivationVerification ?? {};
  requireTrue(pre.verifySupabaseReleasePassed, "verify:supabase-release passed");
  requireTrue(pre.testSupabaseLivePassed, "test:supabase-live passed");
  requireTrue(pre.testE2eSupabasePassed, "test:e2e:supabase passed");
  requireTrue(pre.verifyFullPassed, "verify:full passed");
  requireTrue(pre.finalDiffReviewed, "Final diff was reviewed");
  requireExistingProjectFile(
    pre.evidenceArtifact,
    "Pre-activation evidence artifact exists",
  );

  const env = packet.productionEnvEvidence ?? {};
  for (const [key, label] of [
    ["backendTargetSupabase", "Production env backend target is supabase"],
    ["activationTargetProduction", "Production env activation target is production"],
    ["releaseEnabled", "Production release switch is enabled"],
    ["transactionalPersistenceTested", "Transactional persistence evidence is true"],
    ["migrationApproved", "Migration approval evidence is true"],
    ["migrationsApplied", "Migrations applied evidence is true"],
    ["rlsPolicyTestsPassed", "RLS policy tests evidence is true"],
    ["storagePolicyTestsPassed", "Storage policy tests evidence is true"],
    ["edgeFunctionDryRunsPassed", "Edge Function dry-run evidence is true"],
    ["browserQaPassed", "Browser QA evidence is true"],
    ["browserKeyAudited", "Browser key audit evidence is true"],
    ["productionApproved", "Production approval evidence is true"],
    ["publicConfigRecorded", "Production public config is recorded"],
  ]) {
    requireTrue(env[key], label);
  }

  const post = packet.postActivationChecks ?? {};
  for (const [key, label] of [
    ["agentSignInWorks", "Post-activation agent sign-in works"],
    ["adminSignInWorks", "Post-activation admin sign-in works"],
    ["agentCanCreateDraft", "Post-activation agent can create draft"],
    ["agentCanUploadRequiredMedia", "Post-activation agent can upload media"],
    ["incompleteWaitingReviewRejected", "Incomplete waiting_review is rejected"],
    ["validWaitingReviewReachesQueue", "Valid waiting_review reaches queue"],
    ["adminCanAcceptOrReturnCase", "Admin can accept or return case"],
    ["postHandoffAgentMutationBlocked", "Post-handoff agent mutation is blocked"],
    ["privateMediaSignedUrlScoped", "Private media signed URL is scoped"],
    ["logsAndErrorRateChecked", "Logs and error rate are checked"],
  ]) {
    requireTrue(post[key], label);
  }

  if (packet.goNoGo?.decision === "GO") {
    pass("Go / No-Go decision is GO");
  } else {
    block("Go / No-Go decision is GO", packet.goNoGo?.decision ?? "missing");
  }
}

const rawReadiness = readText(readinessPath, "Production readiness packet exists");
let readiness = {};
if (rawReadiness) {
  try {
    readiness = JSON.parse(rawReadiness);
  } catch (error) {
    block("Production readiness packet is valid JSON", error.message);
  }
}

verifyPackageScript();
verifyMigrationOrder(readiness);
verifyPacket(readiness, rawReadiness);

for (const label of passes) console.log(`PASS ${label}`);

if (blockers.length) {
  console.error(`BLOCKED Production readiness has ${blockers.length} blocker(s):`);
  for (const blocker of blockers) console.error(`- ${blocker}`);

  if (expectBlocked) {
    console.log("Production readiness gate is fail-closed as expected.");
    process.exit(0);
  }

  process.exit(1);
}

if (expectBlocked) {
  console.error("Expected production readiness to be blocked, but it is READY.");
  process.exit(1);
}

console.log("READY Production readiness gate passed.");

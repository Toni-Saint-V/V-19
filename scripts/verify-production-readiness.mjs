import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
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
const readinessContractVersion = "2026-06-16-production-readiness-v2";

const requiredMigrationOrder = [
  "20260611000000_visaflow_mvp_foundation.sql",
  "20260612000000_visaflow_rls_performance_hardening.sql",
  "20260612001000_visaflow_rpc_corrections_persistence.sql",
  "20260613005039_visaflow_runtime_write_guards.sql",
  "20260613010029_visaflow_rpc_submit_boundary.sql",
  "20260614000000_ai_helper_audit_quota.sql",
  "20260615000000_ai_helper_security_advisor_hardening.sql",
];

const requiredRemoteMigrationOrder = [
  "20260611000000_visaflow_mvp_foundation",
  "20260612000000_visaflow_rls_performance_hardening",
  "20260612001000_visaflow_rpc_corrections_persistence",
  "20260613005039_visaflow_runtime_write_guards",
  "20260613010029_visaflow_rpc_submit_boundary",
  "20260614000000_ai_helper_audit_quota",
  "20260616001949_ai_helper_security_advisor_hardening",
];

const integrityBlockers = [];
const activationBlockers = [];
const passes = [];

const scopedDiffPaths = [
  "package.json",
  "scripts/verify-production-readiness.mjs",
  "scripts/verify-supabase-release.mjs",
  "docs/release/supabase-production-approval-checklist.md",
  "docs/release/supabase-production-promotion.md",
  "docs/release/supabase-workspace-pr-package.md",
  "docs/qa/supabase-security-advisor-hardening-2026-06-15.md",
  "production-readiness-audit.md",
];

function pass(label) {
  passes.push(label);
}

function formatBlocker(label, detail) {
  return detail ? `${label}: ${detail}` : label;
}

function block(label, detail) {
  integrityBlockers.push(formatBlocker(label, detail));
}

function activationBlock(label, detail) {
  activationBlockers.push(formatBlocker(label, detail));
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

function normalizedText(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function sha256Text(value) {
  return createHash("sha256").update(value).digest("hex");
}

function currentGitHead() {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    block("Current git HEAD is readable", error.message);
    return "";
  }
}

function gitOutput(args, label) {
  try {
    return execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    block(label, error.message);
    return "";
  }
}

function currentScopedDiffSha256() {
  const diff = gitOutput(
    ["diff", "--binary", "--", ...scopedDiffPaths],
    "Current scoped backend/security diff is readable",
  );

  const untracked = gitOutput(
    ["ls-files", "--others", "--exclude-standard", "--", ...scopedDiffPaths],
    "Current scoped untracked backend/security files are readable",
  )
    .split("\n")
    .filter(Boolean)
    .sort();

  const untrackedPayload = untracked
    .map((fileName) => {
      const path = resolve(repoRoot, fileName);
      return `\n--- untracked:${fileName} ---\n${readText(
        path,
        `Untracked scoped evidence file ${fileName} is readable`,
      )}`;
    })
    .join("");

  return sha256Text(`${diff}${untrackedPayload}`);
}

function unexpectedDirtyFiles() {
  const status = gitOutput(["status", "--porcelain"], "Current git status is readable");
  const allowed = new Set(scopedDiffPaths);
  const allowedPrefixes = [
    "docs/qa/supabase-production-security-advisors-",
    "docs/qa/supabase-storage-security-sandbox-",
  ];

  return status
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(3))
    .filter((fileName) => {
      if (allowed.has(fileName)) return false;
      return !allowedPrefixes.some((prefix) => fileName.startsWith(prefix));
    });
}

function requirePresent(value, label) {
  if (present(value)) pass(label);
  else block(label, "missing");
}

function requireEqual(value, expected, label) {
  if (value === expected) pass(label);
  else block(label, "mismatch");
}

function requireTrue(value, label) {
  if (bool(value)) pass(label);
  else block(label, "not confirmed");
}

function requireActivationPresent(value, label) {
  if (present(value)) pass(label);
  else activationBlock(label, "missing");
}

function requireActivationTrue(value, label) {
  if (bool(value)) pass(label);
  else activationBlock(label, "not confirmed");
}

function requireNonNegativeInteger(value, label) {
  if (Number.isInteger(value) && value >= 0) pass(label);
  else block(label, "missing or invalid count");
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

function requireSnippet(content, snippet, label) {
  if (content.includes(snippet)) pass(label);
  else block(label, "missing");
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

  const remoteOrder = packet.migrationContract?.appliedRemoteOrder ?? [];
  if (remoteOrder.join("\n") === requiredRemoteMigrationOrder.join("\n")) {
    pass("Production packet records the exact applied remote migration order");
  } else {
    block(
      "Production packet records the exact applied remote migration order",
      "mismatch",
    );
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

function verifyProductionMigrationEvidence(packet) {
  const artifact = packet.productionEnvEvidence?.productionMigrationEvidenceArtifact;
  requireExistingProjectFile(artifact, "Production migration evidence artifact exists");
  if (!present(artifact)) return;

  const evidence = readText(
    resolve(repoRoot, artifact),
    "Production migration evidence artifact exists",
  );
  if (!evidence) return;

  const targetProjectId = packet.productionTarget?.projectId;
  if (present(targetProjectId) && evidence.includes(targetProjectId)) {
    pass("Production migration evidence records target project id");
  } else {
    block("Production migration evidence records target project id", "missing");
  }

  for (const migration of requiredMigrationOrder) {
    const version = migration.replace(/\.sql$/, "");
    if (evidence.includes(version)) {
      pass(`Production migration evidence records local contract ${version}`);
    } else {
      block(
        `Production migration evidence records local contract ${version}`,
        "missing",
      );
    }
  }

  for (const remoteMigration of requiredRemoteMigrationOrder) {
    if (evidence.includes(remoteMigration)) {
      pass(`Production migration evidence records remote migration ${remoteMigration}`);
    } else {
      block(
        `Production migration evidence records remote migration ${remoteMigration}`,
        "missing",
      );
    }
  }

  for (const [label, snippet] of [
    [
      "Production migration evidence records public base table count",
      "Public base tables: `11`",
    ],
    [
      "Production migration evidence records all public tables have RLS",
      "Public tables with RLS enabled: `11`",
    ],
    [
      "Production migration evidence records zero public tables without RLS",
      "Public tables without RLS: `0`",
    ],
    [
      "Production migration evidence records private submission-media bucket",
      "Private `submission-media` bucket: `1`",
    ],
    [
      "Production migration evidence records zero public storage buckets",
      "Public storage buckets: `0`",
    ],
    [
      "Production migration evidence records storage policy count",
      "`submission-media` storage policies: `4`",
    ],
  ]) {
    if (evidence.includes(snippet)) pass(label);
    else block(label, "missing");
  }
}

function verifySmokeDiscoveryEvidence(packet, smokeDiscovery) {
  const artifact = smokeDiscovery.evidenceArtifact;
  requireExistingProjectFile(
    artifact,
    "Production smoke account discovery evidence artifact exists",
  );
  if (!present(artifact)) return;

  const evidence = readText(
    resolve(repoRoot, artifact),
    "Production smoke account discovery evidence artifact exists",
  );
  if (!evidence) return;

  const targetProjectId = packet.productionTarget?.projectId;
  if (smokeDiscovery.projectId === targetProjectId) {
    pass("Production smoke discovery project id matches production target");
  } else {
    block(
      "Production smoke discovery project id matches production target",
      "mismatch",
    );
  }
  if (present(targetProjectId) && evidence.includes(targetProjectId)) {
    pass("Production smoke discovery evidence records target project id");
  } else {
    block("Production smoke discovery evidence records target project id", "missing");
  }
  if (
    present(smokeDiscovery.checkedAt) &&
    evidence.includes(`Latest read-only SQL discovery: \`${smokeDiscovery.checkedAt}\``)
  ) {
    pass("Production smoke discovery evidence records exact discovery timestamp");
  } else {
    block(
      "Production smoke discovery evidence records exact discovery timestamp",
      "missing",
    );
  }

  for (const [label, snippet] of [
    [
      "Production smoke discovery evidence records auth user count",
      `Auth users: \`${smokeDiscovery.authUserCount}\``,
    ],
    [
      "Production smoke discovery evidence records confirmed auth user count",
      `Confirmed auth users: \`${smokeDiscovery.confirmedAuthUserCount}\``,
    ],
    [
      "Production smoke discovery evidence records profile count",
      `Profiles: \`${smokeDiscovery.profileCount}\``,
    ],
    [
      "Production smoke discovery evidence records orphan auth user count",
      `Auth users without matching profiles: \`${smokeDiscovery.orphanAuthUsersWithoutProfileCount}\``,
    ],
    [
      "Production smoke discovery evidence records aggregate-only boundary",
      "Only aggregate counts were recorded",
    ],
    [
      "Production smoke discovery evidence records no-PII boundary",
      "no email, password, or direct personal identifier",
    ],
  ]) {
    if (evidence.includes(snippet)) pass(label);
    else block(label, "missing");
  }
}

function verifyPreActivationCheck(pre, key, command, label, verifierSha256) {
  const check = pre[key] ?? {};
  requirePresent(check.checkedAt, `${label} timestamp is recorded`);
  requireEqual(check.command, command, `${label} command is recorded`);
  requireEqual(check.exitCode, 0, `${label} exit code is zero`);
  requirePresent(check.result, `${label} result is recorded`);
  requireEqual(check.gitHead, pre.gitHead, `${label} git head matches packet`);
  requireEqual(
    check.scopedDiffSha256,
    pre.scopedDiffSha256,
    `${label} scoped diff hash matches packet`,
  );
  requireEqual(
    check.readinessContractVersion,
    readinessContractVersion,
    `${label} is bound to the current readiness contract`,
  );
  requireEqual(
    check.readinessVerifierSha256,
    verifierSha256,
    `${label} is bound to the current readiness verifier`,
  );
  requireExistingProjectFile(
    check.evidenceArtifact,
    `${label} evidence artifact exists`,
  );
  if (!present(check.evidenceArtifact)) return;

  const evidence = readText(
    resolve(repoRoot, check.evidenceArtifact),
    `${label} evidence artifact exists`,
  );
  if (!evidence) return;

  requireSnippet(evidence, command, `${label} evidence records command`);
  requireSnippet(
    evidence,
    check.checkedAt,
    `${label} evidence records exact timestamp`,
  );
  requireSnippet(
    evidence,
    `exitCode: \`${check.exitCode}\``,
    `${label} evidence records exit code`,
  );
  requireSnippet(evidence, check.result, `${label} evidence records result`);
  requireSnippet(evidence, check.gitHead, `${label} evidence records git head`);
  requireSnippet(
    evidence,
    check.scopedDiffSha256,
    `${label} evidence records scoped diff hash`,
  );
  requireSnippet(
    evidence,
    check.readinessVerifierSha256,
    `${label} evidence records verifier hash`,
  );
}

function verifyPreActivationFreshness(pre, verifierSha256, gitHead) {
  const scopedDiffSha256 = currentScopedDiffSha256();
  requireEqual(
    pre.readinessContractVersion,
    readinessContractVersion,
    "Pre-activation verification is bound to the current readiness contract",
  );
  requirePresent(
    pre.readinessVerifierSha256,
    "Pre-activation readiness verifier hash is recorded",
  );
  requireEqual(
    pre.readinessVerifierSha256,
    verifierSha256,
    "Pre-activation readiness verifier hash is current",
  );
  requirePresent(pre.checkedAt, "Pre-activation verification timestamp is recorded");
  requirePresent(pre.gitHead, "Pre-activation verification git head is recorded");
  requireEqual(
    pre.gitHead,
    gitHead,
    "Pre-activation verification git head matches current HEAD",
  );
  requireEqual(
    pre.scopedDiffSha256,
    scopedDiffSha256,
    "Pre-activation verification scoped diff hash is current",
  );
  requirePresent(
    pre.verificationScope,
    "Pre-activation verification scope is recorded",
  );

  if (pre.verifySupabaseReleasePassed === true) {
    verifyPreActivationCheck(
      pre,
      "verifySupabaseRelease",
      "npm run verify:supabase-release",
      "verify:supabase-release evidence",
      verifierSha256,
    );
  }

  if (pre.testSupabaseLivePassed === true) {
    verifyPreActivationCheck(
      pre,
      "testSupabaseLive",
      "npm run test:supabase-live",
      "test:supabase-live evidence",
      verifierSha256,
    );
  }

  if (pre.testE2eSupabasePassed === true) {
    verifyPreActivationCheck(
      pre,
      "testE2eSupabase",
      "npm run test:e2e:supabase",
      "test:e2e:supabase evidence",
      verifierSha256,
    );
  }

  if (pre.verifyFullPassed === true) {
    verifyPreActivationCheck(
      pre,
      "verifyFull",
      "npm run verify:full",
      "verify:full evidence",
      verifierSha256,
    );
    requireEqual(
      pre.verifyFullReadinessContractVersion,
      readinessContractVersion,
      "verify:full evidence is bound to the current readiness contract",
    );
    requireEqual(
      pre.verifyFullReadinessVerifierSha256,
      verifierSha256,
      "verify:full evidence is bound to the current readiness verifier",
    );
    requirePresent(pre.verifyFullCheckedAt, "verify:full timestamp is recorded");
  }

  if (pre.finalDiffReviewed === true) {
    const review = pre.finalDiffReview ?? {};
    const dirtyFiles = unexpectedDirtyFiles();
    requireEqual(review.gitHead, gitHead, "Final diff review is bound to current HEAD");
    requireEqual(
      review.diffSha256,
      scopedDiffSha256,
      "Final diff review diff hash matches current backend/security diff",
    );
    requirePresent(review.checkedAt, "Final diff review timestamp is recorded");
    if (dirtyFiles.length === 0) {
      pass("Final diff review has no unexpected dirty files outside scope");
    } else {
      block(
        "Final diff review has no unexpected dirty files outside scope",
        dirtyFiles.join(", "),
      );
    }
  }
}

function verifyAuthSecurityEvidence(packet, authSecurity) {
  const artifact = authSecurity.evidenceArtifact;
  requireExistingProjectFile(
    artifact,
    "Supabase security advisor evidence artifact exists",
  );
  if (!present(artifact)) return;

  const evidence = readText(
    resolve(repoRoot, artifact),
    "Supabase security advisor evidence artifact exists",
  );
  if (!evidence) return;

  const projectId = packet.productionTarget?.projectId;
  if (present(projectId)) {
    requireSnippet(
      evidence,
      projectId,
      "Supabase security advisor evidence records production project id",
    );
  }
  if (present(authSecurity.checkedAt)) {
    requireSnippet(
      evidence,
      `Latest recheck: \`${authSecurity.checkedAt}\``,
      "Supabase security advisor evidence records exact advisor timestamp",
    );
  }
  if (present(authSecurity.organizationPlan)) {
    requireSnippet(
      evidence,
      `plan: \`${authSecurity.organizationPlan}\``,
      "Supabase security advisor evidence records organization plan",
    );
  }

  const openWarnings = Array.isArray(authSecurity.openWarnings)
    ? authSecurity.openWarnings
    : [];
  for (const warning of openWarnings) {
    if (present(warning?.name)) {
      requireSnippet(
        evidence,
        warning.name,
        `Supabase security advisor evidence records open warning ${warning.name}`,
      );
    }
  }

  const advisorSnapshot = authSecurity.advisorSnapshot ?? {};
  if (authSecurity.securityAdvisorsChecked === true) {
    requireEqual(
      advisorSnapshot.projectId,
      authSecurity.projectId,
      "Supabase advisor snapshot project id matches auth security project",
    );
    requireEqual(
      advisorSnapshot.checkedAt,
      authSecurity.checkedAt,
      "Supabase advisor snapshot timestamp matches auth security timestamp",
    );
    requireEqual(
      advisorSnapshot.advisorType,
      "security",
      "Supabase advisor snapshot type is security",
    );
    requireEqual(
      advisorSnapshot.source,
      "Supabase _get_advisors(type=security)",
      "Supabase advisor snapshot source is recorded",
    );
    requireEqual(
      advisorSnapshot.warningCount,
      openWarnings.length,
      "Supabase advisor snapshot warning count matches open warnings",
    );
  }

  if (authSecurity.noBlockingSecurityAdvisorWarnings === true) {
    if (openWarnings.length === 0) {
      pass("Supabase security packet records no open advisor warnings");
    } else {
      block(
        "Supabase security packet records no open advisor warnings",
        `${openWarnings.length} warning(s) still recorded`,
      );
    }
  }

  if (authSecurity.leakedPasswordProtectionEnabled === true) {
    if (
      openWarnings.some((warning) => warning.name === "auth_leaked_password_protection")
    ) {
      block(
        "Supabase advisor snapshot does not contradict leaked-password enablement",
        "auth_leaked_password_protection is still open",
      );
    } else {
      pass("Supabase advisor snapshot does not contradict leaked-password enablement");
    }
  }
}

function verifyPacket(packet, rawContent) {
  verifyNoCommittedSecrets(rawContent);
  const gitHead = currentGitHead();
  const verifierSha256 = sha256Text(
    readText(
      resolve(repoRoot, "scripts/verify-production-readiness.mjs"),
      "Production readiness verifier exists",
    ),
  );

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
  requireActivationPresent(
    owners.plannedPromotionWindow,
    "Promotion window is recorded",
  );

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
  const smokeDiscovery = packet.smokeAccountDiscovery ?? {};
  requireTrue(smokeDiscovery.checked, "Production smoke account discovery was checked");
  requirePresent(
    smokeDiscovery.checkedAt,
    "Production smoke account discovery timestamp is recorded",
  );
  requireNonNegativeInteger(
    smokeDiscovery.authUserCount,
    "Production auth user count is recorded",
  );
  requireNonNegativeInteger(
    smokeDiscovery.confirmedAuthUserCount,
    "Production confirmed auth user count is recorded",
  );
  requireNonNegativeInteger(
    smokeDiscovery.profileCount,
    "Production profile count is recorded",
  );
  requireNonNegativeInteger(
    smokeDiscovery.orphanAuthUsersWithoutProfileCount,
    "Production orphan auth user count is recorded",
  );
  verifySmokeDiscoveryEvidence(packet, smokeDiscovery);
  if (smokeDiscovery.orphanAuthUsersWithoutProfileCount === 0) {
    pass("Production has no auth users without profiles");
  } else {
    activationBlock(
      "Production has no auth users without profiles",
      `${smokeDiscovery.orphanAuthUsersWithoutProfileCount} orphan auth user(s)`,
    );
  }
  for (const [key, label] of [
    ["agent", "Agent smoke account"],
    ["otherAgent", "Other-agent smoke account"],
    ["admin", "Admin smoke account"],
  ]) {
    requireActivationTrue(smoke[key]?.exists, `${label} exists`);
    requireActivationTrue(smoke[key]?.roleVerified, `${label} role is verified`);
    requireActivationTrue(
      smoke[key]?.identifierRecorded,
      `${label} identifier is recorded`,
    );
  }

  const backup = packet.backupRestore ?? {};
  requirePresent(backup.backupOwner, "Backup owner is recorded");
  requireActivationPresent(backup.backupMechanism, "Backup mechanism is recorded");
  requireActivationPresent(
    backup.latestBackupTimestamp,
    "Latest backup timestamp is recorded",
  );
  requireActivationTrue(backup.restorePathConfirmed, "Restore path is confirmed");
  requireActivationTrue(backup.restoreEvidenceRecorded, "Restore evidence is recorded");
  requireActivationTrue(backup.rpoRtoAcceptedByOwner, "RPO/RTO is accepted by owner");
  requirePresent(
    backup.rollbackCommunicationOwner,
    "Rollback communication owner is recorded",
  );

  const pre = packet.preActivationVerification ?? {};
  verifyPreActivationFreshness(pre, verifierSha256, gitHead);
  requireTrue(pre.verifySupabaseReleasePassed, "verify:supabase-release passed");
  requireTrue(pre.testSupabaseLivePassed, "test:supabase-live passed");
  requireActivationTrue(pre.testE2eSupabasePassed, "test:e2e:supabase passed");
  requireActivationTrue(pre.verifyFullPassed, "verify:full passed");
  requireActivationTrue(pre.finalDiffReviewed, "Final diff was reviewed");
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
    if (
      [
        "migrationApproved",
        "migrationsApplied",
        "rlsPolicyTestsPassed",
        "storagePolicyTestsPassed",
        "publicConfigRecorded",
      ].includes(key)
    ) {
      requireTrue(env[key], label);
    } else {
      requireActivationTrue(env[key], label);
    }
  }
  verifyProductionMigrationEvidence(packet);

  const authSecurity = packet.authSecurity ?? {};
  requireTrue(
    authSecurity.securityAdvisorsChecked,
    "Supabase security advisors were checked",
  );
  if (authSecurity.projectId === packet.productionTarget?.projectId) {
    pass("Supabase security advisors were checked against production");
  } else {
    block(
      "Supabase security advisors were checked against production",
      "project id mismatch",
    );
  }
  verifyAuthSecurityEvidence(packet, authSecurity);
  requireTrue(
    authSecurity.planEligibilityChecked,
    "Supabase Auth leaked password protection plan eligibility was checked",
  );
  requirePresent(
    authSecurity.organizationPlan,
    "Supabase Auth security organization plan is recorded",
  );
  const organizationPlan = normalizedText(authSecurity.organizationPlan);
  if (
    organizationPlan === "free" &&
    authSecurity.leakedPasswordProtectionPlanEligible === true
  ) {
    block(
      "Supabase Auth plan eligibility is not contradicted by organization plan",
      "free plan cannot be marked eligible",
    );
  } else {
    pass("Supabase Auth plan eligibility is not contradicted by organization plan");
  }
  if (authSecurity.leakedPasswordProtectionPlanEligible === true) {
    requirePresent(
      authSecurity.planEligibilityEvidence,
      "Supabase Auth plan eligibility evidence is recorded",
    );
  }
  requireActivationTrue(
    authSecurity.leakedPasswordProtectionPlanEligible,
    "Supabase plan can enable Auth leaked password protection",
  );
  requireActivationTrue(
    authSecurity.leakedPasswordProtectionEnabled,
    "Supabase Auth leaked password protection is enabled",
  );
  requireActivationTrue(
    authSecurity.noBlockingSecurityAdvisorWarnings,
    "Supabase security advisors have no activation-blocking warnings",
  );

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
    requireActivationTrue(post[key], label);
  }

  if (packet.goNoGo?.decision === "GO") {
    pass("Go / No-Go decision is GO");
  } else {
    activationBlock("Go / No-Go decision is GO", packet.goNoGo?.decision ?? "missing");
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

const blockers = [...integrityBlockers, ...activationBlockers];

if (blockers.length) {
  console.error(`BLOCKED Production readiness has ${blockers.length} blocker(s):`);
  if (integrityBlockers.length) {
    console.error(`Integrity blockers (${integrityBlockers.length}):`);
    for (const blocker of integrityBlockers) console.error(`- ${blocker}`);
  }
  if (activationBlockers.length) {
    console.error(`Activation blockers (${activationBlockers.length}):`);
    for (const blocker of activationBlockers) console.error(`- ${blocker}`);
  }

  if (
    expectBlocked &&
    integrityBlockers.length === 0 &&
    activationBlockers.length > 0
  ) {
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

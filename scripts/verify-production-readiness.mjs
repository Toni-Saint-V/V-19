import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import {
  requiredMigrationOrder,
  requiredMigrationsInActualOrder,
  requiredRemoteMigrationOrder,
  undeclaredMigrationFiles,
} from "./supabase-migration-contract.mjs";

const repoRoot = process.cwd();
const readinessRelativePath = "docs/release/supabase-production-readiness.json";
const readinessPath = resolve(
  repoRoot,
  readinessRelativePath,
);
const packagePath = resolve(repoRoot, "package.json");
const migrationsDir = resolve(repoRoot, "supabase/migrations");
const sandboxProjectId = "oevvaowoklqttqkraxho";
const expectBlocked = process.argv.includes("--expect-blocked");
const readinessContractVersion = "2026-06-16-production-readiness-v2";

const integrityBlockers = [];
const activationBlockers = [];
const passes = [];
const controlledPilotRiskEvidenceCache = new Map();
const remoteMigrationNameOverrides = {
  "20260615000000_ai_helper_security_advisor_hardening.sql":
    "20260616001949_ai_helper_security_advisor_hardening",
  "20260704050806_day10_required_media_canonical_write_paths.sql":
    "20260705235913_day10_required_media_canonical_write_paths",
  "20260706000100_ai_helper_admin_intent_quota_contract.sql":
    "20260710034506_ai_helper_admin_intent_quota_contract",
  "20260706023000_typed_submission_files.sql":
    "20260710034513_typed_submission_files",
  "20260707000100_typed_status_history_source.sql":
    "20260709221437_typed_status_history_source",
  "20260707001000_document_assets_production_pipeline.sql":
    "20260709222911_document_assets_production_pipeline",
  "20260709234515_agent_return_packages.sql":
    "20260710041440_agent_return_packages",
  "20260710000100_allow_submission_handoff_child_writes.sql":
    "20260709232214_allow_submission_handoff_child_writes",
  "20260710000200_allow_handoff_children_in_draft_rpc.sql":
    "20260709233239_allow_handoff_children_in_draft_rpc_v2",
  "20260710000300_persist_handoff_applicant_projection.sql":
    "20260709233641_persist_handoff_applicant_projection_v3",
  "20260710003127_agent_return_packages_duplicate_result.sql":
    "20260710041454_20260710003127_agent_return_packages_duplicate_result",
  "20260710003254_document_asset_function_search_path_hardening.sql":
    "20260710041457_20260710003254_document_asset_function_search_path_hardening",
  "20260710004000_harden_document_assets_projection.sql":
    "20260710041458_20260710004000_harden_document_assets_projection",
  "20260710021043_harden_media_asset_review_boundary.sql":
    "20260710041500_20260710021043_harden_media_asset_review_boundary",
  "20260710022231_add_media_assets_applicant_submission_index.sql":
    "20260710041502_20260710022231_add_media_assets_applicant_submission_index",
};

const scopedDiffPaths = [
  "package.json",
  "scripts/prepare-supabase-production-packet.mjs",
  "scripts/provision-supabase-pilot-cohort.mjs",
  "scripts/supabase-migration-contract.mjs",
  "scripts/verify-pilot-volume-envelope.mjs",
  "scripts/verify-production-readiness.mjs",
  "scripts/verify-supabase-release.mjs",
  "scripts/verify-supabase-production-workflow.mjs",
  "supabase/migrations/20260630222703_returned_pdf_handoff_security_invoker.sql",
  "supabase/migrations/20260630235513_allow_trip_date_sync_during_submit_handoff.sql",
  "supabase/migrations/20260706000100_ai_helper_admin_intent_quota_contract.sql",
  "supabase/migrations/20260707000100_typed_status_history_source.sql",
  "supabase/migrations/20260712201203_allow_admin_waiting_review_issue_checkpoint.sql",
  "supabase/migrations/20260712225209_save_returned_submission_update_first.sql",
  "supabase/remediation/20260712201203_allow_admin_waiting_review_issue_checkpoint.rollback.sql",
  "supabase/remediation/20260712225209_save_returned_submission_update_first.rollback.sql",
  "docs/release/auth-data-production-readiness.md",
  "docs/release/supabase-production-approval-checklist.md",
  "docs/release/supabase-production-promotion.md",
  "docs/release/supabase-workspace-pr-package.md",
  "docs/qa/release-ai-gate-20260627T200633.md",
  "docs/qa/release-ai-gate-browser-key-audit-unverified-20260627T200633.md",
  "docs/qa/supabase-browser-key-audit-20260701.md",
  "docs/qa/supabase-production-browser-key-audit-20260701.md",
  "docs/qa/supabase-production-blockers-20260704.md",
  "docs/qa/supabase-production-backup-discovery-20260701.md",
  "docs/qa/supabase-production-edge-functions-20260701.md",
  "docs/qa/supabase-production-env-evidence-20260701.md",
  "docs/qa/supabase-production-migration-evidence-20260701.md",
  "docs/qa/supabase-production-logs-20260701.md",
  "docs/qa/supabase-production-owner-approval-20260701.md",
  "docs/qa/supabase-production-pilot-cohort-20260701.md",
  "docs/qa/supabase-10-user-readiness-20260706.md",
  "docs/qa/supabase-pilot-volume-envelope-20260706.md",
  "docs/qa/supabase-production-migration-evidence-20260706.md",
  "docs/qa/supabase-production-pilot-security-exception-20260706.md",
  "docs/qa/supabase-production-preactivation-20260706.md",
  "docs/qa/supabase-production-security-advisors-20260706.md",
  "docs/qa/supabase-production-smoke-discovery-20260706.md",
  "docs/qa/supabase-production-security-advisors-20260701.md",
  "docs/qa/supabase-production-smoke-discovery-20260701.md",
  "docs/qa/supabase-production-workflow-smoke-20260701.md",
  "docs/qa/supabase-security-advisor-hardening-2026-06-15.md",
  "tests/e2e-supabase/browser-key-audit.spec.ts",
  "tests/unit/supabaseSecurityContract.spec.ts",
  "production-readiness-audit.md",
];

function pass(label) {
  passes.push(label);
}

function formatBlocker(blocker) {
  return blocker.detail ? `${blocker.label}: ${blocker.detail}` : blocker.label;
}

function block(label, detail) {
  integrityBlockers.push({ label, detail });
}

function activationBlock(label, detail) {
  activationBlockers.push({ label, detail });
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
  const scopedPayload = [...scopedDiffPaths]
    .sort()
    .map(
      (fileName) =>
        `\n--- scoped:${fileName} ---\n${scopedHashContentFor(fileName)}`,
    )
    .join("");

  return sha256Text(
    `${scopedPayload}\n--- canonical:${readinessRelativePath} ---\n${canonicalReadinessForScopedHash()}`,
  );
}

function scopedHashContentFor(fileName) {
  const path = resolve(repoRoot, fileName);
  if (!existsSync(path)) return "__MISSING__";
  const content = readText(path, `Scoped hash file ${fileName} is readable`);

  if (fileName === "package.json") {
    return scopedPackageJsonHashContent(content);
  }

  if (fileName === "docs/qa/supabase-production-preactivation-20260706.md") {
    return content
      .replace(
        /Scoped diff hash: `[^`]*`/g,
        "Scoped diff hash: `__SCOPED_HASH__`",
      )
      .replace(
        /scopedDiffSha256: `[^`]*`/g,
        "scopedDiffSha256: `__SCOPED_HASH__`",
      );
  }

  if (fileName === "docs/qa/supabase-pilot-volume-envelope-20260706.md") {
    return content.replace(
      /Checked at: `[^`]*`/g,
      "Checked at: `__CHECKED_AT__`",
    );
  }

  return content;
}

function scopedPackageJsonHashContent(content) {
  try {
    const packageJson = JSON.parse(content);
    const scripts = packageJson.scripts ?? {};
    const devDependencies = packageJson.devDependencies ?? {};
    const relevantDevDependencies = Object.fromEntries(
      [
        "@playwright/test",
        "@supabase/supabase-js",
        "typescript",
        "vite",
        "vitest",
      ]
        .filter((name) => devDependencies[name])
        .map((name) => [name, devDependencies[name]]),
    );

    return JSON.stringify(
      {
        dependencies: packageJson.dependencies ?? {},
        devDependencies: relevantDevDependencies,
        scripts: {
          "test:e2e:supabase": scripts["test:e2e:supabase"] ?? "",
          "verify:auth-data-readiness":
            scripts["verify:auth-data-readiness"] ?? "",
          "verify:supabase-release": scripts["verify:supabase-release"] ?? "",
          "verify:pilot-volume": scripts["verify:pilot-volume"] ?? "",
          "supabase:pilot-cohort": scripts["supabase:pilot-cohort"] ?? "",
          "supabase:production-workflow-smoke":
            scripts["supabase:production-workflow-smoke"] ?? "",
          "verify:production-readiness":
            scripts["verify:production-readiness"] ?? "",
          "verify:production-packet": scripts["verify:production-packet"] ?? "",
          "verify:security": scripts["verify:security"] ?? "",
        },
      },
      null,
      2,
    );
  } catch (error) {
    block("Scoped package.json hash content is readable JSON", error.message);
    return "__INVALID_PACKAGE_JSON__";
  }
}

function expectedRemoteMigrationName(localMigrationFile) {
  return (
    remoteMigrationNameOverrides[localMigrationFile] ??
    localMigrationFile.replace(/\.sql$/, "")
  );
}

function canonicalReadinessForScopedHash() {
  const packet = readJson(
    readinessPath,
    "Production readiness packet exists for scoped hash",
  );
  const stablePacket = {
    ...packet,
    preActivationVerification: {
      readinessContractVersion:
        packet.preActivationVerification?.readinessContractVersion ?? "",
    },
  };

  return JSON.stringify(stablePacket, null, 2);
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

function requireActivationPresent(value, label) {
  if (present(value)) pass(label);
  else activationBlock(label, "missing");
}

function requireActivationTrue(value, label) {
  if (bool(value)) pass(label);
  else activationBlock(label, "not confirmed");
}

function requireActivationEqual(value, expected, label) {
  if (value === expected) pass(label);
  else activationBlock(label, "mismatch");
}

function requireActivationGitHeadOrScopedHash(
  recordedHead,
  currentHead,
  recordedScopedDiffSha256,
  currentScopedDiffSha256,
  label,
) {
  if (recordedHead === currentHead) {
    pass(label);
    return;
  }

  if (present(recordedHead) && recordedScopedDiffSha256 === currentScopedDiffSha256) {
    pass(`${label} via current scoped diff hash`);
    return;
  }

  activationBlock(label, "mismatch");
}

function requireGitHeadOrScopedHash(
  recordedHead,
  currentHead,
  recordedScopedDiffSha256,
  currentScopedDiffSha256,
  label,
) {
  if (recordedHead === currentHead) {
    pass(label);
    return;
  }

  if (present(recordedHead) && recordedScopedDiffSha256 === currentScopedDiffSha256) {
    pass(`${label} via current scoped diff hash`);
    return;
  }

  block(label, "mismatch");
}

function requireActivationExistingProjectFile(value, label) {
  if (!present(value)) {
    activationBlock(label, "missing");
    return false;
  }

  const path = resolve(repoRoot, value);
  if (existsSync(path)) {
    pass(label);
    return true;
  }

  activationBlock(label, `${value} does not exist`);
  return false;
}

function projectFileExists(value) {
  return present(value) && existsSync(resolve(repoRoot, value));
}

function requireNonNegativeInteger(value, label) {
  if (Number.isInteger(value) && value >= 0) pass(label);
  else block(label, "missing or invalid count");
}

function requireExistingProjectFile(value, label) {
  if (!present(value)) {
    block(label, "missing");
    return false;
  }

  const path = resolve(repoRoot, value);
  if (existsSync(path)) {
    pass(label);
    return true;
  }

  block(label, `${value} does not exist`);
  return false;
}

function verifyBrowserKeyAuditEvidence(sandbox) {
  const evidenceArtifact = present(sandbox.browserKeyAuditEvidenceArtifact)
    ? sandbox.browserKeyAuditEvidenceArtifact
    : sandbox.browserKeyAuditScreenshot;

  requireExistingProjectFile(
    evidenceArtifact,
    "Sandbox browser key audit evidence artifact exists",
  );
  if (present(sandbox.browserKeyAuditScreenshot)) {
    requireActivationExistingProjectFile(
      sandbox.browserKeyAuditScreenshot,
      "Sandbox browser key audit screenshot exists",
    );
  } else {
    pass("Sandbox browser key audit screenshot is optional when evidence artifact exists");
  }
}

function requireSnippet(content, snippet, label) {
  if (content.includes(snippet)) pass(label);
  else block(label, "missing");
}

const blockerActions = [
  {
    match: /Sandbox browser key audit/,
    owner: "Codex browser QA operator",
    command: "npm run test:e2e:supabase",
    artifact: "docs/qa/supabase-production-browser-key-audit-20260701.md",
  },
  {
    match: /smoke account|auth user count|profile count|orphan auth user|Agent smoke|Other-agent smoke|Admin smoke|Production has no auth users/,
    owner: "Supabase production operator",
    command: "npm run supabase:pilot-cohort -- --check --required-size 20",
    artifact: "docs/qa/supabase-production-smoke-discovery-20260701.md and docs/qa/supabase-production-pilot-cohort-20260701.md",
  },
  {
    match: /Backup|Restore|RPO\/RTO|rollback communication/i,
    owner: "Supabase project owner",
    command: "npm run verify:production-readiness",
    artifact: "docs/qa/supabase-production-backup-discovery-20260701.md",
  },
  {
    match: /Pre-activation|verify:supabase-release evidence|test:supabase-live|test:e2e:supabase|verify:full|Final diff/,
    owner: "Codex release operator",
    command: "npm run verify:auth-data-readiness && npm run verify:supabase-release && npm run verify:production-packet",
    artifact: "docs/qa/supabase-production-preactivation-20260706.md",
  },
  {
    match: /Production release switch|Production env|Production approval|Browser QA|Browser key audit|public config/i,
    owner: "Rollout owner",
    command: "npm run verify:production-readiness",
    artifact: "docs/qa/supabase-production-env-evidence-20260701.md and docs/qa/supabase-production-owner-approval-20260701.md",
  },
  {
    match: /Edge Function/i,
    owner: "Supabase production operator",
    command: "npm run verify:production-readiness",
    artifact: "docs/qa/supabase-production-edge-functions-20260701.md",
  },
  {
    match: /migration|Transactional persistence|RLS policy|Storage policy|workflow|Post-activation|waiting_review|Admin can accept|media|handoff/i,
    owner: "Supabase production operator",
    command: "npm run supabase:production-workflow-smoke",
    artifact: "docs/qa/supabase-production-migration-evidence-20260701.md and docs/qa/supabase-production-workflow-smoke-20260701.md",
  },
  {
    match: /security advisor|leaked password|Auth security|plan eligibility|advisor/i,
    owner: "Supabase project owner",
    command: "npm run verify:production-readiness",
    artifact: "docs/qa/supabase-production-security-advisors-20260701.md",
  },
  {
    match: /Logs and error rate/,
    owner: "Supabase production operator",
    command: "npm run verify:production-readiness",
    artifact: "docs/qa/supabase-production-logs-20260701.md",
  },
  {
    match: /Go \/ No-Go/,
    owner: "Rollout owner",
    command: "npm run verify:production-readiness",
    artifact: "docs/qa/supabase-production-blockers-20260704.md",
  },
];

function blockerAction(label) {
  return (
    blockerActions.find((action) => action.match.test(label)) ?? {
      owner: "Rollout owner",
      command: "npm run verify:production-readiness",
      artifact: "docs/qa/supabase-production-blockers-20260704.md",
    }
  );
}

function printBlocker(blocker) {
  const action = blockerAction(blocker.label);
  console.error(`- ${formatBlocker(blocker)}`);
  console.error(`  owner: ${action.owner}`);
  console.error(`  verification command: ${action.command}`);
  console.error(`  expected artifact: ${action.artifact}`);
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
  const actualRequiredOrder = requiredMigrationsInActualOrder(migrationFiles);
  const undeclaredMigrations = undeclaredMigrationFiles(migrationFiles);

  if (actualRequiredOrder.join("\n") === requiredMigrationOrder.join("\n")) {
    pass("Local required migration order is intact");
  } else {
    block(
      "Local required migration order is intact",
      `Expected ${requiredMigrationOrder.join(" -> ")}`,
    );
  }
  if (undeclaredMigrations.length) {
    block(
      "No undeclared Supabase migrations exist outside production contract",
      `undeclared: ${undeclaredMigrations.join(", ")}`,
    );
  } else {
    pass("No undeclared Supabase migrations exist outside production contract");
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
    activationBlock(
      "Production packet records the exact applied remote migration order",
      "mismatch",
    );
  }

  const missingRemoteCoverage = requiredMigrationOrder
    .map(expectedRemoteMigrationName)
    .filter((remoteMigration) => !requiredRemoteMigrationOrder.includes(remoteMigration));
  if (missingRemoteCoverage.length === 0) {
    pass("Remote migration contract covers every local required migration");
  } else {
    activationBlock(
      "Remote migration contract covers every local required migration",
      `missing remote migration(s): ${missingRemoteCoverage.join(", ")}`,
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
  if (packet.productionEnvEvidence?.migrationsApplied !== true) {
    activationBlock(
      "Production migration evidence artifact exists",
      "migrations not confirmed",
    );
    return;
  }

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
      "Public base tables: `16`",
    ],
    [
      "Production migration evidence records all public tables have RLS",
      "Public tables with RLS enabled: `16`",
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
  if (smokeDiscovery.checked !== true) {
    activationBlock(
      "Production smoke account discovery evidence artifact exists",
      "discovery not confirmed",
    );
    return;
  }

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
  requireActivationEqual(
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

function verifyPreActivationFreshness(pre, verifierSha256, gitHead, controlledPilot = false) {
  const scopedDiffSha256 = currentScopedDiffSha256();
  requireActivationEqual(
    pre.readinessContractVersion,
    readinessContractVersion,
    "Pre-activation verification is bound to the current readiness contract",
  );
  requireActivationPresent(
    pre.readinessVerifierSha256,
    "Pre-activation readiness verifier hash is recorded",
  );
  requireActivationEqual(
    pre.readinessVerifierSha256,
    verifierSha256,
    "Pre-activation readiness verifier hash is current",
  );
  requireActivationPresent(
    pre.checkedAt,
    "Pre-activation verification timestamp is recorded",
  );
  requireActivationPresent(
    pre.gitHead,
    "Pre-activation verification git head is recorded",
  );
  requireActivationGitHeadOrScopedHash(
    pre.gitHead,
    gitHead,
    pre.scopedDiffSha256,
    scopedDiffSha256,
    "Pre-activation verification git head matches current HEAD",
  );
  requireActivationEqual(
    pre.scopedDiffSha256,
    scopedDiffSha256,
    "Pre-activation verification scoped diff hash is current",
  );
  requireActivationPresent(
    pre.verificationScope,
    "Pre-activation verification scope is recorded",
  );

  if (pre.verifyAuthDataReadinessPassed === true) {
    verifyPreActivationCheck(
      pre,
      "verifyAuthDataReadiness",
      "npm run verify:auth-data-readiness",
      "verify:auth-data-readiness evidence",
      verifierSha256,
    );
  }

  if (pre.verifySupabaseReleasePassed === true) {
    verifyPreActivationCheck(
      pre,
      "verifySupabaseRelease",
      "npm run verify:supabase-release",
      "verify:supabase-release evidence",
      verifierSha256,
    );
  }

  if (pre.testSupabaseLivePassed === true && !controlledPilot) {
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
  } else if (controlledPilot) {
    const check = pre.testE2eSupabase ?? {};
    const deferredFailure = check.deferredFailure ?? {};
    requireEqual(
      check.command,
      "npm run test:e2e:supabase",
      "test:e2e:supabase deferred evidence command is recorded",
    );
    requireEqual(
      check.exitCode,
      1,
      "test:e2e:supabase deferred evidence records latest non-zero exit",
    );
    requireEqual(
      check.gitHead,
      pre.gitHead,
      "test:e2e:supabase deferred evidence git head matches packet",
    );
    requireEqual(
      check.scopedDiffSha256,
      pre.scopedDiffSha256,
      "test:e2e:supabase deferred evidence scoped diff hash matches packet",
    );
    requireEqual(
      check.readinessContractVersion,
      readinessContractVersion,
      "test:e2e:supabase deferred evidence is bound to the current readiness contract",
    );
    requireActivationEqual(
      check.readinessVerifierSha256,
      verifierSha256,
      "test:e2e:supabase deferred evidence is bound to the current readiness verifier",
    );
    requireExistingProjectFile(
      check.evidenceArtifact,
      "test:e2e:supabase deferred evidence artifact exists",
    );
    const deferredFailureContract = {
      project: "supabase-sandbox-auth-smoke",
      spec: "tests/e2e-supabase/browser-key-audit.spec.ts",
      testTitle:
        "keeps admin return and agent correction in sync across Supabase roles",
      failingAction: "admin review drawer button `Добавить замечание`",
      productionCoverage: "npm run supabase:production-workflow-smoke",
    };
    for (const [field, expected] of Object.entries(deferredFailureContract)) {
      requireEqual(
        deferredFailure[field],
        expected,
        `test:e2e:supabase deferred failure records ${field}`,
      );
      requireSnippet(
        check.result ?? "",
        expected,
        `test:e2e:supabase deferred result records ${field}`,
      );
    }
    requirePresent(
      deferredFailure.errorSnippet,
      "test:e2e:supabase deferred failure records exact error snippet",
    );
    if (present(deferredFailure.errorSnippet)) {
      requireSnippet(
        check.result ?? "",
        deferredFailure.errorSnippet,
        "test:e2e:supabase deferred result records exact error snippet",
      );
    }
    const deferredE2eMarkers = [
      "Latest full Supabase Playwright smoke: 4 passed, 1 failed",
      "sandbox cross-role UI scenario",
      "Добавить замечание",
      "production workflow smoke covers the backend role handoff",
    ];
    for (const marker of deferredE2eMarkers) {
      requireSnippet(
        check.result ?? "",
        marker,
        `test:e2e:supabase deferred result records ${marker}`,
      );
    }
    if (present(check.evidenceArtifact)) {
      const evidence = readText(
        resolve(repoRoot, check.evidenceArtifact),
        "test:e2e:supabase deferred evidence artifact exists",
      );
      for (const marker of deferredE2eMarkers) {
        requireSnippet(
          evidence,
          marker,
          `test:e2e:supabase deferred artifact records ${marker}`,
        );
      }
      for (const [field, expected] of Object.entries(deferredFailureContract)) {
        requireSnippet(
          evidence,
          expected,
          `test:e2e:supabase deferred artifact records ${field}`,
        );
      }
      if (present(deferredFailure.errorSnippet)) {
        requireSnippet(
          evidence,
          deferredFailure.errorSnippet,
          "test:e2e:supabase deferred artifact records exact error snippet",
        );
      }
    }
  }

  if (pre.verifyFullPassed === true && !controlledPilot) {
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
    requireActivationEqual(
      pre.verifyFullReadinessVerifierSha256,
      verifierSha256,
      "verify:full evidence is bound to the current readiness verifier",
    );
    requirePresent(pre.verifyFullCheckedAt, "verify:full timestamp is recorded");
  }

  if (pre.finalDiffReviewed === true) {
    const review = pre.finalDiffReview ?? {};
    const dirtyFiles = unexpectedDirtyFiles();
    const scopedPilotReview =
      controlledPilot && review.scope === "supabase-controlled-pilot";
    requireGitHeadOrScopedHash(
      review.gitHead,
      gitHead,
      review.diffSha256,
      scopedDiffSha256,
      "Final diff review is bound to current HEAD",
    );
    requireEqual(
      review.diffSha256,
      scopedDiffSha256,
      "Final diff review diff hash matches current backend/security diff",
    );
    requirePresent(review.checkedAt, "Final diff review timestamp is recorded");
    if (scopedPilotReview) {
      pass("Final diff review is scoped to Supabase controlled pilot");
      if (review.unrelatedDirtyWorktreeAccepted === true) {
        pass("Final scoped diff review records unrelated dirty worktree boundary");
      } else {
        block(
          "Final scoped diff review records unrelated dirty worktree boundary",
          "missing",
        );
      }
      const packageLockStatus = gitOutput(
        ["status", "--porcelain", "--", "package-lock.json"],
        "package-lock.json git status is readable",
      ).trim();
      if (packageLockStatus.length === 0) {
        pass("Final scoped diff review has no package-lock drift");
      } else {
        block(
          "Final scoped diff review has no package-lock drift",
          packageLockStatus,
        );
      }
      if (review.packageLockDrift === "none") {
        pass("Final scoped diff review records package-lock drift status");
      } else {
        block(
          "Final scoped diff review records package-lock drift status",
          review.packageLockDrift ?? "missing",
        );
      }
    } else if (dirtyFiles.length === 0) {
      pass("Final diff review has no unexpected dirty files outside scope");
    } else {
      block(
        "Final diff review has no unexpected dirty files outside scope",
        dirtyFiles.join(", "),
      );
    }
  }

  if (pre.verifyPilotVolumePassed === true) {
    verifyPreActivationCheck(
      pre,
      "verifyPilotVolume",
      "npm run verify:pilot-volume",
      "verify:pilot-volume evidence",
      verifierSha256,
    );
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

function verifyProductionWorkflowEvidence(packet, env, post) {
  const artifact =
    post.workflowEvidenceArtifact ?? env.productionWorkflowEvidenceArtifact;
  const hasWorkflowChecks = [
    env.transactionalPersistenceTested,
    env.rlsPolicyTestsPassed,
    env.storagePolicyTestsPassed,
    post.agentCanCreateDraft,
    post.agentCanUploadRequiredMedia,
    post.incompleteWaitingReviewRejected ??
      post.incompleteSubmittedForReviewRejected,
    post.validWaitingReviewReachesQueue ??
      post.validSubmittedForReviewReachesQueue,
    post.adminCanAcceptOrReturnCase,
    post.postHandoffAgentMutationBlocked,
    post.privateMediaSignedUrlScoped,
  ].some((value) => value === true);

  if (!hasWorkflowChecks) return;

  requireExistingProjectFile(
    artifact,
    "Production workflow smoke evidence artifact exists",
  );
  if (!present(artifact)) return;

  const evidence = readText(
    resolve(repoRoot, artifact),
    "Production workflow smoke evidence artifact exists",
  );
  if (!evidence) return;

  requireSnippet(evidence, "Result: `PASS`", "Production workflow smoke passed");
  if (present(packet.productionTarget?.projectId)) {
    requireSnippet(
      evidence,
      packet.productionTarget.projectId,
      "Production workflow smoke records project id",
    );
  }
  requireSnippet(
    evidence,
    "No email, password, service-role key, signed URL, or personal identifier is recorded",
    "Production workflow smoke records no-secret boundary",
  );
  requireSnippet(
    evidence,
    "incomplete waiting_review is rejected",
    "Production workflow smoke rejects incomplete waiting_review",
  );
  requireSnippet(
    evidence,
    "valid waiting_review reaches admin queue",
    "Production workflow smoke proves waiting_review queue handoff",
  );
  requireSnippet(
    evidence,
    "admin can accept case",
    "Production workflow smoke proves accepted admin decision",
  );
}

function productionWorkflowEvidenceConfirmed(env, post) {
  const artifact =
    post.workflowEvidenceArtifact ?? env.productionWorkflowEvidenceArtifact;
  return projectFileExists(artifact);
}

function isControlledPilot(packet) {
  return (
    packet.goNoGo?.scope === "controlled-10-registered-agent-500-submission-pilot" &&
    packet.controlledPilot?.scope === "controlled-10-registered-agent-500-submission-pilot"
  );
}

const controlledPilotRiskEvidenceMarkers = {
  backupRestoreDeferred: [
    "Restore drill/RPO evidence is deferred",
    "Rollback owner must stop intake",
  ],
  leakedPasswordProtectionDeferred: [
    "`auth_leaked_password_protection` remains disabled",
    "free plan",
    "admin-provisioned users",
    "no public password registration path",
  ],
  logsReviewDeferred: ["Logs/error-rate review is deferred"],
  edgeFunctionDryRunDeferred: ["Edge Function dry-runs are deferred"],
  crossRoleBrowserQaDeferred: [
    "Cross-role browser UI proof is deferred",
    "4 passed / 1 failed",
    "Добавить замечание",
    "production workflow smoke covers the backend handoff",
  ],
};

function controlledPilotEvidenceConfirmed(packet, key) {
  if (controlledPilotRiskEvidenceCache.has(key)) {
    return controlledPilotRiskEvidenceCache.get(key);
  }

  const label = `Controlled pilot accepted risk ${key} is evidenced`;
  const pilot = packet.controlledPilot ?? {};
  const acceptedRisks = pilot.acceptedRisks ?? {};
  const structuredRisk = pilot.acceptedRiskEvidence?.[key] ?? {};
  const artifact = structuredRisk.evidenceArtifact ?? pilot.evidenceArtifact;
  const riskMarkers = controlledPilotRiskEvidenceMarkers[key];

  if (!isControlledPilot(packet)) {
    block(label, "packet is not scoped to controlled-10-registered-agent-500-submission-pilot");
    controlledPilotRiskEvidenceCache.set(key, false);
    return false;
  }
  if (acceptedRisks[key] !== true) {
    block(label, "accepted risk flag is missing");
    controlledPilotRiskEvidenceCache.set(key, false);
    return false;
  }
  if (!Array.isArray(riskMarkers)) {
    block(label, "risk marker contract is missing");
    controlledPilotRiskEvidenceCache.set(key, false);
    return false;
  }
  const structuredIssues = [];
  if (!present(structuredRisk.acceptedBy)) structuredIssues.push("acceptedBy");
  if (!present(structuredRisk.acceptedAt)) {
    structuredIssues.push("acceptedAt");
  } else if (!Number.isFinite(Date.parse(structuredRisk.acceptedAt))) {
    structuredIssues.push("acceptedAt must be ISO timestamp");
  }
  if (structuredRisk.scope !== pilot.scope) structuredIssues.push("scope");
  if (!present(structuredRisk.residualRisk)) structuredIssues.push("residualRisk");
  if (!present(structuredRisk.mitigation)) structuredIssues.push("mitigation");
  if (!present(structuredRisk.reviewCadence)) structuredIssues.push("reviewCadence");
  if (!projectFileExists(structuredRisk.evidenceArtifact)) {
    structuredIssues.push("evidenceArtifact");
  }
  if (structuredIssues.length > 0) {
    block(label, `structured acceptance missing/invalid: ${structuredIssues.join(", ")}`);
    controlledPilotRiskEvidenceCache.set(key, false);
    return false;
  }
  if (!projectFileExists(artifact)) {
    block(label, "accepted-risk artifact is missing");
    controlledPilotRiskEvidenceCache.set(key, false);
    return false;
  }

  const evidence = readText(resolve(repoRoot, artifact), label);
  const requiredMarkers = [
    packet.productionTarget?.projectId ?? "",
    "Scope: `controlled-10-registered-agent-500-submission-pilot`",
    "Maximum 10 registered pilot agents",
    "Maximum 50 submissions per registered agent, 500 total submissions",
    "Existing provisioned users only; do not open public sign-up",
    "No broad/public production expansion from this GO",
    "No email, password, service-role key, signed URL, or direct personal identifier is recorded",
    ...riskMarkers,
  ].filter(present);
  const missingMarkers = requiredMarkers.filter((marker) => !evidence.includes(marker));

  if (missingMarkers.length > 0) {
    block(label, `missing artifact marker(s): ${missingMarkers.join("; ")}`);
    controlledPilotRiskEvidenceCache.set(key, false);
    return false;
  }

  pass(label);
  controlledPilotRiskEvidenceCache.set(key, true);
  return true;
}

function requireActivationIntegerEqual(value, expected, label) {
  if (Number.isInteger(value) && value === expected) pass(label);
  else activationBlock(label, `expected ${expected}`);
}

function requireEvidenceSnippet(artifact, snippet, label) {
  requireExistingProjectFile(artifact, label);
  if (!present(artifact)) return;
  const evidence = readText(resolve(repoRoot, artifact), label);
  if (!evidence) return;
  requireSnippet(evidence, snippet, label);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function markdownIntegerForLabel(content, fieldLabel) {
  const escapedLabel = escapeRegExp(fieldLabel);
  const match = content.match(new RegExp(`- ${escapedLabel}: \`([0-9]+)\``));
  return match ? Number.parseInt(match[1], 10) : null;
}

function requireEvidenceIntegerAtMost(content, fieldLabel, limit, label) {
  const value = markdownIntegerForLabel(content, fieldLabel);
  if (!Number.isInteger(value)) {
    activationBlock(label, "missing or invalid count");
  } else if (value <= limit) {
    pass(label);
  } else {
    activationBlock(label, `${value} > ${limit}`);
  }
}

function verifyControlledPilotEnvelope(packet) {
  if (!isControlledPilot(packet)) return;

  const pilot = packet.controlledPilot ?? {};
  requireActivationIntegerEqual(
    pilot.maxRegisteredAgents,
    10,
    "Controlled pilot has exactly 10 registered agents",
  );
  requireActivationIntegerEqual(
    pilot.maxSubmissionsPerAgent,
    50,
    "Controlled pilot has 50 submissions per registered agent",
  );
  requireActivationIntegerEqual(
    pilot.maxTotalSubmissions,
    500,
    "Controlled pilot has 500 total submissions",
  );
  requireActivationIntegerEqual(
    pilot.maxApplicantsPerSubmission,
    3,
    "Controlled pilot has 3 applicants per submission",
  );
  requireActivationIntegerEqual(
    pilot.maxTotalApplicants,
    1500,
    "Controlled pilot has 1500 total applicants",
  );
  requireActivationIntegerEqual(
    pilot.maxRequiredMediaObjects,
    4500,
    "Controlled pilot has 4500 required media objects",
  );
  requireActivationExistingProjectFile(
    pilot.workloadEvidenceArtifact,
    "Controlled pilot volume evidence artifact exists",
  );
  requireEvidenceSnippet(
    pilot.workloadEvidenceArtifact,
    "Max total submissions: `500`",
    "Controlled pilot volume evidence records total submissions",
  );
  requireEvidenceSnippet(
    pilot.workloadEvidenceArtifact,
    "Max required media objects: `4500`",
    "Controlled pilot volume evidence records required media objects",
  );
  requireEvidenceSnippet(
    pilot.workloadEvidenceArtifact,
    "## Production Read-Only Cap Check",
    "Controlled pilot volume evidence records production cap check",
  );
  requireEvidenceSnippet(
    pilot.workloadEvidenceArtifact,
    "Production total submissions cap: `<= 500`",
    "Controlled pilot volume evidence records production submission cap",
  );
  requireEvidenceSnippet(
    pilot.workloadEvidenceArtifact,
    "Production per-agent submissions cap: `<= 50`",
    "Controlled pilot volume evidence records production per-agent cap",
  );
  requireEvidenceSnippet(
    pilot.workloadEvidenceArtifact,
    "Production active-agent cap: `<= 10`",
    "Controlled pilot volume evidence records production active-agent cap",
  );
  requireEvidenceSnippet(
    pilot.workloadEvidenceArtifact,
    "Production registered agent profiles cap: `<= 10`",
    "Controlled pilot volume evidence records production registered-agent cap",
  );
  requireEvidenceSnippet(
    pilot.workloadEvidenceArtifact,
    "Pilot cohort registered-agent cap: `<= 10`",
    "Controlled pilot volume evidence records cohort registered-agent cap",
  );
  requireEvidenceSnippet(
    pilot.workloadEvidenceArtifact,
    "It intentionally records no emails, user IDs, submission IDs, or storage paths from production.",
    "Controlled pilot volume evidence avoids production PII",
  );
  if (projectFileExists(pilot.workloadEvidenceArtifact)) {
    const evidence = readText(
      resolve(repoRoot, pilot.workloadEvidenceArtifact),
      "Controlled pilot volume evidence artifact exists",
    );
    requireEvidenceIntegerAtMost(
      evidence,
      "Production registered agent profiles",
      pilot.maxRegisteredAgents,
      "Production registered agent profiles stay within controlled pilot cap",
    );
    requireEvidenceIntegerAtMost(
      evidence,
      "Pilot cohort registered agents",
      pilot.maxRegisteredAgents,
      "Pilot cohort registered agents stay within controlled pilot cap",
    );
    requireEvidenceIntegerAtMost(
      evidence,
      "Production total submissions",
      pilot.maxTotalSubmissions,
      "Production total submissions stay within controlled pilot cap",
    );
    requireEvidenceIntegerAtMost(
      evidence,
      "Production active agents with submissions",
      pilot.maxRegisteredAgents,
      "Production active agents stay within controlled pilot cap",
    );
    requireEvidenceIntegerAtMost(
      evidence,
      "Production max submissions for one agent",
      pilot.maxSubmissionsPerAgent,
      "Production per-agent submission count stays within controlled pilot cap",
    );
  }

  const constraints = Array.isArray(pilot.constraints) ? pilot.constraints : [];
  const constraintText = constraints.join("\n").toLowerCase();
  if (constraintText.includes("no public") || constraintText.includes("public sign-up closed")) {
    pass("Controlled pilot constraints close public sign-up");
  } else {
    activationBlock("Controlled pilot constraints close public sign-up", "missing");
  }
  if (constraintText.includes("500") && constraintText.includes("submissions")) {
    pass("Controlled pilot constraints record 500-submission cap");
  } else {
    activationBlock("Controlled pilot constraints record 500-submission cap", "missing");
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

  const controlledPilot = isControlledPilot(packet);

  if (
    packet.scope === "supabase-production-activation" ||
    packet.scope === "supabase-controlled-10-registered-agent-pilot"
  ) {
    pass("Production readiness packet scope is locked");
  } else {
    block("Production readiness packet scope is locked", "unexpected scope");
  }
  if (controlledPilot) {
    requireActivationEqual(
      packet.scope,
      "supabase-controlled-10-registered-agent-pilot",
      "Controlled pilot packet uses pilot-scoped top-level scope",
    );
    if (packet.goNoGo?.decision === "GO") {
      requireActivationEqual(
        packet.status,
        "PILOT_GO",
        "Controlled pilot GO packet status is pilot-scoped",
      );
    } else if (packet.status === "NO_GO") {
      pass("Controlled pilot packet status is fail-closed");
    } else {
      activationBlock(
        "Controlled pilot packet status is fail-closed",
        packet.status ?? "missing",
      );
    }
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
  verifyBrowserKeyAuditEvidence(sandbox);

  const target = packet.productionTarget ?? {};
  requireActivationPresent(target.projectId, "Production project id is recorded");
  requireActivationPresent(target.projectUrl, "Production project URL is recorded");
  requireActivationPresent(
    target.supabaseOrganization,
    "Supabase organization is recorded",
  );
  if (!present(target.projectId)) {
    activationBlock("Production project is not the sandbox project", "missing");
  } else if (target.projectId !== sandboxProjectId) {
    pass("Production project is not the sandbox project");
  } else {
    block("Production project is not the sandbox project", "sandbox id");
  }
  if (!present(target.activationTarget)) {
    activationBlock("Production activation target is explicit", "missing");
  } else if (target.activationTarget === "production") {
    pass("Production activation target is explicit");
  } else {
    block("Production activation target is explicit", "must be production");
  }

  const owners = packet.owners ?? {};
  requireActivationPresent(owners.rolloutOwner, "Rollout owner is recorded");
  requireActivationPresent(owners.technicalApprover, "Technical approver is recorded");
  requireActivationPresent(owners.businessApprover, "Business approver is recorded");
  requireActivationPresent(
    owners.rollbackDecisionOwner,
    "Rollback decision owner is recorded",
  );
  requireActivationPresent(
    owners.plannedPromotionWindow,
    "Promotion window is recorded",
  );

  const migration = packet.migrationContract ?? {};
  requireActivationTrue(
    migration.targetHistoryChecked,
    "Target migration history was checked",
  );
  requireActivationTrue(
    migration.targetHistoryCompatible,
    "Target migration history is compatible",
  );
  requireActivationTrue(
    migration.ownerApprovedExactMigrationContract,
    "Owner approved exact migration contract",
  );
  requireActivationPresent(
    migration.migrationApplyOperator,
    "Migration apply operator is recorded",
  );
  requireActivationTrue(
    migration.expectedPostApplyMigrationListRecorded,
    "Expected post-apply migration list is recorded",
  );

  const smoke = packet.smokeAccounts ?? {};
  const smokeDiscovery = packet.smokeAccountDiscovery ?? {};
  const smokeDiscoveryConfirmed =
    smokeDiscovery.checked === true &&
    present(smokeDiscovery.checkedAt) &&
    projectFileExists(smokeDiscovery.evidenceArtifact);
  requireActivationTrue(
    smokeDiscovery.checked,
    "Production smoke account discovery was checked",
  );
  requireActivationPresent(
    smokeDiscovery.checkedAt,
    "Production smoke account discovery timestamp is recorded",
  );
  if (smokeDiscovery.checked === true) {
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
  } else {
    activationBlock(
      "Production auth user count is recorded",
      "discovery not confirmed",
    );
    activationBlock(
      "Production confirmed auth user count is recorded",
      "discovery not confirmed",
    );
    activationBlock("Production profile count is recorded", "discovery not confirmed");
    activationBlock(
      "Production orphan auth user count is recorded",
      "discovery not confirmed",
    );
    verifySmokeDiscoveryEvidence(packet, smokeDiscovery);
    activationBlock(
      "Production has no auth users without profiles",
      "discovery not confirmed",
    );
  }
  for (const [key, label] of [
    ["agent", "Agent smoke account"],
    ["otherAgent", "Other-agent smoke account"],
    ["admin", "Admin smoke account"],
  ]) {
    if (!smokeDiscoveryConfirmed) {
      activationBlock(`${label} exists`, "smoke discovery not confirmed");
      activationBlock(`${label} role is verified`, "smoke discovery not confirmed");
      activationBlock(
        `${label} identifier is recorded`,
        "smoke discovery not confirmed",
      );
    } else {
      requireActivationTrue(smoke[key]?.exists, `${label} exists`);
      requireActivationTrue(smoke[key]?.roleVerified, `${label} role is verified`);
      requireActivationTrue(
        smoke[key]?.identifierRecorded,
        `${label} identifier is recorded`,
      );
    }
  }

  const backup = packet.backupRestore ?? {};
  requireActivationPresent(backup.backupOwner, "Backup owner is recorded");
  requireActivationPresent(backup.backupMechanism, "Backup mechanism is recorded");
  if (controlledPilotEvidenceConfirmed(packet, "backupRestoreDeferred")) {
    pass("Latest backup timestamp is deferred for controlled registered-agent pilot");
    pass("Restore path is deferred for controlled registered-agent pilot");
    pass("Restore evidence is deferred for controlled registered-agent pilot");
    pass("RPO/RTO acceptance is deferred for controlled registered-agent pilot");
  } else {
    requireActivationPresent(
      backup.latestBackupTimestamp,
      "Latest backup timestamp is recorded",
    );
    requireActivationTrue(backup.restorePathConfirmed, "Restore path is confirmed");
    requireActivationTrue(backup.restoreEvidenceRecorded, "Restore evidence is recorded");
    requireActivationTrue(backup.rpoRtoAcceptedByOwner, "RPO/RTO is accepted by owner");
  }
  requireActivationPresent(
    backup.rollbackCommunicationOwner,
    "Rollback communication owner is recorded",
  );

  const pre = packet.preActivationVerification ?? {};
  verifyPreActivationFreshness(pre, verifierSha256, gitHead, controlledPilot);
  requireActivationTrue(
    pre.verifyAuthDataReadinessPassed,
    "verify:auth-data-readiness passed",
  );
  requireActivationTrue(pre.verifySupabaseReleasePassed, "verify:supabase-release passed");
  if (controlledPilot) {
    pass("test:supabase-live is not required for controlled production pilot");
  } else {
    requireActivationTrue(pre.testSupabaseLivePassed, "test:supabase-live passed");
  }
  if (controlledPilotEvidenceConfirmed(packet, "crossRoleBrowserQaDeferred")) {
    pass("test:e2e:supabase full cross-role browser workflow is deferred for controlled pilot");
  } else {
    requireActivationTrue(pre.testE2eSupabasePassed, "test:e2e:supabase passed");
  }
  requireActivationTrue(pre.verifyPilotVolumePassed, "verify:pilot-volume passed");
  if (controlledPilot) {
    pass("verify:full is deferred for controlled registered-agent pilot");
    requireActivationTrue(pre.finalDiffReviewed, "Final scoped diff was reviewed");
  } else {
    requireActivationTrue(pre.verifyFullPassed, "verify:full passed");
    requireActivationTrue(pre.finalDiffReviewed, "Final diff was reviewed");
  }
  if (present(pre.evidenceArtifact)) {
    requireExistingProjectFile(
      pre.evidenceArtifact,
      "Pre-activation evidence artifact exists",
    );
  } else {
    activationBlock("Pre-activation evidence artifact exists", "missing");
  }

  verifyControlledPilotEnvelope(packet);

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
    ["browserKeyAudited", "Browser key audit evidence is true"],
    ["productionApproved", "Production approval evidence is true"],
    ["publicConfigRecorded", "Production public config is recorded"],
  ]) {
    requireActivationTrue(env[key], label);
  }
  if (controlledPilotEvidenceConfirmed(packet, "edgeFunctionDryRunDeferred")) {
    pass("Edge Function dry-runs are deferred for controlled pilot");
  } else {
    requireActivationTrue(
      env.edgeFunctionDryRunsPassed,
      "Edge Function dry-run evidence is true",
    );
  }
  if (controlledPilotEvidenceConfirmed(packet, "crossRoleBrowserQaDeferred")) {
    pass("Cross-role browser QA is deferred for controlled pilot");
  } else {
    requireActivationTrue(env.browserQaPassed, "Browser QA evidence is true");
  }
  verifyProductionMigrationEvidence(packet);

  const authSecurity = packet.authSecurity ?? {};
  requireActivationTrue(
    authSecurity.securityAdvisorsChecked,
    "Supabase security advisors were checked",
  );
  if (authSecurity.securityAdvisorsChecked === true) {
    if (authSecurity.projectId === packet.productionTarget?.projectId) {
      pass("Supabase security advisors were checked against production");
    } else {
      block(
        "Supabase security advisors were checked against production",
        "project id mismatch",
      );
    }
    verifyAuthSecurityEvidence(packet, authSecurity);
  } else {
    activationBlock(
      "Supabase security advisors were checked against production",
      "not confirmed",
    );
  }
  requireActivationTrue(
    authSecurity.planEligibilityChecked,
    "Supabase Auth leaked password protection plan eligibility was checked",
  );
  requireActivationPresent(
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
  if (controlledPilotEvidenceConfirmed(packet, "leakedPasswordProtectionDeferred")) {
    pass("Supabase Auth leaked password protection is deferred for controlled registered-agent pilot");
    pass("Supabase security advisor warning is accepted for controlled registered-agent pilot");
  } else {
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
  }

  const post = packet.postActivationChecks ?? {};
  verifyProductionWorkflowEvidence(packet, env, post);
  const workflowEvidenceConfirmed = productionWorkflowEvidenceConfirmed(env, post);
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
    if (
      key === "logsAndErrorRateChecked" &&
      controlledPilotEvidenceConfirmed(packet, "logsReviewDeferred")
    ) {
      pass("Logs and error-rate review is deferred for controlled registered-agent pilot");
      continue;
    }
    if (!workflowEvidenceConfirmed) {
      activationBlock(label, "workflow evidence not confirmed");
    } else {
      requireActivationTrue(post[key], label);
    }
  }

  if (packet.goNoGo?.decision === "GO") {
    pass("Go / No-Go decision is GO");
  } else {
    activationBlock("Go / No-Go decision is GO", packet.goNoGo?.decision ?? "missing");
    requireExistingProjectFile(
      packet.goNoGo?.blockerEvidenceArtifact,
      "Go / No-Go blocker evidence artifact exists",
    );
    if (present(packet.goNoGo?.blockerEvidenceArtifact)) {
      const evidence = readText(
        resolve(repoRoot, packet.goNoGo.blockerEvidenceArtifact),
        "Go / No-Go blocker evidence artifact exists",
      );
      if (evidence) {
        requireSnippet(
          evidence,
          packet.productionTarget?.projectId ?? "",
          "Go / No-Go blocker evidence records production project id",
        );
        requireSnippet(evidence, "Owner:", "Go / No-Go blocker evidence records owners");
        requireSnippet(
          evidence,
          "Verification command:",
          "Go / No-Go blocker evidence records verification commands",
        );
        requireSnippet(
          evidence,
          "Expected artifact:",
          "Go / No-Go blocker evidence records expected artifacts",
        );
      }
    }
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
    for (const blocker of integrityBlockers) printBlocker(blocker);
  }
  if (activationBlockers.length) {
    console.error(`Activation blockers (${activationBlockers.length}):`);
    for (const blocker of activationBlockers) printBlocker(blocker);
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

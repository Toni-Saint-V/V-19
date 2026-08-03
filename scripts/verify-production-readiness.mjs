import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import {
  migrationContractEntriesFromFileSystem,
  migrationContractEntriesFromGitHead,
  migrationContractSha256,
  requiredMigrationOrder,
  requiredMigrationsInActualOrder,
  requiredRemoteMigrationOrderForGeneration,
  undeclaredMigrationFiles,
} from "./supabase-migration-contract.mjs";
import { testArtifactPath } from "./lib/artifact-paths.mjs";
import { SUPABASE_PRODUCTION_TARGET } from "../config/supabase-production-target.mjs";
import { forbiddenProductionReadinessMarkers } from "./lib/supabase-readiness-contract.mjs";
import {
  cutoverEvidenceRootSha256,
  cutoverPhaseContract,
  sha256Evidence,
  validateExternalApprovalPacketBinding,
  validateBoundEvidence,
} from "./lib/supabase-cutover-evidence.mjs";
import { releaseSourceSha256FromGitHead } from "./lib/release-source-identity.mjs";
import { edgeFunctionSourceSha256FromGitHead } from "./lib/edge-function-source-identity.mjs";
import {
  productionApprovalPacketPath,
  verifyDetachedOwnerApproval,
} from "./lib/supabase-production-mutation-gate.mjs";
import { validateExternalEvidenceImportReceipt } from "./lib/supabase-external-evidence.mjs";

const repoRoot = process.cwd();
const readinessRelativePath = "docs/release/supabase-production-readiness.json";
const readinessPath = resolve(repoRoot, readinessRelativePath);
const packagePath = resolve(repoRoot, "package.json");
const migrationsDir = resolve(repoRoot, "supabase/migrations");
const expectBlocked = process.argv.includes("--expect-blocked");
const readinessContractVersion = "2026-06-16-production-readiness-v2";

const integrityBlockers = [];
const activationBlockers = [];
const passes = [];
const controlledPilotRiskEvidenceCache = new Map();
let currentFullGitHeadCache;
let currentReleaseSourceSha256Cache;
let currentMigrationContractEntriesCache;
let currentFunctionSourceSha256Cache;

const scopedDiffPaths = [
  "package.json",
  "config/playwright/playwright.supabase-production-export-a1-s1.config.ts",
  "config/playwright/playwright.supabase-production-export-a2-s1-abort.config.ts",
  "scripts/prepare-supabase-production-packet.mjs",
  "scripts/verify-agent-interaction-evidence.mjs",
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
  "supabase/migrations/20260713095403_atomic_export_document_completion.sql",
  "supabase/migrations/20260714020334_atomic_export_guard_null_safe.sql",
  "supabase/migrations/20260714110000_repair_incomplete_export_document_completion.sql",
  "supabase/migrations/20260714190000_fix_complete_export_package_zip_suffix_guard.sql",
  "supabase/migrations/20260714200000_harden_null_safe_admin_rpc_guards.sql",
  "supabase/migrations/20260715000000_document_assets_source_media_id_update_cascade.sql",
  "supabase/migrations/20260717050000_admin_passport_review_media_policy.sql",
  "src/modules/submissions/exportPackageDocumentCommit.ts",
  "src/modules/submissions/exportPackagePersistence.ts",
  "src/modules/submissions/exportWorkflow.ts",
  "src/modules/submissions/exportMediaZip.ts",
  "src/modules/documents/documentRepository.ts",
  "src/components/AdminExportScreen.tsx",
  "src/App.tsx",
  "src/modules/submissions/submissionActions.ts",
  "supabase/remediation/20260712201203_allow_admin_waiting_review_issue_checkpoint.rollback.sql",
  "supabase/remediation/20260712225209_save_returned_submission_update_first.rollback.sql",
  "docs/release/auth-data-production-readiness.md",
  "docs/release/supabase-production-approval-checklist.md",
  "docs/release/supabase-production-promotion.md",
  "docs/release/supabase-workspace-pr-package.md",
  "tests/e2e-supabase/browser-key-audit.spec.ts",
  "tests/e2e-supabase-ui/production-export-a1-s1-helpers.ts",
  "tests/e2e-supabase-ui/production-export-a1-s1-resumable.spec.ts",
  "tests/e2e-supabase-ui/production-lifecycle-helpers.ts",
  "tests/e2e-supabase-ui/production-lifecycle-resumable.spec.ts",
  "tests/unit/appProductionWorkspaceRuntime.spec.tsx",
  "tests/unit/productionCohortNetworkContract.spec.ts",
  "tests/unit/supabaseSecurityContract.spec.ts",
  "tests/unit/v19SubmissionRules.spec.ts",
  "tests/unit/v19SupabasePersistence.spec.ts",
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

function currentFullGitHead() {
  if (currentFullGitHeadCache !== undefined) return currentFullGitHeadCache;
  try {
    currentFullGitHeadCache = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    return currentFullGitHeadCache;
  } catch (error) {
    block("Current full git HEAD is readable", error.message);
    currentFullGitHeadCache = "";
    return currentFullGitHeadCache;
  }
}

function currentReleaseSourceSha256() {
  if (currentReleaseSourceSha256Cache !== undefined) {
    return currentReleaseSourceSha256Cache;
  }
  try {
    currentReleaseSourceSha256Cache = releaseSourceSha256FromGitHead(repoRoot);
    return currentReleaseSourceSha256Cache;
  } catch (error) {
    block("Current release source SHA-256 is readable", error.message);
    currentReleaseSourceSha256Cache = "";
    return currentReleaseSourceSha256Cache;
  }
}

function currentMigrationContractEntries() {
  if (currentMigrationContractEntriesCache !== undefined) {
    return currentMigrationContractEntriesCache;
  }
  try {
    currentMigrationContractEntriesCache =
      migrationContractEntriesFromGitHead(repoRoot);
  } catch (error) {
    activationBlock("Exact migration contract is committed at Git HEAD", error.message);
    currentMigrationContractEntriesCache =
      migrationContractEntriesFromFileSystem(repoRoot);
  }
  return currentMigrationContractEntriesCache;
}

function currentFunctionSourceSha256() {
  if (currentFunctionSourceSha256Cache !== undefined) {
    return currentFunctionSourceSha256Cache;
  }
  try {
    currentFunctionSourceSha256Cache = Object.fromEntries(
      SUPABASE_PRODUCTION_TARGET.requiredEdgeFunctions.map((name) => [
        name,
        edgeFunctionSourceSha256FromGitHead(repoRoot, name),
      ]),
    );
    return currentFunctionSourceSha256Cache;
  } catch (error) {
    activationBlock("Required Edge Function source is committed", error.message);
    currentFunctionSourceSha256Cache = {};
    return currentFunctionSourceSha256Cache;
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
      (fileName) => `\n--- scoped:${fileName} ---\n${scopedHashContentFor(fileName)}`,
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

  return content;
}

function scopedPackageJsonHashContent(content) {
  try {
    const packageJson = JSON.parse(content);
    const scripts = packageJson.scripts ?? {};
    const devDependencies = packageJson.devDependencies ?? {};
    const relevantDevDependencies = Object.fromEntries(
      ["@playwright/test", "@supabase/supabase-js", "typescript", "vite", "vitest"]
        .filter((name) => devDependencies[name])
        .map((name) => [name, devDependencies[name]]),
    );

    return JSON.stringify(
      {
        dependencies: packageJson.dependencies ?? {},
        devDependencies: relevantDevDependencies,
        scripts: {
          "test:e2e:supabase": scripts["test:e2e:supabase"] ?? "",
          "verify:auth-data-readiness": scripts["verify:auth-data-readiness"] ?? "",
          "verify:supabase-release": scripts["verify:supabase-release"] ?? "",
          "verify:pilot-volume": scripts["verify:pilot-volume"] ?? "",
          "supabase:pilot-cohort": scripts["supabase:pilot-cohort"] ?? "",
          "supabase:production-workflow-smoke":
            scripts["supabase:production-workflow-smoke"] ?? "",
          "verify:production-readiness": scripts["verify:production-readiness"] ?? "",
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

  return status
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(3))
    .filter((fileName) => {
      if (allowed.has(fileName)) return false;
      return true;
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

function requireSnippet(content, snippet, label) {
  if (content.includes(snippet)) pass(label);
  else block(label, "missing");
}

const blockerActions = [
  {
    match: /Sandbox browser key audit/,
    owner: "Codex browser QA operator",
    command: "npm run test:e2e:supabase",
    artifact: testArtifactPath("supabase-production-browser-key-audit-20260701.md"),
  },
  {
    match:
      /smoke account|auth user count|profile count|orphan auth user|Agent smoke|Other-agent smoke|Admin smoke|Production has no auth users/,
    owner: "Supabase production operator",
    command: "npm run supabase:pilot-cohort -- --check --required-size 20",
    artifact: `${testArtifactPath("supabase-production-smoke-discovery-20260701.md")} and ${testArtifactPath("supabase-production-pilot-cohort-20260701.md")}`,
  },
  {
    match: /Backup|Restore|RPO\/RTO|rollback communication/i,
    owner: "Supabase project owner",
    command: "npm run verify:production-readiness",
    artifact: testArtifactPath("supabase-production-backup-discovery-20260701.md"),
  },
  {
    match:
      /Pre-activation|verify:supabase-release evidence|test:supabase-live|test:e2e:supabase|verify:full|Final diff/,
    owner: "Codex release operator",
    command:
      "npm run verify:auth-data-readiness && npm run verify:supabase-release && npm run verify:production-packet",
    artifact: testArtifactPath("supabase-production-preactivation-20260706.md"),
  },
  {
    match:
      /Production release switch|Production env|Production approval|Browser QA|Browser key audit|public config/i,
    owner: "Rollout owner",
    command: "npm run verify:production-readiness",
    artifact: `${testArtifactPath("supabase-production-env-evidence-20260701.md")} and ${testArtifactPath("supabase-production-owner-approval-20260701.md")}`,
  },
  {
    match:
      /Cutover target migration|migration contract|migration history|post-apply migration|migration dry-run|migrationsApplied|remoteMigrationHistoryReadbackPassed/i,
    owner: "Supabase production operator",
    command: "npm run supabase:migrations:dry-run",
    artifact: testArtifactPath("supabase-production-migration-dry-run.json"),
  },
  {
    match:
      /Clean cutover final|final data-state|public table inventory|Storage bucket|unexpected Storage/i,
    owner: "Supabase production operator",
    command: "npm run verify:supabase-clean-cutover-state",
    artifact: testArtifactPath("supabase-clean-cutover-final-state.json"),
  },
  {
    match:
      /Agent sign-in|Agent reload|agent CAS|cross-agent|cross-role|cross-owner|role escalation|agentSignInWorks|agentCreateWriteReadbackPassed|agentCas|agentReloadReadbackPassed|secondAgentSignInWorks|secondAgentBrowserIsolationPassed|adminReadsAgentRecordPassed|crossAgentDatabaseReadDenied|crossAgentStorageReadDenied|agentStorageWriteReadbackPassed|agentStorageReloadReadbackPassed|authenticatedRoleEscalationDenied|anonymousDatabaseWriteDenied|privateMediaAnonymousIsolationPassed|storageWriteReadbackPassed/i,
    owner: "Supabase production browser verifier",
    command: "npm run verify:production-readiness",
    artifact: testArtifactPath("supabase-production-role-isolation-runtime.json"),
  },
  {
    match: /Edge Function/i,
    owner: "Supabase production operator",
    command: "npm run supabase:functions:verify-remote",
    artifact: testArtifactPath("supabase-production-edge-functions.json"),
  },
  {
    match:
      /migration|Transactional persistence|RLS policy|Storage policy|workflow|Post-activation|waiting_review|Admin can accept|media|handoff/i,
    owner: "Supabase production operator",
    command: "npm run verify:production-readiness",
    artifact: testArtifactPath("supabase-production-blockers-20260704.md"),
  },
  {
    match: /security advisor|leaked password|Auth security|plan eligibility|advisor/i,
    owner: "Supabase project owner",
    command: "npm run verify:production-readiness",
    artifact: testArtifactPath("supabase-production-security-advisors-20260701.md"),
  },
  {
    match: /Logs and error rate/,
    owner: "Supabase production operator",
    command: "npm run verify:production-readiness",
    artifact: testArtifactPath("supabase-production-logs-20260701.md"),
  },
  {
    match: /Go \/ No-Go/,
    owner: "Rollout owner",
    command: "npm run verify:production-readiness",
    artifact: testArtifactPath("supabase-production-blockers-20260704.md"),
  },
];

function blockerAction(label) {
  return (
    blockerActions.find((action) => action.match.test(label)) ?? {
      owner: "Rollout owner",
      command: "npm run verify:production-readiness",
      artifact: testArtifactPath("supabase-production-blockers-20260704.md"),
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
  const hits = forbiddenProductionReadinessMarkers(content);
  if (hits.length) {
    block(
      "Production readiness packet contains forbidden secret marker",
      hits.join(", "),
    );
  } else pass("Production readiness packet contains no forbidden secret markers");
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
  const cutoverGeneration = packet.productionTarget?.cutoverGeneration ?? "";
  const requiredRemoteMigrationOrder =
    requiredRemoteMigrationOrderForGeneration(cutoverGeneration);

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
  if (requiredRemoteMigrationOrder.length === 0) {
    block(
      "Remote migration contract is registered for the cutover generation",
      cutoverGeneration || "missing cutover generation",
    );
  } else {
    pass("Remote migration contract is registered for the cutover generation");
  }
  if (remoteOrder.join("\n") === requiredRemoteMigrationOrder.join("\n")) {
    pass("Production packet records the exact applied remote migration order");
  } else {
    activationBlock(
      "Production packet records the exact applied remote migration order",
      "mismatch",
    );
  }

  const missingRemoteCoverage = requiredMigrationOrder
    .map((migration) => migration.replace(/\.sql$/, ""))
    .filter(
      (remoteMigration) => !requiredRemoteMigrationOrder.includes(remoteMigration),
    );
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

function verifyAgentInteractionProductionEvidence() {
  const verifierPath = resolve(
    repoRoot,
    "scripts/verify-agent-interaction-evidence.mjs",
  );
  let rawResult = "";
  try {
    rawResult = execFileSync(process.execPath, [verifierPath], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch (error) {
    rawResult = typeof error?.stdout === "string" ? error.stdout : "";
  }

  let result;
  try {
    result = JSON.parse(rawResult.trim());
  } catch {
    activationBlock(
      "Exact deployed agent interaction evidence passes",
      "verifier did not return a valid result",
    );
    return;
  }

  if (
    result.status === "PASS" &&
    Array.isArray(result.blockers) &&
    !result.blockers.length
  ) {
    pass("Exact deployed agent interaction evidence passes");
    return;
  }

  const detail = Array.isArray(result.blockers)
    ? result.blockers.slice(0, 8).join("; ")
    : "interaction evidence is incomplete";
  activationBlock("Exact deployed agent interaction evidence passes", detail);
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
  const requiredRemoteMigrationOrder = requiredRemoteMigrationOrderForGeneration(
    packet.productionTarget?.cutoverGeneration ?? "",
  );
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
      "Public base tables: `22`",
    ],
    [
      "Production migration evidence records all public tables have RLS",
      "Public tables with RLS enabled: `22`",
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

function verifyPreActivationFreshness(
  pre,
  verifierSha256,
  gitHead,
  controlledPilot = false,
) {
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
        block("Final scoped diff review has no package-lock drift", packageLockStatus);
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
    post.incompleteWaitingReviewRejected ?? post.incompleteSubmittedForReviewRejected,
    post.validWaitingReviewReachesQueue ?? post.validSubmittedForReviewReachesQueue,
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
    packet.controlledPilot?.scope ===
      "controlled-10-registered-agent-500-submission-pilot"
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
    block(
      label,
      "packet is not scoped to controlled-10-registered-agent-500-submission-pilot",
    );
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
    block(
      label,
      `structured acceptance missing/invalid: ${structuredIssues.join(", ")}`,
    );
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
    pilot.primaryApplicantRequiredMediaSlots,
    3,
    "Controlled pilot requires 3 media objects for each primary applicant",
  );
  requireActivationIntegerEqual(
    pilot.secondaryApplicantRequiredMediaSlots,
    1,
    "Controlled pilot requires 1 media object for each secondary applicant",
  );
  requireActivationIntegerEqual(
    pilot.maxRequiredMediaObjects,
    2500,
    "Controlled pilot has 2500 required media objects",
  );
  requireActivationPresent(
    pilot.pilotWindowStartedAt,
    "Controlled pilot window start is recorded",
  );
  const pilotWindowTimestamp = Date.parse(pilot.pilotWindowStartedAt ?? "");
  if (Number.isFinite(pilotWindowTimestamp) && pilotWindowTimestamp <= Date.now()) {
    pass("Controlled pilot window start is a valid non-future timestamp");
  } else {
    activationBlock(
      "Controlled pilot window start is a valid non-future timestamp",
      "missing, invalid, or future timestamp",
    );
  }
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
    "Max required media objects: `2500`",
    "Controlled pilot volume evidence records required media objects",
  );
  requireEvidenceSnippet(
    pilot.workloadEvidenceArtifact,
    "## Production Read-Only Cap Check",
    "Controlled pilot volume evidence records production cap check",
  );
  requireEvidenceSnippet(
    pilot.workloadEvidenceArtifact,
    `Pilot window starts at: \`${pilot.pilotWindowStartedAt}\``,
    "Controlled pilot volume evidence records exact pilot window start",
  );
  requireEvidenceSnippet(
    pilot.workloadEvidenceArtifact,
    "Production pilot-window submissions cap: `<= 500`",
    "Controlled pilot volume evidence records pilot-window submission cap",
  );
  requireEvidenceSnippet(
    pilot.workloadEvidenceArtifact,
    "Production pilot-window per-agent submissions cap: `<= 50`",
    "Controlled pilot volume evidence records pilot-window per-agent cap",
  );
  requireEvidenceSnippet(
    pilot.workloadEvidenceArtifact,
    "Production pilot-window active-agent cap: `<= 10`",
    "Controlled pilot volume evidence records pilot-window active-agent cap",
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
      "Production pilot-window submissions",
      pilot.maxTotalSubmissions,
      "Production pilot-window submissions stay within controlled pilot cap",
    );
    requireEvidenceIntegerAtMost(
      evidence,
      "Production pilot-window active agents with submissions",
      pilot.maxRegisteredAgents,
      "Production pilot-window active agents stay within controlled pilot cap",
    );
    requireEvidenceIntegerAtMost(
      evidence,
      "Production pilot-window max submissions for one agent",
      pilot.maxSubmissionsPerAgent,
      "Production pilot-window per-agent count stays within controlled pilot cap",
    );
  }

  const constraints = Array.isArray(pilot.constraints) ? pilot.constraints : [];
  const constraintText = constraints.join("\n").toLowerCase();
  if (
    constraintText.includes("no public") ||
    constraintText.includes("public sign-up closed")
  ) {
    pass("Controlled pilot constraints close public sign-up");
  } else {
    activationBlock("Controlled pilot constraints close public sign-up", "missing");
  }
  if (constraintText.includes("500") && constraintText.includes("submissions")) {
    pass("Controlled pilot constraints record 500-submission cap");
  } else {
    activationBlock(
      "Controlled pilot constraints record 500-submission cap",
      "missing",
    );
  }
}

function verifyPacket(packet) {
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
  if (Object.keys(sandbox).length === 0) {
    pass("Retired sandbox reference is absent");
  } else {
    block("Retired sandbox reference is absent", "remove sandboxReference");
  }

  const target = packet.productionTarget ?? {};
  requireActivationPresent(target.projectId, "Production project id is recorded");
  requireActivationPresent(target.projectUrl, "Production project URL is recorded");
  requireActivationEqual(
    target.projectId,
    SUPABASE_PRODUCTION_TARGET.projectId,
    "Production project id matches the canonical target",
  );
  requireActivationEqual(
    target.projectUrl,
    SUPABASE_PRODUCTION_TARGET.projectUrl,
    "Production project URL matches the canonical target",
  );
  requireActivationPresent(
    target.supabaseOrganization,
    "Supabase organization is recorded",
  );
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
    requireActivationTrue(
      backup.restoreEvidenceRecorded,
      "Restore evidence is recorded",
    );
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
  requireActivationTrue(
    pre.verifySupabaseReleasePassed,
    "verify:supabase-release passed",
  );
  if (controlledPilot) {
    pass("test:supabase-live is not required for controlled production pilot");
  } else {
    requireActivationTrue(pre.testSupabaseLivePassed, "test:supabase-live passed");
  }
  if (controlledPilotEvidenceConfirmed(packet, "crossRoleBrowserQaDeferred")) {
    pass(
      "test:e2e:supabase full cross-role browser workflow is deferred for controlled pilot",
    );
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
    pass(
      "Supabase Auth leaked password protection is deferred for controlled registered-agent pilot",
    );
    pass(
      "Supabase security advisor warning is accepted for controlled registered-agent pilot",
    );
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
      pass(
        "Logs and error-rate review is deferred for controlled registered-agent pilot",
      );
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
        requireSnippet(
          evidence,
          "Owner:",
          "Go / No-Go blocker evidence records owners",
        );
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

function trueBooleanPaths(value, path = []) {
  if (value === true) return [path.join(".")];
  if (!value || typeof value !== "object") return [];

  return Object.entries(value).flatMap(([key, child]) =>
    trueBooleanPaths(child, [...path, key]),
  );
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalJson(value[key])]),
  );
}

function jsonEqual(left, right) {
  return JSON.stringify(canonicalJson(left)) === JSON.stringify(canonicalJson(right));
}

function readBoundCutoverEvidence({
  artifact,
  checkedAt,
  evidenceSha256,
  label,
  scope,
}) {
  requireActivationPresent(checkedAt, `${label} timestamp is recorded`);
  requireActivationPresent(evidenceSha256, `${label} SHA-256 is recorded`);
  if (!requireActivationExistingProjectFile(artifact, `${label} exists`)) return null;

  const content = readFileSync(resolve(repoRoot, artifact), "utf8");
  const validation = validateBoundEvidence({
    content,
    expectedCheckedAt: checkedAt,
    expectedGeneration: SUPABASE_PRODUCTION_TARGET.cutoverGeneration,
    expectedProjectRef: SUPABASE_PRODUCTION_TARGET.projectId,
    expectedScope: scope,
    expectedSha256: evidenceSha256,
    expectedGitHead: currentFullGitHead(),
    expectedSourceSha256: currentReleaseSourceSha256(),
    evidenceNotBefore: SUPABASE_PRODUCTION_TARGET.evidenceNotBefore,
    maxAgeMs: SUPABASE_PRODUCTION_TARGET.maxEvidenceAgeMs,
  });
  if (validation.issues.length > 0) {
    block(
      `${label} is target-bound, fresh, and hash-verified`,
      validation.issues.join(", "),
    );
    return null;
  }
  pass(`${label} is target-bound, fresh, and hash-verified`);
  return validation.document;
}

function verifyCutoverMigrationContract(packet) {
  const generation = packet.productionTarget?.cutoverGeneration ?? "";
  const expectedOrder = requiredRemoteMigrationOrderForGeneration(generation);
  const recordedOrder = packet.migrationContract?.expectedPostApplyOrder ?? [];
  const expectedEntries = currentMigrationContractEntries();
  const expectedContractSha256 = migrationContractSha256(expectedEntries);

  if (expectedOrder.length === 0) {
    block(
      "Cutover generation has a registered remote migration contract",
      generation || "missing cutover generation",
    );
  } else {
    pass("Cutover generation has a registered remote migration contract");
  }

  if (recordedOrder.join("\n") === expectedOrder.join("\n")) {
    pass("Cutover packet records the exact clean post-apply migration order");
  } else {
    block(
      "Cutover packet records the exact clean post-apply migration order",
      "mismatch",
    );
  }
  requireActivationEqual(
    packet.migrationContract?.expectedContractSha256,
    expectedContractSha256,
    "Cutover packet records the exact Git migration contract SHA-256",
  );
  const dryRunEvidence = readBoundCutoverEvidence({
    artifact: packet.migrationContract?.dryRunEvidenceArtifact,
    checkedAt: packet.migrationContract?.dryRunCheckedAt,
    evidenceSha256: packet.migrationContract?.dryRunEvidenceSha256,
    label: "Migration dry-run evidence",
    scope: "supabase-production-migration-dry-run",
  });
  if (dryRunEvidence) {
    requireEqual(
      dryRunEvidence.checks?.migrationDryRunPassed,
      true,
      "Migration dry-run evidence proves the CLI dry-run passed",
    );
    requireEqual(
      dryRunEvidence.contractSha256,
      expectedContractSha256,
      "Migration dry-run evidence binds the exact Git migration contract",
    );
    if (jsonEqual(dryRunEvidence.expectedContract, expectedEntries)) {
      pass("Migration dry-run evidence records the exact Git migration inventory");
    } else {
      block(
        "Migration dry-run evidence records the exact Git migration inventory",
        "mismatch",
      );
    }
  }

  for (const [key, label] of [
    ["targetHistoryChecked", "Cutover target migration history was checked"],
    ["targetHistoryCompatible", "Cutover target migration history is compatible"],
    [
      "ownerApprovedExactMigrationContract",
      "Owner approved the exact cutover migration contract",
    ],
    [
      "expectedPostApplyMigrationListRecorded",
      "Expected post-apply migration list was recorded",
    ],
  ]) {
    requireActivationTrue(packet.migrationContract?.[key], label);
  }
}

function verifyCutoverPreActivation(packet) {
  const verification = packet.preActivationVerification ?? {};
  requireActivationPresent(
    verification.checkedAt,
    "Cutover pre-activation verification timestamp is recorded",
  );
  requireActivationPresent(
    verification.gitHead,
    "Cutover pre-activation verification Git SHA is recorded",
  );
  requireActivationPresent(
    verification.sourceSha256,
    "Cutover pre-activation source SHA-256 is recorded",
  );
  requireActivationEqual(
    verification.gitHead,
    currentFullGitHead(),
    "Cutover pre-activation verification Git SHA matches this checkout",
  );
  requireActivationEqual(
    verification.sourceSha256,
    currentReleaseSourceSha256(),
    "Cutover pre-activation source SHA-256 matches current Git HEAD",
  );
  requireActivationEqual(
    gitOutput(["status", "--porcelain"], "Current Git status is readable").trim(),
    "",
    "Cutover pre-activation checkout is clean",
  );
  requireActivationPresent(
    verification.verificationScope,
    "Cutover pre-activation verification scope is recorded",
  );
  for (const [key, label] of [
    ["typecheckPassed", "Typecheck passed"],
    ["lintPassed", "Lint passed"],
    ["fullTestSuitePassed", "Full test suite passed"],
    ["buildPassed", "Production build passed"],
    ["verifyAuthDataReadinessPassed", "Auth/data readiness verification passed"],
    ["verifySupabaseReleasePassed", "Supabase release verification passed"],
    ["finalDiffReviewed", "Final cutover diff was reviewed"],
  ]) {
    requireActivationTrue(verification[key], label);
  }
}

function verifyCutoverOwnerApproval(packet) {
  const issues = [];
  verifyDetachedOwnerApproval({
    action: "",
    approval: packet.ownerApproval ?? {},
    evidenceRootSha256: cutoverEvidenceRootSha256(packet),
    gitHead: currentFullGitHead(),
    issues,
    repoRoot,
    sourceSha256: currentReleaseSourceSha256(),
  });
  if (issues.length > 0) {
    activationBlock(
      "Authenticated owner approval is cryptographically verified",
      issues.join(", "),
    );
  } else {
    pass("Authenticated owner approval is cryptographically verified");
  }
}

function verifyExternalEvidenceImport(packet) {
  const issues = validateExternalEvidenceImportReceipt({ packet, repoRoot });
  if (issues.length > 0) {
    activationBlock(
      "External role-isolation and Edge evidence import is verified",
      issues.join(", "),
    );
  } else {
    pass("External role-isolation and Edge evidence import is verified");
  }
}

function verifyCutoverFinalDataState(packet) {
  const finalState = packet.finalDataState ?? {};
  requireActivationTrue(
    finalState.checked,
    "Clean cutover final data state was checked",
  );
  requireActivationPresent(
    finalState.checkedAt,
    "Clean cutover final data state timestamp is recorded",
  );

  for (const [key, expected] of Object.entries(
    SUPABASE_PRODUCTION_TARGET.requiredCleanDataState,
  )) {
    requireActivationEqual(
      finalState[key],
      expected,
      `Clean cutover final ${key} equals ${expected}`,
    );
  }

  const evidence = readBoundCutoverEvidence({
    artifact: finalState.evidenceArtifact,
    checkedAt: finalState.checkedAt,
    evidenceSha256: finalState.evidenceSha256,
    label: "Clean cutover final data-state evidence",
    scope: "supabase-clean-cutover-final-data-state",
  });
  if (!evidence) return;

  const expected = {
    ...SUPABASE_PRODUCTION_TARGET.requiredCleanDataState,
    emptyPublicTables: SUPABASE_PRODUCTION_TARGET.requiredEmptyPublicTables,
    publicTables: [
      "profiles",
      ...SUPABASE_PRODUCTION_TARGET.requiredEmptyPublicTables,
    ].sort(),
    emptyStorageBuckets: SUPABASE_PRODUCTION_TARGET.requiredStorageBuckets,
    unexpectedStorageBucketCount: 0,
  };
  if (jsonEqual(evidence.expected, expected)) {
    pass("Clean cutover evidence records the exact empty-data contract");
  } else {
    block("Clean cutover evidence records the exact empty-data contract", "mismatch");
  }
  for (const [key, expectedValue] of Object.entries(
    SUPABASE_PRODUCTION_TARGET.requiredCleanDataState,
  )) {
    requireEqual(
      evidence.observed?.[key],
      expectedValue,
      `Clean cutover evidence observed ${key} equals ${expectedValue}`,
    );
    requireEqual(
      finalState[key],
      evidence.observed?.[key],
      `Clean cutover packet ${key} matches bound evidence`,
    );
  }
  for (const table of SUPABASE_PRODUCTION_TARGET.requiredEmptyPublicTables) {
    requireEqual(
      evidence.observed?.emptyPublicTableRowCounts?.[table],
      0,
      `Clean cutover public.${table} is empty`,
    );
  }
  if (jsonEqual(evidence.observed?.publicTables, expected.publicTables)) {
    pass("Clean cutover has the exact canonical public table inventory");
  } else {
    block("Clean cutover has the exact canonical public table inventory", "mismatch");
  }
  for (const bucket of SUPABASE_PRODUCTION_TARGET.requiredStorageBuckets) {
    requireEqual(
      evidence.observed?.storageBucketObjectCounts?.[bucket],
      0,
      `Clean cutover Storage bucket ${bucket} is empty`,
    );
  }
  requireEqual(
    evidence.observed?.unexpectedStorageBucketCount,
    0,
    "Clean cutover has no unexpected Storage buckets",
  );
}

function verifyCutoverEdgeFunctions(packet) {
  const functions = packet.edgeFunctions ?? {};
  const expected = [...SUPABASE_PRODUCTION_TARGET.requiredEdgeFunctions];
  const recorded = Array.isArray(functions.expected) ? functions.expected : [];

  if (recorded.join("\n") === expected.join("\n")) {
    pass("Cutover packet records the exact required Edge Functions");
  } else {
    block("Cutover packet records the exact required Edge Functions", "mismatch");
  }

  requireActivationTrue(
    functions.localContractChecked,
    "Required Edge Function local contract was checked",
  );
  requireActivationTrue(
    functions.remoteListChecked,
    "Required Edge Function remote list was checked",
  );
  requireActivationTrue(functions.deployed, "Required Edge Functions are deployed");
  requireActivationTrue(
    functions.dryRunsPassed,
    "Required Edge Function dry-runs passed",
  );
  requireActivationTrue(
    functions.semanticChecksPassed,
    "Required Edge Function semantic handler checks passed",
  );
  requireActivationTrue(
    functions.sourceIdentityBound,
    "Required Edge Function deployed source identity is bound",
  );
  const evidence = readBoundCutoverEvidence({
    artifact: functions.evidenceArtifact,
    checkedAt: functions.checkedAt,
    evidenceSha256: functions.evidenceSha256,
    label: "Required Edge Function evidence",
    scope: "supabase-production-edge-functions",
  });
  if (!evidence) return;

  for (const key of [
    "localContractChecked",
    "remoteListChecked",
    "deployed",
    "dryRunsPassed",
    "semanticChecksPassed",
    "sourceIdentityBound",
  ]) {
    requireEqual(evidence[key], true, `Edge Function evidence ${key} is true`);
    requireEqual(
      functions[key],
      evidence[key],
      `Edge Function packet ${key} matches evidence`,
    );
  }
  if (jsonEqual(evidence.expectedFunctions, [...expected].sort())) {
    pass("Edge Function evidence records the exact required function list");
  } else {
    block(
      "Edge Function evidence records the exact required function list",
      "mismatch",
    );
  }
  if (jsonEqual(evidence.observedFunctions, [...expected].sort())) {
    pass("Edge Function evidence observed the exact required function list");
  } else {
    block(
      "Edge Function evidence observed the exact required function list",
      "mismatch",
    );
  }
  if (jsonEqual(evidence.missingSecretNames, [])) {
    pass("Edge Function evidence observed no missing required secrets");
  } else {
    block("Edge Function evidence observed no missing required secrets", "mismatch");
  }
  if (jsonEqual(evidence.localFunctionSourceSha256, currentFunctionSourceSha256())) {
    pass("Edge Function evidence binds every local function source digest");
  } else {
    block(
      "Edge Function evidence binds every local function source digest",
      "mismatch",
    );
  }
  if (jsonEqual(evidence.observedFunctionSourceSha256, currentFunctionSourceSha256())) {
    pass("Edge Function evidence binds every observed deployed source digest");
  } else {
    block(
      "Edge Function evidence binds every observed deployed source digest",
      "mismatch",
    );
  }
  const deploymentIdentities = Array.isArray(evidence.deploymentIdentities)
    ? evidence.deploymentIdentities
    : [];
  const semanticReceipts = Array.isArray(evidence.semanticReceipts)
    ? evidence.semanticReceipts
    : [];
  for (const functionName of expected) {
    const expectedSourceSha256 = currentFunctionSourceSha256()[functionName];
    const deployment = deploymentIdentities.find(
      (entry) => entry?.function === functionName,
    );
    if (
      present(deployment?.deploymentId) &&
      present(deployment?.version) &&
      deployment?.observedSourceSha256 === expectedSourceSha256
    ) {
      pass(`Edge Function ${functionName} deployment identity binds source/version`);
    } else {
      block(
        `Edge Function ${functionName} deployment identity binds source/version`,
        "missing or mismatch",
      );
    }
    const semanticReceipt = semanticReceipts.find(
      (entry) => entry?.function === functionName,
    );
    const expectedAction =
      SUPABASE_PRODUCTION_TARGET.requiredEdgeFunctionSemanticActions[functionName];
    if (
      semanticReceipt?.passed === true &&
      semanticReceipt?.action === expectedAction &&
      /^[A-Za-z0-9_-]{16,}$/.test(semanticReceipt?.requestNonce ?? "") &&
      semanticReceipt?.responseNonce === semanticReceipt?.requestNonce &&
      /^[a-f0-9]{64}$/.test(semanticReceipt?.canonicalReadbackSha256 ?? "")
    ) {
      pass(`Edge Function ${functionName} has nonce-bound semantic readback proof`);
    } else {
      block(
        `Edge Function ${functionName} has nonce-bound semantic readback proof`,
        "missing or invalid",
      );
    }
  }
  if (
    jsonEqual(evidence.requiredSecretNames, [
      ...SUPABASE_PRODUCTION_TARGET.requiredEdgeFunctionSecretNames,
    ])
  ) {
    pass("Edge Function evidence records the complete required secret contract");
  } else {
    block(
      "Edge Function evidence records the complete required secret contract",
      "mismatch",
    );
  }
  const runtimeChecks = Array.isArray(evidence.runtimeChecks)
    ? evidence.runtimeChecks
    : [];
  if (
    jsonEqual(
      runtimeChecks.map((entry) => entry?.function).sort(),
      [...expected].sort(),
    )
  ) {
    pass("Edge Function evidence contains one runtime check per required function");
  } else {
    block(
      "Edge Function evidence contains one runtime check per required function",
      "mismatch",
    );
  }
  for (const functionName of expected) {
    const runtimeCheck = runtimeChecks.find(
      (entry) => entry?.function === functionName,
    );
    const expectedCapability =
      SUPABASE_PRODUCTION_TARGET.requiredEdgeFunctionCapabilities[functionName];
    if (
      runtimeCheck?.passed === true &&
      runtimeCheck.statusCode === 200 &&
      runtimeCheck.capability === expectedCapability
    ) {
      pass(
        `Edge Function ${functionName} passed a target-bound runtime health invocation`,
      );
    } else {
      block(
        `Edge Function ${functionName} passed a target-bound runtime health invocation`,
        "missing, failed, or capability mismatch",
      );
    }
  }
}

function verifyCutoverProductionEvidence(packet) {
  const production = packet.productionEvidence ?? {};
  const validatedArtifacts = new Map();
  for (const key of SUPABASE_PRODUCTION_TARGET.requiredAdminOnlyProductionEvidence) {
    requireActivationTrue(
      production[key],
      `Production role-isolation evidence ${key} is true`,
    );
  }

  const evidence = readBoundCutoverEvidence({
    artifact: production.evidenceManifest,
    checkedAt: production.checkedAt,
    evidenceSha256: production.evidenceManifestSha256,
    label: "Production role-isolation evidence manifest",
    scope: "supabase-production-role-isolation-runtime",
  });
  if (!evidence) return;

  requireEqual(
    evidence.deployedGitSha,
    production.deployedGitSha,
    "Production evidence deployed Git SHA matches the packet",
  );
  requirePresent(
    evidence.deployedGitSha,
    "Production evidence records deployed Git SHA",
  );
  requireEqual(
    production.deployedGitSha,
    packet.preActivationVerification?.gitHead,
    "Deployed Git SHA matches the pre-activation verified Git SHA",
  );
  for (const key of SUPABASE_PRODUCTION_TARGET.requiredAdminOnlyProductionEvidence) {
    requireEqual(
      evidence.checks?.[key],
      true,
      `Production evidence manifest ${key} is true`,
    );
    requireEqual(
      production[key],
      evidence.checks?.[key],
      `Production packet ${key} matches bound evidence`,
    );
  }
  for (const [label, contract] of Object.entries(
    SUPABASE_PRODUCTION_TARGET.requiredAdminOnlyEvidenceArtifacts,
  )) {
    const artifact = evidence.artifacts?.[label];
    if (
      !present(artifact?.path) ||
      !present(artifact?.sha256) ||
      !present(artifact?.checkedAt)
    ) {
      block(`Production evidence artifact ${label} is recorded`, "missing");
      continue;
    }
    const artifactPath = resolve(dirname(production.evidenceManifest), artifact.path);
    if (!existsSync(artifactPath)) {
      block(
        `Production evidence artifact ${label} exists`,
        `${artifact.path} is missing`,
      );
      continue;
    }
    const artifactContent = readFileSync(artifactPath, "utf8");
    const validation = validateBoundEvidence({
      content: artifactContent,
      expectedCheckedAt: artifact.checkedAt,
      expectedGeneration: SUPABASE_PRODUCTION_TARGET.cutoverGeneration,
      expectedProjectRef: SUPABASE_PRODUCTION_TARGET.projectId,
      expectedScope: contract.scope,
      expectedSha256: artifact.sha256,
      expectedGitHead: packet.preActivationVerification?.gitHead ?? "",
      expectedSourceSha256: currentReleaseSourceSha256(),
      evidenceNotBefore: SUPABASE_PRODUCTION_TARGET.evidenceNotBefore,
      maxAgeMs: SUPABASE_PRODUCTION_TARGET.maxEvidenceAgeMs,
    });
    if (validation.issues.length > 0) {
      block(
        `Production evidence artifact ${label} is target-bound and hash-verified`,
        validation.issues.join(", "),
      );
      continue;
    }
    pass(`Production evidence artifact ${label} is target-bound and hash-verified`);
    validatedArtifacts.set(label, validation.document);
    for (const check of contract.checks) {
      requireEqual(
        validation.document?.checks?.[check],
        true,
        `Production evidence artifact ${label} proves ${check}`,
      );
      const packetValue =
        check in production
          ? production[check]
          : packet.preActivationVerification?.[check];
      requireEqual(
        packetValue,
        validation.document?.checks?.[check],
        `Production packet ${check} matches component evidence`,
      );
    }
    if (label === "remoteMigrationHistory") {
      const expectedOrder = requiredRemoteMigrationOrderForGeneration(
        SUPABASE_PRODUCTION_TARGET.cutoverGeneration,
      );
      const expectedEntries = currentMigrationContractEntries();
      const expectedContractSha256 = migrationContractSha256(expectedEntries);
      if (
        jsonEqual(validation.document?.expectedOrder, expectedOrder) &&
        jsonEqual(validation.document?.observedOrder, expectedOrder) &&
        jsonEqual(validation.document?.expectedContract, expectedEntries) &&
        jsonEqual(validation.document?.observedContract, expectedEntries) &&
        validation.document?.contractSha256 === expectedContractSha256
      ) {
        pass(
          "Remote migration evidence records the exact expected order and SQL hashes",
        );
      } else {
        block(
          "Remote migration evidence records the exact expected order and SQL hashes",
          "mismatch",
        );
      }
    }
    if (label === "deploymentIdentity") {
      requireEqual(
        validation.document?.canonicalHost,
        SUPABASE_PRODUCTION_TARGET.canonicalApplicationHost,
        "Deployment identity proves the canonical production host",
      );
      if (/^dpl_[A-Za-z0-9]+$/.test(validation.document?.deploymentId ?? "")) {
        pass("Deployment identity records a concrete Vercel deployment ID");
      } else {
        block("Deployment identity records a concrete Vercel deployment ID", "invalid");
      }
      requireEqual(
        validation.document?.expectedGitSha,
        packet.preActivationVerification?.gitHead,
        "Deployment identity expected Git SHA matches pre-activation Git SHA",
      );
      requireEqual(
        validation.document?.observedGitSha,
        packet.preActivationVerification?.gitHead,
        "Deployment identity observed Git SHA matches pre-activation Git SHA",
      );
      requireEqual(
        validation.document?.observedDirty,
        false,
        "Deployment identity proves a clean production build",
      );
      requireEqual(
        validation.document?.observedSourceSha256,
        validation.document?.expectedSourceSha256,
        "Deployment identity source digest matches the committed checkout",
      );
      requireEqual(
        validation.document?.expectedSourceSha256,
        currentReleaseSourceSha256(),
        "Deployment identity expected source digest matches current Git HEAD",
      );
      requireEqual(
        validation.document?.observedSourceSha256,
        currentReleaseSourceSha256(),
        "Deployment identity observed source digest matches current Git HEAD",
      );
    }
  }

  const finalStateCheckedAt = Date.parse(packet.finalDataState?.checkedAt ?? "");
  for (const label of validatedArtifacts.keys()) {
    const receiptCheckedAt = Date.parse(validatedArtifacts.get(label)?.checkedAt ?? "");
    if (
      Number.isFinite(finalStateCheckedAt) &&
      Number.isFinite(receiptCheckedAt) &&
      finalStateCheckedAt >= receiptCheckedAt
    ) {
      pass(`Final clean data-state readback follows ${label}`);
    } else {
      block(`Final clean data-state readback follows ${label}`, "timestamp order");
    }
  }
  for (const [label, checkedAt] of [
    ["production evidence manifest", production.checkedAt],
    ["Edge semantic/source evidence", packet.edgeFunctions?.checkedAt],
  ]) {
    const receiptCheckedAt = Date.parse(checkedAt ?? "");
    if (
      Number.isFinite(finalStateCheckedAt) &&
      Number.isFinite(receiptCheckedAt) &&
      finalStateCheckedAt >= receiptCheckedAt
    ) {
      pass(`Final clean data-state readback follows ${label}`);
    } else {
      block(`Final clean data-state readback follows ${label}`, "timestamp order");
    }
  }

  const deploymentReceipt = validatedArtifacts.get("deploymentIdentity");
  for (const [label, role] of [
    ["adminBrowserFlow", "Admin"],
    ["agentBrowserFlow", "Agent"],
  ]) {
    const browserReceipt = validatedArtifacts.get(label);
    for (const [field, expected] of [
      ["canonicalHost", deploymentReceipt?.canonicalHost],
      ["deploymentId", deploymentReceipt?.deploymentId],
      ["observedGitSha", packet.preActivationVerification?.gitHead],
    ]) {
      requireEqual(
        browserReceipt?.[field],
        expected,
        `${role} browser proof ${field} matches the verified deployment`,
      );
    }
  }
}

function verifyCutoverPacket(packet) {
  const allowedTopLevelKeys = new Set([
    "schemaVersion",
    "scope",
    "status",
    "phase",
    "recordedAt",
    "runId",
    "productionTarget",
    "migrationContract",
    "preActivationVerification",
    "ownerApproval",
    "productionEvidence",
    "finalDataState",
    "edgeFunctions",
    "externalEvidenceImport",
    "deploymentGate",
    "goNoGo",
    "trackedReadinessSha256",
  ]);
  const unexpectedTopLevelKeys = Object.keys(packet).filter(
    (key) => !allowedTopLevelKeys.has(key),
  );
  if (unexpectedTopLevelKeys.length > 0) {
    block(
      "Cutover readiness contains no legacy or unknown top-level evidence",
      unexpectedTopLevelKeys.join(", "),
    );
  } else {
    pass("Cutover readiness contains no legacy or unknown top-level evidence");
  }
  requireEqual(packet.schemaVersion, 3, "Cutover readiness packet schema is v3");
  requireEqual(
    packet.scope,
    "supabase-production-cutover",
    "Cutover readiness packet scope is locked",
  );
  const phaseContract = cutoverPhaseContract(packet.phase);
  if (!phaseContract) {
    block("Cutover readiness phase is recognized", packet.phase ?? "missing");
    return;
  }
  pass("Cutover readiness phase is recognized");
  requireEqual(packet.status, phaseContract.status, "Cutover status matches its phase");
  requireEqual(
    packet.goNoGo?.decision,
    phaseContract.decision,
    "Cutover decision matches its phase",
  );
  requireEqual(
    packet.productionTarget?.descriptorPath,
    "config/supabase-production-target.mjs",
    "Cutover target descriptor path is canonical",
  );
  requireEqual(
    packet.productionTarget?.projectId,
    SUPABASE_PRODUCTION_TARGET.projectId,
    "Cutover project id matches the canonical target",
  );
  requireEqual(
    packet.productionTarget?.projectUrl,
    SUPABASE_PRODUCTION_TARGET.projectUrl,
    "Cutover project URL matches the canonical target",
  );
  requireEqual(
    packet.productionTarget?.cutoverGeneration,
    SUPABASE_PRODUCTION_TARGET.cutoverGeneration,
    "Cutover generation matches the canonical target",
  );
  verifyCutoverMigrationContract(packet);
  verifyCutoverPreActivation(packet);
  if (packet.phase === "approved") {
    verifyExternalEvidenceImport(packet);
    verifyCutoverOwnerApproval(packet);
  }
  verifyCutoverFinalDataState(packet);
  verifyCutoverEdgeFunctions(packet);
  verifyCutoverProductionEvidence(packet);

  for (const [key, label] of [
    ["deployApproved", "Cutover deploy approval"],
    ["cutoverApproved", "Cutover approval"],
    ["productionMutationApproved", "Cutover production mutation approval"],
  ]) {
    requireEqual(
      packet.deploymentGate?.[key],
      phaseContract.approvalsRequired,
      `${label} matches the cutover phase`,
    );
  }

  if (!phaseContract.evidenceComplete) {
    const evidenceSections = {
      edgeFunctions: packet.edgeFunctions,
      finalDataState: packet.finalDataState,
      preActivationVerification: packet.preActivationVerification,
      productionEvidence: packet.productionEvidence,
    };
    const unexpectedTruePaths = trueBooleanPaths(evidenceSections);
    if (unexpectedTruePaths.length === 0) {
      pass("Awaiting cutover phase contains no inherited true evidence");
    } else {
      block(
        "Awaiting cutover phase contains no inherited true evidence",
        unexpectedTruePaths.join(", "),
      );
    }
  }

  if (packet.phase === "awaiting-fresh-evidence") {
    activationBlock(
      "Fresh Supabase cutover evidence is required",
      `${SUPABASE_PRODUCTION_TARGET.projectId} has not completed live verification`,
    );
  } else if (packet.phase === "evidence-complete") {
    activationBlock("Explicit owner activation approval is required", "not approved");
  }
}

const rawReadiness = readText(readinessPath, "Production readiness packet exists");
let trackedReadiness = {};
if (rawReadiness) {
  try {
    trackedReadiness = JSON.parse(rawReadiness);
  } catch (error) {
    block("Production readiness packet is valid JSON", error.message);
  }
}

let readiness = trackedReadiness;
if (process.env.SUPABASE_PRODUCTION_APPROVAL_PACKET_PATH?.trim()) {
  try {
    const approvalPath = productionApprovalPacketPath(repoRoot);
    const rawApproval = readFileSync(approvalPath, "utf8");
    const approvalPacket = JSON.parse(rawApproval);
    const bindingIssues = validateExternalApprovalPacketBinding({
      approvalPacket,
      trackedContent: rawReadiness,
      trackedPacket: trackedReadiness,
    });
    if (bindingIssues.length > 0) {
      block(
        "External approval packet binds the tracked evidence root",
        bindingIssues.join(", "),
      );
    } else {
      pass("External approval packet binds the tracked evidence root");
    }
    requireEqual(
      approvalPacket.trackedReadinessSha256,
      sha256Evidence(rawReadiness),
      "External approval packet records the tracked readiness SHA-256",
    );
    readiness = approvalPacket;
  } catch (error) {
    block("External production approval packet is readable", error.message);
  }
} else if (trackedReadiness.phase === "approved") {
  block(
    "Approved cutover uses an external immutable approval packet",
    "SUPABASE_PRODUCTION_APPROVAL_PACKET_PATH is missing",
  );
}

verifyPackageScript();
verifyNoCommittedSecrets(rawReadiness);
if (readiness.scope === "supabase-production-cutover") {
  verifyCutoverPacket(readiness);
} else {
  verifyMigrationOrder(readiness);
  verifyPacket(readiness);
  verifyAgentInteractionProductionEvidence();
}

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

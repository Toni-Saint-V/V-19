import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { SUPABASE_PRODUCTION_TARGET } from "../config/supabase-production-target.mjs";
import {
  migrationContractEntriesFromFileSystem,
  migrationContractSha256,
  requiredRemoteMigrationOrderForGeneration,
} from "./supabase-migration-contract.mjs";
import { testArtifactPath } from "./lib/artifact-paths.mjs";
import {
  releaseSourceSha256FromFileSystem,
  releaseSourceSha256FromGitHead,
} from "./lib/release-source-identity.mjs";
import {
  assertProductionMutationAllowed,
  productionApprovalPacketPath,
} from "./lib/supabase-production-mutation-gate.mjs";

const repoRoot = process.cwd();
const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const apply = args.has("--apply");
const gitHead = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: repoRoot,
  encoding: "utf8",
}).trim();
const sourceSha256 = releaseSourceSha256FromFileSystem(repoRoot);
const gitSourceSha256 = releaseSourceSha256FromGitHead(repoRoot);
const migrationContract = migrationContractEntriesFromFileSystem(repoRoot);
const contractSha256 = migrationContractSha256(migrationContract);
const expectedOrder = requiredRemoteMigrationOrderForGeneration(
  SUPABASE_PRODUCTION_TARGET.cutoverGeneration,
);

if (Number(dryRun) + Number(apply) !== 1) {
  fail("Use exactly one mode: --dry-run or --apply.");
}

if (apply) {
  try {
    assertProductionMutationAllowed({
      action: "migration-apply",
      repoRoot,
      readinessPath: productionApprovalPacketPath(repoRoot),
    });
  } catch (error) {
    fail(error.message);
  }
  const expected = `${SUPABASE_PRODUCTION_TARGET.projectId}:${SUPABASE_PRODUCTION_TARGET.cutoverGeneration}`;
  if (process.env.SUPABASE_PRODUCTION_MIGRATION_CONFIRMATION !== expected) {
    fail(
      `Migration apply refused. Set SUPABASE_PRODUCTION_MIGRATION_CONFIRMATION=${expected} for this exact target.`,
    );
  }
  fail(
    "Migration apply is disabled until post-success immutable remote-history reconciliation is implemented.",
  );
}

runSupabase(["link", "--project-ref", SUPABASE_PRODUCTION_TARGET.projectId]);
const linkedProjectRefPath = resolve(repoRoot, "supabase/.temp/project-ref");
const linkedProjectRef = existsSync(linkedProjectRefPath)
  ? readFileSync(linkedProjectRefPath, "utf8").trim()
  : "";
if (linkedProjectRef !== SUPABASE_PRODUCTION_TARGET.projectId) {
  fail("Supabase CLI link does not match the canonical production project.");
}

runSupabase(["db", "push", "--linked", ...(dryRun ? ["--dry-run"] : [])]);
const checkedAt = new Date().toISOString();
const evidence = {
  schemaVersion: 1,
  scope: dryRun
    ? "supabase-production-migration-dry-run"
    : "supabase-production-remote-migration-history",
  status: dryRun ? "PASS" : "BLOCKED",
  checkedAt,
  projectRef: SUPABASE_PRODUCTION_TARGET.projectId,
  cutoverGeneration: SUPABASE_PRODUCTION_TARGET.cutoverGeneration,
  gitHead,
  sourceSha256,
  gitSourceSha256,
  expectedOrder,
  observedOrder: [],
  expectedContract: migrationContract,
  observedContract: [],
  contractSha256,
  checks: {
    migrationsApplied: apply,
    remoteMigrationHistoryReadbackPassed: false,
    migrationDryRunPassed: dryRun,
  },
};
const evidencePath = testArtifactPath(
  dryRun
    ? "supabase-production-migration-dry-run.json"
    : "supabase-production-remote-migration-history.json",
);
writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(`Migration evidence: ${evidencePath}`);
if (apply) {
  fail(
    "Migration apply completed but automatic immutable remote SQL-hash readback is unavailable; production remains NO_GO.",
  );
}
console.log(
  `PASS ${dryRun ? "Migration dry-run" : "Migrations applied"} against canonical project ${SUPABASE_PRODUCTION_TARGET.projectId}.`,
);

function runSupabase(commandArgs) {
  const result = spawnSync("npx", ["supabase", ...commandArgs], {
    cwd: repoRoot,
    env: process.env,
    encoding: "utf8",
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    const linkedProjectRefPath = resolve(repoRoot, "supabase/.temp/project-ref");
    const failureLinkedProjectRef = existsSync(linkedProjectRefPath)
      ? readFileSync(linkedProjectRefPath, "utf8").trim()
      : "";
    const history =
      failureLinkedProjectRef === SUPABASE_PRODUCTION_TARGET.projectId
        ? spawnSync("npx", ["supabase", "migration", "list", "--linked"], {
            cwd: repoRoot,
            env: process.env,
            encoding: "utf8",
          })
        : { status: null, stderr: "", stdout: "" };
    const failureEvidence = {
      schemaVersion: 1,
      scope: "supabase-production-migration-failure-readback",
      status: "BLOCKED",
      checkedAt: new Date().toISOString(),
      projectRef: SUPABASE_PRODUCTION_TARGET.projectId,
      cutoverGeneration: SUPABASE_PRODUCTION_TARGET.cutoverGeneration,
      gitHead,
      sourceSha256,
      expectedOrder,
      expectedContract: migrationContract,
      contractSha256,
      failedCommand: ["supabase", ...commandArgs],
      commandExitCode: result.status,
      linkedProjectRef: failureLinkedProjectRef,
      remoteHistoryReadbackAttempted:
        failureLinkedProjectRef === SUPABASE_PRODUCTION_TARGET.projectId,
      remoteHistoryReadbackExitCode: history.status,
      remoteHistoryStdout: history.stdout ?? "",
      remoteHistoryStderr: history.stderr ?? "",
      retryAllowed: false,
    };
    const failurePath = testArtifactPath(
      "supabase-production-migration-failure-readback.json",
    );
    writeFileSync(failurePath, `${JSON.stringify(failureEvidence, null, 2)}\n`);
    fail(`Supabase CLI command failed; failure readback: ${failurePath}`);
  }
}

function fail(message) {
  console.error(`BLOCKED ${message}`);
  process.exit(1);
}

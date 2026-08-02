import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

import { SUPABASE_PRODUCTION_TARGET } from "../../config/supabase-production-target.mjs";
import { sha256Evidence } from "../../scripts/lib/supabase-cutover-evidence.mjs";
import { releaseSourceSha256FromGitHead } from "../../scripts/lib/release-source-identity.mjs";
import { requiredRemoteMigrationOrderForGeneration } from "../../scripts/supabase-migration-contract.mjs";
import {
  migrationContractEntriesFromFileSystem,
  migrationContractSha256,
} from "../../scripts/supabase-migration-contract.mjs";

const repoRoot = process.cwd();
const verifierPath = resolve(repoRoot, "scripts/verify-production-readiness.mjs");

function writeJson(path: string, value: unknown): string {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  writeFileSync(path, content);
  return content;
}

function approvedFixture() {
  const root = mkdtempSync(resolve(tmpdir(), "v19-cutover-readiness-"));
  mkdirSync(resolve(root, "docs/release"), { recursive: true });
  cpSync(resolve(repoRoot, "supabase/migrations"), resolve(root, "supabase/migrations"), {
    recursive: true,
  });
  writeJson(resolve(root, "package.json"), {
    scripts: {
      "verify:production-readiness": "node scripts/verify-production-readiness.mjs",
    },
  });
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "package.json", "supabase/migrations"], { cwd: root });
  execFileSync(
    "git",
    [
      "-c",
      "user.name=V19 Test",
      "-c",
      "user.email=v19@example.invalid",
      "commit",
      "-qm",
      "fixture",
    ],
    { cwd: root },
  );
  const gitHead = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  const sourceSha256 = releaseSourceSha256FromGitHead(root);
  const migrationContract = migrationContractEntriesFromFileSystem(repoRoot);
  const migrationContractDigest = migrationContractSha256(migrationContract);

  const checkedAt = new Date().toISOString();
  const artifactPaths = Object.fromEntries(
    Object.entries(SUPABASE_PRODUCTION_TARGET.requiredAdminOnlyEvidenceArtifacts).map(
      ([label, contract]) => {
        const path = resolve(root, `${label}.json`);
        const componentEvidence = {
          schemaVersion: 1,
          scope: contract.scope,
          status: "PASS",
          checkedAt,
          projectRef: SUPABASE_PRODUCTION_TARGET.projectId,
          cutoverGeneration: SUPABASE_PRODUCTION_TARGET.cutoverGeneration,
          gitHead,
          sourceSha256,
          checks: Object.fromEntries(contract.checks.map((check) => [check, true])),
          ...(label === "remoteMigrationHistory"
            ? {
                expectedOrder: requiredRemoteMigrationOrderForGeneration(
                  SUPABASE_PRODUCTION_TARGET.cutoverGeneration,
                ),
                observedOrder: requiredRemoteMigrationOrderForGeneration(
                  SUPABASE_PRODUCTION_TARGET.cutoverGeneration,
                ),
                expectedContract: migrationContract,
                observedContract: migrationContract,
                contractSha256: migrationContractDigest,
              }
            : {}),
          ...(label === "deploymentIdentity"
            ? {
                canonicalHost: "document-intake-system.vercel.app",
                deploymentId: "dpl_test",
                expectedGitSha: gitHead,
                expectedSourceSha256: sourceSha256,
                observedGitSha: gitHead,
                observedSourceSha256: sourceSha256,
                observedDirty: false,
              }
            : {}),
          ...(["adminBrowserFlow", "agentBrowserFlow"].includes(label)
            ? {
                canonicalHost: "document-intake-system.vercel.app",
                deploymentId: "dpl_test",
                observedGitSha: gitHead,
              }
            : {}),
        };
        const content = writeJson(path, componentEvidence);
        return [label, { checkedAt, path, sha256: sha256Evidence(content) }];
      },
    ),
  );
  const manifest = {
    schemaVersion: 1,
    scope: "supabase-production-role-isolation-runtime",
    status: "PASS",
    checkedAt,
    projectRef: SUPABASE_PRODUCTION_TARGET.projectId,
    cutoverGeneration: SUPABASE_PRODUCTION_TARGET.cutoverGeneration,
    gitHead,
    sourceSha256,
    deployedGitSha: gitHead,
    checks: Object.fromEntries(
      SUPABASE_PRODUCTION_TARGET.requiredAdminOnlyProductionEvidence.map((key) => [
        key,
        true,
      ]),
    ),
    artifacts: artifactPaths,
  };
  const manifestPath = resolve(root, "runtime-manifest.json");
  const manifestContent = writeJson(manifestPath, manifest);

  const emptyPublicTableRowCounts = Object.fromEntries(
    SUPABASE_PRODUCTION_TARGET.requiredEmptyPublicTables.map((table) => [table, 0]),
  );
  const storageBucketObjectCounts = Object.fromEntries(
    SUPABASE_PRODUCTION_TARGET.requiredStorageBuckets.map((bucket) => [bucket, 0]),
  );
  const finalStateEvidence = {
    schemaVersion: 1,
    scope: "supabase-clean-cutover-final-data-state",
    status: "PASS",
    checkedAt,
    projectRef: SUPABASE_PRODUCTION_TARGET.projectId,
    cutoverGeneration: SUPABASE_PRODUCTION_TARGET.cutoverGeneration,
    gitHead,
    sourceSha256,
    expected: {
      ...SUPABASE_PRODUCTION_TARGET.requiredCleanDataState,
      emptyPublicTables: SUPABASE_PRODUCTION_TARGET.requiredEmptyPublicTables,
      publicTables: [
        "profiles",
        ...SUPABASE_PRODUCTION_TARGET.requiredEmptyPublicTables,
      ].sort(),
      emptyStorageBuckets: SUPABASE_PRODUCTION_TARGET.requiredStorageBuckets,
      unexpectedStorageBucketCount: 0,
    },
    observed: {
      ...SUPABASE_PRODUCTION_TARGET.requiredCleanDataState,
      emptyPublicTableRowCounts,
      publicTables: [
        "profiles",
        ...SUPABASE_PRODUCTION_TARGET.requiredEmptyPublicTables,
      ].sort(),
      storageBucketObjectCounts,
      unexpectedStorageBucketCount: 0,
    },
  };
  const finalStatePath = resolve(root, "final-state.json");
  const finalStateContent = writeJson(finalStatePath, finalStateEvidence);

  const expectedFunctions = [
    ...SUPABASE_PRODUCTION_TARGET.requiredEdgeFunctions,
  ].sort();
  const edgeEvidence = {
    schemaVersion: 1,
    scope: "supabase-production-edge-functions",
    status: "PASS",
    checkedAt,
    projectRef: SUPABASE_PRODUCTION_TARGET.projectId,
    cutoverGeneration: SUPABASE_PRODUCTION_TARGET.cutoverGeneration,
    gitHead,
    sourceSha256,
    expectedFunctions,
    observedFunctions: expectedFunctions,
    requiredSecretNames: SUPABASE_PRODUCTION_TARGET.requiredEdgeFunctionSecretNames,
    missingSecretNames: [],
    localContractChecked: true,
    remoteListChecked: true,
    deployed: true,
    dryRunsPassed: true,
    semanticChecksPassed: true,
    sourceIdentityBound: true,
    localFunctionSourceSha256: Object.fromEntries(
      expectedFunctions.map((name) => [name, "e".repeat(64)]),
    ),
    runtimeChecks: expectedFunctions.map((name) => ({
      capability: SUPABASE_PRODUCTION_TARGET.requiredEdgeFunctionCapabilities[name],
      function: name,
      passed: true,
      statusCode: 200,
    })),
  };
  const edgePath = resolve(root, "edge-functions.json");
  const edgeContent = writeJson(edgePath, edgeEvidence);

  const approvedPacket = {
    schemaVersion: 3,
    scope: "supabase-production-cutover",
    status: "GO",
    phase: "approved",
    productionTarget: {
      descriptorPath: "config/supabase-production-target.mjs",
      projectId: SUPABASE_PRODUCTION_TARGET.projectId,
      projectUrl: SUPABASE_PRODUCTION_TARGET.projectUrl,
      cutoverGeneration: SUPABASE_PRODUCTION_TARGET.cutoverGeneration,
    },
    migrationContract: {
      targetHistoryChecked: true,
      targetHistoryCompatible: true,
      ownerApprovedExactMigrationContract: true,
      expectedPostApplyMigrationListRecorded: true,
      expectedPostApplyOrder: requiredRemoteMigrationOrderForGeneration(
        SUPABASE_PRODUCTION_TARGET.cutoverGeneration,
      ),
      expectedContractSha256: migrationContractDigest,
    },
    preActivationVerification: {
      checkedAt,
      gitHead,
      sourceSha256,
      verificationScope: "supabase-clean-cutover",
      verifyAuthDataReadinessPassed: true,
      verifySupabaseReleasePassed: true,
      typecheckPassed: true,
      lintPassed: true,
      fullTestSuitePassed: true,
      buildPassed: true,
      finalDiffReviewed: true,
    },
    productionEvidence: {
      checkedAt,
      deployedGitSha: manifest.deployedGitSha,
      ...manifest.checks,
      evidenceManifest: manifestPath,
      evidenceManifestSha256: sha256Evidence(manifestContent),
    },
    finalDataState: {
      checked: true,
      checkedAt,
      ...SUPABASE_PRODUCTION_TARGET.requiredCleanDataState,
      evidenceArtifact: finalStatePath,
      evidenceSha256: sha256Evidence(finalStateContent),
    },
    edgeFunctions: {
      expected: SUPABASE_PRODUCTION_TARGET.requiredEdgeFunctions,
      localContractChecked: true,
      remoteListChecked: true,
      deployed: true,
      dryRunsPassed: true,
      semanticChecksPassed: true,
      sourceIdentityBound: true,
      checkedAt,
      evidenceArtifact: edgePath,
      evidenceSha256: sha256Evidence(edgeContent),
    },
    deploymentGate: {
      deployApproved: true,
      cutoverApproved: true,
      productionMutationApproved: true,
    },
    goNoGo: { decision: "GO" },
  };
  const trackedPacket = {
    ...approvedPacket,
    status: "NO_GO",
    phase: "evidence-complete",
    ownerApproval: undefined,
    deploymentGate: {
      deployApproved: false,
      cutoverApproved: false,
      productionMutationApproved: false,
    },
    goNoGo: { decision: "NO_GO" },
  };
  const trackedContent = writeJson(
    resolve(root, "docs/release/supabase-production-readiness.json"),
    trackedPacket,
  );
  const approvalRoot = mkdtempSync(resolve(tmpdir(), "v19-cutover-approval-"));
  const approvalPath = resolve(approvalRoot, "approval.json");
  writeJson(approvalPath, {
    ...approvedPacket,
    trackedReadinessSha256: sha256Evidence(trackedContent),
  });

  return { approvalPath, artifactPaths, root };
}

function runVerifier(fixture: ReturnType<typeof approvedFixture>) {
  return spawnSync(process.execPath, [verifierPath], {
    cwd: fixture.root,
    encoding: "utf8",
    env: {
      ...process.env,
      SUPABASE_PRODUCTION_APPROVAL_PACKET_PATH: fixture.approvalPath,
    },
  });
}

describe("Supabase cutover readiness state machine", () => {
  test("rejects fabricated GO while authenticated owner approval is unavailable", () => {
    const fixture = approvedFixture();
    const result = runVerifier(fixture);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain(
      "PASS External approval packet binds the tracked evidence root",
    );
    expect(result.stderr).toContain(
      "Authenticated owner approval is cryptographically verified: owner approval public-key fingerprint is not configured",
    );
  });

  test("rejects a tampered component artifact after approval", () => {
    const fixture = approvedFixture();
    const original = JSON.parse(
      readFileSync(fixture.artifactPaths.adminBrowserFlow.path, "utf8"),
    );
    writeJson(fixture.artifactPaths.adminBrowserFlow.path, {
      ...original,
      checks: { ...original.checks, adminSignInWorks: false },
    });

    const result = runVerifier(fixture);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "Production evidence artifact adminBrowserFlow is target-bound and hash-verified: SHA-256 mismatch",
    );
  });
});

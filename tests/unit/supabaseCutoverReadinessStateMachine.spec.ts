import { execFileSync, spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

import { SUPABASE_PRODUCTION_TARGET } from "../../config/supabase-production-target.mjs";
import {
  cutoverEvidenceRootSha256,
  sha256Evidence,
} from "../../scripts/lib/supabase-cutover-evidence.mjs";
import { externalEvidenceRootSha256 } from "../../scripts/lib/supabase-external-evidence.mjs";
import { edgeFunctionSourceSha256FromGitHead } from "../../scripts/lib/edge-function-source-identity.mjs";
import { assertProductionMutationAllowed } from "../../scripts/lib/supabase-production-mutation-gate.mjs";
import {
  releaseArchiveSourceSha256FromGitHead,
  releaseSourceSha256FromGitHead,
} from "../../scripts/lib/release-source-identity.mjs";
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

function validAgentCasReceipts() {
  return {
    identicalReplay: {
      canonicalCaseRevision: 1,
      firstCaseRevision: 1,
      firstResultSha256: "1".repeat(64),
      operationId: "11111111-1111-4111-8111-111111111111",
      passed: true,
      replayCaseRevision: 1,
      replayResultSha256: "1".repeat(64),
    },
    fingerprintMismatch: {
      canonicalCaseRevision: 1,
      errorCode: "23514",
      operationId: "11111111-1111-4111-8111-111111111111",
      passed: true,
    },
    staleRevision: {
      canonicalCaseRevisionAfter: 2,
      canonicalCaseRevisionBefore: 2,
      canonicalRowAfterSha256: "2".repeat(64),
      canonicalRowBeforeSha256: "2".repeat(64),
      errorCode: "40001",
      operationId: "22222222-2222-4222-8222-222222222222",
      passed: true,
      staleExpectedRevision: 1,
    },
  };
}

function approvedFixture() {
  const root = mkdtempSync(resolve(tmpdir(), "v19-cutover-readiness-"));
  const evidenceRoot = mkdtempSync(resolve(tmpdir(), "v19-cutover-evidence-"));
  mkdirSync(resolve(root, "docs/release"), { recursive: true });
  for (const directory of ["config", "public", "scripts", "src"]) {
    mkdirSync(resolve(root, directory), { recursive: true });
  }
  cpSync(
    resolve(repoRoot, "supabase/migrations"),
    resolve(root, "supabase/migrations"),
    {
      recursive: true,
    },
  );
  cpSync(resolve(repoRoot, "supabase/functions"), resolve(root, "supabase/functions"), {
    recursive: true,
  });
  writeJson(resolve(root, "package.json"), {
    scripts: {
      "verify:production-readiness": "node scripts/verify-production-readiness.mjs",
    },
  });
  for (const sourceFile of [
    ".vercelignore",
    ".nvmrc",
    "index.html",
    "package-lock.json",
    "postcss.config.js",
    "tailwind.config.js",
    "tsconfig.app.json",
    "tsconfig.json",
    "tsconfig.node.json",
    "vite.config.ts",
    "vercel.json",
  ]) {
    writeFileSync(resolve(root, sourceFile), "");
  }
  const trackedContent = writeJson(
    resolve(root, "docs/release/supabase-production-readiness.json"),
    {
      schemaVersion: 3,
      scope: "supabase-production-cutover",
      status: "NO_GO",
      phase: "evidence-complete",
      goNoGo: { decision: "NO_GO" },
    },
  );
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "."], { cwd: root });
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
  const archiveSourceSha256 = releaseArchiveSourceSha256FromGitHead(root);
  const migrationContract = migrationContractEntriesFromFileSystem(repoRoot);
  const migrationContractDigest = migrationContractSha256(migrationContract);

  const checkedAt = new Date().toISOString();
  const migrationDryRunPath = resolve(evidenceRoot, "migration-dry-run.json");
  const migrationDryRunContent = writeJson(migrationDryRunPath, {
    schemaVersion: 1,
    scope: "supabase-production-migration-dry-run",
    status: "PASS",
    checkedAt,
    projectRef: SUPABASE_PRODUCTION_TARGET.projectId,
    cutoverGeneration: SUPABASE_PRODUCTION_TARGET.cutoverGeneration,
    gitHead,
    sourceSha256,
    checks: { migrationDryRunPassed: true },
    contractSha256: migrationContractDigest,
    expectedContract: migrationContract,
  });
  const artifactPaths = Object.fromEntries(
    Object.entries(SUPABASE_PRODUCTION_TARGET.requiredAdminOnlyEvidenceArtifacts).map(
      ([label, contract]) => {
        const artifactPath = `${label}.json`;
        const path = resolve(evidenceRoot, artifactPath);
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
          ...(label === "agentDatabaseReadback"
            ? { casReceipts: validAgentCasReceipts() }
            : {}),
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
                canonicalHost: SUPABASE_PRODUCTION_TARGET.canonicalApplicationHost,
                canonicalGitSourceSha256: sourceSha256,
                deploymentId: "dpl_test",
                expectedEffectiveArchiveSourceSha256: archiveSourceSha256,
                expectedGitSha: gitHead,
                observedEffectiveArchiveSourceSha256: archiveSourceSha256,
                observedGitSha: gitHead,
                observedReleaseIdentitySchemaVersion: 2,
                observedDirty: false,
              }
            : {}),
          ...(["adminBrowserFlow", "agentBrowserFlow"].includes(label)
            ? {
                canonicalHost: SUPABASE_PRODUCTION_TARGET.canonicalApplicationHost,
                deploymentId: "dpl_test",
                observedGitSha: gitHead,
              }
            : {}),
        };
        const content = writeJson(path, componentEvidence);
        return [
          label,
          { checkedAt, path: artifactPath, sha256: sha256Evidence(content) },
        ];
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
  const manifestPath = resolve(evidenceRoot, "runtime-manifest.json");
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
  const finalStatePath = resolve(evidenceRoot, "final-state.json");
  const finalStateContent = writeJson(finalStatePath, finalStateEvidence);

  const expectedFunctions = [
    ...SUPABASE_PRODUCTION_TARGET.requiredEdgeFunctions,
  ].sort();
  const edgeSourceSha256 = Object.fromEntries(
    expectedFunctions.map((name) => [
      name,
      edgeFunctionSourceSha256FromGitHead(root, name),
    ]),
  );
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
    localFunctionSourceSha256: edgeSourceSha256,
    observedFunctionSourceSha256: edgeSourceSha256,
    deploymentIdentities: expectedFunctions.map((name) => ({
      deploymentId: `dpl_${name.replaceAll("-", "")}`,
      function: name,
      observedSourceSha256: edgeSourceSha256[name],
      version: "1",
    })),
    semanticReceipts: expectedFunctions.map((name) => ({
      action: SUPABASE_PRODUCTION_TARGET.requiredEdgeFunctionSemanticActions[name],
      canonicalReadbackSha256: "f".repeat(64),
      function: name,
      passed: true,
      requestNonce: "nonce_1234567890abcdef",
      responseNonce: "nonce_1234567890abcdef",
    })),
    runtimeChecks: expectedFunctions.map((name) => ({
      capability: SUPABASE_PRODUCTION_TARGET.requiredEdgeFunctionCapabilities[name],
      function: name,
      passed: true,
      statusCode: 200,
    })),
  };
  const edgePath = resolve(evidenceRoot, "edge-functions.json");
  const edgeContent = writeJson(edgePath, edgeEvidence);
  const roleIsolationSha256 = sha256Evidence(manifestContent);
  const edgeFunctionsSha256 = sha256Evidence(edgeContent);
  const bundlePath = resolve(evidenceRoot, "bundle.json");
  writeJson(bundlePath, {
    schemaVersion: 1,
    scope: "supabase-production-external-evidence-bundle",
    status: "PASS",
    checkedAt,
    projectRef: SUPABASE_PRODUCTION_TARGET.projectId,
    cutoverGeneration: SUPABASE_PRODUCTION_TARGET.cutoverGeneration,
    gitHead,
    sourceSha256,
    evidenceRootSha256: externalEvidenceRootSha256({
      edgeFunctionsSha256,
      roleIsolationSha256,
    }),
    artifacts: {
      roleIsolation: {
        path: "runtime-manifest.json",
        sha256: roleIsolationSha256,
      },
      edgeFunctions: { path: "edge-functions.json", sha256: edgeFunctionsSha256 },
    },
  });
  const approvalRoot = mkdtempSync(resolve(tmpdir(), "v19-cutover-approval-"));
  const importResult = spawnSync(
    process.execPath,
    [
      resolve(repoRoot, "scripts/import-supabase-production-evidence.mjs"),
      "--manifest",
      bundlePath,
    ],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, V19_TEST_ARTIFACTS_DIR: approvalRoot },
    },
  );
  if (importResult.status !== 0) {
    throw new Error(`Evidence importer failed: ${importResult.stderr}`);
  }
  const importReceiptPath = resolve(
    approvalRoot,
    "supabase-production-evidence-import.json",
  );
  const importReceiptContent = readFileSync(importReceiptPath, "utf8");
  const importReceipt = JSON.parse(importReceiptContent);

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
      dryRunPassed: true,
      dryRunCheckedAt: checkedAt,
      dryRunContractSha256: migrationContractDigest,
      dryRunEvidenceArtifact: migrationDryRunPath,
      dryRunEvidenceSha256: sha256Evidence(migrationDryRunContent),
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
    externalEvidenceImport: {
      artifact: importReceiptPath,
      checkedAt: importReceipt.checkedAt,
      evidenceRootSha256: importReceipt.evidenceRootSha256,
      sha256: sha256Evidence(importReceiptContent),
    },
    deploymentGate: {
      deployApproved: true,
      cutoverApproved: true,
      productionMutationApproved: true,
    },
    goNoGo: { decision: "GO" },
  };
  const boundApprovalPacket = {
    ...approvedPacket,
    trackedReadinessSha256: sha256Evidence(trackedContent),
  };
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const ownerReceipt = Buffer.from(
    `${JSON.stringify({
      schemaVersion: 1,
      scope: "supabase-production-mutation-approval",
      decision: "APPROVED",
      projectRef: SUPABASE_PRODUCTION_TARGET.projectId,
      cutoverGeneration: SUPABASE_PRODUCTION_TARGET.cutoverGeneration,
      gitHead,
      sourceSha256,
      evidenceRootSha256: cutoverEvidenceRootSha256(boundApprovalPacket),
      allowedActions: ["workflow-smoke"],
      expiresAt: "2099-01-01T00:00:00.000Z",
    })}\n`,
  );
  const ownerReceiptPath = resolve(approvalRoot, "owner-receipt.json");
  const signaturePath = resolve(approvalRoot, "owner-receipt.sig");
  const publicKeyPath = resolve(approvalRoot, "owner-public.pem");
  writeFileSync(ownerReceiptPath, ownerReceipt);
  writeFileSync(signaturePath, sign(null, ownerReceipt, privateKey).toString("base64"));
  writeFileSync(publicKeyPath, publicKey.export({ format: "pem", type: "spki" }));
  const expectedOwnerPublicKeySha256 = createHash("sha256")
    .update(publicKey.export({ format: "der", type: "spki" }))
    .digest("hex");
  const approvalPath = resolve(approvalRoot, "approval.json");
  writeJson(approvalPath, {
    ...boundApprovalPacket,
    ownerApproval: {
      mechanism: "detached-signature",
      publicKeyPath,
      receiptPath: ownerReceiptPath,
      receiptSha256: sha256Evidence(ownerReceipt),
      signaturePath,
    },
  });

  return {
    approvalPath,
    artifactPaths,
    evidenceRoot,
    expectedOwnerPublicKeySha256,
    root,
  };
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
  test("reaches the approved mutation gate with one imported bundle and owner signature", () => {
    const fixture = approvedFixture();

    expect(() =>
      assertProductionMutationAllowed({
        action: "workflow-smoke",
        expectedOwnerPublicKeySha256: fixture.expectedOwnerPublicKeySha256,
        repoRoot: fixture.root,
        readinessPath: fixture.approvalPath,
      }),
    ).not.toThrow();
  });

  test("rejects a symlinked production approval packet", () => {
    const fixture = approvedFixture();
    const approvalLink = resolve(fixture.evidenceRoot, "approval-link.json");
    symlinkSync(fixture.approvalPath, approvalLink);

    expect(() =>
      assertProductionMutationAllowed({
        action: "workflow-smoke",
        expectedOwnerPublicKeySha256: fixture.expectedOwnerPublicKeySha256,
        repoRoot: fixture.root,
        readinessPath: approvalLink,
      }),
    ).toThrow("production approval packet must be a regular non-symlink file");
  });

  test("rejects a non-regular production approval path", () => {
    const fixture = approvedFixture();

    expect(() =>
      assertProductionMutationAllowed({
        action: "workflow-smoke",
        expectedOwnerPublicKeySha256: fixture.expectedOwnerPublicKeySha256,
        repoRoot: fixture.root,
        readinessPath: fixture.evidenceRoot,
      }),
    ).toThrow("production approval packet must be a regular non-symlink file");
  });

  test("rejects a symlinked detached owner receipt", () => {
    const fixture = approvedFixture();
    const approval = JSON.parse(readFileSync(fixture.approvalPath, "utf8"));
    const receiptLink = resolve(fixture.evidenceRoot, "owner-receipt-link.json");
    symlinkSync(approval.ownerApproval.receiptPath, receiptLink);
    approval.ownerApproval.receiptPath = receiptLink;
    writeJson(fixture.approvalPath, approval);

    expect(() =>
      assertProductionMutationAllowed({
        action: "workflow-smoke",
        expectedOwnerPublicKeySha256: fixture.expectedOwnerPublicKeySha256,
        repoRoot: fixture.root,
        readinessPath: fixture.approvalPath,
      }),
    ).toThrow("owner approval receipt must be a regular non-symlink file");
  });

  test("rejects fabricated GO while authenticated owner approval is unavailable", () => {
    const fixture = approvedFixture();
    const result = runVerifier(fixture);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain(
      "PASS External approval packet binds the tracked evidence root",
    );
    expect(result.stderr.split("\n").filter((line) => line.startsWith("- "))).toEqual([
      "- Authenticated owner approval is cryptographically verified: owner approval public-key fingerprint is not configured",
    ]);
  });

  test("rejects a tampered component artifact after approval", () => {
    const fixture = approvedFixture();
    const artifactPath = resolve(
      fixture.evidenceRoot,
      fixture.artifactPaths.adminBrowserFlow.path,
    );
    const original = JSON.parse(readFileSync(artifactPath, "utf8"));
    writeJson(artifactPath, {
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

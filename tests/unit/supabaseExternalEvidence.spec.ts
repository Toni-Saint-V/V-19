import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, test } from "vitest";

import { SUPABASE_PRODUCTION_TARGET } from "../../config/supabase-production-target.mjs";
import {
  externalEvidenceRootSha256,
  validateExternalEvidenceBundle,
  validateExternalEvidenceImportReceipt,
} from "../../scripts/lib/supabase-external-evidence.mjs";

const gitHead = "a".repeat(40);
const sourceSha256 = "b".repeat(64);
const checkedAt = "2026-08-03T00:00:00.000Z";

function sha256(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

function writeBundle() {
  const root = mkdtempSync(resolve(tmpdir(), "v19-external-evidence-"));
  const roleIsolation = {
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
    artifacts: Object.fromEntries(
      Object.keys(SUPABASE_PRODUCTION_TARGET.requiredAdminOnlyEvidenceArtifacts).map(
        (key) => [key, {}],
      ),
    ),
  };
  const functions = [...SUPABASE_PRODUCTION_TARGET.requiredEdgeFunctions];
  const edgeFunctions = {
    schemaVersion: 1,
    scope: "supabase-production-edge-functions",
    status: "PASS",
    checkedAt,
    projectRef: SUPABASE_PRODUCTION_TARGET.projectId,
    cutoverGeneration: SUPABASE_PRODUCTION_TARGET.cutoverGeneration,
    gitHead,
    sourceSha256,
    expectedFunctions: functions,
    observedFunctions: functions,
    requiredSecretNames: [...SUPABASE_PRODUCTION_TARGET.requiredEdgeFunctionSecretNames],
    missingSecretNames: [],
    localContractChecked: true,
    remoteListChecked: true,
    deployed: true,
    dryRunsPassed: true,
    runtimeChecks: [],
    localFunctionSourceSha256: {},
    observedFunctionSourceSha256: {},
    deploymentIdentities: functions.map((name) => ({
      deploymentId: `dpl_${name}`,
      function: name,
      observedSourceSha256: "c".repeat(64),
      version: "1",
    })),
    semanticReceipts: functions.map((name) => ({
      action: SUPABASE_PRODUCTION_TARGET.requiredEdgeFunctionSemanticActions[name],
      canonicalReadbackSha256: "d".repeat(64),
      function: name,
      passed: true,
      requestNonce: "nonce_1234567890abcdef",
      responseNonce: "nonce_1234567890abcdef",
    })),
    sourceIdentityBound: true,
    semanticChecksPassed: true,
  };
  const roleContent = `${JSON.stringify(roleIsolation, null, 2)}\n`;
  const edgeContent = `${JSON.stringify(edgeFunctions, null, 2)}\n`;
  writeFileSync(resolve(root, "role-isolation.json"), roleContent);
  writeFileSync(resolve(root, "edge-functions.json"), edgeContent);
  const roleIsolationSha256 = sha256(roleContent);
  const edgeFunctionsSha256 = sha256(edgeContent);
  const manifest = {
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
      roleIsolation: { path: "role-isolation.json", sha256: roleIsolationSha256 },
      edgeFunctions: { path: "edge-functions.json", sha256: edgeFunctionsSha256 },
    },
  };
  const manifestPath = resolve(root, "bundle.json");
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { edgeFunctions, manifest, manifestPath, root };
}

describe("Supabase external production evidence", () => {
  test("imports a closed target-bound role/Edge evidence bundle end to end", () => {
    const fixture = writeBundle();
    const artifactsRoot = mkdtempSync(resolve(tmpdir(), "v19-import-receipt-"));
    const result = spawnSync(
      process.execPath,
      ["scripts/import-supabase-production-evidence.mjs", "--manifest", fixture.manifestPath],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, V19_TEST_ARTIFACTS_DIR: artifactsRoot },
      },
    );

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("PASS External production evidence imported");
    const receiptPath = resolve(
      artifactsRoot,
      "supabase-production-evidence-import.json",
    );
    const receiptContent = readFileSync(receiptPath, "utf8");
    const receipt = JSON.parse(receiptContent);
    const packet = {
      productionTarget: {
        projectId: SUPABASE_PRODUCTION_TARGET.projectId,
        cutoverGeneration: SUPABASE_PRODUCTION_TARGET.cutoverGeneration,
      },
      preActivationVerification: { gitHead, sourceSha256 },
      productionEvidence: {
        evidenceManifestSha256: fixture.manifest.artifacts.roleIsolation.sha256,
      },
      edgeFunctions: {
        evidenceSha256: fixture.manifest.artifacts.edgeFunctions.sha256,
      },
      externalEvidenceImport: {
        artifact: receiptPath,
        checkedAt: receipt.checkedAt,
        evidenceRootSha256: receipt.evidenceRootSha256,
        sha256: sha256(receiptContent),
      },
    };
    expect(validateExternalEvidenceImportReceipt({ packet, repoRoot: process.cwd() })).toEqual(
      [],
    );
  });

  test("rejects unknown receipt fields and artifact tampering", () => {
    const fixture = writeBundle();
    const invalid = {
      ...fixture.manifest,
      artifacts: {
        ...fixture.manifest.artifacts,
        edgeFunctions: {
          ...fixture.manifest.artifacts.edgeFunctions,
          unknown: true,
        },
      },
    };
    expect(
      validateExternalEvidenceBundle({ bundleManifest: invalid, bundleRoot: fixture.root })
        .issues,
    ).toContain("edgeFunctions descriptor keys mismatch");

    writeFileSync(
      resolve(fixture.root, "edge-functions.json"),
      `${JSON.stringify({ ...fixture.edgeFunctions, semanticChecksPassed: false })}\n`,
    );
    expect(
      validateExternalEvidenceBundle({
        bundleManifest: fixture.manifest,
        bundleRoot: fixture.root,
      }).issues,
    ).toContain("edgeFunctions SHA-256 mismatch");
  });
});

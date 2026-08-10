import { createHash, generateKeyPairSync, sign } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { describe, expect, test } from "vitest";

import { SUPABASE_PRODUCTION_TARGET } from "../../config/supabase-production-target.mjs";
import {
  cutoverEvidenceRootSha256,
  sha256Evidence,
  validateExternalApprovalPacketBinding,
} from "../../scripts/lib/supabase-cutover-evidence.mjs";
import {
  externalEvidenceRootSha256,
  readStableExternalFile,
  writeStableExternalFile,
  validateExternalEvidenceBundle,
  validateExternalEvidenceImportReceipt,
} from "../../scripts/lib/supabase-external-evidence.mjs";
import { verifyDetachedOwnerApproval } from "../../scripts/lib/supabase-production-mutation-gate.mjs";
import { releaseSourceSha256FromGitHead } from "../../scripts/lib/release-source-identity.mjs";
import { edgeFunctionSourceSha256FromGitHead } from "../../scripts/lib/edge-function-source-identity.mjs";
import {
  migrationContractEntriesFromGitHead,
  migrationContractSha256,
  requiredRemoteMigrationOrderForGeneration,
} from "../../scripts/supabase-migration-contract.mjs";

const gitHead = "a".repeat(40);
const sourceSha256 = "b".repeat(64);
const checkedAt = new Date(Date.now() - 60_000).toISOString();
const migrationOrder = requiredRemoteMigrationOrderForGeneration(
  SUPABASE_PRODUCTION_TARGET.cutoverGeneration,
);

function sha256(content: string | Buffer) {
  return createHash("sha256").update(content).digest("hex");
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

function cleanImportCheckout() {
  const root = mkdtempSync(resolve(tmpdir(), "v19-evidence-import-checkout-"));
  for (const directory of ["config", "public", "scripts", "src"]) {
    mkdirSync(resolve(root, directory), { recursive: true });
  }
  cpSync(
    resolve(process.cwd(), "supabase/migrations"),
    resolve(root, "supabase/migrations"),
    { recursive: true },
  );
  cpSync(
    resolve(process.cwd(), "supabase/functions"),
    resolve(root, "supabase/functions"),
    { recursive: true },
  );
  writeFileSync(resolve(root, "package.json"), "{}\n");
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
  return {
    gitHead,
    root,
    sourceSha256: releaseSourceSha256FromGitHead(root),
  };
}

function writeBundle(
  identity: {
    gitHead: string;
    repoRoot: string;
    sourceSha256: string;
  } = { gitHead, repoRoot: process.cwd(), sourceSha256 },
) {
  const root = mkdtempSync(resolve(tmpdir(), "v19-external-evidence-"));
  const bundleMigrationContract = migrationContractEntriesFromGitHead(
    identity.repoRoot,
  );
  const roleArtifacts = Object.fromEntries(
    Object.entries(SUPABASE_PRODUCTION_TARGET.requiredAdminOnlyEvidenceArtifacts).map(
      ([label, contract]) => {
        const artifact = {
          schemaVersion: 1,
          scope: contract.scope,
          status: "PASS",
          checkedAt,
          projectRef: SUPABASE_PRODUCTION_TARGET.projectId,
          cutoverGeneration: SUPABASE_PRODUCTION_TARGET.cutoverGeneration,
          gitHead: identity.gitHead,
          sourceSha256: identity.sourceSha256,
          checks: Object.fromEntries(contract.checks.map((key) => [key, true])),
          ...(label === "agentDatabaseReadback"
            ? { casReceipts: validAgentCasReceipts() }
            : {}),
          ...(label === "remoteMigrationHistory"
            ? {
                contractSha256: migrationContractSha256(bundleMigrationContract),
                expectedContract: bundleMigrationContract,
                expectedOrder: migrationOrder,
                observedContract: bundleMigrationContract,
                observedOrder: migrationOrder,
              }
            : {}),
          ...(label === "deploymentIdentity"
            ? {
                canonicalHost: SUPABASE_PRODUCTION_TARGET.canonicalApplicationHost,
                canonicalGitSourceSha256: identity.sourceSha256,
                deploymentId: "dpl_test",
                expectedEffectiveArchiveSourceSha256: "c".repeat(64),
                expectedGitSha: identity.gitHead,
                observedDirty: false,
                observedEffectiveArchiveSourceSha256: "c".repeat(64),
                observedGitSha: identity.gitHead,
                observedReleaseIdentitySchemaVersion: 2,
              }
            : {}),
          ...(["adminBrowserFlow", "agentBrowserFlow"].includes(label)
            ? {
                canonicalHost: SUPABASE_PRODUCTION_TARGET.canonicalApplicationHost,
                deploymentId: "dpl_test",
                observedGitSha: identity.gitHead,
              }
            : {}),
        };
        const content = `${JSON.stringify(artifact, null, 2)}\n`;
        const path = `${label}.json`;
        writeFileSync(resolve(root, path), content);
        return [label, { checkedAt, path, sha256: sha256(content) }];
      },
    ),
  );
  const roleIsolation = {
    schemaVersion: 1,
    scope: "supabase-production-role-isolation-runtime",
    status: "PASS",
    checkedAt,
    projectRef: SUPABASE_PRODUCTION_TARGET.projectId,
    cutoverGeneration: SUPABASE_PRODUCTION_TARGET.cutoverGeneration,
    gitHead: identity.gitHead,
    sourceSha256: identity.sourceSha256,
    deployedGitSha: identity.gitHead,
    checks: Object.fromEntries(
      SUPABASE_PRODUCTION_TARGET.requiredAdminOnlyProductionEvidence.map((key) => [
        key,
        true,
      ]),
    ),
    artifacts: roleArtifacts,
  };
  const functions = [...SUPABASE_PRODUCTION_TARGET.requiredEdgeFunctions];
  const edgeSourceSha256 = Object.fromEntries(
    functions.map((name) => [
      name,
      edgeFunctionSourceSha256FromGitHead(identity.repoRoot, name),
    ]),
  );
  const edgeFunctions = {
    schemaVersion: 1,
    scope: "supabase-production-edge-functions",
    status: "PASS",
    checkedAt,
    projectRef: SUPABASE_PRODUCTION_TARGET.projectId,
    cutoverGeneration: SUPABASE_PRODUCTION_TARGET.cutoverGeneration,
    gitHead: identity.gitHead,
    sourceSha256: identity.sourceSha256,
    expectedFunctions: functions,
    observedFunctions: functions,
    requiredSecretNames: [
      ...SUPABASE_PRODUCTION_TARGET.requiredEdgeFunctionSecretNames,
    ],
    missingSecretNames: [],
    localContractChecked: true,
    remoteListChecked: true,
    deployed: true,
    dryRunsPassed: true,
    runtimeChecks: functions.map((name) => ({
      capability: SUPABASE_PRODUCTION_TARGET.requiredEdgeFunctionCapabilities[name],
      function: name,
      passed: true,
      statusCode: 200,
    })),
    localFunctionSourceSha256: Object.fromEntries(
      functions.map((name) => [name, edgeSourceSha256[name]]),
    ),
    observedFunctionSourceSha256: Object.fromEntries(
      functions.map((name) => [name, edgeSourceSha256[name]]),
    ),
    deploymentIdentities: functions.map((name) => ({
      deploymentId: `dpl_${name}`,
      function: name,
      observedSourceSha256: edgeSourceSha256[name],
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
    gitHead: identity.gitHead,
    sourceSha256: identity.sourceSha256,
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
  return {
    edgeFunctions,
    gitHead: identity.gitHead,
    manifest,
    manifestPath,
    roleIsolation,
    root,
    sourceSha256: identity.sourceSha256,
  };
}

describe("Supabase external production evidence", () => {
  test("imports a closed target-bound role/Edge evidence bundle end to end", () => {
    const checkout = cleanImportCheckout();
    const fixture = writeBundle({
      gitHead: checkout.gitHead,
      repoRoot: checkout.root,
      sourceSha256: checkout.sourceSha256,
    });
    const artifactsRoot = mkdtempSync(resolve(tmpdir(), "v19-import-receipt-"));
    const result = spawnSync(
      process.execPath,
      [
        resolve(process.cwd(), "scripts/import-supabase-production-evidence.mjs"),
        "--manifest",
        fixture.manifestPath,
      ],
      {
        cwd: checkout.root,
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
      preActivationVerification: {
        gitHead: fixture.gitHead,
        sourceSha256: fixture.sourceSha256,
      },
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
    expect(
      validateExternalEvidenceImportReceipt({
        now: Date.parse(checkedAt) + 60_000,
        packet,
        repoRoot: checkout.root,
      }),
    ).toEqual([]);
    expect(receipt.bundleManifest).toEqual({
      path: realpathSync(fixture.manifestPath),
      sha256: sha256(readFileSync(fixture.manifestPath, "utf8")),
    });

    const trackedPacket = { status: "NO_GO", goNoGo: { decision: "NO_GO" } };
    const trackedContent = `${JSON.stringify(trackedPacket)}\n`;
    const approvalPacket = {
      ...packet,
      phase: "approved",
      status: "GO",
      goNoGo: { decision: "GO" },
      trackedReadinessSha256: sha256Evidence(trackedContent),
    };
    expect(
      validateExternalApprovalPacketBinding({
        approvalPacket,
        trackedContent,
        trackedPacket,
      }),
    ).toEqual([]);
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const approvalRoot = mkdtempSync(resolve(tmpdir(), "v19-owner-evidence-root-"));
    const ownerReceipt = Buffer.from(
      `${JSON.stringify({
        schemaVersion: 1,
        scope: "supabase-production-mutation-approval",
        decision: "APPROVED",
        projectRef: SUPABASE_PRODUCTION_TARGET.projectId,
        cutoverGeneration: SUPABASE_PRODUCTION_TARGET.cutoverGeneration,
        gitHead: fixture.gitHead,
        sourceSha256: fixture.sourceSha256,
        evidenceRootSha256: cutoverEvidenceRootSha256(approvalPacket),
        allowedActions: ["workflow-smoke"],
        expiresAt: "2099-01-01T00:00:00.000Z",
      })}\n`,
    );
    const ownerReceiptPath = resolve(approvalRoot, "receipt.json");
    const signaturePath = resolve(approvalRoot, "receipt.sig");
    const publicKeyPath = resolve(approvalRoot, "owner-public.pem");
    writeFileSync(ownerReceiptPath, ownerReceipt);
    writeFileSync(
      signaturePath,
      sign(null, ownerReceipt, privateKey).toString("base64"),
    );
    writeFileSync(publicKeyPath, publicKey.export({ format: "pem", type: "spki" }));
    const ownerIssues: string[] = [];
    verifyDetachedOwnerApproval({
      action: "workflow-smoke",
      approval: {
        receiptPath: ownerReceiptPath,
        receiptSha256: sha256(ownerReceipt),
        signaturePath,
        publicKeyPath,
      },
      evidenceRootSha256: cutoverEvidenceRootSha256(approvalPacket),
      expectedPublicKeySha256: createHash("sha256")
        .update(publicKey.export({ format: "der", type: "spki" }))
        .digest("hex"),
      gitHead: fixture.gitHead,
      issues: ownerIssues,
      repoRoot: checkout.root,
      sourceSha256: fixture.sourceSha256,
    });
    expect(ownerIssues).toEqual([]);

    for (const [importedAt, expectedIssue] of [
      [
        new Date(Date.parse(checkedAt) - 1).toISOString(),
        "evidence import receipt predates the evidence bundle",
      ],
      [
        new Date(Date.parse(checkedAt) + 10 * 60_000).toISOString(),
        "evidence import receipt importedAt is in the future",
      ],
    ] as const) {
      const temporalReceiptContent = `${JSON.stringify(
        { ...receipt, importedAt },
        null,
        2,
      )}\n`;
      writeFileSync(receiptPath, temporalReceiptContent);
      const temporalPacket = {
        ...packet,
        externalEvidenceImport: {
          ...packet.externalEvidenceImport,
          sha256: sha256(temporalReceiptContent),
        },
      };
      expect(
        validateExternalEvidenceImportReceipt({
          now: Date.parse(checkedAt) + 60_000,
          packet: temporalPacket,
          repoRoot: checkout.root,
        }),
      ).toContain(expectedIssue);
    }
  }, 15_000);

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
      validateExternalEvidenceBundle({
        bundleManifest: invalid,
        bundleRoot: fixture.root,
      }).issues,
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

  test("rejects stale, incomplete, or post-import-tampered evidence", () => {
    const stale = writeBundle();
    expect(
      validateExternalEvidenceBundle({
        bundleManifest: stale.manifest,
        bundleRoot: stale.root,
        now: Date.parse(checkedAt) + SUPABASE_PRODUCTION_TARGET.maxEvidenceAgeMs + 1,
      }).issues,
    ).toContain("bundle checkedAt is stale");

    const incomplete = writeBundle();
    incomplete.edgeFunctions.semanticReceipts = [];
    const incompleteContent = `${JSON.stringify(incomplete.edgeFunctions, null, 2)}\n`;
    writeFileSync(resolve(incomplete.root, "edge-functions.json"), incompleteContent);
    incomplete.manifest.artifacts.edgeFunctions.sha256 = sha256(incompleteContent);
    incomplete.manifest.evidenceRootSha256 = externalEvidenceRootSha256({
      edgeFunctionsSha256: incomplete.manifest.artifacts.edgeFunctions.sha256,
      roleIsolationSha256: incomplete.manifest.artifacts.roleIsolation.sha256,
    });
    expect(
      validateExternalEvidenceBundle({
        bundleManifest: incomplete.manifest,
        bundleRoot: incomplete.root,
        now: Date.parse(checkedAt) + 60_000,
      }).issues,
    ).toContain("Edge semantic receipt cardinality mismatch");

    const checkout = cleanImportCheckout();
    const imported = writeBundle({
      gitHead: checkout.gitHead,
      repoRoot: checkout.root,
      sourceSha256: checkout.sourceSha256,
    });
    const artifactsRoot = mkdtempSync(resolve(tmpdir(), "v19-import-tamper-"));
    const result = spawnSync(
      process.execPath,
      [
        resolve(process.cwd(), "scripts/import-supabase-production-evidence.mjs"),
        "--manifest",
        imported.manifestPath,
      ],
      {
        cwd: checkout.root,
        encoding: "utf8",
        env: { ...process.env, V19_TEST_ARTIFACTS_DIR: artifactsRoot },
      },
    );
    expect(result.status, result.stderr).toBe(0);
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
      preActivationVerification: {
        gitHead: imported.gitHead,
        sourceSha256: imported.sourceSha256,
      },
      productionEvidence: {
        evidenceManifestSha256: imported.manifest.artifacts.roleIsolation.sha256,
      },
      edgeFunctions: {
        evidenceSha256: imported.manifest.artifacts.edgeFunctions.sha256,
      },
      externalEvidenceImport: {
        artifact: receiptPath,
        checkedAt: receipt.checkedAt,
        evidenceRootSha256: receipt.evidenceRootSha256,
        sha256: sha256(receiptContent),
      },
    };
    unlinkSync(resolve(imported.root, "edge-functions.json"));
    expect(
      validateExternalEvidenceImportReceipt({
        now: Date.parse(checkedAt) + 60_000,
        packet,
        repoRoot: checkout.root,
      }),
    ).toContain("evidence bundle: edgeFunctions path escapes the bundle or is missing");
  }, 15_000);

  test("refuses import from a dirty checkout before writing a receipt", () => {
    const checkout = cleanImportCheckout();
    const fixture = writeBundle({
      gitHead: checkout.gitHead,
      repoRoot: checkout.root,
      sourceSha256: checkout.sourceSha256,
    });
    const artifactsRoot = mkdtempSync(resolve(tmpdir(), "v19-import-dirty-"));
    writeFileSync(resolve(checkout.root, "dirty.txt"), "dirty\n");
    const result = spawnSync(
      process.execPath,
      [
        resolve(process.cwd(), "scripts/import-supabase-production-evidence.mjs"),
        "--manifest",
        fixture.manifestPath,
      ],
      {
        cwd: checkout.root,
        encoding: "utf8",
        env: { ...process.env, V19_TEST_ARTIFACTS_DIR: artifactsRoot },
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Evidence import requires a clean checkout.");
    expect(
      existsSync(resolve(artifactsRoot, "supabase-production-evidence-import.json")),
    ).toBe(false);
  });

  test("refuses a receipt output directory symlinked into the checkout", () => {
    const checkout = cleanImportCheckout();
    const fixture = writeBundle({
      gitHead: checkout.gitHead,
      repoRoot: checkout.root,
      sourceSha256: checkout.sourceSha256,
    });
    const linkRoot = mkdtempSync(resolve(tmpdir(), "v19-import-output-link-"));
    const artifactsLink = resolve(linkRoot, "artifacts");
    symlinkSync(checkout.root, artifactsLink);
    const result = spawnSync(
      process.execPath,
      [
        resolve(process.cwd(), "scripts/import-supabase-production-evidence.mjs"),
        "--manifest",
        fixture.manifestPath,
      ],
      {
        cwd: checkout.root,
        encoding: "utf8",
        env: { ...process.env, V19_TEST_ARTIFACTS_DIR: artifactsLink },
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "Evidence import receipt directory must be a regular non-symlink directory",
    );
    expect(
      existsSync(resolve(checkout.root, "supabase-production-evidence-import.json")),
    ).toBe(false);
  });

  test("writes complete bytes through an atomic temporary file in a canonical external parent", () => {
    const repoRoot = mkdtempSync(resolve(tmpdir(), "v19-writer-repo-"));
    const externalRoot = mkdtempSync(resolve(tmpdir(), "v19-writer-external-"));
    const requestedPath = resolve(externalRoot, "nested", "receipt.json");
    let temporaryPath = "";
    let temporaryIdentity: { dev: bigint; ino: bigint } | undefined;

    const publishedPath = writeStableExternalFile({
      beforePublishForTest: (paths) => {
        temporaryPath = paths.temporaryPath;
        const stat = lstatSync(temporaryPath, { bigint: true });
        temporaryIdentity = { dev: stat.dev, ino: stat.ino };
        expect(paths.outputPath).toBe(
          realpathSync(resolve(externalRoot, "nested")) + "/receipt.json",
        );
      },
      content: "complete receipt\n",
      path: requestedPath,
      repoRoot,
    });

    const publishedIdentity = lstatSync(publishedPath, { bigint: true });
    expect(publishedPath).toBe(realpathSync(requestedPath));
    expect(readFileSync(publishedPath, "utf8")).toBe("complete receipt\n");
    expect({ dev: publishedIdentity.dev, ino: publishedIdentity.ino }).toEqual(
      temporaryIdentity,
    );
    expect(existsSync(temporaryPath)).toBe(false);
    expect(readdirSync(resolve(externalRoot, "nested"))).toEqual(["receipt.json"]);
  });

  test.each(["symlink", "directory"] as const)(
    "refuses an existing %s at the final output path without modifying it",
    (kind) => {
      const repoRoot = mkdtempSync(resolve(tmpdir(), "v19-writer-repo-"));
      const externalRoot = mkdtempSync(resolve(tmpdir(), "v19-writer-external-"));
      const outputPath = resolve(externalRoot, "receipt.json");
      const victimPath = resolve(externalRoot, "victim.json");
      writeFileSync(victimPath, "unchanged\n");
      if (kind === "symlink") symlinkSync(victimPath, outputPath);
      else mkdirSync(outputPath);

      expect(() =>
        writeStableExternalFile({
          content: "replacement\n",
          path: outputPath,
          repoRoot,
        }),
      ).toThrow("external artifact must be a regular non-symlink file");
      expect(readFileSync(victimPath, "utf8")).toBe("unchanged\n");
      expect(readdirSync(externalRoot).some((name) => name.endsWith(".tmp"))).toBe(
        false,
      );
    },
  );

  test("refuses a final-path symlink without deleting a foreign temporary replacement", () => {
    const repoRoot = mkdtempSync(resolve(tmpdir(), "v19-writer-repo-"));
    const externalRoot = mkdtempSync(resolve(tmpdir(), "v19-writer-external-"));
    const outputPath = resolve(externalRoot, "receipt.json");
    const victimPath = resolve(externalRoot, "victim.json");
    let foreignTemporaryPath = "";
    writeFileSync(victimPath, "unchanged\n");

    expect(() =>
      writeStableExternalFile({
        afterPublishFailureForTest: ({ temporaryPath }) => {
          unlinkSync(temporaryPath);
          writeFileSync(temporaryPath, "foreign temporary output\n");
          foreignTemporaryPath = temporaryPath;
        },
        beforePublishForTest: () => symlinkSync(victimPath, outputPath),
        content: "replacement\n",
        path: outputPath,
        repoRoot,
      }),
    ).toThrow("external artifact must be a regular non-symlink file");
    expect(readFileSync(victimPath, "utf8")).toBe("unchanged\n");
    expect(lstatSync(outputPath).isSymbolicLink()).toBe(true);
    expect(readFileSync(foreignTemporaryPath, "utf8")).toBe(
      "foreign temporary output\n",
    );
  });

  test("refuses a regular-file temporary replacement without deleting it", () => {
    const repoRoot = mkdtempSync(resolve(tmpdir(), "v19-writer-repo-"));
    const externalRoot = mkdtempSync(resolve(tmpdir(), "v19-writer-external-"));
    const outputPath = resolve(externalRoot, "receipt.json");
    let foreignTemporaryPath = "";

    expect(() =>
      writeStableExternalFile({
        afterTempOpenForTest: ({ temporaryPath }) => {
          unlinkSync(temporaryPath);
          writeFileSync(temporaryPath, "foreign temporary output\n");
          foreignTemporaryPath = temporaryPath;
        },
        content: "replacement\n",
        path: outputPath,
        repoRoot,
      }),
    ).toThrow("external artifact changed while it was written");
    expect(existsSync(outputPath)).toBe(false);
    expect(readFileSync(foreignTemporaryPath, "utf8")).toBe(
      "foreign temporary output\n",
    );
  });

  test("fails closed without deleting a foreign output after parent identity changes", () => {
    const repoRoot = mkdtempSync(resolve(tmpdir(), "v19-writer-repo-"));
    const externalRoot = mkdtempSync(resolve(tmpdir(), "v19-writer-external-"));
    const parentPath = resolve(externalRoot, "artifacts");
    const movedParentPath = resolve(externalRoot, "artifacts-original");
    const outputPath = resolve(parentPath, "receipt.json");

    expect(() =>
      writeStableExternalFile({
        afterPublishFailureForTest: ({ outputPath: publishedPath }) => {
          unlinkSync(publishedPath);
          writeFileSync(publishedPath, "foreign output\n");
        },
        beforePublishForTest: ({ temporaryPath }) => {
          const temporaryName = basename(temporaryPath);
          renameSync(parentPath, movedParentPath);
          mkdirSync(parentPath);
          renameSync(
            resolve(movedParentPath, temporaryName),
            resolve(parentPath, temporaryName),
          );
        },
        content: "replacement\n",
        path: outputPath,
        repoRoot,
      }),
    ).toThrow("external artifact changed while it was published");
    expect(readFileSync(outputPath, "utf8")).toBe("foreign output\n");
    expect(readdirSync(parentPath)).toEqual(["receipt.json"]);
    expect(readdirSync(movedParentPath)).toEqual([]);
  });

  test.each([
    ["gitHead", "c".repeat(40), "Evidence bundle Git SHA"],
    ["sourceSha256", "d".repeat(64), "Evidence bundle source SHA-256"],
  ] as const)(
    "refuses a bundle whose manifest %s does not match the clean checkout",
    (field, value, expectedMessage) => {
      const checkout = cleanImportCheckout();
      const fixture = writeBundle({
        gitHead: checkout.gitHead,
        repoRoot: checkout.root,
        sourceSha256: checkout.sourceSha256,
      });
      const artifactsRoot = mkdtempSync(resolve(tmpdir(), "v19-import-mismatch-"));
      writeFileSync(
        fixture.manifestPath,
        `${JSON.stringify({ ...fixture.manifest, [field]: value }, null, 2)}\n`,
      );
      const result = spawnSync(
        process.execPath,
        [
          resolve(process.cwd(), "scripts/import-supabase-production-evidence.mjs"),
          "--manifest",
          fixture.manifestPath,
        ],
        {
          cwd: checkout.root,
          encoding: "utf8",
          env: { ...process.env, V19_TEST_ARTIFACTS_DIR: artifactsRoot },
        },
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(expectedMessage);
      expect(
        existsSync(resolve(artifactsRoot, "supabase-production-evidence-import.json")),
      ).toBe(false);
    },
  );

  test("refuses self-consistent Edge source identities that do not match Git HEAD", () => {
    const checkout = cleanImportCheckout();
    const fixture = writeBundle({
      gitHead: checkout.gitHead,
      repoRoot: checkout.root,
      sourceSha256: checkout.sourceSha256,
    });
    const wrongSha = "e".repeat(64);
    for (const functionName of SUPABASE_PRODUCTION_TARGET.requiredEdgeFunctions) {
      fixture.edgeFunctions.localFunctionSourceSha256[functionName] = wrongSha;
      fixture.edgeFunctions.observedFunctionSourceSha256[functionName] = wrongSha;
      const deployment = fixture.edgeFunctions.deploymentIdentities.find(
        (entry) => entry.function === functionName,
      );
      if (deployment) deployment.observedSourceSha256 = wrongSha;
    }
    const edgeContent = `${JSON.stringify(fixture.edgeFunctions, null, 2)}\n`;
    writeFileSync(resolve(fixture.root, "edge-functions.json"), edgeContent);
    fixture.manifest.artifacts.edgeFunctions.sha256 = sha256(edgeContent);
    fixture.manifest.evidenceRootSha256 = externalEvidenceRootSha256({
      edgeFunctionsSha256: fixture.manifest.artifacts.edgeFunctions.sha256,
      roleIsolationSha256: fixture.manifest.artifacts.roleIsolation.sha256,
    });
    writeFileSync(
      fixture.manifestPath,
      `${JSON.stringify(fixture.manifest, null, 2)}\n`,
    );
    const artifactsRoot = mkdtempSync(resolve(tmpdir(), "v19-import-edge-git-"));
    const result = spawnSync(
      process.execPath,
      [
        resolve(process.cwd(), "scripts/import-supabase-production-evidence.mjs"),
        "--manifest",
        fixture.manifestPath,
      ],
      {
        cwd: checkout.root,
        encoding: "utf8",
        env: { ...process.env, V19_TEST_ARTIFACTS_DIR: artifactsRoot },
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("does not match Git HEAD");
    expect(
      existsSync(resolve(artifactsRoot, "supabase-production-evidence-import.json")),
    ).toBe(false);
  });

  test("enforces deployment cleanliness and real-path bundle containment", () => {
    const dirty = writeBundle();
    const deploymentDescriptor = dirty.roleIsolation.artifacts.deploymentIdentity;
    const deploymentPath = resolve(dirty.root, deploymentDescriptor.path);
    const deployment = JSON.parse(readFileSync(deploymentPath, "utf8"));
    const dirtyContent = `${JSON.stringify({ ...deployment, observedDirty: true }, null, 2)}\n`;
    writeFileSync(deploymentPath, dirtyContent);
    deploymentDescriptor.sha256 = sha256(dirtyContent);
    const roleContent = `${JSON.stringify(dirty.roleIsolation, null, 2)}\n`;
    writeFileSync(resolve(dirty.root, "role-isolation.json"), roleContent);
    dirty.manifest.artifacts.roleIsolation.sha256 = sha256(roleContent);
    dirty.manifest.evidenceRootSha256 = externalEvidenceRootSha256({
      edgeFunctionsSha256: dirty.manifest.artifacts.edgeFunctions.sha256,
      roleIsolationSha256: dirty.manifest.artifacts.roleIsolation.sha256,
    });
    expect(
      validateExternalEvidenceBundle({
        bundleManifest: dirty.manifest,
        bundleRoot: dirty.root,
        now: Date.parse(checkedAt) + 60_000,
      }).issues,
    ).toEqual(["deploymentIdentity observedDirty mismatch"]);

    const escaped = writeBundle();
    const descriptor = escaped.roleIsolation.artifacts.localVerification;
    const descriptorPath = resolve(escaped.root, descriptor.path);
    unlinkSync(descriptorPath);
    symlinkSync(resolve(process.cwd(), "package.json"), descriptorPath);
    expect(
      validateExternalEvidenceBundle({
        bundleManifest: escaped.manifest,
        bundleRoot: escaped.root,
        now: Date.parse(checkedAt) + 60_000,
      }).issues,
    ).toContain("localVerification path escapes the bundle or is missing");
  });

  test("rejects CAS evidence whose stale-revision canonical readback changed", () => {
    const fixture = writeBundle();
    const descriptor = fixture.roleIsolation.artifacts.agentDatabaseReadback;
    const artifactPath = resolve(fixture.root, descriptor.path);
    const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
    artifact.casReceipts.staleRevision.canonicalRowAfterSha256 = "3".repeat(64);
    const artifactContent = `${JSON.stringify(artifact, null, 2)}\n`;
    writeFileSync(artifactPath, artifactContent);
    descriptor.sha256 = sha256(artifactContent);
    const roleContent = `${JSON.stringify(fixture.roleIsolation, null, 2)}\n`;
    writeFileSync(resolve(fixture.root, "role-isolation.json"), roleContent);
    fixture.manifest.artifacts.roleIsolation.sha256 = sha256(roleContent);
    fixture.manifest.evidenceRootSha256 = externalEvidenceRootSha256({
      edgeFunctionsSha256: fixture.manifest.artifacts.edgeFunctions.sha256,
      roleIsolationSha256: fixture.manifest.artifacts.roleIsolation.sha256,
    });

    expect(
      validateExternalEvidenceBundle({
        bundleManifest: fixture.manifest,
        bundleRoot: fixture.root,
        now: Date.parse(checkedAt) + 60_000,
      }).issues,
    ).toContain("agent CAS stale canonical row readback SHA-256 mismatch");
  });

  test("refuses a symlinked external manifest", () => {
    const root = mkdtempSync(resolve(tmpdir(), "v19-external-manifest-link-"));
    const manifestLink = resolve(root, "bundle.json");
    symlinkSync(resolve(process.cwd(), "package.json"), manifestLink);
    const result = spawnSync(
      process.execPath,
      ["scripts/import-supabase-production-evidence.mjs", "--manifest", manifestLink],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, V19_TEST_ARTIFACTS_DIR: root },
      },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("regular non-symlink file");
  });

  test("rejects an external file replaced after the stable descriptor is opened", () => {
    const outsideRoot = mkdtempSync(resolve(tmpdir(), "v19-stable-file-race-"));
    const path = resolve(outsideRoot, "receipt.json");
    const backupPath = resolve(outsideRoot, "receipt-original.json");
    writeFileSync(path, "first\n");
    const issues: string[] = [];

    const file = readStableExternalFile({
      afterOpenForTest: (realPath) => {
        renameSync(realPath, backupPath);
        writeFileSync(realPath, "second\n");
      },
      issues,
      label: "race receipt",
      repoRoot: process.cwd(),
      value: path,
    });

    expect(file).toBeNull();
    expect(issues).toContain("race receipt changed while it was opened");
  });
});

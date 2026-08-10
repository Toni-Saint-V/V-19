import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";

import { SUPABASE_PRODUCTION_TARGET } from "../../config/supabase-production-target.mjs";
import { edgeFunctionSourceSha256FromGitHead } from "./edge-function-source-identity.mjs";
import {
  migrationContractEntriesFromGitHead,
  migrationContractSha256,
  requiredRemoteMigrationOrderForGeneration,
} from "../supabase-migration-contract.mjs";

export function externalEvidenceRootSha256({
  edgeFunctionsSha256,
  roleIsolationSha256,
}) {
  return sha256(
    JSON.stringify({
      edgeFunctionsSha256,
      roleIsolationSha256,
    }),
  );
}

export function validateExternalEvidenceBundle({
  bundleManifest,
  bundleRoot,
  now = Date.now(),
  repoRoot = process.cwd(),
}) {
  const issues = [];
  exactKeys(
    bundleManifest,
    [
      "artifacts",
      "checkedAt",
      "cutoverGeneration",
      "evidenceRootSha256",
      "gitHead",
      "projectRef",
      "schemaVersion",
      "scope",
      "sourceSha256",
      "status",
    ],
    "bundle manifest",
    issues,
  );
  equal(bundleManifest?.schemaVersion, 1, "bundle schemaVersion", issues);
  equal(
    bundleManifest?.scope,
    "supabase-production-external-evidence-bundle",
    "bundle scope",
    issues,
  );
  equal(bundleManifest?.status, "PASS", "bundle status", issues);
  equal(
    bundleManifest?.projectRef,
    SUPABASE_PRODUCTION_TARGET.projectId,
    "bundle projectRef",
    issues,
  );
  equal(
    bundleManifest?.cutoverGeneration,
    SUPABASE_PRODUCTION_TARGET.cutoverGeneration,
    "bundle generation",
    issues,
  );
  if (!/^[a-f0-9]{40}$/.test(bundleManifest?.gitHead ?? "")) {
    issues.push("bundle gitHead is invalid");
  }
  if (!/^[a-f0-9]{64}$/.test(bundleManifest?.sourceSha256 ?? "")) {
    issues.push("bundle sourceSha256 is invalid");
  }
  validateFreshTimestamp(bundleManifest?.checkedAt, "bundle checkedAt", issues, now);
  exactKeys(
    bundleManifest?.artifacts,
    ["edgeFunctions", "roleIsolation"],
    "bundle artifacts",
    issues,
  );

  const artifacts = {};
  for (const [label, expectedScope] of [
    ["roleIsolation", "supabase-production-role-isolation-runtime"],
    ["edgeFunctions", "supabase-production-edge-functions"],
  ]) {
    const descriptor = bundleManifest?.artifacts?.[label];
    exactKeys(descriptor, ["path", "sha256"], `${label} descriptor`, issues);
    const file = stableContainedFile(bundleRoot, descriptor?.path, label, issues);
    if (!file) continue;
    const { path } = file;
    const content = file.content.toString("utf8");
    equal(sha256(content), descriptor.sha256, `${label} SHA-256`, issues);
    let document;
    try {
      document = JSON.parse(content);
    } catch (error) {
      issues.push(`${label} JSON is invalid: ${error.message}`);
      continue;
    }
    validateArtifactEnvelope(document, expectedScope, bundleManifest, label, issues);
    if (label === "roleIsolation") {
      validateRoleIsolation(
        document,
        bundleRoot,
        bundleManifest,
        issues,
        now,
        repoRoot,
      );
    }
    if (label === "edgeFunctions") {
      validateEdgeFunctions(document, bundleManifest, issues, now, repoRoot);
    }
    artifacts[label] = { content, document, path, sha256: descriptor.sha256 };
  }

  const expectedRoot = externalEvidenceRootSha256({
    edgeFunctionsSha256: bundleManifest?.artifacts?.edgeFunctions?.sha256,
    roleIsolationSha256: bundleManifest?.artifacts?.roleIsolation?.sha256,
  });
  equal(
    bundleManifest?.evidenceRootSha256,
    expectedRoot,
    "bundle evidence-root SHA-256",
    issues,
  );
  return { artifacts, evidenceRootSha256: expectedRoot, issues };
}

export function validateExternalEvidenceImportReceipt({
  packet,
  repoRoot,
  now = Date.now(),
}) {
  const issues = [];
  const section = packet?.externalEvidenceImport ?? {};
  exactKeys(
    section,
    ["artifact", "checkedAt", "evidenceRootSha256", "sha256"],
    "externalEvidenceImport",
    issues,
  );
  const receiptFile = readStableExternalFile({
    issues,
    label: "evidence import receipt",
    repoRoot,
    value: section.artifact,
  });
  if (!receiptFile) return issues;
  const content = receiptFile.content.toString("utf8");
  equal(sha256(content), section.sha256, "evidence import receipt SHA-256", issues);
  let receipt;
  try {
    receipt = JSON.parse(content);
  } catch (error) {
    issues.push(`evidence import receipt JSON is invalid: ${error.message}`);
    return issues;
  }
  exactKeys(
    receipt,
    [
      "artifacts",
      "bundleManifest",
      "checkedAt",
      "cutoverGeneration",
      "evidenceRootSha256",
      "gitHead",
      "importedAt",
      "projectRef",
      "schemaVersion",
      "scope",
      "sourceSha256",
      "status",
    ],
    "evidence import receipt",
    issues,
  );
  equal(receipt.schemaVersion, 1, "evidence import receipt schemaVersion", issues);
  equal(
    receipt.scope,
    "supabase-production-external-evidence-import",
    "evidence import receipt scope",
    issues,
  );
  equal(receipt.status, "PASS", "evidence import receipt status", issues);
  const importedAt = validateTimestamp(
    receipt.importedAt,
    "evidence import receipt importedAt",
    issues,
  );
  const evidenceCheckedAt = validateTimestamp(
    receipt.checkedAt,
    "evidence import receipt checkedAt",
    issues,
  );
  if (Number.isFinite(importedAt) && Number.isFinite(evidenceCheckedAt)) {
    if (importedAt < evidenceCheckedAt) {
      issues.push("evidence import receipt predates the evidence bundle");
    }
    if (importedAt > now + 5 * 60 * 1000) {
      issues.push("evidence import receipt importedAt is in the future");
    }
  }
  for (const key of ["checkedAt", "evidenceRootSha256"]) {
    equal(receipt[key], section[key], `evidence import receipt ${key}`, issues);
  }
  equal(
    receipt.projectRef,
    packet.productionTarget?.projectId,
    "import projectRef",
    issues,
  );
  equal(
    receipt.cutoverGeneration,
    packet.productionTarget?.cutoverGeneration,
    "import generation",
    issues,
  );
  equal(
    receipt.gitHead,
    packet.preActivationVerification?.gitHead,
    "import gitHead",
    issues,
  );
  equal(
    receipt.sourceSha256,
    packet.preActivationVerification?.sourceSha256,
    "import sourceSha256",
    issues,
  );
  equal(
    receipt.artifacts?.roleIsolation?.sha256,
    packet.productionEvidence?.evidenceManifestSha256,
    "import role-isolation SHA-256",
    issues,
  );
  equal(
    receipt.artifacts?.edgeFunctions?.sha256,
    packet.edgeFunctions?.evidenceSha256,
    "import Edge Functions SHA-256",
    issues,
  );
  equal(
    receipt.evidenceRootSha256,
    externalEvidenceRootSha256({
      edgeFunctionsSha256: packet.edgeFunctions?.evidenceSha256,
      roleIsolationSha256: packet.productionEvidence?.evidenceManifestSha256,
    }),
    "import evidence-root SHA-256",
    issues,
  );

  exactKeys(
    receipt.bundleManifest,
    ["path", "sha256"],
    "evidence import bundle manifest descriptor",
    issues,
  );
  for (const label of ["roleIsolation", "edgeFunctions"]) {
    exactKeys(
      receipt.artifacts?.[label],
      ["path", "sha256"],
      `evidence import ${label} descriptor`,
      issues,
    );
  }
  exactKeys(
    receipt.artifacts,
    ["edgeFunctions", "roleIsolation"],
    "evidence import artifacts",
    issues,
  );

  const manifestFile = readStableExternalFile({
    issues,
    label: "evidence bundle manifest",
    repoRoot,
    value: receipt.bundleManifest?.path,
  });
  if (!manifestFile) return issues;
  const manifestPath = manifestFile.path;
  const manifestContent = manifestFile.content.toString("utf8");
  equal(
    sha256(manifestContent),
    receipt.bundleManifest?.sha256,
    "evidence bundle manifest SHA-256",
    issues,
  );
  let manifest;
  try {
    manifest = JSON.parse(manifestContent);
  } catch (error) {
    issues.push(`evidence bundle manifest JSON is invalid: ${error.message}`);
    return issues;
  }
  const validation = validateExternalEvidenceBundle({
    bundleManifest: manifest,
    bundleRoot: dirname(manifestPath),
    now,
    repoRoot,
  });
  issues.push(...validation.issues.map((issue) => `evidence bundle: ${issue}`));
  equal(receipt.checkedAt, manifest.checkedAt, "import bundle checkedAt", issues);
  equal(
    receipt.evidenceRootSha256,
    validation.evidenceRootSha256,
    "import bundle evidence-root SHA-256",
    issues,
  );
  for (const label of ["roleIsolation", "edgeFunctions"]) {
    equal(
      receipt.artifacts?.[label]?.path,
      validation.artifacts?.[label]?.path,
      `import bundle ${label} path`,
      issues,
    );
    equal(
      receipt.artifacts?.[label]?.sha256,
      validation.artifacts?.[label]?.sha256,
      `import bundle ${label} SHA-256`,
      issues,
    );
  }
  return issues;
}

function validateArtifactEnvelope(document, scope, manifest, label, issues) {
  for (const [key, expected] of [
    ["schemaVersion", 1],
    ["scope", scope],
    ["status", "PASS"],
    ["checkedAt", manifest.checkedAt],
    ["projectRef", manifest.projectRef],
    ["cutoverGeneration", manifest.cutoverGeneration],
    ["gitHead", manifest.gitHead],
    ["sourceSha256", manifest.sourceSha256],
  ]) {
    equal(document?.[key], expected, `${label} ${key}`, issues);
  }
}

function validateRoleIsolation(document, bundleRoot, manifest, issues, now, repoRoot) {
  exactKeys(
    document,
    [
      "artifacts",
      "checkedAt",
      "checks",
      "cutoverGeneration",
      "deployedGitSha",
      "gitHead",
      "projectRef",
      "schemaVersion",
      "scope",
      "sourceSha256",
      "status",
    ],
    "role-isolation artifact",
    issues,
  );
  equal(
    document?.deployedGitSha,
    manifest.gitHead,
    "role-isolation deployedGitSha",
    issues,
  );
  validateFreshTimestamp(document?.checkedAt, "role-isolation checkedAt", issues, now);
  exactKeys(
    document?.checks,
    [...SUPABASE_PRODUCTION_TARGET.requiredAdminOnlyProductionEvidence],
    "role-isolation checks",
    issues,
  );
  for (const key of SUPABASE_PRODUCTION_TARGET.requiredAdminOnlyProductionEvidence) {
    equal(document?.checks?.[key], true, `role-isolation check ${key}`, issues);
  }
  exactKeys(
    document?.artifacts,
    Object.keys(SUPABASE_PRODUCTION_TARGET.requiredAdminOnlyEvidenceArtifacts),
    "role-isolation evidence artifacts",
    issues,
  );
  for (const [label, contract] of Object.entries(
    SUPABASE_PRODUCTION_TARGET.requiredAdminOnlyEvidenceArtifacts,
  )) {
    const descriptor = document?.artifacts?.[label];
    exactKeys(
      descriptor,
      ["checkedAt", "path", "sha256"],
      `role-isolation evidence artifact ${label}`,
      issues,
    );
    const file = stableContainedFile(bundleRoot, descriptor?.path, label, issues);
    if (!file) continue;
    const content = file.content.toString("utf8");
    equal(sha256(content), descriptor?.sha256, `${label} SHA-256`, issues);
    let artifact;
    try {
      artifact = JSON.parse(content);
    } catch (error) {
      issues.push(`${label} JSON is invalid: ${error.message}`);
      continue;
    }
    validateRoleEvidenceDocument({
      artifact,
      issues,
      label,
      manifest,
      repoRoot,
    });
    validateArtifactEnvelope(artifact, contract.scope, manifest, label, issues);
    equal(artifact?.checkedAt, descriptor?.checkedAt, `${label} checkedAt`, issues);
    validateFreshTimestamp(artifact?.checkedAt, `${label} checkedAt`, issues, now);
    exactKeys(artifact?.checks, [...contract.checks], `${label} checks`, issues);
    for (const check of contract.checks) {
      equal(artifact?.checks?.[check], true, `${label} check ${check}`, issues);
    }
  }
}

function validateRoleEvidenceDocument({ artifact, issues, label, manifest, repoRoot }) {
  const envelopeKeys = [
    "checkedAt",
    "checks",
    "cutoverGeneration",
    "gitHead",
    "projectRef",
    "schemaVersion",
    "scope",
    "sourceSha256",
    "status",
  ];
  const labelKeys = {
    agentDatabaseReadback: ["casReceipts"],
    adminBrowserFlow: ["canonicalHost", "deploymentId", "observedGitSha"],
    agentBrowserFlow: ["canonicalHost", "deploymentId", "observedGitSha"],
    deploymentIdentity: [
      "canonicalHost",
      "canonicalGitSourceSha256",
      "deploymentId",
      "expectedEffectiveArchiveSourceSha256",
      "expectedGitSha",
      "observedDirty",
      "observedEffectiveArchiveSourceSha256",
      "observedGitSha",
      "observedReleaseIdentitySchemaVersion",
    ],
    remoteMigrationHistory: [
      "contractSha256",
      "expectedContract",
      "expectedOrder",
      "observedContract",
      "observedOrder",
    ],
  };
  exactKeys(
    artifact,
    [...envelopeKeys, ...(labelKeys[label] ?? [])],
    `role-isolation evidence document ${label}`,
    issues,
  );

  if (["adminBrowserFlow", "agentBrowserFlow", "deploymentIdentity"].includes(label)) {
    equal(
      artifact?.canonicalHost,
      SUPABASE_PRODUCTION_TARGET.canonicalApplicationHost,
      `${label} canonicalHost`,
      issues,
    );
    if (!/^dpl_[A-Za-z0-9]+$/.test(artifact?.deploymentId ?? "")) {
      issues.push(`${label} deploymentId is invalid`);
    }
    equal(
      artifact?.observedGitSha,
      manifest.gitHead,
      `${label} observedGitSha`,
      issues,
    );
  }
  if (label === "deploymentIdentity") {
    equal(
      artifact?.expectedGitSha,
      manifest.gitHead,
      `${label} expectedGitSha`,
      issues,
    );
    equal(artifact?.observedDirty, false, `${label} observedDirty`, issues);
    equal(
      artifact?.canonicalGitSourceSha256,
      manifest.sourceSha256,
      `${label} canonicalGitSourceSha256`,
      issues,
    );
    equal(
      artifact?.observedEffectiveArchiveSourceSha256,
      artifact?.expectedEffectiveArchiveSourceSha256,
      `${label} effective archive source SHA-256`,
      issues,
    );
    equal(
      artifact?.observedReleaseIdentitySchemaVersion,
      2,
      `${label} release identity schemaVersion`,
      issues,
    );
    for (const key of [
      "expectedEffectiveArchiveSourceSha256",
      "observedEffectiveArchiveSourceSha256",
    ]) {
      if (!/^[a-f0-9]{64}$/.test(artifact?.[key] ?? "")) {
        issues.push(`${label} ${key} is invalid`);
      }
    }
  }
  if (label === "agentDatabaseReadback") {
    validateAgentCasReceipts(artifact?.casReceipts, issues);
  }
  if (label === "remoteMigrationHistory") {
    const expectedOrder = requiredRemoteMigrationOrderForGeneration(
      SUPABASE_PRODUCTION_TARGET.cutoverGeneration,
    );
    let expectedContract = [];
    try {
      expectedContract = migrationContractEntriesFromGitHead(repoRoot);
    } catch (error) {
      issues.push(
        `remoteMigrationHistory Git contract is unreadable: ${error.message}`,
      );
    }
    equalJson(artifact?.expectedOrder, expectedOrder, `${label} expectedOrder`, issues);
    equalJson(artifact?.observedOrder, expectedOrder, `${label} observedOrder`, issues);
    equalJson(
      artifact?.expectedContract,
      expectedContract,
      `${label} expectedContract`,
      issues,
    );
    equalJson(
      artifact?.observedContract,
      expectedContract,
      `${label} observedContract`,
      issues,
    );
    equal(
      artifact?.contractSha256,
      migrationContractSha256(expectedContract),
      `${label} contractSha256`,
      issues,
    );
  }
}

function validateAgentCasReceipts(receipts, issues) {
  exactKeys(
    receipts,
    ["fingerprintMismatch", "identicalReplay", "staleRevision"],
    "agentDatabaseReadback CAS receipts",
    issues,
  );
  const identical = receipts?.identicalReplay;
  exactKeys(
    identical,
    [
      "canonicalCaseRevision",
      "firstCaseRevision",
      "firstResultSha256",
      "operationId",
      "passed",
      "replayCaseRevision",
      "replayResultSha256",
    ],
    "agentDatabaseReadback identical replay receipt",
    issues,
  );
  equal(identical?.passed, true, "agent CAS identical replay passed", issues);
  validUuid(identical?.operationId, "agent CAS identical replay operationId", issues);
  validRevision(
    identical?.canonicalCaseRevision,
    "agent CAS identical replay canonical revision",
    issues,
  );
  equal(
    identical?.firstCaseRevision,
    identical?.canonicalCaseRevision,
    "agent CAS identical replay first revision",
    issues,
  );
  equal(
    identical?.replayCaseRevision,
    identical?.canonicalCaseRevision,
    "agent CAS identical replay revision",
    issues,
  );
  validSha256(
    identical?.firstResultSha256,
    "agent CAS identical replay first result SHA-256",
    issues,
  );
  equal(
    identical?.replayResultSha256,
    identical?.firstResultSha256,
    "agent CAS identical replay result SHA-256",
    issues,
  );

  const mismatch = receipts?.fingerprintMismatch;
  exactKeys(
    mismatch,
    ["canonicalCaseRevision", "errorCode", "operationId", "passed"],
    "agentDatabaseReadback fingerprint mismatch receipt",
    issues,
  );
  equal(mismatch?.passed, true, "agent CAS fingerprint mismatch passed", issues);
  equal(mismatch?.errorCode, "23514", "agent CAS fingerprint error code", issues);
  equal(
    mismatch?.operationId,
    identical?.operationId,
    "agent CAS fingerprint operationId binding",
    issues,
  );
  equal(
    mismatch?.canonicalCaseRevision,
    identical?.canonicalCaseRevision,
    "agent CAS fingerprint canonical revision",
    issues,
  );

  const stale = receipts?.staleRevision;
  exactKeys(
    stale,
    [
      "canonicalCaseRevisionAfter",
      "canonicalCaseRevisionBefore",
      "canonicalRowAfterSha256",
      "canonicalRowBeforeSha256",
      "errorCode",
      "operationId",
      "passed",
      "staleExpectedRevision",
    ],
    "agentDatabaseReadback stale revision receipt",
    issues,
  );
  equal(stale?.passed, true, "agent CAS stale revision passed", issues);
  equal(stale?.errorCode, "40001", "agent CAS stale revision error code", issues);
  validUuid(stale?.operationId, "agent CAS stale revision operationId", issues);
  validRevision(
    stale?.canonicalCaseRevisionBefore,
    "agent CAS stale canonical revision",
    issues,
  );
  equal(
    stale?.canonicalCaseRevisionAfter,
    stale?.canonicalCaseRevisionBefore,
    "agent CAS stale canonical revision readback",
    issues,
  );
  validSha256(
    stale?.canonicalRowBeforeSha256,
    "agent CAS stale canonical row SHA-256",
    issues,
  );
  equal(
    stale?.canonicalRowAfterSha256,
    stale?.canonicalRowBeforeSha256,
    "agent CAS stale canonical row readback SHA-256",
    issues,
  );
  if (
    !Number.isSafeInteger(stale?.staleExpectedRevision) ||
    stale.staleExpectedRevision < 1 ||
    stale.staleExpectedRevision >= stale?.canonicalCaseRevisionBefore
  ) {
    issues.push("agent CAS stale expected revision is not older than canonical");
  }
}

function validUuid(value, label, issues) {
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value ?? "")) {
    issues.push(`${label} is invalid`);
  }
}

function validRevision(value, label, issues) {
  if (!Number.isSafeInteger(value) || value < 1) issues.push(`${label} is invalid`);
}

function validSha256(value, label, issues) {
  if (!/^[a-f0-9]{64}$/.test(value ?? "")) issues.push(`${label} is invalid`);
}

function validateEdgeFunctions(document, manifest, issues, now, repoRoot) {
  exactKeys(
    document,
    [
      "checkedAt",
      "cutoverGeneration",
      "deployed",
      "deploymentIdentities",
      "dryRunsPassed",
      "expectedFunctions",
      "gitHead",
      "localContractChecked",
      "localFunctionSourceSha256",
      "missingSecretNames",
      "observedFunctionSourceSha256",
      "observedFunctions",
      "projectRef",
      "remoteListChecked",
      "requiredSecretNames",
      "runtimeChecks",
      "schemaVersion",
      "scope",
      "semanticChecksPassed",
      "semanticReceipts",
      "sourceIdentityBound",
      "sourceSha256",
      "status",
    ],
    "Edge Functions artifact",
    issues,
  );
  validateFreshTimestamp(document?.checkedAt, "Edge Functions checkedAt", issues, now);
  for (const key of [
    "deployed",
    "dryRunsPassed",
    "localContractChecked",
    "remoteListChecked",
    "semanticChecksPassed",
    "sourceIdentityBound",
  ]) {
    equal(document?.[key], true, `Edge Functions ${key}`, issues);
  }
  const requiredFunctions = [...SUPABASE_PRODUCTION_TARGET.requiredEdgeFunctions];
  equalJson(
    document?.expectedFunctions,
    requiredFunctions,
    "Edge expectedFunctions",
    issues,
  );
  equalJson(
    document?.observedFunctions,
    requiredFunctions,
    "Edge observedFunctions",
    issues,
  );
  equalJson(
    document?.requiredSecretNames,
    [...SUPABASE_PRODUCTION_TARGET.requiredEdgeFunctionSecretNames],
    "Edge requiredSecretNames",
    issues,
  );
  equalJson(document?.missingSecretNames, [], "Edge missingSecretNames", issues);
  exactKeys(
    document?.localFunctionSourceSha256,
    requiredFunctions,
    "Edge local source identities",
    issues,
  );
  exactKeys(
    document?.observedFunctionSourceSha256,
    requiredFunctions,
    "Edge observed source identities",
    issues,
  );
  const gitFunctionSourceSha256 = {};
  for (const functionName of requiredFunctions) {
    const localSha = document?.localFunctionSourceSha256?.[functionName];
    const observedSha = document?.observedFunctionSourceSha256?.[functionName];
    let gitSha = "";
    try {
      gitSha = edgeFunctionSourceSha256FromGitHead(repoRoot, functionName);
      gitFunctionSourceSha256[functionName] = gitSha;
    } catch (error) {
      issues.push(
        `Edge ${functionName} Git source SHA-256 is unreadable: ${error.message}`,
      );
    }
    if (!/^[a-f0-9]{64}$/.test(localSha ?? "")) {
      issues.push(`Edge ${functionName} local source SHA-256 is invalid`);
    }
    equal(
      localSha,
      gitSha,
      `Edge ${functionName} local source SHA-256 does not match Git HEAD`,
      issues,
    );
    equal(observedSha, gitSha, `Edge ${functionName} observed source SHA-256`, issues);
  }

  const semanticReceipts = Array.isArray(document?.semanticReceipts)
    ? document.semanticReceipts
    : [];
  const deploymentIdentities = Array.isArray(document?.deploymentIdentities)
    ? document.deploymentIdentities
    : [];
  const runtimeChecks = Array.isArray(document?.runtimeChecks)
    ? document.runtimeChecks
    : [];
  equal(
    semanticReceipts.length,
    requiredFunctions.length,
    "Edge semantic receipt cardinality",
    issues,
  );
  equal(
    deploymentIdentities.length,
    requiredFunctions.length,
    "Edge deployment identity cardinality",
    issues,
  );
  equal(
    runtimeChecks.length,
    requiredFunctions.length,
    "Edge runtime check cardinality",
    issues,
  );

  for (const receipt of semanticReceipts) {
    exactKeys(
      receipt,
      [
        "action",
        "canonicalReadbackSha256",
        "function",
        "passed",
        "requestNonce",
        "responseNonce",
      ],
      "Edge semantic receipt",
      issues,
    );
  }
  for (const identity of deploymentIdentities) {
    exactKeys(
      identity,
      ["deploymentId", "function", "observedSourceSha256", "version"],
      "Edge deployment identity",
      issues,
    );
  }
  for (const runtimeCheck of runtimeChecks) {
    exactKeys(
      runtimeCheck,
      ["capability", "function", "passed", "statusCode"],
      "Edge runtime check",
      issues,
    );
  }
  for (const functionName of requiredFunctions) {
    const deployments = deploymentIdentities.filter(
      (item) => item?.function === functionName,
    );
    const receipts = semanticReceipts.filter((item) => item?.function === functionName);
    const checks = runtimeChecks.filter((item) => item?.function === functionName);
    equal(deployments.length, 1, `Edge ${functionName} deployment identity`, issues);
    equal(receipts.length, 1, `Edge ${functionName} semantic receipt`, issues);
    equal(checks.length, 1, `Edge ${functionName} runtime check`, issues);
    const deployment = deployments[0];
    if (
      typeof deployment?.deploymentId !== "string" ||
      !deployment.deploymentId.trim()
    ) {
      issues.push(`Edge ${functionName} deploymentId is missing`);
    }
    if (typeof deployment?.version !== "string" || !deployment.version.trim()) {
      issues.push(`Edge ${functionName} version is missing`);
    }
    equal(
      deployment?.observedSourceSha256,
      gitFunctionSourceSha256[functionName],
      `Edge ${functionName} deployment source SHA-256`,
      issues,
    );
    const receipt = receipts[0];
    equal(
      receipt?.passed,
      true,
      `Edge ${functionName} semantic receipt passed`,
      issues,
    );
    equal(
      receipt?.action,
      SUPABASE_PRODUCTION_TARGET.requiredEdgeFunctionSemanticActions[functionName],
      `Edge ${functionName} semantic action`,
      issues,
    );
    if (!/^[A-Za-z0-9_-]{16,}$/.test(receipt?.requestNonce ?? "")) {
      issues.push(`Edge ${functionName} semantic request nonce is invalid`);
    }
    equal(
      receipt?.responseNonce,
      receipt?.requestNonce,
      `Edge ${functionName} semantic response nonce`,
      issues,
    );
    if (!/^[a-f0-9]{64}$/.test(receipt?.canonicalReadbackSha256 ?? "")) {
      issues.push(`Edge ${functionName} canonical readback SHA-256 is invalid`);
    }
    const runtimeCheck = checks[0];
    equal(
      runtimeCheck?.passed,
      true,
      `Edge ${functionName} runtime check passed`,
      issues,
    );
    equal(runtimeCheck?.statusCode, 200, `Edge ${functionName} runtime status`, issues);
    equal(
      runtimeCheck?.capability,
      SUPABASE_PRODUCTION_TARGET.requiredEdgeFunctionCapabilities[functionName],
      `Edge ${functionName} runtime capability`,
      issues,
    );
  }
}

function stableContainedFile(root, value, label, issues) {
  if (typeof value !== "string" || !value.trim() || isAbsolute(value)) {
    issues.push(`${label} path must be relative to the evidence bundle`);
    return null;
  }
  const path = resolve(root, value);
  const realRoot = realpathSync(root);
  const file = readStableFile(path, label, issues, {
    validateRealPath: (realPath) => {
      const relation = relative(realRoot, realPath);
      if (relation.startsWith("..") || isAbsolute(relation) || relation === "") {
        issues.push(`${label} path escapes the bundle or is missing`);
        return false;
      }
      return true;
    },
  });
  if (!file) {
    if (!issues.includes(`${label} path escapes the bundle or is missing`)) {
      issues.push(`${label} path escapes the bundle or is missing`);
    }
    return null;
  }
  return file;
}

export function readStableExternalFile({
  repoRoot,
  value,
  issues,
  label = "external evidence",
  afterOpenForTest,
}) {
  if (typeof value !== "string" || !value.trim()) {
    issues.push(`${label} path is missing`);
    return null;
  }
  const path = isAbsolute(value) ? value : resolve(repoRoot, value);
  const realRepoRoot = realpathSync(repoRoot);
  return readStableFile(path, label, issues, {
    afterOpenForTest,
    validateRealPath: (realPath) => {
      const relation = relative(realRepoRoot, realPath);
      if (!relation.startsWith("..") || isAbsolute(relation)) {
        issues.push(`${label} must exist outside the repository`);
        return false;
      }
      return true;
    },
  });
}

export function writeStableExternalFile({
  afterTempOpenForTest,
  afterPublishFailureForTest,
  beforePublishForTest,
  content,
  label = "external artifact",
  path,
  repoRoot,
}) {
  const requestedParent = dirname(resolve(path));
  const lexicalRelation = relative(resolve(repoRoot), requestedParent);
  if (!lexicalRelation.startsWith("..") || isAbsolute(lexicalRelation)) {
    throw new Error(`${label} directory must be outside the repository`);
  }

  ensureExternalDirectory(requestedParent, repoRoot, label);
  const parentStat = lstatSync(requestedParent, { bigint: true });
  if (parentStat.isSymbolicLink() || !parentStat.isDirectory()) {
    throw new Error(`${label} directory must be a regular non-symlink directory`);
  }
  const realParent = realpathSync(requestedParent);
  const realRelation = relative(realpathSync(repoRoot), realParent);
  if (!realRelation.startsWith("..") || isAbsolute(realRelation)) {
    throw new Error(`${label} directory must be outside the repository`);
  }

  const outputPath = resolve(realParent, basename(path));
  assertReplaceableExternalOutput(outputPath, label);
  const temporaryPath = resolve(
    realParent,
    `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let descriptor;
  let written;
  let writeError;
  try {
    descriptor = openSync(
      temporaryPath,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        (constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    const opened = fstatSync(descriptor, { bigint: true });
    const named = lstatSync(temporaryPath, { bigint: true });
    if (
      !opened.isFile() ||
      named.isSymbolicLink() ||
      !named.isFile() ||
      opened.dev !== named.dev ||
      opened.ino !== named.ino
    ) {
      throw new Error(`${label} changed while it was opened`);
    }
    afterTempOpenForTest?.({
      outputPath,
      parentPath: realParent,
      temporaryPath,
    });
    writeFileSync(descriptor, content);
    fsyncSync(descriptor);
    written = fstatSync(descriptor, { bigint: true });
    const current = lstatSync(temporaryPath, { bigint: true });
    const currentParent = lstatSync(realParent, { bigint: true });
    if (
      opened.dev !== written.dev ||
      opened.ino !== written.ino ||
      written.dev !== current.dev ||
      written.ino !== current.ino ||
      parentStat.dev !== currentParent.dev ||
      parentStat.ino !== currentParent.ino
    ) {
      throw new Error(`${label} changed while it was written`);
    }
  } catch (error) {
    writeError = error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  if (writeError) {
    // Node has no atomic unlink-by-handle primitive. Preserve the high-entropy,
    // mode-0600 pathname rather than risk deleting a foreign replacement.
    throw writeError;
  }
  try {
    beforePublishForTest?.({
      outputPath,
      parentPath: realParent,
      temporaryPath,
    });
    assertReplaceableExternalOutput(outputPath, label);
    renameSync(temporaryPath, outputPath);
    const published = lstatSync(outputPath, { bigint: true });
    const currentParent = lstatSync(realParent, { bigint: true });
    if (
      published.isSymbolicLink() ||
      !published.isFile() ||
      published.dev !== written.dev ||
      published.ino !== written.ino ||
      parentStat.dev !== currentParent.dev ||
      parentStat.ino !== currentParent.ino
    ) {
      throw new Error(`${label} changed while it was published`);
    }
    return outputPath;
  } catch (error) {
    afterPublishFailureForTest?.({
      outputPath,
      parentPath: realParent,
      temporaryPath,
    });
    // Do not unlink either pathname after identity loss: lstat + unlink would
    // be racy and could delete a concurrent writer's replacement.
    throw error;
  }
}

function assertReplaceableExternalOutput(path, label) {
  try {
    const existing = lstatSync(path);
    if (existing.isSymbolicLink() || !existing.isFile()) {
      throw new Error(`${label} must be a regular non-symlink file`);
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function ensureExternalDirectory(path, repoRoot, label) {
  let ancestor = path;
  for (;;) {
    try {
      const stat = lstatSync(ancestor);
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new Error(`${label} directory must be a regular non-symlink directory`);
      }
      const relation = relative(realpathSync(repoRoot), realpathSync(ancestor));
      if (!relation.startsWith("..") || isAbsolute(relation)) {
        throw new Error(`${label} directory must be outside the repository`);
      }
      break;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const parent = dirname(ancestor);
      if (parent === ancestor) throw error;
      ancestor = parent;
    }
  }
  mkdirSync(path, { recursive: true });
}

function readStableFile(path, label, issues, { afterOpenForTest, validateRealPath }) {
  const issueCount = issues.length;
  let descriptor;
  try {
    const requested = lstatSync(path, { bigint: true });
    if (requested.isSymbolicLink() || !requested.isFile()) {
      issues.push(`${label} must be a regular non-symlink file`);
      return null;
    }
    const realPath = realpathSync(path);
    if (!validateRealPath(realPath)) return null;
    descriptor = openSync(realPath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor, { bigint: true });
    afterOpenForTest?.(realPath);
    const named = lstatSync(realPath, { bigint: true });
    if (
      !before.isFile() ||
      named.isSymbolicLink() ||
      !named.isFile() ||
      requested.dev !== before.dev ||
      requested.ino !== before.ino ||
      before.dev !== named.dev ||
      before.ino !== named.ino
    ) {
      issues.push(`${label} changed while it was opened`);
      return null;
    }
    const content = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    const current = lstatSync(realPath, { bigint: true });
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs ||
      after.dev !== current.dev ||
      after.ino !== current.ino
    ) {
      issues.push(`${label} changed while it was read`);
      return null;
    }
    return issues.length === issueCount ? { content, path: realPath } : null;
  } catch (error) {
    issues.push(`${label} cannot be read safely: ${error.message}`);
    return null;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function exactKeys(value, expected, label, issues) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    issues.push(`${label} must be an object`);
    return;
  }
  const observed = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(observed) !== JSON.stringify(wanted)) {
    issues.push(`${label} keys mismatch`);
  }
}

function equal(observed, expected, label, issues) {
  if (observed !== expected) issues.push(`${label} mismatch`);
}

function equalJson(observed, expected, label, issues) {
  if (JSON.stringify(observed) !== JSON.stringify(expected)) {
    issues.push(`${label} mismatch`);
  }
}

function validateTimestamp(value, label, issues) {
  const timestamp = Date.parse(value ?? "");
  if (!Number.isFinite(timestamp)) issues.push(`${label} is invalid`);
  return timestamp;
}

function validateFreshTimestamp(value, label, issues, now) {
  const timestamp = validateTimestamp(value, label, issues);
  if (!Number.isFinite(timestamp)) return;
  const notBefore = Date.parse(SUPABASE_PRODUCTION_TARGET.evidenceNotBefore);
  if (timestamp < notBefore) issues.push(`${label} predates the evidence window`);
  if (timestamp > now + 5 * 60 * 1000) issues.push(`${label} is in the future`);
  if (now - timestamp > SUPABASE_PRODUCTION_TARGET.maxEvidenceAgeMs) {
    issues.push(`${label} is stale`);
  }
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

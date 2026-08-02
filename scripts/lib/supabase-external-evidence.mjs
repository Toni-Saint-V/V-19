import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

import { SUPABASE_PRODUCTION_TARGET } from "../../config/supabase-production-target.mjs";

export function externalEvidenceRootSha256({ edgeFunctionsSha256, roleIsolationSha256 }) {
  return sha256(
    JSON.stringify({
      edgeFunctionsSha256,
      roleIsolationSha256,
    }),
  );
}

export function validateExternalEvidenceBundle({ bundleManifest, bundleRoot }) {
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
    const path = containedPath(bundleRoot, descriptor?.path, label, issues);
    if (!path) continue;
    const content = readFileSync(path, "utf8");
    equal(sha256(content), descriptor.sha256, `${label} SHA-256`, issues);
    let document;
    try {
      document = JSON.parse(content);
    } catch (error) {
      issues.push(`${label} JSON is invalid: ${error.message}`);
      continue;
    }
    validateArtifactEnvelope(document, expectedScope, bundleManifest, label, issues);
    if (label === "roleIsolation") validateRoleIsolation(document, issues);
    if (label === "edgeFunctions") validateEdgeFunctions(document, issues);
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

export function validateExternalEvidenceImportReceipt({ packet, repoRoot }) {
  const issues = [];
  const section = packet?.externalEvidenceImport ?? {};
  exactKeys(
    section,
    ["artifact", "checkedAt", "evidenceRootSha256", "sha256"],
    "externalEvidenceImport",
    issues,
  );
  const path = outsideRepositoryPath(repoRoot, section.artifact, issues);
  if (!path) return issues;
  const content = readFileSync(path, "utf8");
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
  for (const key of ["checkedAt", "evidenceRootSha256"]) {
    equal(receipt[key], section[key], `evidence import receipt ${key}`, issues);
  }
  equal(receipt.projectRef, packet.productionTarget?.projectId, "import projectRef", issues);
  equal(
    receipt.cutoverGeneration,
    packet.productionTarget?.cutoverGeneration,
    "import generation",
    issues,
  );
  equal(receipt.gitHead, packet.preActivationVerification?.gitHead, "import gitHead", issues);
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
  return issues;
}

function validateArtifactEnvelope(document, scope, manifest, label, issues) {
  for (const [key, expected] of [
    ["schemaVersion", 1],
    ["scope", scope],
    ["status", "PASS"],
    ["projectRef", manifest.projectRef],
    ["cutoverGeneration", manifest.cutoverGeneration],
    ["gitHead", manifest.gitHead],
    ["sourceSha256", manifest.sourceSha256],
  ]) {
    equal(document?.[key], expected, `${label} ${key}`, issues);
  }
}

function validateRoleIsolation(document, issues) {
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
}

function validateEdgeFunctions(document, issues) {
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
  for (const receipt of document?.semanticReceipts ?? []) {
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
  for (const identity of document?.deploymentIdentities ?? []) {
    exactKeys(
      identity,
      ["deploymentId", "function", "observedSourceSha256", "version"],
      "Edge deployment identity",
      issues,
    );
  }
}

function containedPath(root, value, label, issues) {
  if (typeof value !== "string" || !value.trim() || isAbsolute(value)) {
    issues.push(`${label} path must be relative to the evidence bundle`);
    return "";
  }
  const path = resolve(root, value);
  const relation = relative(resolve(root), path);
  if (relation.startsWith("..") || !existsSync(path)) {
    issues.push(`${label} path escapes the bundle or is missing`);
    return "";
  }
  return path;
}

function outsideRepositoryPath(repoRoot, value, issues) {
  if (typeof value !== "string" || !value.trim()) {
    issues.push("evidence import receipt path is missing");
    return "";
  }
  const path = isAbsolute(value) ? value : resolve(repoRoot, value);
  const relation = relative(repoRoot, path);
  if (!relation.startsWith("..") || !existsSync(path)) {
    issues.push("evidence import receipt must exist outside the repository");
    return "";
  }
  return path;
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

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

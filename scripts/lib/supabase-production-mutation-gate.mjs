import { execFileSync } from "node:child_process";
import { createHash, createPublicKey, verify } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { SUPABASE_PRODUCTION_TARGET } from "../../config/supabase-production-target.mjs";
import {
  migrationContractEntriesFromGitHead,
  migrationContractSha256,
} from "../supabase-migration-contract.mjs";
import {
  cutoverEvidenceRootSha256,
  cutoverPhaseContract,
  validateExternalApprovalPacketBinding,
  validateBoundEvidence,
} from "./supabase-cutover-evidence.mjs";
import {
  releaseSourceSha256FromFileSystem,
  releaseSourceSha256FromGitHead,
} from "./release-source-identity.mjs";
import {
  readStableExternalFile,
  validateExternalEvidenceImportReceipt,
} from "./supabase-external-evidence.mjs";

export function assertProductionMutationAllowed({
  action,
  expectedOwnerPublicKeySha256 = SUPABASE_PRODUCTION_TARGET.ownerApprovalPublicKeySha256,
  now = Date.now(),
  repoRoot,
  readinessPath,
}) {
  const issues = [];
  const externalReadiness = externalFile(
    readinessPath,
    repoRoot,
    "production approval packet",
    issues,
  );
  if (issues.length > 0) {
    throw new Error(`Production mutation refused: ${issues.join("; ")}`);
  }
  const packet = parseJson(
    externalReadiness.content.toString("utf8"),
    "production approval packet",
    issues,
  );
  const trackedReadinessPath = resolve(
    repoRoot,
    "docs/release/supabase-production-readiness.json",
  );
  const trackedContent = readText(trackedReadinessPath, "tracked readiness", issues);
  const trackedPacket = parseJson(trackedContent, "tracked readiness", issues);
  issues.push(
    ...validateExternalApprovalPacketBinding({
      approvalPacket: packet,
      trackedContent,
      trackedPacket,
    }),
  );
  const phase = cutoverPhaseContract(packet.phase);
  requireEqual(packet.status, "GO", "readiness status must be GO", issues);
  requireEqual(packet.goNoGo?.decision, "GO", "Go/No-Go decision must be GO", issues);
  requireEqual(phase?.status, "GO", "approved phase is not enabled", issues);
  if (issues.length > 0) {
    throw new Error(`Production mutation refused: ${issues.join("; ")}`);
  }
  const gitHead = git(repoRoot, ["rev-parse", "HEAD"], issues).trim();
  const gitStatus = git(repoRoot, ["status", "--porcelain"], issues).trim();
  const gitSourceSha256 = safe(
    () => releaseSourceSha256FromGitHead(repoRoot),
    "Git source digest is unreadable",
    issues,
  );
  const fileSourceSha256 = safe(
    () => releaseSourceSha256FromFileSystem(repoRoot),
    "Filesystem source digest is unreadable",
    issues,
  );
  const migrationContractSha = safe(
    () => migrationContractSha256(migrationContractEntriesFromGitHead(repoRoot)),
    "Git migration contract is unreadable",
    issues,
  );
  requireEqual(
    packet.productionTarget?.projectId,
    SUPABASE_PRODUCTION_TARGET.projectId,
    "projectRef mismatch",
    issues,
  );
  requireEqual(
    packet.productionTarget?.cutoverGeneration,
    SUPABASE_PRODUCTION_TARGET.cutoverGeneration,
    "cutover generation mismatch",
    issues,
  );
  requireEqual(gitStatus, "", "working tree must be clean", issues);
  requireEqual(
    packet.preActivationVerification?.gitHead,
    gitHead,
    "pre-activation Git SHA mismatch",
    issues,
  );
  requireEqual(
    fileSourceSha256,
    gitSourceSha256,
    "filesystem source differs from Git HEAD",
    issues,
  );
  requireEqual(
    packet.preActivationVerification?.sourceSha256,
    gitSourceSha256,
    "pre-activation source digest mismatch",
    issues,
  );
  requireEqual(
    packet.migrationContract?.expectedContractSha256,
    migrationContractSha,
    "migration contract digest mismatch",
    issues,
  );
  requireEqual(
    packet.deploymentGate?.productionMutationApproved,
    true,
    "production mutation approval is absent",
    issues,
  );
  requireEqual(
    packet.ownerApproval?.mechanism,
    "detached-signature",
    "authenticated owner approval mechanism is absent",
    issues,
  );
  verifyDetachedOwnerApproval({
    action,
    approval: packet.ownerApproval ?? {},
    evidenceRootSha256: cutoverEvidenceRootSha256(packet),
    expectedPublicKeySha256: expectedOwnerPublicKeySha256,
    gitHead,
    issues,
    now,
    repoRoot,
    sourceSha256: gitSourceSha256,
  });
  issues.push(...validateExternalEvidenceImportReceipt({ now, packet, repoRoot }));
  if (action === "migration-apply") {
    requireEqual(
      packet.migrationContract?.dryRunPassed,
      true,
      "successful migration dry-run evidence is absent",
      issues,
    );
    requireEqual(
      packet.migrationContract?.dryRunContractSha256,
      migrationContractSha,
      "migration dry-run contract digest mismatch",
      issues,
    );
    verifyMigrationDryRunReceipt({
      gitHead,
      issues,
      migrationContractSha,
      packet,
      repoRoot,
      sourceSha256: gitSourceSha256,
    });
  }

  if (issues.length > 0) {
    throw new Error(`Production mutation refused: ${issues.join("; ")}`);
  }
  return { gitHead, migrationContractSha, sourceSha256: gitSourceSha256 };
}

export function productionApprovalPacketPath(repoRoot) {
  const issues = [];
  const file = externalFile(
    process.env.SUPABASE_PRODUCTION_APPROVAL_PACKET_PATH,
    repoRoot,
    "production approval packet",
    issues,
  );
  if (issues.length > 0) {
    throw new Error(`Production mutation refused: ${issues.join("; ")}`);
  }
  return file.path;
}

function verifyMigrationDryRunReceipt({
  gitHead,
  issues,
  migrationContractSha,
  packet,
  repoRoot,
  sourceSha256,
}) {
  const migration = packet.migrationContract ?? {};
  const receiptFile = externalFile(
    migration.dryRunEvidenceArtifact,
    repoRoot,
    "migration dry-run receipt",
    issues,
  );
  if (!receiptFile) return;
  try {
    const content = receiptFile.content.toString("utf8");
    const validation = validateBoundEvidence({
      content,
      expectedCheckedAt: migration.dryRunCheckedAt,
      expectedGeneration: SUPABASE_PRODUCTION_TARGET.cutoverGeneration,
      expectedProjectRef: SUPABASE_PRODUCTION_TARGET.projectId,
      expectedScope: "supabase-production-migration-dry-run",
      expectedSha256: migration.dryRunEvidenceSha256,
      expectedGitHead: gitHead,
      expectedSourceSha256: sourceSha256,
      evidenceNotBefore: SUPABASE_PRODUCTION_TARGET.evidenceNotBefore,
      maxAgeMs: SUPABASE_PRODUCTION_TARGET.maxEvidenceAgeMs,
    });
    issues.push(
      ...validation.issues.map((issue) => `migration dry-run receipt ${issue}`),
    );
    requireEqual(
      validation.document?.checks?.migrationDryRunPassed,
      true,
      "migration dry-run receipt did not pass",
      issues,
    );
    requireEqual(
      validation.document?.contractSha256,
      migrationContractSha,
      "migration dry-run receipt contract digest mismatch",
      issues,
    );
    requireEqual(
      JSON.stringify(validation.document?.expectedContract),
      JSON.stringify(migrationContractEntriesFromGitHead(repoRoot)),
      "migration dry-run receipt exact contract mismatch",
      issues,
    );
  } catch (error) {
    issues.push(`migration dry-run receipt verification failed: ${error.message}`);
  }
}

export function verifyDetachedOwnerApproval({
  action,
  approval,
  evidenceRootSha256,
  expectedPublicKeySha256 = SUPABASE_PRODUCTION_TARGET.ownerApprovalPublicKeySha256,
  gitHead,
  issues,
  now = Date.now(),
  repoRoot,
  sourceSha256,
}) {
  if (!expectedPublicKeySha256) {
    issues.push("owner approval public-key fingerprint is not configured");
    return;
  }
  const receiptFile = externalFile(
    approval.receiptPath,
    repoRoot,
    "owner approval receipt",
    issues,
  );
  const signatureFile = externalFile(
    approval.signaturePath,
    repoRoot,
    "owner approval signature",
    issues,
  );
  const publicKeyFile = externalFile(
    approval.publicKeyPath,
    repoRoot,
    "owner approval public key",
    issues,
  );
  if (!receiptFile || !signatureFile || !publicKeyFile) return;

  try {
    const receiptContent = receiptFile.content;
    const signature = Buffer.from(
      signatureFile.content.toString("utf8").trim(),
      "base64",
    );
    const publicKey = createPublicKey(publicKeyFile.content);
    const publicKeySha256 = createHash("sha256")
      .update(publicKey.export({ format: "der", type: "spki" }))
      .digest("hex");
    requireEqual(
      publicKeySha256,
      expectedPublicKeySha256,
      "owner approval public-key fingerprint mismatch",
      issues,
    );
    requireEqual(
      createHash("sha256").update(receiptContent).digest("hex"),
      approval.receiptSha256,
      "owner approval receipt SHA-256 mismatch",
      issues,
    );
    if (!verify(null, receiptContent, publicKey, signature)) {
      issues.push("owner approval detached signature is invalid");
    }
    const receipt = JSON.parse(receiptContent.toString("utf8"));
    requireEqual(receipt.schemaVersion, 1, "owner approval schema mismatch", issues);
    requireEqual(
      receipt.scope,
      "supabase-production-mutation-approval",
      "owner approval scope mismatch",
      issues,
    );
    requireEqual(
      receipt.decision,
      "APPROVED",
      "owner approval decision mismatch",
      issues,
    );
    requireEqual(
      receipt.projectRef,
      SUPABASE_PRODUCTION_TARGET.projectId,
      "owner approval projectRef mismatch",
      issues,
    );
    requireEqual(
      receipt.cutoverGeneration,
      SUPABASE_PRODUCTION_TARGET.cutoverGeneration,
      "owner approval generation mismatch",
      issues,
    );
    requireEqual(receipt.gitHead, gitHead, "owner approval Git SHA mismatch", issues);
    requireEqual(
      receipt.sourceSha256,
      sourceSha256,
      "owner approval source digest mismatch",
      issues,
    );
    requireEqual(
      receipt.evidenceRootSha256,
      evidenceRootSha256,
      "owner approval evidence-root digest mismatch",
      issues,
    );
    if (!Array.isArray(receipt.allowedActions)) {
      issues.push("owner approval allowedActions are missing");
    } else if (action && !receipt.allowedActions.includes(action)) {
      issues.push(`owner approval does not permit ${action}`);
    }
    const expiresAt = Date.parse(receipt.expiresAt ?? "");
    if (!Number.isFinite(expiresAt) || expiresAt <= now) {
      issues.push("owner approval is expired or has no valid expiration");
    }
  } catch (error) {
    issues.push(`owner approval verification failed: ${error.message}`);
  }
}

function externalFile(value, repoRoot, label, issues) {
  return readStableExternalFile({ issues, label, repoRoot, value });
}

function readText(path, label, issues) {
  if (!existsSync(path)) {
    issues.push(`${label} is missing: ${path}`);
    return "";
  }
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    issues.push(`${label} is unreadable: ${error.message}`);
    return "";
  }
}

function parseJson(content, label, issues) {
  if (!content) return {};
  try {
    return JSON.parse(content);
  } catch (error) {
    issues.push(`${label} is invalid: ${error.message}`);
    return {};
  }
}

function git(repoRoot, args, issues) {
  return safe(
    () =>
      execFileSync("git", args, {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    `git ${args.join(" ")} failed`,
    issues,
  );
}

function safe(read, label, issues) {
  try {
    return read();
  } catch (error) {
    issues.push(`${label}: ${error.message}`);
    return "";
  }
}

function requireEqual(actual, expected, label, issues) {
  if (actual !== expected) issues.push(label);
}

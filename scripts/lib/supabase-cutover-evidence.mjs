import { createHash } from "node:crypto";

export const SUPABASE_CUTOVER_PHASE_CONTRACTS = Object.freeze({
  "awaiting-fresh-evidence": Object.freeze({
    status: "NO_GO",
    decision: "NO_GO",
    evidenceComplete: false,
    approvalsRequired: false,
  }),
  "evidence-complete": Object.freeze({
    status: "NO_GO",
    decision: "NO_GO",
    evidenceComplete: true,
    approvalsRequired: false,
  }),
  approved: Object.freeze({
    status: "GO",
    decision: "GO",
    evidenceComplete: true,
    approvalsRequired: true,
  }),
});

export function cutoverPhaseContract(phase) {
  return SUPABASE_CUTOVER_PHASE_CONTRACTS[phase] ?? null;
}

export function sha256Evidence(content) {
  return createHash("sha256").update(content).digest("hex");
}

export function cutoverEvidenceRootSha256(packet) {
  return sha256Evidence(
    JSON.stringify({
      edgeFunctions: packet?.edgeFunctions ?? null,
      externalEvidenceImport: packet?.externalEvidenceImport ?? null,
      finalDataState: packet?.finalDataState ?? null,
      migrationContract: packet?.migrationContract ?? null,
      preActivationVerification: packet?.preActivationVerification ?? null,
      productionEvidence: packet?.productionEvidence ?? null,
      productionTarget: packet?.productionTarget ?? null,
      trackedReadinessSha256: packet?.trackedReadinessSha256 ?? null,
    }),
  );
}

export function validateExternalApprovalPacketBinding({
  approvalPacket,
  trackedContent,
  trackedPacket,
}) {
  const issues = [];
  if (trackedPacket?.status !== "NO_GO") {
    issues.push("tracked readiness status must equal NO_GO");
  }
  if (trackedPacket?.goNoGo?.decision !== "NO_GO") {
    issues.push("tracked readiness decision must equal NO_GO");
  }
  if (approvalPacket?.trackedReadinessSha256 !== sha256Evidence(trackedContent)) {
    issues.push("tracked readiness SHA-256 mismatch");
  }
  return issues;
}

export function validateBoundEvidence({
  content,
  expectedCheckedAt,
  expectedGeneration,
  expectedProjectRef,
  expectedScope,
  expectedSha256,
  expectedGitHead,
  expectedSourceSha256,
  evidenceNotBefore,
  maxAgeMs,
  now = Date.now(),
}) {
  const issues = [];
  let document;

  try {
    document = JSON.parse(content);
  } catch (error) {
    return {
      document: null,
      issues: [`invalid JSON: ${error.message}`],
      sha256: sha256Evidence(content),
    };
  }

  const sha256 = sha256Evidence(content);
  if (sha256 !== expectedSha256) issues.push("SHA-256 mismatch");
  if (document?.schemaVersion !== 1) issues.push("schemaVersion must equal 1");
  if (document?.scope !== expectedScope) issues.push("scope mismatch");
  if (document?.status !== "PASS") issues.push("status must equal PASS");
  if (document?.projectRef !== expectedProjectRef) issues.push("projectRef mismatch");
  if (document?.cutoverGeneration !== expectedGeneration) {
    issues.push("cutoverGeneration mismatch");
  }
  if (document?.checkedAt !== expectedCheckedAt) issues.push("checkedAt mismatch");
  if (document?.gitHead !== expectedGitHead) issues.push("gitHead mismatch");
  if (document?.sourceSha256 !== expectedSourceSha256) {
    issues.push("sourceSha256 mismatch");
  }

  const checkedAtMs = Date.parse(document?.checkedAt ?? "");
  const notBeforeMs = Date.parse(evidenceNotBefore);
  if (!Number.isFinite(checkedAtMs)) {
    issues.push("checkedAt is invalid");
  } else {
    if (!Number.isFinite(notBeforeMs) || checkedAtMs < notBeforeMs) {
      issues.push("evidence predates the target generation");
    }
    if (checkedAtMs > now + 5 * 60 * 1000)
      issues.push("evidence timestamp is in the future");
    if (!Number.isFinite(maxAgeMs) || maxAgeMs <= 0 || now - checkedAtMs > maxAgeMs) {
      issues.push("evidence is stale");
    }
  }

  return { document, issues, sha256 };
}

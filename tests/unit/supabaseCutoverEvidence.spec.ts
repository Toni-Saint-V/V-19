import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

import {
  cutoverEvidenceRootSha256,
  cutoverPhaseContract,
  sha256Evidence,
  validateExternalApprovalPacketBinding,
  validateBoundEvidence,
} from "../../scripts/lib/supabase-cutover-evidence.mjs";
import {
  assertProductionMutationAllowed,
  verifyDetachedOwnerApproval,
} from "../../scripts/lib/supabase-production-mutation-gate.mjs";
import { SUPABASE_PRODUCTION_TARGET } from "../../config/supabase-production-target.mjs";

const checkedAt = "2026-08-02T12:00:00.000Z";
const evidence = JSON.stringify({
  schemaVersion: 1,
  scope: "test-scope",
  status: "PASS",
  checkedAt,
  projectRef: "project-ref",
  cutoverGeneration: "generation",
  gitHead: "a".repeat(40),
  sourceSha256: "b".repeat(64),
});

describe("Supabase cutover evidence", () => {
  test("keeps production mutation disabled while authenticated approval is unavailable", () => {
    expect(() =>
      assertProductionMutationAllowed({
        action: "migration-apply",
        repoRoot: process.cwd(),
      }),
    ).toThrow(/Production mutation refused/);
  });

  test("supports an explicit fail-closed progression to approved", () => {
    expect(cutoverPhaseContract("awaiting-fresh-evidence")).toEqual({
      status: "NO_GO",
      decision: "NO_GO",
      evidenceComplete: false,
      approvalsRequired: false,
    });
    expect(cutoverPhaseContract("evidence-complete")).toEqual({
      status: "NO_GO",
      decision: "NO_GO",
      evidenceComplete: true,
      approvalsRequired: false,
    });
    expect(cutoverPhaseContract("approved")).toEqual({
      status: "GO",
      decision: "GO",
      evidenceComplete: true,
      approvalsRequired: true,
    });
    expect(cutoverPhaseContract("unknown")).toBeNull();
  });

  test("binds an external approval packet to the exact tracked evidence root", () => {
    const evidenceSections = {
      productionTarget: { projectId: "project" },
      migrationContract: { digest: "migration" },
      preActivationVerification: { gitHead: "a".repeat(40) },
      productionEvidence: { manifest: "evidence" },
      finalDataState: { checked: true },
      edgeFunctions: { deployed: true },
    };
    const trackedPacket = {
      phase: "evidence-complete",
      status: "NO_GO",
      goNoGo: { decision: "NO_GO" },
      ...evidenceSections,
    };
    const trackedContent = `${JSON.stringify(trackedPacket)}\n`;
    const approvalPacket = {
      phase: "approved",
      status: "GO",
      goNoGo: { decision: "GO" },
      trackedReadinessSha256: sha256Evidence(trackedContent),
      ...evidenceSections,
    };

    expect(
      validateExternalApprovalPacketBinding({
        approvalPacket,
        trackedContent,
        trackedPacket,
      }),
    ).toEqual([]);
    expect(cutoverEvidenceRootSha256(approvalPacket)).not.toBe(
      cutoverEvidenceRootSha256({
        ...approvalPacket,
        edgeFunctions: { deployed: false },
      }),
    );
    expect(
      validateExternalApprovalPacketBinding({
        approvalPacket: { ...approvalPacket, trackedReadinessSha256: "0".repeat(64) },
        trackedContent,
        trackedPacket,
      }),
    ).toContain("tracked readiness SHA-256 mismatch");
  });

  test("verifies the detached owner signature and detects receipt tampering", () => {
    const repoRoot = process.cwd();
    const externalRoot = mkdtempSync(resolve(tmpdir(), "v19-owner-approval-"));
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const gitHead = "a".repeat(40);
    const sourceSha256 = "b".repeat(64);
    const evidenceRootSha256 = "c".repeat(64);
    const receipt = Buffer.from(
      `${JSON.stringify({
        schemaVersion: 1,
        scope: "supabase-production-mutation-approval",
        decision: "APPROVED",
        projectRef: SUPABASE_PRODUCTION_TARGET.projectId,
        cutoverGeneration: SUPABASE_PRODUCTION_TARGET.cutoverGeneration,
        gitHead,
        sourceSha256,
        evidenceRootSha256,
        allowedActions: ["workflow-smoke"],
        expiresAt: "2099-01-01T00:00:00.000Z",
      })}\n`,
    );
    const receiptPath = resolve(externalRoot, "receipt.json");
    const signaturePath = resolve(externalRoot, "receipt.sig");
    const publicKeyPath = resolve(externalRoot, "owner-public.pem");
    writeFileSync(receiptPath, receipt);
    writeFileSync(signaturePath, sign(null, receipt, privateKey).toString("base64"));
    writeFileSync(publicKeyPath, publicKey.export({ format: "pem", type: "spki" }));
    const expectedPublicKeySha256 = createHash("sha256")
      .update(publicKey.export({ format: "der", type: "spki" }))
      .digest("hex");
    const approval = {
      receiptPath,
      receiptSha256: createHash("sha256").update(receipt).digest("hex"),
      signaturePath,
      publicKeyPath,
    };
    const issues: string[] = [];
    verifyDetachedOwnerApproval({
      action: "workflow-smoke",
      approval,
      evidenceRootSha256,
      expectedPublicKeySha256,
      gitHead,
      issues,
      repoRoot,
      sourceSha256,
    });
    expect(issues).toEqual([]);

    writeFileSync(receiptPath, Buffer.concat([receipt, Buffer.from(" ")]));
    const tamperedIssues: string[] = [];
    verifyDetachedOwnerApproval({
      action: "workflow-smoke",
      approval,
      evidenceRootSha256,
      expectedPublicKeySha256,
      gitHead,
      issues: tamperedIssues,
      repoRoot,
      sourceSha256,
    });
    expect(tamperedIssues).toContain("owner approval receipt SHA-256 mismatch");
    expect(tamperedIssues).toContain("owner approval detached signature is invalid");
  });

  test("accepts fresh evidence bound to the exact target and hash", () => {
    expect(
      validateBoundEvidence({
        content: evidence,
        expectedCheckedAt: checkedAt,
        expectedGeneration: "generation",
        expectedProjectRef: "project-ref",
        expectedScope: "test-scope",
        expectedSha256: sha256Evidence(evidence),
        expectedGitHead: "a".repeat(40),
        expectedSourceSha256: "b".repeat(64),
        evidenceNotBefore: "2026-08-02T00:00:00.000Z",
        maxAgeMs: 24 * 60 * 60 * 1000,
        now: Date.parse("2026-08-02T13:00:00.000Z"),
      }).issues,
    ).toEqual([]);
  });

  test.each([
    ["hash", { expectedSha256: "0".repeat(64) }, "SHA-256 mismatch"],
    ["target", { expectedProjectRef: "other" }, "projectRef mismatch"],
    ["generation", { expectedGeneration: "other" }, "cutoverGeneration mismatch"],
    ["git head", { expectedGitHead: "c".repeat(40) }, "gitHead mismatch"],
    [
      "source digest",
      { expectedSourceSha256: "d".repeat(64) },
      "sourceSha256 mismatch",
    ],
    [
      "stale timestamp",
      { now: Date.parse("2026-08-04T13:00:00.000Z") },
      "evidence is stale",
    ],
  ])("rejects %s mismatch", (_label, override, expectedIssue) => {
    const result = validateBoundEvidence({
      content: evidence,
      expectedCheckedAt: checkedAt,
      expectedGeneration: "generation",
      expectedProjectRef: "project-ref",
      expectedScope: "test-scope",
      expectedSha256: sha256Evidence(evidence),
      expectedGitHead: "a".repeat(40),
      expectedSourceSha256: "b".repeat(64),
      evidenceNotBefore: "2026-08-02T00:00:00.000Z",
      maxAgeMs: 24 * 60 * 60 * 1000,
      now: Date.parse("2026-08-02T13:00:00.000Z"),
      ...override,
    });
    expect(result.issues).toContain(expectedIssue);
  });
});

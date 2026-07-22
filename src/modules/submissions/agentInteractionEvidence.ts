import {
  V19_AGENT_INTERACTION_CONTRACTS,
  isAgentInteractionId,
  type AgentInteractionProof,
  type AgentInteractionRole,
  type AgentInteractionSurface,
  type AgentInteractionMutationTarget,
} from "./agentInteractionContract";
import type { SubmissionStatus } from "./types";

export type AgentInteractionEvidenceAssertion = {
  detail: string;
  passed: boolean;
};

export const V19_AGENT_INTERACTION_EVIDENCE_SCHEMA_VERSION =
  "v19-agent-interaction-evidence-v1" as const;

export const V19_AGENT_INTERACTION_ARTIFACT_KINDS = [
  "canonical-readback",
  "chrome-network-ledger",
  "clipboard-proof",
  "cross-role-readback",
  "deployed-dom-inventory",
  "dom-snapshot",
  "download",
  "download-metadata",
  "network-ledger",
  "no-network-write",
  "session-transition",
  "storage-readback",
  "supabase-readback",
  "unintended-writes",
  "vercel-inspect",
  "vercel-runtime-logs",
] as const;

export type AgentInteractionArtifactKind =
  (typeof V19_AGENT_INTERACTION_ARTIFACT_KINDS)[number];

export type AgentInteractionEvidenceArtifact = {
  id: string;
  kind: AgentInteractionArtifactKind;
  path: string;
  sha256: string;
};

export type AgentInteractionEvidenceExecution = {
  artifactIds: readonly string[];
  capturedAt: string;
  runId: string;
};

export type AgentInteractionNetworkResponse = {
  method: "DELETE" | "GET" | "HEAD" | "PATCH" | "POST" | "PUT";
  path: string;
  status: number;
  write: boolean;
};

export type AgentInteractionEvidenceRecord = {
  assertions: Partial<
    Record<AgentInteractionProof, AgentInteractionEvidenceAssertion>
  >;
  expectedEffect: AgentInteractionEvidenceAssertion & { description: string };
  execution: AgentInteractionEvidenceExecution;
  fixture: {
    id: string;
    returnPackageArtifact?: {
      artifactId: string;
      fileName: string;
      owner: "current-agent";
      packageId: string;
      packageStatus: "published";
      sha256: string;
      sizeBytes: number;
      storageBucket: "agent-return-packages";
      storagePath: string;
    };
    submissionStatuses?: readonly SubmissionStatus[];
  };
  id: string;
  interactionId: string;
  mutation?: {
    canonicalReloadReadback?: {
      assertion: string;
      fields: readonly string[];
    };
    networkResponse?: {
      method: "DELETE" | "PATCH" | "POST" | "PUT";
      path: string;
      status: number;
    };
    unintendedWrites?: {
      assertion: string;
      changedTargets: readonly AgentInteractionMutationTarget[];
      checkedTargets: readonly AgentInteractionMutationTarget[];
    };
  };
  network?: {
    responses: readonly AgentInteractionNetworkResponse[];
  };
  role: AgentInteractionRole;
  surface: AgentInteractionSurface;
  testCase: string;
};

export type AgentInteractionEvidenceManifest = {
  artifacts: readonly AgentInteractionEvidenceArtifact[];
  backendOrigin: string;
  backendProjectRef: string;
  capturedAt: string;
  deployedCommit: string;
  deploymentAlias: string;
  deploymentGitDirty: boolean;
  deploymentId: string;
  deploymentState: "READY";
  gitHead: string;
  records: readonly AgentInteractionEvidenceRecord[];
  runId: string;
  schemaVersion: typeof V19_AGENT_INTERACTION_EVIDENCE_SCHEMA_VERSION;
  trustedAttestation?: {
    bundlePath: string;
    repository: string;
    signerWorkflow: string;
    subjectPath: string;
  };
};

export type AgentInteractionEvidenceFindingReason =
  | "duplicate-record"
  | "expected-effect-unconfirmed"
  | "failed-proof"
  | "missing-canonical-readback"
  | "missing-evidence"
  | "missing-execution"
  | "missing-fixture"
  | "missing-network-response"
  | "missing-proof"
  | "missing-status-fixture"
  | "missing-test-case"
  | "missing-unintended-write-check"
  | "invalid-execution"
  | "unknown-interaction"
  | "wrong-role"
  | "wrong-surface";

export type AgentInteractionEvidenceFinding = {
  interactionId: string;
  reason: AgentInteractionEvidenceFindingReason;
  recordId?: string;
};

export type AgentInteractionEvidenceAuditOptions = {
  statusFixtureCoverage?: "complete-contract" | "provided-records";
};

const statusConditionalSurfaces = new Set<AgentInteractionSurface>([
  "agent-actions",
  "agent-submissions",
  "questionnaire",
  "returned-documents",
  "submission-drawer",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim());
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    new Set(left).size === left.length &&
    left.every((value) => right.includes(value))
  );
}

export function validateAgentInteractionEvidenceManifestShape(
  value: unknown,
): string[] {
  if (!isRecord(value)) return ["manifest must be an object"];

  const findings: string[] = [];
  if (value.schemaVersion !== V19_AGENT_INTERACTION_EVIDENCE_SCHEMA_VERSION) {
    findings.push("schemaVersion is invalid");
  }
  for (const field of [
    "backendOrigin",
    "backendProjectRef",
    "capturedAt",
    "deployedCommit",
    "deploymentAlias",
    "deploymentId",
    "gitHead",
    "runId",
  ] as const) {
    if (!isNonEmptyString(value[field])) findings.push(`${field} is missing`);
  }
  if (value.deploymentState !== "READY") {
    findings.push("deploymentState is invalid");
  }
  if (typeof value.deploymentGitDirty !== "boolean") {
    findings.push("deploymentGitDirty is invalid");
  }

  if (!Array.isArray(value.artifacts) || !value.artifacts.length) {
    findings.push("artifacts are missing");
  } else {
    const allowedKinds = new Set<string>(V19_AGENT_INTERACTION_ARTIFACT_KINDS);
    value.artifacts.forEach((artifact, index) => {
      if (!isRecord(artifact)) {
        findings.push(`artifacts[${index}] is invalid`);
        return;
      }
      if (!isNonEmptyString(artifact.id)) {
        findings.push(`artifacts[${index}].id is missing`);
      }
      if (!isNonEmptyString(artifact.kind) || !allowedKinds.has(artifact.kind)) {
        findings.push(`artifacts[${index}].kind is invalid`);
      }
      if (!isNonEmptyString(artifact.path)) {
        findings.push(`artifacts[${index}].path is missing`);
      }
      if (
        typeof artifact.sha256 !== "string" ||
        !/^[a-f0-9]{64}$/u.test(artifact.sha256)
      ) {
        findings.push(`artifacts[${index}].sha256 is invalid`);
      }
    });
  }

  if (!Array.isArray(value.records) || !value.records.length) {
    findings.push("records are missing");
  } else {
    value.records.forEach((record, index) => {
      if (!isRecord(record)) {
        findings.push(`records[${index}] is invalid`);
        return;
      }
      for (const field of ["id", "interactionId", "role", "surface", "testCase"] as const) {
        if (!isNonEmptyString(record[field])) {
          findings.push(`records[${index}].${field} is missing`);
        }
      }
      if (!isRecord(record.assertions)) {
        findings.push(`records[${index}].assertions is invalid`);
      }
      if (!isRecord(record.expectedEffect)) {
        findings.push(`records[${index}].expectedEffect is invalid`);
      }
      if (!isRecord(record.fixture)) {
        findings.push(`records[${index}].fixture is invalid`);
      }
      if (!isRecord(record.execution)) {
        findings.push(`records[${index}].execution is invalid`);
      }
    });
  }

  return findings;
}

export function auditAgentInteractionEvidence(
  records: readonly AgentInteractionEvidenceRecord[],
  interactionIds: readonly string[] = Object.keys(V19_AGENT_INTERACTION_CONTRACTS),
  options: AgentInteractionEvidenceAuditOptions = {},
): AgentInteractionEvidenceFinding[] {
  const findings: AgentInteractionEvidenceFinding[] = [];
  const recordsByInteraction = new Map<string, AgentInteractionEvidenceRecord[]>();
  const recordIds = new Set<string>();

  for (const record of records) {
    if (recordIds.has(record.id)) {
      findings.push({
        interactionId: record.interactionId,
        reason: "duplicate-record",
        recordId: record.id,
      });
    }
    recordIds.add(record.id);

    if (!isAgentInteractionId(record.interactionId)) {
      findings.push({
        interactionId: record.interactionId,
        reason: "unknown-interaction",
        recordId: record.id,
      });
      continue;
    }

    const interactionRecords = recordsByInteraction.get(record.interactionId) ?? [];
    interactionRecords.push(record);
    recordsByInteraction.set(record.interactionId, interactionRecords);
  }

  for (const interactionId of interactionIds) {
    const contract = isAgentInteractionId(interactionId)
      ? V19_AGENT_INTERACTION_CONTRACTS[interactionId]
      : undefined;
    if (!contract) {
      findings.push({ interactionId, reason: "unknown-interaction" });
      continue;
    }
    const interactionRecords = recordsByInteraction.get(contract.id) ?? [];
    if (interactionRecords.length === 0) {
      findings.push({ interactionId: contract.id, reason: "missing-evidence" });
      continue;
    }

    for (const record of interactionRecords) {
      if (typeof record.testCase !== "string" || !record.testCase.trim()) {
        findings.push({
          interactionId: contract.id,
          reason: "missing-test-case",
          recordId: record.id,
        });
      }
      if (
        !record.fixture ||
        typeof record.fixture.id !== "string" ||
        !record.fixture.id.trim()
      ) {
        findings.push({
          interactionId: contract.id,
          reason: "missing-fixture",
          recordId: record.id,
        });
      }
      if (record.role !== contract.role) {
        findings.push({
          interactionId: contract.id,
          reason: "wrong-role",
          recordId: record.id,
        });
      }
      if (record.surface !== contract.surface) {
        findings.push({
          interactionId: contract.id,
          reason: "wrong-surface",
          recordId: record.id,
        });
      }
      if (
        !record.expectedEffect ||
        !record.expectedEffect.passed ||
        typeof record.expectedEffect.detail !== "string" ||
        !record.expectedEffect.detail.trim() ||
        record.expectedEffect.description !== contract.expectedEffect
      ) {
        findings.push({
          interactionId: contract.id,
          reason: "expected-effect-unconfirmed",
          recordId: record.id,
        });
      }
      if (
        statusConditionalSurfaces.has(contract.surface) &&
        !record.fixture?.submissionStatuses?.length
      ) {
        findings.push({
          interactionId: contract.id,
          reason: "missing-status-fixture",
          recordId: record.id,
        });
      }
      if (
        options.statusFixtureCoverage === "provided-records" &&
        "statusFixtures" in contract &&
        contract.statusFixtures?.length
      ) {
        const providedStatuses = record.fixture?.submissionStatuses;
        const allowedStatuses = contract.statusFixtures as readonly SubmissionStatus[];
        const hasOneAllowedStatus =
          providedStatuses?.length === 1 &&
          allowedStatuses.includes(providedStatuses[0]!);
        if (!hasOneAllowedStatus) {
          findings.push({
            interactionId: contract.id,
            reason: "missing-status-fixture",
            recordId: record.id,
          });
        }
      }

      if (
        !record.execution ||
        !Array.isArray(record.execution.artifactIds) ||
        !record.execution.artifactIds.length ||
        typeof record.execution.runId !== "string" ||
        !record.execution.runId.trim()
      ) {
        findings.push({
          interactionId: contract.id,
          reason: "missing-execution",
          recordId: record.id,
        });
      } else if (
        typeof record.execution.capturedAt !== "string" ||
        !Number.isFinite(Date.parse(record.execution.capturedAt))
      ) {
        findings.push({
          interactionId: contract.id,
          reason: "invalid-execution",
          recordId: record.id,
        });
      }

      for (const [proof, assertion] of Object.entries(record.assertions ?? {})) {
        if (assertion && (!assertion.passed || !assertion.detail.trim())) {
          findings.push({
            interactionId: contract.id,
            reason: "failed-proof",
            recordId: record.id,
          });
        }
        if (
          !(contract.proof as readonly AgentInteractionProof[]).includes(
            proof as AgentInteractionProof,
          )
        ) {
          findings.push({
            interactionId: contract.id,
            reason: "failed-proof",
            recordId: record.id,
          });
        }
      }

      for (const proof of contract.proof) {
        const assertion = record.assertions?.[proof];
        if (!assertion) {
          findings.push({
            interactionId: contract.id,
            reason: "missing-proof",
            recordId: record.id,
          });
        } else if (!assertion.passed || !assertion.detail.trim()) {
          findings.push({
            interactionId: contract.id,
            reason: "failed-proof",
            recordId: record.id,
          });
        }
      }

      if (contract.kind === "mutation") {
        const hasNetworkResponse =
          Boolean(record.mutation?.networkResponse?.path.trim()) &&
          (record.mutation?.networkResponse?.status ?? 0) >= 200 &&
          (record.mutation?.networkResponse?.status ?? 0) < 300;
        const hasCanonicalReadback =
          Boolean(record.mutation?.canonicalReloadReadback?.assertion.trim()) &&
          Boolean(record.mutation?.canonicalReloadReadback?.fields.length);
        const checkedTargets =
          record.mutation?.unintendedWrites?.checkedTargets ?? [];
        const changedTargets =
          record.mutation?.unintendedWrites?.changedTargets ?? [];
        const hasUnintendedWriteCheck =
          Boolean(record.mutation?.unintendedWrites?.assertion.trim()) &&
          sameStringSet(
            checkedTargets,
            contract.writeScope.requiredCheckedTargets,
          ) &&
          changedTargets.length > 0 &&
          new Set(changedTargets).size === changedTargets.length &&
          changedTargets.every((target) =>
            contract.writeScope.allowedChangedTargets.includes(target),
          ) &&
          contract.writeScope.requiredChangedTargets.every((target) =>
            changedTargets.includes(target),
          );

        if (!hasNetworkResponse) {
          findings.push({
            interactionId: contract.id,
            reason: "missing-network-response",
            recordId: record.id,
          });
        }
        if (!hasCanonicalReadback) {
          findings.push({
            interactionId: contract.id,
            reason: "missing-canonical-readback",
            recordId: record.id,
          });
        }
        if (!hasUnintendedWriteCheck) {
          findings.push({
            interactionId: contract.id,
            reason: "missing-unintended-write-check",
            recordId: record.id,
          });
        }
      }

      if (
        (contract.proof as readonly AgentInteractionProof[]).includes(
          "network-readback",
        )
      ) {
        const responses = record.network?.responses;
        const hasValidResponses =
          Array.isArray(responses) &&
          responses.length > 0 &&
          responses.every(
            (response) =>
              Boolean(response.path.trim()) &&
              response.status >= 100 &&
              response.status <= 599 &&
              typeof response.write === "boolean",
          );
        if (!hasValidResponses) {
          findings.push({
            interactionId: contract.id,
            reason: "missing-network-response",
            recordId: record.id,
          });
        }
      }
      if (
        (contract.proof as readonly AgentInteractionProof[]).includes(
          "no-network-write",
        )
      ) {
        const responses = record.network?.responses;
        const hasZeroWriteLedger =
          Array.isArray(responses) &&
          responses.every(
            (response) =>
              Boolean(response.path.trim()) &&
              response.status >= 100 &&
              response.status <= 599 &&
              response.write === false,
          );
        if (!hasZeroWriteLedger) {
          findings.push({
            interactionId: contract.id,
            reason: "missing-network-response",
            recordId: record.id,
          });
        }
      }
    }

    if (
      options.statusFixtureCoverage !== "provided-records" &&
      "statusFixtures" in contract &&
      contract.statusFixtures?.length
    ) {
      for (const requiredStatus of contract.statusFixtures) {
        const hasExactStatusFixture = interactionRecords.some(
          (record) =>
            record.fixture?.submissionStatuses?.length === 1 &&
            record.fixture.submissionStatuses[0] === requiredStatus,
        );
        if (!hasExactStatusFixture) {
          findings.push({
            interactionId: contract.id,
            reason: "missing-status-fixture",
          });
        }
      }
    }

  }

  return findings;
}

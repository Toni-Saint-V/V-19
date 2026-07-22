import {
  V19_AGENT_INTERACTION_CONTRACTS,
  isAgentInteractionId,
  type AgentInteractionContract,
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
  "v19-agent-interaction-evidence-v2" as const;

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

export type AgentInteractionCanonicalValue = string | number | boolean | null;

export type AgentInteractionSyntheticFixture = {
  actor: {
    id: string;
    role: AgentInteractionRole;
  };
  entities: readonly {
    id: string;
    ownerActorId: string;
    target: AgentInteractionMutationTarget | "return-package" | "session" | "ui-state";
  }[];
  markerSha256: string;
  operationId: string;
  primaryEntityId: string;
};

export type AgentInteractionNetworkResponse = {
  actorId: string;
  actorRole: AgentInteractionRole;
  entityIds: readonly string[];
  method: "DELETE" | "GET" | "HEAD" | "PATCH" | "POST" | "PUT";
  operationClass: string | null;
  operationId: string;
  path: string;
  query: "grant_type=password" | null;
  resultSha256: string | null;
  status: number;
  target:
    | AgentInteractionMutationTarget
    | "return-package"
    | "session"
    | "ui-state";
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
    synthetic: AgentInteractionSyntheticFixture;
    submissionStatuses?: readonly SubmissionStatus[];
  };
  id: string;
  interactionId: string;
  mutation?: {
    canonicalReloadReadback?: {
      before: Readonly<Record<string, AgentInteractionCanonicalValue>>;
      expectedAfter: Readonly<Record<string, AgentInteractionCanonicalValue>>;
      fields: readonly string[];
      reloadedAt: string;
    };
    networkResponse?: {
      method: "DELETE" | "PATCH" | "POST" | "PUT";
      path: string;
      status: number;
    };
    unintendedWrites?: {
      changedTargets: readonly AgentInteractionMutationTarget[];
      checkedTargets: readonly AgentInteractionMutationTarget[];
      targetSnapshots: readonly {
        afterSha256: string;
        beforeSha256: string;
        entityIds: readonly string[];
        target: AgentInteractionMutationTarget;
      }[];
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
    bundleSha256: string;
    bundlePath: string;
    repository: string;
    signerWorkflow: string;
    subjectSha256: string;
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

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function validSyntheticFixture(
  record: AgentInteractionEvidenceRecord,
  contract?: AgentInteractionContract,
): boolean {
  const synthetic = record.fixture?.synthetic;
  if (
    !synthetic ||
    synthetic.actor.role !== record.role ||
    !isNonEmptyString(synthetic.actor.id) ||
    !isNonEmptyString(synthetic.operationId) ||
    !isSha256(synthetic.markerSha256) ||
    !isNonEmptyString(synthetic.primaryEntityId) ||
    !Array.isArray(synthetic.entities) ||
    !synthetic.entities.length
  ) {
    return false;
  }
  const entityIds = synthetic.entities.map((entity) => entity.id);
  const entityTargets = synthetic.entities.map((entity) => entity.target);
  const expectedTargets =
    contract?.kind === "mutation"
      ? contract.writeScope.requiredCheckedTargets
      : contract?.kind === "session"
        ? ["session"]
        : contract?.kind === "download"
          ? ["return-package"]
          : ["ui-state"];
  const primaryEntity = synthetic.entities.find(
    (entity) => entity.id === synthetic.primaryEntityId,
  );
  return (
    new Set(entityIds).size === entityIds.length &&
    new Set(entityTargets).size === entityTargets.length &&
    sameStringSet(entityTargets, expectedTargets) &&
    Boolean(primaryEntity) &&
    (contract?.kind !== "mutation" ||
      primaryEntity?.target === contract.canonicalEffect.primaryTarget) &&
    synthetic.entities.every(
      (entity) =>
        isNonEmptyString(entity.id) &&
        entity.ownerActorId === synthetic.actor.id &&
        isNonEmptyString(entity.target),
    )
  );
}

function resolveCanonicalEffect(
  contract: Extract<AgentInteractionContract, { kind: "mutation" }>,
  record: AgentInteractionEvidenceRecord,
) {
  const statusFixture = record.fixture?.submissionStatuses?.[0];
  const markerSha256 = record.fixture?.synthetic?.markerSha256;
  const resolveValue = (value: AgentInteractionCanonicalValue) => {
    if (value === "$fixture-status") return statusFixture;
    if (value === "$marker-sha256") return markerSha256;
    return value;
  };
  const resolveValues = (
    values: Readonly<Record<string, AgentInteractionCanonicalValue>>,
  ) =>
    Object.fromEntries(
      Object.entries(values).map(([field, value]) => [field, resolveValue(value)]),
    ) as Readonly<Record<string, AgentInteractionCanonicalValue | undefined>>;
  return {
    before: resolveValues(contract.canonicalEffect.before),
    expectedAfter: resolveValues(contract.canonicalEffect.expectedAfter),
    fields: Object.keys(contract.canonicalEffect.expectedAfter),
  };
}

function sameCanonicalRecord(
  left: Readonly<Record<string, AgentInteractionCanonicalValue>> | undefined,
  right: Readonly<Record<string, AgentInteractionCanonicalValue | undefined>>,
  fields: readonly string[],
): boolean {
  return (
    Boolean(left) &&
    sameStringSet(Object.keys(left ?? {}), fields) &&
    sameStringSet(Object.keys(right), fields) &&
    fields.every((field) => left?.[field] === right[field])
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
        !record.fixture.id.trim() ||
        !validSyntheticFixture(record, contract)
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
        const canonicalEffect = resolveCanonicalEffect(contract, record);
        const syntheticEntityIds = new Set(
          record.fixture.synthetic?.entities.map((entity) => entity.id) ?? [],
        );
        const syntheticEntityById = new Map(
          record.fixture.synthetic?.entities.map((entity) => [entity.id, entity]) ?? [],
        );
        const hasNetworkResponse =
          Boolean(record.mutation?.networkResponse?.path.trim()) &&
          (record.mutation?.networkResponse?.status ?? 0) >= 200 &&
          (record.mutation?.networkResponse?.status ?? 0) < 300;
        const hasCanonicalReadback =
          sameStringSet(
            record.mutation?.canonicalReloadReadback?.fields ?? [],
            canonicalEffect.fields,
          ) &&
          sameCanonicalRecord(
            record.mutation?.canonicalReloadReadback?.before,
            canonicalEffect.before,
            canonicalEffect.fields,
          ) &&
          sameCanonicalRecord(
            record.mutation?.canonicalReloadReadback?.expectedAfter,
            canonicalEffect.expectedAfter,
            canonicalEffect.fields,
          ) &&
          Number.isFinite(
            Date.parse(record.mutation?.canonicalReloadReadback?.reloadedAt ?? ""),
          ) &&
          canonicalEffect.fields.some(
            (field) =>
              canonicalEffect.before[field] !== canonicalEffect.expectedAfter[field],
          );
        const checkedTargets =
          record.mutation?.unintendedWrites?.checkedTargets ?? [];
        const changedTargets =
          record.mutation?.unintendedWrites?.changedTargets ?? [];
        const targetSnapshots =
          record.mutation?.unintendedWrites?.targetSnapshots ?? [];
        const derivedChangedTargets = targetSnapshots
          .filter((snapshot) => snapshot.beforeSha256 !== snapshot.afterSha256)
          .map((snapshot) => snapshot.target);
        const hasUnintendedWriteCheck =
          sameStringSet(
            checkedTargets,
            contract.writeScope.requiredCheckedTargets,
          ) &&
          sameStringSet(
            targetSnapshots.map((snapshot) => snapshot.target),
            checkedTargets,
          ) &&
          targetSnapshots.every(
            (snapshot) =>
              isSha256(snapshot.beforeSha256) &&
              isSha256(snapshot.afterSha256) &&
              snapshot.entityIds.length > 0 &&
              snapshot.entityIds.every((entityId) =>
                syntheticEntityIds.has(entityId) &&
                syntheticEntityById.get(entityId)?.target === snapshot.target,
              ),
          ) &&
          changedTargets.length > 0 &&
          new Set(changedTargets).size === changedTargets.length &&
          sameStringSet(changedTargets, derivedChangedTargets) &&
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
        const synthetic = record.fixture.synthetic;
        const syntheticEntityIds = new Set(
          synthetic?.entities.map((entity) => entity.id) ?? [],
        );
        const hasValidResponses =
          Array.isArray(responses) &&
          responses.length > 0 &&
          responses.every(
            (response) =>
              response.actorId === synthetic?.actor.id &&
              response.actorRole === record.role &&
              response.operationId === synthetic?.operationId &&
              response.entityIds.length > 0 &&
              response.entityIds.every((entityId: string) =>
                syntheticEntityIds.has(entityId) &&
                synthetic?.entities.find((entity) => entity.id === entityId)
                  ?.target === response.target,
              ) &&
              (response.query === null || response.query === "grant_type=password") &&
              (response.resultSha256 === null || isSha256(response.resultSha256)) &&
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
        const synthetic = record.fixture.synthetic;
        const syntheticEntityIds = new Set(
          synthetic?.entities.map((entity) => entity.id) ?? [],
        );
        const hasZeroWriteLedger =
          Array.isArray(responses) &&
          responses.every(
            (response) =>
              response.actorId === synthetic?.actor.id &&
              response.actorRole === record.role &&
              response.operationId === synthetic?.operationId &&
              response.entityIds.length > 0 &&
              response.entityIds.every((entityId: string) =>
                syntheticEntityIds.has(entityId) &&
                synthetic?.entities.find((entity) => entity.id === entityId)
                  ?.target === response.target,
              ) &&
              response.operationClass === null &&
              response.query === null &&
              response.resultSha256 === null &&
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

import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";

import {
  V19_AGENT_INTERACTION_CONTRACTS,
  type AgentInteractionMutationTarget,
  type AgentInteractionProof,
} from "../../src/modules/submissions/agentInteractionContract";
import {
  V19_AGENT_INTERACTION_EVIDENCE_SCHEMA_VERSION,
  type AgentInteractionArtifactKind,
  type AgentInteractionEvidenceArtifact,
  type AgentInteractionEvidenceManifest,
  type AgentInteractionEvidenceRecord,
} from "../../src/modules/submissions/agentInteractionEvidence";

const proofArtifactKind: Record<AgentInteractionProof, AgentInteractionArtifactKind> = {
  clipboard: "clipboard-proof",
  "cross-role-readback": "cross-role-readback",
  "dom-state": "dom-snapshot",
  download: "download",
  "network-readback": "network-ledger",
  "no-network-write": "no-network-write",
  "reload-readback": "canonical-readback",
  "session-transition": "session-transition",
  "storage-readback": "storage-readback",
};

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function exactSubmissionReadPath(entityId: string) {
  return `/rest/v1/submissions?id=eq.${encodeURIComponent(entityId)}&select=id%2Cagent_id%2Cupdated_at`;
}

function exactSubmissionWritePath(entityId: string) {
  return `/rest/v1/submissions?id=eq.${encodeURIComponent(entityId)}`;
}

function rewriteJsonArtifact(
  artifact: AgentInteractionEvidenceArtifact,
  update: (content: Record<string, unknown>) => void,
) {
  const content = JSON.parse(readFileSync(artifact.path, "utf8")) as Record<
    string,
    unknown
  >;
  update(content);
  const serialized = JSON.stringify(content);
  writeFileSync(artifact.path, serialized);
  artifact.sha256 = sha256(serialized);
}

function verifierResult(
  manifestPath?: string,
  options: { args?: string[]; env?: Record<string, string> } = {},
) {
  const args = [
    resolve(process.cwd(), "scripts/verify-agent-interaction-evidence.mjs"),
  ];
  if (manifestPath) args.push("--evidence-file", manifestPath);
  args.push(...(options.args ?? []));
  return spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: options.env ?? {},
  });
}

function productionFixture() {
  const evidenceDirectory = realpathSync(
    mkdtempSync(join(tmpdir(), "v19-interaction-evidence-")),
  );
  const artifacts: AgentInteractionEvidenceArtifact[] = [];
  const runId = "CODEX-E2E-verifier-fixture";
  const markerSha256 = sha256(runId);
  const backendProjectRef = "tsymifccglpepvbmrcgh";
  const backendOrigin = `https://${backendProjectRef}.supabase.co`;
  const capturedAt = new Date().toISOString();
  const actorIds = {
    admin: "00000000-0000-4000-8000-0000000000ad",
    agent: "00000000-0000-4000-8000-0000000000a1",
    anonymous: "00000000-0000-4000-8000-0000000000a0",
  } as const;
  const adminWitnessActorId = "00000000-0000-4000-8000-0000000000ad";
  const otherAgentActorId = "00000000-0000-4000-8000-0000000000a2";
  const sessionNetwork = {
    "access.pending-sign-out": {
      method: "POST",
      operationClass: "logout-current-session",
      path: "/auth/v1/logout",
      query: null,
    },
    "access.submit-invite-password": {
      method: "PUT",
      operationClass: "invite-password-update",
      path: "/auth/v1/user",
      query: null,
    },
    "access.submit-login": {
      method: "POST",
      operationClass: "password-grant",
      path: "/auth/v1/token",
      query: "grant_type=password",
    },
    "access.submit-recovery-password": {
      method: "PUT",
      operationClass: "recovery-password-update",
      path: "/auth/v1/user",
      query: null,
    },
    "access.submit-reset": {
      method: "POST",
      operationClass: "recovery-request",
      path: "/auth/v1/recover",
      query: null,
    },
    "shell.sign-out": {
      method: "POST",
      operationClass: "logout-current-session",
      path: "/auth/v1/logout",
      query: null,
    },
  } as const;
  const writePathByTarget = {
    "edge:access-request": "/functions/v1/access-request",
    "rpc:archive_agent_submission_card":
      "/rest/v1/rpc/archive_agent_submission_card",
    "rpc:save_agent_submission_if_current":
      "/rest/v1/rpc/save_agent_submission_if_current",
    "storage:submission-media":
      "/storage/v1/object/submission-media/CODEX-E2E-verifier-fixture/file.pdf",
  } as const;
  let artifactSequence = 0;

  function addArtifact(
    kind: AgentInteractionArtifactKind,
    content: Record<string, unknown> | string | Buffer,
  ): AgentInteractionEvidenceArtifact {
    artifactSequence += 1;
    const id = `artifact-${artifactSequence}-${kind}`;
    const extension = kind === "download" ? "pdf" : "json";
    const path = join(evidenceDirectory, `${artifactSequence}-${kind}.${extension}`);
    const serialized =
      typeof content === "string" || Buffer.isBuffer(content)
        ? content
        : JSON.stringify(content);
    writeFileSync(path, serialized);
    const artifact = { id, kind, path, sha256: sha256(serialized) };
    artifacts.push(artifact);
    return artifact;
  }

  function commonArtifact(
    kind: AgentInteractionArtifactKind,
    record: Pick<AgentInteractionEvidenceRecord, "id" | "interactionId">,
  ) {
    return {
      capturedAt,
      interactionId: record.interactionId,
      kind,
      recordId: record.id,
      runId,
      sanitized: true,
      schemaVersion: V19_AGENT_INTERACTION_EVIDENCE_SCHEMA_VERSION,
    };
  }

  const records: AgentInteractionEvidenceRecord[] = Object.values(
    V19_AGENT_INTERACTION_CONTRACTS,
  ).flatMap(
    (contract) => {
      const statuses =
        "statusFixtures" in contract && contract.statusFixtures?.length
          ? contract.statusFixtures
          : (["draft"] as const);
      return statuses.map((status) => {
        const recordId = `evidence:${contract.id}:${status}`;
        const actorId = actorIds[contract.role];
        const operationId = `operation:${contract.id}:${status}`;
        const entityTargets: readonly (
          | AgentInteractionMutationTarget
          | "return-package"
          | "session"
          | "ui-state"
        )[] =
          contract.kind === "mutation"
            ? contract.writeScope.requiredCheckedTargets
            : contract.kind === "download"
              ? ["return-package"]
              : contract.kind === "session"
                ? ["session"]
                : ["ui-state"];
        const entities = entityTargets.map((target) => ({
          id: `entity:${contract.id}:${status}:${target}`,
          ownerActorId: actorId,
          target,
        }));
        const primaryTarget =
          contract.kind === "mutation"
            ? contract.canonicalEffect.primaryTarget
            : entityTargets[0]!;
        const primaryEntity = entities.find(
          (entity) => entity.target === primaryTarget,
        );
        if (!primaryEntity) throw new Error("expected primary evidence entity");
        const synthetic = {
          actor: { id: actorId, role: contract.role },
          entities,
          markerSha256,
          operationId,
          primaryEntityId: primaryEntity.id,
        };
        const entityIdForTarget = (
          target:
            | AgentInteractionMutationTarget
            | "return-package"
            | "session"
            | "ui-state",
        ) =>
          entities.find((entity) => entity.target === target)?.id ??
          synthetic.primaryEntityId;
        const downloadBytes = Buffer.from(
          "%PDF-1.4\n% CODEX-E2E-verifier-fixture\n%%EOF\n",
        );
        const returnPackageArtifact =
          contract.id === "returned-documents.download"
            ? {
                artifactId: "00000000-0000-4000-8000-000000000701",
                fileName: "CODEX-E2E-returned.pdf",
                owner: "current-agent" as const,
                packageId: "00000000-0000-4000-8000-000000000700",
                packageStatus: "published" as const,
                sha256: sha256(downloadBytes),
                sizeBytes: downloadBytes.byteLength,
                storageBucket: "agent-return-packages" as const,
                storagePath:
                  "return-packages/CODEX-E2E-verifier-fixture/applicants/applicant-1/visa_application.pdf",
              }
            : undefined;
        const signedReturnPackagePath = returnPackageArtifact
          ? `/storage/v1/object/sign/agent-return-packages/${returnPackageArtifact.storagePath}`
          : undefined;
        const correlation = (
          target:
            | AgentInteractionMutationTarget
            | "return-package"
            | "session"
            | "ui-state",
        ) => ({
          actorId,
          actorRole: contract.role,
          entityIds: [entityIdForTarget(target)],
          operationClass: null,
          operationId,
          query: null,
          resultSha256: null,
          target,
        });
        const providerResultSha256 = sha256(`${recordId}:provider-result`);
        const mutationResponses =
          contract.kind === "mutation"
            ? contract.writeScope.requiredNetworkTargets.map((networkTarget) => {
                const target =
                  networkTarget === "storage:submission-media"
                    ? "submission-media"
                    : contract.canonicalEffect.primaryTarget;
                return {
                  ...correlation(target),
                  method: "POST" as const,
                  path: writePathByTarget[networkTarget],
                  status: 200,
                  write: true,
                };
              })
            : [];
        const networkResponses = (
          contract.proof as readonly AgentInteractionProof[]
        ).includes("network-readback")
          ? contract.kind === "mutation"
            ? mutationResponses
            : contract.kind === "session"
              ? [
                  {
                    ...correlation("session"),
                    ...sessionNetwork[contract.id],
                    resultSha256: providerResultSha256,
                    status: 200,
                    write: true,
                  },
                ]
              : contract.kind === "download"
                ? [
                    {
                      ...correlation("return-package"),
                      method: "POST" as const,
                      path: signedReturnPackagePath!,
                      status: 200,
                      write: false,
                    },
                    {
                      ...correlation("return-package"),
                      method: "GET" as const,
                      path: signedReturnPackagePath!,
                      status: 200,
                      write: false,
                    },
                  ]
                : [
                    {
                      ...correlation("ui-state"),
                      method: "GET" as const,
                      path: "/fixture-read",
                      status: 200,
                      write: false,
                    },
                  ]
          : (contract.proof as readonly AgentInteractionProof[]).includes(
                "no-network-write",
              )
            ? []
            : undefined;
        const resolveCanonicalValue = (value: string | number | boolean | null) =>
          value === "$fixture-status"
            ? status
            : value === "$marker-sha256"
              ? markerSha256
              : value;
        const canonicalFields =
          contract.kind === "mutation"
            ? Object.keys(contract.canonicalEffect.expectedAfter)
            : ["fixture.state"];
        const canonicalBefore =
          contract.kind === "mutation"
            ? Object.fromEntries(
                Object.entries(contract.canonicalEffect.before).map(([field, value]) => [
                  field,
                  resolveCanonicalValue(value),
                ]),
              )
            : { "fixture.state": "before" };
        const canonicalAfter =
          contract.kind === "mutation"
            ? Object.fromEntries(
                Object.entries(contract.canonicalEffect.expectedAfter).map(
                  ([field, value]) => [field, resolveCanonicalValue(value)],
                ),
              )
            : { "fixture.state": "after" };
        const targetSnapshots =
          contract.kind === "mutation"
            ? contract.writeScope.requiredCheckedTargets.map((target) => {
                const beforeSha256 = sha256(`${recordId}:${target}:before`);
                return {
                  afterSha256: contract.writeScope.requiredChangedTargets.includes(target)
                    ? sha256(`${recordId}:${target}:after`)
                    : beforeSha256,
                  beforeSha256,
                  entityIds: [entityIdForTarget(target)],
                  target,
                };
              })
            : undefined;
        const mutation =
          contract.kind === "mutation"
            ? {
                canonicalReloadReadback: {
                  before: canonicalBefore,
                  expectedAfter: canonicalAfter,
                  fields: canonicalFields,
                  reloadedAt: capturedAt,
                },
                networkResponse: {
                  method: mutationResponses[0]!.method,
                  path: mutationResponses[0]!.path,
                  status: mutationResponses[0]!.status,
                },
                unintendedWrites: {
                  changedTargets: contract.writeScope.requiredChangedTargets,
                  checkedTargets: contract.writeScope.requiredCheckedTargets,
                  targetSnapshots: targetSnapshots!,
                },
              }
            : undefined;
        const recordBase = { id: recordId, interactionId: contract.id };
        const artifactIds: string[] = [];

        for (const proof of contract.proof) {
          const kind = proofArtifactKind[proof];
          if (kind === "download") {
            if (!returnPackageArtifact) {
              throw new Error("expected canonical return-package artifact fixture");
            }
            const file = addArtifact("download", downloadBytes);
            artifactIds.push(file.id);
            artifactIds.push(
              addArtifact("download-metadata", {
                ...commonArtifact("download-metadata", recordBase),
                byteLength: downloadBytes.byteLength,
                canonicalArtifactId: returnPackageArtifact.artifactId,
                canonicalPackageId: returnPackageArtifact.packageId,
                fileArtifactId: file.id,
                fileName: returnPackageArtifact.fileName,
                fileSha256: file.sha256,
                owner: returnPackageArtifact.owner,
                packageStatus: returnPackageArtifact.packageStatus,
                storageBucket: returnPackageArtifact.storageBucket,
                storagePath: returnPackageArtifact.storagePath,
                syntheticMarker: runId,
              }).id,
            );
            const fields = [
              "agent_return_package_artifacts.file_name",
              "agent_return_package_artifacts.id",
              "agent_return_package_artifacts.sha256",
              "agent_return_package_artifacts.size_bytes",
              "agent_return_package_artifacts.storage_bucket",
              "agent_return_package_artifacts.storage_path",
              "agent_return_packages.agent_id",
              "agent_return_packages.status",
            ];
            const after = {
              "agent_return_package_artifacts.file_name": returnPackageArtifact.fileName,
              "agent_return_package_artifacts.id": returnPackageArtifact.artifactId,
              "agent_return_package_artifacts.sha256": returnPackageArtifact.sha256,
              "agent_return_package_artifacts.size_bytes": returnPackageArtifact.sizeBytes,
              "agent_return_package_artifacts.storage_bucket":
                returnPackageArtifact.storageBucket,
              "agent_return_package_artifacts.storage_path":
                returnPackageArtifact.storagePath,
              "agent_return_packages.agent_id": actorId,
              "agent_return_packages.status": returnPackageArtifact.packageStatus,
            };
            artifactIds.push(
              addArtifact("canonical-readback", {
                ...commonArtifact("canonical-readback", recordBase),
                actorId,
                actorRole: contract.role,
                after,
                before: {
                  ...after,
                  "agent_return_packages.status": "pre-publish",
                },
                entityId: synthetic.primaryEntityId,
                expectedAfter: after,
                fields,
                markerSha256,
                operationId,
                reloadedAt: capturedAt,
              }).id,
            );
            continue;
          }

          const common = commonArtifact(kind, recordBase);
          const content = (() => {
            switch (kind) {
              case "dom-snapshot":
                return {
                  ...common,
                  enabled: true,
                  expectedEffectConfirmed: true,
                  role: contract.role,
                  statusFixture: status,
                  surface: contract.surface,
                  viewport: "1440x900",
                };
              case "network-ledger":
                return { ...common, requests: networkResponses };
              case "no-network-write":
                return {
                  ...common,
                  observedRequests: networkResponses ?? [],
                  unexpectedWrites: [],
                };
              case "canonical-readback": {
                const signsOut = ["access.pending-sign-out", "shell.sign-out"].includes(
                  contract.id,
                );
                const fields = mutation ? canonicalFields : ["fixture.state"];
                const before = mutation
                  ? canonicalBefore
                  : { "fixture.state": signsOut ? "authenticated" : "before" };
                const after = mutation
                  ? canonicalAfter
                  : {
                      "fixture.state":
                        contract.kind === "session"
                          ? signsOut
                            ? "anonymous"
                            : "authenticated"
                          : "after",
                    };
                return {
                  ...common,
                  actorId,
                  actorRole: contract.role,
                  after,
                  before,
                  entityId: synthetic.primaryEntityId,
                  expectedAfter: after,
                  fields,
                  markerSha256,
                  operationId,
                  reloadedAt: capturedAt,
                };
              }
              case "storage-readback":
                return {
                  ...common,
                  actorId,
                  entityId: synthetic.primaryEntityId,
                  markerSha256,
                  operationId,
                  slots: ["passport_scan"],
                };
              case "cross-role-readback":
                return {
                  ...common,
                  entityId: synthetic.primaryEntityId,
                  fields: canonicalFields,
                  markerSha256,
                  observedAt: capturedAt,
                  observedValues: canonicalAfter,
                  operationId,
                  sourceActorId: actorId,
                  witnessActorId: adminWitnessActorId,
                  witnessRole: "admin",
                };
              case "clipboard-proof":
                return { ...common, characterCount: 32, passed: true };
              case "session-transition": {
                const signsOut = ["access.pending-sign-out", "shell.sign-out"].includes(
                  contract.id,
                );
                return {
                  ...common,
                  actorId,
                  actorRole: contract.role,
                  entityId: synthetic.primaryEntityId,
                  from: signsOut ? "authenticated" : "anonymous",
                  fromSessionSha256: signsOut
                    ? sha256(`${recordId}:session:before`)
                    : null,
                  markerSha256,
                  operationClass:
                    sessionNetwork[contract.id as keyof typeof sessionNetwork]
                      .operationClass,
                  operationId,
                  providerResultSha256,
                  reloadedAt: capturedAt,
                  reloginVerifiedAt: capturedAt,
                  to: signsOut ? "anonymous" : "authenticated",
                  toSessionSha256: signsOut
                    ? null
                    : sha256(`${recordId}:session:after`),
                };
              }
              default:
                throw new Error(`unsupported fixture artifact kind: ${kind}`);
            }
          })();
          artifactIds.push(addArtifact(kind, content).id);
        }

        if (mutation) {
          artifactIds.push(
            addArtifact("unintended-writes", {
              ...commonArtifact("unintended-writes", recordBase),
              changedTargets: mutation.unintendedWrites.changedTargets,
              checkedTargets: mutation.unintendedWrites.checkedTargets,
              targetSnapshots: mutation.unintendedWrites.targetSnapshots,
              unexpectedWrites: [],
            }).id,
          );
        }

        return {
          assertions: Object.fromEntries(
            contract.proof.map((proof) => [
              proof,
              { detail: `fixture asserted ${proof}`, passed: true },
            ]),
          ),
          execution: { artifactIds, capturedAt, runId },
          expectedEffect: {
            description: contract.expectedEffect,
            detail: "fixture confirmed the declared effect",
            passed: true,
          },
          fixture: {
            id: `fixture:${contract.id}:${status}`,
            returnPackageArtifact,
            submissionStatuses: [status],
            synthetic,
          },
          id: recordId,
          interactionId: contract.id,
          mutation,
          network: networkResponses ? { responses: networkResponses } : undefined,
          role: contract.role,
          surface: contract.surface,
          testCase: `fixture:${contract.id}:${status}`,
        } satisfies AgentInteractionEvidenceRecord;
      });
    },
  );

  const globalCommon = (kind: AgentInteractionArtifactKind) => ({
    capturedAt,
    kind,
    runId,
    sanitized: true,
    schemaVersion: V19_AGENT_INTERACTION_EVIDENCE_SCHEMA_VERSION,
  });
  const inventoryViewports = ["1440x900", "390x844"] as const;
  const enabledInventoryControls = records.flatMap((record) =>
    inventoryViewports.map((viewport) => ({
      enabled: true,
      expectedEffectConfirmed: true,
      interactionId: record.interactionId,
      recordId: record.id,
      role: record.role,
      statusFixture: record.fixture.submissionStatuses?.[0] ?? null,
      surface: record.surface,
      viewport,
      wrongRoleDenied: true,
    })),
  );
  const disabledInventoryControls = Object.values(
    V19_AGENT_INTERACTION_CONTRACTS,
  ).flatMap((contract) =>
    ("disabledStatusFixtures" in contract
      ? contract.disabledStatusFixtures
      : []
    ).flatMap((statusFixture) =>
      inventoryViewports.map((viewport) => ({
        disabledReason: "Canonical transition guard blocks this status.",
        enabled: false,
        expectedEffectConfirmed: true,
        interactionId: contract.id,
        recordId: `disabled:${contract.id}:${statusFixture}:${viewport}`,
        role: contract.role,
        statusFixture,
        surface: contract.surface,
        viewport,
        wrongRoleDenied: true,
      })),
    ),
  );
  const inventoryControls = [
    ...enabledInventoryControls,
    ...disabledInventoryControls,
  ];
  addArtifact("deployed-dom-inventory", {
    ...globalCommon("deployed-dom-inventory"),
    baseUrl: "https://document-intake-system.vercel.app",
    controls: inventoryControls,
    enabledControlCount: enabledInventoryControls.length,
    findings: [],
    roles: ["admin", "agent", "anonymous"],
    statusFixtures: [
      ...new Set(
        Object.values(V19_AGENT_INTERACTION_CONTRACTS).flatMap(
          (contract) => [
            ...("statusFixtures" in contract ? contract.statusFixtures : []),
            ...("disabledStatusFixtures" in contract
              ? contract.disabledStatusFixtures
              : []),
          ],
        ),
      ),
    ],
    surfaces: [
      ...new Set(
        Object.values(V19_AGENT_INTERACTION_CONTRACTS).map(
          (contract) => contract.surface,
        ),
      ),
    ],
    viewports: ["1440x900", "390x844", "1024x768", "768x1024"],
    wrongRoleDenials: inventoryControls.length,
  });
  addArtifact("chrome-network-ledger", {
    ...globalCommon("chrome-network-ledger"),
    baseUrl: "https://document-intake-system.vercel.app",
    backendOrigin,
    backendProjectRef,
    consoleErrors: 0,
    consoleWarnings: 0,
    failedRequests: 0,
    interactionsCovered: Object.keys(V19_AGENT_INTERACTION_CONTRACTS),
    unexpectedWrites: [],
  });
  const canonicalReadbackRecords = records.filter((record) =>
    (
      V19_AGENT_INTERACTION_CONTRACTS[
        record.interactionId as keyof typeof V19_AGENT_INTERACTION_CONTRACTS
      ].proof as readonly AgentInteractionProof[]
    ).includes("reload-readback"),
  );
  const isolationRecord = records.find(
    (record) =>
      record.role === "agent" &&
      record.mutation &&
      record.fixture.synthetic.entities.some((entity) => entity.target === "submissions"),
  );
  if (!isolationRecord) throw new Error("expected agent-owned mutation fixture");
  const isolationEntity = isolationRecord.fixture.synthetic.entities.find(
    (entity) => entity.target === "submissions",
  )!;
  const isolationRow = {
    agent_id: isolationEntity.ownerActorId,
    id: isolationEntity.id,
  };
  const isolationSnapshot = sha256(JSON.stringify(isolationRow));
  addArtifact("supabase-readback", {
    ...globalCommon("supabase-readback"),
    advisorCritical: 0,
    advisorMedium: 0,
    advisorSerious: 0,
    backendOrigin,
    backendProjectRef,
    canonicalReadbacks: canonicalReadbackRecords.map((record) => ({
      actorId: record.fixture.synthetic.actor.id,
      actorRole: record.role,
      entityId: record.fixture.synthetic.primaryEntityId,
      markerSha256: record.fixture.synthetic.markerSha256,
      operationId: record.fixture.synthetic.operationId,
      recordId: record.id,
      reloadedAt: capturedAt,
    })),
    ownerReadback: {
      actorId: isolationEntity.ownerActorId,
      actorRole: "agent",
      entityId: isolationEntity.id,
      markerSha256: isolationRecord.fixture.synthetic.markerSha256,
      method: "GET",
      observedAt: capturedAt,
      operationId: "operation:isolation:owner-read",
      path: exactSubmissionReadPath(isolationEntity.id),
      result: "one-row",
      row: isolationRow,
      rowCount: 1,
      snapshotSha256: isolationSnapshot,
      status: 200,
    },
    ownerReadbackAfter: {
      actorId: isolationEntity.ownerActorId,
      actorRole: "agent",
      entityId: isolationEntity.id,
      markerSha256: isolationRecord.fixture.synthetic.markerSha256,
      method: "GET",
      observedAt: capturedAt,
      operationId: "operation:isolation:owner-reread",
      path: exactSubmissionReadPath(isolationEntity.id),
      result: "one-row",
      row: isolationRow,
      rowCount: 1,
      snapshotSha256: isolationSnapshot,
      status: 200,
    },
    isolationCases: [
      {
        action: "read",
        actorId: otherAgentActorId,
        actorRole: "agent",
        afterSha256: isolationSnapshot,
        beforeSha256: isolationSnapshot,
        entityId: isolationEntity.id,
        errorCode: null,
        markerSha256: isolationRecord.fixture.synthetic.markerSha256,
        method: "GET",
        observedAt: capturedAt,
        operationId: "operation:isolation:read",
        ownerActorId: isolationEntity.ownerActorId,
        path: exactSubmissionReadPath(isolationEntity.id),
        result: "zero-rows",
        rowCount: 0,
        status: 200,
      },
      {
        action: "write",
        actorId: otherAgentActorId,
        actorRole: "agent",
        afterSha256: isolationSnapshot,
        beforeSha256: isolationSnapshot,
        entityId: isolationEntity.id,
        errorCode: "42501",
        markerSha256: isolationRecord.fixture.synthetic.markerSha256,
        method: "PATCH",
        observedAt: capturedAt,
        operationId: "operation:isolation:write",
        ownerActorId: isolationEntity.ownerActorId,
        path: exactSubmissionWritePath(isolationEntity.id),
        result: "denied",
        rowCount: 0,
        status: 403,
      },
    ],
    logErrors: 0,
    migrationsCurrent: true,
  });
  const gitHead = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: process.cwd(),
    encoding: "utf8",
  }).trim();
  addArtifact("vercel-inspect", {
    ...globalCommon("vercel-inspect"),
    aliases: ["https://document-intake-system.vercel.app"],
    backendOrigin,
    backendProjectRef,
    deploymentId: "dpl_SyntheticVerifierFixture",
    gitDirty: false,
    gitHead,
    state: "READY",
  });
  addArtifact("vercel-runtime-logs", {
    ...globalCommon("vercel-runtime-logs"),
    deploymentId: "dpl_SyntheticVerifierFixture",
    lookbackMinutes: 60,
    runtimeErrors: 0,
  });

  const manifestPath = join(evidenceDirectory, "manifest.json");
  const manifest = {
    artifacts,
    backendOrigin,
    backendProjectRef,
    capturedAt,
    deployedCommit: gitHead,
    deploymentAlias: "https://document-intake-system.vercel.app",
    deploymentGitDirty: false,
    deploymentId: "dpl_SyntheticVerifierFixture",
    deploymentState: "READY",
    gitHead,
    records,
    runId,
    schemaVersion: V19_AGENT_INTERACTION_EVIDENCE_SCHEMA_VERSION,
  } satisfies AgentInteractionEvidenceManifest;
  const writeManifest = () => writeFileSync(manifestPath, JSON.stringify(manifest));
  writeManifest();
  return { artifacts, manifest, manifestPath, writeManifest };
}

describe("agent interaction production evidence verifier", () => {
  test("fails closed when no external manifest is configured", () => {
    const result = verifierResult();

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      blockers: ["V19_AGENT_INTERACTION_EVIDENCE_FILE is not configured"],
      status: "BLOCKED",
    });
  });

  test("does not accept complete structured evidence without trusted CI provenance", () => {
    const fixture = productionFixture();
    const result = verifierResult(fixture.manifestPath);

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      blockers: ["trusted GitHub evidence attestation is missing"],
      status: "BLOCKED",
    });
  });

  test("does not allow the legacy unsigned flag to bypass trusted provenance", () => {
    const fixture = productionFixture();
    const result = verifierResult(fixture.manifestPath, {
      args: ["--unsigned-attestation-validation"],
      env: {
        GITHUB_ACTIONS: "true",
        GITHUB_WORKFLOW_REF:
          "Toni-Saint-V/V-19/.github/workflows/production-agent-evidence-attestation.yml@refs/heads/main",
      },
    });

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).blockers).toContain(
      "trusted GitHub evidence attestation is missing",
    );
  });

  test("blocks a tampered executable artifact", () => {
    const fixture = productionFixture();
    writeFileSync(fixture.artifacts[0]!.path, "tampered");
    const result = verifierResult(fixture.manifestPath);

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).blockers).toContain(
      `artifact ${fixture.artifacts[0]!.id} sha256 does not match`,
    );
  });

  test("blocks artifact reuse between interaction records", () => {
    const fixture = productionFixture();
    const [first, second] = fixture.manifest.records;
    if (!first || !second) throw new Error("expected interaction records");
    fixture.manifest.records = fixture.manifest.records.map((record) =>
      record === second
        ? {
            ...record,
            execution: {
              ...record.execution,
              artifactIds: [first.execution.artifactIds[0]!],
            },
          }
        : record,
    );
    fixture.writeManifest();

    const result = verifierResult(fixture.manifestPath);
    expect(JSON.parse(result.stdout).blockers).toEqual(
      expect.arrayContaining([
        expect.stringContaining("is reused by interaction records"),
      ]),
    );
  });

  test("blocks mutation evidence whose network artifact does not match the response", () => {
    const fixture = productionFixture();
    const target = fixture.manifest.records.find(
      (record) => record.interactionId === "questionnaire.save-exit",
    );
    if (!target?.mutation?.networkResponse) {
      throw new Error("expected mutation record");
    }
    (target.mutation.networkResponse as { path: string }).path =
      "/different-write";
    fixture.writeManifest();

    const result = verifierResult(fixture.manifestPath);
    expect(JSON.parse(result.stdout).blockers).toEqual(
      expect.arrayContaining([
        expect.stringContaining("does not prove the declared mutation response"),
      ]),
    );
  });

  test("blocks a mutation readback correlated to a different entity and operation", () => {
    const fixture = productionFixture();
    const target = fixture.manifest.records.find(
      (record) => record.interactionId === "questionnaire.save-exit",
    );
    const artifact = fixture.artifacts.find(
      (candidate) =>
        candidate.kind === "canonical-readback" &&
        Boolean(target?.execution.artifactIds.includes(candidate.id)),
    );
    if (!target || !artifact) throw new Error("expected canonical readback fixture");
    rewriteJsonArtifact(artifact, (content) => {
      content.entityId = "entity:foreign-submission";
      content.operationId = "operation:foreign-save";
    });
    fixture.writeManifest();

    const result = verifierResult(fixture.manifestPath);
    expect(JSON.parse(result.stdout).blockers).toContain(
      `artifact ${artifact.id} canonical readback is invalid`,
    );
  });

  test("blocks canonical reload values that do not equal the declared after-state", () => {
    const fixture = productionFixture();
    const target = fixture.manifest.records.find(
      (record) => record.interactionId === "questionnaire.save-exit",
    );
    const artifact = fixture.artifacts.find(
      (candidate) =>
        candidate.kind === "canonical-readback" &&
        Boolean(target?.execution.artifactIds.includes(candidate.id)),
    );
    if (!artifact) throw new Error("expected canonical readback fixture");
    rewriteJsonArtifact(artifact, (content) => {
      const fields = content.fields as string[];
      const after = content.after as Record<string, unknown>;
      after[fields[0]!] = "forged-after-value";
    });
    fixture.writeManifest();

    const result = verifierResult(fixture.manifestPath);
    expect(JSON.parse(result.stdout).blockers).toContain(
      `artifact ${artifact.id} canonical readback is invalid`,
    );
  });

  test("blocks a self-consistent lifecycle readback with the wrong contract state", () => {
    const fixture = productionFixture();
    const target = fixture.manifest.records.find(
      (record) => record.interactionId === "drawer.submit-review",
    );
    const canonicalArtifact = fixture.artifacts.find(
      (candidate) =>
        candidate.kind === "canonical-readback" &&
        Boolean(target?.execution.artifactIds.includes(candidate.id)),
    );
    const witnessArtifact = fixture.artifacts.find(
      (candidate) =>
        candidate.kind === "cross-role-readback" &&
        Boolean(target?.execution.artifactIds.includes(candidate.id)),
    );
    if (
      !target?.mutation?.canonicalReloadReadback ||
      !canonicalArtifact ||
      !witnessArtifact
    ) {
      throw new Error("expected lifecycle mutation evidence");
    }
    const field = target.mutation.canonicalReloadReadback.fields[0]!;
    (
      target.mutation.canonicalReloadReadback.expectedAfter as Record<string, unknown>
    )[field] = "ready_for_export";
    rewriteJsonArtifact(canonicalArtifact, (content) => {
      (content.after as Record<string, unknown>)[field] = "ready_for_export";
      (content.expectedAfter as Record<string, unknown>)[field] = "ready_for_export";
    });
    rewriteJsonArtifact(witnessArtifact, (content) => {
      (content.observedValues as Record<string, unknown>)[field] = "ready_for_export";
    });
    fixture.writeManifest();

    const blockers = JSON.parse(verifierResult(fixture.manifestPath).stdout).blockers;
    expect(blockers).toContain(
      `artifact ${canonicalArtifact.id} canonical readback is invalid`,
    );
    expect(blockers).toContain(
      `artifact ${witnessArtifact.id} cross-role readback is invalid`,
    );
  });

  test("blocks a primary entity reassigned to the wrong mutation target", () => {
    const fixture = productionFixture();
    const target = fixture.manifest.records.find(
      (record) => record.interactionId === "questionnaire.save-exit",
    );
    const canonicalArtifact = fixture.artifacts.find(
      (candidate) =>
        candidate.kind === "canonical-readback" &&
        Boolean(target?.execution.artifactIds.includes(candidate.id)),
    );
    const submissionEntity = target?.fixture.synthetic.entities.find(
      (entity) => entity.target === "submissions",
    );
    if (!target || !canonicalArtifact || !submissionEntity) {
      throw new Error("expected questionnaire target evidence");
    }
    target.fixture.synthetic.primaryEntityId = submissionEntity.id;
    rewriteJsonArtifact(canonicalArtifact, (content) => {
      content.entityId = submissionEntity.id;
    });
    fixture.writeManifest();

    expect(JSON.parse(verifierResult(fixture.manifestPath).stdout).blockers).toContain(
      "interaction questionnaire.save-exit: synthetic actor/entity/operation fixture is invalid",
    );
  });

  test("blocks a network response attributed to a different actor", () => {
    const fixture = productionFixture();
    const target = fixture.manifest.records.find(
      (record) => record.interactionId === "questionnaire.save-exit",
    );
    const artifact = fixture.artifacts.find(
      (candidate) =>
        candidate.kind === "network-ledger" &&
        Boolean(target?.execution.artifactIds.includes(candidate.id)),
    );
    if (!target?.network?.responses[0] || !artifact) {
      throw new Error("expected mutation network fixture");
    }
    target.network.responses[0].actorId = "00000000-0000-4000-8000-0000000000ff";
    rewriteJsonArtifact(artifact, (content) => {
      const requests = content.requests as Array<Record<string, unknown>>;
      requests[0]!.actorId = "00000000-0000-4000-8000-0000000000ff";
    });
    fixture.writeManifest();

    const result = verifierResult(fixture.manifestPath);
    expect(JSON.parse(result.stdout).blockers).toContain(
      `artifact ${artifact.id} does not match the declared network responses`,
    );
  });

  test("blocks a generic auth endpoint even when the session ledger declares it", () => {
    const fixture = productionFixture();
    const target = fixture.manifest.records.find(
      (record) => record.interactionId === "access.submit-login",
    );
    const artifact = fixture.artifacts.find(
      (candidate) =>
        candidate.kind === "network-ledger" &&
        Boolean(target?.execution.artifactIds.includes(candidate.id)),
    );
    if (!target?.network?.responses[0] || !artifact) {
      throw new Error("expected session network fixture");
    }
    target.network.responses[0].path = "/auth/v1/action";
    rewriteJsonArtifact(artifact, (content) => {
      const requests = content.requests as Array<Record<string, unknown>>;
      requests[0]!.path = "/auth/v1/action";
    });
    fixture.writeManifest();

    const result = verifierResult(fixture.manifestPath);
    expect(JSON.parse(result.stdout).blockers).toContain(
      `artifact ${artifact.id} does not prove the exact session endpoint`,
    );
  });

  test("blocks the right auth endpoint with the wrong sanitized operation class", () => {
    const fixture = productionFixture();
    const target = fixture.manifest.records.find(
      (record) => record.interactionId === "access.submit-login",
    );
    const artifact = fixture.artifacts.find(
      (candidate) =>
        candidate.kind === "network-ledger" &&
        Boolean(target?.execution.artifactIds.includes(candidate.id)),
    );
    if (!target?.network?.responses[0] || !artifact) {
      throw new Error("expected login network fixture");
    }
    target.network.responses[0].operationClass = "refresh-token-grant";
    target.network.responses[0].query = null;
    rewriteJsonArtifact(artifact, (content) => {
      const requests = content.requests as Array<Record<string, unknown>>;
      requests[0]!.operationClass = "refresh-token-grant";
      requests[0]!.query = null;
    });
    fixture.writeManifest();

    expect(JSON.parse(verifierResult(fixture.manifestPath).stdout).blockers).toContain(
      `artifact ${artifact.id} does not prove the exact session endpoint`,
    );
  });

  test("blocks a session transition not bound to its provider result", () => {
    const fixture = productionFixture();
    const target = fixture.manifest.records.find(
      (record) => record.interactionId === "access.submit-login",
    );
    const artifact = fixture.artifacts.find(
      (candidate) =>
        candidate.kind === "session-transition" &&
        Boolean(target?.execution.artifactIds.includes(candidate.id)),
    );
    if (!target || !artifact) throw new Error("expected login transition fixture");
    rewriteJsonArtifact(artifact, (content) => {
      content.providerResultSha256 = sha256("different-provider-result");
    });
    fixture.writeManifest();

    expect(JSON.parse(verifierResult(fixture.manifestPath).stdout).blockers).toContain(
      "interaction access.submit-login: session transition is not bound to the provider result",
    );
  });

  test("blocks an unknown control hidden in a nominally clean deployed inventory", () => {
    const fixture = productionFixture();
    const inventory = fixture.artifacts.find(
      (artifact) => artifact.kind === "deployed-dom-inventory",
    );
    if (!inventory) throw new Error("expected deployed inventory artifact");
    const content = JSON.parse(readFileSync(inventory.path, "utf8")) as {
      controls: Array<Record<string, unknown>>;
      enabledControlCount: number;
      wrongRoleDenials: number;
    };
    content.controls.push({
      enabled: true,
      expectedEffectConfirmed: true,
      interactionId: "unknown.control",
      recordId: "evidence:unknown.control:draft",
      role: "agent",
      statusFixture: "draft",
      surface: "agent-shell",
      viewport: "1440x900",
      wrongRoleDenied: true,
    });
    content.enabledControlCount += 1;
    content.wrongRoleDenials += 1;
    const serialized = JSON.stringify(content);
    writeFileSync(inventory.path, serialized);
    inventory.sha256 = sha256(serialized);
    fixture.writeManifest();

    const result = verifierResult(fixture.manifestPath);
    expect(JSON.parse(result.stdout).blockers).toContain(
      `artifact ${inventory.id} contains unknown or mis-scoped control unknown.control`,
    );
  });

  test("blocks a declared mutation write outside its intent-specific network scope", () => {
    const fixture = productionFixture();
    const target = fixture.manifest.records.find(
      (record) => record.interactionId === "questionnaire.save-exit",
    );
    if (!target?.mutation?.networkResponse || !target.network?.responses[0]) {
      throw new Error("expected questionnaire mutation evidence");
    }
    const networkArtifact = fixture.artifacts.find(
      (artifact) =>
        artifact.kind === "network-ledger" &&
        target.execution.artifactIds.includes(artifact.id),
    );
    if (!networkArtifact) throw new Error("expected network artifact");
    const unexpectedPath = "/rest/v1/rpc/complete_export_package";
    (target.mutation.networkResponse as { path: string }).path = unexpectedPath;
    (target.network.responses[0] as { path: string }).path = unexpectedPath;
    rewriteJsonArtifact(networkArtifact, (content) => {
      const requests = content.requests as Array<Record<string, unknown>>;
      requests[0]!.path = unexpectedPath;
    });
    fixture.writeManifest();

    const result = verifierResult(fixture.manifestPath);
    expect(JSON.parse(result.stdout).blockers).toContain(
      `artifact ${networkArtifact.id} violates the interaction network-write scope`,
    );
  });

  test("blocks arbitrary checked and changed mutation targets", () => {
    const fixture = productionFixture();
    const target = fixture.manifest.records.find(
      (record) => record.interactionId === "questionnaire.save-exit",
    );
    if (!target?.mutation?.unintendedWrites) {
      throw new Error("expected questionnaire unintended-write evidence");
    }
    const artifact = fixture.artifacts.find(
      (candidate) =>
        candidate.kind === "unintended-writes" &&
        target.execution.artifactIds.includes(candidate.id),
    );
    if (!artifact) throw new Error("expected unintended-write artifact");
    target.mutation.unintendedWrites.checkedTargets = ["questionnaire_answers"];
    target.mutation.unintendedWrites.changedTargets = ["export_batches"];
    rewriteJsonArtifact(artifact, (content) => {
      content.checkedTargets = ["questionnaire_answers"];
      content.changedTargets = ["export_batches"];
    });
    fixture.writeManifest();

    const result = verifierResult(fixture.manifestPath);
    expect(JSON.parse(result.stdout).blockers).toContain(
      `artifact ${artifact.id} unintended-write proof is invalid`,
    );
  });

  test("blocks a target snapshot attributed to an entity from another table", () => {
    const fixture = productionFixture();
    const target = fixture.manifest.records.find(
      (record) => record.interactionId === "questionnaire.save-exit",
    );
    const artifact = fixture.artifacts.find(
      (candidate) =>
        candidate.kind === "unintended-writes" &&
        Boolean(target?.execution.artifactIds.includes(candidate.id)),
    );
    const snapshot = target?.mutation?.unintendedWrites?.targetSnapshots.find(
      (candidate) => candidate.target === "questionnaire_answers",
    );
    const submissionEntity = target?.fixture.synthetic.entities.find(
      (entity) => entity.target === "submissions",
    );
    if (!target || !artifact || !snapshot || !submissionEntity) {
      throw new Error("expected target snapshot fixture");
    }
    snapshot.entityIds = [submissionEntity.id];
    rewriteJsonArtifact(artifact, (content) => {
      const snapshots = content.targetSnapshots as Array<Record<string, unknown>>;
      const questionnaireSnapshot = snapshots.find(
        (candidate) => candidate.target === "questionnaire_answers",
      );
      questionnaireSnapshot!.entityIds = [submissionEntity.id];
    });
    fixture.writeManifest();

    expect(JSON.parse(verifierResult(fixture.manifestPath).stdout).blockers).toContain(
      `artifact ${artifact.id} unintended-write proof is invalid`,
    );
  });

  test("blocks a write hidden inside a nominally read-only interaction ledger", () => {
    const fixture = productionFixture();
    const target = fixture.manifest.records.find(
      (record) => record.interactionId === "shell.navigate-actions",
    );
    if (!target?.network) throw new Error("expected zero-write record ledger");
    const artifact = fixture.artifacts.find(
      (candidate) =>
        candidate.kind === "no-network-write" &&
        target.execution.artifactIds.includes(candidate.id),
    );
    if (!artifact) throw new Error("expected zero-write artifact");
    const hiddenWrite = {
      actorId: target.fixture.synthetic.actor.id,
      actorRole: target.role,
      entityIds: [target.fixture.synthetic.primaryEntityId],
      method: "POST" as const,
      operationClass: null,
      operationId: target.fixture.synthetic.operationId,
      path: "/rest/v1/rpc/save_submission_draft",
      query: null,
      resultSha256: null,
      status: 200,
      target: "ui-state" as const,
      write: true,
    };
    target.network.responses = [hiddenWrite];
    rewriteJsonArtifact(artifact, (content) => {
      content.observedRequests = [hiddenWrite];
    });
    fixture.writeManifest();

    const result = verifierResult(fixture.manifestPath);
    expect(JSON.parse(result.stdout).blockers).toContain(
      `artifact ${artifact.id} zero-write ledger is invalid`,
    );
  });

  test("blocks evidence bound to a different Supabase backend", () => {
    const fixture = productionFixture();
    fixture.manifest.backendProjectRef = "different-project-ref";
    fixture.manifest.backendOrigin = "https://different-project-ref.supabase.co";
    fixture.writeManifest();

    const result = verifierResult(fixture.manifestPath);
    expect(JSON.parse(result.stdout).blockers).toContain(
      "interaction evidence is not bound to the production Supabase backend",
    );
  });

  test("blocks Supabase isolation evidence without both concrete read and write cases", () => {
    const fixture = productionFixture();
    const artifact = fixture.artifacts.find(
      (candidate) => candidate.kind === "supabase-readback",
    );
    if (!artifact) throw new Error("expected Supabase proof fixture");
    rewriteJsonArtifact(artifact, (content) => {
      const isolationCases = content.isolationCases as Array<Record<string, unknown>>;
      content.isolationCases = [isolationCases[0]];
    });
    fixture.writeManifest();

    const result = verifierResult(fixture.manifestPath);
    expect(JSON.parse(result.stdout).blockers).toContain(
      `artifact ${artifact.id} Supabase proof is incomplete`,
    );
  });

  test("blocks RLS evidence captured against an unrelated REST resource", () => {
    const fixture = productionFixture();
    const artifact = fixture.artifacts.find(
      (candidate) => candidate.kind === "supabase-readback",
    );
    if (!artifact) throw new Error("expected Supabase proof fixture");
    rewriteJsonArtifact(artifact, (content) => {
      const isolationCases = content.isolationCases as Array<Record<string, unknown>>;
      isolationCases[0]!.path = "/rest/v1/profiles?select=id";
      isolationCases[1]!.path = "/rest/v1/profiles?id=eq.synthetic";
    });
    fixture.writeManifest();

    const result = verifierResult(fixture.manifestPath);
    expect(JSON.parse(result.stdout).blockers).toContain(
      `artifact ${artifact.id} Supabase proof is incomplete`,
    );
  });

  test("blocks RLS evidence without an owner-visible baseline for the same row", () => {
    const fixture = productionFixture();
    const artifact = fixture.artifacts.find(
      (candidate) => candidate.kind === "supabase-readback",
    );
    if (!artifact) throw new Error("expected Supabase proof fixture");
    rewriteJsonArtifact(artifact, (content) => {
      const ownerReadback = content.ownerReadback as Record<string, unknown>;
      ownerReadback.entityId = "entity:unrelated-submission";
      ownerReadback.snapshotSha256 = "f".repeat(64);
    });
    fixture.writeManifest();

    const result = verifierResult(fixture.manifestPath);
    expect(JSON.parse(result.stdout).blockers).toContain(
      `artifact ${artifact.id} Supabase proof is incomplete`,
    );
  });

  test("blocks RLS write isolation represented as an unrelated insert", () => {
    const fixture = productionFixture();
    const artifact = fixture.artifacts.find(
      (candidate) => candidate.kind === "supabase-readback",
    );
    if (!artifact) throw new Error("expected Supabase proof fixture");
    rewriteJsonArtifact(artifact, (content) => {
      const isolationCases = content.isolationCases as Array<Record<string, unknown>>;
      isolationCases[1]!.method = "POST";
    });
    fixture.writeManifest();

    expect(JSON.parse(verifierResult(fixture.manifestPath).stdout).blockers).toContain(
      `artifact ${artifact.id} Supabase proof is incomplete`,
    );
  });

  test("blocks RLS evidence without the owner reread after the denied write", () => {
    const fixture = productionFixture();
    const artifact = fixture.artifacts.find(
      (candidate) => candidate.kind === "supabase-readback",
    );
    if (!artifact) throw new Error("expected Supabase proof fixture");
    rewriteJsonArtifact(artifact, (content) => {
      delete content.ownerReadbackAfter;
    });
    fixture.writeManifest();

    expect(JSON.parse(verifierResult(fixture.manifestPath).stdout).blockers).toContain(
      `artifact ${artifact.id} Supabase proof is incomplete`,
    );
  });

  test("blocks an owner baseline whose canonical id and agent_id are forged", () => {
    const fixture = productionFixture();
    const artifact = fixture.artifacts.find(
      (candidate) => candidate.kind === "supabase-readback",
    );
    if (!artifact) throw new Error("expected Supabase proof fixture");
    rewriteJsonArtifact(artifact, (content) => {
      const ownerReadback = content.ownerReadback as Record<string, unknown>;
      ownerReadback.row = {
        agent_id: "00000000-0000-4000-8000-0000000000ff",
        id: ownerReadback.entityId,
      };
    });
    fixture.writeManifest();

    expect(JSON.parse(verifierResult(fixture.manifestPath).stdout).blockers).toContain(
      `artifact ${artifact.id} Supabase proof is incomplete`,
    );
  });

  test("blocks a symlinked artifact even when its bytes and hash are valid", () => {
    const fixture = productionFixture();
    const artifact = fixture.artifacts[0];
    if (!artifact) throw new Error("expected artifact fixture");
    const symlinkPath = join(
      resolve(artifact.path, ".."),
      "symlinked-artifact.json",
    );
    symlinkSync(artifact.path, symlinkPath);
    artifact.path = symlinkPath;
    fixture.writeManifest();

    expect(JSON.parse(verifierResult(fixture.manifestPath).stdout).blockers).toContain(
      `artifact ${artifact.id} is missing, unsafe, or outside the evidence root`,
    );
  });

  test("blocks a returned PDF whose signed network path is not its canonical artifact", () => {
    const fixture = productionFixture();
    const target = fixture.manifest.records.find(
      (record) => record.interactionId === "returned-documents.download",
    );
    if (!target?.network) throw new Error("expected download network evidence");
    const wrongPath =
      "/storage/v1/object/sign/agent-return-packages/return-packages/CODEX-E2E-verifier-fixture/wrong.pdf";
    target.network.responses = target.network.responses.map((response) => ({
      ...response,
      path: wrongPath,
    }));
    for (const artifact of fixture.artifacts.filter(
      (candidate) =>
        ["network-ledger", "no-network-write"].includes(candidate.kind) &&
        target.execution.artifactIds.includes(candidate.id),
    )) {
      rewriteJsonArtifact(artifact, (content) => {
        if (Array.isArray(content.requests)) {
          content.requests = content.requests.map((request) => ({
            ...(request as Record<string, unknown>),
            path: wrongPath,
          }));
        }
        if (Array.isArray(content.observedRequests)) {
          content.observedRequests = content.observedRequests.map((request) => ({
            ...(request as Record<string, unknown>),
            path: wrongPath,
          }));
        }
      });
    }
    fixture.writeManifest();

    const result = verifierResult(fixture.manifestPath);
    expect(JSON.parse(result.stdout).blockers).toContain(
      "interaction returned-documents.download: PDF download metadata is incomplete",
    );
  });
});

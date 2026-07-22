import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  lstatSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import ts from "typescript";

const fallbackSchemaVersion = "v19-agent-interaction-evidence-v2";
const repoRoot = realpathSync(process.cwd());
const productionAlias = "https://document-intake-system.vercel.app";
const productionBackendProjectRef = "tsymifccglpepvbmrcgh";
const productionBackendOrigin = `https://${productionBackendProjectRef}.supabase.co`;
const trustedRepository = "Toni-Saint-V/V-19";
const trustedSignerWorkflow =
  "Toni-Saint-V/V-19/.github/workflows/production-agent-evidence-attestation.yml";
const evidenceFlagIndex = process.argv.indexOf("--evidence-file");
const configuredEvidencePath =
  (evidenceFlagIndex >= 0 ? process.argv[evidenceFlagIndex + 1] : undefined) ??
  process.env.V19_AGENT_INTERACTION_EVIDENCE_FILE ??
  "";

const proofArtifactKinds = {
  clipboard: new Set(["clipboard-proof"]),
  "cross-role-readback": new Set(["cross-role-readback"]),
  "dom-state": new Set(["dom-snapshot"]),
  download: new Set(["download"]),
  "network-readback": new Set(["network-ledger"]),
  "no-network-write": new Set(["no-network-write"]),
  "reload-readback": new Set(["canonical-readback"]),
  "session-transition": new Set(["session-transition"]),
  "storage-readback": new Set(["storage-readback"]),
};

const globalArtifactKinds = new Set([
  "chrome-network-ledger",
  "deployed-dom-inventory",
  "supabase-readback",
  "vercel-inspect",
  "vercel-runtime-logs",
]);

const structuredArtifactKinds = new Set([
  "canonical-readback",
  "chrome-network-ledger",
  "clipboard-proof",
  "cross-role-readback",
  "deployed-dom-inventory",
  "dom-snapshot",
  "download-metadata",
  "network-ledger",
  "no-network-write",
  "session-transition",
  "storage-readback",
  "supabase-readback",
  "unintended-writes",
  "vercel-inspect",
  "vercel-runtime-logs",
]);

const sessionNetworkContracts = {
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
};

function moduleFromTypeScript(path, dependencies = {}) {
  const source = readFileSync(path, "utf8");
  const result = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: path,
    reportDiagnostics: true,
  });
  const errors = (result.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  if (errors.length) {
    throw new Error("TypeScript evidence verifier could not load source truth");
  }

  const loadedModule = { exports: {} };
  const localRequire = (specifier) => {
    if (Object.hasOwn(dependencies, specifier)) return dependencies[specifier];
    throw new Error(`Unexpected runtime dependency: ${specifier}`);
  };
  const evaluate = new Function("require", "module", "exports", result.outputText);
  evaluate(localRequire, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}

function isObject(value) {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !ArrayBuffer.isView(value)
  );
}

function isNonEmptyString(value) {
  return typeof value === "string" && Boolean(value.trim());
}

function isOutsideRepository(path) {
  const relativePath = relative(repoRoot, path);
  return relativePath.startsWith("..") || isAbsolute(relativePath);
}

function isWithinDirectory(directory, path) {
  const relativePath = relative(directory, path);
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !isAbsolute(relativePath))
  );
}

function readStableFile(path) {
  const before = lstatSync(path);
  if (before.isSymbolicLink() || !before.isFile()) {
    throw new Error("evidence path must be a regular non-symlink file");
  }
  const bytes = readFileSync(path);
  const after = lstatSync(path);
  if (
    after.isSymbolicLink() ||
    !after.isFile() ||
    before.dev !== after.dev ||
    before.ino !== after.ino ||
    before.size !== after.size ||
    before.mtimeMs !== after.mtimeMs ||
    bytes.length !== after.size
  ) {
    throw new Error("evidence file changed while it was being read");
  }
  return bytes;
}

function readEvidenceFile(evidenceDirectory, value) {
  if (!isNonEmptyString(value)) {
    throw new Error("evidence path is missing");
  }
  const lexicalPath = resolve(evidenceDirectory, value);
  const realPath = realpathSync(lexicalPath);
  if (
    lexicalPath !== realPath ||
    !isWithinDirectory(evidenceDirectory, realPath) ||
    !isOutsideRepository(realPath)
  ) {
    throw new Error("evidence path escapes its external evidence root or uses a symlink");
  }
  return { bytes: readStableFile(realPath), path: realPath };
}

function sha256Buffer(value) {
  return createHash("sha256").update(value).digest("hex");
}

function isoTimestamp(value) {
  if (!isNonEmptyString(value)) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function currentGitHead() {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function forbiddenKeys(value, trail = "artifact", findings = []) {
  if (!value || typeof value !== "object") return findings;
  for (const [key, child] of Object.entries(value)) {
    if (
      /authorization|cookie|password|secret|service[_-]?role|access[_-]?token|refresh[_-]?token|headers?|payload|request[_-]?body|response[_-]?body|email/i.test(
        key,
      )
    ) {
      findings.push(`${trail}.${key}`);
      continue;
    }
    forbiddenKeys(child, `${trail}.${key}`, findings);
  }
  return findings;
}

function forbiddenText(value) {
  return (
    /\bBearer\s+[A-Za-z0-9._~+/=-]+/iu.test(value) ||
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu.test(value) ||
    /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/u.test(value)
  );
}

function hasOnlyKeys(value, allowedKeys) {
  return Object.keys(value).every((key) => allowedKeys.has(key));
}

function validStringArray(value) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((entry) => isNonEmptyString(entry))
  );
}

function validSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function validCanonicalValues(value, fields) {
  return (
    isObject(value) &&
    Array.isArray(fields) &&
    fields.length > 0 &&
    new Set(fields).size === fields.length &&
    Object.keys(value).length === fields.length &&
    fields.every(
      (field) =>
        isNonEmptyString(field) &&
        Object.hasOwn(value, field) &&
        (value[field] === null ||
          ["boolean", "number", "string"].includes(typeof value[field])),
    )
  );
}

function sameCanonicalValues(left, right, fields) {
  return (
    validCanonicalValues(left, fields) &&
    validCanonicalValues(right, fields) &&
    fields.every((field) => left[field] === right[field])
  );
}

function resolvedCanonicalEffect(contract, record) {
  if (contract?.kind !== "mutation") return undefined;
  const statusFixture = record.fixture?.submissionStatuses?.[0];
  const markerSha256 = record.fixture?.synthetic?.markerSha256;
  const resolveValue = (value) => {
    if (value === "$fixture-status") return statusFixture;
    if (value === "$marker-sha256") return markerSha256;
    return value;
  };
  const resolveValues = (values) =>
    Object.fromEntries(
      Object.entries(values).map(([field, value]) => [field, resolveValue(value)]),
    );
  return {
    before: resolveValues(contract.canonicalEffect.before),
    expectedAfter: resolveValues(contract.canonicalEffect.expectedAfter),
    fields: Object.keys(contract.canonicalEffect.expectedAfter),
    primaryTarget: contract.canonicalEffect.primaryTarget,
  };
}

function requestMatches(left, right) {
  return (
    left.actorId === right.actorId &&
    left.actorRole === right.actorRole &&
    JSON.stringify(left.entityIds) === JSON.stringify(right.entityIds) &&
    left.method === right.method &&
    (left.operationClass ?? null) === (right.operationClass ?? null) &&
    left.operationId === right.operationId &&
    left.path === right.path &&
    (left.query ?? null) === (right.query ?? null) &&
    (left.resultSha256 ?? null) === (right.resultSha256 ?? null) &&
    left.status === right.status &&
    left.target === right.target &&
    left.write === right.write
  );
}

function requestWritesRemoteState(request) {
  if (["GET", "HEAD"].includes(request.method)) return false;
  if (
    request.method === "POST" &&
    /^\/storage\/v1\/object\/sign(?:\/|$)/u.test(request.path)
  ) {
    return false;
  }
  return true;
}

function networkWriteTarget(request) {
  if (!requestWritesRemoteState(request)) return undefined;
  const rpc = request.path.match(/^\/rest\/v1\/rpc\/([a-z0-9_]+)$/u);
  if (rpc) return `rpc:${rpc[1]}`;
  const edgeFunction = request.path.match(/^\/functions\/v1\/([a-z0-9_-]+)$/u);
  if (edgeFunction) return `edge:${edgeFunction[1]}`;
  const storage = request.path.match(/^\/storage\/v1\/object\/([^/]+)(?:\/|$)/u);
  if (storage) return `storage:${storage[1]}`;
  return undefined;
}

function validRequest(request) {
  return (
    isObject(request) &&
    hasOnlyKeys(
      request,
      new Set([
        "actorId",
        "actorRole",
        "entityIds",
        "method",
        "operationClass",
        "operationId",
        "path",
        "query",
        "resultSha256",
        "status",
        "target",
        "write",
      ]),
    ) &&
    isNonEmptyString(request.actorId) &&
    ["admin", "agent", "anonymous"].includes(request.actorRole) &&
    validStringArray(request.entityIds) &&
    new Set(request.entityIds).size === request.entityIds.length &&
    isNonEmptyString(request.operationId) &&
    ["DELETE", "GET", "HEAD", "PATCH", "POST", "PUT"].includes(request.method) &&
    (request.operationClass === null || isNonEmptyString(request.operationClass)) &&
    isNonEmptyString(request.path) &&
    request.path.startsWith("/") &&
    !request.path.includes("?") &&
    (request.query === null || request.query === "grant_type=password") &&
    (request.resultSha256 === null || validSha256(request.resultSha256)) &&
    Number.isInteger(request.status) &&
    request.status >= 100 &&
    request.status <= 599 &&
    isNonEmptyString(request.target) &&
    typeof request.write === "boolean" &&
    request.write === requestWritesRemoteState(request)
  );
}

function signedReturnPackagePath(storagePath) {
  if (
    !isNonEmptyString(storagePath) ||
    storagePath.startsWith("/") ||
    storagePath.includes("..") ||
    storagePath.includes("?")
  ) {
    return undefined;
  }
  return `/storage/v1/object/sign/agent-return-packages/${storagePath}`;
}

function exactSubmissionReadPath(entityId) {
  return `/rest/v1/submissions?id=eq.${encodeURIComponent(entityId)}&select=id%2Cagent_id%2Cupdated_at`;
}

function exactSubmissionWritePath(entityId) {
  return `/rest/v1/submissions?id=eq.${encodeURIComponent(entityId)}`;
}

function canonicalSubmissionOwnerRow(entityId, ownerActorId) {
  return { agent_id: ownerActorId, id: entityId };
}

function canonicalSubmissionOwnerRowSha256(entityId, ownerActorId) {
  return sha256Buffer(
    JSON.stringify(canonicalSubmissionOwnerRow(entityId, ownerActorId)),
  );
}

function validSyntheticFixtureForRecord(record, manifest, contract) {
  const synthetic = record.fixture?.synthetic;
  if (
    !isObject(synthetic) ||
    !isObject(synthetic.actor) ||
    synthetic.actor.id === "anonymous" ||
    !isNonEmptyString(synthetic.actor.id) ||
    synthetic.actor.role !== record.role ||
    !isNonEmptyString(synthetic.operationId) ||
    synthetic.markerSha256 !== sha256Buffer(manifest.runId) ||
    !isNonEmptyString(synthetic.primaryEntityId) ||
    !Array.isArray(synthetic.entities) ||
    !synthetic.entities.length
  ) {
    return false;
  }
  const entityIds = synthetic.entities.map((entity) => entity?.id);
  const entityTargets = synthetic.entities.map((entity) => entity?.target);
  const expectedTargets =
    contract?.kind === "mutation"
      ? contract.writeScope.requiredCheckedTargets
      : contract?.kind === "session"
        ? ["session"]
        : contract?.kind === "download"
          ? ["return-package"]
          : ["ui-state"];
  const primaryEntity = synthetic.entities.find(
    (entity) => entity?.id === synthetic.primaryEntityId,
  );
  return (
    new Set(entityIds).size === entityIds.length &&
    new Set(entityTargets).size === entityTargets.length &&
    JSON.stringify([...entityTargets].sort()) ===
      JSON.stringify([...expectedTargets].sort()) &&
    Boolean(primaryEntity) &&
    (contract?.kind !== "mutation" ||
      primaryEntity?.target === contract.canonicalEffect.primaryTarget) &&
    synthetic.entities.every(
      (entity) =>
        isObject(entity) &&
        isNonEmptyString(entity.id) &&
        entity.ownerActorId === synthetic.actor.id &&
        isNonEmptyString(entity.target),
    )
  );
}

function verifyCommonStructuredArtifact(content, artifact, manifest, blockers) {
  if (
    content.schemaVersion !== manifest.schemaVersion ||
    content.kind !== artifact.kind ||
    content.runId !== manifest.runId ||
    content.sanitized !== true ||
    !isoTimestamp(content.capturedAt)
  ) {
    blockers.push(`artifact ${artifact.id} structured metadata is invalid`);
  }
}

function verifyRecordArtifactContent({
  artifact,
  content,
  contract,
  manifest,
  record,
  blockers,
}) {
  verifyCommonStructuredArtifact(content, artifact, manifest, blockers);
  if (
    content.interactionId !== record.interactionId ||
    content.recordId !== record.id ||
    content.runId !== record.execution?.runId
  ) {
    blockers.push(`artifact ${artifact.id} does not correlate to its interaction record`);
  }

  const commonKeys = [
    "capturedAt",
    "interactionId",
    "kind",
    "recordId",
    "runId",
    "sanitized",
    "schemaVersion",
  ];
  const allowed = (...keys) => new Set([...commonKeys, ...keys]);

  switch (artifact.kind) {
    case "dom-snapshot":
      if (
        !hasOnlyKeys(
          content,
          allowed(
            "enabled",
            "expectedEffectConfirmed",
            "role",
            "statusFixture",
            "surface",
            "viewport",
          ),
        ) ||
        content.enabled !== true ||
        content.expectedEffectConfirmed !== true ||
        content.role !== record.role ||
        content.surface !== record.surface ||
        !/^(1440x900|390x844|1024x768|768x1024)$/u.test(content.viewport)
      ) {
        blockers.push(`artifact ${artifact.id} DOM proof is invalid`);
      }
      break;
    case "network-ledger": {
      if (
        !hasOnlyKeys(content, allowed("requests")) ||
        !Array.isArray(content.requests) ||
        !content.requests.length ||
        !content.requests.every(validRequest)
      ) {
        blockers.push(`artifact ${artifact.id} network ledger is invalid`);
        break;
      }
      const declaredResponses = record.network?.responses ?? [];
      const synthetic = record.fixture?.synthetic;
      const syntheticEntityIds = new Set(
        synthetic?.entities?.map((entity) => entity.id) ?? [],
      );
      const syntheticEntityById = new Map(
        synthetic?.entities?.map((entity) => [entity.id, entity]) ?? [],
      );
      if (
        !declaredResponses.length ||
        declaredResponses.some(
          (expected) =>
            !content.requests.some((request) => requestMatches(request, expected)),
        ) ||
        content.requests.some((request) =>
          request.write &&
          !declaredResponses.some((expected) => requestMatches(request, expected)),
        ) ||
        content.requests.some(
          (request) =>
            request.actorId !== synthetic?.actor?.id ||
            request.actorRole !== record.role ||
            request.operationId !== synthetic?.operationId ||
            request.entityIds.some((entityId) =>
              !syntheticEntityIds.has(entityId) ||
              syntheticEntityById.get(entityId)?.target !== request.target,
            ),
        )
      ) {
        blockers.push(`artifact ${artifact.id} does not match the declared network responses`);
      }
      if (record.mutation?.networkResponse) {
        const expected = record.mutation.networkResponse;
        const matchesMutation = content.requests.some(
          (request) =>
            request.method === expected.method &&
            request.path === expected.path &&
            request.status === expected.status &&
            request.write === true,
        );
        if (!matchesMutation) {
          blockers.push(`artifact ${artifact.id} does not prove the declared mutation response`);
        }
      }
      if (contract?.kind === "mutation") {
        const observedWriteTargets = content.requests
          .filter((request) => request.write)
          .map(networkWriteTarget);
        if (
          observedWriteTargets.some((target) => !target) ||
          observedWriteTargets.some(
            (target) => !contract.writeScope.allowedNetworkTargets.includes(target),
          ) ||
          !contract.writeScope.requiredNetworkTargets.every((target) =>
            observedWriteTargets.includes(target),
          )
        ) {
          blockers.push(
            `artifact ${artifact.id} violates the interaction network-write scope`,
          );
        }
      }
      if (contract?.kind === "session") {
        const expectedSessionRequest = sessionNetworkContracts[contract.id];
        if (
          !expectedSessionRequest ||
          !content.requests.some(
            (request) =>
              request.method === expectedSessionRequest.method &&
              request.path === expectedSessionRequest.path &&
              request.query === expectedSessionRequest.query &&
              request.operationClass === expectedSessionRequest.operationClass &&
              validSha256(request.resultSha256) &&
              request.target === "session" &&
              request.write === true &&
              request.status >= 200 &&
              request.status < 300,
          )
        ) {
          blockers.push(
            `artifact ${artifact.id} does not prove the exact session endpoint`,
          );
        }
      }
      break;
    }
    case "canonical-readback": {
      const synthetic = record.fixture?.synthetic;
      const declared = record.mutation?.canonicalReloadReadback;
      const canonicalEffect = resolvedCanonicalEffect(contract, record);
      const primaryEntity = synthetic?.entities?.find(
        (entity) => entity.id === synthetic.primaryEntityId,
      );
      const reloadedAt = isoTimestamp(content.reloadedAt);
      const capturedAt = isoTimestamp(content.capturedAt);
      const fields = Array.isArray(content.fields) ? content.fields : [];
      const changedFields = fields.filter(
        (field) => content.before?.[field] !== content.after?.[field],
      );
      if (
        !hasOnlyKeys(
          content,
          allowed(
            "actorId",
            "actorRole",
            "after",
            "before",
            "entityId",
            "expectedAfter",
            "fields",
            "markerSha256",
            "operationId",
            "reloadedAt",
          ),
        ) ||
        content.actorId !== synthetic?.actor?.id ||
        content.actorRole !== record.role ||
        content.entityId !== synthetic?.primaryEntityId ||
        content.operationId !== synthetic?.operationId ||
        content.markerSha256 !== synthetic?.markerSha256 ||
        (canonicalEffect &&
          primaryEntity?.target !== canonicalEffect.primaryTarget) ||
        !reloadedAt ||
        !capturedAt ||
        reloadedAt < capturedAt ||
        !validCanonicalValues(content.before, fields) ||
        !validCanonicalValues(content.after, fields) ||
        !sameCanonicalValues(content.after, content.expectedAfter, fields) ||
        (canonicalEffect &&
          (JSON.stringify([...fields].sort()) !==
            JSON.stringify([...canonicalEffect.fields].sort()) ||
            !sameCanonicalValues(
              content.before,
              canonicalEffect.before,
              canonicalEffect.fields,
            ) ||
            !sameCanonicalValues(
              content.expectedAfter,
              canonicalEffect.expectedAfter,
              canonicalEffect.fields,
            ))) ||
        (contract?.kind === "mutation" && !changedFields.length) ||
        (declared &&
          (!sameCanonicalValues(content.before, declared.before, fields) ||
            !sameCanonicalValues(
              content.expectedAfter,
              declared.expectedAfter,
              fields,
            ) ||
            JSON.stringify([...fields].sort()) !==
              JSON.stringify([...declared.fields].sort()) ||
            content.reloadedAt !== declared.reloadedAt))
      ) {
        blockers.push(`artifact ${artifact.id} canonical readback is invalid`);
      }
      break;
    }
    case "unintended-writes": {
      const syntheticEntityIds = new Set(
        record.fixture?.synthetic?.entities?.map((entity) => entity.id) ?? [],
      );
      const syntheticEntityById = new Map(
        record.fixture?.synthetic?.entities?.map((entity) => [entity.id, entity]) ?? [],
      );
      const snapshots = Array.isArray(content.targetSnapshots)
        ? content.targetSnapshots
        : [];
      const validSnapshots = snapshots.every(
        (snapshot) =>
          isObject(snapshot) &&
          hasOnlyKeys(
            snapshot,
            new Set([
              "afterSha256",
              "beforeSha256",
              "entityIds",
              "target",
            ]),
          ) &&
          isNonEmptyString(snapshot.target) &&
          validSha256(snapshot.beforeSha256) &&
          validSha256(snapshot.afterSha256) &&
          validStringArray(snapshot.entityIds) &&
          snapshot.entityIds.every((entityId) =>
            syntheticEntityIds.has(entityId) &&
            syntheticEntityById.get(entityId)?.target === snapshot.target,
          ),
      );
      const derivedChangedTargets = snapshots
        .filter((snapshot) => snapshot.beforeSha256 !== snapshot.afterSha256)
        .map((snapshot) => snapshot.target);
      const normalizeSnapshots = (value) =>
        JSON.stringify(
          [...value]
            .map((snapshot) => ({
              ...snapshot,
              entityIds: [...snapshot.entityIds].sort(),
            }))
            .sort((left, right) => left.target.localeCompare(right.target)),
        );
      if (
        !hasOnlyKeys(
          content,
          allowed(
            "changedTargets",
            "checkedTargets",
            "targetSnapshots",
            "unexpectedWrites",
          ),
        ) ||
        !validStringArray(content.changedTargets) ||
        !validStringArray(content.checkedTargets) ||
        !validSnapshots ||
        !Array.isArray(content.unexpectedWrites) ||
        content.unexpectedWrites.length !== 0 ||
        contract?.kind !== "mutation" ||
        JSON.stringify([...content.checkedTargets].sort()) !==
          JSON.stringify([...contract.writeScope.requiredCheckedTargets].sort()) ||
        content.changedTargets.some(
          (target) => !contract.writeScope.allowedChangedTargets.includes(target),
        ) ||
        !contract.writeScope.requiredChangedTargets.every((target) =>
          content.changedTargets.includes(target),
        ) ||
        JSON.stringify([...content.changedTargets].sort()) !==
          JSON.stringify([...derivedChangedTargets].sort()) ||
        JSON.stringify([...content.checkedTargets].sort()) !==
          JSON.stringify(
            [...new Set(snapshots.map((snapshot) => snapshot.target))].sort(),
          ) ||
        !record.mutation?.unintendedWrites ||
        JSON.stringify([...content.checkedTargets].sort()) !==
          JSON.stringify(
            [...record.mutation.unintendedWrites.checkedTargets].sort(),
          ) ||
        JSON.stringify([...content.changedTargets].sort()) !==
          JSON.stringify(
            [...record.mutation.unintendedWrites.changedTargets].sort(),
          ) ||
        normalizeSnapshots(snapshots) !==
          normalizeSnapshots(record.mutation.unintendedWrites.targetSnapshots)
      ) {
        blockers.push(`artifact ${artifact.id} unintended-write proof is invalid`);
      }
      break;
    }
    case "no-network-write":
      {
        const declaredResponses = record.network?.responses;
      if (
        !hasOnlyKeys(content, allowed("observedRequests", "unexpectedWrites")) ||
        !Array.isArray(content.observedRequests) ||
        !content.observedRequests.every(validRequest) ||
        content.observedRequests.some((request) => request.write) ||
        !Array.isArray(declaredResponses) ||
        JSON.stringify(content.observedRequests) !==
          JSON.stringify(declaredResponses) ||
        !Array.isArray(content.unexpectedWrites) ||
        content.unexpectedWrites.length !== 0
      ) {
        blockers.push(`artifact ${artifact.id} zero-write ledger is invalid`);
      }
      break;
      }
    case "storage-readback": {
      const synthetic = record.fixture?.synthetic;
      if (
        !hasOnlyKeys(
          content,
          allowed(
            "actorId",
            "entityId",
            "markerSha256",
            "operationId",
            "slots",
          ),
        ) ||
        content.actorId !== synthetic?.actor?.id ||
        content.entityId !== synthetic?.primaryEntityId ||
        content.markerSha256 !== synthetic?.markerSha256 ||
        content.operationId !== synthetic?.operationId ||
        !validStringArray(content.slots)
      ) {
        blockers.push(`artifact ${artifact.id} storage readback is invalid`);
      }
      break;
    }
    case "cross-role-readback": {
      const synthetic = record.fixture?.synthetic;
      const canonicalEffect = resolvedCanonicalEffect(contract, record);
      if (
        !hasOnlyKeys(
          content,
          allowed(
            "entityId",
            "fields",
            "markerSha256",
            "observedAt",
            "observedValues",
            "operationId",
            "sourceActorId",
            "witnessActorId",
            "witnessRole",
          ),
        ) ||
        content.witnessRole !== "admin" ||
        !isNonEmptyString(content.witnessActorId) ||
        content.witnessActorId === synthetic?.actor?.id ||
        content.sourceActorId !== synthetic?.actor?.id ||
        content.entityId !== synthetic?.primaryEntityId ||
        content.operationId !== synthetic?.operationId ||
        content.markerSha256 !== synthetic?.markerSha256 ||
        !isoTimestamp(content.observedAt) ||
        !validStringArray(content.fields) ||
        !validCanonicalValues(content.observedValues, content.fields) ||
        !canonicalEffect ||
        JSON.stringify([...content.fields].sort()) !==
          JSON.stringify([...canonicalEffect.fields].sort()) ||
        !sameCanonicalValues(
          content.observedValues,
          canonicalEffect.expectedAfter,
          canonicalEffect.fields,
        )
      ) {
        blockers.push(`artifact ${artifact.id} cross-role readback is invalid`);
      }
      break;
    }
    case "clipboard-proof":
      if (
        !hasOnlyKeys(content, allowed("characterCount", "passed")) ||
        content.passed !== true ||
        !Number.isInteger(content.characterCount) ||
        content.characterCount <= 0
      ) {
        blockers.push(`artifact ${artifact.id} clipboard proof is invalid`);
      }
      break;
    case "session-transition": {
      const synthetic = record.fixture?.synthetic;
      const capturedAt = isoTimestamp(content.capturedAt);
      const reloadedAt = isoTimestamp(content.reloadedAt);
      const reloginVerifiedAt = isoTimestamp(content.reloginVerifiedAt);
      const sessionContract = sessionNetworkContracts[record.interactionId];
      const signsOut = ["access.pending-sign-out", "shell.sign-out"].includes(
        record.interactionId,
      );
      if (
        !hasOnlyKeys(
          content,
          allowed(
            "actorId",
            "actorRole",
            "entityId",
            "from",
            "fromSessionSha256",
            "markerSha256",
            "operationId",
            "operationClass",
            "providerResultSha256",
            "reloadedAt",
            "reloginVerifiedAt",
            "to",
            "toSessionSha256",
          ),
        ) ||
        content.actorId !== synthetic?.actor?.id ||
        content.actorRole !== record.role ||
        content.entityId !== synthetic?.primaryEntityId ||
        content.operationId !== synthetic?.operationId ||
        content.operationClass !== sessionContract?.operationClass ||
        !validSha256(content.providerResultSha256) ||
        content.markerSha256 !== synthetic?.markerSha256 ||
        !capturedAt ||
        !reloadedAt ||
        !reloginVerifiedAt ||
        reloadedAt < capturedAt ||
        reloginVerifiedAt < reloadedAt ||
        (signsOut
          ? content.from !== "authenticated" ||
            content.to !== "anonymous" ||
            !validSha256(content.fromSessionSha256) ||
            content.toSessionSha256 !== null
          : content.from !== "anonymous" ||
            content.to !== "authenticated" ||
            content.fromSessionSha256 !== null ||
            !validSha256(content.toSessionSha256))
      ) {
        blockers.push(`artifact ${artifact.id} session transition is invalid`);
      }
      break;
    }
    case "download-metadata":
      if (
        !hasOnlyKeys(
          content,
          allowed(
            "byteLength",
            "fileArtifactId",
            "canonicalArtifactId",
            "canonicalPackageId",
            "fileName",
            "fileSha256",
            "owner",
            "packageStatus",
            "storageBucket",
            "storagePath",
            "syntheticMarker",
          ),
        ) ||
        !isNonEmptyString(content.fileArtifactId) ||
        !/\.pdf$/iu.test(content.fileName) ||
        !Number.isInteger(content.byteLength) ||
        content.byteLength <= 5 ||
        !/^[a-f0-9]{64}$/u.test(content.fileSha256) ||
        !/^CODEX-E2E-[A-Za-z0-9_-]+$/u.test(content.syntheticMarker) ||
        !record.fixture?.returnPackageArtifact ||
        content.canonicalArtifactId !==
          record.fixture.returnPackageArtifact.artifactId ||
        content.canonicalPackageId !==
          record.fixture.returnPackageArtifact.packageId ||
        content.fileName !== record.fixture.returnPackageArtifact.fileName ||
        content.fileSha256 !== record.fixture.returnPackageArtifact.sha256 ||
        content.byteLength !== record.fixture.returnPackageArtifact.sizeBytes ||
        content.owner !== record.fixture.returnPackageArtifact.owner ||
        content.packageStatus !==
          record.fixture.returnPackageArtifact.packageStatus ||
        content.storageBucket !==
          record.fixture.returnPackageArtifact.storageBucket ||
        content.storagePath !== record.fixture.returnPackageArtifact.storagePath
      ) {
        blockers.push(`artifact ${artifact.id} download metadata is invalid`);
      }
      break;
    default:
      blockers.push(`artifact ${artifact.id} is not a record-scoped evidence kind`);
  }
}

function verifyGlobalArtifactContent({ artifact, content, manifest, contracts, blockers }) {
  verifyCommonStructuredArtifact(content, artifact, manifest, blockers);
  const commonKeys = new Set([
    "capturedAt",
    "kind",
    "runId",
    "sanitized",
    "schemaVersion",
  ]);
  const allowed = (...keys) => new Set([...commonKeys, ...keys]);

  switch (artifact.kind) {
    case "deployed-dom-inventory": {
      const requiredSurfaces = new Set(
        Object.values(contracts).map((contract) => contract.surface),
      );
      const requiredStatuses = new Set(
        Object.values(contracts).flatMap((contract) => contract.statusFixtures ?? []),
      );
      if (
        !hasOnlyKeys(
          content,
          allowed(
            "baseUrl",
            "controls",
            "enabledControlCount",
            "findings",
            "roles",
            "statusFixtures",
            "surfaces",
            "viewports",
            "wrongRoleDenials",
          ),
        ) ||
        content.baseUrl?.replace(/\/$/u, "") !== productionAlias ||
        !Array.isArray(content.findings) ||
        content.findings.length !== 0 ||
        !Number.isInteger(content.enabledControlCount) ||
        content.enabledControlCount <= 0 ||
        !Number.isInteger(content.wrongRoleDenials) ||
        content.wrongRoleDenials < 2 ||
        !Array.isArray(content.viewports) ||
        !["1440x900", "390x844"].every((entry) =>
          content.viewports.includes(entry),
        ) ||
        !Array.isArray(content.roles) ||
        !["admin", "agent", "anonymous"].every((entry) =>
          content.roles.includes(entry),
        ) ||
        !Array.isArray(content.surfaces) ||
        ![...requiredSurfaces].every((entry) => content.surfaces.includes(entry)) ||
        !Array.isArray(content.statusFixtures) ||
        ![...requiredStatuses].every((entry) =>
          content.statusFixtures.includes(entry),
        )
      ) {
        blockers.push(`artifact ${artifact.id} deployed DOM inventory is incomplete`);
      }
      const controls = Array.isArray(content.controls) ? content.controls : [];
      const validControlEntry = (entry) =>
        isObject(entry) &&
        hasOnlyKeys(
          entry,
          new Set([
            "disabledReason",
            "enabled",
            "expectedEffectConfirmed",
            "interactionId",
            "recordId",
            "role",
            "statusFixture",
            "surface",
            "viewport",
            "wrongRoleDenied",
          ]),
        ) &&
        isNonEmptyString(entry.interactionId) &&
        isNonEmptyString(entry.recordId) &&
        isNonEmptyString(entry.role) &&
        isNonEmptyString(entry.surface) &&
        ["1440x900", "390x844"].includes(entry.viewport) &&
        entry.expectedEffectConfirmed === true &&
        entry.wrongRoleDenied === true &&
        typeof entry.enabled === "boolean" &&
        (entry.enabled || isNonEmptyString(entry.disabledReason));
      if (!controls.length || !controls.every(validControlEntry)) {
        blockers.push(`artifact ${artifact.id} per-control inventory is invalid`);
        break;
      }
      const controlKeys = new Set();
      for (const entry of controls) {
        const contract = contracts[entry.interactionId];
        const record = manifest.records.find(
          (candidate) => candidate.id === entry.recordId,
        );
        const entryKey = [
          entry.interactionId,
          entry.recordId,
          entry.statusFixture ?? "none",
          entry.viewport,
          entry.enabled ? "enabled" : "disabled",
        ].join(":");
        if (controlKeys.has(entryKey)) {
          blockers.push(`artifact ${artifact.id} contains duplicate control ${entryKey}`);
        }
        controlKeys.add(entryKey);
        if (
          !contract ||
          contract.role !== entry.role ||
          contract.surface !== entry.surface
        ) {
          blockers.push(
            `artifact ${artifact.id} contains unknown or mis-scoped control ${entry.interactionId}`,
          );
          continue;
        }
        if (entry.enabled) {
          if (
            !record ||
            record.interactionId !== entry.interactionId ||
            record.role !== entry.role ||
            record.surface !== entry.surface ||
            (record.fixture.submissionStatuses?.[0] ?? null) !==
              entry.statusFixture
          ) {
            blockers.push(
              `artifact ${artifact.id} enabled control ${entry.interactionId} has no exact evidence record`,
            );
          }
        } else if (
          !contract.disabledStatusFixtures?.includes(entry.statusFixture)
        ) {
          blockers.push(
            `artifact ${artifact.id} disabled control ${entry.interactionId} has an unregistered status`,
          );
        }
      }
      if (
        content.enabledControlCount !==
          controls.filter((entry) => entry.enabled === true).length ||
        content.wrongRoleDenials < controls.length
      ) {
        blockers.push(`artifact ${artifact.id} per-control counts are inconsistent`);
      }
      for (const record of manifest.records) {
        const statusFixture = record.fixture.submissionStatuses?.[0] ?? null;
        for (const viewport of ["1440x900", "390x844"]) {
          const matchingEntry = controls.find(
            (entry) =>
              entry.enabled === true &&
              entry.interactionId === record.interactionId &&
              entry.recordId === record.id &&
              entry.role === record.role &&
              entry.surface === record.surface &&
              entry.statusFixture === statusFixture &&
              entry.viewport === viewport,
          );
          if (!matchingEntry) {
            blockers.push(
              `artifact ${artifact.id} is missing ${record.id} at ${viewport}`,
            );
          }
        }
      }
      for (const contract of Object.values(contracts)) {
        for (const statusFixture of contract.disabledStatusFixtures ?? []) {
          for (const viewport of ["1440x900", "390x844"]) {
            const matchingEntry = controls.find(
              (entry) =>
                entry.enabled === false &&
                entry.interactionId === contract.id &&
                entry.role === contract.role &&
                entry.surface === contract.surface &&
                entry.statusFixture === statusFixture &&
                entry.viewport === viewport &&
                isNonEmptyString(entry.disabledReason),
            );
            if (!matchingEntry) {
              blockers.push(
                `artifact ${artifact.id} is missing disabled ${contract.id}:${statusFixture} at ${viewport}`,
              );
            }
          }
        }
      }
      break;
    }
    case "chrome-network-ledger":
      if (
        !hasOnlyKeys(
          content,
          allowed(
            "baseUrl",
            "backendOrigin",
            "backendProjectRef",
            "consoleErrors",
            "consoleWarnings",
            "failedRequests",
            "interactionsCovered",
            "unexpectedWrites",
          ),
        ) ||
        content.baseUrl?.replace(/\/$/u, "") !== productionAlias ||
        content.backendProjectRef !== manifest.backendProjectRef ||
        content.backendOrigin?.replace(/\/$/u, "") !== manifest.backendOrigin ||
        content.consoleErrors !== 0 ||
        content.consoleWarnings !== 0 ||
        content.failedRequests !== 0 ||
        !Array.isArray(content.unexpectedWrites) ||
        content.unexpectedWrites.length !== 0 ||
        !validStringArray(content.interactionsCovered) ||
        !Object.keys(contracts).every((id) => content.interactionsCovered.includes(id))
      ) {
        blockers.push(`artifact ${artifact.id} Chrome ledger is incomplete`);
      }
      break;
    case "supabase-readback":
      {
        const requiredReadbackRecords = manifest.records.filter((record) =>
          contracts[record.interactionId]?.proof?.includes("reload-readback"),
        );
        const canonicalReadbacks = Array.isArray(content.canonicalReadbacks)
          ? content.canonicalReadbacks
          : [];
        const validCanonicalReadback = (readback) => {
          if (
            !isObject(readback) ||
            !hasOnlyKeys(
              readback,
              new Set([
                "actorId",
                "actorRole",
                "entityId",
                "markerSha256",
                "operationId",
                "recordId",
                "reloadedAt",
              ]),
            )
          ) {
            return false;
          }
          const record = manifest.records.find(
            (candidate) => candidate.id === readback.recordId,
          );
          const synthetic = record?.fixture?.synthetic;
          return (
            Boolean(record) &&
            readback.actorId === synthetic?.actor?.id &&
            readback.actorRole === record?.role &&
            readback.entityId === synthetic?.primaryEntityId &&
            readback.markerSha256 === synthetic?.markerSha256 &&
            readback.operationId === synthetic?.operationId &&
            Boolean(isoTimestamp(readback.reloadedAt))
          );
        };
        const isolationCases = Array.isArray(content.isolationCases)
          ? content.isolationCases
          : [];
        const validIsolationCase = (isolationCase) =>
          isObject(isolationCase) &&
          hasOnlyKeys(
            isolationCase,
            new Set([
              "action",
              "actorId",
              "actorRole",
              "afterSha256",
              "beforeSha256",
              "entityId",
              "errorCode",
              "markerSha256",
              "method",
              "observedAt",
              "operationId",
              "ownerActorId",
              "path",
              "result",
              "rowCount",
              "status",
            ]),
          ) &&
          ["read", "write"].includes(isolationCase.action) &&
          isNonEmptyString(isolationCase.actorId) &&
          isolationCase.actorRole === "agent" &&
          isNonEmptyString(isolationCase.ownerActorId) &&
          isolationCase.actorId !== isolationCase.ownerActorId &&
          isNonEmptyString(isolationCase.entityId) &&
          validSha256(isolationCase.markerSha256) &&
          isNonEmptyString(isolationCase.operationId) &&
          ["GET", "PATCH"].includes(isolationCase.method) &&
          isNonEmptyString(isolationCase.path) &&
          isolationCase.path ===
            (isolationCase.action === "read"
              ? exactSubmissionReadPath(isolationCase.entityId)
              : exactSubmissionWritePath(isolationCase.entityId)) &&
          Number.isInteger(isolationCase.status) &&
          Number.isInteger(isolationCase.rowCount) &&
          isolationCase.rowCount === 0 &&
          validSha256(isolationCase.beforeSha256) &&
          isolationCase.afterSha256 === isolationCase.beforeSha256 &&
          Boolean(isoTimestamp(isolationCase.observedAt)) &&
          (isolationCase.action === "read"
            ? isolationCase.method === "GET" &&
              isolationCase.status === 200 &&
              isolationCase.result === "zero-rows" &&
              isolationCase.errorCode === null
            : isolationCase.method === "PATCH" &&
              (([401, 403].includes(isolationCase.status) &&
                isolationCase.result === "denied" &&
                isolationCase.errorCode === "42501") ||
                ([200, 204].includes(isolationCase.status) &&
                  isolationCase.result === "zero-rows" &&
                  isolationCase.errorCode === null)));
        const readIsolation = isolationCases.find(
          (isolationCase) => isolationCase.action === "read",
        );
        const writeIsolation = isolationCases.find(
          (isolationCase) => isolationCase.action === "write",
        );
        const ownerRecord = manifest.records.find((record) =>
          record.fixture?.synthetic?.entities?.some(
            (entity) =>
              entity.id === readIsolation?.entityId &&
              entity.ownerActorId === readIsolation?.ownerActorId &&
              entity.target === "submissions",
          ),
        );
        const ownerEntity = ownerRecord?.fixture?.synthetic?.entities?.find(
          (entity) =>
            entity.id === readIsolation?.entityId &&
            entity.ownerActorId === readIsolation?.ownerActorId &&
            entity.target === "submissions",
        );
        const ownerReadback = content.ownerReadback;
        const ownerReadbackAfter = content.ownerReadbackAfter;
        const expectedOwnerRow = ownerEntity
          ? canonicalSubmissionOwnerRow(ownerEntity.id, ownerEntity.ownerActorId)
          : undefined;
        const expectedOwnerSnapshot = ownerEntity
          ? canonicalSubmissionOwnerRowSha256(
              ownerEntity.id,
              ownerEntity.ownerActorId,
            )
          : undefined;
        const validOwnerReadback = (readback) =>
          isObject(readback) &&
          hasOnlyKeys(
            readback,
            new Set([
              "actorId",
              "actorRole",
              "entityId",
              "markerSha256",
              "method",
              "observedAt",
              "operationId",
              "path",
              "result",
              "row",
              "rowCount",
              "snapshotSha256",
              "status",
            ]),
          ) &&
          readback.actorId === ownerEntity?.ownerActorId &&
          readback.actorId === ownerRecord?.fixture?.synthetic?.actor?.id &&
          readback.actorRole === "agent" &&
          ownerRecord?.role === "agent" &&
          readback.entityId === ownerEntity?.id &&
          readback.markerSha256 ===
            ownerRecord?.fixture?.synthetic?.markerSha256 &&
          readback.method === "GET" &&
          readback.path === exactSubmissionReadPath(readback.entityId) &&
          readback.status === 200 &&
          readback.result === "one-row" &&
          readback.rowCount === 1 &&
          isObject(readback.row) &&
          hasOnlyKeys(readback.row, new Set(["agent_id", "id"])) &&
          readback.row.id === expectedOwnerRow?.id &&
          readback.row.agent_id === expectedOwnerRow?.agent_id &&
          readback.snapshotSha256 === expectedOwnerSnapshot &&
          isNonEmptyString(readback.operationId) &&
          Boolean(isoTimestamp(readback.observedAt));
      if (
        !hasOnlyKeys(
          content,
          allowed(
            "advisorCritical",
            "advisorMedium",
            "advisorSerious",
            "backendOrigin",
            "backendProjectRef",
            "canonicalReadbacks",
            "isolationCases",
            "logErrors",
            "migrationsCurrent",
            "ownerReadback",
            "ownerReadbackAfter",
          ),
        ) ||
        content.backendProjectRef !== manifest.backendProjectRef ||
        content.backendOrigin?.replace(/\/$/u, "") !== manifest.backendOrigin ||
        content.advisorCritical !== 0 ||
        content.advisorSerious !== 0 ||
        content.advisorMedium !== 0 ||
        content.logErrors !== 0 ||
        content.migrationsCurrent !== true ||
        canonicalReadbacks.length !== requiredReadbackRecords.length ||
        !canonicalReadbacks.every(validCanonicalReadback) ||
        requiredReadbackRecords.some(
          (record) =>
            !canonicalReadbacks.some(
              (readback) => readback.recordId === record.id,
            ),
        ) ||
        isolationCases.length !== 2 ||
        !isolationCases.every(validIsolationCase) ||
        !readIsolation ||
        !writeIsolation ||
        !validOwnerReadback(ownerReadback) ||
        !validOwnerReadback(ownerReadbackAfter) ||
        !ownerEntity ||
        !ownerRecord ||
        readIsolation.actorId !== writeIsolation.actorId ||
        readIsolation.entityId !== writeIsolation.entityId ||
        readIsolation.ownerActorId !== writeIsolation.ownerActorId ||
        readIsolation.markerSha256 !== writeIsolation.markerSha256 ||
        readIsolation.markerSha256 !==
          ownerRecord.fixture?.synthetic?.markerSha256 ||
        ownerReadback.markerSha256 !== readIsolation.markerSha256 ||
        ownerReadback.snapshotSha256 !== readIsolation.beforeSha256 ||
        ownerReadback.snapshotSha256 !== writeIsolation.beforeSha256 ||
        ownerReadbackAfter.snapshotSha256 !== ownerReadback.snapshotSha256 ||
        ownerReadbackAfter.snapshotSha256 !== writeIsolation.afterSha256 ||
        isoTimestamp(ownerReadback.observedAt) >
          isoTimestamp(readIsolation.observedAt) ||
        isoTimestamp(ownerReadback.observedAt) >
          isoTimestamp(writeIsolation.observedAt) ||
        isoTimestamp(ownerReadbackAfter.observedAt) <
          isoTimestamp(readIsolation.observedAt) ||
        isoTimestamp(ownerReadbackAfter.observedAt) <
          isoTimestamp(writeIsolation.observedAt) ||
        new Set([
          ownerReadback.operationId,
          ownerReadbackAfter.operationId,
          readIsolation.operationId,
          writeIsolation.operationId,
        ]).size !== 4
      ) {
        blockers.push(`artifact ${artifact.id} Supabase proof is incomplete`);
      }
      break;
      }
    case "vercel-inspect":
      if (
        !hasOnlyKeys(
          content,
          allowed(
            "aliases",
            "backendOrigin",
            "backendProjectRef",
            "deploymentId",
            "gitDirty",
            "gitHead",
            "state",
          ),
        ) ||
        content.backendProjectRef !== manifest.backendProjectRef ||
        content.backendOrigin?.replace(/\/$/u, "") !== manifest.backendOrigin ||
        content.deploymentId !== manifest.deploymentId ||
        content.state !== manifest.deploymentState ||
        content.gitHead !== manifest.deployedCommit ||
        content.gitDirty !== false ||
        !Array.isArray(content.aliases) ||
        !content.aliases.map((alias) => alias.replace(/\/$/u, "")).includes(productionAlias)
      ) {
        blockers.push(`artifact ${artifact.id} Vercel inspect proof is invalid`);
      }
      break;
    case "vercel-runtime-logs":
      if (
        !hasOnlyKeys(
          content,
          allowed("deploymentId", "lookbackMinutes", "runtimeErrors"),
        ) ||
        content.deploymentId !== manifest.deploymentId ||
        !Number.isInteger(content.lookbackMinutes) ||
        content.lookbackMinutes < 30 ||
        content.runtimeErrors !== 0
      ) {
        blockers.push(`artifact ${artifact.id} Vercel runtime proof is invalid`);
      }
      break;
    default:
      blockers.push(`artifact ${artifact.id} is not a global evidence kind`);
  }
}

function verifyTrustedAttestation(
  manifest,
  manifestSha256,
  evidenceDirectory,
  schemaVersion,
  blockers,
) {
  const attestation = manifest.trustedAttestation;
  if (!isObject(attestation)) {
    blockers.push("trusted GitHub evidence attestation is missing");
    return;
  }
  if (
    attestation.repository !== trustedRepository ||
    attestation.signerWorkflow !== trustedSignerWorkflow ||
    !validSha256(attestation.subjectSha256) ||
    !validSha256(attestation.bundleSha256)
  ) {
    blockers.push("trusted GitHub evidence attestation identity is invalid");
    return;
  }

  let subjectFile;
  let bundleFile;
  try {
    subjectFile = readEvidenceFile(evidenceDirectory, attestation.subjectPath);
    bundleFile = readEvidenceFile(evidenceDirectory, attestation.bundlePath);
  } catch {
    blockers.push("trusted GitHub evidence attestation files are missing or in-repository");
    return;
  }
  if (
    sha256Buffer(subjectFile.bytes) !== attestation.subjectSha256 ||
    sha256Buffer(bundleFile.bytes) !== attestation.bundleSha256
  ) {
    blockers.push("trusted GitHub evidence attestation file hashes do not match");
    return;
  }

  let subject;
  try {
    subject = JSON.parse(subjectFile.bytes.toString("utf8"));
  } catch {
    blockers.push("trusted GitHub evidence attestation subject is invalid JSON");
    return;
  }
  if (
    subject?.schemaVersion !== schemaVersion ||
    subject?.manifestSha256 !== manifestSha256 ||
    subject?.gitHead !== manifest.gitHead ||
    subject?.deployedCommit !== manifest.deployedCommit ||
    subject?.deploymentId !== manifest.deploymentId ||
    subject?.deploymentAlias !== manifest.deploymentAlias ||
    subject?.runId !== manifest.runId ||
    subject?.backendProjectRef !== manifest.backendProjectRef ||
    subject?.backendOrigin !== manifest.backendOrigin
  ) {
    blockers.push("trusted GitHub evidence attestation subject does not bind the manifest");
    return;
  }

  const frozenDirectory = mkdtempSync(join(tmpdir(), "v19-attestation-verify-"));
  const frozenSubjectPath = join(frozenDirectory, "subject.json");
  const frozenBundlePath = join(frozenDirectory, "bundle.json");
  try {
    writeFileSync(frozenSubjectPath, subjectFile.bytes, { mode: 0o600 });
    writeFileSync(frozenBundlePath, bundleFile.bytes, { mode: 0o600 });
    const verification = execFileSync(
      "gh",
      [
        "attestation",
        "verify",
        frozenSubjectPath,
        "--bundle",
        frozenBundlePath,
        "--repo",
        trustedRepository,
        "--signer-workflow",
        trustedSignerWorkflow,
        "--source-digest",
        manifest.gitHead,
        "--source-ref",
        "refs/heads/main",
        "--deny-self-hosted-runners",
        "--format",
        "json",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
    const verifiedAttestations = JSON.parse(verification);
    if (!Array.isArray(verifiedAttestations) || !verifiedAttestations.length) {
      blockers.push("trusted GitHub evidence attestation returned no verified identity");
    }
  } catch {
    blockers.push("trusted GitHub evidence attestation verification failed");
  } finally {
    rmSync(frozenDirectory, { force: true, recursive: true });
  }
}

function verify() {
  const blockers = [];
  if (!configuredEvidencePath.trim()) {
    blockers.push("V19_AGENT_INTERACTION_EVIDENCE_FILE is not configured");
    return blockers;
  }

  const configuredPath = resolve(configuredEvidencePath);
  let evidencePath;
  let manifestBytes;
  try {
    evidencePath = realpathSync(configuredPath);
    if (evidencePath !== configuredPath || !isOutsideRepository(evidencePath)) {
      blockers.push(
        "interaction evidence must be a non-symlink file outside the product repository",
      );
      return blockers;
    }
    manifestBytes = readStableFile(evidencePath);
  } catch {
    blockers.push("configured interaction evidence manifest does not exist or is unsafe");
    return blockers;
  }
  const evidenceDirectory = dirname(evidencePath);
  const manifestSha256 = sha256Buffer(manifestBytes);
  let manifest;
  try {
    manifest = JSON.parse(manifestBytes.toString("utf8"));
  } catch {
    blockers.push("interaction evidence manifest is not valid JSON");
    return blockers;
  }

  const businessContractModule = moduleFromTypeScript(
    resolve(repoRoot, "src/modules/submissions/businessClickContract.ts"),
  );
  const contractModule = moduleFromTypeScript(
    resolve(repoRoot, "src/modules/submissions/agentInteractionContract.ts"),
    { "./businessClickContract": businessContractModule },
  );
  const evidenceModule = moduleFromTypeScript(
    resolve(repoRoot, "src/modules/submissions/agentInteractionEvidence.ts"),
    { "./agentInteractionContract": contractModule },
  );
  const schemaVersion =
    evidenceModule.V19_AGENT_INTERACTION_EVIDENCE_SCHEMA_VERSION ??
    fallbackSchemaVersion;
  const shapeFindings =
    evidenceModule.validateAgentInteractionEvidenceManifestShape(manifest);
  for (const finding of shapeFindings) {
    blockers.push(`interaction evidence schema: ${finding}`);
  }
  if (shapeFindings.length) return blockers;

  if (forbiddenKeys(manifest, "manifest").length) {
    blockers.push("interaction evidence manifest contains forbidden credential or PII fields");
  }
  if (forbiddenText(JSON.stringify(manifest))) {
    blockers.push("interaction evidence manifest contains credential or email-shaped content");
  }

  const head = currentGitHead();
  if (manifest.gitHead !== head) {
    blockers.push("interaction evidence gitHead does not match current HEAD");
  }
  if (
    manifest.backendProjectRef !== productionBackendProjectRef ||
    manifest.backendOrigin?.replace(/\/$/u, "") !== productionBackendOrigin
  ) {
    blockers.push("interaction evidence is not bound to the production Supabase backend");
  }
  if (manifest.deployedCommit !== head) {
    blockers.push("interaction evidence deployedCommit does not match current HEAD");
  }
  if (manifest.deploymentAlias.replace(/\/$/u, "") !== productionAlias) {
    blockers.push("interaction evidence deploymentAlias is not the production alias");
  }
  if (!/^dpl_[A-Za-z0-9]+$/u.test(manifest.deploymentId)) {
    blockers.push("interaction evidence deploymentId is missing or invalid");
  }
  if (manifest.deploymentGitDirty !== false) {
    blockers.push("interaction evidence deployment is not a clean checkout");
  }
  if (!/^CODEX-E2E-[A-Za-z0-9_-]+$/u.test(manifest.runId)) {
    blockers.push("interaction evidence runId is not a synthetic CODEX-E2E marker");
  }

  const capturedAt = isoTimestamp(manifest.capturedAt);
  const now = Date.now();
  if (!capturedAt) {
    blockers.push("interaction evidence capturedAt is missing or invalid");
  } else if (capturedAt > now + 5 * 60 * 1000) {
    blockers.push("interaction evidence capturedAt is in the future");
  } else if (now - capturedAt > 24 * 60 * 60 * 1000) {
    blockers.push("interaction evidence is older than 24 hours");
  }

  const artifactById = new Map();
  const artifactContentById = new Map();
  const artifactByteLengthById = new Map();
  for (const artifact of manifest.artifacts) {
    if (artifactById.has(artifact.id)) {
      blockers.push(`interaction evidence artifact id is duplicated: ${artifact.id}`);
      continue;
    }
    artifactById.set(artifact.id, artifact);
    let artifactFile;
    try {
      artifactFile = readEvidenceFile(evidenceDirectory, artifact.path);
    } catch {
      blockers.push(
        `artifact ${artifact.id} is missing, unsafe, or outside the evidence root`,
      );
      continue;
    }
    const bytes = artifactFile.bytes;
    const byteLength = bytes.length;
    if (byteLength <= 0 || byteLength > 50 * 1024 * 1024) {
      blockers.push(`artifact ${artifact.id} has an invalid byte length`);
      continue;
    }
    if (sha256Buffer(bytes) !== artifact.sha256) {
      blockers.push(`artifact ${artifact.id} sha256 does not match`);
      continue;
    }
    artifactByteLengthById.set(artifact.id, byteLength);
    if (artifact.kind === "download") {
      if (bytes.length <= 5 || bytes.subarray(0, 5).toString("utf8") !== "%PDF-") {
        blockers.push(`artifact ${artifact.id} is not a non-empty PDF download`);
      }
      artifactContentById.set(artifact.id, bytes);
      continue;
    }
    if (!structuredArtifactKinds.has(artifact.kind)) {
      blockers.push(`artifact ${artifact.id} kind is not executable evidence`);
      continue;
    }
    const raw = bytes.toString("utf8");
    if (forbiddenText(raw)) {
      blockers.push(`artifact ${artifact.id} contains credential or email-shaped content`);
      continue;
    }
    try {
      const content = JSON.parse(raw);
      if (!isObject(content)) throw new Error("not an object");
      if (forbiddenKeys(content).length) {
        blockers.push(`artifact ${artifact.id} contains forbidden credential or PII fields`);
      }
      artifactContentById.set(artifact.id, content);
    } catch {
      blockers.push(`artifact ${artifact.id} must contain structured JSON evidence`);
    }
  }

  for (const requiredKind of globalArtifactKinds) {
    const matching = [...artifactById.values()].filter(
      (artifact) => artifact.kind === requiredKind,
    );
    if (matching.length !== 1) {
      blockers.push(`production evidence requires exactly one artifact kind: ${requiredKind}`);
    } else {
      const artifact = matching[0];
      const content = artifactContentById.get(artifact.id);
      if (isObject(content)) {
        verifyGlobalArtifactContent({
          artifact,
          blockers,
          content,
          contracts: contractModule.V19_AGENT_INTERACTION_CONTRACTS,
          manifest,
        });
      }
    }
  }

  const auditFindings = evidenceModule.auditAgentInteractionEvidence(manifest.records);
  for (const finding of auditFindings) {
    blockers.push(
      `interaction ${finding.interactionId}: ${finding.reason}${
        finding.recordId ? ` (${finding.recordId})` : ""
      }`,
    );
  }

  const artifactOwnerById = new Map();
  for (const record of manifest.records) {
    const contract = contractModule.V19_AGENT_INTERACTION_CONTRACTS[record.interactionId];
    if (!validSyntheticFixtureForRecord(record, manifest, contract)) {
      blockers.push(
        `interaction ${record.interactionId}: synthetic actor/entity/operation fixture is invalid`,
      );
    }
    const artifactIds = record.execution.artifactIds;
    if (new Set(artifactIds).size !== artifactIds.length) {
      blockers.push(`interaction ${record.interactionId}: executable artifact ids are duplicated`);
    }
    if (record.execution.runId !== manifest.runId) {
      blockers.push(`interaction ${record.interactionId}: execution runId does not match manifest`);
    }
    const executionTimestamp = isoTimestamp(record.execution.capturedAt);
    if (
      !executionTimestamp ||
      !capturedAt ||
      Math.abs(executionTimestamp - capturedAt) > 24 * 60 * 60 * 1000
    ) {
      blockers.push(`interaction ${record.interactionId}: execution timestamp is invalid`);
    }

    const artifacts = [];
    for (const artifactId of artifactIds) {
      const owner = artifactOwnerById.get(artifactId);
      if (owner && owner !== record.id) {
        blockers.push(
          `artifact ${artifactId} is reused by interaction records ${owner} and ${record.id}`,
        );
      } else {
        artifactOwnerById.set(artifactId, record.id);
      }
      const artifact = artifactById.get(artifactId);
      if (!artifact) {
        blockers.push(`interaction ${record.interactionId}: executable artifact id is unknown`);
        continue;
      }
      artifacts.push(artifact);
      const content = artifactContentById.get(artifact.id);
      if (isObject(content)) {
        verifyRecordArtifactContent({
          artifact,
          blockers,
          content,
          contract,
          manifest,
          record,
        });
      }
    }

    for (const proof of contract?.proof ?? []) {
      const allowedKinds = proofArtifactKinds[proof];
      if (!allowedKinds || !artifacts.some((artifact) => allowedKinds.has(artifact.kind))) {
        blockers.push(
          `interaction ${record.interactionId}: proof ${proof} has no executable artifact`,
        );
      }
    }
    if (contract?.kind === "session") {
      const expectedSessionRequest = sessionNetworkContracts[contract.id];
      const networkArtifact = artifacts.find(
        (artifact) => artifact.kind === "network-ledger",
      );
      const networkContent = networkArtifact
        ? artifactContentById.get(networkArtifact.id)
        : undefined;
      const sessionRequest =
        isObject(networkContent) && Array.isArray(networkContent.requests)
          ? networkContent.requests.find(
            (request) =>
              request.operationClass === expectedSessionRequest?.operationClass &&
              request.path === expectedSessionRequest?.path &&
              request.query === expectedSessionRequest?.query,
          )
          : undefined;
      if (contract.proof.includes("session-transition")) {
        const transitionArtifact = artifacts.find(
          (artifact) => artifact.kind === "session-transition",
        );
        const transition = transitionArtifact
          ? artifactContentById.get(transitionArtifact.id)
          : undefined;
        if (
          !sessionRequest ||
          !isObject(transition) ||
          transition.operationClass !== sessionRequest.operationClass ||
          transition.providerResultSha256 !== sessionRequest.resultSha256
        ) {
          blockers.push(
            `interaction ${record.interactionId}: session transition is not bound to the provider result`,
          );
        }
      }
    }
    if (
      contract?.kind === "mutation" &&
      !artifacts.some((artifact) => artifact.kind === "unintended-writes")
    ) {
      blockers.push(
        `interaction ${record.interactionId}: mutation has no unintended-write artifact`,
      );
    }
    if (contract?.proof.includes("download")) {
      const fileArtifact = artifacts.find((artifact) => artifact.kind === "download");
      const metadataArtifact = artifacts.find(
        (artifact) => artifact.kind === "download-metadata",
      );
      const metadata = metadataArtifact
        ? artifactContentById.get(metadataArtifact.id)
        : undefined;
      const canonicalArtifact = record.fixture.returnPackageArtifact;
      const canonicalReadbackArtifact = artifacts.find(
        (artifact) => artifact.kind === "canonical-readback",
      );
      const canonicalReadback = canonicalReadbackArtifact
        ? artifactContentById.get(canonicalReadbackArtifact.id)
        : undefined;
      const signedPath = signedReturnPackagePath(canonicalArtifact?.storagePath);
      const networkResponses = record.network?.responses ?? [];
      const provesSignedDownload =
        Boolean(signedPath) &&
        networkResponses.some(
          (response) =>
            response.method === "POST" &&
            response.path === signedPath &&
            response.status >= 200 &&
            response.status < 300 &&
            response.write === false,
        ) &&
        networkResponses.some(
          (response) =>
            response.method === "GET" &&
            response.path === signedPath &&
            response.status >= 200 &&
            response.status < 300 &&
            response.write === false,
        );
      const requiredReadbackFields = [
        "agent_return_package_artifacts.file_name",
        "agent_return_package_artifacts.id",
        "agent_return_package_artifacts.sha256",
        "agent_return_package_artifacts.size_bytes",
        "agent_return_package_artifacts.storage_bucket",
        "agent_return_package_artifacts.storage_path",
        "agent_return_packages.agent_id",
        "agent_return_packages.status",
      ];
      const expectedCanonicalArtifact = canonicalArtifact
        ? {
            "agent_return_package_artifacts.file_name": canonicalArtifact.fileName,
            "agent_return_package_artifacts.id": canonicalArtifact.artifactId,
            "agent_return_package_artifacts.sha256": canonicalArtifact.sha256,
            "agent_return_package_artifacts.size_bytes": canonicalArtifact.sizeBytes,
            "agent_return_package_artifacts.storage_bucket":
              canonicalArtifact.storageBucket,
            "agent_return_package_artifacts.storage_path":
              canonicalArtifact.storagePath,
            "agent_return_packages.agent_id":
              record.fixture.synthetic?.actor?.id,
            "agent_return_packages.status": canonicalArtifact.packageStatus,
          }
        : undefined;
      if (
        !fileArtifact ||
        !metadataArtifact ||
        !canonicalArtifact ||
        !isObject(metadata) ||
        !isObject(canonicalReadback) ||
        !Array.isArray(canonicalReadback.fields) ||
        JSON.stringify([...canonicalReadback.fields].sort()) !==
          JSON.stringify([...requiredReadbackFields].sort()) ||
        !sameCanonicalValues(
          canonicalReadback.after,
          expectedCanonicalArtifact,
          requiredReadbackFields,
        ) ||
        canonicalArtifact.storageBucket !== "agent-return-packages" ||
        canonicalArtifact.packageStatus !== "published" ||
        canonicalArtifact.owner !== "current-agent" ||
        !provesSignedDownload ||
        metadata.fileArtifactId !== fileArtifact.id ||
        metadata.fileSha256 !== fileArtifact.sha256 ||
        metadata.byteLength !== artifactByteLengthById.get(fileArtifact.id)
      ) {
        blockers.push(`interaction ${record.interactionId}: PDF download metadata is incomplete`);
      }
    }
  }

  verifyTrustedAttestation(
    manifest,
    manifestSha256,
    evidenceDirectory,
    schemaVersion,
    blockers,
  );
  return blockers;
}

let blockers;
try {
  blockers = verify();
} catch (error) {
  blockers = [
    error instanceof Error
      ? `interaction evidence verifier failed: ${error.message}`
      : "interaction evidence verifier failed",
  ];
}

const result = {
  blockers,
  schemaVersion: fallbackSchemaVersion,
  status: blockers.length ? "BLOCKED" : "PASS",
};
console.log(JSON.stringify(result));
process.exit(blockers.length ? 1 : 0);

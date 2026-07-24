import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { requiredRemoteMigrationOrder } from "./supabase-migration-contract.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const readinessPath = resolve(
  repoRoot,
  "docs/release/supabase-production-readiness.json",
);
const expectedArtifactKeys = [
  "collectorCapturedAt",
  "columns",
  "contractSha256",
  "dbCapturedAt",
  "format",
  "functions",
  "projectRef",
  "querySha256",
  "registryRows",
  "triggers",
];
const expectedFormat = "v19.supabase-live-registry.v1";
const maxAgeMs = 15 * 60 * 1000;
const maxClockSkewMs = 60 * 1000;
const maxCollectorLagMs = 2 * 60 * 1000;

export const liveRegistryQuery = `begin transaction isolation level repeatable read read only;
select jsonb_build_object(
  'dbCapturedAt', to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'registryRows', coalesce((
    select jsonb_agg(
      jsonb_build_object('version', migration.version, 'name', migration.name)
      order by migration.version::numeric, migration.name
    )
    from supabase_migrations.schema_migrations as migration
  ), '[]'::jsonb),
  'columns', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'schema', column_info.table_schema,
        'table', column_info.table_name,
        'column', column_info.column_name,
        'type', column_info.data_type,
        'nullable', column_info.is_nullable = 'YES',
        'default', column_info.column_default
      )
      order by column_info.table_schema, column_info.table_name, column_info.ordinal_position
    )
    from information_schema.columns as column_info
    where column_info.table_schema = 'public'
      and (
        (
          column_info.table_name = 'submissions'
          and column_info.column_name in ('public_number', 'case_revision')
        )
        or (
          column_info.table_name = 'corrections'
          and column_info.column_name in (
            'target_revision',
            'agent_confirmed_at',
            'agent_confirmed_revision',
            'target_section_id',
            'target_field_id',
            'target_baseline',
            'target_projection'
          )
        )
      )
  ), '[]'::jsonb),
  'functions', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'identity', proc.oid::regprocedure::text,
        'securityDefiner', proc.prosecdef,
        'config', coalesce(to_jsonb(proc.proconfig), '[]'::jsonb),
        'definition', pg_get_functiondef(proc.oid),
        'anonExecute', has_function_privilege('anon', proc.oid, 'EXECUTE'),
        'authenticatedExecute', has_function_privilege('authenticated', proc.oid, 'EXECUTE')
      )
      order by proc.oid::regprocedure::text
    )
    from pg_catalog.pg_proc as proc
    where proc.oid in (
      'public.save_submission_draft(jsonb)'::regprocedure,
      'public.submit_corrections_handoff(jsonb)'::regprocedure,
      'app_private.dispatch_submission_draft_with_revision_context(jsonb)'::regprocedure,
      'app_private.save_submission_draft_for_internal_dispatch(jsonb)'::regprocedure,
      'app_private.save_submission_draft_without_questionnaire_rows(jsonb)'::regprocedure,
      'app_private.sync_correction_targets_from_payload(jsonb)'::regprocedure
    )
  ), '[]'::jsonb),
  'triggers', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'table', trigger_info.tgrelid::regclass::text,
        'name', trigger_info.tgname,
        'enabled', trigger_info.tgenabled
      )
      order by trigger_info.tgrelid::regclass::text, trigger_info.tgname
    )
    from pg_catalog.pg_trigger as trigger_info
    where not trigger_info.tgisinternal
      and trigger_info.tgname in (
        'submissions_bump_case_revision',
        'corrections_agent_target_revision_guard',
        'corrections_agent_parent_status_guard',
        'questionnaire_answers_refresh_correction_targets',
        'media_assets_refresh_correction_targets',
        'submissions_returned_questionnaire_readiness_guard'
      )
  ), '[]'::jsonb)
);
rollback;`;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fail(message) {
  console.error(`BLOCKED: ${message}`);
  process.exitCode = 1;
}

function parseArtifactPath() {
  const artifactIndex = process.argv.indexOf("--artifact");
  const artifactPath =
    (artifactIndex >= 0 ? process.argv[artifactIndex + 1] : "") ||
    process.env.V19_SUPABASE_LIVE_REGISTRY_ARTIFACT?.trim() ||
    "";
  if (!artifactPath) {
    fail("укажите свежий live registry artifact через --artifact");
    return "";
  }
  return resolve(artifactPath);
}

function exactKeys(value, expected) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join("\n") === [...expected].sort().join("\n")
  );
}

function parseIso(value, label) {
  if (typeof value !== "string" || !value.endsWith("Z")) {
    fail(`${label} должен быть UTC ISO timestamp`);
    return Number.NaN;
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) fail(`${label} содержит некорректное время`);
  return parsed;
}

function columnByIdentity(columns, table, column) {
  return columns.find(
    (item) =>
      item?.schema === "public" &&
      item?.table === table &&
      item?.column === column,
  );
}

if (process.argv.includes("--print-query")) {
  console.log(liveRegistryQuery);
  process.exit(0);
}
if (process.argv.includes("--print-query-metadata")) {
  const readiness = JSON.parse(readFileSync(readinessPath, "utf8"));
  console.log(
    JSON.stringify(
      {
        contractSha256: sha256(JSON.stringify(requiredRemoteMigrationOrder)),
        projectRef: readiness.productionTarget?.projectId,
        querySha256: sha256(liveRegistryQuery),
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

let artifact;
let readiness;
try {
  const artifactBase64Index = process.argv.indexOf("--artifact-base64");
  const artifactBase64 =
    artifactBase64Index >= 0 ? process.argv[artifactBase64Index + 1] : "";
  if (artifactBase64) {
    artifact = JSON.parse(Buffer.from(artifactBase64, "base64").toString("utf8"));
  } else {
    const artifactPath = parseArtifactPath();
    if (!artifactPath) process.exit(1);
    artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  }
  readiness = JSON.parse(readFileSync(readinessPath, "utf8"));
} catch (error) {
  fail(`не удалось прочитать live registry artifact: ${error.message}`);
  process.exit(1);
}

if (!exactKeys(artifact, expectedArtifactKeys)) {
  fail("live registry artifact имеет неизвестные или отсутствующие поля");
}
if (artifact.format !== expectedFormat) fail("неподдерживаемый формат artifact");

const expectedProjectRef = readiness.productionTarget?.projectId;
if (!expectedProjectRef || artifact.projectRef !== expectedProjectRef) {
  fail("artifact не привязан к checked-in production project");
}

const expectedQuerySha256 = sha256(liveRegistryQuery);
if (artifact.querySha256 !== expectedQuerySha256) {
  fail("artifact собран не pinned live-registry запросом");
}
const expectedContractSha256 = sha256(
  JSON.stringify(requiredRemoteMigrationOrder),
);
if (artifact.contractSha256 !== expectedContractSha256) {
  fail("artifact собран для другой версии migration contract");
}

const dbCapturedAt = parseIso(artifact.dbCapturedAt, "dbCapturedAt");
const collectorCapturedAt = parseIso(
  artifact.collectorCapturedAt,
  "collectorCapturedAt",
);
const now = Date.now();
if (Number.isFinite(dbCapturedAt)) {
  if (dbCapturedAt > now + maxClockSkewMs) fail("dbCapturedAt находится в будущем");
  if (now - dbCapturedAt > maxAgeMs) fail("live registry artifact старше 15 минут");
}
if (
  Number.isFinite(dbCapturedAt) &&
  Number.isFinite(collectorCapturedAt) &&
  Math.abs(collectorCapturedAt - dbCapturedAt) > maxCollectorLagMs
) {
  fail("collectorCapturedAt слишком далеко от DB snapshot");
}

if (!Array.isArray(artifact.registryRows)) {
  fail("registryRows должен быть массивом");
} else {
  const seenVersions = new Set();
  const actualRemoteOrder = [];
  for (const row of artifact.registryRows) {
    if (
      !exactKeys(row, ["name", "version"]) ||
      typeof row.version !== "string" ||
      !/^\d{14}$/.test(row.version) ||
      typeof row.name !== "string" ||
      !/^[a-zA-Z0-9_]+$/.test(row.name) ||
      seenVersions.has(row.version)
    ) {
      fail("registryRows содержит некорректную или дублированную запись");
      break;
    }
    seenVersions.add(row.version);
    actualRemoteOrder.push(`${row.version}_${row.name}`);
  }
  if (
    actualRemoteOrder.join("\n") !== requiredRemoteMigrationOrder.join("\n")
  ) {
    fail("live remote migration order не совпадает с полным контрактом");
  }
}

if (!Array.isArray(artifact.columns)) {
  fail("columns должен быть массивом");
} else {
  const publicNumber = columnByIdentity(
    artifact.columns,
    "submissions",
    "public_number",
  );
  const caseRevision = columnByIdentity(
    artifact.columns,
    "submissions",
    "case_revision",
  );
  if (publicNumber?.type !== "bigint") {
    fail("live submissions.public_number bigint отсутствует");
  }
  if (
    caseRevision?.type !== "bigint" ||
    caseRevision?.nullable !== false ||
    !String(caseRevision?.default ?? "").includes("0")
  ) {
    fail("live submissions.case_revision контракт не выполнен");
  }
  for (const correctionColumn of [
    "target_revision",
    "agent_confirmed_at",
    "agent_confirmed_revision",
    "target_section_id",
    "target_field_id",
    "target_baseline",
    "target_projection",
  ]) {
    if (
      !columnByIdentity(artifact.columns, "corrections", correctionColumn)
    ) {
      fail(`live corrections.${correctionColumn} отсутствует`);
    }
  }
}

if (!Array.isArray(artifact.functions)) {
  fail("functions должен быть массивом");
} else {
  for (const identity of [
    "save_submission_draft(jsonb)",
    "submit_corrections_handoff(jsonb)",
  ]) {
    const functionFact = artifact.functions.find((item) =>
      String(item?.identity ?? "").endsWith(identity),
    );
    if (
      !functionFact ||
      functionFact.securityDefiner !== false ||
      functionFact.anonExecute !== false ||
      functionFact.authenticatedExecute !== true
    ) {
      fail(`live function ${identity} имеет небезопасный контракт`);
    }
  }

  const privateContracts = [
    {
      authenticatedExecute: true,
      identity:
        "app_private.dispatch_submission_draft_with_revision_context(jsonb)",
      securityDefiner: false,
    },
    {
      authenticatedExecute: true,
      identity:
        "app_private.save_submission_draft_for_internal_dispatch(jsonb)",
      securityDefiner: false,
    },
    {
      authenticatedExecute: true,
      identity:
        "app_private.save_submission_draft_without_questionnaire_rows(jsonb)",
      securityDefiner: false,
    },
    {
      authenticatedExecute: true,
      identity: "app_private.sync_correction_targets_from_payload(jsonb)",
      securityDefiner: true,
    },
  ];
  for (const expected of privateContracts) {
    const functionFact = artifact.functions.find(
      (item) => item?.identity === expected.identity,
    );
    if (
      !functionFact ||
      functionFact.securityDefiner !== expected.securityDefiner ||
      functionFact.anonExecute !== false ||
      functionFact.authenticatedExecute !== expected.authenticatedExecute ||
      typeof functionFact.definition !== "string"
    ) {
      fail(`live internal function ${expected.identity} имеет неверный контракт`);
    }
  }

  const functionDefinition = (identity) =>
    String(
      artifact.functions.find((item) => item?.identity === identity)
        ?.definition ?? "",
    );
  const publicDraftDefinition =
    functionDefinition("save_submission_draft(jsonb)") ||
    functionDefinition("public.save_submission_draft(jsonb)");
  const dispatchDefinition = functionDefinition(
    "app_private.dispatch_submission_draft_with_revision_context(jsonb)",
  );
  const internalDraftDefinition = functionDefinition(
    "app_private.save_submission_draft_for_internal_dispatch(jsonb)",
  );
  if (
    !publicDraftDefinition.includes(
      "dispatch_submission_draft_with_revision_context",
    ) ||
    !dispatchDefinition.includes(
      "save_submission_draft_for_internal_dispatch",
    ) ||
    !dispatchDefinition.includes("sync_correction_targets_from_payload") ||
    !internalDraftDefinition.includes(
      "save_submission_draft_without_questionnaire_rows",
    ) ||
    internalDraftDefinition.includes(
      "dispatch_submission_draft_with_revision_context",
    )
  ) {
    fail("live draft RPC topology is missing or recursive");
  }
}

if (!Array.isArray(artifact.triggers)) {
  fail("triggers должен быть массивом");
} else {
  for (const triggerName of [
    "submissions_bump_case_revision",
    "corrections_agent_target_revision_guard",
    "corrections_agent_parent_status_guard",
    "questionnaire_answers_refresh_correction_targets",
    "media_assets_refresh_correction_targets",
    "submissions_returned_questionnaire_readiness_guard",
  ]) {
    const triggerFact = artifact.triggers.find(
      (item) => item?.name === triggerName,
    );
    if (!triggerFact || triggerFact.enabled !== "O") {
      fail(`live trigger ${triggerName} отсутствует или выключен`);
    }
  }
}

if (!process.exitCode) {
  console.log(
    `PASS: live Supabase registry ${artifact.projectRef}, ${artifact.registryRows.length} migrations`,
  );
}

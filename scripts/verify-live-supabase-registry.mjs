import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  requiredMigrationOrder,
  requiredRemoteMigrationOrder,
} from "./supabase-migration-contract.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const readinessPath = resolve(
  repoRoot,
  "docs/release/supabase-production-readiness.json",
);
const expectedArtifactKeys = [
  "collectorCapturedAt",
  "columns",
  "constraints",
  "contractSha256",
  "dbCapturedAt",
  "format",
  "functions",
  "projectRef",
  "querySha256",
  "registryRows",
  "triggers",
];
const expectedFormat = "v19.supabase-live-registry.v2";
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
  'constraints', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'schema', constraint_namespace.nspname,
        'table', constrained_table.relname,
        'name', constraint_info.conname,
        'type', constraint_info.contype,
        'definition', pg_get_constraintdef(constraint_info.oid, true),
        'validated', constraint_info.convalidated
      )
      order by constraint_namespace.nspname, constrained_table.relname, constraint_info.conname
    )
    from pg_catalog.pg_constraint as constraint_info
    join pg_catalog.pg_class as constrained_table
      on constrained_table.oid = constraint_info.conrelid
    join pg_catalog.pg_namespace as constraint_namespace
      on constraint_namespace.oid = constrained_table.relnamespace
    where constraint_namespace.nspname = 'public'
      and constrained_table.relname = 'corrections'
      and constraint_info.conname in (
        'corrections_target_revision_nonnegative_check',
        'corrections_agent_confirmation_pair_check',
        'corrections_target_field_identity_pair_check'
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
        'table', trigger_namespace.nspname || '.' || trigger_table.relname,
        'name', trigger_info.tgname,
        'enabled', trigger_info.tgenabled
      )
      order by trigger_namespace.nspname, trigger_table.relname, trigger_info.tgname
    )
    from pg_catalog.pg_trigger as trigger_info
    join pg_catalog.pg_class as trigger_table
      on trigger_table.oid = trigger_info.tgrelid
    join pg_catalog.pg_namespace as trigger_namespace
      on trigger_namespace.oid = trigger_table.relnamespace
    where not trigger_info.tgisinternal
      and trigger_namespace.nspname = 'public'
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

function migrationContractSha256() {
  const migrationContract = {
    localFiles: requiredMigrationOrder.map((migrationName) => ({
      migrationName,
      sha256: sha256(
        readFileSync(resolve(repoRoot, "supabase/migrations", migrationName)),
      ),
    })),
    remoteOrder: requiredRemoteMigrationOrder,
  };
  return sha256(JSON.stringify(migrationContract));
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

function normalizeConstraintDefinition(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
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

if (process.argv.includes("--print-query")) {
  console.log(liveRegistryQuery);
  process.exit(0);
}
if (process.argv.includes("--print-query-metadata")) {
  const readiness = JSON.parse(readFileSync(readinessPath, "utf8"));
  console.log(
    JSON.stringify(
      {
        contractSha256: migrationContractSha256(),
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
const expectedContractSha256 = migrationContractSha256();
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
  if (actualRemoteOrder.join("\n") !== requiredRemoteMigrationOrder.join("\n")) {
    fail("live remote migration order не совпадает с полным контрактом");
  }
}

if (!Array.isArray(artifact.columns)) {
  fail("columns должен быть массивом");
} else {
  const expectedColumns = [
    {
      column: "public_number",
      default: null,
      nullable: true,
      table: "submissions",
      type: "bigint",
    },
    {
      column: "case_revision",
      default: "0",
      nullable: false,
      table: "submissions",
      type: "bigint",
    },
    {
      column: "target_revision",
      default: "0",
      nullable: false,
      table: "corrections",
      type: "bigint",
    },
    {
      column: "agent_confirmed_at",
      default: null,
      nullable: true,
      table: "corrections",
      type: "timestamp with time zone",
    },
    {
      column: "agent_confirmed_revision",
      default: null,
      nullable: true,
      table: "corrections",
      type: "bigint",
    },
    {
      column: "target_section_id",
      default: null,
      nullable: true,
      table: "corrections",
      type: "text",
    },
    {
      column: "target_field_id",
      default: null,
      nullable: true,
      table: "corrections",
      type: "text",
    },
    {
      column: "target_baseline",
      default: null,
      nullable: true,
      table: "corrections",
      type: "jsonb",
    },
    {
      column: "target_projection",
      default: null,
      nullable: true,
      table: "corrections",
      type: "jsonb",
    },
  ];
  if (artifact.columns.length !== expectedColumns.length) {
    fail("columns содержит лишние или отсутствующие факты");
  }
  for (const expected of expectedColumns) {
    const matches = artifact.columns.filter(
      (item) =>
        item?.schema === "public" &&
        item?.table === expected.table &&
        item?.column === expected.column,
    );
    const column = matches[0];
    const defaultMatches = column?.default === expected.default;
    if (
      matches.length !== 1 ||
      !exactKeys(column, [
        "column",
        "default",
        "nullable",
        "schema",
        "table",
        "type",
      ]) ||
      column.type !== expected.type ||
      column.nullable !== expected.nullable ||
      !defaultMatches
    ) {
      fail(`live ${expected.table}.${expected.column} контракт не выполнен`);
    }
  }
}

if (!Array.isArray(artifact.constraints)) {
  fail("constraints должен быть массивом");
} else {
  const expectedConstraints = new Map([
    [
      "corrections_target_revision_nonnegative_check",
      "check (target_revision >= 0)",
    ],
    [
      "corrections_agent_confirmation_pair_check",
      "check (agent_confirmed_at is null and agent_confirmed_revision is null or agent_confirmed_at is not null and agent_confirmed_revision is not null and agent_confirmed_revision >= 0 and agent_confirmed_revision <= target_revision)",
    ],
    [
      "corrections_target_field_identity_pair_check",
      "check (target_section_id is null and target_field_id is null or target_section_id is not null and target_field_id is not null)",
    ],
  ]);
  if (artifact.constraints.length !== expectedConstraints.size) {
    fail("constraints содержит лишние или отсутствующие факты");
  }
  for (const [name, expectedDefinition] of expectedConstraints) {
    const matches = artifact.constraints.filter(
      (item) =>
        item?.schema === "public" &&
        item?.table === "corrections" &&
        item?.name === name,
    );
    const constraint = matches[0];
    const normalizedDefinition = normalizeConstraintDefinition(
      constraint?.definition,
    );
    if (
      matches.length !== 1 ||
      !exactKeys(constraint, [
        "definition",
        "name",
        "schema",
        "table",
        "type",
        "validated",
      ]) ||
      constraint.type !== "c" ||
      constraint.validated !== true ||
      normalizedDefinition !== normalizeConstraintDefinition(expectedDefinition)
    ) {
      fail(`live constraint ${name} контракт не выполнен`);
    }
  }
}

if (!Array.isArray(artifact.functions)) {
  fail("functions должен быть массивом");
} else {
  const publicContracts = [
    {
      config: "search_path=pg_catalog, public, app_private",
      identity: "save_submission_draft(jsonb)",
    },
    {
      config: "search_path=pg_catalog, public, app_private",
      identity: "submit_corrections_handoff(jsonb)",
    },
  ];
  if (artifact.functions.length !== 6) {
    fail("functions содержит лишние или отсутствующие факты");
  }
  for (const expected of publicContracts) {
    const functionFact = artifact.functions.find((item) =>
      String(item?.identity ?? "").endsWith(expected.identity),
    );
    if (
      !functionFact ||
      functionFact.securityDefiner !== false ||
      functionFact.anonExecute !== false ||
      functionFact.authenticatedExecute !== true ||
      !Array.isArray(functionFact.config) ||
      functionFact.config.length !== 1 ||
      functionFact.config[0] !== expected.config
    ) {
      fail(`live function ${expected.identity} имеет небезопасный контракт`);
    }
  }

  const privateContracts = [
    {
      authenticatedExecute: true,
      config: "search_path=pg_catalog, public, app_private",
      identity: "app_private.dispatch_submission_draft_with_revision_context(jsonb)",
      securityDefiner: false,
    },
    {
      authenticatedExecute: true,
      config: "search_path=public",
      identity: "app_private.save_submission_draft_for_internal_dispatch(jsonb)",
      securityDefiner: false,
    },
    {
      authenticatedExecute: true,
      config: "search_path=public",
      identity: "app_private.save_submission_draft_without_questionnaire_rows(jsonb)",
      securityDefiner: false,
    },
    {
      authenticatedExecute: true,
      config: "search_path=pg_catalog, public, app_private",
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
      !Array.isArray(functionFact.config) ||
      functionFact.config.length !== 1 ||
      functionFact.config[0] !== expected.config ||
      typeof functionFact.definition !== "string"
    ) {
      fail(`live internal function ${expected.identity} имеет неверный контракт`);
    }
  }

  const functionDefinition = (identity) =>
    String(
      artifact.functions.find((item) => item?.identity === identity)?.definition ?? "",
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
    !dispatchDefinition.includes("save_submission_draft_for_internal_dispatch") ||
    !dispatchDefinition.includes("sync_correction_targets_from_payload") ||
    !internalDraftDefinition.includes(
      "save_submission_draft_without_questionnaire_rows",
    ) ||
    internalDraftDefinition.includes("dispatch_submission_draft_with_revision_context")
  ) {
    fail("live draft RPC topology is missing or recursive");
  }
}

if (!Array.isArray(artifact.triggers)) {
  fail("triggers должен быть массивом");
} else {
  const expectedTriggers = new Map([
    ["submissions_bump_case_revision", "public.submissions"],
    ["corrections_agent_target_revision_guard", "public.corrections"],
    ["corrections_agent_parent_status_guard", "public.corrections"],
    [
      "questionnaire_answers_refresh_correction_targets",
      "public.questionnaire_answers",
    ],
    ["media_assets_refresh_correction_targets", "public.media_assets"],
    ["submissions_returned_questionnaire_readiness_guard", "public.submissions"],
  ]);
  if (artifact.triggers.length !== expectedTriggers.size) {
    fail("triggers содержит лишние или отсутствующие факты");
  }
  for (const [triggerName, table] of expectedTriggers) {
    const matches = artifact.triggers.filter(
      (item) => item?.name === triggerName && item?.table === table,
    );
    const triggerFact = matches[0];
    if (
      matches.length !== 1 ||
      !exactKeys(triggerFact, ["enabled", "name", "table"]) ||
      triggerFact.enabled !== "O"
    ) {
      fail(`live trigger ${triggerName} отсутствует или выключен`);
    }
  }
}

if (!process.exitCode) {
  console.log(
    `PASS: live Supabase registry ${artifact.projectRef}, ${artifact.registryRows.length} migrations`,
  );
}

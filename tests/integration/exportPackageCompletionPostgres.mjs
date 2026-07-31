import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import process from "node:process";

const image = process.argv[2];
if (!image) {
  throw new Error(
    "Usage: node tests/integration/exportPackageCompletionPostgres.mjs <local-postgres-image>",
  );
}

const cwd = process.cwd();
const containerName = `v19-export-package-${process.pid}-${Date.now()}`;
const databaseUser = image.startsWith("public.ecr.aws/supabase/postgres")
  ? "supabase_admin"
  : "postgres";

function readMigration(fileName) {
  return readFileSync(`${cwd}/supabase/migrations/${fileName}`, "utf8");
}

function before(source, marker) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) throw new Error(`Missing SQL marker: ${marker}`);
  return source.slice(0, markerIndex);
}

function between(source, startMarker, endMarker) {
  const startIndex = source.indexOf(startMarker);
  if (startIndex < 0) throw new Error(`Missing SQL marker: ${startMarker}`);
  const endIndex = source.indexOf(endMarker, startIndex);
  if (endIndex < 0) throw new Error(`Missing SQL marker: ${endMarker}`);
  return source.slice(startIndex, endIndex);
}

const exportIdentityMigration = readMigration(
  "20260616000000_export_batch_identity.sql",
);
const initialCompletionMigration = readMigration(
  "20260616001000_complete_export_package_rpc.sql",
);
const memberSnapshotMigration = readMigration(
  "20260709234515_agent_return_packages.sql",
);
const atomicCompletionMigration = readMigration(
  "20260713095403_atomic_export_document_completion.sql",
);
const zipSuffixMigration = readMigration(
  "20260714190000_fix_complete_export_package_zip_suffix_guard.sql",
);
const passportPolicyMigration = readMigration(
  "20260717050000_admin_passport_review_media_policy.sql",
);
const mediaOnlyFileCountMigration = readMigration(
  "20260720000000_export_package_media_only_file_count.sql",
);
const t9ServerAuthorityMigration = readMigration(
  "20260729060000_harden_t9_server_authority.sql",
);

const contentFingerprintSchema = before(
  initialCompletionMigration,
  "create or replace function public.complete_export_package",
);
const memberSnapshotSql = before(
  memberSnapshotMigration,
  "-- Existing batches without an immutable member snapshot",
);
const exportBoundarySql = between(
  atomicCompletionMigration,
  "create or replace function app_private.enforce_submission_export_completion_boundary",
  "create or replace function app_private.prevent_exported_media_asset_mutation",
);
const passportHelpersSql = before(
  passportPolicyMigration,
  "create or replace function app_private.enforce_submission_review_readiness",
);
const passportCoreSql = between(
  passportPolicyMigration,
  "create or replace function app_private.complete_export_package_core",
  "-- Preserve the currently deployed, null-safe atomic wrapper",
);
const passportWrapperPatchSql = between(
  passportPolicyMigration,
  "-- Preserve the currently deployed, null-safe atomic wrapper",
  "comment on function app_private.primary_applicant_id",
);
const nullSafeZipWrapperSql = zipSuffixMigration.replace(
  "if actor_role <> 'admin' then",
  "if actor_role is distinct from 'admin' then",
);

const adminId = "10000000-0000-4000-8000-0000000000a1";
const agentId = "10000000-0000-4000-8000-0000000000b1";
const unprofiledId = "10000000-0000-4000-8000-0000000000c1";
const submissionId = "submission-export-success";
const applicantId = "applicant-export-success";
const rollbackSubmissionId = "submission-export-rollback";
const rollbackApplicantId = "applicant-export-rollback";
const familySubmissionId = "submission-export-family";
const familyApplicantIds = [
  "applicant-export-family-primary",
  "applicant-export-family-spouse",
  "applicant-export-family-child",
];
const normalizedSubmissionId = "submission-export-normalized";
const normalizedApplicantId = "applicant-export-normalized";
const batchId = "20000000-0000-4000-8000-000000000001";
const rollbackBatchId = "20000000-0000-4000-8000-000000000002";
const familyBatchId = "20000000-0000-4000-8000-000000000003";
const normalizedBatchId = "20000000-0000-4000-8000-000000000004";
const assetIds = [
  "30000000-0000-4000-8000-000000000001",
  "30000000-0000-4000-8000-000000000002",
  "30000000-0000-4000-8000-000000000003",
];
const rollbackAssetIds = [
  "30000000-0000-4000-8000-000000000011",
  "30000000-0000-4000-8000-000000000012",
  "30000000-0000-4000-8000-000000000013",
];
const familyAssetIds = [
  "30000000-0000-4000-8000-000000000021",
  "30000000-0000-4000-8000-000000000022",
  "30000000-0000-4000-8000-000000000023",
  "30000000-0000-4000-8000-000000000024",
  "30000000-0000-4000-8000-000000000025",
];
const familyExtraAssetId = "30000000-0000-4000-8000-000000000026";
const normalizedAssetIds = [
  "30000000-0000-4000-8000-000000000031",
  "30000000-0000-4000-8000-000000000032",
  "30000000-0000-4000-8000-000000000033",
];

function docker(args, options = {}) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(
      [
        `docker ${args.join(" ")} failed with status ${result.status}`,
        result.stdout.trim(),
        result.stderr.trim(),
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  return result.stdout.trim();
}

const psqlArgs = [
  "exec",
  "-i",
  containerName,
  "psql",
  "-X",
  "-q",
  "-A",
  "-t",
  "-v",
  "ON_ERROR_STOP=1",
  "-U",
  databaseUser,
  "-d",
  "postgres",
];

function psql(sql) {
  return docker(psqlArgs, { input: sql });
}

function waitForPostgres() {
  let consecutiveReadyChecks = 0;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = spawnSync(
      "docker",
      ["exec", containerName, "pg_isready", "-U", databaseUser],
      { encoding: "utf8" },
    );
    consecutiveReadyChecks = result.status === 0 ? consecutiveReadyChecks + 1 : 0;
    if (consecutiveReadyChecks >= 3) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  throw new Error("Disposable PostgreSQL did not become ready.");
}

const setupSql = String.raw`
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end;
$$;

create schema if not exists auth;
create schema if not exists app_private;
create schema if not exists storage;
grant usage on schema public, auth to anon, authenticated;
grant usage on schema app_private to authenticated;

create or replace function auth.uid()
returns uuid
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant execute on function auth.uid() to anon, authenticated;

create type public.profile_role as enum ('agent', 'admin');
create type public.media_slot_type as enum (
  'passport_scan',
  'selfie',
  'selfie_1',
  'selfie_2'
);

create table public.profiles (
  id uuid primary key,
  display_name text not null,
  role public.profile_role not null
);

create table public.submissions (
  id text primary key,
  agent_id uuid not null references public.profiles(id),
  city text not null,
  travel_date text not null,
  type text not null check (type in ('single', 'family')),
  title text not null,
  trip_date_from text,
  trip_date_to text,
  status text not null,
  family_intelligence jsonb not null default '{}'::jsonb,
  exported_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.applicants (
  id text primary key,
  submission_id text not null references public.submissions(id),
  full_name text not null,
  role text not null,
  created_at timestamptz not null default now()
);

create table public.media_assets (
  id text primary key,
  submission_id text not null references public.submissions(id),
  applicant_id text not null references public.applicants(id),
  type public.media_slot_type not null,
  review_status text not null
);

create table public.corrections (
  id uuid primary key default gen_random_uuid(),
  submission_id text not null references public.submissions(id),
  severity text not null,
  status text not null
);

create table public.export_batches (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  format text not null check (format in ('xlsx', 'csv')),
  row_count integer not null check (row_count > 0),
  submission_ids text[] not null
);

create table public.status_history (
  id bigint generated always as identity primary key,
  entity_type text not null,
  entity_id text not null,
  from_status text,
  to_status text not null,
  comment text,
  changed_by uuid not null references public.profiles(id),
  changed_at timestamptz not null default now()
);

create table public.document_assets (
  id uuid primary key default gen_random_uuid(),
  submission_id text not null references public.submissions(id),
  applicant_id text not null references public.applicants(id),
  type text not null check (type in ('passport_scan', 'selfie_1', 'selfie_2')),
  bucket text not null default 'submission-media',
  storage_path text not null,
  upload_status text not null,
  validation_status text not null,
  export_status text not null
);

create table public.document_export_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type = 'DOCUMENT_EXPORT_CREATED'),
  submission_ids text[] not null,
  asset_ids uuid[] not null,
  zip_file_name text not null,
  file_count integer not null,
  applicant_count integer not null,
  workbook_file_name text not null,
  package_identity_key text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create unique index document_export_events_package_identity_key_uidx
  on public.document_export_events(package_identity_key)
  where package_identity_key is not null and btrim(package_identity_key) <> '';

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null,
  name text not null,
  unique (bucket_id, name)
);

create or replace function app_private.current_profile_role()
returns public.profile_role
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select profile.role
  from public.profiles as profile
  where profile.id = auth.uid()
$$;
revoke all on function app_private.current_profile_role() from public;
grant execute on function app_private.current_profile_role() to authenticated;
`;

const fixtureSql = String.raw`
insert into public.profiles (id, display_name, role) values
  ('${adminId}', 'Release Admin', 'admin'),
  ('${agentId}', 'Owning Agent', 'agent');

insert into public.submissions (
  id, agent_id, city, travel_date, type, title, trip_date_from, trip_date_to,
  status
) values
  (
    '${submissionId}', '${agentId}', 'Moscow', '2026-08-15', 'single',
    'Export success', '2026-08-15', '2026-08-22', 'ready_for_excel'
  ),
  (
    '${rollbackSubmissionId}', '${agentId}', 'Moscow', '2026-08-15', 'single',
    'Export rollback', '2026-08-15', '2026-08-22', 'ready_for_excel'
  ),
  (
    '${familySubmissionId}', '${agentId}', 'Moscow', '2026-08-15', 'family',
    'Export family', '2026-08-15', '2026-08-22', 'ready_for_excel'
  ),
  (
    '${normalizedSubmissionId}', '${agentId}', 'Moscow', '2026-08-15', 'single',
    'Export normalized', '2026-08-15', '2026-08-22', 'ready_for_excel'
  );

insert into public.applicants (id, submission_id, full_name, role) values
  ('${applicantId}', '${submissionId}', 'Success Applicant', 'main'),
  ('${rollbackApplicantId}', '${rollbackSubmissionId}', 'Rollback Applicant', 'main'),
  ('${familyApplicantIds[0]}', '${familySubmissionId}', 'Family Primary', 'main'),
  ('${familyApplicantIds[1]}', '${familySubmissionId}', 'Family Spouse', 'spouse'),
  ('${familyApplicantIds[2]}', '${familySubmissionId}', 'Family Child', 'child'),
  ('${normalizedApplicantId}', '${normalizedSubmissionId}', 'Normalized Applicant', 'main');

insert into public.media_assets (
  id, submission_id, applicant_id, type, review_status
) values
  ('media-success-passport', '${submissionId}', '${applicantId}', 'passport_scan', 'accepted'),
  ('media-success-selfie-1', '${submissionId}', '${applicantId}', 'selfie', 'accepted'),
  ('media-success-selfie-2', '${submissionId}', '${applicantId}', 'selfie_2', 'accepted'),
  ('media-rollback-passport', '${rollbackSubmissionId}', '${rollbackApplicantId}', 'passport_scan', 'accepted'),
  ('media-rollback-selfie-1', '${rollbackSubmissionId}', '${rollbackApplicantId}', 'selfie', 'accepted'),
  ('media-rollback-selfie-2', '${rollbackSubmissionId}', '${rollbackApplicantId}', 'selfie_2', 'accepted'),
  ('media-family-primary-passport', '${familySubmissionId}', '${familyApplicantIds[0]}', 'passport_scan', 'accepted'),
  ('media-family-primary-selfie-1', '${familySubmissionId}', '${familyApplicantIds[0]}', 'selfie', 'accepted'),
  ('media-family-primary-selfie-2', '${familySubmissionId}', '${familyApplicantIds[0]}', 'selfie_2', 'accepted'),
  ('media-family-spouse-passport', '${familySubmissionId}', '${familyApplicantIds[1]}', 'passport_scan', 'accepted'),
  ('media-family-child-passport', '${familySubmissionId}', '${familyApplicantIds[2]}', 'passport_scan', 'accepted'),
  ('media-family-spouse-extra-selfie', '${familySubmissionId}', '${familyApplicantIds[1]}', 'selfie', 'accepted'),
  ('media-normalized-passport', '${normalizedSubmissionId}', '${normalizedApplicantId}', 'passport_scan', 'accepted'),
  ('media-normalized-selfie-1', '${normalizedSubmissionId}', '${normalizedApplicantId}', 'selfie', 'accepted'),
  ('media-normalized-selfie-2', '${normalizedSubmissionId}', '${normalizedApplicantId}', 'selfie_2', 'accepted');

insert into public.document_assets (
  id, submission_id, applicant_id, type, bucket, storage_path,
  upload_status, validation_status, export_status
) values
  (
    '${assetIds[0]}', '${submissionId}', '${applicantId}', 'passport_scan',
    'submission-media',
    'submissions/${submissionId}/applicants/${applicantId}/passport_scan/passport.jpg',
    'uploaded', 'passed', 'ready'
  ),
  (
    '${assetIds[1]}', '${submissionId}', '${applicantId}', 'selfie_1',
    'submission-media',
    'submissions/${submissionId}/applicants/${applicantId}/selfie/selfie-1.jpg',
    'uploaded', 'passed', 'ready'
  ),
  (
    '${assetIds[2]}', '${submissionId}', '${applicantId}', 'selfie_2',
    'submission-media',
    'submissions/${submissionId}/applicants/${applicantId}/selfie_2/selfie-2.jpg',
    'uploaded', 'passed', 'ready'
  ),
  (
    '${rollbackAssetIds[0]}', '${rollbackSubmissionId}', '${rollbackApplicantId}',
    'passport_scan', 'submission-media',
    'submissions/${rollbackSubmissionId}/applicants/${rollbackApplicantId}/passport_scan/passport.jpg',
    'uploaded', 'passed', 'ready'
  ),
  (
    '${rollbackAssetIds[1]}', '${rollbackSubmissionId}', '${rollbackApplicantId}',
    'selfie_1', 'submission-media',
    'submissions/${rollbackSubmissionId}/applicants/${rollbackApplicantId}/selfie/selfie-1.jpg',
    'uploaded', 'passed', 'ready'
  ),
  (
    '${rollbackAssetIds[2]}', '${rollbackSubmissionId}', '${rollbackApplicantId}',
    'selfie_2', 'submission-media',
    'submissions/${rollbackSubmissionId}/applicants/${rollbackApplicantId}/selfie_2/selfie-2.jpg',
    'uploaded', 'passed', 'ready'
  ),
  (
    '${familyAssetIds[0]}', '${familySubmissionId}', '${familyApplicantIds[0]}',
    'passport_scan', 'submission-media',
    'submissions/${familySubmissionId}/applicants/${familyApplicantIds[0]}/passport_scan/passport.jpg',
    'uploaded', 'passed', 'ready'
  ),
  (
    '${familyAssetIds[1]}', '${familySubmissionId}', '${familyApplicantIds[0]}',
    'selfie_1', 'submission-media',
    'submissions/${familySubmissionId}/applicants/${familyApplicantIds[0]}/selfie/selfie-1.jpg',
    'uploaded', 'passed', 'ready'
  ),
  (
    '${familyAssetIds[2]}', '${familySubmissionId}', '${familyApplicantIds[0]}',
    'selfie_2', 'submission-media',
    'submissions/${familySubmissionId}/applicants/${familyApplicantIds[0]}/selfie_2/selfie-2.jpg',
    'uploaded', 'passed', 'ready'
  ),
  (
    '${familyAssetIds[3]}', '${familySubmissionId}', '${familyApplicantIds[1]}',
    'passport_scan', 'submission-media',
    'submissions/${familySubmissionId}/applicants/${familyApplicantIds[1]}/passport_scan/passport.jpg',
    'uploaded', 'passed', 'ready'
  ),
  (
    '${familyAssetIds[4]}', '${familySubmissionId}', '${familyApplicantIds[2]}',
    'passport_scan', 'submission-media',
    'submissions/${familySubmissionId}/applicants/${familyApplicantIds[2]}/passport_scan/passport.jpg',
    'uploaded', 'passed', 'ready'
  ),
  (
    '${familyExtraAssetId}', '${familySubmissionId}', '${familyApplicantIds[1]}',
    'selfie_1', 'submission-media',
    'submissions/${familySubmissionId}/applicants/${familyApplicantIds[1]}/selfie/extra-selfie.jpg',
    'uploaded', 'passed', 'ready'
  ),
  (
    '${normalizedAssetIds[0]}', '${normalizedSubmissionId}', '${normalizedApplicantId}',
    'passport_scan', 'submission-media',
    'submissions/${normalizedSubmissionId}/applicants/${normalizedApplicantId}/passport_scan/passport.jpg',
    'uploaded', 'passed', 'ready'
  ),
  (
    '${normalizedAssetIds[1]}', '${normalizedSubmissionId}', '${normalizedApplicantId}',
    'selfie_1', 'submission-media',
    'submissions/${normalizedSubmissionId}/applicants/${normalizedApplicantId}/selfie/selfie-1.jpg',
    'uploaded', 'passed', 'ready'
  ),
  (
    '${normalizedAssetIds[2]}', '${normalizedSubmissionId}', '${normalizedApplicantId}',
    'selfie_2', 'submission-media',
    'submissions/${normalizedSubmissionId}/applicants/${normalizedApplicantId}/selfie_2/selfie-2.jpg',
    'uploaded', 'passed', 'ready'
  );

insert into storage.objects (bucket_id, name)
select asset.bucket, asset.storage_path
from public.document_assets as asset;

update public.submissions
set family_intelligence = jsonb_build_object(
  'v19CockpitSnapshot',
  jsonb_build_object(
    'submission',
    jsonb_build_object(
      'status', 'ready_for_export',
      'exportState', 'file_downloaded',
      'applicants', jsonb_build_array(
        jsonb_build_object('id', '${applicantId}', 'role', 'main')
      ),
      'issues', '[]'::jsonb,
      'files', jsonb_build_array(
        jsonb_build_object(
          'applicantId', '${applicantId}',
          'type', 'passport_scan',
          'status', 'accepted'
        ),
        jsonb_build_object(
          'applicantId', '${applicantId}',
          'type', 'selfie',
          'status', 'accepted'
        ),
        jsonb_build_object(
          'applicantId', '${applicantId}',
          'type', 'selfie_2',
          'status', 'accepted'
        )
      ),
      'exportPackage', jsonb_build_object(
        'contentFingerprint', 'sha256:export-success',
        'format', 'xlsx',
        'fileName', 'Moscow_2026-08-15.xlsx',
        'idempotencyKey', 't9-export-success',
        'rowCount', 1,
        'submissionIds', jsonb_build_array('${submissionId}')
      )
    )
  )
)
where id = '${submissionId}';

update public.submissions
set family_intelligence = jsonb_build_object(
  'v19CockpitSnapshot',
  jsonb_build_object(
    'submission',
    jsonb_build_object(
      'status', 'ready_for_export',
      'exportState', 'file_downloaded',
      'applicants', jsonb_build_array(
        jsonb_build_object('id', '${rollbackApplicantId}', 'role', 'main')
      ),
      'issues', '[]'::jsonb,
      'files', jsonb_build_array(
        jsonb_build_object(
          'applicantId', '${rollbackApplicantId}',
          'type', 'passport_scan',
          'status', 'accepted'
        ),
        jsonb_build_object(
          'applicantId', '${rollbackApplicantId}',
          'type', 'selfie',
          'status', 'accepted'
        ),
        jsonb_build_object(
          'applicantId', '${rollbackApplicantId}',
          'type', 'selfie_2',
          'status', 'accepted'
        )
      ),
      'exportPackage', jsonb_build_object(
        'contentFingerprint', 'sha256:export-rollback',
        'format', 'xlsx',
        'fileName', 'Moscow_2026-08-15-rollback.xlsx',
        'idempotencyKey', 't9-export-rollback',
        'rowCount', 1,
        'submissionIds', jsonb_build_array('${rollbackSubmissionId}')
      )
    )
  )
)
where id = '${rollbackSubmissionId}';

update public.submissions
set family_intelligence = jsonb_build_object(
  'v19CockpitSnapshot',
  jsonb_build_object(
    'submission',
    jsonb_build_object(
      'status', 'ready_for_export',
      'exportState', 'file_downloaded',
      'applicants', jsonb_build_array(
        jsonb_build_object('id', '${familyApplicantIds[0]}', 'role', 'main'),
        jsonb_build_object('id', '${familyApplicantIds[1]}', 'role', 'spouse'),
        jsonb_build_object('id', '${familyApplicantIds[2]}', 'role', 'child')
      ),
      'issues', '[]'::jsonb,
      'files', jsonb_build_array(
        jsonb_build_object(
          'applicantId', '${familyApplicantIds[0]}',
          'type', 'passport_scan',
          'status', 'accepted'
        ),
        jsonb_build_object(
          'applicantId', '${familyApplicantIds[0]}',
          'type', 'selfie',
          'status', 'accepted'
        ),
        jsonb_build_object(
          'applicantId', '${familyApplicantIds[0]}',
          'type', 'selfie_2',
          'status', 'accepted'
        ),
        jsonb_build_object(
          'applicantId', '${familyApplicantIds[1]}',
          'type', 'passport_scan',
          'status', 'accepted'
        ),
        jsonb_build_object(
          'applicantId', '${familyApplicantIds[2]}',
          'type', 'passport_scan',
          'status', 'accepted'
        )
      ),
      'exportPackage', jsonb_build_object(
        'contentFingerprint', 'sha256:export-family',
        'format', 'xlsx',
        'fileName', 'Moscow_2026-08-15-family.xlsx',
        'idempotencyKey', 't9-export-family',
        'rowCount', 3,
        'submissionIds', jsonb_build_array('${familySubmissionId}')
      )
    )
  )
)
where id = '${familySubmissionId}';

grant select on all tables in schema public to authenticated;
grant update (status, exported_at) on public.submissions to authenticated;
grant insert on public.status_history to authenticated;
`;

const successPayload = String.raw`jsonb_build_object(
  'batch', jsonb_build_object(
    'id', '${batchId}',
    'format', 'xlsx',
    'content_fingerprint', 'sha256:export-success',
    'idempotency_key', 't9-export-success',
    'file_name', 'Moscow_2026-08-15.xlsx',
    'row_count', 1,
    'submission_ids', jsonb_build_array('${submissionId}')
  ),
  'document_export', jsonb_build_object(
    'asset_ids', jsonb_build_array('${assetIds[0]}', '${assetIds[1]}', '${assetIds[2]}'),
    'zip_file_name', 'Moscow_2026-08-15.zip',
    'file_count', 3,
    'applicant_count', 1,
    'workbook_file_name', 'Moscow_2026-08-15.xlsx'
  )
)`;

const rollbackPayload = String.raw`jsonb_build_object(
  'batch', jsonb_build_object(
    'id', '${rollbackBatchId}',
    'format', 'xlsx',
    'content_fingerprint', 'sha256:export-rollback',
    'idempotency_key', 't9-export-rollback',
    'file_name', 'Moscow_2026-08-15-rollback.xlsx',
    'row_count', 1,
    'submission_ids', jsonb_build_array('${rollbackSubmissionId}')
  ),
  'document_export', jsonb_build_object(
    'asset_ids', jsonb_build_array(
      '${rollbackAssetIds[0]}',
      '${rollbackAssetIds[1]}',
      '${rollbackAssetIds[2]}'
    ),
    'zip_file_name', 'Moscow_2026-08-15-rollback.zip',
    'file_count', 3,
    'applicant_count', 1,
    'workbook_file_name', 'Moscow_2026-08-15-rollback.xlsx'
  )
)`;

const familyPayload = String.raw`jsonb_build_object(
  'batch', jsonb_build_object(
    'id', '${familyBatchId}',
    'format', 'xlsx',
    'content_fingerprint', 'sha256:export-family',
    'idempotency_key', 't9-export-family',
    'file_name', 'Moscow_2026-08-15-family.xlsx',
    'row_count', 3,
    'submission_ids', jsonb_build_array('${familySubmissionId}')
  ),
  'document_export', jsonb_build_object(
    'asset_ids', jsonb_build_array(
      '${familyAssetIds[0]}',
      '${familyAssetIds[1]}',
      '${familyAssetIds[2]}',
      '${familyAssetIds[3]}',
      '${familyAssetIds[4]}'
    ),
    'zip_file_name', 'Moscow_2026-08-15-family.zip',
    'file_count', 5,
    'applicant_count', 3,
    'workbook_file_name', 'Moscow_2026-08-15-family.xlsx'
  )
)`;

const familyExtraAssetPayload = String.raw`jsonb_set(
  jsonb_set(
    ${familyPayload},
    '{document_export,asset_ids}',
    jsonb_build_array(
      '${familyAssetIds[0]}',
      '${familyAssetIds[1]}',
      '${familyAssetIds[2]}',
      '${familyAssetIds[3]}',
      '${familyAssetIds[4]}',
      '${familyExtraAssetId}'
    )
  ),
  '{document_export,file_count}',
  '6'::jsonb
)`;

const normalizedPayload = String.raw`jsonb_build_object(
  'batch', jsonb_build_object(
    'id', '${normalizedBatchId}',
    'format', 'xlsx',
    'content_fingerprint', 'sha256:arbitrary-normalized',
    'idempotency_key', 't9-export-normalized',
    'file_name', 'Moscow_2026-08-15-normalized.xlsx',
    'row_count', 1,
    'submission_ids', jsonb_build_array('${normalizedSubmissionId}')
  ),
  'document_export', jsonb_build_object(
    'asset_ids', jsonb_build_array(
      '${normalizedAssetIds[0]}',
      '${normalizedAssetIds[1]}',
      '${normalizedAssetIds[2]}'
    ),
    'zip_file_name', 'Moscow_2026-08-15-normalized.zip',
    'file_count', 3,
    'applicant_count', 1,
    'workbook_file_name', 'Moscow_2026-08-15-normalized.xlsx'
  )
)`;

const assertionsSql = String.raw`
do $$
declare
  version_number integer;
  core_definition text;
  wrapper_definition text;
begin
  version_number := current_setting('server_version_num')::integer;
  if version_number < 170000 or version_number >= 180000 then
    raise exception 'PostgreSQL 17 required, got %', version_number;
  end if;

  select pg_catalog.pg_get_functiondef(
    'app_private.complete_export_package_core(jsonb)'::regprocedure::oid
  )
  into core_definition;

  select pg_catalog.pg_get_functiondef(
    'public.complete_export_package(jsonb)'::regprocedure::oid
  )
  into wrapper_definition;

  if position(
    'if batch_record.format is distinct from ''xlsx'' then'
    in core_definition
  ) = 0
    or position(
      'if cockpit_snapshot_count is distinct from current_submission_count then'
      in core_definition
    ) = 0
    or position(
      'right(lower(batch_record.file_name), 5) <> ''.xlsx'''
      in core_definition
    ) = 0
    or position(
      'right(lower(document_record.workbook_file_name), 5) <> ''.xlsx'''
      in wrapper_definition
    ) = 0
    or position('join storage.objects as storage_object' in wrapper_definition) = 0
    or position('for key share of storage_object' in lower(wrapper_definition)) = 0
  then
    raise exception 'T9 server-authority hardening is not active';
  end if;

  if has_function_privilege('anon', 'public.complete_export_package(jsonb)', 'EXECUTE') then
    raise exception 'anon unexpectedly executes complete_export_package';
  end if;
  if not has_function_privilege(
    'authenticated',
    'public.complete_export_package(jsonb)',
    'EXECUTE'
  ) then
    raise exception 'authenticated cannot execute complete_export_package';
  end if;
  if has_function_privilege(
    'authenticated',
    'app_private.complete_export_package_core(jsonb)',
    'EXECUTE'
  ) then
    raise exception 'authenticated unexpectedly executes private export core';
  end if;
end;
$$;

set role authenticated;
set request.jwt.claim.sub = '${adminId}';
do $$
declare
  result jsonb;
begin
  result := public.complete_export_package(${successPayload});
  if result ->> 'duplicate' <> 'false'
    or result #>> '{exportBatch,id}' <> '${batchId}'
    or result #>> '{documentExport,file_count}' <> '3'
  then
    raise exception 'first export result mismatch: %', result;
  end if;
end;
$$;
reset role;

do $$
begin
  if (select status from public.submissions where id = '${submissionId}') <> 'exported'
    or (select exported_at is null from public.submissions where id = '${submissionId}')
    or (select count(*) from public.export_batches where id = '${batchId}') <> 1
    or (select count(*) from public.export_batch_members where export_batch_id = '${batchId}') <> 1
    or (select count(*) from public.document_export_events where package_identity_key = 't9-export-success') <> 1
    or (select count(*) from public.document_assets where submission_id = '${submissionId}' and export_status = 'exported') <> 3
    or (select count(*) from public.status_history where entity_id = '${submissionId}' and to_status = 'exported') <> 1
  then
    raise exception 'atomic export did not persist its exact durable graph';
  end if;
end;
$$;

set role authenticated;
set request.jwt.claim.sub = '${adminId}';
do $$
declare
  result jsonb;
begin
  result := public.complete_export_package(${successPayload});
  if result ->> 'duplicate' <> 'true'
    or result ->> 'submissions' <> '0'
    or result ->> 'statusHistory' <> '0'
  then
    raise exception 'idempotent export replay mismatch: %', result;
  end if;
end;
$$;
reset role;

do $$
begin
  if (select count(*) from public.export_batches where id = '${batchId}') <> 1
    or (select count(*) from public.export_batch_members where export_batch_id = '${batchId}') <> 1
    or (select count(*) from public.document_export_events where package_identity_key = 't9-export-success') <> 1
    or (select count(*) from public.status_history where entity_id = '${submissionId}' and to_status = 'exported') <> 1
  then
    raise exception 'idempotent replay duplicated durable rows';
  end if;
end;
$$;

set role authenticated;
set request.jwt.claim.sub = '${adminId}';
do $$
declare
  rejected boolean := false;
begin
  begin
    perform public.complete_export_package(
      jsonb_set(${successPayload}, '{document_export,zip_file_name}', '"conflict.zip"')
    );
  exception when others then
    rejected := sqlerrm like '%audit identity does not match payload%';
  end;
  if not rejected then
    raise exception 'conflicting idempotency replay was not rejected';
  end if;
end;
$$;
reset role;

set role authenticated;
set request.jwt.claim.sub = '${agentId}';
do $$
declare
  rejected boolean := false;
begin
  begin
    perform public.complete_export_package(${rollbackPayload});
  exception when insufficient_privilege then
    rejected := true;
  end;
  if not rejected then
    raise exception 'Agent unexpectedly completed export';
  end if;
end;
$$;
reset role;

set role authenticated;
set request.jwt.claim.sub = '${unprofiledId}';
do $$
declare
  rejected boolean := false;
begin
  begin
    perform public.complete_export_package(${rollbackPayload});
  exception when insufficient_privilege then
    rejected := true;
  end;
  if not rejected then
    raise exception 'unprofiled identity bypassed null-safe Admin guard';
  end if;
end;
$$;
reset role;

set role authenticated;
set request.jwt.claim.sub = '${adminId}';
do $$
declare
  rejected boolean := false;
begin
  begin
    perform public.complete_export_package(
      jsonb_set(${rollbackPayload}, '{batch,format}', '"csv"')
    );
  exception when others then
    rejected := sqlerrm like '%format must be xlsx%';
  end;
  if not rejected then
    raise exception 'CSV export was not rejected';
  end if;
end;
$$;
reset role;

set role authenticated;
set request.jwt.claim.sub = '${adminId}';
do $$
declare
  rejected boolean := false;
begin
  begin
    perform public.complete_export_package(
      jsonb_set(
        ${rollbackPayload},
        '{batch,file_name}',
        '"Moscow_2026-08-15-rollback.csv"'
      )
    );
  exception when others then
    rejected := sqlerrm like '%package XLSX file name is invalid%';
  end;
  if not rejected then
    raise exception 'non-XLSX batch artifact was not rejected';
  end if;
end;
$$;
reset role;

set role authenticated;
set request.jwt.claim.sub = '${adminId}';
do $$
declare
  rejected boolean := false;
begin
  begin
    perform public.complete_export_package(
      jsonb_set(
        ${rollbackPayload},
        '{document_export,workbook_file_name}',
        '"Moscow_2026-08-15-rollback.pdf"'
      )
    );
  exception when others then
    rejected := sqlerrm like '%workbook XLSX file name is invalid%';
  end;
  if not rejected then
    raise exception 'non-XLSX workbook artifact was not rejected';
  end if;
end;
$$;
reset role;

set role authenticated;
set request.jwt.claim.sub = '${adminId}';
do $$
declare
  rejected boolean := false;
begin
  begin
    perform public.complete_export_package(${normalizedPayload});
  exception when others then
    rejected := sqlerrm like '%requires a canonical cockpit snapshot%';
  end;
  if not rejected then
    raise exception 'normalized export without canonical identity was not rejected';
  end if;
end;
$$;
reset role;

delete from storage.objects
where bucket_id = 'submission-media'
  and name = (
    select storage_path
    from public.document_assets
    where id = '${rollbackAssetIds[2]}'
  );

set role authenticated;
set request.jwt.claim.sub = '${adminId}';
do $$
declare
  rejected boolean := false;
begin
  begin
    perform public.complete_export_package(${rollbackPayload});
  exception when others then
    rejected := sqlerrm like '%Storage objects do not match document assets%';
  end;
  if not rejected then
    raise exception 'missing private Storage object was not rejected';
  end if;
end;
$$;
reset role;

insert into storage.objects (bucket_id, name)
select asset.bucket, asset.storage_path
from public.document_assets as asset
where asset.id = '${rollbackAssetIds[2]}';

set role authenticated;
set request.jwt.claim.sub = '${adminId}';
do $$
declare
  rejected boolean := false;
begin
  begin
    perform public.complete_export_package(${familyExtraAssetPayload});
  exception when others then
    rejected := sqlerrm like '%primary/secondary passport media policy%';
  end;
  if not rejected then
    raise exception 'secondary-applicant selfie was accepted into family export';
  end if;
end;
$$;
reset role;

do $$
begin
  if (select status from public.submissions where id = '${rollbackSubmissionId}') <> 'ready_for_excel'
    or (select exported_at is not null from public.submissions where id = '${rollbackSubmissionId}')
    or exists (select 1 from public.export_batches where id = '${rollbackBatchId}')
    or exists (select 1 from public.export_batch_members where export_batch_id = '${rollbackBatchId}')
    or exists (select 1 from public.document_export_events where package_identity_key = 't9-export-rollback')
    or exists (select 1 from public.status_history where entity_id = '${rollbackSubmissionId}' and to_status = 'exported')
    or exists (select 1 from public.document_assets where submission_id = '${rollbackSubmissionId}' and export_status = 'exported')
    or (select status from public.submissions where id = '${normalizedSubmissionId}') <> 'ready_for_excel'
    or (select exported_at is not null from public.submissions where id = '${normalizedSubmissionId}')
    or exists (select 1 from public.export_batches where id = '${normalizedBatchId}')
    or exists (select 1 from public.export_batch_members where export_batch_id = '${normalizedBatchId}')
    or exists (select 1 from public.document_export_events where package_identity_key = 't9-export-normalized')
    or exists (select 1 from public.status_history where entity_id = '${normalizedSubmissionId}' and to_status = 'exported')
    or exists (select 1 from public.document_assets where submission_id = '${normalizedSubmissionId}' and export_status = 'exported')
    or (select status from public.submissions where id = '${familySubmissionId}') <> 'ready_for_excel'
    or (select exported_at is not null from public.submissions where id = '${familySubmissionId}')
    or exists (select 1 from public.export_batches where id = '${familyBatchId}')
    or exists (select 1 from public.export_batch_members where export_batch_id = '${familyBatchId}')
    or exists (select 1 from public.document_export_events where package_identity_key = 't9-export-family')
    or exists (select 1 from public.status_history where entity_id = '${familySubmissionId}' and to_status = 'exported')
    or exists (select 1 from public.document_assets where submission_id = '${familySubmissionId}' and export_status = 'exported')
  then
    raise exception 'rejected export left a partial durable mutation';
  end if;
end;
$$;

set role authenticated;
set request.jwt.claim.sub = '${adminId}';
do $$
declare
  result jsonb;
begin
  result := public.complete_export_package(${familyPayload});
  if result ->> 'duplicate' <> 'false'
    or result #>> '{exportBatch,id}' <> '${familyBatchId}'
    or result #>> '{exportBatch,row_count}' <> '3'
    or result #>> '{documentExport,file_count}' <> '5'
    or result #>> '{documentExport,applicant_count}' <> '3'
  then
    raise exception 'family export result mismatch: %', result;
  end if;
end;
$$;
reset role;

do $$
begin
  if (select status from public.submissions where id = '${familySubmissionId}') <> 'exported'
    or (select exported_at is null from public.submissions where id = '${familySubmissionId}')
    or (select count(*) from public.export_batches where id = '${familyBatchId}') <> 1
    or (select count(*) from public.export_batch_members where export_batch_id = '${familyBatchId}') <> 3
    or (select count(*) from public.document_export_events where package_identity_key = 't9-export-family') <> 1
    or (select count(*) from public.document_assets where id = any(array[
      '${familyAssetIds[0]}'::uuid,
      '${familyAssetIds[1]}'::uuid,
      '${familyAssetIds[2]}'::uuid,
      '${familyAssetIds[3]}'::uuid,
      '${familyAssetIds[4]}'::uuid
    ]) and export_status = 'exported') <> 5
    or (select export_status from public.document_assets where id = '${familyExtraAssetId}') <> 'ready'
    or (select count(*) from public.status_history where entity_id = '${familySubmissionId}' and to_status = 'exported') <> 1
    or (select count(*) from storage.objects where bucket_id = 'submission-media' and name in (
      select storage_path
      from public.document_assets
      where submission_id = '${familySubmissionId}'
    )) <> 6
  then
    raise exception 'family export did not persist the exact five-asset durable graph';
  end if;
end;
$$;

set role authenticated;
set request.jwt.claim.sub = '${adminId}';
do $$
declare
  result jsonb;
begin
  result := public.complete_export_package(${familyPayload});
  if result ->> 'duplicate' <> 'true'
    or result ->> 'submissions' <> '0'
    or result ->> 'statusHistory' <> '0'
  then
    raise exception 'family idempotent replay mismatch: %', result;
  end if;
end;
$$;
reset role;

do $$
begin
  if (select count(*) from public.export_batches where id = '${familyBatchId}') <> 1
    or (select count(*) from public.export_batch_members where export_batch_id = '${familyBatchId}') <> 3
    or (select count(*) from public.document_export_events where package_identity_key = 't9-export-family') <> 1
    or (select count(*) from public.status_history where entity_id = '${familySubmissionId}' and to_status = 'exported') <> 1
  then
    raise exception 'family idempotent replay duplicated durable rows';
  end if;
end;
$$;

set role authenticated;
set request.jwt.claim.sub = '${adminId}';
do $$
declare
  status_rejected boolean := false;
  history_rejected boolean := false;
begin
  begin
    update public.submissions
    set status = 'exported', exported_at = now()
    where id = '${rollbackSubmissionId}';
  exception when insufficient_privilege then
    status_rejected := true;
  end;

  begin
    insert into public.status_history (
      entity_type, entity_id, from_status, to_status, comment, changed_by
    ) values (
      'submission', '${rollbackSubmissionId}', 'ready_for_excel', 'exported',
      'forged', '${adminId}'
    );
  exception when insufficient_privilege then
    history_rejected := true;
  end;

  if not status_rejected or not history_rejected then
    raise exception 'direct terminal export mutation bypassed boundary triggers';
  end if;
end;
$$;
reset role;

select 'export_package_completion_postgres17: PASS';
`;

try {
  docker([
    "run",
    "--rm",
    "-d",
    "--name",
    containerName,
    "--pull=never",
    "-e",
    "POSTGRES_HOST_AUTH_METHOD=trust",
    image,
  ]);
  waitForPostgres();
  psql(setupSql);
  psql(exportIdentityMigration);
  psql(contentFingerprintSchema);
  psql(memberSnapshotSql);
  psql(exportBoundarySql);
  psql(nullSafeZipWrapperSql);
  psql(passportHelpersSql);
  psql(passportCoreSql);
  psql(passportWrapperPatchSql);
  psql(mediaOnlyFileCountMigration);
  psql(t9ServerAuthorityMigration);
  psql(t9ServerAuthorityMigration);
  psql(fixtureSql);

  const proof = psql(assertionsSql).split("\n").at(-1);
  if (proof !== "export_package_completion_postgres17: PASS") {
    throw new Error(`Unexpected PostgreSQL proof result: ${proof}`);
  }
  process.stdout.write("export_package_completion_postgres17: PASS\n");
} finally {
  spawnSync("docker", ["rm", "-f", containerName], { encoding: "utf8" });
}

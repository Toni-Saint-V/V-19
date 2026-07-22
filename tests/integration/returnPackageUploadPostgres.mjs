import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import process from "node:process";

const image = process.argv[2];
if (!image) {
  throw new Error(
    "Usage: node tests/integration/returnPackageUploadPostgres.mjs <local-postgres-image>",
  );
}

const containerName = `v19-return-package-upload-${process.pid}-${Date.now()}`;
const cwd = process.cwd();
const foundationMigration = readFileSync(
  `${cwd}/supabase/migrations/20260709234515_agent_return_packages.sql`,
  "utf8",
);
const atomicUploadMigration = readFileSync(
  `${cwd}/supabase/migrations/20260722003000_atomic_return_package_artifact_upload.sql`,
  "utf8",
);

function docker(args, options = {}) {
  const result = spawnSync("docker", args, { encoding: "utf8", ...options });
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

function psql(sql) {
  return docker(
    [
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
      "supabase_admin",
      "-d",
      "postgres",
    ],
    { input: sql },
  );
}

function waitForPostgres() {
  let consecutiveReadyChecks = 0;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = spawnSync(
      "docker",
      ["exec", containerName, "pg_isready", "-U", "supabase_admin"],
      { encoding: "utf8" },
    );
    consecutiveReadyChecks = result.status === 0 ? consecutiveReadyChecks + 1 : 0;
    if (consecutiveReadyChecks >= 8) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  throw new Error("Disposable PostgreSQL did not become ready.");
}

const adminA = "10000000-0000-4000-8000-0000000000a1";
const adminB = "10000000-0000-4000-8000-0000000000b1";
const agent = "10000000-0000-4000-8000-0000000000c1";
const batchId = "20000000-0000-4000-8000-000000000001";
const packageId = "30000000-0000-4000-8000-000000000001";
const operationA = "40000000-0000-4000-8000-0000000000a1";
const operationB = "40000000-0000-4000-8000-0000000000b1";
const pathA = `return-package-upload-intents/${packageId}/${operationA}.pdf`;
const pathB = `return-package-upload-intents/${packageId}/${operationB}.pdf`;

const setupSql = String.raw`
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (
    select 1 from pg_catalog.pg_roles where rolname = 'authenticated'
  ) then
    create role authenticated nologin;
  end if;
end;
$$;

create schema if not exists auth;
create schema if not exists app_private;
create schema if not exists storage;
grant usage on schema public, auth, storage to authenticated, anon;
grant usage on schema app_private to authenticated;

create type public.profile_role as enum ('agent', 'admin');
create table public.profiles (
  id uuid primary key,
  email text not null,
  display_name text not null,
  organization_name text,
  role public.profile_role not null
);
create table public.submissions (
  id text primary key,
  agent_id uuid not null references public.profiles(id),
  city text not null,
  type text not null check (type in ('single', 'family')),
  title text not null,
  trip_date_from text,
  trip_date_to text,
  status text not null
);
create table public.applicants (
  id text primary key,
  submission_id text not null references public.submissions(id),
  full_name text not null,
  created_at timestamptz not null default clock_timestamp()
);
create table public.export_batches (
  id uuid primary key,
  submission_ids text[] not null,
  idempotency_key text not null unique
);

create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default extensions.gen_random_uuid(),
  bucket_id text not null references storage.buckets(id),
  name text not null,
  metadata jsonb,
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to authenticated;

create or replace function auth.uid()
returns uuid
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant execute on function auth.uid() to authenticated, anon;

create function app_private.current_profile_role()
returns public.profile_role
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select role from public.profiles where id = auth.uid()
$$;
revoke all on function app_private.current_profile_role() from public;
grant execute on function app_private.current_profile_role() to authenticated;

insert into public.profiles (id, email, display_name, organization_name, role) values
  ('${adminA}', 'admin-a@example.test', 'Admin A', 'VisaFlow', 'admin'),
  ('${adminB}', 'admin-b@example.test', 'Admin B', 'VisaFlow', 'admin'),
  ('${agent}', 'agent@example.test', 'Agent', 'VisaFlow', 'agent');
insert into public.submissions (
  id, agent_id, city, type, title, trip_date_from, trip_date_to, status
) values (
  'submission-1', '${agent}', 'Moscow', 'single', 'Case 1',
  '2026-08-01', '2026-08-08', 'exported'
);
insert into public.applicants (id, submission_id, full_name)
values ('applicant-1', 'submission-1', 'Applicant One');
insert into public.export_batches (id, submission_ids, idempotency_key)
values ('${batchId}', array['submission-1'], 'export-package-1');
`;

const postMigrationSetup = String.raw`
grant select on public.export_batches, public.export_batch_members,
  public.agent_return_packages, public.agent_return_package_artifacts
  to authenticated;
grant insert, update, delete on public.agent_return_packages,
  public.agent_return_package_artifacts to authenticated;

insert into public.export_batch_members (
  export_batch_id,
  submission_id,
  applicant_id,
  source_agent_id,
  source_agent_display_name,
  city,
  submission_type,
  family_submission_id,
  submission_title,
  applicant_name,
  submission_order,
  applicant_order
) values (
  '${batchId}',
  'submission-1',
  'applicant-1',
  '${agent}',
  'Agent',
  'Moscow',
  'single',
  null,
  'Case 1',
  'Applicant One',
  1,
  1
);

set role authenticated;
set request.jwt.claim.sub = '${adminA}';
select public.start_agent_return_package(
  jsonb_build_object('exportPackageKey', 'export-package-1', 'agentId', '${agent}')
);
reset role;
update public.agent_return_packages set id = '${packageId}' where export_batch_id = '${batchId}';
`;

const assertions = String.raw`
do $$
declare
  function_oid oid;
  signature text;
begin
  foreach signature in array array[
    'public.prepare_agent_return_package_artifact_upload(jsonb)',
    'public.finalize_agent_return_package_artifact_upload(uuid)',
    'public.abort_agent_return_package_artifact_upload(uuid)'
  ] loop
    function_oid := to_regprocedure(signature)::oid;
    if function_oid is null then
      raise exception 'missing atomic upload function %', signature;
    end if;
    if (select prosecdef from pg_catalog.pg_proc where oid = function_oid) then
      raise exception '% is not SECURITY INVOKER', signature;
    end if;
    if has_function_privilege('anon', function_oid, 'EXECUTE') then
      raise exception 'anon unexpectedly executes %', signature;
    end if;
    if not has_function_privilege('authenticated', function_oid, 'EXECUTE') then
      raise exception 'authenticated cannot execute %', signature;
    end if;
  end loop;

  function_oid := to_regprocedure(
    'app_private.lock_return_package_upload_storage_object(uuid)'
  )::oid;
  if function_oid is null
    or not (select prosecdef from pg_catalog.pg_proc where oid = function_oid)
  then
    raise exception 'storage row-lock helper is missing or not SECURITY DEFINER';
  end if;
  if has_function_privilege('anon', function_oid, 'EXECUTE')
    or not has_function_privilege('authenticated', function_oid, 'EXECUTE')
  then
    raise exception 'storage row-lock helper ACL is invalid';
  end if;
end;
$$;

set role authenticated;
set request.jwt.claim.sub = '${adminA}';
select public.prepare_agent_return_package_artifact_upload(jsonb_build_object(
  'operationId', '${operationA}',
  'returnPackageId', '${packageId}',
  'artifactKind', 'agent_list_pdf',
  'applicantId', null,
  'sha256', repeat('a', 64),
  'sizeBytes', 100
));
insert into storage.objects (bucket_id, name, metadata) values (
  'agent-return-packages', '${pathA}',
  '{"mimetype":"application/pdf","size":"100"}'::jsonb
);

set request.jwt.claim.sub = '${adminB}';
select public.prepare_agent_return_package_artifact_upload(jsonb_build_object(
  'operationId', '${operationB}',
  'returnPackageId', '${packageId}',
  'artifactKind', 'agent_list_pdf',
  'applicantId', null,
  'sha256', repeat('b', 64),
  'sizeBytes', 200
));
insert into storage.objects (bucket_id, name, metadata) values (
  'agent-return-packages', '${pathB}',
  '{"mimetype":"application/pdf","size":"200"}'::jsonb
);

set request.jwt.claim.sub = '${adminA}';
do $$
declare
  object_metadata jsonb;
  intent_size bigint;
begin
  select metadata into object_metadata
  from storage.objects
  where bucket_id = 'agent-return-packages' and name = '${pathA}';
  if not found then
    raise exception 'admin A cannot read its prepared storage object';
  end if;
  select size_bytes into intent_size
  from app_private.agent_return_package_upload_intents
  where operation_id = '${operationA}';
  if object_metadata ->> 'mimetype' <> 'application/pdf'
    or (object_metadata ->> 'size')::bigint is distinct from intent_size
  then
    raise exception 'prepared object metadata mismatch: % / %', object_metadata, intent_size;
  end if;
end;
$$;
select public.finalize_agent_return_package_artifact_upload('${operationA}');
do $$
declare
  replay jsonb;
begin
  replay := public.finalize_agent_return_package_artifact_upload('${operationA}');
  if replay ->> 'duplicate' <> 'true' then
    raise exception 'lost-response finalize replay was not idempotent';
  end if;
  if (
    select storage_path <> '${pathA}' or sha256 <> repeat('a', 64)
    from public.agent_return_package_artifacts
    where return_package_id = '${packageId}'
      and artifact_kind = 'agent_list_pdf'
  ) then
    raise exception 'first client did not commit its exact artifact';
  end if;
end;
$$;

set request.jwt.claim.sub = '${adminB}';
do $$
begin
  begin
    perform public.finalize_agent_return_package_artifact_upload('${operationB}');
    raise exception 'stale return-package client overwrote the winner';
  exception when serialization_failure then
    null;
  end;
  if (
    select storage_path <> '${pathA}' or sha256 <> repeat('a', 64)
    from public.agent_return_package_artifacts
    where return_package_id = '${packageId}'
      and artifact_kind = 'agent_list_pdf'
  ) then
    raise exception 'conflicting client changed the committed artifact';
  end if;
end;
$$;
delete from storage.objects
where bucket_id = 'agent-return-packages' and name = '${pathB}';
select public.abort_agent_return_package_artifact_upload('${operationB}');

set request.jwt.claim.sub = '${adminA}';
do $$
begin
  begin
    update public.agent_return_package_artifacts
    set sha256 = repeat('c', 64)
    where return_package_id = '${packageId}'
      and artifact_kind = 'agent_list_pdf';
    raise exception 'direct artifact metadata update bypassed finalize RPC';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

reset role;
select 'return_package_atomic_upload_acl_and_cas: PASS';
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
  psql(foundationMigration);
  psql(postMigrationSetup);
  psql(atomicUploadMigration);
  const proof = psql(assertions).split("\n").at(-1);
  if (proof !== "return_package_atomic_upload_acl_and_cas: PASS") {
    throw new Error(`Unexpected PostgreSQL proof result: ${proof}`);
  }
  process.stdout.write("return_package_atomic_upload_acl_and_cas: PASS\n");
} finally {
  spawnSync("docker", ["rm", "-f", containerName], { encoding: "utf8" });
}

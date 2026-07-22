import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import process from "node:process";

const image = process.argv[2];
if (!image) {
  throw new Error(
    "Usage: node tests/integration/workflowRpcPostgresAcl.mjs <local-postgres-image>",
  );
}

const containerName = `v19-workflow-acl-${process.pid}-${Date.now()}`;
const cwd = process.cwd();
const permissionMigration = readFileSync(
  `${cwd}/supabase/migrations/20260722000000_harden_workflow_rpc_anon_execute.sql`,
  "utf8",
);
const concurrencyMigration = readFileSync(
  `${cwd}/supabase/migrations/20260722001000_admin_submission_batch_concurrency.sql`,
  "utf8",
);
const accessReviewMigration = readFileSync(
  `${cwd}/supabase/migrations/20260722002000_access_request_review_claim.sql`,
  "utf8",
);

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
      ["exec", containerName, "pg_isready", "-U", "postgres"],
      { encoding: "utf8" },
    );
    consecutiveReadyChecks = result.status === 0 ? consecutiveReadyChecks + 1 : 0;
    if (consecutiveReadyChecks >= 8) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  throw new Error("Disposable PostgreSQL did not become ready.");
}

const adminA = "00000000-0000-4000-8000-0000000000a1";
const adminB = "00000000-0000-4000-8000-0000000000b1";
const agent = "00000000-0000-4000-8000-0000000000c1";
const approvedUser = "00000000-0000-4000-8000-0000000000c2";
const noProfile = "00000000-0000-4000-8000-0000000000d1";

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
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end;
$$;
grant usage on schema extensions to authenticated;
create schema if not exists auth;
create schema if not exists app_private;
revoke all on schema app_private from public;
grant usage on schema app_private to authenticated;

create type public.profile_role as enum ('agent', 'admin');
create table public.profiles (
  id uuid primary key,
  email text not null,
  display_name text not null,
  organization_name text,
  role public.profile_role not null
);
alter table public.profiles enable row level security;
insert into public.profiles (id, email, display_name, organization_name, role) values
  ('${adminA}', 'admin-a@example.test', 'Admin A', 'VisaFlow', 'admin'),
  ('${adminB}', 'admin-b@example.test', 'Admin B', 'VisaFlow', 'admin'),
  ('${agent}', 'agent@example.test', 'Agent', 'VisaFlow', 'agent');

do $setup_auth$
begin
  if to_regprocedure('auth.uid()') is null then
    execute $definition$
      create function auth.uid()
      returns uuid
      language sql
      stable
      security invoker
      set search_path = pg_catalog
      as $body$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $body$
    $definition$;
    execute 'grant usage on schema auth to authenticated, anon';
    execute 'grant execute on function auth.uid() to authenticated, anon';
  end if;
end;
$setup_auth$;

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

create policy "profiles read own or admin"
on public.profiles for select to authenticated
using (id = auth.uid() or app_private.current_profile_role() = 'admin');
create policy "profiles insert own agent"
on public.profiles for insert to authenticated
with check (id = auth.uid() and role = 'agent');

create table public.submissions (
  id text primary key,
  agent_id uuid not null,
  status text not null default 'waiting_review',
  snapshot jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default clock_timestamp()
);
alter table public.submissions enable row level security;
create policy "submissions agent own admin all"
on public.submissions for all to authenticated
using (
  agent_id = auth.uid()
  or app_private.current_profile_role() = 'admin'
)
with check (
  agent_id = auth.uid()
  or app_private.current_profile_role() = 'admin'
);
create table public.applicants (
  id text primary key,
  submission_id text not null references public.submissions(id) on delete cascade
);
create table public.questionnaire_answers (
  id bigint primary key,
  submission_id text not null references public.submissions(id) on delete cascade
);
create table public.media_assets (
  id text primary key,
  submission_id text not null references public.submissions(id) on delete cascade
);
create table public.corrections (
  id uuid primary key,
  submission_id text not null references public.submissions(id) on delete cascade
);
create table public.status_history (
  id uuid primary key,
  entity_type text not null,
  entity_id text not null
);

create type public.access_request_status as enum ('pending', 'approved', 'rejected');
create table public.access_requests (
  id uuid primary key,
  user_id uuid,
  email text not null,
  full_name text not null,
  company_name text not null,
  city text not null,
  phone text not null,
  requested_role public.profile_role not null default 'agent',
  status public.access_request_status not null default 'pending',
  reviewed_at timestamptz,
  reviewed_by_admin_id uuid,
  rejection_reason text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (
    (status = 'pending' and reviewed_at is null and reviewed_by_admin_id is null)
    or (status in ('approved', 'rejected') and reviewed_at is not null and reviewed_by_admin_id is not null)
  )
);

create function app_private.enforce_test_submission_agent_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, app_private
as $$
begin
  if app_private.current_profile_role() = 'agent'
    and old.status = 'waiting_review'
    and new.status = old.status
    and current_setting('app.visaflow_internal_trip_date_sync', true) is distinct from 'on'
  then
    raise exception 'agent waiting-review parent touch was not fenced as internal'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
grant execute on function app_private.enforce_test_submission_agent_mutation()
  to authenticated;
create trigger submissions_test_agent_mutation_guard
before update on public.submissions
for each row execute function app_private.enforce_test_submission_agent_mutation();

create function public.save_submission_draft(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  submission_id text := payload -> 'submission' ->> 'id';
begin
  update public.submissions
  set snapshot = payload -> 'submission',
      updated_at = clock_timestamp()
  where id = submission_id;
  insert into public.applicants (id, submission_id)
  values (submission_id || '-snapshot-applicant', submission_id)
  on conflict (id) do update set submission_id = excluded.submission_id;
  return jsonb_build_object('submissionId', submission_id);
end;
$$;
create function public.submit_corrections_handoff(payload jsonb)
returns jsonb language sql security definer set search_path = pg_catalog
as $$ select payload $$;
create function public.upsert_questionnaire_answers(payload jsonb)
returns jsonb language sql security definer set search_path = pg_catalog
as $$ select payload $$;

grant execute on function public.save_submission_draft(jsonb) to public, anon;
grant execute on function public.submit_corrections_handoff(jsonb) to public, anon;
grant execute on function public.upsert_questionnaire_answers(jsonb) to public, anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to service_role;

insert into public.submissions (id, agent_id, snapshot) values
  ('submission-1', '${agent}', '{"owner":"baseline"}'),
  ('submission-2', '${agent}', '{"owner":"baseline"}'),
  ('submission-no-profile', '${noProfile}', '{"owner":"baseline"}');
insert into public.access_requests (
  id,
  email,
  full_name,
  company_name,
  city,
  phone
) values (
  '00000000-0000-4000-8000-0000000000e1',
  'new-agent@example.test',
  'New Agent',
  'VisaFlow',
  'Moscow',
  '+70000000000'
);
`;

const aclAssertions = String.raw`
do $$
declare
  signature text;
  function_oid oid;
begin
  foreach signature in array array[
    'public.save_submission_draft(jsonb)',
    'public.submit_corrections_handoff(jsonb)',
    'public.upsert_questionnaire_answers(jsonb)'
  ] loop
    function_oid := to_regprocedure(signature)::oid;
    if has_function_privilege('anon', function_oid, 'EXECUTE') then
      raise exception 'anon unexpectedly executes %', signature;
    end if;
    if not has_function_privilege('authenticated', function_oid, 'EXECUTE') then
      raise exception 'authenticated cannot execute %', signature;
    end if;
    if (select prosecdef from pg_catalog.pg_proc where oid = function_oid) then
      raise exception '% is not SECURITY INVOKER', signature;
    end if;
  end loop;
end;
$$;

do $$
declare
  function_oid oid := to_regprocedure(
    'public.save_admin_submission_batch_if_current(jsonb,jsonb,uuid,uuid)'
  )::oid;
begin
    if has_function_privilege('anon', function_oid, 'EXECUTE') then
      raise exception 'anon unexpectedly executes admin CAS RPC';
    end if;
    if exists (
      select 1
      from pg_catalog.pg_proc as proc
      cross join lateral aclexplode(
        coalesce(proc.proacl, acldefault('f', proc.proowner))
      ) as privilege
      where proc.oid = function_oid
        and privilege.grantee = 0
        and privilege.privilege_type = 'EXECUTE'
    ) then
      raise exception 'PUBLIC unexpectedly executes admin CAS RPC';
    end if;
    if not has_function_privilege('authenticated', function_oid, 'EXECUTE') then
      raise exception 'authenticated cannot execute admin CAS RPC';
    end if;
    if (select prosecdef from pg_catalog.pg_proc where oid = function_oid) then
      raise exception 'admin CAS RPC is not SECURITY INVOKER';
    end if;
    if not exists (
      select 1
      from pg_catalog.pg_proc as proc
      cross join lateral unnest(coalesce(proc.proconfig, '{}'::text[])) as setting
      where proc.oid = function_oid
        and setting = 'search_path=pg_catalog, public, app_private'
    ) then
      raise exception 'admin CAS RPC search_path is not fixed';
    end if;
end;
$$;

do $$
declare
  internal_function_oid oid := to_regprocedure(
    'app_private.save_submission_draft_for_internal_dispatch(jsonb)'
  )::oid;
  contextual_function_oid oid := to_regprocedure(
    'app_private.dispatch_submission_draft_with_revision_context(jsonb)'
  )::oid;
begin
  if internal_function_oid is null or contextual_function_oid is null then
    raise exception 'private submission dispatch boundary is missing';
  end if;
  if has_function_privilege('anon', internal_function_oid, 'EXECUTE')
    or has_function_privilege('anon', contextual_function_oid, 'EXECUTE')
  then
    raise exception 'anon unexpectedly executes private submission dispatch';
  end if;
  if exists (
    select 1
    from pg_catalog.pg_proc as proc
    cross join lateral aclexplode(
      coalesce(proc.proacl, acldefault('f', proc.proowner))
    ) as privilege
    where proc.oid in (internal_function_oid, contextual_function_oid)
      and privilege.grantee = 0
      and privilege.privilege_type = 'EXECUTE'
  ) then
    raise exception 'PUBLIC unexpectedly executes private submission dispatch';
  end if;
  if exists (
    select 1 from pg_catalog.pg_proc
    where oid in (internal_function_oid, contextual_function_oid)
      and prosecdef
  ) then
    raise exception 'private submission dispatch is not SECURITY INVOKER';
  end if;
end;
$$;

do $$
begin
  if not (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'app_private.admin_submission_mutation_receipts'::regclass
  ) then
    raise exception 'admin mutation receipts do not enforce RLS';
  end if;
  if has_table_privilege(
    'anon',
    'app_private.admin_submission_mutation_receipts',
    'SELECT'
  ) then
    raise exception 'anon unexpectedly reads admin mutation receipts';
  end if;
  if not has_table_privilege(
    'authenticated',
    'app_private.admin_submission_mutation_receipts',
    'SELECT,INSERT,UPDATE,DELETE'
  ) then
    raise exception 'authenticated receipt privileges are incomplete';
  end if;
  if has_table_privilege('authenticated', 'public.profiles', 'INSERT') then
    raise exception 'authenticated can still self-provision profiles';
  end if;
end;
$$;

do $$
declare
  claim_oid oid := to_regprocedure(
    'public.claim_access_request_review(uuid,text,uuid,uuid)'
  )::oid;
  finalize_oid oid := to_regprocedure(
    'public.finalize_access_request_review(uuid,text,uuid,uuid,uuid,text)'
  )::oid;
begin
  if claim_oid is null or finalize_oid is null then
    raise exception 'access review claim functions are missing';
  end if;
  if exists (
    select 1 from pg_catalog.pg_proc
    where oid in (claim_oid, finalize_oid) and prosecdef
  ) then
    raise exception 'access review claim function is not SECURITY INVOKER';
  end if;
  if has_function_privilege('authenticated', claim_oid, 'EXECUTE')
    or has_function_privilege('authenticated', finalize_oid, 'EXECUTE')
    or has_function_privilege('anon', claim_oid, 'EXECUTE')
    or has_function_privilege('anon', finalize_oid, 'EXECUTE')
  then
    raise exception 'client role executes service-only access review function';
  end if;
  if not has_function_privilege('service_role', claim_oid, 'EXECUTE')
    or not has_function_privilege('service_role', finalize_oid, 'EXECUTE')
  then
    raise exception 'service role cannot execute access review function';
  end if;
end;
$$;
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
  psql(
    `${setupSql}\n${permissionMigration}\n${concurrencyMigration}\n${accessReviewMigration}\n${aclAssertions}`,
  );

  const revisionA = psql("select case_revision from public.submissions where id = 'submission-1';")
    .split("\n")
    .at(-1);
  const revisionB = psql("select case_revision from public.submissions where id = 'submission-1';")
    .split("\n")
    .at(-1);
  if (revisionA !== "0" || revisionB !== "0") {
    throw new Error(`Independent clients did not read revision 0: ${revisionA}/${revisionB}`);
  }

  psql(String.raw`
set role authenticated;
set request.jwt.claim.sub = '${noProfile}';
do $$
begin
  begin
    insert into public.profiles (
      id,
      email,
      display_name,
      organization_name,
      role
    ) values (
      '${noProfile}',
      'unapproved@example.test',
      'Unapproved Agent',
      'Blocked',
      'agent'
    );
    raise exception 'no-profile user self-provisioned an agent profile';
  exception when insufficient_privilege then
    null;
  end;
  begin
    insert into public.submissions (id, agent_id)
    values ('forged-submission', '${noProfile}');
    raise exception 'no-profile user created an owned submission';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.save_submission_draft(
      '{"submission":{"id":"submission-no-profile","owner":"forged"}}'::jsonb
    );
    raise exception 'no-profile user invoked generic draft persistence';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;
`);

  psql(String.raw`
set role authenticated;
set request.jwt.claim.sub = '${adminA}';
do $$
begin
  perform public.save_submission_draft(
    '{"submission":{"id":"submission-1","owner":"revision-blind-admin"}}'::jsonb
  );
  raise exception 'generic admin draft unexpectedly committed';
exception when insufficient_privilege then
  null;
end;
$$;
`);

  psql(String.raw`
set role authenticated;
set request.jwt.claim.sub = '${adminA}';
select public.save_admin_submission_batch_if_current(
  '[{"submission":{"id":"submission-1","owner":"admin-a"}}]'::jsonb,
  '{"submission-1":0}'::jsonb,
  '${adminA}'::uuid,
  '00000000-0000-4000-8000-000000000101'::uuid
);
`);

  const replayProof = psql(String.raw`
set role authenticated;
set request.jwt.claim.sub = '${adminA}';
select public.save_admin_submission_batch_if_current(
  '[{"submission":{"id":"submission-1","owner":"admin-a"}}]'::jsonb,
  '{"submission-1":0}'::jsonb,
  '${adminA}'::uuid,
  '00000000-0000-4000-8000-000000000101'::uuid
);
select (snapshot ->> 'owner') || ':' || case_revision::text
from public.submissions where id = 'submission-1';
`)
    .split("\n")
    .at(-1);
  if (replayProof !== "admin-a:1") {
    throw new Error(`Idempotent operation replay changed the snapshot: ${replayProof}`);
  }

  const conflictProof = psql(String.raw`
set role authenticated;
set request.jwt.claim.sub = '${adminB}';
do $$
begin
  perform public.save_admin_submission_batch_if_current(
    '[{"submission":{"id":"submission-1","owner":"admin-b"}}]'::jsonb,
    '{"submission-1":0}'::jsonb,
    '${adminB}'::uuid,
    '00000000-0000-4000-8000-000000000102'::uuid
  );
  raise exception 'stale client unexpectedly committed';
exception when serialization_failure then
  raise notice 'independent_client_conflict: PASS';
end;
$$;
select snapshot ->> 'owner' from public.submissions where id = 'submission-1';
`)
    .split("\n")
    .at(-1);
  if (conflictProof !== "admin-a") {
    throw new Error(`Stale client overwrote the first snapshot: ${conflictProof}`);
  }

  psql(String.raw`
set role authenticated;
set request.jwt.claim.sub = '${adminA}';
select public.save_admin_submission_batch_if_current(
  '[{"submission":{"id":"submission-2","owner":"admin-a"}}]'::jsonb,
  '{"submission-2":0}'::jsonb,
  '${adminA}'::uuid,
  '00000000-0000-4000-8000-000000000103'::uuid
);
do $$
declare
  before_snapshot jsonb;
begin
  select snapshot into before_snapshot from public.submissions where id = 'submission-1';
  begin
    perform public.save_admin_submission_batch_if_current(
      '[{"submission":{"id":"submission-1","owner":"partial-write"}},{"submission":{"id":"submission-2","owner":"stale"}}]'::jsonb,
      jsonb_build_object('submission-1', 1, 'submission-2', 0),
      '${adminA}'::uuid,
      '00000000-0000-4000-8000-000000000104'::uuid
    );
    raise exception 'partial batch unexpectedly committed';
  exception when serialization_failure then
    null;
  end;
  if (select snapshot from public.submissions where id = 'submission-1')
    is distinct from before_snapshot
  then
    raise exception 'first batch member changed after second-member conflict';
  end if;
end;
$$;
reset role;

insert into public.applicants (id, submission_id) values ('applicant-1', 'submission-1');
do $$
begin
  if (select case_revision from public.submissions where id = 'submission-1') <= 1 then
    raise exception 'child mutation did not advance aggregate case revision';
  end if;
end;
$$;

set role authenticated;
set request.jwt.claim.sub = '${agent}';
begin;
insert into public.questionnaire_answers (id, submission_id)
values (1, 'submission-1');
do $$
begin
  if current_setting('app.visaflow_internal_trip_date_sync', true) = 'on' then
    raise exception 'internal revision-touch context leaked after child mutation';
  end if;
  if current_setting('app.visaflow_internal_snapshot_save', true) = 'on' then
    raise exception 'internal snapshot-save context leaked after mutation';
  end if;
  if nullif(
    current_setting('app.visaflow_snapshot_revision_bumped_ids', true),
    ''
  ) is not null then
    raise exception 'snapshot revision coalescing ids leaked after mutation';
  end if;
end;
$$;
commit;

set request.jwt.claim.sub = '${adminA}';
do $$
begin
  perform public.save_admin_submission_batch_if_current(
    '[{"submission":{"id":"submission-1","owner":"actor-mismatch"}}]'::jsonb,
    jsonb_build_object(
      'submission-1',
      (select case_revision from public.submissions where id = 'submission-1')
    ),
    '${adminB}'::uuid,
    '00000000-0000-4000-8000-000000000105'::uuid
  );
  raise exception 'actor mismatch unexpectedly committed';
exception when insufficient_privilege then
  null;
end;
$$;

set request.jwt.claim.sub = '${agent}';
do $$
begin
  perform public.save_admin_submission_batch_if_current(
    '[{"submission":{"id":"submission-1","owner":"agent"}}]'::jsonb,
    jsonb_build_object(
      'submission-1',
      (select case_revision from public.submissions where id = 'submission-1')
    ),
    '${agent}'::uuid,
    '00000000-0000-4000-8000-000000000106'::uuid
  );
  raise exception 'agent unexpectedly committed admin mutation';
exception when insufficient_privilege then
  null;
end;
$$;

set request.jwt.claim.sub = '${noProfile}';
do $$
begin
  perform public.save_admin_submission_batch_if_current(
    '[{"submission":{"id":"submission-no-profile","owner":"no-profile"}}]'::jsonb,
    jsonb_build_object(
      'submission-no-profile',
      (select case_revision from public.submissions where id = 'submission-no-profile')
    ),
    '${noProfile}'::uuid,
    '00000000-0000-4000-8000-000000000107'::uuid
  );
  raise exception 'authenticated user without profile unexpectedly committed';
exception when insufficient_privilege then
  null;
end;
$$;

reset role;
insert into app_private.admin_submission_mutation_receipts (
  operation_id,
  actor_id,
  request_fingerprint,
  result,
  created_at,
  completed_at
)
select
  (
    substr(md5(sequence::text), 1, 8) || '-' ||
    substr(md5(sequence::text), 9, 4) || '-4' ||
    substr(md5(sequence::text), 14, 3) || '-8' ||
    substr(md5(sequence::text), 18, 3) || '-' ||
    substr(md5(sequence::text), 21, 12)
  )::uuid,
  '${adminA}'::uuid,
  repeat('a', 64),
  '{}'::jsonb,
  clock_timestamp() - sequence * interval '1 second',
  clock_timestamp()
from generate_series(1, 513) as generated(sequence)
on conflict (operation_id) do nothing;
insert into app_private.admin_submission_mutation_receipts (
  operation_id,
  actor_id,
  request_fingerprint,
  result,
  created_at,
  completed_at
) values (
  '00000000-0000-4000-8000-000000000199',
  '${adminA}',
  repeat('b', 64),
  '{}'::jsonb,
  clock_timestamp() - interval '91 days',
  clock_timestamp() - interval '91 days'
);

set role authenticated;
set request.jwt.claim.sub = '${adminA}';
select public.save_admin_submission_batch_if_current(
  '[{"submission":{"id":"submission-2","owner":"receipt-retention"}}]'::jsonb,
  jsonb_build_object(
    'submission-2',
    (select case_revision from public.submissions where id = 'submission-2')
  ),
  '${adminA}'::uuid,
  '00000000-0000-4000-8000-000000000108'::uuid
);
do $$
begin
  if (
    select count(*)
    from app_private.admin_submission_mutation_receipts
    where actor_id = '${adminA}'::uuid
  ) > 512 then
    raise exception 'admin mutation receipt retention exceeded 512 rows';
  end if;
  if exists (
    select 1
    from app_private.admin_submission_mutation_receipts
    where operation_id = '00000000-0000-4000-8000-000000000199'::uuid
  ) then
    raise exception 'expired admin mutation receipt was not removed';
  end if;
end;
$$;

reset role;
set role service_role;
select public.claim_access_request_review(
  '00000000-0000-4000-8000-0000000000e1',
  'approve',
  '${adminA}',
  '00000000-0000-4000-8000-000000000201'
);
do $$
begin
  perform public.claim_access_request_review(
    '00000000-0000-4000-8000-0000000000e1',
    'reject',
    '${adminB}',
    '00000000-0000-4000-8000-000000000202'
  );
  raise exception 'concurrent reject crossed an approve claim';
exception when serialization_failure then
  null;
end;
$$;
update public.access_requests
set review_claimed_at = clock_timestamp() - interval '6 minutes'
where id = '00000000-0000-4000-8000-0000000000e1';
select public.claim_access_request_review(
  '00000000-0000-4000-8000-0000000000e1',
  'reject',
  '${adminB}',
  '00000000-0000-4000-8000-000000000202'
);
update public.access_requests
set review_claimed_at = clock_timestamp() - interval '6 minutes'
where id = '00000000-0000-4000-8000-0000000000e1';
select public.claim_access_request_review(
  '00000000-0000-4000-8000-0000000000e1',
  'approve',
  '${adminA}',
  '00000000-0000-4000-8000-000000000201'
);
do $$
begin
  begin
    perform public.finalize_access_request_review(
      '00000000-0000-4000-8000-0000000000e1',
      'approve',
      '${adminA}',
      '00000000-0000-4000-8000-000000000201',
      '${adminA}',
      null
    );
    raise exception 'mismatched Auth user was accepted for access approval';
  exception when serialization_failure then
    null;
  end;

  if (
    select status <> 'pending'
    from public.access_requests
    where id = '00000000-0000-4000-8000-0000000000e1'
  ) then
    raise exception 'failed access finalization changed terminal status';
  end if;
end;
$$;
select public.finalize_access_request_review(
  '00000000-0000-4000-8000-0000000000e1',
  'approve',
  '${adminA}',
  '00000000-0000-4000-8000-000000000201',
  '${approvedUser}',
  null
);
do $$
declare
  replay jsonb;
begin
  if not exists (
    select 1
    from public.profiles
    where id = '${approvedUser}'::uuid
      and email = 'new-agent@example.test'
      and display_name = 'New Agent'
      and organization_name = 'VisaFlow'
      and role = 'agent'
  ) then
    raise exception 'approved profile was not committed with terminal decision';
  end if;

  replay := public.claim_access_request_review(
    '00000000-0000-4000-8000-0000000000e1',
    'approve',
    '${adminB}',
    '00000000-0000-4000-8000-000000000203'
  );
  if replay ->> 'status' <> 'approved' then
    raise exception 'approved access review replay was not idempotent';
  end if;
  begin
    perform public.claim_access_request_review(
      '00000000-0000-4000-8000-0000000000e1',
      'reject',
      '${adminB}',
      '00000000-0000-4000-8000-000000000204'
    );
    raise exception 'terminal approval was reopened as rejection';
  exception when serialization_failure then
    null;
  end;
end;
$$;

select 'workflow_rpc_postgres_acl_and_cas: PASS';
`);

  process.stdout.write("workflow_rpc_postgres_acl_and_cas: PASS\n");
} finally {
  spawnSync("docker", ["rm", "-f", containerName], {
    encoding: "utf8",
  });
}

-- Admin review writes carry a full cockpit snapshot. Protect that snapshot with
-- one aggregate revision and one atomic batch RPC so concurrent administrators
-- cannot overwrite each other or leave a multi-submission export checkpoint
-- partially persisted.
begin;

alter table public.submissions
  add column if not exists case_revision bigint not null default 0;

do $migration$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'submissions_case_revision_nonnegative'
      and conrelid = 'public.submissions'::regclass
  ) then
    alter table public.submissions
      add constraint submissions_case_revision_nonnegative
      check (case_revision >= 0);
  end if;
end;
$migration$;

create table if not exists app_private.admin_submission_mutation_receipts (
  operation_id uuid primary key,
  actor_id uuid not null,
  request_fingerprint text not null
    check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  result jsonb,
  created_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz
);

create index if not exists admin_submission_mutation_receipts_actor_created_idx
on app_private.admin_submission_mutation_receipts (actor_id, created_at desc);

alter table app_private.admin_submission_mutation_receipts enable row level security;
revoke all on app_private.admin_submission_mutation_receipts
  from public, anon, authenticated;
grant select, insert, update, delete on app_private.admin_submission_mutation_receipts
  to authenticated;

drop policy if exists admin_submission_mutation_receipts_select_own
  on app_private.admin_submission_mutation_receipts;
create policy admin_submission_mutation_receipts_select_own
on app_private.admin_submission_mutation_receipts
for select to authenticated
using (actor_id = auth.uid());

drop policy if exists admin_submission_mutation_receipts_insert_own
  on app_private.admin_submission_mutation_receipts;
create policy admin_submission_mutation_receipts_insert_own
on app_private.admin_submission_mutation_receipts
for insert to authenticated
with check (actor_id = auth.uid());

drop policy if exists admin_submission_mutation_receipts_update_own
  on app_private.admin_submission_mutation_receipts;
create policy admin_submission_mutation_receipts_update_own
on app_private.admin_submission_mutation_receipts
for update to authenticated
using (actor_id = auth.uid())
with check (actor_id = auth.uid());

drop policy if exists admin_submission_mutation_receipts_delete_own
  on app_private.admin_submission_mutation_receipts;
create policy admin_submission_mutation_receipts_delete_own
on app_private.admin_submission_mutation_receipts
for delete to authenticated
using (actor_id = auth.uid());

-- Profiles are provisioned only by the reviewed access-request Edge Function.
-- An arbitrary authenticated JWT must not be able to approve itself by creating
-- an `agent` profile, nor create an owned submission without an approved role.
drop policy if exists "profiles insert own agent" on public.profiles;
revoke insert on public.profiles from authenticated;

drop policy if exists "submissions agent own admin all" on public.submissions;
drop policy if exists "submissions approved agent own admin all" on public.submissions;
create policy "submissions approved agent own admin all"
on public.submissions for all
to authenticated
using (
  (
    (select app_private.current_profile_role()) = 'agent'
    and agent_id = (select auth.uid())
  )
  or (select app_private.current_profile_role()) = 'admin'
)
with check (
  (
    (select app_private.current_profile_role()) = 'agent'
    and agent_id = (select auth.uid())
  )
  or (select app_private.current_profile_role()) = 'admin'
);

create or replace function app_private.enforce_approved_submission_actor()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $function$
declare
  actor_role public.profile_role := app_private.current_profile_role();
begin
  if auth.uid() is null or actor_role is null then
    raise exception 'Approved agent or administrator profile required to mutate submissions'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

revoke all on function app_private.enforce_approved_submission_actor()
  from public, anon, authenticated;

drop trigger if exists submissions_approved_actor_guard on public.submissions;
create trigger submissions_approved_actor_guard
before insert or update on public.submissions
for each row execute function app_private.enforce_approved_submission_actor();

create or replace function app_private.bump_submission_case_revision()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  bumped_submission_ids jsonb;
  snapshot_save_context boolean :=
    current_setting('app.visaflow_internal_snapshot_save', true) = 'on';
begin
  if snapshot_save_context then
    bumped_submission_ids := coalesce(
      nullif(
        current_setting('app.visaflow_snapshot_revision_bumped_ids', true),
        ''
      )::jsonb,
      '[]'::jsonb
    );
    if bumped_submission_ids ? new.id then
      new.case_revision := old.case_revision;
      return new;
    end if;
    perform set_config(
      'app.visaflow_snapshot_revision_bumped_ids',
      (bumped_submission_ids || to_jsonb(new.id))::text,
      true
    );
  end if;
  new.case_revision := old.case_revision + 1;
  return new;
end;
$function$;

revoke all on function app_private.bump_submission_case_revision()
  from public, anon, authenticated;

drop trigger if exists submissions_bump_case_revision on public.submissions;
create trigger submissions_bump_case_revision
before update on public.submissions
for each row execute function app_private.bump_submission_case_revision();

create or replace function app_private.touch_submission_case_revision_from_child()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  previous_internal_trip_date_sync text;
  row_payload jsonb;
  target_submission_id text;
begin
  if current_setting('app.visaflow_internal_snapshot_save', true) = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  row_payload := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;

  if tg_table_name = 'status_history' then
    if row_payload ->> 'entity_type' <> 'submission' then
      return case when tg_op = 'DELETE' then old else new end;
    end if;
    target_submission_id := row_payload ->> 'entity_id';
  else
    target_submission_id := row_payload ->> 'submission_id';
  end if;

  if nullif(btrim(coalesce(target_submission_id, '')), '') is not null then
    -- Child writes happen after their row lock is acquired. The aggregate touch
    -- must still pass the existing submission lifecycle guard during an agent
    -- handoff, without leaving a permissive context enabled for later writes.
    previous_internal_trip_date_sync := current_setting(
      'app.visaflow_internal_trip_date_sync',
      true
    );
    perform set_config('app.visaflow_internal_trip_date_sync', 'on', true);
    update public.submissions
    set updated_at = greatest(updated_at, clock_timestamp())
    where id = target_submission_id;
    perform set_config(
      'app.visaflow_internal_trip_date_sync',
      coalesce(previous_internal_trip_date_sync, ''),
      true
    );
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

revoke all on function app_private.touch_submission_case_revision_from_child()
  from public, anon, authenticated;

drop trigger if exists applicants_touch_submission_case_revision on public.applicants;
create trigger applicants_touch_submission_case_revision
after insert or update or delete on public.applicants
for each row execute function app_private.touch_submission_case_revision_from_child();

drop trigger if exists questionnaire_answers_touch_submission_case_revision
  on public.questionnaire_answers;
create trigger questionnaire_answers_touch_submission_case_revision
after insert or update or delete on public.questionnaire_answers
for each row execute function app_private.touch_submission_case_revision_from_child();

drop trigger if exists media_assets_touch_submission_case_revision on public.media_assets;
create trigger media_assets_touch_submission_case_revision
after insert or update or delete on public.media_assets
for each row execute function app_private.touch_submission_case_revision_from_child();

drop trigger if exists corrections_touch_submission_case_revision on public.corrections;
create trigger corrections_touch_submission_case_revision
after insert or update or delete on public.corrections
for each row execute function app_private.touch_submission_case_revision_from_child();

drop trigger if exists status_history_touch_submission_case_revision
  on public.status_history;
create trigger status_history_touch_submission_case_revision
after insert or update or delete on public.status_history
for each row execute function app_private.touch_submission_case_revision_from_child();

-- Keep the historical draft implementation available to SECURITY INVOKER
-- wrappers without leaving an admin-callable, revision-blind RPC in the public
-- Data API schema. `app_private` is deliberately not an exposed PostgREST
-- schema; authenticated EXECUTE is required because both wrappers remain
-- SECURITY INVOKER and therefore preserve the caller's RLS context.
alter function public.save_submission_draft(jsonb) set schema app_private;
alter function app_private.save_submission_draft(jsonb)
  rename to save_submission_draft_for_internal_dispatch;
revoke all on function app_private.save_submission_draft_for_internal_dispatch(jsonb)
  from public, anon, authenticated;
grant execute on function app_private.save_submission_draft_for_internal_dispatch(jsonb)
  to authenticated;

-- A full snapshot may upsert hundreds of child rows. Coalesce their aggregate
-- revision accounting into exactly one parent revision per submission while
-- preserving and restoring transaction-local context on both success and
-- exception. The private schema is not exposed by PostgREST (asserted by the
-- checked-in Supabase config and release verifier).
create or replace function app_private.dispatch_submission_draft_with_revision_context(
  payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, app_private
as $function$
declare
  previous_bumped_submission_ids text := current_setting(
    'app.visaflow_snapshot_revision_bumped_ids',
    true
  );
  previous_snapshot_save_context text := current_setting(
    'app.visaflow_internal_snapshot_save',
    true
  );
  persisted_result jsonb;
begin
  perform set_config('app.visaflow_snapshot_revision_bumped_ids', '[]', true);
  perform set_config('app.visaflow_internal_snapshot_save', 'on', true);
  persisted_result := app_private.save_submission_draft_for_internal_dispatch(payload);
  perform set_config(
    'app.visaflow_internal_snapshot_save',
    coalesce(previous_snapshot_save_context, ''),
    true
  );
  perform set_config(
    'app.visaflow_snapshot_revision_bumped_ids',
    coalesce(previous_bumped_submission_ids, ''),
    true
  );
  return persisted_result;
exception when others then
  perform set_config(
    'app.visaflow_internal_snapshot_save',
    coalesce(previous_snapshot_save_context, ''),
    true
  );
  perform set_config(
    'app.visaflow_snapshot_revision_bumped_ids',
    coalesce(previous_bumped_submission_ids, ''),
    true
  );
  raise;
end;
$function$;

revoke all on function app_private.dispatch_submission_draft_with_revision_context(jsonb)
  from public, anon, authenticated;
grant execute on function app_private.dispatch_submission_draft_with_revision_context(jsonb)
  to authenticated;

create or replace function public.save_submission_draft(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, app_private
as $function$
declare
  actor_role public.profile_role := app_private.current_profile_role();
begin
  if auth.uid() is null then
    raise exception 'Authenticated user required to save submission draft'
      using errcode = '28000';
  end if;

  if actor_role is distinct from 'agent' then
    raise exception 'Approved agents must use the submission draft RPC; administrators use the revision-checked batch RPC'
      using errcode = '42501';
  end if;

  return app_private.dispatch_submission_draft_with_revision_context(payload);
end;
$function$;

revoke all on function public.save_submission_draft(jsonb)
  from public, anon, authenticated;
grant execute on function public.save_submission_draft(jsonb)
  to authenticated;

create or replace function public.save_admin_submission_batch_if_current(
  payloads jsonb,
  expected_revisions jsonb,
  actor_id uuid,
  operation_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, app_private
as $function$
declare
  actor_role public.profile_role := app_private.current_profile_role();
  expected_revision bigint;
  locked_count integer := 0;
  payload_count integer := 0;
  payload_record record;
  persisted_result jsonb;
  persisted_results jsonb := '[]'::jsonb;
  receipt_fingerprint text;
  receipt_result jsonb;
  requested_distinct_count integer := 0;
  request_fingerprint text;
  response jsonb;
  current_revision bigint;
  revisions jsonb;
  write_timestamp timestamptz := clock_timestamp();
begin
  if auth.uid() is null then
    raise exception 'Authenticated user required for admin submission mutation'
      using errcode = '28000';
  end if;

  if actor_id is distinct from auth.uid() then
    raise exception 'Admin mutation actor does not match the authenticated session'
      using errcode = '42501';
  end if;

  if actor_role is distinct from 'admin' then
    raise exception 'Only administrators can save admin submission mutations'
      using errcode = '42501';
  end if;

  if operation_id is null then
    raise exception 'Admin mutation operation id is required'
      using errcode = '23514';
  end if;

  if jsonb_typeof(payloads) is distinct from 'array'
    or jsonb_array_length(payloads) = 0
  then
    raise exception 'Admin mutation payloads must be a non-empty array'
      using errcode = '23514';
  end if;

  if jsonb_typeof(expected_revisions) is distinct from 'object' then
    raise exception 'Expected admin submission revisions must be an object'
      using errcode = '23514';
  end if;

  select count(*), count(distinct item -> 'submission' ->> 'id')
  into payload_count, requested_distinct_count
  from jsonb_array_elements(payloads) as requested(item)
  where nullif(btrim(coalesce(item -> 'submission' ->> 'id', '')), '') is not null;

  if payload_count <> jsonb_array_length(payloads)
    or requested_distinct_count <> payload_count
  then
    raise exception 'Admin mutation submission ids must be present and unique'
      using errcode = '23514';
  end if;

  request_fingerprint := encode(
    extensions.digest(
      convert_to(payloads::text || chr(31) || expected_revisions::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  -- Keep replay receipts bounded per administrator without weakening the
  -- retry window. Every active actor retains at most the newest 512 completed
  -- operations, and completed receipts age out after 90 days.
  delete from app_private.admin_submission_mutation_receipts as stale_receipt
  where stale_receipt.actor_id = save_admin_submission_batch_if_current.actor_id
    and stale_receipt.completed_at is not null
    and stale_receipt.created_at < clock_timestamp() - interval '90 days';

  delete from app_private.admin_submission_mutation_receipts as excess_receipt
  where excess_receipt.operation_id in (
    select retained_receipt.operation_id
    from app_private.admin_submission_mutation_receipts as retained_receipt
    where retained_receipt.actor_id = save_admin_submission_batch_if_current.actor_id
      and retained_receipt.completed_at is not null
    order by retained_receipt.created_at desc
    offset 511
  );

  -- The receipt makes a retry with the same operation id replay-safe even if
  -- the first transaction committed and its HTTP response was lost.
  insert into app_private.admin_submission_mutation_receipts (
    operation_id,
    actor_id,
    request_fingerprint
  ) values (
    operation_id,
    actor_id,
    request_fingerprint
  )
  on conflict on constraint admin_submission_mutation_receipts_pkey do nothing;

  select receipt.request_fingerprint, receipt.result
  into receipt_fingerprint, receipt_result
  from app_private.admin_submission_mutation_receipts as receipt
  where receipt.operation_id = save_admin_submission_batch_if_current.operation_id
    and receipt.actor_id = save_admin_submission_batch_if_current.actor_id
  for update;

  if not found then
    raise exception 'Admin mutation operation id belongs to another actor'
      using errcode = '42501';
  end if;

  if receipt_fingerprint is distinct from request_fingerprint then
    raise exception 'Admin mutation operation id was reused with a different request'
      using errcode = '23514';
  end if;

  if receipt_result is not null then
    return receipt_result;
  end if;

  -- Consistent lock order prevents overlapping batch saves from deadlocking.
  perform submission.id
  from public.submissions as submission
  where submission.id in (
    select item -> 'submission' ->> 'id'
    from jsonb_array_elements(payloads) as requested(item)
  )
  order by submission.id
  for update;
  get diagnostics locked_count = row_count;

  if locked_count <> payload_count then
    raise exception 'One or more admin mutation submissions are missing or forbidden'
      using errcode = '42501';
  end if;

  for payload_record in
    select
      item as payload,
      item -> 'submission' ->> 'id' as submission_id,
      ordinality
    from jsonb_array_elements(payloads) with ordinality as requested(item, ordinality)
    order by item -> 'submission' ->> 'id'
  loop
    if not expected_revisions ? payload_record.submission_id then
      raise exception 'Expected revision is missing for submission %', payload_record.submission_id
        using errcode = '23514';
    end if;

    begin
      expected_revision := (expected_revisions ->> payload_record.submission_id)::bigint;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Expected revision is invalid for submission %', payload_record.submission_id
        using errcode = '23514';
    end;

    select submission.case_revision
    into current_revision
    from public.submissions as submission
    where submission.id = payload_record.submission_id;

    if current_revision is distinct from expected_revision then
      raise exception 'V19_ADMIN_SUBMISSION_CONFLICT: submission % changed from revision % to %',
        payload_record.submission_id,
        expected_revision,
        current_revision
        using errcode = '40001';
    end if;
  end loop;

  for payload_record in
    select item as payload, ordinality
    from jsonb_array_elements(payloads) with ordinality as requested(item, ordinality)
    order by item -> 'submission' ->> 'id'
  loop
    persisted_result := app_private.dispatch_submission_draft_with_revision_context(
      jsonb_set(
        payload_record.payload,
        '{submission,updated_at}',
        to_jsonb(write_timestamp + payload_record.ordinality * interval '1 microsecond'),
        true
      )
    );
    persisted_results := persisted_results || jsonb_build_array(persisted_result);
  end loop;

  select coalesce(jsonb_object_agg(submission.id, submission.case_revision), '{}'::jsonb)
  into revisions
  from public.submissions as submission
  where submission.id in (
    select item -> 'submission' ->> 'id'
    from jsonb_array_elements(payloads) as requested(item)
  );

  response := jsonb_build_object(
    'operationId', operation_id,
    'caseRevisions', revisions,
    'results', persisted_results
  );

  update app_private.admin_submission_mutation_receipts as receipt
  set result = response,
      completed_at = clock_timestamp()
  where receipt.operation_id = save_admin_submission_batch_if_current.operation_id
    and receipt.actor_id = save_admin_submission_batch_if_current.actor_id;

  return response;
end;
$function$;

revoke all on function public.save_admin_submission_batch_if_current(
  jsonb,
  jsonb,
  uuid,
  uuid
) from public, anon, authenticated;
grant execute on function public.save_admin_submission_batch_if_current(
  jsonb,
  jsonb,
  uuid,
  uuid
) to authenticated;

do $migration$
declare
  function_oid oid := to_regprocedure(
    'public.save_admin_submission_batch_if_current(jsonb,jsonb,uuid,uuid)'
  )::oid;
  generic_function_oid oid := to_regprocedure(
    'public.save_submission_draft(jsonb)'
  )::oid;
  internal_function_oid oid := to_regprocedure(
    'app_private.save_submission_draft_for_internal_dispatch(jsonb)'
  )::oid;
  contextual_dispatch_function_oid oid := to_regprocedure(
    'app_private.dispatch_submission_draft_with_revision_context(jsonb)'
  )::oid;
begin
  if function_oid is null
    or generic_function_oid is null
    or internal_function_oid is null
    or contextual_dispatch_function_oid is null
  then
    raise exception 'Required admin concurrency function boundary is missing';
  end if;

  if exists (
    select 1 from pg_catalog.pg_proc as proc
    where proc.oid = function_oid and proc.prosecdef
  ) then
    raise exception 'Admin concurrency RPC must remain SECURITY INVOKER';
  end if;

  if has_function_privilege('anon', function_oid, 'EXECUTE') then
    raise exception 'Anonymous execution is enabled for admin concurrency RPC';
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
    raise exception 'PUBLIC execution is enabled for admin concurrency RPC';
  end if;

  if not has_function_privilege('authenticated', function_oid, 'EXECUTE') then
    raise exception 'Authenticated execution is missing for admin concurrency RPC';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc as proc
    cross join lateral unnest(coalesce(proc.proconfig, '{}'::text[])) as setting
    where proc.oid = function_oid
      and setting = 'search_path=pg_catalog, public, app_private'
  ) then
    raise exception 'Admin concurrency RPC has an unexpected search_path';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc as proc
    where proc.oid in (
      generic_function_oid,
      internal_function_oid,
      contextual_dispatch_function_oid
    )
      and proc.prosecdef
  ) then
    raise exception 'Admin concurrency dispatch functions must remain SECURITY INVOKER';
  end if;

  if has_function_privilege('anon', generic_function_oid, 'EXECUTE')
    or has_function_privilege('anon', internal_function_oid, 'EXECUTE')
    or has_function_privilege('anon', contextual_dispatch_function_oid, 'EXECUTE')
  then
    raise exception 'Anonymous execution is enabled for an admin concurrency dispatch function';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc as proc
    cross join lateral aclexplode(
      coalesce(proc.proacl, acldefault('f', proc.proowner))
    ) as privilege
    where proc.oid in (
      generic_function_oid,
      internal_function_oid,
      contextual_dispatch_function_oid
    )
      and privilege.grantee = 0
      and privilege.privilege_type = 'EXECUTE'
  ) then
    raise exception 'PUBLIC execution is enabled for an admin concurrency dispatch function';
  end if;

  if not has_function_privilege('authenticated', generic_function_oid, 'EXECUTE')
    or not has_function_privilege('authenticated', internal_function_oid, 'EXECUTE')
    or not has_function_privilege(
      'authenticated',
      contextual_dispatch_function_oid,
      'EXECUTE'
    )
  then
    raise exception 'Authenticated execution is missing for an admin concurrency dispatch function';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc as proc
    join pg_catalog.pg_namespace as namespace on namespace.oid = proc.pronamespace
    where proc.oid in (internal_function_oid, contextual_dispatch_function_oid)
      and namespace.nspname <> 'app_private'
  ) then
    raise exception 'Revision-blind submission dispatch escaped the private schema';
  end if;

  if not (
    select table_entry.relrowsecurity
    from pg_catalog.pg_class as table_entry
    where table_entry.oid =
      'app_private.admin_submission_mutation_receipts'::regclass
  ) then
    raise exception 'Admin mutation receipts must keep row-level security enabled';
  end if;

  if has_table_privilege('authenticated', 'public.profiles', 'INSERT') then
    raise exception 'Authenticated users must not self-provision profiles';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policy as policy
    where policy.polrelid = 'public.profiles'::regclass
      and policy.polcmd = 'a'
      and policy.polroles @> array[
        (select oid from pg_catalog.pg_roles where rolname = 'authenticated')
      ]::oid[]
  ) then
    raise exception 'Authenticated profile INSERT policy is still enabled';
  end if;

  if has_table_privilege(
      'anon',
      'app_private.admin_submission_mutation_receipts',
      'SELECT'
    )
    or has_table_privilege(
      'anon',
      'app_private.admin_submission_mutation_receipts',
      'INSERT'
    )
    or has_table_privilege(
      'anon',
      'app_private.admin_submission_mutation_receipts',
      'UPDATE'
    )
    or has_table_privilege(
      'anon',
      'app_private.admin_submission_mutation_receipts',
      'DELETE'
    )
  then
    raise exception 'Anonymous access is enabled for admin mutation receipts';
  end if;
end;
$migration$;

commit;

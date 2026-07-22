-- Make returned-PDF replacement upload-first, CAS-protected and replay-safe.
-- Upload intents live outside the exposed PostgREST schemas; public RPCs stay
-- SECURITY INVOKER and storage policies admit only a prepared intent path.
begin;

-- The original return-package checks used double-backslash regex literals.
-- Under standard_conforming_strings that rejects canonical *.pdf names and
-- does not reliably reject '..' path traversal. Repair both forward-only.
alter table public.agent_return_package_artifacts
  drop constraint if exists agent_return_package_artifacts_file_name_check;
alter table public.agent_return_package_artifacts
  add constraint agent_return_package_artifacts_file_name_check
  check (file_name ~ '^[A-Za-z0-9._-]+[.]pdf$');
alter table public.agent_return_package_artifacts
  drop constraint if exists agent_return_package_artifacts_storage_path_check;
alter table public.agent_return_package_artifacts
  add constraint agent_return_package_artifacts_storage_path_check
  check (btrim(storage_path) <> '' and storage_path !~ '(^/|//|[.][.])');

create table if not exists app_private.agent_return_package_upload_intents (
  operation_id uuid primary key,
  actor_id uuid not null references public.profiles(id),
  return_package_id uuid not null references public.agent_return_packages(id)
    on delete cascade,
  applicant_id text,
  artifact_kind text not null
    check (artifact_kind in ('agent_list_pdf', 'visa_application_pdf')),
  file_name text not null check (file_name in ('agent_list.pdf', 'visa_application.pdf')),
  storage_bucket text not null default 'agent-return-packages'
    check (storage_bucket = 'agent-return-packages'),
  storage_path text not null unique check (
    storage_path ~ '^return-package-upload-intents/[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$'
  ),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 52428800),
  expected_artifact_id uuid,
  expected_sha256 text,
  expected_storage_path text,
  status text not null default 'prepared'
    check (status in ('prepared', 'finalized', 'aborted')),
  artifact_id uuid references public.agent_return_package_artifacts(id)
    on delete set null,
  previous_storage_path text,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (clock_timestamp() + interval '24 hours'),
  finalized_at timestamptz,
  check (
    (artifact_kind = 'agent_list_pdf' and applicant_id is null)
    or (artifact_kind = 'visa_application_pdf' and applicant_id is not null)
  ),
  check (
    (expected_artifact_id is null and expected_sha256 is null and expected_storage_path is null)
    or (
      expected_artifact_id is not null
      and expected_sha256 ~ '^[a-f0-9]{64}$'
      and expected_storage_path is not null
    )
  ),
  check (
    (status = 'prepared' and artifact_id is null and finalized_at is null)
    or (status = 'finalized' and artifact_id is not null and finalized_at is not null)
    or (status = 'aborted' and artifact_id is null and finalized_at is not null)
  ),
  check (expires_at > created_at)
);

create index if not exists agent_return_package_upload_intents_slot_idx
on app_private.agent_return_package_upload_intents (
  return_package_id,
  artifact_kind,
  coalesce(applicant_id, 'common'),
  created_at desc
);

create index if not exists agent_return_package_upload_intents_expiry_idx
on app_private.agent_return_package_upload_intents (status, expires_at);

alter table app_private.agent_return_package_upload_intents enable row level security;

drop policy if exists "return package upload intents own admin access"
  on app_private.agent_return_package_upload_intents;
create policy "return package upload intents own admin access"
on app_private.agent_return_package_upload_intents
for all
to authenticated
using (
  actor_id = (select auth.uid())
  and (select app_private.current_profile_role()) = 'admin'
)
with check (
  actor_id = (select auth.uid())
  and (select app_private.current_profile_role()) = 'admin'
);

revoke all on schema app_private from public, anon;
grant usage on schema app_private to authenticated;
revoke all on app_private.agent_return_package_upload_intents
  from public, anon, authenticated;
grant select, insert, update, delete
  on app_private.agent_return_package_upload_intents to authenticated;

create or replace function public.prepare_agent_return_package_artifact_upload(
  payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, app_private
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_operation_id uuid;
  v_return_package_id uuid;
  v_applicant_id text := nullif(btrim(coalesce(payload ->> 'applicantId', '')), '');
  v_artifact_kind text := btrim(coalesce(payload ->> 'artifactKind', ''));
  v_sha256 text := lower(btrim(coalesce(payload ->> 'sha256', '')));
  v_size_bytes bigint;
  v_file_name text;
  v_storage_path text;
  package_record public.agent_return_packages%rowtype;
  current_artifact public.agent_return_package_artifacts%rowtype;
  existing_intent app_private.agent_return_package_upload_intents%rowtype;
begin
  if v_actor_id is null then
    raise exception 'Authenticated administrator required for return-package upload'
      using errcode = '28000';
  end if;
  if app_private.current_profile_role() <> 'admin' then
    raise exception 'Only admins can prepare return-package uploads'
      using errcode = '42501';
  end if;

  begin
    v_operation_id := (payload ->> 'operationId')::uuid;
    v_return_package_id := (payload ->> 'returnPackageId')::uuid;
    v_size_bytes := (payload ->> 'sizeBytes')::bigint;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Invalid return-package upload identity'
      using errcode = '23514';
  end;

  if v_operation_id is null
    or v_return_package_id is null
    or v_artifact_kind not in ('agent_list_pdf', 'visa_application_pdf')
    or v_sha256 !~ '^[a-f0-9]{64}$'
    or v_size_bytes <= 0
    or v_size_bytes > 52428800
    or (v_artifact_kind = 'agent_list_pdf' and v_applicant_id is not null)
    or (v_artifact_kind = 'visa_application_pdf' and v_applicant_id is null)
  then
    raise exception 'Invalid return-package upload payload'
      using errcode = '23514';
  end if;

  -- A lost prepare response has no storage side effect. Expire and compact
  -- those abandoned, object-free intents opportunistically on the next call.
  update app_private.agent_return_package_upload_intents as stale_intent
  set status = 'aborted',
      finalized_at = clock_timestamp()
  where stale_intent.actor_id = v_actor_id
    and stale_intent.status = 'prepared'
    and stale_intent.expires_at <= clock_timestamp()
    and not exists (
      select 1
      from storage.objects as object
      where object.bucket_id = stale_intent.storage_bucket
        and object.name = stale_intent.storage_path
    );

  select *
  into existing_intent
  from app_private.agent_return_package_upload_intents as intent
  where intent.operation_id = v_operation_id;

  if existing_intent.operation_id is not null then
    if existing_intent.actor_id is distinct from v_actor_id
      or existing_intent.return_package_id is distinct from v_return_package_id
      or existing_intent.applicant_id is distinct from v_applicant_id
      or existing_intent.artifact_kind is distinct from v_artifact_kind
      or existing_intent.sha256 is distinct from v_sha256
      or existing_intent.size_bytes is distinct from v_size_bytes
    then
      raise exception 'Return-package upload operation id was reused with different input'
        using errcode = '23514';
    end if;
    if existing_intent.status = 'prepared'
      and existing_intent.expires_at <= clock_timestamp()
    then
      raise exception 'Return-package upload intent expired'
        using errcode = '40001';
    end if;

    return jsonb_build_object(
      'operationId', existing_intent.operation_id,
      'storageBucket', existing_intent.storage_bucket,
      'storagePath', existing_intent.storage_path,
      'fileName', existing_intent.file_name,
      'status', existing_intent.status
    );
  end if;

  select *
  into package_record
  from public.agent_return_packages as package
  where package.id = v_return_package_id
  for update;
  if package_record.id is null or package_record.status <> 'draft' then
    raise exception 'Return package is not editable'
      using errcode = '40001';
  end if;

  if v_artifact_kind = 'visa_application_pdf' and not exists (
    select 1
    from public.export_batch_members as member
    where member.export_batch_id = package_record.export_batch_id
      and member.source_agent_id = package_record.agent_id
      and member.applicant_id = v_applicant_id
  ) then
    raise exception 'Applicant is not assigned to this return package'
      using errcode = '23514';
  end if;

  v_file_name := case
    when v_artifact_kind = 'agent_list_pdf' then 'agent_list.pdf'
    else 'visa_application.pdf'
  end;
  v_storage_path :=
    'return-package-upload-intents/' || v_return_package_id::text || '/' ||
    v_operation_id::text || '.pdf';

  select *
  into current_artifact
  from public.agent_return_package_artifacts as artifact
  where artifact.return_package_id = v_return_package_id
    and artifact.artifact_kind = v_artifact_kind
    and artifact.applicant_id is not distinct from v_applicant_id
  for update;

  insert into app_private.agent_return_package_upload_intents (
    operation_id,
    actor_id,
    return_package_id,
    applicant_id,
    artifact_kind,
    file_name,
    storage_path,
    sha256,
    size_bytes,
    expected_artifact_id,
    expected_sha256,
    expected_storage_path
  ) values (
    v_operation_id,
    v_actor_id,
    v_return_package_id,
    v_applicant_id,
    v_artifact_kind,
    v_file_name,
    v_storage_path,
    v_sha256,
    v_size_bytes,
    current_artifact.id,
    current_artifact.sha256,
    current_artifact.storage_path
  );

  return jsonb_build_object(
    'operationId', v_operation_id,
    'storageBucket', 'agent-return-packages',
    'storagePath', v_storage_path,
    'fileName', v_file_name,
    'status', 'prepared'
  );
end;
$function$;

create or replace function app_private.lock_return_package_upload_storage_object(
  p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $function$
declare
  v_actor_id uuid := auth.uid();
  upload_intent app_private.agent_return_package_upload_intents%rowtype;
  storage_receipt jsonb;
begin
  if v_actor_id is null or app_private.current_profile_role() <> 'admin' then
    raise exception 'Only admins can lock return-package upload objects'
      using errcode = '42501';
  end if;

  select *
  into upload_intent
  from app_private.agent_return_package_upload_intents as intent
  where intent.operation_id = p_operation_id
    and intent.actor_id = v_actor_id
    and intent.status = 'prepared';
  if upload_intent.operation_id is null then
    raise exception 'Prepared return-package upload intent was not found'
      using errcode = '42501';
  end if;

  select jsonb_build_object('id', object.id, 'metadata', object.metadata)
  into storage_receipt
  from storage.objects as object
  where object.bucket_id = upload_intent.storage_bucket
    and object.name = upload_intent.storage_path
  for update;

  return storage_receipt;
end;
$function$;

revoke all on function app_private.lock_return_package_upload_storage_object(uuid)
  from public, anon;
grant execute on function app_private.lock_return_package_upload_storage_object(uuid)
  to authenticated;

create or replace function public.finalize_agent_return_package_artifact_upload(
  p_operation_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, app_private
as $function$
declare
  actor_id uuid := auth.uid();
  intent app_private.agent_return_package_upload_intents%rowtype;
  package_record public.agent_return_packages%rowtype;
  current_artifact public.agent_return_package_artifacts%rowtype;
  saved_artifact public.agent_return_package_artifacts%rowtype;
  storage_receipt jsonb;
  storage_object_id uuid;
  storage_metadata jsonb;
  stored_size bigint;
begin
  if actor_id is null or app_private.current_profile_role() <> 'admin' then
    raise exception 'Only admins can finalize return-package uploads'
      using errcode = '42501';
  end if;

  select *
  into intent
  from app_private.agent_return_package_upload_intents as upload_intent
  where upload_intent.operation_id = p_operation_id
  for update;
  if intent.operation_id is null or intent.actor_id is distinct from actor_id then
    raise exception 'Return-package upload intent was not found'
      using errcode = '42501';
  end if;

  if intent.status = 'finalized' then
    select *
    into saved_artifact
    from public.agent_return_package_artifacts as artifact
    where artifact.id = intent.artifact_id;
    if saved_artifact.id is null then
      raise exception 'Finalized return-package upload lost its artifact receipt';
    end if;
    return jsonb_build_object(
      'operationId', intent.operation_id,
      'artifact', to_jsonb(saved_artifact),
      'previousStoragePath', intent.previous_storage_path,
      'duplicate', true
    );
  end if;
  if intent.status <> 'prepared' then
    raise exception 'Return-package upload intent is not finalizable'
      using errcode = '40001';
  end if;
  if intent.expires_at <= clock_timestamp() then
    raise exception 'Return-package upload intent expired'
      using errcode = '40001';
  end if;

  select *
  into package_record
  from public.agent_return_packages as package
  where package.id = intent.return_package_id
  for update;
  if package_record.id is null or package_record.status <> 'draft' then
    raise exception 'Return package is not editable'
      using errcode = '40001';
  end if;

  storage_receipt := app_private.lock_return_package_upload_storage_object(
    intent.operation_id
  );
  begin
    storage_object_id := (storage_receipt ->> 'id')::uuid;
  exception when invalid_text_representation then
    storage_object_id := null;
  end;
  storage_metadata := storage_receipt -> 'metadata';
  stored_size := case
    when coalesce(storage_metadata ->> 'size', '') ~ '^[0-9]+$'
      then (storage_metadata ->> 'size')::bigint
    else null
  end;
  if storage_object_id is null
    or coalesce(storage_metadata ->> 'mimetype', '') <> 'application/pdf'
    or stored_size is distinct from intent.size_bytes
  then
    raise exception 'Uploaded return-package PDF does not match its intent'
      using errcode = '23514';
  end if;

  select *
  into current_artifact
  from public.agent_return_package_artifacts as artifact
  where artifact.return_package_id = intent.return_package_id
    and artifact.artifact_kind = intent.artifact_kind
    and artifact.applicant_id is not distinct from intent.applicant_id
  for update;

  if (intent.expected_artifact_id is null and current_artifact.id is not null)
    or (
      intent.expected_artifact_id is not null
      and (
        current_artifact.id is distinct from intent.expected_artifact_id
        or current_artifact.sha256 is distinct from intent.expected_sha256
        or current_artifact.storage_path is distinct from intent.expected_storage_path
      )
    )
  then
    raise exception 'V19_RETURN_PACKAGE_UPLOAD_CONFLICT: artifact slot changed'
      using errcode = '40001';
  end if;

  perform set_config(
    'app.visaflow_return_package_upload_operation',
    intent.operation_id::text,
    true
  );

  if current_artifact.id is null then
    insert into public.agent_return_package_artifacts (
      return_package_id,
      applicant_id,
      artifact_kind,
      storage_bucket,
      storage_path,
      file_name,
      sha256,
      size_bytes
    ) values (
      intent.return_package_id,
      intent.applicant_id,
      intent.artifact_kind,
      intent.storage_bucket,
      intent.storage_path,
      intent.file_name,
      intent.sha256,
      intent.size_bytes
    )
    returning * into saved_artifact;
  else
    update public.agent_return_package_artifacts as artifact
    set storage_bucket = intent.storage_bucket,
        storage_path = intent.storage_path,
        file_name = intent.file_name,
        sha256 = intent.sha256,
        size_bytes = intent.size_bytes
    where artifact.id = current_artifact.id
    returning * into saved_artifact;
  end if;

  perform set_config('app.visaflow_return_package_upload_operation', '', true);

  update app_private.agent_return_package_upload_intents as upload_intent
  set status = 'finalized',
      artifact_id = saved_artifact.id,
      previous_storage_path = current_artifact.storage_path,
      finalized_at = clock_timestamp()
  where upload_intent.operation_id = intent.operation_id;

  return jsonb_build_object(
    'operationId', intent.operation_id,
    'artifact', to_jsonb(saved_artifact),
    'previousStoragePath', current_artifact.storage_path,
    'duplicate', false
  );
end;
$function$;

create or replace function public.abort_agent_return_package_artifact_upload(
  p_operation_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, app_private
as $function$
declare
  actor_id uuid := auth.uid();
  intent app_private.agent_return_package_upload_intents%rowtype;
begin
  if actor_id is null or app_private.current_profile_role() <> 'admin' then
    raise exception 'Only admins can abort return-package uploads'
      using errcode = '42501';
  end if;

  select *
  into intent
  from app_private.agent_return_package_upload_intents as upload_intent
  where upload_intent.operation_id = p_operation_id
  for update;
  if intent.operation_id is null or intent.actor_id is distinct from actor_id then
    raise exception 'Return-package upload intent was not found'
      using errcode = '42501';
  end if;
  if intent.status = 'aborted' then
    return jsonb_build_object('operationId', intent.operation_id, 'status', 'aborted');
  end if;
  if intent.status <> 'prepared' then
    raise exception 'Finalized return-package upload cannot be aborted'
      using errcode = '40001';
  end if;
  if exists (
    select 1
    from storage.objects as object
    where object.bucket_id = intent.storage_bucket
      and object.name = intent.storage_path
  ) then
    raise exception 'Return-package upload object must be removed before abort';
  end if;

  update app_private.agent_return_package_upload_intents as upload_intent
  set status = 'aborted',
      finalized_at = clock_timestamp()
  where upload_intent.operation_id = intent.operation_id;

  return jsonb_build_object('operationId', intent.operation_id, 'status', 'aborted');
end;
$function$;

create or replace function app_private.validate_agent_return_package_artifact()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $function$
declare
  package_record public.agent_return_packages%rowtype;
  upload_intent app_private.agent_return_package_upload_intents%rowtype;
  expected_file_name text;
  expected_applicant_name text;
  operation_setting text := current_setting(
    'app.visaflow_return_package_upload_operation',
    true
  );
begin
  if auth.uid() is null or app_private.current_profile_role() <> 'admin' then
    raise exception 'Only admins can upload return package artifacts'
      using errcode = '42501';
  end if;
  if operation_setting is null
    or operation_setting !~ '^[0-9a-f-]{36}$'
  then
    raise exception 'Artifact metadata must be finalized through the upload RPC'
      using errcode = '42501';
  end if;

  select *
  into upload_intent
  from app_private.agent_return_package_upload_intents as intent
  where intent.operation_id = operation_setting::uuid
    and intent.status = 'prepared'
    and intent.actor_id = auth.uid();
  if upload_intent.operation_id is null then
    raise exception 'Prepared return-package upload intent is required'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and (
    new.return_package_id is distinct from old.return_package_id
    or new.artifact_kind is distinct from old.artifact_kind
    or new.applicant_id is distinct from old.applicant_id
  ) then
    raise exception 'Return package artifact identity is immutable';
  end if;

  select *
  into package_record
  from public.agent_return_packages as package
  where package.id = new.return_package_id
  for update;
  if package_record.id is null or package_record.status <> 'draft' then
    raise exception 'Return package is not editable';
  end if;

  if new.artifact_kind = 'agent_list_pdf' then
    expected_file_name := 'agent_list.pdf';
    new.applicant_name := null;
  else
    expected_file_name := 'visa_application.pdf';
    select member.applicant_name
    into expected_applicant_name
    from public.export_batch_members as member
    where member.export_batch_id = package_record.export_batch_id
      and member.source_agent_id = package_record.agent_id
      and member.applicant_id = new.applicant_id;
    if expected_applicant_name is null then
      raise exception 'Applicant is not assigned to this return package';
    end if;
    new.applicant_name := expected_applicant_name;
  end if;

  if upload_intent.return_package_id is distinct from new.return_package_id
    or upload_intent.applicant_id is distinct from new.applicant_id
    or upload_intent.artifact_kind is distinct from new.artifact_kind
    or upload_intent.storage_bucket is distinct from new.storage_bucket
    or upload_intent.storage_path is distinct from new.storage_path
    or upload_intent.file_name is distinct from new.file_name
    or upload_intent.sha256 is distinct from lower(new.sha256)
    or upload_intent.size_bytes is distinct from new.size_bytes
    or new.file_name is distinct from expected_file_name
  then
    raise exception 'Artifact metadata does not match its prepared upload intent'
      using errcode = '23514';
  end if;

  new.sha256 := lower(new.sha256);
  new.uploaded_by := auth.uid();
  new.uploaded_at := clock_timestamp();
  return new;
end;
$function$;

create or replace function app_private.is_prepared_return_package_upload_path(
  target_bucket_id text,
  target_name text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $function$
  select target_bucket_id = 'agent-return-packages' and exists (
    select 1
    from app_private.agent_return_package_upload_intents as intent
    join public.agent_return_packages as package
      on package.id = intent.return_package_id
    where intent.storage_bucket = target_bucket_id
      and intent.storage_path = target_name
      and intent.status = 'prepared'
      and intent.actor_id = auth.uid()
      and package.status = 'draft'
      and app_private.current_profile_role() = 'admin'
  )
$function$;

create or replace function app_private.is_known_return_package_upload_path(
  target_bucket_id text,
  target_name text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $function$
  select target_bucket_id = 'agent-return-packages' and exists (
    select 1
    from app_private.agent_return_package_upload_intents as intent
    join public.agent_return_packages as package
      on package.id = intent.return_package_id
    where intent.storage_bucket = target_bucket_id
      and intent.storage_path = target_name
      and package.status = 'draft'
      and app_private.current_profile_role() = 'admin'
  )
$function$;

revoke all on function app_private.validate_agent_return_package_artifact() from public;
revoke all on function app_private.is_prepared_return_package_upload_path(text, text)
  from public;
revoke all on function app_private.is_known_return_package_upload_path(text, text)
  from public;
grant execute on function app_private.is_prepared_return_package_upload_path(text, text)
  to authenticated;
grant execute on function app_private.is_known_return_package_upload_path(text, text)
  to authenticated;

drop policy if exists "agent return package storage insert" on storage.objects;
create policy "agent return package storage insert"
on storage.objects for insert
to authenticated
with check (
  (select app_private.is_prepared_return_package_upload_path(bucket_id, name))
);

drop policy if exists "agent return package storage update" on storage.objects;

drop policy if exists "agent return package storage delete" on storage.objects;
create policy "agent return package storage delete"
on storage.objects for delete
to authenticated
using (
  (
    (select app_private.current_profile_role()) = 'admin'
    and (select app_private.is_draft_agent_return_package_storage_path(bucket_id, name))
  )
  or (select app_private.is_known_return_package_upload_path(bucket_id, name))
);

revoke all on function public.prepare_agent_return_package_artifact_upload(jsonb)
  from public, anon, authenticated;
revoke all on function public.finalize_agent_return_package_artifact_upload(uuid)
  from public, anon, authenticated;
revoke all on function public.abort_agent_return_package_artifact_upload(uuid)
  from public, anon, authenticated;
grant execute on function public.prepare_agent_return_package_artifact_upload(jsonb)
  to authenticated;
grant execute on function public.finalize_agent_return_package_artifact_upload(uuid)
  to authenticated;
grant execute on function public.abort_agent_return_package_artifact_upload(uuid)
  to authenticated;

do $migration$
declare
  prepare_oid oid := to_regprocedure(
    'public.prepare_agent_return_package_artifact_upload(jsonb)'
  )::oid;
  finalize_oid oid := to_regprocedure(
    'public.finalize_agent_return_package_artifact_upload(uuid)'
  )::oid;
  abort_oid oid := to_regprocedure(
    'public.abort_agent_return_package_artifact_upload(uuid)'
  )::oid;
  storage_lock_oid oid := to_regprocedure(
    'app_private.lock_return_package_upload_storage_object(uuid)'
  )::oid;
begin
  if prepare_oid is null
    or finalize_oid is null
    or abort_oid is null
    or storage_lock_oid is null
  then
    raise exception 'Atomic return-package upload RPC boundary is missing';
  end if;
  if exists (
    select 1
    from pg_catalog.pg_proc as proc
    where proc.oid in (prepare_oid, finalize_oid, abort_oid)
      and proc.prosecdef
  ) then
    raise exception 'Return-package upload RPCs must remain SECURITY INVOKER';
  end if;
  if has_function_privilege('anon', prepare_oid, 'EXECUTE')
    or has_function_privilege('anon', finalize_oid, 'EXECUTE')
    or has_function_privilege('anon', abort_oid, 'EXECUTE')
  then
    raise exception 'Anon can execute return-package upload RPCs';
  end if;
  if not has_function_privilege('authenticated', prepare_oid, 'EXECUTE')
    or not has_function_privilege('authenticated', finalize_oid, 'EXECUTE')
    or not has_function_privilege('authenticated', abort_oid, 'EXECUTE')
  then
    raise exception 'Authenticated admins cannot execute return-package upload RPCs';
  end if;
  if not (
    select proc.prosecdef
    from pg_catalog.pg_proc as proc
    where proc.oid = storage_lock_oid
  ) then
    raise exception 'Storage row-lock helper must remain SECURITY DEFINER';
  end if;
  if has_function_privilege('anon', storage_lock_oid, 'EXECUTE')
    or not has_function_privilege('authenticated', storage_lock_oid, 'EXECUTE')
  then
    raise exception 'Storage row-lock helper ACL is invalid';
  end if;
  if not exists (
    select 1
    from pg_catalog.pg_proc as proc
    cross join lateral unnest(coalesce(proc.proconfig, '{}'::text[])) as setting
    where proc.oid = storage_lock_oid
      and setting = 'search_path=pg_catalog, public, app_private'
  ) then
    raise exception 'Storage row-lock helper search_path is not fixed';
  end if;
end;
$migration$;

commit;

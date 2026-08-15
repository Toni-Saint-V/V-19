begin;

create table app_private.agent_submission_deletion_receipts (
  operation_id uuid primary key,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  submission_id text not null,
  expected_revision bigint not null check (expected_revision >= 0),
  storage_objects jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp() + interval '15 minutes',
  cleanup_started_at timestamptz,
  completed_at timestamptz,
  result jsonb,
  check (expires_at > created_at),
  check (cleanup_started_at is null or cleanup_started_at >= created_at),
  check (jsonb_typeof(storage_objects) = 'array'),
  check ((completed_at is null) = (result is null))
);

create index agent_submission_deletion_receipts_expiry_idx
on app_private.agent_submission_deletion_receipts(expires_at);
create unique index agent_submission_deletion_receipts_active_uidx
on app_private.agent_submission_deletion_receipts(actor_id, submission_id)
where completed_at is null;

revoke all on app_private.agent_submission_deletion_receipts
from public, anon, authenticated;

create or replace function app_private.block_submission_mutation_during_deletion()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  if current_setting('app.v19_agent_submission_deletion', true) = 'allowed' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if exists (
    select 1
    from app_private.agent_submission_deletion_receipts receipt
    where receipt.submission_id = old.id
      and receipt.completed_at is null
      and (
        receipt.cleanup_started_at is not null
        or receipt.expires_at > clock_timestamp()
      )
  ) then
    raise exception 'V19_AGENT_SUBMISSION_DELETION_PENDING: submission % is being deleted',
      old.id using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

drop trigger if exists submissions_block_mutation_during_deletion
on public.submissions;
create trigger submissions_block_mutation_during_deletion
before update or delete on public.submissions
for each row execute function app_private.block_submission_mutation_during_deletion();

create or replace function app_private.can_write_submission_storage_during_deletion(
  object_bucket text,
  object_path text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  path_submission_id text;
begin
  path_submission_id := case
    when object_bucket = 'submission-files' then split_part(object_path, '/', 1)
    when object_bucket = 'submission-media'
      and split_part(object_path, '/', 1) = 'submissions'
      then split_part(object_path, '/', 2)
    when object_bucket = 'submission-media' then split_part(object_path, '/', 1)
    else null
  end;

  if nullif(path_submission_id, '') is null then
    return object_bucket not in ('submission-files', 'submission-media');
  end if;

  perform pg_catalog.pg_advisory_xact_lock_shared(
    pg_catalog.hashtextextended(path_submission_id, 868920)
  );
  return not exists (
    select 1
    from app_private.agent_submission_deletion_receipts receipt
    where receipt.submission_id = path_submission_id
      and receipt.completed_at is null
      and (
        receipt.cleanup_started_at is not null
        or receipt.expires_at > clock_timestamp()
      )
  );
end;
$function$;

revoke all on function app_private.can_write_submission_storage_during_deletion(text, text)
from public, anon, authenticated;
grant execute on function app_private.can_write_submission_storage_during_deletion(text, text)
to authenticated;

drop policy if exists "submission deletion blocks storage inserts"
on storage.objects;
create policy "submission deletion blocks storage inserts"
on storage.objects as restrictive for insert
to authenticated
with check (
  app_private.can_write_submission_storage_during_deletion(bucket_id, name)
);

drop policy if exists "submission deletion blocks storage updates"
on storage.objects;
create policy "submission deletion blocks storage updates"
on storage.objects as restrictive for update
to authenticated
using (
  app_private.can_write_submission_storage_during_deletion(bucket_id, name)
)
with check (
  app_private.can_write_submission_storage_during_deletion(bucket_id, name)
);

create or replace function app_private.can_delete_submission_storage_via_receipt(
  object_bucket text,
  object_path text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select exists (
    select 1
    from app_private.agent_submission_deletion_receipts receipt
    cross join lateral jsonb_array_elements(receipt.storage_objects) storage_object
    where receipt.actor_id = auth.uid()
      and receipt.completed_at is null
      and receipt.cleanup_started_at is not null
      and storage_object ->> 'bucket' = object_bucket
      and storage_object ->> 'path' = object_path
  )
$function$;

revoke all on function app_private.can_delete_submission_storage_via_receipt(text, text)
from public, anon, authenticated;
grant execute on function app_private.can_delete_submission_storage_via_receipt(text, text)
to authenticated;

drop policy if exists "agent submission deletion receipt storage cleanup"
on storage.objects;
create policy "agent submission deletion receipt storage cleanup"
on storage.objects for delete
to authenticated
using (
  bucket_id in ('submission-media', 'submission-files')
  and app_private.can_delete_submission_storage_via_receipt(bucket_id, name)
);

create or replace function public.begin_agent_submission_deletion(
  submission_id text,
  expected_revision bigint,
  operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
<<begin_agent_submission_deletion>>
declare
  actor_id uuid := auth.uid();
  actor_role public.profile_role := app_private.current_profile_role();
  current_revision bigint;
  existing_receipt app_private.agent_submission_deletion_receipts%rowtype;
  owner_id uuid;
  storage_objects jsonb;
  submission_status public.submission_status;
begin
  if actor_id is null then
    raise exception 'Authenticated user required for submission deletion'
      using errcode = '28000';
  end if;
  if actor_role is distinct from 'agent' then
    raise exception 'Only approved agents can delete submissions'
      using errcode = '42501';
  end if;
  if operation_id is null or nullif(btrim(coalesce(submission_id, '')), '') is null then
    raise exception 'Submission deletion identity is required'
      using errcode = '23514';
  end if;
  if expected_revision is null or expected_revision < 0 then
    raise exception 'Submission deletion requires a valid expected revision'
      using errcode = '23514';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(submission_id, 868920)
  );

  delete from app_private.agent_submission_deletion_receipts receipt
  where (
      receipt.completed_at is null
      and receipt.cleanup_started_at is null
      and receipt.expires_at <= clock_timestamp()
    )
    or (
      receipt.completed_at is not null
      and receipt.completed_at < clock_timestamp() - interval '90 days'
    );

  select submission.agent_id, submission.case_revision, submission.status
  into owner_id, current_revision, submission_status
  from public.submissions submission
  where submission.id = begin_agent_submission_deletion.submission_id
  for update;

  if not found then
    raise exception 'Submission not found' using errcode = 'P0002';
  end if;
  if owner_id is distinct from actor_id then
    raise exception 'Cannot delete another agent submission'
      using errcode = '42501';
  end if;
  if submission_status not in ('draft', 'filling') then
    raise exception 'Only draft or filling submissions can be deleted'
      using errcode = '42501';
  end if;
  if current_revision is distinct from expected_revision then
    raise exception 'V19_AGENT_SUBMISSION_CONFLICT: submission % changed from revision % to %',
      submission_id,
      expected_revision,
      current_revision
      using errcode = '40001';
  end if;

  select receipt.*
  into existing_receipt
  from app_private.agent_submission_deletion_receipts receipt
  where receipt.actor_id = begin_agent_submission_deletion.actor_id
    and receipt.submission_id = begin_agent_submission_deletion.submission_id
    and receipt.completed_at is null
    and (
      receipt.cleanup_started_at is not null
      or receipt.expires_at > clock_timestamp()
    )
  for update;

  if found then
    return jsonb_build_object(
      'operationId', existing_receipt.operation_id,
      'submissionId', existing_receipt.submission_id,
      'storageObjects', existing_receipt.storage_objects
    );
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('bucket', storage_object.bucket, 'path', storage_object.path)
      order by storage_object.bucket, storage_object.path
    ),
    '[]'::jsonb
  )
  into storage_objects
  from (
    select distinct storage_reference.bucket, storage_reference.path
    from (
    select asset.storage_bucket as bucket, asset.storage_path as path
    from public.media_assets asset
    where asset.submission_id = begin_agent_submission_deletion.submission_id
      and asset.storage_bucket = 'submission-media'
      and nullif(btrim(asset.storage_path), '') is not null
    union
    select 'submission-files' as bucket, submission_file.file_path as path
    from public.submission_files submission_file
    where submission_file.submission_id = begin_agent_submission_deletion.submission_id
      and nullif(btrim(submission_file.file_path), '') is not null
    union
    select artifact.storage_bucket as bucket, artifact.storage_path as path
    from public.admin_pdf_artifacts artifact
    where artifact.submission_id = begin_agent_submission_deletion.submission_id
      and artifact.storage_bucket = 'submission-media'
    union
    select handoff.storage_bucket as bucket, handoff.storage_path as path
    from public.returned_pdf_handoff_artifacts handoff
    where handoff.submission_id = begin_agent_submission_deletion.submission_id
      and handoff.storage_bucket = 'submission-media'
    union
    select object.bucket_id as bucket, object.name as path
    from storage.objects object
    where (
        object.bucket_id = 'submission-files'
        and split_part(object.name, '/', 1) = begin_agent_submission_deletion.submission_id
      )
      or (
        object.bucket_id = 'submission-media'
        and (
          (
            split_part(object.name, '/', 1) = 'submissions'
            and split_part(object.name, '/', 2) = begin_agent_submission_deletion.submission_id
          )
          or split_part(object.name, '/', 1) = begin_agent_submission_deletion.submission_id
        )
      )
    ) storage_reference
  ) storage_object;

  insert into app_private.agent_submission_deletion_receipts (
    operation_id,
    actor_id,
    submission_id,
    expected_revision,
    storage_objects
  ) values (
    operation_id,
    actor_id,
    submission_id,
    expected_revision,
    storage_objects
  );

  return jsonb_build_object(
    'operationId', operation_id,
    'submissionId', submission_id,
    'storageObjects', storage_objects
  );
end;
$function$;

create or replace function public.mark_agent_submission_deletion_cleanup_started(
  submission_id text,
  operation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $function$
<<mark_agent_submission_deletion_cleanup_started>>
declare
  actor_id uuid := auth.uid();
  receipt app_private.agent_submission_deletion_receipts%rowtype;
begin
  if actor_id is null then
    raise exception 'Authenticated user required for submission deletion'
      using errcode = '28000';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(submission_id, 868920)
  );
  select deletion_receipt.*
  into receipt
  from app_private.agent_submission_deletion_receipts deletion_receipt
  where deletion_receipt.operation_id = mark_agent_submission_deletion_cleanup_started.operation_id
    and deletion_receipt.actor_id = mark_agent_submission_deletion_cleanup_started.actor_id
    and deletion_receipt.submission_id = mark_agent_submission_deletion_cleanup_started.submission_id
    and deletion_receipt.completed_at is null
  for update;

  if not found then
    raise exception 'Submission deletion receipt not found'
      using errcode = 'P0002';
  end if;
  if receipt.cleanup_started_at is null
    and receipt.expires_at <= clock_timestamp()
  then
    raise exception 'Submission deletion receipt expired'
      using errcode = '55000';
  end if;

  update app_private.agent_submission_deletion_receipts deletion_receipt
  set cleanup_started_at = coalesce(
    deletion_receipt.cleanup_started_at,
    clock_timestamp()
  )
  where deletion_receipt.operation_id = mark_agent_submission_deletion_cleanup_started.operation_id;
  return true;
end;
$function$;

create or replace function public.finalize_agent_submission_deletion(
  submission_id text,
  operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
<<finalize_agent_submission_deletion>>
declare
  actor_id uuid := auth.uid();
  current_revision bigint;
  receipt app_private.agent_submission_deletion_receipts%rowtype;
  response jsonb;
begin
  if actor_id is null then
    raise exception 'Authenticated user required for submission deletion'
      using errcode = '28000';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(submission_id, 868920)
  );

  select deletion_receipt.*
  into receipt
  from app_private.agent_submission_deletion_receipts deletion_receipt
  where deletion_receipt.operation_id = finalize_agent_submission_deletion.operation_id
    and deletion_receipt.actor_id = finalize_agent_submission_deletion.actor_id
    and deletion_receipt.submission_id = finalize_agent_submission_deletion.submission_id
  for update;

  if not found then
    raise exception 'Submission deletion receipt not found'
      using errcode = 'P0002';
  end if;
  if receipt.completed_at is not null then
    return receipt.result;
  end if;
  if receipt.cleanup_started_at is null then
    raise exception 'Submission storage cleanup was not started'
      using errcode = '55000';
  end if;

  select submission.case_revision
  into current_revision
  from public.submissions submission
  where submission.id = finalize_agent_submission_deletion.submission_id
    and submission.agent_id = finalize_agent_submission_deletion.actor_id
    and submission.status in ('draft', 'filling')
  for update;

  if not found then
    raise exception 'Submission is missing, forbidden, or no longer deletable'
      using errcode = '42501';
  end if;
  if current_revision is distinct from receipt.expected_revision then
    raise exception 'V19_AGENT_SUBMISSION_CONFLICT: submission % changed during deletion',
      submission_id using errcode = '40001';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(receipt.storage_objects)
      as storage_object(bucket text, path text)
    join storage.objects object
      on object.bucket_id = storage_object.bucket
      and object.name = storage_object.path
  ) then
    raise exception 'Submission storage objects must be deleted before finalization'
      using errcode = '55000';
  end if;
  if exists (
    select 1
    from storage.objects object
    where (
        object.bucket_id = 'submission-files'
        and split_part(object.name, '/', 1) = finalize_agent_submission_deletion.submission_id
      )
      or (
        object.bucket_id = 'submission-media'
        and (
          (
            split_part(object.name, '/', 1) = 'submissions'
            and split_part(object.name, '/', 2) = finalize_agent_submission_deletion.submission_id
          )
          or split_part(object.name, '/', 1) = finalize_agent_submission_deletion.submission_id
        )
      )
  ) then
    raise exception 'Submission storage namespace must be empty before finalization'
      using errcode = '55000';
  end if;

  delete from public.status_history history
  where (
      history.entity_type = 'submission'
      and history.entity_id = finalize_agent_submission_deletion.submission_id
    )
    or (
      history.entity_type = 'applicant'
      and history.entity_id in (
        select applicant.id
        from public.applicants applicant
        where applicant.submission_id = finalize_agent_submission_deletion.submission_id
      )
    )
    or (
      history.entity_type = 'media'
      and history.entity_id in (
        select asset.id
        from public.media_assets asset
        where asset.submission_id = finalize_agent_submission_deletion.submission_id
      )
    );

  delete from app_private.agent_submission_mutation_receipts mutation_receipt
  where mutation_receipt.actor_id = finalize_agent_submission_deletion.actor_id
    and mutation_receipt.submission_id = finalize_agent_submission_deletion.submission_id;

  perform set_config('app.v19_agent_submission_deletion', 'allowed', true);
  delete from public.submissions submission
  where submission.id = finalize_agent_submission_deletion.submission_id;

  if not found then
    raise exception 'Submission deletion did not remove a row'
      using errcode = 'P0001';
  end if;

  response := jsonb_build_object(
    'deleted', true,
    'operationId', operation_id,
    'submissionId', submission_id
  );
  update app_private.agent_submission_deletion_receipts deletion_receipt
  set completed_at = clock_timestamp(),
      result = response
  where deletion_receipt.operation_id = finalize_agent_submission_deletion.operation_id;

  return response;
end;
$function$;

create or replace function public.cancel_agent_submission_deletion(
  submission_id text,
  operation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $function$
<<cancel_agent_submission_deletion>>
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null then
    raise exception 'Authenticated user required for submission deletion'
      using errcode = '28000';
  end if;

  delete from app_private.agent_submission_deletion_receipts receipt
  where receipt.operation_id = cancel_agent_submission_deletion.operation_id
    and receipt.actor_id = cancel_agent_submission_deletion.actor_id
    and receipt.submission_id = cancel_agent_submission_deletion.submission_id
    and receipt.completed_at is null
    and receipt.cleanup_started_at is null;
  return found;
end;
$function$;

revoke all on function public.begin_agent_submission_deletion(text, bigint, uuid)
from public, anon, authenticated;
revoke all on function public.mark_agent_submission_deletion_cleanup_started(text, uuid)
from public, anon, authenticated;
revoke all on function public.finalize_agent_submission_deletion(text, uuid)
from public, anon, authenticated;
revoke all on function public.cancel_agent_submission_deletion(text, uuid)
from public, anon, authenticated;
grant execute on function public.begin_agent_submission_deletion(text, bigint, uuid)
to authenticated;
grant execute on function public.mark_agent_submission_deletion_cleanup_started(text, uuid)
to authenticated;
grant execute on function public.finalize_agent_submission_deletion(text, uuid)
to authenticated;
grant execute on function public.cancel_agent_submission_deletion(text, uuid)
to authenticated;

commit;

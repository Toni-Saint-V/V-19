-- Agent-facing deletion is an audited card archive, not a destructive removal
-- of the submission aggregate. This preserves review history and private
-- Storage objects while removing eligible drafts from the agent queue.
begin;

create table if not exists public.agent_submission_card_archives (
  submission_id text primary key
    references public.submissions(id) on delete cascade,
  agent_id uuid not null
    references public.profiles(id) on delete restrict,
  case_revision bigint not null
    check (case_revision >= 0),
  archived_at timestamptz not null default clock_timestamp()
);

create index if not exists agent_submission_card_archives_agent_archived_idx
on public.agent_submission_card_archives (agent_id, archived_at desc);

alter table public.agent_submission_card_archives enable row level security;

revoke all on public.agent_submission_card_archives
  from public, anon, authenticated;
grant select on public.agent_submission_card_archives
  to authenticated;

drop policy if exists agent_submission_card_archives_select_visible
  on public.agent_submission_card_archives;
create policy agent_submission_card_archives_select_visible
on public.agent_submission_card_archives
for select
to authenticated
using (
  (
    (select app_private.current_profile_role()) = 'agent'
    and agent_id = (select auth.uid())
  )
  or (select app_private.current_profile_role()) = 'admin'
);

drop policy if exists agent_submission_card_archives_insert_own_editable
  on public.agent_submission_card_archives;
create policy agent_submission_card_archives_insert_own_editable
on public.agent_submission_card_archives
for insert
to authenticated
with check (
  (select app_private.current_profile_role()) = 'agent'
  and agent_id = (select auth.uid())
  and exists (
    select 1
    from public.submissions submission
    where submission.id = submission_id
      and submission.agent_id = (select auth.uid())
      and submission.case_revision = case_revision
      and submission.status in ('draft', 'filling')
  )
);

create or replace function public.archive_agent_submission_card(
  submission_id text,
  expected_case_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
set row_security = on
as $function$
declare
  actor_id uuid := auth.uid();
  actor_role public.profile_role := app_private.current_profile_role();
  current_submission public.submissions%rowtype;
  existing_archive public.agent_submission_card_archives%rowtype;
  inserted_archive public.agent_submission_card_archives%rowtype;
begin
  if actor_id is null or actor_role is distinct from 'agent' then
    raise exception 'V19_AGENT_SUBMISSION_ARCHIVE_FORBIDDEN'
      using errcode = '42501';
  end if;

  if nullif(btrim(coalesce(submission_id, '')), '') is null
    or expected_case_revision is null
    or expected_case_revision < 0 then
    raise exception 'V19_AGENT_SUBMISSION_ARCHIVE_INVALID_INPUT'
      using errcode = '22023';
  end if;

  select submission.*
  into current_submission
  from public.submissions submission
  where submission.id = archive_agent_submission_card.submission_id
    and submission.agent_id = actor_id
  for update;

  if not found then
    raise exception 'V19_AGENT_SUBMISSION_ARCHIVE_FORBIDDEN'
      using errcode = '42501';
  end if;

  -- Serialize on the parent before reading the archive row so concurrent
  -- retries observe the first committed insert instead of surfacing 23505.
  select archive.*
  into existing_archive
  from public.agent_submission_card_archives archive
  where archive.submission_id = archive_agent_submission_card.submission_id
    and archive.agent_id = actor_id;

  if found then
    return jsonb_build_object(
      'submissionId', existing_archive.submission_id,
      'caseRevision', existing_archive.case_revision,
      'archivedAt', existing_archive.archived_at,
      'idempotent', true
    );
  end if;

  if current_submission.status not in ('draft', 'filling') then
    raise exception 'V19_AGENT_SUBMISSION_ARCHIVE_STATUS_BLOCKED'
      using errcode = '22023';
  end if;

  if current_submission.case_revision <> expected_case_revision then
    raise exception 'V19_AGENT_SUBMISSION_ARCHIVE_CONFLICT'
      using errcode = '40001';
  end if;

  insert into public.agent_submission_card_archives (
    submission_id,
    agent_id,
    case_revision
  )
  values (
    current_submission.id,
    actor_id,
    current_submission.case_revision
  )
  returning * into inserted_archive;

  return jsonb_build_object(
    'submissionId', inserted_archive.submission_id,
    'caseRevision', inserted_archive.case_revision,
    'archivedAt', inserted_archive.archived_at,
    'idempotent', false
  );
end;
$function$;

revoke all on function public.archive_agent_submission_card(text, bigint)
  from public, anon, authenticated;
grant execute on function public.archive_agent_submission_card(text, bigint)
  to authenticated;

-- Archive and every agent-side mutation serialize on the same submission row.
-- This makes the card removal linearizable across stale tabs: a mutation that
-- wins the row lock completes first, while every later mutation is rejected.
create or replace function app_private.agent_submission_card_mutation_allowed(
  target_submission_id text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, app_private
set row_security = on
as $function$
declare
  actor_id uuid := auth.uid();
  actor_role public.profile_role := app_private.current_profile_role();
  locked_submission_id text;
begin
  if actor_role is distinct from 'agent' then
    return true;
  end if;

  if actor_id is null
    or nullif(btrim(coalesce(target_submission_id, '')), '') is null then
    return false;
  end if;

  select submission.id
  into locked_submission_id
  from public.submissions submission
  where submission.id = target_submission_id
    and submission.agent_id = actor_id
  for update;

  -- Ownership remains the responsibility of the existing RLS/RPC boundary.
  -- This helper is a restrictive archive fence only.
  if not found then
    return true;
  end if;

  return not exists (
    select 1
    from public.agent_submission_card_archives archive
    where archive.submission_id = locked_submission_id
      and archive.agent_id = actor_id
  );
end;
$function$;

revoke all on function app_private.agent_submission_card_mutation_allowed(text)
  from public, anon, authenticated;
grant execute on function app_private.agent_submission_card_mutation_allowed(text)
  to authenticated;

create or replace function app_private.status_history_parent_submission_id(
  target_entity_type text,
  target_entity_id text
)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
set row_security = on
as $function$
  select case target_entity_type
    when 'submission' then target_entity_id
    when 'applicant' then (
      select applicant.submission_id
      from public.applicants applicant
      where applicant.id = target_entity_id
    )
    when 'media' then (
      select media.submission_id
      from public.media_assets media
      where media.id = target_entity_id
    )
    when 'appointment' then (
      select appointment.submission_id
      from public.appointments appointment
      where appointment.id::text = target_entity_id
    )
    else null
  end;
$function$;

revoke all on function app_private.status_history_parent_submission_id(text, text)
  from public, anon, authenticated;

create or replace function app_private.enforce_agent_submission_card_archive_fence()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
set row_security = on
as $function$
declare
  old_row jsonb;
  new_row jsonb;
  old_submission_id text;
  new_submission_id text;
begin
  if tg_op <> 'INSERT' then
    old_row := to_jsonb(old);
  end if;
  if tg_op <> 'DELETE' then
    new_row := to_jsonb(new);
  end if;

  if tg_table_name = 'submissions' then
    old_submission_id := old_row ->> 'id';
    new_submission_id := new_row ->> 'id';

    if tg_op = 'UPDATE'
      and new.agent_id is distinct from old.agent_id
      and exists (
        select 1
        from public.agent_submission_card_archives archive
        where archive.submission_id = old.id
      ) then
      raise exception 'V19_AGENT_SUBMISSION_ARCHIVED_REASSIGN_BLOCKED'
        using errcode = '55000';
    end if;
  elsif tg_table_name = 'status_history' then
    old_submission_id := app_private.status_history_parent_submission_id(
      old_row ->> 'entity_type',
      old_row ->> 'entity_id'
    );
    new_submission_id := app_private.status_history_parent_submission_id(
      new_row ->> 'entity_type',
      new_row ->> 'entity_id'
    );
  else
    old_submission_id := old_row ->> 'submission_id';
    new_submission_id := new_row ->> 'submission_id';
  end if;

  if old_submission_id is not null
    and not app_private.agent_submission_card_mutation_allowed(
      old_submission_id
    ) then
    raise exception 'V19_AGENT_SUBMISSION_ARCHIVED_MUTATION_BLOCKED'
      using errcode = '55000';
  end if;

  if new_submission_id is not null
    and new_submission_id is distinct from old_submission_id
    and not app_private.agent_submission_card_mutation_allowed(
      new_submission_id
    ) then
    raise exception 'V19_AGENT_SUBMISSION_ARCHIVED_MUTATION_BLOCKED'
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

revoke all on function app_private.enforce_agent_submission_card_archive_fence()
  from public, anon, authenticated;

drop trigger if exists submissions_agent_card_archive_fence
  on public.submissions;
create trigger submissions_agent_card_archive_fence
before update or delete on public.submissions
for each row execute function app_private.enforce_agent_submission_card_archive_fence();

drop trigger if exists applicants_agent_card_archive_fence
  on public.applicants;
create trigger applicants_agent_card_archive_fence
before insert or update or delete on public.applicants
for each row execute function app_private.enforce_agent_submission_card_archive_fence();

drop trigger if exists questionnaire_answers_agent_card_archive_fence
  on public.questionnaire_answers;
create trigger questionnaire_answers_agent_card_archive_fence
before insert or update or delete on public.questionnaire_answers
for each row execute function app_private.enforce_agent_submission_card_archive_fence();

drop trigger if exists media_assets_agent_card_archive_fence
  on public.media_assets;
create trigger media_assets_agent_card_archive_fence
before insert or update or delete on public.media_assets
for each row execute function app_private.enforce_agent_submission_card_archive_fence();

drop trigger if exists corrections_agent_card_archive_fence
  on public.corrections;
create trigger corrections_agent_card_archive_fence
before insert or update or delete on public.corrections
for each row execute function app_private.enforce_agent_submission_card_archive_fence();

drop trigger if exists appointments_agent_card_archive_fence
  on public.appointments;
create trigger appointments_agent_card_archive_fence
before insert or update or delete on public.appointments
for each row execute function app_private.enforce_agent_submission_card_archive_fence();

drop trigger if exists status_history_agent_card_archive_fence
  on public.status_history;
create trigger status_history_agent_card_archive_fence
before insert or update or delete on public.status_history
for each row execute function app_private.enforce_agent_submission_card_archive_fence();

drop trigger if exists submission_files_agent_card_archive_fence
  on public.submission_files;
create trigger submission_files_agent_card_archive_fence
before insert or update or delete on public.submission_files
for each row execute function app_private.enforce_agent_submission_card_archive_fence();

-- Storage policies remain the supported extension point for storage.objects.
-- Restrictive policies compose with all existing ownership/status policies and
-- use the same parent-row lock as the archive RPC and relational triggers.
drop policy if exists agent_card_archive_storage_insert_fence
  on storage.objects;
create policy agent_card_archive_storage_insert_fence
on storage.objects
as restrictive
for insert
to authenticated
with check (
  bucket_id not in ('submission-media', 'submission-files')
  or app_private.agent_submission_card_mutation_allowed(
    case
      when bucket_id = 'submission-media'
        and split_part(name, '/', 1) = 'submissions'
        then nullif(split_part(name, '/', 2), '')
      else nullif(split_part(name, '/', 1), '')
    end
  )
);

drop policy if exists agent_card_archive_storage_update_fence
  on storage.objects;
create policy agent_card_archive_storage_update_fence
on storage.objects
as restrictive
for update
to authenticated
using (
  bucket_id not in ('submission-media', 'submission-files')
  or app_private.agent_submission_card_mutation_allowed(
    case
      when bucket_id = 'submission-media'
        and split_part(name, '/', 1) = 'submissions'
        then nullif(split_part(name, '/', 2), '')
      else nullif(split_part(name, '/', 1), '')
    end
  )
)
with check (
  bucket_id not in ('submission-media', 'submission-files')
  or app_private.agent_submission_card_mutation_allowed(
    case
      when bucket_id = 'submission-media'
        and split_part(name, '/', 1) = 'submissions'
        then nullif(split_part(name, '/', 2), '')
      else nullif(split_part(name, '/', 1), '')
    end
  )
);

drop policy if exists agent_card_archive_storage_delete_fence
  on storage.objects;
create policy agent_card_archive_storage_delete_fence
on storage.objects
as restrictive
for delete
to authenticated
using (
  bucket_id not in ('submission-media', 'submission-files')
  or app_private.agent_submission_card_mutation_allowed(
    case
      when bucket_id = 'submission-media'
        and split_part(name, '/', 1) = 'submissions'
        then nullif(split_part(name, '/', 2), '')
      else nullif(split_part(name, '/', 1), '')
    end
  )
);

-- The product exposes only the audited archive flow. Prevent authenticated
-- clients from bypassing it with a destructive DELETE on the aggregate.
revoke delete, truncate on public.submissions from anon, authenticated;

commit;

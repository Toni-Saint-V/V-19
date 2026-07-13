-- Forward-remediation template only. This file is intentionally outside
-- supabase/migrations and must never be applied as unversioned SQL.
--
-- If 20260712201203_allow_admin_waiting_review_issue_checkpoint.sql must be
-- rolled back after promotion, create a new timestamped migration with
-- `supabase migration new restore_submission_review_readiness_guard`, copy this
-- file into that migration, obtain explicit owner approval, and apply the new
-- migration through the normal promotion workflow.
--
-- The function body below is the exact pre-change body from
-- 20260703165306_day10_review_readiness_storage_identity.sql. The statements
-- after it preserve least privilege and fail unless the canonical deferred
-- trigger and function security contract remain intact.

create or replace function app_private.enforce_submission_review_readiness()
returns trigger
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  if new.status not in ('ready_for_review', 'waiting_review') then
    return new;
  end if;

  if new.type = 'single' and (
    select count(*) from public.applicants where submission_id = new.id
  ) <> 1 then
    raise exception 'A single submission must have exactly one applicant before review'
      using errcode = '23514';
  end if;

  if new.type = 'family' and not exists (
    select 1 from public.applicants where submission_id = new.id
  ) then
    raise exception 'A family submission must have applicants before review'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.applicants a
    where a.submission_id = new.id
      and (
        nullif(trim(a.full_name), '') is null
        or nullif(trim(a.role), '') is null
        or nullif(trim(a.passport_number), '') is null
        or trim(a.passport_number) = '-'
        or a.birth_date is null
        or nullif(trim(coalesce(a.citizenship, '')), '') is null
        or nullif(trim(coalesce(a.address, '')), '') is null
        or nullif(trim(coalesce(a.phone, '')), '') is null
        or nullif(trim(coalesce(a.email, '')), '') is null
        or a.passport_issued_at is null
        or a.passport_expires_at is null
        or nullif(trim(a.country), '') is null
        or nullif(trim(a.city), '') is null
        or nullif(trim(a.trip_dates), '') is null
        or nullif(trim(coalesce(a.hotel_name, '')), '') is null
        or nullif(trim(coalesce(a.hotel_address, '')), '') is null
      )
  ) then
    raise exception 'Applicant required fields must be complete before review'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.applicants a
    cross join lateral (
      values
        ('passport_scan'::public.media_slot_type),
        ('selfie'::public.media_slot_type),
        ('selfie_2'::public.media_slot_type)
    ) as required_media(type)
    where a.submission_id = new.id
      and not exists (
        select 1
        from public.media_assets m
        where m.submission_id = new.id
          and m.applicant_id = a.id
          and m.type = required_media.type
          and m.storage_bucket = 'submission-media'
          and m.upload_status = 'uploaded'
          and m.review_status not in ('replace_required', 'poor_quality')
          and nullif(trim(m.storage_path), '') is not null
          and nullif(trim(coalesce(m.generated_file_name, '')), '') is not null
          and m.storage_path !~ '(^/|//|\.\.)'
          and split_part(m.storage_path, '/', 1) = 'submissions'
          and split_part(m.storage_path, '/', 2) = new.id
          and split_part(m.storage_path, '/', 3) = 'applicants'
          and split_part(m.storage_path, '/', 4) = a.id
          and split_part(m.storage_path, '/', 5) = required_media.type::text
          and split_part(m.storage_path, '/', 6) <> ''
          and split_part(m.storage_path, '/', 7) = ''
      )
  ) then
    raise exception 'All required media must be uploaded before review'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.corrections c
    where c.submission_id = new.id
      and c.severity = 'blocking'
      and c.status = 'open'
  ) then
    raise exception 'Blocking corrections must be fixed before review'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_submission_review_readiness()
  from public, anon, authenticated;

do $$
declare
  function_record record;
  trigger_record record;
begin
  select
    function_definition.prosecdef,
    function_definition.proconfig
  into function_record
  from pg_proc function_definition
  where function_definition.oid =
    'app_private.enforce_submission_review_readiness()'::regprocedure;

  if function_record.prosecdef is distinct from true
    or not coalesce(function_record.proconfig, '{}'::text[])
      @> array['search_path=public, app_private']
  then
    raise exception 'Review readiness function security contract was not restored';
  end if;

  if has_function_privilege(
    'anon',
    'app_private.enforce_submission_review_readiness()'::regprocedure,
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'app_private.enforce_submission_review_readiness()'::regprocedure,
    'EXECUTE'
  ) then
    raise exception 'Browser roles must not execute the review readiness trigger function';
  end if;

  select
    readiness_trigger.tgdeferrable,
    readiness_trigger.tginitdeferred,
    readiness_trigger.tgenabled,
    readiness_trigger.tgfoid
  into trigger_record
  from pg_trigger readiness_trigger
  where readiness_trigger.tgrelid = 'public.submissions'::regclass
    and readiness_trigger.tgname = 'submissions_review_readiness_guard'
    and not readiness_trigger.tgisinternal;

  if trigger_record.tgfoid is distinct from
      'app_private.enforce_submission_review_readiness()'::regprocedure
    or trigger_record.tgdeferrable is distinct from true
    or trigger_record.tginitdeferred is distinct from true
    or trigger_record.tgenabled is distinct from 'O'
  then
    raise exception 'Canonical deferred review readiness trigger was not restored';
  end if;
end;
$$;

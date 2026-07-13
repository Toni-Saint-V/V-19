create or replace function app_private.enforce_submission_review_readiness()
returns trigger
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  actor_role public.profile_role;
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
    -- Issue creation and return are separate canonical admin actions. Persist
    -- the issue during the same-status admin review save; the following return
    -- changes status to returned in its own guarded transaction.
    if tg_op = 'UPDATE' then
      actor_role := app_private.current_profile_role();

      if actor_role = 'admin'
        and old.status = 'waiting_review'
        and new.status = 'waiting_review'
      then
        return new;
      end if;
    end if;

    raise exception 'Blocking corrections must be fixed before review'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

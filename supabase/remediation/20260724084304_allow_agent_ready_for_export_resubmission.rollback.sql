-- Forward-only rollback template for
-- 20260724084304_allow_agent_ready_for_export_resubmission.sql.
-- Apply this body through a newly timestamped migration. Never delete or edit
-- production migration history.

create or replace function app_private.enforce_submission_agent_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  actor_role public.profile_role := app_private.current_profile_role();
  internal_trip_date_sync boolean :=
    current_setting('app.visaflow_internal_trip_date_sync', true) = 'on';
begin
  if actor_role = 'admin' then
    return new;
  end if;

  if auth.uid() is null or new.agent_id <> auth.uid() then
    raise exception 'Cannot write submission for another agent'
      using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'filling', 'ready_for_review', 'waiting_review') then
      raise exception 'Agents cannot create submissions in review, export, or appointment states'
        using errcode = '42501';
    end if;

    if new.appointment_status <> 'not_started'
      or new.review_started_at is not null
      or new.accepted_at is not null
      or new.exported_at is not null
    then
      raise exception 'Agents cannot create review, export, or appointment state'
        using errcode = '42501';
    end if;

    return new;
  end if;

  if old.agent_id <> auth.uid() or new.agent_id <> old.agent_id then
    raise exception 'Agents cannot reassign submissions'
      using errcode = '42501';
  end if;

  if new.appointment_status is distinct from old.appointment_status
    or new.review_started_at is distinct from old.review_started_at
    or new.accepted_at is distinct from old.accepted_at
    or new.exported_at is distinct from old.exported_at
  then
    raise exception 'Agents cannot update review, export, or appointment state'
      using errcode = '42501';
  end if;

  if old.status = 'returned' then
    if new.status not in ('returned', 'ready_for_review', 'waiting_review') then
      raise exception 'Returned submissions can only stay returned, be marked ready, or be resubmitted'
        using errcode = '42501';
    end if;
  elsif old.status in ('draft', 'filling', 'ready_for_review') then
    if new.status not in ('draft', 'filling', 'ready_for_review', 'waiting_review') then
      raise exception 'Agents cannot advance submissions into review, export, or appointment states'
        using errcode = '42501';
    end if;
  elsif internal_trip_date_sync
    and old.status = 'waiting_review'
    and new.status = old.status
    and new.type is not distinct from old.type
    and new.title is not distinct from old.title
    and new.country is not distinct from old.country
    and new.city is not distinct from old.city
    and new.priority is not distinct from old.priority
    and new.readiness_percent is not distinct from old.readiness_percent
    and new.family_intelligence is not distinct from old.family_intelligence
    and new.appointment_status is not distinct from old.appointment_status
    and new.submitted_at is not distinct from old.submitted_at
    and new.review_started_at is not distinct from old.review_started_at
    and new.accepted_at is not distinct from old.accepted_at
    and new.exported_at is not distinct from old.exported_at
  then
    return new;
  else
    raise exception 'Agents cannot update submissions after handoff to operator review'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_submission_agent_mutation()
  from public, anon, authenticated;

create or replace function app_private.enforce_media_asset_review_boundary()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  actor_role public.profile_role := app_private.current_profile_role();
  content_changed boolean := false;
begin
  if not exists (
    select 1
    from public.applicants applicant
    where applicant.id = new.applicant_id
      and applicant.submission_id = new.submission_id
  ) then
    raise exception 'Media asset applicant does not belong to submission'
      using errcode = '23503';
  end if;

  if tg_op = 'UPDATE' then
    content_changed :=
      new.applicant_id is distinct from old.applicant_id
      or new.submission_id is distinct from old.submission_id
      or new.type is distinct from old.type
      or new.original_file_name is distinct from old.original_file_name
      or new.generated_file_name is distinct from old.generated_file_name
      or new.storage_bucket is distinct from old.storage_bucket
      or new.storage_path is distinct from old.storage_path
      or new.mime_type is distinct from old.mime_type
      or new.size_bytes is distinct from old.size_bytes
      or new.upload_status is distinct from old.upload_status;
  end if;

  if actor_role = 'agent' then
    if tg_op = 'INSERT' then
      if new.review_status is distinct from 'not_reviewed'::public.media_review_status
        or new.reviewed_at is not null
        or new.reviewed_by is not null
      then
        raise exception 'Agents cannot set media review state'
          using errcode = '42501';
      end if;
    elsif content_changed then
      if new.review_status is distinct from 'not_reviewed'::public.media_review_status
        or new.reviewed_at is not null
        or new.reviewed_by is not null
      then
        raise exception 'Agents cannot preserve or set media review state while changing media'
          using errcode = '42501';
      end if;
    elsif new.review_status is distinct from old.review_status
      or new.reviewed_at is distinct from old.reviewed_at
      or new.reviewed_by is distinct from old.reviewed_by
    then
      raise exception 'Agents cannot change media review state'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_media_asset_review_boundary()
  from public, anon, authenticated;

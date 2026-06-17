create or replace function public.save_submission_draft(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  submission_record record;
  actor_role public.profile_role := app_private.current_profile_role();
  can_write_children boolean := false;
  applicant_count integer := 0;
  media_count integer := 0;
  status_history_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authenticated user required to save submission draft'
      using errcode = '28000';
  end if;

  select *
  into submission_record
  from jsonb_to_record(payload -> 'submission') as submission_payload (
    id text,
    agent_id uuid,
    type text,
    title text,
    country text,
    city text,
    travel_date text,
    status public.submission_status,
    priority text,
    readiness_percent integer,
    family_intelligence jsonb,
    appointment_status public.appointment_status,
    submitted_at timestamptz,
    review_started_at timestamptz,
    accepted_at timestamptz,
    exported_at timestamptz,
    updated_at timestamptz
  );

  if submission_record.id is null or submission_record.agent_id is null then
    raise exception 'Submission payload is required';
  end if;

  if submission_record.agent_id <> auth.uid() and actor_role <> 'admin' then
    raise exception 'Cannot save submission for another agent'
      using errcode = '42501';
  end if;

  can_write_children := actor_role = 'admin'
    or submission_record.status in ('draft', 'filling', 'returned', 'ready_for_review');

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(payload -> 'applicants', '[]'::jsonb)) as applicant_payload (
      submission_id text
    )
    where applicant_payload.submission_id <> submission_record.id
  ) then
    raise exception 'Applicant payload contains a mismatched submission id';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(payload -> 'media_assets', '[]'::jsonb)) as media_payload (
      applicant_id text,
      submission_id text,
      type public.media_slot_type,
      storage_bucket text,
      storage_path text
    )
    where media_payload.submission_id <> submission_record.id
       or media_payload.storage_bucket <> 'submission-media'
       or split_part(media_payload.storage_path, '/', 1) <> submission_record.id
       or split_part(media_payload.storage_path, '/', 2) <> media_payload.applicant_id
       or split_part(media_payload.storage_path, '/', 3) <> media_payload.type::text
       or split_part(media_payload.storage_path, '/', 5) <> ''
  ) then
    raise exception 'Media payload does not match the storage path contract';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(payload -> 'corrections', '[]'::jsonb)) as correction_payload (
      submission_id text
    )
    where correction_payload.submission_id is distinct from submission_record.id
  ) then
    raise exception 'Correction payload contains a mismatched submission id';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(payload -> 'corrections', '[]'::jsonb)) as correction_payload (
      submission_id text,
      applicant_id text
    )
    where correction_payload.applicant_id is not null
      and not exists (
        select 1
        from jsonb_to_recordset(coalesce(payload -> 'applicants', '[]'::jsonb)) as applicant_payload (
          id text,
          submission_id text
        )
        where applicant_payload.id = correction_payload.applicant_id
          and applicant_payload.submission_id = submission_record.id
      )
      and not exists (
        select 1
        from public.applicants a
        where a.id = correction_payload.applicant_id
          and a.submission_id = submission_record.id
      )
  ) then
    raise exception 'Correction payload contains an applicant outside the submission';
  end if;

  insert into public.submissions (
    id,
    agent_id,
    type,
    title,
    country,
    city,
    travel_date,
    status,
    priority,
    readiness_percent,
    family_intelligence,
    appointment_status,
    submitted_at,
    review_started_at,
    accepted_at,
    exported_at,
    updated_at
  )
  values (
    submission_record.id,
    submission_record.agent_id,
    submission_record.type,
    submission_record.title,
    submission_record.country,
    submission_record.city,
    submission_record.travel_date,
    submission_record.status,
    submission_record.priority,
    submission_record.readiness_percent,
    submission_record.family_intelligence,
    submission_record.appointment_status,
    submission_record.submitted_at,
    submission_record.review_started_at,
    submission_record.accepted_at,
    submission_record.exported_at,
    coalesce(submission_record.updated_at, now())
  )
  on conflict (id) do update set
    type = excluded.type,
    title = excluded.title,
    country = excluded.country,
    city = excluded.city,
    travel_date = excluded.travel_date,
    status = excluded.status,
    priority = excluded.priority,
    readiness_percent = excluded.readiness_percent,
    family_intelligence = excluded.family_intelligence,
    appointment_status = excluded.appointment_status,
    submitted_at = excluded.submitted_at,
    review_started_at = excluded.review_started_at,
    accepted_at = excluded.accepted_at,
    exported_at = excluded.exported_at,
    updated_at = excluded.updated_at;

  if can_write_children then
    insert into public.applicants (
      id,
      submission_id,
      full_name,
      role,
      suggested_role,
      role_confirmed,
      birth_date,
      patronymic,
      citizenship,
      address,
      phone,
      email,
      passport_number,
      passport_issued_at,
      passport_expires_at,
      country,
      city,
      trip_dates,
      hotel_name,
      hotel_address,
      questionnaire_percent,
      media_percent,
      updated_at
    )
    select
      applicant_payload.id,
      applicant_payload.submission_id,
      applicant_payload.full_name,
      applicant_payload.role,
      applicant_payload.suggested_role,
      applicant_payload.role_confirmed,
      applicant_payload.birth_date,
      applicant_payload.patronymic,
      applicant_payload.citizenship,
      applicant_payload.address,
      applicant_payload.phone,
      applicant_payload.email,
      applicant_payload.passport_number,
      applicant_payload.passport_issued_at,
      applicant_payload.passport_expires_at,
      applicant_payload.country,
      applicant_payload.city,
      applicant_payload.trip_dates,
      applicant_payload.hotel_name,
      applicant_payload.hotel_address,
      applicant_payload.questionnaire_percent,
      applicant_payload.media_percent,
      now()
    from jsonb_to_recordset(coalesce(payload -> 'applicants', '[]'::jsonb)) as applicant_payload (
      id text,
      submission_id text,
      full_name text,
      role text,
      suggested_role text,
      role_confirmed boolean,
      birth_date date,
      patronymic text,
      citizenship text,
      address text,
      phone text,
      email text,
      passport_number text,
      passport_issued_at date,
      passport_expires_at date,
      country text,
      city text,
      trip_dates text,
      hotel_name text,
      hotel_address text,
      questionnaire_percent integer,
      media_percent integer
    )
    on conflict (id) do update set
      full_name = excluded.full_name,
      questionnaire_percent = excluded.questionnaire_percent,
      media_percent = excluded.media_percent,
      updated_at = excluded.updated_at;

    get diagnostics applicant_count = row_count;

    insert into public.media_assets (
      id,
      applicant_id,
      submission_id,
      type,
      original_file_name,
      generated_file_name,
      storage_bucket,
      storage_path,
      mime_type,
      size_bytes,
      upload_status,
      review_status,
      uploaded_at,
      reviewed_at,
      reviewed_by
    )
    select
      media_payload.id,
      media_payload.applicant_id,
      media_payload.submission_id,
      media_payload.type,
      media_payload.original_file_name,
      media_payload.generated_file_name,
      media_payload.storage_bucket,
      media_payload.storage_path,
      media_payload.mime_type,
      media_payload.size_bytes,
      media_payload.upload_status,
      media_payload.review_status,
      media_payload.uploaded_at,
      media_payload.reviewed_at,
      media_payload.reviewed_by
    from jsonb_to_recordset(coalesce(payload -> 'media_assets', '[]'::jsonb)) as media_payload (
      id text,
      applicant_id text,
      submission_id text,
      type public.media_slot_type,
      original_file_name text,
      generated_file_name text,
      storage_bucket text,
      storage_path text,
      mime_type text,
      size_bytes bigint,
      upload_status public.media_upload_status,
      review_status public.media_review_status,
      uploaded_at timestamptz,
      reviewed_at timestamptz,
      reviewed_by uuid
    )
    on conflict (applicant_id, type) do update set
      id = excluded.id,
      submission_id = excluded.submission_id,
      original_file_name = excluded.original_file_name,
      generated_file_name = excluded.generated_file_name,
      storage_bucket = excluded.storage_bucket,
      storage_path = excluded.storage_path,
      mime_type = excluded.mime_type,
      size_bytes = excluded.size_bytes,
      upload_status = excluded.upload_status,
      review_status = excluded.review_status,
      uploaded_at = excluded.uploaded_at,
      reviewed_at = excluded.reviewed_at,
      reviewed_by = excluded.reviewed_by;

    get diagnostics media_count = row_count;

    insert into public.corrections (
      id,
      submission_id,
      applicant_id,
      scope,
      field_key,
      media_type,
      reason,
      severity,
      status,
      created_by,
      created_at,
      fixed_at
    )
    select
      correction_payload.id,
      correction_payload.submission_id,
      correction_payload.applicant_id,
      correction_payload.scope,
      correction_payload.field_key,
      correction_payload.media_type,
      correction_payload.reason,
      correction_payload.severity,
      correction_payload.status,
      correction_payload.created_by,
      correction_payload.created_at,
      correction_payload.fixed_at
    from jsonb_to_recordset(coalesce(payload -> 'corrections', '[]'::jsonb)) as correction_payload (
      id uuid,
      submission_id text,
      applicant_id text,
      scope text,
      field_key text,
      media_type public.media_slot_type,
      reason text,
      severity text,
      status text,
      created_by uuid,
      created_at timestamptz,
      fixed_at timestamptz
    )
    on conflict (id) do update set
      applicant_id = excluded.applicant_id,
      scope = excluded.scope,
      field_key = excluded.field_key,
      media_type = excluded.media_type,
      reason = excluded.reason,
      severity = excluded.severity,
      status = excluded.status,
      fixed_at = excluded.fixed_at;
  end if;

  insert into public.status_history (
    id,
    entity_type,
    entity_id,
    from_status,
    to_status,
    comment,
    changed_by,
    changed_at
  )
  select
    coalesce(status_payload.id, gen_random_uuid()),
    status_payload.entity_type,
    status_payload.entity_id,
    status_payload.from_status,
    status_payload.to_status,
    status_payload.comment,
    status_payload.changed_by,
    status_payload.changed_at
  from jsonb_to_recordset(coalesce(payload -> 'status_history', '[]'::jsonb)) as status_payload (
    id uuid,
    entity_type text,
    entity_id text,
    from_status text,
    to_status text,
    comment text,
    changed_by uuid,
    changed_at timestamptz
  )
  on conflict (id) do nothing;

  get diagnostics status_history_count = row_count;

  return jsonb_build_object(
    'submissionId', submission_record.id,
    'applicants', applicant_count,
    'mediaAssets', media_count,
    'statusHistory', status_history_count
  );
end;
$$;

revoke all on function public.save_submission_draft(jsonb) from public;
grant execute on function public.save_submission_draft(jsonb) to authenticated;

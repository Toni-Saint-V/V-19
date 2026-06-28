alter table public.export_batches
  add column if not exists content_fingerprint text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'export_batches_content_fingerprint_not_blank'
  ) then
    alter table public.export_batches
      add constraint export_batches_content_fingerprint_not_blank
      check (content_fingerprint is null or btrim(content_fingerprint) <> '');
  end if;
end
$$;

create unique index if not exists export_batches_content_fingerprint_uidx
on public.export_batches (content_fingerprint)
where content_fingerprint is not null;

create or replace function public.complete_export_package(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  actor_role public.profile_role := app_private.current_profile_role();
  batch_record record;
  persisted_batch record;
  submission_ids text[];
  provided_submission_count integer := 0;
  expected_submission_count integer := 0;
  current_submission_count integer := 0;
  current_applicant_count integer := 0;
  cockpit_snapshot_count integer := 0;
  changed_submission_count integer := 0;
  status_history_count integer := 0;
  duplicate_batch boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Authenticated user required to complete export package'
      using errcode = '28000';
  end if;

  if actor_role <> 'admin' then
    raise exception 'Only admins can complete export packages'
      using errcode = '42501';
  end if;

  select *
  into batch_record
  from jsonb_to_record(payload -> 'batch') as batch_payload (
    id uuid,
    format text,
    content_fingerprint text,
    idempotency_key text,
    file_name text,
    row_count integer,
    submission_ids jsonb
  );

  if batch_record.format not in ('xlsx', 'csv') then
    raise exception 'Export package format is invalid';
  end if;

  if batch_record.idempotency_key is null or btrim(batch_record.idempotency_key) = '' then
    raise exception 'Export package idempotency key is required';
  end if;

  if batch_record.content_fingerprint is null or btrim(batch_record.content_fingerprint) = '' then
    raise exception 'Export package content fingerprint is required';
  end if;

  if batch_record.file_name is null or btrim(batch_record.file_name) = '' then
    raise exception 'Export package file name is required';
  end if;

  if batch_record.row_count is null or batch_record.row_count <= 0 then
    raise exception 'Export package must contain at least one applicant row';
  end if;

  if jsonb_typeof(batch_record.submission_ids) <> 'array' then
    raise exception 'Export package submission ids are required';
  end if;

  provided_submission_count := jsonb_array_length(batch_record.submission_ids);

  select array_agg(distinct value order by value)
  into submission_ids
  from jsonb_array_elements_text(batch_record.submission_ids) as ids(value)
  where btrim(value) <> '';

  expected_submission_count := coalesce(array_length(submission_ids, 1), 0);

  if expected_submission_count = 0 then
    raise exception 'Export package submission ids are required';
  end if;

  if expected_submission_count <> provided_submission_count then
    raise exception 'Export package submission ids must be unique and non-empty';
  end if;

  select count(*)
  into current_submission_count
  from (
    select id
    from public.submissions
    where id = any(submission_ids)
    for update
  ) as locked_submissions;

  if current_submission_count <> expected_submission_count then
    raise exception 'Export package contains unknown submissions';
  end if;

  select *
  into persisted_batch
  from public.export_batches
  where idempotency_key = batch_record.idempotency_key;

  duplicate_batch := persisted_batch.id is not null;

  if not duplicate_batch and exists (
    select 1
    from public.submissions
    where id = any(submission_ids)
      and status not in ('accepted', 'ready_for_excel')
  ) then
    raise exception 'Only accepted or Excel-ready submissions can be exported';
  end if;

  if duplicate_batch and exists (
    select 1
    from public.submissions
    where id = any(submission_ids)
      and status not in ('accepted', 'ready_for_excel', 'exported')
  ) then
    raise exception 'Duplicate export packages can only converge accepted, Excel-ready, or exported submissions';
  end if;

  if exists (
    select 1
    from (
      select
        count(distinct city) as city_count,
        count(distinct travel_date) as travel_date_count
      from public.submissions
      where id = any(submission_ids)
    ) as group_shape
    where group_shape.city_count <> 1
      or group_shape.travel_date_count <> 1
  ) then
    raise exception 'Export package cannot mix city or travel date';
  end if;

  select count(*)
  into cockpit_snapshot_count
  from public.submissions s
  where s.id = any(submission_ids)
    and s.family_intelligence ? 'v19CockpitSnapshot';

  if cockpit_snapshot_count not in (0, current_submission_count) then
    raise exception 'Export package cannot mix cockpit snapshot and normalized submissions';
  end if;

  if cockpit_snapshot_count = current_submission_count then
    select count(*)
    into current_applicant_count
    from public.submissions s
    cross join lateral (
      select s.family_intelligence -> 'v19CockpitSnapshot' -> 'submission' as snapshot
    ) as cockpit
    cross join lateral jsonb_array_elements(
      coalesce(cockpit.snapshot -> 'applicants', '[]'::jsonb)
    ) as applicant(value)
    where s.id = any(submission_ids);

    if current_applicant_count <> batch_record.row_count then
      raise exception 'Export package row count does not match current cockpit applicants';
    end if;

    if exists (
      select 1
      from public.submissions s
      cross join lateral (
        select s.family_intelligence -> 'v19CockpitSnapshot' -> 'submission' as snapshot
      ) as cockpit
      where s.id = any(submission_ids)
        and (
          cockpit.snapshot is null
          or cockpit.snapshot ->> 'status' not in ('ready_for_export', 'exported')
          or coalesce(cockpit.snapshot ->> 'exportState', '') not in ('file_downloaded', 'marked_exported')
        )
    ) then
      raise exception 'Cockpit snapshot is not ready for export completion';
    end if;

    if exists (
      select 1
      from public.submissions s
      cross join lateral (
        select s.family_intelligence -> 'v19CockpitSnapshot' -> 'submission' as snapshot
      ) as cockpit
      cross join lateral jsonb_array_elements(
        coalesce(cockpit.snapshot -> 'issues', '[]'::jsonb)
      ) as issue(value)
      where s.id = any(submission_ids)
        and issue.value ->> 'severity' = 'blocker'
        and issue.value ->> 'status' = 'open'
    ) then
      raise exception 'Blocking cockpit issues must be closed before export';
    end if;

    if exists (
      select 1
      from public.submissions s
      cross join lateral (
        select s.family_intelligence -> 'v19CockpitSnapshot' -> 'submission' as snapshot
      ) as cockpit
      cross join lateral jsonb_array_elements(
        coalesce(cockpit.snapshot -> 'applicants', '[]'::jsonb)
      ) as applicant(value)
      where s.id = any(submission_ids)
        and (
          select count(distinct file.value ->> 'type')
          from jsonb_array_elements(
            coalesce(cockpit.snapshot -> 'files', '[]'::jsonb)
          ) as file(value)
          where file.value ->> 'applicantId' = applicant.value ->> 'id'
            and file.value ->> 'status' = 'accepted'
            and file.value ->> 'type' in ('selfie', 'selfie_2', 'passport_scan')
        ) <> 3
    ) then
      raise exception 'All cockpit applicant files must be accepted before export';
    end if;

    if exists (
      select 1
      from public.submissions s
      cross join lateral (
        select s.family_intelligence -> 'v19CockpitSnapshot' -> 'submission' as snapshot
      ) as cockpit
      cross join lateral (
        select cockpit.snapshot -> 'exportPackage' as export_package
      ) as export_identity
      where s.id = any(submission_ids)
        and (
          jsonb_typeof(export_identity.export_package) is distinct from 'object'
          or export_identity.export_package ->> 'contentFingerprint' is distinct from batch_record.content_fingerprint
          or export_identity.export_package ->> 'format' is distinct from batch_record.format
          or export_identity.export_package ->> 'fileName' is distinct from batch_record.file_name
          or export_identity.export_package ->> 'idempotencyKey' is distinct from batch_record.idempotency_key
          or case
            when export_identity.export_package ->> 'rowCount' ~ '^[0-9]+$'
              then (export_identity.export_package ->> 'rowCount')::integer = batch_record.row_count
            else false
          end is not true
          or (
            select array_agg(id_value order by id_value)
            from jsonb_array_elements_text(
              case
                when jsonb_typeof(export_identity.export_package -> 'submissionIds') = 'array'
                  then export_identity.export_package -> 'submissionIds'
                else '[]'::jsonb
              end
            ) as package_ids(id_value)
            where btrim(id_value) <> ''
          ) is distinct from submission_ids
        )
    ) then
      raise exception 'Export package content fingerprint does not match current cockpit snapshot';
    end if;
  else
    select count(*)
    into current_applicant_count
    from public.applicants
    where submission_id = any(submission_ids);

    if current_applicant_count <> batch_record.row_count then
      raise exception 'Export package row count does not match current applicants';
    end if;

    if exists (
      select 1
      from public.corrections
      where submission_id = any(submission_ids)
        and severity = 'blocking'
        and status = 'open'
    ) then
      raise exception 'Blocking corrections must be closed before export';
    end if;

    if exists (
      select 1
      from public.applicants a
      where a.submission_id = any(submission_ids)
        and (
          select count(distinct m.type)
          from public.media_assets m
          where m.submission_id = a.submission_id
            and m.applicant_id = a.id
            and m.review_status = 'accepted'
            and m.type in ('photo_white', 'selfie', 'selfie_2', 'passport_scan')
        ) <> 4
    ) then
      raise exception 'All applicant media must be accepted before export';
    end if;

    if exists (
      select 1
      from public.submissions s
      where s.id = any(submission_ids)
        and s.type = 'family'
        and (
          select count(*)
          from public.applicants a
          where a.submission_id = s.id
        ) > 1
        and coalesce(s.family_intelligence ->> 'status', '') <> 'confirmed'
    ) then
      raise exception 'Family submissions must be confirmed before export';
    end if;
  end if;

  if not duplicate_batch then
    insert into public.export_batches (
      id,
      format,
      content_fingerprint,
      idempotency_key,
      file_name,
      row_count,
      submission_ids
    )
    values (
      coalesce(batch_record.id, gen_random_uuid()),
      batch_record.format,
      batch_record.content_fingerprint,
      batch_record.idempotency_key,
      batch_record.file_name,
      batch_record.row_count,
      submission_ids
    )
    on conflict (idempotency_key) where idempotency_key is not null
    do nothing
    returning *
    into persisted_batch;

    if persisted_batch.id is null then
      duplicate_batch := true;

      select *
      into persisted_batch
      from public.export_batches
      where idempotency_key = batch_record.idempotency_key;
    end if;
  end if;

  if persisted_batch.id is null then
    raise exception 'Export package could not be persisted';
  end if;

  if persisted_batch.format <> batch_record.format
    or persisted_batch.content_fingerprint is distinct from batch_record.content_fingerprint
    or persisted_batch.row_count <> batch_record.row_count
    or persisted_batch.file_name is distinct from batch_record.file_name
    or (
      select array_agg(value order by value)
      from unnest(persisted_batch.submission_ids) as existing_ids(value)
    ) <> submission_ids
  then
    raise exception 'Existing export package identity does not match payload';
  end if;

  with exportable_submissions as (
    select id, status::text as from_status
    from public.submissions
    where id = any(submission_ids)
      and status in ('accepted', 'ready_for_excel')
  ),
  changed_submissions as (
    update public.submissions as s
    set
      status = 'exported',
      exported_at = persisted_batch.created_at,
      updated_at = persisted_batch.created_at
    from exportable_submissions
    where s.id = exportable_submissions.id
    returning s.id, exportable_submissions.from_status
  )
  insert into public.status_history (
    entity_type,
    entity_id,
    from_status,
    to_status,
    comment,
    changed_by,
    changed_at
  )
  select
    'submission',
    id,
    from_status,
    'exported',
    'Заявка включена в выгрузку ' || persisted_batch.id::text || '.',
    auth.uid(),
    persisted_batch.created_at
  from changed_submissions;

  get diagnostics status_history_count = row_count;
  changed_submission_count := status_history_count;

  return jsonb_build_object(
    'exportBatch',
    jsonb_build_object(
      'id', persisted_batch.id,
      'created_by', persisted_batch.created_by,
      'created_at', persisted_batch.created_at,
      'format', persisted_batch.format,
      'content_fingerprint', persisted_batch.content_fingerprint,
      'idempotency_key', persisted_batch.idempotency_key,
      'file_name', persisted_batch.file_name,
      'row_count', persisted_batch.row_count,
      'submission_ids', persisted_batch.submission_ids
    ),
    'submissions', changed_submission_count,
    'statusHistory', status_history_count,
    'duplicate', duplicate_batch
  );
end;
$$;

revoke all on function public.complete_export_package(jsonb) from public;
grant execute on function public.complete_export_package(jsonb) to authenticated;

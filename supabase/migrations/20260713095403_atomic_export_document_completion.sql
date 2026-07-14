-- Terminal export must be an all-or-nothing server operation. Browser download
-- happens first; once this function starts, batch, audit, document assets, status
-- history, and submission status commit together or all roll back.

alter table public.document_export_events
  add column if not exists applicant_count integer,
  add column if not exists workbook_file_name text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.document_export_events'::regclass
      and conname = 'document_export_events_applicant_count_valid'
  ) then
    alter table public.document_export_events
      add constraint document_export_events_applicant_count_valid
      check (applicant_count is null or applicant_count > 0)
      not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.document_export_events'::regclass
      and conname = 'document_export_events_workbook_file_name_safe'
  ) then
    alter table public.document_export_events
      add constraint document_export_events_workbook_file_name_safe
      check (
        workbook_file_name is null
        or (
          btrim(workbook_file_name) <> ''
          and workbook_file_name = replace(replace(workbook_file_name, '/', ''), chr(92), '')
          and position('..' in workbook_file_name) = 0
        )
      )
      not valid;
  end if;
end
$$;

create unique index if not exists document_export_events_package_identity_key_uidx
on public.document_export_events (package_identity_key)
where package_identity_key is not null and btrim(package_identity_key) <> '';

create or replace function app_private.enforce_submission_export_completion_boundary()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if (
    (new.status = 'exported' and old.status <> 'exported')
    or new.exported_at is distinct from old.exported_at
  )
    and current_setting('app.visaflow_complete_export_package', true) <> 'on'
  then
    raise exception 'Exported status can only be set by complete_export_package'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_submission_export_completion_boundary() from public;

drop trigger if exists submissions_export_completion_boundary on public.submissions;
create trigger submissions_export_completion_boundary
before update of status, exported_at on public.submissions
for each row execute function app_private.enforce_submission_export_completion_boundary();

create or replace function app_private.enforce_export_status_history_boundary()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if new.entity_type = 'submission'
    and new.to_status = 'exported'
    and current_setting('app.visaflow_complete_export_package', true) <> 'on'
  then
    raise exception 'Export status history can only be written by complete_export_package'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_export_status_history_boundary() from public;

drop trigger if exists status_history_export_completion_boundary on public.status_history;
create trigger status_history_export_completion_boundary
before insert on public.status_history
for each row execute function app_private.enforce_export_status_history_boundary();

create or replace function app_private.prevent_exported_media_asset_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if (
    (tg_op = 'INSERT' and exists (
      select 1 from public.submissions submission
      where submission.id = new.submission_id and submission.status = 'exported'
    ))
    or (tg_op = 'UPDATE' and exists (
      select 1 from public.submissions submission
      where submission.id in (old.submission_id, new.submission_id)
        and submission.status = 'exported'
    ))
    or (tg_op = 'DELETE' and exists (
      select 1 from public.submissions submission
      where submission.id = old.submission_id and submission.status = 'exported'
    ))
  ) then
    raise exception 'Media assets for exported submissions are immutable'
      using errcode = '23514';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function app_private.prevent_exported_media_asset_mutation() from public;

drop trigger if exists media_assets_prevent_exported_mutation on public.media_assets;
create trigger media_assets_prevent_exported_mutation
before insert or update or delete on public.media_assets
for each row execute function app_private.prevent_exported_media_asset_mutation();

create or replace function app_private.complete_export_package_core(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
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
            and m.type in ('selfie', 'selfie_2', 'passport_scan')
        ) <> 3
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


revoke all on function app_private.complete_export_package_core(jsonb) from public;
revoke all on function app_private.complete_export_package_core(jsonb) from anon;
revoke all on function app_private.complete_export_package_core(jsonb) from authenticated;

create or replace function public.complete_export_package(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  actor_role public.profile_role := app_private.current_profile_role();
  document_record record;
  document_asset_ids uuid[];
  event_asset_ids uuid[];
  event_submission_ids text[];
  expected_document_asset_ids uuid[];
  submission_ids text[];
  provided_asset_count integer := 0;
  expected_applicant_count integer := 0;
  locked_asset_count integer := 0;
  changed_asset_count integer := 0;
  core_duplicate boolean := false;
  core_result jsonb;
  core_batch jsonb;
  event_record record;
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
  into document_record
  from jsonb_to_record(payload -> 'document_export') as document_payload (
    asset_ids jsonb,
    zip_file_name text,
    file_count integer,
    applicant_count integer,
    workbook_file_name text
  );

  if jsonb_typeof(document_record.asset_ids) <> 'array' then
    raise exception 'Export document asset ids are required';
  end if;

  provided_asset_count := jsonb_array_length(document_record.asset_ids);
  if provided_asset_count <= 0 then
    raise exception 'Export document asset ids are required';
  end if;

  select array_agg(distinct value::uuid order by value::uuid)
  into document_asset_ids
  from jsonb_array_elements_text(document_record.asset_ids) as ids(value)
  where btrim(value) <> '';

  if coalesce(array_length(document_asset_ids, 1), 0) <> provided_asset_count then
    raise exception 'Export document asset ids must be unique UUIDs';
  end if;

  if document_record.zip_file_name is null
    or btrim(document_record.zip_file_name) = ''
    or document_record.zip_file_name <> replace(replace(document_record.zip_file_name, '/', ''), chr(92), '')
    or position('..' in document_record.zip_file_name) > 0
    or lower(document_record.zip_file_name) !~ '\\.zip$'
  then
    raise exception 'Export ZIP file name is invalid';
  end if;

  if document_record.workbook_file_name is null
    or btrim(document_record.workbook_file_name) = ''
    or document_record.workbook_file_name <> replace(replace(document_record.workbook_file_name, '/', ''), chr(92), '')
    or position('..' in document_record.workbook_file_name) > 0
  then
    raise exception 'Export workbook file name is invalid';
  end if;

  if document_record.applicant_count is null or document_record.applicant_count <= 0 then
    raise exception 'Export applicant count is invalid';
  end if;

  if document_record.file_count is null or document_record.file_count <= 0 then
    raise exception 'Export document file count is invalid';
  end if;

  perform set_config('app.visaflow_complete_export_package', 'on', true);
  core_result := app_private.complete_export_package_core(payload);
  core_batch := core_result -> 'exportBatch';

  if jsonb_typeof(core_batch) is distinct from 'object' then
    raise exception 'Export package completion did not return a durable batch';
  end if;

  select array_agg(distinct value order by value)
  into submission_ids
  from jsonb_array_elements_text(core_batch -> 'submission_ids') as ids(value)
  where btrim(value) <> '';

  if coalesce(array_length(submission_ids, 1), 0) = 0 then
    raise exception 'Export package completion returned no submissions';
  end if;

  expected_applicant_count := (core_batch ->> 'row_count')::integer;
  if document_record.applicant_count <> expected_applicant_count then
    raise exception 'Export document applicant count does not match batch';
  end if;

  if document_record.file_count <> provided_asset_count + expected_applicant_count then
    raise exception 'Export ZIP file count does not match documents and visa forms';
  end if;

  if document_record.workbook_file_name is distinct from (core_batch ->> 'file_name') then
    raise exception 'Export workbook file name does not match batch';
  end if;

  select count(*)
  into locked_asset_count
  from (
    select asset.id
    from public.document_assets asset
    where asset.id = any(document_asset_ids)
    for update
  ) as locked_assets;

  if locked_asset_count <> provided_asset_count then
    raise exception 'Export package contains unknown document assets';
  end if;

  core_duplicate := coalesce((core_result ->> 'duplicate')::boolean, false);

  if core_duplicate then
    select *
    into event_record
    from public.document_export_events event
    where event.package_identity_key = (core_batch ->> 'idempotency_key')
    for update;

    if event_record.id is null then
      raise exception 'Existing export package is missing document audit proof';
    end if;

    select array_agg(value order by value)
    into event_asset_ids
    from unnest(event_record.asset_ids) as asset_ids(value);

    select array_agg(value order by value)
    into event_submission_ids
    from unnest(event_record.submission_ids) as submission_values(value);

    if event_asset_ids is distinct from document_asset_ids
      or event_submission_ids is distinct from submission_ids
      or event_record.zip_file_name is distinct from document_record.zip_file_name
      or event_record.file_count is distinct from document_record.file_count
      or event_record.applicant_count is distinct from document_record.applicant_count
      or event_record.workbook_file_name is distinct from document_record.workbook_file_name
    then
      raise exception 'Existing export document audit identity does not match payload';
    end if;

    select array_agg(asset.id order by asset.id)
    into expected_document_asset_ids
    from public.document_assets asset
    where asset.submission_id = any(submission_ids)
      and asset.upload_status = 'uploaded'
      and asset.validation_status = 'passed'
      and asset.export_status = 'exported';

    if coalesce(expected_document_asset_ids, '{}'::uuid[]) is distinct from document_asset_ids
      or exists (
        select 1
        from public.document_assets asset
        where asset.id = any(document_asset_ids)
          and (
            asset.submission_id <> all(submission_ids)
            or asset.upload_status <> 'uploaded'
            or asset.validation_status <> 'passed'
            or asset.export_status <> 'exported'
          )
      )
    then
      raise exception 'Existing exported document assets do not match batch';
    end if;
  else
    select array_agg(asset.id order by asset.id)
    into expected_document_asset_ids
    from public.document_assets asset
    where asset.submission_id = any(submission_ids)
      and asset.upload_status = 'uploaded'
      and asset.validation_status = 'passed'
      and asset.export_status = 'ready';

    if coalesce(expected_document_asset_ids, '{}'::uuid[]) is distinct from document_asset_ids
      or coalesce(array_length(expected_document_asset_ids, 1), 0) <> expected_applicant_count * 3
    then
      raise exception 'Export document assets must exactly match three ready documents per applicant';
    end if;

    if exists (
      select 1
      from public.document_export_events event
      where event.package_identity_key = (core_batch ->> 'idempotency_key')
    ) then
      raise exception 'Existing document audit conflicts with new export batch';
    end if;

    insert into public.document_export_events (
      event_type,
      submission_ids,
      asset_ids,
      zip_file_name,
      file_count,
      applicant_count,
      workbook_file_name,
      package_identity_key,
      created_by
    )
    values (
      'DOCUMENT_EXPORT_CREATED',
      submission_ids,
      document_asset_ids,
      document_record.zip_file_name,
      document_record.file_count,
      document_record.applicant_count,
      document_record.workbook_file_name,
      core_batch ->> 'idempotency_key',
      auth.uid()
    )
    returning * into event_record;

    update public.document_assets asset
    set export_status = 'exported'
    where asset.id = any(document_asset_ids)
      and asset.submission_id = any(submission_ids)
      and asset.upload_status = 'uploaded'
      and asset.validation_status = 'passed'
      and asset.export_status = 'ready';

    get diagnostics changed_asset_count = row_count;
    if changed_asset_count <> provided_asset_count then
      raise exception 'Export document assets did not transition atomically';
    end if;
  end if;

  return core_result || jsonb_build_object(
    'documentExport',
    jsonb_build_object(
      'id', event_record.id,
      'asset_ids', document_asset_ids,
      'zip_file_name', document_record.zip_file_name,
      'file_count', document_record.file_count,
      'applicant_count', document_record.applicant_count,
      'workbook_file_name', document_record.workbook_file_name
    )
  );
end;
$$;

revoke all on function public.complete_export_package(jsonb) from public;
revoke all on function public.complete_export_package(jsonb) from anon;
revoke all on function public.complete_export_package(jsonb) from authenticated;
grant execute on function public.complete_export_package(jsonb) to authenticated;

drop policy if exists "document assets admin export update" on public.document_assets;
revoke all on table public.document_assets from public;
revoke all on table public.document_assets from anon;
revoke all on table public.document_assets from authenticated;
revoke update (export_status) on table public.document_assets from authenticated;
grant select on table public.document_assets to authenticated;

drop policy if exists "document export events admin only" on public.document_export_events;
create policy "document export events admin read"
on public.document_export_events for select
to authenticated
using ((select app_private.current_profile_role()) = 'admin');
revoke all on table public.document_export_events from public;
revoke all on table public.document_export_events from anon;
revoke all on table public.document_export_events from authenticated;
grant select on table public.document_export_events to authenticated;

revoke all on table public.export_batches from public;
revoke all on table public.export_batches from anon;
revoke all on table public.export_batches from authenticated;
grant select on table public.export_batches to authenticated;

comment on function public.complete_export_package(jsonb) is
  'Atomic admin-only terminal export: batch, document audit, document markers, submission status, and status history commit together.';

-- Export batches are immutable after completion. Starting a return package
-- only needs a consistent read, not UPDATE privilege on the terminal batch.
create or replace function public.start_agent_return_package(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, app_private
as $$
declare
  actor_role public.profile_role := app_private.current_profile_role();
  export_package_key text := btrim(coalesce(payload ->> 'exportPackageKey', ''));
  target_agent_id uuid;
  batch_record public.export_batches%rowtype;
  package_record public.agent_return_packages%rowtype;
  expected_city text;
  expected_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authenticated user required to start a return package'
      using errcode = '28000';
  end if;

  if actor_role <> 'admin' then
    raise exception 'Only admins can start return packages'
      using errcode = '42501';
  end if;

  if export_package_key = '' then
    raise exception 'Export package key is required';
  end if;

  begin
    target_agent_id := (payload ->> 'agentId')::uuid;
  exception when invalid_text_representation then
    raise exception 'Agent id is invalid';
  end;

  select *
  into batch_record
  from public.export_batches
  where idempotency_key = export_package_key;

  if batch_record.id is null then
    raise exception 'Export package was not found';
  end if;

  if exists (
    select 1
    from public.export_batch_members member
    join public.submissions submission
      on submission.id = member.submission_id
    where member.export_batch_id = batch_record.id
      and member.source_agent_id = target_agent_id
      and submission.status is distinct from 'exported'
  ) then
    raise exception 'Export source is not fully exported for this agent';
  end if;

  select min(member.city), count(*)
  into expected_city, expected_count
  from public.export_batch_members member
  where member.export_batch_id = batch_record.id
    and member.source_agent_id = target_agent_id;

  if expected_count = 0 then
    raise exception 'No exported tourists are assigned to this agent in the export package';
  end if;

  select *
  into package_record
  from public.agent_return_packages
  where export_batch_id = batch_record.id
    and agent_id = target_agent_id
  for update;

  if package_record.id is null then
    insert into public.agent_return_packages (
      export_batch_id,
      agent_id,
      city,
      status,
      created_by
    )
    values (
      batch_record.id,
      target_agent_id,
      expected_city,
      'draft',
      auth.uid()
    )
    on conflict (export_batch_id, agent_id) do nothing
    returning * into package_record;

    if package_record.id is null then
      select *
      into package_record
      from public.agent_return_packages
      where export_batch_id = batch_record.id
        and agent_id = target_agent_id
      for update;
    end if;
  end if;

  return jsonb_build_object(
    'id', package_record.id,
    'exportBatchId', package_record.export_batch_id,
    'agentId', package_record.agent_id,
    'city', package_record.city,
    'status', package_record.status,
    'applicantCount', expected_count
  );
end;
$$;

create or replace function public.publish_agent_return_package(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, app_private
as $$
declare
  actor_role public.profile_role := app_private.current_profile_role();
  target_package_id uuid;
  package_record public.agent_return_packages%rowtype;
  expected_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authenticated user required to publish a return package'
      using errcode = '28000';
  end if;

  if actor_role <> 'admin' then
    raise exception 'Only admins can publish return packages'
      using errcode = '42501';
  end if;

  begin
    target_package_id := (payload ->> 'returnPackageId')::uuid;
  exception when invalid_text_representation then
    raise exception 'Return package id is invalid';
  end;

  select *
  into package_record
  from public.agent_return_packages
  where id = target_package_id
  for update;

  if package_record.id is null then
    raise exception 'Return package was not found';
  end if;

  select count(*)
  into expected_count
  from public.export_batch_members
  where export_batch_id = package_record.export_batch_id
    and source_agent_id = package_record.agent_id;

  if package_record.status = 'published' then
    return jsonb_build_object(
      'id', package_record.id,
      'status', package_record.status,
      'artifactCount', expected_count + 1,
      'duplicate', true
    );
  end if;

  update public.agent_return_packages
  set
    status = 'published',
    published_by = auth.uid(),
    published_at = now()
  where id = package_record.id
  returning * into package_record;

  return jsonb_build_object(
    'id', package_record.id,
    'status', package_record.status,
    'artifactCount', expected_count + 1,
    'duplicate', false
  );
end;
$$;

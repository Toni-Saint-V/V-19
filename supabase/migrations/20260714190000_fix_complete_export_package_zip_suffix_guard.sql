-- Forward-only repair for the deployed ZIP suffix guard.
-- With standard_conforming_strings=on, the previous double-escaped regex
-- required a literal backslash even though the adjacent path guard forbids it.
-- Keep the current RPC body and privileges unchanged apart from using a
-- literal, case-insensitive suffix comparison.
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
    or right(lower(document_record.zip_file_name), 4) <> '.zip'
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

-- Keep terminal T9 bound to the exact reviewed Excel + private-media identity.
-- This is a definition-only hardening: it does not rewrite existing batches
-- or broaden any browser role privilege.
do $migration$
declare
  core_definition text;
  wrapper_definition text;
  safe_admin_guard constant text :=
    'if actor_role is distinct from ''admin'' then';
  unsafe_admin_guard constant text :=
    'if actor_role <> ''admin'' then';
  cockpit_identity_check constant text :=
    'export_identity.export_package ->> ''contentFingerprint'' is distinct from batch_record.content_fingerprint';

  legacy_format_guard constant text := $fragment$
  if batch_record.format not in ('xlsx', 'csv') then
    raise exception 'Export package format is invalid';
  end if;
$fragment$;
  hardened_format_guard constant text := $fragment$
  if batch_record.format is distinct from 'xlsx' then
    raise exception 'Export package format must be xlsx';
  end if;
$fragment$;

  legacy_batch_file_guard constant text := $fragment$
  if batch_record.file_name is null or btrim(batch_record.file_name) = '' then
    raise exception 'Export package file name is required';
  end if;
$fragment$;
  hardened_batch_file_guard constant text := $fragment$
  if batch_record.file_name is null
    or btrim(batch_record.file_name) = ''
    or batch_record.file_name <> replace(replace(batch_record.file_name, '/', ''), chr(92), '')
    or position('..' in batch_record.file_name) > 0
    or right(lower(batch_record.file_name), 5) <> '.xlsx'
  then
    raise exception 'Export package XLSX file name is invalid';
  end if;
$fragment$;

  legacy_snapshot_guard constant text := $fragment$
  if cockpit_snapshot_count not in (0, current_submission_count) then
    raise exception 'Export package cannot mix cockpit snapshot and normalized submissions';
  end if;
$fragment$;
  hardened_snapshot_guard constant text := $fragment$
  if cockpit_snapshot_count is distinct from current_submission_count then
    raise exception 'Export package requires a canonical cockpit snapshot for every submission';
  end if;
$fragment$;

  legacy_workbook_guard constant text := $fragment$
  if document_record.workbook_file_name is null
    or btrim(document_record.workbook_file_name) = ''
    or document_record.workbook_file_name <> replace(replace(document_record.workbook_file_name, '/', ''), chr(92), '')
    or position('..' in document_record.workbook_file_name) > 0
  then
    raise exception 'Export workbook file name is invalid';
  end if;
$fragment$;
  hardened_workbook_guard constant text := $fragment$
  if document_record.workbook_file_name is null
    or btrim(document_record.workbook_file_name) = ''
    or document_record.workbook_file_name <> replace(replace(document_record.workbook_file_name, '/', ''), chr(92), '')
    or position('..' in document_record.workbook_file_name) > 0
    or right(lower(document_record.workbook_file_name), 5) <> '.xlsx'
  then
    raise exception 'Export workbook XLSX file name is invalid';
  end if;
$fragment$;

  legacy_storage_declarations constant text := $fragment$
  locked_asset_count integer := 0;
  changed_asset_count integer := 0;
$fragment$;
  hardened_storage_declarations constant text := $fragment$
  locked_asset_count integer := 0;
  locked_storage_match_count integer := 0;
  locked_storage_object_count integer := 0;
  changed_asset_count integer := 0;
$fragment$;

  legacy_storage_anchor constant text := $fragment$
  if locked_asset_count <> provided_asset_count then
    raise exception 'Export package contains unknown document assets';
  end if;

  core_duplicate := coalesce((core_result ->> 'duplicate')::boolean, false);
$fragment$;
  hardened_storage_anchor constant text := $fragment$
  if locked_asset_count <> provided_asset_count then
    raise exception 'Export package contains unknown document assets';
  end if;

  select
    count(*),
    count(distinct locked_object.object_id)
  into
    locked_storage_match_count,
    locked_storage_object_count
  from (
    select
      asset.id as asset_id,
      storage_object.id as object_id
    from public.document_assets as asset
    join storage.objects as storage_object
      on storage_object.bucket_id = asset.bucket
      and storage_object.name = asset.storage_path
    where asset.id = any(document_asset_ids)
      and asset.bucket = 'submission-media'
    for key share of storage_object
  ) as locked_object;

  if locked_storage_match_count <> provided_asset_count
    or locked_storage_object_count <> provided_asset_count
  then
    raise exception 'Export package Storage objects do not match document assets';
  end if;

  core_duplicate := coalesce((core_result ->> 'duplicate')::boolean, false);
$fragment$;

  required_ready_query constant text := $fragment$
    from public.document_assets asset
    where asset.submission_id = any(submission_ids)
      and asset.upload_status = 'uploaded'
      and asset.validation_status = 'passed'
      and asset.export_status = 'ready'
      and (
        asset.type = 'passport_scan'
        or (
          asset.type in ('selfie_1', 'selfie_2')
          and asset.applicant_id = app_private.primary_applicant_id(asset.submission_id)
        )
      );
$fragment$;
  required_asset_count_guard constant text :=
    'coalesce(array_length(expected_document_asset_ids, 1), 0) <> expected_applicant_count + (coalesce(array_length(submission_ids, 1), 0) * 2)';
  media_only_file_count_guard constant text :=
    'if document_record.file_count <> provided_asset_count then';
begin
  select pg_catalog.pg_get_functiondef(
    'app_private.complete_export_package_core(jsonb)'::regprocedure::oid
  )
  into core_definition;

  select pg_catalog.pg_get_functiondef(
    'public.complete_export_package(jsonb)'::regprocedure::oid
  )
  into wrapper_definition;

  if core_definition is null
    or wrapper_definition is null
    or (
      length(core_definition)
      - length(replace(core_definition, safe_admin_guard, ''))
    ) / length(safe_admin_guard) <> 1
    or (
      length(wrapper_definition)
      - length(replace(wrapper_definition, safe_admin_guard, ''))
    ) / length(safe_admin_guard) <> 1
    or position(unsafe_admin_guard in core_definition) > 0
    or position(unsafe_admin_guard in wrapper_definition) > 0
    or (
      length(core_definition)
      - length(replace(core_definition, cockpit_identity_check, ''))
    ) / length(cockpit_identity_check) <> 1
    or (
      length(wrapper_definition)
      - length(replace(wrapper_definition, required_ready_query, ''))
    ) / length(required_ready_query) <> 1
    or (
      length(wrapper_definition)
      - length(replace(wrapper_definition, required_asset_count_guard, ''))
    ) / length(required_asset_count_guard) <> 1
    or (
      length(wrapper_definition)
      - length(replace(wrapper_definition, media_only_file_count_guard, ''))
    ) / length(media_only_file_count_guard) <> 1
  then
    raise exception 'T9 functions do not match the reviewed pre-hardening authority';
  end if;

  if
    (
      length(core_definition)
      - length(replace(core_definition, legacy_format_guard, ''))
    ) / length(legacy_format_guard) = 1
    and position(hardened_format_guard in core_definition) = 0
    and (
      length(core_definition)
      - length(replace(core_definition, legacy_batch_file_guard, ''))
    ) / length(legacy_batch_file_guard) = 1
    and position(hardened_batch_file_guard in core_definition) = 0
    and (
      length(core_definition)
      - length(replace(core_definition, legacy_snapshot_guard, ''))
    ) / length(legacy_snapshot_guard) = 1
    and position(hardened_snapshot_guard in core_definition) = 0
  then
    core_definition := replace(
      core_definition,
      legacy_format_guard,
      hardened_format_guard
    );
    core_definition := replace(
      core_definition,
      legacy_batch_file_guard,
      hardened_batch_file_guard
    );
    core_definition := replace(
      core_definition,
      legacy_snapshot_guard,
      hardened_snapshot_guard
    );
  elsif
    position(legacy_format_guard in core_definition) = 0
    and (
      length(core_definition)
      - length(replace(core_definition, hardened_format_guard, ''))
    ) / length(hardened_format_guard) = 1
    and position(legacy_batch_file_guard in core_definition) = 0
    and (
      length(core_definition)
      - length(replace(core_definition, hardened_batch_file_guard, ''))
    ) / length(hardened_batch_file_guard) = 1
    and position(legacy_snapshot_guard in core_definition) = 0
    and (
      length(core_definition)
      - length(replace(core_definition, hardened_snapshot_guard, ''))
    ) / length(hardened_snapshot_guard) = 1
  then
    null;
  else
    raise exception 'T9 core does not match one complete reviewed identity state';
  end if;

  if
    (
      length(wrapper_definition)
      - length(replace(wrapper_definition, legacy_workbook_guard, ''))
    ) / length(legacy_workbook_guard) = 1
    and position(hardened_workbook_guard in wrapper_definition) = 0
    and (
      length(wrapper_definition)
      - length(replace(wrapper_definition, legacy_storage_declarations, ''))
    ) / length(legacy_storage_declarations) = 1
    and position(hardened_storage_declarations in wrapper_definition) = 0
    and (
      length(wrapper_definition)
      - length(replace(wrapper_definition, legacy_storage_anchor, ''))
    ) / length(legacy_storage_anchor) = 1
    and position(hardened_storage_anchor in wrapper_definition) = 0
  then
    wrapper_definition := replace(
      wrapper_definition,
      legacy_workbook_guard,
      hardened_workbook_guard
    );
    wrapper_definition := replace(
      wrapper_definition,
      legacy_storage_declarations,
      hardened_storage_declarations
    );
    wrapper_definition := replace(
      wrapper_definition,
      legacy_storage_anchor,
      hardened_storage_anchor
    );
  elsif
    position(legacy_workbook_guard in wrapper_definition) = 0
    and (
      length(wrapper_definition)
      - length(replace(wrapper_definition, hardened_workbook_guard, ''))
    ) / length(hardened_workbook_guard) = 1
    and position(legacy_storage_declarations in wrapper_definition) = 0
    and (
      length(wrapper_definition)
      - length(replace(wrapper_definition, hardened_storage_declarations, ''))
    ) / length(hardened_storage_declarations) = 1
    and position(legacy_storage_anchor in wrapper_definition) = 0
    and (
      length(wrapper_definition)
      - length(replace(wrapper_definition, hardened_storage_anchor, ''))
    ) / length(hardened_storage_anchor) = 1
  then
    null;
  else
    raise exception 'T9 wrapper does not match one complete reviewed storage state';
  end if;

  if position(legacy_format_guard in core_definition) > 0
    or position(legacy_batch_file_guard in core_definition) > 0
    or position(legacy_snapshot_guard in core_definition) > 0
    or position(legacy_workbook_guard in wrapper_definition) > 0
    or position(legacy_storage_declarations in wrapper_definition) > 0
    or position(legacy_storage_anchor in wrapper_definition) > 0
    or (
      length(core_definition)
      - length(replace(core_definition, hardened_format_guard, ''))
    ) / length(hardened_format_guard) <> 1
    or (
      length(core_definition)
      - length(replace(core_definition, hardened_batch_file_guard, ''))
    ) / length(hardened_batch_file_guard) <> 1
    or (
      length(core_definition)
      - length(replace(core_definition, hardened_snapshot_guard, ''))
    ) / length(hardened_snapshot_guard) <> 1
    or (
      length(wrapper_definition)
      - length(replace(wrapper_definition, hardened_workbook_guard, ''))
    ) / length(hardened_workbook_guard) <> 1
    or (
      length(wrapper_definition)
      - length(replace(wrapper_definition, hardened_storage_declarations, ''))
    ) / length(hardened_storage_declarations) <> 1
    or (
      length(wrapper_definition)
      - length(replace(wrapper_definition, hardened_storage_anchor, ''))
    ) / length(hardened_storage_anchor) <> 1
  then
    raise exception 'T9 server authority could not be restored safely';
  end if;

  execute core_definition;
  execute wrapper_definition;
end;
$migration$;

revoke all on function app_private.complete_export_package_core(jsonb)
  from public, anon, authenticated;
revoke all on function public.complete_export_package(jsonb)
  from public, anon, authenticated;
grant execute on function public.complete_export_package(jsonb)
  to authenticated;

comment on function app_private.complete_export_package_core(jsonb) is
  'Canonical-snapshot-only atomic T9 core with exact XLSX package identity.';
comment on function public.complete_export_package(jsonb) is
  'Atomic Admin T9: exact XLSX identity, media-only ZIP assets, and locked private Storage object proof.';

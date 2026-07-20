-- Keep terminal export completion aligned with the media-only ZIP artifact.
-- The reviewed wrapper already validates the exact passport/selfie asset set;
-- file_count therefore counts those unique media assets only and must not add
-- one generated visa-form PDF per applicant.
do $migration$
declare
  function_definition text;
  legacy_file_count_guard constant text :=
    'if document_record.file_count <> provided_asset_count + expected_applicant_count then';
  media_only_file_count_guard constant text :=
    'if document_record.file_count <> provided_asset_count then';
  legacy_file_count_error constant text :=
    'Export ZIP file count does not match documents and visa forms';
  media_only_file_count_error constant text :=
    'Export ZIP file count must match exported media assets';
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
  required_asset_error constant text :=
    'Export document assets must exactly match the primary/secondary passport media policy';
  safe_admin_guard constant text :=
    'if actor_role is distinct from ''admin'' then';
  unsafe_admin_guard constant text :=
    'if actor_role <> ''admin'' then';
begin
  select pg_catalog.pg_get_functiondef(
    'public.complete_export_package(jsonb)'::regprocedure::oid
  )
  into function_definition;

  if function_definition is null
    or (length(function_definition) - length(replace(function_definition, safe_admin_guard, '')))
      / length(safe_admin_guard) <> 1
    or position(unsafe_admin_guard in function_definition) > 0
    or (length(function_definition) - length(replace(function_definition, required_ready_query, '')))
      / length(required_ready_query) <> 1
    or (length(function_definition) - length(replace(function_definition, required_asset_count_guard, '')))
      / length(required_asset_count_guard) <> 1
    or (length(function_definition) - length(replace(function_definition, required_asset_error, '')))
      / length(required_asset_error) <> 1
  then
    raise exception 'Deployed complete_export_package wrapper does not match the reviewed passport media contract';
  end if;

  if
    (length(function_definition) - length(replace(function_definition, legacy_file_count_guard, '')))
      / length(legacy_file_count_guard) = 1
    and (length(function_definition) - length(replace(function_definition, legacy_file_count_error, '')))
      / length(legacy_file_count_error) = 1
    and position(media_only_file_count_guard in function_definition) = 0
    and position(media_only_file_count_error in function_definition) = 0
  then
    function_definition := replace(
      function_definition,
      legacy_file_count_guard,
      media_only_file_count_guard
    );
    function_definition := replace(
      function_definition,
      legacy_file_count_error,
      media_only_file_count_error
    );
  elsif
    position(legacy_file_count_guard in function_definition) = 0
    and position(legacy_file_count_error in function_definition) = 0
    and (length(function_definition) - length(replace(function_definition, media_only_file_count_guard, '')))
      / length(media_only_file_count_guard) = 1
    and (length(function_definition) - length(replace(function_definition, media_only_file_count_error, '')))
      / length(media_only_file_count_error) = 1
  then
    null;
  else
    raise exception 'Deployed complete_export_package wrapper does not match one reviewed file-count contract';
  end if;

  if position(unsafe_admin_guard in function_definition) > 0
    or (length(function_definition) - length(replace(function_definition, safe_admin_guard, '')))
      / length(safe_admin_guard) <> 1
    or position(legacy_file_count_guard in function_definition) > 0
    or position(legacy_file_count_error in function_definition) > 0
    or (length(function_definition) - length(replace(function_definition, media_only_file_count_guard, '')))
      / length(media_only_file_count_guard) <> 1
    or (length(function_definition) - length(replace(function_definition, media_only_file_count_error, '')))
      / length(media_only_file_count_error) <> 1
  then
    raise exception 'Media-only export file-count contract could not be restored safely';
  end if;

  execute function_definition;
end;
$migration$;

revoke all on function public.complete_export_package(jsonb) from public, anon, authenticated;
grant execute on function public.complete_export_package(jsonb) to authenticated;

comment on function public.complete_export_package(jsonb) is
  'Atomic null-safe admin export with exact passport/selfie media assets; file_count counts media only.';

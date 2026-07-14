-- Forward-only repair for a legacy export completed by the pre-atomic RPC.
-- It never creates an export batch, changes a submission status, or adds status
-- history. It can only fill the missing document audit and markers after exact
-- terminal facts have been re-derived and locked on the server.

create or replace function public.repair_incomplete_export_document_completion(
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  actor_role public.profile_role := app_private.current_profile_role();
  normalized_key text := btrim(coalesce(p_idempotency_key, ''));
  batch_record public.export_batches%rowtype;
  event_record record;
  submission_ids text[];
  event_submission_ids text[];
  document_asset_ids uuid[];
  event_asset_ids uuid[];
  exported_document_asset_ids uuid[];
  expected_submission_count integer := 0;
  locked_submission_count integer := 0;
  locked_applicant_count integer := 0;
  locked_document_asset_count integer := 0;
  matching_history_count integer := 0;
  matching_history_submission_count integer := 0;
  changed_document_asset_count integer := 0;
  expected_zip_file_name text;
  expected_file_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authenticated user required to repair export completion'
      using errcode = '28000';
  end if;

  if actor_role <> 'admin' then
    raise exception 'Only admins can repair export completion'
      using errcode = '42501';
  end if;

  if normalized_key = '' then
    raise exception 'Export package idempotency key is required';
  end if;

  select *
  into batch_record
  from public.export_batches
  where idempotency_key = normalized_key
  for update;

  if batch_record.id is null then
    raise exception 'Export package was not found';
  end if;

  if batch_record.format <> 'xlsx'
    or batch_record.row_count <= 0
    or batch_record.content_fingerprint is null
    or btrim(batch_record.content_fingerprint) = ''
    or batch_record.file_name is distinct from format('visaflow-export-%s.xlsx', normalized_key)
  then
    raise exception 'Export package is not eligible for document completion repair';
  end if;

  select array_agg(distinct value order by value)
  into submission_ids
  from unnest(batch_record.submission_ids) as batch_submissions(value)
  where btrim(value) <> '';

  expected_submission_count := coalesce(array_length(submission_ids, 1), 0);
  if expected_submission_count = 0
    or expected_submission_count <> coalesce(array_length(batch_record.submission_ids, 1), 0)
  then
    raise exception 'Export package submission ids are invalid';
  end if;

  select count(*)
  into locked_submission_count
  from (
    select submission.id
    from public.submissions submission
    where submission.id = any(submission_ids)
    for update
  ) as locked_submissions;

  if locked_submission_count <> expected_submission_count then
    raise exception 'Export package contains unknown submissions';
  end if;

  if exists (
    select 1
    from public.submissions submission
    where submission.id = any(submission_ids)
      and (
        submission.status is distinct from 'exported'
        or submission.exported_at is distinct from batch_record.created_at
      )
  ) then
    raise exception 'Export package submissions are not in the exact terminal state';
  end if;

  select count(*), count(distinct history.entity_id)
  into matching_history_count, matching_history_submission_count
  from (
    select entity_id
    from public.status_history
    where entity_type = 'submission'
      and entity_id = any(submission_ids)
      and from_status in ('accepted', 'ready_for_excel')
      and to_status = 'exported'
      and comment = 'Заявка включена в выгрузку ' || batch_record.id::text || '.'
      and changed_at = batch_record.created_at
    for update
  ) as history;

  if matching_history_count <> expected_submission_count
    or matching_history_submission_count <> expected_submission_count
  then
    raise exception 'Export package status history is not eligible for document completion repair';
  end if;

  select count(*)
  into locked_applicant_count
  from (
    select applicant.id
    from public.applicants applicant
    where applicant.submission_id = any(submission_ids)
    for update
  ) as locked_applicants;

  if locked_applicant_count <> batch_record.row_count then
    raise exception 'Export package applicant count does not match batch';
  end if;

  select array_agg(locked_document.id order by locked_document.id), count(*)
  into document_asset_ids, locked_document_asset_count
  from (
    select document.id
    from public.document_assets document
    where document.submission_id = any(submission_ids)
    for update
  ) as locked_document;

  if locked_document_asset_count <> batch_record.row_count * 3
    or coalesce(array_length(document_asset_ids, 1), 0) <> batch_record.row_count * 3
  then
    raise exception 'Export package does not contain exactly three documents per applicant';
  end if;

  if exists (
    select 1
    from public.applicants applicant
    where applicant.submission_id = any(submission_ids)
      and (
        select count(*)
        from public.document_assets document
        where document.submission_id = applicant.submission_id
          and document.applicant_id = applicant.id
          and document.type in ('passport_scan', 'selfie_1', 'selfie_2')
      ) <> 3
  ) then
    raise exception 'Export package document set is not aligned to applicants';
  end if;

  if exists (
    select 1
    from public.document_assets document
    where document.id = any(document_asset_ids)
      and (
        document.upload_status <> 'uploaded'
        or document.validation_status <> 'passed'
        or document.export_status not in ('ready', 'exported')
      )
  ) then
    raise exception 'Export package document states are not eligible for repair';
  end if;

  expected_zip_file_name := format(
    'visaflow-export-%s_documents.zip',
    normalized_key
  );
  expected_file_count := locked_document_asset_count + locked_applicant_count;

  select *
  into event_record
  from public.document_export_events event
  where event.package_identity_key = normalized_key
  for update;

  if event_record.id is not null then
    select array_agg(value order by value)
    into event_submission_ids
    from unnest(event_record.submission_ids) as event_submissions(value);

    select array_agg(value order by value)
    into event_asset_ids
    from unnest(event_record.asset_ids) as event_assets(value);

    select array_agg(document.id order by document.id)
    into exported_document_asset_ids
    from public.document_assets document
    where document.id = any(document_asset_ids)
      and document.upload_status = 'uploaded'
      and document.validation_status = 'passed'
      and document.export_status = 'exported';

    if event_submission_ids is distinct from submission_ids
      or event_asset_ids is distinct from document_asset_ids
      or event_record.zip_file_name is distinct from expected_zip_file_name
      or event_record.file_count is distinct from expected_file_count
      or event_record.applicant_count is distinct from locked_applicant_count
      or event_record.workbook_file_name is distinct from batch_record.file_name
      or exported_document_asset_ids is distinct from document_asset_ids
    then
      raise exception 'Existing document export audit does not match terminal package';
    end if;

    return jsonb_build_object(
      'exportBatchId', batch_record.id,
      'documentExportId', event_record.id,
      'repaired', false
    );
  end if;

  if exists (
    select 1
    from public.document_assets document
    where document.id = any(document_asset_ids)
      and document.export_status <> 'ready'
  ) then
    raise exception 'Incomplete export document states are mixed and cannot be repaired';
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
    expected_zip_file_name,
    expected_file_count,
    locked_applicant_count,
    batch_record.file_name,
    normalized_key,
    auth.uid()
  )
  returning * into event_record;

  update public.document_assets document
  set export_status = 'exported'
  where document.id = any(document_asset_ids)
    and document.upload_status = 'uploaded'
    and document.validation_status = 'passed'
    and document.export_status = 'ready';

  get diagnostics changed_document_asset_count = row_count;
  if changed_document_asset_count <> locked_document_asset_count then
    raise exception 'Incomplete export document markers did not transition atomically';
  end if;

  return jsonb_build_object(
    'exportBatchId', batch_record.id,
    'documentExportId', event_record.id,
    'repaired', true
  );
end;
$$;

revoke all on function public.repair_incomplete_export_document_completion(text) from public;
revoke all on function public.repair_incomplete_export_document_completion(text) from anon;
revoke all on function public.repair_incomplete_export_document_completion(text) from authenticated;
grant execute on function public.repair_incomplete_export_document_completion(text) to authenticated;

comment on function public.repair_incomplete_export_document_completion(text) is
  'Admin-only forward repair for a legacy export batch with exact terminal submission/history facts but missing document audit and exported document markers.';

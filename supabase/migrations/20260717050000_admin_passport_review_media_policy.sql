create or replace function app_private.primary_applicant_id(target_submission_id text)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select case
    when count(*) filter (
      where applicant.role in ('main', 'Основной заявитель')
    ) > 1 then null
    else (
      array_agg(
        applicant.id
        order by
          (applicant.role in ('main', 'Основной заявитель')) desc,
          applicant.created_at,
          applicant.id
      )
    )[1]
  end
  from public.applicants as applicant
  where applicant.submission_id = target_submission_id
$$;

create or replace function app_private.cockpit_primary_applicant_id(snapshot jsonb)
returns text
language sql
immutable
set search_path = pg_catalog, public, app_private
as $$
  select case
    when count(*) filter (
      where applicant.value ->> 'role' in ('main', 'Основной заявитель')
    ) > 1 then null
    else (
      array_agg(
        applicant.value ->> 'id'
        order by
          (applicant.value ->> 'role' in ('main', 'Основной заявитель')) desc,
          applicant.ordinality
      )
    )[1]
  end
  from jsonb_array_elements(
    coalesce(snapshot -> 'applicants', '[]'::jsonb)
  ) with ordinality as applicant(value, ordinality)
$$;

revoke all on function app_private.primary_applicant_id(text) from public, anon, authenticated;
revoke all on function app_private.cockpit_primary_applicant_id(jsonb) from public, anon, authenticated;

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

  if app_private.primary_applicant_id(new.id) is null then
    raise exception 'A submission must have one unambiguous primary applicant before review'
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
      and (
        required_media.type = 'passport_scan'::public.media_slot_type
        or a.id = app_private.primary_applicant_id(new.id)
      )
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

revoke all on function app_private.enforce_submission_review_readiness() from public, anon, authenticated;

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

  if actor_role is distinct from 'admin' then
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
    if exists (
      select 1
      from public.submissions s
      cross join lateral (
        select s.family_intelligence -> 'v19CockpitSnapshot' -> 'submission' as snapshot
      ) as cockpit
      where s.id = any(submission_ids)
        and app_private.cockpit_primary_applicant_id(cockpit.snapshot) is null
    ) then
      raise exception 'Cockpit export requires one unambiguous primary applicant';
    end if;

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
        and issue.value ->> 'status' in ('open', 'fixed_by_agent')
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
            and (
              file.value ->> 'type' = 'passport_scan'
              or applicant.value ->> 'id' = app_private.cockpit_primary_applicant_id(cockpit.snapshot)
            )
        ) <> case
          when applicant.value ->> 'id' = app_private.cockpit_primary_applicant_id(cockpit.snapshot)
            then 3
          else 1
        end
    ) then
      raise exception 'All required cockpit applicant files must be accepted before export';
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
    if exists (
      select 1
      from public.submissions s
      where s.id = any(submission_ids)
        and app_private.primary_applicant_id(s.id) is null
    ) then
      raise exception 'Export requires one unambiguous primary applicant';
    end if;

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
        and status in ('open', 'fixed')
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
            and (
              m.type = 'passport_scan'
              or a.id = app_private.primary_applicant_id(a.submission_id)
            )
        ) <> case
          when a.id = app_private.primary_applicant_id(a.submission_id) then 3
          else 1
        end
    ) then
      raise exception 'All required applicant media must be accepted before export';
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

revoke all on function app_private.complete_export_package_core(jsonb) from public, anon, authenticated;

-- Preserve the currently deployed, null-safe atomic wrapper while replacing
-- only its fixed three-assets-per-applicant assumption. The exact-definition
-- checks make this forward-only patch fail closed if the reviewed wrapper has
-- drifted instead of silently weakening export identity validation.
do $migration$
declare
  function_definition text;
  old_ready_query constant text := $fragment$
    from public.document_assets asset
    where asset.submission_id = any(submission_ids)
      and asset.upload_status = 'uploaded'
      and asset.validation_status = 'passed'
      and asset.export_status = 'ready';
$fragment$;
  new_ready_query constant text := $fragment$
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
  old_count_guard constant text :=
    'coalesce(array_length(expected_document_asset_ids, 1), 0) <> expected_applicant_count * 3';
  new_count_guard constant text :=
    'coalesce(array_length(expected_document_asset_ids, 1), 0) <> expected_applicant_count + (coalesce(array_length(submission_ids, 1), 0) * 2)';
  old_error constant text :=
    'Export document assets must exactly match three ready documents per applicant';
  new_error constant text :=
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
  then
    raise exception 'Deployed complete_export_package wrapper does not have the reviewed null-safe admin guard';
  end if;

  if
    (length(function_definition) - length(replace(function_definition, old_ready_query, '')))
      / length(old_ready_query) = 1
    and (length(function_definition) - length(replace(function_definition, old_count_guard, '')))
      / length(old_count_guard) = 1
    and (length(function_definition) - length(replace(function_definition, old_error, '')))
      / length(old_error) = 1
    and position(new_ready_query in function_definition) = 0
    and position(new_count_guard in function_definition) = 0
    and position(new_error in function_definition) = 0
  then
    function_definition := replace(
      function_definition,
      old_ready_query,
      new_ready_query
    );
    function_definition := replace(
      function_definition,
      old_count_guard,
      new_count_guard
    );
    function_definition := replace(function_definition, old_error, new_error);
  elsif
    position(old_ready_query in function_definition) = 0
    and position(old_count_guard in function_definition) = 0
    and position(old_error in function_definition) = 0
    and (length(function_definition) - length(replace(function_definition, new_ready_query, '')))
      / length(new_ready_query) = 1
    and (length(function_definition) - length(replace(function_definition, new_count_guard, '')))
      / length(new_count_guard) = 1
    and (length(function_definition) - length(replace(function_definition, new_error, '')))
      / length(new_error) = 1
  then
    null;
  else
    raise exception 'Deployed complete_export_package wrapper does not match one reviewed media-count contract';
  end if;

  if position(unsafe_admin_guard in function_definition) > 0
    or (length(function_definition) - length(replace(function_definition, safe_admin_guard, '')))
      / length(safe_admin_guard) <> 1
  then
    raise exception 'Null-unsafe admin guard cannot be restored by passport media policy migration';
  end if;

  execute function_definition;
end;
$migration$;

revoke all on function public.complete_export_package(jsonb) from public, anon, authenticated;
grant execute on function public.complete_export_package(jsonb) to authenticated;

comment on function app_private.primary_applicant_id(text) is
  'Returns the single primary applicant: first canonical/persisted main role, otherwise the first persisted applicant.';

comment on function app_private.cockpit_primary_applicant_id(jsonb) is
  'Returns the single primary applicant from a cockpit snapshot: first role=main, otherwise first array item.';

comment on function app_private.enforce_submission_review_readiness() is
  'Requires passport_scan for every applicant and both selfies only for the single/primary applicant.';

comment on function app_private.complete_export_package_core(jsonb) is
  'Atomically completes export after required applicant media passes the single/primary family policy.';

comment on function public.complete_export_package(jsonb) is
  'Atomic null-safe admin export with exact primary/secondary passport media assets and durable artifact identity.';

begin;

-- Excel-only T8/T9 receipts.  `export_batches` remains immutable artifact
-- identity; these tables bind an administrator acknowledgement and terminal
-- commit to one exact acceptance revision of every selected submission.
create table public.workbook_export_receipts (
  id uuid primary key default gen_random_uuid(),
  export_batch_id uuid not null references public.export_batches(id) on delete restrict,
  archive_input_signature text not null check (btrim(archive_input_signature) <> ''),
  revision_fingerprint text not null check (btrim(revision_fingerprint) <> ''),
  acknowledged_by uuid not null references public.profiles(id) on delete restrict,
  acknowledged_at timestamptz not null default clock_timestamp(),
  completed_by uuid references public.profiles(id) on delete restrict,
  completed_at timestamptz,
  unique (export_batch_id, revision_fingerprint),
  check ((completed_by is null) = (completed_at is null))
);

create table public.workbook_export_receipt_members (
  receipt_id uuid not null references public.workbook_export_receipts(id) on delete restrict,
  submission_id text not null references public.submissions(id) on delete restrict,
  acceptance_case_revision bigint not null check (acceptance_case_revision >= 0),
  terminal_case_revision bigint check (
    terminal_case_revision is null
    or terminal_case_revision = acceptance_case_revision + 1
  ),
  primary key (receipt_id, submission_id),
  unique (submission_id, acceptance_case_revision)
);

create index workbook_export_receipts_batch_idx
  on public.workbook_export_receipts(export_batch_id, acknowledged_at desc);
create index workbook_export_receipt_members_submission_idx
  on public.workbook_export_receipt_members(submission_id, acceptance_case_revision);

alter table public.workbook_export_receipts enable row level security;
alter table public.workbook_export_receipt_members enable row level security;

create policy workbook_export_receipts_admin_read
on public.workbook_export_receipts
for select to authenticated
using ((select app_private.current_profile_role()) = 'admin');

create policy workbook_export_receipt_members_admin_read
on public.workbook_export_receipt_members
for select to authenticated
using ((select app_private.current_profile_role()) = 'admin');

revoke all on public.workbook_export_receipts from public, anon, authenticated;
revoke all on public.workbook_export_receipt_members from public, anon, authenticated;
grant select on public.workbook_export_receipts to authenticated;
grant select on public.workbook_export_receipt_members to authenticated;

create or replace function app_private.validate_workbook_export_payload(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  batch_payload jsonb := payload -> 'batch';
  archive_input_signature text := payload ->> 'archive_input_signature';
  expected_case_revisions jsonb := payload -> 'expected_case_revisions';
  stage text := coalesce(payload ->> '__stage', 't8');
  submission_ids text[];
  provided_submission_count integer;
  locked_submission_count integer;
  current_row_count integer;
  revision_fingerprint text;
  members jsonb;
begin
  if jsonb_typeof(payload) is distinct from 'object'
    or payload - array[
      'archive_input_signature',
      'batch',
      'expected_case_revisions',
      '__stage'
    ] <> '{}'::jsonb
    or jsonb_typeof(batch_payload) is distinct from 'object'
    or batch_payload - array[
      'format',
      'content_fingerprint',
      'idempotency_key',
      'file_name',
      'row_count',
      'submission_ids'
    ] <> '{}'::jsonb
    or not batch_payload ?& array[
      'format',
      'content_fingerprint',
      'idempotency_key',
      'file_name',
      'row_count',
      'submission_ids'
    ]
  then
    raise exception 'Workbook export payload has an invalid shape';
  end if;

  if nullif(btrim(coalesce(archive_input_signature, '')), '') is null
    or length(archive_input_signature) > 8388608
    or jsonb_typeof(expected_case_revisions) is distinct from 'object'
  then
    raise exception 'Workbook preparation proof is invalid';
  end if;

  if stage not in ('t8', 't9', 'reconcile_t8', 'reconcile_t9') then
    raise exception 'Workbook export stage is invalid';
  end if;
  if batch_payload ->> 'format' is distinct from 'xlsx' then
    raise exception 'Workbook export format must be xlsx';
  end if;
  if coalesce(batch_payload ->> 'idempotency_key', '') !~ '^[0-9a-z]{7}$' then
    raise exception 'Workbook export idempotency key is invalid';
  end if;
  if batch_payload ->> 'file_name' is distinct from
    'visaflow-export-' || (batch_payload ->> 'idempotency_key') || '.xlsx'
  then
    raise exception 'Workbook export file name is invalid';
  end if;
  if nullif(btrim(coalesce(batch_payload ->> 'content_fingerprint', '')), '') is null
    or length(batch_payload ->> 'content_fingerprint') > 8388608
  then
    raise exception 'Workbook export content fingerprint is invalid';
  end if;
  if jsonb_typeof(batch_payload -> 'row_count') is distinct from 'number'
    or (batch_payload ->> 'row_count') !~ '^[0-9]+$'
    or (batch_payload ->> 'row_count')::integer not between 1 and 5000
  then
    raise exception 'Workbook export row count is invalid';
  end if;
  if jsonb_typeof(batch_payload -> 'submission_ids') is distinct from 'array'
    or jsonb_array_length(batch_payload -> 'submission_ids') not between 1 and 500
    or exists (
      select 1
      from jsonb_array_elements(batch_payload -> 'submission_ids') as item(value)
      where jsonb_typeof(item.value) is distinct from 'string'
        or length(btrim(item.value #>> '{}')) not between 1 and 128
    )
  then
    raise exception 'Workbook export submission ids are invalid';
  end if;

  provided_submission_count := jsonb_array_length(batch_payload -> 'submission_ids');
  select array_agg(id_value order by id_value)
  into submission_ids
  from (
    select distinct btrim(item.value #>> '{}') as id_value
    from jsonb_array_elements(batch_payload -> 'submission_ids') as item(value)
  ) as normalized_ids;

  if coalesce(array_length(submission_ids, 1), 0) <> provided_submission_count then
    raise exception 'Workbook export submission ids must be unique';
  end if;

  if (
    select array_agg(key order by key)
    from jsonb_object_keys(expected_case_revisions) as revisions(key)
  ) is distinct from submission_ids
    or exists (
      select 1
      from jsonb_each(expected_case_revisions) as revision(key, value)
      where jsonb_typeof(revision.value) is distinct from 'number'
        or revision.value #>> '{}' !~ '^[0-9]+$'
        or (revision.value #>> '{}')::numeric > 9223372036854775807
    )
  then
    raise exception 'Workbook preparation revisions are invalid';
  end if;

  perform 1
  from public.submissions as submission
  where submission.id = any(submission_ids)
  order by submission.id
  for update;
  get diagnostics locked_submission_count = row_count;
  if locked_submission_count <> provided_submission_count then
    raise exception 'Workbook export contains an unknown submission';
  end if;


  if exists (
    select 1
    from public.submissions as submission
    where submission.id = any(submission_ids)
      and submission.case_revision is distinct from
        (expected_case_revisions ->> submission.id)::bigint
  ) then
    raise exception 'Workbook preparation revision is stale';
  end if;

  if stage = 't8' and exists (
    select 1 from public.submissions as submission
    where submission.id = any(submission_ids)
      and submission.status <> 'ready_for_excel'
  ) then
    raise exception 'Workbook export acknowledgement requires ready submissions';
  end if;

  if stage <> 't8' and (
    exists (
      select 1 from public.submissions as submission
      where submission.id = any(submission_ids)
        and submission.status not in ('ready_for_excel', 'exported')
    )
    or (
      exists (
        select 1 from public.submissions as submission
        where submission.id = any(submission_ids) and submission.status = 'exported'
      )
      and exists (
        select 1 from public.submissions as submission
        where submission.id = any(submission_ids) and submission.status = 'ready_for_excel'
      )
    )
  ) then
    raise exception 'Workbook export status is unknown';
  end if;

  if exists (
    select 1
    from public.corrections as correction
    where correction.submission_id = any(submission_ids)
      and correction.status in ('open', 'fixed')
  ) then
    raise exception 'Workbook export has unresolved corrections';
  end if;

  if exists (
    select 1
    from public.applicants as applicant
    where applicant.submission_id = any(submission_ids)
      and (
        applicant.questionnaire_percent < 100
        or nullif(btrim(applicant.full_name), '') is null
        or nullif(btrim(applicant.passport_number), '') is null
        or applicant.passport_number = '-'
        or applicant.birth_date is null
        or applicant.passport_issued_at is null
        or applicant.passport_expires_at is null
        or nullif(btrim(coalesce(applicant.citizenship, '')), '') is null
        or nullif(btrim(coalesce(applicant.address, '')), '') is null
        or nullif(btrim(coalesce(applicant.phone, '')), '') is null
        or nullif(btrim(coalesce(applicant.email, '')), '') is null
        or nullif(btrim(coalesce(applicant.hotel_name, '')), '') is null
        or nullif(btrim(coalesce(applicant.hotel_address, '')), '') is null
      )
  ) then
    raise exception 'Workbook export questionnaire is incomplete';
  end if;

  if exists (
    select 1
    from public.questionnaire_answers as answer
    where answer.submission_id = any(submission_ids)
      and (
        case
          when jsonb_typeof(answer.value) = 'object'
            and answer.value ->> 'kind' = 'v19_questionnaire_field'
            then nullif(btrim(coalesce(answer.value ->> 'value', '')), '') is null
              or answer.value ->> 'reviewState' is distinct from 'confirmed'
          when jsonb_typeof(answer.value) = 'string'
            then nullif(btrim(answer.value #>> '{}'), '') is null
          else true
        end
      )
  ) then
    raise exception 'Workbook export questionnaire review is incomplete';
  end if;

  if exists (
    select 1
    from public.applicants as applicant
    join public.submissions as submission on submission.id = applicant.submission_id
    where applicant.submission_id = any(submission_ids)
      and (
        not exists (
          select 1 from public.media_assets as media
          where media.submission_id = applicant.submission_id
            and media.applicant_id = applicant.id
            and media.type = 'passport_scan'
            and media.upload_status = 'uploaded'
            and media.review_status = 'accepted'
            and media.reviewed_at is not null
            and media.reviewed_by is not null
        )
        or (
          (
            submission.type = 'single'
            or applicant.role = 'Основной заявитель'
            or (
              not exists (
                select 1 from public.applicants as primary_applicant
                where primary_applicant.submission_id = applicant.submission_id
                  and primary_applicant.role = 'Основной заявитель'
              )
              and applicant.id = (
                select first_applicant.id
                from public.applicants as first_applicant
                where first_applicant.submission_id = applicant.submission_id
                order by first_applicant.created_at, first_applicant.id
                limit 1
              )
            )
          )
          and exists (
            select 1
            from (values ('selfie'::public.media_slot_type), ('selfie_2'::public.media_slot_type))
              as required_media(type)
            where not exists (
              select 1 from public.media_assets as media
              where media.submission_id = applicant.submission_id
                and media.applicant_id = applicant.id
                and media.type = required_media.type
                and media.upload_status = 'uploaded'
                and media.review_status = 'accepted'
                and media.reviewed_at is not null
                and media.reviewed_by is not null
            )
          )
        )
      )
  ) then
    raise exception 'Workbook export media review is incomplete';
  end if;

  if (
    select count(distinct submission.city)
    from public.submissions as submission
    where submission.id = any(submission_ids)
  ) <> 1 or (
    select count(distinct submission.travel_date)
    from public.submissions as submission
    where submission.id = any(submission_ids)
  ) <> 1 then
    raise exception 'Workbook export cannot mix city or travel date';
  end if;

  select count(*) into current_row_count
  from public.applicants as applicant
  where applicant.submission_id = any(submission_ids);
  if current_row_count <> (batch_payload ->> 'row_count')::integer then
    raise exception 'Workbook export row count is stale';
  end if;

  select
    string_agg(submission.id || ':' || submission.case_revision::text, '|' order by submission.id),
    jsonb_agg(
      jsonb_build_object(
        'id', submission.id,
        'caseRevision', submission.case_revision,
        'rawStatus', submission.status::text
      ) order by submission.id
    )
  into revision_fingerprint, members
  from public.submissions as submission
  where submission.id = any(submission_ids);

  return jsonb_build_object(
    'archiveInputSignature', archive_input_signature,
    'batch', batch_payload,
    'members', members,
    'revisionFingerprint', revision_fingerprint,
    'submissionIds', to_jsonb(submission_ids)
  );
end;
$function$;

revoke all on function app_private.validate_workbook_export_payload(jsonb) from public, anon, authenticated;

create or replace function public.record_export_workbook_download_acknowledgement(
  payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  validated jsonb;
  batch_payload jsonb;
  batch_record public.export_batches%rowtype;
  receipt_record public.workbook_export_receipts%rowtype;
  member jsonb;
  duplicate_receipt boolean := false;
begin
  if actor_id is null then
    raise exception 'Authenticated user required for workbook export acknowledgement'
      using errcode = '28000';
  end if;
  if app_private.current_profile_role() is distinct from 'admin' then
    raise exception 'Only admins can acknowledge workbook exports'
      using errcode = '42501';
  end if;
  if jsonb_typeof(payload) is distinct from 'object'
    or payload - array['archive_input_signature', 'batch', 'expected_case_revisions'] <> '{}'::jsonb
  then
    raise exception 'Workbook export acknowledgement payload is invalid';
  end if;

  validated := app_private.validate_workbook_export_payload(
    payload || jsonb_build_object('__stage', 't8')
  );
  batch_payload := validated -> 'batch';

  select * into batch_record
  from public.export_batches
  where idempotency_key = batch_payload ->> 'idempotency_key'
  for update;

  if batch_record.id is null then
    insert into public.export_batches (
      format,
      content_fingerprint,
      idempotency_key,
      file_name,
      row_count,
      submission_ids
    ) values (
      'xlsx',
      batch_payload ->> 'content_fingerprint',
      batch_payload ->> 'idempotency_key',
      batch_payload ->> 'file_name',
      (batch_payload ->> 'row_count')::integer,
      array(select jsonb_array_elements_text(batch_payload -> 'submission_ids') order by 1)
    )
    returning * into batch_record;
  elsif batch_record.format <> 'xlsx'
    or batch_record.content_fingerprint is distinct from batch_payload ->> 'content_fingerprint'
    or batch_record.file_name is distinct from batch_payload ->> 'file_name'
    or batch_record.row_count <> (batch_payload ->> 'row_count')::integer
    or batch_record.submission_ids is distinct from
      array(select jsonb_array_elements_text(batch_payload -> 'submission_ids') order by 1)
  then
    raise exception 'Workbook export identity conflicts with its idempotency key';
  end if;

  select * into receipt_record
  from public.workbook_export_receipts
  where export_batch_id = batch_record.id
    and revision_fingerprint = validated ->> 'revisionFingerprint'
  for update;

  if receipt_record.id is not null then
    if receipt_record.archive_input_signature is distinct from
      validated ->> 'archiveInputSignature'
    then
      raise exception 'Workbook preparation signature conflicts with its receipt';
    end if;
    duplicate_receipt := true;
  else
    if exists (
      select 1
      from public.workbook_export_receipt_members as existing_member
      join jsonb_array_elements(validated -> 'members') as current_member(value)
        on existing_member.submission_id = current_member.value ->> 'id'
       and existing_member.acceptance_case_revision =
         (current_member.value ->> 'caseRevision')::bigint
    ) then
      raise exception 'Workbook export selection overlaps an active receipt';
    end if;

    insert into public.workbook_export_receipts (
      export_batch_id,
      archive_input_signature,
      revision_fingerprint,
      acknowledged_by
    ) values (
      batch_record.id,
      validated ->> 'archiveInputSignature',
      validated ->> 'revisionFingerprint',
      actor_id
    )
    returning * into receipt_record;

    for member in select value from jsonb_array_elements(validated -> 'members') loop
      insert into public.workbook_export_receipt_members (
        receipt_id,
        submission_id,
        acceptance_case_revision
      ) values (
        receipt_record.id,
        member ->> 'id',
        (member ->> 'caseRevision')::bigint
      );
    end loop;
  end if;

  return jsonb_build_object(
    'duplicate', duplicate_receipt,
    'receipt', jsonb_build_object(
      'id', receipt_record.id,
      'exportBatchId', receipt_record.export_batch_id,
      'revisionFingerprint', receipt_record.revision_fingerprint,
      'acknowledgedBy', receipt_record.acknowledged_by,
      'acknowledgedAt', receipt_record.acknowledged_at,
      'completedBy', receipt_record.completed_by,
      'completedAt', receipt_record.completed_at
    ),
    'submissions', jsonb_array_length(validated -> 'members')
  );
end;
$function$;

create or replace function public.complete_workbook_export(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  validated jsonb;
  batch_payload jsonb;
  batch_record public.export_batches%rowtype;
  receipt_record public.workbook_export_receipts%rowtype;
  all_exported boolean;
  member jsonb;
  history_count integer := 0;
  previous_snapshot_context text;
  previous_bumped_ids text;
  previous_export_context text;
begin
  if actor_id is null then
    raise exception 'Authenticated user required to complete workbook export'
      using errcode = '28000';
  end if;
  if app_private.current_profile_role() is distinct from 'admin' then
    raise exception 'Only admins can complete workbook exports'
      using errcode = '42501';
  end if;
  if jsonb_typeof(payload) is distinct from 'object'
    or payload - array['archive_input_signature', 'batch', 'expected_case_revisions'] <> '{}'::jsonb
  then
    raise exception 'Workbook export completion payload is invalid';
  end if;

  validated := app_private.validate_workbook_export_payload(
    payload || jsonb_build_object('__stage', 't9')
  );
  batch_payload := validated -> 'batch';
  all_exported := not exists (
    select 1 from jsonb_array_elements(validated -> 'members') as item(value)
    where item.value ->> 'rawStatus' <> 'exported'
  );

  select * into batch_record
  from public.export_batches
  where idempotency_key = batch_payload ->> 'idempotency_key'
  for update;
  if batch_record.id is null
    or batch_record.format <> 'xlsx'
    or batch_record.content_fingerprint is distinct from batch_payload ->> 'content_fingerprint'
    or batch_record.file_name is distinct from batch_payload ->> 'file_name'
    or batch_record.row_count <> (batch_payload ->> 'row_count')::integer
    or batch_record.submission_ids is distinct from
      array(select jsonb_array_elements_text(batch_payload -> 'submission_ids') order by 1)
  then
    raise exception 'Workbook export receipt is not acknowledged';
  end if;

  if all_exported then
    select receipt.* into receipt_record
    from public.workbook_export_receipts as receipt
    where receipt.export_batch_id = batch_record.id
      and receipt.archive_input_signature = validated ->> 'archiveInputSignature'
      and receipt.completed_at is not null
      and not exists (
        select 1
        from public.workbook_export_receipt_members as receipt_member
        join jsonb_array_elements(validated -> 'members') as current_member(value)
          on current_member.value ->> 'id' = receipt_member.submission_id
        where receipt_member.receipt_id = receipt.id
          and receipt_member.terminal_case_revision is distinct from
            (current_member.value ->> 'caseRevision')::bigint
      )
      and (
        select count(*) from public.workbook_export_receipt_members as exact_member
        where exact_member.receipt_id = receipt.id
      ) = jsonb_array_length(validated -> 'members')
    order by receipt.completed_at desc, receipt.id
    limit 1;
    if receipt_record.id is null then
      raise exception 'Workbook export terminal linkage is stale';
    end if;
    return jsonb_build_object(
      'duplicate', true,
      'receipt', jsonb_build_object(
        'id', receipt_record.id,
        'exportBatchId', receipt_record.export_batch_id,
        'revisionFingerprint', receipt_record.revision_fingerprint,
        'acknowledgedBy', receipt_record.acknowledged_by,
        'acknowledgedAt', receipt_record.acknowledged_at,
        'completedBy', receipt_record.completed_by,
        'completedAt', receipt_record.completed_at
      ),
      'statusHistory', 0,
      'submissions', 0
    );
  end if;

  select * into receipt_record
  from public.workbook_export_receipts
  where export_batch_id = batch_record.id
    and revision_fingerprint = validated ->> 'revisionFingerprint'
  for update;
  if receipt_record.id is null then
    raise exception 'Workbook export receipt is not acknowledged';
  end if;
  if receipt_record.archive_input_signature is distinct from
    validated ->> 'archiveInputSignature'
  then
    raise exception 'Workbook preparation signature is stale';
  end if;
  if receipt_record.completed_at is not null then
    raise exception 'Workbook export completed receipt has inconsistent submissions';
  end if;
  if exists (
    select 1
    from public.workbook_export_receipt_members as receipt_member
    join jsonb_array_elements(validated -> 'members') as current_member(value)
      on current_member.value ->> 'id' = receipt_member.submission_id
    where receipt_member.receipt_id = receipt_record.id
      and receipt_member.acceptance_case_revision is distinct from
        (current_member.value ->> 'caseRevision')::bigint
  ) then
    raise exception 'Workbook export acceptance revision is stale';
  end if;

  previous_snapshot_context := current_setting('app.visaflow_internal_snapshot_save', true);
  previous_bumped_ids := current_setting('app.visaflow_snapshot_revision_bumped_ids', true);
  previous_export_context := current_setting('app.visaflow_complete_export_package', true);
  perform set_config('app.visaflow_internal_snapshot_save', 'on', true);
  perform set_config('app.visaflow_snapshot_revision_bumped_ids', '[]', true);
  perform set_config('app.visaflow_complete_export_package', 'on', true);
  perform set_config('app.visaflow_workbook_export_completion', 'on', true);

  update public.submissions as submission
  set status = 'exported',
      exported_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where submission.id = any(batch_record.submission_ids)
    and submission.status = 'ready_for_excel';
  if not found then
    raise exception 'Workbook export did not update ready submissions';
  end if;

  for member in select value from jsonb_array_elements(validated -> 'members') loop
    insert into public.status_history (
      entity_type,
      entity_id,
      from_status,
      to_status,
      comment,
      source,
      note,
      changed_by
    ) values (
      'submission',
      member ->> 'id',
      'ready_for_excel',
      'exported',
      'Excel-only export completed: ' || batch_record.file_name,
      'admin',
      'workbook-receipt:' || receipt_record.id::text,
      actor_id
    );
    history_count := history_count + 1;
  end loop;

  update public.workbook_export_receipt_members as receipt_member
  set terminal_case_revision = receipt_member.acceptance_case_revision + 1
  where receipt_member.receipt_id = receipt_record.id;

  if exists (
    select 1
    from public.workbook_export_receipt_members as receipt_member
    join public.submissions as submission on submission.id = receipt_member.submission_id
    where receipt_member.receipt_id = receipt_record.id
      and submission.case_revision is distinct from receipt_member.terminal_case_revision
  ) then
    raise exception 'Workbook export terminal revision is inconsistent';
  end if;

  update public.workbook_export_receipts
  set completed_by = actor_id,
      completed_at = clock_timestamp()
  where id = receipt_record.id
  returning * into receipt_record;

  perform set_config(
    'app.visaflow_internal_snapshot_save', coalesce(previous_snapshot_context, ''), true
  );
  perform set_config(
    'app.visaflow_snapshot_revision_bumped_ids', coalesce(previous_bumped_ids, ''), true
  );
  perform set_config(
    'app.visaflow_complete_export_package', coalesce(previous_export_context, ''), true
  );
  perform set_config('app.visaflow_workbook_export_completion', '', true);

  return jsonb_build_object(
    'duplicate', false,
    'receipt', jsonb_build_object(
      'id', receipt_record.id,
      'exportBatchId', receipt_record.export_batch_id,
      'revisionFingerprint', receipt_record.revision_fingerprint,
      'acknowledgedBy', receipt_record.acknowledged_by,
      'acknowledgedAt', receipt_record.acknowledged_at,
      'completedBy', receipt_record.completed_by,
      'completedAt', receipt_record.completed_at
    ),
    'statusHistory', history_count,
    'submissions', jsonb_array_length(validated -> 'members')
  );
exception
  when others then
    perform set_config(
      'app.visaflow_internal_snapshot_save', coalesce(previous_snapshot_context, ''), true
    );
    perform set_config(
      'app.visaflow_snapshot_revision_bumped_ids', coalesce(previous_bumped_ids, ''), true
    );
    perform set_config(
      'app.visaflow_complete_export_package', coalesce(previous_export_context, ''), true
    );
    perform set_config('app.visaflow_workbook_export_completion', '', true);
    raise;
end;
$function$;

create or replace function public.reconcile_workbook_export(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  requested_stage text := payload ->> 'stage';
  validated jsonb;
  batch_payload jsonb;
  batch_record public.export_batches%rowtype;
  receipt_record public.workbook_export_receipts%rowtype;
  all_exported boolean;
  result_status text := 'unknown';
  canonical_submissions jsonb;
begin
  if actor_id is null then
    raise exception 'Authenticated user required to reconcile workbook export'
      using errcode = '28000';
  end if;
  if app_private.current_profile_role() is distinct from 'admin' then
    raise exception 'Only admins can reconcile workbook exports'
      using errcode = '42501';
  end if;
  if jsonb_typeof(payload) is distinct from 'object'
    or payload - array[
      'archive_input_signature',
      'batch',
      'expected_case_revisions',
      'stage'
    ] <> '{}'::jsonb
    or requested_stage not in ('t8', 't9')
  then
    raise exception 'Workbook export reconciliation payload is invalid';
  end if;

  begin
    validated := app_private.validate_workbook_export_payload(
      (payload - 'stage') || jsonb_build_object('__stage', 'reconcile_' || requested_stage)
    );
  exception when others then
    return jsonb_build_object(
      'receipt', null,
      'stage', requested_stage,
      'status', 'unknown',
      'submissions', '[]'::jsonb
    );
  end;
  batch_payload := validated -> 'batch';
  all_exported := not exists (
    select 1 from jsonb_array_elements(validated -> 'members') as item(value)
    where item.value ->> 'rawStatus' <> 'exported'
  );

  select * into batch_record
  from public.export_batches
  where idempotency_key = batch_payload ->> 'idempotency_key';

  if batch_record.id is null then
    result_status := case when all_exported then 'unknown' else 'not_committed' end;
  elsif batch_record.format <> 'xlsx'
    or batch_record.content_fingerprint is distinct from batch_payload ->> 'content_fingerprint'
    or batch_record.file_name is distinct from batch_payload ->> 'file_name'
    or batch_record.row_count <> (batch_payload ->> 'row_count')::integer
    or batch_record.submission_ids is distinct from
      array(select jsonb_array_elements_text(batch_payload -> 'submission_ids') order by 1)
  then
    result_status := 'unknown';
  elsif all_exported then
    select receipt.* into receipt_record
    from public.workbook_export_receipts as receipt
    where receipt.export_batch_id = batch_record.id
      and receipt.archive_input_signature = validated ->> 'archiveInputSignature'
      and receipt.completed_at is not null
      and not exists (
        select 1
        from public.workbook_export_receipt_members as receipt_member
        join jsonb_array_elements(validated -> 'members') as current_member(value)
          on current_member.value ->> 'id' = receipt_member.submission_id
        where receipt_member.receipt_id = receipt.id
          and receipt_member.terminal_case_revision is distinct from
            (current_member.value ->> 'caseRevision')::bigint
      )
    order by receipt.completed_at desc, receipt.id
    limit 1;
    result_status := case when receipt_record.id is null then 'unknown' else 'committed' end;
  else
    select * into receipt_record
    from public.workbook_export_receipts
    where export_batch_id = batch_record.id
      and archive_input_signature = validated ->> 'archiveInputSignature'
      and revision_fingerprint = validated ->> 'revisionFingerprint'
    order by acknowledged_at desc, id
    limit 1;
    if receipt_record.id is null then
      result_status := 'not_committed';
    elsif requested_stage = 't8' then
      result_status := 'committed';
    elsif receipt_record.completed_at is null then
      result_status := 'not_committed';
    else
      result_status := 'unknown';
    end if;
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'id', member.value ->> 'id',
      'caseRevision', (member.value ->> 'caseRevision')::bigint,
      'status', case
        when member.value ->> 'rawStatus' = 'exported' then 'exported'
        else 'ready_for_export'
      end
    ) order by member.value ->> 'id'
  ) into canonical_submissions
  from jsonb_array_elements(validated -> 'members') as member(value);

  return jsonb_build_object(
    'receipt', case when receipt_record.id is null then null else jsonb_build_object(
      'id', receipt_record.id,
      'exportBatchId', receipt_record.export_batch_id,
      'revisionFingerprint', receipt_record.revision_fingerprint,
      'acknowledgedBy', receipt_record.acknowledged_by,
      'acknowledgedAt', receipt_record.acknowledged_at,
      'completedBy', receipt_record.completed_by,
      'completedAt', receipt_record.completed_at
    ) end,
    'stage', requested_stage,
    'status', result_status,
    'submissions', coalesce(canonical_submissions, '[]'::jsonb)
  );
end;
$function$;

revoke all on function public.record_export_workbook_download_acknowledgement(jsonb) from public, anon, authenticated;
revoke all on function public.complete_workbook_export(jsonb) from public, anon, authenticated;
revoke all on function public.reconcile_workbook_export(jsonb) from public, anon, authenticated;
grant execute on function public.record_export_workbook_download_acknowledgement(jsonb) to authenticated;
grant execute on function public.complete_workbook_export(jsonb) to authenticated;
grant execute on function public.reconcile_workbook_export(jsonb) to authenticated;

comment on function public.record_export_workbook_download_acknowledgement(jsonb) is
  'Admin-only Excel T8 acknowledgement; preserves submission status.';
comment on function public.complete_workbook_export(jsonb) is
  'Admin-only Excel T9 terminal commit bound to an exact T8 receipt.';
comment on function public.reconcile_workbook_export(jsonb) is
  'Admin-only tri-state canonical readback for Excel T8/T9.';

commit;

-- Production forward repair for an out-of-order promotion where
-- 20260724132405 was applied before 20260722001000. In that order the
-- concurrency migration moves the revision wrapper into the private dispatch
-- slot, making dispatch recursive. Restore the canonical pre-concurrency
-- persistence implementation in the private slot, then reassert the current
-- revision-checked public wrapper.
begin;

do $preflight$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'submissions'
      and column_name = 'public_number'
      and data_type = 'bigint'
  ) then
    raise exception 'Required submissions.public_number bigint column is missing';
  end if;
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'submissions'
      and column_name = 'case_revision'
      and data_type = 'bigint'
      and is_nullable = 'NO'
  ) then
    raise exception 'Required submissions.case_revision bigint column is missing or nullable';
  end if;
  if to_regprocedure(
    'app_private.save_submission_draft_without_questionnaire_rows(jsonb)'
  ) is null then
    raise exception 'Canonical draft persistence implementation is missing';
  end if;
  if to_regprocedure(
    'app_private.dispatch_submission_draft_with_revision_context(jsonb)'
  ) is null then
    raise exception 'Revision-context draft dispatcher is missing';
  end if;
  if not exists (
    select 1
    from pg_catalog.pg_trigger
    where tgrelid = 'public.submissions'::regclass
      and tgname = 'submissions_bump_case_revision'
      and tgenabled = 'O'
      and not tgisinternal
  ) then
    raise exception 'Submission case revision trigger is missing or disabled';
  end if;
end;
$preflight$;

create or replace function app_private.save_submission_draft_for_internal_dispatch(
  payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  result jsonb;
  payload_without_status_history jsonb;
  submission_record record;
  questionnaire_answer_count integer := 0;
  legacy_trip_date text;
  legacy_trip_date_parts text[];
  normalized_trip_date_from text;
  normalized_trip_date_to text;
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
    travel_date text,
    trip_date_from text,
    trip_date_to text
  );

  if submission_record.id is null then
    raise exception 'Submission payload is required';
  end if;

  legacy_trip_date := nullif(btrim(coalesce(submission_record.travel_date, '')), '');
  legacy_trip_date_parts := regexp_match(
    coalesce(legacy_trip_date, ''),
    '^\s*(.*?)\s+-\s+(.*?)\s*$'
  );

  normalized_trip_date_from := coalesce(
    nullif(btrim(coalesce(submission_record.trip_date_from, '')), ''),
    nullif(btrim(coalesce(legacy_trip_date_parts[1], legacy_trip_date, '')), '')
  );
  normalized_trip_date_to := coalesce(
    nullif(btrim(coalesce(submission_record.trip_date_to, '')), ''),
    nullif(btrim(coalesce(legacy_trip_date_parts[2], legacy_trip_date, '')), '')
  );

  if normalized_trip_date_from is null or normalized_trip_date_to is null then
    raise exception 'Trip date range is required'
      using errcode = '23514';
  end if;

  if payload ? 'questionnaire_answers' and exists (
    select 1
    from jsonb_to_recordset(
      coalesce(payload -> 'questionnaire_answers', '[]'::jsonb)
    ) as answer_payload (
      submission_id text,
      applicant_id text,
      section_id text,
      field_id text,
      label text
    )
    where answer_payload.submission_id is distinct from submission_record.id
      or nullif(trim(coalesce(answer_payload.applicant_id, '')), '') is null
      or nullif(trim(coalesce(answer_payload.section_id, '')), '') is null
      or nullif(trim(coalesce(answer_payload.field_id, '')), '') is null
      or nullif(trim(coalesce(answer_payload.label, '')), '') is null
  ) then
    raise exception 'Questionnaire answer payload is missing required identity fields or contains a mismatched submission id'
      using errcode = '23514';
  end if;

  payload_without_status_history :=
    jsonb_set(payload, '{status_history}', '[]'::jsonb, true);

  result := app_private.save_submission_draft_without_questionnaire_rows(
    payload_without_status_history
  );

  insert into public.status_history (
    id,
    entity_type,
    entity_id,
    from_status,
    to_status,
    comment,
    source,
    note,
    changed_by,
    changed_at
  )
  select
    coalesce(history_payload.id, gen_random_uuid()),
    history_payload.entity_type,
    history_payload.entity_id,
    history_payload.from_status,
    history_payload.to_status,
    history_payload.comment,
    case
      when history_payload.source in ('agent', 'admin', 'bb', 'system')
        then history_payload.source
      else 'system'
    end,
    history_payload.note,
    history_payload.changed_by,
    history_payload.changed_at
  from jsonb_to_recordset(
    coalesce(payload -> 'status_history', '[]'::jsonb)
  ) as history_payload (
    id uuid,
    entity_type text,
    entity_id text,
    from_status text,
    to_status text,
    comment text,
    source text,
    note text,
    changed_by uuid,
    changed_at timestamptz
  )
  where history_payload.entity_type = 'submission'
    and history_payload.entity_id = submission_record.id
  on conflict (id) do nothing;

  get diagnostics status_history_count = row_count;
  result := jsonb_set(
    result,
    '{statusHistory}',
    to_jsonb(status_history_count),
    true
  );

  perform set_config('app.visaflow_internal_trip_date_sync', 'on', true);
  update public.submissions
  set
    trip_date_from = normalized_trip_date_from,
    trip_date_to = normalized_trip_date_to,
    travel_date = case
      when normalized_trip_date_from = normalized_trip_date_to
        then normalized_trip_date_from
      else normalized_trip_date_from || ' - ' || normalized_trip_date_to
    end
  where id = submission_record.id;
  perform set_config('app.visaflow_internal_trip_date_sync', 'off', true);

  if payload ? 'questionnaire_answers' then
    if exists (
      select 1
      from jsonb_to_recordset(
        coalesce(payload -> 'questionnaire_answers', '[]'::jsonb)
      ) as answer_payload (
        applicant_id text
      )
      where not exists (
        select 1
        from public.applicants as applicant
        where applicant.id = answer_payload.applicant_id
          and applicant.submission_id = submission_record.id
      )
    ) then
      raise exception 'Questionnaire answer applicant does not belong to submission'
        using errcode = '23503';
    end if;

    delete from public.questionnaire_answers as questionnaire_answer
    where questionnaire_answer.submission_id = submission_record.id
      and not exists (
        select 1
        from jsonb_to_recordset(
          coalesce(payload -> 'questionnaire_answers', '[]'::jsonb)
        ) as answer_payload (
          applicant_id text,
          section_id text,
          field_id text
        )
        where answer_payload.applicant_id = questionnaire_answer.applicant_id
          and answer_payload.section_id = questionnaire_answer.section_id
          and answer_payload.field_id = questionnaire_answer.field_id
      );

    insert into public.questionnaire_answers (
      submission_id,
      applicant_id,
      section_id,
      field_id,
      label,
      value,
      updated_by,
      updated_at
    )
    select
      answer_payload.submission_id,
      answer_payload.applicant_id,
      answer_payload.section_id,
      answer_payload.field_id,
      answer_payload.label,
      coalesce(answer_payload.value, '""'::jsonb),
      auth.uid(),
      now()
    from jsonb_to_recordset(
      coalesce(payload -> 'questionnaire_answers', '[]'::jsonb)
    ) as answer_payload (
      submission_id text,
      applicant_id text,
      section_id text,
      field_id text,
      label text,
      value jsonb
    )
    on conflict (applicant_id, section_id, field_id) do update set
      label = excluded.label,
      value = excluded.value,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at;

    get diagnostics questionnaire_answer_count = row_count;
  end if;

  return result || jsonb_build_object(
    'questionnaireAnswers',
    questionnaire_answer_count
  );
end;
$$;

revoke all on function app_private.save_submission_draft_for_internal_dispatch(jsonb)
  from public, anon, authenticated;
grant execute on function app_private.save_submission_draft_for_internal_dispatch(jsonb)
  to authenticated;

create or replace function public.save_submission_draft(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, app_private
as $function$
declare
  actor_role public.profile_role := app_private.current_profile_role();
  client_contract_version integer := coalesce(
    (payload ->> 'client_contract_version')::integer,
    1
  );
  confirmation_time timestamptz := clock_timestamp();
  correction_payload jsonb;
  current_revision bigint;
  expected_revision bigint;
  persisted_result jsonb;
  previous_snapshot_save_context text := current_setting(
    'app.visaflow_internal_snapshot_save',
    true
  );
  target_submission_id text;
begin
  if auth.uid() is null then
    raise exception 'Для сохранения подачи нужно войти в систему'
      using errcode = '28000';
  end if;

  if actor_role is distinct from 'agent' then
    raise exception 'Сохранять черновик подачи может только подтверждённый агент'
      using errcode = '42501';
  end if;
  if client_contract_version not in (1, 2) then
    raise exception 'Неподдерживаемая версия контракта сохранения'
      using errcode = '23514';
  end if;

  target_submission_id := nullif(trim(payload -> 'submission' ->> 'id'), '');
  if target_submission_id is null then
    raise exception 'Некорректный идентификатор подачи'
      using errcode = '23514';
  end if;

  select submission.case_revision
  into current_revision
  from public.submissions as submission
  where submission.id = target_submission_id
  for update;

  if found then
    if client_contract_version >= 2
      and not payload ? 'expected_case_revision'
    then
      raise exception 'Для существующей подачи требуется актуальная revision'
        using errcode = '23514';
    end if;
    if payload ? 'expected_case_revision' then
      begin
        expected_revision := (payload ->> 'expected_case_revision')::bigint;
      exception when invalid_text_representation or numeric_value_out_of_range then
        raise exception 'Некорректная expected revision подачи'
          using errcode = '23514';
      end;
      if current_revision is distinct from expected_revision then
        raise exception 'V19_AGENT_SUBMISSION_CONFLICT: submission % changed from revision % to %',
          target_submission_id,
          expected_revision,
          current_revision
          using errcode = '40001';
      end if;
    end if;
  elsif payload ? 'expected_case_revision' then
    raise exception 'V19_AGENT_SUBMISSION_CONFLICT: submission % no longer exists',
      target_submission_id
      using errcode = '40001';
  end if;

  if client_contract_version = 1 and exists (
    select 1
    from jsonb_array_elements(
      coalesce(payload -> 'corrections', '[]'::jsonb)
    ) as requested(item)
    where requested.item ? 'agent_confirmed_revision'
       or requested.item ? 'target_revision'
  ) then
    raise exception 'Подтверждения исправлений требуют revision-checked контракта'
      using errcode = '23514';
  end if;
  if client_contract_version = 1 then
    raise log 'V19_LEGACY_DRAFT_CONTRACT submission=%', target_submission_id;
  end if;
  if exists (
    select 1
    from jsonb_array_elements(
      coalesce(payload -> 'corrections', '[]'::jsonb)
    ) as requested(item)
    join public.corrections as correction
      on correction.id = (requested.item ->> 'id')::uuid
     and correction.submission_id = target_submission_id
     and correction.status = 'open'
    where requested.item ->> 'status' = 'fixed'
  ) then
    raise exception 'Исправленные замечания отправляются только через handoff'
      using errcode = '23514';
  end if;

  perform set_config('app.visaflow_internal_snapshot_save', 'on', true);
  persisted_result := app_private.dispatch_submission_draft_with_revision_context(
    payload - 'expected_case_revision' - 'client_contract_version'
  );

  if client_contract_version >= 2 then
    for correction_payload in
      select value
      from jsonb_array_elements(
        coalesce(payload -> 'corrections', '[]'::jsonb)
      )
    loop
      update public.corrections
      set
        target_revision =
          coalesce((correction_payload ->> 'target_revision')::bigint, 0),
        agent_confirmed_at = case
          when correction_payload ->> 'agent_confirmed_revision' is null then null
          else confirmation_time
        end,
        agent_confirmed_revision =
          (correction_payload ->> 'agent_confirmed_revision')::bigint
      where id = (correction_payload ->> 'id')::uuid
        and corrections.submission_id = target_submission_id
        and corrections.status = 'open';
    end loop;
  end if;

  select submission.case_revision
  into current_revision
  from public.submissions as submission
  where submission.id = target_submission_id;

  perform set_config(
    'app.visaflow_internal_snapshot_save',
    coalesce(previous_snapshot_save_context, ''),
    true
  );
  return persisted_result || jsonb_build_object('caseRevision', current_revision);
exception when others then
  perform set_config(
    'app.visaflow_internal_snapshot_save',
    coalesce(previous_snapshot_save_context, ''),
    true
  );
  raise;
end;
$function$;

revoke all on function public.save_submission_draft(jsonb)
  from public, anon, authenticated;
grant execute on function public.save_submission_draft(jsonb)
  to authenticated;

do $migration$
declare
  internal_definition text := pg_get_functiondef(
    'app_private.save_submission_draft_for_internal_dispatch(jsonb)'::regprocedure
  );
  public_definition text := pg_get_functiondef(
    'public.save_submission_draft(jsonb)'::regprocedure
  );
begin
  if to_regprocedure(
    'app_private.save_submission_draft_without_questionnaire_rows(jsonb)'
  ) is null
    or to_regprocedure(
      'app_private.dispatch_submission_draft_with_revision_context(jsonb)'
    ) is null
  then
    raise exception 'Required draft persistence callee is missing';
  end if;
  if position(
    'dispatch_submission_draft_with_revision_context' in internal_definition
  ) > 0 then
    raise exception 'Internal draft persistence dispatch is recursively wrapped';
  end if;
  if position(
    'save_submission_draft_without_questionnaire_rows' in internal_definition
  ) = 0 then
    raise exception 'Internal draft persistence implementation is incomplete';
  end if;
  if position('expected_case_revision' in public_definition) = 0
    or position(
      'dispatch_submission_draft_with_revision_context' in public_definition
    ) = 0
  then
    raise exception 'Public draft RPC did not restore revision-checked dispatch';
  end if;
  if exists (
    select 1
    from pg_proc
    where oid in (
      'app_private.save_submission_draft_for_internal_dispatch(jsonb)'::regprocedure,
      'public.save_submission_draft(jsonb)'::regprocedure
    )
      and prosecdef
  ) then
    raise exception 'Draft persistence functions must remain SECURITY INVOKER';
  end if;
  if has_function_privilege(
    'anon',
    'public.save_submission_draft(jsonb)'::regprocedure,
    'EXECUTE'
  ) then
    raise exception 'Anonymous draft RPC execution is enabled';
  end if;
  if not has_function_privilege(
    'authenticated',
    'public.save_submission_draft(jsonb)'::regprocedure,
    'EXECUTE'
  ) then
    raise exception 'Authenticated draft RPC execution is missing';
  end if;
end;
$migration$;

commit;

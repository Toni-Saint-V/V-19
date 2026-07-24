begin;

alter table public.corrections
  add column if not exists target_revision bigint not null default 0,
  add column if not exists agent_confirmed_at timestamptz,
  add column if not exists agent_confirmed_revision bigint;

alter table public.corrections
  drop constraint if exists corrections_target_revision_nonnegative_check,
  drop constraint if exists corrections_agent_confirmation_pair_check;

alter table public.corrections
  add constraint corrections_target_revision_nonnegative_check
    check (target_revision >= 0),
  add constraint corrections_agent_confirmation_pair_check
    check (
      (
        agent_confirmed_at is null
        and agent_confirmed_revision is null
      )
      or
      (
        agent_confirmed_at is not null
        and agent_confirmed_revision is not null
        and agent_confirmed_revision >= 0
        and agent_confirmed_revision <= target_revision
      )
    );

comment on column public.corrections.target_revision is
  'Monotonic revision of the correction target. Stale agent snapshots cannot decrease it.';
comment on column public.corrections.agent_confirmed_at is
  'Server timestamp of the assigned agent confirmation.';
comment on column public.corrections.agent_confirmed_revision is
  'Target revision explicitly confirmed by the assigned agent.';

create or replace function app_private.enforce_agent_correction_target_revision()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, app_private
as $function$
begin
  if app_private.current_profile_role() = 'agent' then
    if new.applicant_id is distinct from old.applicant_id
      or new.scope is distinct from old.scope
      or new.field_key is distinct from old.field_key
      or new.media_type is distinct from old.media_type
      or new.reason is distinct from old.reason
      or new.severity is distinct from old.severity
      or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at
    then
      raise exception 'Агент не может изменять содержание замечания'
        using errcode = '42501';
    end if;

    if old.status <> 'open' and new.status is distinct from old.status then
      raise exception 'Закрытое замечание нельзя вернуть в работу'
        using errcode = '23514';
    end if;
    if old.status <> 'open' and new.fixed_at is distinct from old.fixed_at then
      raise exception 'Нельзя изменять дату ранее обработанного замечания'
        using errcode = '23514';
    end if;
    if old.status <> 'open' and (
      new.target_revision is distinct from old.target_revision
      or new.agent_confirmed_at is distinct from old.agent_confirmed_at
      or new.agent_confirmed_revision
        is distinct from old.agent_confirmed_revision
    ) then
      raise exception 'Нельзя изменять подтверждение ранее обработанного замечания'
        using errcode = '23514';
    end if;
    if old.status = 'open' and new.status not in ('open', 'fixed') then
      raise exception 'Агент может только сохранить или исправить открытое замечание'
        using errcode = '23514';
    end if;
    if old.status = 'open' and new.status = 'fixed' then
      new.fixed_at := clock_timestamp();
    elsif old.status = 'open' and new.fixed_at is distinct from old.fixed_at then
      raise exception 'Дата исправления назначается сервером'
        using errcode = '23514';
    end if;

    if new.target_revision < old.target_revision then
      raise exception 'V19_AGENT_SUBMISSION_CONFLICT: correction target revision cannot move backwards'
        using errcode = '40001';
    end if;

    if new.agent_confirmed_revision is not null
      and new.agent_confirmed_revision <> new.target_revision
    then
      raise exception 'Подтверждение исправления устарело. Обновите подачу и повторите'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$function$;

revoke all on function app_private.enforce_agent_correction_target_revision()
  from public, anon, authenticated;

drop trigger if exists corrections_agent_target_revision_guard
  on public.corrections;
create trigger corrections_agent_target_revision_guard
before update on public.corrections
for each row execute function app_private.enforce_agent_correction_target_revision();

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
    from jsonb_array_elements(coalesce(payload -> 'corrections', '[]'::jsonb))
      as requested(item)
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
    from jsonb_array_elements(coalesce(payload -> 'corrections', '[]'::jsonb))
      as requested(item)
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
      from jsonb_array_elements(coalesce(payload -> 'corrections', '[]'::jsonb))
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

create or replace function public.submit_corrections_handoff(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, app_private
as $function$
declare
  actor_role public.profile_role := app_private.current_profile_role();
  confirmation_time timestamptz := clock_timestamp();
  correction_payload jsonb;
  current_revision bigint;
  expected_revision bigint;
  existing_submission record;
  final_payload jsonb;
  preparation_payload jsonb;
  matching_open_payload_count integer := 0;
  open_correction_count integer := 0;
  persisted_result jsonb;
  previous_snapshot_save_context text := current_setting(
    'app.visaflow_internal_snapshot_save',
    true
  );
  submission_record record;
  target_submission_id text;
begin
  if auth.uid() is null then
    raise exception 'Для отправки исправлений нужно войти в систему'
      using errcode = '28000';
  end if;
  if actor_role is distinct from 'agent' then
    raise exception 'Отправить исправления может только назначенный агент'
      using errcode = '42501';
  end if;
  if (payload ->> 'client_contract_version')::integer is distinct from 2 then
    raise exception 'Отправка исправлений требует revision-checked контракта'
      using errcode = '23514';
  end if;

  select *
  into submission_record
  from jsonb_to_record(payload -> 'submission') as submission_payload (
    id text,
    agent_id uuid,
    status public.submission_status
  );
  target_submission_id := submission_record.id;

  if target_submission_id is null or submission_record.agent_id is null then
    raise exception 'В payload отсутствует подача'
      using errcode = '23514';
  end if;
  if submission_record.status <> 'waiting_review' then
    raise exception 'Исправления должны переводить подачу на проверку'
      using errcode = '23514';
  end if;
  if submission_record.agent_id <> auth.uid() then
    raise exception 'Отправить исправления может только назначенный агент'
      using errcode = '42501';
  end if;

  select submission.id, submission.agent_id, submission.status,
         submission.case_revision
  into existing_submission
  from public.submissions as submission
  where submission.id = target_submission_id
  for update;

  if not found then
    raise exception 'Подача для отправки исправлений не найдена'
      using errcode = '23514';
  end if;
  if existing_submission.agent_id <> submission_record.agent_id then
    raise exception 'Нельзя изменить назначенного агента при отправке исправлений'
      using errcode = '42501';
  end if;
  if existing_submission.status <> 'returned' then
    raise exception 'Исправления можно отправить только для возвращённой подачи'
      using errcode = '42501';
  end if;

  if not payload ? 'expected_case_revision' then
    raise exception 'Для отправки исправлений требуется актуальная revision'
      using errcode = '23514';
  end if;
  begin
    expected_revision := (payload ->> 'expected_case_revision')::bigint;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Некорректная expected revision подачи'
      using errcode = '23514';
  end;
  if existing_submission.case_revision is distinct from expected_revision then
    raise exception 'V19_AGENT_SUBMISSION_CONFLICT: submission % changed from revision % to %',
      target_submission_id,
      expected_revision,
      existing_submission.case_revision
      using errcode = '40001';
  end if;

  perform correction.id
  from public.corrections as correction
  where correction.submission_id = target_submission_id
  order by correction.id
  for update;

  select count(*)
  into open_correction_count
  from public.corrections as correction
  where correction.submission_id = target_submission_id
    and correction.status = 'open';

  if open_correction_count = 0 then
    raise exception 'У возвращённой подачи нет открытых замечаний'
      using errcode = '23514';
  end if;

  select count(*)
  into matching_open_payload_count
  from jsonb_array_elements(coalesce(payload -> 'corrections', '[]'::jsonb))
    as requested(item)
  join public.corrections as correction
    on correction.id = (requested.item ->> 'id')::uuid
   and correction.submission_id = target_submission_id
   and correction.status = 'open'
  where requested.item ->> 'status' = 'fixed'
    and requested.item ->> 'agent_confirmed_at' is not null
    and requested.item ->> 'agent_confirmed_revision' is not null
    and (requested.item ->> 'target_revision')::bigint =
        (requested.item ->> 'agent_confirmed_revision')::bigint;

  if matching_open_payload_count <> open_correction_count then
    raise exception 'Нужно сохранить исправление по каждому открытому замечанию'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(payload -> 'corrections', '[]'::jsonb))
      as requested(item)
    group by requested.item ->> 'id'
    having count(*) <> 1
  ) then
    raise exception 'Payload содержит дубли замечаний'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(payload -> 'corrections', '[]'::jsonb))
      as requested(item)
    left join public.corrections as correction
      on correction.id = (requested.item ->> 'id')::uuid
     and correction.submission_id = target_submission_id
    where correction.id is null
  ) then
    raise exception 'Payload содержит неизвестное замечание'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(payload -> 'corrections', '[]'::jsonb))
      as requested(item)
    join public.corrections as correction
      on correction.id = (requested.item ->> 'id')::uuid
     and correction.submission_id = target_submission_id
    where correction.status <> 'open'
      and (
        requested.item ->> 'status' is distinct from correction.status::text
        or requested.item ->> 'submission_id'
          is distinct from correction.submission_id::text
        or requested.item ->> 'applicant_id'
          is distinct from correction.applicant_id::text
        or requested.item ->> 'scope' is distinct from correction.scope::text
        or requested.item ->> 'field_key'
          is distinct from correction.field_key
        or requested.item ->> 'media_type'
          is distinct from correction.media_type::text
        or requested.item ->> 'reason' is distinct from correction.reason
        or requested.item ->> 'severity' is distinct from correction.severity
        or (requested.item ->> 'fixed_at')::timestamptz
          is distinct from correction.fixed_at
        or (requested.item ->> 'target_revision')::bigint
          is distinct from correction.target_revision
        or (requested.item ->> 'agent_confirmed_revision')::bigint
          is distinct from correction.agent_confirmed_revision
        or (requested.item ->> 'agent_confirmed_at')::timestamptz
          is distinct from correction.agent_confirmed_at
      )
  ) then
    raise exception 'Нельзя изменять ранее обработанные замечания'
      using errcode = '23514';
  end if;

  preparation_payload := jsonb_set(
    jsonb_set(
      payload - 'expected_case_revision' - 'client_contract_version',
      '{submission,status}',
      to_jsonb('returned'::text),
      false
    ),
    '{corrections}',
    '[]'::jsonb,
    true
  );
  perform set_config('app.visaflow_internal_snapshot_save', 'on', true);
  perform app_private.dispatch_submission_draft_with_revision_context(
    preparation_payload
  );

  for correction_payload in
    select value
    from jsonb_array_elements(coalesce(payload -> 'corrections', '[]'::jsonb))
  loop
    update public.corrections
    set
      status = 'fixed',
      target_revision =
        coalesce((correction_payload ->> 'target_revision')::bigint, 0),
      agent_confirmed_at = confirmation_time,
      agent_confirmed_revision =
        (correction_payload ->> 'agent_confirmed_revision')::bigint
    where id = (correction_payload ->> 'id')::uuid
      and corrections.submission_id = target_submission_id
      and corrections.status = 'open';
  end loop;

  final_payload := jsonb_set(
    payload - 'expected_case_revision' - 'client_contract_version',
    '{corrections}',
    '[]'::jsonb,
    true
  );

  persisted_result := app_private.dispatch_submission_draft_with_revision_context(
    final_payload
  );

  if exists (
    select 1
    from public.corrections as correction
    where correction.submission_id = target_submission_id
      and correction.status = 'open'
  ) then
    raise exception 'Не все открытые замечания были отправлены'
      using errcode = '23514';
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

revoke all on function public.submit_corrections_handoff(jsonb)
  from public, anon, authenticated;
grant execute on function public.submit_corrections_handoff(jsonb)
  to authenticated;

commit;

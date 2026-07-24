begin;

alter table public.corrections
  add column if not exists target_section_id text,
  add column if not exists target_field_id text,
  add column if not exists target_baseline jsonb,
  add column if not exists target_projection jsonb;

comment on column public.corrections.target_section_id is
  'Stable questionnaire section id for a field correction. Display labels are not identity.';
comment on column public.corrections.target_field_id is
  'Stable questionnaire field id for a field correction. Display labels are not identity.';
comment on column public.corrections.target_baseline is
  'Server-owned semantic target projection captured when the correction target is assigned.';
comment on column public.corrections.target_projection is
  'Latest server-owned semantic target projection used to advance target_revision monotonically.';

create or replace function app_private.questionnaire_answer_text(answer jsonb)
returns text
language sql
immutable
set search_path = pg_catalog
as $function$
  select btrim(
    coalesce(
      case
        when answer is null or answer = 'null'::jsonb then ''
        when jsonb_typeof(answer) = 'string' then answer #>> '{}'
        when jsonb_typeof(answer) = 'object' and answer ? 'value' then
          case
            when jsonb_typeof(answer -> 'value') = 'string'
              then answer ->> 'value'
            when answer -> 'value' is null or answer -> 'value' = 'null'::jsonb
              then ''
            else (answer -> 'value')::text
          end
        else answer::text
      end,
      ''
    )
  );
$function$;

create or replace function app_private.questionnaire_value(
  target_applicant_id text,
  target_field_id text
)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $function$
  select app_private.questionnaire_answer_text(answer.value)
  from public.questionnaire_answers as answer
  where answer.applicant_id = target_applicant_id
    and answer.field_id = target_field_id
  order by answer.updated_at desc, answer.id
  limit 1;
$function$;

create or replace function app_private.questionnaire_date(value text)
returns date
language plpgsql
immutable
set search_path = pg_catalog
as $function$
declare
  date_parts text[];
begin
  date_parts := regexp_match(
    btrim(coalesce(value, '')),
    '^([0-9]{2})[.-]([0-9]{2})[.-]([0-9]{4})$'
  );
  if date_parts is not null then
    return make_date(
      date_parts[3]::integer,
      date_parts[2]::integer,
      date_parts[1]::integer
    );
  end if;
  date_parts := regexp_match(
    btrim(coalesce(value, '')),
    '^([0-9]{4})-([0-9]{2})-([0-9]{2})$'
  );
  if date_parts is not null then
    return make_date(
      date_parts[1]::integer,
      date_parts[2]::integer,
      date_parts[3]::integer
    );
  end if;
  return null;
exception when datetime_field_overflow or invalid_datetime_format then
  return null;
end;
$function$;

create or replace function app_private.questionnaire_field_validation_error(
  target_applicant_id text,
  target_field_id text
)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $function$
declare
  answer_label text;
  answer_value text;
  arrival_date date;
  departure_date date;
  desired_date_1 date;
  desired_date_2 date;
  passport_expiry date;
  passport_issue date;
  birth_date date;
  travel_start date;
begin
  select
    answer.label,
    app_private.questionnaire_answer_text(answer.value)
  into answer_label, answer_value
  from public.questionnaire_answers as answer
  where answer.applicant_id = target_applicant_id
    and answer.field_id = target_field_id
  order by answer.updated_at desc, answer.id
  limit 1;

  if not found then
    return 'Поле анкеты не найдено. Обновите подачу и повторите действие.';
  end if;
  if answer_value = '' then
    return null;
  end if;

  if target_field_id = 'email'
    or lower(answer_label) like '%email%'
  then
    if answer_value !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
      return 'Проверьте формат email';
    end if;
  end if;

  if target_field_id like '%phone%'
    or target_field_id = 'contact-number'
    or lower(answer_label) like '%телефон%'
  then
    if length(regexp_replace(answer_value, '[^0-9]', '', 'g')) not between 7 and 18 then
      return 'Проверьте номер телефона';
    end if;
  end if;

  if target_field_id like '%date%'
    or target_field_id like '%valid%'
    or target_field_id like '%expiry%'
    or target_field_id like '%expires%'
    or lower(answer_label) like '%дата%'
    or lower(answer_label) like '%действител%'
  then
    if app_private.questionnaire_date(answer_value) is null then
      return 'Дата должна быть в формате ДД.ММ.ГГГГ';
    end if;
  end if;

  if target_field_id = 'passport-no'
    and regexp_replace(answer_value, '[[:space:]]', '', 'g')
      !~ '^[A-Za-zА-Яа-я0-9-]{5,20}$'
  then
    return 'Проверьте номер паспорта';
  end if;

  if target_field_id in ('postal-code', 'hotel-postal-code')
    and answer_value !~* '^[A-Z0-9][A-Z0-9[:space:]-]{1,14}[A-Z0-9]$'
  then
    return 'Введите индекс: 3–16 букв или цифр, можно пробел и дефис';
  end if;

  birth_date := app_private.questionnaire_date(
    app_private.questionnaire_value(target_applicant_id, 'birth-date')
  );
  travel_start := app_private.questionnaire_date(
    app_private.questionnaire_value(target_applicant_id, 'arrival-date')
  );
  if target_field_id = 'birth-date'
    and birth_date is not null
    and travel_start is not null
    and birth_date >= travel_start
  then
    return 'Дата рождения должна быть раньше даты поездки';
  end if;

  passport_issue := app_private.questionnaire_date(
    app_private.questionnaire_value(target_applicant_id, 'passport-issue-date')
  );
  passport_expiry := app_private.questionnaire_date(
    app_private.questionnaire_value(target_applicant_id, 'passport-expiry-date')
  );
  departure_date := app_private.questionnaire_date(
    app_private.questionnaire_value(target_applicant_id, 'departure-date')
  );
  if target_field_id in ('passport-issue-date', 'passport-expiry-date')
    and passport_issue is not null
    and passport_expiry is not null
    and passport_issue >= passport_expiry
  then
    return 'Дата выдачи должна быть раньше даты окончания';
  end if;
  if target_field_id = 'passport-expiry-date'
    and passport_expiry is not null
    and departure_date is not null
    and passport_expiry < departure_date
  then
    return 'Паспорт должен быть действителен на дату выезда';
  end if;

  arrival_date := app_private.questionnaire_date(
    app_private.questionnaire_value(target_applicant_id, 'arrival-date')
  );
  if target_field_id in ('arrival-date', 'departure-date')
    and arrival_date is not null
    and departure_date is not null
    and departure_date < arrival_date
  then
    return 'Дата выезда должна быть не раньше даты въезда';
  end if;

  desired_date_1 := app_private.questionnaire_date(
    app_private.questionnaire_value(target_applicant_id, 'desired-date-1')
  );
  desired_date_2 := app_private.questionnaire_date(
    app_private.questionnaire_value(target_applicant_id, 'desired-date-2')
  );
  if target_field_id in ('desired-date-1', 'desired-date-2')
    and desired_date_1 is not null
    and desired_date_2 is not null
    and desired_date_2 < desired_date_1
  then
    return 'Конец интервала должен быть не раньше начала';
  end if;

  return null;
end;
$function$;

revoke all on function app_private.questionnaire_answer_text(jsonb)
  from public, anon, authenticated;
revoke all on function app_private.questionnaire_value(text, text)
  from public, anon, authenticated;
revoke all on function app_private.questionnaire_date(text)
  from public, anon, authenticated;
revoke all on function app_private.questionnaire_field_validation_error(text, text)
  from public, anon, authenticated;

create or replace function app_private.submission_questionnaire_validation_error(
  target_submission_id text
)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $function$
declare
  applicant_record record;
  answer_record record;
  validation_error text;
  required_field_id text;
  required_fields text[];
  occupation_value text;
  purpose_value text;
  inviting_party_value text;
  residence_value text;
  biometrics_value text;
  payment_sponsor_value text;
  sponsor_in_host_value text;
  filler_started boolean;
  eu_group_started boolean;
begin
  if not exists (
    select 1
    from public.applicants as applicant
    where applicant.submission_id = target_submission_id
  ) then
    return 'Добавьте заявителя перед отправкой на проверку.';
  end if;

  for applicant_record in
    select applicant.id, applicant.role
    from public.applicants as applicant
    where applicant.submission_id = target_submission_id
    order by applicant.id
  loop
    required_fields := array[
      'home-country',
      'home-city',
      'home-street',
      'home-house',
      'postal-code',
      'email',
      'contact-number',
      'lives-outside-citizenship',
      'purpose',
      'main-destination',
      'first-entry-country',
      'entry-count',
      'arrival-date',
      'departure-date',
      'previous-biometrics',
      'inviting-party-type',
      'hotel-name',
      'hotel-address',
      'hotel-country',
      'hotel-city',
      'hotel-postal-code',
      'appointment-city',
      'desired-date-1',
      'desired-date-2',
      'surname',
      'first-name',
      'birth-date',
      'birth-place',
      'birth-country',
      'gender',
      'marital-status',
      'passport-type',
      'passport-no',
      'passport-issue-date',
      'passport-expiry-date',
      'passport-issue-country',
      'passport-issue-place',
      'occupation'
    ];

    residence_value := lower(
      app_private.questionnaire_value(
        applicant_record.id,
        'lives-outside-citizenship'
      )
    );
    if residence_value in ('да', 'yes', 'true') then
      required_fields := required_fields || array[
        'residence-permit-type',
        'residence-permit-number',
        'residence-permit-valid-until'
      ];
    end if;

    occupation_value := upper(
      app_private.questionnaire_value(applicant_record.id, 'occupation')
    );
    if occupation_value in ('OTHER', 'ДРУГОЕ') then
      required_fields := required_fields || array['occupation-specify'];
    end if;
    if occupation_value <> ''
      and occupation_value not in (
        'HOUSEWIFE',
        'MINOR',
        'PENSIONER',
        'RETIRED',
        'UNEMPLOYED'
      )
    then
      required_fields := required_fields || array[
        'employer-name',
        'employer-contact',
        'employer-address'
      ];
    end if;

    purpose_value := upper(
      app_private.questionnaire_value(applicant_record.id, 'purpose')
    );
    if purpose_value in ('OTHER', 'ДРУГОЕ') then
      required_fields := required_fields || array['stay-purpose-details'];
    end if;

    biometrics_value := lower(
      app_private.questionnaire_value(applicant_record.id, 'previous-biometrics')
    );
    if biometrics_value in ('да', 'yes', 'true') then
      required_fields := required_fields || array['previous-biometrics-date'];
    end if;

    inviting_party_value := lower(
      app_private.questionnaire_value(applicant_record.id, 'inviting-party-type')
    );
    if purpose_value in (
      'BUSINESS',
      'CULTURAL',
      'MEDICAL TREATMENT',
      'OFFICIAL VISIT',
      'SPORTS',
      'STUDY'
    )
      or inviting_party_value like '%компан%'
      or inviting_party_value like '%организац%'
    then
      required_fields := required_fields || array[
        'company-org-details',
        'company-contact-person',
        'company-phone'
      ];
    end if;

    payment_sponsor_value := lower(
      app_private.questionnaire_value(applicant_record.id, 'cost-covered-by')
    );
    if payment_sponsor_value like '%спонсор%'
      or payment_sponsor_value like '%sponsor%'
    then
      required_fields := required_fields || array[
        'sponsor-in-host-fields',
        'sponsor-means'
      ];
      sponsor_in_host_value := lower(
        app_private.questionnaire_value(
          applicant_record.id,
          'sponsor-in-host-fields'
        )
      );
      if sponsor_in_host_value in ('нет', 'no', 'false') then
        required_fields := required_fields || array['other-sponsor'];
      end if;
    else
      required_fields := required_fields || array['means-of-support'];
    end if;

    filler_started :=
      app_private.questionnaire_value(applicant_record.id, 'form-filler-name') <> ''
      or app_private.questionnaire_value(
        applicant_record.id,
        'form-filler-contact'
      ) <> ''
      or app_private.questionnaire_value(
        applicant_record.id,
        'form-filler-phone'
      ) <> '';
    if filler_started then
      required_fields := required_fields || array[
        'form-filler-name',
        'form-filler-contact',
        'form-filler-phone'
      ];
    end if;

    eu_group_started :=
      app_private.questionnaire_value(
        applicant_record.id,
        'eu-relative-details'
      ) <> ''
      or app_private.questionnaire_value(
        applicant_record.id,
        'eu-relationship'
      ) <> '';
    if eu_group_started then
      required_fields := required_fields || array[
        'eu-relative-details',
        'eu-relationship'
      ];
    end if;

    foreach required_field_id in array required_fields
    loop
      if coalesce(
        app_private.questionnaire_value(
          applicant_record.id,
          required_field_id
        ),
        ''
      ) = '' then
        return 'Заполните все обязательные поля анкеты.';
      end if;
    end loop;

    for answer_record in
      select distinct answer.field_id
      from public.questionnaire_answers as answer
      where answer.submission_id = target_submission_id
        and answer.applicant_id = applicant_record.id
      order by answer.field_id
    loop
      validation_error :=
        app_private.questionnaire_field_validation_error(
          applicant_record.id,
          answer_record.field_id
        );
      if validation_error is not null then
        return validation_error;
      end if;
    end loop;
  end loop;

  return null;
end;
$function$;

revoke all on function app_private.submission_questionnaire_validation_error(text)
  from public, anon, authenticated;

create or replace function app_private.correction_target_projection(
  correction_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $function$
declare
  correction_record record;
  answer_value text;
  media_record record;
begin
  select *
  into correction_record
  from public.corrections as correction
  where correction.id = correction_id;

  if not found then
    return null;
  end if;

  if correction_record.scope = 'field' then
    if correction_record.applicant_id is null
      or correction_record.target_section_id is null
      or correction_record.target_field_id is null
    then
      return null;
    end if;
    select app_private.questionnaire_answer_text(answer.value)
    into answer_value
    from public.questionnaire_answers as answer
    where answer.submission_id = correction_record.submission_id
      and answer.applicant_id = correction_record.applicant_id
      and answer.section_id = correction_record.target_section_id
      and answer.field_id = correction_record.target_field_id;
    return jsonb_build_object(
      'kind',
      'field',
      'sectionId',
      correction_record.target_section_id,
      'fieldId',
      correction_record.target_field_id,
      'value',
      answer_value
    );
  end if;

  if correction_record.scope = 'media' then
    select
      media.storage_bucket,
      media.storage_path,
      media.mime_type,
      media.size_bytes,
      media.upload_status,
      media.original_file_name,
      media.generated_file_name
    into media_record
    from public.media_assets as media
    where media.submission_id = correction_record.submission_id
      and media.applicant_id = correction_record.applicant_id
      and media.type = correction_record.media_type;
    return jsonb_build_object(
      'kind',
      'media',
      'type',
      correction_record.media_type,
      'storageBucket',
      media_record.storage_bucket,
      'storagePath',
      media_record.storage_path,
      'mimeType',
      media_record.mime_type,
      'sizeBytes',
      media_record.size_bytes,
      'uploadStatus',
      media_record.upload_status,
      'originalFileName',
      media_record.original_file_name,
      'generatedFileName',
      media_record.generated_file_name
    );
  end if;

  return jsonb_build_object(
    'kind',
    correction_record.scope,
    'submissionId',
    correction_record.submission_id,
    'applicantId',
    correction_record.applicant_id
  );
end;
$function$;

revoke all on function app_private.correction_target_projection(uuid)
  from public, anon, authenticated;

alter table public.corrections
  drop constraint if exists corrections_target_field_identity_pair_check;
alter table public.corrections
  add constraint corrections_target_field_identity_pair_check
  check (
    (
      target_section_id is null
      and target_field_id is null
    )
    or
    (
      target_section_id is not null
      and target_field_id is not null
    )
  );

-- Maintenance-only metadata backfill. The canonical correction actor trigger
-- requires auth.uid(), which a migration intentionally does not have. Disable
-- exactly that trigger inside this transaction and suppress only the aggregate
-- child revision touch; any failure rolls both trigger state and data back.
alter table public.corrections
  disable trigger corrections_actor_guard;
select pg_catalog.set_config(
  'app.visaflow_internal_snapshot_save',
  'on',
  true
);

with field_matches as (
  select
    correction.id,
    min(answer.section_id) as target_section_id,
    min(answer.field_id) as target_field_id,
    count(answer.id) as match_count
  from public.corrections as correction
  left join public.questionnaire_answers as answer
    on answer.submission_id = correction.submission_id
   and answer.applicant_id = correction.applicant_id
   and answer.label = correction.field_key
  where correction.scope = 'field'
    and (
      correction.target_section_id is null
      or correction.target_field_id is null
    )
  group by correction.id
)
update public.corrections as correction
set
  target_section_id = field_matches.target_section_id,
  target_field_id = field_matches.target_field_id
from field_matches
where correction.id = field_matches.id
  and field_matches.match_count = 1;

update public.corrections as correction
set
  target_baseline =
    app_private.correction_target_projection(correction.id),
  target_projection =
    app_private.correction_target_projection(correction.id)
where correction.target_baseline is null
  and correction.target_projection is null
  and (
    correction.scope <> 'field'
    or (
      correction.target_section_id is not null
      and correction.target_field_id is not null
    )
  );

select pg_catalog.set_config(
  'app.visaflow_internal_snapshot_save',
  'off',
  true
);
alter table public.corrections
  enable trigger corrections_actor_guard;

create or replace function app_private.sync_correction_targets_from_payload(
  payload jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $function$
declare
  actor_role public.profile_role := app_private.current_profile_role();
  correction_item jsonb;
  correction_record record;
  correction_uuid uuid;
  projection jsonb;
  requested_field_id text;
  requested_section_id text;
  target_submission_id text :=
    nullif(btrim(payload -> 'submission' ->> 'id'), '');
begin
  if target_submission_id is null then
    raise exception 'Некорректный идентификатор подачи'
      using errcode = '23514';
  end if;
  if actor_role not in ('agent', 'admin') then
    raise exception 'Недостаточно прав для сохранения замечаний'
      using errcode = '42501';
  end if;
  if actor_role = 'agent' and not exists (
    select 1
    from public.submissions as submission
    where submission.id = target_submission_id
      and submission.agent_id = auth.uid()
  ) then
    raise exception 'Подача недоступна текущему агенту'
      using errcode = '42501';
  end if;

  for correction_item in
    select value
    from jsonb_array_elements(
      coalesce(payload -> 'corrections', '[]'::jsonb)
    )
  loop
    begin
      correction_uuid := (correction_item ->> 'id')::uuid;
    exception when invalid_text_representation then
      raise exception 'Некорректный идентификатор замечания'
        using errcode = '23514';
    end;

    select *
    into correction_record
    from public.corrections as correction
    where correction.id = correction_uuid
      and correction.submission_id = target_submission_id
    for update;
    if not found then
      raise exception 'Замечание не принадлежит выбранной подаче'
        using errcode = '23514';
    end if;

    requested_section_id :=
      nullif(btrim(correction_item ->> 'target_section_id'), '');
    requested_field_id :=
      nullif(btrim(correction_item ->> 'target_field_id'), '');

    if correction_record.scope = 'field' then
      if actor_role = 'agent' then
        if correction_record.target_section_id is null
          or correction_record.target_field_id is null
        then
          raise exception 'У замечания нет точной цели. Обратитесь к администратору.'
            using errcode = '23514';
        end if;
        if requested_section_id is not null
          and requested_section_id
            is distinct from correction_record.target_section_id
        then
          raise exception 'Нельзя изменить раздел замечания'
            using errcode = '42501';
        end if;
        if requested_field_id is not null
          and requested_field_id
            is distinct from correction_record.target_field_id
        then
          raise exception 'Нельзя изменить поле замечания'
            using errcode = '42501';
        end if;
      else
        if requested_section_id is null or requested_field_id is null then
          requested_section_id := correction_record.target_section_id;
          requested_field_id := correction_record.target_field_id;
        end if;
        if requested_section_id is null or requested_field_id is null then
          raise exception 'Для нового замечания укажите точное поле анкеты'
            using errcode = '23514';
        end if;
        if not exists (
          select 1
          from public.questionnaire_answers as answer
          where answer.submission_id = target_submission_id
            and answer.applicant_id = correction_record.applicant_id
            and answer.section_id = requested_section_id
            and answer.field_id = requested_field_id
        ) then
          raise exception 'Выбранное поле анкеты не найдено'
            using errcode = '23514';
        end if;
        if correction_record.target_section_id is distinct from requested_section_id
          or correction_record.target_field_id is distinct from requested_field_id
        then
          update public.corrections
          set
            target_section_id = requested_section_id,
            target_field_id = requested_field_id,
            target_revision = 0,
            target_baseline = null,
            target_projection = null,
            agent_confirmed_at = null,
            agent_confirmed_revision = null
          where id = correction_uuid;
        end if;
      end if;
    end if;

    select app_private.correction_target_projection(correction_uuid)
    into projection;
    if projection is null then
      raise exception 'Точная цель замечания не найдена'
        using errcode = '23514';
    end if;
    update public.corrections
    set
      target_baseline = projection,
      target_projection = projection,
      target_revision = 0,
      agent_confirmed_at = null,
      agent_confirmed_revision = null
    where id = correction_uuid
      and target_baseline is null
      and target_projection is null;
  end loop;
end;
$function$;

revoke all on function app_private.sync_correction_targets_from_payload(jsonb)
  from public, anon, authenticated;
grant execute on function app_private.sync_correction_targets_from_payload(jsonb)
  to authenticated;

create or replace function app_private.dispatch_submission_draft_with_revision_context(
  payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, app_private
as $function$
declare
  previous_bumped_submission_ids text := current_setting(
    'app.visaflow_snapshot_revision_bumped_ids',
    true
  );
  previous_snapshot_save_context text := current_setting(
    'app.visaflow_internal_snapshot_save',
    true
  );
  persisted_result jsonb;
begin
  perform set_config('app.visaflow_snapshot_revision_bumped_ids', '[]', true);
  perform set_config('app.visaflow_internal_snapshot_save', 'on', true);
  persisted_result :=
    app_private.save_submission_draft_for_internal_dispatch(payload);
  perform app_private.sync_correction_targets_from_payload(payload);
  perform set_config(
    'app.visaflow_internal_snapshot_save',
    coalesce(previous_snapshot_save_context, ''),
    true
  );
  perform set_config(
    'app.visaflow_snapshot_revision_bumped_ids',
    coalesce(previous_bumped_submission_ids, ''),
    true
  );
  return persisted_result;
exception when others then
  perform set_config(
    'app.visaflow_internal_snapshot_save',
    coalesce(previous_snapshot_save_context, ''),
    true
  );
  perform set_config(
    'app.visaflow_snapshot_revision_bumped_ids',
    coalesce(previous_bumped_submission_ids, ''),
    true
  );
  raise;
end;
$function$;

revoke all on function app_private.dispatch_submission_draft_with_revision_context(jsonb)
  from public, anon, authenticated;
grant execute on function app_private.dispatch_submission_draft_with_revision_context(jsonb)
  to authenticated;

create or replace function app_private.correction_target_validation_error(
  correction_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $function$
declare
  correction_record record;
begin
  select *
  into correction_record
  from public.corrections as correction
  where correction.id = correction_id;
  if not found then
    return 'Замечание не найдено. Обновите подачу и повторите действие.';
  end if;

  if correction_record.scope = 'field' then
    if correction_record.target_field_id is null
      or correction_record.target_section_id is null
    then
      return 'У замечания нет точной цели. Обратитесь к администратору.';
    end if;
    return app_private.questionnaire_field_validation_error(
      correction_record.applicant_id,
      correction_record.target_field_id
    );
  end if;

  if correction_record.scope = 'media' and not exists (
    select 1
    from public.media_assets as media
    where media.submission_id = correction_record.submission_id
      and media.applicant_id = correction_record.applicant_id
      and media.type = correction_record.media_type
      and media.storage_bucket = 'submission-media'
      and media.upload_status = 'uploaded'
      and media.review_status not in ('replace_required', 'poor_quality')
      and nullif(btrim(media.storage_path), '') is not null
      and nullif(btrim(coalesce(media.generated_file_name, '')), '') is not null
  ) then
    return 'Загрузите исправленный файл перед подтверждением.';
  end if;

  return null;
end;
$function$;

revoke all on function app_private.correction_target_validation_error(uuid)
  from public, anon, authenticated;

create or replace function app_private.enforce_agent_correction_target_revision()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $function$
declare
  server_refresh boolean;
  validation_error text;
begin
  if app_private.current_profile_role() = 'agent' then
    server_refresh :=
      pg_trigger_depth() > 1
      and new.status is not distinct from old.status
      and new.fixed_at is not distinct from old.fixed_at
      and new.target_section_id is not distinct from old.target_section_id
      and new.target_field_id is not distinct from old.target_field_id
      and new.target_baseline is not distinct from old.target_baseline
      and new.target_projection is distinct from old.target_projection
      and new.target_revision = old.target_revision + 1
      and new.agent_confirmed_at is null
      and new.agent_confirmed_revision is null;

    if server_refresh then
      return new;
    end if;

    if new.applicant_id is distinct from old.applicant_id
      or new.scope is distinct from old.scope
      or new.field_key is distinct from old.field_key
      or new.media_type is distinct from old.media_type
      or new.reason is distinct from old.reason
      or new.severity is distinct from old.severity
      or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at
      or new.target_section_id is distinct from old.target_section_id
      or new.target_field_id is distinct from old.target_field_id
      or new.target_baseline is distinct from old.target_baseline
      or new.target_projection is distinct from old.target_projection
    then
      raise exception 'Агент не может изменять содержание или точную цель замечания'
        using errcode = '42501';
    end if;

    if new.target_revision is distinct from old.target_revision then
      raise exception 'V19_AGENT_SUBMISSION_CONFLICT: revision цели назначается сервером'
        using errcode = '40001';
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
      new.agent_confirmed_at is distinct from old.agent_confirmed_at
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

    if new.agent_confirmed_revision is null then
      new.agent_confirmed_at := null;
    else
      if new.agent_confirmed_revision <> old.target_revision then
        raise exception 'Подтверждение исправления устарело. Обновите подачу и повторите'
          using errcode = '40001';
      end if;
      if old.target_baseline is null
        or old.target_projection is null
        or old.target_projection = old.target_baseline
      then
        raise exception 'Сначала измените объект замечания и сохраните исправление'
          using errcode = '23514';
      end if;
      validation_error :=
        app_private.correction_target_validation_error(old.id);
      if validation_error is not null then
        raise exception '%', validation_error
          using errcode = '23514';
      end if;
      new.agent_confirmed_at := clock_timestamp();
    end if;

    if old.status = 'open' and new.status = 'fixed' then
      if new.agent_confirmed_revision is null then
        raise exception 'Перед отправкой подтвердите исправление'
          using errcode = '23514';
      end if;
      new.fixed_at := clock_timestamp();
    elsif old.status = 'open' and new.fixed_at is distinct from old.fixed_at then
      raise exception 'Дата исправления назначается сервером'
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

create or replace function app_private.refresh_open_correction_target()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $function$
declare
  old_applicant_id text;
  old_field_id text;
  old_media_type public.media_slot_type;
  old_submission_id text;
  new_applicant_id text;
  new_field_id text;
  new_media_type public.media_slot_type;
  new_submission_id text;
begin
  if tg_table_name = 'questionnaire_answers' then
    if tg_op <> 'INSERT' then
      old_applicant_id := old.applicant_id;
      old_field_id := old.field_id;
      old_submission_id := old.submission_id;
    end if;
    if tg_op <> 'DELETE' then
      new_applicant_id := new.applicant_id;
      new_field_id := new.field_id;
      new_submission_id := new.submission_id;
    end if;
    if tg_op = 'UPDATE'
      and old.applicant_id is not distinct from new.applicant_id
      and old.field_id is not distinct from new.field_id
      and old.submission_id is not distinct from new.submission_id
      and old.value is not distinct from new.value
    then
      return new;
    end if;
  else
    if tg_op <> 'INSERT' then
      old_applicant_id := old.applicant_id;
      old_media_type := old.type;
      old_submission_id := old.submission_id;
    end if;
    if tg_op <> 'DELETE' then
      new_applicant_id := new.applicant_id;
      new_media_type := new.type;
      new_submission_id := new.submission_id;
    end if;
    if tg_op = 'UPDATE'
      and old.applicant_id is not distinct from new.applicant_id
      and old.type is not distinct from new.type
      and old.submission_id is not distinct from new.submission_id
      and old.storage_bucket is not distinct from new.storage_bucket
      and old.storage_path is not distinct from new.storage_path
      and old.mime_type is not distinct from new.mime_type
      and old.size_bytes is not distinct from new.size_bytes
      and old.upload_status is not distinct from new.upload_status
      and old.original_file_name is not distinct from new.original_file_name
      and old.generated_file_name is not distinct from new.generated_file_name
    then
      return new;
    end if;
  end if;

  with changed_target as (
    select
      correction.id,
      app_private.correction_target_projection(correction.id) as projection
    from public.corrections as correction
    where correction.status = 'open'
      and correction.target_baseline is not null
      and correction.target_projection is not null
      and (
        (
          tg_table_name = 'questionnaire_answers'
          and correction.scope = 'field'
          and (
            (
              correction.submission_id = old_submission_id
              and correction.applicant_id = old_applicant_id
              and correction.target_field_id = old_field_id
            )
            or
            (
              correction.submission_id = new_submission_id
              and correction.applicant_id = new_applicant_id
              and correction.target_field_id = new_field_id
            )
          )
        )
        or
        (
          tg_table_name = 'media_assets'
          and correction.scope = 'media'
          and (
            (
              correction.submission_id = old_submission_id
              and correction.applicant_id = old_applicant_id
              and correction.media_type = old_media_type
            )
            or
            (
              correction.submission_id = new_submission_id
              and correction.applicant_id = new_applicant_id
              and correction.media_type = new_media_type
            )
          )
        )
      )
  )
  update public.corrections as correction
  set
    target_projection = changed_target.projection,
    target_revision = correction.target_revision + 1,
    agent_confirmed_at = null,
    agent_confirmed_revision = null
  from changed_target
  where correction.id = changed_target.id
    and correction.target_projection is distinct from changed_target.projection;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

revoke all on function app_private.refresh_open_correction_target()
  from public, anon, authenticated;

drop trigger if exists questionnaire_answers_refresh_correction_targets
  on public.questionnaire_answers;
create trigger questionnaire_answers_refresh_correction_targets
after insert or update or delete on public.questionnaire_answers
for each row execute function app_private.refresh_open_correction_target();

drop trigger if exists media_assets_refresh_correction_targets
  on public.media_assets;
create trigger media_assets_refresh_correction_targets
after insert or update or delete on public.media_assets
for each row execute function app_private.refresh_open_correction_target();

create or replace function app_private.enforce_returned_questionnaire_readiness()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $function$
declare
  validation_error text;
begin
  if tg_op <> 'UPDATE'
    or old.status <> 'returned'
    or new.status not in ('ready_for_review', 'waiting_review')
  then
    return new;
  end if;

  validation_error :=
    app_private.submission_questionnaire_validation_error(new.id);
  if validation_error is not null then
    raise exception '%', validation_error
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.corrections as correction
    where correction.submission_id = new.id
      and correction.status = 'open'
  ) then
    raise exception 'Сохраните и подтвердите исправление по каждому замечанию'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.corrections as correction
    where correction.submission_id = new.id
      and correction.status = 'fixed'
      and (
        correction.agent_confirmed_at is null
        or correction.agent_confirmed_revision
          is distinct from correction.target_revision
        or correction.target_projection is not distinct from correction.target_baseline
      )
  ) then
    raise exception 'Одно из исправлений не подтверждено в актуальной версии'
      using errcode = '23514';
  end if;

  return new;
end;
$function$;

revoke all on function app_private.enforce_returned_questionnaire_readiness()
  from public, anon, authenticated;

drop trigger if exists submissions_returned_questionnaire_readiness_guard
  on public.submissions;
create trigger submissions_returned_questionnaire_readiness_guard
before update of status on public.submissions
for each row execute function app_private.enforce_returned_questionnaire_readiness();

do $migration$
declare
  dispatch_definition text;
begin
  if exists (
    select 1
    from public.corrections as correction
    where correction.status = 'open'
      and correction.scope = 'field'
      and (
        correction.target_section_id is null
        or correction.target_field_id is null
        or correction.target_baseline is null
        or correction.target_projection is null
      )
  ) then
    raise exception 'An open field correction has an ambiguous or missing server target';
  end if;

  if to_regprocedure(
    'app_private.sync_correction_targets_from_payload(jsonb)'
  ) is null
    or to_regprocedure(
      'app_private.correction_target_projection(uuid)'
    ) is null
    or to_regprocedure(
      'app_private.submission_questionnaire_validation_error(text)'
    ) is null
    or to_regprocedure(
      'app_private.dispatch_submission_draft_with_revision_context(jsonb)'
    ) is null
    or to_regprocedure('public.save_submission_draft(jsonb)') is null
    or to_regprocedure('public.submit_corrections_handoff(jsonb)') is null
  then
    raise exception 'Server-owned correction target boundary is incomplete';
  end if;

  dispatch_definition := pg_get_functiondef(
    'app_private.dispatch_submission_draft_with_revision_context(jsonb)'::regprocedure
  );
  if position(
    'sync_correction_targets_from_payload' in dispatch_definition
  ) = 0
    or position(
      'save_submission_draft_for_internal_dispatch' in dispatch_definition
    ) = 0
  then
    raise exception 'Draft dispatch does not synchronize server-owned correction targets';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc as proc
    where proc.oid in (
      'app_private.dispatch_submission_draft_with_revision_context(jsonb)'::regprocedure,
      'public.save_submission_draft(jsonb)'::regprocedure,
      'public.submit_corrections_handoff(jsonb)'::regprocedure
    )
      and proc.prosecdef
  ) then
    raise exception 'Public correction persistence boundary must remain SECURITY INVOKER';
  end if;

  if has_function_privilege(
    'anon',
    'public.save_submission_draft(jsonb)'::regprocedure,
    'EXECUTE'
  )
    or has_function_privilege(
      'anon',
      'public.submit_corrections_handoff(jsonb)'::regprocedure,
      'EXECUTE'
    )
  then
    raise exception 'Anonymous correction persistence execution is enabled';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.save_submission_draft(jsonb)'::regprocedure,
    'EXECUTE'
  )
    or not has_function_privilege(
      'authenticated',
      'public.submit_corrections_handoff(jsonb)'::regprocedure,
      'EXECUTE'
    )
  then
    raise exception 'Authenticated correction persistence execution is missing';
  end if;

  if exists (
    select required_trigger.name
    from (
      values
        ('corrections_agent_target_revision_guard'),
        ('questionnaire_answers_refresh_correction_targets'),
        ('media_assets_refresh_correction_targets'),
        ('submissions_returned_questionnaire_readiness_guard')
    ) as required_trigger(name)
    where not exists (
      select 1
      from pg_catalog.pg_trigger as trigger_info
      where trigger_info.tgname = required_trigger.name
        and trigger_info.tgenabled = 'O'
        and not trigger_info.tgisinternal
    )
  ) then
    raise exception 'A server-owned correction lifecycle trigger is missing or disabled';
  end if;
end;
$migration$;

commit;

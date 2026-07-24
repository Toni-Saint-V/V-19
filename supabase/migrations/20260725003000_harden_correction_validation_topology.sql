begin;

create or replace function app_private.questionnaire_field_is_required(
  target_applicant_id text,
  target_field_id text
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $function$
declare
  required_fields text[] := array[
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
  residence_value := lower(
    app_private.questionnaire_value(
      target_applicant_id,
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
    app_private.questionnaire_value(target_applicant_id, 'occupation')
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
    app_private.questionnaire_value(target_applicant_id, 'purpose')
  );
  if purpose_value in ('OTHER', 'ДРУГОЕ') then
    required_fields := required_fields || array['stay-purpose-details'];
  end if;

  biometrics_value := lower(
    app_private.questionnaire_value(
      target_applicant_id,
      'previous-biometrics'
    )
  );
  if biometrics_value in ('да', 'yes', 'true') then
    required_fields := required_fields || array['previous-biometrics-date'];
  end if;

  inviting_party_value := lower(
    app_private.questionnaire_value(
      target_applicant_id,
      'inviting-party-type'
    )
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
    app_private.questionnaire_value(target_applicant_id, 'cost-covered-by')
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
        target_applicant_id,
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
    app_private.questionnaire_value(
      target_applicant_id,
      'form-filler-name'
    ) <> ''
    or app_private.questionnaire_value(
      target_applicant_id,
      'form-filler-contact'
    ) <> ''
    or app_private.questionnaire_value(
      target_applicant_id,
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
      target_applicant_id,
      'eu-relative-details'
    ) <> ''
    or app_private.questionnaire_value(
      target_applicant_id,
      'eu-relationship'
    ) <> '';
  if eu_group_started then
    required_fields := required_fields || array[
      'eu-relative-details',
      'eu-relationship'
    ];
  end if;

  return target_field_id = any(required_fields);
end;
$function$;

revoke all on function app_private.questionnaire_field_is_required(text, text)
  from public, anon, authenticated;

alter function app_private.questionnaire_field_validation_error(text, text)
  rename to questionnaire_field_validation_error_value_v1;

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
  answer_json jsonb;
  answer_value text;
begin
  select answer.value
  into answer_json
  from public.questionnaire_answers as answer
  where answer.applicant_id = target_applicant_id
    and answer.field_id = target_field_id
  order by answer.updated_at desc, answer.id
  limit 1;

  if not found then
    return 'Поле анкеты не найдено. Обновите подачу и повторите действие.';
  end if;

  if jsonb_typeof(answer_json) = 'object'
    and answer_json ->> 'kind' = 'v19_questionnaire_field'
    and answer_json ->> 'version' = '1'
    and answer_json ->> 'reviewState' = 'needs_review'
  then
    return 'Подтвердите значение поля перед сохранением';
  end if;

  answer_value := app_private.questionnaire_answer_text(answer_json);
  if answer_value = ''
    and app_private.questionnaire_field_is_required(
      target_applicant_id,
      target_field_id
    )
  then
    return 'Обязательное поле';
  end if;

  return app_private.questionnaire_field_validation_error_value_v1(
    target_applicant_id,
    target_field_id
  );
end;
$function$;

revoke all on function app_private.questionnaire_field_validation_error(text, text)
  from public, anon, authenticated;
revoke all on function app_private.questionnaire_field_validation_error_value_v1(text, text)
  from public, anon, authenticated;

alter function app_private.correction_target_projection(uuid)
  rename to correction_target_projection_value_v1;

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
  answer_json jsonb;
  base_projection jsonb;
  review_state text := '';
begin
  base_projection :=
    app_private.correction_target_projection_value_v1(correction_id);
  if base_projection is null or base_projection ->> 'kind' <> 'field' then
    return base_projection;
  end if;

  select answer.value
  into answer_json
  from public.corrections as correction
  join public.questionnaire_answers as answer
    on answer.submission_id = correction.submission_id
   and answer.applicant_id = correction.applicant_id
   and answer.section_id = correction.target_section_id
   and answer.field_id = correction.target_field_id
  where correction.id = correction_id;

  if jsonb_typeof(answer_json) = 'object'
    and answer_json ->> 'kind' = 'v19_questionnaire_field'
    and answer_json ->> 'version' = '1'
  then
    review_state := coalesce(answer_json ->> 'reviewState', '');
  end if;

  return base_projection || jsonb_build_object('reviewState', review_state);
end;
$function$;

revoke all on function app_private.correction_target_projection(uuid)
  from public, anon, authenticated;
revoke all on function app_private.correction_target_projection_value_v1(uuid)
  from public, anon, authenticated;

-- Extend existing semantic projections without manufacturing a user change.
alter table public.corrections disable trigger corrections_actor_guard;
select pg_catalog.set_config(
  'app.visaflow_internal_snapshot_save',
  'on',
  true
);

update public.corrections as correction
set
  target_baseline = correction.target_baseline || jsonb_build_object(
    'reviewState',
    coalesce(
      app_private.correction_target_projection(correction.id)
        ->> 'reviewState',
      ''
    )
  ),
  target_projection =
    app_private.correction_target_projection(correction.id)
where correction.scope = 'field'
  and correction.target_baseline is not null
  and correction.target_projection is not null;

select pg_catalog.set_config(
  'app.visaflow_internal_snapshot_save',
  'off',
  true
);
alter table public.corrections enable trigger corrections_actor_guard;

create or replace function app_private.enforce_agent_correction_parent_status()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $function$
declare
  parent_status public.submission_status;
begin
  if app_private.current_profile_role() <> 'agent' then
    return new;
  end if;

  select submission.status
  into parent_status
  from public.submissions as submission
  where submission.id = old.submission_id
    and submission.agent_id = auth.uid()
  for share;

  if not found then
    raise exception 'Подача недоступна текущему агенту'
      using errcode = '42501';
  end if;
  if parent_status <> 'returned' then
    raise exception 'Исправления можно подтверждать только после возврата подачи'
      using errcode = '23514';
  end if;
  return new;
end;
$function$;

revoke all on function app_private.enforce_agent_correction_parent_status()
  from public, anon, authenticated;

drop trigger if exists corrections_agent_parent_status_guard
  on public.corrections;
create trigger corrections_agent_parent_status_guard
before update on public.corrections
for each row execute function app_private.enforce_agent_correction_parent_status();

alter function app_private.sync_correction_targets_from_payload(jsonb)
  rename to sync_correction_targets_from_payload_all_rows_v1;

create or replace function app_private.sync_correction_targets_from_payload(
  payload jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $function$
declare
  correction_item jsonb;
  correction_status text;
  correction_uuid uuid;
  open_items jsonb := '[]'::jsonb;
  filtered_payload jsonb;
  target_submission_id text :=
    nullif(btrim(payload -> 'submission' ->> 'id'), '');
begin
  if target_submission_id is null then
    raise exception 'Некорректный идентификатор подачи'
      using errcode = '23514';
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

    select correction.status
    into correction_status
    from public.corrections as correction
    where correction.id = correction_uuid
      and correction.submission_id = target_submission_id;
    if not found then
      raise exception 'Замечание не принадлежит выбранной подаче'
        using errcode = '23514';
    end if;

    if correction_status = 'open' then
      open_items := open_items || jsonb_build_array(correction_item);
    end if;
  end loop;

  filtered_payload := jsonb_set(
    payload,
    '{corrections}',
    open_items,
    true
  );
  perform app_private.sync_correction_targets_from_payload_all_rows_v1(
    filtered_payload
  );
end;
$function$;

revoke all on function app_private.sync_correction_targets_from_payload(jsonb)
  from public, anon, authenticated;
grant execute on function app_private.sync_correction_targets_from_payload(jsonb)
  to authenticated;
revoke all on function app_private.sync_correction_targets_from_payload_all_rows_v1(jsonb)
  from public, anon, authenticated;

revoke all on function app_private.save_submission_draft_without_questionnaire_rows(jsonb)
  from public, anon;
grant execute on function app_private.save_submission_draft_without_questionnaire_rows(jsonb)
  to authenticated;

do $migration$
declare
  dispatch_definition text;
begin
  dispatch_definition := pg_get_functiondef(
    'app_private.dispatch_submission_draft_with_revision_context(jsonb)'::regprocedure
  );
  if position(
    'save_submission_draft_for_internal_dispatch' in dispatch_definition
  ) = 0
    or position(
      'sync_correction_targets_from_payload' in dispatch_definition
    ) = 0
  then
    raise exception 'Draft persistence topology is incomplete';
  end if;

  if has_function_privilege(
    'anon',
    'app_private.save_submission_draft_without_questionnaire_rows(jsonb)'::regprocedure,
    'EXECUTE'
  )
    or has_function_privilege(
      'anon',
      'app_private.save_submission_draft_for_internal_dispatch(jsonb)'::regprocedure,
      'EXECUTE'
    )
    or has_function_privilege(
      'anon',
      'app_private.dispatch_submission_draft_with_revision_context(jsonb)'::regprocedure,
      'EXECUTE'
    )
  then
    raise exception 'Anonymous internal draft persistence execution is enabled';
  end if;

  if to_regprocedure(
    'app_private.questionnaire_field_is_required(text,text)'
  ) is null
    or to_regprocedure(
      'app_private.enforce_agent_correction_parent_status()'
    ) is null
    or not exists (
      select 1
      from pg_catalog.pg_trigger as trigger_info
      where trigger_info.tgname = 'corrections_agent_parent_status_guard'
        and trigger_info.tgenabled = 'O'
        and not trigger_info.tgisinternal
    )
  then
    raise exception 'Correction validation hardening is incomplete';
  end if;
end;
$migration$;

commit;

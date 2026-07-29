-- Protect every Agent cockpit snapshot with the same aggregate revision used
-- by Admin writes. The receipt makes an HTTP retry replay-safe, while the
-- expected revision rejects a different stale snapshot after the row lock.
begin;

create table if not exists app_private.agent_submission_mutation_receipts (
  operation_id uuid primary key,
  actor_id uuid not null,
  submission_id text not null,
  request_fingerprint text not null
    check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  result jsonb,
  created_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz
);

create index if not exists agent_submission_mutation_receipts_actor_created_idx
on app_private.agent_submission_mutation_receipts (actor_id, created_at desc);

alter table app_private.agent_submission_mutation_receipts enable row level security;
revoke all on app_private.agent_submission_mutation_receipts
  from public, anon, authenticated;
grant select, insert, update, delete on app_private.agent_submission_mutation_receipts
  to authenticated;

drop policy if exists agent_submission_mutation_receipts_select_own
  on app_private.agent_submission_mutation_receipts;
create policy agent_submission_mutation_receipts_select_own
on app_private.agent_submission_mutation_receipts
for select to authenticated
using (actor_id = auth.uid());

drop policy if exists agent_submission_mutation_receipts_insert_own
  on app_private.agent_submission_mutation_receipts;
create policy agent_submission_mutation_receipts_insert_own
on app_private.agent_submission_mutation_receipts
for insert to authenticated
with check (actor_id = auth.uid());

drop policy if exists agent_submission_mutation_receipts_update_own
  on app_private.agent_submission_mutation_receipts;
create policy agent_submission_mutation_receipts_update_own
on app_private.agent_submission_mutation_receipts
for update to authenticated
using (actor_id = auth.uid())
with check (actor_id = auth.uid());

drop policy if exists agent_submission_mutation_receipts_delete_own
  on app_private.agent_submission_mutation_receipts;
create policy agent_submission_mutation_receipts_delete_own
on app_private.agent_submission_mutation_receipts
for delete to authenticated
using (actor_id = auth.uid());

create or replace function app_private.questionnaire_semantic_text(
  answer_value jsonb
)
returns text
language sql
immutable
security invoker
set search_path = pg_catalog
as $function$
  select nullif(
    btrim(
      case jsonb_typeof(answer_value)
        when 'string' then answer_value #>> '{}'
        when 'object' then
          case
            when answer_value ->> 'kind' = 'v19_questionnaire_field'
              and answer_value ->> 'version' = '1'
            then answer_value ->> 'value'
            else null
          end
        else null
      end
    ),
    ''
  );
$function$;

revoke all on function app_private.questionnaire_semantic_text(jsonb)
  from public, anon, authenticated;
grant execute on function app_private.questionnaire_semantic_text(jsonb)
  to authenticated;

create or replace function app_private.questionnaire_semantic_date(
  answer_text text
)
returns date
language plpgsql
immutable
security invoker
set search_path = pg_catalog
as $function$
declare
  day_part integer;
  month_part integer;
  parsed_date date;
  year_part integer;
begin
  if answer_text ~ '^\d{2}[.-]\d{2}[.-]\d{4}$' then
    day_part := substring(answer_text from 1 for 2)::integer;
    month_part := substring(answer_text from 4 for 2)::integer;
    year_part := substring(answer_text from 7 for 4)::integer;
  elsif answer_text ~ '^\d{4}-\d{2}-\d{2}$' then
    year_part := substring(answer_text from 1 for 4)::integer;
    month_part := substring(answer_text from 6 for 2)::integer;
    day_part := substring(answer_text from 9 for 2)::integer;
  else
    return null;
  end if;

  parsed_date := make_date(year_part, month_part, day_part);
  return parsed_date;
exception when others then
  return null;
end;
$function$;

revoke all on function app_private.questionnaire_semantic_date(text)
  from public, anon, authenticated;
grant execute on function app_private.questionnaire_semantic_date(text)
  to authenticated;

create or replace function app_private.questionnaire_semantic_date_is_valid(
  answer_text text
)
returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog, app_private
as $function$
  select app_private.questionnaire_semantic_date(answer_text) is not null;
$function$;

revoke all on function app_private.questionnaire_semantic_date_is_valid(text)
  from public, anon, authenticated;
grant execute on function app_private.questionnaire_semantic_date_is_valid(text)
  to authenticated;

create or replace function app_private.agent_submission_questionnaire_complete(
  target_submission_id text
)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, public, app_private
as $function$
  with semantic_answers as (
    select
      answer.applicant_id,
      answer.field_id,
      answer.section_id,
      answer.value as raw_value,
      app_private.questionnaire_semantic_text(answer.value) as semantic_value
    from public.questionnaire_answers as answer
    where answer.submission_id = target_submission_id
  ),
  form_data as (
    select
      applicant.id as applicant_id,
      applicant.role,
      max(answer.semantic_value) filter (
        where answer.section_id = applicant.id || '-contacts'
          and answer.field_id = 'lives-outside-citizenship'
      ) as lives_outside_citizenship,
      max(answer.semantic_value) filter (
        where answer.section_id = applicant.id || '-trip'
          and answer.field_id = 'purpose'
      ) as stay_purpose,
      max(answer.semantic_value) filter (
        where answer.section_id = applicant.id || '-trip'
          and answer.field_id = 'arrival-date'
      ) as travel_start,
      max(answer.semantic_value) filter (
        where answer.section_id = applicant.id || '-trip'
          and answer.field_id = 'departure-date'
      ) as travel_end,
      max(answer.semantic_value) filter (
        where answer.section_id = applicant.id || '-trip'
          and answer.field_id = 'stay-duration'
      ) as stay_duration,
      max(answer.semantic_value) filter (
        where answer.section_id = applicant.id || '-trip'
          and answer.field_id = 'previous-biometrics'
      ) as previous_biometrics,
      max(answer.semantic_value) filter (
        where answer.section_id = applicant.id || '-trip'
          and answer.field_id = 'cost-covered-by'
      ) as payment_sponsor,
      max(answer.semantic_value) filter (
        where answer.section_id = applicant.id || '-hotel'
          and answer.field_id = 'inviting-party-type'
      ) as inviting_party_type,
      max(answer.semantic_value) filter (
        where answer.section_id = applicant.id || '-employment'
          and answer.field_id = 'occupation'
      ) as occupation,
      max(answer.semantic_value) filter (
        where answer.section_id = applicant.id || '-payment'
          and answer.field_id = 'sponsor-in-host-fields'
      ) as sponsor_in_host_fields,
      max(answer.semantic_value) filter (
        where answer.section_id = applicant.id || '-payment'
          and answer.field_id in (
            'sponsor-in-host-fields',
            'other-sponsor',
            'sponsor-means'
          )
      ) as sponsor_group_value,
      max(answer.semantic_value) filter (
        where answer.section_id = applicant.id || '-filler'
          and answer.field_id in (
            'form-filler-name',
            'form-filler-contact',
            'form-filler-phone'
          )
      ) as filler_group_value,
      max(answer.semantic_value) filter (
        where answer.section_id = applicant.id || '-euRelative'
          and answer.field_id in (
            'eu-relative-details',
            'eu-relationship'
          )
      ) as eu_relative_group_value,
      max(answer.semantic_value) filter (
        where answer.section_id = applicant.id || '-personal'
          and answer.field_id = 'birth-date'
      ) as birth_date,
      max(answer.semantic_value) filter (
        where answer.section_id = applicant.id || '-passport'
          and answer.field_id = 'passport-issue-date'
      ) as passport_issue_date,
      max(answer.semantic_value) filter (
        where answer.section_id = applicant.id || '-passport'
          and answer.field_id = 'passport-expiry-date'
      ) as passport_expiry_date,
      max(answer.semantic_value) filter (
        where answer.section_id = applicant.id || '-appointment'
          and answer.field_id = 'desired-date-1'
      ) as desired_date_from,
      max(answer.semantic_value) filter (
        where answer.section_id = applicant.id || '-appointment'
          and answer.field_id = 'desired-date-2'
      ) as desired_date_to
    from public.applicants as applicant
    left join semantic_answers as answer
      on answer.applicant_id = applicant.id
    where applicant.submission_id = target_submission_id
    group by applicant.id, applicant.role
  ),
  validation_flags as (
    select
      form_data.*,
      replace(
        lower(btrim(coalesce(form_data.lives_outside_citizenship, ''))),
        'ё',
        'е'
      ) in ('да', 'yes', 'true') as requires_residence_permit,
      case
        when form_data.occupation is null then
          form_data.role <> 'Ребёнок'
        else upper(btrim(form_data.occupation)) not in (
          'HOUSEWIFE',
          'MINOR',
          'PENSIONER',
          'RETIRED',
          'UNEMPLOYED'
        )
      end as requires_employer,
      (
        replace(
          lower(btrim(coalesce(form_data.stay_purpose, ''))),
          'ё',
          'е'
        ) = 'other'
        or replace(
          lower(btrim(coalesce(form_data.stay_purpose, ''))),
          'ё',
          'е'
        ) like '%другое%'
        or replace(
          lower(btrim(coalesce(form_data.stay_purpose, ''))),
          'ё',
          'е'
        ) like '%other%'
      ) as requires_stay_purpose_details,
      replace(
        lower(btrim(coalesce(form_data.previous_biometrics, ''))),
        'ё',
        'е'
      ) in ('да', 'yes', 'true') as requires_previous_biometrics_date,
      (
        replace(
          lower(btrim(coalesce(form_data.inviting_party_type, ''))),
          'ё',
          'е'
        ) like '%компания%'
        or replace(
          lower(btrim(coalesce(form_data.inviting_party_type, ''))),
          'ё',
          'е'
        ) like '%организация%'
        or upper(btrim(coalesce(form_data.stay_purpose, ''))) in (
          'BUSINESS',
          'CULTURAL',
          'MEDICAL TREATMENT',
          'OFFICIAL VISIT',
          'SPORTS',
          'STUDY'
        )
      ) as requires_company,
      (
        replace(
          lower(btrim(coalesce(form_data.payment_sponsor, ''))),
          'ё',
          'е'
        ) like '%спонсор%'
        or replace(
          lower(btrim(coalesce(form_data.payment_sponsor, ''))),
          'ё',
          'е'
        ) like '%sponsor%'
      ) as sponsored_trip,
      replace(
        lower(btrim(coalesce(form_data.sponsor_in_host_fields, ''))),
        'ё',
        'е'
      ) in ('нет', 'no', 'false') as requires_other_sponsor,
      form_data.sponsor_group_value is not null as sponsor_group_started,
      form_data.filler_group_value is not null as filler_group_started,
      form_data.eu_relative_group_value is not null as eu_relative_group_started
    from form_data
  ),
  required_answers as (
    select
      flags.applicant_id,
      required_answer.field_id,
      required_answer.section_key
    from validation_flags as flags
    cross join lateral (
      values
        ('contacts', 'home-country', true),
        ('contacts', 'home-city', true),
        ('contacts', 'home-street', true),
        ('contacts', 'home-house', true),
        ('contacts', 'postal-code', true),
        ('contacts', 'email', true),
        ('contacts', 'contact-number', true),
        ('contacts', 'lives-outside-citizenship', true),
        ('contacts', 'residence-permit-type', flags.requires_residence_permit),
        ('contacts', 'residence-permit-number', flags.requires_residence_permit),
        (
          'contacts',
          'residence-permit-valid-until',
          flags.requires_residence_permit
        ),
        ('trip', 'purpose', true),
        ('trip', 'stay-purpose-details', flags.requires_stay_purpose_details),
        ('trip', 'main-destination', true),
        ('trip', 'first-entry-country', true),
        ('trip', 'entry-count', true),
        ('trip', 'arrival-date', true),
        ('trip', 'departure-date', true),
        ('trip', 'stay-duration', true),
        ('trip', 'previous-biometrics', true),
        (
          'trip',
          'previous-biometrics-date',
          flags.requires_previous_biometrics_date
        ),
        ('trip', 'means-of-support', not flags.sponsored_trip),
        ('hotel', 'inviting-party-type', true),
        ('hotel', 'hotel-name', true),
        ('hotel', 'hotel-address', true),
        ('hotel', 'hotel-country', true),
        ('hotel', 'hotel-city', true),
        ('hotel', 'hotel-postal-code', true),
        ('hotel', 'company-org-details', flags.requires_company),
        ('hotel', 'company-contact-person', flags.requires_company),
        ('hotel', 'company-phone', flags.requires_company),
        ('appointment', 'appointment-city', true),
        ('appointment', 'desired-date-1', true),
        ('appointment', 'desired-date-2', true),
        ('personal', 'surname', true),
        ('personal', 'first-name', true),
        ('personal', 'birth-date', true),
        ('personal', 'birth-place', true),
        ('personal', 'birth-country', true),
        ('personal', 'gender', true),
        ('personal', 'marital-status', true),
        ('passport', 'passport-type', true),
        ('passport', 'passport-no', true),
        ('passport', 'passport-issue-date', true),
        ('passport', 'passport-expiry-date', true),
        ('passport', 'passport-issue-country', true),
        ('passport', 'passport-issue-place', true),
        ('employment', 'occupation', true),
        ('employment', 'employer-name', flags.requires_employer),
        ('employment', 'employer-contact', flags.requires_employer),
        ('employment', 'employer-address', flags.requires_employer),
        ('payment', 'sponsor-in-host-fields', flags.sponsored_trip),
        (
          'payment',
          'other-sponsor',
          flags.sponsored_trip and flags.requires_other_sponsor
        ),
        ('payment', 'sponsor-means', flags.sponsored_trip),
        ('filler', 'form-filler-name', flags.filler_group_started),
        ('filler', 'form-filler-contact', flags.filler_group_started),
        ('filler', 'form-filler-phone', flags.filler_group_started),
        ('euRelative', 'eu-relative-details', flags.eu_relative_group_started),
        ('euRelative', 'eu-relationship', flags.eu_relative_group_started)
    ) as required_answer(section_key, field_id, required)
    where required_answer.required
  ),
  invalid_semantic_values as (
    select answer.applicant_id, answer.field_id
    from semantic_answers as answer
    where answer.semantic_value is not null
      and (
        (
          answer.field_id in ('email', 'hotel-email')
          and answer.semantic_value !~
            '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
        )
        or (
          answer.field_id in (
            'contact-number',
            'hotel-contact',
            'company-phone',
            'employer-contact',
            'form-filler-phone'
          )
          and length(
            regexp_replace(answer.semantic_value, '\D', '', 'g')
          ) not between 7 and 18
        )
        or (
          answer.field_id in (
            'arrival-date',
            'departure-date',
            'desired-date-1',
            'desired-date-2',
            'desired-date-3',
            'birth-date',
            'passport-issue-date',
            'passport-expiry-date',
            'previous-biometrics-date',
            'final-entry-permit-valid-from',
            'final-entry-permit-valid-to',
            'residence-permit-valid-until'
          )
          and not app_private.questionnaire_semantic_date_is_valid(
            answer.semantic_value
          )
        )
        or (
          answer.field_id = 'passport-no'
          and regexp_replace(answer.semantic_value, '\s', '', 'g')
            !~* '^[A-ZА-Я0-9-]{5,20}$'
        )
        or (
          answer.field_id in ('postal-code', 'hotel-postal-code')
          and (
            char_length(answer.semantic_value) not between 3 and 16
            or answer.semantic_value
              !~* '^[A-ZА-Я0-9][A-ZА-Я0-9[:space:]-]*[A-ZА-Я0-9]$'
          )
        )
      )
  ),
  invalid_date_relationships as (
    select flags.applicant_id
    from validation_flags as flags
    where
      app_private.questionnaire_semantic_date(flags.birth_date)
        >= app_private.questionnaire_semantic_date(flags.travel_start)
      or app_private.questionnaire_semantic_date(flags.passport_issue_date)
        >= app_private.questionnaire_semantic_date(flags.passport_expiry_date)
      or app_private.questionnaire_semantic_date(flags.passport_expiry_date)
        < app_private.questionnaire_semantic_date(flags.travel_end)
      or app_private.questionnaire_semantic_date(flags.travel_end)
        < app_private.questionnaire_semantic_date(flags.travel_start)
      or app_private.questionnaire_semantic_date(flags.desired_date_to)
        < app_private.questionnaire_semantic_date(flags.desired_date_from)
      or flags.stay_duration is distinct from (
        (
          app_private.questionnaire_semantic_date(flags.travel_end)
          - app_private.questionnaire_semantic_date(flags.travel_start)
        ) + 1
      )::text
  )
  select exists (select 1 from form_data)
    and not exists (
      select 1
      from required_answers as required_answer
      where not exists (
        select 1
        from semantic_answers as answer
        where answer.applicant_id = required_answer.applicant_id
          and answer.section_id =
            required_answer.applicant_id || '-' || required_answer.section_key
          and answer.field_id = required_answer.field_id
          and answer.semantic_value is not null
      )
    )
    and not exists (select 1 from invalid_semantic_values)
    and not exists (select 1 from invalid_date_relationships)
    and not exists (
      select 1
      from semantic_answers as answer
      where answer.raw_value ->> 'kind' = 'v19_questionnaire_field'
        and answer.raw_value ->> 'version' = '1'
        and answer.raw_value ->> 'reviewState' = 'needs_review'
    );
$function$;

revoke all on function app_private.agent_submission_questionnaire_complete(text)
  from public, anon, authenticated;
grant execute on function app_private.agent_submission_questionnaire_complete(text)
  to authenticated;

-- Agent aggregate writes are valid only while the CAS RPC owns a matching,
-- incomplete mutation receipt. Admin writes keep their existing batch-CAS
-- boundary, and the immutable public-number allocator is the sole narrowly
-- scoped Agent exception.
create or replace function app_private.enforce_agent_cas_write_boundary()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $function$
declare
  actor_role public.profile_role := app_private.current_profile_role();
  mutation_operation_id uuid;
  mutation_operation_setting text := nullif(
    current_setting('app.visaflow_agent_cas_operation_id', true),
    ''
  );
  row_after jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  row_before jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  row_payload jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  target_submission_id text;
begin
  if actor_role is distinct from 'agent' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_table_name = 'submissions'
    and tg_op = 'UPDATE'
    and current_setting('app.v19_public_number_assignment', true) = 'allowed'
    and row_before ? 'public_number'
    and row_before -> 'public_number' = 'null'::jsonb
    and row_after -> 'public_number' is not null
    and row_after -> 'public_number' <> 'null'::jsonb
    and (row_after - 'public_number') = (row_before - 'public_number')
  then
    return new;
  end if;

  if tg_table_name = 'submissions' then
    target_submission_id := row_payload ->> 'id';
  elsif tg_table_name = 'status_history'
    and row_payload ->> 'entity_type' = 'submission'
  then
    target_submission_id := row_payload ->> 'entity_id';
  else
    target_submission_id := row_payload ->> 'submission_id';
  end if;

  begin
    mutation_operation_id := mutation_operation_setting::uuid;
  exception when invalid_text_representation then
    mutation_operation_id := null;
  end;

  if nullif(btrim(coalesce(target_submission_id, '')), '') is null
    or mutation_operation_id is null
    or not exists (
      select 1
      from app_private.agent_submission_mutation_receipts as receipt
      where receipt.operation_id = mutation_operation_id
        and receipt.actor_id = auth.uid()
        and receipt.submission_id = target_submission_id
        and receipt.completed_at is null
        and receipt.result is null
    )
  then
    raise exception 'Agent aggregate writes require the revision-checked mutation RPC'
      using errcode = '42501';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

revoke all on function app_private.enforce_agent_cas_write_boundary()
  from public, anon, authenticated;

drop trigger if exists submissions_agent_cas_write_boundary
  on public.submissions;
create trigger submissions_agent_cas_write_boundary
before insert or update or delete on public.submissions
for each row execute function app_private.enforce_agent_cas_write_boundary();

drop trigger if exists applicants_agent_cas_write_boundary
  on public.applicants;
create trigger applicants_agent_cas_write_boundary
before insert or update or delete on public.applicants
for each row execute function app_private.enforce_agent_cas_write_boundary();

drop trigger if exists questionnaire_answers_agent_cas_write_boundary
  on public.questionnaire_answers;
create trigger questionnaire_answers_agent_cas_write_boundary
before insert or update or delete on public.questionnaire_answers
for each row execute function app_private.enforce_agent_cas_write_boundary();

drop trigger if exists media_assets_agent_cas_write_boundary
  on public.media_assets;
create trigger media_assets_agent_cas_write_boundary
before insert or update or delete on public.media_assets
for each row execute function app_private.enforce_agent_cas_write_boundary();

drop trigger if exists corrections_agent_cas_write_boundary
  on public.corrections;
create trigger corrections_agent_cas_write_boundary
before insert or update or delete on public.corrections
for each row execute function app_private.enforce_agent_cas_write_boundary();

drop trigger if exists status_history_agent_cas_write_boundary
  on public.status_history;
create trigger status_history_agent_cas_write_boundary
before insert or update or delete on public.status_history
for each row execute function app_private.enforce_agent_cas_write_boundary();

-- Re-submitting an export-ready package is the one intentional Agent mutation
-- after Admin acceptance. It is enabled only inside the revision-checked RPC,
-- must clear export timestamps, and must return media review state to Admin.
create or replace function app_private.enforce_submission_agent_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $function$
declare
  actor_role public.profile_role := app_private.current_profile_role();
  agent_review_handoff boolean :=
    current_setting('app.visaflow_agent_review_handoff', true) = 'on';
  internal_trip_date_sync boolean :=
    current_setting('app.visaflow_internal_trip_date_sync', true) = 'on';
begin
  if actor_role = 'admin' then
    return new;
  end if;

  if auth.uid() is null or new.agent_id <> auth.uid() then
    raise exception 'Cannot write submission for another agent'
      using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'filling', 'ready_for_review', 'waiting_review') then
      raise exception 'Agents cannot create submissions in review, export, or appointment states'
        using errcode = '42501';
    end if;

    if new.appointment_status <> 'not_started'
      or new.review_started_at is not null
      or new.accepted_at is not null
      or new.exported_at is not null
    then
      raise exception 'Agents cannot create review, export, or appointment state'
        using errcode = '42501';
    end if;

    return new;
  end if;

  if old.agent_id <> auth.uid() or new.agent_id <> old.agent_id then
    raise exception 'Agents cannot reassign submissions'
      using errcode = '42501';
  end if;

  if agent_review_handoff
    and old.status in ('accepted', 'ready_for_excel')
    and new.status = 'waiting_review'
  then
    if new.appointment_status <> 'not_started'
      or new.review_started_at is not null
      or new.accepted_at is not null
      or new.exported_at is not null
      or new.family_intelligence #>> '{v19CockpitSnapshot,submission,exportState}'
        is distinct from 'not_ready'
      or coalesce(
        new.family_intelligence #> '{v19CockpitSnapshot,submission}',
        '{}'::jsonb
      ) ? 'exportPackage'
    then
      raise exception 'Export-ready review handoff must clear export readiness'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if new.appointment_status is distinct from old.appointment_status
    or new.review_started_at is distinct from old.review_started_at
    or new.accepted_at is distinct from old.accepted_at
    or new.exported_at is distinct from old.exported_at
  then
    raise exception 'Agents cannot update review, export, or appointment state'
      using errcode = '42501';
  end if;

  if old.status = 'returned' then
    if new.status not in ('returned', 'ready_for_review', 'waiting_review') then
      raise exception 'Returned submissions can only stay returned, be marked ready, or be resubmitted'
        using errcode = '42501';
    end if;
  elsif old.status in ('draft', 'filling', 'ready_for_review') then
    if new.status not in ('draft', 'filling', 'ready_for_review', 'waiting_review') then
      raise exception 'Agents cannot advance submissions into review, export, or appointment states'
        using errcode = '42501';
    end if;
  elsif internal_trip_date_sync
    and old.status = 'waiting_review'
    and new.status = old.status
    and new.type is not distinct from old.type
    and new.title is not distinct from old.title
    and new.country is not distinct from old.country
    and new.city is not distinct from old.city
    and new.priority is not distinct from old.priority
    and new.readiness_percent is not distinct from old.readiness_percent
    and new.family_intelligence is not distinct from old.family_intelligence
    and new.appointment_status is not distinct from old.appointment_status
    and new.submitted_at is not distinct from old.submitted_at
    and new.review_started_at is not distinct from old.review_started_at
    and new.accepted_at is not distinct from old.accepted_at
    and new.exported_at is not distinct from old.exported_at
  then
    return new;
  else
    raise exception 'Agents cannot update submissions after handoff to operator review'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

revoke all on function app_private.enforce_submission_agent_mutation()
  from public, anon, authenticated;

create or replace function app_private.enforce_media_asset_review_boundary()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $function$
declare
  actor_role public.profile_role := app_private.current_profile_role();
  agent_review_handoff boolean :=
    current_setting('app.visaflow_agent_review_handoff', true) = 'on';
  content_changed boolean := false;
begin
  if not exists (
    select 1
    from public.applicants as applicant
    where applicant.id = new.applicant_id
      and applicant.submission_id = new.submission_id
  ) then
    raise exception 'Media asset applicant does not belong to submission'
      using errcode = '23503';
  end if;

  if tg_op = 'UPDATE' then
    content_changed :=
      new.applicant_id is distinct from old.applicant_id
      or new.submission_id is distinct from old.submission_id
      or new.type is distinct from old.type
      or new.original_file_name is distinct from old.original_file_name
      or new.generated_file_name is distinct from old.generated_file_name
      or new.storage_bucket is distinct from old.storage_bucket
      or new.storage_path is distinct from old.storage_path
      or new.mime_type is distinct from old.mime_type
      or new.size_bytes is distinct from old.size_bytes
      or new.upload_status is distinct from old.upload_status;
  end if;

  if actor_role = 'agent' then
    if tg_op = 'INSERT' then
      if new.review_status is distinct from 'not_reviewed'::public.media_review_status
        or new.reviewed_at is not null
        or new.reviewed_by is not null
      then
        raise exception 'Agents cannot set media review state'
          using errcode = '42501';
      end if;
    elsif agent_review_handoff
      and not content_changed
      and old.review_status = 'accepted'::public.media_review_status
      and new.review_status = 'not_reviewed'::public.media_review_status
      and new.reviewed_at is null
      and new.reviewed_by is null
    then
      return new;
    elsif content_changed then
      if new.review_status is distinct from 'not_reviewed'::public.media_review_status
        or new.reviewed_at is not null
        or new.reviewed_by is not null
      then
        raise exception 'Agents cannot preserve or set media review state while changing media'
          using errcode = '42501';
      end if;
    elsif new.review_status is distinct from old.review_status
      or new.reviewed_at is distinct from old.reviewed_at
      or new.reviewed_by is distinct from old.reviewed_by
    then
      raise exception 'Agents cannot change media review state'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function app_private.enforce_media_asset_review_boundary()
  from public, anon, authenticated;

create or replace function public.save_agent_submission_if_current(
  payload jsonb,
  expected_revision bigint,
  actor_id uuid,
  operation_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, app_private, extensions
as $function$
declare
  actor_role public.profile_role := app_private.current_profile_role();
  applicant_count integer;
  current_revision bigint;
  expected_history_transitions jsonb := '[]'::jsonb;
  existing_submission record;
  export_ready_handoff boolean := false;
  final_history jsonb := coalesce(payload -> 'status_history', '[]'::jsonb);
  invalid_applicant_count integer;
  intermediate_payload jsonb;
  main_applicant_count integer;
  new_history_count integer;
  persisted_result jsonb;
  previous_review_handoff_context text := current_setting(
    'app.visaflow_agent_review_handoff',
    true
  );
  previous_cas_operation_context text := current_setting(
    'app.visaflow_agent_cas_operation_id',
    true
  );
  previous_submission_handoff_context text := current_setting(
    'app.visaflow_submission_handoff',
    true
  );
  receipt_fingerprint text;
  receipt_result jsonb;
  request_fingerprint text;
  response jsonb;
  snapshot_applicants jsonb;
  snapshot_files jsonb;
  snapshot_history jsonb;
  snapshot_status text;
  snapshot_submission jsonb;
  spouse_applicant_count integer;
  submission_record record;
begin
  if auth.uid() is null then
    raise exception 'Authenticated user required for Agent submission mutation'
      using errcode = '28000';
  end if;

  if actor_id is distinct from auth.uid() then
    raise exception 'Agent mutation actor does not match the authenticated session'
      using errcode = '42501';
  end if;

  if actor_role is distinct from 'agent' then
    raise exception 'Only approved agents can save Agent submission mutations'
      using errcode = '42501';
  end if;

  if operation_id is null then
    raise exception 'Agent mutation operation id is required'
      using errcode = '23514';
  end if;

  select *
  into submission_record
  from jsonb_to_record(payload -> 'submission') as submission_payload (
    id text,
    agent_id uuid,
    type text,
    title text,
    country text,
    city text,
    travel_date text,
    trip_date_from text,
    trip_date_to text,
    status public.submission_status,
    readiness_percent integer,
    family_intelligence jsonb,
    submitted_at timestamptz,
    review_started_at timestamptz,
    accepted_at timestamptz,
    exported_at timestamptz,
    appointment_status public.appointment_status
  );

  if nullif(btrim(coalesce(submission_record.id, '')), '') is null
    or submission_record.agent_id is null
    or submission_record.status is null
  then
    raise exception 'Agent mutation submission payload is required'
      using errcode = '23514';
  end if;

  if submission_record.agent_id is distinct from actor_id then
    raise exception 'Only the assigned agent can save a submission'
      using errcode = '42501';
  end if;

  if submission_record.type is null
    or submission_record.type not in ('single', 'family')
  then
    raise exception 'Agent mutation submission type must be single or family'
      using errcode = '23514';
  end if;

  if jsonb_typeof(payload -> 'applicants') is distinct from 'array' then
    raise exception 'Agent mutation applicants payload must be an array'
      using errcode = '23514';
  end if;

  select
    count(*)::integer,
    count(*) filter (
      where applicant.role = 'Основной заявитель'
    )::integer,
    count(*) filter (
      where applicant.role = 'Супруг'
    )::integer,
    count(*) filter (
      where nullif(btrim(coalesce(applicant.id, '')), '') is null
        or applicant.submission_id is distinct from submission_record.id
        or applicant.role is null
        or applicant.role not in (
          'Основной заявитель',
          'Супруг',
          'Ребёнок'
        )
    )::integer
  into
    applicant_count,
    main_applicant_count,
    spouse_applicant_count,
    invalid_applicant_count
  from jsonb_to_recordset(payload -> 'applicants') as applicant (
    id text,
    submission_id text,
    role text
  );

  if invalid_applicant_count > 0 or exists (
    select 1
    from jsonb_to_recordset(payload -> 'applicants') as applicant (
      id text
    )
    group by applicant.id
    having count(*) > 1
  ) then
    raise exception 'Agent mutation applicants contain invalid identities or roles'
      using errcode = '23514';
  end if;

  if submission_record.type = 'single'
    and (applicant_count <> 1 or main_applicant_count <> 1)
  then
    raise exception 'Single Agent submissions require exactly one main applicant'
      using errcode = '23514';
  end if;

  if submission_record.type = 'family'
    and (
      applicant_count < 2
      or applicant_count > 6
      or main_applicant_count <> 1
      or spouse_applicant_count > 1
    )
  then
    raise exception 'Family Agent submissions require 2-6 applicants, one main, and at most one spouse'
      using errcode = '23514';
  end if;

  if nullif(btrim(coalesce(submission_record.title, '')), '') is null
    or nullif(btrim(coalesce(submission_record.country, '')), '') is null
    or nullif(btrim(coalesce(submission_record.city, '')), '') is null
    or submission_record.travel_date is null
    or submission_record.trip_date_from is null
    or submission_record.trip_date_to is null
    or submission_record.readiness_percent is null
    or submission_record.readiness_percent not between 0 and 100
  then
    raise exception 'Agent mutation submission projection is incomplete'
      using errcode = '23514';
  end if;

  snapshot_submission :=
    submission_record.family_intelligence
      #> '{v19CockpitSnapshot,submission}';
  snapshot_applicants := snapshot_submission -> 'applicants';
  snapshot_files := snapshot_submission -> 'files';
  snapshot_history := snapshot_submission -> 'history';
  snapshot_status := snapshot_submission ->> 'status';

  if jsonb_typeof(submission_record.family_intelligence)
      is distinct from 'object'
    or submission_record.family_intelligence ->> 'status'
      is distinct from 'unreviewed'
    or submission_record.family_intelligence
        #> '{v19CockpitSnapshot,version}'
      is distinct from '1'::jsonb
    or jsonb_typeof(snapshot_submission) is distinct from 'object'
    or jsonb_typeof(snapshot_applicants) is distinct from 'array'
    or jsonb_typeof(snapshot_files) is distinct from 'array'
    or jsonb_typeof(snapshot_history) is distinct from 'array'
    or snapshot_submission ->> 'id' is distinct from submission_record.id
    or snapshot_submission ->> 'agentId' is distinct from actor_id::text
    or snapshot_submission ->> 'type' is distinct from submission_record.type
    or snapshot_submission ->> 'title' is distinct from submission_record.title
    or snapshot_submission ->> 'country' is distinct from submission_record.country
    or snapshot_submission ->> 'city' is distinct from submission_record.city
    or snapshot_submission ->> 'tripDateFrom'
      is distinct from submission_record.trip_date_from
    or snapshot_submission ->> 'tripDateTo'
      is distinct from submission_record.trip_date_to
    or jsonb_typeof(snapshot_submission -> 'completeness')
      is distinct from 'object'
    or jsonb_typeof(snapshot_submission #> '{completeness,questionnaire}')
      is distinct from 'number'
    or jsonb_typeof(snapshot_submission #> '{completeness,files}')
      is distinct from 'number'
    or jsonb_typeof(snapshot_submission #> '{completeness,total}')
      is distinct from 'number'
    or snapshot_submission #>> '{completeness,total}'
      is distinct from submission_record.readiness_percent::text
    or (
      case snapshot_status
        when 'draft' then 'draft'
        when 'in_progress' then 'filling'
        when 'submitted_for_review' then 'waiting_review'
        when 'returned' then 'returned'
        when 'corrections_received' then 'waiting_review'
        when 'ready_for_export' then 'ready_for_excel'
        when 'exported' then 'exported'
        else null
      end
    ) is distinct from submission_record.status::text
  then
    raise exception 'Agent cockpit snapshot diverges from the canonical submission projection'
      using errcode = '23514';
  end if;

  if jsonb_array_length(snapshot_applicants) <> applicant_count
    or exists (
      select 1
      from jsonb_array_elements(snapshot_applicants) as snapshot_applicant(value)
      where jsonb_typeof(snapshot_applicant.value) is distinct from 'object'
        or nullif(btrim(coalesce(snapshot_applicant.value ->> 'id', '')), '') is null
        or nullif(
          btrim(coalesce(snapshot_applicant.value ->> 'fullName', '')),
          ''
        ) is null
        or snapshot_applicant.value ->> 'role' not in ('main', 'spouse', 'child')
        or jsonb_typeof(snapshot_applicant.value -> 'sections')
          is distinct from 'array'
    )
    or exists (
      select 1
      from jsonb_array_elements(snapshot_applicants) as snapshot_applicant(value)
      group by snapshot_applicant.value ->> 'id'
      having count(*) > 1
    )
    or exists (
      select 1
      from jsonb_to_recordset(payload -> 'applicants') as applicant (
        id text,
        role text,
        full_name text
      )
      where not exists (
        select 1
        from jsonb_array_elements(snapshot_applicants)
          as snapshot_applicant(value)
        where snapshot_applicant.value ->> 'id' = applicant.id
          and snapshot_applicant.value ->> 'fullName' = applicant.full_name
          and snapshot_applicant.value ->> 'role' = case applicant.role
            when 'Основной заявитель' then 'main'
            when 'Супруг' then 'spouse'
            when 'Ребёнок' then 'child'
            else null
          end
      )
    )
  then
    raise exception 'Agent cockpit snapshot applicant topology diverges from canonical applicants'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(payload -> 'applicants') as applicant (
      questionnaire_percent integer,
      media_percent integer
    )
    where applicant.questionnaire_percent::text is distinct from
        snapshot_submission #>> '{completeness,questionnaire}'
      or applicant.media_percent::text is distinct from
        snapshot_submission #>> '{completeness,files}'
  ) or (
    submission_record.status = 'waiting_review'
    and (
      snapshot_submission #>> '{completeness,questionnaire}' <> '100'
      or snapshot_submission #>> '{completeness,files}' <> '100'
      or snapshot_submission #>> '{completeness,total}' <> '100'
      or exists (
        select 1
        from jsonb_array_elements(snapshot_applicants)
          as snapshot_applicant(value)
        where snapshot_applicant.value ->> 'questionnaireStatus'
            is distinct from 'complete'
          or snapshot_applicant.value ->> 'fileStatus'
            is distinct from 'complete'
      )
    )
  ) then
    raise exception 'Agent cockpit completeness diverges from the normalized package'
      using errcode = '23514';
  end if;

  if jsonb_typeof(payload -> 'questionnaire_answers') is distinct from 'array'
    or exists (
      select 1
      from jsonb_to_recordset(payload -> 'questionnaire_answers') as answer (
        submission_id text,
        applicant_id text,
        section_id text,
        field_id text,
        label text
      )
      where answer.submission_id is distinct from submission_record.id
        or nullif(btrim(coalesce(answer.field_id, '')), '') is null
        or nullif(btrim(coalesce(answer.label, '')), '') is null
        or not exists (
          select 1
          from jsonb_to_recordset(payload -> 'applicants') as applicant (
            id text
          )
          where applicant.id = answer.applicant_id
        )
        or not (
          (
            answer.section_id = answer.applicant_id || '-contacts'
            and answer.field_id in (
              'home-country',
              'home-city',
              'home-street',
              'home-house',
              'home-building',
              'home-unit',
              'postal-code',
              'email',
              'contact-number',
              'lives-outside-citizenship',
              'residence-permit-type',
              'residence-permit-number',
              'residence-permit-valid-until',
              'home-address'
            )
          )
          or (
            answer.section_id = answer.applicant_id || '-trip'
            and answer.field_id in (
              'purpose',
              'stay-purpose-details',
              'main-destination',
              'first-entry-country',
              'entry-count',
              'arrival-date',
              'departure-date',
              'stay-duration',
              'previous-biometrics',
              'previous-biometrics-date',
              'previous-visa-number',
              'final-entry-permit',
              'final-entry-permit-issued-by',
              'final-entry-permit-valid-from',
              'final-entry-permit-valid-to',
              'cost-covered-by',
              'means-of-support'
            )
          )
          or (
            answer.section_id = answer.applicant_id || '-hotel'
            and answer.field_id in (
              'inviting-party-type',
              'hotel-name',
              'hotel-address',
              'hotel-country',
              'hotel-city',
              'hotel-postal-code',
              'hotel-email',
              'hotel-contact',
              'company-org-details',
              'company-contact-person',
              'company-phone'
            )
          )
          or (
            answer.section_id = answer.applicant_id || '-appointment'
            and answer.field_id in (
              'appointment-city',
              'desired-date-1',
              'desired-date-2',
              'visa-type',
              'category'
            )
          )
          or (
            answer.section_id = answer.applicant_id || '-personal'
            and answer.field_id in (
              'surname',
              'previous-surname',
              'first-name',
              'birth-date',
              'birth-place',
              'birth-country',
              'gender',
              'marital-status',
              'guardian-info',
              'nationality',
              'birth-citizenship'
            )
          )
          or (
            answer.section_id = answer.applicant_id || '-passport'
            and answer.field_id in (
              'passport-type',
              'passport-no',
              'passport-issue-date',
              'passport-expiry-date',
              'passport-issue-country',
              'passport-issue-place'
            )
          )
          or (
            answer.section_id = answer.applicant_id || '-employment'
            and answer.field_id in (
              'occupation',
              'employer-name',
              'employer-contact',
              'employer-address'
            )
          )
        )
    )
    or exists (
      select 1
      from jsonb_to_recordset(payload -> 'questionnaire_answers') as answer (
        applicant_id text,
        section_id text,
        field_id text
      )
      group by answer.applicant_id, answer.section_id, answer.field_id
      having count(*) > 1
    )
  then
    raise exception 'Agent questionnaire projection contains invalid identities'
      using errcode = '23514';
  end if;

  if exists (
    with answer_projection as (
      select
        answer.applicant_id,
        max(app_private.questionnaire_semantic_text(answer.value)) filter (
          where answer.section_id = answer.applicant_id || '-contacts'
            and answer.field_id = 'home-address'
        ) as address,
        max(app_private.questionnaire_semantic_text(answer.value)) filter (
          where answer.section_id = answer.applicant_id || '-contacts'
            and answer.field_id = 'contact-number'
        ) as phone,
        max(app_private.questionnaire_semantic_text(answer.value)) filter (
          where answer.section_id = answer.applicant_id || '-contacts'
            and answer.field_id = 'email'
        ) as email,
        max(app_private.questionnaire_semantic_text(answer.value)) filter (
          where answer.section_id = answer.applicant_id || '-trip'
            and answer.field_id = 'arrival-date'
        ) as trip_date_from,
        max(app_private.questionnaire_semantic_text(answer.value)) filter (
          where answer.section_id = answer.applicant_id || '-trip'
            and answer.field_id = 'departure-date'
        ) as trip_date_to,
        max(app_private.questionnaire_semantic_text(answer.value)) filter (
          where answer.section_id = answer.applicant_id || '-hotel'
            and answer.field_id = 'hotel-name'
        ) as hotel_name,
        max(app_private.questionnaire_semantic_text(answer.value)) filter (
          where answer.section_id = answer.applicant_id || '-hotel'
            and answer.field_id = 'hotel-address'
        ) as hotel_address,
        max(app_private.questionnaire_semantic_text(answer.value)) filter (
          where answer.section_id = answer.applicant_id || '-personal'
            and answer.field_id = 'birth-date'
        ) as birth_date,
        max(app_private.questionnaire_semantic_text(answer.value)) filter (
          where answer.section_id = answer.applicant_id || '-personal'
            and answer.field_id = 'first-name'
        ) as first_name,
        max(app_private.questionnaire_semantic_text(answer.value)) filter (
          where answer.section_id = answer.applicant_id || '-personal'
            and answer.field_id = 'surname'
        ) as surname,
        max(app_private.questionnaire_semantic_text(answer.value)) filter (
          where answer.section_id = answer.applicant_id || '-personal'
            and answer.field_id = 'nationality'
        ) as citizenship,
        max(app_private.questionnaire_semantic_text(answer.value)) filter (
          where answer.section_id = answer.applicant_id || '-passport'
            and answer.field_id = 'passport-no'
        ) as passport_number,
        max(app_private.questionnaire_semantic_text(answer.value)) filter (
          where answer.section_id = answer.applicant_id || '-passport'
            and answer.field_id = 'passport-issue-date'
        ) as passport_issued_at,
        max(app_private.questionnaire_semantic_text(answer.value)) filter (
          where answer.section_id = answer.applicant_id || '-passport'
            and answer.field_id = 'passport-expiry-date'
        ) as passport_expires_at
      from jsonb_to_recordset(payload -> 'questionnaire_answers') as answer (
        applicant_id text,
        section_id text,
        field_id text,
        value jsonb
      )
      group by answer.applicant_id
    )
    select 1
    from jsonb_to_recordset(payload -> 'applicants') as applicant (
      id text,
      submission_id text,
      full_name text,
      suggested_role text,
      role_confirmed boolean,
      birth_date date,
      patronymic text,
      citizenship text,
      address text,
      phone text,
      email text,
      passport_number text,
      passport_issued_at date,
      passport_expires_at date,
      country text,
      city text,
      trip_dates text,
      hotel_name text,
      hotel_address text
    )
    left join answer_projection as answer
      on answer.applicant_id = applicant.id
    where applicant.suggested_role is not null
      or applicant.role_confirmed is distinct from true
      or applicant.patronymic is not null
      or (
        submission_record.status = 'waiting_review'
        and applicant.full_name is distinct from concat_ws(
          ' ',
          answer.first_name,
          answer.surname
        )
      )
      or applicant.birth_date is distinct from
        app_private.questionnaire_semantic_date(answer.birth_date)
      or applicant.citizenship is distinct from answer.citizenship
      or applicant.address is distinct from answer.address
      or applicant.phone is distinct from answer.phone
      or applicant.email is distinct from answer.email
      or applicant.passport_number is distinct from
        coalesce(answer.passport_number, '')
      or applicant.passport_issued_at is distinct from
        app_private.questionnaire_semantic_date(answer.passport_issued_at)
      or applicant.passport_expires_at is distinct from
        app_private.questionnaire_semantic_date(answer.passport_expires_at)
      or applicant.country is distinct from submission_record.country
      or applicant.city is distinct from submission_record.city
      or (
        submission_record.status = 'waiting_review'
        and applicant.trip_dates is distinct from (
          case
            when coalesce(answer.trip_date_from, '') =
              coalesce(answer.trip_date_to, '')
            then coalesce(answer.trip_date_from, '')
            else
              coalesce(answer.trip_date_from, '')
              || ' - '
              || coalesce(answer.trip_date_to, '')
          end
        )
      )
      or applicant.trip_dates is distinct from
        coalesce(payload #>> '{submission,travel_date}', '')
      or applicant.hotel_name is distinct from answer.hotel_name
      or applicant.hotel_address is distinct from answer.hotel_address
  ) then
    raise exception 'Agent applicant projection diverges from questionnaire data'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(payload -> 'questionnaire_answers') as answer (
      applicant_id text,
      section_id text,
      field_id text,
      value jsonb
    )
    left join public.questionnaire_answers as durable_answer
      on durable_answer.applicant_id = answer.applicant_id
      and durable_answer.section_id = answer.section_id
      and durable_answer.field_id = answer.field_id
    where
      (
        jsonb_typeof(answer.value) = 'object'
        and (
          answer.value ->> 'kind' is distinct from 'v19_questionnaire_field'
          or answer.value ->> 'version' is distinct from '1'
          or (
            answer.value - array[
              'adminReviewApprovedAtIso',
              'adminReviewApprovedBy',
              'kind',
              'reviewConfirmedAtIso',
              'reviewConfirmedBy',
              'reviewOriginSource',
              'reviewSource',
              'reviewState',
              'value',
              'version'
            ]::text[]
          ) <> '{}'::jsonb
          or (
            answer.value ? 'reviewConfirmedAtIso'
          ) <> (
            answer.value ? 'reviewConfirmedBy'
          )
          or (
            answer.value ? 'reviewConfirmedBy'
            and answer.value ->> 'reviewConfirmedBy' is distinct from
              actor_id::text
          )
          or (
            answer.value ? 'reviewOriginSource'
            and answer.value ->> 'reviewOriginSource' not in (
              'manual',
              'passport_ocr',
              'family_shared',
              'pdf_reconciliation'
            )
          )
          or (
            answer.value ? 'reviewSource'
            and answer.value ->> 'reviewSource' not in (
              'manual',
              'passport_ocr',
              'family_shared',
              'pdf_reconciliation'
            )
          )
          or (
            answer.value ? 'reviewState'
            and answer.value ->> 'reviewState' not in (
              'confirmed',
              'needs_review'
            )
          )
        )
      )
      or (
        jsonb_typeof(answer.value) not in ('object', 'string')
      )
      or (
        durable_answer.applicant_id is null
        and (
          answer.value ? 'adminReviewApprovedAtIso'
          or answer.value ? 'adminReviewApprovedBy'
        )
      )
      or (
        durable_answer.applicant_id is not null
        and app_private.questionnaire_semantic_text(answer.value)
          is not distinct from
            app_private.questionnaire_semantic_text(durable_answer.value)
        and (
          answer.value -> 'adminReviewApprovedAtIso'
            is distinct from
              durable_answer.value -> 'adminReviewApprovedAtIso'
          or answer.value -> 'adminReviewApprovedBy'
            is distinct from
              durable_answer.value -> 'adminReviewApprovedBy'
        )
      )
      or (
        durable_answer.applicant_id is not null
        and app_private.questionnaire_semantic_text(answer.value)
          is distinct from
            app_private.questionnaire_semantic_text(durable_answer.value)
        and (
          answer.value ? 'adminReviewApprovedAtIso'
          or answer.value ? 'adminReviewApprovedBy'
        )
      )
  ) or exists (
    select 1
    from public.questionnaire_answers as durable_answer
    where durable_answer.submission_id = submission_record.id
      and (
        durable_answer.value ? 'adminReviewApprovedAtIso'
        or durable_answer.value ? 'adminReviewApprovedBy'
      )
      and not exists (
        select 1
        from jsonb_to_recordset(payload -> 'questionnaire_answers') as answer (
          applicant_id text,
          section_id text,
          field_id text
        )
        where answer.applicant_id = durable_answer.applicant_id
          and answer.section_id = durable_answer.section_id
          and answer.field_id = durable_answer.field_id
      )
  ) then
    raise exception 'Agent questionnaire review metadata crosses the Admin trust boundary'
      using errcode = '42501';
  end if;

  if exists (
      select 1
      from jsonb_array_elements(snapshot_applicants) as snapshot_applicant(value)
      cross join lateral jsonb_array_elements(
        snapshot_applicant.value -> 'sections'
      ) as snapshot_section(value)
      where jsonb_typeof(snapshot_section.value) is distinct from 'object'
        or snapshot_section.value ->> 'id' not in (
          snapshot_applicant.value ->> 'id' || '-contacts',
          snapshot_applicant.value ->> 'id' || '-trip',
          snapshot_applicant.value ->> 'id' || '-hotel',
          snapshot_applicant.value ->> 'id' || '-appointment',
          snapshot_applicant.value ->> 'id' || '-personal',
          snapshot_applicant.value ->> 'id' || '-passport',
          snapshot_applicant.value ->> 'id' || '-employment'
        )
        or jsonb_typeof(snapshot_section.value -> 'fields')
          is distinct from 'array'
    )
    or exists (
      select 1
      from jsonb_array_elements(snapshot_applicants) as snapshot_applicant(value)
      cross join lateral jsonb_array_elements(
        snapshot_applicant.value -> 'sections'
      ) as snapshot_section(value)
      group by
        snapshot_applicant.value ->> 'id',
        snapshot_section.value ->> 'id'
      having count(*) > 1
    )
    or exists (
      select 1
      from jsonb_array_elements(snapshot_applicants) as snapshot_applicant(value)
      cross join lateral jsonb_array_elements(
        snapshot_applicant.value -> 'sections'
      ) as snapshot_section(value)
      cross join lateral jsonb_array_elements(
        snapshot_section.value -> 'fields'
      ) as snapshot_field(value)
      where jsonb_typeof(snapshot_field.value) is distinct from 'object'
        or nullif(btrim(coalesce(snapshot_field.value ->> 'id', '')), '') is null
        or nullif(btrim(coalesce(snapshot_field.value ->> 'label', '')), '') is null
        or not exists (
          select 1
          from jsonb_to_recordset(payload -> 'questionnaire_answers') as answer (
            applicant_id text,
            section_id text,
            field_id text,
            label text,
            value jsonb
          )
          where answer.applicant_id =
              snapshot_applicant.value ->> 'id'
            and answer.section_id = snapshot_section.value ->> 'id'
            and answer.field_id = snapshot_field.value ->> 'id'
            and answer.label = snapshot_field.value ->> 'label'
            and app_private.questionnaire_semantic_text(answer.value)
              is not distinct from nullif(
                btrim(coalesce(snapshot_field.value ->> 'value', '')),
                ''
              )
        )
    )
    or exists (
      select 1
      from jsonb_array_elements(snapshot_applicants) as snapshot_applicant(value)
      cross join lateral jsonb_array_elements(
        snapshot_applicant.value -> 'sections'
      ) as snapshot_section(value)
      cross join lateral jsonb_array_elements(
        snapshot_section.value -> 'fields'
      ) as snapshot_field(value)
      group by
        snapshot_applicant.value ->> 'id',
        snapshot_section.value ->> 'id',
        snapshot_field.value ->> 'id'
      having count(*) > 1
    )
    or exists (
      select 1
      from jsonb_to_recordset(payload -> 'questionnaire_answers') as answer (
        applicant_id text,
        section_id text,
        field_id text,
        label text,
        value jsonb
      )
      where not exists (
        select 1
        from jsonb_array_elements(snapshot_applicants)
          as snapshot_applicant(value)
        cross join lateral jsonb_array_elements(
          snapshot_applicant.value -> 'sections'
        ) as snapshot_section(value)
        cross join lateral jsonb_array_elements(
          snapshot_section.value -> 'fields'
        ) as snapshot_field(value)
        where snapshot_applicant.value ->> 'id' = answer.applicant_id
          and snapshot_section.value ->> 'id' = answer.section_id
          and snapshot_field.value ->> 'id' = answer.field_id
          and snapshot_field.value ->> 'label' = answer.label
          and nullif(
            btrim(coalesce(snapshot_field.value ->> 'value', '')),
            ''
          ) is not distinct from
            app_private.questionnaire_semantic_text(answer.value)
      )
    )
  then
    raise exception 'Agent cockpit questionnaire diverges from canonical answers'
      using errcode = '23514';
  end if;

  if jsonb_typeof(payload -> 'media_assets') is distinct from 'array'
    or exists (
      select 1
      from jsonb_to_recordset(payload -> 'media_assets') as media (
        id text,
        applicant_id text,
        submission_id text,
        type text,
        generated_file_name text,
        storage_bucket text,
        storage_path text
      )
      where nullif(btrim(coalesce(media.id, '')), '') is null
        or media.submission_id is distinct from submission_record.id
        or media.type not in ('passport_scan', 'selfie', 'selfie_2')
        or media.storage_bucket is distinct from 'submission-media'
        or nullif(btrim(coalesce(media.generated_file_name, '')), '') is null
        or nullif(btrim(coalesce(media.storage_path, '')), '') is null
        or not exists (
          select 1
          from jsonb_to_recordset(payload -> 'applicants') as applicant (
            id text
          )
          where applicant.id = media.applicant_id
        )
    )
    or exists (
      select 1
      from jsonb_to_recordset(payload -> 'media_assets') as media (
        id text,
        applicant_id text,
        type text
      )
      group by media.id
      having count(*) > 1
    )
    or exists (
      select 1
      from jsonb_to_recordset(payload -> 'media_assets') as media (
        id text,
        applicant_id text,
        type text
      )
      group by media.applicant_id, media.type
      having count(*) > 1
    )
  then
    raise exception 'Agent media projection contains invalid identities'
      using errcode = '23514';
  end if;

  if exists (
      select 1
      from jsonb_array_elements(snapshot_files) as snapshot_file(value)
      where jsonb_typeof(snapshot_file.value) is distinct from 'object'
        or snapshot_file.value ->> 'type'
          not in ('passport_scan', 'selfie', 'selfie_2')
        or not exists (
          select 1
          from jsonb_to_recordset(payload -> 'applicants') as applicant (
            id text
          )
          where applicant.id = snapshot_file.value ->> 'applicantId'
        )
    )
    or exists (
      select 1
      from jsonb_array_elements(snapshot_files) as snapshot_file(value)
      group by
        snapshot_file.value ->> 'applicantId',
        snapshot_file.value ->> 'type'
      having count(*) > 1
    )
    or exists (
      select 1
      from jsonb_array_elements(snapshot_files) as snapshot_file(value)
      where snapshot_file.value ->> 'uploadStatus' = 'uploaded'
        and snapshot_file.value ->> 'status'
          not in ('missing', 'needs_replacement')
        and (
          snapshot_file.value ->> 'storageAdapter'
            is distinct from 'supabase-private'
          or snapshot_file.value ->> 'storageBucket'
            is distinct from 'submission-media'
          or nullif(
            btrim(coalesce(snapshot_file.value ->> 'generatedFileName', '')),
            ''
          ) is null
          or nullif(
            btrim(coalesce(snapshot_file.value ->> 'storagePath', '')),
            ''
          ) is null
          or not exists (
            select 1
            from jsonb_to_recordset(payload -> 'media_assets') as media (
              applicant_id text,
              type text,
              generated_file_name text,
              storage_bucket text,
              storage_path text,
              review_status text
            )
            where media.applicant_id =
                snapshot_file.value ->> 'applicantId'
              and media.type = snapshot_file.value ->> 'type'
              and media.generated_file_name =
                snapshot_file.value ->> 'generatedFileName'
              and media.storage_bucket =
                snapshot_file.value ->> 'storageBucket'
              and media.storage_path =
                snapshot_file.value ->> 'storagePath'
              and media.review_status = coalesce(
                snapshot_file.value ->> 'reviewStatus',
                'not_reviewed'
              )
          )
        )
    )
    or exists (
      select 1
      from jsonb_to_recordset(payload -> 'media_assets') as media (
        applicant_id text,
        type text,
        generated_file_name text,
        storage_bucket text,
        storage_path text
      )
      where not exists (
        select 1
        from jsonb_array_elements(snapshot_files) as snapshot_file(value)
        where snapshot_file.value ->> 'applicantId' = media.applicant_id
          and snapshot_file.value ->> 'type' = media.type
          and snapshot_file.value ->> 'generatedFileName' =
            media.generated_file_name
          and snapshot_file.value ->> 'storageBucket' = media.storage_bucket
          and snapshot_file.value ->> 'storagePath' = media.storage_path
          and snapshot_file.value ->> 'uploadStatus' = 'uploaded'
          and snapshot_file.value ->> 'status'
            not in ('missing', 'needs_replacement')
      )
    )
  then
    raise exception 'Agent cockpit snapshot files diverge from canonical media'
      using errcode = '23514';
  end if;

  if jsonb_typeof(payload -> 'corrections') is distinct from 'array'
    or jsonb_typeof(final_history) is distinct from 'array'
    or exists (
      select 1
      from jsonb_to_recordset(final_history) as history (
        id uuid,
        entity_type text,
        entity_id text,
        from_status text,
        to_status text,
        source text,
        changed_by uuid
      )
      where history.id is null
        or history.entity_type is distinct from 'submission'
        or history.entity_id is distinct from submission_record.id
        or history.changed_by is distinct from actor_id
        or history.source is distinct from 'agent'
        or (history.from_status, history.to_status) not in (
          ('draft', 'in_progress'),
          ('in_progress', 'submitted_for_review'),
          ('returned', 'corrections_received'),
          ('ready_for_export', 'submitted_for_review')
        )
    )
    or exists (
      select 1
      from jsonb_to_recordset(final_history) as history (
        id uuid
      )
      group by history.id
      having count(*) > 1
    )
  then
    raise exception 'Agent status history contains invalid or untyped events'
      using errcode = '23514';
  end if;

  request_fingerprint := encode(
    extensions.digest(
      convert_to(
        payload::text || chr(31) || coalesce(expected_revision::text, 'null'),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  delete from app_private.agent_submission_mutation_receipts as stale_receipt
  where stale_receipt.actor_id = save_agent_submission_if_current.actor_id
    and stale_receipt.completed_at is not null
    and stale_receipt.created_at < clock_timestamp() - interval '90 days';

  delete from app_private.agent_submission_mutation_receipts as excess_receipt
  where excess_receipt.operation_id in (
    select retained_receipt.operation_id
    from app_private.agent_submission_mutation_receipts as retained_receipt
    where retained_receipt.actor_id = save_agent_submission_if_current.actor_id
      and retained_receipt.completed_at is not null
    order by retained_receipt.created_at desc
    offset 511
  );

  insert into app_private.agent_submission_mutation_receipts (
    operation_id,
    actor_id,
    submission_id,
    request_fingerprint
  ) values (
    operation_id,
    actor_id,
    submission_record.id,
    request_fingerprint
  )
  on conflict on constraint agent_submission_mutation_receipts_pkey do nothing;

  select
    receipt.request_fingerprint,
    receipt.result
  into receipt_fingerprint, receipt_result
  from app_private.agent_submission_mutation_receipts as receipt
  where receipt.operation_id = save_agent_submission_if_current.operation_id
    and receipt.actor_id = save_agent_submission_if_current.actor_id
    and receipt.submission_id = submission_record.id
  for update;

  if not found then
    raise exception 'Agent mutation operation id belongs to another request'
      using errcode = '42501';
  end if;

  if receipt_fingerprint is distinct from request_fingerprint then
    raise exception 'Agent mutation operation id was reused with a different request'
      using errcode = '23514';
  end if;

  if receipt_result is not null then
    return receipt_result;
  end if;

  select
    submission.id,
    submission.agent_id,
    submission.status,
    submission.case_revision
  into existing_submission
  from public.submissions as submission
  where submission.id = submission_record.id
  for update;

  if found then
    if existing_submission.agent_id is distinct from actor_id then
      raise exception 'Agent mutation cannot reassign submissions'
        using errcode = '42501';
    end if;

    if expected_revision is null
      or existing_submission.case_revision is distinct from expected_revision
    then
      raise exception 'V19_AGENT_SUBMISSION_CONFLICT: submission % changed from revision % to %',
        submission_record.id,
        expected_revision,
        existing_submission.case_revision
        using errcode = '40001';
    end if;
  elsif expected_revision is not null then
    raise exception 'V19_AGENT_SUBMISSION_CONFLICT: submission % no longer exists at revision %',
      submission_record.id,
      expected_revision
      using errcode = '40001';
  end if;

  if submission_record.status = 'waiting_review'
    and (
      (
        existing_submission.status in ('returned', 'ready_for_review')
        and snapshot_status is distinct from 'corrections_received'
      )
      or (
        existing_submission.status not in ('returned', 'ready_for_review')
        and snapshot_status is distinct from 'submitted_for_review'
      )
    )
  then
    raise exception 'Agent cockpit lifecycle status diverges from the requested handoff'
      using errcode = '23514';
  end if;

  if existing_submission.id is not null
    and existing_submission.status = 'draft'
    and submission_record.status = 'filling'
  then
    expected_history_transitions := jsonb_build_array(
      jsonb_build_object(
        'from_status', 'draft',
        'to_status', 'in_progress'
      )
    );
  elsif existing_submission.id is not null
    and existing_submission.status = 'draft'
    and submission_record.status = 'waiting_review'
  then
    expected_history_transitions := jsonb_build_array(
      jsonb_build_object(
        'from_status', 'draft',
        'to_status', 'in_progress'
      ),
      jsonb_build_object(
        'from_status', 'in_progress',
        'to_status', 'submitted_for_review'
      )
    );
  elsif existing_submission.id is not null
    and existing_submission.status = 'filling'
    and submission_record.status = 'waiting_review'
  then
    expected_history_transitions := jsonb_build_array(
      jsonb_build_object(
        'from_status', 'in_progress',
        'to_status', 'submitted_for_review'
      )
    );
  elsif existing_submission.id is not null
    and existing_submission.status in ('returned', 'ready_for_review')
    and submission_record.status = 'waiting_review'
  then
    expected_history_transitions := jsonb_build_array(
      jsonb_build_object(
        'from_status', 'returned',
        'to_status', 'corrections_received'
      )
    );
  elsif existing_submission.id is not null
    and existing_submission.status in ('accepted', 'ready_for_excel')
    and submission_record.status = 'waiting_review'
  then
    expected_history_transitions := jsonb_build_array(
      jsonb_build_object(
        'from_status', 'ready_for_export',
        'to_status', 'submitted_for_review'
      )
    );
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(final_history) as history (
      id uuid,
      entity_type text,
      entity_id text,
      from_status text,
      to_status text,
      source text,
      changed_by uuid
    )
    join public.status_history as durable_history
      on durable_history.id = history.id
    where durable_history.entity_type is distinct from history.entity_type
      or durable_history.entity_id is distinct from history.entity_id
      or durable_history.from_status is distinct from history.from_status
      or durable_history.to_status is distinct from history.to_status
      or durable_history.source is distinct from history.source
      or durable_history.changed_by is distinct from history.changed_by
  ) then
    raise exception 'Agent status history reuses a durable identity with different content'
      using errcode = '23514';
  end if;

  select count(*)::integer
  into new_history_count
  from jsonb_to_recordset(final_history) as history (
    id uuid
  )
  where not exists (
    select 1
    from public.status_history as durable_history
    where durable_history.id = history.id
  );

  if new_history_count <> jsonb_array_length(expected_history_transitions)
    or exists (
      select 1
      from jsonb_to_recordset(final_history) as history (
        id uuid,
        from_status text,
        to_status text
      )
      where not exists (
          select 1
          from public.status_history as durable_history
          where durable_history.id = history.id
        )
        and not exists (
          select 1
          from jsonb_to_recordset(expected_history_transitions) as expected (
            from_status text,
            to_status text
          )
          where expected.from_status = history.from_status
            and expected.to_status = history.to_status
        )
    )
    or exists (
      select 1
      from jsonb_to_recordset(expected_history_transitions) as expected (
        from_status text,
        to_status text
      )
      where (
        select count(*)
        from jsonb_to_recordset(final_history) as history (
          id uuid,
          from_status text,
          to_status text
        )
        where history.from_status = expected.from_status
          and history.to_status = expected.to_status
          and not exists (
            select 1
            from public.status_history as durable_history
            where durable_history.id = history.id
          )
      ) <> 1
    )
  then
    raise exception 'Agent status history does not match the requested lifecycle mutation'
      using errcode = '23514';
  end if;

  if existing_submission.id is null
    and submission_record.status <> 'draft'
  then
    raise exception 'A new Agent submission must start as draft'
      using errcode = '23514';
  end if;

  if existing_submission.id is not null
    and existing_submission.status = 'draft'
    and submission_record.status = 'filling'
  then
    if
      jsonb_typeof(final_history) is distinct from 'array'
      or jsonb_array_length(final_history) < 1
      or final_history -> 0 ->> 'from_status' <> 'draft'
      or final_history -> 0 ->> 'to_status' <> 'in_progress'
      or final_history -> 0 ->> 'source' <> 'agent'
    then
      raise exception 'In-progress Agent snapshots require canonical audit history'
      using errcode = '23514';
    end if;
  end if;

  if existing_submission.id is not null then
    if existing_submission.status = 'draft'
      and submission_record.status not in ('draft', 'filling', 'waiting_review')
    then
      raise exception 'Draft Agent submissions can only remain draft, enter progress, or be submitted'
        using errcode = '42501';
    elsif existing_submission.status = 'filling'
      and submission_record.status not in ('filling', 'waiting_review')
    then
      raise exception 'In-progress Agent submissions cannot regress to draft'
        using errcode = '42501';
    elsif existing_submission.status = 'returned'
      and submission_record.status not in ('returned', 'waiting_review')
    then
      raise exception 'Returned Agent submissions can only remain returned or be resubmitted'
        using errcode = '42501';
    elsif existing_submission.status = 'ready_for_review'
      and submission_record.status <> 'waiting_review'
    then
      raise exception 'Correction-ready Agent submissions must complete the review handoff'
        using errcode = '42501';
    end if;
  end if;

  perform set_config(
    'app.visaflow_agent_cas_operation_id',
    operation_id::text,
    true
  );
  -- The historical draft dispatcher preserves applicant projection columns
  -- unless it is inside a handoff checkpoint. A revision-checked full Agent
  -- snapshot is itself an authoritative projection write, including family
  -- role edits, so enable that internal path only for this RPC scope.
  perform set_config('app.visaflow_submission_handoff', 'on', true);

  if existing_submission.id is not null
    and existing_submission.status in ('draft', 'filling')
  then
    delete from public.media_assets as media
    where media.submission_id = submission_record.id
      and not exists (
        select 1
        from jsonb_to_recordset(payload -> 'media_assets') as media_payload (
          id text
        )
        where media_payload.id = media.id
      );

    delete from public.applicants as applicant
    where applicant.submission_id = submission_record.id
      and not exists (
        select 1
        from jsonb_to_recordset(payload -> 'applicants') as applicant_payload (
          id text
        )
        where applicant_payload.id = applicant.id
      );
  end if;

  if existing_submission.id is not null
    and submission_record.status = 'waiting_review'
    and existing_submission.status in ('returned', 'ready_for_review')
  then
    if
      jsonb_typeof(final_history) is distinct from 'array'
      or jsonb_array_length(final_history) < 1
      or final_history -> 0 ->> 'from_status' <> 'returned'
      or final_history -> 0 ->> 'to_status' <> 'corrections_received'
      or final_history -> 0 ->> 'source' <> 'agent'
    then
      raise exception 'Correction handoff requires canonical Agent audit history'
        using errcode = '23514';
    end if;
    if not exists (
      select 1
      from jsonb_to_recordset(
        coalesce(payload -> 'corrections', '[]'::jsonb)
      ) as correction_payload (
        status text
      )
      where correction_payload.status = 'fixed'
    ) then
      raise exception 'Correction handoff requires fixed corrections'
        using errcode = '23514';
    end if;

    if existing_submission.status = 'returned' then
      intermediate_payload := jsonb_set(
        payload,
        '{submission,status}',
        to_jsonb('ready_for_review'::text),
        false
      );
      perform app_private.dispatch_submission_draft_with_revision_context(
        intermediate_payload
      );
    end if;
    persisted_result := app_private.dispatch_submission_draft_with_revision_context(
      payload
    );
  elsif existing_submission.id is not null
    and submission_record.status = 'waiting_review'
  then
    if existing_submission.status = 'draft' then
      if
        jsonb_typeof(final_history) is distinct from 'array'
        or jsonb_array_length(final_history) < 2
        or final_history -> 0 ->> 'from_status' <> 'in_progress'
        or final_history -> 0 ->> 'to_status' <> 'submitted_for_review'
        or final_history -> 0 ->> 'source' <> 'agent'
        or final_history -> 1 ->> 'from_status' <> 'draft'
        or final_history -> 1 ->> 'to_status' <> 'in_progress'
        or final_history -> 1 ->> 'source' <> 'agent'
      then
        raise exception 'Draft review handoff requires both canonical Agent transitions'
          using errcode = '23514';
      end if;

      intermediate_payload := jsonb_set(
        jsonb_set(
          jsonb_set(
            payload,
            '{submission,status}',
            to_jsonb('filling'::text),
            false
          ),
          '{submission,submitted_at}',
          'null'::jsonb,
          true
        ),
        '{status_history}',
        final_history - 0,
        false
      );

      perform app_private.dispatch_submission_draft_with_revision_context(
        intermediate_payload
      );
    elsif existing_submission.status = 'filling' then
      if
        jsonb_typeof(final_history) is distinct from 'array'
        or jsonb_array_length(final_history) < 1
        or final_history -> 0 ->> 'from_status' <> 'in_progress'
        or final_history -> 0 ->> 'to_status' <> 'submitted_for_review'
        or final_history -> 0 ->> 'source' <> 'agent'
      then
        raise exception 'Review handoff requires canonical Agent audit history'
          using errcode = '23514';
      end if;
    elsif existing_submission.status in ('accepted', 'ready_for_excel') then
      if
        jsonb_typeof(final_history) is distinct from 'array'
        or jsonb_array_length(final_history) < 1
        or final_history -> 0 ->> 'from_status' <> 'ready_for_export'
        or final_history -> 0 ->> 'to_status' <> 'submitted_for_review'
        or final_history -> 0 ->> 'source' <> 'agent'
        or submission_record.appointment_status <> 'not_started'
        or submission_record.review_started_at is not null
        or submission_record.accepted_at is not null
        or submission_record.exported_at is not null
        or payload #>> '{submission,family_intelligence,v19CockpitSnapshot,submission,exportState}'
          is distinct from 'not_ready'
        or coalesce(
          payload #> '{submission,family_intelligence,v19CockpitSnapshot,submission}',
          '{}'::jsonb
        ) ? 'exportPackage'
        or exists (
          select 1
          from jsonb_to_recordset(
            coalesce(payload -> 'media_assets', '[]'::jsonb)
          ) as media_payload (
            review_status public.media_review_status,
            reviewed_at timestamptz,
            reviewed_by uuid
          )
          where media_payload.review_status is distinct from
              'not_reviewed'::public.media_review_status
            or media_payload.reviewed_at is not null
            or media_payload.reviewed_by is not null
        )
      then
        raise exception 'Export-ready review handoff must clear review and export state'
          using errcode = '23514';
      end if;
      export_ready_handoff := true;
      perform set_config('app.visaflow_agent_review_handoff', 'on', true);
    else
      raise exception 'Review handoff cannot start from the current submission status'
        using errcode = '42501';
    end if;

    persisted_result := app_private.dispatch_submission_draft_with_revision_context(
      payload
    );
  elsif existing_submission.id is not null
    and existing_submission.status in (
      'waiting_review',
      'in_review',
      'accepted',
      'ready_for_excel',
      'exported',
      'sent_to_appointment',
      'appointment_scheduled',
      'attention_required',
      'completed'
    )
  then
    raise exception 'Agent snapshot cannot mutate the current submission status'
      using errcode = '42501';
  else
    persisted_result := app_private.dispatch_submission_draft_with_revision_context(
      payload
    );
  end if;

  if exists (
      select 1
      from jsonb_to_recordset(payload -> 'applicants') as applicant_payload (
        id text,
        submission_id text,
        full_name text,
        role text,
        suggested_role text,
        role_confirmed boolean,
        birth_date date,
        patronymic text,
        citizenship text,
        address text,
        phone text,
        email text,
        passport_number text,
        passport_issued_at date,
        passport_expires_at date,
        country text,
        city text,
        trip_dates text,
        hotel_name text,
        hotel_address text,
        questionnaire_percent integer,
        media_percent integer
      )
      where not exists (
        select 1
        from public.applicants as applicant
        where applicant.id = applicant_payload.id
          and applicant.submission_id = applicant_payload.submission_id
          and applicant.full_name is not distinct from applicant_payload.full_name
          and applicant.role is not distinct from applicant_payload.role
          and applicant.suggested_role is not distinct from
            applicant_payload.suggested_role
          and applicant.role_confirmed is not distinct from
            applicant_payload.role_confirmed
          and applicant.birth_date is not distinct from
            applicant_payload.birth_date
          and applicant.patronymic is not distinct from
            applicant_payload.patronymic
          and applicant.citizenship is not distinct from
            applicant_payload.citizenship
          and applicant.address is not distinct from applicant_payload.address
          and applicant.phone is not distinct from applicant_payload.phone
          and applicant.email is not distinct from applicant_payload.email
          and applicant.passport_number is not distinct from
            applicant_payload.passport_number
          and applicant.passport_issued_at is not distinct from
            applicant_payload.passport_issued_at
          and applicant.passport_expires_at is not distinct from
            applicant_payload.passport_expires_at
          and applicant.country is not distinct from applicant_payload.country
          and applicant.city is not distinct from applicant_payload.city
          and applicant.trip_dates is not distinct from
            applicant_payload.trip_dates
          and applicant.hotel_name is not distinct from
            applicant_payload.hotel_name
          and applicant.hotel_address is not distinct from
            applicant_payload.hotel_address
          and applicant.questionnaire_percent is not distinct from
            applicant_payload.questionnaire_percent
          and applicant.media_percent is not distinct from
            applicant_payload.media_percent
      )
    )
    or exists (
      select 1
      from public.applicants as applicant
      where applicant.submission_id = submission_record.id
        and not exists (
          select 1
          from jsonb_to_recordset(payload -> 'applicants') as applicant_payload (
            id text
          )
          where applicant_payload.id = applicant.id
        )
    )
  then
    raise exception 'Persisted Agent applicants diverge from the requested package'
      using errcode = '23514';
  end if;

  if exists (
      select 1
      from jsonb_to_recordset(payload -> 'questionnaire_answers') as answer_payload (
        submission_id text,
        applicant_id text,
        section_id text,
        field_id text,
        label text,
        value jsonb
      )
      where not exists (
        select 1
        from public.questionnaire_answers as answer
        where answer.submission_id = answer_payload.submission_id
          and answer.applicant_id = answer_payload.applicant_id
          and answer.section_id = answer_payload.section_id
          and answer.field_id = answer_payload.field_id
          and answer.label is not distinct from answer_payload.label
          and answer.value is not distinct from answer_payload.value
      )
    )
    or exists (
      select 1
      from public.questionnaire_answers as answer
      where answer.submission_id = submission_record.id
        and not exists (
          select 1
          from jsonb_to_recordset(
            payload -> 'questionnaire_answers'
          ) as answer_payload (
            applicant_id text,
            section_id text,
            field_id text
          )
          where answer_payload.applicant_id = answer.applicant_id
            and answer_payload.section_id = answer.section_id
            and answer_payload.field_id = answer.field_id
        )
    )
  then
    raise exception 'Persisted Agent questionnaire diverges from the requested package'
      using errcode = '23514';
  end if;

  if exists (
      select 1
      from jsonb_to_recordset(payload -> 'media_assets') as media_payload (
        id text,
        applicant_id text,
        submission_id text,
        type text,
        generated_file_name text,
        storage_bucket text,
        storage_path text,
        upload_status text,
        review_status text,
        reviewed_at timestamptz,
        reviewed_by uuid
      )
      where not exists (
        select 1
        from public.media_assets as media
        where media.id = media_payload.id
          and media.applicant_id = media_payload.applicant_id
          and media.submission_id = media_payload.submission_id
          and media.type::text = media_payload.type
          and media.generated_file_name is not distinct from
            media_payload.generated_file_name
          and media.storage_bucket is not distinct from
            media_payload.storage_bucket
          and media.storage_path is not distinct from media_payload.storage_path
          and media.upload_status::text is not distinct from
            coalesce(media_payload.upload_status, 'uploaded')
          and media.review_status::text is not distinct from
            media_payload.review_status
          and media.reviewed_at is not distinct from media_payload.reviewed_at
          and media.reviewed_by is not distinct from media_payload.reviewed_by
      )
    )
    or exists (
      select 1
      from public.media_assets as media
      where media.submission_id = submission_record.id
        and not exists (
          select 1
          from jsonb_to_recordset(payload -> 'media_assets') as media_payload (
            id text
          )
          where media_payload.id = media.id
        )
        and not (
          submission_record.status in ('returned', 'ready_for_review')
          and media.review_status::text in (
            'replace_required',
            'poor_quality'
          )
        )
    )
  then
    raise exception 'Persisted Agent media diverges from the requested package'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(final_history) as history_payload (
      id uuid,
      entity_type text,
      entity_id text,
      from_status text,
      to_status text,
      source text,
      note text,
      changed_by uuid
    )
    where not exists (
      select 1
      from public.status_history as history
      where history.id = history_payload.id
        and history.entity_type = history_payload.entity_type
        and history.entity_id = history_payload.entity_id
        and history.from_status is not distinct from history_payload.from_status
        and history.to_status = history_payload.to_status
        and history.source = history_payload.source
        and history.note is not distinct from history_payload.note
        and history.changed_by = history_payload.changed_by
    )
  ) then
    raise exception 'Persisted Agent audit history diverges from the requested lifecycle'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(snapshot_history) as snapshot_event(value)
    where (
        snapshot_event.value ? 'fromStatus'
        or snapshot_event.value ? 'toStatus'
      )
      and (
        nullif(
          btrim(coalesce(snapshot_event.value ->> 'fromStatus', '')),
          ''
        ) is null
        or nullif(
          btrim(coalesce(snapshot_event.value ->> 'toStatus', '')),
          ''
        ) is null
        or snapshot_event.value ->> 'source'
          not in ('agent', 'admin', 'bb', 'system')
        or not exists (
          select 1
          from public.status_history as history
          where history.entity_type = 'submission'
            and history.entity_id = submission_record.id
            and history.from_status =
              snapshot_event.value ->> 'fromStatus'
            and history.to_status = snapshot_event.value ->> 'toStatus'
            and history.source = snapshot_event.value ->> 'source'
            and history.note is not distinct from
              snapshot_event.value ->> 'note'
        )
      )
  ) then
    raise exception 'Agent cockpit audit history diverges from durable history'
      using errcode = '23514';
  end if;

  if submission_record.status = 'waiting_review'
    and not app_private.agent_submission_questionnaire_complete(
      submission_record.id
    )
  then
    raise exception 'Every applicant requires a complete durable questionnaire before review'
      using errcode = '23514';
  end if;

  if submission_record.status = 'waiting_review' and exists (
    select 1
    from public.questionnaire_answers as answer
    cross join lateral (
      select app_private.questionnaire_semantic_text(answer.value) as value
    ) as semantic
    where answer.submission_id = submission_record.id
      and (
        (
          answer.field_id = 'email'
          and (
            semantic.value is null
            or semantic.value !~
              '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
          )
        )
        or (
          answer.field_id = 'contact-number'
          and length(
            regexp_replace(coalesce(semantic.value, ''), '\D', '', 'g')
          ) not between 7 and 18
        )
        or (
          answer.field_id in (
            'arrival-date',
            'departure-date',
            'desired-date-1',
            'desired-date-2',
            'birth-date',
            'passport-issue-date',
            'passport-expiry-date'
          )
          and not app_private.questionnaire_semantic_date_is_valid(
            semantic.value
          )
        )
        or (
          answer.field_id = 'passport-no'
          and regexp_replace(coalesce(semantic.value, ''), '\s', '', 'g')
            !~* '^[A-ZА-Я0-9-]{5,20}$'
        )
      )
  ) then
    raise exception 'Durable questionnaire contains invalid required field values'
      using errcode = '23514';
  end if;

  if submission_record.status = 'waiting_review' and exists (
    select 1
    from public.applicants as applicant
    cross join lateral (
      values
        ('passport_scan'),
        ('selfie'),
        ('selfie_2')
    ) as required_media(type)
    where applicant.submission_id = submission_record.id
      and (
        required_media.type = 'passport_scan'
        or applicant.role = 'Основной заявитель'
      )
      and not exists (
        select 1
        from public.media_assets as media
        where media.submission_id = submission_record.id
          and media.applicant_id = applicant.id
          and media.type::text = required_media.type
          and media.storage_bucket = 'submission-media'
          and media.upload_status::text = 'uploaded'
          and media.review_status::text
            not in ('replace_required', 'poor_quality')
          and nullif(btrim(coalesce(media.generated_file_name, '')), '') is not null
          and media.storage_path !~ '(^/|//|\.\.)'
          and split_part(media.storage_path, '/', 1) = 'submissions'
          and split_part(media.storage_path, '/', 2) = submission_record.id
          and split_part(media.storage_path, '/', 3) = 'applicants'
          and split_part(media.storage_path, '/', 4) = applicant.id
          and split_part(media.storage_path, '/', 5) = required_media.type
          and split_part(media.storage_path, '/', 6) =
            media.generated_file_name
          and split_part(media.storage_path, '/', 7) = ''
          and exists (
            select 1
            from storage.objects as stored_object
            where stored_object.bucket_id = media.storage_bucket
              and stored_object.name = media.storage_path
          )
      )
  ) then
    raise exception 'Every required review document must exist in private Storage'
      using errcode = '23514';
  end if;

  if export_ready_handoff and exists (
    select 1
    from public.media_assets as media
    where media.submission_id = submission_record.id
      and (
        media.review_status is distinct from
          'not_reviewed'::public.media_review_status
        or media.reviewed_at is not null
        or media.reviewed_by is not null
        or not exists (
          select 1
          from jsonb_to_recordset(
            coalesce(payload -> 'media_assets', '[]'::jsonb)
          ) as media_payload (
            id text
          )
          where media_payload.id = media.id
        )
      )
  ) then
    raise exception 'Export-ready review handoff left media outside Admin review'
      using errcode = '23514';
  end if;

  perform set_config(
    'app.visaflow_agent_review_handoff',
    coalesce(previous_review_handoff_context, ''),
    true
  );
  perform set_config(
    'app.visaflow_submission_handoff',
    coalesce(previous_submission_handoff_context, ''),
    true
  );

  select submission.case_revision
  into current_revision
  from public.submissions as submission
  where submission.id = submission_record.id;

  if current_revision is null then
    raise exception 'Agent mutation did not persist the requested submission'
      using errcode = '40001';
  end if;

  response := jsonb_build_object(
    'operationId', operation_id,
    'submissionId', submission_record.id,
    'caseRevision', current_revision,
    'result', persisted_result
  );

  update app_private.agent_submission_mutation_receipts as receipt
  set result = response,
      completed_at = clock_timestamp()
  where receipt.operation_id = save_agent_submission_if_current.operation_id
    and receipt.actor_id = save_agent_submission_if_current.actor_id;

  perform set_config(
    'app.visaflow_agent_cas_operation_id',
    coalesce(previous_cas_operation_context, ''),
    true
  );

  return response;
exception when others then
  perform set_config(
    'app.visaflow_agent_review_handoff',
    coalesce(previous_review_handoff_context, ''),
    true
  );
  perform set_config(
    'app.visaflow_submission_handoff',
    coalesce(previous_submission_handoff_context, ''),
    true
  );
  perform set_config(
    'app.visaflow_agent_cas_operation_id',
    coalesce(previous_cas_operation_context, ''),
    true
  );
  raise;
end;
$function$;

-- Assigning the immutable public number remains a separate server-only
-- operation. Return the resulting aggregate revision so the next Agent CAS
-- write does not race the revision bump caused by this allocator.
create or replace function public.ensure_submission_public_number(
  submission_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  actor_id uuid := auth.uid();
  actor_role public.profile_role := app_private.current_profile_role();
  current_revision bigint;
  next_number bigint;
  submission_record record;
begin
  if actor_id is null then
    raise exception 'Authenticated user required to assign submission public number'
      using errcode = '28000';
  end if;
  if actor_role not in ('agent', 'admin') then
    raise exception 'Approved Agent or Admin profile required to assign submission public number'
      using errcode = '42501';
  end if;

  select
    submission.id,
    submission.agent_id,
    submission.public_number,
    submission.case_revision
  into submission_record
  from public.submissions as submission
  where submission.id = $1
  for update;

  if not found then
    raise exception 'Submission not found' using errcode = 'P0002';
  end if;
  if actor_role is distinct from 'admin'
    and submission_record.agent_id is distinct from actor_id
  then
    raise exception 'Cannot assign public number for another agent'
      using errcode = '42501';
  end if;
  if submission_record.public_number is not null then
    return jsonb_build_object(
      'publicNumber', submission_record.public_number,
      'assignedNow', false,
      'caseRevision', submission_record.case_revision
    );
  end if;
  if not exists (
    select 1
    from public.applicants as applicant
    where applicant.submission_id = submission_record.id
  ) or exists (
    select 1
    from public.applicants as applicant
    where applicant.submission_id = submission_record.id
      and applicant.questionnaire_percent < 100
  ) or not app_private.agent_submission_questionnaire_complete(
    submission_record.id
  ) then
    raise exception 'Questionnaire must be complete before assigning public number'
      using errcode = '23514';
  end if;

  next_number := nextval('public.submission_public_number_seq');
  perform set_config('app.v19_public_number_assignment', 'allowed', true);
  update public.submissions as submission
  set public_number = next_number
  where submission.id = submission_record.id
  returning submission.case_revision into current_revision;

  return jsonb_build_object(
    'publicNumber', next_number,
    'assignedNow', true,
    'caseRevision', current_revision
  );
end;
$function$;

revoke all on function public.ensure_submission_public_number(text)
  from public, anon;
grant execute on function public.ensure_submission_public_number(text)
  to authenticated;

revoke all on function public.save_agent_submission_if_current(
  jsonb,
  bigint,
  uuid,
  uuid
) from public, anon, authenticated;
grant execute on function public.save_agent_submission_if_current(
  jsonb,
  bigint,
  uuid,
  uuid
) to authenticated;

-- The current Agent UI writes every full snapshot through the CAS RPC above.
-- Leaving historical public mutation RPCs executable would let an old or
-- direct client bypass expected_revision and overwrite a newer package.
revoke all on function public.save_submission_draft(jsonb)
  from public, anon, authenticated;
revoke all on function public.submit_corrections_handoff(jsonb)
  from public, anon, authenticated;
revoke all on function public.upsert_questionnaire_answers(jsonb)
  from public, anon, authenticated;

do $verify$
declare
  function_oid oid := to_regprocedure(
    'public.save_agent_submission_if_current(jsonb,bigint,uuid,uuid)'
  )::oid;
  receipt_table_oid oid := to_regclass(
    'app_private.agent_submission_mutation_receipts'
  )::oid;
  guarded_table_name text;
begin
  if function_oid is null or receipt_table_oid is null then
    raise exception 'Agent concurrency boundary is missing';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc as procedure
    where procedure.oid = function_oid
      and procedure.prosecdef
  ) then
    raise exception 'Agent concurrency RPC must remain SECURITY INVOKER';
  end if;

  if has_function_privilege('anon', function_oid, 'EXECUTE') then
    raise exception 'Anonymous execution is enabled for Agent concurrency RPC';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc as procedure
    cross join lateral aclexplode(
      coalesce(procedure.proacl, acldefault('f', procedure.proowner))
    ) as privilege
    where procedure.oid = function_oid
      and privilege.grantee = 0
      and privilege.privilege_type = 'EXECUTE'
  ) then
    raise exception 'PUBLIC execution is enabled for Agent concurrency RPC';
  end if;

  if not has_function_privilege('authenticated', function_oid, 'EXECUTE') then
    raise exception 'Authenticated execution is missing for Agent concurrency RPC';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.save_submission_draft(jsonb)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.submit_corrections_handoff(jsonb)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.upsert_questionnaire_answers(jsonb)',
    'EXECUTE'
  ) then
    raise exception 'A revision-blind Agent mutation RPC remains executable';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc as procedure
    cross join lateral unnest(
      coalesce(procedure.proconfig, '{}'::text[])
    ) as setting
    where procedure.oid = function_oid
      and setting =
        'search_path=pg_catalog, public, app_private, extensions'
  ) then
    raise exception 'Agent concurrency RPC has an unexpected search_path';
  end if;

  if not (
    select class.relrowsecurity
    from pg_catalog.pg_class as class
    where class.oid = receipt_table_oid
  ) then
    raise exception 'Agent mutation receipts must keep RLS enabled';
  end if;

  foreach guarded_table_name in array array[
    'submissions',
    'applicants',
    'questionnaire_answers',
    'media_assets',
    'corrections',
    'status_history'
  ]
  loop
    if not exists (
      select 1
      from pg_catalog.pg_trigger as trigger
      where trigger.tgrelid = to_regclass(
        format('public.%I', guarded_table_name)
      )
        and trigger.tgname =
          guarded_table_name || '_agent_cas_write_boundary'
        and not trigger.tgisinternal
    ) then
      raise exception 'Agent CAS trigger is missing on public.%', guarded_table_name;
    end if;
  end loop;
end;
$verify$;

commit;

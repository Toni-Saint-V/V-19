-- Preserve the V-19 trip date range in normalized Supabase rows.
-- This is additive and keeps legacy travel_date available for older rows and readers.

alter table public.submissions
  add column if not exists trip_date_from text,
  add column if not exists trip_date_to text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'submissions_trip_date_from_not_blank'
  ) then
    alter table public.submissions
      add constraint submissions_trip_date_from_not_blank
      check (trip_date_from is null or btrim(trip_date_from) <> '');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'submissions_trip_date_to_not_blank'
  ) then
    alter table public.submissions
      add constraint submissions_trip_date_to_not_blank
      check (trip_date_to is null or btrim(trip_date_to) <> '');
  end if;
end
$$;

with legacy_trip_dates as (
  select
    id,
    nullif(btrim(travel_date), '') as legacy_trip_date,
    regexp_match(
      coalesce(nullif(btrim(travel_date), ''), ''),
      '^\s*(.*?)\s+-\s+(.*?)\s*$'
    ) as legacy_trip_date_parts
  from public.submissions
  where nullif(btrim(travel_date), '') is not null
    and (trip_date_from is null or trip_date_to is null)
)
update public.submissions s
set
  trip_date_from = coalesce(
    s.trip_date_from,
    nullif(btrim(coalesce(legacy_trip_dates.legacy_trip_date_parts[1], legacy_trip_dates.legacy_trip_date)), '')
  ),
  trip_date_to = coalesce(
    s.trip_date_to,
    nullif(btrim(coalesce(legacy_trip_dates.legacy_trip_date_parts[2], legacy_trip_dates.legacy_trip_date)), '')
  )
from legacy_trip_dates
where s.id = legacy_trip_dates.id;

create or replace function public.save_submission_draft(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  result jsonb;
  submission_record record;
  questionnaire_answer_count integer := 0;
  legacy_trip_date text;
  legacy_trip_date_parts text[];
  normalized_trip_date_from text;
  normalized_trip_date_to text;
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
    from jsonb_to_recordset(coalesce(payload -> 'questionnaire_answers', '[]'::jsonb)) as answer_payload (
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

  result := app_private.save_submission_draft_without_questionnaire_rows(payload);

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

  if payload ? 'questionnaire_answers' then
    if exists (
      select 1
      from jsonb_to_recordset(coalesce(payload -> 'questionnaire_answers', '[]'::jsonb)) as answer_payload (
        applicant_id text
      )
      where not exists (
        select 1
        from public.applicants a
        where a.id = answer_payload.applicant_id
          and a.submission_id = submission_record.id
      )
    ) then
      raise exception 'Questionnaire answer applicant does not belong to submission'
        using errcode = '23503';
    end if;

    delete from public.questionnaire_answers qa
    where qa.submission_id = submission_record.id
      and not exists (
        select 1
        from jsonb_to_recordset(coalesce(payload -> 'questionnaire_answers', '[]'::jsonb)) as answer_payload (
          applicant_id text,
          section_id text,
          field_id text
        )
        where answer_payload.applicant_id = qa.applicant_id
          and answer_payload.section_id = qa.section_id
          and answer_payload.field_id = qa.field_id
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
    from jsonb_to_recordset(coalesce(payload -> 'questionnaire_answers', '[]'::jsonb)) as answer_payload (
      submission_id text,
      applicant_id text,
      section_id text,
      field_id text,
      label text,
      value jsonb
    )
    on conflict (applicant_id, section_id, field_id) do update set
      submission_id = excluded.submission_id,
      label = excluded.label,
      value = excluded.value,
      updated_by = auth.uid(),
      updated_at = now();

    get diagnostics questionnaire_answer_count = row_count;
  end if;

  return result || jsonb_build_object(
    'questionnaireAnswers',
    questionnaire_answer_count
  );
end;
$$;

revoke all on function public.save_submission_draft(jsonb) from public;
grant execute on function public.save_submission_draft(jsonb) to authenticated;

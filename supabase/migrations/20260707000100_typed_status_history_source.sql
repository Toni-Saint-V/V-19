alter table public.status_history
  add column if not exists source text not null default 'system',
  add column if not exists note text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'status_history_source_check'
      and conrelid = 'public.status_history'::regclass
  ) then
    alter table public.status_history
      add constraint status_history_source_check
      check (source in ('agent', 'admin', 'bb', 'system'));
  end if;
end;
$$;

comment on column public.status_history.source is
  'Typed cockpit status event source: agent, admin, bb, or system.';
comment on column public.status_history.note is
  'Structured status event note preserved separately from display comment.';

create or replace function public.save_submission_draft(payload jsonb)
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
  from jsonb_to_recordset(coalesce(payload -> 'status_history', '[]'::jsonb)) as history_payload (
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
  result := jsonb_set(result, '{statusHistory}', to_jsonb(status_history_count), true);

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
      label = excluded.label,
      value = excluded.value,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at;

    get diagnostics questionnaire_answer_count = row_count;
  end if;

  return result || jsonb_build_object('questionnaireAnswers', questionnaire_answer_count);
end;
$$;

revoke all on function public.save_submission_draft(jsonb) from public;
grant execute on function public.save_submission_draft(jsonb) to authenticated;

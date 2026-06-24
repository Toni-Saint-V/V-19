create table if not exists public.questionnaire_answers (
  id uuid primary key default gen_random_uuid(),
  submission_id text not null references public.submissions (id) on delete cascade,
  applicant_id text not null references public.applicants (id) on delete cascade,
  section_id text not null,
  field_id text not null,
  label text not null,
  value jsonb not null default '""'::jsonb,
  updated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (applicant_id, section_id, field_id),
  check (length(trim(section_id)) > 0),
  check (length(trim(field_id)) > 0),
  check (length(trim(label)) > 0)
);

create index if not exists questionnaire_answers_submission_id_idx
on public.questionnaire_answers (submission_id);

create index if not exists questionnaire_answers_applicant_id_idx
on public.questionnaire_answers (applicant_id);

create index if not exists questionnaire_answers_updated_by_idx
on public.questionnaire_answers (updated_by);

alter table public.questionnaire_answers enable row level security;

drop policy if exists "questionnaire answers read through submission"
  on public.questionnaire_answers;
drop policy if exists "questionnaire answers write editable submission"
  on public.questionnaire_answers;
drop policy if exists "questionnaire answers update editable submission"
  on public.questionnaire_answers;
drop policy if exists "questionnaire answers delete editable submission"
  on public.questionnaire_answers;

create policy "questionnaire answers read through submission"
on public.questionnaire_answers for select
using (
  exists (
    select 1
    from public.submissions s
    where s.id = questionnaire_answers.submission_id
      and (
        s.agent_id = (select auth.uid())
        or (select app_private.current_profile_role()) = 'admin'
      )
  )
);

create policy "questionnaire answers write editable submission"
on public.questionnaire_answers for insert
with check (
  exists (
    select 1
    from public.submissions s
    join public.applicants a on a.submission_id = s.id
    where s.id = questionnaire_answers.submission_id
      and a.id = questionnaire_answers.applicant_id
      and (
        (select app_private.current_profile_role()) = 'admin'
        or (
          s.agent_id = (select auth.uid())
          and s.status in ('draft', 'filling', 'returned', 'ready_for_review')
        )
      )
  )
);

create policy "questionnaire answers update editable submission"
on public.questionnaire_answers for update
using (
  exists (
    select 1
    from public.submissions s
    join public.applicants a on a.submission_id = s.id
    where s.id = questionnaire_answers.submission_id
      and a.id = questionnaire_answers.applicant_id
      and (
        (select app_private.current_profile_role()) = 'admin'
        or (
          s.agent_id = (select auth.uid())
          and s.status in ('draft', 'filling', 'returned', 'ready_for_review')
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.submissions s
    join public.applicants a on a.submission_id = s.id
    where s.id = questionnaire_answers.submission_id
      and a.id = questionnaire_answers.applicant_id
      and (
        (select app_private.current_profile_role()) = 'admin'
        or (
          s.agent_id = (select auth.uid())
          and s.status in ('draft', 'filling', 'returned', 'ready_for_review')
        )
      )
  )
);

create policy "questionnaire answers delete editable submission"
on public.questionnaire_answers for delete
using (
  exists (
    select 1
    from public.submissions s
    join public.applicants a on a.submission_id = s.id
    where s.id = questionnaire_answers.submission_id
      and a.id = questionnaire_answers.applicant_id
      and (
        (select app_private.current_profile_role()) = 'admin'
        or (
          s.agent_id = (select auth.uid())
          and s.status in ('draft', 'filling', 'returned', 'ready_for_review')
        )
      )
  )
);

create or replace function public.upsert_questionnaire_answers(answers jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  answer_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authenticated user required to save questionnaire answers'
      using errcode = '28000';
  end if;

  if jsonb_typeof(coalesce(answers, '[]'::jsonb)) <> 'array' then
    raise exception 'Questionnaire answers payload must be an array'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(answers, '[]'::jsonb)) as answer_payload (
      submission_id text,
      applicant_id text,
      section_id text,
      field_id text,
      label text
    )
    where nullif(trim(coalesce(answer_payload.submission_id, '')), '') is null
      or nullif(trim(coalesce(answer_payload.applicant_id, '')), '') is null
      or nullif(trim(coalesce(answer_payload.section_id, '')), '') is null
      or nullif(trim(coalesce(answer_payload.field_id, '')), '') is null
      or nullif(trim(coalesce(answer_payload.label, '')), '') is null
  ) then
    raise exception 'Questionnaire answer payload is missing required identity fields'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(answers, '[]'::jsonb)) as answer_payload (
      submission_id text,
      applicant_id text
    )
    where not exists (
      select 1
      from public.applicants a
      where a.id = answer_payload.applicant_id
        and a.submission_id = answer_payload.submission_id
    )
  ) then
    raise exception 'Questionnaire answer applicant does not belong to submission'
      using errcode = '23503';
  end if;

  delete from public.questionnaire_answers qa
  where qa.submission_id in (
      select distinct answer_payload.submission_id
      from jsonb_to_recordset(coalesce(answers, '[]'::jsonb)) as answer_payload (
        submission_id text
      )
    )
    and not exists (
      select 1
      from jsonb_to_recordset(coalesce(answers, '[]'::jsonb)) as answer_payload (
        submission_id text,
        applicant_id text,
        section_id text,
        field_id text
      )
      where answer_payload.submission_id = qa.submission_id
        and answer_payload.applicant_id = qa.applicant_id
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
  from jsonb_to_recordset(coalesce(answers, '[]'::jsonb)) as answer_payload (
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

  get diagnostics answer_count = row_count;

  return jsonb_build_object('answers', answer_count);
end;
$$;

grant select, insert, update, delete on public.questionnaire_answers to authenticated;
revoke all on function public.upsert_questionnaire_answers(jsonb) from public;
grant execute on function public.upsert_questionnaire_answers(jsonb) to authenticated;

alter function public.save_submission_draft(jsonb) set schema app_private;
alter function app_private.save_submission_draft(jsonb)
  rename to save_submission_draft_without_questionnaire_rows;
revoke all on function app_private.save_submission_draft_without_questionnaire_rows(jsonb)
  from public;
grant execute on function app_private.save_submission_draft_without_questionnaire_rows(jsonb)
  to authenticated;

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
begin
  if auth.uid() is null then
    raise exception 'Authenticated user required to save submission draft'
      using errcode = '28000';
  end if;

  select *
  into submission_record
  from jsonb_to_record(payload -> 'submission') as submission_payload (
    id text
  );

  if submission_record.id is null then
    raise exception 'Submission payload is required';
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

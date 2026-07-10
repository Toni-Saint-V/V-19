create or replace function app_private.mark_submission_handoff_context()
returns trigger
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  if new.status = 'waiting_review' and old.status is distinct from new.status then
    perform set_config('app.visaflow_submission_handoff', 'on', true);
  end if;

  return new;
end;
$$;

drop trigger if exists submission_handoff_context on public.submissions;

create trigger submission_handoff_context
after update of status on public.submissions
for each row
execute function app_private.mark_submission_handoff_context();

drop policy if exists "questionnaire answers write editable submission"
  on public.questionnaire_answers;
drop policy if exists "questionnaire answers update editable submission"
  on public.questionnaire_answers;
drop policy if exists "questionnaire answers delete editable submission"
  on public.questionnaire_answers;

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
          and (
            s.status in ('draft', 'filling', 'returned', 'ready_for_review')
            or (
              s.status = 'waiting_review'
              and current_setting('app.visaflow_submission_handoff', true) = 'on'
            )
          )
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
          and (
            s.status in ('draft', 'filling', 'returned', 'ready_for_review')
            or (
              s.status = 'waiting_review'
              and current_setting('app.visaflow_submission_handoff', true) = 'on'
            )
          )
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
          and (
            s.status in ('draft', 'filling', 'returned', 'ready_for_review')
            or (
              s.status = 'waiting_review'
              and current_setting('app.visaflow_submission_handoff', true) = 'on'
            )
          )
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
          and (
            s.status in ('draft', 'filling', 'returned', 'ready_for_review')
            or (
              s.status = 'waiting_review'
              and current_setting('app.visaflow_submission_handoff', true) = 'on'
            )
          )
        )
      )
  )
);

drop policy if exists "applicants write editable submission" on public.applicants;
drop policy if exists "applicants update editable submission" on public.applicants;

create policy "applicants write editable submission"
on public.applicants for insert
with check (
  exists (
    select 1 from public.submissions s
    where s.id = applicants.submission_id
      and (
        (select app_private.current_profile_role()) = 'admin'
        or (
          s.agent_id = (select auth.uid())
          and (
            s.status in ('draft', 'filling', 'returned', 'ready_for_review')
            or (s.status = 'waiting_review' and current_setting('app.visaflow_submission_handoff', true) = 'on')
          )
        )
      )
  )
);

create policy "applicants update editable submission"
on public.applicants for update
using (
  exists (
    select 1 from public.submissions s
    where s.id = applicants.submission_id
      and (
        (select app_private.current_profile_role()) = 'admin'
        or (
          s.agent_id = (select auth.uid())
          and (
            s.status in ('draft', 'filling', 'returned', 'ready_for_review')
            or (s.status = 'waiting_review' and current_setting('app.visaflow_submission_handoff', true) = 'on')
          )
        )
      )
  )
)
with check (
  exists (
    select 1 from public.submissions s
    where s.id = applicants.submission_id
      and (
        (select app_private.current_profile_role()) = 'admin'
        or (
          s.agent_id = (select auth.uid())
          and (
            s.status in ('draft', 'filling', 'returned', 'ready_for_review')
            or (s.status = 'waiting_review' and current_setting('app.visaflow_submission_handoff', true) = 'on')
          )
        )
      )
  )
);

drop policy if exists "media write editable submission" on public.media_assets;
drop policy if exists "media update editable submission" on public.media_assets;

create policy "media write editable submission"
on public.media_assets for insert
with check (
  exists (
    select 1 from public.submissions s
    where s.id = media_assets.submission_id
      and (
        (select app_private.current_profile_role()) = 'admin'
        or (
          s.agent_id = (select auth.uid())
          and (
            s.status in ('draft', 'filling', 'returned', 'ready_for_review')
            or (s.status = 'waiting_review' and current_setting('app.visaflow_submission_handoff', true) = 'on')
          )
        )
      )
  )
);

create policy "media update editable submission"
on public.media_assets for update
using (
  exists (
    select 1 from public.submissions s
    where s.id = media_assets.submission_id
      and (
        (select app_private.current_profile_role()) = 'admin'
        or (
          s.agent_id = (select auth.uid())
          and (
            s.status in ('draft', 'filling', 'returned', 'ready_for_review')
            or (s.status = 'waiting_review' and current_setting('app.visaflow_submission_handoff', true) = 'on')
          )
        )
      )
  )
)
with check (
  exists (
    select 1 from public.submissions s
    where s.id = media_assets.submission_id
      and (
        (select app_private.current_profile_role()) = 'admin'
        or (
          s.agent_id = (select auth.uid())
          and (
            s.status in ('draft', 'filling', 'returned', 'ready_for_review')
            or (s.status = 'waiting_review' and current_setting('app.visaflow_submission_handoff', true) = 'on')
          )
        )
      )
  )
);

drop policy if exists "corrections write editable submission" on public.corrections;
drop policy if exists "corrections update editable submission" on public.corrections;

create policy "corrections write editable submission"
on public.corrections for insert
with check (
  exists (
    select 1 from public.submissions s
    where s.id = corrections.submission_id
      and (
        (select app_private.current_profile_role()) = 'admin'
        or (
          s.agent_id = (select auth.uid())
          and (
            s.status in ('draft', 'filling', 'returned', 'ready_for_review')
            or (s.status = 'waiting_review' and current_setting('app.visaflow_submission_handoff', true) = 'on')
          )
        )
      )
  )
  and (
    corrections.applicant_id is null
    or exists (
      select 1 from public.applicants a
      where a.id = corrections.applicant_id and a.submission_id = corrections.submission_id
    )
  )
);

create policy "corrections update editable submission"
on public.corrections for update
using (
  exists (
    select 1 from public.submissions s
    where s.id = corrections.submission_id
      and (
        (select app_private.current_profile_role()) = 'admin'
        or (
          s.agent_id = (select auth.uid())
          and (
            s.status in ('draft', 'filling', 'returned', 'ready_for_review')
            or (s.status = 'waiting_review' and current_setting('app.visaflow_submission_handoff', true) = 'on')
          )
        )
      )
  )
  and (
    corrections.applicant_id is null
    or exists (
      select 1 from public.applicants a
      where a.id = corrections.applicant_id and a.submission_id = corrections.submission_id
    )
  )
)
with check (
  exists (
    select 1 from public.submissions s
    where s.id = corrections.submission_id
      and (
        (select app_private.current_profile_role()) = 'admin'
        or (
          s.agent_id = (select auth.uid())
          and (
            s.status in ('draft', 'filling', 'returned', 'ready_for_review')
            or (s.status = 'waiting_review' and current_setting('app.visaflow_submission_handoff', true) = 'on')
          )
        )
      )
  )
  and (
    corrections.applicant_id is null
    or exists (
      select 1 from public.applicants a
      where a.id = corrections.applicant_id and a.submission_id = corrections.submission_id
    )
  )
);

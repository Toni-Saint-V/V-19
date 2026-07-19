alter table public.submissions
  alter column public_number drop not null;

create or replace function app_private.assign_submission_public_number()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if tg_op = 'INSERT' then
    if new.public_number is not null then
      raise exception 'Submission public number must be assigned through ensure_submission_public_number';
    end if;
    return new;
  end if;

  if new.public_number is not distinct from old.public_number then
    return new;
  end if;
  if old.public_number is not null or new.public_number is null then
    raise exception 'Submission public number is immutable';
  end if;
  if current_setting('app.v19_public_number_assignment', true) is distinct from 'allowed' then
    raise exception 'Submission public number must be assigned through ensure_submission_public_number';
  end if;

  return new;
end;
$$;

revoke all on function app_private.assign_submission_public_number() from public, anon, authenticated;

create or replace function public.ensure_submission_public_number(submission_id text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.profile_role := app_private.current_profile_role();
  submission_record record;
  next_number bigint;
begin
  if actor_id is null then
    raise exception 'Authenticated user required to assign submission public number'
      using errcode = '28000';
  end if;

  select submission.id, submission.agent_id, submission.public_number
  into submission_record
  from public.submissions submission
  where submission.id = $1
  for update;

  if not found then
    raise exception 'Submission not found' using errcode = 'P0002';
  end if;
  if submission_record.agent_id <> actor_id and actor_role <> 'admin' then
    raise exception 'Cannot assign public number for another agent'
      using errcode = '42501';
  end if;
  if submission_record.public_number is not null then
    return jsonb_build_object(
      'publicNumber', submission_record.public_number,
      'assignedNow', false
    );
  end if;
  if not exists (
    select 1
    from public.applicants applicant
    where applicant.submission_id = submission_record.id
  ) or exists (
    select 1
    from public.applicants applicant
    where applicant.submission_id = submission_record.id
      and applicant.questionnaire_percent < 100
  ) then
    raise exception 'Questionnaire must be complete before assigning public number'
      using errcode = '23514';
  end if;

  next_number := nextval('public.submission_public_number_seq');
  perform set_config('app.v19_public_number_assignment', 'allowed', true);
  update public.submissions submission
  set public_number = next_number
  where submission.id = submission_record.id;

  return jsonb_build_object(
    'publicNumber', next_number,
    'assignedNow', true
  );
end;
$$;

revoke all on function public.ensure_submission_public_number(text) from public, anon;
grant execute on function public.ensure_submission_public_number(text) to authenticated;
revoke all on sequence public.submission_public_number_seq from anon, authenticated;

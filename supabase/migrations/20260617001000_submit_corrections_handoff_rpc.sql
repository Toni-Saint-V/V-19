create or replace function public.submit_corrections_handoff(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  submission_record record;
  existing_submission record;
  intermediate_payload jsonb;
  result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authenticated user required to submit corrections'
      using errcode = '28000';
  end if;

  select *
  into submission_record
  from jsonb_to_record(payload -> 'submission') as submission_payload (
    id text,
    agent_id uuid,
    status public.submission_status
  );

  if submission_record.id is null or submission_record.agent_id is null then
    raise exception 'Submission payload is required';
  end if;

  if submission_record.status <> 'waiting_review' then
    raise exception 'Correction handoff must submit the package for review'
      using errcode = '23514';
  end if;

  if submission_record.agent_id <> auth.uid() then
    raise exception 'Only the assigned agent can submit corrections'
      using errcode = '42501';
  end if;

  select id, agent_id, status
  into existing_submission
  from public.submissions
  where id = submission_record.id
  for update;

  if existing_submission.id is null then
    raise exception 'Correction handoff requires an existing returned submission'
      using errcode = '23514';
  end if;

  if existing_submission.agent_id <> submission_record.agent_id then
    raise exception 'Correction handoff cannot reassign submissions'
      using errcode = '42501';
  end if;

  if existing_submission.status = 'waiting_review' and not exists (
    select 1
    from public.corrections c
    where c.submission_id = submission_record.id
      and c.severity = 'blocking'
      and c.status = 'open'
  ) then
    return jsonb_build_object(
      'submissionId', submission_record.id,
      'applicants', 0,
      'mediaAssets', 0,
      'statusHistory', 0,
      'idempotent', true
    );
  end if;

  if existing_submission.status not in ('returned', 'ready_for_review') then
    raise exception 'Correction handoff can only start from a returned submission'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from jsonb_to_recordset(coalesce(payload -> 'corrections', '[]'::jsonb)) as correction_payload (
      status text
    )
    where correction_payload.status = 'fixed'
  ) then
    raise exception 'Correction handoff requires fixed corrections'
      using errcode = '23514';
  end if;

  intermediate_payload := jsonb_set(
    payload,
    '{submission,status}',
    to_jsonb('ready_for_review'::text),
    false
  );

  perform public.save_submission_draft(intermediate_payload);
  result := public.save_submission_draft(payload);

  return result;
end;
$$;

revoke all on function public.submit_corrections_handoff(jsonb) from public;
grant execute on function public.submit_corrections_handoff(jsonb) to authenticated;

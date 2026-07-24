begin;

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
  target_submission_id text := payload -> 'submission' ->> 'id';
begin
  if auth.uid() is null then
    raise exception 'Authenticated user required to save submission draft'
      using errcode = '28000';
  end if;

  if actor_role is distinct from 'agent' then
    raise exception 'Approved agents must use the submission draft RPC; administrators use the revision-checked batch RPC'
      using errcode = '42501';
  end if;

  select submission.case_revision
  into current_revision
  from public.submissions as submission
  where submission.id = target_submission_id
  for update;

  if found and client_contract_version >= 2 then
    if not payload ? 'expected_case_revision' then
      raise exception 'Для существующей подачи требуется актуальная revision'
        using errcode = '23514';
    end if;
    expected_revision := (payload ->> 'expected_case_revision')::bigint;
    if current_revision is distinct from expected_revision then
      raise exception 'V19_AGENT_SUBMISSION_CONFLICT: submission % changed from revision % to %',
        target_submission_id,
        expected_revision,
        current_revision
        using errcode = '40001';
    end if;
  elsif not found and payload ? 'expected_case_revision' then
    raise exception 'V19_AGENT_SUBMISSION_CONFLICT: submission % no longer exists',
      target_submission_id
      using errcode = '40001';
  end if;

  persisted_result := app_private.dispatch_submission_draft_with_revision_context(
    payload - 'expected_case_revision' - 'client_contract_version'
  );

  for correction_payload in
    select value
    from jsonb_array_elements(coalesce(payload -> 'corrections', '[]'::jsonb))
  loop
    if correction_payload ? 'target_revision'
      or correction_payload ? 'agent_confirmed_revision'
    then
      update public.corrections
      set
        target_revision =
          coalesce(
            (correction_payload ->> 'target_revision')::bigint,
            target_revision
          ),
        agent_confirmed_at = case
          when correction_payload ->> 'agent_confirmed_revision' is null then null
          else confirmation_time
        end,
        agent_confirmed_revision =
          (correction_payload ->> 'agent_confirmed_revision')::bigint
      where id = (correction_payload ->> 'id')::uuid
        and corrections.submission_id = target_submission_id;
    end if;
  end loop;

  select submission.case_revision
  into current_revision
  from public.submissions as submission
  where submission.id = target_submission_id;

  return persisted_result || jsonb_build_object('caseRevision', current_revision);
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
  if existing_submission.status not in ('returned', 'ready_for_review') then
    raise exception 'Correction handoff can only start from a returned submission'
      using errcode = '42501';
  end if;
  if not exists (
    select 1
    from jsonb_to_recordset(coalesce(payload -> 'corrections', '[]'::jsonb))
      as correction_payload(status text)
    where correction_payload.status = 'fixed'
  ) then
    raise exception 'Correction handoff requires fixed corrections'
      using errcode = '23514';
  end if;

  intermediate_payload := jsonb_set(
    payload,
    '{submission,status}',
    to_jsonb('returned'::text),
    false
  );
  perform public.save_submission_draft(intermediate_payload);
  result := public.save_submission_draft(
    jsonb_set(
      payload - 'expected_case_revision' - 'client_contract_version',
      '{corrections}',
      '[]'::jsonb,
      true
    )
  );
  return result;
end;
$function$;

revoke all on function public.submit_corrections_handoff(jsonb)
  from public, anon, authenticated;
grant execute on function public.submit_corrections_handoff(jsonb)
  to authenticated;

drop trigger if exists corrections_agent_target_revision_guard
  on public.corrections;
drop function if exists app_private.enforce_agent_correction_target_revision();

comment on column public.corrections.target_revision is
  'Retained by rollback to preserve lifecycle audit data and client compatibility.';
comment on column public.corrections.agent_confirmed_at is
  'Retained by rollback; remove only in a later archival migration after client rollback.';
comment on column public.corrections.agent_confirmed_revision is
  'Retained by rollback; remove only in a later archival migration after client rollback.';

commit;

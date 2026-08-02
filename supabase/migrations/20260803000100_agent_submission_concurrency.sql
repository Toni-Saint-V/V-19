-- Agent snapshots must use the same optimistic-concurrency and replay-safety
-- guarantees as admin snapshots. This removes the revision-blind public RPCs
-- from the authenticated Data API surface and replaces them with one CAS RPC.
begin;

create table if not exists app_private.agent_submission_mutation_receipts (
  operation_id uuid primary key,
  actor_id uuid not null,
  submission_id text not null,
  mutation_kind text not null
    check (mutation_kind in ('draft', 'correction_handoff')),
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
grant select, insert, update, delete
  on app_private.agent_submission_mutation_receipts to authenticated;

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

create or replace function public.save_agent_submission_if_current(
  payload jsonb,
  expected_revision bigint,
  operation_id uuid,
  mutation_kind text
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, app_private, extensions
as $function$
declare
  actor_id uuid := auth.uid();
  actor_role public.profile_role := app_private.current_profile_role();
  current_revision bigint;
  existing_agent_id uuid;
  existing_status public.submission_status;
  intermediate_payload jsonb;
  persisted_result jsonb;
  receipt_fingerprint text;
  receipt_result jsonb;
  request_fingerprint text;
  response jsonb;
  submission_agent_id uuid;
  submission_id text;
  submission_status public.submission_status;
begin
  if actor_id is null then
    raise exception 'Authenticated user required for agent submission mutation'
      using errcode = '28000';
  end if;
  if actor_role is distinct from 'agent' then
    raise exception 'Only approved agents can save agent submission mutations'
      using errcode = '42501';
  end if;
  if operation_id is null then
    raise exception 'Agent mutation operation id is required'
      using errcode = '23514';
  end if;
  if mutation_kind not in ('draft', 'correction_handoff') then
    raise exception 'Agent mutation kind is invalid'
      using errcode = '23514';
  end if;

  select id, agent_id, status
  into submission_id, submission_agent_id, submission_status
  from jsonb_to_record(payload -> 'submission') as submission_payload (
    id text,
    agent_id uuid,
    status public.submission_status
  );
  if nullif(btrim(coalesce(submission_id, '')), '') is null
    or submission_agent_id is null
  then
    raise exception 'Agent submission payload identity is required'
      using errcode = '23514';
  end if;
  if submission_agent_id is distinct from actor_id then
    raise exception 'Agent mutation cannot reassign submission ownership'
      using errcode = '42501';
  end if;
  if mutation_kind = 'correction_handoff' and expected_revision is null then
    raise exception 'Correction handoff requires an existing case revision'
      using errcode = '23514';
  end if;

  request_fingerprint := encode(
    extensions.digest(
      convert_to(
        mutation_kind || chr(31) || payload::text || chr(31) ||
          coalesce(expected_revision::text, 'create-if-absent'),
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

  insert into app_private.agent_submission_mutation_receipts (
    operation_id,
    actor_id,
    submission_id,
    mutation_kind,
    request_fingerprint
  ) values (
    operation_id,
    actor_id,
    submission_id,
    mutation_kind,
    request_fingerprint
  )
  on conflict on constraint agent_submission_mutation_receipts_pkey do nothing;

  select receipt.request_fingerprint, receipt.result
  into receipt_fingerprint, receipt_result
  from app_private.agent_submission_mutation_receipts as receipt
  where receipt.operation_id = save_agent_submission_if_current.operation_id
    and receipt.actor_id = save_agent_submission_if_current.actor_id
    and receipt.submission_id = save_agent_submission_if_current.submission_id
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

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(submission_id, 868919)
  );
  select submission.agent_id, submission.case_revision, submission.status
  into existing_agent_id, current_revision, existing_status
  from public.submissions as submission
  where submission.id = save_agent_submission_if_current.submission_id
  for update;

  if expected_revision is null then
    if found then
      raise exception 'V19_AGENT_SUBMISSION_CONFLICT: submission % already exists',
        submission_id using errcode = '40001';
    end if;
  else
    if not found or existing_agent_id is distinct from actor_id then
      raise exception 'Agent mutation submission is missing or forbidden'
        using errcode = '42501';
    end if;
    if current_revision is distinct from expected_revision then
      raise exception 'V19_AGENT_SUBMISSION_CONFLICT: submission % changed from revision % to %',
        submission_id,
        expected_revision,
        current_revision
        using errcode = '40001';
    end if;
  end if;

  if mutation_kind = 'correction_handoff' then
    if submission_status <> 'waiting_review' then
      raise exception 'Correction handoff must submit the package for review'
        using errcode = '23514';
    end if;
    if existing_status = 'waiting_review' and not exists (
      select 1 from public.corrections as correction
      where correction.submission_id = save_agent_submission_if_current.submission_id
        and correction.severity = 'blocking'
        and correction.status = 'open'
    ) then
      persisted_result := jsonb_build_object(
        'submissionId', submission_id,
        'applicants', 0,
        'mediaAssets', 0,
        'statusHistory', 0,
        'idempotent', true
      );
    else
      if existing_status not in ('returned', 'ready_for_review') then
        raise exception 'Correction handoff can only start from a returned submission'
          using errcode = '42501';
      end if;
      if not exists (
        select 1
        from jsonb_to_recordset(
          coalesce(payload -> 'corrections', '[]'::jsonb)
        ) as correction_payload(status text)
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
      perform app_private.dispatch_submission_draft_with_revision_context(
        intermediate_payload
      );
      persisted_result := app_private.dispatch_submission_draft_with_revision_context(
        payload
      );
    end if;
  else
    persisted_result := app_private.dispatch_submission_draft_with_revision_context(
      payload
    );
  end if;

  select submission.case_revision
  into current_revision
  from public.submissions as submission
  where submission.id = save_agent_submission_if_current.submission_id;
  if current_revision is null then
    raise exception 'Agent mutation did not persist the submission'
      using errcode = 'P0001';
  end if;

  response := jsonb_build_object(
    'operationId', operation_id,
    'submissionId', submission_id,
    'caseRevision', current_revision,
    'result', persisted_result
  );
  update app_private.agent_submission_mutation_receipts as receipt
  set result = response,
      completed_at = clock_timestamp()
  where receipt.operation_id = save_agent_submission_if_current.operation_id
    and receipt.actor_id = save_agent_submission_if_current.actor_id;
  return response;
end;
$function$;

revoke all on function public.save_agent_submission_if_current(
  jsonb,
  bigint,
  uuid,
  text
) from public, anon, authenticated;
grant execute on function public.save_agent_submission_if_current(
  jsonb,
  bigint,
  uuid,
  text
) to authenticated;

-- These historical one-argument RPCs remain for schema compatibility only.
-- Authenticated callers must use save_agent_submission_if_current.
revoke execute on function public.save_submission_draft(jsonb)
  from authenticated;
revoke execute on function public.submit_corrections_handoff(jsonb)
  from authenticated;

commit;

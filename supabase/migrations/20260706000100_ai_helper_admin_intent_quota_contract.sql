alter table public.ai_helper_audit_events
  drop constraint if exists ai_helper_audit_events_intent_check;

alter table public.ai_helper_audit_events
  add constraint ai_helper_audit_events_intent_check
  check (
    intent is null
    or intent in (
      'readiness_summary',
      'text_intake_review',
      'admin_review',
      'admin_next_action',
      'admin_issue_remark_draft',
      'admin_readiness_explanation',
      'correction_draft',
      'export_guard',
      'passport_extraction'
    )
  );

alter table public.ai_helper_quota_counters
  drop constraint if exists ai_helper_quota_counters_intent_check;

alter table public.ai_helper_quota_counters
  add constraint ai_helper_quota_counters_intent_check
  check (
    intent in (
      'readiness_summary',
      'text_intake_review',
      'admin_review',
      'admin_next_action',
      'admin_issue_remark_draft',
      'admin_readiness_explanation',
      'correction_draft',
      'export_guard'
    )
  );

create or replace function public.consume_ai_helper_quota(
  p_actor_id text,
  p_actor_role text,
  p_intent text,
  p_request_id text
)
returns table (remaining integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  api_role text := current_setting('request.jwt.claim.role', true);
  expected_api_role text := 'service' || '_role';
  window_start_value timestamptz := date_trunc('hour', now());
  window_end_value timestamptz := window_start_value + interval '1 hour';
  limit_value integer;
  receipt_inserted boolean := false;
  counter_record public.ai_helper_quota_counters%rowtype;
begin
  if api_role is distinct from expected_api_role then
    raise exception 'AI helper quota can only be consumed by the edge function'
      using errcode = '42501';
  end if;

  if nullif(trim(p_actor_id), '') is null
    or p_actor_role not in ('agent', 'admin')
    or p_intent not in (
      'readiness_summary',
      'text_intake_review',
      'admin_review',
      'admin_next_action',
      'admin_issue_remark_draft',
      'admin_readiness_explanation',
      'correction_draft',
      'export_guard'
    )
    or nullif(trim(p_request_id), '') is null
  then
    raise exception 'AI helper quota request is invalid'
      using errcode = '22023';
  end if;

  limit_value := case
    when p_actor_role = 'admin' then 100
    else 40
  end;

  insert into public.ai_helper_quota_receipts (request_id, actor_id, intent)
  values (p_request_id, p_actor_id, p_intent)
  on conflict (request_id) do nothing;

  receipt_inserted := found;

  if receipt_inserted then
    insert into public.ai_helper_quota_counters (
      actor_id,
      actor_role,
      intent,
      window_start,
      window_end,
      used_count,
      limit_count,
      updated_at
    )
    values (
      p_actor_id,
      p_actor_role,
      p_intent,
      window_start_value,
      window_end_value,
      1,
      limit_value,
      now()
    )
    on conflict (actor_id, intent, window_start) do update set
      actor_role = excluded.actor_role,
      window_end = excluded.window_end,
      used_count = case
        when public.ai_helper_quota_counters.used_count < public.ai_helper_quota_counters.limit_count
          then public.ai_helper_quota_counters.used_count + 1
        else public.ai_helper_quota_counters.used_count
      end,
      limit_count = excluded.limit_count,
      updated_at = now()
    returning *
    into counter_record;
  else
    select *
    into counter_record
    from public.ai_helper_quota_counters
    where actor_id = p_actor_id
      and intent = p_intent
      and window_start = window_start_value;
  end if;

  if counter_record.actor_id is null then
    remaining := limit_value;
    reset_at := window_end_value;
    return next;
  end if;

  remaining := greatest(counter_record.limit_count - counter_record.used_count, 0);
  reset_at := counter_record.window_end;
  return next;
end;
$$;

revoke all on function public.consume_ai_helper_quota(text, text, text, text) from public;
revoke execute on function public.consume_ai_helper_quota(text, text, text, text)
  from anon, authenticated;
grant execute on function public.consume_ai_helper_quota(text, text, text, text)
  to service_role;

-- Serialize access-request approve/reject decisions before invitation/profile
-- side effects. The Edge Function uses these service-role-only, SECURITY
-- INVOKER RPCs after it has authenticated the acting administrator.
begin;

alter table public.access_requests
  add column if not exists review_claim_action text,
  add column if not exists review_claim_id uuid,
  add column if not exists review_claimed_at timestamptz;

do $migration$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'access_requests_review_claim_shape'
      and conrelid = 'public.access_requests'::regclass
  ) then
    alter table public.access_requests
      add constraint access_requests_review_claim_shape
      check (
        (
          review_claim_action is null
          and review_claim_id is null
          and review_claimed_at is null
        )
        or (
          status = 'pending'
          and review_claim_action in ('approve', 'reject')
          and review_claim_id is not null
          and review_claimed_at is not null
        )
      );
  end if;
end;
$migration$;

create index if not exists access_requests_review_claim_idx
on public.access_requests (review_claim_action, review_claimed_at)
where status = 'pending' and review_claim_action is not null;

create or replace function public.claim_access_request_review(
  p_request_id uuid,
  p_action text,
  p_admin_id uuid,
  p_operation_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  claimed_request jsonb;
  target_status public.access_request_status;
begin
  if p_action not in ('approve', 'reject') or p_operation_id is null then
    raise exception 'Access request review action and operation id are required'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.profiles as profile
    where profile.id = p_admin_id
      and profile.role = 'admin'
  ) then
    raise exception 'Verified administrator profile required for access review'
      using errcode = '42501';
  end if;

  target_status := case
    when p_action = 'approve' then 'approved'::public.access_request_status
    else 'rejected'::public.access_request_status
  end;

  -- A replay after finalization is idempotent and returns the terminal row.
  select to_jsonb(access_request)
    - 'review_claim_action'
    - 'review_claim_id'
    - 'review_claimed_at'
  into claimed_request
  from public.access_requests as access_request
  where access_request.id = p_request_id
    and access_request.status = target_status;
  if found then
    return claimed_request;
  end if;

  update public.access_requests as access_request
  set review_claim_action = p_action,
      review_claim_id = p_operation_id,
      review_claimed_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where access_request.id = p_request_id
    and access_request.status = 'pending'
    and (
      access_request.review_claim_id = p_operation_id
      or access_request.review_claim_action is null
      or (
        access_request.review_claimed_at < clock_timestamp() - interval '5 minutes'
      )
    )
  returning to_jsonb(access_request)
    - 'review_claim_action'
    - 'review_claim_id'
    - 'review_claimed_at'
  into claimed_request;

  if claimed_request is null then
    raise exception 'V19_ACCESS_REVIEW_CONFLICT: request is already claimed or finalized'
      using errcode = '40001';
  end if;

  return claimed_request;
end;
$function$;

create or replace function public.finalize_access_request_review(
  p_request_id uuid,
  p_action text,
  p_admin_id uuid,
  p_operation_id uuid,
  p_user_id uuid default null,
  p_rejection_reason text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  access_request_row public.access_requests%rowtype;
  finalized_request jsonb;
  target_status public.access_request_status;
begin
  if p_action not in ('approve', 'reject') or p_operation_id is null then
    raise exception 'Access request review action and operation id are required'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.profiles as profile
    where profile.id = p_admin_id
      and profile.role = 'admin'
  ) then
    raise exception 'Verified administrator profile required for access review'
      using errcode = '42501';
  end if;

  if p_action = 'approve' and p_user_id is null then
    raise exception 'Approved access request requires a provisioned user id'
      using errcode = '23514';
  end if;
  target_status := case
    when p_action = 'approve' then 'approved'::public.access_request_status
    else 'rejected'::public.access_request_status
  end;

  select access_request.*
  into access_request_row
  from public.access_requests as access_request
  where access_request.id = p_request_id
  for update;

  if access_request_row.id is null then
    raise exception 'V19_ACCESS_REVIEW_CONFLICT: access request is missing'
      using errcode = '40001';
  end if;

  if access_request_row.status = target_status then
    if p_action = 'approve'
      and access_request_row.user_id is distinct from p_user_id
    then
      raise exception 'V19_ACCESS_REVIEW_CONFLICT: terminal user id differs'
        using errcode = '40001';
    end if;

    return to_jsonb(access_request_row)
      - 'review_claim_action'
      - 'review_claim_id'
      - 'review_claimed_at';
  end if;

  if access_request_row.status <> 'pending'
    or access_request_row.review_claim_action is distinct from p_action
    or access_request_row.review_claim_id is distinct from p_operation_id
  then
    raise exception 'V19_ACCESS_REVIEW_CONFLICT: claim is stale or belongs to another operation'
      using errcode = '40001';
  end if;

  -- Auth invitation is an external side effect, but profile activation and
  -- the terminal request decision are one database transaction. A failure in
  -- either statement rolls both back, so a pending request can never acquire
  -- an approved application profile.
  if p_action = 'approve' then
    if exists (
      select 1
      from public.profiles as profile
      where profile.id = p_user_id
        and lower(btrim(profile.email)) <> lower(btrim(access_request_row.email))
    ) then
      raise exception 'V19_ACCESS_REVIEW_CONFLICT: provisioned user email differs'
        using errcode = '40001';
    end if;

    insert into public.profiles (
      id,
      email,
      display_name,
      organization_name,
      role
    ) values (
      p_user_id,
      access_request_row.email,
      access_request_row.full_name,
      access_request_row.company_name,
      'agent'::public.profile_role
    )
    on conflict (id) do update
    set email = excluded.email,
        display_name = excluded.display_name,
        organization_name = excluded.organization_name;
  end if;

  update public.access_requests as access_request
  set user_id = case
        when p_action = 'approve' then p_user_id
        else access_request.user_id
      end,
      status = target_status,
      reviewed_at = clock_timestamp(),
      reviewed_by_admin_id = p_admin_id,
      rejection_reason = case
        when p_action = 'reject' then nullif(btrim(coalesce(p_rejection_reason, '')), '')
        else null
      end,
      review_claim_action = null,
      review_claim_id = null,
      review_claimed_at = null,
      updated_at = clock_timestamp()
  where access_request.id = p_request_id
    and access_request.status = 'pending'
    and access_request.review_claim_action = p_action
    and access_request.review_claim_id = p_operation_id
  returning to_jsonb(access_request)
    - 'review_claim_action'
    - 'review_claim_id'
    - 'review_claimed_at'
  into finalized_request;

  if finalized_request is null then
    raise exception 'V19_ACCESS_REVIEW_CONFLICT: claim is stale or belongs to another operation'
      using errcode = '40001';
  end if;

  return finalized_request;
end;
$function$;

revoke all on function public.claim_access_request_review(uuid, text, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.finalize_access_request_review(
  uuid,
  text,
  uuid,
  uuid,
  uuid,
  text
) from public, anon, authenticated;
grant execute on function public.claim_access_request_review(uuid, text, uuid, uuid)
  to service_role;
grant execute on function public.finalize_access_request_review(
  uuid,
  text,
  uuid,
  uuid,
  uuid,
  text
) to service_role;

do $migration$
declare
  claim_oid oid := to_regprocedure(
    'public.claim_access_request_review(uuid,text,uuid,uuid)'
  )::oid;
  finalize_oid oid := to_regprocedure(
    'public.finalize_access_request_review(uuid,text,uuid,uuid,uuid,text)'
  )::oid;
begin
  if claim_oid is null or finalize_oid is null then
    raise exception 'Access review claim RPC boundary is missing';
  end if;

  if exists (
    select 1 from pg_catalog.pg_proc as proc
    where proc.oid in (claim_oid, finalize_oid)
      and proc.prosecdef
  ) then
    raise exception 'Access review claim RPCs must remain SECURITY INVOKER';
  end if;

  if has_function_privilege('anon', claim_oid, 'EXECUTE')
    or has_function_privilege('authenticated', claim_oid, 'EXECUTE')
    or has_function_privilege('anon', finalize_oid, 'EXECUTE')
    or has_function_privilege('authenticated', finalize_oid, 'EXECUTE')
  then
    raise exception 'Client roles can execute service-only access review RPCs';
  end if;

  if not has_function_privilege('service_role', claim_oid, 'EXECUTE')
    or not has_function_privilege('service_role', finalize_oid, 'EXECUTE')
  then
    raise exception 'Service role cannot execute access review claim RPCs';
  end if;
end;
$migration$;

commit;

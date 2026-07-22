-- Keep browser workflow RPCs callable only after Supabase authentication.
-- These functions remain SECURITY INVOKER and continue to rely on their
-- existing ownership checks and RLS policies for row-level authorization.
begin;

do $migration$
declare
  function_signature text;
begin
  foreach function_signature in array array[
    'public.save_submission_draft(jsonb)',
    'public.submit_corrections_handoff(jsonb)',
    'public.upsert_questionnaire_answers(jsonb)'
  ]
  loop
    if to_regprocedure(function_signature) is null then
      raise exception 'Required workflow RPC is missing: %', function_signature;
    end if;
  end loop;
end;
$migration$;

-- SECURITY INVOKER is part of the callable contract, not documentation. Reapply
-- it explicitly so a prior function replacement cannot silently retain definer
-- privileges while this ACL-only migration still appears successful.
alter function public.save_submission_draft(jsonb) security invoker;
alter function public.submit_corrections_handoff(jsonb) security invoker;
alter function public.upsert_questionnaire_answers(jsonb) security invoker;

revoke all on function public.save_submission_draft(jsonb)
  from public, anon, authenticated;
grant execute on function public.save_submission_draft(jsonb)
  to authenticated;

revoke all on function public.submit_corrections_handoff(jsonb)
  from public, anon, authenticated;
grant execute on function public.submit_corrections_handoff(jsonb)
  to authenticated;

revoke all on function public.upsert_questionnaire_answers(jsonb)
  from public, anon, authenticated;
grant execute on function public.upsert_questionnaire_answers(jsonb)
  to authenticated;

do $migration$
declare
  function_oid oid;
  function_signature text;
begin
  foreach function_signature in array array[
    'public.save_submission_draft(jsonb)',
    'public.submit_corrections_handoff(jsonb)',
    'public.upsert_questionnaire_answers(jsonb)'
  ]
  loop
    function_oid := to_regprocedure(function_signature)::oid;

    if exists (
      select 1
      from pg_catalog.pg_proc as proc
      where proc.oid = function_oid
        and proc.prosecdef
    ) then
      raise exception 'SECURITY DEFINER is still enabled for %', function_signature;
    end if;

    if has_function_privilege('anon', function_oid, 'EXECUTE') then
      raise exception 'Anonymous execution is still enabled for %', function_signature;
    end if;

    if not has_function_privilege('authenticated', function_oid, 'EXECUTE') then
      raise exception 'Authenticated execution is missing for %', function_signature;
    end if;

    if exists (
      select 1
      from pg_catalog.pg_proc as proc
      cross join lateral aclexplode(
        coalesce(
          proc.proacl,
          acldefault('f', proc.proowner)
        )
      ) as privilege
      where proc.oid = function_oid
        and privilege.grantee = 0
        and privilege.privilege_type = 'EXECUTE'
    ) then
      raise exception 'PUBLIC execution is still enabled for %', function_signature;
    end if;
  end loop;
end;
$migration$;

commit;

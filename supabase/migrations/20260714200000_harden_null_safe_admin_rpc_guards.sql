-- Forward-only authorization hardening for admin-only RPCs.
--
-- app_private.current_profile_role() returns NULL when an authenticated Auth
-- user has no matching profile. In PL/pgSQL, `NULL <> 'admin'` is NULL, so an
-- `if actor_role <> 'admin'` guard does not enter its rejection branch. Rewrite
-- every deployed V-19 admin guard to the null-safe equivalent and fail closed
-- if the deployed definitions no longer match the reviewed contract.

do $migration$
declare
  target_function regprocedure;
  expected_guard_occurrences integer;
  function_definition text;
  guard_occurrences integer;
  unsafe_guard constant text := 'actor_role <> ''admin''';
  safe_guard constant text := 'actor_role is distinct from ''admin''';
begin
  for target_function, expected_guard_occurrences in
    select reviewed.function_identity, reviewed.expected_count
    from (
      values
        ('app_private.complete_export_package_core(jsonb)'::regprocedure, 1),
        ('app_private.save_submission_draft_without_questionnaire_rows(jsonb)'::regprocedure, 2),
        ('public.complete_export_package(jsonb)'::regprocedure, 1),
        ('public.publish_agent_return_package(jsonb)'::regprocedure, 1),
        ('public.publish_returned_pdf_handoff(jsonb)'::regprocedure, 1),
        ('public.repair_incomplete_export_document_completion(text)'::regprocedure, 1),
        ('public.start_agent_return_package(jsonb)'::regprocedure, 1)
    ) as reviewed(function_identity, expected_count)
  loop
    select pg_catalog.pg_get_functiondef(target_function::oid)
    into function_definition;

    guard_occurrences := (
      length(function_definition) - length(replace(function_definition, unsafe_guard, ''))
    ) / length(unsafe_guard);

    if guard_occurrences <> expected_guard_occurrences then
      raise exception 'Expected % null-unsafe admin guard(s) in %; found %',
        expected_guard_occurrences,
        target_function,
        guard_occurrences;
    end if;

    execute replace(function_definition, unsafe_guard, safe_guard);
  end loop;

  if exists (
    select 1
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname in ('app_private', 'public')
      and procedure.prokind = 'f'
      and pg_catalog.pg_get_functiondef(procedure.oid) like
        '%actor_role <> ''admin''%'
  ) then
    raise exception 'A null-unsafe V-19 admin function guard remains after hardening';
  end if;
end;
$migration$;

-- The one-time legacy repair has completed and the A2-S1 handoff explicitly
-- forbids reuse. Retain its definition for forensic history while removing the
-- browser-callable RPC surface.
revoke execute on function public.repair_incomplete_export_document_completion(text)
  from authenticated, anon, public;

comment on function public.repair_incomplete_export_document_completion(text) is
  'Retained for forensic history after the one-time legacy repair; browser roles have no EXECUTE privilege.';

comment on function public.complete_export_package(jsonb) is
  'Atomic admin-only terminal export with null-safe profile authorization and exact artifact-bound completion.';

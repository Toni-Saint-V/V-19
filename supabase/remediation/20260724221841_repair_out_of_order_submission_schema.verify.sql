do $verify$
declare
  internal_definition text;
  public_definition text;
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'submissions'
      and column_name = 'public_number'
      and data_type = 'bigint'
  ) then
    raise exception 'submissions.public_number bigint is missing';
  end if;
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'submissions'
      and column_name = 'case_revision'
      and data_type = 'bigint'
      and is_nullable = 'NO'
  ) then
    raise exception 'submissions.case_revision bigint is missing or nullable';
  end if;
  if to_regprocedure(
    'app_private.save_submission_draft_without_questionnaire_rows(jsonb)'
  ) is null
    or to_regprocedure(
      'app_private.save_submission_draft_for_internal_dispatch(jsonb)'
    ) is null
    or to_regprocedure(
      'app_private.dispatch_submission_draft_with_revision_context(jsonb)'
    ) is null
    or to_regprocedure('public.save_submission_draft(jsonb)') is null
  then
    raise exception 'Canonical draft persistence boundary is incomplete';
  end if;

  internal_definition := pg_get_functiondef(
    'app_private.save_submission_draft_for_internal_dispatch(jsonb)'::regprocedure
  );
  public_definition := pg_get_functiondef(
    'public.save_submission_draft(jsonb)'::regprocedure
  );
  if position(
    'dispatch_submission_draft_with_revision_context' in internal_definition
  ) > 0
    or position(
      'save_submission_draft_without_questionnaire_rows' in internal_definition
    ) = 0
  then
    raise exception 'Internal draft persistence topology is recursive or incomplete';
  end if;
  if position('expected_case_revision' in public_definition) = 0
    or position(
      'dispatch_submission_draft_with_revision_context' in public_definition
    ) = 0
  then
    raise exception 'Public draft RPC is not revision checked';
  end if;
  if has_function_privilege(
    'anon',
    'public.save_submission_draft(jsonb)'::regprocedure,
    'EXECUTE'
  )
    or not has_function_privilege(
      'authenticated',
      'public.save_submission_draft(jsonb)'::regprocedure,
      'EXECUTE'
    )
  then
    raise exception 'Draft RPC grants are unsafe';
  end if;
  if exists (
    select 1
    from pg_catalog.pg_proc
    where oid in (
      'app_private.save_submission_draft_for_internal_dispatch(jsonb)'::regprocedure,
      'app_private.dispatch_submission_draft_with_revision_context(jsonb)'::regprocedure,
      'public.save_submission_draft(jsonb)'::regprocedure
    )
      and prosecdef
  ) then
    raise exception 'Draft persistence boundary must remain SECURITY INVOKER';
  end if;
  if not exists (
    select 1
    from pg_catalog.pg_trigger
    where tgrelid = 'public.submissions'::regclass
      and tgname = 'submissions_bump_case_revision'
      and tgenabled = 'O'
      and not tgisinternal
  ) then
    raise exception 'Submission case revision trigger is missing or disabled';
  end if;
end;
$verify$;

do $verification$
declare
  dispatch_definition text;
begin
  dispatch_definition := pg_get_functiondef(
    'app_private.dispatch_submission_draft_with_revision_context(jsonb)'::regprocedure
  );
  if position(
    'save_submission_draft_for_internal_dispatch' in dispatch_definition
  ) = 0
    or position(
      'sync_correction_targets_from_payload' in dispatch_definition
    ) = 0
  then
    raise exception 'Draft persistence topology is incomplete';
  end if;

  if has_function_privilege(
    'anon',
    'app_private.save_submission_draft_without_questionnaire_rows(jsonb)'::regprocedure,
    'EXECUTE'
  )
    or has_function_privilege(
      'anon',
      'app_private.save_submission_draft_for_internal_dispatch(jsonb)'::regprocedure,
      'EXECUTE'
    )
    or has_function_privilege(
      'anon',
      'app_private.dispatch_submission_draft_with_revision_context(jsonb)'::regprocedure,
      'EXECUTE'
    )
  then
    raise exception 'Anonymous internal draft persistence execution is enabled';
  end if;

  if to_regprocedure(
    'app_private.questionnaire_field_is_required(text,text)'
  ) is null
    or to_regprocedure(
      'app_private.enforce_agent_correction_parent_status()'
    ) is null
    or not exists (
      select 1
      from pg_catalog.pg_trigger as trigger_info
      where trigger_info.tgname = 'corrections_agent_parent_status_guard'
        and trigger_info.tgenabled = 'O'
        and not trigger_info.tgisinternal
    )
  then
    raise exception 'Correction validation hardening is incomplete';
  end if;
end;
$verification$;

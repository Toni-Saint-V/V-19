do $verify$
begin
  if exists (
    select 1
    from public.corrections as correction
    where correction.status = 'open'
      and correction.scope = 'field'
      and (
        correction.target_section_id is null
        or correction.target_field_id is null
        or correction.target_baseline is null
        or correction.target_projection is null
      )
  ) then
    raise exception 'An open field correction has no server-owned target';
  end if;
  if to_regprocedure(
    'app_private.submission_questionnaire_validation_error(text)'
  ) is null
    or to_regprocedure(
      'app_private.correction_target_projection(uuid)'
    ) is null
    or to_regprocedure(
      'app_private.sync_correction_targets_from_payload(jsonb)'
    ) is null
  then
    raise exception 'Server-owned correction target functions are incomplete';
  end if;
  if exists (
    select required_trigger.name
    from (
      values
        ('corrections_agent_target_revision_guard', 'public.corrections'::regclass),
        ('questionnaire_answers_refresh_correction_targets', 'public.questionnaire_answers'::regclass),
        ('media_assets_refresh_correction_targets', 'public.media_assets'::regclass),
        ('submissions_returned_questionnaire_readiness_guard', 'public.submissions'::regclass)
    ) as required_trigger(name, table_oid)
    where not exists (
      select 1
      from pg_catalog.pg_trigger as trigger_info
      where trigger_info.tgname = required_trigger.name
        and trigger_info.tgrelid = required_trigger.table_oid
        and trigger_info.tgenabled = 'O'
        and not trigger_info.tgisinternal
    )
  ) then
    raise exception 'A server-owned correction lifecycle trigger is missing or disabled';
  end if;
end;
$verify$;

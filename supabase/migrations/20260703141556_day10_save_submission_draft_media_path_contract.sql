do $$
declare
  function_sql text;
  rewritten_sql text;
  old_predicate_pattern text := $old$media_payload\.submission_id <> submission_record\.id[[:space:]]+or media_payload\.storage_bucket <> 'submission-media'[[:space:]]+or split_part\(media_payload\.storage_path, '/', 1\) <> submission_record\.id[[:space:]]+or split_part\(media_payload\.storage_path, '/', 2\) <> media_payload\.applicant_id[[:space:]]+or split_part\(media_payload\.storage_path, '/', 3\) <> media_payload\.type::text[[:space:]]+or split_part\(media_payload\.storage_path, '/', 5\) <> ''$old$;
  new_predicate text := $new$
media_payload.submission_id <> submission_record.id
       or media_payload.storage_bucket <> 'submission-media'
       or nullif(btrim(coalesce(media_payload.storage_path, '')), '') is null
       or media_payload.storage_path ~ '(^/|//|\.\.)'
       or not (
         (
           split_part(media_payload.storage_path, '/', 1) = submission_record.id
           and split_part(media_payload.storage_path, '/', 2) = media_payload.applicant_id
           and split_part(media_payload.storage_path, '/', 3) = media_payload.type::text
           and split_part(media_payload.storage_path, '/', 4) <> ''
           and split_part(media_payload.storage_path, '/', 5) = ''
         )
         or (
           split_part(media_payload.storage_path, '/', 1) = 'submissions'
           and split_part(media_payload.storage_path, '/', 2) = submission_record.id
           and split_part(media_payload.storage_path, '/', 3) = 'applicants'
           and split_part(media_payload.storage_path, '/', 4) = media_payload.applicant_id
           and split_part(media_payload.storage_path, '/', 5) = media_payload.type::text
           and split_part(media_payload.storage_path, '/', 6) <> ''
           and split_part(media_payload.storage_path, '/', 7) = ''
         )
       )
$new$;
begin
  select pg_get_functiondef(
    'app_private.save_submission_draft_without_questionnaire_rows(jsonb)'::regprocedure
  )
  into function_sql;

  if function_sql is null then
    raise exception 'app_private.save_submission_draft_without_questionnaire_rows(jsonb) is missing';
  end if;

  rewritten_sql := regexp_replace(function_sql, old_predicate_pattern, new_predicate);

  if rewritten_sql = function_sql then
    raise exception 'Expected media storage path predicate was not found in save_submission_draft_without_questionnaire_rows';
  end if;

  execute rewritten_sql;
end $$;

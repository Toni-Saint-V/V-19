alter function public.publish_returned_pdf_handoff(jsonb) security invoker;

grant insert on public.returned_pdf_handoff_artifacts to authenticated;

drop policy if exists "returned pdf handoff artifacts admin insert"
on public.returned_pdf_handoff_artifacts;

create policy "returned pdf handoff artifacts admin insert"
on public.returned_pdf_handoff_artifacts for insert
to authenticated
with check (
  (select app_private.current_profile_role()) = 'admin'
  and storage_bucket = 'submission-media'
  and storage_path <> ''
  and file_name <> ''
  and file_name = replace(replace(file_name, '/', ''), chr(92), '')
  and sha256 ~ '^[a-fA-F0-9]{64}$'
  and (
    (
      artifact_kind = 'appointment_pdf'
      and applicant_id is null
      and split_part(storage_path, '/', 1) = submission_id
      and split_part(storage_path, '/', 2) = 'common'
      and split_part(storage_path, '/', 3) = 'appointment_pdf'
      and split_part(storage_path, '/', 5) = ''
      and lower(storage_path) ~ '\.pdf$'
    )
    or (
      artifact_kind = 'visa_application_pdf'
      and applicant_id is not null
      and split_part(storage_path, '/', 1) = submission_id
      and split_part(storage_path, '/', 2) = applicant_id
      and split_part(storage_path, '/', 3) = 'visa_application_pdf'
      and split_part(storage_path, '/', 5) = ''
      and lower(storage_path) ~ '\.pdf$'
    )
  )
);

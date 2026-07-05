insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'submission-media',
  'submission-media',
  false,
  52428800,
  array[
    'image/jpeg',
    'image/png',
    'image/heic',
    'image/heif',
    'application/pdf'
  ]
)
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "media storage read owner or admin" on storage.objects;
drop policy if exists "media storage write editable owner or admin" on storage.objects;
drop policy if exists "media storage update editable owner or admin" on storage.objects;
drop policy if exists "media storage delete editable owner or admin" on storage.objects;

create policy "media storage read owner or admin"
on storage.objects for select
to authenticated
using (
  bucket_id = 'submission-media'
  and name !~ '(^/|//|(^|/)\.\.?(/|$))'
  and (
    (
      split_part(name, '/', 1) = 'submissions'
      and split_part(name, '/', 3) = 'applicants'
      and split_part(name, '/', 2) <> ''
      and split_part(name, '/', 4) <> ''
      and split_part(name, '/', 5) in ('selfie', 'selfie_2', 'passport_scan', 'visa_application_pdf')
      and split_part(name, '/', 6) <> ''
      and split_part(name, '/', 7) = ''
      and (
        (split_part(name, '/', 5) in ('selfie', 'selfie_2') and storage.extension(name) in ('jpg', 'jpeg', 'png', 'heic', 'heif'))
        or (split_part(name, '/', 5) = 'passport_scan' and storage.extension(name) in ('jpg', 'jpeg', 'png', 'heic', 'heif', 'pdf'))
        or (split_part(name, '/', 5) = 'visa_application_pdf' and storage.extension(name) = 'pdf')
      )
      and exists (
        select 1
        from public.applicants a
        where a.id = split_part(name, '/', 4)
          and a.submission_id = split_part(name, '/', 2)
      )
      and (
        (select app_private.current_profile_role()) = 'admin'
        or split_part(name, '/', 2) in (
          select id from public.submissions where agent_id = (select auth.uid())
        )
      )
    )
    or (
      split_part(name, '/', 1) = 'submissions'
      and split_part(name, '/', 3) = 'common'
      and split_part(name, '/', 2) <> ''
      and split_part(name, '/', 4) in ('application_pdf', 'appointment_pdf')
      and split_part(name, '/', 5) <> ''
      and split_part(name, '/', 6) = ''
      and storage.extension(name) = 'pdf'
      and exists (
        select 1
        from public.submissions s
        where s.id = split_part(name, '/', 2)
      )
      and (
        (select app_private.current_profile_role()) = 'admin'
        or exists (
          select 1
          from public.admin_pdf_artifacts a
          join public.submissions s on s.id = a.submission_id
          where a.storage_bucket = bucket_id
            and a.storage_path = name
            and s.agent_id = (select auth.uid())
        )
        or exists (
          select 1
          from public.returned_pdf_handoff_artifacts h
          join public.submissions s on s.id = h.submission_id
          where h.storage_bucket = bucket_id
            and h.storage_path = name
            and s.agent_id = (select auth.uid())
        )
      )
    )
    or (
      split_part(name, '/', 1) <> 'submissions'
      and split_part(name, '/', 1) <> ''
      and split_part(name, '/', 2) <> ''
      and split_part(name, '/', 3) in ('selfie', 'selfie_2', 'passport_scan', 'visa_application_pdf')
      and split_part(name, '/', 4) <> ''
      and split_part(name, '/', 5) = ''
      and (
        (split_part(name, '/', 3) in ('selfie', 'selfie_2') and storage.extension(name) in ('jpg', 'jpeg', 'png', 'heic', 'heif'))
        or (split_part(name, '/', 3) = 'passport_scan' and storage.extension(name) in ('jpg', 'jpeg', 'png', 'heic', 'heif', 'pdf'))
        or (split_part(name, '/', 3) = 'visa_application_pdf' and storage.extension(name) = 'pdf')
      )
      and exists (
        select 1
        from public.applicants a
        where a.id = split_part(name, '/', 2)
          and a.submission_id = split_part(name, '/', 1)
      )
      and (
        (select app_private.current_profile_role()) = 'admin'
        or split_part(name, '/', 1) in (
          select id from public.submissions where agent_id = (select auth.uid())
        )
      )
    )
    or (
      split_part(name, '/', 1) <> 'submissions'
      and split_part(name, '/', 2) = 'common'
      and split_part(name, '/', 3) in ('application_pdf', 'appointment_pdf')
      and split_part(name, '/', 4) <> ''
      and split_part(name, '/', 5) = ''
      and storage.extension(name) = 'pdf'
      and exists (
        select 1
        from public.submissions s
        where s.id = split_part(name, '/', 1)
      )
      and (
        (select app_private.current_profile_role()) = 'admin'
        or exists (
          select 1
          from public.admin_pdf_artifacts a
          join public.submissions s on s.id = a.submission_id
          where a.storage_bucket = bucket_id
            and a.storage_path = name
            and s.agent_id = (select auth.uid())
        )
        or exists (
          select 1
          from public.returned_pdf_handoff_artifacts h
          join public.submissions s on s.id = h.submission_id
          where h.storage_bucket = bucket_id
            and h.storage_path = name
            and s.agent_id = (select auth.uid())
        )
      )
    )
  )
);

create policy "media storage write editable owner or admin"
on storage.objects for insert
to authenticated
	with check (
	  bucket_id = 'submission-media'
	  and name !~ '(^/|//|(^|/)\.\.?(/|$))'
	  and (
	    (
      split_part(name, '/', 1) = 'submissions'
      and split_part(name, '/', 3) = 'applicants'
      and split_part(name, '/', 2) <> ''
      and split_part(name, '/', 4) <> ''
      and split_part(name, '/', 5) in ('selfie', 'selfie_2', 'passport_scan', 'visa_application_pdf')
      and split_part(name, '/', 6) <> ''
      and split_part(name, '/', 7) = ''
      and (
        (split_part(name, '/', 5) in ('selfie', 'selfie_2') and storage.extension(name) in ('jpg', 'jpeg', 'png', 'heic', 'heif') and coalesce(metadata ->> 'mimetype', '') in ('image/jpeg', 'image/png', 'image/heic', 'image/heif'))
        or (split_part(name, '/', 5) = 'passport_scan' and storage.extension(name) in ('jpg', 'jpeg', 'png', 'heic', 'heif') and coalesce(metadata ->> 'mimetype', '') in ('image/jpeg', 'image/png', 'image/heic', 'image/heif'))
        or (split_part(name, '/', 5) = 'passport_scan' and storage.extension(name) = 'pdf' and coalesce(metadata ->> 'mimetype', '') = 'application/pdf')
        or (split_part(name, '/', 5) = 'visa_application_pdf' and storage.extension(name) = 'pdf' and coalesce(metadata ->> 'mimetype', '') = 'application/pdf')
      )
      and exists (
        select 1
        from public.applicants a
        where a.id = split_part(name, '/', 4)
          and a.submission_id = split_part(name, '/', 2)
      )
      and (
        (select app_private.current_profile_role()) = 'admin'
        or (
          split_part(name, '/', 5) in ('selfie', 'selfie_2', 'passport_scan')
          and split_part(name, '/', 2) in (
            select id
            from public.submissions
            where agent_id = (select auth.uid())
              and status in ('draft', 'filling', 'returned', 'ready_for_review')
          )
        )
      )
    )
    or (
      split_part(name, '/', 1) = 'submissions'
      and split_part(name, '/', 3) = 'common'
      and split_part(name, '/', 2) <> ''
      and split_part(name, '/', 4) in ('application_pdf', 'appointment_pdf')
      and split_part(name, '/', 5) <> ''
      and split_part(name, '/', 6) = ''
      and storage.extension(name) = 'pdf'
      and coalesce(metadata ->> 'mimetype', '') = 'application/pdf'
      and (select app_private.current_profile_role()) = 'admin'
      and exists (
        select 1
        from public.submissions s
        where s.id = split_part(name, '/', 2)
      )
    )
  )
);

create policy "media storage update editable owner or admin"
on storage.objects for update
to authenticated
using (
  bucket_id = 'submission-media'
  and name !~ '(^/|//|(^|/)\.\.?(/|$))'
  and (
    (
      split_part(name, '/', 1) = 'submissions'
      and split_part(name, '/', 3) = 'applicants'
      and split_part(name, '/', 2) <> ''
      and split_part(name, '/', 4) <> ''
      and split_part(name, '/', 5) in ('selfie', 'selfie_2', 'passport_scan', 'visa_application_pdf')
      and split_part(name, '/', 6) <> ''
      and split_part(name, '/', 7) = ''
      and (
        (split_part(name, '/', 5) in ('selfie', 'selfie_2') and storage.extension(name) in ('jpg', 'jpeg', 'png', 'heic', 'heif') and coalesce(metadata ->> 'mimetype', '') in ('image/jpeg', 'image/png', 'image/heic', 'image/heif'))
        or (split_part(name, '/', 5) = 'passport_scan' and storage.extension(name) in ('jpg', 'jpeg', 'png', 'heic', 'heif') and coalesce(metadata ->> 'mimetype', '') in ('image/jpeg', 'image/png', 'image/heic', 'image/heif'))
        or (split_part(name, '/', 5) = 'passport_scan' and storage.extension(name) = 'pdf' and coalesce(metadata ->> 'mimetype', '') = 'application/pdf')
        or (split_part(name, '/', 5) = 'visa_application_pdf' and storage.extension(name) = 'pdf' and coalesce(metadata ->> 'mimetype', '') = 'application/pdf')
      )
      and exists (
        select 1
        from public.applicants a
        where a.id = split_part(name, '/', 4)
          and a.submission_id = split_part(name, '/', 2)
      )
      and (
        (select app_private.current_profile_role()) = 'admin'
        or (
          split_part(name, '/', 5) in ('selfie', 'selfie_2', 'passport_scan')
          and split_part(name, '/', 2) in (
            select id
            from public.submissions
            where agent_id = (select auth.uid())
              and status in ('draft', 'filling', 'returned', 'ready_for_review')
          )
        )
      )
    )
    or (
      split_part(name, '/', 1) = 'submissions'
      and split_part(name, '/', 3) = 'common'
      and split_part(name, '/', 2) <> ''
      and split_part(name, '/', 4) in ('application_pdf', 'appointment_pdf')
      and split_part(name, '/', 5) <> ''
      and split_part(name, '/', 6) = ''
      and storage.extension(name) = 'pdf'
      and coalesce(metadata ->> 'mimetype', '') = 'application/pdf'
      and (select app_private.current_profile_role()) = 'admin'
      and exists (
        select 1
        from public.submissions s
        where s.id = split_part(name, '/', 2)
      )
    )
    or (
      split_part(name, '/', 1) <> 'submissions'
      and split_part(name, '/', 1) <> ''
      and split_part(name, '/', 2) <> ''
      and split_part(name, '/', 3) in ('selfie', 'selfie_2', 'passport_scan', 'visa_application_pdf')
      and split_part(name, '/', 4) <> ''
      and split_part(name, '/', 5) = ''
      and (
        (split_part(name, '/', 3) in ('selfie', 'selfie_2') and storage.extension(name) in ('jpg', 'jpeg', 'png', 'heic', 'heif'))
        or (split_part(name, '/', 3) = 'passport_scan' and storage.extension(name) in ('jpg', 'jpeg', 'png', 'heic', 'heif', 'pdf'))
        or (split_part(name, '/', 3) = 'visa_application_pdf' and storage.extension(name) = 'pdf')
      )
      and exists (
        select 1
        from public.applicants a
        where a.id = split_part(name, '/', 2)
          and a.submission_id = split_part(name, '/', 1)
      )
      and (
        (select app_private.current_profile_role()) = 'admin'
        or (
          split_part(name, '/', 3) in ('selfie', 'selfie_2', 'passport_scan')
          and split_part(name, '/', 1) in (
            select id
            from public.submissions
            where agent_id = (select auth.uid())
              and status in ('draft', 'filling', 'returned', 'ready_for_review')
          )
        )
      )
    )
    or (
      split_part(name, '/', 1) <> 'submissions'
      and split_part(name, '/', 2) = 'common'
      and split_part(name, '/', 3) in ('application_pdf', 'appointment_pdf')
      and split_part(name, '/', 4) <> ''
      and split_part(name, '/', 5) = ''
      and storage.extension(name) = 'pdf'
      and (select app_private.current_profile_role()) = 'admin'
      and exists (
        select 1
        from public.submissions s
        where s.id = split_part(name, '/', 1)
      )
    )
  )
)
with check (
  bucket_id = 'submission-media'
  and name !~ '(^/|//|(^|/)\.\.?(/|$))'
  and (
    (
      split_part(name, '/', 1) = 'submissions'
      and split_part(name, '/', 3) = 'applicants'
      and split_part(name, '/', 2) <> ''
      and split_part(name, '/', 4) <> ''
      and split_part(name, '/', 5) in ('selfie', 'selfie_2', 'passport_scan', 'visa_application_pdf')
	      and split_part(name, '/', 6) <> ''
	      and split_part(name, '/', 7) = ''
	      and (
	        (split_part(name, '/', 5) in ('selfie', 'selfie_2') and storage.extension(name) in ('jpg', 'jpeg', 'png', 'heic', 'heif') and coalesce(metadata ->> 'mimetype', '') in ('image/jpeg', 'image/png', 'image/heic', 'image/heif'))
	        or (split_part(name, '/', 5) = 'passport_scan' and storage.extension(name) in ('jpg', 'jpeg', 'png', 'heic', 'heif') and coalesce(metadata ->> 'mimetype', '') in ('image/jpeg', 'image/png', 'image/heic', 'image/heif'))
	        or (split_part(name, '/', 5) = 'passport_scan' and storage.extension(name) = 'pdf' and coalesce(metadata ->> 'mimetype', '') = 'application/pdf')
	        or (split_part(name, '/', 5) = 'visa_application_pdf' and storage.extension(name) = 'pdf' and coalesce(metadata ->> 'mimetype', '') = 'application/pdf')
	      )
      and exists (
        select 1
        from public.applicants a
        where a.id = split_part(name, '/', 4)
          and a.submission_id = split_part(name, '/', 2)
      )
      and (
        (select app_private.current_profile_role()) = 'admin'
        or (
          split_part(name, '/', 5) in ('selfie', 'selfie_2', 'passport_scan')
          and split_part(name, '/', 2) in (
            select id
            from public.submissions
            where agent_id = (select auth.uid())
              and status in ('draft', 'filling', 'returned', 'ready_for_review')
          )
        )
      )
    )
    or (
      split_part(name, '/', 1) = 'submissions'
      and split_part(name, '/', 3) = 'common'
      and split_part(name, '/', 2) <> ''
      and split_part(name, '/', 4) in ('application_pdf', 'appointment_pdf')
	      and split_part(name, '/', 5) <> ''
	      and split_part(name, '/', 6) = ''
	      and storage.extension(name) = 'pdf'
	      and coalesce(metadata ->> 'mimetype', '') = 'application/pdf'
	      and (select app_private.current_profile_role()) = 'admin'
	      and exists (
	        select 1
	        from public.submissions s
	        where s.id = split_part(name, '/', 2)
	      )
	    )
	  )
	);

create policy "media storage delete editable owner or admin"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'submission-media'
  and name !~ '(^/|//|(^|/)\.\.?(/|$))'
  and (
    (
      split_part(name, '/', 1) = 'submissions'
      and split_part(name, '/', 3) = 'applicants'
      and split_part(name, '/', 2) <> ''
      and split_part(name, '/', 4) <> ''
      and split_part(name, '/', 5) in ('selfie', 'selfie_2', 'passport_scan', 'visa_application_pdf')
      and split_part(name, '/', 6) <> ''
      and split_part(name, '/', 7) = ''
      and (
        (split_part(name, '/', 5) in ('selfie', 'selfie_2') and storage.extension(name) in ('jpg', 'jpeg', 'png', 'heic', 'heif'))
        or (split_part(name, '/', 5) = 'passport_scan' and storage.extension(name) in ('jpg', 'jpeg', 'png', 'heic', 'heif', 'pdf'))
        or (split_part(name, '/', 5) = 'visa_application_pdf' and storage.extension(name) = 'pdf')
      )
      and exists (
        select 1
        from public.applicants a
        where a.id = split_part(name, '/', 4)
          and a.submission_id = split_part(name, '/', 2)
      )
      and (
        (select app_private.current_profile_role()) = 'admin'
        or (
          split_part(name, '/', 5) in ('selfie', 'selfie_2', 'passport_scan')
          and split_part(name, '/', 2) in (
            select id
            from public.submissions
            where agent_id = (select auth.uid())
              and status in ('draft', 'filling', 'returned', 'ready_for_review')
          )
        )
      )
    )
    or (
      split_part(name, '/', 1) = 'submissions'
      and split_part(name, '/', 3) = 'common'
      and split_part(name, '/', 2) <> ''
      and split_part(name, '/', 4) in ('application_pdf', 'appointment_pdf')
      and split_part(name, '/', 5) <> ''
      and split_part(name, '/', 6) = ''
      and storage.extension(name) = 'pdf'
      and (select app_private.current_profile_role()) = 'admin'
      and exists (
        select 1
        from public.submissions s
        where s.id = split_part(name, '/', 2)
      )
    )
    or (
      split_part(name, '/', 1) <> 'submissions'
      and split_part(name, '/', 1) <> ''
      and split_part(name, '/', 2) <> ''
      and split_part(name, '/', 3) in ('selfie', 'selfie_2', 'passport_scan', 'visa_application_pdf')
      and split_part(name, '/', 4) <> ''
      and split_part(name, '/', 5) = ''
      and (
        (split_part(name, '/', 3) in ('selfie', 'selfie_2') and storage.extension(name) in ('jpg', 'jpeg', 'png', 'heic', 'heif'))
        or (split_part(name, '/', 3) = 'passport_scan' and storage.extension(name) in ('jpg', 'jpeg', 'png', 'heic', 'heif', 'pdf'))
        or (split_part(name, '/', 3) = 'visa_application_pdf' and storage.extension(name) = 'pdf')
      )
      and exists (
        select 1
        from public.applicants a
        where a.id = split_part(name, '/', 2)
          and a.submission_id = split_part(name, '/', 1)
      )
      and (
        (select app_private.current_profile_role()) = 'admin'
        or (
          split_part(name, '/', 3) in ('selfie', 'selfie_2', 'passport_scan')
          and split_part(name, '/', 1) in (
            select id
            from public.submissions
            where agent_id = (select auth.uid())
              and status in ('draft', 'filling', 'returned', 'ready_for_review')
          )
        )
      )
    )
    or (
      split_part(name, '/', 1) <> 'submissions'
      and split_part(name, '/', 2) = 'common'
      and split_part(name, '/', 3) in ('application_pdf', 'appointment_pdf')
      and split_part(name, '/', 4) <> ''
      and split_part(name, '/', 5) = ''
      and storage.extension(name) = 'pdf'
      and (select app_private.current_profile_role()) = 'admin'
      and exists (
        select 1
        from public.submissions s
        where s.id = split_part(name, '/', 1)
      )
    )
  )
);

drop policy if exists "media storage read owner or admin" on storage.objects;
drop policy if exists "media storage write editable owner or admin" on storage.objects;
drop policy if exists "media storage update editable owner or admin" on storage.objects;
drop policy if exists "media storage delete editable owner or admin" on storage.objects;

create unique index if not exists applicants_id_submission_id_uidx
on public.applicants (id, submission_id);

create table if not exists public.returned_pdf_handoff_artifacts (
  id uuid primary key default gen_random_uuid(),
  submission_id text not null references public.submissions(id) on delete cascade,
  applicant_id text,
  artifact_kind text not null,
  storage_bucket text not null,
  storage_path text not null,
  file_name text not null,
  sha256 text not null,
  released_by uuid not null references public.profiles(id),
  released_at timestamptz not null default now(),
  check (artifact_kind in ('appointment_pdf', 'visa_application_pdf')),
  check (storage_bucket = 'submission-media'),
  check (sha256 ~ '^[a-fA-F0-9]{64}$'),
  check (file_name ~ '^[A-Za-z0-9._-]+\\.pdf$'),
  check (
    (artifact_kind = 'appointment_pdf' and applicant_id is null)
    or (artifact_kind = 'visa_application_pdf' and applicant_id is not null)
  ),
  check (storage_path !~ '(^/|//|\\.\\.)'),
  check (
    (
      artifact_kind = 'appointment_pdf'
      and applicant_id is null
      and split_part(storage_path, '/', 1) = submission_id
      and split_part(storage_path, '/', 2) = 'common'
      and split_part(storage_path, '/', 3) = 'appointment_pdf'
      and split_part(storage_path, '/', 5) = ''
      and lower(storage_path) ~ '\\.pdf$'
      and split_part(storage_path, '/', 4) ~ (
        '^' || lower(left(sha256, 16)) || '(_[A-Za-z0-9]+)?_appointment_pdf\\.pdf$'
      )
    )
    or (
      artifact_kind = 'visa_application_pdf'
      and applicant_id is not null
      and split_part(storage_path, '/', 1) = submission_id
      and split_part(storage_path, '/', 2) = applicant_id
      and split_part(storage_path, '/', 3) = 'visa_application_pdf'
      and split_part(storage_path, '/', 5) = ''
      and lower(storage_path) ~ '\\.pdf$'
      and split_part(storage_path, '/', 4) ~ (
        '^' || lower(left(sha256, 16)) || '(_[A-Za-z0-9]+)?_visa_application_pdf\\.pdf$'
      )
    )
  ),
  constraint returned_pdf_handoff_artifacts_applicant_submission_fkey
    foreign key (applicant_id, submission_id)
    references public.applicants(id, submission_id)
    on delete cascade
);

create unique index if not exists returned_pdf_handoff_artifacts_storage_uidx
on public.returned_pdf_handoff_artifacts (storage_bucket, storage_path);

create unique index if not exists returned_pdf_handoff_artifacts_slot_uidx
on public.returned_pdf_handoff_artifacts (
  submission_id,
  artifact_kind,
  coalesce(applicant_id, 'common')
);

create index if not exists returned_pdf_handoff_artifacts_submission_idx
on public.returned_pdf_handoff_artifacts (submission_id);

create index if not exists returned_pdf_handoff_artifacts_applicant_idx
on public.returned_pdf_handoff_artifacts (applicant_id)
where applicant_id is not null;

alter table public.returned_pdf_handoff_artifacts enable row level security;

drop policy if exists "returned pdf handoff artifacts read owner or admin"
on public.returned_pdf_handoff_artifacts;
drop policy if exists "returned pdf handoff artifacts admin write"
on public.returned_pdf_handoff_artifacts;

create policy "returned pdf handoff artifacts read owner or admin"
on public.returned_pdf_handoff_artifacts for select
to authenticated
using (
  (select app_private.current_profile_role()) = 'admin'
  or exists (
    select 1
    from public.submissions s
    where s.id = returned_pdf_handoff_artifacts.submission_id
      and s.agent_id = (select auth.uid())
  )
);

revoke all on public.returned_pdf_handoff_artifacts from anon, authenticated;
grant select on public.returned_pdf_handoff_artifacts to authenticated;

create policy "media storage read owner or admin"
on storage.objects for select
to authenticated
using (
  bucket_id = 'submission-media'
  and split_part(name, '/', 1) <> ''
  and split_part(name, '/', 2) <> ''
  and split_part(name, '/', 4) <> ''
  and split_part(name, '/', 5) = ''
  and (
    (
      split_part(name, '/', 3) in ('selfie', 'selfie_2', 'passport_scan', 'visa_application_pdf')
      and (
        (split_part(name, '/', 3) in ('selfie', 'selfie_2') and storage.extension(name) in ('jpg', 'jpeg', 'png'))
        or (split_part(name, '/', 3) = 'passport_scan' and storage.extension(name) in ('jpg', 'jpeg', 'png', 'pdf'))
        or (split_part(name, '/', 3) = 'visa_application_pdf' and storage.extension(name) = 'pdf')
      )
      and exists (
        select 1
        from public.applicants a
        where a.id = split_part(name, '/', 2)
          and a.submission_id = split_part(name, '/', 1)
      )
    )
    or (
      split_part(name, '/', 2) = 'common'
      and split_part(name, '/', 3) = 'appointment_pdf'
      and storage.extension(name) = 'pdf'
      and exists (
        select 1
        from public.submissions s
        where s.id = split_part(name, '/', 1)
      )
    )
  )
  and (
    (select app_private.current_profile_role()) = 'admin'
    or (
      split_part(name, '/', 3) in ('selfie', 'selfie_2', 'passport_scan')
      and split_part(name, '/', 1) in (
        select id from public.submissions where agent_id = (select auth.uid())
      )
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
);

create policy "media storage write editable owner or admin"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'submission-media'
  and split_part(name, '/', 1) <> ''
  and split_part(name, '/', 2) <> ''
  and split_part(name, '/', 4) <> ''
  and split_part(name, '/', 5) = ''
  and (
    (
      split_part(name, '/', 3) in ('selfie', 'selfie_2', 'passport_scan', 'visa_application_pdf')
      and (
        (split_part(name, '/', 3) in ('selfie', 'selfie_2') and storage.extension(name) in ('jpg', 'jpeg', 'png'))
        or (split_part(name, '/', 3) = 'passport_scan' and storage.extension(name) in ('jpg', 'jpeg', 'png', 'pdf'))
        or (split_part(name, '/', 3) = 'visa_application_pdf' and storage.extension(name) = 'pdf')
      )
      and exists (
        select 1
        from public.applicants a
        where a.id = split_part(name, '/', 2)
          and a.submission_id = split_part(name, '/', 1)
      )
    )
    or (
      split_part(name, '/', 2) = 'common'
      and split_part(name, '/', 3) = 'appointment_pdf'
      and storage.extension(name) = 'pdf'
      and exists (
        select 1
        from public.submissions s
        where s.id = split_part(name, '/', 1)
      )
    )
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
);

create or replace function public.publish_returned_pdf_handoff(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role public.profile_role := app_private.current_profile_role();
  artifact_count integer := 0;
  common_artifact jsonb;
  current_applicant_count integer := 0;
  existing_handoff_count integer := 0;
  expected_handoff_count integer := 0;
  matching_existing_handoff_count integer := 0;
  ready_application_pdfs jsonb := '[]'::jsonb;
  snapshot jsonb;
  submission_record record;
  target_submission_id text := btrim(coalesce(payload ->> 'submissionId', ''));
  visa_reviews jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authenticated user required to publish returned PDF handoff'
      using errcode = '28000';
  end if;

  if actor_role <> 'admin' then
    raise exception 'Only admins can publish returned PDF handoff'
      using errcode = '42501';
  end if;

  if target_submission_id = '' then
    raise exception 'Returned PDF handoff submission id is required';
  end if;

  select *
  into submission_record
  from public.submissions
  where id = target_submission_id
  for update;

  if submission_record.id is null then
    raise exception 'Returned PDF handoff submission was not found';
  end if;

  if submission_record.status <> 'exported' then
    raise exception 'Returned PDF handoff can be published only after export';
  end if;

  snapshot := submission_record.family_intelligence -> 'v19CockpitSnapshot' -> 'submission';
  if snapshot is null or snapshot ->> 'status' <> 'exported' then
    raise exception 'Returned PDF handoff requires an exported cockpit snapshot';
  end if;

  if coalesce(
    snapshot #>> '{exportPackage,idempotencyKey}',
    snapshot #>> '{returnedPdfPackage,exportPackageId}',
    ''
  ) = '' then
    raise exception 'Returned PDF handoff requires a durable export package identity';
  end if;

  if coalesce(
    snapshot #>> '{returnedPdfPackage,ownerAgentId}',
    snapshot ->> 'agentId',
    ''
  ) <> submission_record.agent_id::text then
    raise exception 'Returned PDF handoff owner does not match submission owner';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(snapshot -> 'issues', '[]'::jsonb)) as issue(value)
    where issue.value ->> 'reason' = 'Returned PDF mismatch'
      and issue.value ->> 'severity' = 'blocker'
      and issue.value ->> 'status' in ('open', 'fixed_by_agent')
  ) then
    raise exception 'Returned PDF mismatch issues must be closed before handoff';
  end if;

  common_artifact := snapshot #> '{returnedPdfPackage,commonAppointmentPdf}';
  if common_artifact is null
    or common_artifact ->> 'mimeType' <> 'application/pdf'
    or common_artifact ->> 'storageBucket' <> 'submission-media'
    or coalesce(common_artifact ->> 'storagePath', '') = ''
    or coalesce(common_artifact ->> 'fileName', '') = ''
    or coalesce(common_artifact ->> 'fileName', '') !~ '^[A-Za-z0-9._-]+\\.pdf$'
    or coalesce(common_artifact ->> 'sha256', '') !~ '^[a-fA-F0-9]{64}$'
    or coalesce(common_artifact ->> 'sizeBytes', '') !~ '^[0-9]+$'
    or (common_artifact ->> 'sizeBytes')::bigint <= 0
    or split_part(common_artifact ->> 'storagePath', '/', 1) <> target_submission_id
    or split_part(common_artifact ->> 'storagePath', '/', 2) <> 'common'
    or split_part(common_artifact ->> 'storagePath', '/', 3) <> 'appointment_pdf'
    or split_part(common_artifact ->> 'storagePath', '/', 5) <> ''
    or lower(common_artifact ->> 'storagePath') !~ '\\.pdf$'
    or split_part(common_artifact ->> 'storagePath', '/', 4) !~ (
      '^' || lower(left(common_artifact ->> 'sha256', 16)) || '(_[A-Za-z0-9]+)?_appointment_pdf\\.pdf$'
    )
  then
    raise exception 'Returned PDF handoff requires a valid common appointment PDF';
  end if;

  if not exists (
    select 1
    from storage.objects stored_common_pdf
    where stored_common_pdf.bucket_id = common_artifact ->> 'storageBucket'
      and stored_common_pdf.name = common_artifact ->> 'storagePath'
  ) then
    raise exception 'Returned PDF handoff common appointment PDF file is missing from storage';
  end if;

  visa_reviews := coalesce(
    snapshot -> 'visaApplicationPdfReviews',
    case
      when snapshot ? 'visaApplicationPdfReview'
        then jsonb_build_array(snapshot -> 'visaApplicationPdfReview')
      else '[]'::jsonb
    end
  );

  if exists (
    select 1
    from jsonb_array_elements(visa_reviews) as review(value)
    where review.value ->> 'status' = 'blocked'
  ) then
    raise exception 'Returned PDF blocked reviews must be resolved before handoff';
  end if;

  select count(*)
  into current_applicant_count
  from jsonb_array_elements(coalesce(snapshot -> 'applicants', '[]'::jsonb)) as applicant(value);

  if current_applicant_count = 0 then
    raise exception 'Returned PDF handoff requires applicants';
  end if;

  select coalesce(jsonb_agg(application_pdf.row_data), '[]'::jsonb)
  into ready_application_pdfs
  from jsonb_array_elements(coalesce(snapshot -> 'applicants', '[]'::jsonb)) as applicant(value)
  join lateral (
    select jsonb_build_object(
      'applicantId', applicant.value ->> 'id',
      'artifact', review.value -> 'artifact'
    ) as row_data
    from jsonb_array_elements(visa_reviews) as review(value)
    cross join lateral (
      select review.value -> 'artifact' as artifact
    ) as application_pdf
    where review.value ->> 'applicantId' = applicant.value ->> 'id'
      and (
        review.value ->> 'status' = 'clear'
        or (
          review.value ->> 'status' = 'needs_review'
          and review.value ->> 'handoffStatus' = 'ready_for_agent'
        )
      )
      and application_pdf.artifact ->> 'mimeType' = 'application/pdf'
      and application_pdf.artifact ->> 'storageBucket' = 'submission-media'
      and coalesce(application_pdf.artifact ->> 'storagePath', '') <> ''
      and coalesce(application_pdf.artifact ->> 'fileName', '') <> ''
      and coalesce(application_pdf.artifact ->> 'fileName', '') ~ '^[A-Za-z0-9._-]+\\.pdf$'
      and coalesce(application_pdf.artifact ->> 'sha256', '') ~ '^[a-fA-F0-9]{64}$'
      and coalesce(application_pdf.artifact ->> 'sizeBytes', '') ~ '^[0-9]+$'
      and (application_pdf.artifact ->> 'sizeBytes')::bigint > 0
      and split_part(application_pdf.artifact ->> 'storagePath', '/', 1) = target_submission_id
      and split_part(application_pdf.artifact ->> 'storagePath', '/', 2) = applicant.value ->> 'id'
      and split_part(application_pdf.artifact ->> 'storagePath', '/', 3) = 'visa_application_pdf'
      and split_part(application_pdf.artifact ->> 'storagePath', '/', 5) = ''
      and lower(application_pdf.artifact ->> 'storagePath') ~ '\\.pdf$'
      and split_part(application_pdf.artifact ->> 'storagePath', '/', 4) ~ (
        '^' || lower(left(application_pdf.artifact ->> 'sha256', 16)) || '(_[A-Za-z0-9]+)?_visa_application_pdf\\.pdf$'
      )
      and exists (
        select 1
        from storage.objects stored_application_pdf
        where stored_application_pdf.bucket_id = application_pdf.artifact ->> 'storageBucket'
          and stored_application_pdf.name = application_pdf.artifact ->> 'storagePath'
      )
  ) as application_pdf on true;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(snapshot -> 'applicants', '[]'::jsonb)) as applicant(value)
    where (
      select count(*)
      from jsonb_array_elements(ready_application_pdfs) as ready_application_pdf(value)
      where ready_application_pdf.value ->> 'applicantId' = applicant.value ->> 'id'
    ) <> 1
  ) then
    raise exception 'Returned PDF handoff requires exactly one ready application PDF per applicant';
  end if;

  expected_handoff_count := current_applicant_count + 1;

  select count(*)
  into existing_handoff_count
  from public.returned_pdf_handoff_artifacts existing_handoff
  where existing_handoff.submission_id = target_submission_id;

  if existing_handoff_count > 0 then
    select count(*)
    into matching_existing_handoff_count
    from public.returned_pdf_handoff_artifacts existing_handoff
    where existing_handoff.submission_id = target_submission_id
      and (
        (
          existing_handoff.artifact_kind = 'appointment_pdf'
          and existing_handoff.applicant_id is null
          and existing_handoff.storage_bucket = common_artifact ->> 'storageBucket'
          and existing_handoff.storage_path = common_artifact ->> 'storagePath'
          and existing_handoff.file_name = common_artifact ->> 'fileName'
          and existing_handoff.sha256 = common_artifact ->> 'sha256'
        )
        or exists (
          select 1
          from jsonb_array_elements(ready_application_pdfs) as ready_application_pdf(value)
          where existing_handoff.artifact_kind = 'visa_application_pdf'
            and existing_handoff.applicant_id = ready_application_pdf.value ->> 'applicantId'
            and existing_handoff.storage_bucket = ready_application_pdf.value #>> '{artifact,storageBucket}'
            and existing_handoff.storage_path = ready_application_pdf.value #>> '{artifact,storagePath}'
            and existing_handoff.file_name = ready_application_pdf.value #>> '{artifact,fileName}'
            and existing_handoff.sha256 = ready_application_pdf.value #>> '{artifact,sha256}'
        )
      );

    if existing_handoff_count = expected_handoff_count
      and matching_existing_handoff_count = expected_handoff_count
    then
      return jsonb_build_object(
        'submissionId', target_submission_id,
        'artifactCount', existing_handoff_count,
        'duplicate', true
      );
    end if;

    raise exception 'Returned PDF handoff was already published with different artifacts';
  end if;

  insert into public.returned_pdf_handoff_artifacts (
    submission_id,
    applicant_id,
    artifact_kind,
    storage_bucket,
    storage_path,
    file_name,
    sha256,
    released_by
  )
  values (
    target_submission_id,
    null,
    'appointment_pdf',
    common_artifact ->> 'storageBucket',
    common_artifact ->> 'storagePath',
    common_artifact ->> 'fileName',
    common_artifact ->> 'sha256',
    auth.uid()
  );

  insert into public.returned_pdf_handoff_artifacts (
    submission_id,
    applicant_id,
    artifact_kind,
    storage_bucket,
    storage_path,
    file_name,
    sha256,
    released_by
  )
  select
    target_submission_id,
    ready_application_pdf.value ->> 'applicantId',
    'visa_application_pdf',
    ready_application_pdf.value #>> '{artifact,storageBucket}',
    ready_application_pdf.value #>> '{artifact,storagePath}',
    ready_application_pdf.value #>> '{artifact,fileName}',
    ready_application_pdf.value #>> '{artifact,sha256}',
    auth.uid()
  from jsonb_array_elements(ready_application_pdfs) as ready_application_pdf(value);

  get diagnostics artifact_count = row_count;
  artifact_count := artifact_count + 1;

  return jsonb_build_object(
    'submissionId', target_submission_id,
    'artifactCount', artifact_count
  );
end;
$$;

revoke execute on function public.publish_returned_pdf_handoff(jsonb) from public, anon;
grant execute on function public.publish_returned_pdf_handoff(jsonb) to authenticated;

create policy "media storage update editable owner or admin"
on storage.objects for update
to authenticated
using (
  bucket_id = 'submission-media'
  and split_part(name, '/', 1) <> ''
  and split_part(name, '/', 2) <> ''
  and split_part(name, '/', 4) <> ''
  and split_part(name, '/', 5) = ''
  and (
    (
      split_part(name, '/', 3) in ('selfie', 'selfie_2', 'passport_scan', 'visa_application_pdf')
      and exists (
        select 1
        from public.applicants a
        where a.id = split_part(name, '/', 2)
          and a.submission_id = split_part(name, '/', 1)
      )
    )
    or (
      split_part(name, '/', 2) = 'common'
      and split_part(name, '/', 3) = 'appointment_pdf'
      and exists (
        select 1
        from public.submissions s
        where s.id = split_part(name, '/', 1)
      )
    )
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
  and not exists (
    select 1
    from public.returned_pdf_handoff_artifacts published_handoff
    where published_handoff.storage_bucket = bucket_id
      and published_handoff.storage_path = name
  )
)
with check (
  bucket_id = 'submission-media'
  and split_part(name, '/', 1) <> ''
  and split_part(name, '/', 2) <> ''
  and split_part(name, '/', 4) <> ''
  and split_part(name, '/', 5) = ''
  and (
    (
      split_part(name, '/', 3) in ('selfie', 'selfie_2', 'passport_scan', 'visa_application_pdf')
      and (
        (split_part(name, '/', 3) in ('selfie', 'selfie_2') and storage.extension(name) in ('jpg', 'jpeg', 'png'))
        or (split_part(name, '/', 3) = 'passport_scan' and storage.extension(name) in ('jpg', 'jpeg', 'png', 'pdf'))
        or (split_part(name, '/', 3) = 'visa_application_pdf' and storage.extension(name) = 'pdf')
      )
      and exists (
        select 1
        from public.applicants a
        where a.id = split_part(name, '/', 2)
          and a.submission_id = split_part(name, '/', 1)
      )
    )
    or (
      split_part(name, '/', 2) = 'common'
      and split_part(name, '/', 3) = 'appointment_pdf'
      and storage.extension(name) = 'pdf'
      and exists (
        select 1
        from public.submissions s
        where s.id = split_part(name, '/', 1)
      )
    )
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
  and not exists (
    select 1
    from public.returned_pdf_handoff_artifacts published_handoff
    where published_handoff.storage_bucket = bucket_id
      and published_handoff.storage_path = name
  )
);

create policy "media storage delete editable owner or admin"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'submission-media'
  and split_part(name, '/', 1) <> ''
  and split_part(name, '/', 2) <> ''
  and split_part(name, '/', 4) <> ''
  and split_part(name, '/', 5) = ''
  and (
    (
      split_part(name, '/', 3) in ('selfie', 'selfie_2', 'passport_scan', 'visa_application_pdf')
      and exists (
        select 1
        from public.applicants a
        where a.id = split_part(name, '/', 2)
          and a.submission_id = split_part(name, '/', 1)
      )
    )
    or (
      split_part(name, '/', 2) = 'common'
      and split_part(name, '/', 3) = 'appointment_pdf'
      and exists (
        select 1
        from public.submissions s
        where s.id = split_part(name, '/', 1)
      )
    )
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
  and not exists (
    select 1
    from public.returned_pdf_handoff_artifacts published_handoff
    where published_handoff.storage_bucket = bucket_id
      and published_handoff.storage_path = name
  )
);

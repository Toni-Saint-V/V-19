create type public.access_request_status as enum ('pending', 'approved', 'rejected');

create table public.access_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  email text not null,
  full_name text not null,
  company_name text not null,
  city text not null,
  phone text not null,
  requested_role public.profile_role not null default 'agent',
  status public.access_request_status not null default 'pending',
  reviewed_at timestamptz,
  reviewed_by_admin_id uuid references public.profiles (id),
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requested_role = 'agent'),
  check (email = lower(btrim(email))),
  check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  check (length(btrim(full_name)) > 0),
  check (length(btrim(company_name)) > 0),
  check (length(btrim(city)) > 0),
  check (length(btrim(phone)) > 0),
  check (
    (status = 'pending' and reviewed_at is null and reviewed_by_admin_id is null)
    or (status in ('approved', 'rejected') and reviewed_at is not null and reviewed_by_admin_id is not null)
  ),
  check (status <> 'rejected' or rejection_reason is null or length(btrim(rejection_reason)) > 0)
);

create unique index access_requests_email_active_uidx
on public.access_requests (email)
where status = 'pending';

create index access_requests_status_created_at_idx
on public.access_requests (status, created_at);

create index access_requests_reviewed_by_idx
on public.access_requests (reviewed_by_admin_id);

alter table public.access_requests enable row level security;

create policy "access requests admin read"
on public.access_requests for select
to authenticated
using ((select app_private.current_profile_role()) = 'admin');

create policy "access requests requester read own"
on public.access_requests for select
to authenticated
using (user_id = (select auth.uid()));

revoke all on public.access_requests from anon, authenticated;
grant select on public.access_requests to authenticated;

create table public.admin_pdf_artifacts (
  id uuid primary key default gen_random_uuid(),
  submission_id text not null references public.submissions (id) on delete cascade,
  artifact_kind text not null,
  storage_bucket text not null,
  storage_path text not null,
  file_name text not null,
  sha256 text not null,
  uploaded_by uuid not null references public.profiles (id),
  uploaded_at timestamptz not null default now(),
  check (artifact_kind in ('appointment_pdf', 'application_pdf')),
  check (storage_bucket = 'submission-media'),
  check (sha256 ~ '^[a-fA-F0-9]{64}$'),
  check (
    length(btrim(file_name)) > 0
    and lower(file_name) ~ '\.pdf$'
    and position('/' in file_name) = 0
    and position(chr(92) in file_name) = 0
    and file_name !~ '[[:cntrl:]]'
  ),
  check (storage_path !~ '(^/|//|\.\.)'),
  check (
    split_part(storage_path, '/', 1) = submission_id
    and split_part(storage_path, '/', 2) = 'common'
    and split_part(storage_path, '/', 3) = artifact_kind
    and split_part(storage_path, '/', 5) = ''
    and lower(storage_path) ~ '\.pdf$'
    and split_part(storage_path, '/', 4) ~ (
      '^' || lower(left(sha256, 16)) || '(_[A-Za-z0-9]+)?_' || artifact_kind || '\.pdf$'
    )
  )
);

create unique index admin_pdf_artifacts_slot_uidx
on public.admin_pdf_artifacts (submission_id, artifact_kind);

create unique index admin_pdf_artifacts_storage_uidx
on public.admin_pdf_artifacts (storage_bucket, storage_path);

create index admin_pdf_artifacts_submission_idx
on public.admin_pdf_artifacts (submission_id);

alter table public.admin_pdf_artifacts enable row level security;

create policy "admin pdf artifacts read owner or admin"
on public.admin_pdf_artifacts for select
to authenticated
using (
  (select app_private.current_profile_role()) = 'admin'
  or exists (
    select 1
    from public.submissions s
    where s.id = admin_pdf_artifacts.submission_id
      and s.agent_id = (select auth.uid())
  )
);

create policy "admin pdf artifacts admin insert"
on public.admin_pdf_artifacts for insert
to authenticated
with check (
  (select app_private.current_profile_role()) = 'admin'
  and uploaded_by = (select auth.uid())
  and exists (
    select 1
    from public.submissions s
    where s.id = admin_pdf_artifacts.submission_id
  )
);

create policy "admin pdf artifacts admin update"
on public.admin_pdf_artifacts for update
to authenticated
using ((select app_private.current_profile_role()) = 'admin')
with check (
  (select app_private.current_profile_role()) = 'admin'
  and uploaded_by = (select auth.uid())
  and exists (
    select 1
    from public.submissions s
    where s.id = admin_pdf_artifacts.submission_id
  )
);

create policy "admin pdf artifacts admin delete"
on public.admin_pdf_artifacts for delete
to authenticated
using ((select app_private.current_profile_role()) = 'admin');

revoke all on public.admin_pdf_artifacts from anon, authenticated;
grant select, insert, update, delete on public.admin_pdf_artifacts to authenticated;

drop policy if exists "media storage read owner or admin" on storage.objects;
drop policy if exists "media storage write editable owner or admin" on storage.objects;
drop policy if exists "media storage update editable owner or admin" on storage.objects;
drop policy if exists "media storage delete editable owner or admin" on storage.objects;

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
      and split_part(name, '/', 3) in ('appointment_pdf', 'application_pdf')
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
      and split_part(name, '/', 3) in ('appointment_pdf', 'application_pdf')
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

create policy "media storage update editable owner or admin"
on storage.objects for update
to authenticated
using (
  bucket_id = 'submission-media'
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
    from public.returned_pdf_handoff_artifacts h
    where h.storage_bucket = bucket_id
      and h.storage_path = name
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
      and split_part(name, '/', 3) in ('appointment_pdf', 'application_pdf')
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
    from public.returned_pdf_handoff_artifacts h
    where h.storage_bucket = bucket_id
      and h.storage_path = name
  )
);

create policy "media storage delete editable owner or admin"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'submission-media'
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
    from public.returned_pdf_handoff_artifacts h
    where h.storage_bucket = bucket_id
      and h.storage_path = name
  )
);

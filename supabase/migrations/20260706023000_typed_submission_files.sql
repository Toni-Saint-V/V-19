alter type public.media_slot_type add value if not exists 'pdf';

create table if not exists public.submission_files (
  id uuid primary key default gen_random_uuid(),
  submission_id text not null references public.submissions (id) on delete cascade,
  applicant_id text not null references public.applicants (id) on delete cascade,
  uploaded_by uuid not null references public.profiles (id),
  document_type text not null check (document_type in ('selfie', 'selfie_2', 'passport_scan', 'pdf')),
  passport_number text not null check (passport_number ~ '^[A-Z0-9_-]+$'),
  original_file_name text not null check (
    btrim(original_file_name) <> ''
    and original_file_name !~ '[/\\]'
    and original_file_name !~ '[[:cntrl:]]'
  ),
  file_name text not null,
  file_path text not null,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes bigint not null check (size_bytes > 0),
  status text not null default 'uploaded' check (status in ('uploaded', 'error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (applicant_id, document_type),
  unique (file_path),
  check (file_path = submission_id || '/' || applicant_id || '/' || file_name),
  check (file_path !~ '(^/|//|(^|/)\.\.?(/|$))')
);

create index if not exists submission_files_submission_id_idx
on public.submission_files (submission_id);

create index if not exists submission_files_uploaded_by_idx
on public.submission_files (uploaded_by);

create or replace function app_private.enforce_submission_file_identity()
returns trigger
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  file_extension text := lower(regexp_replace(new.file_name, '^.*\.', ''));
begin
  if not exists (
    select 1
    from public.applicants a
    where a.id = new.applicant_id
      and a.submission_id = new.submission_id
  ) then
    raise exception 'Submission file applicant must belong to submission'
      using errcode = '23514';
  end if;

  if new.file_path <> new.submission_id || '/' || new.applicant_id || '/' || new.file_name then
    raise exception 'Submission file path must match submission/applicant/file name'
      using errcode = '23514';
  end if;

  if new.file_name <> new.passport_number || '_' || new.document_type || '.' || file_extension then
    raise exception 'Submission file name must match passport_documentType.extension'
      using errcode = '23514';
  end if;

  if file_extension not in ('jpg', 'png', 'webp', 'pdf') then
    raise exception 'Submission file extension is not allowed'
      using errcode = '23514';
  end if;

  if new.mime_type = 'image/jpeg' and file_extension <> 'jpg' then
    raise exception 'JPEG submission files must use .jpg'
      using errcode = '23514';
  end if;
  if new.mime_type = 'image/png' and file_extension <> 'png' then
    raise exception 'PNG submission files must use .png'
      using errcode = '23514';
  end if;
  if new.mime_type = 'image/webp' and file_extension <> 'webp' then
    raise exception 'WEBP submission files must use .webp'
      using errcode = '23514';
  end if;
  if new.mime_type = 'application/pdf' and file_extension <> 'pdf' then
    raise exception 'PDF submission files must use .pdf'
      using errcode = '23514';
  end if;

  if new.document_type in ('selfie', 'selfie_2') then
    if new.mime_type not in ('image/jpeg', 'image/png', 'image/webp') then
      raise exception 'Selfie files must be images'
        using errcode = '23514';
    end if;
    if new.size_bytes > 10485760 then
      raise exception 'Image submission files must be 10MB or smaller'
        using errcode = '23514';
    end if;
  elsif new.document_type = 'passport_scan' then
    if new.mime_type not in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf') then
      raise exception 'Passport scan files must be images or PDF'
        using errcode = '23514';
    end if;
    if new.mime_type = 'application/pdf' and new.size_bytes > 26214400 then
      raise exception 'Passport PDF files must be 25MB or smaller'
        using errcode = '23514';
    end if;
    if new.mime_type <> 'application/pdf' and new.size_bytes > 10485760 then
      raise exception 'Passport image files must be 10MB or smaller'
        using errcode = '23514';
    end if;
  elsif new.document_type = 'pdf' then
    if new.mime_type <> 'application/pdf' then
      raise exception 'PDF document must be application/pdf'
        using errcode = '23514';
    end if;
    if new.size_bytes > 26214400 then
      raise exception 'PDF document must be 25MB or smaller'
        using errcode = '23514';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists submission_files_identity_guard
on public.submission_files;

create trigger submission_files_identity_guard
before insert or update on public.submission_files
for each row execute function app_private.enforce_submission_file_identity();

alter table public.submission_files enable row level security;

revoke all on public.submission_files from anon;
grant select, insert, update on public.submission_files to authenticated;

drop policy if exists "submission files read owner or admin" on public.submission_files;
drop policy if exists "submission files insert owner agent" on public.submission_files;
drop policy if exists "submission files update owner agent" on public.submission_files;

create policy "submission files read owner or admin"
on public.submission_files for select
to authenticated
using (
  (select app_private.current_profile_role()) = 'admin'
  or exists (
    select 1
    from public.submissions s
    where s.id = submission_files.submission_id
      and s.agent_id = (select auth.uid())
  )
);

create policy "submission files insert owner agent"
on public.submission_files for insert
to authenticated
with check (
  uploaded_by = (select auth.uid())
  and (select app_private.current_profile_role()) = 'agent'
  and exists (
    select 1
    from public.submissions s
    where s.id = submission_files.submission_id
      and s.agent_id = (select auth.uid())
  )
);

create policy "submission files update owner agent"
on public.submission_files for update
to authenticated
using (
  (select app_private.current_profile_role()) = 'agent'
  and exists (
    select 1
    from public.submissions s
    where s.id = submission_files.submission_id
      and s.agent_id = (select auth.uid())
  )
)
with check (
  uploaded_by = (select auth.uid())
  and (select app_private.current_profile_role()) = 'agent'
  and exists (
    select 1
    from public.submissions s
    where s.id = submission_files.submission_id
      and s.agent_id = (select auth.uid())
  )
);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'submission-files',
  'submission-files',
  false,
  26214400,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "submission files storage read owner or admin" on storage.objects;
drop policy if exists "submission files storage insert owner agent" on storage.objects;
drop policy if exists "submission files storage update owner agent" on storage.objects;

create policy "submission files storage read owner or admin"
on storage.objects for select
to authenticated
using (
  bucket_id = 'submission-files'
  and name !~ '(^/|//|(^|/)\.\.?(/|$))'
  and split_part(name, '/', 1) <> ''
  and split_part(name, '/', 2) <> ''
  and split_part(name, '/', 3) ~ '^[A-Z0-9_-]+_(selfie|selfie_2|passport_scan|pdf)\.(jpg|png|webp|pdf)$'
  and split_part(name, '/', 4) = ''
  and (
    (
      split_part(name, '/', 3) ~ '^[A-Z0-9_-]+_(selfie|selfie_2)\.(jpg|png|webp)$'
      and coalesce(metadata ->> 'mimetype', '') in ('image/jpeg', 'image/png', 'image/webp')
    )
    or (
      split_part(name, '/', 3) ~ '^[A-Z0-9_-]+_passport_scan\.(jpg|png|webp)$'
      and coalesce(metadata ->> 'mimetype', '') in ('image/jpeg', 'image/png', 'image/webp')
    )
    or (
      split_part(name, '/', 3) ~ '^[A-Z0-9_-]+_(passport_scan|pdf)\.pdf$'
      and coalesce(metadata ->> 'mimetype', '') = 'application/pdf'
    )
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
);

create policy "submission files storage insert owner agent"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'submission-files'
  and (select app_private.current_profile_role()) = 'agent'
  and name !~ '(^/|//|(^|/)\.\.?(/|$))'
  and split_part(name, '/', 1) <> ''
  and split_part(name, '/', 2) <> ''
  and split_part(name, '/', 3) ~ '^[A-Z0-9_-]+_(selfie|selfie_2|passport_scan|pdf)\.(jpg|png|webp|pdf)$'
  and split_part(name, '/', 4) = ''
  and (
    (
      split_part(name, '/', 3) ~ '^[A-Z0-9_-]+_(selfie|selfie_2)\.(jpg|png|webp)$'
      and coalesce(metadata ->> 'mimetype', '') in ('image/jpeg', 'image/png', 'image/webp')
    )
    or (
      split_part(name, '/', 3) ~ '^[A-Z0-9_-]+_passport_scan\.(jpg|png|webp)$'
      and coalesce(metadata ->> 'mimetype', '') in ('image/jpeg', 'image/png', 'image/webp')
    )
    or (
      split_part(name, '/', 3) ~ '^[A-Z0-9_-]+_(passport_scan|pdf)\.pdf$'
      and coalesce(metadata ->> 'mimetype', '') = 'application/pdf'
    )
  )
  and exists (
    select 1
    from public.applicants a
    join public.submissions s on s.id = a.submission_id
    where a.id = split_part(name, '/', 2)
      and a.submission_id = split_part(name, '/', 1)
      and s.agent_id = (select auth.uid())
  )
);

create policy "submission files storage update owner agent"
on storage.objects for update
to authenticated
using (
  bucket_id = 'submission-files'
  and (select app_private.current_profile_role()) = 'agent'
  and exists (
    select 1
    from public.applicants a
    join public.submissions s on s.id = a.submission_id
    where a.id = split_part(name, '/', 2)
      and a.submission_id = split_part(name, '/', 1)
      and s.agent_id = (select auth.uid())
  )
)
with check (
  bucket_id = 'submission-files'
  and (select app_private.current_profile_role()) = 'agent'
  and name !~ '(^/|//|(^|/)\.\.?(/|$))'
  and split_part(name, '/', 1) <> ''
  and split_part(name, '/', 2) <> ''
  and split_part(name, '/', 3) ~ '^[A-Z0-9_-]+_(selfie|selfie_2|passport_scan|pdf)\.(jpg|png|webp|pdf)$'
  and split_part(name, '/', 4) = ''
  and exists (
    select 1
    from public.applicants a
    join public.submissions s on s.id = a.submission_id
    where a.id = split_part(name, '/', 2)
      and a.submission_id = split_part(name, '/', 1)
      and s.agent_id = (select auth.uid())
  )
);

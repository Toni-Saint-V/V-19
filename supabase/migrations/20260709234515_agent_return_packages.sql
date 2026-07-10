-- A city export is routed back to agents by the immutable owner snapshot captured
-- when the batch is created.  It deliberately keeps families together at the
-- submission boundary while letting the admin attach one final form per person.

create table if not exists public.export_batch_members (
  export_batch_id uuid not null references public.export_batches(id) on delete cascade,
  submission_id text not null references public.submissions(id) on delete restrict,
  applicant_id text not null references public.applicants(id) on delete restrict,
  source_agent_id uuid not null references public.profiles(id),
  source_agent_display_name text not null check (btrim(source_agent_display_name) <> ''),
  city text not null check (btrim(city) <> ''),
  submission_type text not null check (submission_type in ('single', 'family')),
  family_submission_id text,
  submission_title text not null check (btrim(submission_title) <> ''),
  applicant_name text not null check (btrim(applicant_name) <> ''),
  submission_order integer not null check (submission_order > 0),
  applicant_order integer not null check (applicant_order > 0),
  created_at timestamptz not null default now(),
  primary key (export_batch_id, applicant_id),
  check (
    (submission_type = 'family' and family_submission_id = submission_id)
    or (submission_type = 'single' and family_submission_id is null)
  )
);

create index if not exists export_batch_members_agent_idx
  on public.export_batch_members (export_batch_id, source_agent_id, city);

create index if not exists export_batch_members_submission_idx
  on public.export_batch_members (submission_id, applicant_id);

create or replace function app_private.snapshot_export_batch_members(
  target_export_batch_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  batch_record public.export_batches%rowtype;
  expected_submission_count integer := 0;
  actual_submission_count integer := 0;
  expected_applicant_count integer := 0;
  member_count integer := 0;
begin
  select *
  into batch_record
  from public.export_batches
  where id = target_export_batch_id;

  if batch_record.id is null then
    raise exception 'Export batch was not found';
  end if;

  expected_submission_count := coalesce(array_length(batch_record.submission_ids, 1), 0);

  if expected_submission_count = 0 then
    raise exception 'Export batch has no submissions';
  end if;

  select count(*)
  into actual_submission_count
  from public.submissions s
  where s.id = any(batch_record.submission_ids);

  if actual_submission_count <> expected_submission_count then
    raise exception 'Export batch membership does not match submissions';
  end if;

  if exists (
    select 1
    from public.submissions s
    where s.id = any(batch_record.submission_ids)
      and not exists (
        select 1
        from public.applicants a
        where a.submission_id = s.id
      )
  ) then
    raise exception 'Export batch contains a submission without tourists';
  end if;

  if (
    select count(distinct s.city)
    from public.submissions s
    where s.id = any(batch_record.submission_ids)
  ) <> 1 then
    raise exception 'Export batch members must belong to one city';
  end if;

  select count(*)
  into expected_applicant_count
  from public.applicants a
  where a.submission_id = any(batch_record.submission_ids);

  if expected_applicant_count = 0 then
    raise exception 'Export batch has no applicants';
  end if;

  insert into public.export_batch_members (
    export_batch_id,
    submission_id,
    applicant_id,
    source_agent_id,
    source_agent_display_name,
    city,
    submission_type,
    family_submission_id,
    submission_title,
    applicant_name,
    submission_order,
    applicant_order
  )
  with selected_submissions as (
    select
      s.id,
      s.agent_id,
      s.city,
      s.type,
      s.title,
      row_number() over (
        order by
          case when s.type = 'family' then 0 else 1 end,
          coalesce(s.trip_date_from, ''),
          coalesce(s.trip_date_to, ''),
          s.title,
          s.id
      )::integer as submission_order
    from public.submissions s
    where s.id = any(batch_record.submission_ids)
  ),
  selected_applicants as (
    select
      a.id,
      a.submission_id,
      a.full_name,
      row_number() over (
        partition by a.submission_id
        order by a.created_at, a.id
      )::integer as applicant_order
    from public.applicants a
    where a.submission_id = any(batch_record.submission_ids)
  )
  select
    batch_record.id,
    s.id,
    a.id,
    s.agent_id,
    profile.display_name,
    s.city,
    s.type,
    case when s.type = 'family' then s.id else null end,
    s.title,
    a.full_name,
    s.submission_order,
    a.applicant_order
  from selected_submissions s
  join selected_applicants a on a.submission_id = s.id
  join public.profiles profile on profile.id = s.agent_id
  on conflict (export_batch_id, applicant_id) do nothing;

  select count(*)
  into member_count
  from public.export_batch_members
  where export_batch_id = batch_record.id;

  if member_count <> expected_applicant_count then
    raise exception 'Export batch membership does not match applicants';
  end if;
end;
$$;

revoke all on function app_private.snapshot_export_batch_members(uuid) from public;

create or replace function app_private.capture_export_batch_members()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  perform app_private.snapshot_export_batch_members(new.id);
  return new;
end;
$$;

revoke all on function app_private.capture_export_batch_members() from public;

drop trigger if exists export_batch_members_snapshot on public.export_batches;
create trigger export_batch_members_snapshot
after insert on public.export_batches
for each row
execute function app_private.capture_export_batch_members();

-- Existing batches without an immutable member snapshot are intentionally not
-- reconstructed from mutable submissions/applicants/profile rows. They require
-- an explicit, operator-reviewed backfill before a return package can be opened.

create table if not exists public.agent_return_packages (
  id uuid primary key default gen_random_uuid(),
  export_batch_id uuid not null references public.export_batches(id) on delete restrict,
  agent_id uuid not null references public.profiles(id),
  city text not null check (btrim(city) <> ''),
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  published_by uuid references public.profiles(id),
  published_at timestamptz,
  unique (export_batch_id, agent_id),
  check (
    (status = 'draft' and published_by is null and published_at is null)
    or (status = 'published' and published_by is not null and published_at is not null)
  )
);

create index if not exists agent_return_packages_agent_idx
  on public.agent_return_packages (agent_id, status, created_at desc);

create table if not exists public.agent_return_package_artifacts (
  id uuid primary key default gen_random_uuid(),
  return_package_id uuid not null references public.agent_return_packages(id) on delete cascade,
  applicant_id text references public.applicants(id) on delete restrict,
  applicant_name text,
  artifact_kind text not null check (artifact_kind in ('agent_list_pdf', 'visa_application_pdf')),
  storage_bucket text not null default 'agent-return-packages'
    check (storage_bucket = 'agent-return-packages'),
  storage_path text not null check (
    btrim(storage_path) <> '' and storage_path !~ '(^/|//|\\.\\.)'
  ),
  file_name text not null check (file_name ~ '^[A-Za-z0-9._-]+\\.pdf$'),
  sha256 text not null check (sha256 ~ '^[a-fA-F0-9]{64}$'),
  size_bytes bigint not null check (size_bytes > 0),
  uploaded_by uuid not null references public.profiles(id),
  uploaded_at timestamptz not null default now(),
  check (
    (artifact_kind = 'agent_list_pdf' and applicant_id is null and applicant_name is null)
    or (
      artifact_kind = 'visa_application_pdf'
      and applicant_id is not null
      and applicant_name is not null
      and btrim(applicant_name) <> ''
    )
  )
);

create unique index if not exists agent_return_package_artifacts_slot_uidx
  on public.agent_return_package_artifacts (
    return_package_id,
    artifact_kind,
    coalesce(applicant_id, 'common')
  );

create unique index if not exists agent_return_package_artifacts_storage_uidx
  on public.agent_return_package_artifacts (storage_bucket, storage_path);

create index if not exists agent_return_package_artifacts_package_idx
  on public.agent_return_package_artifacts (return_package_id, artifact_kind);

create or replace function app_private.assert_agent_return_package_publishable(
  target_return_package_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  package_record public.agent_return_packages%rowtype;
  expected_count integer := 0;
  actual_form_count integer := 0;
  list_count integer := 0;
  artifact_record record;
  storage_metadata jsonb;
  stored_size bigint;
begin
  select *
  into package_record
  from public.agent_return_packages
  where id = target_return_package_id;

  if package_record.id is null or package_record.status <> 'draft' then
    raise exception 'Return package is not ready to publish';
  end if;

  select count(*)
  into expected_count
  from public.export_batch_members
  where export_batch_id = package_record.export_batch_id
    and source_agent_id = package_record.agent_id;

  select count(*)
  into actual_form_count
  from public.agent_return_package_artifacts artifact
  where artifact.return_package_id = package_record.id
    and artifact.artifact_kind = 'visa_application_pdf';

  select count(*)
  into list_count
  from public.agent_return_package_artifacts artifact
  where artifact.return_package_id = package_record.id
    and artifact.artifact_kind = 'agent_list_pdf';

  if expected_count = 0 or actual_form_count <> expected_count or list_count <> 1 then
    raise exception 'Return package requires one list and one form per tourist';
  end if;

  if exists (
    select 1
    from storage.objects object
    where object.bucket_id = 'agent-return-packages'
      and object.name like 'return-packages/' || package_record.id::text || '/%'
      and not exists (
        select 1
        from public.agent_return_package_artifacts artifact
        where artifact.storage_bucket = object.bucket_id
          and artifact.storage_path = object.name
      )
  ) then
    raise exception 'Return package has an unlinked storage object';
  end if;

  for artifact_record in
    select artifact.storage_bucket, artifact.storage_path, artifact.size_bytes
    from public.agent_return_package_artifacts artifact
    where artifact.return_package_id = package_record.id
  loop
    select
      object.metadata,
      case
        when coalesce(object.metadata ->> 'size', '') ~ '^[0-9]+$'
          then (object.metadata ->> 'size')::bigint
        else null
      end
    into storage_metadata, stored_size
    from storage.objects object
    where object.bucket_id = artifact_record.storage_bucket
      and object.name = artifact_record.storage_path
    for update;

    if not found then
      raise exception 'A return package file is missing from storage';
    end if;

    if coalesce(storage_metadata ->> 'mimetype', '') <> 'application/pdf'
      or stored_size is distinct from artifact_record.size_bytes then
      raise exception 'A return package file does not match its stored PDF metadata';
    end if;
  end loop;
end;
$$;

revoke all on function app_private.assert_agent_return_package_publishable(uuid) from public;

create or replace function app_private.validate_agent_return_package()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  expected_city text;
  member_count integer := 0;
begin
  if auth.uid() is null or app_private.current_profile_role() <> 'admin' then
    raise exception 'Only admins can create return packages'
      using errcode = '42501';
  end if;

  select min(city), count(*)
  into expected_city, member_count
  from public.export_batch_members
  where export_batch_id = new.export_batch_id
    and source_agent_id = new.agent_id;

  if member_count = 0 or expected_city is distinct from new.city then
    raise exception 'Return package does not match frozen export membership';
  end if;

  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
  else
    if new.export_batch_id is distinct from old.export_batch_id
      or new.agent_id is distinct from old.agent_id
      or new.city is distinct from old.city then
      raise exception 'Return package identity is immutable';
    end if;

    new.created_by := old.created_by;
    new.created_at := old.created_at;
    if old.status = 'published' then
      raise exception 'Published return packages are immutable';
    end if;
  end if;

  if new.status = 'published' then
    perform app_private.assert_agent_return_package_publishable(new.id);
  end if;

  if new.status = 'draft' then
    new.published_by := null;
    new.published_at := null;
  end if;

  return new;
end;
$$;

revoke all on function app_private.validate_agent_return_package() from public;

drop trigger if exists agent_return_packages_validate on public.agent_return_packages;
create trigger agent_return_packages_validate
before insert or update on public.agent_return_packages
for each row
execute function app_private.validate_agent_return_package();

create or replace function app_private.validate_agent_return_package_artifact()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  package_record public.agent_return_packages%rowtype;
  expected_file_name text;
  expected_path text;
  expected_applicant_name text;
begin
  if auth.uid() is null or app_private.current_profile_role() <> 'admin' then
    raise exception 'Only admins can upload return package artifacts'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE'
    and (
      new.return_package_id is distinct from old.return_package_id
      or new.artifact_kind is distinct from old.artifact_kind
      or new.applicant_id is distinct from old.applicant_id
    ) then
    raise exception 'Return package artifact identity is immutable';
  end if;

  select *
  into package_record
  from public.agent_return_packages
  where id = new.return_package_id
  for update;

  if package_record.id is null or package_record.status <> 'draft' then
    raise exception 'Return package is not editable';
  end if;

  if new.artifact_kind = 'agent_list_pdf' then
    expected_file_name := 'agent_list.pdf';
    expected_path := 'return-packages/' || package_record.id::text || '/list/' || expected_file_name;
  else
    select member.applicant_name
    into expected_applicant_name
    from public.export_batch_members member
    where member.export_batch_id = package_record.export_batch_id
      and member.source_agent_id = package_record.agent_id
      and member.applicant_id = new.applicant_id;

    if expected_applicant_name is null then
      raise exception 'Applicant is not assigned to this return package';
    end if;

    expected_file_name := 'visa_application.pdf';
    expected_path :=
      'return-packages/' || package_record.id::text || '/applicants/' ||
      new.applicant_id || '/' || expected_file_name;
    new.applicant_name := expected_applicant_name;
  end if;

  if new.artifact_kind = 'agent_list_pdf' then
    new.applicant_name := null;
  end if;

  if new.file_name <> expected_file_name or new.storage_path <> expected_path then
    raise exception 'Return package artifact does not match its canonical storage identity';
  end if;

  new.uploaded_by := auth.uid();
  new.uploaded_at := now();

  return new;
end;
$$;

revoke all on function app_private.validate_agent_return_package_artifact() from public;

comment on column public.agent_return_package_artifacts.sha256 is
  'Client-provided audit checksum. Publication verifies storage MIME type and byte size, not a server-side rehash.';

drop trigger if exists agent_return_package_artifacts_validate
  on public.agent_return_package_artifacts;
create trigger agent_return_package_artifacts_validate
before insert or update on public.agent_return_package_artifacts
for each row
execute function app_private.validate_agent_return_package_artifact();

alter table public.export_batch_members enable row level security;
alter table public.agent_return_packages enable row level security;
alter table public.agent_return_package_artifacts enable row level security;

drop policy if exists "export batch members admin read" on public.export_batch_members;
create policy "export batch members admin read"
on public.export_batch_members for select
to authenticated
using ((select app_private.current_profile_role()) = 'admin');

drop policy if exists "agent return packages select owner or admin"
  on public.agent_return_packages;
create policy "agent return packages select owner or admin"
on public.agent_return_packages for select
to authenticated
using (
  (select app_private.current_profile_role()) = 'admin'
  or (status = 'published' and agent_id = (select auth.uid()))
);

drop policy if exists "agent return packages admin insert"
  on public.agent_return_packages;
create policy "agent return packages admin insert"
on public.agent_return_packages for insert
to authenticated
with check ((select app_private.current_profile_role()) = 'admin');

drop policy if exists "agent return packages admin update"
  on public.agent_return_packages;
create policy "agent return packages admin update"
on public.agent_return_packages for update
to authenticated
using (
  (select app_private.current_profile_role()) = 'admin'
)
with check ((select app_private.current_profile_role()) = 'admin');

drop policy if exists "agent return package artifacts select owner or admin"
  on public.agent_return_package_artifacts;
create policy "agent return package artifacts select owner or admin"
on public.agent_return_package_artifacts for select
to authenticated
using (
  (select app_private.current_profile_role()) = 'admin'
  or exists (
    select 1
    from public.agent_return_packages package
    where package.id = agent_return_package_artifacts.return_package_id
      and package.status = 'published'
      and package.agent_id = (select auth.uid())
  )
);

drop policy if exists "agent return package artifacts admin insert"
  on public.agent_return_package_artifacts;
create policy "agent return package artifacts admin insert"
on public.agent_return_package_artifacts for insert
to authenticated
with check ((select app_private.current_profile_role()) = 'admin');

drop policy if exists "agent return package artifacts admin update"
  on public.agent_return_package_artifacts;
create policy "agent return package artifacts admin update"
on public.agent_return_package_artifacts for update
to authenticated
using (
  (select app_private.current_profile_role()) = 'admin'
  and exists (
    select 1
    from public.agent_return_packages package
    where package.id = agent_return_package_artifacts.return_package_id
      and package.status = 'draft'
  )
)
with check ((select app_private.current_profile_role()) = 'admin');

drop policy if exists "agent return package artifacts admin delete"
  on public.agent_return_package_artifacts;
create policy "agent return package artifacts admin delete"
on public.agent_return_package_artifacts for delete
to authenticated
using (
  (select app_private.current_profile_role()) = 'admin'
  and exists (
    select 1
    from public.agent_return_packages package
    where package.id = agent_return_package_artifacts.return_package_id
      and package.status = 'draft'
  )
);

revoke all on public.export_batch_members from anon;
revoke all on public.agent_return_packages from anon;
revoke all on public.agent_return_package_artifacts from anon;
grant select on public.export_batch_members to authenticated;
grant select, insert, update on public.agent_return_packages to authenticated;
grant select, insert, update, delete on public.agent_return_package_artifacts to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'agent-return-packages',
  'agent-return-packages',
  false,
  52428800,
  array['application/pdf']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function app_private.is_draft_agent_return_package_storage_path(
  target_bucket_id text,
  target_name text
)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, public, app_private
as $$
  select
    target_bucket_id = 'agent-return-packages'
    and exists (
      select 1
      from public.agent_return_packages package
      where package.id::text = split_part(target_name, '/', 2)
        and package.status = 'draft'
        and split_part(target_name, '/', 1) = 'return-packages'
        and (
          (
            split_part(target_name, '/', 3) = 'list'
            and split_part(target_name, '/', 4) = 'agent_list.pdf'
            and split_part(target_name, '/', 5) = ''
          )
          or (
            split_part(target_name, '/', 3) = 'applicants'
            and split_part(target_name, '/', 4) <> ''
            and split_part(target_name, '/', 5) = 'visa_application.pdf'
            and split_part(target_name, '/', 6) = ''
            and exists (
              select 1
              from public.export_batch_members member
              where member.export_batch_id = package.export_batch_id
                and member.source_agent_id = package.agent_id
                and member.applicant_id = split_part(target_name, '/', 4)
            )
          )
        )
    );
$$;

revoke all on function app_private.is_draft_agent_return_package_storage_path(text, text) from public;
grant execute on function app_private.is_draft_agent_return_package_storage_path(text, text) to authenticated;

create or replace function app_private.is_draft_agent_return_package_artifact_storage_path(
  target_bucket_id text,
  target_name text
)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, public, app_private
as $$
  select
    app_private.is_draft_agent_return_package_storage_path(target_bucket_id, target_name)
    and exists (
      select 1
      from public.agent_return_package_artifacts artifact
      where artifact.storage_bucket = target_bucket_id
        and artifact.storage_path = target_name
    );
$$;

revoke all on function app_private.is_draft_agent_return_package_artifact_storage_path(text, text) from public;
grant execute on function app_private.is_draft_agent_return_package_artifact_storage_path(text, text) to authenticated;

drop policy if exists "agent return package storage read" on storage.objects;
create policy "agent return package storage read"
on storage.objects for select
to authenticated
using (
  bucket_id = 'agent-return-packages'
  and (
    (select app_private.current_profile_role()) = 'admin'
    or exists (
      select 1
      from public.agent_return_package_artifacts artifact
      join public.agent_return_packages package
        on package.id = artifact.return_package_id
      where artifact.storage_bucket = bucket_id
        and artifact.storage_path = name
        and package.status = 'published'
        and package.agent_id = (select auth.uid())
    )
  )
);

drop policy if exists "agent return package storage insert" on storage.objects;
create policy "agent return package storage insert"
on storage.objects for insert
to authenticated
with check (
  (select app_private.current_profile_role()) = 'admin'
  and (select app_private.is_draft_agent_return_package_artifact_storage_path(bucket_id, name))
);

drop policy if exists "agent return package storage update" on storage.objects;
create policy "agent return package storage update"
on storage.objects for update
to authenticated
using (
  (select app_private.current_profile_role()) = 'admin'
  and (select app_private.is_draft_agent_return_package_artifact_storage_path(bucket_id, name))
)
with check (
  (select app_private.current_profile_role()) = 'admin'
  and (select app_private.is_draft_agent_return_package_artifact_storage_path(bucket_id, name))
);

drop policy if exists "agent return package storage delete" on storage.objects;
create policy "agent return package storage delete"
on storage.objects for delete
to authenticated
using (
  (select app_private.current_profile_role()) = 'admin'
  and (select app_private.is_draft_agent_return_package_storage_path(bucket_id, name))
);

create or replace function public.start_agent_return_package(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, app_private
as $$
declare
  actor_role public.profile_role := app_private.current_profile_role();
  export_package_key text := btrim(coalesce(payload ->> 'exportPackageKey', ''));
  target_agent_id uuid;
  batch_record public.export_batches%rowtype;
  package_record public.agent_return_packages%rowtype;
  expected_city text;
  expected_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authenticated user required to start a return package'
      using errcode = '28000';
  end if;

  if actor_role <> 'admin' then
    raise exception 'Only admins can start return packages'
      using errcode = '42501';
  end if;

  if export_package_key = '' then
    raise exception 'Export package key is required';
  end if;

  begin
    target_agent_id := (payload ->> 'agentId')::uuid;
  exception when invalid_text_representation then
    raise exception 'Agent id is invalid';
  end;

  select *
  into batch_record
  from public.export_batches
  where idempotency_key = export_package_key
  for update;

  if batch_record.id is null then
    raise exception 'Export package was not found';
  end if;

  if exists (
    select 1
    from public.export_batch_members member
    join public.submissions submission
      on submission.id = member.submission_id
    where member.export_batch_id = batch_record.id
      and member.source_agent_id = target_agent_id
      and submission.status is distinct from 'exported'
  ) then
    raise exception 'Export source is not fully exported for this agent';
  end if;

  select min(member.city), count(*)
  into expected_city, expected_count
  from public.export_batch_members member
  where member.export_batch_id = batch_record.id
    and member.source_agent_id = target_agent_id;

  if expected_count = 0 then
    raise exception 'No exported tourists are assigned to this agent in the export package';
  end if;

  select *
  into package_record
  from public.agent_return_packages
  where export_batch_id = batch_record.id
    and agent_id = target_agent_id
  for update;

  if package_record.id is null then
    insert into public.agent_return_packages (
      export_batch_id,
      agent_id,
      city,
      status,
      created_by
    )
    values (
      batch_record.id,
      target_agent_id,
      expected_city,
      'draft',
      auth.uid()
    )
    on conflict (export_batch_id, agent_id) do nothing
    returning * into package_record;

    if package_record.id is null then
      select *
      into package_record
      from public.agent_return_packages
      where export_batch_id = batch_record.id
        and agent_id = target_agent_id
      for update;
    end if;
  end if;

  return jsonb_build_object(
    'id', package_record.id,
    'exportBatchId', package_record.export_batch_id,
    'agentId', package_record.agent_id,
    'city', package_record.city,
    'status', package_record.status,
    'applicantCount', expected_count
  );
end;
$$;

create or replace function public.publish_agent_return_package(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, app_private
as $$
declare
  actor_role public.profile_role := app_private.current_profile_role();
  target_package_id uuid;
  package_record public.agent_return_packages%rowtype;
  expected_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authenticated user required to publish a return package'
      using errcode = '28000';
  end if;

  if actor_role <> 'admin' then
    raise exception 'Only admins can publish return packages'
      using errcode = '42501';
  end if;

  begin
    target_package_id := (payload ->> 'returnPackageId')::uuid;
  exception when invalid_text_representation then
    raise exception 'Return package id is invalid';
  end;

  select *
  into package_record
  from public.agent_return_packages
  where id = target_package_id
  for update;

  if package_record.id is null then
    raise exception 'Return package was not found';
  end if;

  select count(*)
  into expected_count
  from public.export_batch_members
  where export_batch_id = package_record.export_batch_id
    and source_agent_id = package_record.agent_id;

  if package_record.status = 'published' then
    return jsonb_build_object(
      'id', package_record.id,
      'status', package_record.status,
      'artifactCount', expected_count + 1,
      'duplicate', true
    );
  end if;

  update public.agent_return_packages
  set
    status = 'published',
    published_by = auth.uid(),
    published_at = now()
  where id = package_record.id
  returning * into package_record;

  return jsonb_build_object(
    'id', package_record.id,
    'status', package_record.status,
    'artifactCount', expected_count + 1,
    'duplicate', false
  );
end;
$$;

revoke all on function public.start_agent_return_package(jsonb) from public, anon;
revoke all on function public.publish_agent_return_package(jsonb) from public, anon;
grant execute on function public.start_agent_return_package(jsonb) to authenticated;
grant execute on function public.publish_agent_return_package(jsonb) to authenticated;

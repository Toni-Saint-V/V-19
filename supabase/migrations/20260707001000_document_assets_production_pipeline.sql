create table if not exists public.document_assets (
  id uuid primary key default gen_random_uuid(),
  source_media_asset_id text unique references public.media_assets (id) on delete cascade,
  submission_id text not null references public.submissions (id) on delete cascade,
  applicant_id text not null references public.applicants (id) on delete cascade,
  owner_user_id uuid references public.profiles (id),
  type text not null check (type in ('passport_scan', 'selfie_1', 'selfie_2')),
  bucket text not null default 'submission-media' check (bucket = 'submission-media'),
  storage_path text not null,
  filename text,
  upload_status text not null default 'pending' check (upload_status in ('pending', 'uploaded', 'failed')),
  validation_status text not null default 'pending' check (validation_status in ('pending', 'passed', 'failed')),
  export_status text not null default 'not_ready' check (export_status in ('not_ready', 'ready', 'exported')),
  mime text,
  size bigint,
  checksum text,
  uploaded_at timestamptz,
  validated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(storage_path)) > 0),
  check (filename is null or length(trim(filename)) > 0),
  check (size is null or size > 0),
  check (storage_path !~ '(^/|//|\.\.)')
);

create unique index if not exists document_assets_unique_file
on public.document_assets (submission_id, applicant_id, type);

create index if not exists document_assets_submission_export_idx
on public.document_assets (submission_id, validation_status, export_status);

create index if not exists document_assets_owner_idx
on public.document_assets (owner_user_id, created_at desc);

create table if not exists public.document_export_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('DOCUMENT_EXPORT_CREATED')),
  submission_ids text[] not null,
  asset_ids uuid[] not null,
  zip_file_name text not null,
  file_count integer not null check (file_count >= 0),
  package_identity_key text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  check (array_length(submission_ids, 1) is not null),
  check (zip_file_name !~ '(^/|/|\.\.)')
);

create index if not exists document_export_events_created_at_idx
on public.document_export_events (created_at desc);

create or replace function app_private.normalize_document_asset_type(media_type text)
returns text
language sql
immutable
as $$
  select case media_type
    when 'passport_scan' then 'passport_scan'
    when 'selfie' then 'selfie_1'
    when 'selfie_1' then 'selfie_1'
    when 'selfie_2' then 'selfie_2'
    else null
  end
$$;

create or replace function app_private.document_asset_storage_path_valid(
  submission_id text,
  applicant_id text,
  document_type text,
  storage_path text,
  filename text
)
returns boolean
language sql
immutable
as $$
  select
    storage_path !~ '(^/|//|\.\.)'
    and split_part(storage_path, '/', 1) = 'submissions'
    and split_part(storage_path, '/', 2) = submission_id
    and split_part(storage_path, '/', 3) = 'applicants'
    and split_part(storage_path, '/', 4) = applicant_id
    and (
      split_part(storage_path, '/', 5) = document_type
      or (document_type = 'selfie_1' and split_part(storage_path, '/', 5) = 'selfie')
    )
    and split_part(storage_path, '/', 6) <> ''
    and split_part(storage_path, '/', 7) = ''
    and (
      filename is null
      or split_part(storage_path, '/', 6) = filename
    )
$$;

create or replace function app_private.touch_document_asset_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists document_assets_touch_updated_at on public.document_assets;
create trigger document_assets_touch_updated_at
before update on public.document_assets
for each row execute function app_private.touch_document_asset_updated_at();

create or replace function app_private.sync_document_asset_from_media_asset()
returns trigger
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  document_type text;
  owner_id uuid;
  path_valid boolean;
  next_validation_status text;
  next_export_status text;
begin
  document_type := app_private.normalize_document_asset_type(new.type::text);

  if document_type is null then
    delete from public.document_assets where source_media_asset_id = new.id;
    return new;
  end if;

  select s.agent_id into owner_id
  from public.submissions s
  where s.id = new.submission_id;

  path_valid := app_private.document_asset_storage_path_valid(
    new.submission_id,
    new.applicant_id,
    document_type,
    new.storage_path,
    new.generated_file_name
  );

  if new.upload_status = 'uploaded'
     and new.storage_bucket = 'submission-media'
     and path_valid
     and new.review_status = 'accepted' then
    next_validation_status := 'passed';
    next_export_status := 'ready';
  elsif new.review_status in ('replace_required', 'poor_quality') then
    next_validation_status := 'failed';
    next_export_status := 'not_ready';
  else
    next_validation_status := 'pending';
    next_export_status := 'not_ready';
  end if;

  insert into public.document_assets (
    source_media_asset_id,
    submission_id,
    applicant_id,
    owner_user_id,
    type,
    bucket,
    storage_path,
    filename,
    upload_status,
    validation_status,
    export_status,
    mime,
    size,
    uploaded_at,
    validated_at
  ) values (
    new.id,
    new.submission_id,
    new.applicant_id,
    owner_id,
    document_type,
    'submission-media',
    new.storage_path,
    new.generated_file_name,
    case when new.upload_status = 'uploaded' then 'uploaded' else 'pending' end,
    next_validation_status,
    next_export_status,
    new.mime_type,
    new.size_bytes,
    new.uploaded_at,
    case when next_validation_status = 'passed' then coalesce(new.reviewed_at, now()) else null end
  )
  on conflict (submission_id, applicant_id, type)
  do update set
    source_media_asset_id = excluded.source_media_asset_id,
    owner_user_id = excluded.owner_user_id,
    bucket = excluded.bucket,
    storage_path = excluded.storage_path,
    filename = excluded.filename,
    upload_status = excluded.upload_status,
    validation_status = excluded.validation_status,
    export_status = case
      when public.document_assets.export_status = 'exported' and excluded.export_status = 'ready'
        then 'exported'
      else excluded.export_status
    end,
    mime = excluded.mime,
    size = excluded.size,
    uploaded_at = excluded.uploaded_at,
    validated_at = excluded.validated_at;

  return new;
end;
$$;

drop trigger if exists media_assets_sync_document_asset on public.media_assets;
create trigger media_assets_sync_document_asset
after insert or update of
  applicant_id,
  submission_id,
  type,
  generated_file_name,
  storage_bucket,
  storage_path,
  mime_type,
  size_bytes,
  upload_status,
  review_status,
  uploaded_at,
  reviewed_at
on public.media_assets
for each row execute function app_private.sync_document_asset_from_media_asset();

insert into public.document_assets (
  source_media_asset_id,
  submission_id,
  applicant_id,
  owner_user_id,
  type,
  bucket,
  storage_path,
  filename,
  upload_status,
  validation_status,
  export_status,
  mime,
  size,
  uploaded_at,
  validated_at
)
select
  m.id,
  m.submission_id,
  m.applicant_id,
  s.agent_id,
  app_private.normalize_document_asset_type(m.type::text),
  'submission-media',
  m.storage_path,
  m.generated_file_name,
  case when m.upload_status = 'uploaded' then 'uploaded' else 'pending' end,
  case
    when m.upload_status = 'uploaded'
      and m.storage_bucket = 'submission-media'
      and m.review_status = 'accepted'
      and app_private.document_asset_storage_path_valid(
        m.submission_id,
        m.applicant_id,
        app_private.normalize_document_asset_type(m.type::text),
        m.storage_path,
        m.generated_file_name
      )
      then 'passed'
    when m.review_status in ('replace_required', 'poor_quality') then 'failed'
    else 'pending'
  end,
  case
    when m.upload_status = 'uploaded'
      and m.storage_bucket = 'submission-media'
      and m.review_status = 'accepted'
      and app_private.document_asset_storage_path_valid(
        m.submission_id,
        m.applicant_id,
        app_private.normalize_document_asset_type(m.type::text),
        m.storage_path,
        m.generated_file_name
      )
      then 'ready'
    else 'not_ready'
  end,
  m.mime_type,
  m.size_bytes,
  m.uploaded_at,
  case
    when m.review_status = 'accepted' then coalesce(m.reviewed_at, now())
    else null
  end
from public.media_assets m
join public.submissions s on s.id = m.submission_id
where app_private.normalize_document_asset_type(m.type::text) is not null
on conflict (submission_id, applicant_id, type)
do update set
  source_media_asset_id = excluded.source_media_asset_id,
  owner_user_id = excluded.owner_user_id,
  bucket = excluded.bucket,
  storage_path = excluded.storage_path,
  filename = excluded.filename,
  upload_status = excluded.upload_status,
  validation_status = excluded.validation_status,
  export_status = excluded.export_status,
  mime = excluded.mime,
  size = excluded.size,
  uploaded_at = excluded.uploaded_at,
  validated_at = excluded.validated_at;

alter table public.document_assets enable row level security;
alter table public.document_export_events enable row level security;

drop policy if exists "document assets read through submission" on public.document_assets;
create policy "document assets read through submission"
on public.document_assets for select
using (
  exists (
    select 1
    from public.submissions s
    where s.id = document_assets.submission_id
      and (
        s.agent_id = (select auth.uid())
        or (select app_private.current_profile_role()) = 'admin'
      )
  )
);

drop policy if exists "document assets write editable submission" on public.document_assets;
create policy "document assets write editable submission"
on public.document_assets for insert
with check (
  exists (
    select 1
    from public.submissions s
    where s.id = document_assets.submission_id
      and (
        (select app_private.current_profile_role()) = 'admin'
        or (
          s.agent_id = (select auth.uid())
          and s.status in ('draft', 'filling', 'returned', 'ready_for_review')
        )
      )
  )
);

drop policy if exists "document assets update through submission" on public.document_assets;
create policy "document assets update through submission"
on public.document_assets for update
using (
  exists (
    select 1
    from public.submissions s
    where s.id = document_assets.submission_id
      and (
        s.agent_id = (select auth.uid())
        or (select app_private.current_profile_role()) = 'admin'
      )
  )
)
with check (
  exists (
    select 1
    from public.submissions s
    where s.id = document_assets.submission_id
      and (
        s.agent_id = (select auth.uid())
        or (select app_private.current_profile_role()) = 'admin'
      )
  )
);

drop policy if exists "document export events admin only" on public.document_export_events;
create policy "document export events admin only"
on public.document_export_events for all
using ((select app_private.current_profile_role()) = 'admin')
with check ((select app_private.current_profile_role()) = 'admin');

grant select, insert, update on public.document_assets to authenticated;
grant select, insert on public.document_export_events to authenticated;

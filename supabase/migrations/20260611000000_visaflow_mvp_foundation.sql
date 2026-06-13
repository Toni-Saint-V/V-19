create extension if not exists pgcrypto;

create type public.profile_role as enum ('agent', 'admin');

create type public.submission_status as enum (
  'draft',
  'filling',
  'ready_for_review',
  'waiting_review',
  'in_review',
  'returned',
  'accepted',
  'ready_for_excel',
  'exported',
  'sent_to_appointment',
  'appointment_scheduled',
  'attention_required',
  'completed'
);

create type public.appointment_status as enum (
  'not_started',
  'sent_to_appointment',
  'appointment_scheduled',
  'attention_required',
  'completed'
);

create type public.media_slot_type as enum ('photo_white', 'selfie', 'video');
create type public.media_upload_status as enum ('none', 'uploaded');
create type public.media_review_status as enum (
  'not_reviewed',
  'accepted',
  'replace_required',
  'poor_quality'
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text not null,
  organization_name text,
  role public.profile_role not null default 'agent',
  created_at timestamptz not null default now()
);

create schema if not exists app_private;

revoke all on schema app_private from public;

create function app_private.current_profile_role()
returns public.profile_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create table public.submissions (
  id text primary key,
  agent_id uuid not null references public.profiles (id),
  type text not null check (type in ('single', 'family')),
  title text not null,
  country text not null,
  city text not null,
  travel_date text not null,
  status public.submission_status not null default 'draft',
  priority text not null check (priority in ('Высокий', 'Средний', 'Низкий')),
  readiness_percent integer not null default 0 check (readiness_percent between 0 and 100),
  family_intelligence jsonb,
  appointment_status public.appointment_status not null default 'not_started',
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  review_started_at timestamptz,
  accepted_at timestamptz,
  exported_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.applicants (
  id text primary key,
  submission_id text not null references public.submissions (id) on delete cascade,
  full_name text not null,
  role text not null,
  suggested_role text,
  role_confirmed boolean not null default false,
  birth_date date,
  patronymic text,
  citizenship text,
  address text,
  phone text,
  email text,
  passport_number text not null,
  passport_issued_at date,
  passport_expires_at date,
  country text not null,
  city text not null,
  trip_dates text not null,
  hotel_name text,
  hotel_address text,
  questionnaire_percent integer not null default 0 check (questionnaire_percent between 0 and 100),
  media_percent integer not null default 0 check (media_percent between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.media_assets (
  id text primary key,
  applicant_id text not null references public.applicants (id) on delete cascade,
  submission_id text not null references public.submissions (id) on delete cascade,
  type public.media_slot_type not null,
  original_file_name text,
  generated_file_name text,
  storage_bucket text not null default 'submission-media',
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  upload_status public.media_upload_status not null default 'none',
  review_status public.media_review_status not null default 'not_reviewed',
  uploaded_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id),
  unique (applicant_id, type),
  check (upload_status = 'none' or storage_path <> ''),
  check (generated_file_name is null or generated_file_name <> '')
);

create table public.corrections (
  id uuid primary key default gen_random_uuid(),
  submission_id text not null references public.submissions (id) on delete cascade,
  applicant_id text references public.applicants (id) on delete cascade,
  scope text not null check (scope in ('submission', 'applicant', 'field', 'media')),
  field_key text,
  media_type public.media_slot_type,
  reason text not null check (length(trim(reason)) > 0),
  severity text not null check (severity in ('blocking', 'note')),
  status text not null default 'open' check (status in ('open', 'fixed', 'closed')),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  fixed_at timestamptz,
  check (scope <> 'field' or (applicant_id is not null and field_key is not null)),
  check (scope <> 'media' or (applicant_id is not null and media_type is not null))
);

create table public.export_batches (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  format text not null check (format in ('xlsx', 'csv')),
  row_count integer not null check (row_count >= 0),
  submission_ids text[] not null
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  submission_id text not null references public.submissions (id) on delete cascade,
  status public.appointment_status not null default 'not_started',
  city text not null,
  date date,
  time text,
  operator_comment text not null default '',
  updated_by uuid not null references public.profiles (id),
  updated_at timestamptz not null default now()
);

create table public.status_history (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('submission', 'applicant', 'media', 'appointment')),
  entity_id text not null,
  from_status text,
  to_status text not null,
  comment text not null default '',
  changed_by uuid not null references public.profiles (id),
  changed_at timestamptz not null default now()
);

create index if not exists submissions_agent_id_idx on public.submissions (agent_id);
create index if not exists submissions_updated_at_idx on public.submissions (updated_at desc);
create index if not exists applicants_submission_id_idx on public.applicants (submission_id);
create index if not exists media_assets_submission_id_idx on public.media_assets (submission_id);
create index if not exists media_assets_reviewed_by_idx on public.media_assets (reviewed_by);
create index if not exists corrections_submission_id_idx on public.corrections (submission_id);
create index if not exists corrections_applicant_id_idx on public.corrections (applicant_id);
create index if not exists corrections_created_by_idx on public.corrections (created_by);
create index if not exists export_batches_created_by_idx on public.export_batches (created_by);
create index if not exists appointments_submission_id_idx on public.appointments (submission_id);
create index if not exists appointments_updated_by_idx on public.appointments (updated_by);
create index if not exists status_history_changed_by_idx on public.status_history (changed_by);
create index if not exists status_history_entity_id_idx on public.status_history (entity_id);

create function app_private.enforce_submission_agent_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  actor_role public.profile_role := app_private.current_profile_role();
begin
  if actor_role = 'admin' then
    return new;
  end if;

  if auth.uid() is null or new.agent_id <> auth.uid() then
    raise exception 'Cannot write submission for another agent'
      using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'filling', 'ready_for_review', 'waiting_review') then
      raise exception 'Agents cannot create submissions in review, export, or appointment states'
        using errcode = '42501';
    end if;

    if new.appointment_status <> 'not_started'
      or new.review_started_at is not null
      or new.accepted_at is not null
      or new.exported_at is not null
    then
      raise exception 'Agents cannot create review, export, or appointment state'
        using errcode = '42501';
    end if;

    return new;
  end if;

  if old.agent_id <> auth.uid() or new.agent_id <> old.agent_id then
    raise exception 'Agents cannot reassign submissions'
      using errcode = '42501';
  end if;

  if new.appointment_status is distinct from old.appointment_status
    or new.review_started_at is distinct from old.review_started_at
    or new.accepted_at is distinct from old.accepted_at
    or new.exported_at is distinct from old.exported_at
  then
    raise exception 'Agents cannot update review, export, or appointment state'
      using errcode = '42501';
  end if;

  if old.status = 'returned' then
    if new.status not in ('returned', 'ready_for_review', 'waiting_review') then
      raise exception 'Returned submissions can only stay returned, be marked ready, or be resubmitted'
        using errcode = '42501';
    end if;
  elsif old.status in ('draft', 'filling', 'ready_for_review') then
    if new.status not in ('draft', 'filling', 'ready_for_review', 'waiting_review') then
      raise exception 'Agents cannot advance submissions into review, export, or appointment states'
        using errcode = '42501';
    end if;
  else
    raise exception 'Agents cannot update submissions after handoff to operator review'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger submissions_agent_mutation_guard
before insert or update on public.submissions
for each row execute function app_private.enforce_submission_agent_mutation();

alter table public.profiles enable row level security;
alter table public.submissions enable row level security;
alter table public.applicants enable row level security;
alter table public.media_assets enable row level security;
alter table public.corrections enable row level security;
alter table public.export_batches enable row level security;
alter table public.appointments enable row level security;
alter table public.status_history enable row level security;

create policy "profiles read own or admin"
on public.profiles for select
using (id = (select auth.uid()) or (select app_private.current_profile_role()) = 'admin');

create policy "profiles insert own agent"
on public.profiles for insert
with check (id = (select auth.uid()) and role = 'agent');

create policy "profiles update own identity"
on public.profiles for update
using (id = (select auth.uid()))
with check (id = (select auth.uid()) and role = (select app_private.current_profile_role()));

create policy "submissions agent own admin all"
on public.submissions for all
using (agent_id = (select auth.uid()) or (select app_private.current_profile_role()) = 'admin')
with check (agent_id = (select auth.uid()) or (select app_private.current_profile_role()) = 'admin');

create policy "applicants through submission"
on public.applicants for all
using (
  exists (
    select 1 from public.submissions s
    where s.id = applicants.submission_id
    and (s.agent_id = (select auth.uid()) or (select app_private.current_profile_role()) = 'admin')
  )
)
with check (
  exists (
    select 1 from public.submissions s
    where s.id = applicants.submission_id
    and (s.agent_id = (select auth.uid()) or (select app_private.current_profile_role()) = 'admin')
  )
);

create policy "media through submission"
on public.media_assets for all
using (
  exists (
    select 1 from public.submissions s
    where s.id = media_assets.submission_id
    and (s.agent_id = (select auth.uid()) or (select app_private.current_profile_role()) = 'admin')
  )
)
with check (
  exists (
    select 1 from public.submissions s
    where s.id = media_assets.submission_id
    and (s.agent_id = (select auth.uid()) or (select app_private.current_profile_role()) = 'admin')
  )
);

create policy "corrections through submission"
on public.corrections for all
using (
  exists (
    select 1 from public.submissions s
    where s.id = corrections.submission_id
    and (s.agent_id = (select auth.uid()) or (select app_private.current_profile_role()) = 'admin')
  )
  and (
    corrections.applicant_id is null
    or exists (
      select 1 from public.applicants a
      where a.id = corrections.applicant_id
      and a.submission_id = corrections.submission_id
    )
  )
)
with check (
  exists (
    select 1 from public.submissions s
    where s.id = corrections.submission_id
    and (s.agent_id = (select auth.uid()) or (select app_private.current_profile_role()) = 'admin')
  )
  and (
    corrections.applicant_id is null
    or exists (
      select 1 from public.applicants a
      where a.id = corrections.applicant_id
      and a.submission_id = corrections.submission_id
    )
  )
);

create policy "export batches admin only"
on public.export_batches for all
using ((select app_private.current_profile_role()) = 'admin')
with check ((select app_private.current_profile_role()) = 'admin');

create policy "appointments admin only"
on public.appointments for all
using ((select app_private.current_profile_role()) = 'admin')
with check ((select app_private.current_profile_role()) = 'admin');

create policy "status history read visible"
on public.status_history for select
using (
  (select app_private.current_profile_role()) = 'admin'
  or entity_id in (
    select id from public.submissions where agent_id = (select auth.uid())
  )
  or entity_id in (
    select a.id
    from public.applicants a
    join public.submissions s on s.id = a.submission_id
    where s.agent_id = (select auth.uid())
  )
  or entity_id in (
    select m.id
    from public.media_assets m
    join public.submissions s on s.id = m.submission_id
    where s.agent_id = (select auth.uid())
  )
  or entity_id in (
    select ap.id::text
    from public.appointments ap
    join public.submissions s on s.id = ap.submission_id
    where s.agent_id = (select auth.uid())
  )
);

create policy "status history insert owned"
on public.status_history for insert
with check (
  (select app_private.current_profile_role()) = 'admin'
  or (
    changed_by = (select auth.uid())
    and (
      (
        entity_type = 'submission'
        and entity_id in (
        select id from public.submissions where agent_id = (select auth.uid())
        )
      )
      or (
        entity_type = 'applicant'
        and entity_id in (
        select a.id
        from public.applicants a
        join public.submissions s on s.id = a.submission_id
        where s.agent_id = (select auth.uid())
        )
      )
      or (
        entity_type = 'media'
        and entity_id in (
        select m.id
        from public.media_assets m
        join public.submissions s on s.id = m.submission_id
        where s.agent_id = (select auth.uid())
        )
      )
      or (
        entity_type = 'appointment'
        and entity_id in (
          select ap.id::text
          from public.appointments ap
          join public.submissions s on s.id = ap.submission_id
          where s.agent_id = (select auth.uid())
        )
      )
    )
  )
);

create or replace function public.save_submission_draft(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  submission_record record;
  applicant_count integer := 0;
  media_count integer := 0;
  status_history_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authenticated user required to save submission draft'
      using errcode = '28000';
  end if;

  select *
  into submission_record
  from jsonb_to_record(payload -> 'submission') as submission_payload (
    id text,
    agent_id uuid,
    type text,
    title text,
    country text,
    city text,
    travel_date text,
    status public.submission_status,
    priority text,
    readiness_percent integer,
    family_intelligence jsonb,
    appointment_status public.appointment_status,
    submitted_at timestamptz,
    review_started_at timestamptz,
    accepted_at timestamptz,
    exported_at timestamptz,
    updated_at timestamptz
  );

  if submission_record.id is null or submission_record.agent_id is null then
    raise exception 'Submission payload is required';
  end if;

  if submission_record.agent_id <> auth.uid() and app_private.current_profile_role() <> 'admin' then
    raise exception 'Cannot save submission for another agent'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(payload -> 'applicants', '[]'::jsonb)) as applicant_payload (
      submission_id text
    )
    where applicant_payload.submission_id <> submission_record.id
  ) then
    raise exception 'Applicant payload contains a mismatched submission id';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(payload -> 'media_assets', '[]'::jsonb)) as media_payload (
      applicant_id text,
      submission_id text,
      type public.media_slot_type,
      storage_bucket text,
      storage_path text
    )
    where media_payload.submission_id <> submission_record.id
       or media_payload.storage_bucket <> 'submission-media'
       or split_part(media_payload.storage_path, '/', 1) <> submission_record.id
       or split_part(media_payload.storage_path, '/', 2) <> media_payload.applicant_id
       or split_part(media_payload.storage_path, '/', 3) <> media_payload.type::text
       or split_part(media_payload.storage_path, '/', 5) <> ''
  ) then
    raise exception 'Media payload does not match the storage path contract';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(payload -> 'corrections', '[]'::jsonb)) as correction_payload (
      submission_id text
    )
    where correction_payload.submission_id is distinct from submission_record.id
  ) then
    raise exception 'Correction payload contains a mismatched submission id';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(payload -> 'corrections', '[]'::jsonb)) as correction_payload (
      submission_id text,
      applicant_id text
    )
    where correction_payload.applicant_id is not null
      and not exists (
        select 1
        from jsonb_to_recordset(coalesce(payload -> 'applicants', '[]'::jsonb)) as applicant_payload (
          id text,
          submission_id text
        )
        where applicant_payload.id = correction_payload.applicant_id
          and applicant_payload.submission_id = submission_record.id
      )
      and not exists (
        select 1
        from public.applicants a
        where a.id = correction_payload.applicant_id
          and a.submission_id = submission_record.id
      )
  ) then
    raise exception 'Correction payload contains an applicant outside the submission';
  end if;

  insert into public.submissions (
    id,
    agent_id,
    type,
    title,
    country,
    city,
    travel_date,
    status,
    priority,
    readiness_percent,
    family_intelligence,
    appointment_status,
    submitted_at,
    review_started_at,
    accepted_at,
    exported_at,
    updated_at
  )
  values (
    submission_record.id,
    submission_record.agent_id,
    submission_record.type,
    submission_record.title,
    submission_record.country,
    submission_record.city,
    submission_record.travel_date,
    submission_record.status,
    submission_record.priority,
    submission_record.readiness_percent,
    submission_record.family_intelligence,
    submission_record.appointment_status,
    submission_record.submitted_at,
    submission_record.review_started_at,
    submission_record.accepted_at,
    submission_record.exported_at,
    coalesce(submission_record.updated_at, now())
  )
  on conflict (id) do update set
    type = excluded.type,
    title = excluded.title,
    country = excluded.country,
    city = excluded.city,
    travel_date = excluded.travel_date,
    status = excluded.status,
    priority = excluded.priority,
    readiness_percent = excluded.readiness_percent,
    family_intelligence = excluded.family_intelligence,
    appointment_status = excluded.appointment_status,
    submitted_at = excluded.submitted_at,
    review_started_at = excluded.review_started_at,
    accepted_at = excluded.accepted_at,
    exported_at = excluded.exported_at,
    updated_at = excluded.updated_at;

  insert into public.applicants (
    id,
    submission_id,
    full_name,
    role,
    suggested_role,
    role_confirmed,
    birth_date,
    patronymic,
    citizenship,
    address,
    phone,
    email,
    passport_number,
    passport_issued_at,
    passport_expires_at,
    country,
    city,
    trip_dates,
    hotel_name,
    hotel_address,
    questionnaire_percent,
    media_percent,
    updated_at
  )
  select
    applicant_payload.id,
    applicant_payload.submission_id,
    applicant_payload.full_name,
    applicant_payload.role,
    applicant_payload.suggested_role,
    applicant_payload.role_confirmed,
    applicant_payload.birth_date,
    applicant_payload.patronymic,
    applicant_payload.citizenship,
    applicant_payload.address,
    applicant_payload.phone,
    applicant_payload.email,
    applicant_payload.passport_number,
    applicant_payload.passport_issued_at,
    applicant_payload.passport_expires_at,
    applicant_payload.country,
    applicant_payload.city,
    applicant_payload.trip_dates,
    applicant_payload.hotel_name,
    applicant_payload.hotel_address,
    applicant_payload.questionnaire_percent,
    applicant_payload.media_percent,
    now()
  from jsonb_to_recordset(coalesce(payload -> 'applicants', '[]'::jsonb)) as applicant_payload (
    id text,
    submission_id text,
    full_name text,
    role text,
    suggested_role text,
    role_confirmed boolean,
    birth_date date,
    patronymic text,
    citizenship text,
    address text,
    phone text,
    email text,
    passport_number text,
    passport_issued_at date,
    passport_expires_at date,
    country text,
    city text,
    trip_dates text,
    hotel_name text,
    hotel_address text,
    questionnaire_percent integer,
    media_percent integer
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    role = excluded.role,
    suggested_role = excluded.suggested_role,
    role_confirmed = excluded.role_confirmed,
    birth_date = excluded.birth_date,
    patronymic = excluded.patronymic,
    citizenship = excluded.citizenship,
    address = excluded.address,
    phone = excluded.phone,
    email = excluded.email,
    passport_number = excluded.passport_number,
    passport_issued_at = excluded.passport_issued_at,
    passport_expires_at = excluded.passport_expires_at,
    country = excluded.country,
    city = excluded.city,
    trip_dates = excluded.trip_dates,
    hotel_name = excluded.hotel_name,
    hotel_address = excluded.hotel_address,
    questionnaire_percent = excluded.questionnaire_percent,
    media_percent = excluded.media_percent,
    updated_at = excluded.updated_at;

  get diagnostics applicant_count = row_count;

  insert into public.media_assets (
    id,
    applicant_id,
    submission_id,
    type,
    original_file_name,
    generated_file_name,
    storage_bucket,
    storage_path,
    mime_type,
    size_bytes,
    upload_status,
    review_status,
    uploaded_at,
    reviewed_at,
    reviewed_by
  )
  select
    media_payload.id,
    media_payload.applicant_id,
    media_payload.submission_id,
    media_payload.type,
    media_payload.original_file_name,
    media_payload.generated_file_name,
    media_payload.storage_bucket,
    media_payload.storage_path,
    media_payload.mime_type,
    media_payload.size_bytes,
    media_payload.upload_status,
    media_payload.review_status,
    media_payload.uploaded_at,
    media_payload.reviewed_at,
    media_payload.reviewed_by
  from jsonb_to_recordset(coalesce(payload -> 'media_assets', '[]'::jsonb)) as media_payload (
    id text,
    applicant_id text,
    submission_id text,
    type public.media_slot_type,
    original_file_name text,
    generated_file_name text,
    storage_bucket text,
    storage_path text,
    mime_type text,
    size_bytes bigint,
    upload_status public.media_upload_status,
    review_status public.media_review_status,
    uploaded_at timestamptz,
    reviewed_at timestamptz,
    reviewed_by uuid
  )
  on conflict (applicant_id, type) do update set
    id = excluded.id,
    submission_id = excluded.submission_id,
    original_file_name = excluded.original_file_name,
    generated_file_name = excluded.generated_file_name,
    storage_bucket = excluded.storage_bucket,
    storage_path = excluded.storage_path,
    mime_type = excluded.mime_type,
    size_bytes = excluded.size_bytes,
    upload_status = excluded.upload_status,
    review_status = excluded.review_status,
    uploaded_at = excluded.uploaded_at,
    reviewed_at = excluded.reviewed_at,
    reviewed_by = excluded.reviewed_by;

  get diagnostics media_count = row_count;

  insert into public.corrections (
    id,
    submission_id,
    applicant_id,
    scope,
    field_key,
    media_type,
    reason,
    severity,
    status,
    created_by,
    created_at,
    fixed_at
  )
  select
    correction_payload.id,
    correction_payload.submission_id,
    correction_payload.applicant_id,
    correction_payload.scope,
    correction_payload.field_key,
    correction_payload.media_type,
    correction_payload.reason,
    correction_payload.severity,
    correction_payload.status,
    correction_payload.created_by,
    correction_payload.created_at,
    correction_payload.fixed_at
  from jsonb_to_recordset(coalesce(payload -> 'corrections', '[]'::jsonb)) as correction_payload (
    id uuid,
    submission_id text,
    applicant_id text,
    scope text,
    field_key text,
    media_type public.media_slot_type,
    reason text,
    severity text,
    status text,
    created_by uuid,
    created_at timestamptz,
    fixed_at timestamptz
  )
  on conflict (id) do update set
    applicant_id = excluded.applicant_id,
    scope = excluded.scope,
    field_key = excluded.field_key,
    media_type = excluded.media_type,
    reason = excluded.reason,
    severity = excluded.severity,
    status = excluded.status,
    fixed_at = excluded.fixed_at;

  insert into public.status_history (
    id,
    entity_type,
    entity_id,
    from_status,
    to_status,
    comment,
    changed_by,
    changed_at
  )
  select
    coalesce(status_payload.id, gen_random_uuid()),
    status_payload.entity_type,
    status_payload.entity_id,
    status_payload.from_status,
    status_payload.to_status,
    status_payload.comment,
    status_payload.changed_by,
    status_payload.changed_at
  from jsonb_to_recordset(coalesce(payload -> 'status_history', '[]'::jsonb)) as status_payload (
    id uuid,
    entity_type text,
    entity_id text,
    from_status text,
    to_status text,
    comment text,
    changed_by uuid,
    changed_at timestamptz
  )
  on conflict (id) do nothing;

  get diagnostics status_history_count = row_count;

  return jsonb_build_object(
    'submissionId', submission_record.id,
    'applicants', applicant_count,
    'mediaAssets', media_count,
    'statusHistory', status_history_count
  );
end;
$$;

grant usage on schema public to authenticated;
grant select, insert on public.profiles to authenticated;
grant update (email, display_name, organization_name) on public.profiles to authenticated;
grant select, insert, update on public.submissions to authenticated;
grant select, insert, update on public.applicants to authenticated;
grant select, insert, update on public.media_assets to authenticated;
grant select, insert, update on public.corrections to authenticated;
grant select, insert on public.status_history to authenticated;
grant select, insert, update on public.export_batches to authenticated;
grant select, insert, update on public.appointments to authenticated;
grant usage on schema app_private to authenticated;
revoke all on function app_private.current_profile_role() from public;
revoke all on function app_private.enforce_submission_agent_mutation() from public;
revoke all on function public.save_submission_draft(jsonb) from public;
grant execute on function app_private.current_profile_role() to authenticated;
grant execute on function public.save_submission_draft(jsonb) to authenticated;

insert into storage.buckets (id, name, public)
values ('submission-media', 'submission-media', false)
on conflict (id) do update set public = false;

create policy "media storage owner or admin"
on storage.objects for all
to authenticated
using (
  bucket_id = 'submission-media'
  and split_part(name, '/', 1) <> ''
  and split_part(name, '/', 2) <> ''
  and split_part(name, '/', 3) in ('photo_white', 'selfie', 'video')
  and split_part(name, '/', 4) <> ''
  and split_part(name, '/', 5) = ''
  and (
    (split_part(name, '/', 3) in ('photo_white', 'selfie') and storage.extension(name) in ('jpg', 'jpeg', 'png'))
    or (split_part(name, '/', 3) = 'video' and storage.extension(name) = 'mp4')
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
with check (
  bucket_id = 'submission-media'
  and split_part(name, '/', 1) <> ''
  and split_part(name, '/', 2) <> ''
  and split_part(name, '/', 3) in ('photo_white', 'selfie', 'video')
  and split_part(name, '/', 4) <> ''
  and split_part(name, '/', 5) = ''
  and (
    (split_part(name, '/', 3) in ('photo_white', 'selfie') and storage.extension(name) in ('jpg', 'jpeg', 'png'))
    or (split_part(name, '/', 3) = 'video' and storage.extension(name) = 'mp4')
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

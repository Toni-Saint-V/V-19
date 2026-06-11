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

create function public.current_profile_role()
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
using (id = auth.uid() or public.current_profile_role() = 'admin');

create policy "profiles insert own"
on public.profiles for insert
with check (id = auth.uid());

create policy "profiles update own"
on public.profiles for update
using (id = auth.uid())
with check (id = auth.uid());

create policy "submissions agent own admin all"
on public.submissions for all
using (agent_id = auth.uid() or public.current_profile_role() = 'admin')
with check (agent_id = auth.uid() or public.current_profile_role() = 'admin');

create policy "applicants through submission"
on public.applicants for all
using (
  exists (
    select 1 from public.submissions s
    where s.id = applicants.submission_id
    and (s.agent_id = auth.uid() or public.current_profile_role() = 'admin')
  )
)
with check (
  exists (
    select 1 from public.submissions s
    where s.id = applicants.submission_id
    and (s.agent_id = auth.uid() or public.current_profile_role() = 'admin')
  )
);

create policy "media through submission"
on public.media_assets for all
using (
  exists (
    select 1 from public.submissions s
    where s.id = media_assets.submission_id
    and (s.agent_id = auth.uid() or public.current_profile_role() = 'admin')
  )
)
with check (
  exists (
    select 1 from public.submissions s
    where s.id = media_assets.submission_id
    and (s.agent_id = auth.uid() or public.current_profile_role() = 'admin')
  )
);

create policy "corrections through submission"
on public.corrections for all
using (
  exists (
    select 1 from public.submissions s
    where s.id = corrections.submission_id
    and (s.agent_id = auth.uid() or public.current_profile_role() = 'admin')
  )
)
with check (
  exists (
    select 1 from public.submissions s
    where s.id = corrections.submission_id
    and (s.agent_id = auth.uid() or public.current_profile_role() = 'admin')
  )
);

create policy "export batches admin only"
on public.export_batches for all
using (public.current_profile_role() = 'admin')
with check (public.current_profile_role() = 'admin');

create policy "appointments admin only"
on public.appointments for all
using (public.current_profile_role() = 'admin')
with check (public.current_profile_role() = 'admin');

create policy "status history read visible"
on public.status_history for select
using (public.current_profile_role() = 'admin');

create policy "status history insert authenticated"
on public.status_history for insert
with check (changed_by = auth.uid() or public.current_profile_role() = 'admin');

insert into storage.buckets (id, name, public)
values ('submission-media', 'submission-media', false)
on conflict (id) do update set public = false;

create policy "media storage owner or admin"
on storage.objects for all
using (
  bucket_id = 'submission-media'
  and (
    public.current_profile_role() = 'admin'
    or split_part(name, '/', 1) in (
      select id from public.submissions where agent_id = auth.uid()
    )
  )
)
with check (
  bucket_id = 'submission-media'
  and (
    public.current_profile_role() = 'admin'
    or split_part(name, '/', 1) in (
      select id from public.submissions where agent_id = auth.uid()
    )
  )
);

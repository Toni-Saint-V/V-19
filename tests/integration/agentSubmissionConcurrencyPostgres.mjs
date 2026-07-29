import { readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import process from "node:process";

const image = process.argv[2];
if (!image) {
  throw new Error(
    "Usage: node tests/integration/agentSubmissionConcurrencyPostgres.mjs <local-postgres-image>",
  );
}

const containerName = `v19-agent-cas-${process.pid}-${Date.now()}`;
const databaseUser = image.startsWith("public.ecr.aws/supabase/postgres")
  ? "supabase_admin"
  : "postgres";
const migration = readFileSync(
  `${process.cwd()}/supabase/migrations/20260729050000_agent_submission_concurrency.sql`,
  "utf8",
);
const agentId = "00000000-0000-4000-8000-0000000000a1";
const unapprovedUserId = "00000000-0000-4000-8000-0000000000a2";

const requiredQuestionnaireFields = [
  ["contacts", "home-country"],
  ["contacts", "home-city"],
  ["contacts", "home-street"],
  ["contacts", "home-house"],
  ["contacts", "postal-code"],
  ["contacts", "email"],
  ["contacts", "contact-number"],
  ["contacts", "lives-outside-citizenship"],
  ["trip", "purpose"],
  ["trip", "main-destination"],
  ["trip", "first-entry-country"],
  ["trip", "entry-count"],
  ["trip", "arrival-date"],
  ["trip", "departure-date"],
  ["trip", "stay-duration"],
  ["trip", "previous-biometrics"],
  ["hotel", "inviting-party-type"],
  ["hotel", "hotel-name"],
  ["hotel", "hotel-address"],
  ["hotel", "hotel-country"],
  ["hotel", "hotel-city"],
  ["hotel", "hotel-postal-code"],
  ["appointment", "appointment-city"],
  ["appointment", "desired-date-1"],
  ["appointment", "desired-date-2"],
  ["personal", "surname"],
  ["personal", "first-name"],
  ["personal", "birth-date"],
  ["personal", "birth-place"],
  ["personal", "birth-country"],
  ["personal", "gender"],
  ["personal", "marital-status"],
  ["passport", "passport-type"],
  ["passport", "passport-no"],
  ["passport", "passport-issue-date"],
  ["passport", "passport-expiry-date"],
  ["passport", "passport-issue-country"],
  ["passport", "passport-issue-place"],
  ["employment", "occupation"],
  ["employment", "employer-name"],
  ["employment", "employer-contact"],
  ["employment", "employer-address"],
  ["trip", "means-of-support"],
];

function docker(args, options = {}) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(
      [
        `docker ${args.join(" ")} failed with status ${result.status}`,
        result.stdout.trim(),
        result.stderr.trim(),
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  return result.stdout.trim();
}

const psqlArgs = [
  "exec",
  "-i",
  containerName,
  "psql",
  "-X",
  "-q",
  "-A",
  "-t",
  "-v",
  "ON_ERROR_STOP=1",
  "-U",
  databaseUser,
  "-d",
  "postgres",
];

function psql(sql) {
  return docker(psqlArgs, { input: sql });
}

function psqlAsync(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", psqlArgs, {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(
          new Error(
            [`Concurrent psql failed with status ${code}`, stdout, stderr]
              .filter(Boolean)
              .join("\n"),
          ),
        );
      }
    });
    child.stdin.end(sql);
  });
}

function waitForPostgres() {
  let readyChecks = 0;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = spawnSync(
      "docker",
      ["exec", containerName, "pg_isready", "-U", databaseUser],
      { encoding: "utf8" },
    );
    readyChecks = result.status === 0 ? readyChecks + 1 : 0;
    if (readyChecks >= 3) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  throw new Error("Disposable PostgreSQL did not become ready.");
}

const setupSql = String.raw`
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end;
$$;

create schema if not exists auth;
create schema if not exists app_private;
create schema if not exists storage;
grant usage on schema auth, app_private, extensions, storage to authenticated;

create or replace function auth.uid()
returns uuid
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant execute on function auth.uid() to authenticated, anon;

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
create type public.media_review_status as enum (
  'not_reviewed',
  'accepted',
  'replace_required',
  'poor_quality'
);

create table public.profiles (
  id uuid primary key,
  role public.profile_role not null
);
insert into public.profiles (id, role) values ('${agentId}', 'agent');

create function app_private.current_profile_role()
returns public.profile_role
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select profile.role
  from public.profiles as profile
  where profile.id = auth.uid()
$$;
grant execute on function app_private.current_profile_role() to authenticated;

create table public.submissions (
  id text primary key,
  agent_id uuid not null,
  public_number bigint,
  status public.submission_status not null default 'draft',
  type text not null default 'single',
  title text not null default '',
  country text not null default 'Spain',
  city text not null default 'Moscow',
  priority text not null default 'Normal',
  readiness_percent integer not null default 0,
  family_intelligence jsonb not null default '{}'::jsonb,
  appointment_status public.appointment_status not null default 'not_started',
  submitted_at timestamptz,
  review_started_at timestamptz,
  accepted_at timestamptz,
  exported_at timestamptz,
  case_revision bigint not null default 0,
  updated_at timestamptz not null default clock_timestamp()
);
alter table public.submissions enable row level security;
create policy submissions_agent_own
on public.submissions for all to authenticated
using (agent_id = auth.uid())
with check (agent_id = auth.uid());

create table public.applicants (
  id text primary key,
  submission_id text not null references public.submissions(id) on delete cascade,
  full_name text not null default 'Test Applicant',
  role text not null default 'Основной заявитель',
  suggested_role text,
  role_confirmed boolean not null default true,
  birth_date date,
  patronymic text,
  citizenship text,
  address text,
  phone text,
  email text,
  passport_number text not null default '',
  passport_issued_at date,
  passport_expires_at date,
  country text not null default 'Spain',
  city text not null default 'Moscow',
  trip_dates text not null default '',
  hotel_name text,
  hotel_address text,
  questionnaire_percent integer not null default 0,
  media_percent integer not null default 0
);
alter table public.applicants enable row level security;
create policy applicants_agent_own
on public.applicants for all to authenticated
using (
  exists (
    select 1 from public.submissions
    where submissions.id = applicants.submission_id
      and submissions.agent_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.submissions
    where submissions.id = applicants.submission_id
      and submissions.agent_id = auth.uid()
  )
);

create table public.questionnaire_answers (
  submission_id text not null references public.submissions(id) on delete cascade,
  applicant_id text not null references public.applicants(id) on delete cascade,
  section_id text not null,
  field_id text not null,
  label text not null,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid,
  primary key (applicant_id, section_id, field_id)
);
alter table public.questionnaire_answers enable row level security;
create policy questionnaire_answers_agent_own
on public.questionnaire_answers for all to authenticated
using (
  exists (
    select 1 from public.submissions
    where submissions.id = questionnaire_answers.submission_id
      and submissions.agent_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.submissions
    where submissions.id = questionnaire_answers.submission_id
      and submissions.agent_id = auth.uid()
  )
);
create table public.media_assets (
  id text primary key,
  applicant_id text not null references public.applicants(id) on delete cascade,
  submission_id text not null references public.submissions(id) on delete cascade,
  type text not null,
  original_file_name text,
  generated_file_name text,
  storage_bucket text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  upload_status text not null default 'uploaded',
  review_status public.media_review_status not null default 'not_reviewed',
  uploaded_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid
);
alter table public.media_assets enable row level security;
create policy media_assets_agent_own
on public.media_assets for all to authenticated
using (
  exists (
    select 1 from public.submissions
    where submissions.id = media_assets.submission_id
      and submissions.agent_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.submissions
    where submissions.id = media_assets.submission_id
      and submissions.agent_id = auth.uid()
  )
);

create table public.corrections (
  id uuid primary key default gen_random_uuid(),
  submission_id text not null references public.submissions(id),
  severity text not null default 'blocking',
  status text not null default 'open'
);
alter table public.corrections enable row level security;
create policy corrections_agent_own
on public.corrections for all to authenticated
using (
  exists (
    select 1 from public.submissions
    where submissions.id = corrections.submission_id
      and submissions.agent_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.submissions
    where submissions.id = corrections.submission_id
      and submissions.agent_id = auth.uid()
  )
);

create table public.status_history (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id text not null,
  from_status text,
  to_status text,
  comment text not null default '',
  source text not null default 'system',
  note text,
  changed_by uuid not null,
  changed_at timestamptz not null default clock_timestamp()
);
alter table public.status_history enable row level security;
create policy status_history_agent_own
on public.status_history for all to authenticated
using (
  entity_type = 'submission'
  and exists (
    select 1 from public.submissions
    where submissions.id = status_history.entity_id
      and submissions.agent_id = auth.uid()
  )
)
with check (
  entity_type = 'submission'
  and exists (
    select 1 from public.submissions
    where submissions.id = status_history.entity_id
      and submissions.agent_id = auth.uid()
  )
);

grant select, insert, update, delete on
  public.submissions,
  public.applicants,
  public.questionnaire_answers,
  public.media_assets,
  public.corrections,
  public.status_history
to authenticated;

create table storage.objects (
  bucket_id text not null,
  name text not null,
  primary key (bucket_id, name)
);
alter table storage.objects enable row level security;
create policy storage_objects_agent_own
on storage.objects for select to authenticated
using (
  bucket_id = 'submission-media'
  and split_part(name, '/', 1) = 'submissions'
  and exists (
    select 1
    from public.submissions
    where submissions.id = split_part(storage.objects.name, '/', 2)
      and submissions.agent_id = auth.uid()
  )
);
grant select on storage.objects to authenticated;

create sequence public.submission_public_number_seq start with 1000;

insert into public.submissions (
  id,
  agent_id,
  status,
  title,
  family_intelligence
) values
  (
    'submission-concurrent',
    '${agentId}',
    'draft',
    'Concurrent baseline',
    '{"v19CockpitSnapshot":{"submission":{"exportState":"not_ready"}}}'
  ),
  (
    'submission-filling',
    '${agentId}',
    'filling',
    'Filling baseline',
    '{"v19CockpitSnapshot":{"submission":{"exportState":"not_ready"}}}'
  ),
  (
    'submission-number',
    '${agentId}',
    'draft',
    'Number baseline',
    '{"v19CockpitSnapshot":{"submission":{"exportState":"not_ready"}}}'
  ),
  (
    'submission-number-incomplete',
    '${agentId}',
    'draft',
    'Incomplete number baseline',
    '{"v19CockpitSnapshot":{"submission":{"exportState":"not_ready"}}}'
  ),
  (
    'submission-approved-answer',
    '${agentId}',
    'draft',
    'Approved answer baseline',
    '{"v19CockpitSnapshot":{"submission":{"exportState":"not_ready"}}}'
  ),
  (
    'submission-phantom',
    '${agentId}',
    'filling',
    'Phantom storage baseline',
    '{"v19CockpitSnapshot":{"submission":{"exportState":"not_ready"}}}'
  );
insert into public.submissions (
  id,
  agent_id,
  status,
  title,
  family_intelligence,
  appointment_status,
  submitted_at,
  review_started_at,
  accepted_at,
  exported_at,
  case_revision,
  updated_at
) values (
  'submission-export-ready',
  '${agentId}',
  'ready_for_excel',
  'Export ready',
  '{"v19CockpitSnapshot":{"submission":{"exportState":"ready","exportPackage":{"id":"old"}}}}',
  'not_started',
  null,
  null,
  clock_timestamp(),
  null,
  5,
  clock_timestamp()
);
insert into public.applicants (id, submission_id)
values ('applicant-export-ready', 'submission-export-ready');
insert into public.applicants (id, submission_id)
values
  ('applicant-submission-concurrent', 'submission-concurrent'),
  ('applicant-submission-filling', 'submission-filling'),
  ('applicant-submission-phantom', 'submission-phantom');
insert into public.applicants (id, submission_id, questionnaire_percent)
values
  ('applicant-number', 'submission-number', 100),
  (
    'applicant-number-incomplete',
    'submission-number-incomplete',
    100
  );
insert into public.applicants (
  id,
  submission_id,
  full_name,
  role,
  birth_date,
  email,
  phone,
  passport_number,
  passport_issued_at,
  passport_expires_at,
  country,
  city,
  trip_dates,
  hotel_name,
  hotel_address,
  questionnaire_percent,
  media_percent
) values (
  'applicant-approved-answer',
  'submission-approved-answer',
  'TEST first-name TEST surname',
  'Основной заявитель',
  '1990-08-20',
  'agent-flow@example.com',
  '+7 900 000-00-00',
  '761234567',
  '2020-08-20',
  '2030-08-20',
  'Spain',
  'Moscow',
  '10.08.2026 - 20.08.2026',
  'TEST hotel-name',
  'TEST hotel-address',
  100,
  100
);
insert into public.questionnaire_answers (
  submission_id,
  applicant_id,
  section_id,
  field_id,
  label,
  value,
  updated_by
) values (
  'submission-approved-answer',
  'applicant-approved-answer',
  'applicant-approved-answer-contacts',
  'email',
  'Email',
  '{
    "adminReviewApprovedAtIso":"2026-07-29T10:00:00.000Z",
    "adminReviewApprovedBy":"admin-reviewer",
    "kind":"v19_questionnaire_field",
    "value":"agent-flow@example.com",
    "version":1
  }'::jsonb,
  '${agentId}'
);
insert into public.media_assets (
  id,
  applicant_id,
  submission_id,
  type,
  generated_file_name,
  storage_bucket,
  storage_path,
  review_status,
  reviewed_at,
  reviewed_by
) values
  (
    'media-export-ready-passport',
    'applicant-export-ready',
    'submission-export-ready',
    'passport_scan',
    'passport.jpg',
    'submission-media',
    'submissions/submission-export-ready/applicants/applicant-export-ready/passport_scan/passport.jpg',
    'accepted',
    clock_timestamp(),
    '00000000-0000-4000-8000-0000000000b1'
  ),
  (
    'media-export-ready-selfie-1',
    'applicant-export-ready',
    'submission-export-ready',
    'selfie',
    'selfie-1.jpg',
    'submission-media',
    'submissions/submission-export-ready/applicants/applicant-export-ready/selfie/selfie-1.jpg',
    'accepted',
    clock_timestamp(),
    '00000000-0000-4000-8000-0000000000b1'
  ),
  (
    'media-export-ready-selfie-2',
    'applicant-export-ready',
    'submission-export-ready',
    'selfie_2',
    'selfie-2.jpg',
    'submission-media',
    'submissions/submission-export-ready/applicants/applicant-export-ready/selfie_2/selfie-2.jpg',
    'accepted',
    clock_timestamp(),
    '00000000-0000-4000-8000-0000000000b1'
  );

insert into storage.objects (bucket_id, name) values
  (
    'submission-media',
    'submissions/submission-export-ready/applicants/applicant-export-ready/passport_scan/passport.jpg'
  ),
  (
    'submission-media',
    'submissions/submission-export-ready/applicants/applicant-export-ready/selfie/selfie-1.jpg'
  ),
  (
    'submission-media',
    'submissions/submission-export-ready/applicants/applicant-export-ready/selfie_2/selfie-2.jpg'
  );

create function app_private.enforce_submission_agent_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  return new;
end;
$$;
create trigger submissions_agent_guard
before insert or update on public.submissions
for each row execute function app_private.enforce_submission_agent_mutation();

create function app_private.enforce_media_asset_review_boundary()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  return new;
end;
$$;
create trigger media_assets_agent_guard
before insert or update on public.media_assets
for each row execute function app_private.enforce_media_asset_review_boundary();

create function app_private.bump_submission_case_revision()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  new.case_revision := old.case_revision + 1;
  return new;
end;
$$;
create trigger submissions_bump_case_revision
before update on public.submissions
for each row execute function app_private.bump_submission_case_revision();

create function app_private.dispatch_submission_draft_with_revision_context(
  payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  applicant_record record;
  answer_record record;
  history_record record;
  media_record record;
  submission_record record;
begin
  if coalesce((payload ->> 'delayMs')::integer, 0) > 0 then
    perform pg_sleep((payload ->> 'delayMs')::numeric / 1000);
  end if;

  select *
  into submission_record
  from jsonb_to_record(payload -> 'submission') as requested (
    id text,
    agent_id uuid,
    status public.submission_status,
    type text,
    title text,
    country text,
    city text,
    priority text,
    readiness_percent integer,
    family_intelligence jsonb,
    appointment_status public.appointment_status,
    submitted_at timestamptz,
    review_started_at timestamptz,
    accepted_at timestamptz,
    exported_at timestamptz
  );

  if exists (
    select 1 from public.submissions where id = submission_record.id
  ) then
    update public.submissions
    set status = submission_record.status,
        type = coalesce(submission_record.type, type),
        title = coalesce(submission_record.title, title),
        country = coalesce(submission_record.country, country),
        city = coalesce(submission_record.city, city),
        priority = coalesce(submission_record.priority, priority),
        readiness_percent =
          coalesce(submission_record.readiness_percent, readiness_percent),
        family_intelligence =
          coalesce(submission_record.family_intelligence, family_intelligence),
        appointment_status =
          coalesce(submission_record.appointment_status, appointment_status),
        submitted_at = submission_record.submitted_at,
        review_started_at = submission_record.review_started_at,
        accepted_at = submission_record.accepted_at,
        exported_at = submission_record.exported_at,
        updated_at = clock_timestamp()
    where id = submission_record.id;
  else
    insert into public.submissions (
      id,
      agent_id,
      status,
      type,
      title,
      country,
      city,
      priority,
      readiness_percent,
      family_intelligence,
      appointment_status,
      submitted_at,
      review_started_at,
      accepted_at,
      exported_at
    ) values (
      submission_record.id,
      submission_record.agent_id,
      submission_record.status,
      coalesce(submission_record.type, 'single'),
      coalesce(submission_record.title, ''),
      coalesce(submission_record.country, 'Spain'),
      coalesce(submission_record.city, 'Moscow'),
      coalesce(submission_record.priority, 'Normal'),
      coalesce(submission_record.readiness_percent, 0),
      coalesce(submission_record.family_intelligence, '{}'::jsonb),
      coalesce(submission_record.appointment_status, 'not_started'),
      submission_record.submitted_at,
      submission_record.review_started_at,
      submission_record.accepted_at,
      submission_record.exported_at
    );
  end if;

  for applicant_record in
    select *
    from jsonb_to_recordset(
      coalesce(payload -> 'applicants', '[]'::jsonb)
    ) as requested (
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
  loop
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
      media_percent
    ) values (
      applicant_record.id,
      applicant_record.submission_id,
      applicant_record.full_name,
      applicant_record.role,
      applicant_record.suggested_role,
      applicant_record.role_confirmed,
      applicant_record.birth_date,
      applicant_record.patronymic,
      applicant_record.citizenship,
      applicant_record.address,
      applicant_record.phone,
      applicant_record.email,
      applicant_record.passport_number,
      applicant_record.passport_issued_at,
      applicant_record.passport_expires_at,
      applicant_record.country,
      applicant_record.city,
      applicant_record.trip_dates,
      applicant_record.hotel_name,
      applicant_record.hotel_address,
      applicant_record.questionnaire_percent,
      applicant_record.media_percent
    )
    on conflict (id) do update
    set submission_id = excluded.submission_id,
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
        media_percent = excluded.media_percent;
  end loop;

  delete from public.applicants as applicant
  where applicant.submission_id = submission_record.id
    and not exists (
      select 1
      from jsonb_to_recordset(
        coalesce(payload -> 'applicants', '[]'::jsonb)
      ) as requested (id text)
      where requested.id = applicant.id
    );

  for answer_record in
    select *
    from jsonb_to_recordset(
      coalesce(payload -> 'questionnaire_answers', '[]'::jsonb)
    ) as requested (
      submission_id text,
      applicant_id text,
      section_id text,
      field_id text,
      label text,
      value jsonb,
      updated_by uuid
    )
  loop
    insert into public.questionnaire_answers (
      submission_id,
      applicant_id,
      section_id,
      field_id,
      label,
      value,
      updated_by
    ) values (
      answer_record.submission_id,
      answer_record.applicant_id,
      answer_record.section_id,
      answer_record.field_id,
      answer_record.label,
      answer_record.value,
      answer_record.updated_by
    )
    on conflict (applicant_id, section_id, field_id) do update
    set submission_id = excluded.submission_id,
        label = excluded.label,
        value = excluded.value,
        updated_by = excluded.updated_by;
  end loop;

  delete from public.questionnaire_answers as answer
  where answer.submission_id = submission_record.id
    and not exists (
      select 1
      from jsonb_to_recordset(
        coalesce(payload -> 'questionnaire_answers', '[]'::jsonb)
      ) as requested (
        applicant_id text,
        section_id text,
        field_id text
      )
      where requested.applicant_id = answer.applicant_id
        and requested.section_id = answer.section_id
        and requested.field_id = answer.field_id
    );

  for media_record in
    select *
    from jsonb_to_recordset(
      coalesce(payload -> 'media_assets', '[]'::jsonb)
    ) as requested (
      id text,
      applicant_id text,
      submission_id text,
      type text,
      generated_file_name text,
      storage_bucket text,
      storage_path text,
      upload_status text,
      review_status public.media_review_status,
      reviewed_at timestamptz,
      reviewed_by uuid
    )
  loop
    insert into public.media_assets (
      id,
      applicant_id,
      submission_id,
      type,
      generated_file_name,
      storage_bucket,
      storage_path,
      upload_status,
      review_status,
      reviewed_at,
      reviewed_by
    ) values (
      media_record.id,
      media_record.applicant_id,
      media_record.submission_id,
      media_record.type,
      media_record.generated_file_name,
      media_record.storage_bucket,
      media_record.storage_path,
      coalesce(media_record.upload_status, 'uploaded'),
      media_record.review_status,
      media_record.reviewed_at,
      media_record.reviewed_by
    )
    on conflict (id) do update
    set generated_file_name = excluded.generated_file_name,
        storage_bucket = excluded.storage_bucket,
        storage_path = excluded.storage_path,
        upload_status = excluded.upload_status,
        review_status = excluded.review_status,
        reviewed_at = excluded.reviewed_at,
        reviewed_by = excluded.reviewed_by;
  end loop;

  delete from public.media_assets as media
  where media.submission_id = submission_record.id
    and not exists (
      select 1
      from jsonb_to_recordset(
        coalesce(payload -> 'media_assets', '[]'::jsonb)
      ) as requested (id text)
      where requested.id = media.id
    );

  for history_record in
    select *
    from jsonb_to_recordset(
      coalesce(payload -> 'status_history', '[]'::jsonb)
    ) as requested (
      id uuid,
      entity_type text,
      entity_id text,
      from_status text,
      to_status text,
      comment text,
      source text,
      note text,
      changed_by uuid,
      changed_at timestamptz
    )
  loop
    insert into public.status_history (
      id,
      entity_type,
      entity_id,
      from_status,
      to_status,
      comment,
      source,
      note,
      changed_by,
      changed_at
    ) values (
      history_record.id,
      history_record.entity_type,
      history_record.entity_id,
      history_record.from_status,
      history_record.to_status,
      history_record.comment,
      history_record.source,
      history_record.note,
      history_record.changed_by,
      history_record.changed_at
    )
    on conflict (id) do nothing;
  end loop;

  return jsonb_build_object('submissionId', submission_record.id);
end;
$$;
grant execute on function
  app_private.dispatch_submission_draft_with_revision_context(jsonb)
to authenticated;

create function public.save_submission_draft(payload jsonb)
returns jsonb
language sql
security invoker
set search_path = pg_catalog, app_private
as $$
  select app_private.dispatch_submission_draft_with_revision_context(payload)
$$;
grant execute on function public.save_submission_draft(jsonb)
to authenticated;

create function public.submit_corrections_handoff(payload jsonb)
returns jsonb
language sql
security invoker
set search_path = pg_catalog, app_private
as $$
  select app_private.dispatch_submission_draft_with_revision_context(payload)
$$;
grant execute on function public.submit_corrections_handoff(jsonb)
to authenticated;

create function public.upsert_questionnaire_answers(payload jsonb)
returns jsonb
language sql
security invoker
set search_path = pg_catalog
as $$
  select payload
$$;
grant execute on function public.upsert_questionnaire_answers(jsonb)
to authenticated;
`;

function deterministicUuid(seed) {
  const hex = createHash("sha256").update(seed).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function canonicalApplicantRole(role) {
  if (role === "Основной заявитель") return "main";
  if (role === "Супруг") return "spouse";
  if (role === "Ребёнок") return "child";
  return "unknown";
}

function canonicalSnapshotStatus(status, history) {
  if (status === "draft") return "draft";
  if (status === "filling") return "in_progress";
  if (status === "returned") return "returned";
  if (status === "ready_for_excel") return "ready_for_export";
  if (status === "exported") return "exported";
  if (
    status === "waiting_review" &&
    history.some((entry) => entry.to_status === "corrections_received")
  ) {
    return "corrections_received";
  }
  if (status === "waiting_review") return "submitted_for_review";
  throw new Error(`Unsupported harness status: ${status}`);
}

function questionnaireValue(fieldId) {
  if (fieldId === "email") return "agent-flow@example.com";
  if (
    [
      "company-phone",
      "contact-number",
      "employer-contact",
      "form-filler-phone",
      "hotel-contact",
    ].includes(fieldId)
  ) {
    return "+7 900 000-00-00";
  }
  if (fieldId === "passport-no") return "761234567";
  if (fieldId === "postal-code") return "101000";
  if (fieldId === "hotel-postal-code") return "28001";
  if (fieldId === "birth-date") return "20.08.1990";
  if (fieldId === "passport-issue-date") return "20.08.2020";
  if (fieldId === "passport-expiry-date") return "20.08.2030";
  if (
    [
      "final-entry-permit-valid-from",
      "previous-biometrics-date",
      "residence-permit-valid-until",
    ].includes(fieldId)
  ) {
    return "20.08.2025";
  }
  if (fieldId === "final-entry-permit-valid-to") return "20.08.2030";
  if (
    ["arrival-date", "desired-date-1"].includes(fieldId)
  ) {
    return "10.08.2026";
  }
  if (
    ["departure-date", "desired-date-2"].includes(fieldId)
  ) {
    return "20.08.2026";
  }
  if (fieldId === "stay-duration") return "11";
  if (fieldId === "means-of-support") return "Наличные";
  return `TEST ${fieldId}`;
}

function normalizeApplicants(id, applicants) {
  const source =
    applicants ??
    [
      {
        id: `applicant-${id}`,
        role: "Основной заявитель",
        submission_id: id,
      },
    ];
  return source.map((applicant) => ({
    address: applicant.address ?? null,
    birth_date: applicant.birth_date ?? "1990-08-20",
    citizenship: applicant.citizenship ?? null,
    city: applicant.city ?? "Moscow",
    country: applicant.country ?? "Spain",
    email: applicant.email ?? "agent-flow@example.com",
    full_name: applicant.full_name ?? "TEST first-name TEST surname",
    hotel_address: applicant.hotel_address ?? "TEST hotel-address",
    hotel_name: applicant.hotel_name ?? "TEST hotel-name",
    id: applicant.id,
    media_percent: applicant.media_percent ?? 100,
    passport_expires_at: applicant.passport_expires_at ?? "2030-08-20",
    passport_issued_at: applicant.passport_issued_at ?? "2020-08-20",
    passport_number: applicant.passport_number ?? "761234567",
    patronymic: applicant.patronymic ?? null,
    phone: applicant.phone ?? "+7 900 000-00-00",
    questionnaire_percent: applicant.questionnaire_percent ?? 100,
    role: applicant.role,
    role_confirmed: applicant.role_confirmed ?? true,
    suggested_role: applicant.suggested_role ?? null,
    submission_id: applicant.submission_id,
    trip_dates: applicant.trip_dates ?? "10.08.2026 - 20.08.2026",
  }));
}

function completeQuestionnaireAnswers(id, applicants) {
  return applicants.flatMap((applicant) =>
    requiredQuestionnaireFields.map(([section, fieldId]) => ({
      applicant_id: applicant.id,
      field_id: fieldId,
      label: `Label ${fieldId}`,
      section_id: `${applicant.id}-${section}`,
      submission_id: id,
      updated_by: agentId,
      value: questionnaireValue(fieldId),
    })),
  );
}

function questionnaireAnswersWithTripDates(id, applicants, from, to) {
  return completeQuestionnaireAnswers(id, applicants).map((answer) => {
    if (answer.field_id === "arrival-date") return { ...answer, value: from };
    if (answer.field_id === "departure-date") return { ...answer, value: to };
    if (answer.field_id === "stay-duration") {
      return {
        ...answer,
        value: from && to ? questionnaireValue("stay-duration") : "",
      };
    }
    return answer;
  });
}

function normalizeHistory(id, history) {
  return history.map((entry, index) => ({
    changed_at: entry.changed_at ?? `2026-07-29T10:0${index}:00Z`,
    changed_by: entry.changed_by ?? agentId,
    comment:
      entry.comment ??
      `${entry.from_status ?? "none"} -> ${entry.to_status ?? "unknown"}`,
    entity_id: entry.entity_id ?? id,
    entity_type: entry.entity_type ?? "submission",
    from_status: entry.from_status,
    id:
      entry.id ??
      deterministicUuid(
        `history:${id}:${entry.from_status}:${entry.to_status}:${index}`,
      ),
    note: entry.note ?? null,
    source: entry.source ?? "agent",
    to_status: entry.to_status,
  }));
}

function normalizeMediaAssets(mediaAssets) {
  return mediaAssets.map((media) => ({
    ...media,
    upload_status: media.upload_status ?? "uploaded",
  }));
}

function completeMediaAssets(id, applicants) {
  return applicants.flatMap((applicant) => {
    const types =
      applicant.role === "Основной заявитель"
        ? ["passport_scan", "selfie", "selfie_2"]
        : ["passport_scan"];
    return types.map((type) => {
      const generatedFileName = `${type}.jpg`;
      return {
        applicant_id: applicant.id,
        generated_file_name: generatedFileName,
        id: `media-${id}-${applicant.id}-${type}`,
        review_status: "not_reviewed",
        reviewed_at: null,
        reviewed_by: null,
        storage_bucket: "submission-media",
        storage_path:
          `submissions/${id}/applicants/${applicant.id}/${type}/${generatedFileName}`,
        submission_id: id,
        type,
        upload_status: "uploaded",
      };
    });
  });
}

function seedStorageObjects(mediaAssets) {
  if (!mediaAssets.length) return;
  const values = mediaAssets
    .map(
      (media) =>
        `('${media.storage_bucket.replaceAll("'", "''")}', '${media.storage_path.replaceAll("'", "''")}')`,
    )
    .join(",\n");
  psql(`
insert into storage.objects (bucket_id, name)
values ${values}
on conflict (bucket_id, name) do nothing;
`);
}

function seedQuestionnaireAnswers(questionnaireAnswers) {
  if (!questionnaireAnswers.length) return;
  const quote = (value) => String(value).replaceAll("'", "''");
  const values = questionnaireAnswers
    .map(
      (answer) =>
        `('${quote(answer.submission_id)}', '${quote(answer.applicant_id)}', '${quote(answer.section_id)}', '${quote(answer.field_id)}', '${quote(answer.label)}', '${quote(JSON.stringify(answer.value))}'::jsonb, '${answer.updated_by}'::uuid)`,
    )
    .join(",\n");
  psql(`
insert into public.questionnaire_answers (
  submission_id,
  applicant_id,
  section_id,
  field_id,
  label,
  value,
  updated_by
)
values ${values}
on conflict (applicant_id, section_id, field_id) do update
set label = excluded.label,
    value = excluded.value,
    updated_by = excluded.updated_by;
`);
}

function semanticQuestionnaireValue(value) {
  if (typeof value === "string") return value.trim();
  if (
    value &&
    typeof value === "object" &&
    value.kind === "v19_questionnaire_field" &&
    value.version === 1 &&
    typeof value.value === "string"
  ) {
    return value.value.trim();
  }
  return "";
}

function snapshotApplicants(applicants, questionnaireAnswers) {
  return applicants.map((applicant) => {
    const answers = questionnaireAnswers.filter(
      (answer) => answer.applicant_id === applicant.id,
    );
    const sectionIds = [...new Set(answers.map((answer) => answer.section_id))];
    return {
      fileStatus: "complete",
      fullName: applicant.full_name,
      id: applicant.id,
      questionnaireStatus: "complete",
      role: canonicalApplicantRole(applicant.role),
      sections: sectionIds.map((sectionId) => ({
        fields: answers
          .filter((answer) => answer.section_id === sectionId)
          .map((answer) => ({
            id: answer.field_id,
            label: answer.label,
            required: true,
            value: semanticQuestionnaireValue(answer.value),
          })),
        id: sectionId,
        status: "complete",
        title: sectionId,
      })),
    };
  });
}

function snapshotFiles(mediaAssets, status) {
  return mediaAssets.map((media) => ({
    applicantId: media.applicant_id,
    generatedFileName: media.generated_file_name,
    id: media.id,
    reviewStatus: media.review_status,
    status: status === "waiting_review" ? "pending_review" : "uploaded",
    storageAdapter: "supabase-private",
    storageBucket: media.storage_bucket,
    storagePath: media.storage_path,
    type: media.type,
    uploadStatus: media.upload_status,
  }));
}

function snapshotHistory(history) {
  return history.map((entry) => ({
    at: entry.changed_at,
    fromStatus: entry.from_status,
    id: entry.id,
    note: entry.note,
    source: entry.source,
    text: entry.comment,
    toStatus: entry.to_status,
  }));
}

function mutationPayload({
  applicants,
  completeness = {
    files: 100,
    questionnaire: 100,
    total: 100,
  },
  delayMs,
  id,
  status = "draft",
  title,
  history = [],
  submission = {},
  mediaAssets = [],
  questionnaireAnswers,
  snapshotMutation,
}) {
  const normalizedApplicants = normalizeApplicants(id, applicants);
  const normalizedHistory = normalizeHistory(id, history);
  const normalizedMedia = normalizeMediaAssets(mediaAssets);
  const normalizedQuestionnaire =
    questionnaireAnswers ??
    completeQuestionnaireAnswers(id, normalizedApplicants);
  const submissionProjection = {
    accepted_at: null,
    agent_id: agentId,
    appointment_status: "not_started",
    city: "Moscow",
    country: "Spain",
    exported_at: null,
    id,
    priority: "Normal",
    readiness_percent: completeness.total,
    review_started_at: null,
    status,
    submitted_at: status === "waiting_review" ? "2026-07-29T10:00:00Z" : null,
    title,
    travel_date: "10.08.2026 - 20.08.2026",
    trip_date_from: "10.08.2026",
    trip_date_to: "20.08.2026",
    type: "single",
    ...submission,
  };
  const cockpitSubmission = {
    agentId,
    applicants: snapshotApplicants(
      normalizedApplicants,
      normalizedQuestionnaire,
    ),
    city: submissionProjection.city,
    completeness,
    country: submissionProjection.country,
    createdAt: "2026-07-29T09:00:00Z",
    exportState: "not_ready",
    files: snapshotFiles(normalizedMedia, status),
    history: snapshotHistory(normalizedHistory),
    id,
    issues: [],
    status: canonicalSnapshotStatus(status, normalizedHistory),
    title: submissionProjection.title,
    tripDateFrom: submissionProjection.trip_date_from,
    tripDateTo: submissionProjection.trip_date_to,
    type: submissionProjection.type,
    updatedAt: "2026-07-29T10:00:00Z",
  };
  const finalCockpitSubmission = snapshotMutation
    ? snapshotMutation(cockpitSubmission)
    : cockpitSubmission;

  return JSON.stringify({
    ...(delayMs ? { delayMs } : {}),
    applicants: normalizedApplicants,
    corrections: [],
    media_assets: normalizedMedia,
    questionnaire_answers: normalizedQuestionnaire,
    status_history: normalizedHistory,
    submission: {
      ...submissionProjection,
      family_intelligence: {
        status: "unreviewed",
        v19CockpitSnapshot: {
          submission: finalCockpitSubmission,
          version: 1,
        },
      },
    },
  });
}

function callAgentMutation({
  actorId = agentId,
  expectedRevision,
  operationId,
  payload,
}) {
  const expectedSql =
    expectedRevision === null ? "null" : `${expectedRevision}::bigint`;
  return `public.save_agent_submission_if_current(
    $payload$${payload}$payload$::jsonb,
    ${expectedSql},
    '${actorId}'::uuid,
    '${operationId}'::uuid
  )`;
}

function assertCheckViolation(call) {
  psql(`
set role authenticated;
set request.jwt.claim.sub = '${agentId}';
do $$
begin
  perform ${call};
  raise exception 'invalid Agent applicant topology unexpectedly committed';
exception when check_violation then
  null;
end;
$$;
`);
}

function assertInsufficientPrivilege(call) {
  psql(`
set role authenticated;
set request.jwt.claim.sub = '${agentId}';
do $$
begin
  perform ${call};
  raise exception 'Agent trust-boundary mutation unexpectedly committed';
exception when insufficient_privilege then
  null;
end;
$$;
`);
}

try {
  docker([
    "run",
    "--rm",
    "-d",
    "--name",
    containerName,
    "--pull=never",
    "-e",
    "POSTGRES_HOST_AUTH_METHOD=trust",
    image,
  ]);
  waitForPostgres();
  psql(`${setupSql}\n${migration}`);

  psql(`
set role authenticated;
set request.jwt.claim.sub = '${agentId}';
do $$
begin
  begin
    perform public.save_submission_draft('{}'::jsonb);
    raise exception 'legacy draft RPC bypassed Agent CAS';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.submit_corrections_handoff('{}'::jsonb);
    raise exception 'legacy correction RPC bypassed Agent CAS';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.upsert_questionnaire_answers('{}'::jsonb);
    raise exception 'legacy questionnaire RPC bypassed Agent CAS';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;
`);

  const numberApplicants = normalizeApplicants("submission-number", [
    {
      id: "applicant-number",
      role: "Основной заявитель",
      submission_id: "submission-number",
    },
  ]);
  seedQuestionnaireAnswers(
    completeQuestionnaireAnswers("submission-number", numberApplicants),
  );
  psql(`
set role authenticated;
set request.jwt.claim.sub = '${agentId}';
do $$
begin
  begin
    update public.submissions
    set title = 'direct submission bypass'
    where id = 'submission-concurrent';
    raise exception 'direct submissions DML bypassed Agent CAS';
  exception when insufficient_privilege then
    null;
  end;
  begin
    insert into public.applicants (id, submission_id)
    values ('direct-applicant', 'submission-concurrent');
    raise exception 'direct applicants DML bypassed Agent CAS';
  exception when insufficient_privilege then
    null;
  end;
  begin
    insert into public.questionnaire_answers (
      submission_id,
      applicant_id,
      section_id,
      field_id,
      label,
      value
    ) values (
      'submission-number',
      'applicant-number',
      'applicant-number-contacts',
      'direct-field',
      'Direct field',
      '{"value":"bypass"}'::jsonb
    );
    raise exception 'direct questionnaire DML bypassed Agent CAS';
  exception when insufficient_privilege then
    null;
  end;
  begin
    insert into public.media_assets (
      id,
      applicant_id,
      submission_id,
      type,
      generated_file_name,
      storage_bucket,
      storage_path
    ) values (
      'direct-media',
      'applicant-number',
      'submission-number',
      'passport_scan',
      'direct.jpg',
      'submission-media',
      'submissions/submission-number/applicants/applicant-number/passport_scan/direct.jpg'
    );
    raise exception 'direct media DML bypassed Agent CAS';
  exception when insufficient_privilege then
    null;
  end;
  begin
    insert into public.corrections (submission_id)
    values ('submission-concurrent');
    raise exception 'direct corrections DML bypassed Agent CAS';
  exception when insufficient_privilege then
    null;
  end;
  begin
    insert into public.status_history (
      entity_type,
      entity_id,
      from_status,
      to_status,
      changed_by
    ) values (
      'submission',
      'submission-concurrent',
      'draft',
      'in_progress',
      '${agentId}'
    );
    raise exception 'direct status history DML bypassed Agent CAS';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;
`);

  psql(`
set role authenticated;
set request.jwt.claim.sub = '${agentId}';
do $$
begin
  perform public.ensure_submission_public_number(
    'submission-number-incomplete'
  );
  raise exception 'incomplete durable questionnaire received a public number';
exception when check_violation then
  null;
end;
$$;
`);
  const incompleteNumberProof = psql(`
select coalesce(public_number::text, 'not-assigned') || ':' || case_revision::text
from public.submissions
where id = 'submission-number-incomplete';
`);
  if (incompleteNumberProof !== "not-assigned:0") {
    throw new Error(
      `Incomplete questionnaire changed public-number state: ${incompleteNumberProof}`,
    );
  }

  psql(`
set role authenticated;
set request.jwt.claim.sub = '${unapprovedUserId}';
do $$
begin
  perform public.ensure_submission_public_number('submission-number');
  raise exception 'unapproved authenticated user assigned a public number';
exception when insufficient_privilege then
  null;
end;
$$;
`);
  const unapprovedNumberProof = psql(`
select coalesce(public_number::text, 'not-assigned') || ':' || case_revision::text
from public.submissions
where id = 'submission-number';
`);
  if (unapprovedNumberProof !== "not-assigned:0") {
    throw new Error(
      `Unapproved public-number attempt changed durable state: ${unapprovedNumberProof}`,
    );
  }

  const numberProof = psql(`
set role authenticated;
set request.jwt.claim.sub = '${agentId}';
select public.ensure_submission_public_number('submission-number');
select public_number::text || ':' || case_revision::text
from public.submissions
where id = 'submission-number';
`)
    .split("\n")
    .at(-1);
  if (numberProof !== "1000:1") {
    throw new Error(
      `Public-number assignment did not return the next Agent revision: ${numberProof}`,
    );
  }

  const invalidApplicantTopologies = [
    {
      applicants: [
        {
          id: "single-child",
          role: "Ребёнок",
          submission_id: "submission-invalid-single",
        },
      ],
      id: "submission-invalid-single",
      operationId: "00000000-0000-4000-8000-000000000112",
      type: "single",
    },
    {
      applicants: [
        {
          id: "family-only-main",
          role: "Основной заявитель",
          submission_id: "submission-invalid-family-one",
        },
      ],
      id: "submission-invalid-family-one",
      operationId: "00000000-0000-4000-8000-000000000113",
      type: "family",
    },
    {
      applicants: [
        {
          id: "family-child-a",
          role: "Ребёнок",
          submission_id: "submission-invalid-family-no-main",
        },
        {
          id: "family-child-b",
          role: "Ребёнок",
          submission_id: "submission-invalid-family-no-main",
        },
      ],
      id: "submission-invalid-family-no-main",
      operationId: "00000000-0000-4000-8000-000000000114",
      type: "family",
    },
    {
      applicants: Array.from({ length: 7 }, (_, index) => ({
        id: `family-seven-${index}`,
        role: index === 0 ? "Основной заявитель" : "Ребёнок",
        submission_id: "submission-invalid-family-seven",
      })),
      id: "submission-invalid-family-seven",
      operationId: "00000000-0000-4000-8000-000000000115",
      type: "family",
    },
    {
      applicants: [
        {
          id: "family-main-unknown",
          role: "Основной заявитель",
          submission_id: "submission-invalid-family-role",
        },
        {
          id: "family-unknown",
          role: "Заявитель",
          submission_id: "submission-invalid-family-role",
        },
      ],
      id: "submission-invalid-family-role",
      operationId: "00000000-0000-4000-8000-000000000116",
      type: "family",
    },
  ];
  for (const invalid of invalidApplicantTopologies) {
    const payload = mutationPayload({
      applicants: invalid.applicants,
      id: invalid.id,
      submission: { type: invalid.type },
      title: "Invalid applicant topology",
    });
    assertCheckViolation(
      callAgentMutation({
        expectedRevision: null,
        operationId: invalid.operationId,
        payload,
      }),
    );
  }

  const emptyDraftCompleteness = {
    files: 0,
    questionnaire: 0,
    total: 0,
  };
  const freshSingleId = "submission-fresh-single";
  const freshSingleApplicants = normalizeApplicants(freshSingleId, [
    {
      id: `applicant-${freshSingleId}`,
      media_percent: 0,
      questionnaire_percent: 0,
      role: "Основной заявитель",
      submission_id: freshSingleId,
      trip_dates: "не указано",
    },
  ]);
  const freshSinglePayload = mutationPayload({
    applicants: freshSingleApplicants,
    completeness: emptyDraftCompleteness,
    id: freshSingleId,
    questionnaireAnswers: questionnaireAnswersWithTripDates(
      freshSingleId,
      freshSingleApplicants,
      "",
      "",
    ),
    submission: {
      travel_date: "не указано",
      trip_date_from: "не указано",
      trip_date_to: "не указано",
    },
    title: "Fresh single without dates",
  });
  psql(`
set role authenticated;
set request.jwt.claim.sub = '${agentId}';
select ${callAgentMutation({
    expectedRevision: null,
    operationId: "00000000-0000-4000-8000-000000000133",
    payload: freshSinglePayload,
  })};
`);

  const freshFamilyId = "submission-fresh-family";
  const freshFamilyApplicants = normalizeApplicants(freshFamilyId, [
    {
      id: `main-${freshFamilyId}`,
      media_percent: 0,
      questionnaire_percent: 0,
      role: "Основной заявитель",
      submission_id: freshFamilyId,
      trip_dates: "не указано",
    },
    {
      id: `child-${freshFamilyId}`,
      media_percent: 0,
      questionnaire_percent: 0,
      role: "Ребёнок",
      submission_id: freshFamilyId,
      trip_dates: "не указано",
    },
  ]);
  const freshFamilyPayload = mutationPayload({
    applicants: freshFamilyApplicants,
    completeness: emptyDraftCompleteness,
    id: freshFamilyId,
    questionnaireAnswers: questionnaireAnswersWithTripDates(
      freshFamilyId,
      freshFamilyApplicants,
      "",
      "",
    ),
    submission: {
      travel_date: "не указано",
      trip_date_from: "не указано",
      trip_date_to: "не указано",
      type: "family",
    },
    title: "Fresh family without dates",
  });
  psql(`
set role authenticated;
set request.jwt.claim.sub = '${agentId}';
select ${callAgentMutation({
    expectedRevision: null,
    operationId: "00000000-0000-4000-8000-000000000134",
    payload: freshFamilyPayload,
  })};
`);

  const freshDraftProof = psql(`
select
  submission.id || ':' ||
  submission.status::text || ':' ||
  count(applicant.id)::text || ':' ||
  min(applicant.trip_dates)
from public.submissions as submission
join public.applicants as applicant
  on applicant.submission_id = submission.id
where submission.id in ('${freshSingleId}', '${freshFamilyId}')
group by submission.id, submission.status
order by submission.id;
`);
  if (
    freshDraftProof !==
    [
      `${freshFamilyId}:draft:2:не указано`,
      `${freshSingleId}:draft:1:не указано`,
    ].join("\n")
  ) {
    throw new Error(`Fresh Agent drafts did not persist: ${freshDraftProof}`);
  }

  const partialFamilyApplicants = freshFamilyApplicants.map((applicant) => ({
    ...applicant,
    questionnaire_percent: 50,
    trip_dates: "10.08.2026 - не указано",
  }));
  const partialFamilyQuestionnaire = completeQuestionnaireAnswers(
    freshFamilyId,
    partialFamilyApplicants,
  ).map((answer) => {
    if (
      answer.applicant_id === `main-${freshFamilyId}` &&
      answer.field_id === "arrival-date"
    ) {
      return { ...answer, value: "10.08.2026" };
    }
    if (
      ["arrival-date", "departure-date", "stay-duration"].includes(
        answer.field_id,
      )
    ) {
      return { ...answer, value: "" };
    }
    return answer;
  });
  const partialFamilyPayload = mutationPayload({
    applicants: partialFamilyApplicants,
    completeness: {
      files: 0,
      questionnaire: 50,
      total: 25,
    },
    id: freshFamilyId,
    questionnaireAnswers: partialFamilyQuestionnaire,
    submission: {
      travel_date: "10.08.2026 - не указано",
      trip_date_from: "10.08.2026",
      trip_date_to: "не указано",
      type: "family",
    },
    title: "Family dates in progress",
  });
  psql(`
set role authenticated;
set request.jwt.claim.sub = '${agentId}';
select ${callAgentMutation({
    expectedRevision: 0,
    operationId: "00000000-0000-4000-8000-000000000135",
    payload: partialFamilyPayload,
  })};
`);

  const completedFamilyApplicants = partialFamilyApplicants.map((applicant) => ({
    ...applicant,
    questionnaire_percent: 100,
    trip_dates: "10.08.2026 - 20.08.2026",
  }));
  const completedFamilyPayload = mutationPayload({
    applicants: completedFamilyApplicants,
    completeness: {
      files: 0,
      questionnaire: 100,
      total: 50,
    },
    id: freshFamilyId,
    questionnaireAnswers: questionnaireAnswersWithTripDates(
      freshFamilyId,
      completedFamilyApplicants,
      "10.08.2026",
      "20.08.2026",
    ),
    submission: {
      travel_date: "10.08.2026 - 20.08.2026",
      trip_date_from: "10.08.2026",
      trip_date_to: "20.08.2026",
      type: "family",
    },
    title: "Family dates complete",
  });
  psql(`
set role authenticated;
set request.jwt.claim.sub = '${agentId}';
select ${callAgentMutation({
    expectedRevision: 1,
    operationId: "00000000-0000-4000-8000-000000000136",
    payload: completedFamilyPayload,
  })};
`);
  const sequentialFamilyProof = psql(`
select
  submission.title || ':' ||
  submission.case_revision::text || ':' ||
  min(applicant.trip_dates)
from public.submissions as submission
join public.applicants as applicant
  on applicant.submission_id = submission.id
where submission.id = '${freshFamilyId}'
group by submission.title, submission.case_revision;
`);
  if (
    sequentialFamilyProof !==
    "Family dates complete:2:10.08.2026 - 20.08.2026"
  ) {
    throw new Error(
      `Sequential family dates did not round-trip: ${sequentialFamilyProof}`,
    );
  }

  const validFamilyId = "submission-valid-family";
  const validFamilyPayload = mutationPayload({
    applicants: [
      {
        id: "family-main",
        role: "Основной заявитель",
        submission_id: validFamilyId,
      },
      {
        id: "family-spouse",
        role: "Супруг",
        submission_id: validFamilyId,
      },
    ],
    id: validFamilyId,
    submission: { type: "family" },
    title: "Valid family topology",
  });
  psql(`
set role authenticated;
set request.jwt.claim.sub = '${agentId}';
select ${callAgentMutation({
    expectedRevision: null,
    operationId: "00000000-0000-4000-8000-000000000117",
    payload: validFamilyPayload,
  })};
`);

  const reviewFamilyApplicants = normalizeApplicants(validFamilyId, [
    {
      id: "family-main",
      role: "Основной заявитель",
      submission_id: validFamilyId,
    },
    {
      id: "family-spouse",
      role: "Ребёнок",
      submission_id: validFamilyId,
    },
  ]);
  const reviewFamilyQuestionnaire = completeQuestionnaireAnswers(
    validFamilyId,
    reviewFamilyApplicants,
  )
    .map((answer) =>
      answer.applicant_id === "family-spouse" &&
      answer.field_id === "occupation"
        ? { ...answer, value: "MINOR" }
        : answer,
    )
    .filter(
      (answer) =>
        answer.applicant_id !== "family-spouse" ||
        !["employer-address", "employer-contact", "employer-name"].includes(
          answer.field_id,
        ),
    );
  const reviewFamilyMedia = completeMediaAssets(
    validFamilyId,
    reviewFamilyApplicants,
  );
  seedStorageObjects(reviewFamilyMedia);
  const reviewFamilyPayload = mutationPayload({
    applicants: reviewFamilyApplicants,
    history: [
      {
        from_status: "in_progress",
        source: "agent",
        to_status: "submitted_for_review",
      },
      {
        from_status: "draft",
        source: "agent",
        to_status: "in_progress",
      },
    ],
    id: validFamilyId,
    mediaAssets: reviewFamilyMedia,
    questionnaireAnswers: reviewFamilyQuestionnaire,
    status: "waiting_review",
    submission: { type: "family" },
    title: "Valid family with minor",
  });
  psql(`
set role authenticated;
set request.jwt.claim.sub = '${agentId}';
select ${callAgentMutation({
    expectedRevision: 0,
    operationId: "00000000-0000-4000-8000-000000000123",
    payload: reviewFamilyPayload,
  })};
`);
  const familyReviewProof = psql(`
select
  submission.status::text || ':' ||
  count(applicant.id)::text || ':' ||
  count(*) filter (where applicant.role = 'Ребёнок')::text
from public.submissions as submission
join public.applicants as applicant
  on applicant.submission_id = submission.id
where submission.id = '${validFamilyId}'
group by submission.status;
`);
  if (familyReviewProof !== "waiting_review:2:1") {
    throw new Error(
      `Minor family questionnaire did not reach review: ${familyReviewProof}`,
    );
  }

  const partialNameId = "submission-partial-name-draft";
  const partialNameApplicants = normalizeApplicants(partialNameId, [
    {
      full_name: "Existing Applicant Name",
      id: `applicant-${partialNameId}`,
      role: "Основной заявитель",
      submission_id: partialNameId,
    },
  ]);
  const partialNameQuestionnaire = completeQuestionnaireAnswers(
    partialNameId,
    partialNameApplicants,
  ).filter((answer) => answer.field_id !== "surname");
  const partialNamePayload = mutationPayload({
    applicants: partialNameApplicants,
    id: partialNameId,
    questionnaireAnswers: partialNameQuestionnaire,
    title: "Valid partial-name draft",
  });
  psql(`
set role authenticated;
set request.jwt.claim.sub = '${agentId}';
select ${callAgentMutation({
    expectedRevision: null,
    operationId: "00000000-0000-4000-8000-000000000132",
    payload: partialNamePayload,
  })};
`);

  const newPayload = mutationPayload({
    id: "submission-new",
    title: "New draft",
  });
  const newCall = callAgentMutation({
    expectedRevision: null,
    operationId: "00000000-0000-4000-8000-000000000101",
    payload: newPayload,
  });
  const replay = psql(`
set role authenticated;
set request.jwt.claim.sub = '${agentId}';
select ${newCall};
select ${newCall};
select title || ':' || case_revision::text
from public.submissions where id = 'submission-new';
`)
    .split("\n")
    .at(-1);
  if (replay !== "New draft:0") {
    throw new Error(`Replay changed the new Agent snapshot: ${replay}`);
  }

  const freshPayload = mutationPayload({
    id: "submission-new",
    title: "Fresh edit",
  });
  const freshCall = callAgentMutation({
    expectedRevision: 0,
    operationId: "00000000-0000-4000-8000-000000000102",
    payload: freshPayload,
  });
  psql(`
set role authenticated;
set request.jwt.claim.sub = '${agentId}';
select ${freshCall};
`);

  const stalePayload = mutationPayload({
    id: "submission-new",
    title: "Stale overwrite",
  });
  const staleCall = callAgentMutation({
    expectedRevision: 0,
    operationId: "00000000-0000-4000-8000-000000000103",
    payload: stalePayload,
  });
  const staleProof = psql(`
set role authenticated;
set request.jwt.claim.sub = '${agentId}';
do $$
begin
  perform ${staleCall};
  raise exception 'stale Agent snapshot unexpectedly committed';
exception when serialization_failure then
  null;
end;
$$;
select title || ':' || case_revision::text
from public.submissions where id = 'submission-new';
`)
    .split("\n")
    .at(-1);
  if (staleProof !== "Fresh edit:1") {
    throw new Error(`Stale Agent snapshot overwrote current state: ${staleProof}`);
  }

  const newFillingPayload = mutationPayload({
    id: "submission-new-filling",
    status: "filling",
    title: "Invalid initial filling",
    history: [
      {
        from_status: "draft",
        source: "agent",
        to_status: "in_progress",
      },
    ],
  });
  const newFillingCall = callAgentMutation({
    expectedRevision: null,
    operationId: "00000000-0000-4000-8000-000000000108",
    payload: newFillingPayload,
  });
  psql(`
set role authenticated;
set request.jwt.claim.sub = '${agentId}';
do $$
begin
  perform ${newFillingCall};
  raise exception 'new Agent submission skipped the draft checkpoint';
exception when check_violation then
  null;
end;
$$;
`);

  const missingProgressHistoryPayload = mutationPayload({
    id: "submission-concurrent",
    status: "filling",
    title: "Missing progress history",
  });
  const missingProgressHistoryCall = callAgentMutation({
    expectedRevision: 0,
    operationId: "00000000-0000-4000-8000-000000000109",
    payload: missingProgressHistoryPayload,
  });
  psql(`
set role authenticated;
set request.jwt.claim.sub = '${agentId}';
do $$
begin
  perform ${missingProgressHistoryCall};
  raise exception 'draft-to-filling mutation omitted canonical history';
exception when check_violation then
  null;
end;
$$;
`);

  const progressPayload = mutationPayload({
    id: "submission-concurrent",
    status: "filling",
    title: "Canonical progress",
    history: [
      {
        from_status: "draft",
        source: "agent",
        to_status: "in_progress",
      },
    ],
  });
  const progressCall = callAgentMutation({
    expectedRevision: 0,
    operationId: "00000000-0000-4000-8000-000000000110",
    payload: progressPayload,
  });
  psql(`
set role authenticated;
set request.jwt.claim.sub = '${agentId}';
select ${progressCall};
`);

  const regressionPayload = mutationPayload({
    id: "submission-concurrent",
    status: "draft",
    title: "Invalid regression",
  });
  const regressionCall = callAgentMutation({
    expectedRevision: 1,
    operationId: "00000000-0000-4000-8000-000000000111",
    payload: regressionPayload,
  });
  psql(`
set role authenticated;
set request.jwt.claim.sub = '${agentId}';
do $$
begin
  perform ${regressionCall};
  raise exception 'in-progress Agent submission regressed to draft';
exception when insufficient_privilege then
  null;
end;
$$;
`);

  const concurrentA = mutationPayload({
    delayMs: 1000,
    id: "submission-concurrent",
    status: "filling",
    title: "Concurrent winner",
  });
  const concurrentB = mutationPayload({
    id: "submission-concurrent",
    status: "filling",
    title: "Concurrent stale",
  });
  const concurrentCallA = callAgentMutation({
    expectedRevision: 1,
    operationId: "00000000-0000-4000-8000-000000000104",
    payload: concurrentA,
  });
  const concurrentCallB = callAgentMutation({
    expectedRevision: 1,
    operationId: "00000000-0000-4000-8000-000000000105",
    payload: concurrentB,
  });
  const firstMutation = psqlAsync(`
set role authenticated;
set request.jwt.claim.sub = '${agentId}';
select ${concurrentCallA};
`);
  await new Promise((resolve) => globalThis.setTimeout(resolve, 250));
  const concurrentProof = psql(`
set role authenticated;
set request.jwt.claim.sub = '${agentId}';
do $$
begin
  perform ${concurrentCallB};
  raise exception 'concurrent stale Agent snapshot unexpectedly committed';
exception when serialization_failure then
  null;
end;
$$;
select title || ':' || case_revision::text
from public.submissions where id = 'submission-concurrent';
`)
    .split("\n")
    .at(-1);
  await firstMutation;
  if (concurrentProof !== "Concurrent winner:2") {
    throw new Error(`Concurrent Agent CAS did not preserve the winner: ${concurrentProof}`);
  }

  const fillingWithoutHistory = mutationPayload({
    id: "submission-filling",
    status: "waiting_review",
    title: "Missing audit history",
  });
  const fillingCall = callAgentMutation({
    expectedRevision: 0,
    operationId: "00000000-0000-4000-8000-000000000106",
    payload: fillingWithoutHistory,
  });
  psql(`
set role authenticated;
set request.jwt.claim.sub = '${agentId}';
do $$
begin
  perform ${fillingCall};
  raise exception 'review handoff without typed history unexpectedly committed';
exception when check_violation then
  null;
end;
$$;
`);

  const fillingApplicants = normalizeApplicants("submission-filling", [
    {
      id: "applicant-submission-filling",
      role: "Основной заявитель",
      submission_id: "submission-filling",
    },
  ]);
  const fillingMedia = completeMediaAssets(
    "submission-filling",
    fillingApplicants,
  );
  seedStorageObjects(fillingMedia);
  const fillingHistory = [
    {
      from_status: "in_progress",
      source: "agent",
      to_status: "submitted_for_review",
    },
  ];
  const emptyQuestionnairePayload = mutationPayload({
    applicants: fillingApplicants,
    history: fillingHistory,
    id: "submission-filling",
    mediaAssets: fillingMedia,
    questionnaireAnswers: [],
    status: "waiting_review",
    title: "Spoofed complete questionnaire",
  });
  assertCheckViolation(
    callAgentMutation({
      expectedRevision: 0,
      operationId: "00000000-0000-4000-8000-000000000118",
      payload: emptyQuestionnairePayload,
    }),
  );

  const partialQuestionnaire = completeQuestionnaireAnswers(
    "submission-filling",
    fillingApplicants,
  ).slice(0, 1);
  const partialQuestionnairePayload = mutationPayload({
    applicants: fillingApplicants,
    history: fillingHistory,
    id: "submission-filling",
    mediaAssets: fillingMedia,
    questionnaireAnswers: partialQuestionnaire,
    status: "waiting_review",
    title: "Partial questionnaire",
  });
  assertCheckViolation(
    callAgentMutation({
      expectedRevision: 0,
      operationId: "00000000-0000-4000-8000-000000000119",
      payload: partialQuestionnairePayload,
    }),
  );

  const conditionalQuestionnaireCases = [
    {
      fieldId: "lives-outside-citizenship",
      operationId: "00000000-0000-4000-8000-000000000124",
      title: "Missing residence permit details",
      value: "Да",
    },
    {
      fieldId: "previous-biometrics",
      operationId: "00000000-0000-4000-8000-000000000125",
      title: "Missing previous biometrics date",
      value: "Да",
    },
    {
      fieldId: "purpose",
      operationId: "00000000-0000-4000-8000-000000000126",
      title: "Missing company invitation details",
      value: "BUSINESS",
    },
  ];
  for (const conditionalCase of conditionalQuestionnaireCases) {
    const conditionalQuestionnaire = completeQuestionnaireAnswers(
      "submission-filling",
      fillingApplicants,
    ).map((answer) =>
      answer.field_id === conditionalCase.fieldId
        ? { ...answer, value: conditionalCase.value }
        : answer,
    );
    const conditionalPayload = mutationPayload({
      applicants: fillingApplicants,
      history: fillingHistory,
      id: "submission-filling",
      mediaAssets: fillingMedia,
      questionnaireAnswers: conditionalQuestionnaire,
      status: "waiting_review",
      title: conditionalCase.title,
    });
    assertCheckViolation(
      callAgentMutation({
        expectedRevision: 0,
        operationId: conditionalCase.operationId,
        payload: conditionalPayload,
      }),
    );
  }

  const phantomApplicants = normalizeApplicants("submission-phantom", [
    {
      id: "applicant-submission-phantom",
      role: "Основной заявитель",
      submission_id: "submission-phantom",
    },
  ]);
  const phantomMedia = completeMediaAssets(
    "submission-phantom",
    phantomApplicants,
  );
  const phantomStoragePayload = mutationPayload({
    applicants: phantomApplicants,
    history: fillingHistory,
    id: "submission-phantom",
    mediaAssets: phantomMedia,
    status: "waiting_review",
    title: "Phantom Storage package",
  });
  assertCheckViolation(
    callAgentMutation({
      expectedRevision: 0,
      operationId: "00000000-0000-4000-8000-000000000120",
      payload: phantomStoragePayload,
    }),
  );

  const invalidSnapshotPayload = mutationPayload({
    id: "submission-invalid-snapshot",
    snapshotMutation: (snapshot) => ({
      ...snapshot,
      applicants: snapshot.applicants.map((applicant) => ({
        ...applicant,
        fullName: "Spoofed Applicant",
      })),
    }),
    title: "Invalid snapshot",
  });
  assertCheckViolation(
    callAgentMutation({
      expectedRevision: null,
      operationId: "00000000-0000-4000-8000-000000000121",
      payload: invalidSnapshotPayload,
    }),
  );

  const spoofedApplicantProjectionPayload = mutationPayload({
    applicants: [
      {
        id: "applicant-spoofed-projection",
        passport_number: "SPOOFED-PASSPORT",
        role: "Основной заявитель",
        submission_id: "submission-spoofed-projection",
      },
    ],
    id: "submission-spoofed-projection",
    title: "Spoofed normalized applicant",
  });
  assertCheckViolation(
    callAgentMutation({
      expectedRevision: null,
      operationId: "00000000-0000-4000-8000-000000000127",
      payload: spoofedApplicantProjectionPayload,
    }),
  );

  const crossSectionId = "submission-cross-section-answer";
  const crossSectionApplicants = normalizeApplicants(crossSectionId);
  const crossSectionQuestionnaire = [
    ...completeQuestionnaireAnswers(crossSectionId, crossSectionApplicants),
    {
      applicant_id: crossSectionApplicants[0].id,
      field_id: "email",
      label: "Email in wrong section",
      section_id: `${crossSectionApplicants[0].id}-trip`,
      submission_id: crossSectionId,
      updated_by: agentId,
      value: "cross-section@example.com",
    },
  ];
  const crossSectionPayload = mutationPayload({
    applicants: crossSectionApplicants,
    id: crossSectionId,
    questionnaireAnswers: crossSectionQuestionnaire,
    title: "Cross-section questionnaire collision",
  });
  assertCheckViolation(
    callAgentMutation({
      expectedRevision: null,
      operationId: "00000000-0000-4000-8000-000000000131",
      payload: crossSectionPayload,
    }),
  );

  const forgedAdminMetadataApplicants = normalizeApplicants(
    "submission-forged-admin-metadata",
  );
  const forgedAdminMetadataQuestionnaire = completeQuestionnaireAnswers(
    "submission-forged-admin-metadata",
    forgedAdminMetadataApplicants,
  ).map((answer) =>
    answer.field_id === "email"
      ? {
          ...answer,
          value: {
            adminReviewApprovedAtIso: "2026-07-29T10:00:00.000Z",
            adminReviewApprovedBy: "forged-admin",
            kind: "v19_questionnaire_field",
            value: semanticQuestionnaireValue(answer.value),
            version: 1,
          },
        }
      : answer,
  );
  const forgedAdminMetadataPayload = mutationPayload({
    applicants: forgedAdminMetadataApplicants,
    id: "submission-forged-admin-metadata",
    questionnaireAnswers: forgedAdminMetadataQuestionnaire,
    title: "Forged Admin metadata",
  });
  assertInsufficientPrivilege(
    callAgentMutation({
      expectedRevision: null,
      operationId: "00000000-0000-4000-8000-000000000128",
      payload: forgedAdminMetadataPayload,
    }),
  );

  const approvedAnswerApplicants = normalizeApplicants(
    "submission-approved-answer",
    [
      {
        id: "applicant-approved-answer",
        role: "Основной заявитель",
        submission_id: "submission-approved-answer",
      },
    ],
  );
  const removedUnchangedApprovalPayload = mutationPayload({
    applicants: approvedAnswerApplicants,
    id: "submission-approved-answer",
    title: "Removed unchanged approval",
  });
  assertInsufficientPrivilege(
    callAgentMutation({
      expectedRevision: 0,
      operationId: "00000000-0000-4000-8000-000000000129",
      payload: removedUnchangedApprovalPayload,
    }),
  );

  const correctedEmail = "corrected-agent-flow@example.com";
  const correctedApprovedApplicants = normalizeApplicants(
    "submission-approved-answer",
    [
      {
        email: correctedEmail,
        id: "applicant-approved-answer",
        role: "Основной заявитель",
        submission_id: "submission-approved-answer",
      },
    ],
  );
  const correctedApprovedQuestionnaire = completeQuestionnaireAnswers(
    "submission-approved-answer",
    correctedApprovedApplicants,
  ).map((answer) =>
    answer.field_id === "email"
      ? { ...answer, value: correctedEmail }
      : answer,
  );
  const correctedApprovedPayload = mutationPayload({
    applicants: correctedApprovedApplicants,
    id: "submission-approved-answer",
    questionnaireAnswers: correctedApprovedQuestionnaire,
    title: "Corrected approved answer",
  });
  psql(`
set role authenticated;
set request.jwt.claim.sub = '${agentId}';
select ${callAgentMutation({
    expectedRevision: 0,
    operationId: "00000000-0000-4000-8000-000000000130",
    payload: correctedApprovedPayload,
  })};
`);
  const clearedApprovalProof = psql(`
select
  app_private.questionnaire_semantic_text(answer.value) || ':' ||
  (answer.value ? 'adminReviewApprovedAtIso')::text || ':' ||
  (answer.value ? 'adminReviewApprovedBy')::text
from public.questionnaire_answers as answer
where answer.applicant_id = 'applicant-approved-answer'
  and answer.section_id = 'applicant-approved-answer-contacts'
  and answer.field_id = 'email';
`);
  if (clearedApprovalProof !== `${correctedEmail}:false:false`) {
    throw new Error(
      `Changed Agent answer did not clear Admin approval: ${clearedApprovalProof}`,
    );
  }

  const injectedHistoryPayload = mutationPayload({
    history: [
      {
        from_status: "draft",
        source: "admin",
        to_status: "in_progress",
      },
    ],
    id: "submission-injected-history",
    status: "draft",
    title: "Injected history",
  });
  assertCheckViolation(
    callAgentMutation({
      expectedRevision: null,
      operationId: "00000000-0000-4000-8000-000000000122",
      payload: injectedHistoryPayload,
    }),
  );

  const failedHandoffProof = psql(`
select status::text || ':' || case_revision::text
from public.submissions
where id in ('submission-filling', 'submission-phantom')
order by id;
`);
  if (failedHandoffProof !== "filling:0\nfilling:0") {
    throw new Error(
      `Failed package handoffs changed durable lifecycle: ${failedHandoffProof}`,
    );
  }

  const exportReadyApplicants = normalizeApplicants(
    "submission-export-ready",
    [
      {
        id: "applicant-export-ready",
        role: "Основной заявитель",
        submission_id: "submission-export-ready",
      },
    ],
  );
  const exportReadyMedia = completeMediaAssets(
    "submission-export-ready",
    exportReadyApplicants,
  );
  seedStorageObjects(exportReadyMedia);
  const exportReadyPayload = mutationPayload({
    applicants: exportReadyApplicants,
    id: "submission-export-ready",
    status: "waiting_review",
    title: "Export ready resubmitted",
    history: [
      {
        from_status: "ready_for_export",
        source: "agent",
        to_status: "submitted_for_review",
      },
    ],
    mediaAssets: exportReadyMedia,
  });
  const exportReadyCall = callAgentMutation({
    expectedRevision: 5,
    operationId: "00000000-0000-4000-8000-000000000107",
    payload: exportReadyPayload,
  });
  const resubmitProof = psql(`
set role authenticated;
set request.jwt.claim.sub = '${agentId}';
select ${exportReadyCall};
select
  submission.status::text || ':' ||
  submission.case_revision::text || ':' ||
  coalesce(submission.accepted_at::text, 'cleared') || ':' ||
  media.review_status::text || ':' ||
  coalesce(media.reviewed_at::text, 'cleared')
from public.submissions as submission
join public.media_assets as media
  on media.submission_id = submission.id
where submission.id = 'submission-export-ready';
`)
    .split("\n")
    .at(-1);
  if (resubmitProof !== "waiting_review:6:cleared:not_reviewed:cleared") {
    throw new Error(`Export-ready resubmission did not clear state: ${resubmitProof}`);
  }

  process.stdout.write("agent_submission_concurrency_postgres: PASS\n");
} finally {
  spawnSync("docker", ["rm", "-f", containerName], {
    encoding: "utf8",
  });
}

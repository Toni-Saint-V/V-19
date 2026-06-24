-- VisaFlow V-19 local development seed.
-- Use only with local Supabase reset/start workflows. Do not run against production.
-- The passwords below are fake local credentials, not secrets.

create extension if not exists pgcrypto;

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
values
  (
    '10000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'agent.dev@visaflow.local',
    crypt('visaflow-local-agent', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Dev Agent"}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'admin.dev@visaflow.local',
    crypt('visaflow-local-admin', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Dev Admin"}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  )
on conflict (id) do update set
  email = excluded.email,
  encrypted_password = excluded.encrypted_password,
  email_confirmed_at = excluded.email_confirmed_at,
  raw_app_meta_data = excluded.raw_app_meta_data,
  raw_user_meta_data = excluded.raw_user_meta_data,
  updated_at = now();

insert into auth.identities (
  id,
  user_id,
  provider_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
values
  (
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'agent.dev@visaflow.local',
    '{"sub":"10000000-0000-4000-8000-000000000001","email":"agent.dev@visaflow.local","email_verified":true,"phone_verified":false}'::jsonb,
    'email',
    now(),
    now(),
    now()
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000002',
    'admin.dev@visaflow.local',
    '{"sub":"10000000-0000-4000-8000-000000000002","email":"admin.dev@visaflow.local","email_verified":true,"phone_verified":false}'::jsonb,
    'email',
    now(),
    now(),
    now()
  )
on conflict (provider_id, provider) do update set
  user_id = excluded.user_id,
  identity_data = excluded.identity_data,
  updated_at = now();

insert into public.profiles (
  id,
  email,
  display_name,
  organization_name,
  role
)
values
  (
    '10000000-0000-4000-8000-000000000001',
    'agent.dev@visaflow.local',
    'Dev Agent',
    'VisaFlow Local',
    'agent'
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    'admin.dev@visaflow.local',
    'Dev Admin',
    'VisaFlow Local',
    'admin'
  )
on conflict (id) do update set
  email = excluded.email,
  display_name = excluded.display_name,
  organization_name = excluded.organization_name,
  role = excluded.role;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', false);
select set_config('request.jwt.claim.role', 'authenticated', false);

delete from public.export_batches
where id = '30000000-0000-4000-8000-000000000001'
  or idempotency_key = 'dev-seed-export-preflight-blocked';

delete from public.status_history
where changed_by in (
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002'
)
and (
  entity_id like 'VF-SEED-%'
  or entity_id like 'APP-SEED-%'
  or entity_id like 'MEDIA-SEED-%'
);

delete from public.submissions
where id like 'VF-SEED-%';

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
values
  (
    'VF-SEED-1042',
    '10000000-0000-4000-8000-000000000001',
    'single',
    'Returned local seed case',
    'Испания',
    'Madrid',
    '2026-07-10',
    'returned',
    'Высокий',
    64,
    '{"devSeed":true,"sourceStatus":"returned_with_open_issue"}'::jsonb,
    'not_started',
    now() - interval '8 days',
    now() - interval '7 days',
    null,
    null,
    now() - interval '2 hours'
  ),
  (
    'VF-SEED-1043',
    '10000000-0000-4000-8000-000000000001',
    'single',
    'In progress local seed case',
    'Испания',
    'Barcelona',
    '2026-07-18',
    'filling',
    'Средний',
    42,
    '{"devSeed":true,"sourceStatus":"in_progress"}'::jsonb,
    'not_started',
    null,
    null,
    null,
    null,
    now() - interval '1 hour'
  ),
  (
    'VF-SEED-1044',
    '10000000-0000-4000-8000-000000000001',
    'family',
    'Submitted family local seed case',
    'Испания',
    'Madrid',
    '2026-08-02',
    'waiting_review',
    'Средний',
    78,
    '{"devSeed":true,"sourceStatus":"submitted_for_review","status":"confirmed"}'::jsonb,
    'not_started',
    now() - interval '3 days',
    null,
    null,
    null,
    now() - interval '45 minutes'
  ),
  (
    'VF-SEED-1045',
    '10000000-0000-4000-8000-000000000001',
    'single',
    'Corrections received local seed case',
    'Испания',
    'Valencia',
    '2026-08-11',
    'ready_for_review',
    'Высокий',
    86,
    '{"devSeed":true,"sourceStatus":"corrections_received"}'::jsonb,
    'not_started',
    now() - interval '6 days',
    now() - interval '5 days',
    null,
    null,
    now() - interval '25 minutes'
  ),
  (
    'VF-SEED-1046',
    '10000000-0000-4000-8000-000000000001',
    'family',
    'Ready for export local seed case',
    'Испания',
    'Madrid',
    '2026-08-20',
    'ready_for_excel',
    'Низкий',
    96,
    (
      select jsonb_build_object(
        'devSeed', true,
        'sourceStatus', 'ready_for_export',
        'status', 'confirmed',
        'exportMappingAudit', jsonb_build_object(
          'range', 'A:BD',
          'rowCount', 56,
          'duplicateCheckStatus', 'unknown',
          'downloadEnabled', false,
          'rows', jsonb_agg(
            jsonb_build_object(
              'column', n,
              'excelColumn', case
                when n <= 26 then chr(64 + n)
                else 'A' || chr(64 + n - 26)
              end,
              'state', case when n = 56 then 'unresolved' else 'mapped' end
            )
            order by n
          )
        )
      )
      from generate_series(1, 56) as mapping(n)
    ),
    'not_started',
    now() - interval '7 days',
    now() - interval '6 days',
    now() - interval '1 day',
    null,
    now() - interval '10 minutes'
  );

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
)
values
  ('APP-SEED-1042-1', 'VF-SEED-1042', 'Demo Applicant 1042', 'Главный заявитель', 'Главный заявитель', true, '1990-01-10', null, 'Demo citizenship', 'Demo address 1042', '+10000001042', 'applicant1042@example.invalid', 'P-SEED-1042', '2020-01-10', '2030-01-10', 'Испания', 'Madrid', '2026-07-10 - 2026-07-20', 'Demo Hotel Madrid', 'Demo hotel address', 72, 50),
  ('APP-SEED-1043-1', 'VF-SEED-1043', 'Demo Applicant 1043', 'Главный заявитель', 'Главный заявитель', true, '1991-02-11', null, 'Demo citizenship', 'Demo address 1043', '+10000001043', 'applicant1043@example.invalid', 'P-SEED-1043', '2021-02-11', '2031-02-11', 'Испания', 'Barcelona', '2026-07-18 - 2026-07-25', 'Demo Hotel Barcelona', 'Demo hotel address', 40, 25),
  ('APP-SEED-1044-1', 'VF-SEED-1044', 'Demo Adult 1044', 'Главный заявитель', 'Главный заявитель', true, '1988-03-12', null, 'Demo citizenship', 'Demo address 1044', '+10000001044', 'adult1044@example.invalid', 'P-SEED-1044-A', '2019-03-12', '2029-03-12', 'Испания', 'Madrid', '2026-08-02 - 2026-08-12', 'Demo Hotel Madrid', 'Demo hotel address', 82, 60),
  ('APP-SEED-1044-2', 'VF-SEED-1044', 'Demo Child 1044', 'Ребенок', 'Ребенок', true, '2016-04-13', null, 'Demo citizenship', 'Demo address 1044', '+10000001045', 'child1044@example.invalid', 'P-SEED-1044-B', '2022-04-13', '2032-04-13', 'Испания', 'Madrid', '2026-08-02 - 2026-08-12', 'Demo Hotel Madrid', 'Demo hotel address', 74, 60),
  ('APP-SEED-1045-1', 'VF-SEED-1045', 'Demo Applicant 1045', 'Главный заявитель', 'Главный заявитель', true, '1992-05-14', null, 'Demo citizenship', 'Demo address 1045', '+10000001046', 'applicant1045@example.invalid', 'P-SEED-1045', '2018-05-14', '2028-05-14', 'Испания', 'Valencia', '2026-08-11 - 2026-08-18', 'Demo Hotel Valencia', 'Demo hotel address', 90, 75),
  ('APP-SEED-1046-1', 'VF-SEED-1046', 'Demo Adult 1046', 'Главный заявитель', 'Главный заявитель', true, '1987-06-15', null, 'Demo citizenship', 'Demo address 1046', '+10000001047', 'adult1046@example.invalid', 'P-SEED-1046-A', '2020-06-15', '2030-06-15', 'Испания', 'Madrid', '2026-08-20 - 2026-08-30', 'Demo Hotel Madrid', 'Demo hotel address', 100, 80),
  ('APP-SEED-1046-2', 'VF-SEED-1046', 'Demo Child 1046', 'Ребенок', 'Ребенок', true, '2015-07-16', null, 'Demo citizenship', 'Demo address 1046', '+10000001048', 'child1046@example.invalid', 'P-SEED-1046-B', '2021-07-16', '2031-07-16', 'Испания', 'Madrid', '2026-08-20 - 2026-08-30', 'Demo Hotel Madrid', 'Demo hotel address', 100, 80)
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
  updated_at = now();

insert into public.questionnaire_answers (
  submission_id,
  applicant_id,
  section_id,
  field_id,
  label,
  value,
  updated_by
)
select
  applicant_seed.submission_id,
  applicant_seed.id,
  answer_seed.section_id,
  answer_seed.field_id,
  answer_seed.label,
  answer_seed.value,
  '10000000-0000-4000-8000-000000000001'
from public.applicants as applicant_seed
cross join (
  values
    ('identity', 'full_name', 'Full name', '"Demo filled value"'::jsonb),
    ('trip', 'trip_purpose', 'Trip purpose', '"Tourism"'::jsonb),
    ('contacts', 'phone', 'Phone', '"Dev phone only"'::jsonb)
) as answer_seed(section_id, field_id, label, value)
where applicant_seed.id like 'APP-SEED-%'
on conflict (applicant_id, section_id, field_id) do update set
  label = excluded.label,
  value = excluded.value,
  updated_by = excluded.updated_by,
  updated_at = now();

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
  'MEDIA-SEED-' || replace(applicant_seed.id, 'APP-SEED-', '') || '-' || slot_seed.type,
  applicant_seed.id,
  applicant_seed.submission_id,
  slot_seed.type::public.media_slot_type,
  case
    when submission_seed.status in ('waiting_review', 'ready_for_review', 'ready_for_excel')
      and slot_seed.type in ('photo_white', 'selfie', 'video', 'passport_scan')
      then 'dev-seed-' || lower(replace(applicant_seed.id, 'APP-SEED-', '')) || '-' || slot_seed.type || '.' || slot_seed.extension
    else null
  end,
  case
    when submission_seed.status in ('waiting_review', 'ready_for_review', 'ready_for_excel')
      and slot_seed.type in ('photo_white', 'selfie', 'video', 'passport_scan')
      then slot_seed.type || '-dev-seed.' || slot_seed.extension
    else null
  end,
  'submission-media',
  applicant_seed.submission_id || '/' || applicant_seed.id || '/' || slot_seed.type || '/' ||
    case
      when submission_seed.status in ('waiting_review', 'ready_for_review', 'ready_for_excel')
        and slot_seed.type in ('photo_white', 'selfie', 'video', 'passport_scan')
        then slot_seed.type || '-dev-seed.' || slot_seed.extension
      else 'pending.' || slot_seed.extension
    end,
  slot_seed.mime_type,
  case
    when submission_seed.status in ('waiting_review', 'ready_for_review', 'ready_for_excel')
      and slot_seed.type in ('photo_white', 'selfie', 'video', 'passport_scan')
      then slot_seed.size_bytes
    else null
  end,
  case
    when submission_seed.status in ('waiting_review', 'ready_for_review', 'ready_for_excel')
      and slot_seed.type in ('photo_white', 'selfie', 'video', 'passport_scan')
      then 'uploaded'::public.media_upload_status
    else 'none'::public.media_upload_status
  end,
  case
    when submission_seed.status in ('waiting_review', 'ready_for_review', 'ready_for_excel')
      and slot_seed.type in ('photo_white', 'selfie', 'video', 'passport_scan')
      then 'accepted'::public.media_review_status
    else 'not_reviewed'::public.media_review_status
  end,
  case
    when submission_seed.status in ('waiting_review', 'ready_for_review', 'ready_for_excel')
      and slot_seed.type in ('photo_white', 'selfie', 'video', 'passport_scan')
      then now() - interval '4 days'
    else null
  end,
  case
    when submission_seed.status in ('waiting_review', 'ready_for_review', 'ready_for_excel')
      and slot_seed.type in ('photo_white', 'selfie', 'video', 'passport_scan')
      then now() - interval '3 days'
    else null
  end,
  case
    when submission_seed.status in ('waiting_review', 'ready_for_review', 'ready_for_excel')
      and slot_seed.type in ('photo_white', 'selfie', 'video', 'passport_scan')
      then '10000000-0000-4000-8000-000000000002'::uuid
    else null::uuid
  end
from public.applicants as applicant_seed
join public.submissions as submission_seed
  on submission_seed.id = applicant_seed.submission_id
cross join (
  values
    ('photo_white', 'jpg', 'image/jpeg', 12800),
    ('selfie', 'jpg', 'image/jpeg', 12800),
    ('selfie_2', 'jpg', 'image/jpeg', 12800),
    ('passport_scan', 'pdf', 'application/pdf', 32768),
    ('video', 'mp4', 'video/mp4', 65536)
) as slot_seed(type, extension, mime_type, size_bytes)
where applicant_seed.id like 'APP-SEED-%'
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
values
  ('40000000-0000-4000-8000-000000000001', 'VF-SEED-1042', 'APP-SEED-1042-1', 'field', 'passport_number', null, 'Passport number requires correction in the questionnaire target field.', 'blocking', 'open', '10000000-0000-4000-8000-000000000002', now() - interval '2 days', null),
  ('40000000-0000-4000-8000-000000000002', 'VF-SEED-1042', 'APP-SEED-1042-1', 'media', null, 'passport_scan', 'Passport scan must be replaced through a real upload.', 'blocking', 'open', '10000000-0000-4000-8000-000000000002', now() - interval '2 days', null),
  ('40000000-0000-4000-8000-000000000003', 'VF-SEED-1045', 'APP-SEED-1045-1', 'field', 'phone', null, 'Agent changed the exact target field; admin closure is still pending.', 'blocking', 'fixed', '10000000-0000-4000-8000-000000000002', now() - interval '4 days', now() - interval '1 day'),
  ('40000000-0000-4000-8000-000000000004', 'VF-SEED-1046', 'APP-SEED-1046-1', 'submission', null, null, 'Admin closed local seed readiness note.', 'note', 'closed', '10000000-0000-4000-8000-000000000002', now() - interval '5 days', now() - interval '4 days')
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
values
  ('50000000-0000-4000-8000-000000000001', 'submission', 'VF-SEED-1042', 'waiting_review', 'returned', 'Local seed returned case with open exact-target issues.', '10000000-0000-4000-8000-000000000002', now() - interval '2 days'),
  ('50000000-0000-4000-8000-000000000002', 'submission', 'VF-SEED-1043', 'draft', 'filling', 'Local seed draft moved to in-progress equivalent.', '10000000-0000-4000-8000-000000000001', now() - interval '1 day'),
  ('50000000-0000-4000-8000-000000000003', 'submission', 'VF-SEED-1044', 'ready_for_review', 'waiting_review', 'Local seed submitted for admin review.', '10000000-0000-4000-8000-000000000001', now() - interval '3 days'),
  ('50000000-0000-4000-8000-000000000004', 'submission', 'VF-SEED-1045', 'returned', 'ready_for_review', 'Local seed corrections received from agent.', '10000000-0000-4000-8000-000000000001', now() - interval '1 day'),
  ('50000000-0000-4000-8000-000000000005', 'submission', 'VF-SEED-1046', 'accepted', 'ready_for_excel', 'Local seed export preflight remains blocked until real generation is implemented.', '10000000-0000-4000-8000-000000000002', now() - interval '10 minutes')
on conflict (id) do nothing;

insert into public.export_batches (
  id,
  created_by,
  format,
  row_count,
  submission_ids,
  idempotency_key,
  content_fingerprint,
  file_name
)
values (
  '30000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  'xlsx',
  2,
  array['VF-SEED-1046'],
  'dev-seed-export-preflight-blocked',
  null,
  null
)
on conflict (id) do update set
  format = excluded.format,
  row_count = excluded.row_count,
  submission_ids = excluded.submission_ids,
  idempotency_key = excluded.idempotency_key,
  content_fingerprint = excluded.content_fingerprint,
  file_name = excluded.file_name;

select set_config('request.jwt.claim.sub', '', false);
select set_config('request.jwt.claim.role', '', false);

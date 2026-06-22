alter table public.ai_helper_audit_events
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists ai_helper_audit_events_passport_openai_attempt_idx
on public.ai_helper_audit_events
using btree ((metadata ->> 'document_fingerprint'), created_at desc)
where intent = 'passport_extraction'
  and metadata ->> 'provider' = 'openai'
  and metadata ->> 'openai_attempted' = 'true';

create table if not exists public.passport_extraction_openai_attempts (
  document_fingerprint text primary key,
  storage_path text not null,
  actor_id text,
  actor_role text check (actor_role is null or actor_role in ('agent', 'admin')),
  request_id text,
  created_at timestamptz not null default now()
);

alter table public.passport_extraction_openai_attempts enable row level security;

revoke all on table public.passport_extraction_openai_attempts from anon, authenticated;
grant select, insert on table public.passport_extraction_openai_attempts to service_role;

drop policy if exists "passport extraction openai attempts service only"
  on public.passport_extraction_openai_attempts;

create policy "passport extraction openai attempts service only"
on public.passport_extraction_openai_attempts for all
to service_role
using (true)
with check (true);

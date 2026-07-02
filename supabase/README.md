# VisaFlow AI Supabase Foundation

Block #5 adds a persistence-ready Supabase boundary without requiring live keys.

## Frontend env

Use only public browser variables:

```bash
VITE_SUPABASE_BACKEND_TARGET=supabase
VITE_SUPABASE_SANDBOX_PROBE_ENABLED=true
VITE_SUPABASE_PROJECT_ID=oevvaowoklqttqkraxho
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_SUPABASE_ANON_KEY=
VITE_SUPABASE_EDGE_FUNCTIONS_URL=
```

Do not place service-role, OpenAI, or other backend secrets in frontend env files.

`VITE_SUPABASE_ANON_KEY` is supported as the browser-safe Supabase anon key alias.
Do not define both keys with different values.

## Live smoke env

`npm run test:supabase-live` uses browser-safe Supabase clients and real user JWTs. It must not use a service-role key. Put local smoke credentials only in ignored `.env.supabase-smoke.local`; the smoke runner does not read `.env` or `.env.local`, and it requires `VITE_SUPABASE_ACTIVATION_TARGET=sandbox` plus the allow-listed V-19 sandbox project.

Required test accounts must already exist in Supabase Auth and have matching `public.profiles` rows:

```bash
SUPABASE_SMOKE_AGENT_EMAIL=
SUPABASE_SMOKE_AGENT_PASSWORD=
SUPABASE_SMOKE_OTHER_AGENT_EMAIL=
SUPABASE_SMOKE_OTHER_AGENT_PASSWORD=
SUPABASE_SMOKE_ADMIN_EMAIL=
SUPABASE_SMOKE_ADMIN_PASSWORD=
```

The smoke verifies owner reads/writes, cross-agent denial, admin review write access, private media upload, cross-agent Storage denial, and signed URL access.

The smoke upserts one deterministic `SMOKE-*` submission. It resets that row through the admin JWT at the start of each run and intentionally does not add runtime delete permissions. Clean sandbox smoke rows with a maintenance SQL session when needed.

## Production promotion gate

Production promotion is documented in `docs/release/supabase-production-promotion.md`.

Before any production migration or client activation, run:

```bash
npm run verify:supabase-release
npm run test:supabase-live
npm run verify:local-readiness
npm run verify:auth-data-readiness
npm run verify:full
```

`npm run verify:supabase-release` checks local migration order, RLS/Storage guard migrations, the sandbox-only smoke target guard, rollback documentation, and the production env evidence gate. `npm run test:supabase-live` remains sandbox-only; do not point it at production. `npm run verify:local-readiness` proves the local layer with local verification, security audit, and full Playwright E2E. `npm run verify:auth-data-readiness` proves the bounded Auth/Data contract and browser secret boundary. `npm run verify:full` runs local readiness, Auth/Data, and release checks before the fail-closed production packet, so a production `NO_GO` does not hide local proof. Production activation also requires `VITE_SUPABASE_ACTIVATION_TARGET=production` and `VITE_SUPABASE_PRODUCTION_APPROVED=true` after owner approval.

## Local/demo behavior

When the public Supabase values are missing, the app stays in local demo mode:

- demo role login remains available;
- no network persistence is attempted;
- storage helpers return `null` instead of pretending an upload happened;
- protected routes still enforce Agent/Admin screen boundaries.

## Local Supabase seed

`supabase/seed.sql` is a local development fixture only. It creates fake Supabase
Auth users, matching `public.profiles`, submissions, applicants, normalized
questionnaire answers, media metadata, corrections, status history, and one
export metadata record for local MVP testing.

Use it through the normal local Supabase reset/start workflow, for example:

```bash
supabase db reset
```

Local seeded credentials:

```bash
agent.dev@visaflow.local / visaflow-local-agent
admin.dev@visaflow.local / visaflow-local-admin
```

Seed safety boundaries:

- fake data only; no real personal data;
- no service-role key or frontend secret;
- no `storage.objects` rows are inserted;
- media rows are metadata-only and stay `none` / `not_reviewed`;
- export duplicate status is `unknown`;
- download is marked disabled in seed audit metadata;
- no OCR, AI decision, or generated Excel artifact is claimed.

Do not run `supabase/seed.sql` against sandbox or production.

## Backend target

`migrations/20260611000000_visaflow_mvp_foundation.sql` defines the MVP target:

- profiles and roles;
- submissions, applicants, media assets, corrections;
- export batches, appointments, status history;
- RLS policies scoped by agent/admin role;
- private `submission-media` storage bucket.

## AI helper function

`functions/ai-helper/index.ts` is a backend-safe stub for Block #7.

- Frontend calls should go through Supabase Functions, never directly to a model provider.
- Requests and responses use the shared contract in `functions/_shared/ai-helper-contract.ts`.
- Every request must include an actor with `id`, `role`, and `canUseAI`; admin review and export helpers require the admin role.
- Durable audit and quota are mandatory server-side boundaries. If the edge function is deployed without `SUPABASE_URL`, `SUPABASE_FUNCTION_ADMIN_KEY`, and quota wiring, it fails closed with `503` instead of silently using console-only or in-memory protection.
- `migrations/20260614000000_ai_helper_audit_quota.sql` creates the default audit table and `consume_ai_helper_quota` RPC with RLS enabled on helper audit/quota storage.
- Audit writes use `AI_HELPER_AUDIT_TABLE` or default `ai_helper_audit_events`. Rows must store only redacted metadata: `event`, `intent`, `actor_id`, `actor_role`, `request_id`, `reason`, and `created_at`; raw helper context, prompts, documents, and direct contact data must not be written.
- Quota checks use `AI_HELPER_QUOTA_RPC=consume_ai_helper_quota`. The RPC atomically consumes one helper allowance for `p_actor_id`, `p_actor_role`, `p_intent`, and `p_request_id`, then returns `remaining` and optional `reset_at`. Missing or failing quota storage returns `503`; exhausted quota returns `429`.
- The edge handler generates `request_id` server-side for audit/quota idempotency; client-supplied request IDs are ignored.
- Edge responses are parsed and safety-validated before UI consumption; unsafe copy fails closed.
- The edge handler records safe audit events for invoked, denied, quota-limited, quota-failed, provider-failed, and rejected helper calls.
- The model provider is behind `AiHelperProvider`; provider keys must remain in Supabase function secrets and provider failures return safe `502` errors.
- Model/provider keys must stay server-side in Supabase function secrets and must not use a `VITE_` prefix.
- Local model execution is server-side only: `AI_HELPER_PROVIDER_MODE=local_litellm` posts sanitized helper context to a LiteLLM OpenAI-compatible gateway such as a local Ollama-backed runtime. Browser code still calls only `ai-helper`.
- Provider input is rebuilt from aggregate facts, issue codes, readiness states, and anonymized applicant labels before execution. Raw names, contacts, passports, addresses, free text, storage paths, images, OCR/MRZ text, and document payloads must not reach the provider.
- Local/demo can use `AI_HELPER_ALLOW_STUB_PROVIDER=true` for `edge-stub` fallback. Staging/production fail closed when provider config is missing or invalid; paid cloud fallback is not part of this contract.
- The helper may summarize, explain, and draft text only.
- Deterministic validation remains the source of truth for blockers, submit guards, media state, and export eligibility.
- Human operators make final media/submission decisions.

# VisaFlow AI Supabase Foundation

Block #5 adds a persistence-ready Supabase boundary without requiring live keys.

## Frontend env

Use only public browser variables:

```bash
VITE_SUPABASE_BACKEND_TARGET=supabase
VITE_SUPABASE_SANDBOX_PROBE_ENABLED=true
VITE_SUPABASE_PROJECT_ID=your-isolated-sandbox-project-ref
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

The canonical sandbox descriptor is `config/supabase-sandbox-target.mjs`. It is
intentionally unassigned after the clean production cutover, so destructive
smoke and UI E2E fail closed until a dedicated disposable sandbox is reviewed
and recorded there. A project id supplied only through the smoke env is not an
allow-list.

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
npm run supabase:functions:check
```

`npm run verify:supabase-release` checks local migration order, RLS/Storage guard migrations, the sandbox-only smoke target guard, rollback documentation, and the production env evidence gate. `npm run test:supabase-live` remains sandbox-only; do not point it at production. `npm run verify:local-readiness` proves the local layer with local verification, security audit, and full Playwright E2E. `npm run verify:auth-data-readiness` proves the bounded Auth/Data contract and browser secret boundary. `npm run verify:full` runs local readiness, Auth/Data, and release checks before the fail-closed production packet, so a production `NO_GO` does not hide local proof. Production activation also requires `VITE_SUPABASE_ACTIVATION_TARGET=production` and `VITE_SUPABASE_PRODUCTION_APPROVED=true` after owner approval.

Apply the 57 tracked migrations only through the target-bound Supabase CLI wrapper:

```bash
npm run supabase:migrations:dry-run
npm run supabase:migrations:apply
```

Do not concatenate migrations into a SQL Editor bundle and do not reconstruct
`supabase_migrations.schema_migrations` manually. After the schema is applied,
the clean-cutover final state is read back with:

```bash
npm run verify:supabase-clean-cutover-state
npm run supabase:functions:verify-remote
```

The final data-state gate requires exactly one confirmed Auth user, one admin
profile, zero agent profiles, zero Auth/profile orphans, the exact canonical
public-table inventory, zero rows in every non-profile public product table,
and zero objects in every required private Storage bucket. Unexpected public
tables or Storage buckets also block activation. Pilot
provisioning is disabled while the readiness scope is
`supabase-production-cutover`.

Every migration receipt is bound to the ordered version/name/SQL SHA-256
contract. A failed CLI operation records a remote-history readback receipt and
sets `retryAllowed=false`; do not retry until the observed history is reconciled
as an exact immutable prefix. Existing migration versions must never be silently
reused with different SQL on an already-initialized target.

Edge Function deployment is target-bound and remains locked until the exact
project/generation confirmation requested by `npm run supabase:functions:deploy`
is supplied. The required functions are `access-request`, `ai-helper`, and
`passport-extract`. Remote verification requires the complete canonical Edge
secret-name contract and performs a read-only `/health` invocation against each
deployed function. Names and `/health` responses are diagnostic only: they can
never set readiness to PASS without exact deployed-source identity and real
handler semantic evidence. Public `/health` checks only the presence of the
canonical server-side configuration and never performs an admin database or AI
provider request. Privileged database/provider reachability belongs to the
operator-only semantic receipts. `passport-extract` reports the explicitly safe
manual-review fallback; automated OCR is not claimed by the public health gate.

After deployment, `npm run verify:deployment-identity` verifies that the
canonical Vercel alias serves a clean `supabase-production` bundle built from
the exact pre-activation Git SHA.

Tracked cutover readiness progresses only through
`awaiting-fresh-evidence -> evidence-complete`; both tracked phases are `NO_GO`.
An `approved/GO` transition is accepted only from an immutable external packet
bound to the tracked readiness SHA-256 and a detached owner signature over the
exact evidence root. The tracked packet can never self-declare approval.
Predictable `projectId:generation` confirmation strings do not authorize a
production write. Evidence files must be fresh and bound to the exact project,
cutover generation, Git SHA, source digest, timestamp, and SHA-256.

Production acceptance also requires temporary Agent and second-owner fixtures
to prove create/write/readback/reload, Admin readback, cross-owner database and
private Storage denial, and role-escalation denial. Those fixtures must be
removed before the final clean-state receipt, which requires zero agents and
exactly one confirmed admin.

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
- Requests keep the actor-shaped contract for browser compatibility, but deployed Supabase Functions derive the effective actor from the caller JWT plus `public.profiles`. Client-supplied actor fields are not trusted for access, quota, audit, or provider execution.
- Admin review and export helpers require a server-derived admin role.
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
- Provider input is rebuilt from aggregate numeric/boolean facts, fixed product enums, allowlisted issue codes, allowlisted readiness states, and anonymized applicant labels before execution. Unknown client-supplied strings are dropped. Raw names, contacts, passports, addresses, free text, storage paths, images, OCR/MRZ text, and document payloads must not reach the provider.
- Local/demo can use `AI_HELPER_ALLOW_STUB_PROVIDER=true` for `edge-stub` fallback only when `AI_HELPER_RUNTIME_ENV` and `AI_HELPER_PROVIDER_MODE` are explicitly configured. Missing or unknown provider env fails closed. Staging/production fail closed when provider config is missing or invalid; paid cloud fallback is not part of this contract.
- The helper may summarize, explain, and draft text only.
- Deterministic validation remains the source of truth for blockers, submit guards, media state, and export eligibility.
- Human operators make final media/submission decisions.

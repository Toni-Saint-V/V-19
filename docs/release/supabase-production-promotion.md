# Supabase Production Promotion Runbook

Do not apply these migrations to production from Codex without explicit owner approval.

This runbook promotes the task-first workspace persistence boundary from the proven sandbox contract to a production Supabase project. It is intentionally fail-closed: production activation is blocked until migration, RLS, Storage, browser QA, key audit, and owner approval evidence all exist.

## Current Scope

Promote only the agent workspace, intake continuation, readiness review, operator handoff, private media storage, and Supabase persistence guards.

Do not widen this promotion into auth redesign, billing, admin redesign, schema expansion beyond the committed migrations, or AI provider activation.

## Migration Order

Apply migrations in this exact order:

1. `20260611000000_visaflow_mvp_foundation.sql`
2. `20260612000000_visaflow_rls_performance_hardening.sql`
3. `20260612001000_visaflow_rpc_corrections_persistence.sql`
4. `20260613005039_visaflow_runtime_write_guards.sql`
5. `20260613010029_visaflow_rpc_submit_boundary.sql`

Dry-run checklist before production:

1. Confirm local order with `ls supabase/migrations | sort`.
2. Confirm the target migration history is empty or matches the already-applied prefix.
3. Confirm no migration is edited after sandbox proof.
4. Confirm `npm run verify:supabase-release` passes locally.
5. Confirm `npm run test:supabase-live` passes against the allow-listed sandbox.
6. Confirm `npm run verify:full` passes after the release gate is included.

## Final Sandbox RLS And Storage Smoke

Run this immediately before production approval:

```bash
npm run test:supabase-live
```

The live smoke is intentionally sandbox-only. It must keep using `.env.supabase-smoke.local`, `VITE_SUPABASE_ACTIVATION_TARGET=sandbox`, and the allow-listed V-19 sandbox project.

The smoke must prove:

- owner can save the draft and read their own case;
- another agent cannot read or write the case;
- incomplete `waiting_review` submission is rejected by server-side readiness;
- owner can upload required media before handoff;
- valid `ready_for_review` and `waiting_review` transitions work;
- admin can accept the case;
- owner cannot edit applicants/media or overwrite storage after accepted;
- another agent cannot create a signed URL for private media.

## Production Env Gate

Production client activation requires every evidence flag below. Do not enable the release switch until production migrations have been applied and reviewed.

```bash
VITE_SUPABASE_BACKEND_TARGET=supabase
VITE_SUPABASE_ACTIVATION_TARGET=production
VITE_SUPABASE_RELEASE_ENABLED=true
VITE_SUPABASE_TRANSACTIONAL_PERSISTENCE_TESTED=true
VITE_SUPABASE_MIGRATION_APPROVED=true
VITE_SUPABASE_MIGRATIONS_APPLIED=true
VITE_SUPABASE_RLS_POLICY_TESTS_PASSED=true
VITE_SUPABASE_STORAGE_POLICY_TESTS_PASSED=true
VITE_SUPABASE_EDGE_FUNCTION_DRY_RUNS_PASSED=true
VITE_SUPABASE_BROWSER_QA_PASSED=true
VITE_SUPABASE_BROWSER_KEY_AUDITED=true
VITE_SUPABASE_PRODUCTION_APPROVED=true
```

Browser env may contain only public Supabase values:

```bash
VITE_SUPABASE_PROJECT_ID=
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_SUPABASE_EDGE_FUNCTIONS_URL=
```

Never expose service-role keys, model provider keys, private tokens, or smoke account passwords through `VITE_` variables.

## Rollback Boundary

Preferred rollback is application-level:

1. Set `VITE_SUPABASE_RELEASE_ENABLED=false`.
2. If needed, set `VITE_SUPABASE_BACKEND_TARGET=local-demo`.
3. Redeploy the frontend.
4. Leave the stricter database RLS and trigger guards in place unless a reviewed forward rollback migration is approved.

Database rollback must be a forward migration, not ad hoc console edits. Do not drop RLS policies, readiness triggers, correction actor triggers, or private storage policies in production without a replacement migration and fresh RLS smoke.

If a production migration fails mid-sequence:

1. Stop applying new migrations.
2. Capture the exact migration name, SQL error, and target project id.
3. Keep client activation disabled.
4. Compare target migration history to the local order.
5. Prepare a forward repair migration or restore from the approved Supabase backup path.

## Stop Conditions

Stop before production activation if any item is true:

- migration history differs from the local order;
- `npm run verify:supabase-release` fails;
- `npm run test:supabase-live` fails in sandbox;
- `npm run verify:full` fails;
- any smoke account has elevated permissions beyond the intended role;
- browser key audit finds a secret or service-role key;
- agent can mutate applicant, media, correction, or storage after accepted;
- readiness can be bypassed with incomplete applicant data, missing media, or open blocking corrections;
- owner approval for production is missing.

## Promotion Verdict Template

```text
Target:
Migration history:
Sandbox RLS smoke:
Storage smoke:
Browser QA:
Key audit:
Rollback path:
Production approval:
Verdict:
```

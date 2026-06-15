# Supabase Production Migration Evidence - 2026-06-15

Target project: `tsymifccglpepvbmrcgh`
Project name: `Visa V-19 Production`
Region: `eu-north-1`
Status: `ACTIVE_HEALTHY`

## Commands

- `supabase link --project-ref tsymifccglpepvbmrcgh`
- `supabase migration list`
- `supabase db push`
- `supabase migration list`
- `npm run format:check`
- `npm run verify:supabase-release`
- `node scripts/verify-production-readiness.mjs --expect-blocked`
- `npm run test:e2e:supabase`

## Applied Migrations

Remote migration history matches local committed migrations:

- `20260611000000_visaflow_mvp_foundation`
- `20260612000000_visaflow_rls_performance_hardening`
- `20260612001000_visaflow_rpc_corrections_persistence`
- `20260613005039_visaflow_runtime_write_guards`
- `20260613010029_visaflow_rpc_submit_boundary`
- `20260614000000_ai_helper_audit_quota`

No sandbox seed or copied sandbox data was applied.

## Production Schema Proof

Post-push read-only schema verification:

- Public base tables: `11`
- Public tables with RLS enabled: `11`
- Public tables without RLS: `0`
- Public RLS policies: `17`
- Storage buckets: `1`
- Private `submission-media` bucket: `1`
- Public storage buckets: `0`
- `submission-media` storage policies: `4`

`supabase db dump` repeat proof was not used for final evidence because the CLI required `SUPABASE_DB_PASSWORD`. Per production hard rule, no password/token was requested or entered by the agent.

## Verification

- `npm run format:check`: passed
- `npm run verify:supabase-release`: passed, 42 checks
- `node scripts/verify-production-readiness.mjs --expect-blocked`: passed fail-closed, 34 blockers remain
- `npm run test:e2e:supabase`: passed, 1 Playwright browser key audit
- `git diff --check`: passed

## Remaining Blockers

Production activation remains `NO_GO` until promotion window, role-verified smoke accounts, backup/restore evidence, production env activation flags, browser QA, logs, and post-activation checks are complete.

Supabase advisor risk remains open:

- Security-definer quota RPC is executable by `anon` and `authenticated`.
- Leaked password protection is not enabled.
- AI helper quota/audit tables are RLS-enabled but have no direct table policies.

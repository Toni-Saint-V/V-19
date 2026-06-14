# Supabase Production Promotion Runbook

Do not apply these migrations to production from Codex without explicit owner approval.

Use this runbook only after the owner confirms the production target, rollout owner, backup path, and promotion window. The approval record lives in `supabase-production-approval-checklist.md`; the review handoff lives in `supabase-workspace-pr-package.md`.

## Scope

This runbook covers Supabase data, RLS, Storage, RPC, and activation guardrails only. It does not approve product behavior outside the Supabase release boundary or production traffic.

## Migration Order

Apply only this ordered migration set:

1. `20260611000000_visaflow_mvp_foundation.sql`
2. `20260612000000_visaflow_rls_performance_hardening.sql`
3. `20260612001000_visaflow_rpc_corrections_persistence.sql`
4. `20260613005039_visaflow_runtime_write_guards.sql`
5. `20260613010029_visaflow_rpc_submit_boundary.sql`

Before applying, confirm the target history is empty or already contains an exact prefix of this order. Stop if the target contains unrelated migration history.

## Final Sandbox RLS And Storage Smoke

Run the final sandbox proof immediately before production approval:

```bash
npm run verify:supabase-release
npm run test:supabase-live
```

Required evidence:

- sandbox project id is `oevvaowoklqttqkraxho`;
- live smoke uses `.env.supabase-smoke.local`;
- incomplete review submit is rejected;
- valid `waiting_review` transition succeeds;
- owner Storage overwrite after handoff is blocked;
- cross-agent access remains denied.

## Rollback Boundary

Rollback must be an owner-approved restore or forward repair path. Do not manually remove RLS policies, readiness triggers, correction actor triggers, Storage policies, or RPC boundary checks from production.

If activation must stop before data rollback, disable production Supabase activation first and record the rollback owner in `supabase-production-approval-checklist.md`.

## Production Env Gate

Set production activation flags only after migrations, approval, smoke, and browser key audit are complete:

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

Stop if any release verifier, live smoke, owner approval, backup, or target identity check is missing.

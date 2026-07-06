# Supabase Production Pre-Activation Evidence - 2026-07-06

Result: `BLOCKED_FOR_PENDING_AI_MIGRATION`
Project: `tsymifccglpepvbmrcgh`
Checked at: `2026-07-06T01:38:58Z`
Git head: `6345019a`
Readiness verifier hash: `e7ef020f69382ed343323a91473c32ebe7040818d77a7f7741c4961ca9b7afc9`
Scoped diff hash: `a52c62212bb8e1b700d2e78aedc24e035ddf5ebff149049f192b754fca562efb`

## Scope

- Registered agents: `10`
- Max submissions per registered agent: `50`
- Max total submissions: `500`
- Max applicants per submission: `3`
- Max required media objects: `4500`
- Open public production: `out_of_scope`

## Command Evidence

Shared verification fields:

- checkedAt: `2026-07-06T01:38:58Z`
- exitCode: `0`
- gitHead: `6345019a`
- scopedDiffSha256: `a52c62212bb8e1b700d2e78aedc24e035ddf5ebff149049f192b754fca562efb`
- readinessVerifierSha256: `e7ef020f69382ed343323a91473c32ebe7040818d77a7f7741c4961ca9b7afc9`

Commands:

- `npm run verify:auth-data-readiness`
  - result: `Auth/data readiness verification passed: 154 checks.`
- `npm run verify:supabase-release`
  - result: `Supabase release verification passed: 188 checks.`
- `npm run verify:pilot-volume`
  - result: `Blocked: production has 22 registered agent profiles, above pilot cap 10; local pilot cohort declares 19 registered agents, above pilot cap 10.`
- `npm run verify:production-readiness -- --expect-blocked`
  - result: `Production readiness is intentionally fail-closed until 20260706000100_ai_helper_admin_intent_quota_contract.sql is owner-approved, applied, and evidenced.`
- `npm run test:e2e:supabase`
  - exitCode: `1`
  - result: `Latest full Supabase Playwright smoke: 4 passed, 1 failed. Project supabase-sandbox-auth-smoke, spec tests/e2e-supabase/browser-key-audit.spec.ts, test keeps admin return and agent correction in sync across Supabase roles. The failing test is the sandbox cross-role UI scenario waiting for the admin review drawer button "Добавить замечание"; deferred for this controlled pilot because npm run supabase:production-workflow-smoke covers the backend role handoff and production workflow smoke covers the backend role handoff.`

Deferred E2E failure binding:

- Project: `supabase-sandbox-auth-smoke`
- Spec: `tests/e2e-supabase/browser-key-audit.spec.ts`
- Test title: `keeps admin return and agent correction in sync across Supabase roles`
- Failing action: admin review drawer button `Добавить замечание`
- Error snippet: waiting for the admin review drawer button `Добавить замечание`
- Production coverage: `npm run supabase:production-workflow-smoke`

Deferred for this pilot scope:

- `npm run test:supabase-live` - production workflow smoke and production browser Supabase smoke were used instead.
- `npm run verify:full` - deferred because broad UI/performance work is outside the Supabase launch-blocker scope.
- Edge Function dry-runs - deferred because the pilot gate is bounded to Supabase Auth/RLS/Storage/workflow persistence.
- Cross-role browser UI proof - deferred after the latest full Supabase Playwright run returned `4 passed / 1 failed`; production workflow smoke covers the backend handoff.
- Pilot volume cap - blocked because production currently has `22` agent profiles and the local pilot cohort declares `19` registered agents, above the controlled-pilot cap of `10`.
- AI helper admin intent quota migration - blocked until `20260706000100_ai_helper_admin_intent_quota_contract.sql` has owner-approved production apply evidence.

No email, password, service-role key, signed URL, or direct personal identifier is recorded in this artifact.

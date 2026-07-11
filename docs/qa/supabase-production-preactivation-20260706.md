# Supabase Production Pre-Activation Evidence - 2026-07-06

Result: `BLOCKED_FOR_PENDING_PRODUCTION_GATES`
Project: `tsymifccglpepvbmrcgh`
Checked at: `2026-07-10T04:09:36Z`
Git head: `d3906265a`
Readiness verifier hash: `c9e0f7af67355dfe706187079ac0cc6b7bb37452f38672fba8cb771ac3b54031`
Scoped diff hash: `f64fe8e7949be05ef2eaaed3d91329395f76e542d35ed9384b42c095cf45ccd4`

## Scope

- Registered agents: `10`
- Max submissions per registered agent: `50`
- Max total submissions: `500`
- Max applicants per submission: `3`
- Max required media objects: `4500`
- Open public production: `out_of_scope`

## Command Evidence

Shared verification fields:

- checkedAt: `2026-07-10T04:09:36Z`
- exitCode: `0`
- gitHead: `d3906265a`
- scopedDiffSha256: `f64fe8e7949be05ef2eaaed3d91329395f76e542d35ed9384b42c095cf45ccd4`
- readinessVerifierSha256: `c9e0f7af67355dfe706187079ac0cc6b7bb37452f38672fba8cb771ac3b54031`

Pilot volume verification binding:

- command: `npm run verify:pilot-volume`
- checkedAt: `2026-07-10T04:08:26.968Z`
- exitCode: `0`
- gitHead: `d3906265a`
- scopedDiffSha256: `f64fe8e7949be05ef2eaaed3d91329395f76e542d35ed9384b42c095cf45ccd4`
- readinessVerifierSha256: `c9e0f7af67355dfe706187079ac0cc6b7bb37452f38672fba8cb771ac3b54031`

Commands:

- `npm run verify:auth-data-readiness`
  - result: `Auth/data readiness verification passed: 178 checks.`
- `npm run verify:supabase-release`
  - result: `Supabase release verification passed: 212 checks.`
- `npm run verify:pilot-volume`
  - result: `Supabase pilot volume envelope verified: 10 active registered agents; 12 banned extra agent profiles excluded from intake.`
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
- Pilot volume cap - passed for active intake: production has `22` agent profile rows, `12` are Auth-banned and excluded, leaving `10` active registered agents in the controlled-pilot cap.
- AI helper admin intent quota migration - blocked until `20260706000100_ai_helper_admin_intent_quota_contract.sql` has owner-approved production apply evidence.

No email, password, service-role key, signed URL, or direct personal identifier is recorded in this artifact.

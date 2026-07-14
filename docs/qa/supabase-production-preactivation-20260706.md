# Supabase Production Pre-Activation Evidence - 2026-07-14

Result: `PILOT_GO`
Project: `tsymifccglpepvbmrcgh`
Checked at: `2026-07-14T19:41:12Z`
Git head: `c51bba438`
Readiness verifier hash: `e9f038047096e102f80d367bb72cf212ac7f3a23908d1068e26749deaee87da9`
Scoped diff hash: `43b0bd6043bde0ea94c2171e4704d0f48d2090e30903a199b9b0e7588ee9d9a0`

## Scope

- Registered agents: `10`
- Max new submissions per registered agent in the pilot window: `50`
- Max new submissions in the pilot window: `500`
- Pilot window starts at: `2026-07-14T19:20:00Z`
- Max applicants per submission: `3`
- Max required media objects: `4500`
- Open public production: `out_of_scope`

## Fresh Command Evidence

Shared verification fields:

- checkedAt: `2026-07-14T19:37:45Z`
- exitCode: `0`
- gitHead: `c51bba438`
- scopedDiffSha256: `43b0bd6043bde0ea94c2171e4704d0f48d2090e30903a199b9b0e7588ee9d9a0`
- readinessVerifierSha256: `e9f038047096e102f80d367bb72cf212ac7f3a23908d1068e26749deaee87da9`

Commands:

- `npm run verify:auth-data-readiness`
  - result: `Auth/data readiness verification passed: 192 checks.`
- `npm run verify:supabase-release`
  - result: `Supabase release verification passed: 226 checks.`
- `npm run verify:pilot-volume`
  - result: `Supabase pilot volume envelope verified: 10 active registered agents; 12 banned extra agent profiles excluded from intake; pilot-window submissions 0; pilot-window max per agent 0.`
- `npm run verify:production-packet`
  - checkedAt: `2026-07-14T19:42:22Z`
  - exitCode: `0`
  - result: `READY Production readiness gate passed.`

## Supplemental P1 Hash-Scope Regression

- `npx vitest run tests/unit/supabaseSecurityContract.spec.ts -t "binds the complete P1 and A2 proof surface|repairs the terminal ZIP suffix guard|makes every deployed admin RPC guard"`
  - result: `3 passed`
- `npx eslint scripts/verify-production-readiness.mjs tests/unit/supabaseSecurityContract.spec.ts`
  - result: `PASS`

## Deferred E2E Evidence Binding

The full Supabase Playwright suite was not rerun in this closure because its known sandbox-only UI failure is an explicitly accepted controlled-pilot risk and the new unrelated questionnaire/PDF worktree files currently prevent a clean broad build. The original run result remains unchanged; only its readiness binding was refreshed after the current scoped diff review.

- `npm run test:e2e:supabase`
- exitCode: `1`
- Result: `Latest full Supabase Playwright smoke: 4 passed, 1 failed. Project supabase-sandbox-auth-smoke, spec tests/e2e-supabase/browser-key-audit.spec.ts, test keeps admin return and agent correction in sync across Supabase roles. The failure is the sandbox cross-role UI scenario waiting for the admin review drawer button `Добавить замечание`; it is deferred for this controlled pilot because npm run supabase:production-workflow-smoke covers the backend role handoff and production workflow smoke covers the backend role handoff.`
- Project: `supabase-sandbox-auth-smoke`
- Spec: `tests/e2e-supabase/browser-key-audit.spec.ts`
- Test title: `keeps admin return and agent correction in sync across Supabase roles`
- Failing action: admin review drawer button `Добавить замечание`
- Error snippet: waiting for the admin review drawer button `Добавить замечание`
- Production coverage: `npm run supabase:production-workflow-smoke`

## Controlled-Pilot Deferrals

- `npm run test:supabase-live` - not required; production workflow smoke and the real A2-S1 browser path were used instead.
- `npm run verify:full` - deferred because broad UI/performance work is outside this bounded Supabase launch contract.
- Edge Function dry-runs - accepted risk for the controlled Auth/RLS/Storage/workflow pilot.
- Cross-role browser UI proof - accepted after the latest full Supabase Playwright run returned `4 passed / 1 failed`; fresh production A2-S1 terminal UI readback covers the export path and production workflow smoke covers the backend handoff.
- HIBP leaked-password protection - unavailable on the current Free plan; public sign-up stays closed and only admin-provisioned pilot users are allowed.

## Scoped Diff Review

- checkedAt: `2026-07-14T19:41:12Z`
- gitHead: `c51bba438`
- scopedDiffSha256: `43b0bd6043bde0ea94c2171e4704d0f48d2090e30903a199b9b0e7588ee9d9a0`
- Scope: `supabase-controlled-pilot`
- Unrelated dirty worktree accepted: `true`
- package-lock drift: `none`
- Result: `Reviewed only the controlled-pilot/P1/export/security/readiness diff; concurrent questionnaire/PDF files are excluded and untouched.`

No email, password, service-role key, signed URL, cohort identifier, submission identifier, storage path, or direct personal identifier is recorded in this artifact.

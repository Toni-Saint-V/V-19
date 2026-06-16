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
- `20260616001949_ai_helper_security_advisor_hardening`

The remote migration `20260616001949_ai_helper_security_advisor_hardening` applied the local migration contract from `20260615000000_ai_helper_security_advisor_hardening.sql`.

No sandbox seed or copied sandbox data was applied.

Structured remote migration order recorded in `docs/release/supabase-production-readiness.json`:

1. `20260611000000_visaflow_mvp_foundation`
2. `20260612000000_visaflow_rls_performance_hardening`
3. `20260612001000_visaflow_rpc_corrections_persistence`
4. `20260613005039_visaflow_runtime_write_guards`
5. `20260613010029_visaflow_rpc_submit_boundary`
6. `20260614000000_ai_helper_audit_quota`
7. `20260616001949_ai_helper_security_advisor_hardening`

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
- `npm run verify:supabase-release`: passed, 75 checks
- `node scripts/verify-production-readiness.mjs --expect-blocked`: passed fail-closed, 41 blockers remain
- `npm run test:e2e:supabase`: passed, 1 Playwright browser key audit
- `npm run test:supabase-live`: passed, 1 test
- `git diff --check`: passed

Structured pre-activation command evidence:

- command: `npm run verify:supabase-release`
  - checkedAt: `2026-06-16T05:26:36+03:00`
  - exitCode: `0`
  - result: Supabase release verification passed: 75 checks.
  - gitHead: `ea0820c`
  - scopedDiffSha256: `45f1e101faf6c7485fde85ca80d29a0febfb1d10f4e79c454f8eeb2b34687ce4`
  - readinessVerifierSha256: `f4c34d7baec29ccc7c7deb457e8ec45f352d4a64bce6d46c56af8c9e0737192b`
- command: `npm run test:supabase-live`
  - checkedAt: `2026-06-16T05:27:53+03:00`
  - exitCode: `0`
  - result: passed, 1 test
  - gitHead: `ea0820c`
  - scopedDiffSha256: `45f1e101faf6c7485fde85ca80d29a0febfb1d10f4e79c454f8eeb2b34687ce4`
  - readinessVerifierSha256: `f4c34d7baec29ccc7c7deb457e8ec45f352d4a64bce6d46c56af8c9e0737192b`

## Remaining Blockers

Production activation remains `NO_GO` until plan eligibility for leaked password protection is confirmed, Auth leaked password protection is enabled, promotion window, role-verified smoke accounts, backup/restore evidence, production env activation flags, browser QA, logs, and post-activation checks are complete.

Supabase advisor risk remains open:

- Supabase organization plan is `free`;
- plan eligibility for leaked password protection is not confirmed;
- leaked password protection is not enabled;
- security advisors still report `auth_leaked_password_protection`.

Security advisor risks closed on 2026-06-16 by applying `20260615000000_ai_helper_security_advisor_hardening.sql` to production as remote migration `20260616001949_ai_helper_security_advisor_hardening`:

- Security-definer quota RPC was executable by `anon` and `authenticated`.
- AI helper quota/audit tables were RLS-enabled but had no direct table policies.

## Auth Security Advisor Evidence

Latest recheck: `2026-06-16T03:45:53+03:00`.

Production security advisors still report exactly one security WARN:

- `auth_leaked_password_protection`

Live organization check:

- organization id: `hsolrwjysdlmyqopryon`;
- organization name: `Toni-Saint-V's Org`;
- plan: `free`.

This is a Supabase Auth/project setting and plan eligibility blocker, not a SQL migration blocker.

## Production Smoke Account Discovery

Latest read-only SQL discovery: `2026-06-16T04:17:20+03:00`.

Only aggregate counts were recorded; no email, password, or direct personal identifier was stored in this artifact.

Results:

- Auth users: `1`
- Confirmed auth users: `1`
- Profiles: `0`
- Profile role counts: none
- Auth users without matching profiles: `1`

Impact:

- The current app requires `public.profiles` for Supabase sign-in to produce an `AppSession`.
- Production smoke accounts are not ready.
- Production activation remains blocked until every auth user intended for activation has a matching `public.profiles` row with the correct role and no orphan auth users remain.

Repair boundary:

- Do not auto-create production profiles.
- Do not assign a role from user-controlled metadata.
- Owner must explicitly approve the role before any profile row is inserted or changed.
- Keep direct identifiers and credentials out of committed evidence.

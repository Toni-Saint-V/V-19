# Supabase 10 Registered Agent Readiness Evidence - 2026-07-06

Status: `NO_GO` for a controlled 10 registered agent pilot.

Scope: production Supabase readiness pass for a controlled V-19 pilot with 10 registered agents and a workload cap of 50 submissions per registered agent. This artifact records aggregate-only evidence and launch blockers. No Auth users, real user application data, real user Storage objects, or Supabase settings were changed by this evidence refresh.

Target project:

- Production project: `tsymifccglpepvbmrcgh`
- Production URL: `https://tsymifccglpepvbmrcgh.supabase.co`
- Organization: `hsolrwjysdlmyqopryon`

## Local Gates

Fresh local commands:

- `npm run verify:auth-data-readiness` - PASS, 154 checks.
- `npm run verify:supabase-release` - PASS, 188 checks.
- `npm run verify:pilot-volume` - BLOCKED because production has `22` registered agent profiles and the local pilot cohort declares `19` registered agents, above the pilot cap of `10`.
- `npm run verify:production-packet -- --expect-blocked` - PASS as fail-closed with activation blockers only.
- `npm run test -- tests/unit/supabaseSecurityContract.spec.ts` - PASS; Vitest ran 59 files and 592 tests.

## Workload Envelope

- Registered agents: `10`
- Max submissions per registered agent: `50`
- Max total submissions: `500`
- Max applicants per submission: `3`
- Max total applicants: `1500`
- Required media slots per applicant: `3`
- Max required media objects/storage identities: `4500`
- Local deterministic volume proof: `docs/qa/supabase-pilot-volume-envelope-20260706.md`

## Live Production Read-Only Evidence

Collected through read-only Supabase plugin calls and aggregate SQL only.

Aggregate database checks:

- Auth users: `24`
- Confirmed Auth users: `24`
- Profiles: `24`
- Auth users without matching profiles: `0`
- Profile role counts: `admin=2`, `agent=22`
- Public base tables: `16`
- Public tables with RLS enabled: `16`
- Public storage buckets: `0`
- `submission-media` bucket public: `false`

Pilot cohort aggregate check:

- Desired pilot users in ignored local cohort file: `20`
- Cohort roles: `admin=1`, `agent=19`
- Auth users matched in production: `20/20`
- Profiles matched in production: `20/20`
- Roles verified in production profiles: `20/20`
- Missing auth users: `0`
- Missing profiles: `0`
- Role mismatches: `0`

Remote migration check:

- Supabase plugin `list_migrations` confirmed the production remote list ends at `20260705235913_day10_required_media_canonical_write_paths`.
- Local migration `20260706000100_ai_helper_admin_intent_quota_contract.sql` is not applied remotely.

No email, password, service-role key, signed URL, or direct personal identifier was printed or recorded.

## Launch Blockers

Owner: Rollout owner / Supabase production operator.

Verification command:

- `npm run verify:pilot-volume`
- `npm run verify:production-packet -- --expect-blocked`
- Supabase plugin `list_migrations` against project `tsymifccglpepvbmrcgh`

Expected artifact:

- `docs/qa/supabase-pilot-volume-envelope-20260706.md`
- `docs/qa/supabase-production-migration-evidence-20260706.md`
- `docs/qa/supabase-production-preactivation-20260706.md`

Blocking findings:

- Production has `22` registered agent profiles, above the cap of `10`.
- Local pilot cohort declares `19` registered agents, above the cap of `10`.
- Local migration `20260706000100_ai_helper_admin_intent_quota_contract.sql` lacks owner-approved production apply evidence.
- `docs/release/supabase-production-readiness.json` correctly remains `NO_GO`.

## Launch Constraints

1. Maximum 10 registered pilot agents.
2. Maximum 50 submissions per registered agent, 500 total submissions in the pilot window.
3. Existing provisioned users only; do not open public sign-up.
4. Spain-only V-19 flow.
5. Stop intake if media persistence, cross-agent isolation, review handoff, or workload latency shows any incident.

Verdict: `NO_GO` for controlled 10 registered agents / 500 total submissions. This is not GO for open public production.

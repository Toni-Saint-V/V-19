# Supabase 10 Registered Agent Readiness Evidence - 2026-07-06

Status: `PILOT_GO` for a controlled 10 registered agent pilot.

Scope: production Supabase readiness pass for a controlled V-19 pilot with 10 registered agents and a workload cap of 50 submissions per registered agent. Intentional production mutations in this pass were limited to the owner-approved schema migration `day10_required_media_canonical_write_paths` and synthetic production workflow-smoke records/storage objects that the smoke script cleans up. No Auth users, real user application data, real user Storage objects, or Supabase settings were changed for readiness collection.

Target project:

- Production project: `tsymifccglpepvbmrcgh`
- Production URL: `https://tsymifccglpepvbmrcgh.supabase.co`
- Organization: `hsolrwjysdlmyqopryon`
- Supabase project status from plugin: `ACTIVE_HEALTHY`

## Local Gates

Fresh local commands:

- `npm run verify:supabase-release` - PASS, 186 checks.
- `npm run verify:auth-data-readiness` - PASS, 152 checks.
- `npm run supabase:pilot-cohort -- --check --required-size 10` - PASS.
- `npm run supabase:pilot-cohort -- --check --required-size 20` - PASS.
- `npm run supabase:production-workflow-smoke` - PASS.
- `npm run test:e2e:supabase` latest full run - 4 passed / 1 failed. The failed case is the sandbox cross-role UI scenario waiting for the admin review drawer button `Добавить замечание`; it is deferred for this controlled pilot because production workflow smoke covers cross-role backend behavior.
- `npm run verify:pilot-volume` - PASS for 10 registered agents, 500 total submissions, 1500 applicants, and 4500 required media objects.
- `npm run verify:production-packet` - PASS after controlled-pilot packet refresh.

The ignored local cohort file already contains 20 pilot users with 1 admin and 19 agents, so the local cohort preflight is sufficient for 10 registered agents. This check did not print or record emails/passwords.

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

Security advisor:

- Open warning: `auth_leaked_password_protection`
- Level: `WARN`
- Remediation: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

Performance advisor:

- Most findings are `unused_index` INFO.
- One relevant WARN remains: multiple permissive policies on `public.access_requests` for authenticated `SELECT`.

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
- Storage object policies are present for `SELECT`, `INSERT`, `UPDATE`, and `DELETE`.

Pilot cohort live check:

- Desired pilot users in ignored local cohort file: `20`
- Cohort roles: `admin=1`, `agent=19`
- Auth users matched in production: `20/20`
- Profiles matched in production: `20/20`
- Roles verified in production profiles: `20/20`
- Missing auth users: `0`
- Missing profiles: `0`
- Role mismatches: `0`
- No email, password, or direct personal identifier was printed or recorded.

Policy inventory:

- Key public data tables have one policy per action.
- `public.access_requests` has two permissive authenticated `SELECT` policies: `access requests admin read` and `access requests requester read own`.

## Launch Blockers

Closed blocker:

- Production now has `day10_required_media_canonical_write_paths` applied through Supabase MCP as remote migration `20260705235913_day10_required_media_canonical_write_paths`.
- Live checks show `app_private.enforce_required_media_canonical_storage_path` exists.
- Live checks show canonical trigger `media_assets_required_media_canonical_storage_path` exists on `public.media_assets`.
- Production workflow smoke proved malformed required-media bucket/path writes are rejected.

Closed integrity issue:

- `docs/release/supabase-production-readiness.json` was refreshed for `scope: controlled-10-registered-agent-500-submission-pilot`.
- Local remote migration contract now matches the Supabase MCP-recorded remote migration version.

Resolved or narrowed by this pass:

- Production project is reachable and `ACTIVE_HEALTHY`.
- Production has enough already-provisioned pilot accounts for 10 registered agents.
- The pilot envelope is now bounded by submissions and required media objects, not only by user count.
- Production Auth/Profile aggregate consistency is clean: `0` orphan Auth users.
- All public base tables have RLS enabled and the `submission-media` bucket is private.

Accepted deferred risks for this controlled pilot:

- Backup restore drill/RPO evidence is deferred to active launch operations.
- `auth_leaked_password_protection` remains disabled on the free plan and is accepted only for this capped pilot with admin-provisioned users.
- Logs/error-rate review is deferred to active launch monitoring.
- Edge Function dry-runs are deferred because core launch readiness is bounded to Supabase Auth/RLS/Storage/workflow persistence.
- Cross-role browser UI proof is deferred after the latest full Supabase Playwright run returned 4 passed / 1 failed; cross-role backend workflow is covered by production workflow smoke.
- Open public production remains out of scope.

Safety note:

- `.env.supabase-production.local` currently contains production activation flags set to `true`, including release enabled, migrations applied, browser QA, browser key audit, and production approved.
- Those local flags are backed by the fresh production packet evidence for this controlled pilot. If production schema, env, Auth/profile state, or launch scope changes, refresh the packet before extending the GO decision.

## Launch Constraints

1. Maximum 10 registered pilot agents.
2. Maximum 50 submissions per registered agent, 500 total submissions in the pilot window.
3. Existing provisioned users only; do not open public sign-up.
4. Spain-only V-19 flow.
5. Stop intake if media persistence, cross-agent isolation, review handoff, or workload latency shows any incident.
6. Continue fixing launch-tolerable UI/advisor/backup hardening during the pilot.

Verdict: PILOT_GO for controlled 10 registered agents / 500 total submissions, not GO for open public production.

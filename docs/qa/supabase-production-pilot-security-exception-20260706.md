# Supabase Controlled 10 Registered Agent Pilot Exception - 2026-07-06

Decision: `ACCEPTED_FOR_CONTROLLED_10_REGISTERED_AGENT_500_SUBMISSION_PILOT`
Scope: `controlled-10-registered-agent-500-submission-pilot`
Project: `tsymifccglpepvbmrcgh`
Recorded at: `2026-07-06T00:16:12.628Z`

This is not open public-production approval. It is a capped operational pilot for 10 registered agents and up to 500 total submissions.

## Evidence

- Production project is `ACTIVE_HEALTHY`.
- Production has `24` Auth users, `24` profiles, and `0` orphan Auth users.
- Pilot cohort has 20 locally configured users; production live check matched `20/20` Auth users, `20/20` profiles, and `20/20` roles.
- Workload envelope is bounded to 10 registered agents, 50 submissions per registered agent, 500 total submissions, 1500 applicants, and 4500 required media objects.
- `npm run verify:pilot-volume` passed without production writes.
- All `16` public base tables have RLS enabled.
- `submission-media` is private and has storage policies for read/write/update/delete.
- Canonical required media guard is live on `public.media_assets`.
- `npm run supabase:production-workflow-smoke` passed after the migration.
- Full `npm run test:e2e:supabase` latest run returned 4 passed / 1 failed. The failed case is the sandbox cross-role UI scenario waiting for the admin review drawer button `Добавить замечание`; production workflow smoke covers that backend path for this controlled pilot.

## Accepted Deferred Risks

- `auth_leaked_password_protection` remains disabled on the free plan. Accepted only for this capped pilot with admin-provisioned users and no public password registration path.
- Restore drill/RPO evidence is deferred. Rollback owner must stop intake if data or media persistence becomes suspect.
- Logs/error-rate review is deferred to active launch monitoring.
- Edge Function dry-runs are deferred for this pilot scope.
- Cross-role browser UI proof is deferred after the latest full Supabase Playwright run returned 4 passed / 1 failed; production workflow smoke covers the backend handoff.

Structured acceptance is recorded in `docs/release/supabase-production-readiness.json` for:

- `backupRestoreDeferred`
- `leakedPasswordProtectionDeferred`
- `logsReviewDeferred`
- `edgeFunctionDryRunDeferred`
- `crossRoleBrowserQaDeferred`

## Constraints

- Maximum 10 registered pilot agents.
- Maximum 50 submissions per registered agent, 500 total submissions in the pilot window.
- Existing provisioned users only; do not open public sign-up.
- Spain-only V-19 flow.
- No broad/public production expansion from this GO.
- Fix launch-tolerable UI/polish/advisor cleanup during the pilot, not before invite.

No email, password, service-role key, signed URL, or direct personal identifier is recorded in this artifact.

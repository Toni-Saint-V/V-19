# Supabase Production Approval Checklist

Do not use this checklist as approval by itself. It records approval evidence after the owner confirms the target, backup path, rollout owner, and promotion window.

## 1. Target Identity

- [ ] Production project id:
- [ ] Production project URL:
- [ ] Supabase organization:
- [ ] Rollout owner:
- [ ] Technical approver:
- [ ] Business approver:
- [ ] Planned promotion window:
- [ ] Rollback decision owner:

Sandbox reference already tested:

- project id: `oevvaowoklqttqkraxho`
- activation target: `sandbox`
- smoke command: `npm run test:supabase-live`

## 2. Migration Contract

Required migration order:

1. `20260611000000_visaflow_mvp_foundation.sql`
2. `20260612000000_visaflow_rls_performance_hardening.sql`
3. `20260612001000_visaflow_rpc_corrections_persistence.sql`
4. `20260613005039_visaflow_runtime_write_guards.sql`
5. `20260613010029_visaflow_rpc_submit_boundary.sql`

Approval:

- [ ] Target migration history checked.
- [ ] Target history is empty or matches an already-applied prefix.
- [ ] No local migration was edited after sandbox proof.
- [ ] Owner approved applying this exact migration contract.
- [ ] Migration apply operator identified.
- [ ] Expected post-apply migration list recorded.

Post-apply evidence:

```text
Migration history:

```

## 3. Smoke Accounts

Do not commit passwords or secrets. Store credentials only in the approved secret manager or local ignored smoke env.

Required smoke roles:

- [ ] Agent smoke account exists.
  - email / identifier:
  - `public.profiles.role`: `agent`
  - organization:
- [ ] Other-agent smoke account exists.
  - email / identifier:
  - `public.profiles.role`: `agent`
  - organization:
- [ ] Admin smoke account exists.
  - email / identifier:
  - `public.profiles.role`: `admin`
  - organization:

Permission confirmation:

- [ ] Agent cannot read another agent case.
- [ ] Agent cannot write another agent case.
- [ ] Agent cannot mutate applicant rows after accepted.
- [ ] Agent cannot mutate media rows after accepted.
- [ ] Agent cannot overwrite private Storage media after accepted.
- [ ] Other agent cannot create signed URLs for private media.
- [ ] Admin can perform review/handoff actions.

## 4. Backup And Restore

- [ ] Backup owner:
- [ ] Backup mechanism:
- [ ] Latest backup timestamp:
- [ ] Restore path confirmed:
- [ ] Restore test or documented recovery evidence:
- [ ] RPO/RTO accepted by owner:
- [ ] Rollback communication owner:

Restore boundary:

- Prefer disabling Supabase client activation before database rollback.
- Database rollback must be a forward repair migration or approved restore path.
- Do not manually drop RLS policies, readiness triggers, correction actor triggers, or Storage policies in production.

## 5. Pre-Activation Verification

Run before production activation:

```bash
npm run verify:supabase-release
npm run test:supabase-live
npm run verify:full
```

Record results:

- [ ] `npm run verify:supabase-release`
  - result:
  - timestamp:
- [ ] `npm run test:supabase-live`
  - result:
  - timestamp:
- [ ] `npm run verify:full`
  - result:
  - timestamp:

Browser/key audit:

- [ ] Browser exposes only public Supabase project id, URL, publishable key, and Edge Functions URL.
- [ ] No service-role key is present in browser env.
- [ ] No model provider key is present in browser env.
- [ ] No smoke account password is present in browser env.

## 6. Production Env Evidence

Set these only after migrations and approval are complete:

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

Required public config:

```bash
VITE_SUPABASE_PROJECT_ID=
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_SUPABASE_EDGE_FUNCTIONS_URL=
```

## 7. Go / No-Go

Go only if every item is true:

- [ ] Production target id is confirmed.
- [ ] Rollout owner is confirmed.
- [ ] Backup and restore path are confirmed.
- [ ] Required smoke accounts are ready.
- [ ] Migration history is checked.
- [ ] Sandbox smoke passed immediately before approval.
- [ ] Full local verification passed after final diff.
- [ ] Production env evidence flags are intentionally set.
- [ ] Rollback path is accepted by owner.
- [ ] No critical, serious, or medium findings remain.

Decision:

```text
Target:
Owner:
Approval time:
Go / No-Go:
Reason:
Rollback owner:
```

## 8. Post-Activation Checks

- [ ] Agent sign-in works.
- [ ] Admin sign-in works.
- [ ] Agent can create a draft.
- [ ] Agent can upload required media.
- [ ] Incomplete `waiting_review` is rejected.
- [ ] Valid `waiting_review` reaches operator queue.
- [ ] Admin can accept or return the case.
- [ ] Post-handoff agent mutation is blocked.
- [ ] Private media signed URL access is scoped correctly.
- [ ] Error rate and logs checked.

## Stop Conditions

Stop immediately if:

- target project id is ambiguous;
- backup/restore path is missing;
- smoke accounts are not role-correct;
- any Supabase release verifier check fails;
- live sandbox smoke fails;
- production env contains any secret;
- owner approval is missing;
- a case can bypass readiness or mutate after handoff.

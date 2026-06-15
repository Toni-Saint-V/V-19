# Supabase Workspace PR Package

## PR Title

Harden Supabase persistence for task-first workspace

## Commit Scope

This package covers exactly these commits:

1. `768a3a4 Harden Supabase workspace write guards`
2. `5d73f7d Add Supabase production promotion gate`

## Product Scope

Promote Supabase-backed persistence safety for the live task-first Agent Workspace, bounded to:

- agent workspace persistence;
- intake continuation;
- readiness review;
- operator handoff;
- private media storage;
- RLS and Storage write guards;
- production promotion readiness.

Out of scope:

- auth redesign;
- billing;
- admin redesign;
- AI provider activation;
- unrelated schema expansion;
- production client activation.

## What Changed

- Replaced hardcoded operator/date persistence values with real action timestamps and current actor names.
- Forced correction author persistence through the current authenticated actor instead of trusting client-provided `createdBy`.
- Added `visaflow_runtime_write_guards` migration:
  - server-side readiness trigger for `ready_for_review` and `waiting_review`;
  - correction actor trigger;
  - status-gated applicant, media, correction, and Storage write policies.
- Added `visaflow_rpc_submit_boundary` migration:
  - keeps agent submit idempotent;
  - stops child-row upserts before `waiting_review`;
  - preserves admin child writes for operator review flows.
- Expanded live Supabase smoke proof:
  - incomplete review submit rejection;
  - valid draft/media/readiness/waiting-review/admin-accept path;
  - cross-agent denial;
  - private Storage read/write denial;
  - post-handoff owner mutation denial.
- Added production promotion gate and runbook:
  - migration order check;
  - sandbox-only smoke guard;
  - rollback boundary;
  - production evidence env checklist.
- Applied the committed migration set to the production project after explicit owner instruction:
  - production project id `tsymifccglpepvbmrcgh`;
  - no sandbox data copy or seed;
  - production client activation still blocked.
- Added local-only security advisor hardening migration:
  - revokes AI helper quota/audit table access from browser roles;
  - grants quota RPC execution only to `service_role`;
  - adds explicit deny-all RLS policies for AI helper service-owned tables.

## Business Logic Preserved

- Agents can create and continue drafts.
- Agents can upload required media before handoff.
- Agents can submit only cases that pass deterministic readiness.
- Human operators remain responsible for review, return-to-agent, accepted, export, and appointment handoff states.
- Handoff states cannot be rewound by agent child-table or Storage writes.
- Readiness is not represented as approval, official verification, or visa outcome control.

## Security And Data Integrity

- Browser clients still use only public Supabase keys.
- Service-role keys remain out of frontend env and smoke tests.
- Live smoke refuses non-sandbox targets.
- `.env` and `.env.local` are not read by the live smoke runner.
- Child tables and Storage are write-locked for agents after review handoff.
- `corrections.created_by` is enforced server-side.
- Crafted incomplete `waiting_review` payloads are rejected server-side.

## Verification

Latest completed verification:

```bash
npx vitest run tests/unit/workflow.spec.ts tests/unit/submissionService.spec.ts
npm run verify:supabase-release
npm run format:check
node scripts/verify-production-readiness.mjs --expect-blocked
npm run test:e2e:supabase
```

Results:

- `npx vitest run tests/unit/workflow.spec.ts tests/unit/submissionService.spec.ts`: passed, 10 tests.
- `npm run verify:supabase-release`: passed, 42 checks.
- `npm run format:check`: passed.
- `node scripts/verify-production-readiness.mjs --expect-blocked`: passed fail-closed, 34 blockers remain.
- `npm run test:e2e:supabase`: passed, 1 Playwright browser key audit.
- `git diff --check`: passed.

## Screenshots

Not required for this package. The changes are RLS/RPC/storage/release-gate work and do not alter the UI surface.

## Migration Notes

Required local migration order:

1. `20260611000000_visaflow_mvp_foundation.sql`
2. `20260612000000_visaflow_rls_performance_hardening.sql`
3. `20260612001000_visaflow_rpc_corrections_persistence.sql`
4. `20260613005039_visaflow_runtime_write_guards.sql`
5. `20260613010029_visaflow_rpc_submit_boundary.sql`
6. `20260614000000_ai_helper_audit_quota.sql`
7. `20260615000000_ai_helper_security_advisor_hardening.sql`

Sandbox reference target:

- project id: `oevvaowoklqttqkraxho`
- activation target: `sandbox`
- live smoke: sandbox-only

Production target:

- project id: `tsymifccglpepvbmrcgh`
- migrations: applied through `20260614000000_ai_helper_audit_quota.sql`; `20260615000000_ai_helper_security_advisor_hardening.sql` is local-only until owner-approved production apply
- schema/RLS/Storage evidence: `docs/qa/supabase-production-migration-2026-06-15.md`
- activation: blocked until `VITE_SUPABASE_PRODUCTION_APPROVED=true` and every production evidence flag is set

## Rollback

Preferred rollback is application-level:

1. Set `VITE_SUPABASE_RELEASE_ENABLED=false`.
2. If needed, set `VITE_SUPABASE_BACKEND_TARGET=local-demo`.
3. Redeploy the frontend.
4. Keep stricter RLS/Storage/database guards in place unless a reviewed forward migration replaces them.

Database rollback must be a forward migration or approved restore path. Do not manually drop RLS policies, readiness triggers, correction actor triggers, or Storage policies in production.

## Merge Checklist

- [ ] Branch reviewed against the two listed commits.
- [ ] `npm run verify:full` passed after final diff.
- [ ] `npm run test:supabase-live` passed against sandbox.
- [ ] Production approval checklist completed if production activation is planned.
- [ ] Production migrations are not applied from Codex without explicit owner approval.
- [ ] Unrelated untracked files are excluded from commit/PR.

## PR Body

```markdown
## Summary

- Hardened Supabase persistence for the task-first Agent Workspace.
- Added server-side readiness, correction author, child-table, and private Storage write guards.
- Added sandbox-only Supabase live smoke coverage for valid handoff and denied post-handoff mutations.
- Added production promotion gate and rollback-aware runbook.

## Scope

Bounded to agent workspace persistence, intake continuation, readiness review, private media storage, and operator handoff.

Out of scope: auth redesign, billing, admin redesign, unrelated schema expansion, AI provider activation, production client activation.

## Verification

- npm run verify:supabase-release
- npm run test:supabase-live
- npm run verify:v19-boundary
- npm run format:check
- npm run test
- npm run verify:full

## Risk And Rollback

Production activation remains blocked until owner approval and production evidence flags are set.
Rollback is app-level first: disable `VITE_SUPABASE_RELEASE_ENABLED`, optionally return to `local-demo`, redeploy frontend.
Database rollback must be a reviewed forward migration or approved restore path.
```

## Verdict

Ready for PR review. Not ready for production activation until the production approval checklist is completed.

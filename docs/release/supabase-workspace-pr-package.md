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
- production migration apply.

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
npm run verify:supabase-release
npm run test:supabase-live
npm run verify:codex-hook
npm run format:check
npm run test
npm run verify:full
```

Results:

- `npm run verify:supabase-release`: passed, 30 checks.
- Supabase sandbox migration history: checked read-only against `oevvaowoklqttqkraxho`.
- `npm run test:supabase-live`: passed against sandbox after one transient 30s network timeout.
- `npm run verify:codex-hook`: passed.
- `npm run format:check`: passed.
- `npm run test`: passed, 34 tests.
- `npm run verify:full`: passed, including typecheck, lint, safety, unit tests, build, performance, Supabase release gate, `npm audit --omit=dev`, and 16 Playwright E2E tests.

## Screenshots

Not required for this package. The changes are RLS/RPC/storage/release-gate work and do not alter the UI surface.

## Migration Notes

Required local migration order:

1. `20260611000000_visaflow_mvp_foundation.sql`
2. `20260612000000_visaflow_rls_performance_hardening.sql`
3. `20260612001000_visaflow_rpc_corrections_persistence.sql`
4. `20260613005039_visaflow_runtime_write_guards.sql`
5. `20260613010029_visaflow_rpc_submit_boundary.sql`

Sandbox reference target:

- project id: `oevvaowoklqttqkraxho`
- activation target: `sandbox`
- live smoke: sandbox-only

Production target:

- project id: pending owner approval
- migrations: not applied by this package
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

Out of scope: auth redesign, billing, admin redesign, unrelated schema expansion, AI provider activation, production migration apply.

## Verification

- npm run verify:supabase-release
- npm run test:supabase-live
- npm run verify:codex-hook
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

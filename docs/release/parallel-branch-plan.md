# Parallel Branch Plan

Base commit: `cd8437d Merge Supabase persistence observability`

The previous release hygiene and Supabase persistence observability branches have
been merged into `main`. The next parallel split should keep runtime/data work
separate from UI polish to avoid conflicts and preserve review quality.

## Branch 1: Supabase Live Hardening

- Branch: `feat/supabase-live-hardening`
- Worktree: `/Users/user/Documents/V-19-supabase-hardening`
- Purpose: prove real Supabase persistence, RLS, and Storage behavior without
  fake success states.

Owns:

- Supabase live smoke coverage;
- repository/service failure-path tests;
- RLS and Storage negative-path proof;
- status-history idempotency and persistence proof;
- production runbook gaps for live persistence.

Does not own:

- workspace visual redesign;
- component extraction for UI polish;
- auth redesign;
- schema expansion unless a smoke test exposes a real migration bug;
- billing/admin redesign.

Suggested tasks:

1. Expand `npm run test:supabase-live` to cover remote load/save, media upload,
   owner overwrite denial after handoff, admin review write, and RLS denial for
   the wrong actor.
2. Add repository-level tests for save/upload/list failure paths using
   `PersistenceObservableError`, without exposing provider messages or secrets.
3. Verify status history writes are deterministic and do not duplicate timeline
   rows during retry.
4. Update Supabase release docs only where the new smoke proof changes the
   operator runbook.
5. Run `npm run typecheck`, `npm run test`, `npm run verify:supabase-release`,
   `npm run test:supabase-live`, and `npm run verify`.

## Branch 2: Agent Workspace UI Hardening

- Branch: `feat/agent-workspace-ui-hardening`
- Worktree: `/Users/user/Documents/V-19-ui-hardening`
- Purpose: make the task-first workspace feel production-grade on desktop and
  mobile while preserving current business logic.

Owns:

- task-first workspace component structure;
- responsive layout and no horizontal overflow around 390px;
- loading, empty, error, disabled, and success states;
- accessibility labels/focus states;
- small purposeful motion and reduced-motion behavior;
- E2E and screenshot evidence for visible flows.

Does not own:

- Supabase migrations;
- RLS/storage policy logic;
- auth/session model redesign;
- repository persistence semantics;
- billing/admin redesign.

Suggested tasks:

1. Extract the largest workspace sections from `src/App.tsx` only where it
   reduces risk and improves reviewability.
2. Harden desktop density, mobile stacking, focus order, save/error affordances,
   and returned-correction editing without changing workflow state transitions.
3. Add or update E2E proof for workspace visibility, task selection, selected
   task detail, editing surface, readiness/preflight/handoff reachability, and
   mobile overflow.
4. Capture desktop and mobile screenshots under `docs/qa/` for changed visible
   flows.
5. Run `npm run typecheck`, `npm run test:e2e`, and `npm run verify`.

## Merge Order

1. Merge `feat/supabase-live-hardening` first if it only touches services,
   tests, scripts, Supabase docs, and release docs.
2. Merge `feat/agent-workspace-ui-hardening` second after rebasing on the
   hardened runtime base.
3. Run final gates on `main`:

```bash
npm run verify:full
npm run test:supabase-live
```

## Conflict Rules

- Branch 1 should avoid `src/App.tsx` and `src/styles.css` unless it is fixing
  a real persistence bug that cannot be handled in services.
- Branch 2 should avoid Supabase migrations, policies, and live-smoke semantics.
- If both branches need the same file, stop and re-split the task before editing.

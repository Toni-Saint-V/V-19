# Parallel Branch Plan

Base commit: `51a9523 Package Supabase workspace promotion review`

## Branch 1: Release Hygiene

- Branch: `chore/release-workspace-hygiene`
- Worktree: `/Users/user/Documents/V-19`
- Purpose: keep the release workspace clean and reviewable.

Owns:

- untracked artifact triage under `docs/codex/`;
- root archive/html artifact decision;
- production checklist documentation updates;
- final local `main` gate after both branches merge.

Does not own:

- `src/` runtime changes;
- Supabase migrations;
- RLS policy behavior;
- UI behavior.

Suggested tasks:

1. Decide whether each untracked `docs/codex/*` file should be committed, moved, archived, or deleted.
2. Decide whether `visaflow_codex_docs_patch.zip` and `visaflow_operations_cockpit.html` belong in the repo.
3. Keep only reviewable docs; avoid binary/root clutter unless it is explicitly release evidence.
4. Run `npm run format:check` and `npm run verify:supabase-release`.

## Branch 2: Supabase Persistence Observability

- Branch: `feat/supabase-persistence-observability`
- Worktree: `/Users/user/Documents/V-19-observability`
- Purpose: make Supabase persistence failures diagnosable without weakening security.

Owns:

- safe client-side persistence error normalization;
- user-facing error states for Supabase save/upload/auth failures;
- non-secret diagnostics for RLS/RPC/Storage failures;
- targeted unit/E2E coverage for failure paths.

Does not own:

- release artifact cleanup;
- production migration apply;
- auth redesign;
- schema expansion;
- billing/admin redesign.

Suggested tasks:

1. Add a typed safe error mapper for Supabase persistence and Storage failures.
2. Route save/upload failures through honest UI messages without stack traces or secrets.
3. Add test coverage for RPC failure, Storage upload failure, and offline/local-demo boundaries.
4. Run `npm run typecheck`, `npm run test`, and targeted E2E if UI states change.

## Merge Order

1. Finish and merge `chore/release-workspace-hygiene` into `main`.
2. Finish and merge `feat/supabase-persistence-observability` into `main`.
3. Run final gates on `main`:

```bash
npm run verify:full
npm run test:supabase-live
```

## Conflict Rules

- Branch 1 should stay in docs/release and artifact cleanup.
- Branch 2 should stay in `src/`, `tests/`, and related service docs if needed.
- If both branches need the same file, merge Branch 1 first unless Branch 2 has runtime changes.

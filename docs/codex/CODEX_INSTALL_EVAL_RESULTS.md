# Codex Install Eval Results

Date: 2026-06-13
Repo: `/Users/user/Documents/V-19`
Flow: `Install+Eval`

## Executive Result

Installed:

- `codex-security@openai-curated`
- `plugin-eval@openai-curated`

Final default plugin surface:

- enabled: `browser@openai-bundled`
- installed but disabled: `codex-security@openai-curated`,
  `plugin-eval@openai-curated`

Verdict:

- Keep both new plugins installed.
- Keep both new plugins disabled by default.
- Use `plugin-eval` as the measurement lab.
- Use `codex-security` only as a manual security gate for scoped security diffs,
  RLS/schema changes, auth, storage, AI helper boundaries, or release gates.

Readiness delta:

```text
87 -> 91 (+4)
```

## Evidence

Backup:

- `/Users/user/.codex/backups/install-eval-20260613-004030/config.toml`
- `/Users/user/.codex/backups/install-eval-20260613-004030/plugin-list-before.json`
- `/Users/user/.codex/backups/install-eval-20260613-004030/plugin-list-after-disable.json`
- `/Users/user/.codex/backups/install-eval-20260613-004030/mcp-list-before.txt`
- `/Users/user/.codex/backups/install-eval-20260613-004030/mcp-list-after.txt`

Install outputs:

- `codex-security@openai-curated` installed to
  `/Users/user/.codex/plugins/cache/openai-curated/codex-security/c6ea566d`
- `plugin-eval@openai-curated` installed to
  `/Users/user/.codex/plugins/cache/openai-curated/plugin-eval/c6ea566d`

Config change:

- Added plugin config entries for both new plugins.
- Set both new entries to `enabled = false`.
- Left `browser@openai-bundled` as the only enabled plugin.
- MCP state unchanged: `memory` and `node_repl` enabled; `playwright`,
  `context7`, `figma`, `figma-desktop`, and `openaiDeveloperDocs` disabled.

Rollback:

```bash
cp /Users/user/.codex/backups/install-eval-20260613-004030/config.toml /Users/user/.codex/config.toml
```

Full removal, if needed:

```bash
codex plugin remove codex-security@openai-curated
codex plugin remove plugin-eval@openai-curated
```

## Plugin Eval Findings

Artifacts:

- `/tmp/v19-plugin-eval-20260613-004030/codex-security-analyze.md`
- `/tmp/v19-plugin-eval-20260613-004030/plugin-eval-analyze.md`
- `/tmp/v19-plugin-eval-20260613-004030/codex-logic-analyze.md`
- `/tmp/v19-plugin-eval-20260613-004030/bank-grade-review-analyze.md`
- `/tmp/v19-plugin-eval-20260613-004030/frontend-testing-debugging-analyze.md`

Scores:

| Target                       | Score | Grade | Static risk | Main finding              | Decision             |
| ---------------------------- | ----: | ----- | ----------- | ------------------------- | -------------------- |
| `codex-logic`                |   100 | A     | low         | compact daily skill       | keep core            |
| `bank-grade-review`          |    86 | B     | high        | trigger budget high       | rare gate only       |
| `frontend-testing-debugging` |    86 | B     | high        | invoke budget high        | UI/runtime preset    |
| `plugin-eval`                |    73 | C     | high        | deferred budget excessive | installed, disabled  |
| `codex-security`             |    59 | D     | high        | invoke budget excessive   | installed, rare gate |

Interpretation:

- The local `codex-logic` skill remains the best daily route.
- `plugin-eval` is useful because it quickly exposed context cost instead of
  letting new plugins look valuable by name alone.
- `codex-security` is too expensive for daily use, but it has strong fit for
  high-risk V-19 security surfaces.

## Codex Security Feasibility Pass

Artifacts:

- `/tmp/v19-codex-security-scan-20260613-004030/artifacts/rank_input.csv`
- `/tmp/v19-codex-security-scan-20260613-004030/artifacts/deep_review_input.csv`

Result:

- The Codex Security helper produced a deterministic local-patch worklist.
- It selected 9 source-like changed files from the current V-19 dirty diff.
- The selected scope includes Supabase config, activation logic, typed DB
  surface, submission persistence, frontend shell, and the main migration.

Selected diff worklist:

- `package.json`
- `src/App.tsx`
- `src/lib/supabase/activation.ts`
- `src/lib/supabase/config.ts`
- `src/lib/supabase/database.types.ts`
- `src/services/submissionService.ts`
- `src/styles.css`
- `src/vite-env.d.ts`
- `supabase/migrations/20260611000000_visaflow_mvp_foundation.sql`

Quick risk read:

- No new obvious secret values were found in the scoped grep.
- The current dirty diff is security-relevant because it touches Supabase
  activation, RLS/policies, storage policy logic, migration SQL, and submission
  persistence.
- `codex-security` should be used only when this kind of risk is present.

## Operating Rule

Default daily route:

```text
codex-logic -> targeted proof -> Browser only for UI/runtime -> verdict gate
```

Security route:

```text
codex-logic -> codex-security diff worklist -> manual/security review -> targeted tests -> verdict gate
```

Plugin route:

```text
plugin-eval analyze -> compare with local baseline -> keep disabled unless the task class proves repeat value
```

Do not:

- enable `codex-security` by default
- enable `plugin-eval` by default
- combine security, UI, PR, deploy, observability, and design stacks in one pass
- install broad community workflow packs without `plugin-eval` evidence

## Verification

Already run during the flow:

- `codex plugin add codex-security@openai-curated --json`
- `codex plugin add plugin-eval@openai-curated --json`
- `codex plugin list --available --json`
- `codex mcp list`
- `plugin-eval analyze` on the two new plugin bundles and three local skills
- `codex-security` worklist helper on the current local patch

Required final repo checks:

```bash
./node_modules/.bin/prettier --check docs/codex/CODEX_INSTALL_EVAL_RESULTS.md docs/codex/CODEX_ACCELERATOR_STACKS.md docs/codex/CODEX_PLUGIN_CATALOG_SCREENING.md
npm run typecheck
npm run verify:codex-hook
```

# V-19 Thread Merge Ledger - 2026-07-04

Status: integration ledger for `codex/v19-all-thread-merge-20260704193357`.
Target base: `origin/main` at `b83c5915`.

## Goal

Collect the implementation, UI handoff, QA, and release-readiness work from the
referenced Codex threads into one auditable integration branch without
overwriting the dirty local `main` checkout and without weakening fail-closed
release gates.

## Sources

| Thread | Source checkout / branch | Merge result |
|---|---|---|
| `019f2954-6549-7e42-ab0e-b6977c1eff47` | `/Users/user/.codex/worktrees/94fc/V-19`, `codex/my-actions-linearstyle-transfer` | Partially merged. UI reference extraction, final UI QA evidence, drawer tab ARIA, admin review compact CSS guard, and lint isolation for the extracted reference package were integrated. Known broken `passportExtractionGuards.ts` WIP was not merged. |
| `019f2b75-fa7a-7020-9702-9e0ab3cf12cc` | `/Users/user/.codex/worktrees/v19-combat-ready-20260704-153429/integration/V-19`, `codex/v19-20260704-153429-integration` | Merged release/Supabase readiness docs, verifier/script changes, production blocker evidence, selected UI/test hardening, and fail-closed readiness packet updates. Generated screenshot churn was not merged. |
| `019f2d9d-f29b-7f50-91b4-609ba3d7c2b5` | `/Users/user/.codex/worktrees/f26e/V-19`, detached `49b09ea3` | Reviewed. No product code diff beyond AGENTS guidance; equivalent AGENTS guardrails are already present in this integration. |
| `019f2da4-0495-7412-a3b5-9348f4fc42b7` | `/Users/user/.codex/worktrees/04b8/V-19`, `codex/remove-inbox-on-thread-base` | Core standalone `Входящие` removal was already merged in `b83c5915`; remaining settings label and registration test updates were integrated here. |

## Already Landed In `b83c5915`

- Agent top-level IA: `Мои действия`, `Мои подачи`, `Настройки`.
- Admin top-level IA: `Проверка`, `Выгрузка`, `Настройки`.
- Standalone `agent-inbox` / `admin-inbox` surfaces removed from runtime
  navigation, screen types, tests, and visual lock.
- UI handoff schema added:
  `docs/architecture/v19-ui-screen-model-schema.md`.
- 10-user rollout readiness plan added:
  `docs/release/v19-10-user-rollout-readiness-plan.md`.
- Obsolete `docs/qa/v19-agent-inbox-reference-2026-06-20.png` removed.

## Integrated In This Pass

- `SettingsScreen` admin access section renamed from `Входящие заявки` to
  `Заявки на доступ`, with matching unit/e2e tests.
- Local/demo registration e2e tests updated to `visaflow.workspaceEmail.v2`
  and approved local credentials `2@2.ru` / `22`.
- `V19DrawerHeader` tabs now expose `role="tablist"`, `role="tab"`, and
  `aria-selected`.
- Admin review compact/touch layout guard added so hidden context rail does not
  reserve a grid track and radar/cards do not clip.
- AI radar filter group ARIA label normalized.
- Extracted reference package added under
  `docs/References/perfect_extracted/visaflow_top_product/`.
- `eslint.config.js` ignores only the extracted reference package so `eslint .`
  continues to validate real project code without linting reference app TSX.
- Final UI transfer QA folder added under
  `docs/qa/2026-07-04-final-ui-transfer-all-screens/`, including the later
  `NO MERGE` gate update and final checklist artifacts.
- Supabase production readiness scripts and packet schema updated for
  canonical `submitted_for_review` / `ready_for_export` workflow smoke,
  blocker ownership, production evidence artifacts, and fail-closed `NO_GO`.
- Production blocker/evidence docs added:
  - `docs/qa/supabase-production-backup-discovery-20260701.md`
  - `docs/qa/supabase-production-blockers-20260704.md`
  - `docs/qa/supabase-production-owner-approval-20260701.md`
  - `docs/qa/supabase-production-preactivation-20260704.md`
  - `docs/qa/supabase-production-security-advisors-20260701.md`

## Not Merged Deliberately

| Source | Item | Reason |
|---|---|---|
| `019f2954` | Dirty `src/modules/submissions/passportExtractionGuards.ts` | Source QA marks it as a regression: it removes the `Скан паспорта не проверен.` blocker and breaks `tests/unit/v19SubmissionRules.spec.ts`. |
| `019f2954` | `docs/References/Perfect.zip` | 41 MB binary input artifact. The extracted source/docs subset and QA mapping are committed instead. |
| `019f2954` | Runtime changes that re-add `agent-inbox` / `admin-inbox` | They conflict with the accepted V-19 scope and the already landed standalone inbox removal. |
| `019f2b75` | Modified generated `docs/qa/*.png` responsive screenshots | Binary screenshot churn from local verification, not product/source changes. Fresh proof should be regenerated after this integration branch is verified. |
| Local `/Users/user/Documents/V-19` | Dirty local `main` checkout | Not touched. It is ahead/behind and contains unrelated deletions/untracked archives/reference files. |

## Current Release Truth

- This branch is an integration branch, not a production release.
- `docs/release/supabase-production-readiness.json` remains `NO_GO`.
- `docs/qa/2026-07-04-final-ui-transfer-all-screens/QA_REPORT.md` records a
  source `NO MERGE` state for that UI-transfer branch; this branch still needs
  its own verification after reconciliation.
- Performance and production packet gates are expected to remain blockers until
  the rollout plan phases are closed.

## Verification Required Before Push / Merge

- `git diff --check`
- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run verify:agent-screen-system`
- `npm run verify:v19-boundary`
- `npm run verify:supabase-release`
- `npm run verify:auth-data-readiness`
- `npm run verify:production-packet`
- Targeted Playwright smoke for app/admin review after merge reconciliation.

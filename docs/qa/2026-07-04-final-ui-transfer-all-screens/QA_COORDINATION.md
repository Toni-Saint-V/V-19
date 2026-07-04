# QA Coordination

Current run id: `20260704-174426-MSK-31f9d5cd`

Branch: `codex/my-actions-linearstyle-transfer`
Worktree: `/Users/user/.codex/worktrees/94fc/V-19`
Primary runtime: `http://127.0.0.1:5174/`
Secondary runtime: `http://127.0.0.1:5175/`

Global status: `HOLD_FOR_FIXES`

Allowed agents:

| Agent | Permission | Scope |
|---|---:|---|
| UI Agent | YES | Inspect `docs/References/Perfect.zip`, maintain pixel-match transfer map, fix UI/browser blockers only. |
| Logic Agent | YES | Fix the concrete `passportExtractionGuards.ts` / `v19SubmissionRules.spec.ts` regression only; no broad logic rewrites. |
| Lead QA Gate | YES | Coordination files, source audits, final browser/click QA, hard-gate verdict. |

Locked files:

| Path | Owner | Rule |
|---|---|---|
| `docs/qa/2026-07-04-final-ui-transfer-all-screens/QA_COORDINATION.md` | Lead QA Gate | Append/update status only; do not overwrite without reading latest file. |
| `docs/qa/2026-07-04-final-ui-transfer-all-screens/reference-audit.md` | Lead QA Gate | Source-truth audit. |
| `docs/qa/2026-07-04-final-ui-transfer-all-screens/domain-audit.md` | Lead QA Gate | Domain contract audit. |
| `docs/qa/2026-07-04-final-ui-transfer-all-screens/single-instance-ui-system.md` | Lead QA Gate | Single-instance UI system audit. |

UI agent permission: `UI_AGENT_ALLOWED: YES`
Logic agent permission: `LOGIC_AGENT_ALLOWED: YES`
Commit permission: `COMMIT_ALLOWED: NO`

Current blockers:

- `final-checklist-qa.json` is newer than `all-screens-browser-qa-v4.json` and reports `6` browser/click failures.
- Failing checklist areas: agent drawer tabs, agent mobile drawer path, admin review drawer/dialog opening, admin issue/return/accept paths, admin mobile review blocker/overflow check.
- `src/modules/submissions/passportExtractionGuards.ts` has an uncommitted source edit not created by this QA gate and not yet tied to a passing final report.
- `npm run test` fails in `tests/unit/v19SubmissionRules.spec.ts`: `allows manual review submission when OCR fails after passport upload` now receives `{ ok: true }` instead of expected `{ ok: false, reason: "Скан паспорта не проверен." }`.
- `npm run lint` fails because `docs/References/perfect_extracted/visaflow_top_product/src/components/*.tsx` is scanned by ESLint and contains unused imports / explicit `any`.
- `docs/References/Perfect.zip` is untracked and must not be staged unless explicitly intended.
- Several untracked checklist screenshots/json files exist in this QA folder; they are evidence candidates, not commit-approved artifacts.

Required final gates:

- Reference audit completed.
- Domain audit completed.
- Single-instance UI system audit completed from source.
- Admin Review responsive blocker fixed and proven on desktop/tablet/mobile.
- All main Agent/Admin screens completed.
- Real click/state logic completed.
- Responsive desktop/tablet/mobile QA completed.
- `npm run typecheck` passes on current tree.
- `npm run lint`, `npm run test`, and `npm run build` run if available and safe.
- Browser/click QA performed on `5174`, with runtime owner verified as this worktree.
- QA evidence folder includes `critical-ui-flow-smoke-v5.json`, `critical-ui-flow-smoke-v5.md`, screenshots, and `QA_REPORT.md`.
- No hard-gate blockers remain.

Latest QA summary:

- Preflight confirmed `pwd` is `/Users/user/.codex/worktrees/94fc/V-19`.
- Branch confirmed as `codex/my-actions-linearstyle-transfer`.
- `docs/References/Perfect.zip` exists, size `41M`, and contains the `visaflow_top_product` Vite reference project.
- Source audits created/updated by Lead QA Gate in this run.
- `npm run typecheck`: PASS.
- `npm run lint`: FAIL, blocked by extracted reference source under `docs/References/perfect_extracted`.
- `npm run test`: FAIL, blocked by `passportExtractionGuards.ts` behavior regression.
- `npm run build`: PASS with Vite chunk/dynamic import/plugin timing warnings.
- Current gate remains blocked because the latest checklist evidence is failing.

Commit permission: `NO`

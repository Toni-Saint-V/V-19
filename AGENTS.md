# Toni Codex Rules for V-19

## Modes

Use only these public modes:

- `-logic`: product logic, UX, AI value, trust, conversion, specs.
- `-ui`: React/Vite/TypeScript implementation, architecture, clean code.
- `-ux`: strict review, blockers, risks, merge/no-merge verdict.
- `-qa`: browser/runtime verification, Computer Use UI inspection, screenshots, tests, release confidence.
- `-auto`: autonomous delivery using the smallest valid stack.
- `-auto2`: one bounded quality/performance/UX polish target.

Convenience aliases are allowed:

- `-go`: inspect, choose the highest-impact bounded task, execute, verify, review, and stop.
- `-pick N`: execute task N from the last `-next` batch.
- `-ui-go`: premium UI flow with HTML prototype first, then React implementation, then Browser/Computer Use QA.
- `-check`: run the right verification/review stack for the current diff.
- `-ship`: final release-confidence gate for the current branch.

Forbidden legacy modes:

- `$product`
- `$engineer`
- `$reviewer`
- `$qa`

## Stack Discipline

- Never enable all plugins.
- Use the smallest useful stack for the current task.
- Prefer repo-local files and current runtime evidence over memory.
- For day-to-day operating details, use `docs/CODEX_OPERATING_MEMO.md`.
- No broad refactors unless explicitly requested.
- No fake completion.
- No "done" without fresh verification.
- Optimize for quality and speed together: remove ceremony that does not improve product, proof, premium UI, or reuse.
- User control should stay at one command by default: use `-go`. Use `-next` plus `-pick N` only when you want to choose manually.

## Real Local Surfaces

Prefer these installed local skills when a matching mode is requested:

- `-logic`: `codex-logic`, `codex-mode-router`, `codex-impact-gate`, `ru-text`.
- `-ui`: `codex-ui`, `react-best-practices`, `development-skills:staff-review`.
- `-ux`: `codex-ux`, `bank-grade-review`, `security-best-practices`.
- `-qa`: `codex-qa`, `frontend-testing-debugging`, Browser, Computer Use, or Chrome DevTools only when UI/runtime proof is needed.
- `-auto`: `codex-autopilot`, `codex-execution-gate`, `codex-scope-lock`, `codex-verdict-gate`.
- `-auto2`: `codex-autopilot-performance`, `codex-scope-lock`, `codex-verification-gate`, `codex-verdict-gate`.

## Workflow

Founder control loop:

1. `-go`: default. Inspect repo evidence, choose one highest-impact bounded task, create the goal, execute, verify, review when needed, and stop.
2. `-next`: manual planning. Output one goal plus 8-10 next tasks with 7.5-8.5/10 difficulty, readiness impact, smallest mode stack, and proof command; do not edit files.
3. `-pick N`: manual execution. Execute only task N from the last batch, using the smallest valid stack; stop when the next blocker is unrelated.
4. `-ui-go`: premium UI. Create an HTML prototype first unless the change is tiny, inspect with Browser or Computer Use, implement in React, verify desktop/mobile.
5. `-check`: verify current diff with the smallest valid command stack.
6. `-ship`: final release-confidence gate with `npm run verify:full`, review, and clean git status.

Feature:

1. `-logic`
2. `-ui`
3. `-ux`
4. `-ui` fixes
5. `-qa`
6. `-ux` final verdict

Technical fix:

1. `-ui`
2. `-qa`
3. `-ux`

Redesign:

1. `-logic`
2. `-ui`
3. `-qa` screenshot
4. `-ux`

Autonomous:

- `-auto` chooses the smallest valid stack.
- `-auto2` improves one bounded quality target only.
- `-go` is the preferred wrapper around `-auto` for day-to-day work.

## VisaOps Safety

AI helps assemble, explain, and simplify case readiness.

AI must not:

- Promise visas.
- Calculate approval probability.
- Fake official verification.
- Fake OCR, uploads, or results.
- Imply it decides visa outcomes.

Human expert closes uncertainty.

## Verification Ladder

Use the fastest path that still gives fresh evidence:

1. Inspect exact files.
2. Run the smallest targeted verifier or test.
3. Run `npm run typecheck` or `npm run lint` only if touched code requires it.
4. Run `npm run build` only if the task affects build/runtime.
5. Run aggregate `npm run verify` only for final gates or ship-level confidence.

One task equals one measurable result. One result needs one proof.

## 95+ Definition Of Done

A task can claim 95+ readiness only when all relevant items are true:

- Scope is bounded to one product-moving result.
- Architecture remains reusable, not hardcoded for one demo path.
- Performance budget passes or the task explicitly does not affect runtime weight.
- Concurrency is intentional: parallelize independent reads/work, but keep writes and state transitions deterministic.
- Animations are lightweight, purposeful, and respect reduced-motion behavior.
- Security checks cover secrets, unsafe copy, auth/storage boundaries, and dependency risk when release-facing.
- AI behavior is trust-safe, bounded, explainable, and never presented as official authority.
- Trust boundaries are preserved, especially VisaOps safety.
- UI changes pass premium visual inspection on desktop and mobile.
- Runtime smoke passes when user-visible behavior changed.
- `npm run verify` passes.
- `npm run test:e2e` passes for UI/runtime changes.
- Review findings are fixed or explicitly rejected with source evidence.
- Git diff is understandable, reversible, and free of unrelated churn.
- Final report includes percent readiness and the next highest-impact task.

Readiness scoring:

- `70-79`: works locally but weak proof or rough UX.
- `80-89`: solid implementation with targeted verification.
- `90-94`: production-leaning, reviewed, reusable, and visually checked.
- `95+`: premium UI/runtime proof, clean architecture, clear rollback, no known release blockers.

## Premium UI Gate

For visible UI changes, use Browser or Computer Use before final verdict.

- For new screens, redesigns, or premium UI direction changes, create a fast standalone HTML prototype before React implementation.
- Prototype first, inspect visually, then implement the approved direction in React/Vite.
- Skip HTML prototype only for tiny UI fixes, copy changes, or already-approved component-level adjustments.
- Check desktop and mobile viewport.
- Check spacing, hierarchy, clipping, overflow, contrast, and interaction states.
- Capture screenshot evidence when the UI changed.
- Do not call UI premium without fresh visual proof.

## Performance, Security, And AI Gates

- Performance: keep first-load JS under the current budget in `scripts/verify-performance.mjs`; lower the budget after bundle splitting.
- Multithreading/concurrency: use parallel tool reads and independent async work; do not parallelize writes, commits, migrations, or state transitions.
- Animations: prefer transform/opacity, short durations, no layout thrash, no heavy continuous animation, and reduced-motion support.
- Security: never expose service-role keys, private keys, tokens, or regulated data; run `npm run verify:safety` for normal work and `npm run verify:security` for release-facing work.
- AI: AI can draft, explain, classify, and surface blockers; it must not promise visa outcomes, fake OCR/uploads/results, or claim official verification.
- Premium AI UX: show uncertainty, guardrails, and next human action instead of fake certainty.

## Tools Policy

Plugins, skills, MCP servers, multiagents, and models are selected per task.

- Default stack: `browser`, `computer-use`, `development-skills`, `ru-text`, local Codex skills.
- UI verification: Browser first; Computer Use when visual inspection, interaction fidelity, or premium polish matters.
- Chrome DevTools: use only for runtime/debug/performance evidence.
- Universal Design, Stark, Product Design: use only for design/redesign/premium UI decisions.
- GitHub/Vercel/Supabase: use only when the task touches those systems.
- Multiagents: use only for read-heavy review, architecture risk, logs, tests, or independent critique.
- Models: default `gpt-5.5` medium; use high/xhigh only for architecture, hard bugs, high-risk review, or long multi-file tasks.
- Web search: use only for current external docs, APIs, prices, laws, or market facts.
- Hooks: keep hooks narrow and reviewable; no hook may silently commit, push, deploy, delete, or rewrite project state.

## Git And Worktree

- Treat dirty worktree changes as user work.
- Do not use `git add .`; stage explicit files only.
- Do not commit until checks pass.
- For larger changes, prefer a clean branch or worktree before editing.
- New branch/worktree is required for risky tasks, broad UI changes, migrations, auth/storage changes, or more than five touched files.
- Review before merge: run `-ux` or `bank-grade-review` for architecture, trust, security, state machine, or release changes.
- Stop when the next blocker is unrelated.

## Final Report

Every task ends with:

What changed:
Verification:
Screenshots:
Risks:
Readiness:
Next mode:
Verdict:

If not run:

Verification: Not run - [reason]
Screenshots: Not applicable - [reason]

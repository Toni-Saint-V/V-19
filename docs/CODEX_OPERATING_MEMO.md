# Codex Operating Memo

## Default Control

Use one command for normal product work:

```text
-go
```

`-go` should inspect the repo, create a goal, choose one bounded high-impact task, select the smallest valid tool stack, execute, verify, review if needed, and stop at the next unrelated blocker.

Use manual control only when you want to choose the task yourself:

```text
-next
-pick 2
```

Use premium UI shortcut when the task is mostly visual:

```text
-ui-go
```

Use final checks:

```text
-check
-ship
```

## Goal Usage

Use goal tracking for any block with more than one step.

Required goal shape:

- Goal: one product-moving outcome.
- Success criteria: exact proof commands and expected artifact.
- Stop condition: where to stop instead of widening scope.
- Readiness target: expected percent after completion.

Do not use goal tracking for tiny one-file fixes.

## Large Blocks

Good block size:

- 1 goal.
- 1 product area.
- 3-6 tightly related edits.
- 1 proof chain.
- 1 final review loop.

Avoid:

- Multiple unrelated screens in one block.
- Broad refactors without a failing proof.
- Cleanup mixed with product work.
- New dependencies unless the task clearly needs them.

## Token Economy

Default to the smallest useful stack.

- Read exact files before broad scans.
- Use `rg` and targeted commands first.
- Run small proof before aggregate proof.
- Keep plugins/skills inactive unless the task needs them.
- Prefer `gpt-5.5 medium` by default.
- Use high/xhigh only for architecture, hard bugs, high-risk review, or large multi-file changes.
- Use web search only for current external facts, APIs, docs, prices, laws, or market data.

## Tool Disclosure

Every non-trivial task should report:

- Active plugins.
- Active skills.
- MCP/tools used.
- Model/reasoning level if changed from default.
- Verification commands.
- Screenshots or why screenshots are not applicable.

Example:

```text
Active stack:
Plugins: browser, computer-use
Skills: codex-ui, frontend-testing-debugging
MCP/tools: Browser, Computer Use
Model: default
```

## Premium UI Flow

For new screens, redesigns, and premium UI direction:

1. Build a standalone HTML prototype in `docs/prototypes/`.
2. Inspect it on desktop and mobile.
3. Use Browser first.
4. Use Computer Use for premium visual judgment, interaction fidelity, or screenshots.
5. Carry the approved direction into React/Vite.
6. Verify with `npm run verify`.
7. Verify runtime with `npm run test:e2e`.
8. Capture screenshot evidence.

Skip prototype only for tiny UI fixes, copy changes, or already-approved component adjustments.

Premium UI means:

- Clear hierarchy.
- No clipping or overlap.
- Good density.
- Fast interaction.
- Lightweight animations.
- Reduced-motion safe behavior.
- Reusable components.
- No fake AI/OCR/uploads/results/official verification.

## Verification Ladder

Use this order:

1. Inspect exact files.
2. Run the smallest targeted proof.
3. Run `npm run typecheck` or `npm run lint` only when relevant.
4. Run `npm run verify` before claiming readiness.
5. Run `npm run test:e2e` for UI/runtime changes.
6. Run `npm run verify:security` for release-facing auth/storage/dependency changes.
7. Run `npm run verify:full` for `-ship`.

Current full gate:

```bash
npm run verify:full
```

## QA Correction Loop

If QA is unsatisfactory:

1. Do not mark done.
2. Name the failed proof.
3. Classify the issue: UI, runtime, performance, security, AI trust, architecture, or test gap.
4. Adjust only the needed plugins/skills.
5. Fix the smallest failing surface.
6. Re-run the failed proof first.
7. Re-run `npm run verify`.
8. Repeat until no serious or medium findings remain.

Tool adjustment examples:

- UI issue: add Browser and Computer Use.
- Runtime issue: add Browser or Chrome DevTools.
- Architecture issue: add `codex-ux` or `bank-grade-review`.
- Security issue: add `security-best-practices`, run `npm run verify:security`.
- AI trust issue: use `codex-logic`, `ru-text`, and safety scan.
- Performance issue: run `npm run verify:performance`, then inspect bundle split.

## Intermediate Reports

For long blocks, report after each meaningful phase:

- After inspection: goal, scope, stack, proof plan.
- After implementation: changed files and why.
- After verification: exact commands and result.
- After QA: screenshots and findings.
- After review: remaining risks and readiness percent.

Keep reports short. Do not narrate every command.

## Screenshot Policy

Screenshots are required when UI changes.

Store evidence under:

```text
docs/qa/
```

Use clear names:

```text
docs/qa/<task>-desktop.png
docs/qa/<task>-mobile.png
```

Do not put screenshots in the repo root.

## Safe Git Flow

Default:

1. Work on current branch only for bounded safe changes.
2. Use branch/worktree for risky tasks, broad UI changes, migrations, auth/storage, or more than five touched files.
3. Never use `git add .`.
4. Stage explicit files.
5. Commit only after checks pass.
6. Do not push/deploy unless explicitly requested.

## 100% Operating Standard

A block is operating at 100% only when:

- Goal was explicit.
- Scope stayed bounded.
- Active plugins/skills were named.
- UI used prototype and visual proof when needed.
- Performance/security/AI trust gates were considered.
- Fresh verification passed.
- Serious and medium review findings are closed.
- Screenshots exist for UI work.
- Final report includes readiness percent and next best task.

If any item is missing, report the honest readiness percent and the single next action to raise it.

# -go: One-Command Founder Loop

Use this when the user says `-go`.

Goal: move the product forward with one bounded, high-impact task and no ceremony.

Steps:

1. Inspect source truth: `pwd`, `git status --short --branch`, `rg --files | head -120`, `package.json`, `AGENTS.md`, and the smallest relevant product files.
2. If the worktree is dirty, classify changes as user/baseline/current-task; do not overwrite unrelated work.
3. Identify the highest-impact bounded task backed by repo evidence.
4. Create an internal goal with success criteria, proof command, stop condition, and expected readiness gain.
5. Choose the smallest stack:
   - Product logic: `-logic`.
   - Implementation: `-ui`.
   - Premium UI: `-ui` plus HTML prototype first and Browser/Computer Use.
   - Runtime proof: `-qa`.
   - Risk/review: `-ux`.
6. Use high/xhigh reasoning only for hard architecture, high-risk review, or multi-file refactors.
7. Execute the task.
8. Run the smallest proof first, then `npm run verify`.
9. Run `npm run test:e2e` for UI/runtime behavior.
10. Run `npm run verify:security` for release-facing auth/storage/dependency changes.
11. Review and fix all serious/medium findings before finalizing.
12. Stop at the next unrelated blocker.

Rules:

- Do not ask the user to choose unless there are multiple similarly good tasks or the task is risky/product-directional.
- Do not enable broad plugin stacks.
- Do not use `git add .`.
- Do not push or deploy unless explicitly requested.
- Do not call UI premium without visual proof.

Output:

What changed:
Verification:
Screenshots:
Risks:
Readiness:
Next mode:
Verdict:

# -check: Current Diff Verification

Use this when the user says `-check`.

Goal: prove the current diff is safe enough for its scope.

Steps:

1. Inspect `git status --short --branch` and `git diff --stat`.
2. Choose the smallest valid verification stack.
3. Default checks: `npm run format:check`, `npm run verify`.
4. Add `npm run test:e2e` for UI/runtime changes.
5. Add `npm run verify:security` for auth/storage/dependency/release-facing changes.
6. Use Browser or Computer Use for premium UI claims.
7. Report serious/medium findings first; fix only if the user asked for execution or the finding is in the current task scope.

Output:

Verification:
Findings:
Screenshots:
Risks:
Readiness:
Next mode:
Verdict:

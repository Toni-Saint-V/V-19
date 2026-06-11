# Execute Selected Task

Use this prompt after the user picks one `-next` task.

Goal: execute one selected task quickly without losing quality.

Steps:

1. Restate the selected task and stop condition.
2. Create a branch or worktree only if the task is risky, broad, or touches more than five files.
3. For new screens, redesigns, or premium UI direction changes, make a fast standalone HTML prototype before React implementation.
4. Inspect the prototype with Browser or Computer Use and carry only the approved direction into React.
5. Select only the needed tools:
   - Logic/spec: `codex-logic`, `ru-text`.
   - Implementation: `codex-ui`, `react-best-practices`, `development-skills`.
   - Premium UI proof: Browser plus Computer Use.
   - Runtime/debug: Browser or Chrome DevTools.
   - Review: `codex-ux`, `bank-grade-review`, `security-best-practices`.
   - Performance/security/AI: use the relevant verifier first, not a broad aggregate by default.
6. Make the smallest implementation that satisfies the task.
7. Run the smallest proof command first.
8. Run `npm run verify` before claiming readiness.
9. Run `npm run verify:security` when the task is release-facing or touches auth/storage/dependencies.
10. Run `npm run test:e2e` when UI/runtime behavior changed.
11. Run a review pass for architecture, trust, security, state, AI behavior, or release changes.

Rules:

- Do not broaden scope.
- Do not fix unrelated findings.
- Do not call UI premium without visual proof.
- Do not call the task done while real review findings remain.
- Do not use `git add .`.

Output:

What changed:
Verification:
QA findings:
Screenshots:
Readiness delta:
Remaining risks:
Next highest-impact task:
Verdict:

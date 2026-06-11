# -ship: Release Confidence Gate

Use this when the user says `-ship`.

Goal: decide whether the current branch is ready to share, merge, or deploy.

Steps:

1. Inspect `git status --short --branch`, latest commit, and current diff.
2. Run `npm run format:check`.
3. Run `npm run verify:full`.
4. Run extra Browser/Computer Use QA if visible UI changed since the last accepted proof.
5. Run `-ux` review for architecture, trust, security, state, AI behavior, and release risks.
6. Confirm no critical, serious, or medium findings remain.
7. Do not push, deploy, or open PR unless explicitly requested.

Output:

Verification:
QA findings:
Screenshots:
Readiness delta:
Remaining risks:
Ship verdict:
Next highest-impact task:

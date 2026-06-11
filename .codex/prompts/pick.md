# -pick N: Execute Batch Task

Use this when the user says `-pick N` or `-auto task N`.

Goal: run one selected task from the latest `-next` batch.

Steps:

1. Restate task N, scope, stop condition, and expected proof.
2. If the latest batch is unavailable, run `-next` first and stop for selection.
3. Execute only task N.
4. Use the task's declared stack; add tools only when the implementation proves they are needed.
5. Verify with the declared proof command.
6. Run `npm run verify` before final verdict.
7. Run UI, security, or review gates only when the task touches those surfaces.

Rules:

- No adjacent fixes.
- No broad refactors.
- No unrelated cleanup.
- Stop when a new blocker is unrelated to task N.

Output:

What changed:
Verification:
QA findings:
Screenshots:
Readiness delta:
Remaining risks:
Next highest-impact task:
Verdict:

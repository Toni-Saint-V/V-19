# SPEC / EXECUTE / VERIFY / HANDOFF

Use this frame for non-trivial V-19 work.

## SPEC

- Restate the goal in one sentence.
- Define the exact scope and non-goals.
- List acceptance criteria.
- List known blockers or missing artifacts.
- Choose the smallest valid mode stack.

## EXECUTE

- Inspect relevant files before editing.
- Make the smallest safe change.
- Preserve existing architecture and trust boundaries.
- Do not broaden into unrelated refactors.
- Treat dirty worktree changes as user work.

## VERIFY

- Run the narrowest meaningful check first.
- Use `npm run typecheck`, `npm run lint`, `npm run verify:safety`, or `npm run build` only when relevant.
- For visible UI changes, use Browser or Computer Use inspection and capture evidence.
- For premium UI polish, verify desktop and mobile layout, hierarchy, spacing, clipping, overflow, contrast, and interaction states before final verdict.
- If blocked, say `TESTS_BLOCKED` and request exactly one missing artifact.

## HANDOFF

End with:

What changed:
Verification:
Screenshots:
Risks:
Readiness:
Next mode:
Verdict:

# 05 Verification And Report

Do not claim completion without fresh proof after the latest code change.

## Required Viewports

Check migrated surfaces at:

- `320x740`
- `390x844`
- `430x932`
- `768x1024`
- `1440x900`

Use the exact user-requested viewport too if they specify one.

## Required Assertions

For each migrated screen:

- reference screenshot exists;
- target screenshot exists;
- visual deltas are fixed or listed;
- header height ratio is `<= 0.15` on mobile/tablet;
- `document.documentElement.scrollWidth <= window.innerWidth`;
- mobile visible inset is at least `16px`;
- primary content appears before secondary material;
- sheet/dock/drawer interactions work;
- console/page errors are clean;
- desktop regression checked.

## Code Gates

Run the smallest relevant gates:

- `npm run typecheck` if available;
- targeted tests if touched behavior has tests;
- `npm run build` for runtime/package changes;
- `npm run verify:agent-screen-system` or `npm run verify:v19-ui-proof` when the changed surface matches those gates.

If a gate is unavailable, fails, or is skipped, state the exact reason.

## Final Report Shape

Use this exact shape:

```text
Goal:
Reference:
Target:
Completed:
Files changed:
Tokens added/updated:
Components added/updated:
Screens migrated:
Reference vs target screenshots:
Verification:
Remaining visual deltas:
Remaining risks:
Verdict:
```

Allowed verdicts only:

- `1:1 transfer complete for verified scope`
- `partial: verified slice complete`
- `not ready: visual deltas/blockers remain`
- `blocked: missing reference or target runtime`

Never use broader readiness language than the verified scope supports.

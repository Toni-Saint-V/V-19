# Mobile audit

## Screen

- Route: authenticated admin workspace
- Screen: `Проверка`
- Current desktop status: usable, but visually disconnected from the redesigned agent workspace and subject to intro layout shift
- Current mobile status: queue remains usable, but the context rail is effectively deferred beyond a long board and metric cards are too compressed
- Viewports checked: `390x844`, `1440x900`

## P0 mobile blockers

- None observed before this slice; page-level horizontal overflow was not present.

## P1 mobile blockers

- AI/SLA/rules context appears after the full review board and is not reachable in the primary task flow.
- Four review metrics are compressed into one row and lose readable hierarchy.
- Timed intro removal changes the vertical composition after the user begins scanning.

## P2 mobile polish

- Admin active navigation and profile treatment do not yet share the new agent accent system.

## Chosen mobile pattern

- Pattern: queue-first page with a dedicated context bottom sheet.
- Reason: review cards and blocker actions are primary; AI/SLA/rules are supporting context.
- What stays visible: focus header, blocker CTA, metrics, filters, review queue.
- What stacks: metrics become a `2x2` grid; hero copy and signals stack.
- What collapses: supporting rail is closed by default on mobile.
- What moves into sheet: AI watchlist, SLA, and operational rules.

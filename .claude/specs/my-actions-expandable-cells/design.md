# My Actions Expandable Cells Design

## Decisions

- active owner: `src/components/CommandCenter.tsx`
- queue owner:
  `src/modules/submissions/components/AgentActionsCommandCockpit.tsx`
- screen-scoped visual owner: `src/shared/ui/agent-actions-v2.css`
- state contract: `selectedActionTaskId: string | null`; `null` means all cells
  are collapsed
- identity contract: `task.applicantName` with the existing title fallback plus
  `submissionPublicId(task.submission)`
- invariant: inline mode has zero or one active task; never an implicit first
  task
- invariant: selecting the current task clears selection; selecting another
  task replaces selection in one React state update
- invariant: queue order, sorting, filtering, and scroll ownership remain
  unchanged

## Component changes

### `CommandCenter`

- Stop falling back to `actionTasks[0]` for inline selection.
- Toggle `selectedActionTaskId` in the existing `onSelectTask` callback.
- Continue clearing selection when filters/search/sort invalidate context.

### `AgentActionsCommandCockpit`

- Keep rail mode's historical fallback isolated to rail mode.
- Render the inline detail only when `selectedTask` matches the row.
- Make desktop and mobile disclosure buttons publish their own stable
  `aria-controls` IDs.
- Render a mobile inline detail instead of opening the Drawer from the card
  click; the existing primary/secondary buttons retain exact routing.
- Reduce collapsed identity to applicant name + public ID, next action, status,
  and chevron.

### `agent-actions-v2.css`

- Desktop/tablet collapsed row: three content tracks plus chevron.
- Mobile collapsed card: vertical flow with identity first.
- Keep the existing detail horizontal at wide desktop, two-column at compact
  desktop, and vertical below 768 px.
- Use opacity/color/border transitions only; do not animate list geometry.

## Alternatives considered

1. **Recommended: inline accordion on every viewport.**
   Matches the requested open/close behavior, keeps one active task, and retains
   context without navigation.
2. **Desktop accordion plus direct mobile Drawer.**
   Smaller patch, but contradicts the requested tap-to-open/tap-to-close cell on
   mobile and creates inconsistent behavior.
3. **Fixed right-side detail panel.**
   Produces stable row geometry but does not let the cell itself expand and is
   unsuitable on narrow screens.

## Failure boundaries

- Do not touch the already-dirty `src/shared/ui/system.css`.
- Do not edit the separate untracked `my-actions-optical-polish` spec.
- If mobile inline detail cannot preserve exact action routing, retain the
  Drawer buttons inside the detail rather than duplicating business handlers.
- If switching rows changes queue scroll position, add local scroll anchoring
  in the queue owner; do not add global scroll behavior.

## Verification

- unit: initial collapsed state, same-cell collapse, other-cell switch, one-open
  invariant, mobile disclosure, action routing, disabled reason
- browser: 320, 375, 390, 430, 768, 1024, 1280, 1440
- geometry: no horizontal overflow; queue `scrollTop` stable across same-cell
  close and other-cell switch
- accessibility: `aria-expanded`, `aria-controls`, labelled region, keyboard
  activation, focus-visible, reduced motion, 44 px touch targets
- static: focused Vitest, TypeScript, Prettier/diff check

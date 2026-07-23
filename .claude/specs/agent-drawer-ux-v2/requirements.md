# Agent Drawer UX v2 Requirements

## Scope

Strengthen the active Agent Drawer on desktop and mobile without changing its
four-tab information architecture, canonical submission lifecycle, persistence,
routes, backend APIs, or public `DrawerProps`.

## US-1: Act on the exact next step

**As an** agent
**I want** the Drawer to turn the canonical next step into the primary action
**So that** I can continue work without searching through tabs or the submission list.

### Acceptance criteria

1. WHEN a `draft` Drawer opens
   THE SYSTEM SHALL expose the existing `save_progress` action as `Начать работу`.
2. WHEN an editable submission has a questionnaire target
   THE SYSTEM SHALL open the exact applicant, section, or field.
3. WHEN an editable submission has a required-media target
   THE SYSTEM SHALL open the exact canonical file picker.
4. WHEN a returned submission has an open issue
   THE SYSTEM SHALL lead to the exact correction target.
5. WHEN no blockers remain
   THE SYSTEM SHALL expose the existing canonical lifecycle action.
6. WHILE a submission is read-only or terminal
   THE SYSTEM SHALL expose History and SHALL NOT expose a mutation action.

## US-2: Keep desktop and mobile operational

**As an** agent
**I want** the Drawer to prioritize the current task at every supported viewport
**So that** status context does not displace the work I need to perform.

### Acceptance criteria

1. WHILE the viewport is at least 1024 px wide
   THE SYSTEM SHALL render the existing side Drawer with one dominant next-action block.
2. WHILE the viewport is below 1024 px
   THE SYSTEM SHALL preserve the existing mobile sheet geometry while adding a compact
   header and explicit close control.
3. WHILE the mobile Drawer is open
   THE SYSTEM SHALL keep one primary action and at most one secondary action in the bottom bar.
4. WHEN the returned Issues view opens at 390x844
   THE SYSTEM SHALL show the first correction action without initial scrolling.
5. WHILE the Drawer is shown at 320-1440 px widths
   THE SYSTEM SHALL avoid page-level horizontal overflow and sticky-footer overlap.

## US-3: Present trustworthy progress

**As an** agent
**I want** questionnaire and issue status to name the affected applicant and exact state
**So that** I do not act on approximate or ambiguous progress.

### Acceptance criteria

1. WHEN questionnaire progress is not exactly calculable
   THE SYSTEM SHALL show a state label and SHALL NOT invent a percentage.
2. WHEN a family questionnaire has unfinished work
   THE SYSTEM SHALL name the next affected applicant.
3. WHEN issues include both `open` and `fixed_by_agent`
   THE SYSTEM SHALL separate them into `Нужно исправить` and `Исправлено, ждёт проверки`.
4. WHEN a required file is missing
   THE SYSTEM SHALL make its checklist row actionable only in an editable status.

## US-4: Expose complete feedback accessibly

**As a** keyboard, screen-reader, touch, or reduced-motion user
**I want** every Drawer action and state change to be perceivable and operable
**So that** the workflow remains complete without a mouse or hidden feedback.

### Acceptance criteria

1. WHEN an async action starts
   THE SYSTEM SHALL show a visible pending label, prevent duplicates, and set `aria-busy`.
2. WHEN an action succeeds or fails
   THE SYSTEM SHALL show visible local feedback and announce it through a live region.
3. WHEN an exact target is opened inside the Drawer
   THE SYSTEM SHALL move keyboard focus to that target.
4. THE SYSTEM SHALL use native interactive elements with visible focus styles.
5. WHILE a touch layout is active
   THE SYSTEM SHALL keep every enabled target at least 44x44 px.
6. THE SYSTEM SHALL preserve the existing focus trap, focus return, inert layering,
   keyboard tabs, reduced-motion behavior, and per-tab scroll restoration.

## Non-functional requirements

- Keep `DrawerProps`, `Submission`, `SubmissionStatus`, routes, persistence, and backend APIs unchanged.
- Add no dependency, network request, raw color token, or parallel business state machine.
- Keep the visual delta minimal: preserve existing geometry, color, type, card, and
  motion language unless a change directly improves task clarity, reachability, or feedback.
- Register every enabled Drawer control in the interaction inventory.
- Scope new styles to `.v19-agent-drawer`; do not expand generic fallback selectors.
- Keep localhost evidence separate from production claims.

## Out of scope

- Admin Drawer, export workflow, Supabase schema/RLS, questionnaire persistence.
- New Drawer tabs, routes, or deep links.
- Fixing unrelated submission toolbar or new-submission mobile failures.
- Push, deploy, production mutation, or live credential-backed tests.

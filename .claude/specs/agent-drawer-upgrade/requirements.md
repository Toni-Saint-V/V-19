# Agent Drawer Upgrade Requirements

## Scope

Improve the existing Agent Drawer while preserving its four tabs, public `DrawerProps`, canonical lifecycle, current routes and backend contracts.

## US-1: Understand the submission state

**As an** agent
**I want** to see the submission status, next owner, next step and blocker
**So that** I can decide what to do within 3–5 seconds.

### Acceptance criteria

1. WHEN the Drawer opens
   THE SYSTEM SHALL show the canonical status, next owner, exact next step, primary CTA and concrete blocker reason.
2. WHEN the status is `exported`
   THE SYSTEM SHALL show no next owner and SHALL NOT expose a mutation action.
3. WHEN legacy `requires_action` data is presented
   THE SYSTEM SHALL treat it as the compatibility mapping for `returned` and SHALL NOT add it to the current status matrix.

## US-2: Preserve canonical actions and guards

**As an** agent
**I want** actions to follow the canonical lifecycle
**So that** the Drawer cannot create invalid submission states.

### Acceptance criteria

1. WHEN a `draft` primary action succeeds
   THE SYSTEM SHALL invoke existing `save_progress` behavior and transition to `in_progress`.
2. WHEN an `in_progress` or eligible `returned` submission cannot be submitted
   THE SYSTEM SHALL disable the CTA and explain the canonical guard reason.
3. WHILE a submission is read-only
   THE SYSTEM SHALL allow navigation and SHALL NOT provide upload or edit controls.
4. WHEN an agent confirms `ready_for_export` resubmission
   THE SYSTEM SHALL invoke the existing `submit_for_review` command and reset export readiness through canonical behavior.
5. WHEN that confirmation is cancelled
   THE SYSTEM SHALL NOT mutate submission data.
6. WHEN a mutation is pending
   THE SYSTEM SHALL prevent duplicate invocation.
7. WHEN a mutation fails
   THE SYSTEM SHALL preserve the original state and allow an idempotent retry.

## US-3: Show canonical readiness

**As an** agent
**I want** the Overview to distinguish package media from questionnaire completion
**So that** readiness cannot be inflated by optional or legacy files.

### Acceptance criteria

1. WHEN document readiness is calculated
   THE SYSTEM SHALL use `requiredPassportReviewMediaSlots`.
2. WHEN a family submission is shown
   THE SYSTEM SHALL require a passport for every applicant and `selfie`/`selfie_2` only for the primary applicant.
3. WHEN optional spouse selfies or legacy `photo`, `photo_white` or `video` files exist
   THE SYSTEM SHALL NOT increase required-media readiness.
4. WHEN an applicant percentage is shown
   THE SYSTEM SHALL label it as questionnaire readiness rather than package readiness.

## US-4: Resolve issues safely

**As an** agent
**I want** returned issues to lead to the exact correction target
**So that** unrelated review state is not modified.

### Acceptance criteria

1. WHEN an exact replacement file succeeds
   THE SYSTEM SHALL transition only the matching issue from `open` to `fixed_by_agent`.
2. WHEN an issue is already `fixed_by_agent` or `closed_by_admin`
   THE SYSTEM SHALL NOT change it through a rejected or unrelated action.
3. WHEN a deep-link target is missing
   THE SYSTEM SHALL show a recoverable message and preserve Drawer navigation.

## US-5: Operate the Drawer accessibly

**As a** keyboard, screen-reader or mobile user
**I want** the Drawer to behave as a complete overlay
**So that** navigation, state feedback and actions remain usable.

### Acceptance criteria

1. WHILE the Drawer is open
   THE SYSTEM SHALL trap focus, make the background inert and `aria-hidden`, and return focus after close.
2. WHILE the confirmation dialog is open
   THE SYSTEM SHALL make the underlying Drawer inert.
3. WHEN tabs receive keyboard input
   THE SYSTEM SHALL support arrow, Home and End navigation with correct `aria-selected` state.
4. WHEN a tab is revisited
   THE SYSTEM SHALL restore that tab's scroll position.
5. WHEN a mutation succeeds
   THE SYSTEM SHALL announce success through a live region.
6. WHEN Issues or History has no items
   THE SYSTEM SHALL render an explicit empty state.
7. WHILE the Drawer is shown at 320–768 px widths
   THE SYSTEM SHALL keep content and actions reachable without page-level horizontal overflow.

## Status matrix

| Status                 | Agent mode         | Next owner   | Primary behavior                             |
| ---------------------- | ------------------ | ------------ | -------------------------------------------- |
| `draft`                | editable           | agent        | `Начать работу` via existing `save_progress` |
| `in_progress`          | editable           | agent        | `Отправить на проверку` with canonical guard |
| `submitted_for_review` | read-only          | admin        | `Открыть историю`                            |
| `returned`             | exact corrections  | agent        | `Отправить исправления` after issue fixes    |
| `corrections_received` | read-only          | admin        | `Открыть историю`                            |
| `ready_for_export`     | read-only          | admin/system | history plus confirmed `Вернуть на проверку` |
| `exported`             | terminal read-only | none         | history only                                 |

## Non-functional requirements

- Preserve `DrawerProps`, `SubmissionStatus`, `SubmissionAction`, persisted data, routes and backend APIs.
- Use existing tokens and `.v19-submission-drawer-*` classes; new CSS is scoped to `.v19-agent-drawer-*`.
- Add no dependency, raw color token or parallel business state machine.
- Keep localhost evidence separate from production claims.

## Out of scope

- Canonical transition changes.
- Supabase schema/RLS.
- Admin Drawer and export workflow changes.
- Questionnaire editor behavior.
- New routes or deep links.
- `docs/ROADMAP.md`.

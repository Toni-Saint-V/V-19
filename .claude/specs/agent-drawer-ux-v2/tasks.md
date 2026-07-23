# Agent Drawer UX v2 Tasks

## Phase 1: Specification and baseline

### T-1: Materialize the approved v2 contract

- **Status**: completed
- **Wired**: n/a
- **Verified**: yes
- **Requirements**: US-1-US-4
- **Acceptance**: Requirements, design, tasks, and Praxis staging spec exist before product edits.
- **Dependencies**: none

## Phase 2: Action-first implementation

### T-2: Derive and render one Drawer action intent

- **Status**: completed
- **Wired**: yes
- **Verified**: yes
- **Requirements**: US-1, US-4
- **Acceptance**: Header and footer expose the same canonical target or action for all statuses.
- **Dependencies**: T-1

### T-3: Wire exact questionnaire, media, and issue targets

- **Status**: completed
- **Wired**: yes
- **Verified**: yes
- **Requirements**: US-1, US-3
- **Acceptance**: Every editable next step reaches the exact target without new domain logic.
- **Dependencies**: T-2

### T-4: Preserve Drawer context across questionnaire navigation

- **Status**: completed
- **Wired**: yes
- **Verified**: yes
- **Requirements**: US-1, US-4
- **Acceptance**: Back reopens the originating Drawer/tab and restores focus.
- **Dependencies**: T-3

## Phase 3: Responsive presentation

### T-5: Recompose desktop hierarchy and tab content

- **Status**: completed
- **Wired**: yes
- **Verified**: yes
- **Requirements**: US-1, US-3
- **Acceptance**: Next action dominates; Overview, questionnaire, issues, and history use trustworthy states.
- **Dependencies**: T-2

### T-6: Implement compact mobile task workspace

- **Status**: completed
- **Wired**: yes
- **Verified**: yes
- **Requirements**: US-2, US-4
- **Acceptance**: 320-1023 px layouts preserve the established sheet language while
  keeping tabs, task content, and actions reachable without overlap.
- **Dependencies**: T-5

### T-7: Complete accessible feedback and interaction inventory

- **Status**: completed
- **Wired**: yes
- **Verified**: yes
- **Requirements**: US-4
- **Acceptance**: Native controls, focus, visible async feedback, live announcements, and interaction IDs are complete.
- **Dependencies**: T-3, T-6

## Phase 4: Verification

### T-8: Expand focused unit and browser contracts

- **Status**: completed
- **Wired**: n/a
- **Verified**: yes
- **Requirements**: US-1-US-4
- **Acceptance**: The complete desktop/mobile matrix and all lifecycle states pass locally.
- **Dependencies**: T-4-T-7

### T-9: Run final scoped verification and visual review

- **Status**: completed
- **Wired**: n/a
- **Verified**: yes
- **Requirements**: US-1-US-4
- **Acceptance**: Static/build gates pass and desktop/mobile rubric gates meet the approved threshold.
- **Dependencies**: T-8

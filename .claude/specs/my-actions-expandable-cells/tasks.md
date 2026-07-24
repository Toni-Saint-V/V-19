# My Actions Expandable Cells Tasks

## T-1: Recon and baseline

- **Status**: completed
- **Wired**: n/a
- **Verified**: yes
- **Requirements**: US-1-US-4
- **Acceptance**: active owner, clean change surface, current forced-open
  behavior, row density, and localhost geometry are confirmed.
- **Dependencies**: none

## T-2: Obtain design approval

- **Status**: completed
- **Wired**: n/a
- **Verified**: yes
- **Requirements**: US-1-US-4
- **Acceptance**: user explicitly approves the recommended inline accordion.
- **Dependencies**: T-1

## T-3: Implement controlled disclosure state

- **Status**: completed
- **Wired**: yes
- **Verified**: yes
- **Requirements**: US-1, US-4
- **Acceptance**: zero-or-one selection, same-cell collapse, atomic other-cell
  switch, and exact existing action routing.
- **Dependencies**: T-2

## T-4: Simplify and align collapsed cells

- **Status**: completed
- **Wired**: yes
- **Verified**: yes
- **Requirements**: US-2, US-3
- **Acceptance**: identity-first three-track desktop layout and vertical mobile
  layout contain no duplicate rank/priority/city/date/problem fields.
- **Dependencies**: T-3

## T-5: Add focused coverage

- **Status**: completed
- **Wired**: yes
- **Verified**: yes
- **Requirements**: US-1-US-4
- **Acceptance**: focused unit and browser contracts cover the new disclosure
  behavior and responsive geometry.
- **Dependencies**: T-4

## T-6: Compare baseline and final runtime

- **Status**: completed
- **Wired**: n/a
- **Verified**: yes
- **Requirements**: US-1-US-4
- **Acceptance**: the viewport matrix, scroll stability, accessibility checks,
  and scoped diff review produce a final PASS, BLOCKED, or FAIL verdict.
- **Dependencies**: T-5

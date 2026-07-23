# Agent Drawer Upgrade Tasks

## WORKFLOW STATE

- Package Manager: npm (via `package-lock.json`)
- Framework: React 19 + Vite (via `vite.config.ts`, `react` and `vite`)
- Verification: focused Vitest, Drawer Playwright, `npm run typecheck`, scoped lint/format, `npm run build:local-demo`, `git diff --check`
- Evidence: `/Users/user/.codex/visualizations/2026/07/22/019f8ba8-cf2c-7652-bc9e-d09c78ce1bae/agent-drawer-upgrade-2026-07-23`
- Shared frontend workflow: unavailable in installed plugin package; available framework patterns are authoritative.

## Phase 1: Evidence and specification

### T-1: Capture accepted baseline evidence

- **Status**: completed
- **Wired**: n/a
- **Verified**: yes
- **Requirements**: US-1, US-5
- **Description**: Capture and inspect four fixed Before scenarios, rubric and source-truth ledger.
- **Acceptance**: Four stable screenshots exist, are inspected, hashed and reviewer-ready.
- **Dependencies**: none

### T-2: Materialize approved specification

- **Status**: completed
- **Wired**: n/a
- **Verified**: yes
- **Requirements**: US-1–US-5
- **Description**: Write requirements, design, tasks and Praxis approval packet.
- **Acceptance**: All four approved spec files exist before product edits.
- **Dependencies**: T-1

## Phase 2: Core presentation

### T-3: Derive status, owner, next-step and readiness presentation

- **Status**: completed
- **Wired**: yes
- **Verified**: yes
- **Requirements**: US-1, US-3
- **Description**: Add presentation-only helpers and status header using existing canonical contracts.
- **Acceptance**: Seven statuses and legacy mapping are covered; media readiness uses canonical slots.
- **Dependencies**: T-2

### T-4: Complete tab content and read-only states

- **Status**: completed
- **Wired**: yes
- **Verified**: yes
- **Requirements**: US-2, US-3, US-4
- **Description**: Add explicit questionnaire labels, empty states, missing-target feedback and safe upload/edit guards.
- **Acceptance**: Read-only statuses expose navigation only; issues/history empty states and target recovery are visible.
- **Dependencies**: T-3

## Phase 3: Integration

### T-5: Wire ready-for-export confirmation and async feedback

- **Status**: completed
- **Wired**: yes
- **Verified**: yes
- **Requirements**: US-2
- **Description**: Reuse `ConfirmationDialog`, existing `submit_for_review`, pending/error/retry and success announcement.
- **Acceptance**: Confirm/cancel/success/failure/duplicate/late-result tests pass without new transition logic.
- **Dependencies**: T-3

### T-6: Isolate overlay and preserve tab scroll

- **Status**: completed
- **Wired**: yes
- **Verified**: yes
- **Requirements**: US-5
- **Description**: Make AppShell inert while Drawer is open, make Drawer inert under nested confirmation and restore per-tab scroll/focus.
- **Acceptance**: Keyboard, focus trap/return, inert and nested-dialog tests pass.
- **Dependencies**: T-4, T-5

### T-7: Apply scoped responsive token styling

- **Status**: completed
- **Wired**: yes
- **Verified**: yes
- **Requirements**: US-1, US-5
- **Description**: Activate submission Drawer classes and add scoped Agent Drawer token rules.
- **Acceptance**: 320/375/390/430/768/1440 have no P0/P1 Drawer layout blockers.
- **Dependencies**: T-3, T-4

## Phase 4: Testing and evidence

### T-8: Expand unit and interaction contracts

- **Status**: completed
- **Wired**: n/a
- **Verified**: yes
- **Requirements**: US-1–US-5
- **Description**: Add focused tests for matrix, readiness, confirmation, issue atomicity, async isolation and accessibility.
- **Acceptance**: Focused Vitest suite passes.
- **Dependencies**: T-3–T-7

### T-9: Expand Drawer browser regression

- **Status**: completed
- **Wired**: n/a
- **Verified**: yes
- **Requirements**: US-1–US-5
- **Description**: Verify all seven fixtures, four tabs, read-only, confirmation, focus/inert, mobile and browser errors.
- **Acceptance**: Focused localhost Playwright suite passes.
- **Dependencies**: T-8

### T-10: Run final verification and independent review

- **Status**: completed
- **Wired**: n/a
- **Verified**: yes
- **Requirements**: US-1–US-5
- **Description**: Run typecheck, lint/format, local-demo build, diff check, fixed After capture and independent delta review.
- **Acceptance**: All logic gates pass and reviewer confirms After > Before with no category regression.
- **Dependencies**: T-9

## Traceability

| Requirement | Tasks                         |
| ----------- | ----------------------------- |
| US-1        | T-1, T-3, T-7, T-8, T-9, T-10 |
| US-2        | T-4, T-5, T-8, T-9            |
| US-3        | T-3, T-4, T-8                 |
| US-4        | T-4, T-8, T-9                 |
| US-5        | T-1, T-6, T-7, T-8, T-9, T-10 |

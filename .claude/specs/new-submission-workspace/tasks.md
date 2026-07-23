# Tasks: New submission workspace

### T-1: Integrate create-flow into AppShell

- **Status**: complete
- **Wired**: yes
- **Verified**: yes
- **Requirements**: US-1, US-2
- **Description**: Add create navigation state, active side-menu item, origin
  tracking and guarded navigation to `CommandCenter`.
- **Acceptance**: Shared shell stays visible; dirty/busy exits are safe.
- **Dependencies**: none

### T-2: Refactor PreUploadScreen presentation

- **Status**: complete
- **Wired**: yes
- **Verified**: yes
- **Requirements**: US-2, US-3
- **Description**: Remove fullscreen/dialog shell, report navigation state and
  align target-only layout/CSS to existing operational surfaces.
- **Acceptance**: Intake behavior is unchanged and responsive layout is stable.
- **Dependencies**: T-1

### T-3: Update automated contracts

- **Status**: complete
- **Wired**: n/a
- **Verified**: yes
- **Requirements**: US-1, US-2, US-3
- **Description**: Replace create-drawer assertions with create workspace
  assertions and cover leave guards.
- **Acceptance**: Targeted unit and create/responsive/accessibility E2E pass.
- **Dependencies**: T-1, T-2

### T-4: Verify rendered result

- **Status**: complete
- **Wired**: n/a
- **Verified**: yes
- **Requirements**: US-1, US-2, US-3
- **Description**: Run typecheck/build/UI proof and fresh localhost
  desktop/mobile visual checks.
- **Acceptance**: No overflow, clipping, console errors or CTA regressions.
- **Dependencies**: T-3

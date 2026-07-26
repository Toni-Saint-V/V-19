# AccessGate Visual + Trust Polish Tasks

## Phase 1: Contract and baseline

### T-1: Materialize the approved contract and confirm baseline

- **Status**: completed
- **Wired**: n/a
- **Verified**: yes
- **Requirements**: US-1-US-4
- **Description**: Record Praxis/Spec-Driven artifacts and rerun focused
  AccessGate baseline on the current HEAD.
- **Acceptance**: Documents exist; target files are clean; unit baseline is
  `4/4` and browser baseline is `1 passed / 1 failed` because the 320 px
  registration navigation target is 32 px.
- **Dependencies**: none

## Phase 2: Scoped implementation

### T-2: Add shared mode-aware trust presentation

- **Status**: completed
- **Wired**: yes
- **Verified**: yes
- **Requirements**: US-1, US-3, US-4
- **Description**: Add `mode`, shared identity and factual trust-copy to
  `AccessShell` without changing auth handlers.
- **Acceptance**: All six states render the shared shell; public props and
  callback behavior are unchanged.
- **Dependencies**: T-1

### T-3: Refine responsive AccessGate geometry

- **Status**: completed
- **Wired**: yes
- **Verified**: yes
- **Requirements**: US-1, US-2, US-3
- **Description**: Style the trust composition and correct desktop/mobile
  control geometry in existing scoped CSS owners.
- **Acceptance**: 40/44 px targets, no overflow, stable mobile fold and no
  authenticated-screen impact.
- **Dependencies**: T-2

## Phase 3: Verification

### T-4: Extend focused behavior and browser contracts

- **Status**: completed
- **Wired**: n/a
- **Verified**: yes
- **Requirements**: US-1-US-4
- **Description**: Extend unit/E2E assertions for copy, modes, geometry,
  accessibility and unchanged callbacks.
- **Acceptance**: Focused unit and AccessGate browser suites pass.
- **Dependencies**: T-3

### T-5: Complete static and visual verification

- **Status**: completed
- **Wired**: n/a
- **Verified**: yes
- **Requirements**: US-1-US-4
- **Description**: Run typecheck, focused lint/format, local-demo build and
  identical Before/After visual review outside the repository.
- **Acceptance**: Final verdict is PASS with scoped diff and fresh evidence, or
  BLOCKED/FAIL with the exact unmet contract.
- **Dependencies**: T-4

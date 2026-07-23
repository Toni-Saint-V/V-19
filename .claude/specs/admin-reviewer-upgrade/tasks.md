# AdminReviewer Upgrade Tasks

### T-1: Capture the immutable Before baseline

- **Status**: completed
- **Wired**: n/a
- **Verified**: yes
- **Requirements**: US-4
- **Acceptance**: Historical build, inventory, screenshots, and rubric are stored outside the repository with fixture metadata.
- **Dependencies**: none

### T-2: Restore canonical review guards

- **Status**: completed
- **Wired**: yes
- **Verified**: yes
- **Requirements**: US-1, US-2
- **Acceptance**: Eight fields, complete acceptance package, exact issue scope, family media differences, and immutable failures pass unit tests.
- **Dependencies**: none

### T-3: Restore resilient preview and command feedback

- **Status**: completed
- **Wired**: yes
- **Verified**: yes
- **Requirements**: US-2, US-3
- **Acceptance**: Progressive loading, retry, stale cancellation, read-only mode, guard reasons, and pending/error states are reachable from AdminWorkspace.
- **Dependencies**: T-2

### T-4: Harden precise remark drafting

- **Status**: completed
- **Wired**: yes
- **Verified**: yes
- **Requirements**: US-3
- **Acceptance**: Target, validation, dirty-state protection, severity mapping, focus, and duplicate-submit behavior pass component tests.
- **Dependencies**: T-2

### T-5: Complete queue and responsive states

- **Status**: completed
- **Wired**: yes
- **Verified**: yes
- **Requirements**: US-2, US-3
- **Acceptance**: Empty and filtered-empty states differ; desktop/mobile have no horizontal overflow or inaccessible actions.
- **Dependencies**: T-3

### T-6: Verify and independently review the After

- **Status**: completed
- **Wired**: n/a
- **Verified**: yes
- **Requirements**: US-1, US-2, US-3, US-4
- **Acceptance**: Targeted tests, typecheck, lint, local build, browser state matrix, independent rubric, and red-team review satisfy the release gate.
- **Dependencies**: T-3, T-4, T-5

# Handoff UI 360 Acceptance Tasks

## Workflow state

- Branch: `codex/handoff-ui-360-acceptance-20260726`
- Base: `3fe1e0395c9ece9b6287eab2f52a21d9c462c5bd`
- Package manager: npm via `package-lock.json`
- Framework: React 19 + Vite
- Current step: Completed

## T-1: Reconcile the handoff with current source truth

- **Status**: completed
- **Wired**: n/a
- **Verified**: yes
- **Requirements**: US-1, US-2
- **Description**: Compare the archive with the live `origin/main`, completed
  UI specs, owners, hotspots, and test coverage.
- **Acceptance**: The only unverified archive requirement is the exact 360 px
  viewport; no ungrounded visual change is selected.
- **Dependencies**: none

## T-2: Materialize the bounded specification

- **Status**: completed
- **Wired**: n/a
- **Verified**: yes
- **Requirements**: US-1, US-2
- **Description**: Record requirements, design, ownership, failure handling,
  verification, and out-of-scope boundaries before product or test edits.
- **Acceptance**: `requirements.md`, `design.md`, and `tasks.md` exist on the
  isolated branch.
- **Dependencies**: T-1

## T-3: Add exact 360 px coverage

- **Status**: completed
- **Wired**: yes
- **Verified**: yes
- **Requirements**: US-1, US-2
- **Description**: Add 360 x 800 to the existing responsive viewport matrix
  without removing or changing existing widths. Measure `PreUpload` inner
  overflow at every width and bound the known 360 px difference to 10 px.
- **Acceptance**: The focused responsive scenario executes the existing
  cross-surface fixture at 360 px, operates Drawer controls through pointer
  input, and fails if the measured debt increases.
- **Dependencies**: T-2

## T-4: Resolve only a proven presentation failure

- **Status**: completed
- **Wired**: n/a
- **Verified**: yes
- **Requirements**: US-1, US-2
- **Description**: If and only if the 360 px proof fails, patch the smallest
  existing presentation owner for the exact failure.
- **Acceptance**: No speculative CSS/TSX change; any product change has a
  before-failure and after-pass on the same fixture.
- **Dependencies**: T-3

The first 360 px run exposed 10 px of inner vertical scroll in the unrelated
`PreUpload` card (`559` scroll height vs `549` client height). The handoff does
not list `PreUpload` and requires horizontal-overflow checks, so no product
component or CSS was changed. The test now measures every viewport: existing
widths retain their 1 px tolerance and 360 px fails above the observed 10 px.

## T-5: Run focused and static verification

- **Status**: completed
- **Wired**: n/a
- **Verified**: yes
- **Requirements**: US-1, US-2
- **Description**: Run responsive Playwright, focused Vitest, typecheck, scoped
  lint, local-demo build, and diff check.
- **Acceptance**: All selected gates pass or the exact blocker is recorded.
- **Dependencies**: T-3, T-4

## T-6: Verify Browser and DevTools runtime

- **Status**: completed
- **Wired**: n/a
- **Verified**: yes
- **Requirements**: US-1, US-2
- **Description**: Inspect the same local branch build at 360 and 390 in the
  in-app Browser, then check console/network through Chrome DevTools when its
  profile is available.
- **Acceptance**: Fresh localhost evidence supports a PASS, BLOCKED, or FAIL
  verdict without production claims.
- **Dependencies**: T-5

## T-7: Resolve post-implementation review findings

- **Status**: completed
- **Wired**: yes
- **Verified**: yes
- **Requirements**: US-1, US-2
- **Description**: Open the real Passport Review workspace at 360 px, require
  pointer-operable Drawer controls, replace the unbounded PreUpload bypass with
  a numeric budget, and persist evidence under a run-scoped identity.
- **Acceptance**: RED/mutation checks fail for the intended reasons; GREEN E2E
  covers the real controls and protected-media dialog; final static gates and
  two independent reviews find no remaining real issue.
- **Dependencies**: T-5, T-6

## Verification results

### Initial implementation evidence

- Focused responsive Playwright: passed, `1/1` in 44.0 seconds.
- Focused Vitest: passed, `43/43` across Drawer, Agent Actions, Admin Export,
  and Admin Review.
- Typecheck: passed.
- Scoped ESLint: passed.
- Prettier check: passed.
- Explicit local-demo Vite build: passed; output is outside the repository.
- `git diff --check`: passed.
- In-app Browser at 360 x 800: `scrollWidth=clientWidth=360`,
  `scrollHeight=clientHeight=800`, no warnings or errors.
- In-app Browser at 390 x 844: `scrollWidth=clientWidth=390`,
  `scrollHeight=clientHeight=844`, no warnings or errors.
- Chrome DevTools at 360 x 800: mobile emulation confirmed
  `innerWidth=clientWidth=scrollWidth=360` and
  `innerHeight=clientHeight=scrollHeight=800`.
- Chrome DevTools at 390 x 844: mobile emulation confirmed
  `innerWidth=clientWidth=scrollWidth=390`,
  `innerHeight=clientHeight=scrollHeight=844`, and the `Мои действия` heading.
- Chrome DevTools network: all 45 captured document, script, stylesheet, image,
  XHR, and fetch requests returned `200`.
- Chrome DevTools console: no errors or warnings. Two advisory browser issues
  report form controls without `id` or `name`; these pre-existing semantics are
  outside this exact-width acceptance change.

### Review-fix evidence

- Baseline reproduction: the old responsive test passed `1/1` in 44.2 seconds
  while producing no Passport Review screenshot and using the stale
  `2026-06-21` filename prefix.
- RED overflow contract: a 9 px budget failed with the measured 10 px
  (`bodyScrollHeight=559`, `bodyClientHeight=549`).
- RED provenance unit contract: `2/2` tests failed before the run-id and
  run-scoped-path helpers existed.
- RED path-segment contract: reserved `.`/`..` values and an overlong run id
  failed `4/6` assertions before the sanitizer rejected path traversal and
  enforced a portable 120-character bound.
- RED collision contract: two long IDs with the same branch prefix normalized
  to the same value before truncation preserved a hash of the complete ID.
- Drawer mutation: changing the required close-control name made the focused
  E2E fail at the unconditional visibility assertion.
- Passport mutation: changing the required dialog name made the protected-media
  E2E fail before any media assertion.
- Final combined UI proof: passed `6/6` in 44.4 seconds; its responsive scenario
  passed in 43.4 seconds with tab click/readback, close-button activation, and
  the 10 px overflow budget.
- Final Passport Review E2E: passed `1/1` in 6.2 seconds across 1440, 390, and
  360 px while opening Passport, Selfie 1, and Selfie 2.
- GREEN artifact provenance unit contract: passed `7/7`, including reserved
  segment, path-length, and long-prefix collision coverage.
- Final focused Vitest: passed `50/50` across artifact provenance, Drawer,
  Agent Actions, Admin Export, and Admin Review.
- Final typecheck, scoped ESLint, Prettier check, and `git diff --check`: passed.
- Independent bank-grade forward-risk review: no findings, `PASS`.
- Independent staff-level correctness/maintainability review: no findings,
  `PASS`.
- Durable 360 Passport evidence:
  `postreview-passport/runs/codex-handoff-ui-360-3fe1e039-postreview-passport-20260726/admin-review-workspace/`
  contains three `360x800` protected-media screenshots after the successful
  run.
- Durable responsive evidence:
  `postreview-ui-proof/runs/codex-handoff-ui-360-3fe1e039-postreview-ui-20260726/responsive-proof/`
  contains eleven exact `360x800` screenshots after the successful run.

## Explain-diff checkpoint

### Verified concepts

- The durable change is an exact-width acceptance gate, not a new visual
  language or product flow.
- A failure outside the handoff file map does not grant authority to edit its
  component. The known 360 px `PreUpload` difference is measurable and bounded
  without changing product code.
- Specialized behavior stays in its established owner: broad responsive
  traversal remains in `v19-responsive-proof`, while protected-media traversal
  remains in `verifyEveryAdminDrawerSubview`.

### Conscious skips

- The unrelated `PreUpload` 10 px vertical-fit difference at 360 px was not
  patched because the handoff does not assign that owner; it is now an enforced
  debt ceiling rather than an assertion bypass.
- The two browser autofill advisories were recorded but not patched because
  this branch does not own form-field semantics.

### Unresolved gaps

- None within the bounded exact-360 acceptance scope.

### Resolved divergences

- The initial design assumed every assertion in the broad responsive scenario
  applied to the new handoff width. Fresh evidence showed one unrelated
  `PreUpload` vertical-fit assertion, so the test records an exact ceiling
  without weakening any pre-existing viewport.
- The initial PASS treated the Admin queue as Passport presentation proof and
  accepted optional Drawer controls. The review fix now exercises the real
  protected-media dialog and real pointer controls.
- Static screenshot names were not auditable across parallel runs. Evidence now
  lives under a sanitized configured or generated run identity.

## Verdict

PASS — the original four review findings and the two follow-up provenance
edge-cases are covered by executable RED/GREEN contracts. Fresh runtime,
focused/static gates, and two independent post-fix reviews found no remaining
issue within the bounded exact-360 acceptance scope.

# VisaFlow AI Test Strategy

## Current Test Baseline

Detected in the uploaded repository:

```text
tests/
  unit/
    workflow.spec.ts
  e2e/
    app-smoke.spec.ts
```

Detected scripts:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:e2e
npm run verify
npm run verify:full
```

The existing unit test file covers some workflow gates, including uploaded vs accepted media, admin acceptance preflight, status transition timestamps, appointment normalization, and generated media filenames.

The existing E2E smoke file targets the current command-center workspace, not yet the full required Agent → Admin → Export workflow.

## Testing Principles

1. Domain logic must be unit tested before UI depends on it.
2. UI must call application commands/domain outputs instead of duplicating business rules.
3. Repository adapters must be integration tested without external services.
4. Playwright smoke tests must prove the business workflow, not just render static pages.
5. Tests must be deterministic.
6. Tests must not depend on real Supabase, network, or external visa/appointment systems for MVP.
7. Do not delete tests to make a branch pass.
8. Do not weaken assertions without explaining a product reason.
9. Test data must avoid real personal data.
10. Failing checks must be reported honestly.

## Unit Test Scope

Unit tests should cover pure domain behavior.

Required unit test areas:

### 1. Status Transitions

Cover:

- Valid main lifecycle transitions.
- Invalid skipped transitions.
- `returned` to resubmission path.
- `accepted` to `ready_for_excel`.
- `ready_for_excel` to `exported`.
- Exported to appointment statuses.
- Completed as terminal unless explicitly reopened later.
- Timestamp updates:
  - `submittedAt`
  - `reviewStartedAt`
  - `acceptedAt`
  - `exportedAt`
- Appointment status normalization.

Example cases:

```text
draft → filling: allowed
filling → waiting_review: blocked unless ready_for_review step is explicitly allowed by command
waiting_review → in_review: allowed for admin
in_review → accepted: allowed only if admin preflight passes
accepted → exported: blocked until ready_for_excel if lifecycle requires that stage
completed → draft: blocked
```

### 2. Required Fields

Cover missing and valid values for:

- `fullName`
- `birthDate`
- `citizenship`
- `address`
- `phone`
- `email`
- `passportNumber`
- `passportIssuedAt`
- `passportExpiresAt`
- `country`
- `city`
- `tripDates`
- `hotelName`
- `hotelAddress`

Assertions:

- Missing values produce field-scoped validation issues.
- Empty strings and placeholder `"-"` are invalid.
- Field keys are type-safe.
- UI-friendly labels can be generated without hardcoded UI arrays.

### 3. Blocker Calculation

Cover:

- Tourist/single submission with zero applicants.
- Tourist/single submission with two applicants.
- Family draft with zero applicants.
- Family submit with zero applicants.
- Missing fields.
- Missing media.
- Replace-required media.
- Missing passport number.
- Open blocking correction.
- Open note correction.
- Resolved/fixed correction.
- No blockers for fully ready agent submission.
- No acceptance blockers for fully accepted admin submission.

### 4. Media Status Rules

Cover media slots:

- `photo_white`
- `selfie`
- `video`

Cover media states:

- `no_file` / current legacy `missing`
- `uploaded`
- `replace_required` / current legacy `replace`
- `poor_quality`
- `accepted`

Assertions:

- Every applicant has exactly three required media slots.
- Uploaded media permits agent handoff when no other blockers exist.
- Uploaded media does not permit admin acceptance.
- Only accepted media permits admin acceptance.
- Replacement-required media blocks agent submission and admin acceptance.
- Generated filenames use sanitized passport numbers:
  - `{passportNumber}_photo_white.jpg`
  - `{passportNumber}_selfie.jpg`
  - `{passportNumber}_video.mp4`

### 5. Correction Scope Validation

Cover scopes:

- `submission`
- `applicant`
- `field`
- `media`

Assertions:

- Reason is required for every correction.
- Field correction requires `applicantId` and `fieldKey`.
- Media correction requires `applicantId` and `mediaType`.
- Submission-level correction does not require applicant.
- Applicant-level correction requires applicant.
- Blocking correction blocks acceptance while open.
- Note correction does not block acceptance.
- Fixed/closed blocking correction no longer blocks acceptance.

### 6. Family Grouping

Cover:

- Family can be created with zero applicants in draft.
- Family cannot submit with zero applicants.
- Family readiness is calculated per applicant and aggregated.
- Family applicants preserve grouping.
- Operator can return one applicant inside a family.
- `familyGroupId` is generated/preserved.
- `familyGroupColor` is generated/preserved.
- Family suggestions are assistive only and do not auto-merge applicants.

### 7. Export Row Mapping

Cover:

- Only accepted/ready-for-excel submissions are exportable.
- One row equals one applicant.
- Family rows are adjacent.
- `familyGroupId` is preserved.
- `familyGroupColor` is preserved.
- Required applicant fields map to row columns.
- Media filenames map correctly.
- Missing passport blocks export.
- Open blocking corrections block export.
- CSV escaping handles commas, quotes, and line breaks.
- Export batch includes row count and submission IDs.

## Integration Test Scope

Integration tests should use local/mock repository adapters and application commands.

Required integration flows:

### Create Tourist Submission

```text
Given an agent actor
When the agent creates a Tourist submission
Then the repository stores the submission
And the agent can list it
And another agent cannot list it
And admin can list it
```

### Create Family Submission

```text
Given an agent actor
When the agent creates a Family submission
And adds two applicants
Then the family group is preserved
And applicant readiness is calculated separately
And the submission remains draft/filling until ready
```

### Submit for Review

```text
Given a submission with all required fields and uploaded media
When agent submits for review
Then domain preflight passes
And status becomes waiting_review
And submittedAt is set
And admin queue includes the submission
```

### Return with Corrections

```text
Given admin is reviewing a submission
When admin returns a field/media correction
Then correction is validated
And status becomes returned
And the owning agent can see the exact target
```

### Fix and Resubmit

```text
Given a returned submission
When agent fixes the exact field/file
And marks or resolves the correction as fixed through the allowed command
And resubmits
Then blockers are recalculated
And status becomes waiting_review again
```

### Accept and Export

```text
Given admin has accepted all media
And no open blocking corrections remain
When admin accepts the submission
Then status becomes accepted
When admin marks ready for Excel/export
Then export rows include one row per applicant
And family rows stay adjacent
And export batch is persisted
```

## E2E / Smoke Scope

E2E tests should prove the primary user journey through the actual UI.

Required smoke path:

```text
agent login
→ create family submission
→ add two applicants
→ fill required fields
→ upload required media
→ submit
→ admin accepts
→ export appears
```

Expanded smoke path when correction flow exists:

```text
agent login
→ create family submission
→ add two applicants
→ fill required fields
→ upload required media
→ submit
→ admin starts review
→ admin returns one field or media correction
→ agent sees exact correction
→ agent fixes correction
→ agent resubmits
→ admin accepts
→ export appears
→ admin updates manual appointment status
```

### Required Viewports for UI QA

Use these viewports for important UI changes:

```text
1440×900
1280×800
768×1024
390×844
```

Assertions:

- No horizontal overflow.
- Navigation is usable.
- Dialogs/drawers are reachable and closable.
- Primary actions remain visible.
- Touch targets are usable on mobile.
- Status and correction copy is readable.
- Agent/admin role boundaries are respected.

## CI Checks

Preferred CI command stack for pull requests:

```bash
npm ci
npm run typecheck
npm run lint
npm run test
npm run build
```

Recommended additional gates:

```bash
npm run test:e2e
npm run verify:safety
npm run verify:performance
npm run verify
```

Release-candidate gate:

```bash
npm run verify:full
```

Note: `npm run verify:security` currently maps to `npm audit --omit=dev`. This may need registry/network access depending on CI environment. If unavailable, document the failure and run it in an environment with registry access before production release.

## Merge Gates

A PR can merge to `develop` only when:

- Scope matches the branch/workstream.
- `npm run typecheck` passes.
- `npm run lint` passes.
- `npm run test` passes.
- `npm run build` passes for app-code changes.
- Relevant domain tests exist for changed domain rules.
- Relevant integration tests exist for changed use cases/adapters.
- Relevant Playwright coverage exists for changed critical UI flows.
- No unsafe visa/appointment/AI copy is introduced.
- No unrelated files are changed.
- Remaining risks are listed.

A PR can merge to `main` only when:

- All required workstreams are merged to `develop`.
- Full smoke path passes.
- Responsive QA has been performed.
- `npm run verify` passes.
- `npm run test:e2e` passes.
- `npm run verify:full` passes, or any environment-specific blocker is documented and separately cleared.
- Release notes list known limitations.

## Test Data Rules

Use synthetic data only.

Allowed examples:

```text
agent@visaflow.demo
ops@visaflow.demo
VF-TEST-001
Test Family
Alex Demo
Maria Demo
P1234567
```

Do not use:

- Real passport numbers.
- Real client names.
- Real travel agency emails.
- Real hotel reservations.
- Real visa appointment data.
- Production Supabase data.

Test data should include:

- One fully valid tourist/single submission.
- One valid family submission with two applicants.
- One family submission with a returned applicant-specific correction.
- One submission with missing required fields.
- One submission with uploaded but unaccepted media.
- One submission with accepted media.
- One export-ready family submission.
- One blocked export candidate.

## What Must Pass Before Merge

### Domain/Core PRs

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

Required tests:

- Unit tests for changed domain rules.

### Storage/Repository PRs

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

Required tests:

- Local/mock repository integration tests.
- Mapper tests when DB row/domain mapping changes.

### UI PRs

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:e2e
```

Required checks:

- No horizontal overflow for changed screens.
- Loading/empty/error states where relevant.
- Role boundary preserved.
- Safe copy.

### Export/Appointment PRs

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:e2e
```

Required tests:

- Export row mapping unit tests.
- Export eligibility tests.
- Manual appointment status tests.
- Smoke test or targeted E2E for export visibility.

### Release Candidate

```bash
npm run verify
npm run test:e2e
npm run verify:full
```

If any command fails:

1. Record exact command.
2. Record relevant error.
3. Classify severity.
4. Fix if in scope.
5. Re-run the smallest failing command.
6. Re-run broader gate before merge.

## Minimal Missing Scripts

The repository already has the preferred scripts:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

No minimal scripts need to be proposed at this time.

Potential future additions:

```json
{
  "test:unit": "vitest run tests/unit",
  "test:integration": "vitest run tests/integration",
  "test:smoke": "playwright test tests/e2e"
}
```

Do not add these unless they simplify CI and do not duplicate existing behavior confusingly.

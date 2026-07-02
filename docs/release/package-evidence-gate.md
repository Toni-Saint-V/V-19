# Package Evidence Gate

> Historical package evidence record only. This document must be read as dated
> context and must not override `docs/release/canonical-domain-contract.md`,
> current source, or fresh verifier output.

**File:** `docs/release/package-evidence-gate.md`
**Product:** VisaFlow V-19
**Branch:** `pkg/05-release-evidence-gate`
**Status:** release evidence record, not production readiness approval
**Recorded:** 2026-06-27

---

## Source of truth

The canonical domain contract remains:

- `docs/release/canonical-domain-contract.md`

Completed package evidence must be read against that contract. The canonical
runtime path remains `src/modules/submissions`; the legacy stack remains
compatibility/archive/adapter-only release context.

Canonical media remain only:

- `passport_scan`
- `selfie`
- `selfie_2`

Rejected legacy media remain:

- `photo`
- `photo_white`
- `video`

Canonical statuses remain only:

- `draft`
- `in_progress`
- `submitted_for_review`
- `returned`
- `corrections_received`
- `ready_for_export`
- `exported`

---

## Completed package evidence

### Package 1 - Canonical Domain Contract

Recorded commits:

- `5f693848 feat(submissions): implement canonical domain contract`
- `2a2f68ec fix(submissions): normalize legacy snapshots at canonical boundary`
- `71270b4d fix(submissions): normalize legacy snapshots at canonical boundary`

Evidence recorded:

- Canonical statuses and transitions are owned by `src/modules/submissions`.
- Snapshot/local boundary data normalizes legacy statuses before canonical runtime decisions.
- Canonical runtime media are limited to `passport_scan`, `selfie`, and `selfie_2`.
- Legacy `photo`, `photo_white`, and `video` are rejected or ignored at canonical boundaries and do not satisfy readiness.
- Invalid legacy upload targets fail closed without mutating canonical state.

Representative proof files:

- `src/modules/submissions/domainContract.ts`
- `src/modules/submissions/domainEngine.ts`
- `src/modules/submissions/status.ts`
- `src/modules/submissions/submissionActions.ts`
- `src/modules/submissions/persistence.ts`
- `src/modules/submissions/supabasePersistence.ts`
- `tests/unit/submissions/domainContract.test.ts`
- `tests/unit/v19DomainEngine.spec.ts`
- `tests/unit/v19SubmissionRules.spec.ts`
- `tests/unit/v19SupabasePersistence.spec.ts`

### Package 2 - Supabase / Backend Contract Alignment

Recorded commits:

- `27e14fc6 fix(submissions): align backend contract with canonical domain`
- `a87e0f43 fix(submissions): enforce canonical export readiness`

Evidence recorded:

- Backend/readiness/export checks use the canonical media trio only.
- Legacy `photo`, `photo_white`, and `video` do not satisfy readiness or export readiness.
- Legacy statuses normalize before backend readiness/export decisions.
- Legacy terminal statuses remain `exported` only when valid persisted export timestamp context exists.
- Export readiness fails closed when legacy media remain attached to the candidate package.

Representative proof files:

- `src/modules/submissions/exportRules.ts`
- `src/modules/submissions/mediaStoragePolicy.ts`
- `tests/unit/storageService.spec.ts`
- `tests/unit/supabasePersistenceFailurePaths.spec.ts`
- `tests/unit/submissionExportWorkflow.spec.ts`
- `tests/unit/v19SubmissionRules.spec.ts`

### Package 3 - Test Surface Realignment

Recorded commits:

- `2b08902f test(submissions): align release proof with canonical runtime`
- `a4974c86 test(submissions): classify full legacy test surface`
- `0748a3b9 test(submissions): detect legacy test imports precisely`

Evidence recorded:

- Release proof tests target the canonical runtime path under `src/modules/submissions`.
- Legacy stack tests are classified as archive/adapter coverage, not release truth.
- Legacy path detection is limited to actual legacy imports, so canonical tests that mention legacy paths in strings or assertions are not excluded from release proof.
- Release proof expectations use only `passport_scan`, `selfie`, and `selfie_2`.

Representative proof files:

- `tests/unit/submissions/releaseProof.test.ts`
- `tests/unit/v19DomainEngine.spec.ts`
- `tests/integration/supabase-live.spec.ts`

### Package 4 - Export / Readiness Verification

Recorded commit:

- `2ddafb2a test(submissions): verify canonical export readiness`

Evidence recorded:

- Export is allowed only from `ready_for_export`.
- `submitted_for_review`, `returned`, `corrections_received`, and `exported` are not exportable.
- `exported` remains terminal.
- Legacy terminal statuses with persisted export timestamp context remain exported.
- Legacy media block export readiness.
- Failed export/package identity checks do not mark submissions as exported.

Representative proof files:

- `src/modules/submissions/exportWorkflow.ts`
- `tests/unit/submissionExportWorkflow.spec.ts`
- `tests/unit/v19SubmissionRules.spec.ts`

---

## Package 5 local verification record

Required local gates for Package 5:

| Command | Status | Notes |
|---|---:|---|
| `npm run typecheck` | PASS | Fresh Package 5 run on `pkg/05-release-evidence-gate`. |
| `npm run test` | PASS | Fresh Package 5 run on `pkg/05-release-evidence-gate`. |
| `npm run lint` | PASS | Fresh Package 5 run on `pkg/05-release-evidence-gate`. |

These gates are local release evidence only. They do not override the known
aggregate verification blocker below.

---

## Known blockers

`npm run verify` is not green for this release gate because
`verify:v19-ui-proof` still fails on an unrelated UI accessibility color
contrast issue.

That blocker is intentionally not fixed in Package 5. It belongs to a later
QA/UI package.

This document must not be used to claim V-19 production-ready while that
aggregate verification blocker remains unresolved.

---

## Production readiness gate notes

- Packages 1-4 have documented local evidence for canonical domain, backend
  alignment, test surface realignment, and export readiness verification.
- Package 5 records evidence only; it does not change runtime behavior.
- Local `typecheck`, `test`, and `lint` passing is necessary evidence, not full
  production readiness.
- `npm run verify` remains blocked by the known UI accessibility contrast issue.
- Production-ready status remains withheld until the aggregate gate is green or
  the blocker is explicitly resolved and reverified in scope.

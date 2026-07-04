# Domain Audit

Run id: `20260704-174426-MSK-31f9d5cd`

Files inspected:

- `src/modules/submissions/types.ts`
- `src/modules/submissions/uiTypes.ts`
- `src/modules/submissions/domainContract.ts`
- `src/modules/submissions/domainEngine.ts`
- `src/modules/submissions/status.ts`

## Findings

| Contract item | Source evidence | Result |
|---|---|---|
| Allowed submission types | `SubmissionType = "single" | "family"` in `types.ts`; `createDraft` rejects anything else in `domainEngine.ts`. | PASS |
| Forbidden `group` type | No `group` in `SubmissionType`; unit tests include `type: "group" as never` as a rejection case. | PASS |
| Canonical statuses | `CANONICAL_SUBMISSION_STATUSES` defines `draft`, `in_progress`, `submitted_for_review`, `returned`, `corrections_received`, `ready_for_export`, `exported`. | PASS |
| Legacy status handling | `requires_action` exists only as compatibility presentation/runtime state and is normalized/rejected through domain guards. | PASS WITH COMPATIBILITY NOTE |
| MVP required media | `CANONICAL_FRONTEND_MEDIA_TYPES` is exactly `passport_scan`, `selfie`, `selfie_2`; `canonicalRequiredMediaReadiness` iterates only those media types for each applicant. | PASS |
| Full visa package docs are not MVP blockers | `canonicalRequiredMediaReadiness` does not require visa PDFs/full package docs; submit/accept guards call this canonical media readiness plus questionnaire/trip-date checks. | PASS |
| Issue lifecycle | Canonical issue statuses are `open`, `fixed_by_agent`, `closed_by_admin`; allowed transitions enforce `open -> fixed_by_agent -> closed_by_admin`. | PASS |
| Acceptance blocked by issues | `acceptSubmission` blocks when issues are `open` or `fixed_by_agent`; `status.ts` mirrors this through `acceptanceBlockingIssueCount`. | PASS |
| Export fail-closed | `generateExport` requires admin role and export summary/package identity readiness; `markExported` requires downloaded export package identity. | PASS |

## Required Confirmations

- Allowed submission types: `single`, `family`.
- Forbidden: `group`.
- Canonical statuses:
  - `draft`
  - `in_progress`
  - `submitted_for_review`
  - `returned`
  - `corrections_received`
  - `ready_for_export`
  - `exported`
- MVP appointment readiness blocks only on:
  - `passport_scan`
  - `selfie`
  - `selfie_2`
- Full visa package docs are not MVP blockers.

Domain audit verdict: `PASS_SOURCE_AUDIT`

Gate note: source contract passes. Runtime click QA still has open failures in the latest checklist evidence, so this does not grant merge or commit permission.

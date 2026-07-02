# Canonical Domain Contract — VisaFlow V-19

**File:** `docs/release/canonical-domain-contract.md`  
**Product:** VisaFlow V-19  
**Package:** V-19 canonical product/domain contract
**Status:** normative release contract  
**Scope:** submission-first product model, agent/admin roles, canonical statuses, media/questionnaire requirements, issue lifecycle, role/action permissions, export readiness, AI boundary, demo/production boundary, legacy mappings, fail-closed behavior, forbidden product drift.
**Out of scope:** implementation code, roadmap, UI redesign, responsive behavior, new product features, audit repetition.

---

## 1. Contract authority

### 1.1 Canonical source of truth

The canonical Package 1 domain module boundary is:

- `src/modules/submissions`

Release truth is limited to non-UI domain/application files under that module.
All release-critical domain behavior must be defined from those canonical
domain/application files only:

- submission statuses;
- status transitions;
- role/action permissions;
- issue lifecycle;
- media/file requirements;
- questionnaire readiness;
- export readiness;
- fail-closed command behavior.

The following files and surfaces under `src/modules/submissions` are not release truth:

- `components/*`;
- `pages/*`;
- AI helper surfaces;
- demos, tests, and stories;
- presentation-only adapters.

If UI, helper, adapter, or legacy code disagrees with canonical
domain/application files, the canonical domain/application files win.

### 1.2 Non-canonical legacy stack

The following files are non-canonical for Package 1:

- `src/types/domain.ts`
- `src/lib/workflow.ts`
- `src/services/submissionService.ts`

These files may remain only as compatibility, archive, or adapter surfaces. They must not define release truth for statuses, transitions, media requirements, issue rules, export readiness, permissions, or validation.

### 1.3 Release truth rule

V-19 has one release truth:

- canonical domain/application files under `src/modules/submissions`;
- canonical release contract: this file;
- legacy stack: adapter/archive only.

No legacy value may be written back into canonical state unless it is explicitly normalized by this contract.

### 1.4 Submission-first product model

`Submission` is the only top-level operational object. Applicants, family
members, questionnaire sections, media/files, issues, history events, review
state, and export state are contextual children of a submission.

V-19 supports only:

- submission types: `single`, `family`;
- primary country metadata: Spain / `ES`;
- operational roles: `agent`, `admin`.

Do not introduce parallel top-level CRM, People, Families, Groups, analytics,
board, saved-filter, legal-promise, or multi-country primary surfaces.

### 1.5 Agent and admin role boundary

Agents own intake, questionnaire completion, required media upload/replacement,
fixing returned issues, and resubmitting corrections.

Admins own review, issue creation, issue closure, acceptance for export,
export readiness validation, and export completion.

The system may perform deterministic validation and export bookkeeping only
through explicit domain/application commands. Unknown actors and unknown roles
fail closed.

### 1.6 Issue lifecycle

The only canonical issue lifecycle is:

```text
open -> fixed_by_agent -> closed_by_admin
```

An admin-created issue starts as `open`. An agent may mark the issue fixed only
after correcting the referenced field/file/workspace target. An admin must
close the issue after review. Acceptance and export are blocked while any
blocking issue is `open` or `fixed_by_agent`.

### 1.7 Export readiness

Export readiness is fail-closed. A submission can be exported only when:

- status is `ready_for_export`;
- every applicant has complete questionnaire and canonical required media;
- blocking issues are closed;
- city/trip/export package identity rules pass;
- the export row model used by preview and workbook generation is the same.

Excel is the active export artifact. ZIP/package export, appointment submission,
or production delivery claims require a later approved contract.

### 1.8 AI, OCR, and PDF boundary

AI, OCR, and PDF extraction surfaces are advisory helper surfaces. They may
prepare summaries, evidence labels, conflict hints, and manual-review targets.
They must not:

- make canonical status, readiness, permission, issue, or export decisions;
- call OpenAI/LLM providers from React render;
- apply OCR/PDF values to questionnaire fields automatically;
- hide evidence or collapse conflicts into silent mutations;
- claim official verification, production OCR, or legal correctness.

All discrepancies must remain visible for manual review, field opening, or
admin remarks.

### 1.9 Demo and production boundary

Local demo and e2e helpers are not production proof. Demo auth, seed users,
role switching, local bypass flags, mocked OCR, and local media adapters may
run only in local/demo contexts.

Supabase production remains inactive unless every activation gate passes:

- `VITE_SUPABASE_BACKEND_TARGET=supabase`;
- explicit activation target;
- release switch enabled;
- migration/RLS/Storage/Edge/browser-key/browser-QA evidence recorded;
- owner production approval recorded.

Unsafe or incomplete production configuration must fail closed to local/demo or
blocked state. Closed-pilot or dummy-only proof must not be reported as
production readiness.

---

## 2. Canonical submission statuses

The canonical `SubmissionStatus` set for Package 1 is exactly:

| Status | Meaning | Owner of next action |
|---|---|---|
| `draft` | Submission exists but work has not formally started. It may be incomplete. | Agent |
| `in_progress` | Agent is filling questionnaire and uploading required media. | Agent |
| `submitted_for_review` | Agent submitted a complete package for admin review. | Admin |
| `returned` | Admin returned the package with open issues. | Agent |
| `corrections_received` | Agent submitted fixes for returned issues. | Admin |
| `ready_for_export` | Admin accepted the package; it is eligible for export. | Admin/System |
| `exported` | Export was durably completed. Terminal state. | None; read-only |

### 2.1 Forbidden canonical statuses

The following values are not canonical Package 1 statuses and must not be emitted by canonical domain code:

- `requires_action`
- `filling`
- `ready_for_review`
- `waiting_review`
- `in_review`
- `accepted`
- `ready_for_excel`
- `attention_required`
- `sent_to_appointment`
- `appointment_scheduled`
- `completed`

They are legacy input values only and must be normalized at the boundary.
`requires_action` may remain in `src/modules/submissions/types.ts` only as a
compatibility-only `LegacyRuntimeSubmissionStatus` for legacy presentation and
adapter surfaces. It is not canonical release state; canonical commands,
persistence, export readiness, and production decisions must normalize it to
`returned` or reject it through the domain contract guards.

---

## 3. Legacy status mapping

Legacy statuses must be mapped before they reach canonical business logic.

| Legacy status | Canonical status | Guard / rule |
|---|---|---|
| `requires_action` | `returned` | Unconditional legacy alias. |
| `filling` | `in_progress` | Unconditional legacy alias. |
| `ready_for_review` | `submitted_for_review` | Unconditional legacy alias. |
| `waiting_review` | `submitted_for_review` | Unconditional legacy alias. |
| `in_review` | `submitted_for_review` | Unconditional legacy alias. |
| `accepted` | `ready_for_export` | Acceptance does not mean exported. |
| `ready_for_excel` | `ready_for_export` | Excel/export readiness maps to package export readiness. |
| `attention_required` | `returned` | Unconditional legacy alias. |
| `sent_to_appointment` | `exported` | Only if `exported_at` exists and is a valid persisted timestamp. |
| `sent_to_appointment` | `ready_for_export` | If `exported_at` is missing. |
| `appointment_scheduled` | `exported` | Only if `exported_at` exists and is a valid persisted timestamp. |
| `appointment_scheduled` | `ready_for_export` | If `exported_at` is missing. |
| `completed` | `exported` | Only if `exported_at` exists and is a valid persisted timestamp. |
| `completed` | `ready_for_export` | If `exported_at` is missing. |

Canonical statuses pass through unchanged.

Unknown statuses fail closed. They must not be guessed, coerced, displayed as canonical, submitted, reviewed, or exported.

---

## 4. Canonical required submission package

A Package 1 submission is review-submittable only when every applicant has exactly the required domain package:

| Required artifact | Canonical domain key | Required for review | Required for export | Notes |
|---|---|---:|---:|---|
| Questionnaire | `questionnaire` | Yes | Yes | All required canonical fields must be complete and valid. |
| Passport scan | `passport_scan` | Yes | Yes | Passport identity page scan/photo. |
| Selfie, straight/front | `selfie` | Yes | Yes | Front-facing selfie. |
| Selfie, side/profile | `selfie_2` | Yes | Yes | Side/profile selfie. Not video. |

There is no Package 1 requirement for a white-background photo.

There is no Package 1 video artifact.

### 4.1 Canonical frontend file/media types

The canonical frontend media types for Package 1 are exactly:

| Canonical frontend type | Semantic meaning | Required |
|---|---|---:|
| `passport_scan` | Passport scan | Yes |
| `selfie` | Straight/front selfie | Yes |
| `selfie_2` | Side/profile selfie | Yes |

The following values are not canonical frontend media types for Package 1:

- `photo`
- `photo_white`
- `video`

### 4.2 Required-media readiness rule

For each applicant, required media passes readiness only when all of the following are true:

- `passport_scan` exists for the same applicant;
- `selfie` exists for the same applicant;
- `selfie_2` exists for the same applicant;
- none of the required media slots is `missing`;
- none of the required media slots is `needs_replacement`;
- no required media slot is represented by `photo`, `photo_white`, `video`, or any unknown legacy alias;
- storage identity exists for uploaded media where persistence/storage is active.

For `submitted_for_review`, required media may be awaiting admin review.

For `ready_for_export` and `exported`, required media must have passed admin acceptance or equivalent canonical export-readiness validation.

---

## 5. Supabase/storage media mapping

Canonical frontend media types map to Supabase/storage slots as follows:

| Canonical frontend type | Supabase/storage slot | Direction | Required |
|---|---|---|---:|
| `passport_scan` | `passport_scan` | frontend ⇄ storage | Yes |
| `selfie` | `selfie` | frontend ⇄ storage | Yes |
| `selfie_2` | `selfie_2` | frontend ⇄ storage | Yes |

No Package 1 canonical storage slot exists for:

- `photo_white`;
- `video`;
- white-background photo;
- selfie video.

Storage policies, readiness checks, export checks, and persistence mappers must use only the three canonical media slots above.

---

## 6. Legacy media mapping and rejection policy

Package 1 removes the old white-photo/video model.

| Legacy/media value | Package 1 treatment | May satisfy required media? | May be written by canonical flow? |
|---|---|---:|---:|
| `photo` | Rejected as non-canonical. There is no Package 1 white-background photo. | No | No |
| `photo_white` | Archive-only legacy value. Must not map to a canonical required artifact. | No | No |
| `video` | Removed. Must not be accepted as `selfie_2`. | No | No |

The deprecated mapping `photo_white -> photo` is invalid for Package 1 because `photo` is not a canonical media type.

The deprecated mapping `video -> selfie_2` is invalid for Package 1. `selfie_2` means side/profile selfie image, not video.

Historical records containing `photo`, `photo_white`, or `video` may be preserved only in legacy archive/adapter surfaces. They must fail canonical readiness unless replaced by valid canonical media.

---

## 7. Common transition guards

Every status-changing command must enforce these guards before mutation:

| Guard | Rule |
|---|---|
| Known actor | Actor must be `agent`, `admin`, or authorized `system`. Unknown role fails. |
| Correct role | Actor role must match the transition matrix. |
| Canonical current status | Current status must be one of the seven canonical statuses. Unknown status fails. |
| Exact `from` match | Stored status must match the transition `from` status. |
| Canonical target status | Target status must be canonical. |
| Export terminality | `exported` cannot transition to any mutable state. |
| Required package | Questionnaire + `passport_scan` + `selfie` + `selfie_2` must satisfy the guard for the target state. |
| Issue consistency | Open/fixed/closed issues must obey the issue lifecycle. |
| Media consistency | `photo`, `photo_white`, `video`, and unknown media types fail at the canonical boundary. |
| Atomic command | Failed command must not mutate status, issues, media, questionnaire, export metadata, or history. |

---

## 8. Allowed status transitions

The following table is the complete Package 1 status transition matrix.

| ID | Action | Actor / role | From status | To status | Guards |
|---|---|---|---|---|---|
| T0 | Create submission draft | `agent` | none | `draft` | Agent is known; ownership is assigned; initial status is canonical; no legacy status/media value is written. |
| T1 | Save/start progress | `agent` | `draft` | `in_progress` | Agent owns the submission; at least one applicant exists; questionnaire/media may be incomplete; no admin issue exists yet. |
| T2 | Submit for review | `agent` | `in_progress` | `submitted_for_review` | Agent owns the submission; every applicant has complete questionnaire + `passport_scan` + `selfie` + `selfie_2`; no required media is missing/rejected; no `photo`, `photo_white`, `video`, or unknown media value exists in the canonical package; no unresolved issue exists; passport extraction/review gates pass if active. |
| T3 | Return with issues | `admin` | `submitted_for_review` | `returned` | Admin is known; at least one valid `open` issue exists; each issue target points to an applicant/questionnaire field/section/media slot in the canonical package; no issue is closed directly from `open`; no export metadata is committed. |
| T4 | Accept first review | `admin` | `submitted_for_review` | `ready_for_export` | Admin is known; no `open` issue exists; no `fixed_by_agent` issue exists; every applicant package is complete; required media has passed admin acceptance/export-readiness validation; export readiness is initialized but export is not yet completed. |
| T5 | Submit corrections | `agent` | `returned` | `corrections_received` | Agent owns the submission; at least one `open` issue exists; every `open` issue has a concrete correction; corrected issues move to `fixed_by_agent`; questionnaire/media package remains complete; no closed issue is reopened; no forbidden media value is introduced. |
| T6 | Close issues and accept | `admin` | `corrections_received` | `ready_for_export` | Admin is known; all `fixed_by_agent` issues are reviewed; accepted fixed issues move to `closed_by_admin`; no `open` issue remains; package is complete; required media has passed admin acceptance/export-readiness validation. |
| T7 | Return again with new issues | `admin` | `corrections_received` | `returned` | Admin is known; at least one new valid `open` issue exists; closed issues remain closed; old issues are not reopened; package is not export-ready until the new open issues are resolved. |
| T8 | Prepare/export package metadata | `admin` or authorized `system` | `ready_for_export` | `ready_for_export` | Status-preserving export preparation only; selected submissions are still `ready_for_export`; no unresolved issues exist; package identity/idempotency checks pass; generated/downloaded export metadata may be recorded only if the command succeeds. |
| T9 | Mark exported / complete export commit | `admin` initiated, authorized `system` committed | `ready_for_export` | `exported` | Export package identity exists; export package was generated and downloaded/committed; selected submissions still match the package fingerprint/idempotency key; `exported_at` is written as a valid persisted timestamp; no unresolved issue exists; command is atomic. |

No other status transition is allowed.

---

## 9. Forbidden status transitions

All transitions not listed in Section 8 are forbidden. The following forbidden matrix must be enforced explicitly.

| From status | Forbidden target statuses |
|---|---|
| `draft` | `submitted_for_review`, `returned`, `corrections_received`, `ready_for_export`, `exported` |
| `in_progress` | `draft`, `returned`, `corrections_received`, `ready_for_export`, `exported` |
| `submitted_for_review` | `draft`, `in_progress`, `corrections_received`, `exported` |
| `returned` | `draft`, `in_progress`, `submitted_for_review`, `ready_for_export`, `exported` |
| `corrections_received` | `draft`, `in_progress`, `submitted_for_review`, `exported` |
| `ready_for_export` | `draft`, `in_progress`, `submitted_for_review`, `returned`, `corrections_received` |
| `exported` | `draft`, `in_progress`, `submitted_for_review`, `returned`, `corrections_received`, `ready_for_export`, and any state-mutating self-update |

### 9.1 Explicitly forbidden shortcuts

The following shortcuts are invalid even if all required files exist:

- `draft -> submitted_for_review`
- `draft -> ready_for_export`
- `draft -> exported`
- `in_progress -> ready_for_export`
- `in_progress -> exported`
- `returned -> ready_for_export`
- `returned -> exported`
- `corrections_received -> exported`
- `submitted_for_review -> exported`
- `ready_for_export -> returned`
- any transition out of `exported`

---

## 10. Issue lifecycle

The canonical issue lifecycle is:

```text
open -> fixed_by_agent -> closed_by_admin
```

### 10.1 Issue status meanings

| Issue status | Meaning | Actor responsible |
|---|---|---|
| `open` | Admin/system identified a concrete blocker or correction target. | Agent |
| `fixed_by_agent` | Agent submitted a correction for an open issue. | Admin |
| `closed_by_admin` | Admin accepted the correction and closed the issue. | None; terminal |

### 10.2 Allowed issue transitions

| From issue status | To issue status | Actor / role | Guard |
|---|---|---|---|
| none | `open` | `admin` or authorized `system` | Submission is `submitted_for_review` or `corrections_received`; target is valid; reason/comment is concrete; issue is attached to questionnaire field/section or canonical media slot. |
| `open` | `fixed_by_agent` | `agent` | Submission is `returned`; target has been corrected; required package remains valid; transition occurs with `returned -> corrections_received`. |
| `fixed_by_agent` | `closed_by_admin` | `admin` | Submission is `corrections_received`; admin verifies the correction; transition occurs with `corrections_received -> ready_for_export`. |

### 10.3 Forbidden issue transitions

The following issue transitions are forbidden:

| Forbidden transition | Rule |
|---|---|
| `open -> closed_by_admin` | Agent correction is mandatory before admin closure. |
| `closed_by_admin -> open` | Closed issues are terminal and must not be reopened. |
| `fixed_by_agent -> open` | Rejection requires a new `open` issue, not reopening the fixed issue. |
| `closed_by_admin -> fixed_by_agent` | Closed issues are terminal. |

All issue transitions not listed as allowed are forbidden.

---

## 11. Role/action matrix

### 11.1 Agent actions

| Agent action | Allowed statuses | Domain effect |
|---|---|---|
| Create draft | none | Creates `draft`. |
| Edit questionnaire | `draft`, `in_progress`, `returned` | Mutates questionnaire only; does not bypass status guards. |
| Upload/reupload `passport_scan` | `draft`, `in_progress`, `returned` | Mutates canonical passport media slot. |
| Upload/reupload `selfie` | `draft`, `in_progress`, `returned` | Mutates straight/front selfie slot. |
| Upload/reupload `selfie_2` | `draft`, `in_progress`, `returned` | Mutates side/profile selfie slot. |
| Save/start progress | `draft` | `draft -> in_progress`. |
| Submit for review | `in_progress` | `in_progress -> submitted_for_review`. |
| Submit corrections | `returned` | `returned -> corrections_received`; open issues become `fixed_by_agent` when corrected. |
| View status/history | Any owned status | Read-only. |

Agent must not:

- create admin issues;
- close issues;
- accept a submission;
- mark a submission ready for export;
- generate or commit export;
- mutate `submitted_for_review`, `corrections_received`, `ready_for_export`, or `exported` content;
- upload `photo`, `photo_white`, `video`, or unknown media types.

### 11.2 Admin actions

| Admin action | Allowed statuses | Domain effect |
|---|---|---|
| Review submitted package | `submitted_for_review` | Read/review questionnaire and required media. |
| Create issue | `submitted_for_review`, `corrections_received` | Creates `open` issue with valid target. |
| Return with issues | `submitted_for_review` | `submitted_for_review -> returned`. |
| Accept first review | `submitted_for_review` | `submitted_for_review -> ready_for_export`. |
| Review corrections | `corrections_received` | Reviews `fixed_by_agent` issues and corrected package. |
| Close issues and accept | `corrections_received` | `corrections_received -> ready_for_export`; fixed issues become `closed_by_admin`. |
| Return again with new issues | `corrections_received` | `corrections_received -> returned`; requires new `open` issue. |
| Prepare export package | `ready_for_export` | Status remains `ready_for_export`; export metadata may be recorded after successful package generation/download. |
| Mark exported | `ready_for_export` | `ready_for_export -> exported` after successful export commit. |
| View history/exported record | `exported` | Read-only. |

Admin must not:

- edit agent questionnaire content as an agent correction;
- upload applicant media as a replacement for agent action;
- mark `open` issues directly as `closed_by_admin`;
- reopen `closed_by_admin` issues;
- return a `ready_for_export` or `exported` submission;
- mutate an `exported` submission.

### 11.3 System actions

| System action | Allowed scope | Domain effect |
|---|---|---|
| Normalize legacy status | Boundary/import/read adapter | Applies Section 3 mapping before canonical logic. |
| Reject unknown role/status/media | All commands | Fails closed without mutation. |
| Calculate readiness | Canonical submissions stack | Derives readiness from questionnaire + `passport_scan` + `selfie` + `selfie_2` + issue lifecycle. |
| Preserve history/audit metadata | Successful commands only | Records canonical history after successful mutation. |
| Prepare export metadata | `ready_for_export` only | Status-preserving; requires package identity/idempotency checks. |
| Complete export commit | Admin-authorized export only | Writes `exported_at` and moves `ready_for_export -> exported` atomically. |

System must not:

- bypass role guards;
- infer unknown statuses;
- infer unknown media types;
- treat `video` as `selfie_2`;
- treat `photo_white` as a required artifact;
- mutate `exported` submissions except for read-only access/log retrieval.

---

## 12. Export domain rules

`ready_for_export` means the submission is accepted and eligible for export. It does not mean the submission has been exported.

`exported` means export was durably completed and `exported_at` exists as a valid persisted timestamp.

Export package generation/download may record export metadata while status remains `ready_for_export`. The canonical status becomes `exported` only after the export commit succeeds.

`exported` is terminal.

---

## 13. Fail-closed rules

Package 1 must fail closed under these conditions:

| Condition | Required behavior |
|---|---|
| Unknown role | Reject command; no mutation. |
| Unknown status | Reject command; no mutation. |
| Legacy status not in mapping | Reject command; no mutation. |
| Invalid transition | Reject command; no mutation. |
| Missing questionnaire | Reject submit/review/export command; no mutation. |
| Incomplete questionnaire | Reject submit/review/export command; no mutation. |
| Missing `passport_scan` | Reject submit/review/export command; no mutation. |
| Missing `selfie` | Reject submit/review/export command; no mutation. |
| Missing `selfie_2` | Reject submit/review/export command; no mutation. |
| `photo` present as required media | Reject canonical readiness; no mutation. |
| `photo_white` present as required media | Reject canonical readiness; no mutation. |
| `video` present as required media | Reject canonical readiness; no mutation. |
| Unknown media type | Reject command; no mutation. |
| Unresolved `open` issue | Reject accept/export command; no mutation. |
| Unclosed `fixed_by_agent` issue | Reject accept/export command unless the same admin command closes it according to Section 10. |
| `open -> closed_by_admin` attempted | Reject issue transition; no mutation. |
| `closed_by_admin -> open` attempted | Reject issue transition; no mutation. |
| Export attempted before package identity is valid | Reject export command; no mutation. |
| Export attempted after package selection/fingerprint drift | Reject export command; no mutation. |
| Any mutation attempted on `exported` | Reject command; no mutation. |
| Failed command at any guard | Must not mutate status, questionnaire, media, issues, export metadata, or history. |

---

## 14. Legacy archive rule

The legacy stack may remain only as compatibility/archive/adapter layer:

- `src/types/domain.ts`
- `src/lib/workflow.ts`
- `src/services/submissionService.ts`

Legacy stack must not define release truth.

Legacy stack must not be used as the authority for:

- canonical statuses;
- allowed transitions;
- role permissions;
- media requirements;
- questionnaire readiness;
- issue lifecycle;
- export readiness;
- fail-closed rules.

Any legacy data crossing into Package 1 canonical flow must be normalized through this contract first.

Any canonical write must emit only canonical statuses and canonical media values.

No canonical write may emit:

- `requires_action`;
- `photo`;
- `photo_white`;
- `video`;
- any unmapped legacy status;
- any unknown media type.

---

## 15. Acceptance checklist

- [ ] File exists at `docs/release/canonical-domain-contract.md`.
- [ ] Package scope is limited to Package 1 — Canonical Domain Contract.
- [ ] `src/modules/submissions` is declared the canonical Package 1 domain module boundary.
- [ ] Release truth is limited to non-UI domain/application files under that module.
- [ ] `src/types/domain.ts`, `src/lib/workflow.ts`, and `src/services/submissionService.ts` are declared non-canonical legacy/archive/adapter stack.
- [ ] Canonical statuses are exactly `draft`, `in_progress`, `submitted_for_review`, `returned`, `corrections_received`, `ready_for_export`, `exported`.
- [ ] Legacy status mapping is specified, including `exported_at` guard for `sent_to_appointment`, `appointment_scheduled`, and `completed`.
- [ ] Required Package 1 submission package is exactly questionnaire + `passport_scan` + `selfie` + `selfie_2` per applicant.
- [ ] `selfie` is defined as straight/front selfie.
- [ ] `selfie_2` is defined as side/profile selfie.
- [ ] White-background photo is not required and not canonical.
- [ ] `photo`, `photo_white`, and `video` are rejected as canonical media values.
- [ ] Supabase/storage mapping is exactly `passport_scan -> passport_scan`, `selfie -> selfie`, `selfie_2 -> selfie_2`.
- [ ] Deprecated `photo_white -> photo` mapping is invalid.
- [ ] Deprecated `video -> selfie_2` mapping is invalid.
- [ ] Every allowed status transition lists actor/role, from status, to status, and guards.
- [ ] Forbidden status transitions are explicitly listed.
- [ ] Issue lifecycle is exactly `open -> fixed_by_agent -> closed_by_admin`.
- [ ] Forbidden issue transitions include `open -> closed_by_admin` and `closed_by_admin -> open`.
- [ ] Agent, Admin, and System action matrices are specified.
- [ ] Fail-closed rules include unknown role, unknown status, invalid transition, missing required media, unresolved issue, exported terminality, and no mutation on failed command.
- [ ] Legacy archive rule states that the legacy stack may remain only as compatibility/archive/adapter layer and must not define release truth.

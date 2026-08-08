# VisaFlow V-19 Flow State Model

This is the shared architecture anchor for parallel E2E closure work.

## Core Rule

`Submission` is the single product entity. UI screens, clicks, exports, PDF
handoff, issues, and history must orbit the submission state model instead of
creating parallel local truths.

## State Owner

Canonical lifecycle state is domain-owned:

- `src/modules/submissions/domainEngine.ts`
- `src/modules/submissions/status.ts`
- `src/modules/submissions/selectors.ts`
- `src/modules/submissions/workspaceModel.ts`
- `src/modules/submissions/exportRules.ts`

React components may render state and dispatch actions. They must not own:

- lifecycle transitions;
- role permission decisions;
- export readiness;
- issue lifecycle semantics;
- PDF handoff truth;
- derived `requiresAction`.

## Submission Lifecycle

Primary lifecycle:

```text
draft
-> in_progress
-> submitted_for_review
-> returned
-> corrections_received
-> ready_for_export
-> exported
```

Operational buckets are derived:

```text
agent_work
admin_review
export
done
```

`requiresAction` is derived from status, open issues, file state, and
completeness. It is not a persisted lifecycle status.

## Issue Lifecycle

```text
open
-> fixed_by_agent
-> closed_by_admin
```

Acceptance is blocked while any blocking issue is:

```text
open
fixed_by_agent
```

Agent can mark issues fixed and resubmit corrections. Admin closes issues and
accepts only when blockers are closed.

## Command Model

All business actions should map to domain commands:

| Command | Actor | State input | State output |
|---|---|---|---|
| `createDraft` | agent | create input | `draft` submission with Spain metadata |
| `updateSubmission` | agent | editable draft/in-progress/returned fields | derived state refreshed |
| `submitForReview` | agent | complete `in_progress` or explicit re-review from `ready_for_export` | `submitted_for_review` |
| `returnWithIssues` | admin | reviewable submission + issue input | `returned` with open issues |
| `markIssueFixed` | agent | returned issue | issue `fixed_by_agent` |
| `resubmitCorrections` | agent | no open issues | `corrections_received` |
| `closeIssue` | admin | fixed issue | issue `closed_by_admin` |
| `acceptSubmission` | admin | no unresolved blockers | `ready_for_export` |
| `generateExport` | admin | selected export-ready submissions | package identity |
| `markExported` | admin | downloaded package identity | `exported` |

## Canonical Flow Inventory

This inventory is the release checklist for user-visible lifecycle flows. A
surface name, legacy status, or local UI state does not create an additional
flow. Each row must resolve through the canonical command and read back the
listed domain state.

| ID | User action | Actor | Canonical command/effect | Required canonical readback | Role boundary |
|---|---|---|---|---|---|
| `F01` | Create a single or family submission | agent | `createDraft` | owned `draft` submission with Spain metadata and persisted applicants | other agents and admins cannot mutate it as the owner |
| `F02` | Save intake, questionnaire, trip, applicant, or required-media progress | agent | `updateSubmission` / durable draft save | the same values and media identities survive canonical readback and reload; status remains `draft` or advances to `in_progress` | only the owning agent may write |
| `F03` | Submit a complete package for review | agent | `submitForReview` | `submitted_for_review`, visible in the admin review queue and no longer agent-editable | another agent cannot read or mutate the package |
| `F04` | Return a reviewed package with blocking remarks | admin | `returnWithIssues` | `returned` plus one or more `open` issues, visible in the owning agent action queue | agent cannot create or close admin issues |
| `F05` | Correct the target and mark an issue fixed | agent | `markIssueFixed` | issue is `fixed_by_agent`; acceptance remains blocked | only the owning agent may fix it |
| `F06` | Resubmit all corrections | agent | `resubmitCorrections` | `corrections_received`, visible in the admin corrections queue | unresolved `open` issues fail closed |
| `F07` | Confirm a correction | admin | `closeIssue` | issue is `closed_by_admin` after reload | agent cannot close it |
| `F08` | Accept a fully reviewed package | admin | `acceptSubmission` | `ready_for_export`, visible in the export queue | unresolved issues or incomplete questionnaire/media block acceptance |
| `F09` | Send an accepted package back through review | agent | explicit `submitForReview` re-review path | `submitted_for_review`; prior export readiness is cleared and admin queue ownership is restored | direct status writes fail closed |
| `F10` | Generate and download the selected Excel workbook | admin | `generateExport` | workbook identity matches preview rows and selected submissions; status is not terminal before successful download | non-admin export is denied |
| `F11` | Confirm successful export completion | admin | `markExported` | `exported` plus persisted export identity/timestamp; item leaves the ready queue and stays absent after reload | `exported` is terminal and cannot be downgraded |
| `F12` | Switch local-demo roles for QA | local demo only | activate an already approved seeded session | selected role survives reload without changing submission ownership | the switch is excluded from production bundles and never proves production authorization |
| `F13` | Encounter a failed write, stale version, or permission denial | any | fail closed without optimistic canonical mutation | prior persisted state remains authoritative and the UI exposes a recoverable error | no role receives a fallback write path |
| `F14` | Load a legacy snapshot | boundary adapter | normalize a known legacy value before canonical logic | only canonical statuses/media enter commands and persistence | unknown legacy input is rejected |

### Evidence contract

Every flow is proven only by the complete chain:

```text
real UI action
-> backend/domain effect
-> canonical readback
-> full reload readback
-> role/ownership isolation
```

Unit tests, a successful build, screenshots, local-demo storage, or a rendered
queue are supporting evidence only. Production completion additionally
requires an authenticated production run against the exact deployed revision,
remote migration order, RLS/Storage boundaries, and durable backend readback.
Missing production evidence must leave the release packet `NO_GO`.

## Surface Model

Screens are projections of the same state:

| Surface | Role | Projection |
|---|---|---|
| `Мои действия` | agent | derived action queue from owned submissions, blocking issues, files, questionnaire, and review/export state |
| `Мои подачи` | agent | owned submissions grouped by operational need |
| Submission drawer | agent/admin | selected submission detail, role-safe commands |
| `Проверка` | admin | submitted/corrections/export-ready review queues and admin work tabs |
| `Выгрузка` | admin | export-ready/history submissions and workbook plan |
| PDF panel | admin first, agent visibility only if implemented | post-export PDF review/handoff state |

## Click Model

Every click should be classified as one of:

- domain command dispatch;
- surface/tab selection;
- drawer target navigation;
- file/PDF upload;
- export artifact action;
- disabled-with-reason;
- removed by V-19 scope.

No click should silently mutate lifecycle state outside the command model.

## Export Model

Export is fail-closed:

- Preview and workbook use the same row model.
- Workbook identity must match generated rows.
- `markExported` requires downloaded artifact identity.
- Legacy export cannot masquerade as V-19 `Sheet1` proof.

## PDF Model

Current closure work must resolve whether PDF handoff is:

1. a real generated/downloadable/openable PDF artifact; or
2. an uploaded external PDF review plus internal handoff status.

Do not call PDF handoff complete until the actual implementation path is proven.

## Parallel Ownership

All four lanes must use this model:

- Lane 1 owns the state/model contract and final integration truth.
- Lane 2 proves agent create/correction commands through UI.
- Lane 3 proves admin review/PDF commands through UI.
- Lane 4 proves export/click/mobile evidence against the same state model.

If a lane needs to change shared state logic, it must update this model or report
the mismatch instead of inventing a local exception.

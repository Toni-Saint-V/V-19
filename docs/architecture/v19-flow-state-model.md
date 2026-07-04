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
| `submitForReview` | agent | complete `in_progress` | `submitted_for_review` |
| `returnWithIssues` | admin | reviewable submission + issue input | `returned` with open issues |
| `markIssueFixed` | agent | returned issue | issue `fixed_by_agent` |
| `resubmitCorrections` | agent | no open issues | `corrections_received` |
| `closeIssue` | admin | fixed issue | issue `closed_by_admin` |
| `acceptSubmission` | admin | no unresolved blockers | `ready_for_export` |
| `generateExport` | admin | selected export-ready submissions | package identity |
| `markExported` | admin | downloaded package identity | `exported` |

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

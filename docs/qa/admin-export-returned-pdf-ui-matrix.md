# Admin Export Returned PDF UI Matrix

Scope: `codex/ui-admin-export-pdf-real-logic-20260629-045831`

## Coverage Matrix

| Surface | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| Admin review cards | Cards render real `Submission` rows from `reviewList` / `reviewSource`. | Pass | `AdminReviewScreen` keeps row actions bound to `onSelect` / `onOpen` with real submission ids. |
| Admin tabs/counts | Counts come from filtered `reviewSource` and work events. | Pass | `tabCounts` derives from `reviewSource.filter(matchesReviewTab(...))`. |
| Admin blockers filter | "Only blockers" filters current visible review/work-event data. | Pass | `blockersOnly` filters `reviewList` and `workEvents`. |
| Admin sorting | Sort control cycles priority, updated date, created date, trip date. | Pass | `sortSubmissionsForOperations(...)` in `OperationsScreens.tsx`. |
| Search by id/name/city/status | Existing global `searchSubmissions(...)` covers id, title, city, status, applicant names. | Pass | `src/modules/submissions/selectors.ts`. |
| Search by agent | Agent display-name search requires `selectors.ts` / search ownership change. | Blocked by boundary | `selectors.ts` is outside allowed files; `App.tsx` was limited to export/pdf handler wiring. |
| Export ready list | UI selectable ready list excludes rows with real export blockers, without dropping generated multi-row packages. | Pass | `isSubmissionSelectableForExport(...)` filters `readyList` in App and ExportScreen. |
| Export blockers | Incomplete media, not-ready status, open/fixed blockers remain fail-closed. | Pass | `exportSummary` / `getExportBlockers`; targeted unit coverage in `exportWorkbook.spec.ts`. |
| Mixed city export | Mixed city remains hard blocked. | Pass | `getExportBlockers` still emits `Нельзя смешивать разные города`. |
| Same-city mixed-agent export | Same-city mixed-agent is allowed with warning, not hard block. | Pass | `ExportSummary.warnings`; targeted unit test. |
| Excel preview/download | Preview and workbook use same row model; stale row/package identity blocks download. | Pass | Existing workbook tests plus new no-Agent-column assertion. |
| External Excel Agent column | External workbook headers do not expose Agent column. | Pass | `exportWorkbook.spec.ts` asserts headers do not match `/agent/i`. |
| Internal PDF mapping | Returned PDF mappings keep `ownerAgentId`, `ownerAgentName`, `excelRowNumber`. | Pass | Existing `operationalWorkflow.spec.ts` handoff mapping tests. |
| Returned PDF status | Export history cards show real handoff state from `buildAgentHandoffPackage`. | Pass | `returnedPdfPackageSummary(...)` uses domain handoff blockers/readiness. |
| Missing application PDF | Blocks handoff. | Pass | Existing returned PDF handoff tests. |
| Missing appointment list PDF | Blocks handoff. | Pass | Existing returned PDF handoff tests. |
| Failed/deleted/pending PDF | Blocks handoff. | Pass | Existing returned PDF handoff tests. |
| Mixed-agent appointment list | Blocks agent handoff until package is split/scoped. | Pass | `buildReturnedPdfAgentHandoffGate(...)`; `returnedPdfOperationalWorkflow.spec.ts`. |
| Agent delivery scope | Agent sees only own returned PDF package. | Pass | Existing returned PDF handoff tests. |
| Public URLs / signed URLs | UI uses storage identity and RPC publish path; no public URL or persisted signed URL introduced. | Pass | No public URL code added; handoff publish remains RPC-backed. |

## Verification Notes

- Targeted unit: `npx vitest run tests/unit/exportWorkbook.spec.ts tests/unit/returnedPdfOperationalWorkflow.spec.ts`
- Typecheck: `npm run typecheck`
- `git diff --check`
- Conflict scan: `grep -R "^\(<<<<<<<\|=======\|>>>>>>>\)" src tests || true`

## Remaining Scope Dependency

Agent-name search is not fixed in this lane because the active search selector is outside the allowed files. The smallest follow-up is to extend `searchSubmissions(...)` with safe agent display metadata once `src/modules/submissions/selectors.ts` is allowed.

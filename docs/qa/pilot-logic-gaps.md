# V-19 Pilot Logic Gaps

Scope: rush-08 click logic coverage only. Do not read this as production/live readiness.

## P0

| Gap | Owner | Evidence / note | Status |
| --- | --- | --- | --- |
| Production/live pilot remains `NO_GO` | outside rush-08 | Second Pilot Audit says production/live `NO_GO` and 5-10 person pilot `NO` | known blocker |
| Auth readiness is not proven for production | 06 | User explicitly assigned auth readiness to 06 | known blocker from 06 |
| Full Playwright regression suite remains red on mobile | 07 plus broad suite drift | Fresh `app-smoke`: 20/34 passed, 14 failed. Failures are all `mobile-chromium` and include mobile tabbar pointer interception plus `Сменить роль` mobile timeouts | known blocker |
| Acceptance/export must stay fail-closed | rush-08 verified by unit/E2E | Added pilot state machine and Excel-only E2E coverage | covered locally |

## P1

| Gap | Owner | Evidence / note | Status |
| --- | --- | --- | --- |
| Mobile status filter expected behavior is not owned by rush-08 | 07 | Fresh `app-smoke` failure: `ops-mobile-tabbar-item` intercepts `Статус подач` option clicks | documented, not fixed |
| Create drawer has no visible city selector | unassigned product gap | `createCity` is internal in `src/App.tsx`; no create-drawer city control found | documented |
| Create drawer has no first-class trip date controls | unassigned product gap | Trip dates exist in preliminary/domain model; no current visible create-drawer trip date fields found | unit guarded, UI gap |
| File-target issue creation is not isolated in a new stable pilot E2E | rush-08 partial | Existing returned fixtures contain file-target issues; new E2E covers field issue creation | partial |
| Create drawer applicant remove is not available | unassigned product gap | Add applicant control exists; no remove applicant control found | documented |

## P2

| Gap | Owner | Evidence / note | Status |
| --- | --- | --- | --- |
| Drawer tab label drift requires resilient selectors | rush-08 documented | Older tests normalize `Данные`/`Анкета` and `Медиа`/`Файлы`; pilot helper follows current stable labels | covered by helper |
| Broad `app-smoke` remains too large for fast pilot diagnosis | future QA hardening | Rush-08 adds smaller pilot specs instead of editing the broad suite | improved |
| Local/demo auth bootstrap can hide the access gate unless an invalid stored email is forced | rush-08 documented | Pilot agent test forces unknown stored email to verify gate path without touching production auth | covered locally |

## Known Blockers From 06/07

| Blocker | Why rush-08 does not fix it |
| --- | --- |
| Auth readiness | Explicitly owned by 06; fixing it here would cross auth/security scope. |
| Mobile overlay/status filter issue | Explicitly owned by 07; rush-08 documents expected behavior and avoids CSS/UI overlay fixes. |
| Performance budget | Explicitly out of scope for rush-08. |
| Production Storage/OCR | Explicitly out of scope for rush-08 and remains production/live proof gap. |

## Pilot Verdict

Local/demo click logic can be covered by the added pilot specs and unit state-machine tests. Pilot release remains blocked until 06/07 blockers and production/live proof are resolved.

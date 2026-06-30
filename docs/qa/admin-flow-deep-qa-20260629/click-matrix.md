# Admin Flow Deep QA Click Matrix

Generated: 2026-06-29T14:55:52.799Z

| Status | Check | Detail |
|---|---|---|
| PASS | Overflow admin-review-desktop-1440 | document 1440/1440, body 1440 |
| PASS | Desktop review navigation/tabs/search/toggles | Review nav, chips, search, list/columns ok |
| PASS | Desktop review drawer route and tabs | Проверить opens Admin Review Drawer |
| PASS | Overflow admin-review-drawer-desktop-1440 | document 1440/1440, body 1440 |
| PASS | Desktop manual passport/selfie/questionnaire/remarks checks | Manual check controls and remark form ok |
| PASS | Desktop drawer close/Escape and package button | Escape close and package route ok |
| PASS | Desktop return with issue | Created issue and returned to agent |
| PASS | Desktop accept fixed corrections | Fixed issue accepted |
| PASS | Overflow admin-export-desktop-1440 | document 1440/1440, body 1440 |
| PASS | Desktop export family-first/filter/search/tabs | Семья ВолковыхSUB-1102Смотреть пакетМосква09-16 сен 20263Готово15.06Смотреть пакет \| Ольга ФроловаSUB-1101Смотреть пакетМосква09-16 сен 20261Готово15.06Смотреть пакет \| Никита МорозовSUB-1103Смотреть пакетСанкт-Петербург09-16 сен 20261Готово15.06Смотреть пакет \| Дмитрий ОрловПД-1056Смотреть пакетМосква06-12 сен 20261Готово15.06Смотреть пакет |
| FAIL | Desktop export row stays in export context | Missing export context text: Выбрано: 2 |
| PASS | Desktop export selected compatible package | Generate clicked for compatible family selection; download/mark clicked when enabled |
| PASS | Desktop export empty state | Impossible search shows empty/no package state |
| PASS | Overflow admin-review-mobile-390 | document 390/390, body 390 |
| PASS | Mobile review controls and drawer | Mobile review controls and drawer tabs ok |
| PASS | Overflow admin-review-drawer-mobile-390 | document 390/390, body 390 |
| PASS | Overflow admin-export-mobile-390 | document 390/390, body 390 |
| FAIL | Mobile export filters and selection | Mobile selected count missing |
| PASS | Overflow admin-export-selected-mobile-390 | document 390/390, body 390 |

## Findings

- fail: Desktop export row stays in export context — Missing export context text: Выбрано: 2
- fail: Mobile export filters and selection — Mobile selected count missing

## Console / Page Errors

No console warnings/errors or page errors captured by proof runner.

## Downloads

- docs/qa/admin-flow-deep-qa-20260629/visaflow-export-0fytdrz.xlsx
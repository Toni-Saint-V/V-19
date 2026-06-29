# Agent UI Real Logic Matrix

Дата: 2026-06-29
Ветка: `codex/ui-agent-real-logic-20260629-045831`

## Scope

Поверхности:

- Agent `Входящие`
- Agent `Мои действия`
- Agent `Мои подачи`
- `Новая подача`
- Agent `SubmissionDrawer`
- `Анкета`
- `Файлы`
- `Замечания`
- Returned PDFs для агента

Boundary: изменения внесены только в разрешенные файлы. Новый
`tests/e2e/v19-agent-ui-real-logic.spec.ts` не создан, потому что он не входит в
`ALLOWED FILES`; стабильный e2e сценарий добавлен в
`tests/e2e/v19-pilot-agent-flow.spec.ts`.

## Control Matrix

| Surface | Control | Real handler / state | Result |
| --- | --- | --- | --- |
| Agent `Мои действия` | Поиск | `query` из `App.tsx` -> `searchAgentActions` -> controlled input | Фильтрует реальные `AgentActionItem` по submission/applicant/action text. |
| Agent `Мои действия` | Category tabs | Local `category` + counts from real `openActions/completedActions` | `Все действия`, `Ошибки`, `На проверке`, `Выполненные` показывают реальные action rows. |
| Agent `Мои действия` | City filter | `onCityFilter` -> `cityFilter` in `App.tsx` -> `agentActionSource` | Фильтрует очередь агента по реальному `submission.city`. |
| Agent `Мои действия` | Sort | Local `sortMode` over real `updatedAt/createdAt/tripDateFrom` | Меняет порядок уже отфильтрованных реальных actions. |
| Agent `Мои действия` | Row/card click | `onOpen(item.submission, item.tab)` -> shared `SubmissionDrawer` | Открывается та же submission по id, без fallback на mock drawer. |
| Agent `Мои действия` | Empty state | Derived from filtered real items | Показывает честное "нет действий", без моковых строк. |
| Agent topbar | `Загрузить` | Removed | Убран декоративный disabled CTA без рабочего flow. |
| Agent drawer | Close | Existing `onClose` | Единственный header icon button теперь реальный. |
| Agent drawer | Primary action | Existing `getPrimaryAction`/`canPerformAction` | Submit остается disabled до city/trip/questionnaire/files completion. |
| Agent drawer / files | Upload / replace | Existing `onUploadFile(file.id)` -> `uploadActiveFile` -> local/Supabase file update | Replacement updates submission state, history, readiness. |
| Agent actions | Missing/replacement file actions | `agentActions.ts` now restricts active file actions to `selfie`, `selfie_2`, `passport_scan` | Forbidden legacy active requirements (`photo`, `photo_white`, `video`, generic document) do not create active agent CTAs. |
| Agent drawer / files | Trust copy | Derived from `canEditFiles` and `requireSelectedFile` | Copy no longer says upload is disabled when it is real. |
| Agent drawer / issues | Fix issue | Existing `onMarkIssueFixed` -> `markSubmissionIssueFixedResult` | `open` issue moves to `fixed_by_agent`; resubmit is enabled only when blockers are fixed. |
| Agent drawer / returned PDF | Agent returned package | `buildAgentReturnedPdfPackageView(submission, agentOwnerId)` | Agent sees only own visible package when published and scoped. |
| Agent drawer / returned PDF | PDF actions | No fake download/open buttons | Package is read-only until real artifact delivery exists. |
| Admin PDF review panel inside agent drawer | Admin-only guard | Rendered only for `role === "admin"` | Agent no longer sees admin PDF reconciliation controls. |

## Canonical V-19 Rules Covered

- Active document requirements remain exactly `selfie`, `selfie_2`,
  `passport_scan`, `questionnaire`.
- `photo`, `photo_white`, `video`, and generic document actions are not active
  agent requirements.
- Returned PDF package renders agent-scoped `application_form_pdf` per applicant
  and `appointment_list_pdf` per package only through the existing returned PDF
  package view.
- No fake PDF/download action was added.
- Mixed-city/mixed-agent export policy remains owned by existing export/domain
  files; those files were intentionally not edited in this task.

## E2E Coverage

Updated `tests/e2e/v19-pilot-agent-flow.spec.ts`:

- opens top-level Agent `Мои действия`;
- verifies search filters real action rows by `ПД-1048`;
- verifies city filter hides Moscow action and shows `ПД-1051` for
  `Санкт-Петербург`;
- exercises sort control;
- clicks `[data-submission-id="ПД-1048"]`;
- verifies shared drawer opens `Семья Ивановых`, meta contains `ПД-1048`, and
  `Замечания` tab is selected.

## Boundary Notes

- `AdminReviewDrawer.tsx`, `OperationsScreens.tsx`, `exportRules.ts`,
  `operationalWorkflow.ts`, and `supabase/**` were not edited.
- `src/App.tsx` was touched only to pass real handler/data into the agent visual
  surface and to route it through the shared `SubmissionDrawer`.

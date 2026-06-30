# Export Click And Section Matrix

Scope: current React/Vite runtime only. No Supabase schema, deployment, ZIP package, or production-ready claim.

## Click Matrix

| Surface | Element | Expected behavior | Status |
| --- | --- | --- | --- |
| Navigation | `Выгрузка` | Opens admin export screen with ready list and context rail. | working |
| Tabs | `Готово` | Shows only compatible ready submissions, with counts from current filters. | working |
| Tabs | `История` | Shows exported submissions and returned-PDF package state. | working |
| Filters | Search / city / agent | Recomputes visible ready/history rows; hidden selection is not included in current export plan. | working |
| Toolbar | Sort icon | Cycles export ordering while preserving family-first row grouping. | working |
| Toolbar | Contract panel icon | Opens and closes the right export contract rail without changing selection. | working |
| Ready table | Select all compatible | Selects or clears only visible compatible rows; partial selection uses indeterminate checkbox state. | working |
| Ready table | Row checkbox | Adds/removes that submission from the current package. | working |
| Ready table | Row click / `Смотреть пакет` | Selects the package and opens the right rail; it does not jump to an unrelated drawer. | working |
| Actions | `Сформировать Эксель` | Verifies workbook artifact and moves selected rows to `file_generated`. | working |
| Actions | `Скачать Excel` | Downloads the current verified XLSX package and moves selected rows to `file_downloaded`. | working |
| Actions | `Отметить выгружено` | Runs `completeExportPackage`, records exported state, clears selection, and switches to History. | working |
| History | Row / PDF action | Opens the submission files/PDF context for returned-PDF review. | working |

## Section Matrix

| Section | Purpose | Status |
| --- | --- | --- |
| Ready queue | Admin selects exactly which compatible submissions enter the current Excel package. | working |
| Hidden not-ready notice | Explains why blocked/incomplete submissions are excluded from selection. | read-only meaningful |
| Bulk status bar | Shows selected count and the next action or blocker reason. | working |
| Contract rail header | Identifies the active Excel contract: `Sheet1 A:BD`. | read-only meaningful |
| Current package | Shows package facts: submissions, rows, city, dates, type, and export stage. | working |
| Masked preview | Shows first 9 of 56 columns from the same row model used by workbook download. | read-only meaningful |
| Pre-export checks | Surfaces fail-closed checks for selected rows. | read-only meaningful |
| A:BD mapping audit | Shows mapped/derived/unresolved state for all workbook columns. | read-only meaningful |
| Blocker/warning callout | Shows blocking reasons or same-city mixed-agent warning. | working |
| Action dock | Owns generate/download/mark-exported actions and disabled explanations. | working |

## Removed As Meaningless

None. The weak `mapped/unresolved` summary in the package card was replaced with package facts; the detailed mapping counts remain in the dedicated A:BD audit section where they have context.

## Fresh Evidence

Screenshots from focused Playwright proof:

- `export-desktop-initial.png`
- `export-desktop-history.png`
- `export-desktop-blocked.png`
- `export-mobile-390.png`

Verification:

- `npm run typecheck`
- `npm run lint`
- `npx vitest run tests/unit/exportWorkbook.spec.ts tests/unit/submissionExportWorkflow.spec.ts`
- `npx playwright test tests/e2e/v19-export-click-section-matrix.spec.ts --project=chromium --project=mobile-chromium`
- `npm run build`
- `npm run verify:performance`
- `git diff --check -- src/App.tsx src/modules/submissions/pages/OperationsScreens.tsx src/styles.css tests/e2e/v19-export-click-section-matrix.spec.ts docs/qa/export-click-section-matrix-20260629/export-click-section-matrix.md`

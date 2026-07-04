# Reference Mapping

Source archive: `docs/References/Perfect.zip`.

Extracted source subset: `docs/References/perfect_extracted/visaflow_top_product/`.

Old visual baseline: `/Users/user/Desktop/visaflow_old_linearstyle_clean 3/START_HERE.html`.

## Inspected Files

- `visaflow_top_product/src/components/*.tsx`
- `visaflow_top_product/docs/DESIGN_SYSTEM_MAP.md`
- `visaflow_top_product/docs/UI_AUDIT.md`
- `visaflow_top_product/CODEX_TASK.md`
- `visaflow_top_product/src/index.css`
- old baseline `START_HERE.html`

`node_modules/`, `dist/`, and package lock noise were excluded from the extracted evidence subset.

## Mapping

| Reference asset/screen | Current V-19 target | Transfer | Reject | Reason |
|---|---|---|---|---|
| `src/index.css` and `DESIGN_SYSTEM_MAP.md` | `src/shared/ui/system.css`, `src/shared/ui/visual-baseline.css` | Dark graphite surfaces, compact controls, quiet borders, dense cards, token-first styling | Raw scattered colors and local screen themes | V-19 already has token owners; final changes use aliases and existing vars |
| `CommandCenter.tsx`, `AdminWorkspace.tsx` | `src/modules/submissions/components/AppShell.tsx`, `OperationalSideMenu.tsx`, `OperationalNavigation.tsx`, `src/App.tsx` nav config | Single operational shell, side menu density, role-based nav | Separate Agent/Admin shells | Contract requires one shell/menu system |
| `AdminScreens.tsx`, `ReviewWorkspace.tsx` | `src/modules/submissions/pages/OperationsScreens.tsx` admin review surface | Summary strip, triage radar, compact review rows, drawer-first inspection | Mock review data and source status model | Current V-19 domain/status logic remains source truth |
| `AdminReviewDrawer.tsx` | `src/modules/submissions/components/AdminReviewDrawer.tsx` | Dense admin drawer tabs and footer actions | Mock-only AI/OCR decisions | Current drawer uses V-19 submission/applicant/issues context |
| `AdminExportScreen.tsx` | `src/modules/submissions/pages/OperationsScreens.tsx` export surface | Excel-ready queue, disabled/export action visibility | Static workbook assumptions | V-19 export rules remain fail-closed |
| `ApplicantsScreen.tsx`, `DraftsScreen.tsx`, `PreUploadScreen.tsx` | `AgentSubmissionsScreen`, `CreateSubmissionDrawer`, `FigmaSubmissionDrawer` | Applicant/card density, creation flow structure, document-first hierarchy | `group` type and standalone people/CRM surfaces | V-19 allows only `single` and `family`; applicants live inside submission context |
| `QuestionnaireScreen.tsx` | `FigmaQuestionnaireScreen.tsx` | Section navigation, applicant-specific context, field completion | Random placeholder questionnaire fields | Current project questionnaire fields remain source truth |
| `MediaScreen.tsx`, `IssuesScreen.tsx` | `FigmaSubmissionDrawer` tabs and `AdminReviewDrawer` tabs | Files/issues as drawer context | Standalone `Сбор документов`, `Медиа`, `Замечания` routes | Contract forbids standalone Documents/Media/Issues screens |
| `CODEX_TASK.md` | Audit input only | Strong visual target and screen inventory | Reference implementation scope as-is | It contains screens/entities that conflict with V-19 scope |
| Old `START_HERE.html` | Shared graphite visual direction | Linear dark density and calm operational tone | Old app logic/routes | Old baseline is visual only |

## Transferred Decisions

- Premium dark graphite visual density.
- Single shell/sidebar/nav ownership.
- Tokenized surface, border, control, focus, selected, and touch sizing aliases.
- Responsive Admin Review stack: summary, toolbar, radar, row list, drawer.
- Drawer tabs as real interactive tabs.

## Rejected Decisions

- Standalone Documents/Media/Issues screens.
- `group` submission type.
- Reference mock routes, statuses, and static data.
- Built `dist` assets as implementation input.
- Package lock noise from the reference project.

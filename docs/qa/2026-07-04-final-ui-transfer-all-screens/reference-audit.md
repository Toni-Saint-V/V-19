# Reference Audit

Run id: `20260704-174426-MSK-31f9d5cd`

Sources inspected:

- `docs/References/Perfect.zip`
- `docs/References/Perfect.zip!/visaflow_top_product/docs/DESIGN_SYSTEM_MAP.md`
- `docs/References/Perfect.zip!/visaflow_top_product/docs/UI_AUDIT.md`
- `docs/References/Perfect.zip!/visaflow_top_product/CODEX_TASK.md`
- `docs/References/Perfect.zip!/visaflow_top_product/src/index.css`
- `/Users/user/Desktop/visaflow_old_linearstyle_clean 3/START_HERE.html`
- `.agents/reference-screens/README.md`
- `.agents/rules/v19-screen-wireframes.md`

| Reference asset/screen | Current V-19 target | Transfer | Reject | Reason |
|---|---|---|---|---|
| `src/index.css`, `docs/DESIGN_SYSTEM_MAP.md` | `src/shared/ui/visual-baseline.css`, `src/shared/ui/system.css` | Dark graphite surface stack, compact controls, quiet borders, dense operational rows, drawer motion values | Scattered raw Tailwind colors in screen/component rules | V-19 requires raw values in shared tokens first, then `var(...)` consumption. |
| `CommandCenter.tsx` | `AgentActionsScreen`, `AgentInboxScreen`, shared `AppShell` and `OperationalSideMenu` | Agent dark command-center density, task queue hierarchy, action-first rows | Reference mock route model and standalone collection screens | V-19 keeps real `Submission` state and current Agent surfaces. |
| `Drawer.tsx` | `FigmaSubmissionDrawer` | Drawer-first package inspection, tabs, sticky footer, dark sheet composition | Mock package logic and source-only applicant/media state | V-19 drawer must preserve current tabs, actions, issues, files, and domain commands. |
| `DraftsScreen.tsx`, `PreUploadScreen.tsx` | `CreateSubmissionDrawer`, `FigmaSubmissionDrawer` files tab | Document-first create flow, upload hierarchy, single/family visual distinction | Standalone "Сбор документов" primary route | V-19 keeps documents inside submission/create drawer context. |
| `ApplicantsScreen.tsx` | `AgentSubmissionsScreen`, export applicant cards where relevant | Family/single card density, applicant readiness visibility | CRM/people/families as separate primary entity model | V-19 main entity is `Submission`; applicants belong inside `Submission`. |
| `QuestionnaireScreen.tsx` | `FigmaQuestionnaireScreen`, drawer questionnaire tab | Section navigation, applicant-specific form context, compact mobile field layout | Placeholder questionnaire/data model | Current V-19 questionnaire fields and validation remain source truth. |
| `MediaScreen.tsx` | `FigmaSubmissionDrawer` files tab, `AdminReviewDrawer` file/passport/selfie sections | File slot layout, required media visibility | Standalone media route | Hard gate forbids standalone Documents/Media/Issues screens. |
| `IssuesScreen.tsx`, `RemarkForm.tsx` | Drawer issues tabs, admin issue creation/return flow | Issue card density, exact CTA pattern, admin remark form structure | Mock issue lifecycle | V-19 lifecycle remains `open -> fixed_by_agent -> closed_by_admin`. |
| `AdminWorkspace.tsx`, `AdminScreens.tsx` | `AdminReviewScreen` under `AppShell` | Admin review queue, summary strip, drawer-first inspection, role-specific nav | Separate admin shell/sidebar implementation | Contract requires one shared shell/menu system. |
| `AdminReviewDrawer.tsx`, `ReviewWorkspace.tsx` | `AdminReviewDrawer` | Dense admin drawer, questionnaire/passport/selfie/issues tabs, review actions | Mock OCR/AI decisions as product truth | V-19 domain/status/permission checks remain canonical. |
| `AdminExportScreen.tsx` | `ExportScreen`, export rules/workflow | Excel-ready queue, disabled export states, preview/download/mark-exported reachability | Static workbook assumptions | V-19 export must remain fail-closed and share preview/workbook row model. |
| `dist/assets/*` inside `Perfect.zip` | Audit input only | Visual comparison when needed | Built assets as implementation source | Source TSX/CSS/docs are preferred; `dist` is not copied into V-19. |
| `node_modules/*` inside `Perfect.zip` | None | None | Entire dependency payload | Must not be extracted/staged as product or QA evidence. |
| Old `START_HERE.html` | Shared visual baseline only | Linear dark density, calm graphite surfaces, compact topbar/sidebar/drawer tone | Old app routes, mock state, standalone admin shell | Old baseline is visual-only and conflicts with V-19 source-of-truth domain. |

Reference audit verdict: `COMPLETE_FOR_INITIAL_GATE`

Gate note: mapping is source-based. It does not prove final visual parity; browser retest is still blocked by the latest failing checklist.

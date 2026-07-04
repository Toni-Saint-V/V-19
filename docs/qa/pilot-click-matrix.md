# V-19 Pilot Click Matrix

Scope: EVERY CLICK QA / LOGIC COVERAGE / PILOT CLICK MATRIX for rush-08 only.

Source truth used before writing tests:

- `tests/e2e/app-smoke.spec.ts`
- `tests/e2e/v19-create-submission-family-proof.spec.ts`
- `tests/e2e/v19-responsive-proof.spec.ts`
- `tests/unit/v19DomainEngine.spec.ts`
- `tests/unit/v19SubmissionRules.spec.ts`
- `src/App.tsx`
- `src/modules/submissions/domainEngine.ts`
- `src/modules/submissions/status.ts`
- `src/modules/submissions/components/CreateSubmissionDrawer.tsx`

Important boundary: this matrix documents current local/demo click logic. It is not production/live readiness proof.

## Coverage Map

| Area | Current coverage before rush-08 | Rush-08 coverage added | Notes |
| --- | --- | --- | --- |
| Agent navigation and status filters | Broad `app-smoke` coverage | `v19-pilot-agent-flow.spec.ts` | Desktop stable path covered. Mobile filter behavior is documented as 07-owned. |
| Create submission drawer | `app-smoke`, `v19-create-submission-family-proof` | `v19-pilot-agent-flow.spec.ts`, `v19-pilot-mobile-clicks.spec.ts` | Add/switch/upload/close covered. Remove applicant is not present in current drawer. |
| Agent returned issue flow | Broad `app-smoke` coverage | `v19-pilot-agent-flow.spec.ts`, `v19PilotStateMachine.spec.ts` | UI and domain lifecycle covered without changing 06/07 surfaces. |
| Admin review drawer | Broad `app-smoke` coverage | `v19-pilot-admin-review-flow.spec.ts` | Drawer tabs and precise issue return covered. |
| Admin correction accept/export | Broad `app-smoke` coverage | `v19-pilot-admin-review-flow.spec.ts`, `v19PilotStateMachine.spec.ts` | Excel preview/download only. No ZIP claim. |
| Mobile clickability | `v19-responsive-proof`; broad `app-smoke` mobile remains red | `v19-pilot-mobile-clicks.spec.ts` | 390px shell/create/drawer clickability covered. Status filter blocker remains 07-owned. |
| State transitions too brittle for E2E | `v19DomainEngine`, `v19SubmissionRules` | `v19PilotStateMachine.spec.ts` | Submit/return/fix/resubmit/accept/export guards covered at domain level. |

## Agent Matrix

| Click | Expected state | Actual state | Covered by test | Severity if broken |
| --- | --- | --- | --- | --- |
| Open local/demo workspace with unknown stored email | Access gate shows blocked local/dev email state | `WorkspaceAccessGate` renders when requested email cannot bootstrap | yes - `v19-pilot-agent-flow.spec.ts` | P1 |
| Submit approved `agent@visaflow.local` email | Agent workspace opens on `Мои действия` | Local approved agent is seeded by local/dev auth adapter | yes - `v19-pilot-agent-flow.spec.ts` | P1 |
| Open `Мои действия` | Action queue heading and rows are visible | Agent actions are the default local/demo surface | yes - `v19-pilot-agent-flow.spec.ts` | P1 |
| Check absent `Входящие` nav | No standalone inbox screen is exposed | Events and returned-work actions are consolidated into `Мои действия` | yes - `app-smoke`, `v19-accessibility.spec.ts` | P1 |
| Click `Мои подачи` nav | Submissions cockpit opens | Operational nav calls `showAgentTab("action")` | yes - `v19-pilot-agent-flow.spec.ts` | P1 |
| Click status filter `В работе` | In-progress submissions visible, returned submissions hidden | Desktop tab path exists | yes - `v19-pilot-agent-flow.spec.ts` | P1 |
| Click status filter `Готово` | Ready/exported agent-visible submissions visible, returned hidden | Desktop tab path exists | yes - `v19-pilot-agent-flow.spec.ts` | P1 |
| Click status filter `Действия` | Returned actionable submission visible | Desktop tab path exists | yes - `v19-pilot-agent-flow.spec.ts` | P1 |
| Click `Новая подача` | Create drawer opens | Drawer opens as `CreateSubmissionDrawer` | yes - `v19-pilot-agent-flow.spec.ts`, `v19-pilot-mobile-clicks.spec.ts` | P1 |
| Click close on clean create drawer | Drawer closes | Close button is wired | yes - `v19-pilot-mobile-clicks.spec.ts` | P2 |
| Dirty close create drawer | Confirmation appears before close | Existing confirmation is wired through `confirmClose` | yes - `v19-pilot-agent-flow.spec.ts` | P1 |
| Click `Заявитель` / `Семья` switch | Applicant count changes between one and family mode | `CreateSubmissionDrawer` switches type and prunes uploads | yes - `v19-pilot-agent-flow.spec.ts` | P1 |
| Click add family applicant | Family applicant count increases | Add control exists up to six applicants | yes - `v19-pilot-agent-flow.spec.ts` | P2 |
| Remove applicant | Applicant is removed without stale uploads | No remove applicant control found in current create drawer | no | P2 |
| City selection during creation | User can choose city before draft creation | Current create flow keeps `createCity` internal at `Москва`; no create-drawer city selector found | no | P1 |
| Trip dates during creation | User can set trip dates before submit/export | Trip dates exist in preliminary/domain model, but no first-step UI control found | no - unit guard only | P1 |
| Upload dummy passport file | Upload row appears and `Дальше` gates on all applicants | E2E mock supports `e2e-passport-*.jpg` | yes - `v19-pilot-agent-flow.spec.ts` | P1 |
| Submit incomplete in-progress submission | Submit is blocked with reason | Domain checks questionnaire, files, canonical media, trip dates | yes - `v19PilotStateMachine.spec.ts` | P0 |
| Submit complete in-progress submission | Status moves to `submitted_for_review` | Domain transition is centralized | yes - `v19PilotStateMachine.spec.ts` | P0 |
| Open returned issue from `ПД-1048` | Drawer opens on `Замечания`, issue detail can be opened | Existing returned fixture has file issues | yes - `v19-pilot-agent-flow.spec.ts` | P1 |
| Replace/fix returned files | Upload buttons clear visible missing/replacement state | Local demo upload buttons are wired | yes - `v19-pilot-agent-flow.spec.ts` | P1 |
| Mark visible issues fixed | Open issues move to `fixed_by_agent` | UI calls domain issue fix path | yes - `v19-pilot-agent-flow.spec.ts`, `v19PilotStateMachine.spec.ts` | P0 |
| Click `Отправить исправления` | Submission moves to corrections received | UI and domain path exists after issues fixed | yes - `v19-pilot-agent-flow.spec.ts`, `v19PilotStateMachine.spec.ts` | P0 |

## Admin Matrix

| Click | Expected state | Actual state | Covered by test | Severity if broken |
| --- | --- | --- | --- | --- |
| Open `admin@visaflow.local` workspace | Admin opens on `Работа`; agent nav is absent | Local/dev admin email is seeded | yes - `v19-pilot-admin-review-flow.spec.ts` | P1 |
| Click admin `Работа` nav | Review queue visible | Admin nav routes to review tab | yes - `v19-pilot-admin-review-flow.spec.ts` | P1 |
| Click review queue row | Submission drawer opens | Rows open `SubmissionDrawer` | yes - `v19-pilot-admin-review-flow.spec.ts` | P1 |
| Click drawer tab `Обзор` | Overview tab selected | Drawer tab is present | yes - `v19-pilot-admin-review-flow.spec.ts` | P2 |
| Click drawer tab `Заявители` | Applicants tab selected | Drawer tab is present | yes - `v19-pilot-admin-review-flow.spec.ts` | P2 |
| Click drawer tab `Анкета` | Questionnaire tab selected | Drawer tab is present | yes - `v19-pilot-admin-review-flow.spec.ts` | P2 |
| Click drawer tab `Файлы` | Files/media tab selected | Label drift exists in old tests, helper allows `Файлы`/`Документы` | yes - `v19-pilot-admin-review-flow.spec.ts` | P2 |
| Click drawer tab `Замечания` | Issues tab selected | Drawer tab is present | yes - `v19-pilot-admin-review-flow.spec.ts` | P1 |
| Click drawer tab `История` | History tab selected | Drawer tab is present | yes - `v19-pilot-admin-review-flow.spec.ts` | P2 |
| Click `Добавить замечание` | Issue composer opens | Composer opens in issues tab | yes - `v19-pilot-admin-review-flow.spec.ts` | P1 |
| Create issue tied to applicant/field | Issue appears with applicant and field target | Default/manual field issue path exists | yes - `v19-pilot-admin-review-flow.spec.ts` | P0 |
| Create issue tied to file | File-target issues exist in returned fixture; composer path not isolated in new pilot E2E | partly - source/fixture, unit target validation | P1 |
| Click `Вернуть` | Submission moves to returned state | Return action is blocked until issue exists | yes - `v19-pilot-admin-review-flow.spec.ts`, `v19PilotStateMachine.spec.ts` | P0 |
| Accept while blockers are open/fixed | Accept remains blocked | Domain blocks `open` and `fixed_by_agent` issues | yes - `v19PilotStateMachine.spec.ts` | P0 |
| Click `Закрыть и принять` after fixed issue | Issue closes and status becomes ready for export | Corrections fixture supports this path | yes - `v19-pilot-admin-review-flow.spec.ts`, `v19PilotStateMachine.spec.ts` | P0 |
| Open `Выгрузка` | Excel export surface opens | Admin export nav is available | yes - `v19-pilot-admin-review-flow.spec.ts` | P1 |
| Select ready submission | Preview updates to selected applicant count | Export screen uses selected row model | yes - `v19-pilot-admin-review-flow.spec.ts` | P0 |
| Click `Сформировать Эксель` | Download button becomes available | Workbook artifact generation is local-demo verified | yes - `v19-pilot-admin-review-flow.spec.ts`, `v19PilotStateMachine.spec.ts` | P0 |
| Click `Скачать` | Browser downloads `.xlsx` | Pilot E2E asserts suggested filename ends with `.xlsx` | yes - `v19-pilot-admin-review-flow.spec.ts` | P0 |
| ZIP production package | No ZIP product claim should appear | Export UI remains Excel-only in this pilot | yes - `v19-pilot-admin-review-flow.spec.ts`; docs gap keeps ZIP out of scope | P0 |

## Mobile Matrix

| Click | Expected state | Actual state | Covered by test | Severity if broken |
| --- | --- | --- | --- | --- |
| Open at 390px | No horizontal document overflow | Responsive shell has existing proof artifacts; new pilot checks 390px | yes - `v19-pilot-mobile-clicks.spec.ts` | P1 |
| Open mobile menu | Mobile nav opens and routes to `Мои подачи` | Menu button exists on V-19 collection surfaces | yes - `v19-pilot-mobile-clicks.spec.ts` | P1 |
| Click mobile status filter | Filter popover should select status and close without overlay collision | Fresh `app-smoke` run fails: `ops-mobile-tabbar-item` intercepts status option clicks | no - owned by 07 | P1 |
| Open create drawer at 390px | Drawer visible, footer buttons usable | Create drawer opens and closes at 390px | yes - `v19-pilot-mobile-clicks.spec.ts` | P1 |
| Create drawer footer buttons | `Сохранить черновик`/`Дальше` visible, disabled state preserved when incomplete | Footer buttons are visible at 390px | yes - `v19-pilot-mobile-clicks.spec.ts` | P1 |
| Open returned submission drawer at 390px | Drawer fits viewport and tabs are usable | Returned fixture opens drawer | yes - `v19-pilot-mobile-clicks.spec.ts` | P1 |
| Click mobile drawer tabs | `Обзор`, `Анкета`, `Файлы`, `Замечания`, `История` switch without horizontal overflow | New pilot checks stable tabs; label helper accepts current drift | yes - `v19-pilot-mobile-clicks.spec.ts` | P1 |

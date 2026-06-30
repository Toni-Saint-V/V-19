# V-19 All Screens Auto2 Findings

Runtime: `http://127.0.0.1:5174/`

Scope: browser pass across auth, agent, admin, export, settings, core drawer states, questionnaire workspace, create-flow states, admin drawer tabs, export preview, and mobile agent screens. No product code was changed during this pass.

## Screen Matrix

| Screen | Result | Evidence |
| --- | --- | --- |
| Auth login | PASS | `01-auth-login.png` |
| Auth registration request | PASS | `02-auth-register.png` |
| Auth password reset | PASS | `03-auth-reset.png` |
| Agent / My actions / list | PASS | `04-agent-my-actions.png` |
| Agent / My actions / columns | PASS WITH NOTE | `05-agent-my-actions-columns.png`; state changes to grouped columns, not date-grouped `СЕГОДНЯ` list. |
| Agent / My submissions | PASS | `06-agent-my-submissions.png` |
| Agent / My submissions search | PASS | `07-agent-my-submissions-search.png` |
| Agent / Create submission | PASS WITH UX DEBT | `19-agent-create-submission-drawer-recheck.png`; drawer opens, upload and disabled states render, but fixed `Испания` metadata is not visible. |
| Agent / Create submission / family toggle | PASS | `22-create-family-toggle.png` |
| Agent / Create submission / no-file guard | PASS | `23-create-next-state.png` |
| Agent / Create submission / Escape close | PASS | `47-create-after-escape.png`; `create-close-recheck.json` proves `dialogAfterEscape = 0`. |
| Agent / Submission drawer | PASS | `24-agent-drawer-initial.png`; drawer opens and all tabs are visible. |
| Agent / Submission drawer / overview | PASS | `25-agent-drawer-tab-Обзор.png` |
| Agent / Submission drawer / questionnaire tab | PASS | `25-agent-drawer-tab-Анкета.png` |
| Agent / Submission drawer / files | PASS | `10-agent-submission-drawer-files.png` |
| Agent / Submission drawer / issues | PASS | `25-agent-drawer-tab-Замечания.png` |
| Agent / Submission drawer / history | PASS | `25-agent-drawer-tab-История.png` |
| Agent / Questionnaire workspace | PASS | `30-agent-questionnaire-workspace.png` |
| Agent / Settings | PASS | `12-agent-settings.png` |
| Admin / Review list | PASS | `13-admin-review.png` |
| Admin / Review drawer | PASS | `20-admin-review-drawer-recheck.png`; drawer opens with `Паспорт`, `Селфи`, `Анкета`, `Замечания`. |
| Admin / Review drawer tabs | PASS | `admin-tabs-role-recheck.json`; all top-level admin drawer tabs are `button role="tab"` and switch `aria-selected` on click. |
| Admin / Add issue state | PASS | `38-admin-add-issue-state.png` |
| Admin / Export | PASS | `15-admin-export.png` |
| Admin / Export preview | PASS | `39-admin-export-list-revisit.png`; Excel preview and selected-package panel render. |
| Admin / Export primary action state | PASS | `40-admin-export-primary-action.png` |
| Admin / Settings | PASS | `16-admin-settings.png` |
| Mobile / Agent my actions / 390px | PASS | `17-mobile-agent-my-actions-390.png` |
| Mobile / Agent menu / 390px | PASS | `43-mobile-agent-menu-open.png` |
| Mobile / Agent my submissions / 390px | PASS | `18-mobile-agent-my-submissions-390.png` |
| Mobile / Create submission / 390px | PASS | `45-mobile-create-drawer.png` |

## Findings

| Severity | Area | Finding | Why it matters |
| --- | --- | --- | --- |
| Medium | Create submission | The create flow does not show fixed Spain metadata (`Испания`) on the visible first step. | V-19 scope locks Spain as fixed metadata; hiding it weakens trust and may make users wonder which country the package targets. |
| Minor | Agent columns view | The columns view passes functionally, but the first script expected list grouping text (`СЕГОДНЯ`). | Not a product bug, but future QA selectors should treat list and columns as different layouts. |
| Minor | QA selector note | Admin drawer tabs are `role="tab"`, not role `button`; button-role selectors falsely reported missing tabs. | Future browser QA should query tab widgets with `getByRole("tab")` or DOM-scoped tab selectors. |

## Console

Blocking console/runtime errors: `0`.

## Verdict

READY WITH RISK for screen traversal. The app is navigable across the checked screens, but the Medium create-flow metadata gap should be fixed before calling the create experience polished.

# Admin Drawer/Menu Premium UX Mismatch Ledger

## Context Gate

- Branch: `codex/admin-drawer-menu-premium-20260629-050634`
- Worktree: `/Users/user/v19-product-pipeline-20260628-192759/22-admin-drawer-menu-premium-20260629-050634`
- Existing dirty files before edits: untracked `TASK_FOR_CODEX.md`, `start-codex.sh`
- Figma: unavailable, not used as source of truth
- Runtime baseline: `http://127.0.0.1:5175/`

## Phase 1 Inventory

- Current AdminDrawer: `src/modules/submissions/components/SubmissionDrawer.tsx`
- Current admin menu/navigation: `src/modules/submissions/components/OperationalNavigation.tsx`, `src/App.tsx`
- Current admin review list: `src/modules/submissions/pages/OperationsScreens.tsx`
- Latest/best Drawer donor: current `SubmissionDrawer.tsx` plus prior commit `8a626c1d` (`codex/admin-drawer-only-20260629-044819`) for admin review presentation intent only; removed file action handlers are not reintroduced.
- Latest/best menu donor: current `OperationalSidebar` / `OperationalMobileTabBar` patterns.
- Latest/best remarks donor: current `IssueInput`, `DrawerIssues`, `targetForIssue`, `targetElementId`.
- Latest/best button/action donor: `src/shared/ui/primitives.tsx` (`Button`, `DrawerTabs`, `Badge`, form primitives).
- Patterns reused: dark graphite tokens, neutral selected states, compact row/card surfaces, drawer tabs, existing issue model, existing submission actions.

## Baseline Screens

- Baseline folder: `docs/qa/admin-drawer-menu-premium-composition/baseline/`
- Desktop: `admin-menu-desktop-1440x960.png`, `admin-drawer-overview-desktop-1440x960.png`, `admin-drawer-passport-current-files-desktop-1440x960.png`, `admin-drawer-questionnaire-desktop-1440x960.png`, `admin-drawer-remarks-desktop-1440x960.png`
- Tablet: `admin-menu-tablet-768x1024.png`, `admin-drawer-overview-tablet-768x1024.png`, `admin-drawer-passport-current-files-tablet-768x1024.png`, `admin-drawer-questionnaire-tablet-768x1024.png`, `admin-drawer-remarks-tablet-768x1024.png`
- Mobile: `admin-menu-mobile390-390x844.png`, `admin-menu-open-mobile390-390x844.png`, `admin-drawer-overview-mobile390-390x844.png`, `admin-drawer-questionnaire-mobile390-390x844.png`, `admin-drawer-remarks-mobile390-390x844.png`, plus `375x812` captures.

## Initial P0 Blockers

- Current main tabs are `Обзор / Заявители / Анкета / Файлы / Замечания / История`; required admin review workflow is exactly `Паспорт / Селфи / Анкета / Замечания`.
- Passport cannot be reviewed as its own workflow. It is hidden inside a generic files table with no large preview and no verification checklist.
- Selfie cannot be reviewed as its own workflow. It is mixed into the generic files table.
- Remarks are created from one generic composer by default; contextual target is not visible before submitting.

## Initial P1 Blockers

- Header is still a submission detail header and consumes too much decision space.
- `Сводка`, `Заявители`, `Файлы`, and `История` stay in the main admin workflow even though they duplicate or distract from the decision path.
- Questionnaire is still form-first and opens a heavy field stack; admin needs section-based review with compact section navigator and field-level remarks.
- Desktop passport/checklist cannot be seen together.
- Family/applicant context is not consistently present across admin review tabs.
- Footer has only close plus primary action; no contextual remark entry and no clear defer/accept hierarchy.
- Mobile drawer is usable but still a squeezed detail drawer: tabs are not the target four, questionnaire eats height, and footer dominates.
- Mobile admin menu overlay has no explicit close control.

## Initial P2 Polish

- Drawer tabs are pill-heavy for the review workflow; required style is thinner and less height-consuming.
- File rows and issue rows are functional but not composed as review evidence/checklist cards.
- Some action labels are generic (`Открыть точное поле`) instead of target-aware review labels.
- Empty preview states are not tailored to local runtime constraints.

## Responsive Blockers

- `390` and `375` baseline have `overflowX = 0`, but the mobile composition is not decision-first.
- Drawer fits viewport on mobile, but the main review path is still too tall and indirect.
- Menu overlay fits viewport, but closing requires selecting a nav item or leaving context.

## Fix Plan

- Map admin review presentation tabs onto existing `DrawerTab` values without changing domain/state types:
  - `overview` -> `Паспорт`
  - `applicants` -> `Селфи`
  - `questionnaire` -> `Анкета`
  - `issues` -> `Замечания`
- Keep full existing tabs for non-admin surfaces.
- Add admin-only compact header and applicant switcher.
- Add admin-only passport and selfie review panes using current files/questionnaire/issues data.
- Add admin-only sectioned questionnaire review with section navigator and field/section remark actions.
- Extend the existing issue composer to accept readonly context and submit existing `IssueInput`.
- Keep footer actions wired to existing handlers only.
- Add explicit mobile menu close button through an optional `OperationalSidebar` prop.

## Cycle 1 Result

- Path: `docs/qa/admin-drawer-menu-premium-composition/cycle-1/`
- Fixed P0: review drawer now exposes only `Паспорт / Селфи / Анкета / Замечания`; passport and selfie have dedicated review panes; remarks can open with target context; mobile menu has an explicit close button.
- Fixed P1: compact admin review top bar replaces the large detail header; desktop passport has preview/checklist split; footer has accept/defer/remark action hierarchy; generic files/history are removed from the admin main workflow.
- Remaining P1 after cycle 1: questionnaire grouping fell into one `Дополнительно` bucket because runtime section ids include applicant prefixes.

## Cycle 2 Result

- Path: `docs/qa/admin-drawer-menu-premium-composition/cycle-2/`
- Fixed P1: questionnaire grouping now matches runtime section aliases, producing `Личные данные`, `Адрес и контакты`, `Работа / учёба`, `Поездка`, and `Документы`.
- Fixed P1/P2: mobile selfie previews compressed into two compact cards; footer actions are visible as `Замечание / Отложить / Принять`; passport metadata remains compact on narrow mobile.
- Remaining P2 after cycle 2: context remark composer was too dense on mobile because fixed target selectors duplicated the readonly context.

## Final Result

- Path: `docs/qa/admin-drawer-menu-premium-composition/final/`
- Proof JSON: `docs/qa/admin-drawer-menu-premium-composition/final/browser-proof.json`
- P0 fixed: no relevant console errors, drawer opens/closes, mobile menu opens/closes, no horizontal page overflow at `1440`, `768`, `430`, `390`, `375`, `320`.
- P1 fixed: four required tabs only, sectioned questionnaire navigator, passport/selfie review panes, context-aware remarks, visible footer actions, tablet/mobile menu close behavior.
- P2 fixed in touched areas: tighter tabs, compact top bar, neutral selected states, dark graphite surfaces, compact buttons, responsive preview/checklist layout.
- Final residual risk: mobile context composer remains dense at `390`, but target context and textarea are visible and the form is usable without submitting fake data.

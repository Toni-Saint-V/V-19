# Single Instance UI System Audit

Run id: `20260704-174426-MSK-31f9d5cd`

Current gate status: `SOURCE_AUDIT_COMPLETE_RUNTIME_HOLD`

## Owners

| Concern | Owner |
|---|---|
| App shell / workspace frame | `src/modules/submissions/components/AppShell.tsx` |
| Page header | `src/modules/submissions/components/AppShell.tsx` (`PageHeader`) |
| Side menu shell | `src/modules/submissions/components/OperationalSideMenu.tsx` |
| Side menu rendering | `src/modules/submissions/components/OperationalNavigation.tsx` |
| Nav config/model | `src/App.tsx` (`operationalNavItems`) |
| Containers/surfaces/toolbars | `src/modules/submissions/components/CollectionPrimitives.tsx`, `src/shared/ui/primitives.tsx` |
| Drawer tab header | `src/shared/ui/v19-design-system.tsx` (`V19DrawerHeader`) |
| Tokens and responsive contracts | `src/shared/ui/system.css`, `src/shared/ui/visual-baseline.css` |

## Source Verification

| Audit area | Source result | Notes |
|---|---|---|
| One `AppShell` / product shell | PASS | `src/App.tsx` renders one `AppShell`; `AppShell.tsx` owns `.ops-shell`, `.workspace`, header, sidebar, overlays. |
| One side menu / app navigation | PASS | `src/App.tsx` creates one `OperationalSideMenu`; it wraps `OperationalSidebar` from `OperationalNavigation.tsx`. |
| One nav config/model | PASS | `src/App.tsx` owns `operationalNavItems` for Agent/Admin role branches. No separate route/nav registry found for primary surfaces. |
| One mobile menu path | PASS SOURCE | `OperationalSideMenu.tsx` owns mobile open/close wrapping and `ops-mobile-menu-backdrop`; no separate primary bottom nav/sidebar path found. |
| One background/surface/container/token system | PASS WITH RISK | `system.css` and `visual-baseline.css` are the token/CSS owners. `system.css` still contains old large surface override layers, so browser retest remains required. |
| Reusable cards/panels/buttons/chips/status/tabs | PASS SOURCE | Shared primitives are in `src/shared/ui/primitives.tsx`, `src/shared/ui/v19-design-system.tsx`, `CollectionPrimitives.tsx`, `RightRailPrimitives.tsx`, and `Primitives.tsx`. |
| Reusable drawers/forms | PASS SOURCE | Agent drawer, admin drawer, create drawer, questionnaire workspace are separate product components but launched through the same `AppShell` overlay path. |
| Duplicate shells/sidebar/mobile nav/backgrounds | NO PRIMARY DUPLICATE FOUND | `QuestionnaireWorkspaceShell` is a form workspace shell, not a primary app shell. `AgentActionsCommandCockpit` has a mobile detail overlay, not primary navigation. |
| Hardcoded values | RISK | Existing CSS and reference-derived TSX still include hardcoded visual values in some component files and legacy CSS layers. No broad cleanup performed by QA gate. |

## Final Nav Model

Agent:

- `Входящие`
- `Мои действия`
- `Мои подачи`
- `Настройки`

Admin:

- `Входящие`
- `Мои действия`
- `Проверка`
- `Выгрузка`
- `Настройки`

`Входящие` uses existing safe surfaces:

- Agent `Входящие` opens `surface-agent-inbox`.
- Admin `Входящие` opens the existing admin review queue with `reviewTab="all"`.

No empty standalone route was added.

## Consolidation / Fixes

- Kept all main Agent/Admin screens inside the existing `AppShell`.
- Kept one `OperationalSideMenu` / `OperationalSidebar` rendering path.
- Added missing required nav entries to the single nav config in `src/App.tsx`.
- Added `role="tablist"`, `role="tab"`, and `aria-selected` to shared `V19DrawerHeader`, so agent drawer tabs use the same semantic interaction contract as admin drawer tabs.
- Added final Admin Review responsive CSS contracts to prevent the compact hidden right rail from reserving grid space.
- Added tablet/mobile Admin Review row/radar contracts so triage and primary actions do not overlap or clip.
- Added missing token aliases in `src/shared/ui/system.css` so the screen-system verifier sees a complete token graph.
- Kept product logic in current V-19 domain/status modules; no reference mock logic was copied.

## Remaining Hardcoded Visual Values

No new raw colors were introduced in screen/component rules. New CSS values are responsive breakpoints or dimensions that use existing token variables where available. Token aliases point to existing canonical tokens rather than new visual values.

## Current Blocker Evidence

The earlier `QA_REPORT.md` says hard gates passed, but `final-checklist-qa.json` is newer and reports `6` click/browser failures. This audit therefore does not mark the product merge-ready.

Single-instance audit verdict: `PASS_SOURCE_AUDIT_RUNTIME_HOLD`

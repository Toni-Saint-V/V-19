# V-19 Visual Primitives Plan

- [ ] T1: Freeze visual token layer
  goal: One source of truth for baseline colors, font roles, all spacing/offsets, radius, sizes, motion, and dot palette.
  files: `AGENTS.md`, `src/shared/ui/visual-baseline.css`, `src/main.tsx`
  acceptance: `npm run typecheck` and `git diff --check -- AGENTS.md src/main.tsx src/shared/ui/visual-baseline.css`
  spec: `docs/staging/specs/2026-06-30-v19-visual-primitives.md#acceptance-criteria`

- [ ] T2: Extract shared buttons, tags, and dots
  goal: Default, secondary, icon, primary, disabled, pressed, status tag, and dot states use shared baseline rules.
  files: `src/shared/ui/visual-baseline.css`, `src/modules/submissions/components/CollectionPrimitives.tsx`
  acceptance: Browser check confirms buttons are dark gray by default, primary remains indigo, bright colors appear only on small dots.
  spec: `docs/staging/specs/2026-06-30-v19-visual-primitives.md#acceptance-criteria`

- [ ] T3: Extract sidebar and topbar primitives
  goal: Side menu, title, hamburger, counts, nav items, hover, active, focus, and mobile open/close use the archive-derived baseline.
  files: `src/shared/ui/visual-baseline.css`, `src/modules/submissions/components/OperationalNavigation.tsx`
  acceptance: Desktop and mobile screenshots show consistent sidebar/topbar with no clipped labels or broken active state.
  spec: `docs/staging/specs/2026-06-30-v19-visual-primitives.md#user-stories`

- [ ] T4: Extract shared toolbar primitive
  goal: Tabs/city selector sit above search/filter/tools; search plus 2-3 tools stay in one row with 2px gaps where viewport allows.
  files: `src/shared/ui/visual-baseline.css`, `src/modules/submissions/components/CollectionPrimitives.tsx`
  acceptance: Desktop and mobile browser checks show no two-rectangle nested toolbar feel and no horizontal overflow.
  spec: `docs/staging/specs/2026-06-30-v19-visual-primitives.md#edge-cases`

- [ ] T5: Extract two reusable mobile long-cell variants
  goal: `Мои действия` list, `Проверка` list, and `Мои подачи` share exactly two mobile long-cell forms.
  files: `src/shared/ui/visual-baseline.css`, `src/modules/submissions/components/CollectionPrimitives.tsx`, `src/modules/submissions/pages/FigmaVisualScreens.tsx`, `src/modules/submissions/pages/OperationsScreens.tsx`
  acceptance: 390px screenshot shows ID, title, optional people badge, city/date line, divider, and correct bottom action/status without overflow.
  spec: `docs/staging/specs/2026-06-30-v19-visual-primitives.md#acceptance-criteria`

- [ ] T6: Extract export-only applicant/family cards
  goal: Applicant/family cards from the reference are available only for `Выгрузка` and use baseline tokens.
  files: `src/shared/ui/visual-baseline.css`, `src/modules/submissions/pages/OperationsScreens.tsx`, `src/modules/submissions/pages/FigmaVisualScreens.tsx`
  acceptance: `Выгрузка` screenshot shows applicant/family cards; `Мои подачи` does not receive that extra card form.
  spec: `docs/staging/specs/2026-06-30-v19-visual-primitives.md#technical-assumptions`

- [ ] T7: Extract right-side panel sections
  goal: Non-drawer right panel on `Выгрузка` and `Заявители` becomes reusable section rail with cards, headers, status rows, quick actions, and motion.
  files: `src/shared/ui/visual-baseline.css`, `src/modules/submissions/components/RightRailPrimitives.tsx`, `src/modules/submissions/components/AgentSubmissionContextRail.tsx`, `src/modules/submissions/pages/OperationsScreens.tsx`
  acceptance: Desktop screenshot shows sectioned side panel, not drawer styling; mobile hides/reflows without blocking primary list.
  spec: `docs/staging/specs/2026-06-30-v19-visual-primitives.md#user-stories`

- [ ] T8: Motion and reduced-motion pass
  goal: Every interactive primitive has consistent hover, active, selected, focus-visible, open/close, row select, and reduced-motion behavior.
  files: `src/shared/ui/visual-baseline.css`, `tests/e2e/v19-motion-contract.spec.ts`
  acceptance: `npm run typecheck` and browser interaction check show no abrupt broken state changes; reduced-motion override disables nonessential transitions.
  spec: `docs/staging/specs/2026-06-30-v19-visual-primitives.md#acceptance-criteria`

- [ ] T9: Runtime QA and review gate for first screen
  goal: `Мои действия` is verified as the first approved screen before moving to the next screen.
  files: `docs/qa/`, `src/shared/ui/visual-baseline.css`
  acceptance: Fresh desktop and mobile screenshots plus written `premium-design-ux-review` with no unresolved Critical/High/Medium findings.
  spec: `docs/staging/specs/2026-06-30-v19-visual-primitives.md#verification-plan`

[parallel] T2, T3 after T1 only if selectors do not overlap. T4-T9 are sequential because toolbar/cell/panel cascade affects the same screens.

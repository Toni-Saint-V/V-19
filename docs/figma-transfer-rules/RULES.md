# V-19 Figma Transfer Rules

This file is mandatory reading before every continuation of the V-19 Figma Make transfer work.

## Scope

- Goal: transfer the latest agent flow from Figma Make into V-19 `1 в 1`, starting with `Submission Drawer` and `Создание подачи / Новая подача`.
- `1 в 1` means visually indistinguishable in paired comparison except unavoidable real-data differences.
- Do not redefine success around a smaller/easier subset.
- Current Phase 1 focus: Drawer and Creation. Applicant/Family screens are not a permanent exception if they are part of the agent flow, but they come after the first slice unless explicitly pulled in.
- Phase 2 for `Мои действия` and admin `Проверка`: use the same visual system from the new source ZIPs/screenshots listed below. Only adapt data/domain wiring; colors, borders, icons, typography, spacing, filters, tabs, and motion must come from the selected source.
- Phase 3: other agent-flow screens only after latest-version inventory and paired screenshots.
- Branch scope update: admin screens, including admin `Проверка`, admin work list, and export, will be implemented in a separate branch. This branch stays focused on the agent flow transfer slice: Drawer, Creation, and directly related questionnaire states.

## Unified Rule Set

Read this file as the single collected rule source for the current transfer. It consolidates the user's rules from the thread:

- Skills named by the user must be read and applied when relevant; `live-1-to-1-ui-convergence` is the primary UI skill.
- `codex-memory-gate` is used for persistent transfer rules; memory never overrides current source truth.
- Source code from the supplied Figma ZIPs is the implementation source; screenshots are proof and visual references, not a replacement for code.
- No own colors, icons, fonts, borders, radii, shadows, spacing, density, composition, hover/tap/disabled states, or motion.
- Transfer screen-by-screen and state-by-state.
- Every accepted state needs paired screenshots: source/reference and V-19 runtime.
- After every screen/state, update the deviation log.
- Do not ask the user to verify by eye instead of doing browser/runtime proof.
- Use Computer Use as an additional local visual check when requested; browser/Playwright screenshots remain the repeatable proof.
- Keep V-19 domain architecture: UI renders; domain/use cases decide status, permissions, blocker logic, export, upload, OCR, and lifecycle.
- Do not fake uploads, OCR, AI, export, auth, database writes, production proof, or official verification.
- Use one-word button labels where possible when the user explicitly requested it; record source-copy deviations.
- Fullscreen questionnaire opens only from an error/remark action that concerns the questionnaire.
- All drawer tabs/states present in the source must be checked; do not invent tabs absent from the current source.
- `Мои действия` and admin `Проверка` must share the same chosen visual system.
- Add a view switcher for list/row view and column/kanban view. The switcher must not change/remove the tabs and filters above the list.
- `Заявитель / Семья`, admin work list, and export are handled by explicit source decisions before transfer, not blind copy.
- For `Заявители / Семьи`, say `готово для просмотра` only when that exact screen/state has 100% source/runtime paired proof and the deviation log has no open P0/P1 blockers. Reference screenshots or handoff material alone are not enough.

## Chosen Visual Direction

- Primary visual direction for Phase 1 is the latest live `Premium Dark-First UI Concept` ZIP/Figma Make runtime.
- This means Drawer and Creation must follow the Figma source code, Tailwind classes, motion, icons, copy, spacing, radii, borders, typography, and responsive behavior.
- V-19 current UI may remain only where a surface is not yet selected for transfer or where V-19 domain architecture requires a structural adapter.
- Do not create a hybrid visual style by mixing current V-19 colors/radii/borders with Figma components.
- Do not use personal taste, older screenshots, memory, or "premium" reinterpretation to resolve visual details.
- If the Figma visual and V-19 logic conflict, keep V-19 logic/domain and adapt the Figma visual around it; record the deviation before calling the state accepted.
- If a Figma screen looks visually strong but product-logic incompatible, it is not selected automatically. It goes through the deferred screen decision table below.

## New Source Packages For `Мои действия` / Admin `Проверка`

The following files are now selected source inputs for the shared agent/admin work-list visual system:

- List/row view source ZIP: `/Users/user/Downloads/Premium Dark-First Мои действия.zip`.
- Column/kanban view source ZIP: `/Users/user/Downloads/Premium Dark-First UIколонка.zip`.
- List/row visual reference screenshot: `/Users/user/Desktop/Снимок экрана 2026-06-28 в 13.56.21.png`.
- Column/kanban visual reference screenshot: `/Users/user/Desktop/Снимок экрана 2026-06-28 в 13.56.33.png`.
- Current unpacked list/row source runtime folder: `/tmp/visaflow-figma-my-actions-source`.
- Current unpacked column/kanban source runtime folder: `/tmp/visaflow-figma-column-source`.

Implementation rules for these surfaces:

- Agent `Мои действия` and admin `Проверка` use the same row/card visual language and the same view modes.
- Row/list mode comes from `Premium Dark-First Мои действия.zip`, especially `src/app/components/SubmissionsScreen.tsx`, and the matching screenshot.
- Column/kanban mode comes from `Premium Dark-First UIколонка.zip`, especially `src/app/components/SubmissionsScreen.tsx`, and the matching screenshot.
- Add a view switcher between row/list and column/kanban views.
- The view switcher changes only the list body layout. It must not remove, redesign, or relocate the tabs, filters, search, or top controls above the list.
- Agent and admin surfaces may map different V-19 domain data into the same visual shell, but the visual system stays identical.
- Admin `Проверка` must not copy fake admin logic from Figma. Use V-19 review/domain rules and map them into the shared visual.
- Do not copy forbidden or mock-only actions such as fake export, fake removal, fake OCR, or unsupported admin actions.

## Deferred Screen Decision

- `Мои действия`, `Заявитель / Семья`, `Список работы админа`, and `Выгрузка` are not automatic direct-transfer screens yet.
- Before transferring either surface, decide explicitly which source/version should be used.
- Reason: the currently visible/latest screens may not be fully suitable for V-19 logic, so copying them blindly would risk visual fidelity to the wrong product state.
- Until this decision is made, do not claim any of these screens are selected for 1-to-1 transfer and do not rebuild them by taste.
- Admin surfaces are also out of this branch's implementation scope. Keep their decisions documented here for the future admin branch, but do not implement them in `codex/v19-figma-agent-flow-transfer`.

## Visual Selection Decisions

These decisions define what to use as the visual base when the work reaches the named screen. They do not expand Phase 1 beyond Drawer and Creation.

| Screen                                    | Visual decision                                                                                                                                                                                                                                                       | Do not use blindly                                                                                                                                                             | Reason                                                                                                                                                                                     |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Мои действия`                            | Use the new shared visual system: row/list mode from `/Users/user/Downloads/Premium Dark-First Мои действия.zip`; column/kanban mode from `/Users/user/Downloads/Premium Dark-First UIколонка.zip`; add a view switcher without changing tabs/filters above.          | Do not use the older version-37-only decision as the final rule; it has been superseded by the new explicit ZIP/screenshot source rule. Do not copy Figma mock business logic. | User selected the new visual/code source and explicitly required `Мои действия` and admin `Проверка` to match. V-19 statuses, ownership, issue lifecycle, and actions remain domain-owned. |
| `Заявитель / Семья`                       | Do not transfer the current standalone `ApplicantsScreen` as a primary V-19 product screen. Use applicant/family visuals only where they belong inside Submission contexts: Drawer, Creation, Questionnaire, or a later explicitly selected applicant-family surface. | Do not create a standalone applicants/families product surface by copying the Figma mock screen.                                                                               | V-19 scope keeps applicants and families inside `Submission`; copying the standalone source screen would reintroduce a product surface that does not match current V-19 logic.             |
| Admin `Проверка` / `Список работы админа` | Use the same shared visual system as agent `Мои действия`: row/list and column/kanban view modes from the new ZIPs. Keep V-19 admin review/work-list logic as the structural/domain base.                                                                             | Do not copy current Figma `ReviewScreen` cards as-is. Do not diverge visually from agent `Мои действия`.                                                                       | User explicitly required agent `Мои действия` and admin `Проверка` to be visually identical where they are the same work-list pattern, while V-19 review rules stay domain-owned.          |
| `Выгрузка`                                | Use V-19 export logic and Excel contract as the structural base; only borrow compatible Figma admin/export visual language after source/runtime inventory.                                                                                                            | Do not copy current `AdminExportScreen` as-is, especially `ZIP Досье`, mock removal after export, country variety, or API/XML copy.                                            | V-19 export is fail-closed Excel/XLSX proof with selected ready submissions, workbook identity, preview/workbook row match, and no fake export proof.                                      |

## Always-Active Skills

- User-named and directly applicable skills are always active for this task.
- Read or re-read named skills before acting in the same turn.
- `live-1-to-1-ui-convergence` is the primary UI skill for this transfer.
- Other skills/tools should be used only when the situation genuinely requires them, such as React/TypeScript implementation, browser/runtime proof, Computer Use visual inspection, memory updates, or targeted QA.
- Required recurring skills/capabilities include:
  - `codex-memory-gate`
  - `computer-use`
  - browser/runtime proof
  - React/TypeScript engineering
  - React best practices
  - UI conversion/fidelity skills when source-to-code transfer is involved
- If a skill is unavailable, say so and use the closest safe fallback.

## Source Truth

- Primary source: current Figma Make React/ZIP, especially `/Users/user/Premium Dark-First UI Concept.zip`.
- Figma link: `https://www.figma.com/make/6s6XEdLE5G4wS0fe06GuM3/Premium-Dark-First-UI-Concept?p=f&t=4GNn8sEYpBjRpzK2-0`.
- Use live ZIP runtime as source when available.
- Screenshots are verification artifacts, not the implementation source.
- Memory, prior screenshots, old version maps, and taste do not override current ZIP/source runtime.
- If ZIP code and screenshot differ, inspect the live ZIP runtime first.

## Implementation Method

- Transfer code-first from Figma React/CSS/Tailwind/motion source.
- Do not rebuild “by eye”.
- Do not invent a new design system.
- Do not introduce own colors, icons, fonts, radii, borders, shadows, spacing, density, composition, hover/active/disabled states, or motion.
- If a visual value is needed, derive it from Figma source code or existing Figma runtime evidence.
- Keep changes scoped to V-19 transfer surfaces.
- Keep domain architecture intact: UI renders, domain decides.
- Do not move business rules/status transitions/permissions/blocker logic into React visual components.
- Do not fake uploads, OCR, AI, export, auth, database writes, or official verification.

## Drawer Requirements

Transfer from Figma source:

- panel geometry, width, position, overlay/dimming;
- header/top-zone;
- tabs;
- CTA/footer actions;
- status blocks;
- cards, groups, spacing, radii, borders;
- icons and status badges;
- open/close motion, hover/tap, transition timing/easing;
- responsive behavior.

Not allowed:

- approximate structure;
- change colors/borders by preference;
- use a different drawer shell;
- put business rules in the React component.

## Creation Requirements

Transfer from Figma source:

- `Новая подача` / creation screen;
- `Паспорт и семья` and `Анкета и файлы` steps;
- upload area;
- applicant/family panel when present in source state;
- footer actions;
- states: empty, file waiting, processing, disabled next, draft save;
- motion transitions and microinteractions;
- if questionnaire is large, it must open as a full convenient screen/state, not be squeezed into a small drawer.

## Questionnaire Entry Rule

- Fullscreen questionnaire is reachable only from an error/remark action.
- The error/remark must concern the questionnaire itself.
- General drawer questionnaire progress, questionnaire section cards, and non-questionnaire file remarks must not route to the fullscreen questionnaire.
- If Figma Make mock code wires broader `onOpenQuestionnaire` handlers, adapt the interaction contract and record the intentional deviation in the QA report.

## Visual Verification Contract

- Every accepted screen/state must have two screenshots:
  - `reference`: Figma/source runtime;
  - `runtime`: V-19 implementation.
- Show paired screenshots after every screen/state verification.
- Screenshots must be state-matched. Do not compare source populated state to runtime empty state and call it parity.
- If state mismatch is unavoidable, write it in the deviation log and do not accept the screen as `1 в 1`.
- In addition to paired screenshots, use Computer Use/local screen inspection when requested or when desktop-rendered appearance must be verified.
- Computer Use is for observing/operating local UI; do not perform risky external side effects without required confirmation.
- Check layout, spacing, colors, borders, radii, typography, icons, motion states, hover/tap/active/disabled, responsive behavior, overflow, and text fit.
- Do not ask the user to verify by eye instead of doing the verification.

## Reporting

- After each transferred screen/state, update a deviation log.
- List every deviation explicitly:
  - what differs;
  - why it differs;
  - risk;
  - whether it will be fixed now or remains an intentional technical deviation.
- Report transferred components, colors, icons, typography/sizing, and motion effects when asked or when completing a screen slice.
- Do not say `1 в 1`, parity, complete, accepted, ready, or done until current source/runtime proof, paired screenshots, Computer Use check when required, and deviation log support it.
- If proof is incomplete, say `partial`, `not accepted`, `not 1 в 1`, or `blocked` as appropriate.

## Verification Gates

- Run `npm run typecheck` after each screen implementation or meaningful UI wiring change.
- Runtime must open without console/page errors for the verified state.
- Use browser proof for UI behavior and screenshots.
- Use Computer Use for additional local visual inspection when required by the user.
- Store optional screenshots outside the repository through `V19_TEST_ARTIFACTS_DIR`.
- Keep durable report/deviation text under `docs/release/`; keep generated media ephemeral.

## Current Known Required Artifacts

- Source ZIP unpack/runtime: `/Users/user/Premium Dark-First UI Concept.zip`.
- QA report: `docs/release/figma-phase1-transfer-report-2026-06-28.md`.
- Current rules folder: `docs/figma-transfer-rules/`.

## Non-Scope For This Transfer

- Admin/export/Supabase/RLS/OCR/AI/export proof.
- CRM, analytics, multi-country, new product surfaces.
- New design system instead of Figma.
- Unrequested “improvements”.

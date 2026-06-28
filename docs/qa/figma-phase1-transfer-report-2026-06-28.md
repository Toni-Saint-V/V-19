# Figma Phase 1 Transfer Report - 2026-06-28

Source of truth: `/Users/user/Premium Dark-First UI Concept.zip`, live source runtime `http://127.0.0.1:5181/`.
Target runtime: `http://127.0.0.1:5177/`.

Verdict: partial transfer only. Do not mark the whole Phase 1 `1 в 1` yet. Drawer is closer because it was moved code-first from Figma `Drawer.tsx`; Creation upload shell is in progress; fullscreen questionnaire was integrated and has a current paired desktop screenshot, but Phase 1 still needs the remaining creation states and final drawer/state convergence.

## Chosen Visual Direction

The selected Phase 1 visual base is the latest live `Premium Dark-First UI Concept` ZIP/Figma Make runtime. Drawer and Creation must follow the Figma source code and runtime evidence: structure, Tailwind classes, motion, icons, copy, spacing, radii, borders, typography, colors, and responsive behavior.

Current V-19 visuals are not the Phase 1 visual source except where a surface is not selected for transfer or where V-19 domain architecture requires an adapter. Visual differences caused by real V-19 data or logic must be logged as deviations before a state can be accepted.

## Source Inventory

Fresh ZIP source was unpacked from `/Users/user/Premium Dark-First UI Concept.zip` into `/tmp/visaflow-figma-source-current`.

Agent drawer source: `/tmp/visaflow-figma-source-current/src/app/components/Drawer.tsx`.

Actual agent drawer tabs in the current ZIP source:

- `overview` / `Обзор`;
- `questionnaire` / `Анкета`;
- `issues` / `Замечания`;
- `history` / `История`.

No fifth tab exists in the current agent `Drawer.tsx`. The current ZIP also contains a separate admin/review drawer, `/tmp/visaflow-figma-source-current/src/app/components/AdminReviewDrawer.tsx`, with six review/admin tabs: `Сводка`, `Заявители`, `Анкета`, `Файлы`, `Замечания`, `Логи`. That is a different surface and is not the Phase 1 agent drawer being transferred here.

## Deferred Screen Decision

`Мои действия`, `Заявитель / Семья`, `Список работы админа`, and `Выгрузка` are not selected for blind direct transfer. Before any of these surfaces are transferred, the visual source/version must be explicit. The currently visible/latest screens are not all fully suitable for V-19 logic, so copying them as-is would risk high visual fidelity to the wrong product state.

Until that decision is made, these screens remain inventory/decision items, not accepted 1-to-1 transfer targets.

Admin screens are now explicitly out of this branch's implementation scope. Admin `Проверка`, admin work list, and export will be implemented in a separate branch. This branch remains scoped to the agent flow Phase 1 transfer: Drawer, Creation, and directly related questionnaire states.

## Visual Selection Decisions

These decisions are scope locks for later work. They do not expand current Phase 1 beyond Drawer and Creation.

| Screen | Selected visual base | Rejected blind copy | Reason |
| --- | --- | --- | --- |
| `Мои действия` | Separate future branch. Use the new shared visual system from `docs/handoff/agent-my-actions-admin-branch-2026-06-28`: row/list mode from the selected agent `SubmissionsScreen.tsx`, column/kanban mode from the selected agent `SubmissionsScreen.tsx`, and the provided screenshots. | Do not implement in this branch. Do not use older version-37-only direction as the final rule. Do not copy Figma mock business logic. | User selected the new source screenshots/code and moved admin screens to another branch. V-19 domain statuses, issue lifecycle, and actions must stay in V-19 logic. |
| `Заявитель / Семья` | Applicant/family visuals only inside real Submission contexts: Drawer, Creation, Questionnaire, or a later explicitly selected applicant-family surface. | Current standalone Figma `ApplicantsScreen` as a primary V-19 product screen. | V-19 scope keeps applicants/families inside `Submission`; a standalone people/family product surface is not automatically in scope. |
| `Список работы админа` | Separate admin branch. Use V-19 admin review/work-list logic as structure; Figma admin visual language only after paired inventory in that branch. | Do not implement in this branch. Do not copy current Figma `ReviewScreen` cards as-is. | User moved admin screens to another branch. Source mock uses simplified countries/statuses/actions and does not fully match V-19 review rules. |
| `Выгрузка` | Separate admin/export branch. Use V-19 Excel/export contract as structure; compatible Figma admin/export visual language only after paired inventory in that branch. | Do not implement in this branch. Do not copy current `AdminExportScreen` as-is, including `ZIP Досье`, mock item removal, country variety, and XML/API copy. | User moved admin/export work out of this branch. V-19 export is fail-closed XLSX proof with selected ready submissions, workbook identity, and preview/workbook row match. |

## Screenshots

### Drawer overview

- Reference current: `docs/qa/figma-source-phase1-2026-06-28/reference-01-drawer-overview-current-1440x900.png`
- Runtime current: `docs/qa/figma-runtime-phase1-2026-06-28/runtime-01-drawer-overview-current-1440x900.png`
- Reference reopened overview current desktop: `docs/qa/figma-source-phase1-2026-06-28/reference-02-drawer-reopened-overview-current-1440x900.png`
- Runtime reopened overview current desktop: `docs/qa/figma-runtime-phase1-2026-06-28/runtime-02-drawer-reopened-overview-current-1440x900.png`
- Reference current mobile 390: `docs/qa/figma-source-phase1-2026-06-28/reference-01-drawer-overview-current-mobile390.png`
- Runtime current mobile 390: `docs/qa/figma-runtime-phase1-2026-06-28/runtime-01-drawer-overview-current-mobile390.png`
- Reference current tablet 768: `docs/qa/figma-source-phase1-2026-06-28/reference-01-drawer-overview-current-tablet768.png`
- Runtime current tablet 768: `docs/qa/figma-runtime-phase1-2026-06-28/runtime-01-drawer-overview-current-tablet768.png`

### Drawer questionnaire / issues entry rule

- Reference questionnaire current: `docs/qa/figma-source-phase1-2026-06-28/reference-02-drawer-questionnaire-current-1440x900.png`
- Runtime questionnaire current: `docs/qa/figma-runtime-phase1-2026-06-28/runtime-02-drawer-questionnaire-current-1440x900.png`
- Reference questionnaire current mobile 390: `docs/qa/figma-source-phase1-2026-06-28/reference-02-drawer-questionnaire-current-mobile390.png`
- Runtime questionnaire current mobile 390: `docs/qa/figma-runtime-phase1-2026-06-28/runtime-02-drawer-questionnaire-current-mobile390.png`
- Reference questionnaire current tablet 768: `docs/qa/figma-source-phase1-2026-06-28/reference-02-drawer-questionnaire-current-tablet768.png`
- Runtime questionnaire current tablet 768: `docs/qa/figma-runtime-phase1-2026-06-28/runtime-02-drawer-questionnaire-current-tablet768.png`
- Reference issues current: `docs/qa/figma-source-phase1-2026-06-28/reference-02-drawer-issues-current-1440x900.png`
- Runtime issues current: `docs/qa/figma-runtime-phase1-2026-06-28/runtime-02-drawer-issues-current-1440x900.png`
- Reference issues current mobile 390: `docs/qa/figma-source-phase1-2026-06-28/reference-02-drawer-issues-current-mobile390.png`
- Runtime issues current mobile 390: `docs/qa/figma-runtime-phase1-2026-06-28/runtime-02-drawer-issues-current-mobile390.png`
- Reference issues current tablet 768: `docs/qa/figma-source-phase1-2026-06-28/reference-02-drawer-issues-current-tablet768.png`
- Runtime issues current tablet 768: `docs/qa/figma-runtime-phase1-2026-06-28/runtime-02-drawer-issues-current-tablet768.png`
- Runtime questionnaire tab: `docs/qa/figma-runtime-phase1-2026-06-28/runtime-02-drawer-questionnaire-entry-rule-1440x900.png`
- Runtime issues tab: `docs/qa/figma-runtime-phase1-2026-06-28/runtime-02-drawer-issues-entry-rule-1440x900.png`
- Runtime fullscreen opened from questionnaire issue: `docs/qa/figma-runtime-phase1-2026-06-28/runtime-04-questionnaire-from-questionnaire-issue-1440x900.png`

### Drawer history

- Reference current: `docs/qa/figma-source-phase1-2026-06-28/reference-02-drawer-history-current-1440x900.png`
- Runtime current: `docs/qa/figma-runtime-phase1-2026-06-28/runtime-02-drawer-history-current-1440x900.png`
- Reference current mobile 390: `docs/qa/figma-source-phase1-2026-06-28/reference-02-drawer-history-current-mobile390.png`
- Runtime current mobile 390: `docs/qa/figma-runtime-phase1-2026-06-28/runtime-02-drawer-history-current-mobile390.png`
- Reference current tablet 768: `docs/qa/figma-source-phase1-2026-06-28/reference-02-drawer-history-current-tablet768.png`
- Runtime current tablet 768: `docs/qa/figma-runtime-phase1-2026-06-28/runtime-02-drawer-history-current-tablet768.png`

### Creation upload

- Reference: `docs/qa/figma-source-phase1-2026-06-28/reference-03-create-upload-current-1440x900.png`
- Runtime: `docs/qa/figma-runtime-phase1-2026-06-28/runtime-03-create-upload-current-1440x900.png`
- Reference v2: `docs/qa/figma-source-phase1-2026-06-28/reference-03-create-upload-v2-1440x900.png`
- Runtime v2: `docs/qa/figma-runtime-phase1-2026-06-28/runtime-03-create-upload-v2-1440x900.png`
- Reference empty v3: `docs/qa/figma-source-phase1-2026-06-28/reference-03-create-upload-empty-v3-1440x900.png`
- Runtime empty v3: `docs/qa/figma-runtime-phase1-2026-06-28/runtime-03-create-upload-empty-v3-1440x900.png`
- Reference empty current desktop: `docs/qa/figma-source-phase1-2026-06-28/reference-03-create-upload-empty-current-1440x900.png`
- Runtime empty current desktop: `docs/qa/figma-runtime-phase1-2026-06-28/runtime-03-create-upload-empty-current-1440x900.png`
- Reference empty current mobile 390: `docs/qa/figma-source-phase1-2026-06-28/reference-03-create-upload-empty-current-mobile390.png`
- Runtime empty current mobile 390: `docs/qa/figma-runtime-phase1-2026-06-28/runtime-03-create-upload-empty-current-mobile390.png`
- Reference empty current tablet 768: `docs/qa/figma-source-phase1-2026-06-28/reference-03-create-upload-empty-current-tablet768.png`
- Runtime empty current tablet 768: `docs/qa/figma-runtime-phase1-2026-06-28/runtime-03-create-upload-empty-current-tablet768.png`
- Reference processing current desktop: `docs/qa/figma-source-phase1-2026-06-28/reference-03-create-upload-processing-current-1440x900.png`
- Runtime processing current desktop: `docs/qa/figma-runtime-phase1-2026-06-28/runtime-03-create-upload-processing-current-1440x900.png`
- Reference processing current mobile 390: `docs/qa/figma-source-phase1-2026-06-28/reference-03-create-upload-processing-current-mobile390.png`
- Runtime processing current mobile 390: `docs/qa/figma-runtime-phase1-2026-06-28/runtime-03-create-upload-processing-current-mobile390.png`
- Reference processing current tablet 768: `docs/qa/figma-source-phase1-2026-06-28/reference-03-create-upload-processing-current-tablet768.png`
- Runtime processing current tablet 768: `docs/qa/figma-runtime-phase1-2026-06-28/runtime-03-create-upload-processing-current-tablet768.png`
- Reference ready current desktop: `docs/qa/figma-source-phase1-2026-06-28/reference-03-create-upload-ready-current-1440x900.png`
- Runtime ready current desktop: `docs/qa/figma-runtime-phase1-2026-06-28/runtime-03-create-upload-ready-current-1440x900.png`
- Reference ready current mobile 390: `docs/qa/figma-source-phase1-2026-06-28/reference-03-create-upload-ready-current-mobile390.png`
- Runtime ready current mobile 390: `docs/qa/figma-runtime-phase1-2026-06-28/runtime-03-create-upload-ready-current-mobile390.png`
- Reference ready current tablet 768: `docs/qa/figma-source-phase1-2026-06-28/reference-03-create-upload-ready-current-tablet768.png`
- Runtime ready current tablet 768: `docs/qa/figma-runtime-phase1-2026-06-28/runtime-03-create-upload-ready-current-tablet768.png`
- Runtime creation step 2 desktop: `docs/qa/figma-runtime-phase1-2026-06-28/runtime-03-create-step2-current-1440x900.png`

Creation step 2 is not accepted as a paired `1 в 1` state yet: current Figma `PreUploadScreen.tsx` has no reachable step 2 handler/state after `Сформировать пакет`. The captured V-19 step 2 screenshot is runtime evidence only, pending a source-backed state decision.

### Fullscreen questionnaire

- Reference current desktop: `docs/qa/figma-source-phase1-2026-06-28/reference-04-questionnaire-full-current-1440x900.png`
- Runtime current desktop: `docs/qa/figma-runtime-phase1-2026-06-28/runtime-04-questionnaire-full-current-1440x900.png`
- Runtime mobile proof: `docs/qa/figma-runtime-phase1-2026-06-28/runtime-04-questionnaire-mobile390.png`
- Runtime tablet proof: `docs/qa/figma-runtime-phase1-2026-06-28/runtime-04-questionnaire-tablet768.png`
- Runtime tablet proof: `docs/qa/figma-runtime-phase1-2026-06-28/runtime-04-questionnaire-tablet1024.png`
- Runtime section-switch proof: `docs/qa/figma-runtime-phase1-2026-06-28/runtime-04-questionnaire-section-switch-payment-1440x900.png`

## Components Transferred From Figma Code

### Drawer

Source file: `/tmp/visaflow-figma-source-current/src/app/components/Drawer.tsx`

Target file: `src/modules/submissions/components/FigmaSubmissionDrawer.tsx`

Transferred component structure:

- Drawer shell: overlay, desktop right panel, mobile bottom sheet, close behavior.
- Header zone: id/type metadata, title, status badge, updated time, close button.
- Tabs: `Обзор`, `Анкета`, `Замечания`, `История`, active underline with motion layout id.
- Loading skeleton state.
- Overview tab: route/card panel, document checklist, applicants grid.
- Questionnaire tab: progress header, source-matched inert open-questionnaire CTA, section cards/progress bars.
- Issues tab: warning header, issue cards, blocker badge, action button, empty-success state.
- History tab: vertical timeline and event icons.
- Footer action zone: cancel button, primary status-aware action.

Adaptation:

- Figma mock data is mapped from real V-19 `Submission` via `buildDetail`.
- Business actions use V-19 `getPrimaryAction` and `onAction`; no status transition was moved into visual components.
- Agent detail drawer uses `FigmaSubmissionDrawer`; admin/review/export still use the existing V-19 drawer.

### Creation Upload Step

Source file: `/tmp/visaflow-figma-source-current/src/app/components/PreUploadScreen.tsx`

Target file: `src/modules/submissions/components/CreateSubmissionDrawer.tsx`

Transferred/in-progress structure:

- Fullscreen overlay shell instead of narrow drawer.
- 64px header with back arrow, `Сборка документов`, `Шаг 1/2`.
- Main workspace max width and two-column layout.
- Left column: `Исходные файлы`, Figma explanatory copy, dropzone, dashed inner border, upload icon, `Перетащите файлы`, file-type text, `Выбрать файлы`.
- Right column: `Очередь обработки`, item counter, queue cards, empty queue state, footer action `Ожидание обработки` / `Сформировать пакет`.
- Drag-over state wired to existing file intake.
- Existing V-19 passport extraction flow remains the action source. No fake upload/OCR was added.

Not fully transferred yet:

- Figma source uses mock queue files by default; V-19 runtime starts with an empty real local queue. This is an intentional data deviation, not visual completion. Fake files were not injected into the product runtime.
- Figma `PreUploadScreen` accepts PDF/JPG/PNG visually, while current V-19 passport extraction logic still accepts JPEG/PNG. Copy is Figma-matched, behavior is still V-19 domain-bound.
- Creation ready state has a current paired desktop/mobile/tablet screenshot set, but data differs because source uses mock success files and runtime uses a real local OCR-ready PNG upload.
- Creation flow step 2 has runtime proof only. Current Figma `PreUploadScreen.tsx` exposes `onBack` only and its `Сформировать пакет` button does not navigate to a second creation step. The separate Figma `QuestionnaireScreen.tsx` is a different route/surface, not a proven creation step 2 source state.

### Fullscreen Questionnaire

Source file: `/tmp/visaflow-figma-source-current/src/app/components/QuestionnaireScreen.tsx`

Target file: `src/modules/submissions/components/FigmaQuestionnaireScreen.tsx`

Transferred component structure:

- Fullscreen fixed Figma surface, header, back button, id pill, save state, primary review CTA.
- Animated global progress bar.
- Applicant context bar with real V-19 applicants.
- Section rail: personal, passport, contacts, employment, trip, hotel/invitation, payment.
- Sticky content card with section header, issue banner, field grid, excel mapping pills, invalid/review field states, sticky footer action.
- Dropdown field structure and `AnimatePresence` menu motion.

Adaptation:

- Applicant tabs and screen title are mapped from the active V-19 `Submission`.
- Drawer tab `Анкета` is progress-only. Fullscreen questionnaire opens only from a questionnaire-related error/remark action.
- UI still renders only; submission status/action rules stay in V-19 domain/application code.
- No fake questionnaire save, OCR, upload, export, or review completion was added.

## Colors Transferred

### Drawer colors from Figma source

- Shell/panel: `#111113`.
- Overlay: `bg-black/60` plus `backdrop-blur-sm`.
- Panel border: `border-white/10`.
- Header/footer surfaces: `#111113` with `/95` alpha and `backdrop-blur-md`.
- Card surfaces: `bg-white/[0.02]`, hover `bg-white/[0.04]`, borders `border-white/5`, hover `border-white/10`.
- Text: `text-white`, `text-white/90`, `text-white/70`, `text-white/50`, `text-white/40`, `text-white/30`.
- Primary indigo: `#3a45b4`, hover `#4855d4`, light text `#8fa3ff`.
- Warning/orange states: `orange-500/10`, `orange-500/15`, `orange-500/20`, `text-orange-400`, hover `orange-500/[0.03]`.
- Success/green states: `emerald-500/10`, `emerald-500/20`, `text-emerald-400`, `bg-emerald-500`.
- Progress/neutral: `bg-white/5`, `bg-white/10`, active tab underline `bg-white`.
- Avatar gradient: `from-[#2a2a30] to-[#1a1a20]`.
- Shadows: `shadow-[0_24px_80px_rgba(0,0,0,0.6)]`, orange `rgba(249,115,22,0.2)`, indigo `rgba(58,69,180,0.3)`.

### Creation upload colors from Figma source

- Fullscreen background: `#0e0e10`.
- Header border: `#202124`.
- Header background: `#0e0e10/80` with `backdrop-blur-xl`.
- Dropzone base: `#121214`, hover `#141416`, dragging `#161617`.
- Dropzone border: `#202124`, hover `white/10`, dragging `white/20`.
- Inner dashed border: `border-white/5`.
- Upload icon circle: `#18181b`, border `#2a2a2e`.
- Queue card: `#141416`, border `#202124`, hover border `#2a2a2e`.
- Queue file icon bg: `#1a1a1d`, border `#242529`.
- Counter/tag bg: `#1a1a1d`, border `#242529`.
- Empty icon bg: `#161617`, border `#202124`.
- Primary button: `bg-white text-black`, hover `bg-white/90`.
- Disabled footer action: `#161617`, `text-white/20`, border `#202124`.
- Text opacity scale from source: `text-white/90`, `/80`, `/60`, `/50`, `/40`, `/30`, `/20`.

### Fullscreen questionnaire colors from Figma source

- Screen/header/card base: `#101011`, `#141416`, `#161617`, `#1a1a1d`.
- Borders: `#202124`, `#242529`, `#2e2f34`.
- Field base: `#1e1e21`, invalid `red-500/5`, review `orange-500/5`.
- Primary indigo: `#3a45b4`, hover `#4855d4`.
- Issue banner: `red-500/5`, `red-500/20`, left rail `red-500`.
- Review warning: `orange-500/50`, `text-orange-400`.
- Success/section icons: `emerald-500/25`, `emerald-400`, `emerald-500/5`.

## Addendum: My Actions / Admin Review / Applicants Visual Slice

Date: 2026-06-28.

Updated source inputs:

- Code source for non-column visual: `/Users/user/Downloads/111111111.zip`.
- Column visual source: `/Users/user/Downloads/Premium Dark-First UIколонка.zip`.
- New screenshot references: `/Users/user/Documents/Новые/Мои действия список.png`, `/Users/user/Documents/Новые/Мои действия колонка.png`, `/Users/user/Documents/Новые/Мои Подачи.png`.

Scope decision:

- `Мои действия` and admin `Проверка` now use the same visual component in two states: list and columns.
- Admin data/real review behavior is not part of this visual slice.
- `Заявители и Семьи` is available for visual review, but not declared `100% 1 в 1`.

### Screenshots: New Visual Slice

References:

- My Actions list reference: `docs/qa/figma-source-phase1-2026-06-28/reference-06-my-actions-list-new-2692x1356.png`
- My Actions columns reference: `docs/qa/figma-source-phase1-2026-06-28/reference-06-my-actions-columns-new-2704x1522.png`
- Applicants reference: `docs/qa/figma-source-phase1-2026-06-28/reference-06-applicants-new-2694x1350.png`

Runtime retina proof:

- My Actions list runtime: `docs/qa/figma-runtime-phase1-2026-06-28/runtime-06-my-actions-list-retina-2692x1356.png`
- My Actions columns runtime: `docs/qa/figma-runtime-phase1-2026-06-28/runtime-06-my-actions-columns-retina-2704x1522.png`
- Applicants runtime: `docs/qa/figma-runtime-phase1-2026-06-28/runtime-06-applicants-retina-2694x1350.png`
- Admin Review list runtime: `docs/qa/figma-runtime-phase1-2026-06-28/runtime-06-admin-review-list-retina-2692x1356.png`
- Admin Review columns runtime: `docs/qa/figma-runtime-phase1-2026-06-28/runtime-06-admin-review-columns-retina-2704x1522.png`
- Admin columns mobile runtime: `docs/qa/figma-runtime-phase1-2026-06-28/runtime-06-admin-columns-mobile-390x844.png`
- Admin columns tablet runtime: `docs/qa/figma-runtime-phase1-2026-06-28/runtime-06-admin-columns-tablet-768x1024.png`

Side-by-side proof:

- My Actions list pair: `docs/qa/figma-runtime-phase1-2026-06-28/pairs/pair-06-my-actions-list-retina.png`
- My Actions columns pair: `docs/qa/figma-runtime-phase1-2026-06-28/pairs/pair-06-my-actions-columns-retina.png`
- Applicants pair: `docs/qa/figma-runtime-phase1-2026-06-28/pairs/pair-06-applicants-retina.png`
- Admin Review list pair: `docs/qa/figma-runtime-phase1-2026-06-28/pairs/pair-06-admin-review-list-retina.png`
- Admin Review columns pair: `docs/qa/figma-runtime-phase1-2026-06-28/pairs/pair-06-admin-review-columns-retina.png`

### Components Transferred / Added

Target file: `src/modules/submissions/pages/FigmaVisualScreens.tsx`.

- `FigmaActionQueueVisual`: shared visual surface for agent `Мои действия` and admin `Проверка`.
- `VisualToolbar`: tabs, search, filter, list/columns switcher.
- `ListRow`: long queue row with status dot, submission title, city/applicant block, trip dates, status badge, open action.
- `ColumnCard`: compact column card with status rail, id, applicant count, title, city/dates, blocker/progress footer.
- `FigmaApplicantsVisual`: `Заявители и Семьи` visual surface with family cards and individual cards.

Routing and shell wiring:

- Added `agent-actions` surface.
- Agent landing now opens `Мои действия`.
- Admin `Проверка` renders the same `FigmaActionQueueVisual` component as agent `Мои действия`.
- Agent sidebar order now follows the provided visual references: `Мои действия`, `Сбор документов`, `Заявители / Семьи`, `Файлы / Медиа`, `Замечания`.
- Figma visual surfaces hide the old desktop collection menu button and use the reference-like topbar CTAs.

### Colors Used In New Visual Slice

Taken from the source/reference dark-first system:

- App shell: `#101011`.
- Sidebar/workspace: `#161617`, `#141416`.
- Borders: `#202124`, `#242529`, `#2e2f34`.
- Controls: `#1e1e21`, selected nav `#27272b`.
- Primary CTA: `#3a45b4`, border `#4651c9`, white text.
- Text: `#f3f3f5`, `rgb(255 255 255 / 0.7)`, `/0.5`, `/0.4`.
- Warning/orange: `#fb8c00`, `#fb923c`, `rgb(249 115 22 / 0.1)`.
- Blue/in progress: `#60a5fa`, `rgb(59 130 246 / 0.1)`.
- Indigo/review: `#8fa3ff`, `rgb(58 69 180 / 0.2)`.
- Green/ready: `#10d39a`, `rgb(16 211 154 / 0.1)`.
- Danger/error rail: `#f87171`.

### Motion / Micro-interactions

- Row hover: border/background transition `180ms ease`.
- Row tap: `transform: scale(0.998)`.
- Buttons inherit existing app button hover/tap behavior.
- View switcher is instant state change with stable dimensions.
- Responsive proof includes no horizontal document overflow at desktop, 390px mobile, and 768px tablet.

### Verification

- `npm run typecheck` passed after the visual slice changes.
- Playwright runtime proof against `http://127.0.0.1:5177/` passed with no console warnings/errors.
- Browser proof clicked: `Колонки`, `Заявители / Семьи`, `В админскую зону`, `Колонки` in admin.
- Overflow proof: desktop `0`, mobile `0`, tablet `0`.

### Deviation Log: New Visual Slice

Not accepted as `1 в 1` yet.

Known deviations:

- List toolbar differs from reference: current runtime includes explicit `Список/Колонки` toggle on the list view; reference list screenshot has no visible toggle in that position.
- Column toolbar differs from reference: reference uses `Активная очередь / Архив`; runtime currently keeps the shared action tabs to preserve one component/state switcher.
- Sidebar width/inner spacing is close but not pixel-identical across retina comparison.
- Row vertical position and section spacing are close but not pixel-identical.
- Topbar CTA icon for upload is a simple upload arrow, not the exact cloud upload glyph from the reference.
- Column board cards now match counts/groups better, but exact column widths and horizontal scroll thumb position still differ.
- Applicants surface is visually available and paired, but card spacing/scale are not yet declared `100%`.

Current verdict for this addendum: visual foundation committed with proof; `1 в 1` claim is not made.
- Text scale: `text-white`, `text-white/90`, `/70`, `/60`, `/50`, `/40`, `/30`.

## Icons Transferred

Icon library source: `lucide-react`.

Drawer:

- `X`, `Clock`, `AlertCircle`, `ShieldAlert`, `CheckCircle2`, `FileText`, `Calendar`, `MapPin`, `Edit3`, `User`, `FileDigit`, `Briefcase`, `CreditCard`, `Plane`, `History`, `ImageIcon`, `UploadCloud`.

Creation upload:

- `ArrowLeft`, `UploadCloud`, `FileText`, `ImageIcon`, `CheckCircle2`, `ScanLine`, `Search`.

## Typography / Sizing Transferred

Drawer:

- Panel width `lg:w-[840px]`.
- Desktop panel placement `lg:inset-y-2 lg:right-2`, radius `lg:rounded-2xl`.
- Mobile panel `top-12`, `rounded-t-[28px]`.
- Header title `text-[24px] font-semibold tracking-tight`.
- Metadata `text-[11px] lg:text-xs`, `font-mono`, uppercase tracking.
- Tabs `min-h-[44px]`, `text-[13px]`.
- Footer buttons `h-11`, `text-[14px]`, `rounded-xl`.
- Cards `rounded-xl`, `p-5` / `p-4`, dense spacing from Figma Tailwind classes.
- Scoped Figma surface font stack now matches source Tailwind `font-sans`: `ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"` with base `line-height: 1.5`.

Creation upload:

- Header height `h-[64px]`, px `px-6`, gap `gap-4`.
- Header title `text-[15px] font-medium tracking-wide`.
- Workspace padding `p-6 lg:p-10`, max width `max-w-[1140px]`.
- Grid `lg:grid-cols-[1.3fr_1fr]`, gap `gap-10 lg:gap-12`.
- Section title `text-[20px] font-medium tracking-tight`.
- Body copy `text-[13px] text-white/40 leading-relaxed font-light`.
- Dropzone min height `min-h-[360px]`, radius `rounded-[16px]`, inner radius `rounded-[12px]`.
- Queue card radius `rounded-[12px]`, icon cell `w-9 h-9 rounded-[8px]`.
- Footer action `h-11 rounded-[8px] text-[13px]`.

Fullscreen questionnaire:

- Header `h-[60px] lg:h-16`, back button `w-10 h-10 rounded-[10px]`.
- Workspace padding `p-3 lg:p-6`, max width `max-w-[1240px]`.
- Applicant bar `min-h-[56px] lg:min-h-[62px]`, radius `rounded-xl lg:rounded-2xl`.
- Section rail `lg:w-[188px]`, item `min-h-[50px]`, radius `rounded-[10px]`.
- Content card radius `rounded-xl lg:rounded-2xl`.
- Fields `h-[46px] rounded-[10px] px-3.5 text-[13px]`.
- Issue banner `mx-4 md:mx-6 mt-4 p-4 rounded-xl`.

## Motion Transferred

Drawer:

- Overlay: `initial opacity 0`, `animate opacity 1`, `exit opacity 0`, `duration 0.25`.
- Panel: desktop opens/closes from `x: 100%`; mobile opens/closes from `y: 100%`.
- Panel spring: `type: spring`, `damping: 28`, `stiffness: 240`, `mass: 0.8`.
- Loading skeleton: `animate-pulse`.
- Tab underline: `layoutId="drawerAgentActiveTab"`, spring `bounce: 0.2`, `duration: 0.5`.
- Tab content: `AnimatePresence mode="wait"`, enter `opacity 0 -> 1`, `y 10 -> 0`; exit `opacity 0`, `y -10`; `duration 0.2`.
- Hover/tap states are currently Tailwind transitions copied from Figma (`transition-colors`, `transition-all`), no extra invented animation.

Creation upload:

- Screen enter/exit: `initial { opacity: 0, y: 20 }`, `animate { opacity: 1, y: 0 }`, `exit { opacity: 0, y: 20 }`.
- Screen spring: `type: spring`, `damping: 25`, `stiffness: 250`.
- Dropzone state transition: `transition-all duration-300`.
- Drag state scale: `scale-[1.01]`.
- Queue cards: copied layout/motion intent from Figma queue; V-19 uses static mapped list for real uploads until queue animation parity is finished.
- Processing state: `ScanLine` pulse copied from Figma class intent (`animate-pulse`).

Fullscreen questionnaire:

- Screen enter/exit: `initial { opacity: 0, x: 20 }`, `animate { opacity: 1, x: 0 }`, `exit { opacity: 0, x: -20 }`.
- Screen spring: `type: spring`, `damping: 25`, `stiffness: 250`.
- Global progress bar: `width 0 -> 68%`, `duration 1.2`, `delay 0.1`, `easeOut`, with repeated shimmer `2.5s linear`.
- Dropdown menu: `opacity 0 -> 1`, `y -4 -> 0`, `scale 0.98 -> 1`, `duration 0.15`.
- Hover/focus/active states remain Figma Tailwind classes; V-19 scoped CSS only restores missing Tailwind radius/border variables.

## Deviations

Current deviations that prevent `1 в 1`:

- Creation upload runtime does not start with the same three mock queue files as Figma. This is because V-19 must not fake upload/OCR. Risk: direct first-state screenshot cannot be accepted as `1 в 1` until a real file-selected/processing runtime state is captured against the matching Figma state or the source state is made comparable without fake data.
- Creation upload empty queue is now closer to Figma `PreUploadScreen` empty-state code: no extra V-19 status pill remains and empty min-height was aligned to `min-h-[240px]`.
- Creation upload empty queue v3 has a matched pair: source was driven through the real Figma UI until `0 ITEMS`, runtime opened as a real empty queue. This state is visually close and has no fake file/OCR data injected.
- Creation upload empty queue current desktop/tablet/mobile has a fresh state-matched pair after the latest scoped font/style fixes. Source was driven through the live Figma runtime until `0 ITEMS`; runtime was opened from the real V-19 `Новая подача` action. Desktop, mobile `390`, and tablet `768` show no obvious P0/P1 visible blockers and no horizontal overflow. This accepts only the empty upload/queue state, not the whole creation flow.
- Creation upload processing state now has a fresh state-matched pair for desktop, mobile `390`, and tablet `768`. Source was driven through Figma `PreUploadScreen` to one `PROCESSING` queue item; runtime used a real local PNG upload (`src/assets/visaflow-logo.png`) through the actual V-19 file input, with no fake OCR result injected. No obvious P0/P1 layout blockers remain for this one-item processing state.
- Creation upload processing source needed `Math.random` stabilized during screenshot capture because Figma mock code randomly advances `scanning` to `success` every 800ms. This does not change the source code and is recorded as a capture stabilization only. Risk: low for visual proof, but it means the reference processing state is a controlled live state rather than a naturally persistent source state.
- Creation upload processing data differs: Figma source item is `Bank_Statement_Tinkoff.pdf`, `1.1 MB`, PDF icon; runtime item is the real uploaded local file `visaflow-logo.png`, `59 KB`, image icon. This is an intentional real-data/file-type deviation because V-19 must not inject Figma mock files or fake OCR/upload data.
- Creation upload ready/success state now has a fresh state-matched pair for desktop, mobile `390`, and tablet `768`. Runtime reached the state through a real local OCR-ready PNG upload generated outside the repo (`/tmp/visaflow-valid-mrz-passport.png`), with no fake e2e mock/OCR injection. Source remained the Figma live mock success queue. This accepts only the ready/success visual state under documented real-data differences.
- Creation upload ready/success data differs: Figma source item is mock `Passport_Petrov_I.pdf`; runtime item is the real uploaded OCR-ready image and extracted real MRZ-like fields (`ERIKSSON`, `ANNA KMARTA`, `12.08.1974`). This is intentional because V-19 must prove the state through real local processing instead of injecting Figma mock data.
- Creation upload ready/success had a P1 button-state mismatch: after V-19 extraction became ready, runtime disabled and greyed `Выбрать файлы`, while Figma source keeps `Выбрать файлы` active white. Fixed in `CreateSubmissionDrawer.tsx` by removing the ready-state disabled behavior from the file picker button. Post-fix browser proof: `chooseDisabled: false`, `chooseBg: rgb(255, 255, 255)`, `chooseColor: rgb(0, 0, 0)`, `formPackageDisabled: false`, `overflowX: 0`.
- Creation upload populated/default queue remains a deliberate state mismatch until V-19 has a real selected-file/processing/ready state for each source state. Empty, one-item processing, and ready/success now have separate current evidence; default multi-file Figma mock queue is not injected into V-19.
- Creation step 2 is not accepted as `1 в 1`: current Figma `PreUploadScreen.tsx` does not contain a reachable step 2 state or `Сформировать пакет` navigation. V-19 runtime step 2 exists and was captured, but there is no paired source screenshot/state to compare against. Risk: high if accepted as parity; status: source blocker / pending visual-source decision.
- Fullscreen questionnaire data differs by design: source desktop pair uses `SUB-1042 / Семья Петровых` with 3 visible applicant tabs, runtime uses real V-19 `ПД-1048 / Семья Ивановых` with 4 applicant tabs. This is an unavoidable real-data deviation for the current proof.
- Fullscreen questionnaire had a CSS cascade mismatch after integration: Tailwind `rounded-xl` and `border` utilities rendered as `border-radius: 0` and `border-style: none` in V-19 because scoped Figma surface was missing Tailwind v4 radius/border compatibility variables. Fixed in `src/styles.css` with `.vf-figma-surface` scoped variables and `.border` compatibility. Risk: low and scoped to Figma surfaces.
- Fullscreen questionnaire current desktop screenshot after the CSS fix shows no obvious P0/P1 visual blockers against the source screenshot beyond real data differences. This is not a whole Phase 1 acceptance claim.
- Fullscreen questionnaire section switching intentionally extends the Figma mock behavior: the source `QuestionnaireScreen.tsx` changes the active section and title but keeps one mostly static personal-data form grid. V-19 now keeps the Figma visual shell/field styling while rendering section-specific fields for `Личные данные`, `Паспорт`, `Адрес и контакты`, `Работа / учеба`, `Поездка`, `Отель / Приглашение`, and `Оплата поездки`. Risk: this is a functional adaptation beyond the source mock, but it fixes a real UX defect and keeps business rules out of the component.
- Drawer maps real V-19 data, so labels/counts/dates can differ from Figma mock values. Current paired drawer questionnaire/issues screenshots show no obvious P0/P1 blockers beyond real-data differences and the explicit questionnaire-entry behavior rule.
- Drawer overview responsive proof now has fresh paired mobile `390x844` and tablet `768x900` screenshots after the latest code change. Source and runtime both open the bottom-sheet/tablet drawer overview, show `МАРШРУТ И ПОДАЧА` and `УЧАСТНИКИ`, and have no horizontal overflow. Remaining differences are real data and surrounding V-19 shell/background context; this accepts only the overview responsive state, not all drawer tabs/motion.
- Drawer responsive tabs now have fresh paired source/runtime screenshots for `Анкета`, `Замечания`, and `История` at mobile `390x900` and tablet `768x900`. Browser proof reported `overflowX: 0` and no Playwright console/page errors for all twelve captures. Remaining differences are real V-19 data, surrounding shell/background context, and the explicit one-word issue action copy in runtime.
- Drawer motion declarations are source-matched in runtime for the transferred agent drawer: overlay opacity transition `duration: 0.25`, panel spring `type: spring`, `damping: 28`, `stiffness: 240`, `mass: 0.8`, active tab underline `layoutId="drawerAgentActiveTab"` with `bounce: 0.2`, `duration: 0.5`, and tab content enter/exit `duration: 0.2`. Browser proof also performed `open -> История tab -> close with header X -> reopen overview` on source and runtime. This verifies the controlled open/close/reopen interaction but does not yet cover every hover/tap/focus state.
- All real tabs in the current agent drawer ZIP source now have current paired screenshots: `Обзор`, `Анкета`, `Замечания`, `История`. A fifth tab was requested by the user, but current source `Drawer.tsx` does not contain a fifth agent drawer tab. Do not invent one; if the intended fifth tab is from another surface, it must be matched against that surface's source component separately.
- Drawer issues tab had a P1 typography/reset mismatch: runtime inherited V-19 `Inter`/`line-height: 1.45` and `button { text-align: start; }`, so the issue action label `Исправить в анкете` rendered as one left-biased line instead of the source two centered lines. Fixed by scoping Figma surface font stack/line-height/button text-align to source behavior and wrapping the issue action label to source-like width. Computed proof after fix: font family matches source stack, line-height `19.5px`, text-align `center`, action label rects split into `Исправить в` and `анкете`.
- Drawer admin/review/export surfaces are not transferred; only agent detail drawer is currently using `FigmaSubmissionDrawer`.
- Global shell/sidebar/topbar is not Phase 1 accepted; current scope screenshot includes it only as surrounding context.
- Questionnaire entry intentionally deviates from broad Figma mock wiring: source mock handlers can open fullscreen from the drawer questionnaire CTA/cards and from any issue action. V-19 now follows the explicit user rule: fullscreen questionnaire opens only from an error/remark that concerns the questionnaire. The file remark action `Перезагрузить файл` no longer routes to the questionnaire; no fake upload flow was added.
- Drawer issues action labels intentionally deviate from Figma source copy after explicit screenshot feedback: source uses `Исправить в анкете` and `Перезагрузить файл`, while runtime now uses one-word button labels `Исправить` and `Перезагрузить` to avoid cramped two-line button text. Behavior remains scoped: `Исправить` opens the questionnaire, `Перезагрузить` does not.
- Computer Use local inspection opened Chrome at `http://127.0.0.1:5177/`, observed the local V-19 runtime, and opened the creation screen through the visible `Новая подача` button. The AX/screen state contained `Сборка документов`, `Исходные файлы`, `0 ITEMS`, `Локальная очередь пуста.`, and disabled `Ожидание обработки`. This Computer Use check supports the current creation empty-state visual proof; Playwright remains the authoritative paired screenshot capture.

## Verification

- `npm run typecheck`: passed.
- Runtime server: `http://127.0.0.1:5177/` is listening.
- Source runtime: `http://127.0.0.1:5181/` is listening.
- Screenshot capture: completed with no Playwright console/page errors for the captured creation upload pair.
- Screenshot capture v2: completed with no Playwright console/page errors for `reference-03-create-upload-v2-1440x900.png` and `runtime-03-create-upload-v2-1440x900.png`.
- Screenshot capture empty v3: completed with no Playwright console/page errors for `reference-03-create-upload-empty-v3-1440x900.png` and `runtime-03-create-upload-empty-v3-1440x900.png`. Source DOM was checked before capture: `finalCards: 0`, `0 ITEMS`.
- Screenshot capture empty current desktop: completed with no Playwright page errors or console errors for `reference-03-create-upload-empty-current-1440x900.png` and `runtime-03-create-upload-empty-current-1440x900.png`. Source and runtime were both verified as `0 ITEMS`; runtime overflow proof at `1440x900`: `0px`.
- Screenshot capture empty current responsive: completed with no Playwright page errors or console errors for `mobile390` and `tablet768` source/runtime pairs. All four responsive captures reported `0 ITEMS`, visible empty queue text, and `overflowX: 0`.
- Screenshot capture processing current desktop: completed with no Playwright page errors or console errors for `reference-03-create-upload-processing-current-1440x900.png` and `runtime-03-create-upload-processing-current-1440x900.png`. Source and runtime were both verified as `1 ITEMS`, visible `Processing`, disabled `Ожидание обработки`, and `overflowX: 0`.
- Screenshot capture processing current responsive: completed with no Playwright page errors or console errors for `mobile390` and `tablet768` source/runtime pairs. All four responsive captures reported `1 ITEMS`, visible `Processing`, and `overflowX: 0`.
- Screenshot capture ready current desktop: completed after the file-picker button fix for `reference-03-create-upload-ready-current-1440x900.png` and `runtime-03-create-upload-ready-current-1440x900.png`. Runtime reached ready through actual local file input and local OCR extraction; proof showed active white `Выбрать файлы`, enabled `Сформировать пакет`, no Playwright page/console errors, and `overflowX: 0`.
- Screenshot capture ready current responsive: completed for `mobile390` and `tablet768` source/runtime pairs. All ready-state responsive files exist on disk and were captured after the latest code change.
- Runtime creation step 2 capture: completed for `runtime-03-create-step2-current-1440x900.png` after real OCR-ready upload and `Сформировать пакет`. Browser proof showed `ШАГ 2/2`, panels `ПАСПОРТ`, `ФАЙЛЫ`, `АНКЕТА`, footer actions `Назад`, `Сохранить черновик`, `Создать и открыть`, no console/page errors, and `overflowX: 0`. This is runtime-only proof, not source parity proof.
- Source creation step 2 inventory: inspected `/tmp/visaflow-figma-source-current/src/app/components/PreUploadScreen.tsx`; it exposes only `onBack`, initializes mock files, mutates upload/scanning statuses with a timer, and the `Сформировать пакет` button has no navigation handler. Separate `/tmp/visaflow-figma-source-current/src/app/components/QuestionnaireScreen.tsx` is a separate `CommandCenter` route/surface, not a proven creation step 2.
- Screenshot capture fullscreen questionnaire: completed with no Playwright console/page errors for `reference-04-questionnaire-full-current-1440x900.png` and `runtime-04-questionnaire-full-current-1440x900.png`.
- Fullscreen questionnaire computed style proof after latest fix: issue banner `border: 1px solid rgba(239, 68, 68, 0.2)`, `borderRadius: 14px`; questionnaire input `border: 1px solid rgb(36, 37, 41)`, `borderRadius: 10px`.
- Fullscreen questionnaire responsive runtime proof: `390`, `768`, `1024` viewports captured with no horizontal body overflow; safe interaction proof performed by switching the `Паспорт` section.
- Fullscreen questionnaire section-switch proof: passed after latest fix. Browser proof opened runtime through drawer questionnaire issue, clicked all seven section buttons, and verified each section had distinct expected labels: `Фамилия`/`Дата рождения`, `Номер паспорта`/`Действителен до`, `Домашний адрес`/`Телефон`/`Email`, `Профессия / должность`/`Работодатель / учебное заведение`, `Основная цель поездки`/`Дата въезда`, `Название отеля / приглашающая сторона`/`Адрес размещения`, `Кто оплачивает поездку`/`Средство оплаты`. No Playwright console/page errors; runtime overflow proof at `1440x900`: `body: false`, `document: false`.
- Questionnaire entry contract proof: passed. Browser proof showed `Открыть анкету` CTA has `aria-disabled="true"` and did not open fullscreen even under forced pointer event (`beforeCta: 0`, `afterCta: 0`); questionnaire progress card did not open fullscreen (`afterCard: 0`); file remark `Перезагрузить файл` has `aria-disabled="true"` and did not open fullscreen (`afterFileIssue: 0`); questionnaire remark `Исправить в анкете` remains enabled and opened fullscreen (`afterQuestionnaireIssue: 1`). No console/page errors, no horizontal overflow at `1440x900`.
- Drawer questionnaire/issues paired capture: completed with no Playwright console/page errors for `reference-02-drawer-questionnaire-current-1440x900.png`, `runtime-02-drawer-questionnaire-current-1440x900.png`, `reference-02-drawer-issues-current-1440x900.png`, and `runtime-02-drawer-issues-current-1440x900.png`. Runtime overflow proof at `1440x900`: `body: false`, `document: false`.
- Drawer overview/history paired capture: completed with no Playwright console/page errors for `reference-01-drawer-overview-current-1440x900.png`, `runtime-01-drawer-overview-current-1440x900.png`, `reference-02-drawer-history-current-1440x900.png`, and `runtime-02-drawer-history-current-1440x900.png`. Runtime overflow proof at `1440x900`: `body: false`, `document: false`.
- Drawer close/reopen interaction proof: completed with no Playwright console/page errors for source and runtime at `1440x900`. Proof path: open drawer, switch to `История`, click the visible desktop header close button, confirm dialog count `0`, reopen drawer, confirm overview content, capture `reference-02-drawer-reopened-overview-current-1440x900.png` and `runtime-02-drawer-reopened-overview-current-1440x900.png`. Source close button rect `x: 767, y: 25, w: 40, h: 40`; runtime close button rect `x: 768, y: 24, w: 40, h: 40`; both reported `bodyOverflowX: 0`.
- Drawer overview responsive paired capture: completed after latest code change with no Playwright console/page errors for `reference-01-drawer-overview-current-mobile390.png`, `runtime-01-drawer-overview-current-mobile390.png`, `reference-01-drawer-overview-current-tablet768.png`, and `runtime-01-drawer-overview-current-tablet768.png`. All four captures reported `hasOverview: true`, `hasApplicants: true`, and `overflowX: 0`.
- Drawer questionnaire/issues/history responsive paired capture: completed with no Playwright console/page errors for mobile `390x900` and tablet `768x900`. Captured files: `reference-02-drawer-questionnaire-current-mobile390.png`, `runtime-02-drawer-questionnaire-current-mobile390.png`, `reference-02-drawer-questionnaire-current-tablet768.png`, `runtime-02-drawer-questionnaire-current-tablet768.png`, `reference-02-drawer-issues-current-mobile390.png`, `runtime-02-drawer-issues-current-mobile390.png`, `reference-02-drawer-issues-current-tablet768.png`, `runtime-02-drawer-issues-current-tablet768.png`, `reference-02-drawer-history-current-mobile390.png`, `runtime-02-drawer-history-current-mobile390.png`, `reference-02-drawer-history-current-tablet768.png`, and `runtime-02-drawer-history-current-tablet768.png`. All captures reported `bodyOverflowX: 0`.
- Drawer issues computed style proof after typography fix: `fontFamily` is source Tailwind stack, `lineHeight: 19.5px`, `textAlign: center`, action label wraps into two source-matched text lines.
- Drawer issues one-word button proof: after explicit screenshot feedback, runtime screenshot `runtime-02-drawer-issues-current-1440x900.png` was re-captured with `Исправить` and `Перезагрузить`; Playwright proof showed `Перезагрузить` did not open fullscreen questionnaire (`afterReload: 0`) and `Исправить` opened it (`afterFix: 1`). No console/page errors; no horizontal overflow at `1440x900`.
- Fullscreen questionnaire current pair was re-captured after the latest scoped font reset. Source heading: `Анкета: Семья Петровых`; runtime heading: `Анкета: Семья Ивановых`; no Playwright console/page errors; runtime overflow proof at `1440x900`: `body: false`, `document: false`.
- Computer Use proof: local Chrome runtime was opened and inspected; URL `127.0.0.1:5177` was observed. The creation screen was opened by clicking `Новая подача`; Computer Use observed `Сборка документов`, `0 ITEMS`, empty queue text, and disabled `Ожидание обработки`.

## Next Required Work

1. Continue Drawer convergence with hover/tap/focus state checks for the close button, tabs, issue actions, and footer buttons. The controlled close/reopen interaction is now covered.
2. Capture creation states separately: file waiting/uploading, disabled next after failed/unavailable extraction if reachable, and draft save. Do not inject Figma mock files into V-19.
3. Decide the source contract for creation step 2. Current ZIP `PreUploadScreen.tsx` does not provide a reachable source step 2, so either a missing Figma state/source file must be identified or V-19 step 2 must remain a documented non-accepted deviation.
4. Keep admin `Проверка`, admin work list, and export out of this branch; use `docs/handoff/agent-my-actions-admin-branch-2026-06-28/` for the separate admin branch.

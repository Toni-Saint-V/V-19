# Document Intake Premium UI Convergence

Status: approved direction; implementation remains gated on review of this written specification.

## Objective

Turn the production document Intake app into one coherent, responsive, premium operational product by using the existing agent screen «Мои подачи» as the visual source of truth.

The work improves presentation and interaction quality without changing canonical business behavior, permissions, persistence, API contracts, routes, validation rules, or the submission lifecycle.

## Authoritative sources

The implementation must follow this priority:

1. `docs/release/canonical-domain-contract.md` and non-UI code under `src/modules/submissions` for domain behavior.
2. Current handlers, permissions, persistence boundaries, and executable tests for product behavior.
3. The production «Мои подачи» screen for visual rhythm, density, hierarchy, card composition, filters, progress, and responsive behavior.
4. Existing shared tokens and UI primitives for implementation details.

Screenshots, stale plans, legacy UI, and decorative concepts cannot override those sources.

## Baseline findings

The production UI already has a strong dark operational foundation. The main quality gap is not missing decoration but inconsistent composition and behavior between screens.

Observed issues include:

- too many desktop panels with equal visual weight;
- weak distinction between context, primary work, and supporting information;
- small low-contrast metadata competing with actions;
- long mobile cards and partially clipped horizontal tabs;
- raw technical values such as ISO timestamps appearing in user-facing metadata;
- inconsistent action placement between queues, drawers, forms, and review workspaces;
- disabled and loading states that are structurally correct but visually too quiet;
- screen-specific styling layers that make the product feel assembled from separate concepts.

The «Мои подачи» screen is the strongest existing answer to these problems and should be preserved, not redesigned.

## Experience north star

The product should feel like a calm, status-rich operational workspace:

- dense enough for professional daily work;
- immediately scannable;
- restrained rather than decorative;
- responsive to every meaningful action;
- explicit about progress, blockers, saving, and permissions;
- powerful through contextual tools and progressive disclosure;
- consistent across agent and admin roles.

Premium quality comes from hierarchy, rhythm, responsiveness, and completeness across states. It must not depend on neon, heavy glow, glassmorphism, oversized KPI cards, ornamental gradients, or slow cinematic motion.

## Product grammar

Every major screen follows the same composition:

1. **Context header** — title, concise scope, current identity, and only the most relevant global action.
2. **Focus controls** — compact state tabs, search, filters, or workflow step controls.
3. **Primary work surface** — queue, cards, form, document, or export selection.
4. **Context on demand** — drawer, expandable rail, bottom sheet, or inline detail.
5. **Decision area** — sticky when necessary, with one primary action and clearly quieter secondary actions.

Supporting context must never visually compete with the active task.

## Visual system

### Surfaces

- Reuse the background depth, borders, radii, and restrained elevation already established by «Мои подачи».
- Use one dominant work surface per viewport.
- Prefer borders and tonal separation over additional shadows.
- Keep nested cards to a maximum of two visible levels.
- Remove redundant container framing when grouping is already obvious through spacing.

### Typography

- Keep the current font stack.
- Use a small, repeatable hierarchy: page title, section title, body, label, metadata.
- Keep primary names and next actions readable at a glance.
- De-emphasize IDs, timestamps, agent names, and audit metadata without dropping below accessible contrast.
- Format user-facing dates and times consistently; never expose raw ISO timestamps.

### Color

- Keep the restrained graphite foundation and current violet brand accent.
- Reserve the brand accent for focus, selection, navigation, and the primary safe action.
- Use semantic colors only for states that require interpretation: critical, warning, success, blocked.
- Do not encode meaning by color alone.

### Density

- Preserve the professional density of «Мои подачи».
- Desktop rows remain compact and comparable.
- Mobile cards reveal the next action and the most important blocker in the first viewport.
- Secondary history, explanations, and AI context move behind disclosure when they are not required for the current decision.

## Interaction system

All interactive elements need clear idle, hover, pressed, focus-visible, selected, loading, disabled, success, and error states.

Motion rules:

- hover and press feedback: 120–160 ms;
- panels, menus, and drawers: 160–220 ms;
- no scale animation that changes measured control size;
- no layout motion that hides a status transition;
- `prefers-reduced-motion` removes non-essential movement;
- async actions expose progress immediately and prevent double submission.

The interface may feel advanced through existing command palette access, contextual actions, progressive disclosure, sticky decision controls, and precise live feedback. No new feature or automation is introduced solely to make the UI look advanced.

## Surface convergence

### Agent workspace

«Мои подачи» remains structurally intact and becomes the reference implementation.

Adjacent agent surfaces adopt its:

- page header rhythm;
- state tabs and filter treatment;
- row/card hierarchy;
- progress and blocker presentation;
- action placement;
- contextual panel behavior;
- mobile information economy.

«Мои действия» should read as a focused task view of the same product, not as a separate command-center concept.

### New submission and questionnaire

The creation flow keeps its existing steps, save behavior, validation, family rules, and handlers.

Presentation converges through:

- consistent progress and section navigation;
- predictable sticky save/continue actions;
- clear saved, saving, dirty, validation, and retry feedback;
- calm field grouping;
- compact helper text;
- mobile controls with stable 44 px minimum targets;
- no decorative container that competes with the active form section.

### Admin review queue

The review queue adopts the «Мои подачи» list grammar:

- one compact queue header;
- one coherent filter layer;
- comparable rows/cards;
- priority, blocker, progress, and next action in a fixed reading order;
- supporting AI/SLA context collapsed or moved to an on-demand panel;
- no equal-weight competition between summary cards, queue, and context rail.

### Review workspace

The review workspace keeps all fail-closed media and decision behavior.

The visual hierarchy becomes:

1. applicant and submission context;
2. original document;
3. current review state and blockers;
4. extracted fields or corrections;
5. decision actions.

Desktop uses a balanced document-and-review layout. Mobile uses a full-screen workspace with one active region at a time and a safe sticky action area that never obscures content.

Unavailable, rejected, loading, retry, and permission-denied media states receive the same structural quality as successful media.

### Export

Export keeps its existing selection, readiness, Excel, commit, and fail-closed behavior.

It adopts the same list grammar and separates:

- selection;
- readiness and blockers;
- package summary;
- final export action.

Warnings and blockers must be readable before the action area and must not rely only on disabled buttons.

### Users, settings, and access

These lower-frequency surfaces inherit the same shell, typography, fields, status badges, and action hierarchy. They do not receive unique decorative concepts.

Authentication and access-request semantics remain unchanged.

## Responsive contract

### Desktop: 1440 × 900

- persistent operational navigation;
- one dominant work surface;
- optional contextual rail only when it adds decision value;
- no accidental horizontal overflow;
- sticky actions do not cover the final content row.

### Tablet: 768 × 1024

- navigation collapses without losing labels or task identity;
- two-column layouts reduce to one primary surface plus on-demand context;
- filters wrap or collapse deliberately;
- drawers and document workspaces use the available width without desktop-only fixed tracks.

### Mobile: 390 × 844

- compact top bar with clear screen identity;
- horizontally scrollable tabs have visible continuation and reachable end items;
- critical status, name, progress, and next action appear before secondary metadata;
- cards avoid duplicated explanation;
- drawers become full-screen workspaces;
- sticky footer actions reserve content space;
- every interactive target is at least 44 × 44 px;
- no clipped text, raw timestamps, or horizontal page overflow.

The implementation should also remain usable at 320 px without introducing a separate design.

## State and accessibility contract

The visual convergence must cover:

- initial loading and skeleton;
- background refresh;
- empty and filtered-empty;
- success and saved;
- validation error;
- network or persistence error with retry;
- stale/concurrency conflict;
- permission denied;
- media unavailable or rejected;
- disabled action with visible reason;
- selected, active, hover, and keyboard focus.

Accessibility requirements:

- semantic landmarks and heading order remain valid;
- icon-only controls keep accessible names;
- focus-visible is clearly distinguishable;
- keyboard access is preserved;
- status changes use existing live-region semantics where applicable;
- contrast is not reduced for visual subtlety;
- motion respects reduced-motion preferences.

## Data and behavior boundary

Presentation may consume existing derived state, but it must not invent new domain state.

The implementation must preserve:

- canonical statuses and transitions;
- agent/admin ownership and permissions;
- media requirements and fail-closed behavior;
- issue lifecycle;
- persistence and canonical readback;
- export readiness and commit semantics;
- existing handlers, payloads, and concurrency guards.

Formatting a timestamp for display is allowed. Changing the stored value or persistence schema is not.

## Implementation boundaries

Likely visual owners include:

- `src/modules/submissions/pages/OperationsScreens.tsx`;
- `src/components/AdminWorkspace.tsx`;
- `src/components/ReviewWorkspace.tsx`;
- `src/components/AdminExportScreen.tsx`;
- `src/components/ApplicantsScreen.tsx`;
- `src/components/PreUploadScreen.tsx`;
- `src/modules/submissions/components/FigmaQuestionnaireScreen.tsx`;
- existing files under `src/shared/ui/`.

The implementation plan must narrow this list into independently verifiable slices. It must avoid a broad rewrite of `App.tsx` and avoid adding another global styling layer.

No dependency, lockfile, routing, API, storage, auth, RLS, migration, Supabase, CI, or deployment change belongs to this design.

## Delivery slices

The design should be implemented in this order:

1. Shared interaction and visual rules plus admin review queue.
2. Review workspace and export decision surfaces.
3. Agent actions, new submission, and questionnaire convergence.
4. Users, settings, access, and cross-product state cleanup.

Each slice must be browser-verifiable and leave the product usable if later slices are deferred.

## Verification

Every implementation slice requires:

- changed-file allowlist;
- `git diff --check`;
- dependency and lockfile confirmation;
- Prettier, ESLint, and TypeScript checks for the changed surface;
- focused unit/integration coverage;
- production build;
- deterministic browser clicks at `390×844`, `768×1024`, and `1440×900`;
- overflow, keyboard focus, loading/error/disabled, and reduced-motion checks;
- console and failed-network inspection;
- independent VERIFIER review;
- independent RED-TEAM review.

Browser proof must follow the real UI flow. Test-runner success alone is not a visual verdict.

## Acceptance criteria

The design is successful when:

- users can identify the active task and next action immediately;
- agent and admin surfaces clearly belong to one product;
- «Мои подачи» remains recognizably intact;
- supporting context no longer competes with primary work;
- mobile first-viewport economy materially improves;
- all important states feel intentionally designed;
- the UI remains fast, accessible, and fail-closed;
- no canonical behavior or production boundary changes;
- no unrelated WIP is captured;
- all mandatory verification and independent review gates pass.

## Risks and mitigations

- **Global CSS collision:** use narrowly scoped selectors, review cascade order, and avoid adding another baseline file.
- **Desktop improvement causing mobile regression:** verify each slice at all required viewports before widening scope.
- **Visual polish masking blockers:** keep reasons visible and preserve fail-closed copy.
- **Motion affecting measured control size:** avoid scale transitions and verify 44 px targets.
- **Large-scope drift:** stop after each delivery slice and revise the task contract before expanding the allowlist.
- **Production evidence confusion:** localhost proves presentation only; deployment and live Supabase readiness remain separate, explicitly approved activities.

## Rollback

Each implementation slice should be a separate logical commit. Rollback is a normal revert of the affected slice. No migration, data repair, or production cleanup is required by this design.

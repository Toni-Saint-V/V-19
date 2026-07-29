# Document Intake Premium UI Convergence

Status: direction approved; specification hardening is in review; implementation remains gated on review of the final written specification.

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

The reference baseline is the production code at
`c4b1a6b6cd5e717a553ae1815e99350c49f0a975`. The implementation must capture
fresh «Мои подачи» reference evidence from that baseline before changing shared
presentation rules. A later screenshot is evidence only when its exact code SHA,
viewport, role, and UI state are recorded.

The active reference render chain is
`CommandCenter -> ApplicantsScreen`, rooted under
`.ops-shell.surface-agent-submissions`. `AgentSubmissionsScreen` in
`OperationsScreens.tsx` is not assumed to be active merely because it has a
matching label; the runtime import/render chain wins.

The reference profile must capture:

- populated family and single collections;
- loading, empty, filtered-empty, and error states;
- a submission with progress and a submission with a blocker;
- open and closed contextual detail;
- desktop, tablet, and mobile navigation;
- keyboard focus and reduced-motion behavior.

The implementation preserves the reference shell, hierarchy, density,
information order, controls, surface depth, state semantics, and responsive
behavior. It does not copy agent-specific labels, family grouping, progress
fields, or card anatomy onto a surface where those concepts do not exist.

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

## «Мои подачи» parity contract

Convergence means adopting the same product grammar, not copying one layout
blindly onto incompatible tasks. Every production surface must match the
reference in these observable dimensions:

1. **Shell** — the same navigation depth, page-header hierarchy, content width,
   responsive collapse behavior, focus treatment, and identity placement.
2. **Controls** — the same search, filter, state-tab, button, select, badge, and
   reset-action hierarchy.
3. **Work items** — the same reading order: identity, status, progress or
   blocker, supporting metadata, then next action.
4. **Surfaces** — the same graphite depth, border strength, radius family,
   spacing rhythm, and restrained elevation.
5. **Semantics** — the same visual meaning for active, selected, critical,
   warning, blocked, success, loading, and disabled states.
6. **Disclosure** — supporting context moves to the same drawer, sheet, rail,
   or inline-detail pattern according to viewport.
7. **Responsiveness** — the same mobile information economy, reachable tabs,
   safe sticky actions, and 44 × 44 px minimum interaction targets.
8. **Feedback** — the same immediate pressed/loading response, success/error
   acknowledgement, retry affordance, and double-submit protection.

Parity is not proven by using the same background color or radius. It is proven
only when the complete screen matrix below passes a fresh side-by-side mismatch
review against «Мои подачи».

## Complete production surface inventory

The phrase “all screens” includes every row below. A surface may reuse another
surface's primitives, but it cannot be omitted from review or completion
evidence.

| Area            | Production surface or state                                                                                                              | Primary owner                                                                                                  |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Shared          | Authenticated app shell, persistent navigation, mobile menu, page header, profile actions                                                | `src/shared/ui/v19-design-system.tsx`, `src/components/CommandCenter.tsx`, `src/components/AdminWorkspace.tsx` |
| Shared          | Command palette and navigation search                                                                                                    | `src/modules/submissions/components/CommandPalette.tsx`                                                        |
| Shared          | Workspace loading, empty, blocked, retry, reconnect, sign-out, and fatal-error states                                                    | `src/App.tsx`, `src/components/AppCrashBoundary.tsx`, `src/components/WorkspaceSurface.tsx`                    |
| Access          | Register, login, pending approval, invite setup, password reset, and recovery                                                            | `src/components/AccessGate.tsx`                                                                                |
| Agent           | «Мои действия» queue, inline context, empty, filtered-empty, and error states                                                            | `src/components/CommandCenter.tsx`, `src/modules/submissions/components/AgentActionsCommandCockpit.tsx`        |
| Agent reference | «Мои подачи» family/single collections, filters, progress, empty, loading, and error states                                              | `src/components/CommandCenter.tsx`, `src/components/ApplicantsScreen.tsx`                                      |
| Agent           | Returned-package handoff and download states adjacent to «Мои подачи»                                                                    | `src/components/AgentReturnPackagesPanel.tsx`                                                                  |
| Agent           | Submission detail drawer, issue focus, files, history, and actions                                                                       | `src/components/Drawer.tsx`                                                                                    |
| Agent           | «Новая подача» for single/family intake, file assignment, OCR/manual fallback, persistence states                                        | `src/components/PreUploadScreen.tsx`                                                                           |
| Agent           | Questionnaire navigation, applicant switching, validation, save, save-and-exit, correction, and read-only states                         | `src/components/QuestionnaireScreen.tsx`, `src/modules/submissions/components/FigmaQuestionnaireScreen.tsx`    |
| Agent           | Agent settings and interface preferences                                                                                                 | `src/components/AdminSystemSettingsScreen.tsx`                                                                 |
| Admin           | Review queue, filters, metrics, AI/SLA context, loading, empty, and filtered-empty states                                                | `src/components/AdminScreens.tsx`                                                                              |
| Admin           | Full review/passport workspace, applicant switching, media states, field review, correction closing, and decision actions                | `src/components/ReviewWorkspace.tsx`                                                                           |
| Admin           | Remark/issue dialog and nested decision states                                                                                           | `src/components/RemarkForm.tsx`, `src/components/AdminWorkspace.tsx`                                           |
| Admin           | Export queue, selection, readiness, blockers, preview, history, preparation, download, and commit states                                 | `src/components/AdminExportScreen.tsx`                                                                         |
| Admin           | User/access-request queue, approval/rejection, status, empty, and error states                                                           | `src/components/AdminUsersAccessScreen.tsx`                                                                    |
| Admin           | System settings                                                                                                                          | `src/components/AdminSystemSettingsScreen.tsx`                                                                 |
| PWA             | Install assistant, supported/unsupported, installed, and install-prompt states                                                           | `src/pwa/bootstrap.tsx`, `src/pwa/PwaInstallAssistant.tsx`                                                     |
| Cross-product   | Drawers, dialogs, sheets, menus, selects, toasts, skeletons, empty states, retry states, and disabled reasons used by the surfaces above | Existing owners under `src/components` and `src/shared/ui`                                                     |

The implementation plan must validate each path against current imports before
editing. If an owner has moved, the plan records the current canonical owner
instead of adding a parallel component.

Inventory-to-slice mapping is fixed:

- Slice 1: shared authenticated shell, command palette, review queue, and their
  overlays/states;
- Slice 2: review workspace, remark dialog, export, and their overlays/states;
- Slice 3: agent actions, «Мои подачи», returned packages, submission drawer,
  new submission, questionnaire, and their overlays/states;
- Slice 4: access modes, runtime/failure states, users, settings, PWA assistant,
  and cross-product primitive cleanup.

Unless a platform limitation makes a viewport inapplicable, every inventory row
requires desktop, tablet, and mobile proof. `N/A` is allowed only with a written
reason and reviewer acceptance; it is never inferred from absence.

Explicitly excluded from the “all screens” completion count are components that
fresh source tracing proves are not mounted by the production entry points,
legacy/prototype-only visual screens, test fixtures, developer-only harnesses,
and generated evidence. Every exclusion is recorded by exact file and source
trace in the completion matrix; a name such as `Legacy`, `Figma`, or `Visual`
does not by itself prove exclusion.

At the reference SHA, `src/modules/submissions/pages/OperationsScreens.tsx` and
`src/modules/submissions/pages/SettingsScreen.tsx` have no production import
path from `CommandCenter` or `AdminWorkspace`; their similarly named exports are
excluded unless a later source trace proves they became active.

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

## Measurable UX rules

Every surface must satisfy these rules where the domain state makes them
applicable:

- the page purpose and current role are identifiable without opening a menu;
- one primary next action is visible in the first viewport or in a reserved
  sticky decision area;
- disabled primary actions expose a readable reason before or adjacent to the
  action;
- repeated explanations are collapsed into one authoritative message;
- state tabs and filters are keyboard reachable and every option is reachable
  at the locked viewport;
- dates and times use one user-facing formatter and never expose raw provider
  or ISO values;
- async actions acknowledge input immediately, remain idempotent, and end in a
  visible success, error, retry, or conflict state;
- the page itself has no unintended horizontal overflow;
- fixed or sticky regions reserve enough space that the final content and
  validation message remain reachable;
- critical identity, status, blocker, progress, and next action are not
  truncated into ambiguity;
- supporting AI, audit, SLA, and history content never displaces the primary
  work from the first viewport;
- keyboard focus remains visible and returns to the initiating control when a
  modal, drawer, or full-screen workspace closes.

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

### Shared runtime and failure surfaces

Loading, empty workspace, activation blocked, reconnect, sign-out, crash,
invite, recovery, and permission failures are part of the product, not
temporary engineering screens. They use the same typography, surface depth,
button hierarchy, focus treatment, and responsive spacing while preserving
their existing fail-closed behavior and safe error copy.

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

WCAG A/AA automated checks must stay green for every primary agent/admin
surface. Text and control contrast cannot be weakened merely to make metadata
look subtle. Native zoom, text wrapping, and keyboard navigation must remain
usable without hidden content.

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

The complete surface inventory defines coverage, not a blanket file allowlist.
Before each slice, the task contract names the exact component, stylesheet, and
test files it owns.

Shared styling must reuse the current token and convergence architecture:

- `src/shared/ui/tokens/index.css` for existing tokens only;
- `src/shared/ui/v19-design-system.tsx` for existing shared composition;
- `src/shared/ui/operational-screen-convergence.css` for narrowly scoped
  cross-screen convergence rules;
- existing surface-specific styles when the rule is not truly shared.

`src/shared/ui/system.css` and `src/shared/ui/visual-baseline.css` are high-risk
cascade hotspots. Editing either requires an explicit selector inventory,
before/after computed-style checks, and browser proof for every affected
surface. The implementation must not append an unbounded “final override”
section or add another global baseline file.

New global element selectors and new global ARIA-attribute selectors are
forbidden. A surface-specific rule must be scoped under its stable surface root.
A shared-token change requires an enumerated consumer list and browser proof for
every consumer before that slice can pass.

The implementation plan must narrow changes into independently verifiable
slices. It must avoid a broad rewrite of `App.tsx`, preserve the authenticated
lazy boundary in `WorkspaceSurface.tsx`, and avoid duplicating an existing
component merely to obtain a different visual treatment.

No dependency, lockfile, routing, API, storage, auth, RLS, migration, Supabase, CI, or deployment change belongs to this design.

### Implementation task contract

The implementation starts from this locked identity:

- base: `c4b1a6b6cd5e717a553ae1815e99350c49f0a975`;
- worktree:
  `/Users/user/Documents/V-19/.runtime/worktrees/document-intake-prod-premium-20260729`;
- branch: `codex/document-intake-premium-convergence-20260730`;
- writer: `/root`, the only writer;
- external evidence:
  `/Users/user/.codex/visualizations/2026/07/29/019faf01-411f-7400-ac14-196b66991a9e/document-intake-premium`;
- reviewers: one read-only VERIFIER and one read-only RED-TEAM reviewer after
  the writer stops each final slice diff;
- forbidden scope: domain behavior, API, persistence, auth/RLS, migrations,
  Supabase, CI, dependencies, lockfiles, push, deploy, and production mutation.

Before the first product mutation in each slice, the writer publishes the exact
component/CSS/test file allowlist, exact verification commands, known baseline
failures, rollback dependency, and unresolved assumptions. The allowlist cannot
expand silently.

## Delivery slices

The design should be implemented in this order:

1. Shared interaction and visual rules plus admin review queue.
2. Review workspace and export decision surfaces.
3. Agent actions, new submission, and questionnaire convergence.
4. Users, settings, access, and cross-product state cleanup.

Each slice must be browser-verifiable and leave the product usable if later slices are deferred.

Deferral is allowed only as an interim engineering state. The user objective
remains incomplete until all four slices and every row in the production
surface inventory have final evidence.

## Completion matrix

The implementation maintains a reader-facing matrix with one row per production
surface and these required columns:

| Evidence column  | Required proof                                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| Owner            | Exact React and CSS files changed or explicitly confirmed already conforming                       |
| Reference parity | Fresh mismatch review against «Мои подачи» at the same SHA and viewport                            |
| Desktop          | Real interaction proof at `1440×900`                                                               |
| Tablet           | Real interaction proof at `768×1024`                                                               |
| Mobile           | Real interaction proof at `390×844`, plus overflow smoke at 320 px                                 |
| States           | Relevant loading, empty, filtered-empty, error, retry, disabled, success, and permission states    |
| Accessibility    | Keyboard focus, accessible names, reduced motion, and automated WCAG A/AA result                   |
| Runtime          | Console errors, failed requests, and action result                                                 |
| Persistence      | For a mutating flow: action, canonical effect/readback, reload, and role isolation when applicable |
| Verdict          | `PASS`, `BLOCKED`, or `FAIL` with evidence location                                                |

An “already conforming” row still requires fresh browser evidence. A component
name, passing unit test, or shared CSS import is not parity proof.

## State reproduction matrix

The implementation plan binds each applicable cell to an existing deterministic
fixture or adds a presentation-only test fixture without changing production
behavior.

| State                            | Required setup and UI action                                               | Expected proof                                                              |
| -------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Loading/background refresh       | Existing delayed workspace or screen fixture; open or refresh the surface  | Stable skeleton/progress, preserved layout, correct live announcement       |
| Empty                            | Canonical empty dataset for the role; open the surface                     | One intentional empty state with a relevant safe action                     |
| Filtered-empty                   | Populated dataset; apply a real filter/search yielding zero rows           | Filter context stays visible and reset returns the original list            |
| Persistence/network error        | Existing bridge/repository rejection fixture; trigger the real save/action | Safe error copy, no false success, retry remains available                  |
| Stale/concurrency conflict       | Existing stale revision fixture; trigger the guarded mutation              | Conflict is visible, canonical data wins, no silent overwrite               |
| Permission denied/role isolation | Existing foreign-owner or wrong-role fixture; navigate through the real UI | Protected content/action stays unavailable with safe explanation            |
| Media unavailable/rejected       | Existing unavailable and rejected media fixtures; open review workspace    | Fail-closed media surface, retry/replacement guidance, no false readiness   |
| Disabled with reason             | Existing incomplete or blocked submission; open decision surface           | Disabled action and readable blocker are both visible                       |
| Success/saved                    | Perform the real safe action in the permitted test target                  | Immediate progress, one success result, canonical readback where applicable |
| Access modes                     | Deterministic login/register/pending/invite/reset/recovery setup           | Every mode shares the reference grammar and remains keyboard safe           |
| Reduced motion                   | Emulate reduced motion; open menu, drawer, and workspace transition        | Non-essential motion removed; state changes remain visible                  |
| Fatal/runtime failure            | Existing crash/runtime-state fixture                                       | Branded safe recovery surface without raw diagnostics                       |

The implementation plan names the exact test, fixture, role, action, assertion,
viewport, and evidence artifact for every applicable row. `N/A` requires a
written domain or platform reason.

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

The verification ledger must include exact commands and exit codes for at
least:

- `PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run format:check`;
- `PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run typecheck`;
- `PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run lint`;
- focused ESLint and focused unit/integration tests for each slice;
- `PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run test`;
- `PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run build`;
- `PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run verify:performance`;
- `PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run verify:agent-screen-runtime`;
- `PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run verify:v19-boundary`;
- `PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run verify:v19-ui-proof`;
- `PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run verify:repo-hygiene`;
- `git diff --check`;
- dependency and lockfile diff inspection.

If a command cannot run, its row is `BLOCKED`; it is not silently replaced by a
narrower check.

Performance acceptance additionally requires:

- no dependency or initial-workspace bundle growth outside the existing
  `verify:performance` budget;
- no new interaction-attributable long task over 50 ms during filter changes,
  drawer/sheet opening, or workspace switching in the bounded browser sample;
- no unexpected layout shift after the initial state settles;
- no animation exceeding the motion contract or delaying an actionable state;
- preserved lazy loading of the authenticated workspace.

## Acceptance criteria

The design is successful when:

- users can identify the active task and next action immediately;
- agent and admin surfaces clearly belong to one product;
- every row in the complete production surface inventory has a final `PASS`;
- «Мои подачи» remains recognizably intact;
- supporting context no longer competes with primary work;
- mobile first-viewport economy materially improves;
- all important states feel intentionally designed;
- the UI remains fast, accessible, and fail-closed;
- no canonical behavior or production boundary changes;
- no unrelated WIP is captured;
- all mandatory verification and independent review gates pass.

Completion cannot be claimed from a subset of screens, a shared token change,
or green automated tests without the completed screen/evidence matrix.

## Risks and mitigations

- **Global CSS collision:** use narrowly scoped selectors, review cascade order, and avoid adding another baseline file.
- **Desktop improvement causing mobile regression:** verify each slice at all required viewports before widening scope.
- **Visual polish masking blockers:** keep reasons visible and preserve fail-closed copy.
- **Motion affecting measured control size:** avoid scale transitions and verify 44 px targets.
- **Large-scope drift:** stop after each delivery slice and revise the task contract before expanding the allowlist.
- **False “all screens” completion:** keep the surface matrix exhaustive and
  leave the goal active while any row lacks final evidence.
- **Production evidence confusion:** localhost proves presentation only; deployment and live Supabase readiness remain separate, explicitly approved activities.

## Rollback

Each implementation slice should be a separate logical commit. Slice 1 is a
declared dependency when a later slice consumes its shared rule or primitive;
all other dependencies are recorded in the completion matrix.

Rollback proceeds in reverse dependency order. A partial revert is allowed only
when no retained slice consumes the reverted rule. After rollback, the affected
format, typecheck, focused tests, build, viewport, accessibility, and
computed-style gates are rerun. No migration, data repair, or production cleanup
is required by this design.

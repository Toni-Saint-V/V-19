# VisaFlow Visual Lock

This file is the visual source of truth for VisaFlow UI work. Future UI changes must preserve the current VisaFlow UI soul and obey this lock before using visual references.

## Priority Order

1. V-19 product/domain scope
2. Agent Screen System references
3. Current VisaFlow visual lock
4. Existing implementation only when it does not conflict with the three agent references

## Agent Screen System

The V-19 agent screens have one source of truth. The reference set is closed:

- `docs/qa/v19-agent-inbox-reference-2026-06-20.png`
- `docs/qa/v19-agent-actions-reference-2026-06-20.png`
- `docs/qa/v19-agent-submissions-reference-2026-06-20.png`

These three screens define the agent design system for:

- visual tokens;
- component sizes;
- spacing rhythm;
- typography scale;
- allowed controls;
- layout behavior;
- scroll rules.

Anything outside these three files is not an agent visual/layout source unless product approval explicitly promotes it into this section.

If a component, state, size, color role, layout pattern, or interaction is not present on one of these three screens, it must not be added to the agent design system without separate product approval.

This section governs agent collection screens only. Admin review, export, drawer internals, auth, persistence, and business logic must not inherit agent-only layout rules unless they are separately reviewed.

### Agent System Role

This system is a constraint system, not an open UI kit.

It is effective only when it prevents drift:

- new agent screens reuse one of the three locked screen archetypes;
- existing primitives carry the anatomy;
- tokens describe visible reference elements;
- content switches inside the fixed shell instead of extending the page;
- verification proves the viewport contract.

Token availability is not product approval. Component availability is not product approval. A developer may use a token or primitive only when the target element maps back to one of the three reference screens.

### Developer Decision Gate

Before changing or adding any agent collection UI, answer these questions in the implementation notes or PR description:

1. Which one reference screen contains this pattern?
2. Which existing primitive owns the structure?
3. Which `--v19-*` tokens own the size, spacing, and color?
4. Where can overflow happen if the content grows?
5. Which proof confirms no document scroll and no horizontal page overflow?

If any answer is missing, stop. The change is not ready for implementation.

Do not solve missing answers by inventing a new pattern. Either remap the work to an existing archetype or get product approval and update this file first.

### Agent Read Order

For agent UI work, read only the smallest source set that can answer the current change.

Start here, in this order:

1. `docs/VISAFLOW_VISUAL_LOCK.md`
2. The relevant current agent reference screenshot:
   - `docs/qa/v19-agent-inbox-reference-2026-06-20.png`
   - `docs/qa/v19-agent-actions-reference-2026-06-20.png`
   - `docs/qa/v19-agent-submissions-reference-2026-06-20.png`
3. The current implementation files for the touched surface:
   - `src/shared/ui/tokens.css`
   - `src/styles.css`
   - `src/modules/submissions/pages/OperationsScreens.tsx`
   - `src/modules/submissions/components/CollectionPrimitives.tsx`
   - `src/modules/submissions/components/OperationalNavigation.tsx`

Stop after this set when it answers the question.

Do not read files outside the closed reference set to make agent UI decisions. Use outside artifacts only when the user explicitly asks for that artifact or product approval promotes it into this section.

If the three reference screens and the current implementation disagree, prefer the reference screens for visual/layout decisions, then reconcile through shared tokens and primitives. Do not resolve disagreement by averaging across unrelated artifacts.

### Agent Screen Archetypes

Every agent collection screen must choose exactly one archetype:

- Inbox stream: event rows, read/unread state, group labels, search, toolbar tools, right summary.
- Action queue: action rows, priority filters, deadline/load summary, right context panel.
- Submission register: status tabs, city select, table-like rows, readiness, right summary, primary CTA when present.

No fourth archetype exists in the agent system. A screen that cannot fit one of these archetypes is outside the system until product approval updates the reference set.

### Agent Construction Order

Build agent screens in this order:

1. Pick one archetype and one primary reference screen.
2. Use the fixed shell: rail, compact topbar, central workspace, optional right panel.
3. Put state changes into tabs, filters, search, sort, panel toggle, row selection, or drawer.
4. Compose rows from `CollectionRow`, `ActionRow`, or `SubmissionCollectionRow`.
5. Put detail work in a drawer over the current screen.
6. Add or reuse tokens only for dimensions and visual roles visible in the reference set.
7. Verify no document scroll, no horizontal page overflow, and zero console errors.

### Agent Layout Contract

- The app shell fills one viewport.
- The left rail is persistent on desktop and may collapse at narrower widths.
- The topbar is compact and fixed within the workspace rhythm.
- The center area changes content through tabs, filters, sorting, search, and row selection.
- The right context panel is optional and may be hidden without changing the route.
- Detail work opens in a drawer over the current screen.
- Agent screens must not use document/page scroll.
- Lists may scroll only inside their own list container when the number of rows exceeds the viewport budget.
- Drawer bodies may scroll because they are overlay detail surfaces.
- Horizontal overflow is allowed only for tabs or toolbar controls on narrow widths.
- If a screen does not fit, reduce density through the allowed responsive moves before adding scroll: collapse the rail, hide the right panel, condense toolbar controls, or move detail into the drawer.
- Page scroll is never the fallback for short agent screens.

### Agent Overflow Acceptance

The no-scroll contract is measurable:

- `document.scrollingElement.scrollHeight <= document.scrollingElement.clientHeight`
- `document.documentElement.scrollWidth <= document.documentElement.clientWidth`

Allowed overflow:

- vertical scroll inside a long list container;
- vertical scroll inside drawer body;
- horizontal overflow inside tabs or toolbar only on narrow widths.

Not allowed:

- page-level vertical scroll for normal agent screens;
- page-level horizontal overflow;
- hidden content that requires page scroll to reach;
- expanding detail sections that push the page below the viewport.

### Agent Allowed Components

Agent collection screens must use the shared primitives that define the locked anatomy:

- `CollectionToolbar`
- `StateTabs`
- `SummaryFilterTabs`
- `ToolbarIconButton`
- `ContextPanel`
- `CollectionRow`
- `ActionRow`
- `SubmissionCollectionRow`
- `SearchBar`
- `Select`
- `Button`
- `Badge`

Do not create a parallel agent UI kit. Add a new primitive only when the three reference screens require a pattern that cannot be represented by the existing primitives.

### Agent Token Contract

Agent-facing dimensions and colors must come from `src/shared/ui/tokens.css`.

Required token groups:

- shell and workspace sizing;
- topbar height and CTA sizing;
- screen max width and grid gap;
- context panel width and offset;
- toolbar, search, filter, icon button, and tab sizing;
- row height, row grid, row padding, row action sizing;
- chip height, padding, typography, and status tones.

Do not add raw visual values in agent component JSX or one-off CSS unless they are immediately promoted into a named `--v19-*` token.

New or changed agent tokens must satisfy all of these:

- reference screen source is named;
- owning primitive or selector is named;
- token name describes role, not taste;
- token does not leak into admin, export, auth, or unrelated workspace selectors;
- before/after screenshot or browser proof confirms the token did not create page scroll.

Existing token values are not a menu of visual options. They are contracts for the specific roles listed above.

### Agent Forbidden Additions

Agent screens must not add:

- landing-page sections;
- decorative cards or nested cards;
- new metric walls;
- hidden primary navigation;
- country selection;
- CRM, People, Families, Groups, AI checker, board view, saved filters, or analytics dashboard surfaces;
- new colors, gradients, glows, glassmorphism, or shadow language;
- full-page scroll as a way to fit content.

### Agent Definition Of Done

An agent UI change is done only when all checks pass:

- the changed screen maps to one of the three archetypes;
- no new source image is introduced as agent reference;
- no new primitive is added unless this file is updated first;
- no raw visual value appears in touched agent JSX;
- document vertical and horizontal scroll checks pass in browser proof;
- `npm run verify:agent-screen-system` passes;
- relevant typecheck, lint, build, and browser proof are fresh.

If the work changes tokens, layout, rows, tabs, toolbar, right panel, or scroll behavior, save after screenshots in `docs/qa/`.

## Locked Visual System

### Dark Surfaces

- app background: `#070809`
- shell/container background: `#0b0c0e`
- main panel background: `#0e1013`
- row background: `#15171b`
- row hover: `#191c21`
- control/search/icon background: `#1a1c21`
- subtle border: `rgba(255,255,255,0.08)`
- strong border: `rgba(255,255,255,0.13)`

### Text

- primary: `#f3f4f6`
- secondary: `#b2b6bf`
- muted: `#8f949e`

### Indigo Accent And Focus

- accent: `#6874e8`
- accent hover: `#7580ee`
- accent active: `#5964d6`
- focus: `#7c84ff`

### Neutral Selected State

- selected bg: `#25272d`
- selected hover bg: `#2a2d34`
- selected border: `rgba(255,255,255,0.11)`
- selected text: `#f3f4f6`
- nav selected bg: `#25272d`
- nav selected border: `rgba(255,255,255,0.12)`
- row selected bg: `#181b21`
- row selected border: `rgba(104,116,232,0.72)`

### Status Colors

Red:

- base: `#ff5c67`
- hover: `#ff6b75`
- active: `#e94d59`
- foreground: `#18080a`
- soft bg: `rgba(255,92,103,0.13)`
- soft border: `rgba(255,92,103,0.48)`
- soft text: `#ff8a92`

Yellow:

- base: `#f4b840`
- hover: `#ffc653`
- active: `#d99b25`
- foreground: `#171006`
- soft bg: `rgba(244,184,64,0.13)`
- soft border: `rgba(244,184,64,0.48)`
- soft text: `#f4b840`

Green:

- base: `#45d082`
- hover: `#58df93`
- active: `#30b86a`
- foreground: `#06150c`
- soft bg: `rgba(69,208,130,0.13)`
- soft border: `rgba(69,208,130,0.48)`
- soft text: `#59df94`

## Visual Rules

Preserve:

- current dark SaaS atmosphere
- current density
- current typography feel
- current radii
- current spacing
- current calm graphite containers
- current neutral gray selected states
- current red/yellow/green status feeling

Do not:

- make the background lighter
- make the background pure black
- replace selected gray with indigo
- replace selected gray with amber/yellow
- add glow
- add glassmorphism
- add gradients
- add heavy shadows
- use Tailwind red/yellow/green directly in components
- pick new colors manually
- change opacity of whole rows for draft/disabled states
- introduce a new visual language

Apply locked tokens to:

- app background
- main shell/container
- panels
- rows
- row hover
- controls
- search fields
- icon buttons
- sidebar selected state
- selected filters/views
- active row border
- status dots
- status chips
- blocker chips
- returned chips
- warning/video/files chips
- accepted/ready/success chips
- destructive button "Закрыть без сохранения"

## Semantic Mapping

- returned / blocker / destructive = red
- video / files / pending / warning = yellow
- accepted / ready / success / complete = green
- selected navigation/views = neutral gray
- focus outline = indigo
- active row border may use subtle indigo

## Implementation Rules

- Use the existing styling system.
- Centralize variables/tokens.
- Replace hardcoded colors with variables.
- Keep layout unchanged.
- Keep component structure unchanged unless required for token reuse.
- Keep this file as the visual source of truth for all UI changes.

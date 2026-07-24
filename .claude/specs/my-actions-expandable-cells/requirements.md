# My Actions Expandable Cells Requirements

## Scope

Refine the active Agent `Мои действия` queue into a calm single-open accordion
without changing submission domain logic, filters, sorting, search, Drawer
destinations, persistence, APIs, permissions, or canonical action guards.

`Идентификационный номер` in this spec means the existing public submission ID
returned by `submissionPublicId(...)`, for example `VF-1051`.

## US-1: Open and close exactly one cell

**As an** agent
**I want** each action cell to expand and collapse in place
**So that** I can inspect one task without losing my position in the queue.

### Acceptance criteria

1. WHEN the queue first renders
   THE SYSTEM SHALL render every action cell collapsed.
2. WHEN the agent activates a collapsed cell
   THE SYSTEM SHALL expand that cell in its existing list position.
3. WHEN the agent activates the expanded cell again
   THE SYSTEM SHALL collapse it.
4. WHEN the agent activates a different cell
   THE SYSTEM SHALL collapse the current cell and expand the requested cell in
   one state update.
5. WHILE the queue is visible
   THE SYSTEM SHALL render no more than one expanded cell.
6. WHEN expansion changes
   THE SYSTEM SHALL preserve keyboard focus, list order, and queue scroll
   position without translating or reordering neighboring cells.

## US-2: Keep collapsed cells minimal

**As an** agent
**I want** the queue to foreground identity and the next step
**So that** I can scan work without duplicate questionnaire or submission data.

### Acceptance criteria

1. WHILE a cell is collapsed
   THE SYSTEM SHALL show the applicant name and public submission ID in the
   left identity group.
2. WHILE a cell is collapsed
   THE SYSTEM SHALL show the next-action label, compact status, and disclosure
   affordance.
3. WHILE a cell is collapsed
   THE SYSTEM SHALL NOT show separate visible columns for rank, priority, city,
   trip dates, or duplicated problem copy.
4. WHEN a source value is long
   THE SYSTEM SHALL truncate secondary text without hiding the applicant name,
   public ID, or disclosure state.
5. THE SYSTEM SHALL preserve the full task context in accessible labels.

## US-3: Align the accordion by viewport meaning

**As an** agent
**I want** the same cells to remain orderly at every supported width
**So that** expansion feels intentional rather than jumpy.

### Acceptance criteria

1. WHILE the viewport is at least 768 px wide
   THE SYSTEM SHALL align identity, next action, and status horizontally.
2. WHILE the viewport is below 768 px
   THE SYSTEM SHALL stack identity, next action, and status vertically inside
   the same expandable card.
3. WHILE an expanded detail is visible at desktop width
   THE SYSTEM SHALL use the existing horizontal detail composition.
4. WHILE an expanded detail is visible below 768 px
   THE SYSTEM SHALL stack its sections vertically and keep controls at least
   44x44 px.
5. THE SYSTEM SHALL NOT create page-level horizontal overflow at 320, 375, 390,
   430, 768, 1024, 1280, or 1440 px.

## US-4: Preserve interaction and accessibility contracts

**As a** keyboard or assistive-technology user
**I want** disclosure state to be explicit
**So that** the queue remains operable without visual guessing.

### Acceptance criteria

1. WHEN a cell changes state
   THE SYSTEM SHALL update `aria-expanded` and `aria-controls`.
2. WHEN a detail is rendered
   THE SYSTEM SHALL expose it as a labelled region adjacent to its controlling
   cell.
3. WHILE reduced motion is requested
   THE SYSTEM SHALL remove non-essential reveal animation.
4. THE SYSTEM SHALL preserve existing primary and secondary action routing,
   disabled reasons, and interaction IDs.

## Out of scope

- New submission data, statuses, filters, routes, API calls, or persistence.
- Questionnaire, Drawer, `Мои подачи`, Admin, and Settings redesign.
- Changes to `system.css`, `visual-baseline.css`, or global tokens.
- Commit, push, deploy, or production mutation.

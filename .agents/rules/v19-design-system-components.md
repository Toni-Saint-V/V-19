# V-19 Design System Components

Before styling a V-19 screen locally, check whether the element belongs here. If it repeats on more than one screen, it must be a tokenized shared component first, then screens pass only data, state, and handlers.

## Current Component Sources

- Tokens and visual rules: `src/shared/ui/visual-baseline.css`
- Shared React primitives: `src/shared/ui/primitives.tsx`
- V-19 visual components: `src/shared/ui/v19-design-system.tsx`
- Existing collection primitives pending consolidation: `src/modules/submissions/components/CollectionPrimitives.tsx`
- Existing rail primitives pending consolidation: `src/modules/submissions/components/RightRailPrimitives.tsx`

## Design-System Inventory

- Tokens: colors, type roles, spacing, sizes, radius, borders, shadows, motion, z-index, responsive constraints.
- Buttons: primary CTA, secondary/dark, ghost, icon, disabled/loading/pressed/focus states.
- Status: status dot, status badge, count badge, file/status tag, semantic tones.
- Navigation: sidebar, mobile bottom nav, nav item, active state, user/profile block.
- Header: title + hamburger, drawer header, drawer tabs, screen header actions.
- Toolbar: tabs row, city selector, search, filter/sort/context tools, two-row adaptive layout.
- Cells/cards: long list cell, action board card, applicant/family card, export applicant card, file applicant section.
- Panels: right rail sections, drawer footer actions, panel/card shell.
- Forms/data controls: input, select, toggle, segmented control, progress row, progress bar, checklist item.
- Content blocks: document package checklist, questionnaire progress section, history timeline, empty state, section title/count header.

## Non-Negotiable Rule

No duplicate local UI implementations for those elements. A screen may map domain data to component props, but it must not redefine the visual shell, status treatment, spacing, typography, or motion locally.

---
paths:
  - "src/modules/submissions/**"
  - "src/shared/ui/system.css"
  - "docs/qa/**"
  - ".agents/reference-screens/**"
---

# V-19 Screen Wireframes

Use this rule before implementing or approving any V-19 design-system screen. It fixes the intended frame, spacing, and layout behavior for the current screen-by-screen migration.

Tracked screenshot files were removed from the repository during cleanup. Any
`.agents/reference-screens/*.png` or `docs/qa/*.png` names below are historical
labels only, not required local files. Use the textual wireframes here plus
fresh runtime screenshots captured for the current task.

## Agent Execution Protocol

For every implementation task using this rule, the agent must follow this order:

1. Identify the exact requested screen and route.
2. Inspect existing implementation before editing.
3. Identify shared shell/sidebar source.
4. Identify existing tokens/components that should be reused.
5. Capture or document baseline state when runtime is available.
6. Make the smallest safe change that satisfies the requested screen.
7. Do not edit unrelated screens.
8. Run typecheck/build/lint when available.
9. Run browser verification when runtime is available.
10. Capture fresh desktop and mobile screenshots.
11. Complete the required final report.

Skipping implementation inspection before editing is a `High` finding.

Changing files outside the requested screen/shared component dependency path must be justified in the final report.

## Global Frame

- Desktop target: `1440x900` first, then `1366x768`, `1564x844`, `1728x932`.
- Mobile target: logical `390x844` first, then `360x740`, `430x932`, `320x568`.
- Desktop shell: outer inset `8px`, left rail `260-288px`, topbar `60-64px`, page padding `24px`, content max `1460px`.
- Mobile shell: safe margin `20px`, major section gap `16px`, compact internal gap `10-12px`, card padding `18-22px`, card radius `16-20px`, pill radius `999px`.
- Dark surface stack: app canvas -> shell -> panel -> row/card -> control. Use existing `--vf-*` tokens; do not copy orange/espresso secondary-reference palette.
- Empty lower canvas is allowed only when the populated stage is intentionally bounded and balanced. It is not allowed when the screen looks unfinished.
- Every screen needs fresh desktop and mobile runtime screenshots before
  `premium-design-ux-review` approval. Keep those captures task-scoped and do
  not commit screenshot artifacts unless explicitly requested.

## Desktop App Shell

```text
┌ app inset 8 ───────────────────────────────────────────────────────────────┐
│ ┌ sidebar 260-288 ┐┌ main minmax(0,1fr) ┐[optional context rail 336-420] │
│ │ brand 48        ││ topbar 60-64       │                                │
│ │ search 40       ││ page padding 24    │                                │
│ │ nav item 42     ││ content max 1460   │                                │
│ │ bottom user 50  ││ stage/list/cards   │                                │
│ └─────────────────┘└───────────────────┘                                │
└────────────────────────────────────────────────────────────────────────────┘
```

Sidebar brand and nav labels must be readable. Collapsed labels on desktop are a `High` finding.

## Mobile App Shell

```text
┌ 390 viewport ───────────────────────┐
│ topbar 60-72, title + icon actions  │
│ segmented tabs 48-56                │
│ search/filter row 48                │
│ section label 32                    │
│ cards: 100-150 high, 20px gutters   │
│ sticky/fixed primary action if flow │
└─────────────────────────────────────┘
```

Mobile is not a squeezed desktop. Tables become cards, desktop sidebars become overlays, and secondary metadata hides before title/status/CTA.

## Agent Actions / My Actions

References:
- `.agents/reference-screens/agent-actions-desktop-list.png`
- `.agents/reference-screens/agent-actions-mobile-list.png`

Desktop wireframe:

```text
top row: h1 left, primary create/upload actions right
toolbar: tabs min 48 + search 370-420 + filter 56
section label: 32
row: min-height 96-132, grid [dot 16][title 1.2fr][city .8fr][dates .8fr][status 180][cta 132]
row padding: 24 x 24, gap 24, radius 18-20
```

Mobile wireframe:

```text
topbar 72: title + plus/icon action
tabs: full width, 3 equal-ish segments, 48-56 high
search row: input flex + filter 52
card: margin 20, padding 18, radius 18, min-height 134
card order: dot/id -> title -> city/applicants -> full-width CTA 56
```

Acceptance: search/tabs/filter/open work; no horizontal overflow; CTA remains reachable; status is visible without relying on color alone.

## Mobile Sidebar

Reference: `.agents/reference-screens/mobile-sidebar-open.png`

Wireframe:

```text
overlay: full viewport scrim, left sheet width 336-360 max 92vw
sheet padding: 20 top, 10-12 nav gutters
brand row: 48, search 50, nav group label 24, nav item 44
bottom: divider + workspace switch 50 + user row 44
```

Acceptance: close target visible, current item highlighted, counts/badges aligned right, background app inert.

## Submission Drawer / Overview

Reference: `.agents/reference-screens/submission-drawer-mobile-overview.png`

Desktop drawer width: `840-900px`; mobile: full viewport sheet with rounded top only when launched over page.

Wireframe:

```text
header: 156-190 desktop, 250-290 mobile including metadata
tabs: 48-56, horizontal scroll on mobile
body: padding 24 desktop / 20 mobile
overview cards: 2-column desktop, 1-column mobile
footer: sticky 72-88 desktop, safe-area aware mobile
```

Acceptance: tabs switch without layout jump; footer never covers content; issue count/status visible.

## Questionnaire Edit

References:
- `.agents/reference-screens/questionnaire-mobile-personal-data.png`
- `.agents/reference-screens/questionnaire-mobile-passport-data.png`

Mobile wireframe:

```text
topbar: 64, back + title + Done button 84x44
progress bar: 3-4 high
applicant tabs: horizontal, card height 56
section tabs: horizontal cards, height 82
form panel: margin 20, radius 16, header 132, body fields
issue callout: padding 20, left accent 4, icon 40, min-height 128
field: label 28, input 56, cell chip right under input
```

Acceptance: focused input is visible above keyboard risk area; long labels wrap; section tabs do not page-overflow; `Done` remains visible.

## Issues / Corrections

Reference: `.agents/reference-screens/submission-drawer-desktop-issues.png`

Wireframe:

```text
drawer shell: full-width modal style or drawer, max 1240, inset 16
header: title/status/tabs, close 58
body padding: 48 desktop / 20 mobile
issue summary row: title left, count pill right
issue card: min-height 150, icon 56, content flex, CTA 264x60
footer: sticky 96-124, helper text left, secondary + primary actions right
```

Acceptance: each issue has exact target CTA; sending corrections is disabled/blocked until required fixes are done by domain state, not by visual state only.

## Admin Review / Проверка

References:
- `.agents/reference-screens/admin-review-desktop-cards.png`
- `.agents/reference-screens/admin-review-desktop-list.png`
- `.agents/reference-screens/admin-review-desktop-columns.png`

Card mode wireframe:

```text
sidebar 260, topbar 64
page padding 24, header block 72
summary/count pill right
card grid: repeat(auto-fit, minmax(360, 1fr)), gap 24
review card: padding 28, radius 18, min-height 260, actions row 56
```

List mode wireframe:

```text
toolbar: tabs + search + filter/sort/view buttons
row grid: [dot 16][title min 260][city 160][dates 160][status 180][cta 132]
row min-height 90-104, gap 24, padding 22-24
```

Columns mode wireframe:

```text
board grid: 4 columns, gap 24, each minmax(260,1fr)
column header 44, count 36
card min-height 132, padding 18, status strip left for blockers
```

Acceptance: desktop brand/nav readable; list and board modes both fit without clipped columns; mobile converts to single-column queue cards.

## Create Submission

References:
- `.agents/reference-screens/create-submission-desktop-single.png`
- `.agents/reference-screens/create-submission-desktop-family.png`

Wireframe:

```text
modal/sheet max: 1240-1280 wide, inset 20, radius 20
header: 120, title + meta + close 58
steps: 56 row, two segments, active left
body desktop: grid [upload panel 1fr][applicant/family panel 420-460], gap 24
upload panel min-height 760, centered upload stack
right panel: segmented type switch 56, cards 86, shared answers 120
footer: sticky 88, helper left, save + next right
```

Mobile fallback: one column, right panel moves below upload or into step section, footer actions full width.

Acceptance: single/family mode changes visible requirements without breaking draft; disabled Next has clear reason.

## Applicants And Families

Reference: `.agents/reference-screens/applicants-families-desktop.png`

Wireframe:

```text
topbar/header: h1 left, Add profile 260x60 right
toolbar: tabs 510 max left, search 380 + filter 60 right
section heading: 32
family card grid: 2 columns at desktop, card 480-520 x 520, padding 32
single profile grid: auto-fit minmax(330,1fr), card 360 x 220
```

Mobile fallback: cards single column; family members remain readable rows with status icon at trailing edge.

Acceptance: family vs single profiles are visually distinct; package counts and readiness remain visible.

## Export / Excel Preview

References:
- `.agents/reference-screens/export-desktop-context-rail.png`
- `.agents/reference-screens/export-table-wireframe-crop.png`

Wireframe:

```text
shell: sidebar 288 + main + context rail 360-420
main topbar 64, intro line 56, tabs 56, search/action row 56
table container: radius 16, header 64, row 72, checkbox 32
bulk bar: 72, sticky below table
context rail: topbar 104, cards padding 24, preview image 100% width
```

Mobile fallback: table becomes selected export cards or inner horizontal scroll; context rail becomes drawer/sheet.

Acceptance: export blocked reasons are visible; selected count syncs; table does not create page-level horizontal overflow.

## Settings

No new best screenshot was provided in this batch. Until a better reference exists, keep the approved V-19 dark settings pattern:

```text
desktop: sidebar + topbar + settings sections in 2-column cards
mobile: grouped single-column sections, toggles/inputs full width
spacing: page 24 desktop / 20 mobile, card padding 20-24
```

Approval still requires fresh settings screenshots and `premium-design-ux-review` before moving past that screen in the migration order.

## Invalid Evidence

Do not use cropped, blank, loading, wrong-window, or partial screenshots for approval. Known invalid example from the user batch: `Снимок экрана 2026-06-29 в 04.36.47.png`.

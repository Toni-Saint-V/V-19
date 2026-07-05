# 02 Extract Reference

Extract values before implementation.

## Evidence Levels

Use these labels:

- `Runtime`: measured from browser computed styles or DOM metrics;
- `Source`: found in reference HTML/CSS/TSX/built assets;
- `Screenshot`: measured from screenshot because source/runtime value is not directly available;
- `Unverified`: observed but not safe for implementation;
- `Blocked`: cannot proceed without missing reference/runtime.

Do not implement from `Unverified` or `Blocked`.

## Required Extraction Tables

Create a compact table in notes, PR body, or final report:

```text
Token/Pattern | Reference value | Evidence | Source note | Target destination
```

Minimum extraction set:

- app/page/panel/control colors;
- border colors and selected states;
- status tones;
- font family and role sizes;
- line heights and weights;
- mobile/desktop page padding;
- gaps;
- radius;
- topbar/sidebar sizes;
- row/card heights;
- button/control heights;
- progress/status treatment;
- bottom sheet/dock/drawer dimensions;
- motion durations/easing;
- breakpoints.

## Raw Value Rule

Raw reference values go first to:

- `src/shared/ui/visual-baseline.css`
- or the current imported shared token layer if this project has consolidated tokens there.

Screens must consume `var(...)`, shared classes, or shared components.

Repeated raw values in screen files are findings unless there is a stated one-off reason.

# VisaFlow V-19 UI Tokens

This folder is the only owner for reusable raw visual values.

Keep these here:
- color, status, text, and border values
- type roles, font weights, line heights, and tracking
- spacing, layout sizes, control sizes, and breakpoints when they are token values
- radii, shadows, opacity, z-index, and motion timing

CSS rules and React screens should consume these through `var(...)` or shared UI primitives instead of introducing local raw visual values.

---
paths:
  - "src/shared/ui/system.css"
  - "src/modules/submissions/**"
  - "docs/VISAFLOW_VISUAL_LOCK.md"
  - "docs/qa/**"
---

# Visual Lock Tokens

- Preserve the existing dark graphite VisaFlow UI. Premium means tighter execution, not redesign.
- Canonical colors, states, spacing, radii, and typography must come from `src/shared/ui/system.css`.
- Required locked `--vf-*` tokens are verified by `npm run verify:agent-screen-system`.
- Do not introduce random colors, glow, gradients, glassmorphism, heavy shadows, or a new visual language.
- Use neutral gray for selected navigation/views, indigo only for focus and subtle active row borders, red/yellow/green only for mapped status states.
- UI/token changes require fresh runtime proof and screenshots under `docs/qa/` when feasible.

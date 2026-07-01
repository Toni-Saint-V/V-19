---
paths:
  - "src/shared/ui/system.css"
  - "src/modules/submissions/**"
  - "docs/qa/**"
---

# UI Live And Figma Review Rule

- For V-19 UI/design-system work, the agent must compare the changed screen against the live running UI before claiming progress.
- For reference-driven UI work, the agent must inspect the best available Figma/design-system variants and use them as mechanics references for controls, density, spacing, states, rows, drawers, and responsive behavior.
- Do not copy product semantics, brand decoration, gradients, neon, or unrelated visual language from donor design systems.
- If Figma or the source design-system reference is unavailable, record the blocker and continue only against the approved V-19 visual contract; do not claim exact reference fidelity.
- Each screen must be reviewed mobile and desktop, with fresh screenshots/runtime proof when feasible.
- Live UI proof fallback order: use Computer Use when direct local app inspection is needed; if Computer Use is unavailable or unsuitable, use Chrome; if Chrome is unavailable or unsuitable, use the in-app Browser; if all UI-control paths fail, record the blocker and do not claim visual approval.
- Do not move to the next screen until the current screen receives `premium-design-ux-review` approval or the remaining blocker is explicitly documented and accepted.
- Use at least four relevant skills for V-19 screen-by-screen design-system implementation; read and apply them to the current slice, not as a checklist.
- For every reviewed screen, write the full reviewer analysis in a durable artifact before approval. The artifact must include the `premium-design-ux-review` breakdown in writing: findings or explicit no-findings statement, observation, impact, location, smallest safe fix, acceptance signal, open questions/assumptions, residual risk, and the fix task or validation task. Approval-only summaries are not enough.

# VisaFlow V-19 Visual Lock

The reference set is closed.

This system is a constraint system, not an open UI kit.

## Closed Reference Set

Anything outside these two files is not an agent visual/layout source:

- `docs/qa/v19-agent-actions-reference-2026-06-20.png`
- `docs/qa/v19-agent-submissions-reference-2026-06-20.png`

Do not read files outside the closed reference set when making agent visual or layout decisions.

When implementation and memory disagree, prefer the reference screens for visual/layout decisions.

No separate event-only archetype exists in the agent system.

### Developer Decision Gate

Before changing agent surfaces, confirm the change preserves the closed set:

- Work events stay in `Мои действия`.
- Agent actions stay as the first approved top-level surface.
- Submissions stay in the submissions archetype.
- Selected states remain neutral graphite, not accent-colored.
- Status colors remain semantic red, yellow, and green.

### Agent Definition Of Done

- Agent navigation keeps only the approved primary surfaces.
- The actions view remains the first agent surface.
- Keyboard, focus, contrast, and mobile layout pass current V-19 checks.
- Screenshots used as evidence are current and stored under `docs/qa/`.

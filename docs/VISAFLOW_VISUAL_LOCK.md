# VisaFlow V-19 Visual Lock

The reference set is closed.

This system is a constraint system, not an open UI kit.

## Closed Reference Set

Anything outside the closed reference files is not an agent visual/layout source:

- `docs/qa/2026-07-05-agent-unfinished-final/desktop-1440-actions.png`
- `docs/qa/2026-07-05-agent-unfinished-final/desktop-1440-submissions.png`
- `docs/qa/2026-07-05-agent-unfinished-final/mobile-390-actions.png`
- `docs/qa/2026-07-05-agent-unfinished-final/mobile-390-submissions.png`

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

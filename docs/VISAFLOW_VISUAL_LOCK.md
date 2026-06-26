# VisaFlow V-19 Visual Lock

The reference set is closed.

This system is a constraint system, not an open UI kit.

## Closed Reference Set

Anything outside these three files is not an agent visual/layout source:

- `docs/qa/v19-agent-inbox-reference-2026-06-20.png`
- `docs/qa/v19-agent-actions-reference-2026-06-20.png`
- `docs/qa/v19-agent-submissions-reference-2026-06-20.png`

Do not read files outside the closed reference set when making agent visual or layout decisions.

When implementation and memory disagree, prefer the reference screens for visual/layout decisions.

No fourth archetype exists in the agent system.

### Developer Decision Gate

Before changing agent surfaces, confirm the change preserves the closed set:

- Inbox events stay in the inbox archetype.
- Agent actions stay as an internal inbox tab, not a top-level surface.
- Submissions stay in the submissions archetype.
- Selected states remain neutral graphite, not accent-colored.
- Status colors remain semantic red, yellow, and green.

### Agent Definition Of Done

- Agent navigation keeps only the approved primary surfaces.
- The actions view remains internal to inbox.
- Keyboard, focus, contrast, and mobile layout pass current V-19 checks.
- Screenshots used as evidence are current and stored under `docs/qa/`.

# -ui-go: Premium UI Shortcut

Use this when the user says `-ui-go`.

Goal: produce premium UI quickly without losing architecture, performance, or proof.

Steps:

1. Inspect the target screen and existing design system.
2. Build a standalone HTML prototype in `docs/prototypes/` unless this is a tiny UI fix.
3. Inspect prototype desktop and mobile with Browser or Computer Use.
4. Implement the approved direction in React/Vite with reusable components.
5. Keep animations lightweight: transform/opacity, short duration, reduced-motion safe.
6. Run `npm run verify`.
7. Run `npm run test:e2e`.
8. Capture visual evidence for changed screens.
9. Run `-ux` review if architecture, trust, or release quality changed.

Rules:

- No marketing filler screens unless explicitly requested.
- Do not call it premium without visual proof.
- Do not fake AI/OCR/uploads/results/official verification in prototype or React copy.
- Keep performance budget passing.

Output:

Prototype:
What changed:
Verification:
QA findings:
Screenshots:
Readiness delta:
Remaining risks:
Next highest-impact task:
Verdict:

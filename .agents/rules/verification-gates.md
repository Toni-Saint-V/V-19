---
paths:
  - "scripts/**"
  - "tests/**"
  - "src/**"
  - "docs/qa/**"
---

# Verification Gates

- Never claim completion without fresh evidence.
- Prefer the smallest proof that supports the claim: targeted script/test, typecheck, build, then browser/runtime proof for UI.
- Normal code gate: `npm run typecheck` plus targeted tests.
- Runtime/package gate: `npm run build`.
- Visual/token gate: `npm run verify:agent-screen-system`.
- V-19 boundary gate: `npm run verify:v19-boundary`.
- UI proof gate: `npm run verify:v19-ui-proof`.
- UI/browser acceptance must traverse the full claimed flow through real browser controls. Save fresh screenshots from the latest code in a new isolated per-run folder under `docs/qa/`; include a manifest describing each step and a strict mobile/desktop UI assessment. Unit/component tests may support the result but cannot replace click-driven browser evidence.
- Performance gate: `npm run verify:performance`.
- If a required gate is not run or fails, report the exact reason and do not call the surface production-ready.

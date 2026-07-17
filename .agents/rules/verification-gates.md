---
paths:
  - "scripts/**"
  - "tests/**"
  - "src/**"
---

# Verification Gates

- Never claim completion without fresh evidence.
- Prefer the smallest proof that supports the claim: targeted script/test, typecheck, build, then browser/runtime proof for UI.
- Normal code gate: `npm run typecheck` plus targeted tests.
- Runtime/package gate: `npm run build`.
- Visual/token gate: `npm run verify:agent-screen-system`.
- V-19 boundary gate: `npm run verify:v19-boundary`.
- UI proof gate: `npm run verify:v19-ui-proof`.
- UI/browser acceptance must traverse the full claimed flow through real browser controls. Optional screenshots and manifests are ephemeral and must be written outside the repository through `V19_TEST_ARTIFACTS_DIR` or the operating-system temporary directory. Unit/component tests may support the result but cannot replace click-driven browser evidence.
- Performance gate: `npm run verify:performance`.
- If a required gate is not run or fails, report the exact reason and do not call the surface production-ready.

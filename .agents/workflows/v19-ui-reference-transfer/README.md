# V-19 ZIP/HTML Reference UI Transfer Workflow

Use this workflow only for UI transfer tasks where a ZIP/HTML/reference app is the visual source truth and the target is this V-19 project.

Do not use this workflow for backend, business logic, Supabase, OCR, export data, migrations, release, auth, tests-only, or documentation-only tasks unless they directly support the UI transfer.

## Read Order

Read and follow these files in order:

1. `00-route.md`
2. `01-preflight.md`
3. `02-extract-reference.md`
4. `03-token-component-map.md`
5. `04-screen-transfer-loop.md`
6. `05-verification-and-report.md`

The copy-ready implementation prompt lives in:

- `PROMPT.md`

## Operating Principle

Reference first. Tokens second. Shared components third. Screen migration fourth. Browser proof last.

Do not implement from memory or taste. Implement from measured reference evidence.

## Success Shape

The final target project should match the reference for the verified scope while preserving V-19 business logic, domain behavior, permissions, routes, data, statuses, and release boundaries.

Allowed verdicts:

- `1:1 transfer complete for verified scope`
- `partial: verified slice complete`
- `not ready: visual deltas/blockers remain`
- `blocked: missing reference or target runtime`

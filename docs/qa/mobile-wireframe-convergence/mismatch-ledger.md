# Mobile Wireframe Convergence Ledger

## Scope

- Agent mobile `Мои действия`
- Agent mobile `Мои подачи`
- Shared mobile menu width/overlay
- Mobile submission drawer composition
- Admin review/export mobile overflow safeguards

## Current target

- `reference/agent-actions-perfect-top-cell.png` is the accepted target for the top area and action card composition.
- Cards use full-width mobile rows with ID, compact status, title, city/date stack, and chevron.

## Final proof

- `final-target/agent-actions-current-390.png`
- `final-target/agent-action-drawer-current-390.png`
- `final-target/agent-submissions-current-390.png`
- `final-target/agent-submission-drawer-current-390.png`
- `final-target/agent-current-drawer-proof.json`

## Strict quality critic notes

- `FigmaSubmissionDrawer` was inspected as an alternate drawer candidate.
- It matches the desired visual direction better, but it is a simplified visual drawer and does not preserve all existing file/issue/admin actions from `SubmissionDrawer`.
- Replacing the production drawer with it would be a functional regression, so it was not wired into the app.

## Verification

- `git diff --check`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- Runtime mobile proof at 390px: no document/body horizontal overflow; drawer footer reachable; mobile drawer header title hidden.

# V-19 Mobile Click Real Logic Matrix

Scope: pilot UI clickability and layout on desktop, tablet, and mobile.

## Breakpoints

| Breakpoint | Surfaces | Click / layout contract | Evidence |
| --- | --- | --- | --- |
| 390 mobile | Agent actions, agent submissions, submission drawer, admin review, admin drawer, export | Cards are full width, no horizontal overflow, agent nav stays compact, fixed create/filter layers do not cover controls, mobile filters close with Escape, drawer actions are reachable, export ready rows become usable cards | `tests/e2e/v19-mobile-click-real-logic.spec.ts` mobile project |
| 768 tablet | Agent actions/submissions, admin review/export | No horizontal overflow, nav/menu actions remain targetable, fixed context layers do not cover visible controls | `tests/e2e/v19-mobile-click-real-logic.spec.ts` chromium matrix |
| 1024 tablet/desktop boundary | Agent actions/submissions, admin review/export | Boundary layout keeps controls clickable with no fixed-layer cover and no overflow | `tests/e2e/v19-mobile-click-real-logic.spec.ts` chromium matrix |
| 1440 desktop | Agent actions/submissions, admin review/export | Desktop layout keeps table/card controls targetable and horizontally contained | `tests/e2e/v19-mobile-click-real-logic.spec.ts` chromium matrix |

## Controls Covered

- Agent action row actions: repeated `Открыть` buttons now have row-specific accessible names.
- Agent mobile tabbar: one-row 4-tab layout at 390px; it is hidden while drawers are open.
- Agent submissions filter sheet: bottom sheet is above the tabbar/create dock and closes by backdrop, close button, or Escape.
- Agent submission cards: row click opens the requested `data-submission-id`, including `ПД-1048`.
- Submission drawer: close and tab actions remain reachable on mobile.
- Admin mobile menu: export navigation is reachable through the menu at 390px.
- Admin review drawer: mobile review row opens the drawer and close action remains targetable.
- Export ready rows: mobile card mode exposes row checkbox and `Смотреть пакет` without horizontal table overflow.
- Export disabled actions: disabled action buttons reference `#export-action-hint` through `aria-describedby`.

## V-19 Domain Guard

- Active requirements remain canonical: `selfie`, `selfie_2`, `passport_scan`, `questionnaire`.
- No changes were made to export rules, auth, Supabase, or business/domain logic.
- Export policy remains fail-closed for mixed-city packages; same-city mixed-agent behavior is unchanged.
- Returned PDF scope is unchanged; this pass only keeps UI controls visible and targetable.

## Required Checks

```bash
grep -R "^\(<<<<<<<\|=======\|>>>>>>>\)" src tests || true
git diff --check
npm install
npm run typecheck
npm run lint
npm run build
npm run test
npm run verify:safety
npm run verify:auth-data-readiness
npm run verify:v19-boundary
npm run verify:performance
npx playwright test tests/e2e/app-smoke.spec.ts --project=chromium
npx playwright test tests/e2e/v19-pilot-mobile-clicks.spec.ts --project=mobile-chromium
npx playwright test tests/e2e/v19-mobile-click-real-logic.spec.ts --project=mobile-chromium
npx playwright test tests/e2e/v19-mobile-click-real-logic.spec.ts --project=chromium
npx playwright test tests/e2e/v19-create-submission-family-proof.spec.ts --project=chromium
```

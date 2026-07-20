# Agent submission card density

## WORKFLOW STATE

- Package Manager: npm (via `package-lock.json`)
- Framework: React 19 + Vite 8 (via `vite.config.ts` and `react` dependency)
- Mode: `quick-ui-polish`
- Surface: `Мои подачи` individual submission card
- Source truth: annotated runtime screenshot, `ApplicantsScreen.tsx`, shared V-19 tokens
- Verification: focused Vitest, changed-file ESLint, typecheck, production build, browser mobile and desktop proof

## Skill activation

- `codex-ux`: keep the primary goal on fast scanning and direct document actions.
- `product-design:index`: treat the browser annotation as a scoped update.
- `ui-perfecter`: reduce excess vertical space and strengthen interaction states.
- `development-skills:frontend-dev`: follow research, plan, implementation, verification, and review gates.
- `build-web-apps:react-best-practices`: preserve existing semantic buttons and avoid unnecessary React state or component churn.

## Findings

- The card is semantically correct, but the header/footer spacing makes a single-person item feel oversized.
- The four document controls are real `button` elements with existing handlers; their visual feedback should make that clickability clearer without restoring boxed outlines.
- Business status, upload, questionnaire, drawer, filtering, and sorting behavior must remain unchanged.

## Implementation

1. Tighten only the individual-card header/footer rhythm using existing size tokens.
2. Use a two-column submission grid from the desktop breakpoint while preserving one column below it.
3. Give the card a more substantial layered surface using existing color tokens.
4. Strengthen hover, focus, and pressed feedback on document buttons while retaining their inline divider treatment and 40px targets.
5. Keep lifecycle status in the top-right header and render the primary card action in the footer; ready drafts submit, all other cards open the drawer.
6. Verify no overflow and exercise a real document button on mobile and desktop.

## Verification Results

- **Focused tests:** `npx vitest run tests/unit/applicantsScreenInteractions.spec.tsx` — PASSED (11/11).
- **Typecheck:** `npm run typecheck` — PASSED.
- **Changed-file lint:** `npx eslint src/components/ApplicantsScreen.tsx tests/unit/applicantsScreenInteractions.spec.tsx` — PASSED.
- **Project lint:** `npm run lint` — BLOCKED by 8 pre-existing errors in untracked `V19_ADMIN_AGENT_UI_HANDOFF/REFERENCE_UI`; scoped files are clean.
- **Production build:** `npm run build:supabase-production` — PASSED; production bundle guard passed.
- **Browser:** desktop `1440x900`, mobile `390x844`, and annotated `561x666` — no horizontal overflow; document and family primary actions opened their exact drawers; console errors: 0.

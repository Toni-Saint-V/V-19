# Agent Drawer premium polish

milestone: M3 Agent Drawer visual approval

source: `docs/Premium Dark-First Мои действия 4/src/app/components/Drawer.tsx`

target: `src/modules/submissions/components/adminAiAssistance.tsx`

contract: preserve the existing `FigmaSubmissionDrawerProps`, production callbacks, permissions, persistence, issue routing, questionnaire handoff, focus trap, and four-tab information architecture.

contract: preserve the original Drawer motion values: overlay opacity `0.25s`; desktop panel enters/exits on x and mobile panel on y with spring damping `28`, stiffness `240`, mass `0.8`; tab content uses opacity plus y `10/-10` over `0.2s`; active-tab indicator uses the original shared-layout spring with bounce `0.2` and duration `0.5s`.

invariant: `prefers-reduced-motion` removes translation and reduces motion duration to the existing near-instant path.

invariant: the project font remains `--v19-font-family`; no font, dependency, color family, shadow family, or decorative effect is added.

invariant: mobile geometry remains unchanged unless browser evidence proves a current defect. The current full-height mobile Drawer, `18px` title, `44px` close target, sticky footer, and `16px` horizontal body inset remain the baseline.

decision: use the conservative source-normalized desktop treatment. At `>=1024px`, restore the original right-side sheet proportion with the existing `840px` token and `8px` viewport inset; remove the centered `1140px` modal override.

decision: normalize desktop hierarchy to source-derived values already present in shared tokens: `120px` minimum header, `24px` title, `44px` close target, `48px` tabs at `13px`, and `32px` body/footer horizontal inset.

decision: restore the active-tab indicator as a `motion` shared-layout element. Remove only the static active underline that it replaces.

decision: include a bounded micro-polish audit across every Drawer tab and state. This is not a redesign: preserve content structure, actions, statuses, colors, radii, and business copy while correcting only evidence-backed optical defects through existing shared tokens.

decision: micro-polish typography hierarchy and rhythm where side-by-side proof shows drift: title/section/body/meta role separation, line-height, weight, letter spacing, long-text wrapping, and numeric/progress alignment. Keep `--v19-font-family` and use only existing tokenized type roles or source-derived values added to the shared baseline.

decision: micro-polish spatial rhythm where the current Drawer is visibly uneven: header metadata, tabs, section spacing, card interiors, applicant rows, questionnaire blocks, issue/history entries, and footer actions. Use the established `4/8/12/16/20/24/32` rhythm through shared tokens; do not add arbitrary local spacing.

decision: correct control and icon optics where runtime evidence exposes inconsistency: icon size by role, baseline/vertical centering, active underline position, border contrast, focus/hover treatment, and minimum `44px` interactive targets. Do not add colors, shadows, gradients, decoration, or new interaction patterns.

decision: verify micro-details in overview, questionnaire, issues, history, loading, empty, long-content, error/blocking, and sticky-footer states rather than polishing only the default overview state.

decision: every micro-change is independently reversible. Keep it only when a fresh before/after comparison is clearly calmer, more legible, or more precise at all affected viewports; otherwise revert that individual change rather than carrying it as subjective polish.

test: focused unit coverage keeps four canonical tabs, keyboard navigation, focus/close behavior, issue routing, action persistence, and body scroll restoration green.

test: fresh browser proof covers `320x740`, `390x844`, `430x932`, `768x1024`, and `1440x900`, with no page overflow, no clipped Drawer, header ratio `<= 0.15` on mobile/tablet, visible footer actions, and zero blocking console/page errors.

test: desktop before/after screenshots must show a clearer hierarchy and denser use of the Drawer without lost content; mobile before/after must show no regression.

test: the micro-polish evidence matrix explicitly checks text baselines and wrapping, icon/control centering, tab indicator placement, spacing cadence, card density, numeric alignment, hover/focus/disabled states, long content, and sticky-footer clearance in every canonical tab.

test: strict-quality-critic accepts the patch only when the after state scores higher than baseline with no lower category across logic, depth, precision, value, and structure. If the difference is not visually obvious in side-by-side evidence, the visual change is reverted.

deferred: full Questionnaire screen polish remains outside this Drawer stop gate.

## Alternatives considered

1. Motion-only preservation. Lowest risk, but it leaves the confirmed `1140px` desktop scale mismatch and does not satisfy the requested typography/proportion polish.
2. Conservative source-normalized pass. Recommended: exact original motion, source-derived desktop density, unchanged mobile and business behavior.
3. Full source geometry on every breakpoint. Rejected for now: the original mobile bottom sheet begins below the viewport top and would reduce working space without evidence that it improves the current production flow.

## Working notes

Confirmed source values come from `Drawer.tsx` and its bundled screenshots. The original React runtime could not be started because its archived package is missing `@tailwindcss/vite`; no dependency was installed. Static source and screenshot evidence are sufficient for the selected motion and sizing decisions.

Package Manager: npm (via `package-lock.json`)

Framework: React 19 + Vite (via `vite.config.ts` and `react` dependency)

Verification after approval: focused Vitest, lint, typecheck, production build, Supabase sandbox interaction matrix, then read-only production-connected smoke.

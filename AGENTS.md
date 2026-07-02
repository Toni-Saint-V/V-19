# VisaFlow V-19 Agent Contract

This repository is the local VisaFlow V-19 product checkout. Move the product with the smallest safe change, current source truth, and fresh evidence. Never fake completion, OCR, uploads, AI decisions, official verification, production proof, Excel proof, or verification results.

## 0. Operating Contract
- Use the smallest valid stack for the current task.
- Plugin-first means conditional routing, not plugin sprawl.
- Use at most one task-specific helper and one verifier unless risk or the user explicitly requires more.
- Before repo edits, inspect branch/status, relevant files, and current diff when risk or dirty work matters.
- Do not expand scope silently.

## Codex Skill Context Budget
- Default preset for ordinary repo work:
  - `$codex-logic`
  - `$codex-scope-lock`
  - `$codex-verdict-gate`
  - `$verification-before-completion`
  - `$systematic-debugging`
- Do not load all skills or plugins by default. Prefer 5-9 total skills for a task, including guardrails.
- Do not include UI/browser skills for backend or security tasks.
- Do not include backend/security skills for pure UI polish unless the task actually needs them.
- Do not include plugins unless the task explicitly needs their capability.
- If Codex shows the 2% skills context warning, stop before implementation and reduce the active skills/plugins.
- Task-specific presets:
  - UI tasks only: `$codex-ui`, `$premium-design-ux-review`, `$premium-ui-polisher`, `$mobile-first-ui-convergence`, `$adaptive-layout-contract`, `$interaction-system-builder`, `$qa-browser-debug`.
  - Security/backend tasks only: `$security-review`, `$bank-grade-review`, `$typescript-development`, `$spec-driven-development`.
  - Release/observability tasks only: `$release-observability`, `$verification-before-completion`.
  - Export/report tasks only: `$data-reports-exports`.

## Source Truth
- Stack: React 19, Vite 8, strict TypeScript, custom CSS/UI, Supabase JS, Vitest, Playwright.
- Routing: local application state only. Do not add React Router or another routing framework without an explicit product need.
- Durable submission logic lives mainly in `src/modules/submissions`, `src/services/`, `src/lib/supabase`, and `supabase/`. Legacy `src/lib/workflow.ts` and `src/types/domain.ts` are compatibility surfaces unless the canonical contract explicitly says otherwise.
- Canonical product/domain contract: `docs/release/canonical-domain-contract.md`.
- Before edits, inspect branch/status, relevant files, and current diff when risk or dirty work matters.
- Preserve unrelated dirty work. Do not use destructive git unless explicitly requested.

## V-19 Scope Lock
- Main entity: `Submission`.
- Allowed submission types: `single`, `family`.
- Allowed roles: `agent`, `admin`.
- Agent surfaces: `My submissions`, `Submission drawer`.
- Admin surfaces: `Review`, `Export`, `Submission drawer`, `Excel preview`.
- Spain is fixed metadata: `countryCode: "ES"`, `countryLabel: "Испания"`.
- Do not add or preserve CRM, People, Families, Groups, analytics dashboard, AI checker, AI filters, board view, saved filters, legal promise screens, or multi-country selection as primary surfaces.
- Applicants, questionnaire, files, issues, and history belong inside `Submission`.

## Architecture
- No business logic in UI components.
- Submission statuses, transitions, permissions, readiness, export eligibility, and issue lifecycle are domain/use-case owned.
- `requiresAction` is derived, not a persisted lifecycle status.
- Issue lifecycle: `open -> fixed_by_agent -> closed_by_admin`.
- Acceptance is blocked while any blocking issue is `open` or `fixed_by_agent`.
- Export is fail-closed. Excel preview and workbook generation must share the same row model.

## Visual Baseline: My Actions
- First step for UI work: replace colors, font roles, sizes, spacing, radius, and motion with tokens before styling screens; new raw values belong only in the token section of `src/shared/ui/visual-baseline.css`.
- Do not duplicate colors, font sizes, spacing, radius, or motion values in component CSS; after tokens exist, screen rules must use `var(...)`.
- Canonical visual screen: `Мои действия`. Apply its dark operational density screen by screen, starting with `Мои действия`; do not copy archive logic, mock data, routes, `motion/react`, product entities, or statuses.
- Visual source package: `/Users/user/Downloads/111111111.zip`; use only visual tokens, spacing, typography roles, motion feel, density, and lucide-style icon choices.
- Before any V-19 UI screen work, read `.agents/rules/v19-screen-wireframes.md` and `.agents/reference-screens/README.md`; skipping this is a `High` finding.
- Project font source is `--v19-font-family` in `src/shared/ui/system.css`; do not import a new font. Baseline typography may change role sizes/weights only through tokens.
- Surfaces: app `#101011`, page `#141416`, panel/sidebar `#161617`, button/control `#1e1e21`, hover/selected `#27272b`, border `#202124`, strong border `#242529`, selected border `#2e2f34`.
- Default/secondary buttons are dark gray only: `#1e1e21 -> #27272b`, border `#242529`, radius `10px`. Primary CTA may stay indigo `#3a45b4 -> #4855d4`.
- Status labels/badges keep existing V-19 yellow/red semantics and quiet graphite treatment. Bright new colors are for small circular dots only: red `#ff5c67`, yellow `#f59e0b`, blue `#60a5fa`, review `#8fa3ff`, done `#34d399`.
- Layout tokens: sidebar `288px`, topbar `60-64px`, page padding `16px/24px`, controls `40px`, list gap `8px`, operational row/card min-height `92px`, desktop row gap `14px`.
- Shared toolbar pattern: one common two-level control element. Top level contains 3-4 tabs plus city selector. Bottom level contains search plus 2-3 filters/tools with `2px` gaps. Avoid nested card-in-card rectangles.
- Title plus hamburger must use the same tokenized topbar control system as the toolbar: one shared surface, project font, dark gray menu button, `40px` control, `10px` radius.
- Mobile cell contract: agent/review list surfaces have exactly two reusable mobile cell variants. Variant A: top line ID, main name/title, people count badge on the right only for family rows, route line with city dot dates, divider, then a dark-gray action button aligned right at about one quarter width. Variant B: same shell but bottom action/status text is inline muted/semantic instead of a right button. The extra applicant/family card grid form belongs only to `Выгрузка` and must use the same baseline colors/tokens.
- Radius/motion tokens: controls `10px`, segmented `11px`, rows/cards `15px`, panels `16-18px`, transitions `140-180ms`, reduced-motion safe.
- For UI/component replacement or polish, use the UI task preset only when the current task is UI-scoped, keep changes screen-scoped, capture fresh desktop/mobile runtime proof, write `premium-design-ux-review` when used, and fix all Critical/High/Medium findings before the next screen.

## Verification
- Use targeted proof first: file inspection, focused scripts/tests, typecheck/build when relevant, browser/runtime proof for UI, screenshots under `docs/qa/`.
- Release/security gates: `npm run verify:security` or `npm run verify:full` only when risk requires it.
- Do not claim done while relevant tests fail or product-ready proof is incomplete.

## Rule Index
- V-19 domain and scope: `.agents/rules/v19-domain.md`
- Design-system components: `.agents/rules/v19-design-system-components.md`
- Visual lock tokens: `.agents/rules/visual-lock-tokens.md`
- Live reference UI review: `.agents/rules/ui-live-figma-review.md`
- Screen wireframes: `.agents/rules/v19-screen-wireframes.md`
- Verification gates: `.agents/rules/verification-gates.md`
- Git and release safety: `.agents/rules/git-release-safety.md`

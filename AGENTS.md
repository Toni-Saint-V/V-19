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
- Use exactly one preset per task. A task-specific preset replaces the default preset unless the user names an extra guardrail or the risk clearly requires one.
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
- For UI/component replacement or polish, use the UI task preset as the selected preset only when the current task is UI-scoped, keep changes screen-scoped, capture fresh desktop/mobile runtime proof, write `premium-design-ux-review`, and fix all Critical/High/Medium findings before the next screen.

## Strict ZIP/HTML 1:1 UI Transfer
- Use this section whenever the user provides or references a ZIP/HTML UI artifact, `START_HERE.html`, source truth, `1:1`, visual parity, перенос UI, or asks to make the project match a reference. The ZIP/HTML is the visual source truth, not the deliverable. The deliverable is this target project changed to match the reference.
- Before doing that work, read `.agents/workflows/v19-ui-reference-transfer/README.md`, then follow its numbered files in order. The reusable copy-ready prompt is `.agents/prompts/v19-ui-reference-transfer.md`.
- If the request is not a UI/reference-transfer task, route out through `.agents/workflows/v19-ui-reference-transfer/00-route.md` and use the normal non-UI route. Do not load browser/UI workflows for backend, business logic, Supabase, OCR, export data, release, security, tests-only, or docs-only work unless the task actually requires UI runtime evidence.
- Current checked-in UI reference, unless the user gives a newer one: `docs/References/visaflow_v19_linear_final_5_UI_updated.zip` and its `START_HERE.html`.
- `docs/References/v19_ui_reference_transfer_agents_instructions.zip` is not a UI reference. It is only a portable copy of agent/workflow instructions and must not be used for visual extraction, screenshots, token values, component matching, or 1:1 comparison.
- `docs/References/perfect_extracted/` is not automatically authoritative for the current transfer task. Use it only if it is proven to be extracted from the active UI reference ZIP for this run, or if the user explicitly names it as the source truth. If it disagrees with the active ZIP, the active ZIP wins.
- A newer explicit user-provided ZIP/HTML UI path overrides `docs/References/visaflow_v19_linear_final_5_UI_updated.zip`. Instruction/workflow archives never override the UI reference.
- Before edits, prove both sides:
  - `Reference path`
  - `Target cwd`
  - `Target branch/status`
  - `Reference runtime URL`
  - `Target runtime URL`
  - `Serving cwd verified: yes/no`
- Extract first, implement second, verify third. Do not infer, round, smooth, premium-adjust, or approximate visual values. If a value is not in source TSX/CSS/HTML/built CSS, measure it from runtime computed styles or screenshot evidence before using it.
- Label important visual evidence as `Runtime`, `Source`, `Screenshot`, `Unverified`, or `Blocked`. Do not implement from `Unverified` values. If source/runtime is missing, stop with `blocked` instead of guessing.
- Preserve V-19 business logic, entities, statuses, roles, permissions, routing, data fetching, issue/export rules, and domain contracts. Copy only visual system, layout behavior, component composition, responsive behavior, and motion from the reference. Do not copy reference mock data, demo-only state, or incompatible product entities.
- Reference values must land in shared layers before screen use:
  - raw visual values go first into `src/shared/ui/visual-baseline.css` or an existing shared token file imported by the UI system;
  - project font remains `--v19-font-family` from `src/shared/ui/system.css`;
  - downstream screen/component CSS must consume `var(...)` tokens or shared primitives;
  - repeated raw `#hex`, `rgb/rgba`, arbitrary `px`, `rounded-[...]`, `text-[...]`, `shadow-[...]`, and local transition values are findings unless they are in the token/primitives layer with a stated reason.
- Build reusable primitives instead of per-screen copies. At minimum, map reference patterns into shared target components for: `AppShell`, `OperationalSideMenu`, `TopBar/PageHeader`, `Button`, `IconButton`, `SegmentedTabs`, `SearchFilterRow`, `Panel/Section`, `MetricCard`, `StatusChip`, `StatusDot`, `ProgressMeter`, `ListCell/MobileCell`, `BottomDock`, `BottomSheet`, `DrawerShell`, and `ModalShell`.
- Keep exactly one shared side menu through the app shell/navigation path. Do not duplicate sidebars inside individual screens to match a screenshot.
- Required transfer workflow for each screen:
  1. capture reference and target baseline screenshots;
  2. write a compact reference extraction table: token/component, value, evidence level, source note;
  3. map reference pattern to target file/component;
  4. implement the smallest shared-token/shared-component change;
  5. migrate one screen or one reusable slice;
  6. re-run browser proof on mobile, tablet, and desktop;
  7. fix regressions before moving to the next screen.
- Mobile contract for 1:1 transfer:
  - header/topbar must be `<= 15%` of viewport height and normally around `56px`;
  - primary work content must be visible in the first viewport;
  - secondary summaries, metrics, intro copy, context rails, and filters move to `BottomSheet`, `BottomDock`, drawer, tabs, or collapse when they steal primary space;
  - minimum mobile horizontal inset is `16px`;
  - tap targets are `40-44px` minimum;
  - no page-level horizontal overflow;
  - sticky docks/footers must not cover the last content;
  - text must wrap/truncate intentionally without overlap.
- Desktop contract for 1:1 transfer:
  - desktop must keep the reference density, topbar/sidebar behavior, page grid, card/list rhythm, status treatment, and CTA hierarchy;
  - do not damage desktop while fixing mobile, and do not damage mobile while fixing desktop;
  - desktop and mobile are separate verification surfaces.
- Motion contract:
  - transfer reference motion timing and pattern only after extracting it from source/runtime;
  - allowed motion families: screen enter, workspace switch, overlay fade, sheet slide/fade, side-nav slide, modal scale/y;
  - no random bounce, decorative motion, slow theatrical transitions, or inconsistent per-screen animation;
  - `prefers-reduced-motion` safety is required when motion is changed.
- Required browser proof after the latest code change:
  - viewports: `320x740`, `390x844`, `430x932`, `768x1024`, and desktop `1440x900` or the exact desktop viewport requested by the user;
  - collect reference-vs-target screenshots for migrated screens under `docs/qa/`;
  - assert `document.documentElement.scrollWidth <= window.innerWidth`;
  - assert header height ratio `<= 0.15` on mobile/tablet;
  - assert visible mobile insets are at least `16px`;
  - check console/page errors;
  - click at least one relevant sheet/dock/drawer interaction per migrated screen.
- Final verdict language for 1:1 transfer is restricted:
  - `1:1 transfer complete for verified scope`
  - `partial: verified slice complete`
  - `not ready: visual deltas/blockers remain`
  - `blocked: missing reference or target runtime`
- Never claim full 1:1 completion if only a slice was migrated, if screenshots are stale, if runtime was served from an unverified cwd, if console/build/typecheck is red, or if Critical/High/Medium visual findings remain in the declared scope.

## Verification
- Use targeted proof first: file inspection, focused scripts/tests, typecheck/build when relevant, browser/runtime proof for UI, screenshots under `docs/qa/`.
- Release/security gates: `npm run verify:security` or `npm run verify:full` only when risk requires it.
- Do not claim done while relevant tests fail or product-ready proof is incomplete.

## Rule Index
- Agents folder entry point: `.agents/README.md`
- V-19 domain and scope: `.agents/rules/v19-domain.md`
- Design-system components: `.agents/rules/v19-design-system-components.md`
- Visual lock tokens: `.agents/rules/visual-lock-tokens.md`
- Live reference UI review: `.agents/rules/ui-live-figma-review.md`
- Screen wireframes: `.agents/rules/v19-screen-wireframes.md`
- Verification gates: `.agents/rules/verification-gates.md`
- Git and release safety: `.agents/rules/git-release-safety.md`
- ZIP/HTML 1:1 UI transfer workflow: `.agents/workflows/v19-ui-reference-transfer/README.md`
- Copy-ready UI transfer prompt: `.agents/prompts/v19-ui-reference-transfer.md`

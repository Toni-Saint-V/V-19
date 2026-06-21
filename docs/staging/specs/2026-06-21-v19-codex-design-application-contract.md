# VisaFlow V-19 Codex Design Application Contract

status: ready-for-user-approval
date: 2026-06-21
target: future Codex implementation pass for VisaFlow V-19
source_pdf: /Users/user/Documents/Лайнер_Дизайн/VisaFlow_V19_Design_System_Source_of_Truth_v1.0.pdf
repo_visual_lock: docs/VISAFLOW_VISUAL_LOCK.md

## Purpose

This document is the handoff contract for the next Codex run. Its job is to make Codex apply the VisaFlow design system to the real V-19 repository without drifting into redesign, forbidden product scope, fake completion, or unverifiable visual polish.

Use it as the first document after `AGENTS.md` and before touching UI code.

## Authority Order

1. `AGENTS.md` and higher-priority runtime instructions.
2. `docs/VISAFLOW_VISUAL_LOCK.md`.
3. This contract.
4. `/Users/user/Documents/Лайнер_Дизайн/VisaFlow_V19_Design_System_Source_of_Truth_v1.0.pdf`.
5. `/Users/user/Documents/VisaFlow_V19_Design_Pack_v1.1 2/docs/VISAFLOW_V19_CODEX_DESIGN_INSTRUCTION_v1.1.md`.
6. `/Users/user/Documents/VisaFlow_V19_Design_Pack_v1.1 2/contracts/visaflow-v19-design-contract.v1.1.json`.
7. Current implementation, only when it does not conflict with the sources above.

Conflict rule: if the PDF or v1.1 pack treats `Views / Представления` as a visual reference, keep only the shell, density, selected/focus distinction, empty-state quality, and component discipline. Do not create `Виды`, `/views`, saved views, templates, or a primary Views surface.

## Locked Product Scope

contract: V-19 is a submission-centric visa operations workspace for Spain.

allowed_submission_types:
- `single`
- `family`

allowed_roles:
- `agent`
- `admin`

allowed_primary_surfaces:
- Agent: `Входящие`, `Мои действия`, `Мои подачи`, `Submission Drawer`, `Create Submission Drawer`, `Настройки`
- Admin: `Входящие`, `Мои действия`, `Проверка`, `Выгрузка`, `Submission Drawer`, `Excel preview`, `Настройки`

fixed_country:
- `countryCode: "ES"`
- `countryLabel: "Испания"`

forbidden_primary_surfaces:
- CRM
- People
- Families
- Groups
- analytics dashboard
- AI checker
- AI filters
- board view as status-changing workflow
- saved filters
- saved views
- legal promise screens
- multi-country selection
- standalone Applicants, Questionnaire, Files, Issues, or History products

invariant: applicants, questionnaire, files, issues, and history live inside `Submission`.

## Design Intent

VisaFlow is a dark, dense, quiet B2B operations product. The UI must make state, blockers, and next action readable within three seconds.

design_formula:
- calm surface
- strict hierarchy
- explicit state
- one next action

do:
- preserve dark graphite premium SaaS atmosphere
- use semantic tokens and shared primitives
- keep selected, focus-visible, active, disabled, loading, error, and success states visually distinct
- make rows and drawers operational, not decorative
- keep drawer-first workflows
- use Russian-first interface copy
- expose exact next actions and recovery paths

do_not:
- redesign the product
- introduce a new visual language
- add gradients, glows, glassmorphism, bouncy motion, heavy shadows, mascot art, or marketing layouts
- use color as the only status carrier
- add raw colors, radii, spacing, or shadows in product components
- turn the app into a CRM, analytics dashboard, AI decision system, official verification product, or visa probability engine

## Visual System Lock

Use `docs/VISAFLOW_VISUAL_LOCK.md` as the repo-local visual source of truth.

current_agent_reference_set:
- `docs/qa/v19-agent-inbox-reference-2026-06-20.png`
- `docs/qa/v19-agent-actions-reference-2026-06-20.png`
- `docs/qa/v19-agent-submissions-reference-2026-06-20.png`

agent_archetypes:
- Inbox stream
- Action queue
- Submission register

invariant: no fourth agent collection archetype exists unless product approval updates `docs/VISAFLOW_VISUAL_LOCK.md` first.

token_rule:
- agent-facing dimensions and colors come from `src/shared/ui/tokens.css`
- app-level legacy tokens may exist in `src/styles.css`
- component code consumes semantic names and shared primitives
- raw visual values in touched product JSX/CSS are defects unless immediately promoted into a named token with proof

selected_state:
- neutral gray fill and primary text
- not indigo
- not amber
- not focus ring only

focus_state:
- keyboard-visible indigo outline
- independent from selected state

status_mapping:
- returned / blocker / destructive: red
- video / files / pending / warning: yellow
- accepted / ready / success / complete: green
- selected navigation/views: neutral gray
- active row border may use subtle indigo

## IA And Route Contract

agent_sidebar:
- `Входящие`
- `Мои действия`
- `Мои подачи`
- `Настройки`

admin_sidebar:
- `Входящие`
- `Мои действия`
- `Проверка`
- `Выгрузка`
- `Настройки`

allowed_routes:
- `/inbox`: agent, admin
- `/actions`: agent, admin
- `/submissions`: agent
- `/review`: admin
- `/export`: admin
- `/settings`: agent, admin

forbidden_routes:
- `/views`
- `/projects`
- `/people`
- `/applicants`
- `/families`
- `/groups`
- `/documents`
- `/tourists`
- `/analytics`
- `/dashboard`
- `/ai-checker`

drawer_deeplink_query_allowed:
- `/submissions?submission=SUB-1042&tab=issues`
- `/review?submission=SUB-1042&tab=overview`

invariant: submission details open in a drawer over the current list, not as a primary standalone page.

## Product Flow

happy_path:
1. Agent creates draft.
2. Agent fills applicants, questionnaire, and files.
3. Agent submits for review.
4. Admin reviews.
5. Admin either returns exact issues or accepts.
6. Agent fixes issues and submits corrections.
7. Admin closes issues and accepts.
8. Admin previews Excel rows.
9. Admin generates, downloads, and marks export.

domain_invariants:
- status transitions live in domain/use-case logic, not React components
- `requiresAction` is a derived operational flag, not a persisted lifecycle status
- issue lifecycle is `open -> fixed_by_agent -> closed_by_admin`
- acceptance is blocked while any blocking issue is `open` or `fixed_by_agent`
- export is fail-closed
- Excel preview and workbook generation use the same row model
- one applicant equals one Excel row
- family rows are sequential and grouped

## Screen Contracts

### Входящие

goal: show what changed and route the user to exact context.

structure:
- title `Входящие`
- tabs `Непрочитанные`, `Все`
- search `Поиск по входящим`
- grouped rows such as `Сегодня`, `Ранее`
- optional right summary panel

row_must_include:
- unread marker when relevant
- semantic event icon
- event title
- submission/applicant context
- time
- status/event badge
- exact action

interaction:
- row click marks event read when appropriate
- row opens `Submission Drawer` at exact tab/section
- `Вернули` opens `Замечания`
- file event opens `Файлы`
- questionnaire event opens exact `Анкета` section

### Мои действия

goal: show cross-submission exact work, not generic navigation.

structure:
- title `Мои действия`
- tabs `Открытые`, `Выполненные`
- summary filters `Просрочено`, `Сегодня`, `На неделе`
- default sort: severity, due date, updated time

rules:
- no generic `Открыть` CTA when exact action is known
- no manual completion checkbox that bypasses domain logic
- action completion happens only through domain transition
- click opens exact drawer tab/section

### Мои подачи

goal: agent object-centric control of submissions.

structure:
- title `Мои подачи`
- primary CTA `Новая подача`
- tabs `Требуют действия`, `В работе`, `На проверке`, `Готово`
- compact list as default
- optional right context panel

row_must_include:
- title
- type
- applicant count
- city
- trip dates
- status
- blockers
- file state
- completeness
- exact next action
- updated time

### Проверка

goal: admin review queue without context loss.

structure:
- title `Проверка`
- CTA `Открыть первую`
- tabs `На проверке`, `Исправления получены`, `Готово к выгрузке`
- columns at wide desktop when implemented safely
- list fallback below 1280px

rules:
- drag-and-drop must not change domain status
- footer commands in drawer own transitions
- returned submission leaves active admin queue and creates agent action
- accepted submission enters export-ready state

### Выгрузка

goal: safely create Excel without duplicates or mixed invalid batches.

structure:
- title `Выгрузка`
- tabs `Готово`, `История`
- table/list rows with selection
- right panel with Excel preview and pre-export checks
- bulk action bar after selection

mandatory_guards:
- accepted/ready submissions only
- open blockers block export
- missing required files block export
- mixed city/date/category package fails closed
- duplicate export is blocked unless explicit override flow exists
- preview and workbook rows must match

### Настройки

goal: role-safe user and workspace settings inside the shared shell.

rules:
- settings sub-navigation is local to the page
- `Команда и роли` may be an admin settings subsection, not a primary page
- dirty state uses sticky save bar
- leaving dirty form requires confirmation
- theme is fixed dark baseline unless a separate scope approves light mode

### Submission Drawer

goal: primary work surface for a submission.

tabs:
- `Обзор`
- `Заявители`
- `Анкета`
- `Файлы`
- `Замечания`
- `История`

default_tab_rules:
- returned/requires action: `Замечания`
- file issue: `Файлы`
- questionnaire issue: exact `Анкета` section
- admin review: `Обзор`
- exported: `История`

behavior:
- width 760-820px on desktop when viewport allows
- full-screen below drawer breakpoint
- header, tabs, footer sticky
- body scrolls independently
- focus trap active
- Escape closes when safe
- focus returns to opener
- dirty close requires confirmation
- destructive action requires proportional confirmation

### Create Submission Drawer

goal: create or resume a submission without leaving the workspace.

steps:
1. `Параметры`
2. `Заявители`
3. `Анкета`
4. `Файлы`

requirements:
- country fixed to `Испания`
- type switch: `Один заявитель` / `Семья`
- applicants added inside drawer
- draft resumable after close/reopen
- inline validation near fields
- step status visible
- dependent future steps locked until requirements are satisfied
- footer: `Сохранить черновик` plus `Дальше` or `Отправить на проверку`

## States Required On Major Surfaces

required_states:
- loading/skeleton
- populated
- empty first-use
- empty tab
- no search/filter results
- partial data
- recoverable error
- permission denied
- disabled action with reason
- dirty/unsaved
- success feedback
- conflict/duplicate where relevant

copy_formulas:
- empty: what this is, why it matters, next action
- error: what happened, what remains safe, how to recover
- disabled: reason when not obvious
- metadata: short fragments, not prose

forbidden_copy:
- `виза одобрена`
- `шанс получения визы`
- `официальная проверка`
- `OCR подтвердил`
- `решение принято системой`
- `автоматически записали в консульство`

safe_copy:
- `Пакет готов к внутренней проверке`
- `Файл ожидает проверки администратором`
- `Подача готова к Excel`
- `Система не принимает визовых решений`

## Accessibility Contract

required:
- WCAG AA minimum
- normal text contrast >= 4.5:1
- large text contrast >= 3:1
- focus-visible for keyboard navigation
- selected state visible without focus ring
- logical tab order
- Escape closes popovers, drawers, and modals when safe
- focus returns to trigger
- arrow-key navigation for tabs/menu/listbox where applicable
- icon-only buttons have aria-label and tooltip
- status/error not color-only
- 44px preferred target; 40px visible control allowed only with adequate row/keyboard target
- text zoom 200% must not clip core actions
- `prefers-reduced-motion` disables transforms and shimmer

## Responsive Contract

viewports_to_verify:
- 1440x900
- 1024x768
- 768x1024
- 390x844

acceptance_390px:
- no horizontal page scroll
- no clipped close action
- primary CTA remains reachable
- status and next action remain visible
- tabs scroll horizontally instead of ambiguous multiline wrap
- footer actions stack only when required
- 44px touch targets
- dialogs/drawers do not exceed viewport

agent_no_scroll_checks:
- `document.scrollingElement.scrollHeight <= document.scrollingElement.clientHeight`
- `document.documentElement.scrollWidth <= document.documentElement.clientWidth`

allowed_overflow:
- vertical scroll inside long list container
- vertical scroll inside drawer body
- horizontal overflow inside tabs or toolbar controls on narrow widths

not_allowed:
- page-level vertical scroll for normal agent collection screens
- page-level horizontal overflow
- hidden content that requires page scroll
- expanding detail sections that push the page below viewport

## Motion Contract

allowed:
- hover surface/color change
- dropdown/popover opacity plus small y transition
- state feedback that communicates cause and result
- short drawer/modal transitions

rules:
- use transform and opacity first
- keep motion short and interruptible
- no bouncy motion
- no slow decorative loops
- no button scale as default hover
- no layout-thrashing animation
- reduced motion must remove transforms and shimmer

## Implementation Ownership

expected_repo_areas:
- `src/lib/workflow.ts`
- `src/types/domain.ts`
- `src/modules/submissions/*`
- `src/shared/ui/primitives.tsx`
- `src/shared/ui/tokens.css`
- `src/styles.css`
- `src/services/*`
- `src/lib/supabase/*`
- `tests/*`
- `docs/qa/*`

rules:
- UI components render state and dispatch actions
- domain/use-case code owns readiness, transitions, validation decisions, and side-effect orchestration
- repositories/services own data access and raw-to-domain mapping
- permission checks are centralized and testable
- Supabase calls do not live in visual components
- prompts and AI policy do not live in UI

## Codex Execution Protocol

Before any implementation pass:
1. Confirm `pwd`, branch, status, and worktree.
2. Preserve unrelated dirty work.
3. Read `AGENTS.md`.
4. Read `docs/VISAFLOW_VISUAL_LOCK.md`.
5. Read this contract.
6. Inspect only the files relevant to the selected screen/flow.
7. Lock one bounded target.
8. State what is out of scope.
9. Make the smallest safe change.
10. Verify the changed surface.
11. Run one production sanity pass.
12. Stop before starting the next large or serious change.

target_lock_template:
```text
target:
importance:
source truth:
expected visible outcome:
files likely touched:
verification:
out of scope:
approval needed before:
```

## Recommended Implementation Order

1. Scope cleanup and IA proof.
2. Domain engine and transition guards.
3. Shared shell and primitives.
4. Agent workspace screens.
5. Submission Drawer.
6. Create Submission Drawer.
7. Admin Review.
8. Export with preview/workbook row parity.
9. States, responsive, accessibility, and motion hardening.
10. Release/readiness verification.

Do not implement this whole list in one run unless the user explicitly approves that scale. Default to one highest-impact bounded target.

## Verification Ladder

For every changed target, use the smallest proof that supports the claim:
1. Inspect exact source files and current diff.
2. Run targeted unit/integration test when logic is touched.
3. Run `npm run typecheck` when TypeScript contracts are touched.
4. Run `npm run lint` when code style/imports/components are touched.
5. Run `npm run build` when runtime packaging can be affected.
6. Run `npm run verify:agent-screen-system` for agent screen/token/layout changes.
7. Run browser proof for UI, layout, accessibility, console, focus, overflow, or responsive claims.
8. Save screenshots under `docs/qa/` for UI-visible changes.
9. Run `npm run verify` for broad local confidence.
10. Run `npm run verify:full` only for release-facing gates.

Security/trust-sensitive changes:
- run `npm run verify:safety`
- run `npm run verify:security` for release-facing dependency/security checks
- review auth, permission, RLS, private data, export, and AI boundaries

## No-Merge Blockers

The implementation is not ready while any of these remain in the selected scope:
- route/sidebar violates the role matrix
- forbidden V-19 surface appears
- product component introduces raw visual values
- selected state relies on focus ring only
- status or error is color-only
- missing loading/empty/error/disabled/dirty state on important surface
- drawer lacks focus trap, focus return, sticky footer, or dirty confirmation where relevant
- page-level horizontal overflow
- normal agent collection screen requires page scroll
- icon-only button lacks aria-label
- copy promises visa approval, official verification, OCR certainty, or AI decision
- export can include blockers, mixed invalid batches, duplicates, or preview/workbook mismatch
- business logic or permissions are implemented only in UI
- relevant verification fails or was not run

## Screenshot QA Matrix

minimum_desktop:
- Agent Inbox populated
- Agent Actions populated
- Agent Submissions populated with panel
- Admin Review
- Admin Export selected with preview
- Settings dirty state
- Submission Drawer open
- Create Submission Drawer open

minimum_mobile:
- Agent Submissions at 390x844
- Admin Review list at 390x844
- Export adaptation at 390x844
- Submission Drawer full-screen at 390x844
- Create Submission Drawer full-screen at 390x844

state_proofs:
- empty state
- no search results
- loading skeleton
- recoverable error
- disabled action with reason
- dirty close confirmation

## Final Report Contract

Every future implementation final report must include:
- goal
- changed files
- verification commands and results
- browser/screenshot evidence when UI changed
- QA findings
- remaining risks
- readiness delta only if a real baseline was assessed
- verdict: `READY`, `READY WITH RISK`, or `BLOCKED`

Do not say:
- production-ready
- fully done
- ready to ship

unless the relevant proof gates actually passed.

## Ready-To-Copy Prompt For Future Codex Run

```text
You are working in /Users/user/Documents/V-19.

Goal: apply the VisaFlow V-19 design system to one highest-impact bounded target without redesigning the product or expanding V-19 scope.

First read, in order:
1. AGENTS.md
2. docs/VISAFLOW_VISUAL_LOCK.md
3. docs/staging/specs/2026-06-21-v19-codex-design-application-contract.md
4. Only the source files relevant to the selected target.

Use these source materials only as constrained input, not as permission to widen scope:
- /Users/user/Documents/Лайнер_Дизайн/VisaFlow_V19_Design_System_Source_of_Truth_v1.0.pdf
- /Users/user/Documents/VisaFlow_V19_Design_Pack_v1.1 2/docs/VISAFLOW_V19_CODEX_DESIGN_INSTRUCTION_v1.1.md
- /Users/user/Documents/VisaFlow_V19_Design_Pack_v1.1 2/contracts/visaflow-v19-design-contract.v1.1.json

Important conflict rule:
The v1.0/v1.1 materials may mention Views / Представления as a reference. In this repository, do not add Виды, /views, saved views, templates, CRM, People, Families, Groups, analytics, AI checker, legal promise, or multi-country surfaces. Keep only the visual shell/density/component discipline that does not conflict with docs/VISAFLOW_VISUAL_LOCK.md.

Before editing:
- confirm cwd, branch, git status, and worktree
- preserve unrelated dirty work
- lock one target
- state expected visible outcome, files likely touched, verification, and out-of-scope items

Implementation rules:
- use existing React/Vite/TypeScript stack
- use existing routing/local state patterns; do not add React Router
- use shared primitives and semantic tokens
- no raw colors/radius/shadows/spacing in product components
- business logic, status transitions, permissions, export guards, and AI policy do not belong in UI
- drawer-first workflow remains primary
- Spain is fixed metadata
- Russian-first UI copy
- no fake OCR, fake uploads, official verification claims, visa probability, or AI decisions

Verification:
- run the smallest relevant targeted proof
- run typecheck/lint/build or repo verify command when touched surface requires it
- for UI changes, use browser proof and save screenshots under docs/qa/
- for agent screen/layout/token changes, run npm run verify:agent-screen-system
- do not claim completion if verification is missing or failing

Stop after one large or serious change. Report changed files, verification evidence, screenshots if relevant, remaining risks, and the next highest-impact bounded task.
```

## Working Notes

source_observations:
- The v1.0 PDF extracted as text successfully and has 32 pages.
- The PDF defines dark operations principles, tokens, component states, accessibility, responsive rules, product boundaries, implementation contract, and QA gates.
- The PDF lists `Views / Представления` as a reference screen, but V-19 repository instructions now forbid `Виды` as a product surface.
- The v1.1 pack defines role navigation, screen catalog, drawers, export guards, states, responsive matrix, and no-merge gates.
- The repo-local `docs/VISAFLOW_VISUAL_LOCK.md` is stricter for current agent collection screens and must win for implementation.

deferred:
- No app implementation in this pass.
- No PDF rewriting or binary document generation in this pass.
- No git staging, commit, push, deploy, or global Codex config changes in this pass.

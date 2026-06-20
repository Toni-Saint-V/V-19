# VisaFlow V-19 Local Agents

## 0. Operating Contract

You are working inside the local VisaFlow repository.

Move the product toward V-19 using:

- the smallest valid stack;
- the smallest safe change;
- the existing stack;
- the current architecture where possible;
- fresh evidence from files, tests, screenshots, and runtime proof.

Plugin-first means conditional routing, not plugin sprawl.

Optimize for product outcomes, not process.

Never fake:

- completion;
- readiness;
- OCR;
- uploads;
- AI decisions;
- official verification;
- production proof;
- verification results;
- Excel artifact proof.

Before editing:

- Before repo edits, inspect branch/status;
- inspect the current branch/status;
- inspect the relevant files;
- preserve unrelated dirty work;
- do not infer intended architecture from unrelated uncommitted diffs.

Before commit, push, merge, rebase, destructive git operations, database changes, deployment, auth changes, or production-sensitive work:

- inspect the current diff;
- preserve unrelated work;
- stop if scope is unclear.

Do not expand scope silently.

---

## 1. Mission

Build premium, secure, fast, production-grade VisaFlow software with clean architecture and excellent UX.

VisaFlow exists to reduce visa case mistakes, improve readiness, and make human review handoff clear.

Current stack:

- React 19;
- Vite 7;
- strict TypeScript;
- custom CSS/UI;
- Supabase JS;
- Vitest;
- Playwright.

Current routing:

- local application state;
- not Next.js;
- not React Router.

Do not introduce React Router or another routing framework unless explicitly required by the task and justified by a concrete product need.

Current durable logic lives mainly in:

- `src/lib/workflow.ts`;
- `src/types/domain.ts`;
- `src/services/`;
- `src/lib/supabase`;
- `supabase/`.

Adapt to the current repository before creating new structure.

---

## 1.1 V-19 Product Scope Lock

For V-19, the product scope is locked.

Main entity:

```ts
Submission;
```

Allowed Submission types:

```ts
single;
family;
```

Allowed roles:

```ts
agent;
admin;
```

Allowed primary surfaces:

Agent:

```text
My submissions
Submission drawer
```

Admin:

```text
Review
Export
Submission drawer
Excel preview
```

Spain is fixed metadata.

```ts
countryCode: "ES";
countryLabel: "Испания";
```

Do not add country selection.

V-19 must not add or preserve as primary surfaces:

- CRM;
- People screen;
- Families screen;
- Groups;
- analytics dashboard;
- AI checker;
- AI filters;
- board view;
- saved filters;
- legal promise screens;
- multi-country selection.

Applicants, questionnaire, files, issues, and history exist inside Submission. They are not standalone products.

Do not add navigation items just to fill the sidebar.

Do not hide removed features with CSS. Remove forbidden scope from:

- routes;
- route constants;
- navigation config;
- permissions;
- feature flags;
- fixtures;
- mock data;
- search aliases;
- telemetry labels;
- tests;
- copy;
- component names where relevant.

V-19 implementation order:

```text
1. Scope cleanup
2. Domain engine
3. App shell
4. Agent workspace
5. Submission drawer
6. Creation flow
7. Admin review
8. Export
9. Hardening
```

Domain engine must come before production UI wiring:

- types;
- status;
- commands;
- guards;
- selectors;
- issue lifecycle;
- tests.

Do not implement status transitions inside React components.

---

## 1.2 VisaFlow Visual Lock

The current VisaFlow UI is already a 90+ dark premium SaaS interface.

Preserve its visual soul.

Do not reinterpret “premium” as a redesign.

Visual source of truth:

1. `docs/VISAFLOW_VISUAL_LOCK.md`, if present;
2. current app screenshots;
3. existing tokens/styles.

If `docs/VISAFLOW_VISUAL_LOCK.md` does not exist and the task touches visual tokens, create it.

### Locked dark surfaces

```css
--vf-bg-app: #070809;
--vf-bg-shell: #0b0c0e;
--vf-bg-panel: #0e1013;
--vf-bg-row: #15171b;
--vf-bg-row-hover: #191c21;
--vf-bg-control: #1a1c21;

--vf-border-subtle: rgba(255, 255, 255, 0.08);
--vf-border-strong: rgba(255, 255, 255, 0.13);
```

### Locked text

```css
--vf-text-primary: #f3f4f6;
--vf-text-secondary: #b2b6bf;
--vf-text-muted: #8f949e;
```

### Locked indigo accent / focus

```css
--vf-accent: #6874e8;
--vf-accent-hover: #7580ee;
--vf-accent-active: #5964d6;
--vf-focus: #7c84ff;
```

### Locked neutral selected state

```css
--vf-selected-bg: #25272d;
--vf-selected-bg-hover: #2a2d34;
--vf-selected-border: rgba(255, 255, 255, 0.11);
--vf-selected-text: #f3f4f6;

--vf-nav-selected-bg: #25272d;
--vf-nav-selected-border: rgba(255, 255, 255, 0.12);

--vf-row-selected-bg: #181b21;
--vf-row-selected-border: rgba(104, 116, 232, 0.72);
```

### Locked red

```css
--vf-red: #ff5c67;
--vf-red-hover: #ff6b75;
--vf-red-active: #e94d59;
--vf-red-fg: #18080a;
--vf-red-soft-bg: rgba(255, 92, 103, 0.13);
--vf-red-soft-border: rgba(255, 92, 103, 0.48);
--vf-red-soft-text: #ff8a92;
```

### Locked yellow

```css
--vf-yellow: #f4b840;
--vf-yellow-hover: #ffc653;
--vf-yellow-active: #d99b25;
--vf-yellow-fg: #171006;
--vf-yellow-soft-bg: rgba(244, 184, 64, 0.13);
--vf-yellow-soft-border: rgba(244, 184, 64, 0.48);
--vf-yellow-soft-text: #f4b840;
```

### Locked green

```css
--vf-green: #45d082;
--vf-green-hover: #58df93;
--vf-green-active: #30b86a;
--vf-green-fg: #06150c;
--vf-green-soft-bg: rgba(69, 208, 130, 0.13);
--vf-green-soft-border: rgba(69, 208, 130, 0.48);
--vf-green-soft-text: #59df94;
```

### Status mapping

```text
returned / blocker / destructive = red
video / files / pending / warning = yellow
accepted / ready / success / complete = green
selected navigation/views = neutral gray
focus outline = indigo
active row border may use subtle indigo
```

### Visual rules

Preserve:

- current dark SaaS atmosphere;
- current density;
- current typography feel;
- current radii;
- current spacing;
- current graphite containers;
- current neutral gray selected states;
- current red/yellow/green status feeling.

Do not:

- redesign the UI;
- make backgrounds lighter;
- make backgrounds pure black;
- replace selected gray with indigo;
- replace selected gray with amber/yellow;
- add glow;
- add glassmorphism;
- add gradients;
- add heavy shadows;
- use Tailwind red/yellow/green directly in components;
- pick new semantic colors manually;
- change opacity of entire rows for draft/disabled states;
- introduce a new visual language.

Any UI change touching color, selected state, row styling, status chips, surfaces, or layout must preserve this lock and provide before/after screenshots under `docs/qa/` when screenshots are possible.

---

## 2. Public Commands

Use only these public controls:

```text
-go
-next
-pick N
-check
-ship
```

Aliases:

- `-go`: inspect, choose one bounded high-impact task, execute, verify, review, stop.
- `-next`: planning only; propose next high-impact tasks and do not edit files.
- `-pick N`: execute only selected task N from the latest batch.
- `-check`: verify current diff with the smallest relevant command stack.
- `-ship`: final release-confidence gate.

Forbidden public modes:

```text
$product
$engineer
$reviewer
$qa
-logic
-ui
-ux
-qa
-auto
-auto2
```

---

## 3. Operating Modes

Use only these modes internally.

### Architect Mode

Define:

- feature goal;
- business rules;
- data model;
- auth and permissions;
- Supabase tables/RLS if relevant;
- UX states;
- motion states;
- security risks;
- file structure;
- implementation plan;
- test plan.

### Builder Mode

Implement:

- clean typed code;
- separated UI/domain/data/security/AI logic;
- reusable components;
- required UX states;
- input validation;
- Supabase/Auth/RLS boundaries;
- smallest safe change.

### Auditor Mode

Check:

- architecture;
- security;
- RLS;
- auth and permissions;
- UX/UI;
- motion;
- accessibility;
- performance;
- tests;
- observability;
- file order;
- AI safety;
- visual lock compliance.

---

## 4. Skill / Tool Orchestration

First identify task type:

- fast fix;
- standard feature;
- premium feature;
- core product module;
- audit;
- release gate.

Use only relevant tools.

Default escalation order:

```text
files
→ targeted tests
→ browser proof
→ DevTools
→ domain-specific tool
→ review skill
→ heavy multi-provider review
```

Use at most one task-specific helper and one verifier unless risk clearly requires more or the user explicitly asks.

Prefer:

- repo files;
- exact code inspection;
- current runtime evidence;
- targeted tests.

Do not activate every available tool blindly.

If a helper/tool is unavailable, disabled, unauthenticated, or irrelevant, say so briefly and continue with the smallest safe fallback.

Budgets:

- Fast Fix: 0–1 extra skills, targeted file read, targeted proof.
- Standard Feature: Architect + Builder, optional Auditor, focused tests.
- Premium Feature: Architect + Builder + runtime QA, screenshots, accessibility and mobile proof.
- Core Product Module: full Architect/Builder/Auditor loop, security/RLS review, E2E, observability and rollback notes.

---

## 5. Platinum Product Standard

Every important user-facing feature must feel like a premium SaaS product:

- clear hierarchy;
- obvious primary action;
- dense but readable layout;
- no raw unfinished screens;
- no decorative metric walls;
- strong trust boundaries.

Important flows require states:

- loading;
- skeleton;
- empty;
- error;
- success;
- disabled;
- permission denied;
- mobile;
- accessibility;
- reduced motion.

Do not add polish while broken flows, runtime errors, trust issues, or accessibility regressions remain.

Premium does not mean redesigning VisaFlow’s current dark graphite UI.

---

## 6. UX/UI Rules

Use existing design tokens and reusable components before inventing variants.

Forms must include:

- labels;
- validation;
- helper text;
- error text;
- disabled state;
- submitting state;
- keyboard/focus support.

Cards must have a clear purpose.

Do not nest decorative cards inside cards.

Tables must support:

- scanning;
- empty state;
- loading state;
- overflow strategy;
- useful row actions.

Modals, drawers, toasts, command menus, AI panels, onboarding screens, and dashboards must have:

- clear entry;
- clear exit;
- accessible labels;
- focus behavior;
- reduced-motion support when animated.

Ban:

- random colors;
- random spacing;
- weak hierarchy;
- giant components;
- business logic inside UI;
- raw unstyled screens;
- inconsistent variants;
- visual changes that violate Visual Lock.

---

## 7. Motion Rules

Motion must communicate meaning:

- state change;
- hierarchy;
- feedback;
- loading;
- success;
- error;
- optimistic update;
- navigation.

Use transform and opacity first.

Avoid layout-thrashing animation.

Motion tokens:

```text
instant: 80ms
fast: 150ms
normal: 220ms
slow: 350ms
page: 300ms
tap scale: 0.98
hover scale: 1.01
disabled opacity: 0.5
```

Always support:

```css
prefers-reduced-motion
```

Ban:

- slow decorative animations;
- distracting loops;
- blocking animations;
- motion without accessibility fallback;
- motion on huge lists without virtualization.

---

## 8. Clean Architecture Rules

Separate:

- UI;
- application/use-case;
- domain;
- data/repository;
- infrastructure;
- security;
- AI.

UI components render state and dispatch actions.

UI must not own:

- complex business rules;
- permission logic;
- prompts;
- Supabase workflows;
- status transitions.

Domain/use-case code owns:

- readiness;
- status transitions;
- validation decisions;
- side-effect orchestration.

Repositories/services own:

- data access;
- mapping raw Supabase rows to safe domain models.

Security logic must be centralized and testable.

Ban:

- circular dependencies;
- giant utility files;
- vague helpers;
- raw unsafe DB objects in UI;
- mixed concerns.

---

## 9. File Structure Rules

Adapt to the repository before introducing structure.

Current accepted areas:

```text
src/lib
src/services
src/types
src/data
src/lib/supabase
supabase/
tests/
docs/qa/
docs/
```

Prefer feature-first structure for new major modules only:

```text
src/features/<feature>/ui
src/features/<feature>/components
src/features/<feature>/hooks
src/features/<feature>/actions
src/features/<feature>/services
src/features/<feature>/repositories
src/features/<feature>/schemas
src/features/<feature>/types
src/features/<feature>/tests
```

Shared code may grow under:

```text
src/shared/
```

Server-side concerns may grow under:

```text
src/server/
supabase/functions/
```

Do not move existing files for architecture purity.

Migrate only when a product task makes the boundary necessary.

File names must be specific.

Prefer:

```text
create-submission.use-case.ts
submission.repository.ts
submission.schema.ts
submission-permissions.ts
submission-empty-state.tsx
```

Avoid:

```text
utils.ts
helpers.ts
stuff.ts
data.ts
```

for new files.

---

## 10. Supabase Rules

Private data tables must have:

- RLS enabled;
- owner/user/org access relationship;
- indexes for common filters;
- `created_at`;
- `updated_at`;
- clear policies.

Never expose service role keys or private keys to client code.

Use migrations for schema changes.

Do not mutate production-like schema ad hoc.

Keep storage buckets private unless public access is explicitly required and reviewed.

Use safe selects.

Request only fields needed by the view/use case.

Paginate or limit list queries.

Ban unbounded private-data queries.

Add indexes for common:

- filters;
- joins;
- ownership checks;
- ordering.

RLS policies must be tested or explicitly reviewed for:

- agent visibility;
- admin visibility;
- ownership;
- denial paths.

Keep generated database types in sync when schema changes.

---

## 11. Auth & Permissions Rules

Auth is not authorization.

Centralize permission checks with explicit capabilities:

```ts
canRead;
canCreate;
canUpdate;
canDelete;
canInvite;
canManageBilling;
canUseAI;
```

For V-19, ensure role-safe capabilities for:

```ts
agent;
admin;
```

Check permissions server-side or in trusted Supabase/RLS boundaries.

UI hiding is not security.

Prevent:

- role escalation;
- cross-tenant access;
- cross-agent access;
- unauthorized export;
- unauthorized file access.

Log:

- admin actions;
- destructive actions;
- permission denials;
- security-relevant changes.

Confirm destructive actions and show the affected object clearly.

Demo/local auth may support local workflows, but must never be represented as production security.

---

## 12. Security Rules

Validate input at the boundary and again server-side for trusted writes.

Enforce authorization before:

- data access;
- file access;
- AI actions;
- exports;
- destructive operations.

Protect against:

- XSS;
- SQL injection;
- SSRF;
- IDOR;
- unsafe uploads;
- private data leakage;
- prompt injection;
- unsafe AI tool execution.

Use rate limits and quotas for:

- AI;
- API-like actions;
- uploads;
- exports;
- expensive workflows.

Never expose:

- stack traces;
- SQL errors;
- storage paths;
- tokens;
- internal DB details;
- secrets;
- private documents;
- private prompts.

Use:

```text
npm run verify:safety
```

for normal trust/copy/security-sensitive changes.

Use:

```text
npm run verify:security
```

for release-facing dependency/security checks.

---

## 13. Business Logic Rules

Business logic belongs in:

- use cases;
- domain services;
- focused services.

Business logic does not belong in:

- buttons;
- forms;
- pages;
- visual components.

Use schemas for non-trivial external input validation.

Normal business flow should return typed results instead of throwing.

Preferred shape:

```ts
type Result<T> = { ok: true; data: T } | { ok: false; error: AppError };
```

Use cases should:

- validate input;
- require auth;
- check permissions;
- validate business rules;
- execute data operations;
- handle side effects explicitly;
- return safe output.

Preserve VisaFlow domain truth:

```text
Readiness comes from deterministic checks and human review, not AI certainty.
```

---

## 14. V-19 Domain Rules

Submission statuses must be domain-owned.

Do not compute allowed transitions in React components.

`requiresAction` is a derived operational flag, not a persisted lifecycle status.

Issue lifecycle:

```text
open
→ fixed_by_agent
→ closed_by_admin
```

`fixed_by_agent` does not mean closed.

Acceptance is blocked while any blocking issue is:

```text
open
fixed_by_agent
```

Export is fail-closed.

Excel preview and workbook generation must use the same row model.

A mock download button is not proof of export.

Product-ready requires:

- runtime proof;
- role-safe browser flow;
- full E2E;
- accessibility evidence;
- responsive screenshots;
- transition tests;
- actual parsed Excel artifact;
- preview/workbook row match.

---

## 15. AI Helper Rules

AI helper must be:

- safe;
- scoped;
- logged;
- permissioned;
- validated.

VisaFlow AI may:

- explain;
- organize;
- simplify;
- prepare;
- summarize blockers;
- draft review-safe helper text.

VisaFlow AI may not:

- promise visas;
- estimate approval odds as certainty;
- claim official/government verification;
- fake OCR;
- fake uploads;
- fake results;
- decide outcomes.

AI pipeline:

```text
validate user
→ check permission
→ check quota/rate limit
→ build scoped context
→ exclude unnecessary private data
→ run AI
→ validate output
→ ask confirmation for dangerous actions
→ execute safe action
→ log result
→ return user-friendly response
```

Ban AI from:

- bypassing permissions;
- modifying critical data without validation;
- seeing secrets;
- trusting unvalidated output;
- executing tools without permission checks.

---

## 16. Async Jobs Rules

Use background jobs for:

- AI processing;
- email sending;
- file processing;
- report generation;
- imports;
- exports;
- billing webhooks;
- notifications;
- sync tasks;
- expensive workflows.

Jobs must have:

- status;
- ownership/context;
- idempotency key;
- retry policy for safe operations;
- failure logging.

Avoid duplicate side effects with idempotent writes.

Do not introduce a job system for tiny synchronous work.

---

## 17. Performance Rules

Frontend:

- code split;
- lazy-load heavy surfaces;
- use skeleton loading;
- virtualize large lists;
- debounce search;
- optimize images;
- keep bundle small.

Backend/data:

- paginate;
- limit queries;
- select only needed fields;
- index filters;
- cache stable data;
- use transactions for critical writes;
- move slow work to jobs.

AI:

- send minimal scoped context;
- stream when useful;
- cache deterministic outputs;
- rate limit;
- quota;
- track cost.

Avoid:

- re-render-heavy component designs;
- unnecessary global state;
- dependencies without clear product value.

Keep performance budgets passing unless a deliberate budget change is reviewed.

---

## 18. Error System

Use consistent typed errors.

Standard codes:

```text
VALIDATION_ERROR
AUTH_REQUIRED
PERMISSION_DENIED
NOT_FOUND
CONFLICT
RATE_LIMITED
AI_OUTPUT_INVALID
EXTERNAL_SERVICE_ERROR
DATABASE_ERROR
UNKNOWN_ERROR
```

Each error should include:

- `code`;
- `safeMessage`;
- `severity`;
- safe metadata when useful.

Never expose:

- secrets;
- stack traces;
- SQL internals;
- storage internals;
- provider raw errors.

UI must show actionable recovery where possible.

---

## 19. Testing Rules

Test business risk, not implementation noise.

Unit test:

- domain logic;
- status transitions;
- permission logic;
- validation;
- export/readiness rules;
- AI output validators;
- issue lifecycle;
- V-19 selectors.

Integration test repositories/services when touching:

- data mapping;
- Supabase;
- storage;
- external boundaries.

RLS tests or explicit policy review are required for private-data schema/policy changes.

E2E test critical flows:

- sign up;
- sign in;
- onboarding;
- create/update/delete core resources;
- permission denied;
- admin action;
- destructive action;
- VisaFlow handoff flows;
- V-19 draft-to-export flow when relevant.

UI/runtime changes require Playwright proof and screenshots under:

```text
docs/qa/
```

Visual-token changes require before/after screenshots when possible.

Accessibility-sensitive flows should include automated axe checks where practical.

---

## 20. Observability Rules

Log:

- auth failures;
- permission denials;
- destructive actions;
- admin actions;
- billing changes;
- AI tool calls;
- background job failures;
- failed external API calls;
- security events;
- export generation;
- export marking;
- issue creation/closure.

Do not log:

- secrets;
- tokens;
- private documents;
- unnecessary personal data;
- prompts with sensitive context;
- raw provider payloads unless explicitly safe.

Use stable event names.

Include user/org/case context only at minimum safe granularity.

---

## 21. Feature Flags

Use feature flags for:

- beta features;
- AI tools;
- new UI flows;
- pricing experiments;
- admin-only tools;
- gradual rollout;
- kill switches.

Centralize flag evaluation.

Defaults must be safe if flag config is missing.

Do not leave dead flags or flag-specific forks without cleanup plans.

Do not keep forbidden V-19 features as hidden flagged primary surfaces.

---

## 22. Data Lifecycle

For each important entity define:

- owner;
- access rules;
- export rules;
- deletion rules;
- soft delete need;
- audit trail need;
- retention;
- backup/restore;
- behavior when user/org is deleted.

Visa case data, applicant data, media, corrections, exports, appointments, and AI logs are sensitive.

Do not retain private data longer than needed.

Exports must include only eligible rows and safe fields.

Deletion and archival must preserve required audit integrity without exposing private data.

---

## 23. CI/CD Readiness

Before merge/deploy, use the smallest gate matching risk.

Normal code gate:

```text
npm run typecheck
targeted tests
npm run verify when runtime/build is affected
```

UI/runtime gate:

```text
npm run test:e2e
screenshots under docs/qa/
```

Security/release gate:

```text
npm run verify:security
```

Workflow/instruction gate:

```text
npm run verify:codex-hook
```

Ship gate:

```text
npm run verify:full
```

Do not claim done while relevant tests, verification, Critical, Serious, or Medium findings remain.

---

## 24. Response Contract

For substantial work, report:

```md
## Skill Activation

Skill Budget:
Applied:
Skipped:

## Plan

## Architecture

## Implementation

## UX States

## Motion & Micro-interactions

## Security Check

## Performance Check

## Tests

## Observability

## Final Verdict
```

For small fixes, shorten the response but still include:

- changed files;
- verification;
- risks;
- verdict.

For UI changes, include:

- screenshot paths;
- or a clear reason screenshots are not applicable.

For visual-token changes, include:

- replaced hardcoded colors;
- confirmation that layout did not change;
- before/after screenshots if possible.

Every final report must include verification run or a clear reason it was not run.

Include readiness delta for product-moving work.

---

## 25. Non-Negotiable Rules

- No business logic in UI.
- No complex Supabase calls in UI.
- No client-side-only security.
- No service role key on client.
- No private tables without RLS.
- No unvalidated input.
- No skipped auth checks.
- No skipped permission checks.
- No unnecessary private fields returned.
- No AI bypassing security.
- No prompt logic inside UI.
- No giant files.
- No vague utils.
- No duplicated permission logic.
- No dependencies without clear value.
- No abstractions without need.
- No missing loading/error/empty states for important flows.
- No ignored mobile UX.
- No ignored accessibility.
- No decorative-only motion.
- No animation without reduced-motion support.
- No unbounded DB queries.
- No missing rate limits for AI/API surfaces.
- No technical errors shown to users.
- No overengineering simple fixes.
- No violation of VisaFlow Visual Lock.
- No V-19 scope expansion.
- No hidden forbidden routes.
- No fake Excel/export proof.

---

## 26. Final Self-Audit

Before final verdict, check:

- Architecture: concerns separated, no accidental broad refactor.
- Scope: V-19 boundaries preserved.
- Visual Lock: current dark UI soul preserved.
- Security: input validation, auth, permissions, secrets, data exposure.
- RLS: private tables and storage protected when schema/data access changes.
- UX: hierarchy, primary action, states, copy, trust boundaries.
- Motion: meaningful, lightweight, reduced-motion safe.
- Accessibility: keyboard, focus, labels, contrast, mobile usability.
- Performance: bundle/query/render risks considered.
- AI safety: scoped, permissioned, validated, logged, no fake authority.
- Tests: targeted proof plus broader gate when risk requires it.
- Observability: important security/admin/AI/job events covered when relevant.
- File order: clear names, no vague utilities, no unrelated churn.
- Verification: fresh evidence exists before claiming done.

If proof is incomplete, say:

```text
Implementation complete, product-ready proof incomplete.
```

Do not say:

```text
Production-ready
Fully done
Ready to ship
```

unless the relevant proof gates actually passed.

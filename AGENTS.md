# V-19 Production Codex

## 0. Operating Contract

- Move the product toward the stated goal using the smallest valid stack, the smallest safe change, and fresh evidence.
- Optimize for product outcomes, not process.
- Never fake completion, readiness, OCR, uploads, AI decisions, official verification, production proof, or verification results.
- Public control stays simple and plugin-neutral: `-go`, `-next`, `-pick N`, `-check`, `-ship`, and explicit merge/push/deploy requests.
- Plugin-first means conditional routing, not plugin sprawl. Use a plugin, skill, MCP server, connector, browser, DevTools, reviewer, or live service only when it has a concrete source-truth, risk, or deliverable reason.
- Default escalation order: files, targeted tests, browser proof, DevTools, domain plugin, review skill, heavy multi-provider review.
- Use at most one task-specific helper and one verifier unless the risk clearly requires more or the user explicitly asks for more.
- Before repo edits, inspect branch/status and the relevant source truth. Before commit, push, merge, rebase, or destructive git steps, inspect the current diff and preserve unrelated dirty work.
- Do not expand scope silently. Stop and ask before touching auth, database, schema, deployment, production, admin, secrets, payments, or user data outside the declared scope.

## 1. Mission

- Build premium, secure, fast, production-grade VisaFlow software with clean architecture and excellent UX.
- Optimize for product outcomes: fewer visa case mistakes, faster readiness, clearer handoff to human review.
- This project is a React 19 + Vite 7 SPA with strict TypeScript, custom CSS/UI, Supabase JS, Vitest, and Playwright.
- Routing is currently local application state, not Next.js or React Router.
- Supabase is present through typed client/config, local-demo fallback, migrations, RLS policies, and private storage.
- Current durable logic lives mainly in `src/lib/workflow.ts`, domain types in `src/types/domain.ts`, and service boundaries in `src/services/`.
- Do not infer intended architecture from unrelated uncommitted dirty diffs.
- Do not fake completion, readiness, OCR, uploads, AI decisions, official verification, or production proof.

## 2. Operating Modes

Use only these modes:

- Architect Mode: define feature goal, business rules, data model, auth and permissions, Supabase tables/RLS, UX states, motion states, security risks, file structure, implementation plan, and test plan.
- Builder Mode: implement clean typed code, separate UI/domain/data/security/AI logic, use reusable components, handle UX states, validate inputs, respect Supabase/Auth/RLS, and avoid overengineering.
- Auditor Mode: check architecture, security, RLS, auth and permissions, UX/UI, motion, accessibility, performance, tests, observability, file order, and AI safety.

Workflow aliases are not modes:

- `-go`: inspect, choose one bounded high-impact task, execute through the smallest valid mode mix, verify, review, stop.
- `-next`: planning only; propose the next high-impact tasks and do not edit files.
- `-pick N`: execute only selected task N from the latest batch.
- `-check`: verify the current diff with the smallest relevant command stack.
- `-ship`: final release-confidence gate.

Forbidden legacy modes: `$product`, `$engineer`, `$reviewer`, `$qa`, `-logic`, `-ui`, `-ux`, `-qa`, `-auto`, `-auto2` as public operating modes.

## 3. Skill Orchestrator

- First identify task type: fast fix, standard feature, premium feature, core product module, audit, or release gate.
- Use only relevant skills/tools; never activate every available skill or plugin blindly.
- Prefer repo files, exact code inspection, and current runtime evidence over memory or generic assumptions.
- State applied and skipped skills when the choice affects risk, speed, or verification.
- Requirements/spec/task breakdown can use the available spec or planning surface only when acceptance criteria are the deliverable.
- Product design, UX research, flow audit, prototype, or visual direction can use product-design, stark, universal-design, or browser evidence only when there is a real design target.
- Implementation, debugging, tests, and refactors should usually use repo files and the relevant test command first; add development skills only for a concrete language/framework need.
- Browser, Chrome DevTools, GitHub, Vercel, Supabase, database, document, spreadsheet, analytics, or live connectors are activated only when that source truth or deliverable is in scope.
- Final review, architecture risk, debt, test-health, or release readiness can use one review surface when risk justifies it.
- If helpers overlap, choose the one with stronger local source truth, lower noise, clearer rollback, and better verification.
- If a named helper is unavailable, disabled, unauthenticated, or irrelevant, say so briefly and continue with the smallest safe fallback.
- Fast Fix budget: 0-1 extra skills, targeted file read, targeted proof.
- Standard Feature budget: Architect plus Builder, optional Auditor, focused tests.
- Premium Feature budget: Architect plus Builder plus runtime QA, screenshots, accessibility and mobile proof.
- Core Product Module budget: full Architect/Builder/Auditor loop, security/RLS review, E2E, observability and rollback notes.

## 4. Platinum Product Standard

- Every important user-facing feature must feel like a premium SaaS product: clear hierarchy, strong primary action, dense but readable layout, and no raw unfinished screens.
- Required states for important flows: loading, skeleton, empty, error, success, disabled, permission denied, mobile, accessibility, and reduced motion.
- The primary action must be obvious; secondary actions must not compete visually.
- Trust-sensitive copy must explain uncertainty and next human action instead of pretending certainty.
- Mobile quality must not be lower than desktop quality.
- UI changes require fresh visual proof and screenshots under `docs/qa/`.
- Do not add polish while broken flows, runtime errors, trust issues, or accessibility regressions remain.

## 5. Premium UX/UI Rules

- Use reusable components and existing design tokens before inventing new variants.
- Keep typography, spacing, color, radius, shadow, and component variants consistent across the app.
- Forms must include labels, validation, helper/error text, disabled/submitting states, and keyboard/focus support.
- Cards must have a clear purpose; do not nest decorative cards inside cards.
- Tables must support scanning, empty/loading states, overflow strategy, and useful row actions.
- Modals, drawers, toasts, command menus, AI assistant panels, onboarding screens, and dashboards must have clear entry/exit states and accessible labels.
- Use dashboards for decisions and monitoring, not decorative metric walls.
- Ban random colors, random spacing, weak hierarchy, giant components, business logic inside UI, raw unstyled screens, and inconsistent variants.

## 6. Motion UX Rules

- Motion must communicate meaning: state change, hierarchy, feedback, loading, success, error, optimistic update, or navigation.
- Use transform and opacity first; avoid layout-thrashing animation.
- Motion tokens:
  - duration: instant `80ms`, fast `150ms`, normal `220ms`, slow `350ms`, page `300ms`
  - easing: standard, entrance, exit, emphasized
  - spring: subtle, snappy, soft
  - scale: tap `0.98`, hover `1.01`
  - opacity: hidden `0`, visible `1`, disabled `0.5`
- Buttons should respond to hover, press, disabled, loading, and success/error states.
- Cards, lists, tables, forms, navigation, modals, drawers, AI helper, loading states, and page transitions may use lightweight motion when it clarifies state.
- Always support `prefers-reduced-motion`.
- Ban slow decorative animations, distracting loops, blocking animation, motion without accessibility fallback, and motion on huge lists without virtualization.

## 7. Clean Architecture Rules

- Separate UI, application/use-case, domain, data/repository, infrastructure, security, and AI layers.
- UI components render state and dispatch actions; they must not own complex business rules, permission logic, prompts, or Supabase workflows.
- Domain/use-case code owns readiness, status transitions, validation decisions, and side effects orchestration.
- Repositories/services own data access and mapping between raw Supabase rows and safe domain models.
- Security logic must be centralized and testable, not duplicated across components.
- AI logic must live behind explicit services/actions with validators and guardrails.
- Ban circular dependencies, giant utility files, vague helpers, raw unsafe DB objects in UI, and mixed concerns.

## 8. File Structure Rules

- Adapt to the current repository before introducing new structure.
- Current accepted areas: `src/lib`, `src/services`, `src/types`, `src/data`, `src/lib/supabase`, `supabase/`, `tests/`, `docs/qa/`.
- Prefer feature-first structure for new major modules only:
  - `src/features/<feature>/ui`
  - `src/features/<feature>/components`
  - `src/features/<feature>/hooks`
  - `src/features/<feature>/actions`
  - `src/features/<feature>/services`
  - `src/features/<feature>/repositories`
  - `src/features/<feature>/schemas`
  - `src/features/<feature>/types`
  - `src/features/<feature>/tests`
- Shared code may grow under `src/shared/` for reusable UI, hooks, lib, auth, config, types, schemas, constants, motion, errors, and utils.
- Server-side concerns may grow under `src/server/` or `supabase/functions/` for db, auth, AI, jobs, security, and observability.
- Do not move existing files for architecture purity; migrate only when a product task makes the boundary necessary.
- File names must be specific: prefer `create-project.use-case.ts`, `project.repository.ts`, `project.schema.ts`, `project-permissions.ts`, `project-empty-state.tsx`.
- Avoid `utils.ts`, `helpers.ts`, `stuff.ts`, and vague `data.ts` for new files.

## 9. Supabase Rules

- Private data tables must have RLS enabled, owner/user/org access relationship, indexes for common filters, `created_at`, `updated_at`, and clear policies.
- Never expose a service role key or private key to client code.
- Use migrations for schema changes; do not mutate production-like schema ad hoc.
- Keep storage buckets private unless public access is explicitly required and reviewed.
- Use safe selects: request only fields needed by the view/use case.
- Paginate or limit list queries; ban unbounded private-data queries.
- Add indexes for common filters, joins, ownership checks, and ordering.
- RLS policies must be tested or reviewed for agent/admin visibility, ownership, and denial paths.
- Keep generated database types in sync when schema changes.

## 10. Auth & Permissions Rules

- Auth is not authorization.
- Centralize permission checks with explicit capabilities such as `canRead`, `canCreate`, `canUpdate`, `canDelete`, `canInvite`, `canManageBilling`, and `canUseAI`.
- Check permissions server-side or in trusted Supabase/RLS boundaries; UI hiding is not security.
- Prevent role escalation and cross-tenant or cross-agent access.
- Separate billing/admin permissions from normal user permissions.
- Log admin actions, destructive actions, permission denials, and security-relevant changes.
- Confirm destructive actions and show the affected object clearly.
- Demo/local auth may support local workflows, but must never be represented as production security.

## 11. Security Rules

- Validate input at the boundary and again server-side for trusted writes.
- Enforce authorization before data access, file access, AI actions, exports, and destructive operations.
- Protect against XSS, SQL injection, SSRF, IDOR, unsafe uploads, private data leakage, prompt injection, and unsafe AI tool execution.
- Use rate limits and quotas for AI, API-like actions, uploads, exports, and expensive workflows.
- Keep secrets in environment/server contexts only; never in client code, screenshots, logs, or prompts.
- Do not expose stack traces, SQL errors, storage paths, tokens, or internal DB details to users.
- Return only fields needed for the current use case.
- Use `npm run verify:safety` for normal trust/copy/security-sensitive changes and `npm run verify:security` for release-facing dependency/security checks.

## 12. Business Logic Rules

- Business logic belongs in use cases, domain services, or focused services, not in buttons/forms/pages.
- Use schemas for external input validation when the boundary is non-trivial.
- Normal business flow should return typed results instead of throwing.
- Preferred result shape:

```ts
type Result<T> = { ok: true; data: T } | { ok: false; error: AppError };
```

- Use cases should: validate input, require auth, check permissions, validate business rules, execute data operations, handle side effects explicitly, and return safe output.
- Keep use cases testable without rendering UI.
- Preserve VisaFlow domain truth: readiness comes from deterministic checks and human review, not AI certainty.

## 13. AI Helper Rules

- AI helper must be safe, scoped, logged, permissioned, and validated.
- VisaFlow AI may explain, organize, simplify, prepare, summarize blockers, and draft review-safe helper text.
- VisaFlow AI may not promise visas, estimate approval odds, claim official/government verification, fake OCR/uploads/results, or decide outcomes.
- Preferred AI structure:
  - `server/ai/prompts`
  - `server/ai/tools`
  - `server/ai/context`
  - `server/ai/validators`
  - `server/ai/safety`
  - `server/ai/logging`
  - `server/ai/rate-limit`
  - `server/ai/actions`
- AI pipeline: validate user, check permission, check quota/rate limit, build scoped context, exclude unnecessary private data, run AI, validate output, ask confirmation for dangerous actions, execute safe action, log result, return user-friendly response.
- Ban AI bypassing permissions, modifying critical data without validation, seeing secrets, trusting unvalidated output, or executing tools without permission checks.

## 14. Async Jobs Rules

- Use background jobs for AI processing, email sending, file processing, report generation, imports, exports, billing webhooks, notifications, sync tasks, and expensive workflows when synchronous UI would be slow or fragile.
- Jobs must have status, ownership/context, idempotency key, retry policy for safe operations, and failure logging.
- Avoid duplicate side effects by making writes idempotent.
- Surface job state in UI: queued, running, succeeded, failed, retrying, cancelled when relevant.
- Do not introduce a job system for tiny synchronous work.

## 15. Performance Rules

- Frontend: code split, lazy load heavy surfaces, use skeleton loading, virtualize large lists, debounce search, optimize images, and keep client bundle small.
- Backend/data: paginate, limit queries, select only needed fields, index filters, cache stable data, use transactions for critical writes, and move slow work to jobs.
- AI: send minimal scoped context, stream when useful, cache deterministic outputs, rate limit, quota, and track cost.
- Avoid re-render-heavy component designs and unnecessary global state.
- Keep `scripts/verify-performance.mjs` budgets passing unless a deliberate budget change is reviewed.
- Do not add dependencies without clear product value and bundle/performance awareness.

## 16. Error System

- Use consistent typed errors for application/business failures.
- Standard codes:
  - `VALIDATION_ERROR`
  - `AUTH_REQUIRED`
  - `PERMISSION_DENIED`
  - `NOT_FOUND`
  - `CONFLICT`
  - `RATE_LIMITED`
  - `AI_OUTPUT_INVALID`
  - `EXTERNAL_SERVICE_ERROR`
  - `DATABASE_ERROR`
  - `UNKNOWN_ERROR`
- Each error should include `code`, `safeMessage`, `severity`, and safe metadata when useful.
- Never expose secrets, stack traces, SQL internals, storage internals, or provider raw errors to users.
- UI must show actionable recovery where possible.

## 17. Testing Rules

- Test business risk, not implementation noise.
- Unit test domain logic, status transitions, permission logic, validation, export/readiness rules, and AI output validators.
- Integration test repositories/services when data mapping, Supabase, storage, or external boundaries are touched.
- RLS tests or explicit policy review are required for private-data schema/policy changes.
- E2E test critical flows: sign up, sign in, onboarding, create/update/delete core resources, permission denied, billing changes, AI action, admin action, destructive action, and VisaFlow handoff flows when relevant.
- UI/runtime changes require Playwright proof and screenshots under `docs/qa/`.
- Accessibility-sensitive flows should include automated axe checks where practical.

## 18. Observability Rules

- Log auth failures, permission denials, destructive actions, admin actions, billing changes, AI tool calls, background job failures, failed external API calls, and security events.
- Track error rate, latency, AI usage, AI cost, job success/failure, activation events, funnel events, and slow queries when relevant.
- Logs must not contain secrets, tokens, private documents, unnecessary personal data, prompts with sensitive context, or raw provider payloads unless explicitly safe.
- Use stable event names and include user/org/case context only at the minimum safe granularity.
- Observability requirements scale with risk; tiny UI fixes do not need new logging.

## 19. Feature Flags

- Use feature flags for beta features, AI tools, new UI flows, pricing experiments, admin-only tools, gradual rollout, and kill switches.
- Centralize flag evaluation.
- Defaults must be safe if flag config is missing.
- Do not leave dead flags or flag-specific forks without cleanup plans.
- Avoid feature flags for tiny internal refactors with no rollout risk.

## 20. Data Lifecycle

- For each important entity, define owner, access rules, export rules, deletion rules, soft delete need, audit trail need, retention, backup/restore, and behavior when user or organization is deleted.
- Visa case data, applicant data, media, corrections, exports, appointments, and AI logs are sensitive.
- Do not retain private data longer than needed for the product/legal purpose.
- Exports must include only eligible rows and safe fields.
- Deletion and archival must preserve required audit integrity without exposing private data.

## 21. CI/CD Readiness

- Before merge/deploy, use the smallest gate that matches the risk.
- Normal code gate: `npm run typecheck`, targeted tests, and `npm run verify` when runtime/build is affected.
- UI/runtime gate: `npm run test:e2e` plus screenshots under `docs/qa/`.
- Security/release-facing gate: `npm run verify:security`.
- Workflow/instruction gate: `npm run verify:codex-hook` when AGENTS, hooks, prompts, operating memo, or workflow scripts change.
- Ship gate: `npm run verify:full`.
- Do not claim done while relevant tests, verification, Critical, Serious, or Medium findings remain.

## 22. Response Contract For Future Agents

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

- For small fixes, shorten the response but still include changed files, verification, risks, and verdict.
- For critical systems, use the full structure.
- Every final report must include verification run or a clear reason it was not run.
- UI changes must list screenshot paths or explain why screenshots are not applicable.
- Include readiness delta for product-moving work.

## 23. Non-Negotiable Rules

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

## 24. Final Self-Audit

Before final verdict, check:

- Architecture: concerns separated, no accidental broad refactor.
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

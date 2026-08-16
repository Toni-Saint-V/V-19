# V-19 Production Readiness Audit

Date: 2026-06-15  
Branch: `audit/production-readiness-plan`  
Base: `origin/main` at `13b68fe3b32ba387aef55e882e318b463d749017`  
Scope: codebase audit and production plan only. No runtime fixes, redesign, production Supabase mutation, OCR, official verification, visa decisioning, or AI outcome claims were added.

## 1. Executive verdict

- Production readiness score: **58/100**
- Launch verdict: **Not ready / NO-GO for real production use**
- Local demo readiness: **78/100** for a task-first operations cockpit using seeded/local state.
- Sandbox readiness: **65/100** based on existing Supabase contracts and prior sandbox evidence, but fresh sandbox smoke was not run in this worktree because `.env.supabase-smoke.local` is absent.
- Production activation readiness: **Blocked**. Fresh `node scripts/verify-production-readiness.mjs --expect-blocked` passed fail-closed with **34 production blockers**.
- Biggest blocker: the implemented user-facing cockpit in `src/App.tsx` is still a local `localStorage` workflow and is not wired to the Supabase auth/persistence/storage/export services that exist elsewhere in the codebase.
- Fastest serious path to production: wire the current Agent/Admin/Export cockpit to the existing Supabase session, persistence, private storage, and export services; then close the production smoke-account, backup/restore, env evidence, browser QA, logging, and Go/No-Go blockers.
- What must not be built yet: OCR, visa approval probability, official/government verification, broad CRM/dashboard expansion, billing, Figma redesign, speculative AI automation, or a second domain model.

Readiness by area:

| Area                  | Score | Verdict                                                 |
| --------------------- | ----: | ------------------------------------------------------- |
| Product flow          |    62 | Strong local MVP shape, not production-backed           |
| Frontend architecture |    66 | Usable cockpit, but active UI owns too much state       |
| Backend/API/data      |    58 | Solid Supabase contracts, not fully wired to active UI  |
| Supabase/infra        |    64 | RLS/storage/runbooks exist, activation remains blocked  |
| Security/data safety  |    62 | Good fail-closed posture, missing production proof      |
| Testing/QA            |    74 | Strong local tests, no CI workflow, no fresh live smoke |
| UI/UX quality         |    72 | Premium task-first UI, needs real upload/export states  |
| Release readiness     |    48 | Local gates pass, production gate has 34 blockers       |

Audit basis:

- Files inspected: `src/App.tsx`, `src/modules/submissions/*`, `src/services/*`, `src/lib/workflow.ts`, `src/lib/supabase/*`, `supabase/`, `tests/`, `scripts/`, `docs/release/`, `.env.example`, `package.json`.
- Routes/screens inspected: local SPA surfaces `agent-submissions`, `admin-review`, `export`, create drawer, detail drawer, access gate.
- Tests/verifiers inspected: Vitest unit/integration, Playwright E2E, Supabase live smoke, Supabase release verifier, production readiness verifier, safety verifier, performance verifier.
- Tool availability: Claude Octopus provider check returned no available provider output; Chrome DevTools MCP could not attach because the shared profile was already running; PDF export was not used because Markdown is the requested artifact.

Fresh verification summary:

| Check                                                           | Result                                                                                              |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `npm ci`                                                        | Pass, 340 packages installed, 0 vulnerabilities                                                     |
| `npm run typecheck`                                             | Pass                                                                                                |
| `npm run lint`                                                  | Pass                                                                                                |
| `npm run test`                                                  | Pass, 15 files / 101 tests                                                                          |
| `npm run build`                                                 | Pass                                                                                                |
| `npm run verify:safety`                                         | Pass                                                                                                |
| `npm run verify:supabase-release`                               | Pass, 55 checks                                                                                     |
| `node scripts/verify-production-readiness.mjs --expect-blocked` | Pass fail-closed, 34 blockers                                                                       |
| `npm run test:e2e`                                              | Pass, 28 Playwright tests                                                                           |
| `npm run verify:full`                                           | Pass, includes typecheck/lint/safety/boundary/tests/build/performance/Supabase release/security/E2E |
| `npm run test:supabase-live`                                    | Not run: `.env.supabase-smoke.local` is absent in this worktree                                     |
| `npm run test:e2e:supabase`                                     | Not run: sandbox smoke env is absent                                                                |

Fresh screenshots:

- `docs/qa/production-readiness-audit-agent-desktop.png`
- `docs/qa/production-readiness-audit-admin-desktop.png`
- `docs/qa/production-readiness-audit-export-desktop.png`
- `docs/qa/production-readiness-audit-agent-mobile.png`

## 2. Current product reality

What is actually implemented now:

- The active app is a React 19 + Vite 8 SPA with local app state, not Next.js and not React Router.
- `src/App.tsx` is the active entry for the production-visible cockpit. It imports `src/modules/submissions/*`, loads seeded submissions through `loadSubmissions()`, persists them to `localStorage`, and switches surfaces using local state.
- Agent surface exists: `Мои подачи`, create submission drawer, city filter, search, tabs, detail drawer, questionnaire fields, local file-state buttons, issues, and deterministic local AI suggestions.
- Admin surface exists: `Проверка`, review queue, precise issue composer, return/accept decisions, correction closing, and role-separated actions.
- Export surface exists: `Выгрузка`, ready/history tabs, package validation, generated/downloaded/exported state progression, and preview rows.
- Role separation exists in UI logic, but the active cockpit uses dev role switching or preconfigured local email allow-lists, not production Supabase auth in `App.tsx`.
- Required media are represented in the active cockpit as three local file slots: `photo`, `selfie`, `video`. Clicking upload changes state; no real file picker/storage upload occurs in the active cockpit.
- The Supabase service layer exists separately: auth, profile, submission mapping, storage validation, workspace persistence, production activation guard, Edge-function AI helper contracts, RLS/storage migrations, and release runbooks.
- The Supabase service layer is not imported by the active `src/App.tsx` cockpit. `useWorkspacePersistence`, `loadWorkspaceSubmissions`, `saveWorkspaceSubmission`, `uploadMediaToStorage`, `createXlsxBlob`, and `createCsvBlob` are present but dormant for the current UI entry.
- Production promotion documentation exists and records a production project, applied migrations through `20260614000000_ai_helper_audit_quota`, and a local-only security hardening migration. Production activation remains explicitly blocked.
- No `.github/workflows` CI files were found.

What is not implemented in the active product flow:

- Real production sign-up/login through Supabase in the active cockpit.
- Durable agent/admin submission persistence from active UI.
- Real browser file inputs and private storage uploads from active UI.
- Real downloadable Excel/ZIP from active UI.
- Production smoke accounts, backup/restore proof, post-activation browser QA, logging evidence, and final owner Go/No-Go.
- Appointment handoff UI beyond status/export planning.
- A single canonical domain model shared by UI, Supabase persistence, export, and tests.

## 3. Intended MVP production target

Minimum real production version:

- Agent flow: authenticated agent signs in, sees only own submissions, creates tourist or family submission for Spain, selects city, fills trip and applicant data, uploads the required media, sees deterministic readiness/blockers, submits, receives corrections, fixes, and resubmits.
- Admin flow: authenticated admin sees global queue, opens a submission, reviews applicant fields and media, adds precise issues, returns for correction, accepts only when blockers are closed, and prepares export.
- Submission model: one submission has type `single` or `family`, country/city/trip dates, lifecycle status, agent owner, readiness, applicants, media assets, corrections, export state, appointment handoff state, and durable status history.
- Applicant/family model: each applicant has required questionnaire fields, role in the family, media slots, and per-applicant readiness. Family grouping should remain inside the submission until cross-submission grouping is proven necessary.
- Media requirements: each applicant needs photo on white background, selfie/photo, and approximately one-minute video. Uploads must use private storage, generated safe filenames, MIME/extension/size limits, owner/admin policies, and review status.
- Status lifecycle: draft -> filling/in progress -> submitted/waiting review -> returned/corrections received -> accepted/ready for export -> exported -> appointment handoff. Invalid role/state transitions must fail server-side.
- Corrections loop: admin issues must be scoped to applicant/field/media, visible to the agent, and close only after agent evidence and admin review.
- Export flow: accepted submissions only, no mixed city/date/type packages unless explicitly supported, generated XLSX/CSV or ZIP artifact, durable export batch, and safe spreadsheet values.
- Safety boundaries: the product prepares and reviews packages. It does not promise visas, estimate approval odds, claim official verification, fake OCR, fake uploads, or decide outcomes.

## 4. Critical blockers

### Blocker 1: Active cockpit is local-demo, not production-backed

- Problem: `src/App.tsx` uses `loadSubmissions()` / `saveSubmissions()` from `src/modules/submissions/persistence.ts`, which reads and writes `localStorage`.
- Why it blocks production: real agents/admins would lose cross-device durability, role-scoped server truth, audit integrity, and reliable handoff.
- Severity: critical
- Exact affected files/routes/components: `src/App.tsx`, `src/modules/submissions/persistence.ts`, `src/modules/submissions/*`; dormant production candidates in `src/hooks/useWorkspacePersistence.ts`, `src/services/workspacePersistenceService.ts`, `src/services/submissionService.ts`.
- Required fix: wire the current cockpit to Supabase session and workspace persistence behind a fail-closed feature/activation gate, while keeping local-demo fallback explicit.
- Acceptance criteria: agent/admin sign-in loads server rows; agent sees only own submissions; admin sees global queue; create/update/submit/return/accept/export state changes persist through reload and another browser session; local-demo remains clearly marked.

### Blocker 2: Production activation gate is intentionally blocked

- Problem: fresh production readiness verifier reports 34 blockers, including smoke accounts, backup/restore, env flags, browser QA, logs, post-activation checks, and Go/No-Go.
- Why it blocks production: production data and visa media cannot be handled without verified access, rollback, observability, and owner acceptance.
- Severity: critical
- Exact affected files/routes/components: `docs/release/supabase-production-readiness.json`, `docs/release/supabase-production-approval-checklist.md`, `scripts/verify-production-readiness.mjs`, `.env.example`.
- Required fix: close the production approval checklist with real evidence; do not bypass the fail-closed gate.
- Acceptance criteria: `node scripts/verify-production-readiness.mjs` passes without `--expect-blocked`; production env flags are set only after approval; post-activation smoke and rollback evidence are recorded.

### Blocker 3: Upload buttons do not upload real files in the active cockpit

- Problem: `uploadRequiredFile()` flips a file slot to `uploaded` and records `uploadedAt: "сейчас"` without a `File`, storage target, MIME/size validation, or Supabase storage call.
- Why it blocks production: media is the core visa package risk. A UI-only upload state would falsely imply that passport/media files exist.
- Severity: critical
- Exact affected files/routes/components: `src/modules/submissions/submissionActions.ts`, `src/modules/submissions/components/SubmissionDrawer.tsx`; production storage code exists in `src/services/storageService.ts` and `src/services/storagePathPolicy.ts`.
- Required fix: replace local upload state changes with real file input, storage validation, upload progress, rollback on failed metadata persistence, signed preview access, and clear failure states.
- Acceptance criteria: each applicant can upload three media files; invalid MIME/size/path is rejected before storage; successful upload writes private storage and media row; failed DB save removes uploaded object or leaves a clear recovery path; E2E covers happy and failure paths.

### Blocker 4: Export flow is a UI state machine, not a durable artifact flow

- Problem: active `ExportScreen` changes `exportState` through generate/download/exported buttons, but `createXlsxBlob()` / `createCsvBlob()` from `src/services/exportService.ts` are not wired to `src/App.tsx`.
- Why it blocks production: operators need an actual Excel/ZIP package and durable export batch, not only a local state transition.
- Severity: high
- Exact affected files/routes/components: `src/App.tsx`, `src/modules/submissions/pages/OperationsScreens.tsx`, `src/modules/submissions/exportRules.ts`, `src/services/exportService.ts`.
- Required fix: connect ready submissions to real XLSX/CSV generation, optional ZIP media packaging, export batch persistence, and download confirmation.
- Acceptance criteria: accepted submissions generate a downloadable file; rows include one applicant per row; formula injection is neutralized; export batch is durable; repeat export is blocked or explicitly marked.

### Blocker 5: Two domain models can drift

- Problem: active UI uses `src/modules/submissions/types.ts` statuses like `submitted_for_review` / `ready_for_export`, while service/Supabase code uses `src/types/domain.ts` statuses like `waiting_review` / `ready_for_excel`.
- Why it blocks production: persistence and UI can disagree on status, media type, issue status, readiness, export eligibility, and lifecycle rules.
- Severity: high
- Exact affected files/routes/components: `src/modules/submissions/types.ts`, `src/types/domain.ts`, `src/lib/workflow.ts`, `src/services/submissionService.ts`, Supabase migrations.
- Required fix: choose one canonical domain contract and add explicit adapters only at UI boundaries. Do not broad-refactor UI until persistence wiring requires it.
- Acceptance criteria: one status lifecycle is the source of truth; adapters are tested; server and UI guards agree; no hidden status mapping exists inside components.

### Blocker 6: Production auth/authorization is not active in the cockpit

- Problem: the active cockpit uses dev role switching or local email allow-lists. Supabase auth/profile services exist but are not the active session source in `App.tsx`.
- Why it blocks production: UI hiding is not authorization, and real agents/admins need server-backed identity and RLS-backed access.
- Severity: high
- Exact affected files/routes/components: `src/App.tsx`, `src/services/authService.ts`, `src/services/profileService.ts`, `src/lib/supabase/client.ts`, Supabase RLS migrations.
- Required fix: make Supabase session/profile the production session source; keep demo role switch disabled outside dev/local-demo.
- Acceptance criteria: unknown email cannot enter production workspace; agent/admin role comes from profile/RLS; cross-agent access is denied server-side and tested.

### Blocker 7: Audit/history trail in active UI is local and incomplete

- Problem: active cockpit history is an array of local strings inside each submission and does not write `status_history`.
- Why it blocks production: visa-document operations need durable accountability for return, correction, acceptance, export, and media review.
- Severity: high
- Exact affected files/routes/components: `src/modules/submissions/types.ts`, `src/modules/submissions/submissionActions.ts`, `src/services/statusHistoryService.ts`, Supabase `status_history`.
- Required fix: route all status/media/correction/export transitions through a persistence boundary that writes status history.
- Acceptance criteria: every important action records actor, timestamp, entity, from/to status, and safe comment; history survives reload and is role-readable.

### Blocker 8: AI helper is safe but not production-wired

- Problem: local deterministic AI suggestions are active; Edge function contracts, quota, audit, and provider boundary exist separately.
- Why it blocks production: AI in visa operations must be permissioned, rate-limited, audited, and output-validated at the server boundary.
- Severity: medium
- Exact affected files/routes/components: `src/modules/submissions/aiSuggestions.ts`, `src/modules/submissions/components/BbAiPanel.tsx`, `src/services/aiHelperFacade.ts`, `supabase/functions/_shared/ai-helper-*`.
- Required fix: keep deterministic local suggestions until the Edge helper is deployed with durable audit/quota and connected through `aiHelperFacade`.
- Acceptance criteria: helper calls require actor/role/canUseAI, admin-only intents are denied for agents, unsafe copy is rejected, audit contains only redacted metadata, quota failures fail closed.

### Blocker 9: No repository CI workflow exists

- Problem: no `.github/workflows` files were found.
- Why it blocks production: local verification is strong but cannot protect main branch or PRs automatically.
- Severity: medium
- Exact affected files/routes/components: repository root, GitHub settings.
- Required fix: add a minimal CI workflow after this audit PR, not in this docs-only branch.
- Acceptance criteria: PRs run install, typecheck, lint, tests, build, safety, Supabase release gate, and E2E where feasible.

### Blocker 10: Visual UX is strong but copy/state still overpromises upload/export completion

- Problem: UI labels such as upload/export actions are clear in demo, but they can imply real file and Excel completion before storage/export are wired.
- Why it blocks production: operators may trust a preparation state as evidence that a file exists or a package was delivered.
- Severity: medium
- Exact affected files/routes/components: `src/modules/submissions/components/SubmissionDrawer.tsx`, `src/modules/submissions/pages/OperationsScreens.tsx`.
- Required fix: after real upload/export wiring, add precise loading/error/success states. Before wiring, keep demo-only copy visible in non-production mode.
- Acceptance criteria: users can tell whether a file is only locally marked, uploaded to storage, accepted by admin, exported, downloaded, or handed off.

## 5. Risk register

| Risk                                              | Probability | Impact   | Mitigation                                                                  |
| ------------------------------------------------- | ----------- | -------- | --------------------------------------------------------------------------- |
| Local cockpit is launched as production           | High        | Critical | Keep activation fail-closed; wire Supabase before production claim          |
| Fake upload state is mistaken for stored media    | High        | Critical | Real file upload with storage/DB transaction and rollback                   |
| Agent/admin data leak                             | Medium      | Critical | Use Supabase Auth + RLS; live cross-agent denial smoke                      |
| Status model drift causes invalid handoff         | High        | High     | Canonical lifecycle contract plus adapter tests                             |
| Export rows miss required applicant/media fields  | Medium      | High     | Wire `exportService`, add export fixtures and spreadsheet validation        |
| Production rollback cannot be executed            | Medium      | High     | Close backup/restore/RPO/RTO checklist before activation                    |
| AI helper output creates unsafe authority         | Medium      | High     | Keep deterministic checks source of truth; server-side validation and audit |
| No CI allows regressions into main                | Medium      | High     | Add GitHub Actions gate after audit                                         |
| Mobile operator flow hides critical context       | Medium      | Medium   | Continue mobile screenshot/E2E coverage for agent/admin/export              |
| Broad redesign distracts from production blockers | High        | Medium   | Lock scope to persistence/upload/export/auth first                          |

## 6. Architecture findings

Good enough:

- The product direction is correct: a task-first Agent/Admin/Export cockpit, not a generic CRM.
- UI has clear role surfaces, visible next action, Russian operational copy, and strong local E2E coverage.
- Supabase migrations cover profiles, submissions, applicants, media assets, corrections, export batches, appointments, status history, RLS, private storage, runtime write guards, and AI helper audit/quota hardening.
- Safety posture is good: local-demo fallback, production approval flags, sandbox-only smoke, no service-role frontend env, and AI trust boundaries.

Fragile:

- `src/App.tsx` is a large state owner and owns product orchestration, role switching, drawer state, export state, and local persistence.
- `src/styles.css` and `SubmissionDrawer.tsx` are large enough to slow safe UI changes.
- The active UI model and Supabase model diverge in status names, media type names, issue statuses, export statuses, and lifecycle semantics.
- Production services and hooks are not active in the rendered product.

Must be refactored:

- Only refactor the domain boundary needed to connect the current cockpit to Supabase.
- Extract a canonical status/action contract with adapters for the current UI.
- Move upload/export persistence orchestration out of `App.tsx`.
- Route status history and correction writes through a service boundary.

Must not be refactored yet:

- Do not redesign the cockpit.
- Do not replace the existing task-first screens with a new dashboard shell.
- Do not introduce a new framework/router.
- Do not rewrite all Supabase migrations unless a production migration repair requires it.

Reusable components to create only when wiring needs them:

- `SubmissionRepository` adapter for active cockpit data.
- `MediaUploadField` with storage validation/progress/error.
- `ExportPackagePanel` wired to real artifact creation.
- `StatusHistoryTimeline` backed by durable `status_history`.
- `ProductionAccessGate` backed by Supabase session/profile.

## 7. Data model / backend plan

Minimum production data model:

- `profiles`: Supabase user id, email, display name, organization, role (`agent` / `admin`), created timestamp.
- `agents`: optional view or extension of `profiles`; avoid a separate table unless non-user agencies need billing/contract metadata.
- `submissions`: id, agent id, type, title, country, city, trip date/range, status, priority, readiness percent, family intelligence, appointment status, created/submitted/reviewed/accepted/exported/updated timestamps.
- `applicants`: submission id, full name, family role, confirmed role flag, passport, birth date, contact fields, citizenship, address, trip/hotel fields, questionnaire percent, media percent.
- `family grouping`: keep inside `submissions.type`, applicant roles, and optional family intelligence for MVP. Add cross-submission family groups only after a real operator need.
- `questionnaire/application fields`: use typed applicant columns for MVP-required fields; add flexible field-answer table later only when Spain/BLS field sets diverge by city or visa category.
- `media_assets`: applicant id, submission id, type (`photo_white`, `selfie`, `video`), generated filename, private bucket/path, MIME, size, upload status, review status, reviewed by/at.
- `issues/corrections`: submission id, applicant id, scope, field key/media type, reason, severity, status, created by/at, fixed at.
- `status_history`: entity type/id, from status, to status, actor, timestamp, safe comment.
- `export_batches`: created by/at, format, row count, submission ids, optional artifact path/checksum.
- `appointments`: submission id, status, city/date/time, operator comment, updated by/at.
- `ai_helper_audit_events` and quota counters: service-owned only, redacted metadata only.

Payments are out of scope.

## 8. Production roadmap

### Phase 0 - freeze and safety baseline

- Goal: prevent false readiness while the audit findings are executed.
- Exact tasks: keep local-demo and production activation fail-closed; add CI proposal; create a branch policy checklist; keep docs current.
- Dependencies: none.
- Acceptance criteria: `verify:full` passes; production gate remains blocked until evidence is real; no runtime changes are made without a scoped task.
- Estimated complexity: 2/10.
- Risk level: low.
- Suggested Codex route: qa.

### Phase 1 - auth/roles/data foundation

- Goal: make Supabase session/profile the production identity source for the active cockpit.
- Exact tasks: connect `useWorkspacePersistence` or an equivalent thin hook to `App.tsx`; disable demo switch in production; load agent/admin data from RLS-backed queries; add permission denial states.
- Dependencies: Supabase activation config, smoke users, profile rows.
- Acceptance criteria: agent/admin sign-in works; agent sees own rows only; admin sees global queue; unknown/unauthorized users fail closed.
- Estimated complexity: 7/10.
- Risk level: high.
- Suggested Codex route: logic.

### Phase 2 - agent submission flow

- Goal: persist create/edit/submit from the active Agent cockpit.
- Exact tasks: map active UI model to canonical domain; persist draft creation, questionnaire edits, applicant changes, readiness, and submit actions; reload after save failure.
- Dependencies: Phase 1, canonical status adapter.
- Acceptance criteria: created draft survives reload and another session; incomplete submit is blocked client and server side; errors are safe and actionable.
- Estimated complexity: 7/10.
- Risk level: high.
- Suggested Codex route: logic/ui.

### Phase 3 - admin review/correction queue

- Goal: make admin decisions durable and auditable.
- Exact tasks: persist precise issues, returned status, corrections received, close/accept, admin review timestamps, and status history.
- Dependencies: Phase 2, correction/status adapter.
- Acceptance criteria: admin return and accept survive reload; agent sees returned issues; fixed issues require admin closure; status history records actor/time/state.
- Estimated complexity: 7/10.
- Risk level: high.
- Suggested Codex route: logic/ui.

### Phase 4 - media upload + storage safety

- Goal: replace fake upload state with private storage uploads.
- Exact tasks: add file inputs; validate type/size/generated path; upload to `submission-media`; persist media row; create signed previews; rollback failed metadata writes.
- Dependencies: Phase 1/2, storage policies, smoke accounts.
- Acceptance criteria: photo/selfie/video upload works; invalid files fail; cross-agent storage access denied; post-handoff agent overwrite is blocked.
- Estimated complexity: 8/10.
- Risk level: high.
- Suggested Codex route: logic/ui/qa.

### Phase 5 - Excel/ZIP export

- Goal: make export an actual durable artifact.
- Exact tasks: wire `exportService` to the Export screen; generate XLSX/CSV; optionally package media ZIP; write export batch; prevent unsafe repeats.
- Dependencies: Phase 3/4.
- Acceptance criteria: accepted submissions generate a file; downloaded/exported state is durable; rows are correct; formula injection tests pass.
- Estimated complexity: 6/10.
- Risk level: medium.
- Suggested Codex route: logic/ui.

### Phase 6 - QA, security, release gate

- Goal: close production release blockers with fresh evidence.
- Exact tasks: run sandbox smoke, browser key audit, production smoke accounts, backup/restore proof, logs/error-rate check, CI, and production readiness verifier.
- Dependencies: Phases 1-5.
- Acceptance criteria: `verify:full`, `test:supabase-live`, `test:e2e:supabase`, and production readiness pass without blocked mode.
- Estimated complexity: 8/10.
- Risk level: high.
- Suggested Codex route: qa.

### Phase 7 - polish and operator efficiency

- Goal: improve speed and confidence after production foundations work.
- Exact tasks: refine density, empty/loading/error states, keyboard shortcuts, bulk review/export affordances, saved filters, and copy.
- Dependencies: Phases 1-6.
- Acceptance criteria: no broken flows; no unresolved Critical/High/Medium findings; desktop/mobile screenshots pass.
- Estimated complexity: 5/10.
- Risk level: medium.
- Suggested Codex route: ux/ui.

## 9. First 10 tasks to execute

### Task 1: Wire production session source into the active cockpit

- Why it comes now: no production access boundary exists in the visible app.
- Files likely affected: `src/App.tsx`, `src/hooks/useWorkspacePersistence.ts`, `src/services/authService.ts`.
- What not to touch: UI redesign, Supabase schema expansion, billing.
- Acceptance criteria: production mode uses Supabase session/profile; local-demo remains explicit; unauthorized users cannot enter.
- Recommended model level: XHigh.
- Required tools/plugins/skills: local code, targeted tests, bank-grade-review.

### Task 2: Add canonical status adapter between cockpit and Supabase domain

- Why it comes now: persistence wiring is unsafe while status models drift.
- Files likely affected: `src/modules/submissions/types.ts`, `src/types/domain.ts`, new focused adapter file.
- What not to touch: broad component refactor.
- Acceptance criteria: every UI status maps to one server status and back; invalid states are tested.
- Recommended model level: XHigh.
- Required tools/plugins/skills: local code, Vitest, bank-grade-review.

### Task 3: Persist agent draft/create/edit flow

- Why it comes now: it proves real agent data lifecycle before media and admin actions.
- Files likely affected: `src/App.tsx`, `src/services/workspacePersistenceService.ts`, adapter tests.
- What not to touch: admin review/export.
- Acceptance criteria: create/edit persists remotely; reload shows server state; save failure reloads or blocks safely.
- Recommended model level: XHigh.
- Required tools/plugins/skills: local code, Supabase sandbox smoke when env exists.

### Task 4: Replace fake media upload with real storage upload for one slot

- Why it comes now: media is the highest trust-sensitive user action.
- Files likely affected: `SubmissionDrawer.tsx`, `storageService.ts`, storage tests.
- What not to touch: ZIP export, OCR, AI media review.
- Acceptance criteria: one media slot uploads to private storage with MIME/size/path validation and rollback on failed persistence.
- Recommended model level: XHigh.
- Required tools/plugins/skills: Playwright, Supabase smoke, security review.

### Task 5: Extend real upload to all applicant media slots

- Why it comes now: MVP requires photo, selfie, and video per applicant.
- Files likely affected: media components, storage service, E2E.
- What not to touch: admin media scoring automation.
- Acceptance criteria: all slots per applicant upload, replace, preview, and fail safely.
- Recommended model level: ExtraHigh.
- Required tools/plugins/skills: Playwright, Supabase smoke.

### Task 6: Persist admin issue/return/accept lifecycle

- Why it comes now: production value depends on correction loop.
- Files likely affected: admin drawer/actions, submission service, status history.
- What not to touch: export artifact generation.
- Acceptance criteria: admin issue and return persist; agent sees issue; accept requires no blockers; history records action.
- Recommended model level: XHigh.
- Required tools/plugins/skills: Vitest, Playwright, bank-grade-review.

### Task 7: Wire real XLSX export artifact

- Why it comes now: accepted cases need handoff output.
- Files likely affected: `src/services/exportService.ts`, `OperationsScreens.tsx`, export tests.
- What not to touch: ZIP media package unless XLSX is proven.
- Acceptance criteria: real XLSX downloads; export batch persists; repeat export is blocked or marked.
- Recommended model level: ExtraHigh.
- Required tools/plugins/skills: local code, Playwright.

### Task 8: Add minimal CI workflow

- Why it comes now: local checks are not enough for PR/main protection.
- Files likely affected: `.github/workflows/ci.yml`.
- What not to touch: deploy workflow.
- Acceptance criteria: PR runs install, typecheck, lint, tests, build, safety, Supabase release gate; E2E strategy is documented.
- Recommended model level: High.
- Required tools/plugins/skills: GitHub, local verification.

### Task 9: Close fresh sandbox smoke evidence

- Why it comes now: production wiring must be proven before production approval.
- Files likely affected: docs/qa evidence only unless tests fail.
- What not to touch: production Supabase.
- Acceptance criteria: `test:supabase-live`, `test:e2e:supabase`, and `verify:full` pass with ignored sandbox env.
- Recommended model level: High.
- Required tools/plugins/skills: Supabase sandbox, Playwright.

### Task 10: Close production approval packet

- Why it comes now: final activation remains blocked by 34 evidence items.
- Files likely affected: `docs/release/supabase-production-readiness.json`, approval checklist, QA evidence.
- What not to touch: production activation until owner approves.
- Acceptance criteria: production readiness verifier passes without `--expect-blocked`; Go/No-Go is owner-approved and reversible.
- Recommended model level: XHigh.
- Required tools/plugins/skills: Supabase, GitHub, bank-grade-review.

## 10. Production gates

| Gate                  | Command or method                                                        | Pass criteria                                             | Fail behavior                           |
| --------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------- | --------------------------------------- |
| Build gate            | `npm run build`                                                          | TypeScript build and Vite bundle pass                     | Stop release; fix compile/bundle errors |
| Typecheck gate        | `npm run typecheck`                                                      | No TS errors                                              | Stop merge                              |
| Lint gate             | `npm run lint`                                                           | No ESLint errors                                          | Stop merge                              |
| Unit/integration gate | `npm run test`                                                           | All Vitest unit/integration tests pass                    | Stop merge                              |
| Safety gate           | `npm run verify:safety`                                                  | No unsafe copy/secret/boundary findings                   | Stop production claim                   |
| Auth/role gate        | Supabase sign-in + RLS smoke                                             | agent/admin/other-agent behavior verified                 | Keep local-demo or sandbox only         |
| Data/RLS gate         | `npm run verify:supabase-release` + live smoke                           | migration order, RLS, Storage guards pass                 | Do not apply/activate production        |
| Upload/storage gate   | `npm run test:supabase-live`                                             | private upload/read/overwrite denial verified             | Disable real upload                     |
| Admin queue gate      | Playwright role flow + status history assertions                         | admin review/return/accept durable                        | Do not onboard admins                   |
| Export gate           | export unit/E2E tests                                                    | downloadable artifact + durable batch + safe rows         | Do not mark export ready                |
| Security gate         | `npm run verify:security` + production approval checklist                | 0 high-risk dependency/security blockers                  | Stop release                            |
| UX smoke gate         | `npm run test:e2e` + screenshots                                         | desktop/mobile agent/admin/export pass                    | Stop UI release                         |
| Release gate          | `npm run verify:full` and `node scripts/verify-production-readiness.mjs` | all local gates pass and production verifier is unblocked | No production launch                    |

## 11. What to avoid

Overengineering traps:

- Adding microservices, job systems, or flexible field schemas before the current cockpit is production-backed.
- Rewriting all UI around a new router/framework.
- Adding abstraction layers that do not close auth, persistence, upload, export, or release blockers.

UI traps:

- Broad visual redesign while fake upload/export and local persistence remain.
- Dashboard clutter, People/Families/Groups CRM surfaces, or decorative charts.
- Hiding role/security problems behind better layout.

AI/safety traps:

- OCR claims before OCR exists.
- Approval probability or visa-outcome language.
- AI deciding acceptance, media quality, or official readiness.
- Sending raw applicant documents or direct personal data into helper audit logs.

Product traps:

- Treating local demo proof as production readiness.
- Optimizing polish before real storage/export/auth.
- Adding appointment automation before export and admin acceptance are durable.

Backend traps:

- Browser-exposed service-role/provider keys.
- Unbounded private data queries.
- Client-side-only authorization.
- Manual production schema edits instead of migrations.
- Dropping RLS/storage guards during rollback.

Codex workflow traps:

- Claiming done without fresh verification.
- Running live/prod actions without scoped env and owner approval.
- Staging unrelated docs/prototype clutter.
- Mixing docs audit with runtime fixes in one commit.

## 12. Final recommendation

The project is **not close to production activation**, but it is **closer than a prototype** because it already has a strong local operations cockpit, meaningful tests, Supabase contracts, private storage/RLS migrations, and fail-closed release documentation.

The shortest serious path is not a redesign. It is:

1. Wire the active cockpit to Supabase auth/profile/session.
2. Create a canonical status/domain adapter.
3. Persist agent create/edit/submit.
4. Replace local file-state buttons with real private storage upload.
5. Persist admin review/correction/acceptance and status history.
6. Wire real XLSX export.
7. Close sandbox and production evidence gates.

Do first: production session + persistence wiring for the existing cockpit.

Delay: OCR, AI provider activation, approval scoring, CRM expansion, billing, new dashboard surfaces, appointment automation, and broad visual redesign.

The product becomes usable by real agents/admins when a real agent can sign in, create a submission, upload all required media, submit it, receive precise admin corrections, resubmit, get accepted by a human admin, and produce a durable export package with full audit trail under RLS and private storage.

Final verdict: **NO-GO for production. GO for the next bounded production-hardening task: wire the current cockpit to Supabase-backed auth and persistence without changing the product shape.**

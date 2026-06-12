# VisaFlow AI Tasks for Codex

## How to Use This File

Each task is designed to be copied directly into Codex.

Before running a task:

1. Start from the correct branch.
2. Read `docs/codex/AGENTS.md`.
3. Read `docs/codex/ARCHITECTURE.md`.
4. Inspect the actual repository files named in the task.
5. Make only the requested changes.
6. Run the listed verification commands.
7. Report failures honestly.

Do not combine unrelated tasks. Do not skip domain tests when changing domain logic.

## Common Files/Folders Not to Touch Unless Explicitly Scoped

```text
node_modules/
dist/
.git/
test-results/
coverage/
.env
.env.local
package.json
package-lock.json
supabase/migrations/
src/lib/supabase/database.types.ts
```

Package manifests, Supabase migrations, and generated database types may be touched only when the task explicitly says so.

---

# 1. Repo Audit and Cleanup

## Task VF-CX-00 — Audit Current Repo and Create Implementation Baseline

### Branch Name

```text
chore/repo-audit-baseline
```

### Level of Difficulty

Easy

### Objective

Create a precise implementation baseline so later Codex tasks do not guess about current files, scripts, UI, tests, or architecture gaps.

### Context

The repo already contains React/Vite/Tailwind/Supabase/Vitest/Playwright assets and existing Codex docs. This task must not implement product features.

### Dependencies

None.

### Files/Folders to Touch

```text
docs/codex/
```

### Files/Folders Not to Touch

```text
src/
tests/
supabase/
package.json
package-lock.json
node_modules/
dist/
```

### Constraints

- Do not change application code.
- Do not install dependencies.
- Do not delete existing docs.
- Do not invent passed commands.

### Implementation Notes

- Inspect `package.json`, `src/`, `tests/`, `supabase/`, `docs/`, and `.codex/`.
- Update `docs/codex/PLANS.md` only if new facts differ from the current audit.

### Verification Commands

```bash
npm run typecheck
```

If this is docs-only and command execution is unavailable, state that no code changes were made.

### Done Criteria

- Audit facts are current.
- Existing scripts are listed accurately.
- Risks are updated.
- No production code changed.

### Copy-Paste Codex Prompt

```text
Read docs/codex/AGENTS.md and docs/codex/PLANS.md. Audit the repository without implementing product features. Inspect package.json, src/, tests/, docs/, .codex/, and supabase/. Update only docs/codex/PLANS.md if the detected stack, structure, reusable assets, missing pieces, commands, or risks differ from the current audit. Do not touch src/, tests/, supabase/, package.json, package-lock.json, node_modules/, or dist/. Run npm run typecheck if no environment blocker prevents it. Report exactly what changed and which commands ran.
```

---

## Task VF-CX-01 — Create Target Architecture Folders and Compatibility Barrels

### Branch Name

```text
chore/architecture-folders
```

### Level of Difficulty

Medium

### Objective

Create the target clean architecture folders without moving business logic yet, and add compatibility barrels only where they reduce migration risk.

### Context

Current domain logic is concentrated in `src/types/domain.ts` and `src/lib/workflow.ts`. Future workstreams need folders for `domain`, `application`, `features`, `shared`, and `infrastructure`.

### Dependencies

- VF-CX-00 recommended.

### Files/Folders to Touch

```text
src/domain/
src/application/
src/features/
src/shared/
src/infrastructure/
src/types/domain.ts
src/lib/workflow.ts
```

### Files/Folders Not to Touch

```text
src/App.tsx
src/styles.css
tests/e2e/
supabase/
package.json
package-lock.json
```

### Constraints

- Do not change runtime behavior.
- Do not refactor UI.
- Do not delete existing exports.
- Do not break existing imports.

### Implementation Notes

- Add empty `.gitkeep` or initial barrel files only where useful.
- Keep old imports working.
- Add comments only when they explain temporary migration boundaries.

### Verification Commands

```bash
npm run typecheck
npm run lint
npm run test
```

### Done Criteria

- Target folders exist.
- Existing tests pass.
- Existing imports continue working.
- No product behavior changed.

### Copy-Paste Codex Prompt

```text
Read docs/codex/ARCHITECTURE.md and inspect src/types/domain.ts, src/lib/workflow.ts, and current imports. Create the target clean architecture folder skeleton under src/domain, src/application, src/features, src/shared, and src/infrastructure. Do not move business logic yet. Add only safe barrel files or .gitkeep files needed for later migration. Preserve all existing imports and behavior. Do not touch src/App.tsx, src/styles.css, tests/e2e, supabase, or package manifests. Run npm run typecheck, npm run lint, and npm run test. Report files created and confirm no behavior changes were intended.
```

---

## Task VF-CX-02 — Normalize Submission Type Naming Through Constants

### Branch Name

```text
chore/submission-type-constants
```

### Level of Difficulty

Medium

### Objective

Introduce centralized submission type constants and a UI label map that supports both current `"single"` and product-facing Tourist wording.

### Context

Product docs use Tourist. Current code/data use `"single"`. This task prevents scattered string decisions.

### Dependencies

- VF-CX-01 recommended.

### Files/Folders to Touch

```text
src/domain/submissions/
src/types/domain.ts
src/lib/workflow.ts
tests/unit/
```

### Files/Folders Not to Touch

```text
src/App.tsx
src/styles.css
src/services/submissionService.ts
supabase/migrations/
package.json
package-lock.json
```

### Constraints

- Do not rename database columns or migration enum/check values.
- Do not rewrite existing demo data.
- Preserve current behavior.

### Implementation Notes

- Add constants like `SUBMISSION_TYPE.SINGLE_LEGACY`, `SUBMISSION_TYPE.TOURIST`, `SUBMISSION_TYPE.FAMILY`.
- Add `getSubmissionTypeLabel(type)` or equivalent.
- Replace high-risk magic strings in domain functions only.
- Keep tests covering both `"single"` and `"family"`.

### Verification Commands

```bash
npm run typecheck
npm run lint
npm run test
```

### Done Criteria

- Submission type strings are centralized in domain code.
- Current tests pass.
- No UI behavior changed.
- Tourist naming is available for future UI.

### Copy-Paste Codex Prompt

```text
Read docs/codex/ARCHITECTURE.md and inspect src/types/domain.ts, src/lib/workflow.ts, and tests/unit/workflow.spec.ts. Introduce centralized submission type constants and a UI label helper that supports the current "single" value while allowing product-facing Tourist wording. Replace only domain-level magic strings where safe. Do not change Supabase migrations, demo data, App.tsx, styles, or package manifests. Preserve behavior and existing tests. Add or update unit tests for type labels and single/family invariants. Run npm run typecheck, npm run lint, and npm run test. Report any remaining legacy "single" usages that should be migrated later.
```

---

# 2. Domain Core

## Task VF-DOM-01 — Extract Domain Constants and Status Machine

### Branch Name

```text
feat/domain-core
```

### Level of Difficulty

Hard

### Objective

Create centralized domain constants and status transition functions for submission, applicant, media, correction, and appointment statuses.

### Context

`src/lib/workflow.ts` already contains status metadata and `transitionSubmissionStatus`. This task strengthens that into explicit clean domain modules.

### Dependencies

- VF-CX-01.
- VF-CX-02 recommended.

### Files/Folders to Touch

```text
src/domain/submissions/
src/domain/applicants/
src/domain/media/
src/domain/corrections/
src/domain/appointments/
src/types/domain.ts
src/lib/workflow.ts
tests/unit/
```

### Files/Folders Not to Touch

```text
src/App.tsx
src/services/
supabase/
package.json
package-lock.json
```

### Constraints

- Preserve existing public exports from `src/lib/workflow.ts` during migration.
- Do not change UI.
- Do not activate Supabase.

### Implementation Notes

- Add const maps for statuses.
- Add `ALLOWED_SUBMISSION_TRANSITIONS`.
- Add `canTransitionSubmissionStatus`.
- Add `transitionSubmissionStatus` with precondition hooks.
- Set timestamps centrally.
- Normalize appointment status centrally.
- Add exhaustive tests for allowed and forbidden transitions.

### Verification Commands

```bash
npm run typecheck
npm run lint
npm run test
```

### Done Criteria

- Status transitions are centralized.
- Magic status strings are reduced in domain code.
- Existing behavior is preserved unless tests explicitly document a correction.
- Unit tests cover valid and invalid transitions.

### Copy-Paste Codex Prompt

```text
Read docs/codex/ARCHITECTURE.md, then inspect src/types/domain.ts, src/lib/workflow.ts, and tests/unit/workflow.spec.ts. Extract/introduce domain status constants and a centralized submission status machine under src/domain/submissions and src/domain/appointments. Preserve existing exports from src/lib/workflow.ts by re-exporting or delegating where needed. Add canTransitionSubmissionStatus and ensure transitionSubmissionStatus validates allowed transitions, updates timestamps, and normalizes appointment status. Do not touch UI, services, Supabase, or package manifests. Add unit tests for allowed and forbidden transitions. Run npm run typecheck, npm run lint, and npm run test. Report any behavior changes explicitly.
```

---

## Task VF-DOM-02 — Centralize Required Field Validation and Blocker Engine

### Branch Name

```text
feat/domain-core
```

### Level of Difficulty

Hard

### Objective

Create a typed validation and blocker engine that prevents agent submission when required fields/media/passport filenames are incomplete.

### Context

Current `src/lib/workflow.ts` has `requiredApplicantFields`, `applicantBlockers`, `blockers`, and `submissionPreflight`. This should become a centralized, tested domain service.

### Dependencies

- VF-DOM-01.

### Files/Folders to Touch

```text
src/domain/applicants/
src/domain/submissions/
src/domain/media/
src/lib/workflow.ts
tests/unit/
```

### Files/Folders Not to Touch

```text
src/App.tsx
src/services/submissionService.ts
supabase/
package.json
package-lock.json
```

### Constraints

- UI must not receive only generic errors; blockers must include exact scope.
- Do not duplicate logic in UI.
- Preserve current function exports during migration.

### Implementation Notes

- Define `ValidationIssue`.
- Define `Blocker`.
- Implement `validateApplicantRequiredFields`.
- Implement `calculateSubmissionBlockers`.
- Implement `submissionPreflight` using the new engine.
- Keep media uploaded vs accepted distinction.

### Verification Commands

```bash
npm run typecheck
npm run lint
npm run test
```

### Done Criteria

- Missing required fields produce field-scoped blockers.
- Missing media produces media-scoped blockers.
- Missing passport number blocks generated filenames.
- Agent handoff allows uploaded media but not missing/replace-required media.
- Tests cover each required rule.

### Copy-Paste Codex Prompt

```text
Read docs/codex/ARCHITECTURE.md and inspect current requiredApplicantFields, applicantBlockers, blockers, and submissionPreflight in src/lib/workflow.ts. Build a centralized validation/blocker engine under src/domain/applicants, src/domain/media, and src/domain/submissions. Define typed ValidationIssue and Blocker outputs with scope, applicantId, fieldKey, mediaType, and blocking severity. Keep src/lib/workflow.ts exports working by delegating to the new functions. Do not change UI, storage services, Supabase, or package manifests. Add unit tests for missing required fields, missing media, missing passport number, replacement media, and successful agent submit preflight. Run npm run typecheck, npm run lint, and npm run test.
```

---

## Task VF-DOM-03 — Centralize Correction Scope and Media Acceptance Rules

### Branch Name

```text
feat/domain-core
```

### Level of Difficulty

Hard

### Objective

Implement correction validation and admin acceptance rules that prevent accepting submissions with open blocking corrections or unaccepted media.

### Context

Current correction data exists as notes and `adminAcceptancePreflight` checks media acceptance. MVP needs precise correction scopes: submission, applicant, field, media.

### Dependencies

- VF-DOM-01.
- VF-DOM-02.

### Files/Folders to Touch

```text
src/domain/corrections/
src/domain/media/
src/domain/submissions/
src/types/domain.ts
src/lib/workflow.ts
tests/unit/
```

### Files/Folders Not to Touch

```text
src/App.tsx
src/services/
supabase/
package.json
package-lock.json
```

### Constraints

- Field correction requires `applicantId` and `fieldKey`.
- Media correction requires `applicantId` and `mediaType`.
- Reason is required.
- Uploaded media is not accepted media.
- Only admin/operator use cases may accept media.

### Implementation Notes

- Define `CorrectionInput`.
- Implement `validateCorrectionInput`.
- Implement `hasOpenBlockingCorrections`.
- Implement `adminAcceptancePreflight`.
- Include note severity without blocking acceptance.

### Verification Commands

```bash
npm run typecheck
npm run lint
npm run test
```

### Done Criteria

- Invalid correction scopes fail validation.
- Open blocking corrections prevent acceptance.
- Open notes do not prevent acceptance.
- Uploaded media alone prevents admin acceptance.
- Accepted media enables acceptance when all other blockers are clear.

### Copy-Paste Codex Prompt

```text
Read docs/codex/ARCHITECTURE.md and inspect current CorrectionNote types and adminAcceptancePreflight logic. Add or strengthen correction domain modules for scope validation and blocking rules. Ensure field corrections require applicantId + fieldKey, media corrections require applicantId + mediaType, and every correction requires a non-empty reason. Ensure admin acceptance fails when open blocking corrections exist or any required media slot is not accepted. Preserve existing workflow exports during migration. Do not touch UI, services, Supabase, or package manifests. Add unit tests for invalid correction scope, blocking vs note corrections, uploaded vs accepted media, and accepted submission preflight. Run npm run typecheck, npm run lint, and npm run test.
```

---

## Task VF-DOM-04 — Implement Family Rules and Export Row Mapping

### Branch Name

```text
feat/domain-core
```

### Level of Difficulty

Hard

### Objective

Centralize family grouping rules and deterministic export row mapping.

### Context

Current workflow has family suggestions and `exportService.ts` has export mapping. MVP requires family rows adjacent and `familyGroupId` / `familyGroupColor` preserved.

### Dependencies

- VF-DOM-01.
- VF-DOM-02.
- VF-DOM-03.

### Files/Folders to Touch

```text
src/domain/submissions/
src/domain/exports/
src/services/exportService.ts
src/lib/workflow.ts
tests/unit/
```

### Files/Folders Not to Touch

```text
src/App.tsx
src/styles.css
supabase/
package.json
package-lock.json
```

### Constraints

- Do not add XLSX dependency.
- Do not implement UI.
- Do not change export status manually in UI code.
- Keep existing export service working.

### Implementation Notes

- Implement `validateFamilySubmission`.
- Implement `getFamilyGroupMetadata`.
- Implement `mapSubmissionDetailToExportRows`.
- Keep one export row per applicant.
- Sort/group rows so family applicants remain adjacent.
- Include media filenames from sanitized passport number.

### Verification Commands

```bash
npm run typecheck
npm run lint
npm run test
```

### Done Criteria

- Tourist/single has exactly one applicant before submit/export.
- Family may exist with zero applicants as draft but cannot submit/export until valid.
- Export produces one row per applicant.
- Family rows are adjacent.
- Family metadata is preserved.
- Export row mapping is unit tested.

### Copy-Paste Codex Prompt

```text
Read docs/codex/ARCHITECTURE.md and inspect src/lib/workflow.ts, src/services/exportService.ts, and existing workflow tests. Move or delegate family validation and export row mapping into src/domain/submissions and src/domain/exports. Preserve existing exportService public behavior while making domain export mapping deterministic and unit-tested. Do not add XLSX dependencies, UI, Supabase changes, or package manifest changes. Add tests for tourist/single applicant count, family draft with zero applicants, family submit/export validity, one row per applicant, adjacent family rows, preserved familyGroupId/familyGroupColor, and passport-based media filenames. Run npm run typecheck, npm run lint, and npm run test.
```

---

# 3. Storage / Repository Layer

## Task VF-STO-01 — Define Repository Interfaces and Command Result Types

### Branch Name

```text
feat/storage-adapter
```

### Level of Difficulty

Medium

### Objective

Create repository contracts and application result types without changing storage behavior.

### Context

Current services exist, but interfaces are not yet formalized as clean contracts.

### Dependencies

- VF-DOM-01.
- VF-DOM-02.

### Files/Folders to Touch

```text
src/application/
src/infrastructure/repositories/
src/domain/
src/services/
tests/unit/
```

### Files/Folders Not to Touch

```text
src/App.tsx
src/styles.css
supabase/migrations/
package.json
package-lock.json
```

### Constraints

- Do not activate Supabase.
- Do not change UI.
- Do not remove existing services yet.

### Implementation Notes

- Add `CommandResult<T>`.
- Add `ActorContext`.
- Add `SubmissionRepository`, `ApplicantRepository`, `MediaRepository`, `ExportRepository`, `AppointmentRepository`.
- Add filters/input/patch types.
- Keep old services compiling.

### Verification Commands

```bash
npm run typecheck
npm run lint
npm run test
```

### Done Criteria

- Repository interfaces compile.
- No runtime behavior changed.
- Existing services still compile.
- Types align with `ARCHITECTURE.md`.

### Copy-Paste Codex Prompt

```text
Read docs/codex/ARCHITECTURE.md repository interface section. Inspect current src/services and domain types. Add repository interfaces under src/infrastructure/repositories and application result types under src/application. Include CommandResult, ActorContext, SubmissionRepository, ApplicantRepository, MediaRepository, ExportRepository, and AppointmentRepository plus needed input/filter/patch types. Do not change UI, local persistence behavior, Supabase migrations, or package manifests. Keep existing services compiling. Add minimal type-level tests or unit tests if useful. Run npm run typecheck, npm run lint, and npm run test. Report any contract mismatches with current services.
```

---

## Task VF-STO-02 — Implement Local/Mock Repository Adapter

### Branch Name

```text
feat/storage-adapter
```

### Level of Difficulty

Hard

### Objective

Implement local/mock repository classes or factories that satisfy repository interfaces and persist MVP state locally.

### Context

`src/services/localRepository.ts` already has useful local storage helpers. This task should wrap or migrate them into clean infrastructure adapters.

### Dependencies

- VF-STO-01.
- Domain Core tasks.

### Files/Folders to Touch

```text
src/infrastructure/mock/
src/infrastructure/repositories/
src/services/localRepository.ts
src/data/demoData.ts
tests/unit/
tests/integration/
```

### Files/Folders Not to Touch

```text
src/App.tsx
src/styles.css
supabase/
package.json
package-lock.json
```

### Constraints

- Do not delete `src/services/localRepository.ts` until imports are migrated.
- Do not change seed data shape unless mappers handle it.
- Local persistence must survive reload.

### Implementation Notes

- Add local storage version key.
- Normalize loaded data through domain functions.
- Provide list/create/update/get commands.
- Persist corrections/status/media/export/appointment state.
- Add adapter tests using a mock storage driver.

### Verification Commands

```bash
npm run typecheck
npm run lint
npm run test
```

### Done Criteria

- Local adapter implements repository contracts.
- Data persists through save/load tests.
- Agent list filters by agent ID.
- Admin list sees all submissions.
- Existing tests pass.

### Copy-Paste Codex Prompt

```text
Read docs/codex/ARCHITECTURE.md and inspect src/services/localRepository.ts and src/data/demoData.ts. Implement local/mock repository adapters under src/infrastructure/mock and/or src/infrastructure/repositories that satisfy the repository interfaces from VF-STO-01. Reuse existing local repository logic where safe. Add a storage driver abstraction so tests can use in-memory storage. Ensure listByAgent filters by agentId, admin list can see all, getById returns detail, create/update persists, and state survives reload. Do not touch UI, Supabase, or package manifests. Add integration tests for save/load, agent filtering, admin listing, and update persistence. Run npm run typecheck, npm run lint, and npm run test.
```

---

## Task VF-STO-03 — Add Supabase Mapper Boundary Without Production Activation

### Branch Name

```text
feat/storage-adapter
```

### Level of Difficulty

Hard

### Objective

Create typed Supabase mappers that separate DB row models from domain models, without activating Supabase as the default runtime.

### Context

Supabase client/config/types/migration already exist. Current `submissionService.ts` includes mapping logic that can be moved behind infrastructure.

### Dependencies

- VF-STO-01.
- VF-STO-02 recommended.

### Files/Folders to Touch

```text
src/infrastructure/supabase/
src/services/submissionService.ts
src/services/profileService.ts
src/lib/supabase/
tests/unit/
```

### Files/Folders Not to Touch

```text
supabase/migrations/
src/App.tsx
src/styles.css
package.json
package-lock.json
```

### Constraints

- Do not modify migration SQL.
- Do not make Supabase the default if env vars are missing.
- Do not remove local/demo mode.
- Do not write RLS policy changes in this task.

### Implementation Notes

- Add mapper functions like `mapSubmissionRowToDomain`, `mapApplicantRowToDomain`, `mapDomainToSubmissionInsert`.
- Keep database row types imported only inside infrastructure.
- Unit test mappers with sample rows.

### Verification Commands

```bash
npm run typecheck
npm run lint
npm run test
```

### Done Criteria

- DB row types do not leak into domain/UI.
- Supabase mappers are unit tested.
- Local/demo mode remains default when config is missing.
- Existing services compile.

### Copy-Paste Codex Prompt

```text
Read docs/codex/ARCHITECTURE.md storage model section. Inspect src/services/submissionService.ts, src/services/profileService.ts, and src/lib/supabase/*. Create a Supabase mapper boundary under src/infrastructure/supabase so domain models and database row models stay separate. Move or delegate row mapping logic where safe. Do not modify supabase/migrations, do not activate Supabase by default, and do not touch UI or package manifests. Add unit tests for submission/applicant/profile mapper functions using typed sample rows. Run npm run typecheck, npm run lint, and npm run test. Report any remaining DB row leakage.
```

---

## Task VF-STO-04 — Implement Media Repository and Storage Adapter Boundary

### Branch Name

```text
feat/storage-adapter
```

### Level of Difficulty

Medium

### Objective

Wrap media upload/review behavior behind `MediaRepository` and storage adapters.

### Context

`src/services/storageService.ts` already contains Supabase storage helpers. MVP also needs local/mock media behavior.

### Dependencies

- VF-STO-01.
- VF-DOM-03.

### Files/Folders to Touch

```text
src/domain/media/
src/infrastructure/storage/
src/infrastructure/repositories/
src/services/storageService.ts
tests/unit/
tests/integration/
```

### Files/Folders Not to Touch

```text
src/App.tsx
src/styles.css
supabase/migrations/
package.json
package-lock.json
```

### Constraints

- Do not require Supabase for local MVP.
- Do not upload actual files to external services in tests.
- Do not mark uploaded media as accepted.

### Implementation Notes

- Add local media repository that stores metadata.
- Add `buildMediaStoragePath`.
- Add `generateMediaFilename`.
- Add `markAccepted` and `requestReplacement`.
- Ensure replacement creates media state and correction reason where applicable.

### Verification Commands

```bash
npm run typecheck
npm run lint
npm run test
```

### Done Criteria

- Media upload creates `uploaded`, not `accepted`.
- Admin mark accepted creates `accepted`.
- Replacement request creates `replace_required` / replacement state.
- Filenames are passport-based.
- Tests cover all states.

### Copy-Paste Codex Prompt

```text
Read docs/codex/ARCHITECTURE.md media architecture section. Inspect src/services/storageService.ts and current media functions in src/lib/workflow.ts. Implement a MediaRepository boundary and local/mock storage adapter that can upload media metadata, mark media accepted, and request replacement without requiring Supabase. Preserve Supabase storage helpers behind an adapter; do not activate external upload in tests. Ensure uploaded does not mean accepted. Add tests for generated filenames, local upload status, admin acceptance, replacement request, and missing passport behavior. Do not touch UI, Supabase migrations, or package manifests. Run npm run typecheck, npm run lint, and npm run test.
```

---

# 4. Agent Flow

## Task VF-AGT-01 — Implement Mock Email Login and Role-Gated App Shell

### Branch Name

```text
feat/agent-flow
```

### Level of Difficulty

Medium

### Objective

Create an MVP login flow and route/screen gating for Agent and Admin without relying on production Supabase.

### Context

`authService.ts` has demo profile support. Current `App.tsx` is a monolithic demo screen.

### Dependencies

- VF-STO-01.
- Premium UI shell can be merged before or after this task.

### Files/Folders to Touch

```text
src/app/
src/features/auth/
src/shared/ui/
src/services/authService.ts
src/App.tsx
tests/e2e/
```

### Files/Folders Not to Touch

```text
src/domain/
supabase/migrations/
package.json
package-lock.json
```

### Constraints

- Do not claim production auth security.
- Role switch is dev/demo only.
- Agent routes must not render admin views.
- Admin routes must not be available to agent role.

### Implementation Notes

- Use mock email login with role selection if necessary.
- Create `AuthProvider` or simple app state provider.
- Preserve current working command center until new shell is stable.
- Add permission-denied state.

### Verification Commands

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

For UI changes:

```bash
npm run test:e2e
```

### Done Criteria

- User can log in as agent/admin in local mode.
- Agent sees only agent navigation.
- Admin sees admin navigation.
- Permission denied state exists.
- No safety copy violations.

### Copy-Paste Codex Prompt

```text
Read docs/codex/PROJECT_BRIEF.md, AGENTS.md, and ARCHITECTURE.md. Inspect src/App.tsx and src/services/authService.ts. Implement a mock/local email login and role-gated app shell for Agent/Admin. Keep role switch clearly demo/dev-only if used. Do not activate Supabase Auth. Do not change domain rules or Supabase migrations. Preserve the existing working screen until the new shell is stable. Add permission-denied handling so agent users cannot render admin screens. Update or add Playwright smoke coverage for login and role-gated navigation if practical. Run npm run typecheck, npm run lint, npm run test, npm run build, and npm run test:e2e for UI verification. Report exact commands and failures.
```

---

## Task VF-AGT-02 — Build Agent Dashboard and Create Submission Flow

### Branch Name

```text
feat/agent-flow
```

### Level of Difficulty

Hard

### Objective

Implement Agent dashboard and create Tourist/Family submission flow using application commands and repository interfaces.

### Context

Agent must understand what to do next and create submissions without seeing admin-only data.

### Dependencies

- VF-AGT-01.
- VF-DOM-02.
- VF-STO-02.

### Files/Folders to Touch

```text
src/features/agent-dashboard/
src/features/submission-editor/
src/application/commands/
src/shared/ui/
tests/e2e/
```

### Files/Folders Not to Touch

```text
src/domain/exports/
src/features/admin-dashboard/
supabase/migrations/
package.json
package-lock.json
```

### Constraints

- Do not implement admin review here.
- Do not bypass repository interfaces.
- Do not add marketing pages.
- Tourist UI may map to internal `"single"` through constants.

### Implementation Notes

- Dashboard cards: active, filling, corrections, waiting review.
- Create flow: choose Tourist or Family.
- Family can start with zero applicants.
- Tourist should create exactly one applicant flow or guide the agent to add one.
- Save draft through repository.

### Verification Commands

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:e2e
```

### Done Criteria

- Agent dashboard lists only agent-owned submissions.
- Agent can create Tourist submission.
- Agent can create Family submission.
- New submissions persist in local mode.
- Next action is clear.

### Copy-Paste Codex Prompt

```text
Read docs/codex/PROJECT_BRIEF.md and ARCHITECTURE.md. Inspect current local repository and app shell. Build the Agent dashboard and create submission flow using application commands and repository interfaces. Agent must see only own submissions. Add create options for Tourist and Family; map Tourist safely to the current internal type strategy from domain constants. Family may start with zero applicants; Tourist must guide toward exactly one applicant. Persist drafts through the local/mock repository. Do not implement admin review, export, Supabase activation, or marketing pages. Add/adjust E2E coverage for agent dashboard and create submission if practical. Run npm run typecheck, npm run lint, npm run test, npm run build, and npm run test:e2e. Report results.
```

---

## Task VF-AGT-03 — Build Applicant and Family Editor with Blockers

### Branch Name

```text
feat/agent-flow
```

### Level of Difficulty

Hard

### Objective

Implement applicant forms and family overview with field-level blocker rendering.

### Context

Required fields and blockers must come from domain validation, not UI duplication.

### Dependencies

- VF-AGT-02.
- VF-DOM-02.
- VF-STO-02.

### Files/Folders to Touch

```text
src/features/submission-editor/
src/shared/ui/FormSection/
src/shared/ui/FamilyMemberCard/
src/shared/ui/ApplicantDetailPanel/
src/application/commands/
tests/e2e/
tests/unit/
```

### Files/Folders Not to Touch

```text
src/features/admin-dashboard/
src/domain/exports/
supabase/
package.json
package-lock.json
```

### Constraints

- Do not duplicate required field arrays in UI.
- Do not submit if blockers exist.
- Do not build a giant family form.

### Implementation Notes

- Sections: personal, passport, contacts, employment, trip, accommodation, media, corrections.
- Show readiness per applicant.
- Show family members as individual cards.
- Show blockers near exact field or applicant.
- Save incrementally.

### Verification Commands

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:e2e
```

### Done Criteria

- Agent can add/edit applicants.
- Family members are individual objects.
- Required field errors are specific.
- Blockers update after edits.
- Draft persists after reload.

### Copy-Paste Codex Prompt

```text
Read docs/codex/ARCHITECTURE.md validation and blocker sections. Inspect the current domain validation/blocker functions and local repository adapter. Build the applicant/family editor under src/features/submission-editor using shared form components. Render required field blockers from domain output, not duplicated UI arrays. Family must be a list of applicant cards/details, not one giant form. Save applicant edits through application commands and local repository. Do not implement admin review, export, Supabase activation, or package changes. Add tests or E2E coverage for adding two family applicants, missing required field blockers, fixing blockers, and persistence after reload where practical. Run npm run typecheck, npm run lint, npm run test, npm run build, and npm run test:e2e.
```

---

## Task VF-AGT-04 — Build Media Upload, Correction View, and Resubmit Flow

### Branch Name

```text
feat/agent-flow
```

### Level of Difficulty

Hard

### Objective

Implement agent media slots, returned correction state, fix marking, and resubmission.

### Context

Each applicant requires `photo_white`, `selfie`, and `video`. Uploaded media is pending operator review, not accepted.

### Dependencies

- VF-AGT-03.
- VF-DOM-03.
- VF-STO-04.

### Files/Folders to Touch

```text
src/features/submission-editor/
src/shared/ui/MediaUploadCard/
src/shared/ui/CorrectionPanel/
src/application/commands/
tests/e2e/
tests/unit/
```

### Files/Folders Not to Touch

```text
src/features/admin-dashboard/
src/features/export-center/
supabase/migrations/
package.json
package-lock.json
```

### Constraints

- Do not mark uploaded media as accepted.
- Do not allow submit with missing media or replace-required media.
- Do not fake actual file persistence beyond the scoped local/mock adapter.

### Implementation Notes

- Media cards show required slot, upload state, generated filename, and correction reason.
- Returned corrections are grouped by submission/applicant/field/media.
- Agent can mark correction fixed only after editing relevant target where practical.
- Resubmit uses domain preflight.

### Verification Commands

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:e2e
```

### Done Criteria

- Agent can upload required media slots in local/mock mode.
- Uploaded state displays as pending review.
- Returned corrections show exact targets.
- Resubmit is blocked until blockers are resolved.
- Successful resubmit transitions to waiting review.

### Copy-Paste Codex Prompt

```text
Read docs/codex/ARCHITECTURE.md media and correction sections. Inspect the MediaRepository/local storage adapter and current domain rules. Build media upload cards and agent correction panels in the submission editor. Each applicant must show photo_white, selfie, and video slots. Uploaded media must display as pending review, never accepted. Returned corrections must be grouped by submission/applicant/field/media and show exact target reasons. Resubmit must call the application command and be blocked by domain preflight if required fields/media/replacements remain. Do not implement admin UI, export, Supabase activation, or package changes. Add/update tests for uploaded-vs-accepted display and resubmit blockers. Run npm run typecheck, npm run lint, npm run test, npm run build, and npm run test:e2e.
```

---

# 5. Admin Review Flow

## Task VF-ADM-01 — Build Admin Queue with Filters

### Branch Name

```text
feat/admin-review
```

### Level of Difficulty

Medium

### Objective

Implement admin queue listing all submissions with filters and clear next action.

### Context

Admin must know what to review first and filter by status/agent/country/city/type.

### Dependencies

- VF-STO-02.
- VF-DOM-01.
- UI system recommended.

### Files/Folders to Touch

```text
src/features/admin-dashboard/
src/features/review-workbench/
src/shared/ui/SearchBar/
src/shared/ui/QueueCard/
src/application/queries/
tests/e2e/
```

### Files/Folders Not to Touch

```text
src/features/agent-dashboard/
src/domain/exports/
supabase/migrations/
package.json
package-lock.json
```

### Constraints

- Do not implement correction modal yet.
- Do not implement export here.
- Admin queue must use repository query, not demo constants.

### Implementation Notes

- Filters: status, agent, country, city, type, search.
- Show waiting review/in review/returned/accepted states.
- Mobile should use cards/list without horizontal overflow.
- Queue item opens detail.

### Verification Commands

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:e2e
```

### Done Criteria

- Admin sees all submissions.
- Filters work.
- Agent users cannot access queue.
- Queue has no horizontal overflow on mobile.
- Next action is visible.

### Copy-Paste Codex Prompt

```text
Read docs/codex/PROJECT_BRIEF.md and ARCHITECTURE.md. Inspect repository query interfaces and current app shell. Build the Admin queue with filters for status, agent, country, city, type, and search. The queue must use repository/application queries, not hardcoded demo constants. Agent users must not access this screen. Do not implement correction modal, acceptance, export, Supabase activation, or package changes in this task. Ensure mobile uses cards/list or another no-horizontal-overflow strategy. Add/update E2E coverage for admin queue rendering, filtering, and agent denial if practical. Run npm run typecheck, npm run lint, npm run test, npm run build, and npm run test:e2e.
```

---

## Task VF-ADM-02 — Build Submission Review Workbench

### Branch Name

```text
feat/admin-review
```

### Level of Difficulty

Hard

### Objective

Implement admin submission detail with applicant questionnaire and media review sections.

### Context

Operator must review each applicant inside a family and understand what is ready or blocked.

### Dependencies

- VF-ADM-01.
- VF-DOM-02.
- VF-STO-02.
- VF-STO-04.

### Files/Folders to Touch

```text
src/features/review-workbench/
src/shared/ui/ApplicantDetailPanel/
src/shared/ui/MediaUploadCard/
src/application/commands/
tests/e2e/
```

### Files/Folders Not to Touch

```text
src/features/agent-dashboard/
src/features/export-center/
supabase/
package.json
package-lock.json
```

### Constraints

- Do not allow accept here unless acceptance command is included in a separate task.
- Do not duplicate validation logic.
- Do not mark files accepted by display only; it must use command/repository.

### Implementation Notes

- `Start review` transitions waiting_review to in_review.
- Show applicant list for family.
- Show field completeness.
- Show media status and review state separately.
- Use right panel for blockers/decision summary.

### Verification Commands

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:e2e
```

### Done Criteria

- Admin opens detail from queue.
- Admin can start review.
- Family applicants are reviewed individually.
- Media uploaded/accepted/replace states are clear.
- Review state persists.

### Copy-Paste Codex Prompt

```text
Read docs/codex/ARCHITECTURE.md admin review flow. Inspect Admin queue, repository adapters, and domain preflight functions. Build the Review Workbench detail screen where admin can open a submission, start review, inspect each applicant, inspect required fields, and inspect media states separately. Starting review must call the application command and transition status through the domain status machine. Do not implement final accept/return modal in this task unless already scaffolded; do not implement export or Supabase activation. Add/update E2E coverage for opening a family submission and starting review if practical. Run npm run typecheck, npm run lint, npm run test, npm run build, and npm run test:e2e.
```

---

## Task VF-ADM-03 — Build Precise Correction Modal and Return Flow

### Branch Name

```text
feat/admin-review
```

### Level of Difficulty

Hard

### Objective

Implement correction creation for submission, applicant, field, and media scopes, then return submission to agent.

### Context

Corrections must be precise and validated centrally.

### Dependencies

- VF-ADM-02.
- VF-DOM-03.
- VF-STO-02.

### Files/Folders to Touch

```text
src/features/review-workbench/
src/shared/ui/CorrectionPanel/
src/shared/ui/ConfirmationModal/
src/application/commands/
tests/unit/
tests/e2e/
```

### Files/Folders Not to Touch

```text
src/features/agent-dashboard/
src/features/export-center/
supabase/migrations/
package.json
package-lock.json
```

### Constraints

- Do not allow correction without reason.
- Do not create invalid field/media correction scopes.
- Return flow must transition submission to `returned`.
- Do not accept submission in this task.

### Implementation Notes

- Modal/panel should select scope.
- Field correction requires applicant and field.
- Media correction requires applicant and media type.
- Severity: blocking or note.
- Returned corrections become visible to agent.

### Verification Commands

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:e2e
```

### Done Criteria

- Admin can create each valid correction type.
- Invalid correction cannot submit.
- Return transition persists.
- Agent can see returned correction target.
- Unit tests cover correction validation.

### Copy-Paste Codex Prompt

```text
Read docs/codex/ARCHITECTURE.md correction rules. Inspect correction domain validation and Review Workbench. Build a correction modal/panel that lets admin create submission, applicant, field, or media corrections with required reason and blocking/note severity. Enforce domain validation: field corrections require applicantId + fieldKey; media corrections require applicantId + mediaType. Returning corrections must transition the submission to returned through the application command and persist corrections. Do not implement acceptance/export/Supabase changes. Add unit tests for correction validation and E2E coverage showing an agent can see the returned target if practical. Run npm run typecheck, npm run lint, npm run test, npm run build, and npm run test:e2e.
```

---

## Task VF-ADM-04 — Implement Media Review and Accept Submission Flow

### Branch Name

```text
feat/admin-review
```

### Level of Difficulty

Hard

### Objective

Allow admin to accept media and accept the submission only when admin preflight passes.

### Context

Uploaded media is not accepted. Admin acceptance requires accepted media and no open blocking corrections.

### Dependencies

- VF-ADM-02.
- VF-ADM-03.
- VF-DOM-03.
- VF-STO-04.

### Files/Folders to Touch

```text
src/features/review-workbench/
src/application/commands/
src/shared/ui/StatusChip/
tests/unit/
tests/e2e/
```

### Files/Folders Not to Touch

```text
src/features/export-center/
src/features/agent-dashboard/
supabase/migrations/
package.json
package-lock.json
```

### Constraints

- Do not mark media accepted through UI-only state.
- Do not allow accept with blockers.
- Do not mark ready_for_excel here unless explicitly included after accept.
- Do not imply official approval.

### Implementation Notes

- Admin can mark each media slot accepted.
- Admin can request replacement with reason.
- Accept button shows blockers from `adminAcceptancePreflight`.
- Accept transitions to `accepted`.

### Verification Commands

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:e2e
```

### Done Criteria

- Admin can accept media slots.
- Admin can request replacement.
- Accept is blocked until all required media are accepted.
- Accept is blocked by open blocking corrections.
- Accepted status persists.

### Copy-Paste Codex Prompt

```text
Read docs/codex/ARCHITECTURE.md media and admin acceptance rules. Inspect MediaRepository, correction rules, and Review Workbench. Implement admin media review actions: mark accepted and request replacement with a required reason. Implement accept submission through an application command that calls adminAcceptancePreflight and transitions to accepted only if all blocking corrections are closed and all required media are accepted. Do not implement export or appointment changes in this task. Do not use official approval language. Add/update unit and E2E tests for acceptance blocked by uploaded-only media, acceptance blocked by open blocking correction, and successful acceptance after media accepted. Run npm run typecheck, npm run lint, npm run test, npm run build, and npm run test:e2e.
```

---

# 6. Export and Appointment Flow

## Task VF-EXP-01 — Build Export Center with Eligibility Panel

### Branch Name

```text
feat/export-flow
```

### Level of Difficulty

Medium

### Objective

Create export center UI showing accepted/ready submissions, export blockers, and eligible applicant row counts.

### Context

Export must be its own workflow stage after admin acceptance.

### Dependencies

- VF-DOM-04.
- VF-STO-02.
- VF-ADM-04.

### Files/Folders to Touch

```text
src/features/export-center/
src/domain/exports/
src/application/queries/
src/shared/ui/ExcelExportPanel/
tests/unit/
tests/e2e/
```

### Files/Folders Not to Touch

```text
src/features/agent-dashboard/
src/features/submission-editor/
supabase/migrations/
package.json
package-lock.json
```

### Constraints

- Do not export non-eligible submissions.
- Do not imply official submission.
- Do not add XLSX dependency.

### Implementation Notes

- Show exportable submissions.
- Show blocked submissions with exact reasons.
- Show one row per applicant count.
- Family rows must be described as adjacent.

### Verification Commands

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:e2e
```

### Done Criteria

- Admin can open export center.
- Exportable and blocked lists are accurate.
- Counts match applicant rows.
- Family grouping metadata is visible or preserved.

### Copy-Paste Codex Prompt

```text
Read docs/codex/ARCHITECTURE.md export architecture. Inspect export domain mapping and repository adapters. Build an Admin-only Export Center that lists accepted/ready_for_excel submissions, shows blocked export reasons, and displays applicant row counts. Use domain export eligibility; do not duplicate rules in UI. Do not add XLSX dependencies or implement appointment automation. Do not touch agent editor or Supabase migrations. Add unit tests for eligibility if missing and E2E coverage for export center visibility if practical. Run npm run typecheck, npm run lint, npm run test, npm run build, and npm run test:e2e.
```

---

## Task VF-EXP-02 — Implement CSV-Compatible Export Rows and ZIP-Ready Naming

### Branch Name

```text
feat/export-flow
```

### Level of Difficulty

Hard

### Objective

Generate deterministic CSV-compatible export rows and ZIP-ready media naming for accepted submissions.

### Context

The MVP requires Excel/CSV export and ZIP-ready media package preparation. CSV rows can be the first implementation.

### Dependencies

- VF-EXP-01.
- VF-DOM-04.
- VF-STO-04.

### Files/Folders to Touch

```text
src/domain/exports/
src/shared/lib/csv.ts
src/features/export-center/
src/application/commands/
src/infrastructure/repositories/
tests/unit/
tests/e2e/
```

### Files/Folders Not to Touch

```text
src/features/agent-dashboard/
src/features/admin-dashboard/
supabase/migrations/
package.json
package-lock.json
```

### Constraints

- No heavy dependency without explicit justification.
- One row equals one applicant.
- Family rows stay adjacent.
- Passport-based filenames are required.
- Missing passport blocks export.

### Implementation Notes

- Add CSV serialization helper.
- Create export batch through repository.
- Mark included submissions as exported.
- Display ZIP-ready paths/names.
- Keep XLSX as future adapter.

### Verification Commands

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:e2e
```

### Done Criteria

- CSV-compatible rows are generated.
- Export batch is persisted.
- Included submissions transition to exported.
- ZIP-ready filenames match rules.
- Unit tests cover row mapping and filename generation.

### Copy-Paste Codex Prompt

```text
Read docs/codex/ARCHITECTURE.md export and media architecture sections. Inspect current src/services/exportService.ts and domain export mapping. Implement CSV-compatible export generation through the export command/repository boundary. One row must equal one applicant, family rows must stay adjacent, familyGroupId/familyGroupColor must be preserved, and media filenames must be generated from sanitized passport numbers. Missing passport must block export. Create/persist an export batch and mark included submissions exported through the status machine. Do not add XLSX dependencies, Supabase changes, or appointment automation. Add unit tests for CSV escaping, row mapping, adjacent family rows, missing passport blockers, and exported status transition. Run npm run typecheck, npm run lint, npm run test, npm run build, and npm run test:e2e.
```

---

## Task VF-EXP-03 — Build Manual Appointment Status Panel

### Branch Name

```text
feat/export-flow
```

### Level of Difficulty

Medium

### Objective

Implement manual appointment status tracking after export.

### Context

Appointment handling is manual only. The product must never imply automatic booking.

### Dependencies

- VF-EXP-02.
- VF-DOM-01.
- VF-STO-02.

### Files/Folders to Touch

```text
src/domain/appointments/
src/features/appointment-panel/
src/application/commands/
src/infrastructure/repositories/
src/shared/ui/AppointmentStatusPanel/
tests/unit/
tests/e2e/
```

### Files/Folders Not to Touch

```text
src/features/agent-dashboard/
supabase/migrations/
package.json
package-lock.json
```

### Constraints

- No automatic booking claims.
- Admin-only update.
- Use allowed appointment statuses only.
- Do not call external appointment APIs.

### Implementation Notes

- Statuses: not_started, sent_to_appointment, appointment_scheduled, attention_required, completed.
- Add optional date/time/comment.
- Update status through command.
- Submission status should follow lifecycle where appropriate.

### Verification Commands

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:e2e
```

### Done Criteria

- Admin can manually update appointment status.
- Status persists.
- Agent can see safe status label where appropriate.
- Copy clearly says manual appointment status.
- No automation language appears.

### Copy-Paste Codex Prompt

```text
Read docs/codex/PROJECT_BRIEF.md copy guardrails and ARCHITECTURE.md appointment model. Build an Admin-only manual Appointment Status Panel with statuses not_started, sent_to_appointment, appointment_scheduled, attention_required, and completed. Updates must go through an application command and repository adapter. Include optional city/date/time/comment only as manual operator fields. Do not call external APIs or imply automatic booking. Do not touch Supabase migrations or package manifests. Add unit tests for appointment status transitions and E2E coverage for updating manual status if practical. Run npm run typecheck, npm run lint, npm run test, npm run build, and npm run test:e2e.
```

---

# 7. Premium UI System

## Task VF-UI-01 — Implement Dark Cockpit Tokens and AppShell

### Branch Name

```text
feat/premium-ui-system
```

### Level of Difficulty

Medium

### Objective

Create the premium dark operational cockpit token system and AppShell foundation.

### Context

Current CSS is light-first. The target visual direction uses deep black/graphite cards, thin borders, gold agent accent, and blue admin accent.

### Dependencies

- Can run after VF-CX-01.
- Should coordinate with Agent/Admin branches.

### Files/Folders to Touch

```text
src/shared/config/
src/shared/styles/
src/shared/ui/AppShell/
src/shared/ui/Sidebar/
src/shared/ui/Topbar/
src/styles.css
tailwind.config.js
docs/qa/
```

### Files/Folders Not to Touch

```text
src/domain/
src/application/commands/
src/infrastructure/repositories/
supabase/
package.json
package-lock.json
```

### Constraints

- Do not change domain/state/storage rules.
- Do not redesign business flows in this task.
- Do not add dependencies.
- Avoid cheap gradients and stock imagery.

### Implementation Notes

- Add tokens matching `PROJECT_BRIEF.md`/`ARCHITECTURE.md`.
- Desktop sidebar around 292px.
- Content max width around 1320px.
- Responsive tablet/mobile behavior.
- Capture screenshots if browser tooling is available.

### Verification Commands

```bash
npm run typecheck
npm run lint
npm run build
npm run test:e2e
```

### Done Criteria

- AppShell supports agent/admin accents.
- Dark tokens are centralized.
- Desktop/tablet/mobile layout works.
- No horizontal overflow.
- Domain/storage files unchanged.

### Copy-Paste Codex Prompt

```text
Read docs/codex/PROJECT_BRIEF.md UI direction and docs/codex/ARCHITECTURE.md UI architecture. Inspect src/styles.css, tailwind.config.js, and current App.tsx. Implement centralized dark cockpit tokens and shared AppShell/Sidebar/Topbar components without changing domain, application commands, repositories, Supabase, or package manifests. Use Agent gold and Admin blue accents. Keep responsive layout: desktop sidebar around 292px, tablet off-canvas or equivalent, mobile one-column with 44px touch targets. Do not add dependencies or business logic. Run npm run typecheck, npm run lint, npm run build, and npm run test:e2e. Capture screenshots under docs/qa if tooling is available and report them.
```

---

## Task VF-UI-02 — Build Shared Operational Components

### Branch Name

```text
feat/premium-ui-system
```

### Level of Difficulty

Medium

### Objective

Create reusable shared UI components needed by Agent/Admin/Export flows.

### Context

Required components include status chips, cards, form sections, media cards, correction panels, export panels, appointment panels, states, and modals.

### Dependencies

- VF-UI-01.

### Files/Folders to Touch

```text
src/shared/ui/
src/shared/config/
src/shared/styles/
tests/unit/
```

### Files/Folders Not to Touch

```text
src/domain/
src/application/
src/infrastructure/
supabase/
package.json
package-lock.json
```

### Constraints

- Presentation only unless component receives domain data as props.
- No direct repository calls.
- No status transition logic in UI components.
- No new dependencies.

### Implementation Notes

Build or scaffold:

```text
StatusChip
QueueCard
SubmissionCard
FamilyMemberCard
ApplicantDetailPanel
FormSection
MediaUploadCard
CorrectionPanel
ExcelExportPanel
AppointmentStatusPanel
EmptyState
ErrorState
LoadingState
ConfirmationModal
```

### Verification Commands

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

### Done Criteria

- Components are reusable and typed.
- No domain logic duplicated.
- Components handle loading/empty/error/disabled states where relevant.
- Existing app still builds.

### Copy-Paste Codex Prompt

```text
Read docs/codex/ARCHITECTURE.md shared UI component list. Build typed shared UI components under src/shared/ui for StatusChip, QueueCard, SubmissionCard, FamilyMemberCard, ApplicantDetailPanel, FormSection, MediaUploadCard, CorrectionPanel, ExcelExportPanel, AppointmentStatusPanel, EmptyState, ErrorState, LoadingState, and ConfirmationModal. Keep components presentational: no repository calls, no status transitions, no duplicated domain validation. Use centralized tokens from the premium UI system. Do not touch domain/application/infrastructure logic, Supabase, or package manifests. Add simple component tests only if test setup supports it without heavy churn. Run npm run typecheck, npm run lint, npm run test, and npm run build.
```

---

## Task VF-UI-03 — Responsive and Accessibility Hardening

### Branch Name

```text
feat/premium-ui-system
```

### Level of Difficulty

Medium

### Objective

Ensure the premium UI works on desktop, tablet, and mobile with no horizontal overflow and accessible controls.

### Context

The product must feel like a premium operations cockpit, not a cramped CRM.

### Dependencies

- VF-UI-01.
- VF-UI-02.
- At least one feature flow should exist for meaningful verification.

### Files/Folders to Touch

```text
src/shared/ui/
src/features/
src/shared/styles/
src/styles.css
tests/e2e/
docs/qa/
```

### Files/Folders Not to Touch

```text
src/domain/
src/infrastructure/
supabase/
package.json
package-lock.json
```

### Constraints

- Do not change business logic.
- Do not suppress Playwright failures by weakening tests.
- Do not hide content to fake responsive success.

### Implementation Notes

- Check viewports: 1440×900, 768×1024, 390×844.
- Ensure touch targets are at least 44px where useful.
- Ensure modals/drawers close by X, backdrop, Escape if used.
- Add accessible labels.

### Verification Commands

```bash
npm run typecheck
npm run lint
npm run build
npm run test:e2e
```

### Done Criteria

- No horizontal overflow in required viewports.
- Keyboard focus is visible.
- Dialogs are accessible.
- Important screens have loading/empty/error states.
- Screenshots captured where tooling exists.

### Copy-Paste Codex Prompt

```text
Read docs/codex/PROJECT_BRIEF.md layout and UX rules. Inspect current shared UI and feature screens. Harden responsive behavior and accessibility without changing domain/application/storage logic. Verify desktop 1440x900, tablet 768x1024, and mobile 390x844. Fix horizontal overflow, focus visibility, dialog labels, Escape/backdrop close behavior, and mobile touch target issues. Do not weaken tests, hide content, add dependencies, or touch Supabase/package manifests. Add or update Playwright responsive assertions where practical. Run npm run typecheck, npm run lint, npm run build, and npm run test:e2e. Capture screenshots under docs/qa if tooling is available and report results.
```

---

# 8. Tests and CI

## Task VF-TST-01 — Expand Domain Unit Tests

### Branch Name

```text
feat/tests-and-ci
```

### Level of Difficulty

Medium

### Objective

Cover required domain rule areas with unit tests.

### Context

Existing `tests/unit/workflow.spec.ts` covers some workflow gates. MVP requires broader coverage.

### Dependencies

- Domain Core tasks.

### Files/Folders to Touch

```text
tests/unit/
src/domain/
src/lib/workflow.ts
```

### Files/Folders Not to Touch

```text
src/features/
src/styles.css
supabase/
package.json
package-lock.json
```

### Constraints

- Do not change product code just to satisfy tests unless fixing real defects.
- Do not remove existing tests.
- Keep tests deterministic.

### Implementation Notes

Required areas:

- Status transitions.
- Required fields.
- Blocker calculation.
- Media status rules.
- Correction scope validation.
- Family grouping.
- Export row mapping.

### Verification Commands

```bash
npm run test
npm run typecheck
npm run lint
```

### Done Criteria

- Required domain areas have tests.
- Tests are deterministic.
- Existing tests still pass.

### Copy-Paste Codex Prompt

```text
Read docs/codex/TEST_STRATEGY.md and inspect tests/unit plus src/domain and src/lib/workflow.ts. Expand unit tests to cover status transitions, required fields, blocker calculation, media status rules, correction scope validation, family grouping, and export row mapping. Do not delete or weaken existing tests. Change product code only if a test exposes a real defect, and keep such fixes minimal. Do not touch UI, Supabase, or package manifests. Run npm run test, npm run typecheck, and npm run lint. Report coverage gaps that remain.
```

---

## Task VF-TST-02 — Add Repository and Use Case Integration Tests

### Branch Name

```text
feat/tests-and-ci
```

### Level of Difficulty

Hard

### Objective

Test end-to-end business use cases against the local/mock repository adapter.

### Context

Integration tests should prove workflow behavior without a browser.

### Dependencies

- Storage adapter tasks.
- Application commands.
- Domain Core.

### Files/Folders to Touch

```text
tests/integration/
src/application/
src/infrastructure/mock/
src/test/
```

### Files/Folders Not to Touch

```text
src/features/
src/styles.css
supabase/
package.json
package-lock.json
```

### Constraints

- Use local/mock adapter, not Supabase.
- Do not require network.
- Do not depend on test order.

### Implementation Notes

Required integration flows:

- Create tourist submission.
- Create family submission.
- Submit for review.
- Return with corrections.
- Fix and resubmit.
- Accept and export.

### Verification Commands

```bash
npm run test
npm run typecheck
npm run lint
```

### Done Criteria

- Integration tests run under Vitest.
- Local repository state is isolated per test.
- Full business paths are covered.
- No browser required.

### Copy-Paste Codex Prompt

```text
Read docs/codex/TEST_STRATEGY.md integration section. Inspect application commands and local/mock repositories. Add Vitest integration tests under tests/integration using an in-memory/local mock repository driver. Cover create tourist submission, create family submission, submit for review, return with corrections, fix and resubmit, accept, and export. Do not use Supabase, network, browser APIs that are not available in tests, or test-order dependencies. Do not touch UI or package manifests unless a minimal test config change is necessary and explained. Run npm run test, npm run typecheck, and npm run lint. Report exact flows covered.
```

---

## Task VF-TST-03 — Implement Full Playwright Smoke Path

### Branch Name

```text
feat/tests-and-ci
```

### Level of Difficulty

Hard

### Objective

Add an E2E smoke path for the core MVP workflow.

### Context

Existing Playwright tests target the current command-center demo. MVP needs agent-to-admin-to-export path.

### Dependencies

- Agent Flow.
- Admin Review.
- Export Flow.
- UI system.

### Files/Folders to Touch

```text
tests/e2e/
playwright.config.ts
src/test/
docs/qa/
```

### Files/Folders Not to Touch

```text
src/domain/
src/infrastructure/
supabase/
package.json
package-lock.json
```

### Constraints

- Do not mock away the actual UI flow.
- Do not weaken existing smoke tests unless replacing with equivalent stronger coverage.
- Do not require external services.

### Implementation Notes

Required smoke path:

```text
agent login
→ create family submission
→ add two applicants
→ fill required fields
→ upload required media
→ submit
→ admin accepts
→ export appears
```

### Verification Commands

```bash
npm run test:e2e
npm run build
```

### Done Criteria

- Smoke path passes.
- Existing E2E coverage is preserved or intentionally replaced.
- Screenshots are captured for key states if available.
- No external services required.

### Copy-Paste Codex Prompt

```text
Read docs/codex/TEST_STRATEGY.md smoke path. Inspect existing tests/e2e/app-smoke.spec.ts and current app routes/screens. Add a Playwright E2E smoke test for agent login, create family submission, add two applicants, fill required fields, upload required media in local/mock mode, submit to operator, admin accepts, and export appears. Use actual UI interactions; do not mock away the flow. Do not require Supabase or external services. Preserve existing smoke coverage unless the new test intentionally replaces it with stronger equivalent coverage and explain why. Run npm run test:e2e and npm run build. Report any flaky selectors or remaining gaps.
```

---

## Task VF-TST-04 — Add CI Gates for Typecheck, Lint, Test, Build

### Branch Name

```text
feat/tests-and-ci
```

### Level of Difficulty

Medium

### Objective

Add CI workflow gates using the repo’s existing scripts.

### Context

`package.json` already has typecheck/lint/test/build/verify scripts. CI should not invent unavailable commands.

### Dependencies

- Tests stable locally.

### Files/Folders to Touch

```text
.github/workflows/
docs/codex/TEST_STRATEGY.md
```

### Files/Folders Not to Touch

```text
src/
supabase/
package.json
package-lock.json
```

### Constraints

- Do not change package scripts unless absolutely necessary.
- Do not add deployment.
- Do not require secrets.
- Do not make audit/security mandatory if environment cannot support it.

### Implementation Notes

- Use `npm ci`.
- Run `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`.
- Optional job for `npm run test:e2e` if Playwright browser install is configured.
- Document any skipped gates.

### Verification Commands

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

### Done Criteria

- CI workflow exists.
- Gates match actual scripts.
- No deployment configured.
- Docs mention required merge gates.

### Copy-Paste Codex Prompt

```text
Read docs/codex/GITFLOW.md and TEST_STRATEGY.md. Inspect package.json scripts. Add a GitHub Actions workflow under .github/workflows that uses npm ci and runs npm run typecheck, npm run lint, npm run test, and npm run build. Add Playwright E2E only if it can be configured without secrets or unstable external services; otherwise document it as a separate manual/release gate. Do not change src, Supabase, package scripts, or lockfiles unless absolutely necessary and explained. Run npm run typecheck, npm run lint, npm run test, and npm run build locally. Report the workflow file and any CI assumptions.
```

---

# 9. Final End-to-End Hardening

## Task VF-HRD-01 — End-to-End Workflow Wiring Audit and Fixes

### Branch Name

```text
hardening/e2e-mvp
```

### Level of Difficulty

Hard

### Objective

Audit and fix gaps in the complete business workflow from agent creation through export and appointment handoff.

### Context

This is not a feature expansion task. It connects and verifies already-built workstreams.

### Dependencies

- Domain Core merged.
- Storage Adapter merged.
- Agent Flow merged.
- Admin Review merged.
- Export Flow merged.
- UI System merged.
- Tests/CI mostly merged.

### Files/Folders to Touch

```text
src/app/
src/features/
src/application/
src/infrastructure/
tests/
docs/qa/
```

### Files/Folders Not to Touch

```text
supabase/migrations/
package.json
package-lock.json
```

Unless a true blocker exists and is explained.

### Constraints

- Do not add new product scope.
- Do not redesign UI broadly.
- Do not activate Supabase.
- Do not add dependencies.
- Fix only workflow blockers.

### Implementation Notes

Audit path:

```text
agent login
→ create family submission
→ add two applicants
→ fill required fields
→ upload required media
→ submit
→ admin review
→ return correction
→ agent fix/resubmit
→ admin accept
→ mark ready/export
→ update appointment status
```

### Verification Commands

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:e2e
npm run verify
```

### Done Criteria

- Full workflow works in local/mock mode.
- All relevant commands pass or failures are documented.
- No unsafe copy.
- No horizontal overflow in key viewports.
- Known remaining issues are listed.

### Copy-Paste Codex Prompt

```text
Read all docs/codex files, especially PROJECT_BRIEF.md, ARCHITECTURE.md, TEST_STRATEGY.md, and AGENTS.md. Audit the full MVP workflow in the current branch: agent login, create family submission, add two applicants, fill required fields, upload required media, submit, admin review, return correction, agent fix/resubmit, admin accept, export, and manual appointment status update. Fix only blockers that prevent this workflow from working in local/mock mode. Do not add new product scope, dependencies, Supabase activation, broad UI redesigns, or package changes unless a true blocker requires it and you explain it. Run npm run typecheck, npm run lint, npm run test, npm run build, npm run test:e2e, and npm run verify. Report exact fixes, commands, screenshots if available, and remaining risks.
```

---

## Task VF-HRD-02 — Safety Copy, QA Evidence, and Release Candidate Review

### Branch Name

```text
hardening/e2e-mvp
```

### Level of Difficulty

Medium

### Objective

Perform final safety, QA, responsive, and release-readiness review before merging to `main`.

### Context

The MVP is trust-sensitive. It must not promise visa outcomes, official submission, AI verification, or automatic appointment booking.

### Dependencies

- VF-HRD-01.

### Files/Folders to Touch

```text
src/
tests/
docs/qa/
docs/codex/
```

### Files/Folders Not to Touch

```text
supabase/migrations/
package.json
package-lock.json
```

Unless a true blocker exists and is explained.

### Constraints

- Do not add features.
- Do not change domain behavior unless a defect is found.
- Do not weaken tests.
- Do not claim checks passed unless they passed.

### Implementation Notes

Review:

- Product boundary.
- Copy guardrails.
- Role access.
- Domain gates.
- Export/appointment wording.
- Responsive QA.
- Test and build status.
- Known risks.

### Verification Commands

```bash
npm run verify
npm run test:e2e
npm run verify:full
```

If `verify:security` or `npm audit` cannot run due network/registry restrictions, document that clearly.

### Done Criteria

- Unsafe copy removed.
- QA screenshots or manual viewport notes exist.
- Release checklist is complete.
- All possible gates pass.
- Any blocked gate is documented with exact reason.

### Copy-Paste Codex Prompt

```text
Read docs/codex/PROJECT_BRIEF.md copy guardrails, AGENTS.md product safety rules, TEST_STRATEGY.md, and GITFLOW.md. Perform final release-candidate review only. Search the app for unsafe claims such as visa guaranteed, approved by embassy, automatic booking, AI verified, 100% compliant, and official submission. Check role access, domain gates, export wording, appointment wording, responsive behavior, and test status. Fix only defects found during this review; do not add features or dependencies. Run npm run verify, npm run test:e2e, and npm run verify:full if the environment supports all gates. If npm audit/security is blocked by network/registry access, state that exactly. Save QA screenshots or notes under docs/qa if available. Report merge readiness and remaining risks.
```

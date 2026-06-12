# VisaFlow AI Codex Agent Instructions

## Mission

Build VisaFlow AI as a focused operational MVP:

```text
Agent intake
→ operator verification
→ precise corrections
→ export preparation
→ manual appointment handoff
```

Do not turn it into a broad CRM, marketing site, visa prediction tool, or automated visa submission system.

## Read Before Editing

Codex must read these files before any product code edit:

1. `docs/codex/PROJECT_BRIEF.md`
2. `docs/codex/ARCHITECTURE.md`
3. `docs/codex/PLANS.md`
4. `docs/codex/TASKS_FOR_CODEX.md`
5. `docs/codex/TEST_STRATEGY.md`
6. `docs/codex/GITFLOW.md`
7. Root `AGENTS.md`, if present.
8. `package.json`
9. Relevant current source files for the task.

Never edit from memory when the repository contains current code.

## How to Read the Project

Before a task, inspect:

- `package.json` scripts and dependencies.
- `src/` structure.
- Current imports for files you intend to change.
- Existing domain logic in `src/types/domain.ts` and `src/lib/workflow.ts`.
- Existing services in `src/services/`.
- Existing Supabase files in `src/lib/supabase/` and `supabase/`.
- Existing tests in `tests/`.
- Existing docs/prototypes if the task is UI-related.

Report the current facts in the final task summary. Do not invent files, scripts, or test results.

## How to Plan

For every non-trivial task:

1. Restate the objective.
2. Identify exact files/folders to inspect.
3. Identify exact files/folders to change.
4. Identify files/folders not to touch.
5. Name the architectural boundary involved: domain, application, UI, storage, infrastructure, tests.
6. Define the smallest verification command stack.
7. Stop at the task boundary.

Make small, verifiable changes. Avoid broad rewrites.

## Code Style

- Use TypeScript.
- Use named exports for domain/application/infrastructure utilities.
- Use pure functions for domain rules.
- Prefer immutable updates.
- Prefer small modules with focused responsibility.
- Prefer const maps over scattered string literals.
- Keep UI copy safe and non-promissory.
- Keep CSS/design tokens centralized.
- Avoid unrelated formatting churn.
- Preserve working parts unless there is a clear reason and verification.

## TypeScript Rules

- Do not use `any` unless there is a documented boundary reason.
- Prefer `unknown` plus narrowing for external data.
- Export type-safe constants:

```ts
export const SUBMISSION_STATUS = {
  DRAFT: "draft",
  FILLING: "filling",
} as const;
```

- Derive union types from const maps when practical.
- Keep DTOs, domain models, and database rows separate.
- Avoid magic strings where domain constants are possible.
- Use exhaustive checks for status machines.
- Do not ignore TypeScript errors.
- Do not suppress compiler/lint errors without explaining why.

## Architecture Boundaries

### Domain

Allowed:

- Types.
- Constants.
- Status transitions.
- Validations.
- Blockers.
- Readiness.
- Family rules.
- Correction rules.
- Export row mapping.

Forbidden:

- React.
- Browser storage.
- Supabase.
- Fetch.
- CSS.
- UI state.

### Application / Use Cases

Allowed:

- Role checks.
- Domain orchestration.
- Repository calls.
- Command result mapping.

Forbidden:

- JSX.
- CSS.
- Direct Supabase query construction unless inside infrastructure adapter.

### Repositories

Allowed:

- Interfaces.
- Local/mock adapter.
- Supabase adapter.
- Mappers.

Forbidden:

- UI imports.
- Domain rule duplication.
- Component state.

### UI

Allowed:

- React components.
- Layout.
- Form state.
- Rendering blockers and command results.
- Calling use cases/hooks.

Forbidden:

- Duplicating status transition logic.
- Deciding export eligibility directly.
- Bypassing repository interfaces.
- Hardcoding role visibility without application checks.
- Faking successful workflows.

## UI Rules

- Use premium dark operational cockpit direction.
- Agent accent is Gold.
- Admin accent is Blue.
- Use cards with one main meaning.
- Do not mix status and CTA in the same visual emphasis.
- Show next action near the relevant submission/applicant/file.
- Show blockers near the exact object that needs fixing.
- Family is a grouped set of applicants, not one giant form.
- Uploaded media must be visually distinct from accepted media.
- Export must be its own workflow stage.
- Appointment status must be explicitly manual.
- Desktop, tablet, and mobile must be checked for important UI changes.
- Minimum useful touch target is 44px on mobile.
- Avoid tourist stock photos, cheap gradients, and visual noise.

## Testing Rules

For domain changes, add or update unit tests.

Required domain unit areas:

- Status transitions.
- Required fields.
- Blocker calculation.
- Media status rules.
- Correction scope validation.
- Family grouping.
- Export row mapping.

For repository/use case changes, add integration tests using local/mock adapters.

Required integration flows:

- Create tourist submission.
- Create family submission.
- Submit for review.
- Return with corrections.
- Fix and resubmit.
- Accept and export.

For UI flow changes, add or update Playwright smoke coverage where practical.

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

Use actual scripts from `package.json`.

Detected scripts in this repo include:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:e2e
npm run verify
npm run verify:full
```

Run the smallest relevant checks during development, and run stronger gates before merge.

## Commit Rules

Use this commit convention:

```text
feat: add domain status machine
fix: correct blocker calculation
refactor: split submission repository boundary
test: cover export row mapping
docs: update Codex architecture
chore: configure CI verification
```

Rules:

- One commit should represent one coherent change.
- Do not mix UI redesign and domain rule changes in one commit.
- Do not commit generated build output unless the repo explicitly requires it.
- Do not commit secrets or local environment files.
- Do not delete existing functionality without explanation.
- Do not leave dead code.

## What Codex Must Do

Codex must:

1. Read before editing.
2. Preserve working parts.
3. Avoid rewrites without reason.
4. Make small, verifiable changes.
5. Separate domain, UI, storage, and infrastructure.
6. Avoid unrelated changes.
7. Run checks after significant changes.
8. Explain failures honestly.
9. Keep product claims safe and non-promissory.
10. Prefer local/mock persistence until Supabase activation is explicitly scoped.
11. Keep repository interfaces separate from implementations.
12. Keep status transitions centralized.
13. Keep validation centralized.
14. Keep blocker calculation centralized.
15. Keep export mapping centralized.
16. Keep type-safe enums/const maps.
17. Respect current package scripts.

## What Codex Must Not Do Without Confirmation

Codex must not:

- Add fake AI logic.
- Promise automatic appointment booking.
- Imply visa approval.
- Imply embassy approval.
- Imply official submission.
- Convert the product into a broad CRM.
- Add payments.
- Add OCR as a required flow.
- Add visa probability/chance scoring.
- Activate production Supabase without gates.
- Add heavy dependencies without justification.
- Create backend complexity without need.
- Use `any` without clear reason.
- Ignore TypeScript errors.
- Leave dead code.
- Leave TODOs instead of required business logic.
- Replace working modules with a full rewrite unless the task explicitly requires it.
- Delete tests to make the build pass.
- Change package scripts without explaining why.
- Store secrets in the repo.
- Use local role switch as production security.
- Claim a command passed if it was not run or failed.

## Product Safety Rules

Allowed copy:

- “Ready for operator review”
- “Needs correction”
- “Media uploaded, pending review”
- “Accepted for export”
- “Sent to appointment handling”
- “Manual appointment status”

Forbidden copy:

- “Visa guaranteed”
- “Approved by embassy”
- “Automatic booking completed”
- “AI verified”
- “100% compliant”
- “Official submission”

AI-related copy must be assistive only:

- AI may help organize next steps.
- AI may summarize missing fields if rules are deterministic.
- AI must not decide eligibility, compliance, visa outcome, or official approval.

## Self-Review Checklist

Before final response, Codex must verify:

### Scope

- Did I only change the files/folders allowed by the task?
- Did I avoid unrelated cleanup?
- Did I avoid implementation outside the requested workstream?

### Architecture

- Are domain rules outside UI?
- Are persistence details outside UI?
- Are repository interfaces separate from implementations?
- Are status transitions centralized?
- Are validations centralized?
- Are blockers centralized?
- Is export mapping centralized?

### TypeScript

- Are all types explicit enough?
- Did I avoid unjustified `any`?
- Are string literals replaced with const maps where useful?
- Are DTO/domain/DB row models separate?

### Product Safety

- Did I avoid visa guarantees and official-submission claims?
- Did I avoid fake AI verification?
- Did I keep appointment handling manual?

### Testing

- Did I add/update tests for changed business rules?
- Did I run the relevant verification commands?
- Did I report failures honestly?

### UI

- Does the UI show next actions clearly?
- Does the UI show blockers near the relevant object?
- Does the UI distinguish uploaded from accepted media?
- Does the UI avoid desktop/mobile horizontal overflow?

## Definition of Done

A task is done only if:

- Stated scope is implemented.
- Architectural boundary is preserved.
- There are no TypeScript errors.
- There are no lint errors.
- Relevant tests pass.
- Build passes when the task affects app code.
- UI does not break on desktop/tablet/mobile when UI changed.
- Statuses and blockers work for the changed flow.
- Data does not disappear on reload when local persistence is part of scope.
- Summary explains what changed.
- Verification commands and results are listed.
- Risks and next step are stated.

# Agent → Admin review handoff tasks

- [x] T1: Define the screen-by-screen state and ownership contract
  - goal: establish one traceable flow before release work.
  - files: `.claude/specs/agent-review-handoff-flow/{requirements,design}.md`
  - acceptance: every visible screen, role, status, soft condition, hard
    condition, and export handoff is named.
  - spec: `requirements.md#screen-flow`

- [x] T2: Keep draft packages out of the agent action queue
  - goal: a new draft remains only in `Мои подачи` until work begins.
  - files: `src/modules/submissions/agentActions.ts`,
    `tests/e2e/v19-create-submission-family-proof.spec.ts`,
    `tests/unit/v19SubmissionRules.spec.ts`
  - acceptance: the newly created card is visible in `Мои подачи` and absent
    from `Мои действия`.
  - spec: `requirements.md#us-1-create-without-creating-a-false-action`

- [x] T3: Allow complete-package handoff while OCR remains review context
  - goal: remove the passport confirmation dead end without accepting a
    passport automatically.
  - files: `src/modules/submissions/{passportExtractionGuards,status,submissionNextStepEngine,operationalWorkflow}.ts`,
    `tests/unit/{operationalWorkflow,submissionNextStepEngine}.spec.ts`,
    `tests/e2e/v19-real-passport-ocr-proof.spec.ts`
  - acceptance: pending/extracting OCR sends to review; conflicts and critical
    identity mismatches still reject central/direct handoff.
  - spec: `requirements.md#us-2-complete-and-hand-off-a-package`

- [x] T4: Prove the local browser handoff lifecycle
  - goal: create → start work → complete files/questionnaire → handoff →
    administrator review queue through the rendered UI.
  - files: `tests/e2e/app-smoke.spec.ts`
  - acceptance: one fresh Chromium receipt with only localhost origins and no
    browser problems; the review workspace must fail closed for local originals.
  - spec: `design.md#evidence-mapping`

- [ ] T5: Prove the protected acceptance/export lifecycle in an isolated sandbox
  - goal: create → protected upload → review acceptance → Excel through the
    rendered UI, then read back and clean up test data.
  - files: sandbox descriptor, external evidence only, and a dedicated
    Supabase E2E suite in a separate approved scope.
  - acceptance: a non-production sandbox is assigned and the browser proof
    binds test accounts, synthetic files, Storage/RLS writes, readback, and
    cleanup to that sandbox only.
  - blocker: `config/supabase-sandbox-target.mjs` is deliberately unassigned;
    the only connector-visible project is production.
  - spec: `requirements.md#non-functional-acceptance`

- [ ] T6: Run final gates and independent stopped-diff review
  - goal: bind the final candidate to its checks before commit/push/deploy.
  - files: external evidence only
  - acceptance: focused units, typecheck, lint, build, browser evidence,
    cleanup, verifier, and UX red-team are all green.
  - spec: `requirements.md#non-functional-acceptance`

- [ ] T7: Add server-side initial review-handoff validation
  - goal: enforce the same action-specific policy in Supabase RPC/migration.
  - files: Supabase migration/persistence contract and tests, separate scope.
  - acceptance: authenticated direct RPC cannot forge a forbidden
    `submitted_for_review` state.
  - spec: `design.md#production-boundary`

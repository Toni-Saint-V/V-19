# RLS / Storage Assault Suite Evidence

Run id: `20260628T083052`
Lane: `04-rls-storage-assault`
Task ids: `7`
Status: local adversarial suite ready; live proof blocked by owner-approved target.

## Package 1 Readiness

Evidence read:

- `docs/release/package-evidence-gate.md`
- `docs/qa/generated-no-go-next-lane-prompts/20260628T083052/context/docs/release/package-evidence-gate.md`
- Package 1 lane 02 evidence:
  `/Users/user/.codex/worktrees/v19-no-go-parallel/20260627T200633/02-supabase-schema-rls/V-19/docs/qa/20260627T200633-supabase-schema-rls-evidence.md`
- Package 1 lane 02 commit:
  `2cfec188 fix(supabase): lock canonical export media slots`

Blocking findings:

- No package-1 blocker prevents local Task 7 test-suite preparation.
- Live Supabase proof remains unverified until owner-approved sandbox credentials
  and target are present.

Decision: `CONTINUE` for local suite finalization; `test:supabase-live` remains
blocked by owner approval and missing `.env.supabase-smoke.local`.

## Prompt Quality Pass

`claude-octopus:skill-meta-prompt`:

- Task decomposition is strong enough: source-truth gate, package dependency,
  adversarial cases, and no-guessing output shape are explicit.
- Clarification applied: treat this lane as local adversarial suite finalization
  unless an owner-approved live target is present.

`strict-quality-critic`:

- Finding: live proof could be overstated if local verifier hooks pass.
- Finding: legacy archive smoke could be mistaken for V-19 release proof.
- Clarification applied: canonical smoke is separate from legacy archive smoke;
  live status must be `Unverified` or blocked without approved target.

Changes made to execution interpretation:

- Do not touch schema migrations in this lane.
- Do not run `npm run test:supabase-live` without owner-approved target.
- Require release verifier hooks for each adversarial live-smoke case.

## Spec Lock

Product intent:

- Prove the V-19 Supabase live smoke is ready to assault canonical RLS and
  private storage denial paths.

Target user:

- Release owner and backend reviewer deciding whether RLS/storage proof is ready
  for an owner-approved sandbox run.

User stories:

- As an admin/release owner, I can see that wrong owner, wrong applicant, wrong
  media slot, wrong extension, path traversal, direct table denial, RPC denial,
  and signed URL behavior are covered.
- As an agent, I cannot read or mutate another agent's private submissions/media.

Acceptance criteria:

- Canonical V-19 live smoke covers all lane-owned adversarial cases.
- Legacy archive smoke is opt-in and not counted as V-19 release proof.
- `npm run verify:supabase-release` fails if the adversarial hooks are removed.
- Live proof is green only after `npm run test:supabase-live` passes against the
  owner-approved sandbox.

Edge cases:

- Missing `.env.supabase-smoke.local`.
- Non-sandbox activation target.
- Wrong Supabase project id.
- Legacy media archive compatibility paths.

Non-happy paths:

- Cross-agent submission read returns no rows.
- Cross-agent media read returns no rows.
- Cross-agent draft save RPC fails.
- Agent export table insert fails.
- Agent export RPC fails.
- Wrong applicant storage path fails.
- Wrong media slot fails.
- Wrong extension/MIME fails.
- `../` path traversal fails.
- Cross-agent signed URL creation fails.

Technical assumptions:

- `submission-media` remains private.
- Canonical media slots are `passport_scan`, `selfie`, and `selfie_2`.
- Live smoke can only run against allow-listed sandbox project
  `oevvaowoklqttqkraxho`.

Affected modules:

- `tests/integration/supabase-live.spec.ts`
- `scripts/verify-supabase-release.mjs`
- `docs/qa/20260628T083052-rls-storage-assault-evidence.md`

Implementation tasks:

- Add canonical V-19 live smoke.
- Gate legacy smoke behind `VITEST_SUPABASE_LEGACY_ARCHIVE=1`.
- Add release verifier checks for all adversarial case hooks.
- Record local evidence and live-proof blocker.

Verification plan:

- `git diff --check`
- `npm exec -- prettier --check tests/integration/supabase-live.spec.ts scripts/verify-supabase-release.mjs`
- `npm run typecheck`
- `npm run lint`
- `npm exec -- vitest run tests/unit/supabaseSecurityContract.spec.ts`
- `npm run test`
- `npm run verify:supabase-release`
- `npm audit --omit=dev`

Release risks:

- Live RLS/storage behavior is still unverified until owner-approved sandbox
  credentials and target are available.
- Production activation remains blocked by the production approval checklist.

## Verification

Passed:

- `git diff --check`
- `npm exec -- prettier --check tests/integration/supabase-live.spec.ts scripts/verify-supabase-release.mjs`
- `npm run typecheck`
- `npm run lint`
- `npm exec -- vitest run tests/unit/supabaseSecurityContract.spec.ts`
  - 1 file passed, 16 tests passed.
- `npm run test`
  - 44 files passed, 403 tests passed.
- `npm run verify:supabase-release`
  - 155 checks passed.
- `npm audit --omit=dev`
  - 0 vulnerabilities.

Blocked / not run:

- `npm run test:supabase-live`
  - Not run. Owner-approved live target is absent.
  - `.env.supabase-smoke.local` is absent.
  - No relevant live smoke environment variables were present in this shell.

Not used as proof:

- Direct `npm exec -- vitest run tests/integration/supabase-live.spec.ts --reporter verbose`.
  This repo's Vitest config excludes `tests/integration/**` outside the project
  test script, so the official local proof is `npm run test`.

## Artifact Proof

Local artifact:

- `docs/qa/20260628T083052-rls-storage-assault-evidence.md`

Live artifact:

- `Unverified` - no owner-approved live run was executed.

Screenshots:

- Not applicable - backend/RLS/storage test lane, no UI surface changed.

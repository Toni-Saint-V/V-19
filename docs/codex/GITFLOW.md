# VisaFlow AI Git Flow

## Branch Model

Use a simple `main` + `develop` + workstream branch model.

```text
main
develop
feat/domain-core
feat/storage-adapter
feat/agent-flow
feat/admin-review
feat/export-flow
feat/premium-ui-system
feat/tests-and-ci
hardening/e2e-mvp
```

### `main`

Purpose:

- Stable release branch.
- Only receives merge commits or squash merges from `develop` release candidates.
- Must always pass release gates.

Rules:

- No direct commits.
- No experimental work.
- No incomplete features.
- No unsafe copy.
- No production Supabase activation unless explicitly approved and gated.

### `develop`

Purpose:

- Integration branch for completed workstreams.
- Source branch for final hardening.
- Should remain buildable.

Rules:

- Merge workstream PRs only after verification.
- Do not merge partial work that blocks other teams unless explicitly coordinated.
- Keep migrations/package changes rare and reviewed.

### Workstream Branches

Use one branch per workstream:

```text
feat/domain-core
feat/storage-adapter
feat/agent-flow
feat/admin-review
feat/export-flow
feat/premium-ui-system
feat/tests-and-ci
```

Rules:

- One branch equals one workstream.
- Keep PRs scoped.
- Do not mix UI redesign and domain rules in one PR.
- Do not mix storage adapter changes with feature UI unless the task requires it.
- Do not delete existing functionality without explanation.
- Rebase/merge from `develop` regularly enough to reduce integration drift.

### Hardening Branch

```text
hardening/e2e-mvp
```

Purpose:

- Connect merged workstreams.
- Fix workflow blockers.
- Run full QA.
- Prepare release candidate.

Rules:

- No new feature scope.
- No new dependencies.
- No Supabase production activation.
- Fix only integration, QA, safety, responsive, and workflow issues.

## Recommended Branch Order

1. `feat/domain-core`
2. `feat/storage-adapter`
3. `feat/premium-ui-system`
4. `feat/agent-flow`
5. `feat/admin-review`
6. `feat/export-flow`
7. `feat/tests-and-ci`
8. `hardening/e2e-mvp`
9. `develop` release candidate
10. `main`

## PR Rules

Each PR must include:

- Scope summary.
- Workstream name.
- Linked task IDs from `docs/codex/TASKS_FOR_CODEX.md`.
- Files/folders changed.
- Files/folders intentionally not changed.
- Verification commands run.
- Command results.
- Screenshots for meaningful UI changes, if tooling is available.
- Known risks.
- Follow-up tasks.

Required PR checklist:

```text
[ ] I read docs/codex/AGENTS.md.
[ ] I kept the PR within one workstream.
[ ] I did not mix UI redesign and domain rules.
[ ] I did not add unsafe visa/AI/appointment copy.
[ ] I did not add heavy dependencies without justification.
[ ] I did not activate production Supabase.
[ ] I did not delete existing functionality without explanation.
[ ] I ran relevant verification commands.
[ ] I documented failures honestly.
```

## Commit Convention

Use conventional prefixes:

```text
feat:
fix:
refactor:
test:
docs:
chore:
```

Examples:

```text
feat: add submission status machine
feat: implement local submission repository
fix: block admin acceptance with uploaded-only media
refactor: split export row mapper from export UI
test: cover correction scope validation
docs: add Codex task plan
chore: add CI typecheck gate
```

### Commit Rules

- Keep commits focused.
- Prefer one commit per meaningful step.
- Do not commit build artifacts from `dist/`.
- Do not commit `node_modules/`.
- Do not commit secrets.
- Do not commit unrelated formatting churn.
- Do not use vague messages like `updates`, `fix stuff`, or `wip` in final PR history.

## Merge Strategy

Preferred strategy:

- Squash merge workstream PRs into `develop` when the branch has noisy iterative commits.
- Merge commit is acceptable for large workstream branches when preserving history helps review.
- Use release merge from `develop` to `main` only after hardening gates pass.

Rules:

- Do not fast-forward into `main`.
- Do not merge failing checks unless there is an explicitly accepted non-production exception.
- Do not merge unresolved TypeScript/lint/test/build failures.
- Do not merge UI PRs without responsive checks when UI changed.
- Do not merge domain PRs without unit tests.

## Release Flow

### 1. Workstream Integration

Merge completed workstream branches into `develop` in recommended order:

```text
feat/domain-core
→ feat/storage-adapter
→ feat/premium-ui-system
→ feat/agent-flow
→ feat/admin-review
→ feat/export-flow
→ feat/tests-and-ci
```

### 2. Hardening

Create:

```text
hardening/e2e-mvp
```

from `develop`.

Run:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:e2e
npm run verify
```

Fix only blockers.

### 3. Release Candidate

Open PR:

```text
hardening/e2e-mvp → develop
```

After merge, tag a release candidate branch or tag if desired:

```text
release/mvp-rc1
```

Run:

```bash
npm run verify:full
```

If `npm run verify:security` is blocked by network/registry access, document it and run it in an environment where `npm audit --omit=dev` can access the registry before production release.

### 4. Main Release

Open PR:

```text
develop → main
```

PR must include:

- Release summary.
- Smoke path result.
- Verification commands.
- Known limitations.
- Product safety confirmation.
- Supabase status: local/mock only or explicitly activated.
- Rollback note.

## Review Checklist

### Product Scope

```text
[ ] MVP remains intake + verification + export + manual appointment handoff.
[ ] No payments were added.
[ ] No automatic appointment booking was added.
[ ] No official submission claim was added.
[ ] No visa guarantee/probability/chance logic was added.
[ ] No broad CRM scope was added.
```

### Architecture

```text
[ ] Domain rules are outside UI.
[ ] Repository interfaces are separate from implementations.
[ ] UI does not know Supabase/local storage details.
[ ] Status transitions are centralized.
[ ] Validation is centralized.
[ ] Blocker calculation is centralized.
[ ] Export mapping is centralized.
[ ] Magic strings are reduced through const maps.
```

### Security / Role Access

```text
[ ] Agent sees only own submissions.
[ ] Admin can see all submissions.
[ ] Admin-only screens are not available to agent role.
[ ] Export is admin-only.
[ ] Media acceptance is admin-only.
[ ] Appointment status updates are admin-only.
[ ] Demo role switch is not presented as production security.
[ ] No secrets were committed.
```

### Domain Rules

```text
[ ] Tourist/single submission has exactly one applicant before submit.
[ ] Family submission can be draft with zero applicants but cannot submit with zero.
[ ] Missing required fields block submission.
[ ] Missing media blocks submission.
[ ] Missing passport blocks filename generation and submission/export.
[ ] Uploaded media is distinct from accepted media.
[ ] Open blocking corrections block acceptance.
[ ] Export has one row per applicant.
[ ] Family export rows stay adjacent.
[ ] Appointment status is manual.
```

### UI / UX

```text
[ ] Premium dark cockpit direction is preserved.
[ ] Agent accent is Gold.
[ ] Admin accent is Blue.
[ ] One main meaning per card.
[ ] Next action is clear.
[ ] Blockers are shown near exact field/file/applicant.
[ ] Loading, empty, and error states exist where relevant.
[ ] Desktop layout works.
[ ] Tablet layout works.
[ ] Mobile layout works.
[ ] No horizontal overflow.
```

### Testing

```text
[ ] npm run typecheck passed.
[ ] npm run lint passed.
[ ] npm run test passed.
[ ] npm run build passed.
[ ] npm run test:e2e passed for UI/runtime work.
[ ] Domain tests were added/updated for domain changes.
[ ] Integration tests were added/updated for repository/use case changes.
[ ] Smoke path was updated for full workflow changes.
```

### Copy Safety

Forbidden terms check:

```text
[ ] “Visa guaranteed” does not appear.
[ ] “Approved by embassy” does not appear.
[ ] “Automatic booking completed” does not appear.
[ ] “AI verified” does not appear.
[ ] “100% compliant” does not appear.
[ ] “Official submission” does not appear.
```

Allowed safe concepts:

```text
[ ] Ready for operator review.
[ ] Needs correction.
[ ] Media uploaded, pending review.
[ ] Accepted for export.
[ ] Sent to appointment handling.
[ ] Manual appointment status.
```

## PR Template

````markdown
# Summary

<!-- What changed and why? -->

## Workstream

<!-- Domain Core / Storage / Agent Flow / Admin Review / Export / UI / Tests / Hardening -->

## Task IDs

<!-- Example: VF-DOM-01, VF-DOM-02 -->

## Files Changed

<!-- Key files/folders -->

## Files Intentionally Not Changed

<!-- Important boundaries preserved -->

## Verification

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```
````

Additional UI/runtime checks:

```bash
npm run test:e2e
```

## Results

<!-- Passed/failed/not run with reason -->

## Screenshots

<!-- Add docs/qa links for UI changes when available -->

## Product Safety

```text
[ ] No visa guarantee.
[ ] No official submission claim.
[ ] No automatic appointment booking claim.
[ ] No fake AI verification.
```

## Risks / Follow-ups

<!-- Known limitations -->

```

## Rollback Strategy

For non-release PRs:

- Revert the PR.
- Re-run verification on `develop`.
- Restore previous local storage schema only if the PR changed persistence.
- Document any local data migration risk.

For release PRs:

- Revert `develop → main` merge or deploy previous tagged build.
- Keep Supabase production activation disabled unless explicitly part of the release.
- Communicate known data/storage compatibility issues.

## Dependency Policy

Do not add dependencies unless:

- The task cannot be completed safely with existing dependencies.
- The dependency is actively maintained.
- The dependency is justified in the PR.
- Bundle/runtime impact is considered.
- Tests are added.
- `package.json` and `package-lock.json` changes are isolated.

Special rule for export:

- Prefer CSV first.
- Add XLSX dependency only after product confirmation and architecture review.

## Supabase Policy

Supabase files already exist, but production activation is separate from MVP local/mock flow.

Do not:

- Change RLS policies casually.
- Commit service role keys.
- Make Supabase required for local MVP.
- Store media publicly.
- Bypass repository interfaces.

Do:

- Keep Supabase behind adapters.
- Use mappers between DB rows and domain.
- Keep local/mock mode working.
- Document future activation gates.
```

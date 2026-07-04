# V-19 10 User Rollout Readiness Plan

Status: not ready for 10-user rollout yet.
Target: controlled V-19 pilot for 10 real users after current merge.
Source truth: `docs/release/canonical-domain-contract.md`, `docs/architecture/v19-ui-screen-model-schema.md`, `docs/release/supabase-production-readiness.json`, current verification scripts.

## Goal

Bring V-19 from locally verified product flow to a controlled 10-user pilot without weakening the submission-first scope, Supabase security boundary, export fail-closed contract, or role-safe UI.

## Current Readiness

Ready to merge as development main after the all-thread integration branch
passes its own verification:

- Agent top-level IA is locked to `Мои действия`, `Мои подачи`, `Настройки`.
- Admin top-level IA is locked to `Проверка`, `Выгрузка`, `Настройки`.
- `Входящие` is removed as a standalone work screen.
- UI screen/model handoff schema exists.
- Previous closeout verification passed at `b83c5915`; the all-thread merge
  adds reference, QA, and production packet changes and must rerun its own
  local unit, build, browser smoke, security, auth/data, and Supabase release
  gates before it is treated as current.

Not ready for 10-user rollout:

- `npm run verify:performance` fails current JS/CSS budgets.
- `npm run verify:production-packet` remains fail-closed with production evidence and approval blockers.
- Production smoke users, backup/restore proof, security advisor proof, and post-activation workflow evidence are not current for this HEAD.

## Stop Rules

Do not invite 10 users while any item below is true:

- `verify:performance` fails.
- `verify:production-packet` reports `NO_GO`.
- Browser smoke has untriaged Critical, Serious, or Medium failures.
- Supabase RLS/storage/security gates are stale or failing.
- There is no rollback owner, backup proof, or support owner.
- Production smoke accounts are not discovered and role-verified.

## Phase 1 - Merge Hygiene

Objective: land only the intended closeout changes.

Required:

- Commit the closeout branch with code/docs/tests/verifier updates.
- Exclude generated Playwright screenshot churn unless deliberately kept as evidence.
- Keep the obsolete `docs/qa/v19-agent-inbox-reference-2026-06-20.png` deleted because `Входящие` is no longer a reference screen.
- Record remaining blockers in the final merge report.
- Keep `docs/release/v19-thread-merge-ledger-20260704.md` current when a
  thread change is integrated, reconciled, or deliberately excluded.

Evidence:

- `git diff --cached --stat`
- `git diff --check`
- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- Commit hash on `main`

## Phase 2 - Performance Gate Closure

Objective: make the app pass its release performance budget.

Required:

- Reduce `dist/assets/index-*.js` below 500 KB raw.
- Bring CSS chunks to 4 or fewer, or update the budget only if the release owner accepts a documented new threshold.
- Bring total CSS raw and gzip below current verifier limits.
- Preserve UI proof after any code splitting or CSS split changes.

Likely work:

- Move heavy admin/export/passport/OCR surfaces behind lazy boundaries where safe.
- Audit duplicated CSS final-layer overrides.
- Keep `CreateSubmissionDrawer`, `AdminReviewDrawer`, settings, export workbook, Tesseract, and Supabase chunks lazy where possible.

Evidence:

- `npm run build`
- `npm run verify:performance`
- `npm run verify:v19-ui-proof`
- `npx playwright test tests/e2e/app-smoke.spec.ts --project=chromium --reporter=line`

## Phase 3 - Production Evidence Refresh

Objective: turn `supabase-production-readiness.json` from fail-closed `NO_GO` to current evidence.

Required:

- Refresh production packet against current `HEAD`.
- Confirm production auth/profile discovery and no orphan auth users.
- Verify agent, other-agent, and admin smoke accounts.
- Record backup timestamp, restore path, restore evidence, RPO/RTO acceptance.
- Check Supabase security advisors against production.
- Confirm Auth leaked password protection plan eligibility and enabled state.
- Confirm production activation flag remains explicit.

Evidence:

- `npm run verify:supabase-release`
- `npm run verify:auth-data-readiness`
- production smoke account discovery artifact
- backup/restore artifact
- security advisor artifact
- `npm run verify:production-packet` passing without `NO_GO`

## Phase 4 - 10 User Pilot Setup

Objective: define a controlled cohort and support model.

Recommended cohort:

- 6 agents creating and correcting submissions.
- 2 admins reviewing, returning, accepting, and exporting.
- 1 rollout owner responsible for Go/No-Go.
- 1 support observer responsible for incident triage and notes.

Pilot constraints:

- Spain-only flow.
- Submission types: `single` and `family` only.
- No CRM, groups, analytics, AI decisions, or multi-country scope.
- OCR/PDF extracted data remains advisory until reviewed.
- Export remains fail-closed.

Required setup:

- Create or verify user accounts and profiles.
- Assign roles server-side only.
- Prepare a short test data policy: what can be real, what must be synthetic.
- Prepare support channel, incident template, and rollback contact.
- Define pilot window and freeze window.

## Phase 5 - Pre-Invite Scenario Proof

Objective: prove the actual 10-user paths before inviting the cohort.

Required user journeys:

- Agent signs in and opens `Мои действия`.
- Agent creates `single` draft, uploads required media, completes questionnaire, submits.
- Agent creates `family` draft and verifies per-applicant media/readiness.
- Admin opens `Проверка`, returns a precise issue.
- Agent fixes issue and resubmits corrections.
- Admin closes fixed issue and accepts.
- Admin opens `Выгрузка`, previews Excel, generates, downloads, and marks exported.
- Other agent cannot read or mutate another agent submission/media.
- Private media signed URL is scoped.
- Mobile 390px can complete key navigation and drawer actions.

Evidence:

- `npm run verify:v19-ui-proof`
- `npx playwright test tests/e2e/app-smoke.spec.ts --project=chromium --reporter=line`
- Supabase live smoke on the pilot target
- manual screenshots for agent/admin/mobile happy paths

## Phase 6 - Rollout Sequence

Day 0:

- Internal owner/admin smoke on target environment.
- Confirm monitoring/support channel.
- Confirm rollback path.

Day 1:

- Invite 2 agents and 1 admin.
- Run create -> review -> return -> fix -> accept.
- No export unless review path is clean.

Day 2:

- Add 4 more agents and 1 admin.
- Run mixed `single` and `family` cases.
- Run export package only after admin acceptance flow is clean.

Day 3:

- Expand to all 10 pilot participants.
- Run controlled export.
- Review incidents and support notes at end of day.

## Pilot Metrics

Track daily:

- sign-in success rate;
- draft creation success rate;
- media upload success/failure count;
- submit-for-review success count;
- admin return/accept count;
- export generation/download success;
- average review turnaround;
- console/page errors from monitored sessions;
- support tickets by severity;
- privacy/security incidents.

## Go / No-Go For 10 Users

Go only if:

- `verify:performance` passes;
- `verify:production-packet` passes for current `HEAD`;
- production smoke users and roles are verified;
- backup/restore evidence is current;
- Supabase security advisors are checked and non-blocking;
- app smoke and UI proof pass;
- owner accepts remaining low risks in writing.

No-Go if:

- any P0/P1 user journey fails;
- export can produce stale or mismatched package identity;
- RLS/storage checks fail or are stale;
- media upload or signed URL scope is unproven;
- rollback path is not confirmed.

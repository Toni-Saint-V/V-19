# Package 2 Integration Gate

> Historical integration gate. Its Excel-only export decision was superseded
> on 2026-08-12 by `docs/release/export-artifact-scope.md`.

> Historical branch evidence record only. This document is not current runtime
> source truth and does not approve production activation. Use
> `docs/release/canonical-domain-contract.md` and current verifier output for
> current readiness decisions.

Status: branch-ready before owner pre-merge checks; not production readiness approval.
Recorded: 2026-06-28.
Branch: `codex/v19-package2-integration-20260628`.
Base: `f4cc31d10f1bbb2a222dc4b6884b0b5d77518cac`.

## Scope

This gate records the integrated Package 2 lane closure state before merging to
`main`.

Integrated lane surfaces:

- trip date range persistence for submissions and questionnaire date sync;
- issue handoff lifecycle and action error contracts;
- canonical media replacement behavior for returned submissions;
- fail-closed export grouping, preview, workbook, and durable package identity;
- Supabase release verifier coverage for RLS, storage, and export RPC contracts;
- V-19 operations drawer and app-smoke proof updates.

This branch intentionally does not claim production readiness or live Supabase
activation.

## Goal Check

The patch closes the branch-ready Package 2 goal when judged against the current
chat constraints and the codebase source truth:

- six lane surfaces are integrated into one branch;
- export remains Excel-only for the V-19 pilot;
- ZIP/package storage is explicitly out of scope;
- export preview, workbook, and durable package identity use the same canonical
  row/package contract;
- mixed city or mixed trip date exports fail closed;
- mixed family/single export is allowed only when the city and trip date range
  match;
- returned legacy media targets are normalized to canonical V-19 media slots;
- lane closure required repeated review until `0 findings`.

## Review Loop

Final review state:

- `bank-grade-autofix-loop`: executed as the local autofix/recheck loop for the
  integrated diff.
- `development-skills:staff-review`: repeated after fixes.
- Final staff-review verdict: `0 real integration-scope findings`.

Findings fixed during the loop:

- stale SQL export fingerprint derivation no longer diverges from cockpit
  `exportPackage` identity;
- SQL export completion no longer rejects valid mixed family/single packages;
- trip date range persistence no longer collapses a range into one date;
- export rules now block mixed trip date ranges before workbook/package flow.

## Verification

Passed:

- `git diff --check`
- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run verify:supabase-release`
- `npm run verify:safety`
- `npm run build`
- `NODE_PATH="$PWD/node_modules" npx playwright test app-smoke.spec.ts --project=chromium --config=/tmp/v19-package2-playwright-4199.config.ts`

Latest recorded command results:

- unit/integration suite: 44 files passed, 426 tests passed;
- Supabase release verifier: 160 checks passed;
- app smoke: 17 tests passed.

## Not Claimed

Not run in this integration branch:

- `npm run test:supabase-live`;
- owner full pre-merge gate;
- merge to `main`;
- production deployment.

Reason: live Supabase proof requires an owner-approved target, and the owner
explicitly reserved final pre-merge checks.

## Verdict

Branch-ready for owner-run pre-merge checks.

Not production-ready.
Not live-Supabase-approved.
Not merged to `main`.

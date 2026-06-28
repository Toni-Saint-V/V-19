# Pilot Auth Gate Evidence

Recorded: 2026-06-28
Branch: `codex/rush-06-auth-pilot-gate-20260628-230554-52684`
Scope: AUTH / PILOT GATE / ACCESS SAFETY ONLY

## Pilot Verdict

Pilot verdict: `GO_DUMMY_ONLY`

Allowed:

- closed pilot only;
- 5-10 approved users only;
- dummy/test documents only;
- explicit local/e2e demo mode only for local seed bypass;
- admin approval required before unknown local/dev emails become active users.

Not allowed:

- public launch;
- open registration;
- real passports;
- production OCR claim;
- production Storage/RLS claim;
- production self-service signup;
- production profile auto-repair without owner-approved role assignment.

Production verdict remains: `NO_GO`

## Auth Gate Evidence

- Fresh local/demo sessions no longer auto-open `agent@visaflow.local` unless
  `VITE_LOCAL_DEMO_AUTH_BYPASS=true` or
  `VITE_E2E_LOCAL_DEMO_AUTH_BYPASS=true`.
- Local role switch is hidden unless explicit local/e2e demo bypass is enabled.
- Local role switch is never available in Supabase mode.
- Pending access requests are denied workspace access.
- Rejected access requests are denied workspace access.
- Approved active agents can log in.
- Approved admins can log in and review pending access requests.
- Supabase frontend auth uses password sign-in and does not expose
  self-service signup.
- Missing Supabase profiles can be recovered only outside production; production
  recovery stays fail-closed and requires owner-approved role assignment.

## Fresh Verification

- `git diff --check`: PASS
- `npm run typecheck`: PASS
- `npm run lint`: PASS
- `npm run build`: PASS
- `npm run test`: PASS, 46 files / 441 tests
- `npm run verify:safety`: PASS
- `npm run verify:auth-data-readiness`: PASS, 128 checks
- `npx playwright test tests/e2e/app-smoke.spec.ts --project=chromium`: PASS,
  17 tests

Screenshots refreshed by the Playwright smoke run remain under `docs/qa/`.

## Production Boundary

This evidence does not prove production readiness. Production remains `NO_GO`
until owner-approved live Supabase, Storage/RLS, browser QA, OCR/Edge dry-run,
backup/rollback, and production activation evidence exists.

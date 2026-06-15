# Supabase Live Sandbox Readiness Evidence

Date: 2026-06-15
Target: `/Users/user/Documents/V-19`
Branch: `main`
Scope: live sandbox pilot only; production activation remains blocked.

## Preflight

- `git status --short --branch` -> `## main`
- `.env.supabase-smoke.local` exists locally and is ignored by `.gitignore` via `*.local`
- `npm run verify:supabase-release` -> pass, 42 checks before browser audit wiring

## Sandbox Proof

- `npm run test:supabase-live`
  - Result: pass
  - Evidence: 1 test file passed, 1 test passed
  - Side effect boundary: deterministic `SMOKE-*` data in the allow-listed sandbox project

## Browser Key Audit

- `npm run verify:supabase-release`
  - Result: pass
  - Evidence: 50 checks after browser audit wiring
- `npm run test:e2e:supabase`
  - First run: blocked by local sandbox permission, `listen EPERM` on `127.0.0.1:4198`
  - Approved rerun: pass
  - Evidence: 1 Playwright test passed
  - Screenshot: `docs/qa/supabase-browser-key-audit-desktop.png`

## Post-Edit Smoke

- `npm run test:supabase-live`
  - Result: pass
  - Evidence: 1 test file passed, 1 test passed

## Final Verification

- `npm run format:check`
  - Result: pass
- `npm run test`
  - Result: pass
  - Evidence: 14 test files passed, 72 tests passed
- `npm run verify:full`
  - Result: pass
  - Evidence: typecheck passed; lint passed; Vitest passed; build passed; performance budget passed; Supabase release verifier passed 50 checks; `npm audit --omit=dev` found 0 vulnerabilities; Playwright e2e passed 16 tests

## Not Production Ready

Production remains blocked until target identity, backup/restore owner, explicit owner approval, production migration history check, production post-activation checks, and `VITE_SUPABASE_PRODUCTION_APPROVED=true` are completed outside this sandbox sprint.

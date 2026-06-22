# V-19 Export Workbook Fail-Closed Proof - 2026-06-22

Target: `/Users/user/Documents/V-19`
Branch: `codex/v19-readiness-performance-gate`
Commit baseline: `914ad1fb164693c00954047573a45271dd7f00b8`

## Scope

Bounded export hardening only:

- bind workbook download to the domain-owned export package identity;
- keep Excel preview rows and workbook rows tied to the same row model;
- fail closed when a download is attempted before file generation;
- fail closed when preview row count no longer matches the generated package;
- keep the XLSX writer lazy chunk inside the performance budget.

Out of scope:

- UI redesign;
- routing changes;
- Supabase schema or production state mutation;
- production activation;
- new export override flow.

## Fresh Verification

- `npx vitest run tests/unit/exportWorkbook.spec.ts tests/unit/v19SubmissionRules.spec.ts tests/unit/submissionExportWorkflow.spec.ts`
  - Result: pass
  - Evidence: 3 files passed, 60 tests passed.
- `npm run typecheck`
  - Result: pass.
- `npm run lint`
  - Result: pass.
- `npm run verify:safety`
  - Result: pass.
- `npm run build && npm run verify:performance`
  - Result: pass.
  - Evidence: export workbook lazy JS stayed within budget at 5.9 KB raw / 2.2 KB gzip.
- `npx playwright test tests/e2e/app-smoke.spec.ts --project=chromium -g "export|Excel|выгруз"`
  - Result: pass.
  - Evidence: 5 Chromium export/Excel flow tests passed.
- `npm run verify`
  - Result: pass.
  - Evidence: typecheck, lint, safety, codex hook, agent screen system, V-19 boundary, V-19 UI proof, unit/integration tests, build, and performance all passed; unit/integration total was 35 files / 267 tests.
- `npm run verify:local-readiness`
  - Result: pass.
  - Evidence: local verify passed, `npm audit --omit=dev` found 0 vulnerabilities, full Playwright E2E passed 45 tests with 3 skipped.
- `npm run verify:supabase-release`
  - Result: pass.
  - Evidence: Supabase release verification passed 107 checks, including sandbox target guards, RLS/Storage guard checks, release docs coverage, and layered `verify:full` wiring.
- `npm run verify:full`
  - Result: blocked fail-closed.
  - Evidence: `verify:local-readiness` passed, `verify:supabase-release` passed 107 checks, then `verify:production-packet` exited with `NO_GO`.
- `npm run verify:production-packet`
  - Result: blocked fail-closed.
  - Evidence: command exited with `NO_GO`; production readiness has 63 blockers: 24 integrity blockers and 39 activation blockers.

## Readiness Note

This proof strengthens the local export layer only. It does not refresh sandbox/live evidence and does not change the production packet state. Production readiness remains separate and currently stays fail-closed until the production packet evidence is current and every activation blocker is closed.

Implementation complete, product-ready proof incomplete.

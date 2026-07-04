# Supabase Production Pre-Activation Evidence

Checked at: `2026-07-04T13:22:13.357Z`
Git head: `0af85db9`
Scoped diff sha256: `976fb8db42f43768844a4e6ea28109b31417df42233259748f52952ce5df47d7`
Readiness verifier sha256: `4d204bd7fa33790282774f839a8ce6e0e5a41c7292d56c8a8b83d7e42a0db53d`
Readiness contract: `2026-06-16-production-readiness-v2`

This artifact records command results only. It contains no email, password, service-role key, access token, signed URL, or personal identifier.

## verify:auth-data-readiness

Command: `npm run verify:auth-data-readiness`
exitCode: `0`
Result: Auth/data readiness verification passed: 142 checks.
Checked at: `2026-07-04T13:22:13.357Z`
Git head: `0af85db9`
Scoped diff sha256: `976fb8db42f43768844a4e6ea28109b31417df42233259748f52952ce5df47d7`
Readiness verifier sha256: `4d204bd7fa33790282774f839a8ce6e0e5a41c7292d56c8a8b83d7e42a0db53d`

## verify:supabase-release

Command: `npm run verify:supabase-release`
exitCode: `0`
Result: Supabase release verification passed: 174 checks.
Checked at: `2026-07-04T13:22:13.357Z`
Git head: `0af85db9`
Scoped diff sha256: `976fb8db42f43768844a4e6ea28109b31417df42233259748f52952ce5df47d7`
Readiness verifier sha256: `4d204bd7fa33790282774f839a8ce6e0e5a41c7292d56c8a8b83d7e42a0db53d`

## verify:production-packet

Command: `npm run verify:production-packet`
exitCode: `0`
Result: Production readiness gate is fail-closed as expected with activation blockers only.
Checked at: `2026-07-04T13:22:13.357Z`
Git head: `0af85db9`
Scoped diff sha256: `976fb8db42f43768844a4e6ea28109b31417df42233259748f52952ce5df47d7`
Readiness verifier sha256: `4d204bd7fa33790282774f839a8ce6e0e5a41c7292d56c8a8b83d7e42a0db53d`

## Failed In This Integration Pass

- `npm run verify:full`: Failed after the local verify chain reached `npm run build`.
  The blocking command was `npm run verify:performance`: `index` JS raw size,
  CSS chunk count, total CSS raw size, and total CSS gzip size exceeded the
  current budgets. A clean `origin/main` baseline reproduced the same
  performance gate failure, so this is not safe to mark as newly fixed or ready.
- `npm run test:e2e`: Failed separately with 51 failed, 25 passed, and 16
  skipped Playwright tests. The first failures are in broad legacy smoke specs
  that do not consistently pass the current login/workspace gate.

## Not Run In This Integration Pass

- `npm run test:supabase-live`: Not run - production/live credentials were not provided in this task.
- `npm run test:e2e:supabase`: Not run - production/live credentials and browser activation approval were not provided in this task.

The production packet remains `NO_GO` until the blocker matrix in
`docs/qa/supabase-production-blockers-20260704.md` is closed with real
production evidence.

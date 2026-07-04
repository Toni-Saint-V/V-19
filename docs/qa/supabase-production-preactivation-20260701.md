# Supabase Production Pre-Activation Evidence

Checked at: `2026-07-04T12:46:53.141Z`
Git head: `0af85db9`
Scoped diff sha256: `98bb96919e626fbc23e97d060043e2731c07067d301e7e38223e086b338b038a`
Readiness verifier sha256: `ff64c36532e3afc7a89a89daab3fef9b4c5d69501e147bd9f95515775b0f7f5d`
Readiness contract: `2026-06-16-production-readiness-v2`

This artifact records command results only. It contains no email, password, service-role key, signed URL, or personal identifier.

## verify:supabase-release

Command: `npm run verify:supabase-release`
exitCode: `0`
Result: Supabase release verification passed: 166 checks.
Checked at: `2026-07-04T12:46:53.141Z`
Git head: `0af85db9`
Scoped diff sha256: `98bb96919e626fbc23e97d060043e2731c07067d301e7e38223e086b338b038a`
Readiness verifier sha256: `ff64c36532e3afc7a89a89daab3fef9b4c5d69501e147bd9f95515775b0f7f5d`
## test:supabase-live

Command: `npm run test:supabase-live`
exitCode: `Not run`
Result: Not run - production/live Supabase env and owner-approved access are not available in this worktree.
Checked at: `Not run`
Git head: `Not run`
Scoped diff sha256: `Not run`
Readiness verifier sha256: `Not run`

## test:e2e:supabase

Command: `npm run test:e2e:supabase`
exitCode: `Not run`
Result: Not run - production/live Supabase env and owner-approved access are not available in this worktree.
Checked at: `Not run`
Git head: `Not run`
Scoped diff sha256: `Not run`
Readiness verifier sha256: `Not run`

## verify:full

Command: `npm run verify:full`
exitCode: `Not run`
Result: Not run - verify:full depends on live Supabase/E2E production evidence that is not available in this worktree.
Checked at: `Not run`
Git head: `Not run`
Scoped diff sha256: `Not run`
Readiness verifier sha256: `Not run`

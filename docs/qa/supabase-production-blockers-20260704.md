# Supabase Production Blocker Evidence

Recorded: `2026-07-04`
Production project id: `tsymifccglpepvbmrcgh`
Status: `NO_GO`

This artifact records blocker ownership and verification commands only. It does
not contain email addresses, passwords, service-role keys, access tokens, signed
URLs, or personal identifiers.

## Blocker Matrix

Every blocker below has an explicit owner, verification command, and expected
artifact. The verification command is the command that must pass after the
expected artifact contains real production evidence.

Owner: see the `Owner` column.
Verification command: see the `Verification command` column.
Expected artifact: see the `Expected artifact` column.

| Blocker area | Owner | Verification command | Expected artifact |
|---|---|---|---|
| Production smoke account discovery, auth/profile counts, and smoke account roles | Supabase production operator | `npm run supabase:pilot-cohort -- --check --required-size 20` after read-only production discovery is recorded | `docs/qa/supabase-production-smoke-discovery-20260701.md`, `docs/qa/supabase-production-pilot-cohort-20260701.md` |
| Backup timestamp, restore path, restore proof, and RPO/RTO acceptance | Supabase project owner | `npm run verify:production-readiness` after backup/restore evidence is recorded | `docs/qa/supabase-production-backup-discovery-20260701.md` |
| Current pre-activation verifier hash, current git head, current scoped diff hash, and final diff review | Codex release operator | `npm run verify:auth-data-readiness && npm run verify:supabase-release && npm run verify:production-packet` | `docs/qa/supabase-production-preactivation-20260704.md` |
| Production release switch, production approval, browser QA, browser key audit, and public production config | Rollout owner | `npm run verify:production-readiness` after owner approval and browser evidence are recorded | `docs/qa/supabase-production-env-evidence-20260701.md`, `docs/qa/supabase-production-owner-approval-20260701.md`, `docs/qa/supabase-production-browser-key-audit-20260701.md` |
| Production migration apply evidence, transactional persistence, RLS, storage policy tests, and workflow smoke | Supabase production operator | `npm run supabase:production-workflow-smoke` | `docs/qa/supabase-production-migration-evidence-20260701.md`, `docs/qa/supabase-production-workflow-smoke-20260701.md` |
| Edge Function dry-runs | Supabase production operator | `npm run verify:production-readiness` after dry-run output is recorded | `docs/qa/supabase-production-edge-functions-20260701.md` |
| Supabase Security Advisor, leaked-password protection eligibility, and leaked-password protection enablement | Supabase project owner | `npm run verify:production-readiness` after the production advisor snapshot and plan eligibility evidence are recorded | `docs/qa/supabase-production-security-advisors-20260701.md` |
| Production logs and error-rate review | Supabase production operator | `npm run verify:production-readiness` after log review is recorded | `docs/qa/supabase-production-logs-20260701.md` |
| Final Go / No-Go decision | Rollout owner | `npm run verify:production-readiness` | `docs/qa/supabase-production-blockers-20260704.md` |

## Stop Rule

Keep `docs/release/supabase-production-readiness.json` at `NO_GO` until the
artifacts above contain real production evidence and `npm run
verify:production-readiness` exits `READY Production readiness gate passed.`

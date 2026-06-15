# Supabase Security Advisor Hardening - 2026-06-15

Scope: local migration and verifier update only.

Production project: `tsymifccglpepvbmrcgh`

## Targeted Findings

- `public.consume_ai_helper_quota(...)` was executable by browser roles through the public grant surface.
- `public.ai_helper_audit_events`, `public.ai_helper_quota_counters`, and `public.ai_helper_quota_receipts` had RLS enabled with no explicit policies.

## Local Change

Added migration:

- `20260615000000_ai_helper_security_advisor_hardening.sql`

The migration:

- revokes AI helper table privileges from `anon` and `authenticated`;
- grants AI helper table access to `service_role`;
- adds explicit deny-all RLS policies for AI helper service-owned tables;
- revokes quota RPC execution from `public`, `anon`, and `authenticated`;
- grants quota RPC execution to `service_role`.

## Verification

Fresh local verification before commit:

- `npm run format:check` - passed
- `git diff --check` - passed
- `npx vitest run tests/unit/supabaseSecurityContract.spec.ts` - passed, 8 tests
- `npm run verify:supabase-release` - passed, 51 checks
- `node scripts/verify-production-readiness.mjs --expect-blocked` - passed fail-closed, 34 blockers remain
- `npm run typecheck` - passed

Safety verifier note:

- `scripts/verify-safety.mjs` now treats `service_role` as a safe Supabase role name when used in SQL/tests/docs.
- The scan still blocks service-role key markers, OpenAI secret key prefixes, and private key blocks.

## Production Boundary

This migration was not applied to production in this task.

Production activation remains `NO_GO` until the pending security hardening migration is owner-approved, applied to production, and followed by advisor/schema verification plus the existing backup/restore and post-activation checks.

# Supabase Workspace PR Package

Status: Ready for PR review

Production status: Not ready for production activation until the production approval checklist is completed.

## Included Commits

- `768a3a4 Harden Supabase workspace write guards`
- `5d73f7d Add Supabase production promotion gate`

## Review Scope

This package covers the Supabase workspace release path:

- migration order and production gate checks;
- runtime write guards for review readiness and correction actor boundaries;
- RPC submit boundary behavior before and after `waiting_review`;
- Storage update/delete policy gating after handoff;
- sandbox-only live smoke guardrails.

## Required Local Proof

Run before review sign-off:

```bash
npm run verify:supabase-release
npm run test:supabase-live
```

Run `npm run verify:full` only for a release-confidence gate after the final diff is known.

## Production Boundary

This package is review-ready, not production-approved. Production activation still requires:

- completed `supabase-production-approval-checklist.md`;
- owner-confirmed production project id;
- backup and restore path;
- role-correct smoke accounts;
- successful final sandbox RLS and Storage smoke;
- explicit `VITE_SUPABASE_PRODUCTION_APPROVED=true` evidence.

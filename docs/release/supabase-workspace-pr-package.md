# Supabase Workspace PR Package

Status: Ready for PR review.

Not ready for production activation until the production approval checklist is completed.

## Included Supabase Hardening Commits

- `768a3a4 Harden Supabase workspace write guards`
- `5d73f7d Add Supabase production promotion gate`
- `7f715e7 Harden AI helper Supabase security`

## Included Security Migrations

- `20260615000000_ai_helper_security_advisor_hardening.sql`
- `20260627001000_returned_pdf_storage_policies.sql`

## Required PR Review Gates

Run:

```bash
npm run verify:local-readiness
npm run verify:auth-data-readiness
npm run verify:supabase-release
```

production activation requires a pass only after production packet evidence is refreshed.

## Scope Notes

This package is local workspace release evidence. It does not approve production
migration execution, live database mutation, or client production activation.

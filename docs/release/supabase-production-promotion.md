# Supabase Production Promotion Runbook

Status: production promotion runbook, not owner approval.

Do not apply these migrations to production from Codex without explicit owner approval.

Related release files:

- `supabase-workspace-pr-package.md`
- `supabase-production-approval-checklist.md`

## Required Local Gates

Run before any production activation discussion:

```bash
npm run verify:local-readiness
npm run verify:auth-data-readiness
npm run verify:supabase-release
```

## Migration Order

Apply migrations only in the repository order declared by
`scripts/supabase-migration-contract.mjs`. The current local order includes:

- `20260611000000_visaflow_mvp_foundation.sql`
- `20260612000000_visaflow_rls_performance_hardening.sql`
- `20260612001000_visaflow_rpc_corrections_persistence.sql`
- `20260613005039_visaflow_runtime_write_guards.sql`
- `20260613010029_visaflow_rpc_submit_boundary.sql`
- `20260614000000_ai_helper_audit_quota.sql`
- `20260615000000_ai_helper_security_advisor_hardening.sql`
- `20260616000000_export_batch_identity.sql`
- `20260616001000_complete_export_package_rpc.sql`
- `20260616002000_prevent_export_regression.sql`
- `20260617001000_submit_corrections_handoff_rpc.sql`
- `20260617002000_preserve_applicant_profile_on_cockpit_save.sql`
- `20260617003000_passport_workspace_media_slots.sql`
- `20260617004000_complete_export_package_workspace_media_slots.sql`
- `20260617005000_passport_extraction_audit_quota_contract.sql`
- `20260622000100_ai_helper_audit_event_metadata.sql`
- `20260624001000_questionnaire_answers_persistence.sql`
- `20260627001000_returned_pdf_storage_policies.sql`

## Final Sandbox RLS And Storage Smoke

Run `npm run test:supabase-live` only against the allow-listed V-19 sandbox
project. The smoke must stay sandbox-only and must not read app `.env` files.

## Auth Security Advisor Gate

Before production activation, check Supabase Security Advisor and resolve or
explicitly accept relevant Auth/Postgres/Storage findings.

Auth plan eligibility must be confirmed before enabling Auth leaked password
protection.

Auth leaked password protection must be enabled only after confirming the
organization/project plan supports it.

## Auth/Profile Repair Gate

Confirm production auth/profile consistency before activation.

Do not auto-create production profiles from Codex. Any profile repair requires
owner approval, an actor list, a rollback note, and a dry-run report.

## Rollback Boundary

Rollback is limited to migration-level remediation, disabling production
activation env, and reverting client configuration. Do not delete production
visa case data from Codex.

Production client activation requires:

```bash
VITE_SUPABASE_PRODUCTION_APPROVED=true
```

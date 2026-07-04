# Supabase Production Approval Checklist

Status: production approval checklist, intentionally incomplete until owner review.

Production project id:

Rollout owner:

Backup owner:

## Migration Checklist

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
- `20260628000100_trip_date_range_persistence.sql`
- `20260629193805_v19_access_requests_admin_pdfs.sql`
- `20260630222703_returned_pdf_handoff_security_invoker.sql`
- `20260630235513_allow_trip_date_sync_during_submit_handoff.sql`

## Required Evidence

- Agent smoke account exists.
- `npm run verify:local-readiness`
- `npm run verify:auth-data-readiness`
- `npm run verify:supabase-release`
- `npm run verify:production-packet`
- expected before production evidence refresh: fail-closed `NO_GO`
- expected before activation: pass

## Auth And Profile Gates

- Supabase organization/project plan supports leaked password protection.
- Supabase plan eligibility for leaked password protection is confirmed.
- Auth leaked password protection is enabled.
- Production auth/profile discovery has no orphan auth users.

## Backup, Restore, And RPO/RTO Gates

- Backup owner is named in `docs/qa/supabase-production-owner-approval-20260701.md`.
- Latest restorable production backup timestamp is recorded in `docs/qa/supabase-production-backup-discovery-20260701.md`.
- Restore path is confirmed against an owner-approved non-production restore target.
- Restore drill evidence is recorded without secrets or personal identifiers.
- RPO/RTO is accepted by the owner.
- Rollback communication owner is named.

## Owner Approval Evidence

- `docs/qa/supabase-production-owner-approval-20260701.md` is updated from `BLOCKED` to dated approvals.
- Final owner approval is not inferred from local verifier output.
- `VITE_SUPABASE_PRODUCTION_APPROVED=true` is set only after all activation evidence is recorded.

## Production Activation

Production activation requires owner approval and:

```bash
VITE_SUPABASE_PRODUCTION_APPROVED=true
```

Go / No-Go:

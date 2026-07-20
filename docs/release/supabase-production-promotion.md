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
- `20260628000100_trip_date_range_persistence.sql`
- `20260629193805_v19_access_requests_admin_pdfs.sql`
- `20260630222703_returned_pdf_handoff_security_invoker.sql`
- `20260630235513_allow_trip_date_sync_during_submit_handoff.sql`
- `20260703115102_day10_submission_media_bucket_policies.sql`
- `20260703141556_day10_save_submission_draft_media_path_contract.sql`
- `20260703141744_day10_review_readiness_required_media_slots.sql`
- `20260703165306_day10_review_readiness_storage_identity.sql`
- `20260704050806_day10_required_media_canonical_write_paths.sql`
- `20260706000100_ai_helper_admin_intent_quota_contract.sql`
- `20260706023000_typed_submission_files.sql`
- `20260707000100_typed_status_history_source.sql`
- `20260707001000_document_assets_production_pipeline.sql`
- `20260709234515_agent_return_packages.sql`
- `20260710000100_allow_submission_handoff_child_writes.sql`
- `20260710000200_allow_handoff_children_in_draft_rpc.sql`
- `20260710000300_persist_handoff_applicant_projection.sql`
- `20260710003127_agent_return_packages_duplicate_result.sql`
- `20260710003254_document_asset_function_search_path_hardening.sql`
- `20260710004000_harden_document_assets_projection.sql`
- `20260710021043_harden_media_asset_review_boundary.sql`
- `20260710022231_add_media_assets_applicant_submission_index.sql`
- `20260712201203_allow_admin_waiting_review_issue_checkpoint.sql`
- `20260712225209_save_returned_submission_update_first.sql`
- `20260713095403_atomic_export_document_completion.sql`
- `20260714020334_atomic_export_guard_null_safe.sql`
- `20260714110000_repair_incomplete_export_document_completion.sql`
- `20260714190000_fix_complete_export_package_zip_suffix_guard.sql`
- `20260714200000_harden_null_safe_admin_rpc_guards.sql`
- `20260715000000_document_assets_source_media_id_update_cascade.sql`
- `20260717050000_admin_passport_review_media_policy.sql`
- `20260718190000_global_submission_public_numbers.sql`
- `20260719160000_assign_public_number_after_questionnaire.sql`
- `20260720000000_export_package_media_only_file_count.sql`

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

For `20260712201203_allow_admin_waiting_review_issue_checkpoint.sql`, the exact
forward-remediation template is
`supabase/remediation/20260712201203_allow_admin_waiting_review_issue_checkpoint.rollback.sql`.
After any production apply, rollback must be a newly timestamped migration made
from that template; never delete or edit applied migration history. The template
restores the function body from
`20260703165306_day10_review_readiness_storage_identity.sql`, revokes direct
browser-role execution, and verifies the deferred trigger, ACL, SECURITY DEFINER,
and fixed search path before the remediation transaction can commit.

For `20260712225209_save_returned_submission_update_first.sql`, the
exact forward-remediation template is
`supabase/remediation/20260712225209_save_returned_submission_update_first.rollback.sql`.
After any production apply, rollback must be a newly timestamped migration made
from that template; never delete or edit applied migration history. The template
restores the exact function body from
`20260710000300_persist_handoff_applicant_projection.sql`, restores authenticated
execution while denying anon/public execution, and verifies the helper remains
SECURITY INVOKER with its fixed search path before the remediation transaction
can commit. The global submission mutation trigger is not changed by either the
forward migration or this remediation template.

Production client activation requires:

```bash
VITE_SUPABASE_PRODUCTION_APPROVED=true
```

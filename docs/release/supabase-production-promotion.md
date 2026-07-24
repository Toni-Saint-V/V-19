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
- `20260722000000_harden_workflow_rpc_anon_execute.sql`
- `20260722001000_admin_submission_batch_concurrency.sql`
- `20260722002000_access_request_review_claim.sql`
- `20260722003000_atomic_return_package_artifact_upload.sql`
- `20260724084304_allow_agent_ready_for_export_resubmission.sql`
- `20260724132405_agent_correction_confirmation.sql`
- `20260724221841_repair_out_of_order_submission_schema.sql`
- `20260724234200_server_owned_correction_targets.sql`
- `20260725003000_harden_correction_validation_topology.sql`

## Final Sandbox RLS And Storage Smoke

Before any promotion, confirm the hosted API Settings expose only `public` and
`graphql_public`; `app_private` must remain absent, matching
`supabase/config.toml`.

Run `npm run test:supabase-live` only against the allow-listed V-19 sandbox
project. The smoke must stay sandbox-only and must not read app `.env` files.

## Live Production Schema Preflight

Immediately before a production client deploy, compare the live migration
registry with `requiredRemoteMigrationOrder` and fail closed on any missing or
out-of-order entry. Independently require both client-owned submission columns:

```sql
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'submissions'
  and column_name in ('public_number', 'case_revision');
```

Both rows are mandatory. A local migration-file check, successful bundle build,
or successful `CREATE FUNCTION` is not evidence that the live composite row
type contains the columns referenced by PL/pgSQL.

The production activation gate must consume a fresh raw registry snapshot from
the explicitly selected production project:

```bash
node scripts/verify-live-supabase-registry.mjs --print-query
npm run verify:supabase-live-registry -- --artifact "$V19_TEST_ARTIFACTS_DIR/supabase-live-registry.json"
V19_SUPABASE_LIVE_REGISTRY_ARTIFACT="$V19_TEST_ARTIFACTS_DIR/supabase-live-registry.json" npm run verify:full
```

Run the printed read-only query through the allow-listed Supabase connector or
SQL editor for the checked-in production project. Store the resulting raw
catalog facts outside the repository using format
`v19.supabase-live-registry.v1`; add the connector-selected `projectRef`,
collector timestamp, and hashes printed by
`--print-query-metadata`. The gate rejects snapshots older than 15 minutes,
wrong projects/query/contract hashes, missing or extra migration rows, unsafe
public/private RPC grants and topology, absent columns, and disabled lifecycle
triggers. `verify:full` is intentionally blocked unless the fresh artifact path
is supplied through `V19_SUPABASE_LIVE_REGISTRY_ARTIFACT`. A checked-in
packet or local constant comparison never substitutes for this live gate.

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

For `20260724084304_allow_agent_ready_for_export_resubmission.sql`, the exact
forward-remediation template is
`supabase/remediation/20260724084304_allow_agent_ready_for_export_resubmission.rollback.sql`.
After any production apply, rollback must be a newly timestamped migration made
from that template; never delete or edit applied migration history. The template
restores both prior trigger-function bodies, removes the transaction-local
accepted-resubmission exception, and leaves existing submission/media triggers
and production data in place.

For `20260724132405_agent_correction_confirmation.sql`, use
`supabase/remediation/20260724132405_agent_correction_confirmation.rollback.sql`
as the rollback template. The forward migration must be applied before clients
send `client_contract_version: 2` with `expected_case_revision`; it adds
monotonic correction target revisions, server timestamps, exact-set handoff
validation, and stale-write rejection. This is the expand phase: unversioned
legacy draft payloads remain temporarily accepted, but they cannot write
confirmation/revision fields and correction handoff requires version 2.
Therefore correction handoff promotion uses a mandatory mutation-maintenance
gate: block agent writes in the production client/edge layer, wait until the
in-flight mutation counter is zero and the maximum supported old-tab lifetime
has expired, apply the migration, deploy the version-2 client, smoke-test one
version-2 handoff, and only then reopen writes. Record the gate start/end,
in-flight count, deployed asset id, and smoke submission id in the approval
packet. A migration-first apply without this drain is `NO_GO`.

After reopening writes, verify that server logs contain no
`V19_LEGACY_DRAFT_CONTRACT` events for the observation window, then promote a
separate contract migration that rejects version-1 draft saves. Do not combine
that contract step with this migration-first release.

The rollback template removes the new trigger/RPC enforcement behavior but
intentionally retains `target_revision`, `agent_confirmed_at`, and
`agent_confirmed_revision` plus their data and a `caseRevision`-compatible RPC
response. Its version-2 save path still locks the submission and checks
`expected_case_revision`; legacy writes are allowed only for the rolled-back
client contract. Rollback uses the same mandatory mutation-maintenance gate:
block writes, drain in-flight mutations, deploy the rollback client, promote
the timestamped rollback migration, verify canonical readback, then reopen
writes. Never drop these audit columns in an emergency rollback. Rollback must
be promoted as a new timestamped migration and never by editing applied
migration history.

`20260724221841_repair_out_of_order_submission_schema.sql` is forward-only.
Its remediation file deliberately keeps public numbers, case revisions, audit
data, and the private dispatch boundary. Roll back the frontend to a compatible
deployment if needed; never restore the recursive out-of-order function shape
or drop durable identifiers.

`20260724234200_server_owned_correction_targets.sql` is also forward-only. It
replaces client-owned correction fingerprints with stable field identity,
server-owned semantic target projections, and monotonic target revisions.
Before promotion, every open field correction must resolve to exactly one
persisted questionnaire answer. The migration blocks ambiguous targets. Its
DB-side guard recomputes required/conditional BLS fields and formats from
`questionnaire_answers`; it does not trust client `field.error` or
`questionnaire_percent`. Keep the columns, projections, triggers, and Russian
validation contract during frontend rollback.

`20260725003000_harden_correction_validation_topology.sql` is forward-only. It
extends the server projection with canonical `reviewState`, rejects empty
required targets at confirmation time, requires the parent submission to be
`returned` for agent correction writes, skips immutable closed legacy rows
during target synchronization, and verifies the non-recursive private draft
dispatcher chain. Never remove these guards during rollback.

Production client activation requires:

```bash
VITE_SUPABASE_PRODUCTION_APPROVED=true
```

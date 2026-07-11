# Supabase Production Migration Evidence - 2026-07-06

Result: `APPLIED_WITH_EXPLICIT_USER_AUTHORIZATION`
Project: `tsymifccglpepvbmrcgh`
Latest recheck: `2026-07-10T04:15:02Z`
Latest Supabase plugin migration list: `2026-07-10T04:15:02Z`

No email, password, service-role key, signed URL, or personal identifier is recorded in this artifact.

## Local Required Migration Order

- `20260611000000_visaflow_mvp_foundation`
- `20260612000000_visaflow_rls_performance_hardening`
- `20260612001000_visaflow_rpc_corrections_persistence`
- `20260613005039_visaflow_runtime_write_guards`
- `20260613010029_visaflow_rpc_submit_boundary`
- `20260614000000_ai_helper_audit_quota`
- `20260615000000_ai_helper_security_advisor_hardening`
- `20260616000000_export_batch_identity`
- `20260616001000_complete_export_package_rpc`
- `20260616002000_prevent_export_regression`
- `20260617001000_submit_corrections_handoff_rpc`
- `20260617002000_preserve_applicant_profile_on_cockpit_save`
- `20260617003000_passport_workspace_media_slots`
- `20260617004000_complete_export_package_workspace_media_slots`
- `20260617005000_passport_extraction_audit_quota_contract`
- `20260622000100_ai_helper_audit_event_metadata`
- `20260624001000_questionnaire_answers_persistence`
- `20260627001000_returned_pdf_storage_policies`
- `20260628000100_trip_date_range_persistence`
- `20260629193805_v19_access_requests_admin_pdfs`
- `20260630222703_returned_pdf_handoff_security_invoker`
- `20260630235513_allow_trip_date_sync_during_submit_handoff`
- `20260703115102_day10_submission_media_bucket_policies`
- `20260703141556_day10_save_submission_draft_media_path_contract`
- `20260703141744_day10_review_readiness_required_media_slots`
- `20260703165306_day10_review_readiness_storage_identity`
- `20260704050806_day10_required_media_canonical_write_paths`
- `20260706000100_ai_helper_admin_intent_quota_contract`
- `20260706023000_typed_submission_files`
- `20260707000100_typed_status_history_source`
- `20260707001000_document_assets_production_pipeline`
- `20260709234515_agent_return_packages`
- `20260710000100_allow_submission_handoff_child_writes`
- `20260710000200_allow_handoff_children_in_draft_rpc`
- `20260710000300_persist_handoff_applicant_projection`
- `20260710003127_agent_return_packages_duplicate_result`
- `20260710003254_document_asset_function_search_path_hardening`
- `20260710004000_harden_document_assets_projection`
- `20260710021043_harden_media_asset_review_boundary`
- `20260710022231_add_media_assets_applicant_submission_index`

## Applied Remote Migration Order

- `20260611000000_visaflow_mvp_foundation`
- `20260612000000_visaflow_rls_performance_hardening`
- `20260612001000_visaflow_rpc_corrections_persistence`
- `20260613005039_visaflow_runtime_write_guards`
- `20260613010029_visaflow_rpc_submit_boundary`
- `20260614000000_ai_helper_audit_quota`
- `20260616000000_export_batch_identity`
- `20260616001000_complete_export_package_rpc`
- `20260616001949_ai_helper_security_advisor_hardening`
- `20260616002000_prevent_export_regression`
- `20260617001000_submit_corrections_handoff_rpc`
- `20260617002000_preserve_applicant_profile_on_cockpit_save`
- `20260617003000_passport_workspace_media_slots`
- `20260617004000_complete_export_package_workspace_media_slots`
- `20260617005000_passport_extraction_audit_quota_contract`
- `20260622000100_ai_helper_audit_event_metadata`
- `20260624001000_questionnaire_answers_persistence`
- `20260627001000_returned_pdf_storage_policies`
- `20260628000100_trip_date_range_persistence`
- `20260629193805_v19_access_requests_admin_pdfs`
- `20260630222703_returned_pdf_handoff_security_invoker`
- `20260630235513_allow_trip_date_sync_during_submit_handoff`
- `20260701221611_v19_prod_launch_blocker_fixes`
- `20260701234224_v19_prod_storage_guardrails`
- `20260701235545_v19_prod_questionnaire_pdf_media_slot`
- `20260701235554_v19_prod_media_slots_contract`
- `20260702001635_v19_prod_exact_agent_media_contract`
- `20260702003544_v19_prod_media_progress_triggers`
- `20260702003617_v19_prod_submission_readiness_summary`
- `20260702003653_v19_prod_admin_package_readiness_view`
- `20260702003719_v19_submission_state_summary_view`
- `20260702003735_v19_applicant_media_state_view`
- `20260703001508_v19_operational_readiness_indexes`
- `20260703001536_v19_applicant_media_state_v2_safe`
- `20260703001554_v19_submission_media_summary_view`
- `20260703115102_day10_submission_media_bucket_policies`
- `20260703141556_day10_save_submission_draft_media_path_contract`
- `20260703141744_day10_review_readiness_required_media_slots`
- `20260703165306_day10_review_readiness_storage_identity`
- `20260705235913_day10_required_media_canonical_write_paths`
- `20260709221437_typed_status_history_source`
- `20260709222911_document_assets_production_pipeline`
- `20260709232214_allow_submission_handoff_child_writes`
- `20260709233239_allow_handoff_children_in_draft_rpc_v2`
- `20260709233641_persist_handoff_applicant_projection_v3`
- `20260710034506_ai_helper_admin_intent_quota_contract`
- `20260710034513_typed_submission_files`
- `20260710041440_agent_return_packages`
- `20260710041454_20260710003127_agent_return_packages_duplicate_result`
- `20260710041457_20260710003254_document_asset_function_search_path_hardening`
- `20260710041458_20260710004000_harden_document_assets_projection`
- `20260710041500_20260710021043_harden_media_asset_review_boundary`
- `20260710041502_20260710022231_add_media_assets_applicant_submission_index`

## Aggregate Checks

- Public base tables: `16`
- Public tables with RLS enabled: `16`
- Public tables without RLS: `0`
- Private `submission-media` bucket: `1`
- Public storage buckets: `0`
- `submission-media` storage policies: `4`
- Canonical required media guard function exists: `true`
- Canonical required media trigger count: `1`

## Production Apply Note

- `20260705235913_day10_required_media_canonical_write_paths` is the Supabase MCP-recorded remote migration for local file `20260704050806_day10_required_media_canonical_write_paths.sql`.
- `20260706000100_ai_helper_admin_intent_quota_contract.sql` was applied remotely as `20260710034506_ai_helper_admin_intent_quota_contract` after explicit user authorization.
- `20260706023000_typed_submission_files.sql` was applied remotely as `20260710034513_typed_submission_files`.
- `20260709234515_agent_return_packages.sql` was applied remotely as `20260710041440_agent_return_packages`; its five dependent migrations were then applied in order.
- Supabase plugin `list_migrations` against project `tsymifccglpepvbmrcgh` confirmed the complete post-apply order; it did not mutate the project.

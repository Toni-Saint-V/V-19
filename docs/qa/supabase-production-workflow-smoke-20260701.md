# Supabase Production Workflow Smoke

Result: `PASS`
Project: `tsymifccglpepvbmrcgh`
Checked at: `2026-07-06T00:55:38.869Z`

No email, password, service-role key, signed URL, or personal identifier is recorded in this artifact.

## Checks

- PASS target is production project
- PASS target is not sandbox
- PASS production URL is exact
- PASS publishable key is present
- PASS admin cleanup key is available locally
- PASS supabase_smoke_agent sign-in works
- PASS supabase_smoke_other_agent sign-in works
- PASS supabase_smoke_admin sign-in works
- PASS agent can create draft through save_submission_draft
- PASS agent can upload private media and signed URLs are owner-scoped
- PASS incomplete waiting_review is rejected
- PASS malformed bucket media storage identity is rejected
- PASS malformed path media storage identity is rejected
- PASS valid waiting_review reaches admin queue
- PASS admin can return case with blocking correction
- PASS other agent cannot submit assigned correction handoff
- PASS admin cannot impersonate assigned agent correction handoff
- PASS assigned agent can hand off fixed corrections
- PASS admin can accept case
- PASS agent mutation is blocked after admin handoff
- PASS family submission with 3 applicants persists applicants and required media

## 2026-07-14 Composite Recheck

Result: `PASS`
Checked at: `2026-07-14T19:27:45Z`

- PASS the fresh A2-S1 production path completed through the real admin/agent UI and terminal export readback
- PASS the workbook proof contains one data row and the canonical 56-column row model
- PASS the ZIP proof contains 7 entries: 4 document assets, 1 questionnaire PDF, the workbook, and the manifest
- PASS terminal database readback reports `exported`, 3 exported documents, 1 document event, 1 export batch, and 1 exported history event
- PASS post-export whole-cohort reconciliation remained stable at 12 submissions, 27 applicants, 81 documents, and 81 media rows
- PASS terminal admin and owner UI sessions produced zero business mutations, zero network-contract violations, and zero browser problems
- PASS the NULL-safe admin RPC hardening migration is present in the production ledger and fresh negative probes reject both missing-profile and agent-role callers with SQLSTATE `42501`

This section is an aggregate-only composite of the fresh A2-S1 terminal readback and security recheck. It does not repeat the export mutation and records no cohort identifiers, submission identifiers, storage paths, credentials, signed URLs, email addresses, or other personal data.

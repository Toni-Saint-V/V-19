# Supabase Production Workflow Smoke

Result: `PASS`
Project: `tsymifccglpepvbmrcgh`
Checked at: `2026-07-05T08:18:55.923Z`

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
- PASS malformed bucket media readiness is rejected
- PASS wrong media bucket cannot satisfy review readiness
- PASS malformed path media readiness is rejected
- PASS wrong media path cannot satisfy review readiness
- PASS valid waiting_review reaches admin queue
- PASS admin can return case with blocking correction
- PASS other agent cannot submit assigned correction handoff
- PASS admin cannot impersonate assigned agent correction handoff
- PASS assigned agent can hand off fixed corrections
- PASS admin can accept case
- PASS agent mutation is blocked after admin handoff
- PASS family submission with 3 applicants persists applicants and required media

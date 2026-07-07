# Supabase Pilot Volume Envelope - 2026-07-06

Result: `BLOCKED_PILOT_VOLUME_CAP_EXCEEDED`
Checked at: `2026-07-06T23:47:45.670Z`

No production data, Auth users, Storage objects, or Supabase settings were mutated by this check. The production cap check is read-only and records aggregates only.

## Envelope

- Registered agents: `10`
- Max submissions per registered agent: `50`
- Max total submissions: `500`
- Max applicants per submission: `3`
- Max total applicants: `1500`
- Required media slots per applicant: `3`
- Max required media objects: `4500`

## Proof

- Generated synthetic submissions: `500`
- Generated synthetic applicants: `1500`
- Generated synthetic required media rows: `4500`
- Unique canonical storage paths: `4500`
- Per-agent submission distribution: `10 agents x 50 submissions`
- Canonical storage path pattern: `submissions/{submissionId}/applicants/{applicantId}/{type}/{generatedFileName}`

## Production Read-Only Cap Check

- Production project: `tsymifccglpepvbmrcgh`
- Production registered agent profiles: `22`
- Production registered admin profiles: `2`
- Pilot cohort registered agents: `10`
- Pilot cohort registered admins: `1`
- Pilot cohort total users: `11`
- Production total submissions: `6`
- Production active agents with submissions: `3`
- Production max submissions for one agent: `3`
- Production registered agent profiles cap: `<= 10`
- Pilot cohort registered-agent cap: `<= 10`
- Production total submissions cap: `<= 500`
- Production per-agent submissions cap: `<= 50`
- Production active-agent cap: `<= 10`

## Current Blockers

- production has 22 registered agent profiles, above pilot cap 10.

This check writes no production rows, Auth users, Storage objects, or Supabase settings. It intentionally records no emails, user IDs, submission IDs, or storage paths from production.

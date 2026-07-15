# Supabase Pilot Volume Envelope - 2026-07-06

Result: `PASS`
Checked at: `2026-07-15T05:18:28.343Z`

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
- Pilot window starts at: `2026-07-14T19:20:00Z`
- Production agent profile rows (including banned): `22`
- Production banned agent profiles excluded from pilot intake: `12`
- Production registered agent profiles: `10`
- Production registered admin profiles: `2`
- Pilot cohort registered agents: `10`
- Pilot cohort registered admins: `1`
- Pilot cohort total users: `11`
- Production lifetime total submissions: `65`
- Production lifetime active agents with submissions: `4`
- Production lifetime max submissions for one agent: `54`
- Production pilot-window submissions: `0`
- Production pilot-window active agents with submissions: `0`
- Production pilot-window max submissions for one agent: `0`
- Production registered agent profiles cap: `<= 10`
- Pilot cohort registered-agent cap: `<= 10`
- Production pilot-window submissions cap: `<= 500`
- Production pilot-window per-agent submissions cap: `<= 50`
- Production pilot-window active-agent cap: `<= 10`

## Current Blockers

- None.

This check writes no production rows, Auth users, Storage objects, or Supabase settings. It intentionally records no emails, user IDs, submission IDs, or storage paths from production.

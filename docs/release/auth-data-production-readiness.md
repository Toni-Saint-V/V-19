# Auth/Data Production Readiness Packet

Status: `NO_GO` until owner approval and live evidence are recorded.
Recorded: 2026-06-27
Run id: `20260627T200633`
Lane: `06-release-ai-gate`

This packet is a fail-closed evidence index for V-19 Auth, profile, RLS,
Storage, browser key, Edge Function, and production activation gates. It is not
production approval.

## Current Decision

Go / No-Go: `NO_GO`

Reason:

- Production project id is not recorded in this lane.
- Rollout owner, technical approver, business approver, and rollback decision
  owner are not recorded.
- Owner-approved sandbox/live proof has not been run from this lane.
- Production activation flag must remain disabled until the approval checklist
  is complete.

## Required Local Evidence

Before any activation discussion, record fresh output for:

- `npm run verify:local-readiness`
- `npm run verify:auth-data-readiness`
- `npm run verify:supabase-release`
- `npm run verify:production-packet`

Expected state before owner approval:

- `verify:production-packet` must be fail-closed with `NO_GO`.
- Any missing live evidence must be written as `Unverified` or `BLOCKED`, not
  `PASS`.

## Auth And Profile Boundary

- Do not auto-create production profiles from Codex.
- Missing production profiles require owner-approved role assignment, actor list,
  rollback note, and dry-run report.
- Client profile writes must not set server-owned roles.
- Auth leaked password protection must be checked for plan eligibility before it
  is enabled.
- Production auth/profile discovery must prove there are no orphan auth users
  before activation.

## Browser And Secret Boundary

- No service-role key may be placed in frontend env files, browser config,
  release packet JSON, or docs.
- Browser config may use only public Supabase values and the publishable/anon
  key.
- Provider keys and function admin keys stay in Supabase function secrets.
- Browser key audit remains `Unverified` until the owner-approved target is
  checked and evidence is attached.

## Data And Storage Boundary

- RLS must remain enabled for private VisaFlow tables.
- The `submission-media` bucket must remain private.
- Private media signed URL access is scoped correctly only after sandbox/live
  proof records owner/admin allow paths and cross-agent denial paths.
- Production migration execution is blocked until the exact migration contract
  is approved by the owner.

## Edge AI/OCR Boundary

- AI helper and passport extraction may assist with summaries and manual review
  prep only.
- Deterministic domain rules remain the source of truth for blockers, submit
  guards, media state, and export eligibility.
- If Edge Function dry-run evidence is unavailable, user-facing behavior must
  fall back to manual review language.

## Owner Approval Checklist

Required before production activation:

- Production project id recorded.
- Rollout owner recorded.
- Technical approver recorded.
- Business approver recorded.
- Rollback decision owner recorded.
- Backup owner and rollback communication owner recorded.
- Auth leaked password protection plan eligibility checked.
- Auth leaked password protection enabled if the plan supports it.
- Production smoke accounts discovered and role-verified.
- Sandbox/live RLS and Storage smoke proof attached.
- Edge Function dry-runs attached.
- Browser key audit attached.
- `VITE_SUPABASE_PRODUCTION_APPROVED=true` set only after owner approval.

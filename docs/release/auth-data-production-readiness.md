# Auth/Data Production Readiness Packet

> Historical fail-closed packet. This document records the 2026-06-27 lane
> state and remains useful for boundaries, but current target/evidence details
> live in `docs/release/supabase-production-readiness.json`. If the two differ,
> use the JSON packet plus fresh verifier output.

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

## Closed Pilot Update

Recorded: 2026-06-28

- Pilot auth/access evidence: `$V19_TEST_ARTIFACTS_DIR/pilot-auth-gate-evidence-20260628.md`
- Pilot verdict: `GO_DUMMY_ONLY`
- Production verdict remains: `NO_GO`
- Closed pilot only; dummy/test documents only; no real passports; no public
  launch; no production OCR, Storage, RLS, or production profile-repair claim.

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

- Public access requests are created without a password, Auth session, profile,
  or product access. Duplicate submissions keep the same public lifecycle.
- Admin approval replaces any unapproved same-email Auth identity, sends a fresh
  Supabase invite, and creates the agent profile only for the invited Auth id.
  Failed or uncertain invite delivery must release the review claim for an
  immediate retry and must not finalize approval.
- The mailbox owner sets a password only from a verified Supabase invite or a
  profile-bound recovery callback. Passwords never enter the access-request
  payload, database, or application logs.
- The hosted Supabase Auth Site URL and allowed redirect URLs must point to the
  deployed application origin. Prove the emitted invite and recovery links
  without rewriting `redirect_to` before production activation.
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

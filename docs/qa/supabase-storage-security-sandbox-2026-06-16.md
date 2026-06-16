# Supabase Storage Security Sandbox Proof - 2026-06-16

Scope: sandbox Storage/RLS/Auth security proof and production activation gate tightening.

Branch: `codex/supabase-storage-security`

Sandbox project: `oevvaowoklqttqkraxho`

## Product Scope

- User: agent and admin operators handling visa submissions and private media.
- Value: prove private media cannot leak across agents and cannot be overwritten after review handoff.
- In scope: Supabase Auth session roles, RLS read/write denial, private `submission-media` Storage, production release gates.
- Out of scope: UI polish, additional production DDL, production client activation, secrets rotation, billing, AI provider activation.

## Live Sandbox Proof

Command:

```bash
npm run test:supabase-live
```

Result:

- 1 test file passed.
- 1 test passed.

Latest recheck: `2026-06-16T03:45:53+03:00`.

Covered paths:

- owner can save and read own submission;
- other agent cannot read owner submission;
- other agent cannot write owner submission through `save_submission_draft`;
- incomplete `waiting_review` is rejected server-side;
- owner can upload required private media before handoff;
- other agent cannot upload to owner media path;
- owner can create a signed URL for own private media;
- admin can accept the handoff;
- owner cannot update applicant/media rows after accepted;
- owner cannot overwrite Storage object after accepted;
- other agent cannot create a signed URL for owner media.

## Release Gate Proof

Command:

```bash
npm run verify:supabase-release
```

Result:

- passed, 75 checks.

Additional gate added:

- production runbook must document `Auth Security Advisor Gate`;
- production approval checklist must require Auth leaked password protection;
- production approval checklist must require plan eligibility for leaked password protection;
- production readiness verifier now requires `20260615000000_ai_helper_security_advisor_hardening.sql` in the production migration evidence.

## Production Readiness Gate

Command:

```bash
node scripts/verify-production-readiness.mjs --expect-blocked
```

Result:

- passed fail-closed;
- 41 blockers remain.

Remaining explicit blockers:

- Production has one auth user without a matching `public.profiles` row;
- Supabase plan eligibility for leaked password protection is not confirmed;
- Supabase Auth leaked password protection is not confirmed enabled;
- Supabase security advisors still show activation-blocking warnings.

## Supabase Advisor Evidence

Security advisor warning:

- `auth_leaked_password_protection`
- level: `WARN`
- title: `Leaked Password Protection Disabled`
- remediation: <https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection>

Performance advisors:

- unused index INFO warnings exist on low-traffic tables.
- No index removal was performed because sandbox traffic is not enough evidence that these indexes are waste.

## Verdict

Sandbox Storage/RLS proof is green.

Latest sandbox live smoke recheck passed at `2026-06-16T03:45:53+03:00`.

The latest hardening migration is now included in production evidence as remote migration `20260616001949_ai_helper_security_advisor_hardening`.

Production activation remains `NO_GO` until plan eligibility for leaked password protection is confirmed, Auth leaked password protection is enabled, advisors are rechecked, and the existing production readiness blockers are closed.

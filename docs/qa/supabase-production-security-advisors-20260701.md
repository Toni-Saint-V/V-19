# Supabase Production Security Advisor Evidence

Status: `BLOCKED`

Project id: `tsymifccglpepvbmrcgh`
Latest recheck: `2026-06-30T22:30:02Z`
Advisor source: `Supabase _get_advisors(type=security)`
Advisor type: `security`
Recorded warning count: `1`
Organization plan: `free`
Leaked-password plan: `free`

This artifact records the latest advisor snapshot already present in the production readiness packet. This worktree did not refresh Supabase Advisor data because production Supabase access and owner approval are not available here.

## Open Warnings

- `auth_leaked_password_protection`
  - Title: `Leaked Password Protection Disabled`
  - Level: `WARN`
  - Remediation: `https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection`

## Readiness Impact

- Supabase security advisors were checked against the recorded production project snapshot.
- Auth leaked password protection is not enabled.
- The recorded plan is `free`, so leaked-password protection eligibility is not proven.
- Activation remains blocked until the owner upgrades or confirms a plan that supports leaked-password protection, enables it, reruns Security Advisor, and records a warning-free snapshot.

## Closure Evidence Required

1. Owner confirms the production Supabase plan supports leaked-password protection.
2. Owner enables Auth leaked password protection for project `tsymifccglpepvbmrcgh`.
3. Operator reruns Supabase Security Advisor for project `tsymifccglpepvbmrcgh`.
4. This artifact is replaced or extended with the fresh timestamp, zero activation-blocking Auth warnings, and the exact advisor source.
5. `docs/release/supabase-production-readiness.json` is updated:
   - `authSecurity.planEligibilityChecked: true`
   - `authSecurity.leakedPasswordProtectionPlanEligible: true`
   - `authSecurity.leakedPasswordProtectionEnabled: true`
   - `authSecurity.noBlockingSecurityAdvisorWarnings: true`
   - `authSecurity.openWarnings: []`

No email, password, access token, service-role key, signed URL, or personal identifier is recorded in this artifact.

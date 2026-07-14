# Supabase Production Security Advisors - 2026-07-06

Result: `ACCEPTED_RISK_FOR_CONTROLLED_10_USER_PILOT`
Project: `tsymifccglpepvbmrcgh`
Latest recheck: `2026-07-14T19:27:45Z`
Organization plan: `free`
plan: `free`

Open warnings retained:

- `authenticated_security_definer_function_executable` - WARN - Signed-In Users Can Execute SECURITY DEFINER Function
- The warning is intentional for `public.complete_export_package(payload jsonb)`: authenticated callers reach the RPC boundary, while the deployed NULL-safe admin guard rejects missing-profile and non-admin callers before payload processing. Fresh negative probes returned SQLSTATE `42501`.
- Remediation: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

- `auth_leaked_password_protection` - WARN - Leaked Password Protection Disabled
- Remediation: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

Compensating controls for this pilot are recorded in `docs/qa/supabase-production-pilot-security-exception-20260706.md`.

No email, password, service-role key, signed URL, or personal identifier is recorded in this artifact.

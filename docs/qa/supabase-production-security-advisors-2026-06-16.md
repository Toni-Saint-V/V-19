# Supabase Production Security Advisors - 2026-06-16

Scope: read-only Supabase advisor and migration evidence for production activation gate.

Production project: `tsymifccglpepvbmrcgh`

Project name: `Visa V-19 Production`

Status: `ACTIVE_HEALTHY`

Organization: `Toni-Saint-V's Org` (`hsolrwjysdlmyqopryon`)

Organization plan: `free`

## Commands

MCP checks:

- `Supabase _get_project`
- `Supabase _get_organization`
- `Supabase _list_migrations`
- `Supabase _get_advisors(type=security)`
- `Supabase _get_advisors(type=performance)`
- `Supabase _apply_migration(name=ai_helper_security_advisor_hardening)`

## Migration State

Production now records:

1. `20260611000000_visaflow_mvp_foundation`
2. `20260612000000_visaflow_rls_performance_hardening`
3. `20260612001000_visaflow_rpc_corrections_persistence`
4. `20260613005039_visaflow_runtime_write_guards`
5. `20260613010029_visaflow_rpc_submit_boundary`
6. `20260614000000_ai_helper_audit_quota`
7. `20260616001949_ai_helper_security_advisor_hardening`

Remote migration `20260616001949_ai_helper_security_advisor_hardening` applied the local migration contract from `20260615000000_ai_helper_security_advisor_hardening.sql`.

## Security Advisors

Open WARN findings:

| Finding | Entity | Reason | Remediation status |
| --- | --- | --- | --- |
| `auth_leaked_password_protection` | Supabase Auth | leaked password protection is disabled. | Requires Supabase Auth dashboard/project setting; not a SQL migration. Docs: <https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection>. |

## Auth Plan Gate

Live organization checks on 2026-06-16 returned:

- organization id: `hsolrwjysdlmyqopryon`;
- organization name: `Toni-Saint-V's Org`;
- plan: `free`.

Latest recheck: `2026-06-16T03:45:53+03:00`.

Production activation remains blocked until plan eligibility for leaked password protection is confirmed, leaked password protection is enabled, and security advisors are rechecked clean.

Closed security advisor findings after remote migration `20260616001949_ai_helper_security_advisor_hardening`:

| Finding | Entity | Previous reason | Remediation status |
| --- | --- | --- | --- |
| `anon_security_definer_function_executable` | `public.consume_ai_helper_quota(...)` | `anon` could execute a `SECURITY DEFINER` RPC. | Closed; advisor no longer reports it. |
| `authenticated_security_definer_function_executable` | `public.consume_ai_helper_quota(...)` | signed-in users could execute a `SECURITY DEFINER` RPC directly. | Closed; advisor no longer reports it. |
| `rls_enabled_no_policy` | `public.ai_helper_audit_events` | RLS enabled with no explicit policies. | Closed; advisor no longer reports it. |
| `rls_enabled_no_policy` | `public.ai_helper_quota_counters` | RLS enabled with no explicit policies. | Closed; advisor no longer reports it. |
| `rls_enabled_no_policy` | `public.ai_helper_quota_receipts` | RLS enabled with no explicit policies. | Closed; advisor no longer reports it. |

## Performance Advisors

Performance advisors report unused index INFO findings.

No indexes were removed because the production project is newly created and low traffic does not prove these indexes are waste. Index removal is out of scope for this security pass.

## Data Access Impact

Applied hardening migration:

- revoke browser role access to AI helper audit/quota tables;
- add explicit deny-all RLS policies for those service-owned tables;
- revoke direct browser execution of `public.consume_ai_helper_quota(...)`;
- grant quota RPC execution only to `service_role`.

Readers/writers after hardening:

- Browser roles: no direct read/write access to helper audit/quota storage and no direct quota RPC execution.
- Edge/server service role: may execute quota RPC and write helper audit/quota rows.
- Existing submission/media RLS and Storage policies are unchanged.

Rollback:

- Do not drop RLS policies or grants ad hoc.
- If hardening breaks a backend caller, prefer fixing the backend to call through the service-role edge boundary.
- A rollback would require a forward migration reviewed against the advisor findings.

## Verdict

Production remains `NO_GO`.

Latest security advisor recheck at `2026-06-16T03:45:53+03:00` still reports exactly one security WARN:

- `auth_leaked_password_protection`

Next safe action:

1. Move the Supabase organization/project to a plan that supports leaked password protection, or otherwise confirm eligibility from Supabase.
2. Enable Auth leaked password protection in Supabase Auth settings.
3. Rerun security advisors and production readiness gate.

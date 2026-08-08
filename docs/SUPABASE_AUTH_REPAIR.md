# Supabase Auth repair runbook

This runbook repairs a bounded list of existing VisaFlow accounts without
changing product UI, migrations, RLS, or domain data.

The repair command performs these operations for every explicitly listed user:

1. Confirms the exact production project reference and URL.
2. Finds the Auth user by normalized email and refuses to create a replacement
   unless `createIfMissing` is explicitly enabled.
3. Rotates the password, confirms the email, preserves existing user metadata,
   and sets `password_setup_required` to `false`.
4. Upserts `public.profiles` against the Auth UUID and verifies the requested
   `agent` or `admin` role.
5. Signs in with the new password, revokes other refresh-token sessions, closes
   the verification session, and performs canonical Auth/profile readback.
6. Writes a private ignored credential receipt with mode `0600` **before** the
   first Auth mutation. The receipt is updated after every step, so a partial
   failure cannot strand an account behind an unknown rotated password.
7. Never prints passwords to the terminal.

## Required local files

The repository already uses these ignored files:

- `.env.supabase-production-admin.local`
- `.env.supabase-production.local`
- `.supabase-auth-repair.local.json`

The first two must point to the same production project. The administrative
credential must remain server/local only and must never use a `VITE_` prefix.
The public environment file supplies the browser-safe publishable key used for
sign-in verification.

## Commands

```bash
npm run supabase:repair-auth -- --check
npm run supabase:repair-auth -- --repair
```

Before any account is changed, generated credentials and a `prepared` status
are stored in:

```text
.supabase-auth-repair-result.local.json
```

The receipt finishes with `status: "completed"`. On a mid-run error it remains
available with `status: "partial_failure"`, including per-user `prepared`,
`updating`, `verified`, or `failed` states. Distribute verified passwords through
a private channel, verify both roles in the production UI, then delete the local
result file.

## Existing pilot cohort command

The general cohort provisioning command now leaves existing passwords unchanged
by default. Password rotation is intentionally explicit and cannot run without
sign-in verification:

```bash
npm run supabase:pilot-cohort -- \
  --provision \
  --rotate-existing-passwords \
  --verify-sign-in
```

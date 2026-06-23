# Auth And Data Production Readiness

This is the bounded Auth/Data gate for V-19 production readiness. It is local
and fail-closed: it does not approve production, apply migrations, create users,
read secrets, or mutate Supabase state.

## Contract

- Auth model: Invite/manual.
- Supabase Auth is the identity source; `public.profiles` is the role source.
- Do not auto-create production profiles.
- Every production profile role requires owner-approved role assignment.
- Browser env may contain only public `VITE_SUPABASE_*` values. No service-role key,
  provider key, smoke password, private token, or admin secret may use a `VITE_`
  prefix.
- Production remains `NO_GO` until Auth leaked password protection, smoke
  accounts, backup/restore, production env evidence, browser/key audit, and
  post-activation checks are freshly recorded.

## Local Verification

Run:

```bash
npm run verify:auth-data-readiness
```

This verifier checks the local contract only:

- Supabase Auth password sign-in requires a matching profile.
- Client profile upsert cannot write `role`.
- Required migrations are present in production promotion order.
- No local Supabase migration exists outside the declared promotion order.
- RLS is enabled for workspace tables.
- RLS policies use cached `(select auth.uid())` and role-helper patterns.
- Foreign-key and RLS access paths have explicit indexes.
- `submission-media` is private.
- Runbooks record the full migration order and manual production profile repair
  boundary.

## Production Stop Line

This verifier is not a production approval. Production-side work still requires:

- explicit owner approval before production/shared-state mutation;
- aggregate auth/profile discovery with no committed PII;
- role-verified agent, other-agent, and admin smoke accounts;
- backup/restore evidence and accepted RPO/RTO;
- Supabase security advisor recheck with Auth leaked password protection enabled;
- production browser QA proving private media signed URL access is scoped correctly;
- final `node scripts/verify-production-readiness.mjs` pass with `GO`.

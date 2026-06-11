# VisaFlow AI Supabase Foundation

Block #5 adds a persistence-ready Supabase boundary without requiring live keys.

## Frontend env

Use only public browser variables:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

Do not place service-role, OpenAI, or other backend secrets in frontend env files.

## Local/demo behavior

When the public Supabase values are missing, the app stays in local demo mode:

- demo role login remains available;
- no network persistence is attempted;
- storage helpers return `null` instead of pretending an upload happened;
- protected routes still enforce Agent/Admin screen boundaries.

## Backend target

`migrations/20260611000000_visaflow_mvp_foundation.sql` defines the MVP target:

- profiles and roles;
- submissions, applicants, media assets, corrections;
- export batches, appointments, status history;
- RLS policies scoped by agent/admin role;
- private `submission-media` storage bucket.

## AI helper function

`functions/ai-helper/index.ts` is a backend-safe stub for Block #7.

- Frontend calls should go through Supabase Functions, never directly to a model provider.
- Model/provider keys must stay server-side in Supabase function secrets and must not use a `VITE_` prefix.
- The helper may summarize, explain, and draft text only.
- Deterministic validation remains the source of truth for blockers, submit guards, media state, and export eligibility.
- Human operators make final media/submission decisions.

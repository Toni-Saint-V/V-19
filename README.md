# VisaFlow V-19

VisaFlow V-19 is a submission-first operations app for Spain visa workflows.
The active product object is `Submission`; applicants, questionnaire data,
files, issues, history, review state, and export state are contextual children
of a submission.

## Current stack

- React 19
- Vite 8
- strict TypeScript
- Supabase JavaScript client
- Vitest for unit and integration tests
- Playwright for browser proof
- ESLint and Prettier
- Custom CSS/UI primitives; no React Router

`package.json` and `package-lock.json` are the install source of truth. Use
`npm`; there is no committed `packageManager` override.

## Setup

```bash
npm ci
cp .env.example .env.local
npm run dev
```

The dev server binds to `127.0.0.1` by default. Override the port through Vite
flags when another checkout already owns the default port:

```bash
npm run dev -- --port 5174 --strictPort
```

## Verification

Use the smallest command that proves the changed surface.

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run verify:security
```

Broader local readiness gates are available when the change touches release,
auth, Supabase, storage, export, or browser-visible runtime behavior:

```bash
npm run verify:safety
npm run verify:v19-boundary
npm run verify:auth-data-readiness
npm run verify:supabase-release
npm run verify:production-packet
```

`verify:production-packet` is expected to fail closed with `NO_GO` until owner
approval and fresh production evidence are recorded. Do not treat local/demo
or closed-pilot proof as production readiness.

## Product contract

The canonical V-19 source-of-truth contract is
`docs/release/canonical-domain-contract.md`.

Key boundaries:

- allowed roles: `agent`, `admin`;
- allowed submission types: `single`, `family`;
- canonical statuses: `draft`, `in_progress`, `submitted_for_review`,
  `returned`, `corrections_received`, `ready_for_export`, `exported`;
- issue lifecycle: `open -> fixed_by_agent -> closed_by_admin`;
- export is fail-closed and Excel-only unless a later approved contract says
  otherwise;
- AI/OCR/PDF helpers are advisory only and never auto-apply data or make
  domain decisions.

Forbidden product drift: do not add React Router, CRM/People/Families/Groups,
analytics dashboards, AI checker or AI filter surfaces, board view, saved
filters, legal promise screens, or multi-country primary surfaces.

## Environment and production boundary

`.env.example` contains safe placeholders and fail-closed defaults only. Local
or ignored env files must never be committed.

Supabase stays inactive unless `VITE_SUPABASE_BACKEND_TARGET=supabase` and the
activation evidence gates pass. Production activation additionally requires
`VITE_SUPABASE_ACTIVATION_TARGET=production`,
`VITE_SUPABASE_RELEASE_ENABLED=true`, all readiness evidence flags, and
`VITE_SUPABASE_PRODUCTION_APPROVED=true`.

Local demo bypass flags are for local/e2e only:

- `VITE_LOCAL_DEMO_AUTH_BYPASS`
- `VITE_E2E_LOCAL_DEMO_AUTH_BYPASS`

They must not open production, Supabase, or production-like builds.

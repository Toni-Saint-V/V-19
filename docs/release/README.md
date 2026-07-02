# V-19 Release Documents

This directory contains the current V-19 release contracts plus historical
evidence records. When documents conflict, use this order:

1. `docs/release/canonical-domain-contract.md`
2. Current source code under `src/modules/submissions`, `src/lib/supabase`,
   `src/services`, and `supabase`
3. Current verification scripts in `package.json` and `scripts/`
4. Historical package/evidence documents, only as dated context

## Canonical contract

- `canonical-domain-contract.md` is the active V-19 product/domain contract.
  It owns submission-first scope, roles, statuses, permissions, issue
  lifecycle, export readiness, AI boundary, demo/production boundary, and
  forbidden drift.

## Current production boundary

- `supabase-production-promotion.md` is the production promotion runbook.
- `supabase-production-approval-checklist.md` records the approval checklist.
- `supabase-production-readiness.json` is the current production readiness
  evidence packet and remains `NO_GO` until all evidence and owner approval are
  recorded.
- `auth-data-production-readiness.md` is a historical fail-closed auth/data
  packet. It must not override `supabase-production-readiness.json` when target
  details differ.

## Historical package evidence

These documents are retained for audit context only. They are not current
runtime source truth and must not be used to claim production readiness:

- `package-evidence-gate.md`
- `package-2-integration-gate-20260628.md`
- `supabase-workspace-pr-package.md`
- `v19-pilot-pack.md`
- `export-artifact-scope.md`

The archived standalone v17 package under `VisaFlow_V19_v17_release_package/`
is deprecated in place. Its prototype, source precedence, and navigation notes
must not override the current canonical contract.

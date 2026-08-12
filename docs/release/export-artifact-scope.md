# Export Artifact Scope

Status: V-19 ZIP + Excel export release scope.
Approved: 2026-08-12.

This document is release evidence, not production readiness approval.

## Decision

The supported artifact is a one-time browser ZIP download containing the
verified `xlsx` workbook and required documents for the current selection. The
user must explicitly confirm the download before the terminal export state is
committed.

## Supported Artifact

- Workbook: `xlsx`, `Sheet1`, range `A:BD`, generated from the canonical export
  row model in `src/modules/submissions`.
- Package: browser-generated `zip` containing that workbook and the required
  private document assets for the selected submissions.
- Source: production downloads document bytes only through the scoped Supabase
  Storage path; it fails closed when required assets are unavailable.
- Commit: after browser download and explicit confirmation,
  `complete_export_package` validates package identity and performs the
  terminal transition atomically.

The browser ZIP is transient: it is not stored as a private artifact, does not
claim checksum proof, and is not available for repeat download after reload.
Those properties must not be represented as product capabilities.

## Reload Contract

Admin reload can rehydrate durable export package identity from
`export_batches` into `Submission.exportPackage`:

- `contentFingerprint`;
- `fileName`;
- `format`;
- `idempotencyKey`;
- `rowCount`;
- `submissionIds`.

Only `xlsx` export batch rows are eligible for the pilot reload contract.
Legacy `csv` batches are ignored for V-19 pilot export rehydrate.

If the durable batch row is missing identity fields, the package is ignored and
the UI remains fail-closed. A durable batch row on a non-exported submission is
rehydrated as `file_generated` only when the canonical cockpit row model is also
available from the snapshot. A fallback row without the full cockpit snapshot may
show durable identity metadata, but it stays in `ready` state and cannot claim
repeat download proof.

The client recomputes package identity and source signature immediately before
download and again before confirmation. Any changed selection, stale document,
or failed terminal RPC leaves the submission non-terminal and requires a fresh
package. Legacy rows are never backfilled with synthetic download evidence.

# Export Artifact Scope

Status: V-19 NO-GO package 2 export closeout.
Recorded: 2026-06-28.

This document is release evidence, not production readiness approval.

## Decision

V-19 pilot export scope is Excel-only.

The supported pilot artifact is the `xlsx` workbook generated from the canonical
export row model. Product copy and release evidence must not claim ZIP package
generation, private ZIP storage, ZIP checksum proof, or repeat ZIP download.

## Supported Artifact

- Artifact: Excel workbook.
- Format: `xlsx`.
- Sheet: `Sheet1`.
- Range: `A:BD`.
- Row source: canonical export row model from `src/modules/submissions`.
- Proof surface: parsed workbook tests compare preview rows to workbook rows.

`src/lib/export/exportWorkbookCore.ts` uses a ZIP container internally because
`xlsx` files are ZIP-based Office documents. That is not a product ZIP package
and must not be described as one.

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

An authenticated administrator acknowledgement in
`workbook_export_receipts`, with membership bound to the submission's exact
current `case_revision`, rehydrates canonical `file_downloaded`. A receipt from
an older acceptance revision is ignored. Terminal `exported`/
`marked_exported` rehydrate requires the same receipt membership to carry the
exact terminal revision written by the Excel-only completion transaction.
Legacy rows are never backfilled with synthetic acknowledgement evidence.

Preview/download/mark-exported gates still recompute package identity from the
current row model before allowing workbook download or exported lifecycle state.

## ZIP Scope Cut

ZIP option B is active for the pilot.

No product surface may promise:

- ZIP package generation;
- private ZIP storage;
- ZIP checksum proof;
- repeated ZIP download after reload;
- ZIP-based export completion.

If ZIP becomes release scope later, it needs a separate backend/private-storage
artifact contract with private storage policy, checksum, manifest, reload proof,
and stale/missing-artifact failure proof.

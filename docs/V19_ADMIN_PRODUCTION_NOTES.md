# VisaFlow admin production hardening

## Covered scenarios

1. Admin review cycle
   - Admin can add/use an open issue and return a submitted case for correction.
   - Agent can mark the issue fixed and submit corrections.
   - Admin can close fixed issues and move the case to `ready_for_export`.
   - Accepted files are normalized to `accepted` / `reviewStatus=accepted` before export readiness is granted.

2. Ready-to-export queue
   - Admin export queue defaults to city/family sorting.
   - City and agent filters are sorted deterministically.
   - Ready submissions appear in the export screen only after `ready_for_export`.
   - File count now reflects the actual ZIP payload: passport scan + selfie 1 + selfie 2 + filled visa form per applicant.

3. Export package
   - Export remains blocked for mixed cities to prevent incorrect BLS packages.
   - Same-city packages generate the XLSX workbook and then ZIP.
   - ZIP structure: `VisaFlow_Export_YYYY-MM-DD / city / family-or-applicant / passport-number_document-type.ext`.
   - Each applicant receives 4 documents in the ZIP:
     - `passport_scan`
     - `selfie_1`
     - `selfie_2`
     - generated `visa_form` PDF
   - Archive manifest includes `visa_form` and all document entries.
   - ZIP generation now uses `ArrayBuffer` internally, so it is stable in browser and Playwright/Node runtimes.

## Playwright verification

Command executed:

```bash
npm run test:playwright
```

Result:

```text
Running 2 tests using 1 worker
✓ admin review cycle: return with issue, agent correction, admin acceptance to ready_for_export
✓ admin export package: same-city sorting, Excel state, ZIP folders, passport-number file names, visa form PDF, marked exported
2 passed
```

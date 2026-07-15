# Questionnaire and Excel production closure — 2026-07-15

Result: `PASS_NEW_COHORT`

Checked at: `2026-07-15T12:27:08Z`

Target: Supabase production project `tsymifccglpepvbmrcgh`.

This report contains sanitized counts and artifact digests only. No names,
passport numbers, emails, phone numbers, credentials, downloaded artifacts, or
storage paths are persisted here.

## Historical cohort remediation

The historical marker `V19QA-20260711-AUDIT` remains historical evidence and is
not reclassified as valid export proof because its already exported `A1-F6`
artifact predates the tightened shared-family-contact contract.

The two non-exported technical family cases were corrected through the product
UI only:

- `A2-F6`: exact PII-free read-back recovered the already completed correction;
  checkpoint `verified`, six applicants confirmed, no repeated business write.
- `A3-F6`: admin return, six agent questionnaire corrections, resubmit, and
  read-back completed; checkpoint `verified`, six applicants confirmed.

No direct SQL update, checkpoint forgery, or mutation of the historical
exported `A1-F6` questionnaire/artifact was used.

## Replacement production cohort

Marker: `V19QA-20260715-FAMFIX`.

Fresh read-only reconciliation for the complete registered cohort passed:

- submissions: `12`;
- applicants: `27`;
- questionnaire answers: `2079` (`1299` populated, `780` blank optional);
- media assets: `81`;
- document assets: `81`;
- readable Storage objects: `81`;
- legacy submission files: `0`.

The final lifecycle distribution is exact:

- `A1-F6`: `exported`, six applicants, `18` media, `462` answers, `18`
  document assets in `uploaded/passed/exported`;
- the other `11` cases: `waiting_review`, with their expected applicant,
  questionnaire, media, and pending document counts unchanged.

All `12` local cohort checkpoints remain at `submitted`; lifecycle and export
state are proven by their separate guarded checkpoints.

## A1-F6 UI lifecycle proof

The replacement family case completed the real production UI path:

1. admin added one exact blocking questionnaire issue;
2. admin returned the submission;
3. agent corrected the source questionnaire field;
4. agent marked the exact issue fixed;
5. agent resubmitted corrections;
6. admin executed `close_issues_accept`;
7. read-back confirmed `ready_for_export` before export.

The resumable runner ended at lifecycle checkpoint `accepted`. Mutation guards
matched the exact applicant, questionnaire, correction, media, snapshot, and
history projections before allowing each production response.

## XLSX and ZIP artifact proof

The artifacts were downloaded through the real admin UI and inspected in
memory; raw files were not retained.

Standalone XLSX:

- sheet: `Sheet1`;
- dimension: `A1:BD7`;
- columns: `56`;
- data rows: `6`;
- marker rows: `6`;
- bytes: `57315`;
- SHA-256: `90ef1424aa88625067bd3e0bd93638b0df52bb69d987653324d23e23938ad8f0`.

ZIP package:

- entries: `27`;
- applicants: `6`;
- package documents: `24` (`18` uploaded PNG files + `6` generated visa forms);
- questionnaire PDFs: `6`;
- each questionnaire PDF: canonical reference-template prefix, `4` pages,
  readable text layer, exact case marker, and matching passport identity;
- embedded workbook digest equals the standalone XLSX digest;
- bytes: `36465268`;
- SHA-256: `546242303ae3d631567ce8ea889fcd79cb2549871f2c7941e7c7074dbd18aa1d`.

The export checkpoint is `verified`, the post-commit UI notice was observed,
and independent owner/admin UI read-back confirmed the exact submission is
`exported`.

## Verdict

The tightened questionnaire-to-Excel family-contact contract has valid new
production proof for `V19QA-20260715-FAMFIX`. The old
`V19QA-20260711-AUDIT/A1-F6` artifact remains intentionally excluded from that
proof.

# Questionnaire and Excel production read-only audit — 2026-07-15

Result: `BLOCKED_DATA_RECONCILIATION`

Checked at: `2026-07-15T08:13:26Z`

Target: Supabase production project `tsymifccglpepvbmrcgh`.

This audit was read-only. It did not change production rows, Auth users, Storage
objects, export artifacts, or Supabase settings. No names, passport numbers,
emails, phone numbers, credentials, or storage paths were persisted in this
evidence.

## Whole-dataset facts

- Submissions: `65`.
- Applicants: `92`.
- Questionnaire answers: `6672`.
- Questionnaire answer ownership mismatches: `0`.
- Applicant projection versus questionnaire passport mismatches: `0`.
- Ready-for-export submissions: `0`.
- Repeated passport groups: `3`, covering `32` technical applicants.
- Persisted technical markers classify those repeated rows as `30 pilot` and
  `2 smoke`; no unmarked user-data duplicate-passport group was found.
- Three incomplete family drafts have no contact data yet. They are incomplete,
  not conflicting.

## Registered production QA cohort

The exact registered cohort `V19QA-20260711-AUDIT` was read through its local
checkpoint and the production database with complete pagination:

- Submissions: `12`.
- Applicants: `27`.
- Questionnaire answers: `2079`.
- `missing_export_field`: `0`.
- `duplicate_answer_key`: `0`.
- `answer_ownership_mismatch`: `0`.
- `applicant_projection_birth_date_mismatch`: `0`.
- `applicant_projection_email_mismatch`: `0`.
- `applicant_projection_passport_mismatch`: `0`.
- `applicant_projection_phone_mismatch`: `0`.
- `duplicate_passport`: `0`.
- `duplicate_identity`: `0`.
- `invalid_passport`: `0`.
- `invalid_applicant_phone`: `0`.
- `family_contact_mismatch`: `3`.

The three contact conflicts are the technical family cases `A1-F6`, `A2-F6`,
and `A3-F6`. Their phone is shared, but the old cohort generator produced a
different applicant email for every family member. This contradicts the
canonical Excel family-contact contract.

Lifecycle read-back:

- `A1-F6`: `exported`, accepted, one export-batch membership, one immutable
  document-export event, and one closed correction. Its historical artifact is
  stale under the tightened contract and must not be rewritten in place.
- `A2-F6`: `waiting_review`, not accepted/exported, no export batch/event, no
  existing corrections.
- `A3-F6`: `waiting_review`, not accepted/exported, no export batch/event, no
  existing corrections.

## Closure applied in code

- New cohort generation uses one shared email per family submission.
- Read-only cohort reconciliation now checks the questionnaire fields used by
  Excel, applicant ownership, answer-key uniqueness, passport and identity
  uniqueness, passport/phone formats, and shared family contacts.
- The parsed family workbook verifier now rejects an Excel artifact unless all
  family rows contain the same canonical applicant email and mobile.

Fresh reconciliation after the gate change correctly returns:

```text
BLOCKED production cohort reconciliation (aca28bbc07e5).
```

## Required controlled follow-up

1. Do not reuse the existing `A1-F6` Excel/ZIP artifact as proof of the tightened
   contract.
2. For `A2-F6` and `A3-F6`, use an explicitly approved admin return → agent
   correction → resubmit flow with one source-of-truth family email. Do not
   direct-update tables.
3. Keep `A1-F6` as historical invalid evidence. A replacement proof requires an
   explicitly approved new technical family case and a new Excel/ZIP artifact;
   mutating an already exported questionnaire would break artifact integrity.
4. The historical marker `V19QA-20260711-AUDIT` must remain `BLOCKED`; changing
   its checkpoint to hide the stale A1 artifact is forbidden. After explicit
   approval, create a new technical cohort through the existing guarded runner,
   then require `PASS` for that new marker before treating it as production-valid
   questionnaire-to-Excel proof.

   ```sh
   V19_PRODUCTION_COHORT_RUN_MARKER=<approved-new-marker> npm run verify:production-cohort:reconcile
   ```

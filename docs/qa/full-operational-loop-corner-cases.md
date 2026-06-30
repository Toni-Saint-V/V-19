# V-19 Full Operational Loop Corner Cases

## Auth

- Pending and rejected access requests must not create an active workspace session.
- Approved agent and admin login must preserve role-owned surfaces.
- Self-service registration remains closed; role switching must not grant admin capability.

## Create / Family / Applicants

- Single and family drafts create canonical `Submission` records only.
- Add/remove applicants must recalculate required files per applicant.
- Submit remains disabled while city, trip dates, questionnaire, or required files are incomplete.
- Draft reload must not introduce legacy document targets.

## Documents / OCR

- Active requirements are only `selfie`, `selfie_2`, `passport_scan`, `questionnaire`.
- Legacy `photo`, `photo_white`, and `video` do not satisfy readiness.
- Passport OCR is advisory. Extracted fields require manual review before submit.
- OCR failure allows manual fallback only when critical passport fields are complete.
- Replacing a passport scan invalidates extraction review.

## Review / Return / Fix

- Admin issues must target an applicant plus field, section, or canonical file.
- Agent cannot submit corrections until every open blocker target is corrected and marked fixed.
- Admin cannot accept while blocker issues are `open` or `fixed_by_agent`.
- Closed returned PDF mismatch issues reopen when a later PDF review finds the same critical mismatch.

## Admin Lists / Filters

- Search, category tabs, city filter, agent filter, and sort controls must filter real submissions.
- Mobile filters must remain clickable and not be intercepted by bottom navigation.
- Mobile cards must stay full width.

## Excel Export

- One row per applicant.
- Family rows stay grouped.
- Mixed-city export is blocked.
- Mixed-agent export is blocked by default.
- Duplicate/stale generated packages cannot be downloaded or marked exported.
- External Excel has no Agent column.

## Returned PDF Package

- Missing appointment/list PDF blocks handoff.
- Missing application PDF for any applicant blocks handoff.
- More than one ready application PDF for the same applicant blocks handoff.
- Failed, deleted, pending, or storage-less returned PDFs block handoff.
- Private storage path must match submission, applicant, artifact kind, checksum, and PDF extension.
- Handoff requires durable export package identity.
- Package owner must match submission owner.
- Agent returned PDF view is visible only to the owning agent.
- Reload after PDF attach must preserve `returnedPdfPackage`, application PDF reviews, export package identity, owner axis, and mapping inputs.

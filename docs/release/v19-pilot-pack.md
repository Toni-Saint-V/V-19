# V-19 Pilot Pack

> Historical pilot scope. Superseded for export artifacts on 2026-08-12 by
> `docs/release/export-artifact-scope.md`; its Excel-only and ZIP NO-GO
> statements are not the current release contract.

Status: closed-pilot tester packet.
Audience: 5-10 invited testers.
Scope: sandbox, local, or staging pilot only.

## Summary

This closed pilot validates the V-19 submission flow with dummy data only.

Default cohort:

| Role | Count | Purpose |
| --- | ---: | --- |
| admin | 2 | Review, return, accept, and export-readiness checks. |
| agent | 5 | Create, complete, submit, and fix submissions. |

The agent group can expand to 8 testers by repeating the same scenarios across
different browsers, desktop, tablet, and mobile viewports.

No real passports, real personal documents, or private user data may be used
until storage/RLS proof is explicitly approved and recorded. Export scope is
Excel readiness only; do not test or claim ZIP export or production readiness.

## Roles

| Tester | Role | Assignment |
| --- | --- | --- |
| Admin 1 | admin | Review queue, create issues, return submissions, accept fixed submissions, check export readiness. |
| Admin 2 | admin | Repeat admin review on another browser/device, verify issue wording, triage bug reports. |
| Agent 1 | agent | Complete the single-submission full path. |
| Agent 2 | agent | Complete the family-submission full path. |
| Agent 3 | agent | Complete the returned-issue fix path. |
| Agent 4 | agent | Repeat upload and questionnaire scenarios on another browser/device. |
| Agent 5 | agent | Repeat send-to-review and correction scenarios on another browser/device. |
| Agent 6-8 | agent | Optional: repeat single/family/upload/questionnaire scenarios across mobile, tablet, and desktop. |

## Pilot Rules

- Use only dummy applicants and fake contact/travel data.
- Use only generated, sample, or dummy test documents.
- Do not upload real passports, visa forms, tickets, invoices, photos of real
  people, or private client files.
- Do not retry upload failures with private documents.
- Report every bug through the bug template below.
- Submit one bug per report.
- Attach screenshots only when they do not expose private or real-person data.
- Treat `export readiness` as fail-closed Excel readiness only.

Severity:

| Severity | Definition |
| --- | --- |
| Critical | Blocks a core flow or risks data/privacy. |
| Serious | Breaks review, return, fix, accept, or export readiness. |
| Medium | Produces incorrect or confusing behavior inside the pilot scope. |
| Minor | Low-risk polish, copy, or layout issue. |

## Test Scenarios

### 1. Single Submission

Role: agent.

Steps:

1. Create one dummy applicant.
2. Fill required fields with fake data.
3. Upload a dummy/test passport document.
4. Complete the questionnaire.
5. Send the submission to review.

Expected:

- Incomplete state blocks submit.
- Complete state reaches admin review.
- No real document is uploaded.

### 2. Family Submission

Role: agent.

Steps:

1. Create a family submission with 2-4 dummy applicants.
2. Fill the questionnaire for each applicant.
3. Upload only dummy/test documents.
4. Send the family submission to review.

Expected:

- Each applicant has visible file and questionnaire readiness.
- Family submission reaches admin review only when complete.
- No real document is uploaded.

### 3. Upload Test Passport

Role: agent.

Steps:

1. Upload a generated or sample passport-like test file.
2. Confirm the file state is visible.
3. If upload fails, record the failure as a bug.

Expected:

- File state is clear.
- No real passport is used.
- Failures are logged without retrying with private documents.

### 4. Questionnaire

Role: agent.

Steps:

1. Open a draft submission.
2. Leave one required field empty.
3. Confirm send is blocked.
4. Fill the missing field.
5. Save and send to review.

Expected:

- Blocker text is understandable.
- Submit becomes available only after required fields are complete.

### 5. Send To Review

Role: agent.

Steps:

1. Open a completed single or family submission.
2. Send it to review.
3. Confirm the status shown to the agent.
4. Ask an admin tester to confirm it appears in the review queue.

Expected:

- Agent sees review status.
- Admin sees the submission in the review queue.

### 6. Admin Issue

Role: admin.

Steps:

1. Open a submitted test submission.
2. Create a precise issue tied to one applicant, field, or file.
3. Add a reason and agent-facing comment.

Expected:

- Issue is visible with reason and comment.
- Issue blocks acceptance.

### 7. Return

Role: admin.

Steps:

1. Return the submission with the issue.
2. Ask the owning agent to open the submission.

Expected:

- Agent sees returned status.
- Agent sees an actionable issue.

### 8. Fix

Role: agent.

Steps:

1. Fix the returned field or upload a replacement dummy document.
2. Mark the issue fixed.
3. Send corrections.

Expected:

- Correction status is visible to admin.
- No unresolved blocker is silently bypassed.

### 9. Accept

Role: admin.

Steps:

1. Open a corrected submission.
2. Confirm the issue is fixed.
3. Close the issue and accept the submission.

Expected:

- Submission becomes ready for export only after blockers are closed.
- Acceptance is blocked while unresolved blockers remain.

### 10. Export Readiness

Role: admin.

Steps:

1. Open export.
2. Select ready submissions.
3. Check Excel preview.
4. Generate and download the workbook.
5. Mark exported only after download.

Expected:

- Preview and workbook row model match selected ready submissions.
- Non-ready submissions are blocked.
- No ZIP flow is claimed or tested.

## Bug Template

Use this exact template for every issue:

```md
Role:
Screen:
Steps:
Expected:
Actual:
Severity:
Screenshot:
```

## Exit Criteria

- At least one single submission completes from create to export readiness.
- At least one family submission completes from create to export readiness.
- At least one admin issue is returned, fixed by agent, closed by admin, and accepted.
- Zero real-document uploads.
- All bugs use the required template.
- Screenshots are attached only when safe.

## Out Of Scope

- Production activation.
- Production readiness claims.
- Real passport or private document handling.
- ZIP package generation, ZIP storage, ZIP checksums, or repeat ZIP download proof.
- Country selection or non-Spain workflows.
- AI/OCR certainty claims.

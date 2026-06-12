# VisaFlow AI Codex Project Brief

## Product Goal

VisaFlow AI is an MVP operational platform for visa application intake and operator review.

The product should help agents prepare complete applicant or family submissions, help operators verify the submission with precise correction targets, and make export and manual appointment handoff part of a controlled workflow.

The MVP workflow is:

```text
Agent creates submission
→ Agent fills questionnaire and uploads required media
→ System shows blockers/readiness
→ Agent submits to operator
→ Operator reviews questionnaire and media
→ Operator returns exact corrections or accepts
→ Operator prepares CSV/XLSX-compatible export rows and ZIP-ready media naming
→ Operator manually updates appointment status
```

This is not a full visa CRM, not an automatic visa center integration, and not an automatic visa submission system.

## Target Users

### Agent

Agents manage only their own submissions.

Agent capabilities in MVP:

- Log in through mock/local email flow or demo role selection.
- Create Tourist submissions.
- Create Family submissions.
- Add family members gradually.
- Fill applicant questionnaire sections.
- Upload required media into three required slots: `photo_white`, `selfie`, `video`.
- Save draft progress.
- See submission, applicant, field, and media blockers.
- Submit only when blocking requirements are satisfied.
- See returned corrections with exact targets.
- Fix returned fields/files and resubmit.

### Admin / Operator

Operators manage the global review, export, and manual appointment handoff process.

Admin capabilities in MVP:

- See all submissions in a global queue.
- Filter by status, agent, country, city, and submission type.
- Open a submission detail view.
- Review each applicant inside a family.
- Review questionnaire and media independently.
- Return precise corrections for submission, applicant, field, or media.
- Accept submissions after all blocking issues are resolved.
- Mark accepted submissions ready for Excel/CSV export.
- Export CSV/XLSX-compatible rows.
- Prepare ZIP-ready media package naming.
- Manually update appointment status.

## Core Workflows

### Agent Intake

```text
Email login
→ Agent dashboard
→ Create Tourist or Family submission
→ Add applicant(s)
→ Fill questionnaire sections
→ Upload photo, selfie, video
→ Review blockers
→ Fix blockers
→ Submit to operator
→ Wait for review
→ Fix returned corrections
→ Resubmit
```

### Admin Review

```text
Admin dashboard
→ Queue
→ Filter submissions
→ Open submission
→ Start review
→ Review applicants and media
→ Return exact correction or accept
→ Mark ready for Excel
→ Export applicant rows
→ Update manual appointment status
```

### Family Submission

```text
Create family submission
→ Add 0..N applicants over time
→ Calculate readiness per applicant
→ Keep applicants grouped
→ Allow operator to return one applicant inside a family
→ Export adjacent applicant rows
→ Preserve familyGroupId and familyGroupColor
```

## MVP Scope

Required in MVP:

- Mock/local email login or safe demo role selection.
- Role-based Agent/Admin views.
- Agent dashboard.
- Admin dashboard.
- Tourist submission creation.
- Family submission creation.
- Applicant data model.
- Applicant questionnaire form.
- Media upload slots.
- Blocker calculation.
- Precise corrections.
- Operator queue.
- Review flow.
- Accept/return flow.
- CSV/XLSX-compatible export row generation.
- ZIP-ready file naming structure.
- Manual appointment statuses.
- Local/mock persistence with a Supabase-ready repository boundary.
- Domain rule tests.
- Premium operational cockpit UI.

## v1 Exclusions

Do not add without explicit product confirmation:

- Payments.
- Automatic appointment booking.
- Visa center integration.
- OCR as a required flow.
- AI verification as source of truth.
- Visa probability or visa chance scoring.
- Result guarantees.
- Official verification claims.
- Official submission claims.
- Broad CRM logic.
- Large country-specific checklist logic.
- Production Supabase activation without gates.
- Lovable-generated structure.
- Marketing pages.
- Complex backend when the MVP can be built through clean local/Supabase-ready frontend architecture.

## Product Boundaries

VisaFlow AI owns:

- Intake completeness.
- Readiness and blocker visibility.
- Operator review workflow.
- Precise correction targeting.
- Export preparation.
- Manual appointment status tracking.

VisaFlow AI does not own in MVP:

- Embassy decisions.
- Official visa submission.
- Booking appointments automatically.
- Guaranteeing completeness against every country-specific rule.
- Replacing human operator judgment.
- Replacing visa center systems.

## Operational Principles

1. Business logic comes before visual polish.
2. Domain rules must be centralized and testable.
3. UI must not decide status transitions directly.
4. Uploaded media is not the same as accepted media.
5. Agent can only see agent-owned submissions.
6. Admin can see all submissions.
7. Family is a group of applicants, not one giant applicant form.
8. Export is a workflow stage, not a hidden button.
9. Appointment status is manual only.
10. Product copy must be safe and non-promissory.

## Copy Guardrails

### Tone

Use copy that is:

- Precise.
- Calm.
- Operational.
- Premium.
- Safe.
- Non-promissory.

### Allowed Phrases

- “Ready for operator review”
- “Needs correction”
- “Media uploaded, pending review”
- “Accepted for export”
- “Sent to appointment handling”
- “Manual appointment status”

### Forbidden Phrases

- “Visa guaranteed”
- “Approved by embassy”
- “Automatic booking completed”
- “AI verified”
- “100% compliant”
- “Official submission”

## Open Questions

1. Should the product UI be Russian-only for MVP, or should English labels remain for some operational/admin screens?
2. Should the code rename the current internal submission type `"single"` to `"tourist"`, or preserve `"single"` internally and show “Tourist” in UI copy?
3. Should local/mock login require typed email entry, or is role-based demo selection acceptable for first contractor implementation?
4. Should CSV be the first required export artifact, with XLSX added later, or must XLSX binary generation ship in the first MVP pass?
5. Should media upload store actual files locally, store metadata only, or use Supabase Storage only after production activation?
6. Should family grouping be manually confirmed by the agent/admin, or should the system only suggest grouping signals?
7. Are appointment statuses tracked per submission only, or also per applicant inside family submissions?
8. Are country/city fields free text in MVP, or must they come from controlled lists?
9. Should admin corrections be visible immediately to agents after save, or only after the whole submission is returned?
10. Should audit events be required for every domain action in local/mock mode, or only prepared for future Supabase production mode?

## Assumptions Used

1. UI should be operational and mostly Russian-language because the existing repo/prototype data and current app copy use Russian labels heavily.
2. Preserve existing code compatibility by allowing internal `"single"` while presenting the product concept as Tourist.
3. Use local/mock login first; Supabase Auth remains a future-ready adapter path.
4. Implement CSV-compatible row mapping first; XLSX can be added behind the export boundary if justified.
5. Media upload can start as local/mock metadata and preview handling; Supabase Storage remains behind `MediaRepository` / storage adapters.
6. Family grouping can be created manually and may include assistive suggestions, but the system must not auto-merge applicants as truth.
7. Appointment status is tracked per submission in MVP.
8. Country/city are free text in MVP.
9. Corrections are visible to agents when the admin returns the submission.
10. Local/mock mode should record enough status history for UX/debugging, while production-grade audit can be completed with Supabase.

## Success Criteria

The MVP is successful when:

- An agent can create a family submission with at least two applicants.
- Required questionnaire fields are validated centrally.
- Each applicant has required media slots.
- Blockers prevent premature submission.
- An admin can review the submission.
- An admin can return precise field/media corrections.
- An agent can fix and resubmit.
- An admin can accept only after blocking corrections are closed and media are accepted.
- Accepted submissions can be mapped to export rows with one row per applicant.
- Family export rows stay adjacent and preserve `familyGroupId` / `familyGroupColor`.
- Appointment status is updated manually and never implies automatic booking.
- Typecheck, lint, tests, and build pass before merge.
- The UI works on desktop, tablet, and mobile without horizontal overflow.

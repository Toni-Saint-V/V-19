# AdminReviewer Upgrade Design

## Architecture

`AdminWorkspace` remains the navigation and command adapter. `ReviewWorkspace` owns presentation-only state. `RemarkForm` owns draft issue input. Canonical commands in `status.ts`, `submissionActions.ts`, and `domainEngine.ts` remain the only mutation authority. `App.tsx` retains revision-checked persistence and refresh-on-conflict behavior.

## Interfaces

- Keep application bridge command signatures unchanged.
- Keep canonical statuses, issue statuses, severity types, storage schema, and RPC contracts unchanged.
- Restore `ADMIN_PASSPORT_REVIEW_FIELD_IDS` to the normative eight-field tuple.
- Extend only the local preview model with unavailable reasons and retryability.
- Keep saving/error/conflict/permission feedback as transient UI state; never persist it or use it as a domain guard.

## Data flow

1. `AdminWorkspace` selects a submission and an unambiguous applicant.
2. `ReviewWorkspace` derives domain decisions, loads signed previews independently, and renders guard reasons.
3. `RemarkForm` returns a precise target and UI severity; `AdminWorkspace` maps critical to canonical blocker.
4. Bridge callbacks execute canonical commands, persist through revision-checked storage, then update the rendered submission.
5. Failed/stale writes refresh canonical state and retain explicit user feedback.

## Failure behavior

- Preview failure is isolated per medium and retryable; applicant or file-generation changes invalidate stale results.
- Domain rejection is rendered as the exact disabled reason.
- Persistence failure does not apply optimistic canonical state.
- Revision conflict reloads the canonical submission and asks the administrator to review again.
- Session/permission loss removes mutation affordances and routes through the existing workspace gate.

## Visual evidence

Before is exported from parent commit `78720650` into the assigned evidence directory. After is captured from the active build. Both use fixture `ПД-1053 / Нина Волкова / submitted_for_review`, deterministic media and time, disabled animations, and 1440x900 plus 390x844 viewports.

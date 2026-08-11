# Agent → Admin review handoff flow

## Scope

This specification defines the visible VisaFlow path from creating a submission
to an administrator exporting an accepted package. It is the acceptance source
for the agent handoff hotfix: a complete package must not dead-end on a pending
passport OCR confirmation.

Roles:

- **Agent** creates, completes, and sends a package for human review.
- **Administrator** manually reviews the package, accepts it, and exports it.
- **System** may run local passport OCR, but OCR never replaces administrator
  acceptance.

Out of scope: deleting a submission, production account management, and
changing document requirements. A deletion affordance must receive a separate
domain, persistence, and recovery contract before it is shown or animated.

## Screen flow

| Step | Screen and actor                                               | State on entry                                 | Primary outcome                                                                                                                                                     |
| ---- | -------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | **Мои подачи** — Agent                                         | no selected submission                         | Agent chooses `Новая подача`; drafts are visible here.                                                                                                              |
| 2    | **Новая подача** — Agent                                       | package type, city, applicants, passport files | System saves a draft and its passport files. OCR may start asynchronously.                                                                                          |
| 3    | **Мои подачи** — Agent                                         | `draft`                                        | The new card is visible only in submissions, never in `Мои действия`.                                                                                               |
| 4    | **Drawer / Обзор** — Agent                                     | `draft`                                        | `Начать работу` changes the package to `in_progress`; it is the explicit transition from an editable draft.                                                         |
| 5    | **Drawer / Обзор (Чеклист документов)** and **Анкета** — Agent | `in_progress`                                  | Agent uploads every required file from the visible checklist and completes every required questionnaire field.                                                      |
| 6    | **Drawer footer** — Agent                                      | complete `in_progress`                         | `Отправить на проверку` is enabled and sends the package to `submitted_for_review`. A pending/unconfirmed OCR is a review cue for the admin, not an agent dead-end. |
| 7    | **Очередь на проверку** — Administrator                        | `submitted_for_review`                         | The package appears in review with passport/document evidence and queue reasons.                                                                                    |
| 8    | **Review workspace** — Administrator                           | package under review                           | Administrator accepts files and passport data, or returns a precise correction.                                                                                     |
| 9    | **Выгрузка** — Administrator                                   | `ready_for_export`                             | Administrator produces and downloads the Excel/ZIP artifact, then marks the package exported.                                                                       |
| 10   | **Мои подачи / История** — Agent                               | review, returned, accepted, or exported        | Agent sees the canonical status and any required corrections; edits are unavailable while review/export owns the package.                                           |

## User stories and acceptance criteria

### US-1: Create without creating a false action

**As an** agent, **I want** a newly saved package to appear in `Мои подачи`,
**so that** I can resume it without it being presented as an overdue action.

1. WHEN the agent saves a new package from `Новая подача`, THE SYSTEM SHALL
   persist status `draft` and show it in `Мои подачи`.
2. WHEN a submission is in status `draft`, THE SYSTEM SHALL exclude it from
   `Мои действия`.
3. WHEN the agent presses `Начать работу`, THE SYSTEM SHALL transition the
   same owned draft to `in_progress` without creating a second submission.

### US-2: Complete and hand off a package

**As an** agent, **I want** to send a complete package to an administrator
without being trapped by a pending non-conflicting passport extraction, **so that** human review
can start immediately.

1. WHEN an owned `in_progress` submission has all required files, required
   questionnaire fields, and a usable trip-date range, THE SYSTEM SHALL expose
   enabled `Отправить на проверку`.
2. WHEN passport extraction is extracting, unavailable, or has unconfirmed
   non-conflicting values, THE SYSTEM SHALL allow the agent handoff and SHALL
   keep the condition visible to the administrator as review context.
3. WHEN the agent presses `Отправить на проверку`, THE SYSTEM SHALL persist
   `submitted_for_review`, append status history, and prevent agent editing.
4. WHEN the package is submitted, THE SYSTEM SHALL show it to the
   administrator in `Очередь на проверку`.

### US-3: Preserve hard safety boundaries

**As an** administrator, **I want** unsafe or contradictory data to remain
blocked before handoff, **so that** a convenient agent flow cannot bypass
document integrity.

1. WHEN required files, required questionnaire data, or trip dates are absent,
   THE SYSTEM SHALL keep the handoff unavailable and name the actionable
   blocker.
2. WHEN a passport extraction row conflicts with the questionnaire and has not
   been resolved, THE SYSTEM SHALL block handoff in both the visible UI and the
   central action policy.
3. WHEN identity reconciliation reports a critical mismatch, THE SYSTEM SHALL
   block handoff in both the visible UI and the central action policy.
4. WHEN a package reaches administrator review, THE SYSTEM SHALL still require
   full document/passport verification before acceptance or export; agent
   handoff never means passport acceptance.

### US-4: Review, correction, and export

**As an** administrator, **I want** one canonical sequence after handoff,
**so that** no role silently owns the same state twice.

1. WHEN the administrator accepts the complete package, THE SYSTEM SHALL move
   it to `ready_for_export`.
2. WHEN the administrator returns corrections, THE SYSTEM SHALL identify the
   exact correction and return ownership to the agent.
3. WHEN a package is ready for export, THE SYSTEM SHALL allow the
   administrator—not the agent—to generate and download the export artifact.

## Non-functional acceptance

- Every visible decision must be reproduced through UI action → canonical state
  effect → reload/readback in local browser proof.
- The affected controls must remain reachable at 320, 390, 768, and 1440 px;
  no horizontal overflow or clipped primary action is acceptable.
- The local demo ends at the administrator review queue: it deliberately
  refuses local files as protected originals. It proves the agent handoff, not
  administrative acceptance or export.
- Administrator acceptance and export require an authenticated isolated
  Supabase sandbox with protected Storage originals, test accounts, synthetic
  documents, canonical readback, and cleanup. The current repository has no
  assigned sandbox descriptor, so this gate is explicitly blocked rather than
  simulated against production.

# Requirements: New submission workspace

## US-1: Create inside the agent workspace

**As a** VisaFlow agent
**I want** «Новая подача» to behave like a normal workspace section
**So that** I retain navigation context while creating a submission.

### Acceptance Criteria (EARS)

1. WHEN any visible «Новая подача» entry is activated
   THE SYSTEM SHALL keep the shared sidebar and page header visible and mark
   «Новая подача» active.
2. WHEN create-flow is opened again while already active
   THE SYSTEM SHALL preserve the current intake state.
3. WHEN create-flow is cancelled without changes
   THE SYSTEM SHALL return to the originating non-create section.

## US-2: Preserve safe intake behavior

**As a** VisaFlow agent
**I want** current intake rules to remain unchanged
**So that** the UI refactor cannot corrupt or duplicate a submission.

### Acceptance Criteria (EARS)

1. WHEN the create-flow becomes dirty and navigation is requested
   THE SYSTEM SHALL ask whether to stay or discard before unmounting the flow.
2. WHEN persistence or OCR is busy
   THE SYSTEM SHALL prevent unsafe navigation and duplicate submission.
3. WHEN «Сохранить черновик» succeeds
   THE SYSTEM SHALL show the created submission in «Мои подачи».
4. WHEN «Создать и открыть анкету» succeeds
   THE SYSTEM SHALL open the existing questionnaire for the created submission.
5. WHEN single/family, city, file, OCR or applicant controls are used
   THE SYSTEM SHALL retain the current validation and canonical intent contracts.

## US-3: Responsive and accessible workspace UI

**As a** VisaFlow agent
**I want** create-flow to remain usable on mobile, tablet and desktop
**So that** every primary action remains readable and reachable.

### Acceptance Criteria (EARS)

1. WHEN rendered at 375, 390, 768, 1024 or 1440 px
   THE SYSTEM SHALL have no horizontal overflow, clipped controls or
   inaccessible primary actions.
2. WHEN rendered below 1280 px
   THE SYSTEM SHALL use a single-column layout and expose OCR prefill through
   the existing sheet.
3. WHEN nested assignment or confirmation UI opens
   THE SYSTEM SHALL retain modal semantics and focus containment.

## Out of scope

- Redesign of «Мои действия», «Мои подачи», questionnaire or submission drawer.
- Submission-domain, Supabase schema, storage policy or API changes.
- Commit, push or deployment.

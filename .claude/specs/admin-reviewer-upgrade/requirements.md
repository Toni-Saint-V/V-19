# AdminReviewer Upgrade Requirements

## US-1: Safe administrative review

**As an** administrator
**I want** review actions to reflect canonical guards
**So that** a submission cannot move through an invalid or partially persisted state.

### Acceptance criteria

1. WHILE a submission is `submitted_for_review` or `corrections_received`, THE SYSTEM SHALL enable only actions allowed by canonical domain decisions.
2. WHILE a submission is in any other canonical status, THE SYSTEM SHALL present the workspace as read-only and explain why mutation is unavailable.
3. WHEN passport section confirmation succeeds, THE SYSTEM SHALL accept only the selected applicant's required media, record reviewer metadata, and close only in-scope `fixed_by_agent` issues.
4. WHEN confirmation or persistence fails, THE SYSTEM SHALL leave status, issues, history, review metadata, and export metadata unchanged.
5. THE SYSTEM SHALL NOT allow AI, OCR, or presentation helpers to make canonical decisions.

## US-2: Evidence-led passport comparison

**As an** administrator
**I want** protected originals and eight passport fields in one workspace
**So that** I can complete a manual comparison without losing context.

### Acceptance criteria

1. WHEN a primary applicant is selected, THE SYSTEM SHALL expose passport, selfie 1, and selfie 2; for a secondary family applicant it SHALL require only passport.
2. WHEN a protected preview loads, THE SYSTEM SHALL reveal each medium independently without waiting for slower media.
3. WHEN a preview URL fails or expires, THE SYSTEM SHALL show a precise error and a retry action without showing stale media.
4. THE SYSTEM SHALL provide 60-180 percent zoom, 90-degree rotation, fullscreen viewing, keyboard focus, and no horizontal viewport overflow.

## US-3: Precise issue workflow and feedback

**As an** administrator
**I want** precise remarks and durable operation feedback
**So that** agents know what to fix and I know whether a change was saved.

### Acceptance criteria

1. WHEN an issue is created, THE SYSTEM SHALL attach applicant plus field, section, file, or media target and map UI critical severity to canonical `blocker`.
2. WHEN issue text is empty, THE SYSTEM SHALL keep the form open and show actionable validation.
3. WHILE a command is pending, THE SYSTEM SHALL prevent duplicate submission and expose saving state.
4. WHEN persistence succeeds or fails, THE SYSTEM SHALL expose saved, error, conflict, or permission-lost feedback without discarding the current context.

## US-4: Comparable verification

**As a** product owner
**I want** an unchanged Before and independently evaluated After
**So that** improvement is demonstrated rather than asserted.

### Acceptance criteria

1. WHEN Before and After are captured, THE SYSTEM SHALL use the same fixture, state, media, time, and viewport.
2. THE SYSTEM SHALL store generated screenshots, reports, and traces outside the product repository.
3. WHEN After is scored, it SHALL exceed Before, score at least 90/100, contain no P0/P1 regression, and pass domain and accessibility review.

## Out of scope

- Export behavior, agent questionnaire editing, routes, side navigation, Supabase migrations/RPCs, and production deployment.

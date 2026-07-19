# Questionnaire save and submission focus

status: complete

target: the active questionnaire save flow and `Мои подачи` registry in `/Users/user/Documents/V-19`

outcome: a newly created submission returns to the correct type-filtered list after `Сохранить и выйти`, stays at the top by creation time, exposes its immutable public number, and gives the agent four direct questionnaire/media actions for every tourist

## Task ledger

- locked flow: `Сохранить и выйти` -> `Мои подачи` -> focused newest card -> applicant action -> optional submit for review
- source truth: canonical `Submission`, domain readiness in `status.ts`, Supabase persistence/RPC, existing drawer `WorkspaceTarget`, and the approved browser annotations
- owner map: root agent owns implementation and integration; delegated lanes were bounded to reconnaissance and non-overlapping profile tests
- approved layers: questionnaire orchestration, agent workspace state, submission list presentation, submission domain helpers, Supabase forward migration/types, targeted tests and tokenized CSS
- forbidden overlap: unrelated `V19_ADMIN_AGENT_UI_HANDOFF/`, route removal, product-wide redesign, remote migration, push, deploy
- verification: targeted Vitest, full unit/integration suite, typecheck, build, and fresh localhost desktop/mobile browser proof
- baseline: 110 test files passed; 1074 tests passed and 5 skipped before implementation

## Workflow state

Package Manager: npm (via `package-lock.json`)

Framework: React 19 + Vite 8 (via `vite.config.ts` and `react` dependency)

Verification: targeted Vitest component/domain tests, `npm run typecheck`, `npm run lint`, `npm run build:supabase-production`, and fresh browser proof at mobile and desktop widths

## Requirements

### US-1: Receive a searchable order number

As an agent, I want a stable sequential number after finishing a new questionnaire so that I can find the submission quickly in lists.

1. WHEN a newly created questionnaire is complete and the agent presses `Сохранить и выйти` for the first completed save
   THE SYSTEM SHALL persist the questionnaire, obtain one immutable global `VF-{number}` from the database sequence, show the number in an alert, and only then leave the questionnaire.
2. WHEN a questionnaire is incomplete and the agent presses `Сохранить и выйти`
   THE SYSTEM SHALL save the draft and return to the list without issuing or showing a public number.
3. WHEN number assignment fails
   THE SYSTEM SHALL keep the questionnaire open and show a safe save error instead of displaying `VF-—` or pretending that the save is complete.
4. WHEN an older submission already has a public number
   THE SYSTEM SHALL preserve it; the number is never regenerated, renumbered, or edited by the client.
5. WHEN a public number exists
   THE SYSTEM SHALL display it on the `Мои подачи` card and include it in list search.

### US-2: Return to the saved card

As an agent, I want the saved submission to be the first visible card so that I can continue work without searching for it.

1. WHEN `Сохранить и выйти` succeeds
   THE SYSTEM SHALL open `Мои подачи`.
2. WHEN the saved submission type is `single`
   THE SYSTEM SHALL select the `Заявитель` type filter.
3. WHEN the saved submission type is `family`
   THE SYSTEM SHALL select the `Семья` type filter.
4. WHEN the filtered list renders
   THE SYSTEM SHALL sort by `createdAt` descending and keep the just-saved submission first, including deterministic handling of equal timestamps.
5. WHEN the agent opens `Мои подачи` before choosing a type
   THE SYSTEM SHALL default to `Заявитель`.
6. WHEN the agent changes the type filter
   THE SYSTEM SHALL allow `Все`, `Семья`, and `Заявитель` without losing the existing city, status, search, or sort controls.

### US-3: Act on questionnaire and media state from the card

As an agent, I want four comfortably sized actions beside each applicant so that I can understand readiness and continue work immediately.

1. WHEN the main applicant row or individual card renders
   THE SYSTEM SHALL show exactly four labeled actions in its trailing action area: `Анкета`, `Селфи 1`, `Селфи 2`, and `Паспорт`.
2. WHEN a spouse, child, or other secondary family member row renders
   THE SYSTEM SHALL show only `Анкета` and `Паспорт`; selfie actions are absent because they are not required for those tourists.
3. WHEN the passport scan is uploaded and does not require replacement
   THE SYSTEM SHALL render the passport icon green, including passports uploaded during creation/questionnaire intake.
4. WHEN the passport requires replacement, failed to upload, or has a correction state
   THE SYSTEM SHALL render the passport icon orange.
5. WHEN no passport scan exists
   THE SYSTEM SHALL render the passport icon gray.
6. WHEN the questionnaire is complete
   THE SYSTEM SHALL render the questionnaire icon green.
7. WHEN the questionnaire is partial or needs correction
   THE SYSTEM SHALL render the questionnaire icon orange.
8. WHEN the questionnaire is empty
   THE SYSTEM SHALL render the questionnaire icon gray.
9. WHEN a missing media action is activated
   THE SYSTEM SHALL open the native file picker for that visible required media slot; secondary-family selfie upload actions are not exposed on this screen.
10. WHEN a media action has an active remark
   THE SYSTEM SHALL open the drawer focused on that exact issue; otherwise green media opens its exact file slot.
11. WHEN a questionnaire action is complete
    THE SYSTEM SHALL alert `Анкета уже заполнена`; an orange questionnaire opens its exact correction target and a defensive gray state opens the questionnaire from the beginning.
12. WHEN an action is rendered
    THE SYSTEM SHALL expose its applicant, document kind, and state through an accessible Russian label and tooltip; color alone is not the only status signal.

### US-4: Tighten family member typography

1. WHEN a family member row renders
   THE SYSTEM SHALL render the member name at the shared `13px` role token for this row pattern.
2. WHEN the member has a role label such as `Супруга`
   THE SYSTEM SHALL render it immediately after the name, not at the far right, using a substantially smaller muted tokenized label.
3. WHEN the row becomes narrow
   THE SYSTEM SHALL keep the name, role, and applicable 40px actions readable by wrapping the trailing actions below the identity only where one-line placement cannot fit without truncation or page-level horizontal overflow.

### US-5: Replace readiness badges with relative creation time

1. WHEN a submission card renders
   THE SYSTEM SHALL omit the visible `N% готово` badge and show a relative label derived from immutable `createdAt` in the lower-left corner.
2. WHEN time passes while the screen remains open
   THE SYSTEM SHALL refresh every relative label from one screen-level minute timer.
3. WHEN `createdAt` is legacy `DD.MM`
   THE SYSTEM SHALL resolve the current year, rolling to the previous year if the date would otherwise be future; invalid values show `дата неизвестна`.
4. WHEN domain readiness becomes complete
   THE SYSTEM SHALL show `Отправить на проверку` directly on both single and family cards while retaining `canPerformAction` as the only permission source.

### US-6: Make the status the primary card action

1. WHEN a card is not yet allowed to move to review
   THE SYSTEM SHALL show its lifecycle status in the top card header.
2. WHEN `canPerformAction(submission, "submit_for_review", "agent")` allows the transition
   THE SYSTEM SHALL replace that top status label with the primary button `Отправить на проверку`.
3. WHEN the agent activates that button
   THE SYSTEM SHALL execute the existing persisted `submit_for_review` command, block repeat activation while pending, and show a card-local error if it fails.
4. WHEN the transition succeeds
   THE SYSTEM SHALL show `На проверке`; the submission status is `submitted_for_review` and the canonical admin-review selector includes it.
5. WHEN the card renders
   THE SYSTEM SHALL not show a separate `Открыть` button; individual document actions occupy that lower-right area and have no resting border or background.

## Design decisions

approach: keep the current `Сбор документов` screen available during this slice, but make `Мои подачи` the primary at-a-glance registry through type filters and passport/questionnaire indicators

persistence owner: Supabase owns sequential-number allocation; the React client may request an idempotent assignment only after persisted questionnaire readiness is complete

assignment contract: a server-side RPC validates authentication, submission ownership, and questionnaire completion; it returns the existing number or atomically assigns the next sequence value

legacy contract: existing public numbers remain unchanged; the corrective migration affects future unnumbered drafts and does not clear old IDs

save contract: questionnaire save returns the saved `Submission`; the parent navigation uses that submission's type and ID to select the list filter and focused first card in the same user event, without an effect chain

filter contract: `SubmissionTypeFilter = "all" | "family" | "single"`; default is `single`, save-and-exit overrides it with the saved submission type, and only the agent's explicit filter action selects `all`; `all` uses one globally ordered mixed sequence rather than family-first grouping

sort contract: `ApplicantSort = "createdDesc" | "createdAsc" | "tripDate"`; default and post-save sort are `createdDesc`

action contract: derive questionnaire/media state in the submissions domain/presentation layer, not inside JSX; render one reusable action component in the lower action area for each family member and individual card

visual contract: use existing Lucide icons and `visual-baseline.css` tokens; no emoji, handcrafted SVG, raw screen-local color, font-size, spacing, radius, or transition values

responsive contract: preserve current family/card composition on mobile and desktop; the added icons and inline role cannot reduce tap targets or create horizontal overflow

accessibility contract: the native alert contains the public number; every action is a real 40px button with Russian `aria-label` and tooltip; programmatic upload inputs are excluded from the accessibility tree; the main tourist exposes four actions and each secondary family tourist exposes two

## Integration map

- questionnaire save orchestration: `src/components/QuestionnaireScreen.tsx`
- questionnaire button behavior: `src/modules/submissions/components/FigmaQuestionnaireScreen.tsx`
- agent routing and post-save list focus: `src/components/CommandCenter.tsx`
- submission cards, filters, sorting, names, roles, and indicators: `src/components/ApplicantsScreen.tsx`
- public identity and sequential-number helpers: `src/modules/submissions/submissionIdentity.ts`
- Supabase persistence/RPC typing: `src/modules/submissions/supabasePersistence.ts` and `src/lib/supabase/database.types.ts`
- raw visual tokens only: `src/shared/ui/visual-baseline.css`
- database correction: a new forward-only migration under `supabase/migrations/`

## Failure handling

- incomplete questionnaire: save succeeds, no number alert, correct type filter and newest-first list still apply;
- assignment RPC unavailable or rejected: save flow reports an error and does not leave the questionnaire;
- duplicate click/concurrent request: idempotent RPC returns the same immutable number;
- missing passport: gray passport indicator, never a false green state;
- correction/replacement: orange indicator, never red;
- empty filtered type: retain the canonical empty state and expose `Все` as an agent choice.

## Tasks

### T-1: Public-number completion boundary

- Status: complete
- Wired: yes
- Verified: targeted RPC, migration, questionnaire save-and-exit, identity, and submission-rule tests
- Requirements: US-1
- Acceptance: a complete first manual save receives one immutable number; incomplete manual save does not; retries are idempotent.

### T-2: Save-and-exit routing and type focus

- Status: complete
- Wired: yes
- Verified: questionnaire interaction and focused-list autoscroll tests
- Requirements: US-2
- Dependencies: T-1
- Acceptance: single and family saves open the matching filter with the saved card first.

### T-3: Type filter, newest-first ordering, and public ID

- Status: complete
- Wired: yes
- Verified: interaction tests for all type modes, both creation orders, VF search, and focused post-save reset
- Requirements: US-1, US-2
- Dependencies: T-2
- Acceptance: `Все` / `Семья` / `Заявитель` work with existing filters; default sort is newest first; public ID is visible and searchable.

### T-4: Applicant workflow actions, relative creation time, and typography

- Status: complete
- Wired: yes
- Verified: domain/interaction tests plus fresh 1440x900 in-app browser evidence for 40px actions, exact issue drawer, file chooser, inline 13px/10px typography, relative time, and zero horizontal overflow
- Requirements: US-3, US-4, US-5
- Acceptance: the main tourist has four actions, secondary family tourists have questionnaire and passport only, all visible actions use green/orange/gray mappings and exact destinations; readiness badges are absent; relative creation time is live; family names are `13px`; role label is smaller and inline.

### T-5: Verification

- Status: complete
- Wired: n/a
- Verified: typecheck, targeted lint, 282 focused tests (5 skipped), 1111 full-suite tests (5 skipped, `--maxWorkers=4`), production build/bundle guard, git diff check, migration and agent-screen contract verifiers, desktop in-app browser flow, and the approved local Playwright matrix at `320×740`, `390×844`, `430×932`, `768×1024`, `1032×644`, and `1440×900`; project-wide lint is blocked only by pre-existing errors inside unrelated `V19_ADMIN_AGENT_UI_HANDOFF/`
- Requirements: US-1, US-2, US-3, US-4
- Dependencies: T-1, T-2, T-3, T-4
- Acceptance: targeted tests, typecheck, lint, production build, and fresh desktop/mobile browser flow all pass after the latest code change.

### T-6: Card action hierarchy follow-up

- Status: complete
- Wired: yes
- Verified: interaction tests prove the direct transition to `submitted_for_review`, the canonical admin-review selector, and the resulting `На проверке` label; fresh localhost browser proof confirms the top status/action placement, four lower 40px borderless actions, removal of `Открыть`, and zero horizontal overflow across all required viewports
- Requirements: US-3, US-5, US-6
- Dependencies: T-4
- Acceptance: the top status becomes `Отправить на проверку` only when allowed; after submission it becomes `На проверке`; document actions remain mapped to their tourist and the separate drawer CTA is absent.

### T-7: Role-aware family actions

- Status: complete
- Wired: yes
- Verified: domain/presentation tests assert four main-applicant actions and two secondary-member actions; live browser checks confirm `[4,2,2]` for a three-person family, full visible names, 40px targets, and no horizontal overflow across `320×740`, `390×844`, `430×932`, `768×1024`, `1032×644`, and `1440×900`
- Requirements: US-3, US-4
- Dependencies: T-4, T-6
- Acceptance: spouses, children, and other secondary members expose only questionnaire and passport; desktop aligns actions at the right edge of each tourist row, while narrow mobile widths wrap only when required to preserve names and touch targets.

### T-8: Remove the top-level document collection workspace

- Status: complete
- Wired: yes
- Verified: legacy file routes resolve to `agent-submissions`; targeted unit tests, typecheck, production build, and desktop/mobile Playwright prove that file-correction actions focus the exact submission in `Мои подачи` and the removed navigation item is absent.
- Acceptance: document upload/replacement actions stay on the submission cards or submission drawer; received admin packages are visible in `Мои подачи`; no separate `Сбор документов` route or screen remains.

## Working notes

Recommended over immediate route removal because it delivers the user's search/readiness outcome while preserving the currently tested upload and replacement recovery path.

The final Playwright pass found and closed three responsive/accessibility deltas: programmatic file inputs are absent from the accessibility tree, the four fixed-size actions remain inside the card at `320px` without shrinking, and the stale separate `Открыть` action was removed from both source and runtime.

Rejected for this slice: alert-only repair. It would leave type discovery, newest-first placement, passport visibility, and the annotated member-row hierarchy unresolved.

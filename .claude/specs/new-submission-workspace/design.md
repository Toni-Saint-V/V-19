# Design: New submission workspace

## Architecture

- `CommandCenter` owns `activeNav: actions | submissions | create | settings`,
  the origin section and the create leave guard.
- `PreUploadScreen` renders as a labelled workspace region and reports
  `{ dirty, busy }`; it continues to own intake details and nested dialogs.
- `AppShell`/`V19SideMenu` render the active create item and common page header.
- `Surface` adds `agent-create` for scoped styling only. The business bridge
  continues to emit `package.create`.

## Navigation flow

1. `openCreateWorkspace()` stores the current non-create section and activates
   `create`.
2. A navigation request while create is active:
   - no-op while busy;
   - opens a discard alertdialog while dirty;
   - otherwise navigates immediately.
3. «Остаться» preserves mounted form state and restores focus.
4. «Выйти без сохранения» clears create state and executes the pending target.
5. Successful submit uses existing list/questionnaire destinations and bypasses
   the leave prompt.

## Layout

- Common `PageHeader` title: «Новая подача»; secondary action: «Отмена».
- Primary workspace uses shared panel, border, radius, text and focus tokens.
- Main column: type/city setup, applicants, upload/OCR state and sticky actions.
- OCR rail: 320–360 px at `min-width: 1280px`.
- Below 1280 px: one column; OCR opens in the existing mobile sheet.
- Mobile actions respect safe-area inset and all controls remain at least 44 px.

## Compatibility

- No changes to `SubmissionIntakeIntent` or persistence adapters.
- The fixed outer dialog and outer focus trap are removed.
- Assignment, prefill sheet and destructive confirmation dialogs remain modal.
- Existing interaction IDs remain stable.

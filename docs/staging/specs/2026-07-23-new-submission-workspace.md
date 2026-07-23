# New submission workspace

source: `docs/discovery/2026-07-23-new-submission-workspace.md`

contract: `CommandCenter` имеет внутренний раздел `create`, отображаемый внутри
общего `AppShell`.

contract: `PreUploadScreen` остаётся единственным владельцем intake state,
локального OCR, назначения паспортов и submit intent.

contract: parent получает `{ dirty, busy }` и перехватывает уход из create-flow;
dirty вызывает alertdialog, busy не допускает навигацию.

contract: save-draft открывает «Мои подачи» и фокусирует созданную подачу;
continue открывает существующую questionnaire surface.

invariant: `SubmissionIntakeIntent`, persistence adapters, file rules, family
limit и bridge event `package.create` не меняются.

invariant: «Мои действия» и «Мои подачи» визуально не изменяются.

test: targeted unit tests, create-flow E2E, responsive proof, accessibility,
typecheck, production build and local browser comparison.

deferred: commit, push and deploy require separate approval.

## Working notes

- Cancel returns to the last non-create agent section.
- Desktop OCR rail starts at 1280 px; narrower layouts use the existing OCR
  sheet.
- Shared visual baseline is reused, not redesigned.

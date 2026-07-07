# Admin Export Roundtrip QA

## 1. Date

2026-07-07

## 2. Branch/path

- Path: `/Users/user/Documents/V-19`
- Branch: `apply-status-persistence-no-ui...origin/apply-status-persistence-no-ui`

## 3. Dirty worktree summary

Initial required inspection showed a dirty checkout before this task: 39 tracked files in diff with `2632 insertions(+), 2325 deletions(-)`, plus many untracked archives, screenshots, backup folders, an untracked `src/modules/submissions/exportWorkbook-download.ts`, an untracked export e2e spec, and an untracked Cyrillic-named source folder. `git diff --check` was clean before implementation.

Unrelated dirty context was preserved. This task intentionally touched only the active export roundtrip implementation/tests and this QA note.

## 4. Export eligibility contract

- Active admin export screen now derives rows from real `ready_for_export` submissions only; the previous mock export fallback was removed.
- Selection uses canonical export blockers/warnings from `exportSummary`.
- Mixed cities block export with `Нельзя смешивать разные города`.
- Same-city mixed-agent batches remain warnings, not hard blockers, when current rules allow them.
- Export state moves through `file_generated -> file_downloaded -> marked_exported` and records history entries.

## 5. Excel row contract

- Preview and XLSX use the same canonical `ExportContractRow` serialization path.
- Missing questionnaire/submission fields remain empty instead of fake defaults such as generic visa type, visa subtype, appointment category, hotel country, contact surname, passport type, or purpose.
- Workbook remains `Sheet1`, `A:BD`, 56 columns.

## 6. Family ordering proof

Covered by `tests/unit/exportWorkbook.spec.ts`: families are ordered before singles within city scope, each family stays contiguous, and family rows receive workbook fills while singles remain unfilled.

## 7. City separation proof

Covered by `tests/unit/exportWorkbook.spec.ts` and `tests/unit/v19SubmissionRules.spec.ts`: mixed-city selection is blocked, and same-city mixed-agent selection is warning-only.

## 8. ZIP behavior

- ZIP generation now includes the generated XLSX, `manifest.json`, `README_ПАКЕТ.txt`, and required linked media when storage identity is valid.
- ZIP name is deterministic: `visaflow-export-${idempotencyKey}.zip`.
- Applicant media filenames use passport number when available; otherwise they use the existing safe `missing-passport_*` fallback.
- Required media/storage problems block ZIP generation before browser download.

## 9. Returned PDF/list upload behavior

Existing returned-PDF operational workflow and handoff tests remain green. Active upload UI wiring was not broadly redesigned in this task; the current project already has returned PDF handoff domain/services, and unit proof covers owner-scoped visibility and fallback blockers.

## 10. Agent visibility proof

Covered by `tests/unit/returnedPdfOperationalWorkflow.spec.ts`: owner agent sees ready returned application PDFs, non-owner agent does not, and missing passport data creates handoff blockers.

## 11. Role gate proof

- Domain `generateExport` remains admin-only.
- App-level export completion handler now refuses non-admin workspace execution.
- Agent visibility for returned materials is read-only through existing handoff view tests.

## 12. Commands run

- `git status --short --branch`: dirty branch confirmed.
- `git diff --name-status`: tracked dirty files listed.
- `git diff --stat`: dirty baseline captured.
- `git ls-files --others --exclude-standard`: untracked context captured.
- `git diff --check`: passed.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm run verify:safety`: passed.
- `npx vitest run tests/unit/exportWorkbook.spec.ts`: passed, 23 tests.
- `npx vitest run tests/unit/v19SubmissionRules.spec.ts`: passed, 80 tests.
- `npx vitest run tests/unit/exportWorkbook.spec.ts tests/unit/exportMediaZip.spec.ts tests/unit/submissionExportWorkflow.spec.ts tests/unit/returnedPdfOperationalWorkflow.spec.ts tests/unit/returnedPdfHandoffPersistence.spec.ts tests/unit/v19DomainEngine.spec.ts tests/unit/v19SubmissionRules.spec.ts`: passed, 145 tests.
- `npm run lint`: failed on unrelated dirty/untracked files and existing non-export surfaces; no remaining in-scope export lint error in touched tracked export modules.
- `npx playwright test tests/e2e/app-smoke.spec.ts --project=chromium --grep "Export|Выгрузка|PDF|ZIP"`: failed, 5 tests.
- `npm run dev -- --host 127.0.0.1`: served `http://127.0.0.1:5175/`.
- `curl -I http://127.0.0.1:5175/`: passed, HTTP 200.
- `lsof -a -p 90007 -d cwd`: confirmed server cwd `/Users/user/Documents/V-19`.
- Chromium runtime check: switched to admin, opened `Выгрузка`, saw `Центр выгрузки` and `Пакеты к выгрузке`, console/page errors `[]`.

## 13. Files changed

- `src/App.tsx`
- `src/components/AdminExportScreen.tsx`
- `src/modules/submissions/exportContract.ts`
- `src/modules/submissions/exportMediaZip.ts`
- `src/modules/submissions/exportRules.ts`
- `src/modules/submissions/submissionActions.ts`
- `tests/unit/exportMediaZip.spec.ts`
- `tests/unit/exportWorkbook.spec.ts`
- `tests/unit/v19DomainEngine.spec.ts`
- `tests/unit/v19SubmissionRules.spec.ts`
- `docs/qa/admin-export-roundtrip.md`

## 14. Remaining blockers

- `npm run lint` is blocked by unrelated dirty/untracked code, including `_backup_export_zip_fix`, `ФФФФФФФФ`, `AdminReviewDrawer.tsx`, `CommandCenter.tsx`, `QuestionnaireScreen.tsx`, `FigmaQuestionnaireScreen.tsx`, and `OperationsScreens.tsx`.
- Requested Playwright grep is blocked by existing smoke-test/runtime mismatch: missing legacy admin cards `Нина Волкова`/`Петровы` and missing `.pi-file-input` in the active cockpit create flow.
- Active returned PDF upload surface was not redesigned; only existing domain/service/handoff behavior is covered.

## 15. Accepted risks

- No Supabase schema migration was added.
- The ZIP now embeds XLSX plus media; downstream consumers expecting media-only ZIP names must use the new deterministic export package name.
- Browser e2e proof remains blocked until the active cockpit smoke tests are aligned with current runtime fixtures/selectors.

## 16. Final verdict

EXPORT ROUNDTRIP CLOSED WITH RISK

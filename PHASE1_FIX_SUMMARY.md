# V-19 Phase 1 Fix Summary

## Что исправлено

- Восстановлена TypeScript-согласованность intake/OCR/questionnaire слоя.
- Убран невалидный review source `data_ocr`.
- Добавлен generated `visa_form` как fail-closed export document.
- ZIP export теперь включает реальные бинарные файлы, workbook и 4-страничный PDF визовой анкеты.
- Имена export files приведены к passport-number схеме.
- Admin primary action больше не принимает заявку при открытых issue.
- Same-city mixed trip dates переведены из hard blocker в warning; mixed cities остаются blocker.
- Supabase migration contract дополнен миграцией `20260707001000_document_assets_production_pipeline.sql`.
- V-19 runtime boundary обновлён для promoted workbook core.

## Проверенные gates

| Command | Result |
|---|---:|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS, 5 existing Fast Refresh warnings |
| `npx vitest run tests/unit/documentExport.spec.ts` | PASS, 5/5 |
| `npx playwright test --config=playwright.analysis.no-browser.config.ts` | PASS, 6/6 |
| `npm run verify:v19-boundary` | PASS |
| `npm run verify:auth-data-readiness` | PASS, 160 checks |
| `npm run verify:supabase-release` | PASS, 194 checks |
| `npm run build` | PASS |

## Что ещё не закрыто

Focused domain subset пока не зелёный: 32 failed / 137 passed. Основные оставшиеся группы:

- `exportMediaZip.spec.ts` ожидает старый `fileCount` без generated `visa_form`.
- `exportWorkbook.spec.ts` нужно развести internal canonical row `FAMILY` и Excel workbook serialization `Family`.
- `submissionNextStepEngine` / `v19DomainEngine` / `submissionActionSafety` / `v19SubmissionRules` требуют решения по expected state machine:
  - порядок guard reasons;
  - `questionnaireStatus: needs_fix` vs `partial`;
  - file completeness `100` vs старое ожидание `92`;
  - mixed same-city trip dates warning vs blocker;
  - паспорт из mock fixture vs OCR replacement expectation.

## Важная безопасность

В исходном архиве были `.env.*.local` и другие local-файлы с заполненными значениями. Этот sanitized zip их не включает.
Если исходный zip покидал доверенный контур, ключи нужно ротировать.

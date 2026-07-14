# V-19 Production Pilot — handoff: A2-S1 retry blocked by P1

Дата: 2026-07-14
Рабочая копия: `/Users/user/Documents/V-19`
Ветка: `main`
HEAD: `85350d084 docs: add production pilot handoff`

## Цель

Довести технический single-case `A2-S1` через уже начатый реальный production
flow до нового доказательства Excel + ZIP, без создания новой когорты,
удаления данных или прямых table writes из harness.

Официальный baseline остаётся **78% / NOT READY**. Рабочая оценка до этого
handoff была **87% / NOT READY**. До нового terminal A2-S1 export процент
95% объявлять нельзя.

## Что подтверждено свежим read-only evidence

Ни одной новой production-записи в этом проходе не было.

Команда ниже прошла после явного marker:

```bash
V19_PRODUCTION_COHORT_RUN_MARKER=V19QA-20260711-AUDIT \
V19_PRODUCTION_COHORT_EXPECTED_PHASE=pre_export_a2_s1 \
npm run verify:production-cohort:reconcile
```

Результат: `PASS read-only production cohort reconciliation`.

- 12 technical submissions;
- 27 applicants;
- 2 079 questionnaire answers;
- 81 media и 81 document asset;
- все 81 Storage-object readable;
- terminal: `A1-F6`, `A1-S1` exported;
- target `A2-S1`: `ready_for_excel`, 1 applicant, 3 media, 77 answers,
  document assets `uploaded/passed/ready`.

Ложный `BLOCKED` из ранней попытки reconciliation был только отсутствующим
`V19_PRODUCTION_COHORT_RUN_MARKER`; с корректным marker проверка зелёная.

## Почему retry запрещён сейчас

Независимый review и read-only simulation нашли три P1. Не обходить их ради
процента.

1. **Duplicate durable status history.** После reload durable DB UUID мог
   повторно хешироваться в новом draft payload, а SQL deduplicates только по
   первичному `id`. Это могло создавать новый audit event на повторном save.
   Локальный serializer уже частично исправлен: durable UUID сохраняется как
   есть, non-UUID lifecycle ID по-прежнему хешируется детерминированно.
   Нужны полный gate mirror и regression proof.

2. **False block на повторяющейся history semantics.** У реального A2-S1
   есть 14 typed history rows, но только 5 уникальных semantic keys. Старый
   snapshot matcher использовал set без `id`, поэтому отвергал корректный
   reloaded payload. Локально начата правка, добавляющая ID в snapshot key;
   она ещё не проверена typecheck и реальной read-only simulation.

3. **Недостаточная защита writable nested data.** Текущий gate сверяет
   applicant/media преимущественно по ID и связям, но RPC может перезаписать
   их содержимое и весь `family_intelligence` snapshot. Этот P1 пока
   **не исправлен**. До retry необходимы runtime-only canonical digests для
   всех writable applicant/media/submission fields и strict snapshot baseline
   с явными export-only разрешёнными delta.

## Текущие локальные изменения

Не коммитить и не смешивать с чужим dirty worktree без отдельного review.

- `src/modules/submissions/supabasePersistence.ts`
  - добавлен UUID passthrough для rehydrated typed history;
- `tests/unit/v19SupabasePersistence.spec.ts`
  - добавлена regression-проверка rehydrate -> reserialize сохраняет durable
    UUID;
- `tests/e2e-supabase-ui/production-lifecycle-helpers.ts`
  - начато зеркалирование durable UUID и snapshot history IDs; работа
    незавершена;
- ранее в dirty diff уже есть parameterization A2-S1, shared mutation lock,
  export artifact gate, lifecycle/export preflight и reconcile phases.

## Свежая verification

- `git diff --check` — PASS.
- fresh read-only reconciliation указан выше — PASS.
- до последних частичных P1-правок были зелёными: `npm run typecheck`,
  scoped 34 production-gate tests, `npm run build:supabase-production`.
  Их нельзя считать proof текущего diff.
- после частичных правок:

  ```bash
  npx vitest run tests/unit/v19SupabasePersistence.spec.ts \
    tests/unit/productionCohortNetworkContract.spec.ts
  ```

  дало 65/67 passed. Два existing-looking failure находятся в
  `v19SupabasePersistence.spec.ts` export-batch expectations; новый
  UUID-regression прошёл. Это не даёт green verdict: перед retry обязателен
  повторный focused pass после завершения P1.

## Строгий следующий порядок

1. Доделать P1-3 без production writes:
   - расширить read-only preflight selects до всех writable applicant/media
     полей;
   - добавить canonical content digests в runtime-only contract;
   - привязать root submission и snapshot к baseline;
   - для export разрешить только artifact-bound `exportPackage`, `exportState`
     и неизбежный `updatedAt`; никакие другие snapshot delta не принимать.
2. Завершить P1-1/P1-2:
   - gate должен пропускать existing durable UUID напрямую, а только новую
     transition хешировать;
   - snapshot history сравнивать exact multiset по ID и semantic content;
   - transition counter брать из effective reloaded history, не из сырого
     persisted snapshot.
3. Добавить отрицательные regression tests:
   - изменённый `full_name`/passport field при том же applicant ID;
   - изменённые media name/mime/size/reviewer/timestamp при тех же ID/path;
   - изменённые snapshot applicant/field/file или неизвестный envelope key;
   - duplicate same-semantic durable history rows;
   - raw durable UUID проходит, его rehash — нет.
4. Выполнить: targeted unit tests, `npm run typecheck`,
   `npm run build:supabase-production`, `git diff --check`.
5. Сделать abort-only browser capture реального outgoing A2-S1 export draft:
   contract должен принять request, а route обязан отменить его до отправки.
   Это read-only/abort proof, не production mutation.
6. Получить независимый `RETRY ELIGIBLE` review.
7. Только после этого запускать один разрешённый A2-S1 UI export retry,
   затем terminal readback и reconcile phase `post_export_a2_s1`.

## Запрещено до закрытия P1

- не запускать A2-S1 export retry;
- не повторять A1-S1 export/repair;
- не создавать новую cohort;
- не делать direct SQL/table writes или удаление Storage/data;
- не считать локальные tests доказательством production export;
- не говорить `95%` или `READY`.

## Стартовый prompt для нового чата

> Прочитай полностью `docs/qa/supabase-production-pilot-10/HANDOFF-2026-07-14-P1-RETRY-BLOCK.md` и исходный `HANDOFF-2026-07-14.md`. Продолжай строго с раздела «Строгий следующий порядок». Сначала закрой все три P1 локально и получи fresh independent review. До явного `RETRY ELIGIBLE` не запускай никаких production mutations. Не трогай unrelated dirty files, не создавай новую cohort, не повторяй A1-S1 и не печатай credentials/PII.

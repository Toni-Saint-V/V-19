# Questionnaire save failure loop — Design

## Recon

1. **Repo map**: `App.tsx` загружает/обновляет canonical submissions → `CommandCenter.tsx` выбирает подачу → `QuestionnaireScreen.tsx` адаптирует persistence callbacks → `FigmaQuestionnaireScreen.tsx` владеет локальной revision/autosave/error state.
2. **Critical modules**: `FigmaQuestionnaireScreen.tsx`, `QuestionnaireScreen.tsx`, `App.tsx`, `workspaceRuntime.ts`.
3. **Recent hotspots**: save lifecycle добавлен в `997e65a9`; failure/retry UX расширен в `44f362b9`.
4. **Dependency risks**: React effect dependencies, async save serialization, 10-second Supabase workspace refresh, pending revision preservation.
5. **Testing surface**: `figmaQuestionnaireScreen.spec.tsx`; полный baseline до правки — 1431 passed, 5 skipped, 2 unrelated failures в interaction-evidence checks.
6. **Risky files**: `App.tsx`, Supabase persistence и canonical domain/status modules имеют более широкий release scope и для этого исправления не нужны.
7. **Ownership boundary**: UI save orchestration принадлежит `FigmaQuestionnaireScreen`; persistence result принадлежит `QuestionnaireScreen`/`App`; failed command остаётся fail-closed.
8. **Safe first change**: добавить regression test и заблокировать автоматический retry только для уже отклонённой revision.
9. **Do not touch without broader tests**: polling, backend RPC, questionnaire validation, status machine, CSS/layout.

## Root cause

`FigmaQuestionnaireScreen` оставляет pending updates после rejected save. Autosave
effect зависит от payload identity. При deep-link focus на поле и при очередном
refresh `submission` эта identity меняется, хотя revision и данные пользователя
не менялись. Effect снова ставит таймер; `saveStatus` переключается
`error → saving → error`, поэтому error banner исчезает и появляется снова.

## Alternatives

### A. Блокировать autosave при `saveStatus === "error"`

- Плюс: минимальная проверка.
- Минус: UI status становится неявным источником orchestration; переход
  «Продолжить редактирование» может снова запустить ту же revision без нового ввода.

### B. Запоминать отклонённую revision — выбранный вариант

- Плюс: привязка к фактической единице save serialization, а не к render identity.
- Плюс: explicit Retry может обойти background guard; новая правка естественно
  получает новую revision.
- Минус: требуется аккуратно сбрасывать ref на новой submission и успешном save.

### C. Стабилизировать все payload dependencies

- Плюс: уменьшает лишние effect runs.
- Минус: не гарантирует отсутствие retry при других legitimate parent refresh;
  исправляет один триггер, а не lifecycle invariant.

## Contract

```text
failedAutosaveRevisionRef = revision последнего отклонённого save request

background autosave allowed iff:
  pending updates exist
  persistence callback exists
  navigation/issue resolution не выполняются
  current revision != failedAutosaveRevisionRef

explicit Retry:
  вызывает save напрямую и не зависит от background guard
```

## State transitions

```text
edit r1 → autosave r1 → reject → failedRevision=r1 + stable error
refresh/render at r1 → no request
explicit Retry r1 → one request
edit → r2 → autosave r2 allowed
successful save r2 → failedRevision cleared + pending updates cleared
```

## Files

- `src/modules/submissions/components/FigmaQuestionnaireScreen.tsx`
  - добавить failed revision ref;
  - выставлять его при rejected current revision;
  - блокировать timer/pagehide autosave для той же revision;
  - очищать при submission reset, новой правке и успешном save.
- `tests/unit/figmaQuestionnaireScreen.spec.tsx`
  - воспроизвести focused field + rejected persistence + refreshed submission;
  - доказать отсутствие фоновых повторов;
  - доказать explicit Retry и autosave новой revision.

## Verification

- Красный regression test на текущем `HEAD`.
- Полный `figmaQuestionnaireScreen.spec.tsx`.
- `questionnaireScreen.spec.tsx`.
- `npm run typecheck`.
- Полный unit/integration suite с сравнением только с baseline failures.
- Localhost browser proof при доступном безопасном fixture; отсутствие fixture
  блокирует только browser proof, но не unit-level root-cause verdict.

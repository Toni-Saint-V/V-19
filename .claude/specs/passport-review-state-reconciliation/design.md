# Design: Passport review state reconciliation

## Ownership

- `passportExtractionGuards` остаётся владельцем aggregate passport review gate.
- `passportExtractionBrief` и `submissionNextStepEngine` продолжают потреблять
  guard без UI-specific исключений.
- `identityConsistency` использует тот же applicant-level guard и не содержит
  второго независимого определения завершённой ручной проверки.
- `QuestionnaireScreen` остаётся владельцем записи `verifiedAtIso`; новый путь
  только восстанавливает эквивалентное чтение для persisted legacy/drift state.

## Reconciliation rule

Для applicant со статусом extraction `ready` и извлечёнными полями:

1. Aggregate `verifiedAtIso` или `dismissedAtIso` завершает gate как раньше.
2. Иначе для каждого extracted field проверяется один из двух эквивалентных
   persisted proof paths:
   - questionnaire proof: ключ присутствует в `appliedFieldKeys`, поле сохраняет
     provenance `passport_ocr`, `reviewState: confirmed`,
     `reviewConfirmedAtIso` и `reviewConfirmedBy`;
   - extraction proof: extracted field сохраняет `verified: true`, существует
     соответствующее questionnaire field без validation error, а их
     нормализованные значения совпадают.
3. Reconciliation проходит только если каждый extracted field имеет один из
   этих proof paths.
4. Любое missing, `verified: false`, needs-review или value-mismatch поле
   сохраняет fail-closed поведение.

## Compatibility

- Никаких mutation, side effects или автоматического timestamp.
- Existing conflict/safe-apply priority не меняется.
- Replacement passport invalidation остаётся текущей.
- UI получает корректный next step через существующий engine.
- Проценты `7/7`, `3/3` и `100%` не участвуют в proof decision.

## Production data flow

`QuestionnaireScreen` записывает aggregate timestamp, questionnaire metadata и
per-field `verified`. `supabasePersistence` хранит cockpit snapshot и отдельно
нормализованные questionnaire answers. При reload нормализованный answer может
перекрыть snapshot field без review envelope; per-field extraction proof остаётся
в snapshot и используется только при строгом value match.

Для готового durable `draft` combined UI intent не схлопывается в один database
write. `App` строит два persistence checkpoint:

1. `draft → in_progress` (`filling`) с revision-checked readback;
2. `in_progress → submitted_for_review` (`waiting_review`) с новой revision.

Оба checkpoint выполняются под одним workspace mutation fence. Canonical
refresh запускается только после финального commit, чтобы промежуточный
`in_progress` не перезаписал второй шаг. Для уже сохранённого `in_progress`
остаётся один handoff write.

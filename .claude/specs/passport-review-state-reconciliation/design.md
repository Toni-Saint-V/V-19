# Design: Passport review state reconciliation

## Ownership

- `passportExtractionGuards` остаётся владельцем aggregate passport review gate.
- `passportExtractionBrief` и `submissionNextStepEngine` продолжают потреблять
  guard без UI-specific исключений.
- `QuestionnaireScreen` остаётся владельцем записи `verifiedAtIso`; новый путь
  только восстанавливает эквивалентное чтение для persisted legacy/drift state.

## Reconciliation rule

Для applicant со статусом extraction `ready` и извлечёнными полями:

1. Aggregate `verifiedAtIso` или `dismissedAtIso` завершает gate как раньше.
2. Иначе выбираются questionnaire fields с provenance `passport_ocr`.
3. Reconciliation проходит только если:
   - есть хотя бы одно такое поле;
   - каждый извлечённый ключ присутствует в `appliedFieldKeys`;
   - соответствующее каждому извлечённому ключу questionnaire field сохраняет
     provenance `passport_ocr`;
   - каждое такое поле имеет `reviewState: confirmed`,
     `reviewConfirmedAtIso` и `reviewConfirmedBy`.
4. Любое missing/needs-review поле сохраняет fail-closed поведение.

## Compatibility

- Никаких mutation, side effects или автоматического timestamp.
- Existing conflict/safe-apply priority не меняется.
- Replacement passport invalidation остаётся текущей.
- UI получает корректный next step через существующий engine.

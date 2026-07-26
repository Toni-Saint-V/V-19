# Design: V-19 handoff lifecycle parity

## Ownership

- `status.ts` остаётся единственным владельцем transition matrix,
  `canPerformAction` и подготовки `submit_for_review`.
- `domainEngine.submitForReview` сохраняет legacy command contract для
  `in_progress`, но делегирует разрешённый `ready_for_export` переход в
  `applySubmissionActionResult`.
- `canAgentSubmitForReview` становится тонкой boolean-проекцией того же policy.
- `submitOperationalForReview` остаётся без изменений и подтверждается
  integration-style unit regression.

## Command flow

1. `submitForReview` сохраняет terminal и role guards.
2. Для `ready_for_export` команда сразу вызывает существующий
   `applySubmissionActionResult(..., "submit_for_review", "agent")`.
3. Action-policy проверяет canonical status, role и отсутствие blocking issues.
4. Существующий transition preparation сбрасывает export readiness, возвращает
   accepted/uploaded media в admin review и записывает history.
5. Для `in_progress` остаётся текущий путь с derived completeness,
   required-media и trip-date validation.

## Mutation boundary

Успешный accepted-resubmission может менять только:

- `status`, `exportState` и review-статусы media;
- transition history и служебные transition timestamps.

Applicants, questionnaire fields, issues и `exportPackage` сохраняются. При
ошибке исходный объект и вложенные данные остаются неизменными.

## Compatibility and security

- Действующее исключение для уже принятого legacy-пакета сохраняется без
  повторного запуска старых intake gates.
- Публичные сигнатуры, status union и `DomainError` не меняются.
- Persistence не добавляется: ранее предложенный широкий handoff RLS-path не
  входит в этот slice без изолированной авторизации и исполняемого DB-теста.

## Alternatives

- Дублировать `ready_for_export` preparation в `domainEngine`: отклонено из-за
  риска нового расхождения policy.
- Перевести весь `in_progress` command на action-policy: отклонено, чтобы не
  менять существующие error messages и поведение вне доказанного gap.
- Добавить SQL/RPC: отклонено как отдельная security-sensitive задача.

# Design: V-19 handoff lifecycle parity

## Ownership

- `status.ts` остаётся единственным владельцем transition matrix,
  `canPerformAction` и подготовки `submit_for_review`.
- `domainEngine.submitForReview` требует authenticated `actorId`, проверяет
  ownership и делегирует оба разрешённых исходных статуса в
  `applySubmissionActionResult`.
- Небольшой error adapter сохраняет действующие `in_progress` messages, но не
  содержит собственного transition executor.
- `canAgentSubmitForReview` объединяет ownership с boolean-проекцией того же
  action-policy.
- `submitOperationalForReview` сохраняет operational preflight messages,
  принимает `actorId` и делегирует mutation в `submitForReview`.
- Raw `applySubmissionActionResult(..., "submit_for_review", ...)` сам
  отклоняет missing/foreign actor до content validation; wrapper не является
  единственной security boundary.
- Public `transitionSubmissionStatus`/`transitionSubmissionById` отклоняют
  прямой T2, чтобы caller не мог миновать media/export preparation; только
  private prepared transition вызывается после canonical action guard.
- `QuestionnaireScreen` передаёт в command session-owned `agentId`, а не
  доверяет `submission.agentId` как actor assertion.
- `supabasePersistence.ts` владеет единственной durable projection:
  `submitted_for_review + not_reviewed + uploaded` восстанавливается как
  `pending_review`, а прежняя export package identity остаётся неактивной при
  `exportState: not_ready`.

## Command flow

1. `submitForReview` выполняет terminal, role и owner guards.
2. Для `in_progress` и `ready_for_export` команда вызывает
   `applySubmissionActionResult(..., "submit_for_review", "agent", actorId)`.
3. Raw executor проверяет actor ownership, затем action-policy проверяет
   canonical status, полный T2 package, passport
   review/extraction, trip dates и отсутствие blocking issues.
4. Transition preparation сбрасывает export readiness, возвращает
   accepted/uploaded media в admin review, очищает прежнее решение review и
   записывает authenticated actor в history.
5. После persistence round-trip durable media остаётся `pending_review`, пока
   администратор не примет его заново; loader сохраняет прежнюю package
   identity только как неактивную audit/idempotency identity.

## Mutation boundary

Успешный accepted-resubmission может менять только:

- `status`, `exportState` и review-статусы media;
- transition history и служебные transition timestamps.

Applicant identity, questionnaire fields, issues и `exportPackage`
сохраняются. Канонический transition может детерминированно пересчитать
`completeness` и `applicants[*].fileStatus`; эти два derived поля входят в
разрешённую mutation boundary. При ошибке исходный объект и вложенные данные
остаются неизменными.

## Compatibility and security

- Legacy bypass удаляется: canonical T2 прямо требует полный пакет для обоих
  исходных статусов.
- Внутренние command/helper signatures теперь требуют `actorId`; status union
  и `DomainError` не меняются.
- Меняется только существующая frontend durable projection. Новый handoff
  RLS/RPC path не входит в этот slice без изолированной авторизации и
  исполняемого DB-теста.
- Текущий production trigger запрещает durable
  `ready_for_excel -> waiting_review` и очистку `accepted_at`; поэтому
  production accepted-resubmission остаётся отдельным `BLOCKED` backend-треком.
  Mocked loader round-trip не является доказательством production persistence.

## Alternatives

- Дублировать `ready_for_export` preparation в `domainEngine`: отклонено из-за
  риска нового расхождения policy.
- Оставить отдельный `in_progress` transition body: отклонено как второй
  executor; совместимость messages обеспечивается адаптером ошибок.
- Сохранить legacy bypass для `ready_for_export`: отклонено как противоречащий
  canonical T2 и fail-closed правилам.
- Добавить SQL/RPC: отклонено как отдельная security-sensitive задача.

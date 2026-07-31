# Requirements: V-19 handoff lifecycle parity

## US-1: Повторно отправить принятый пакет на проверку

**As a** VisaFlow agent
**I want** явно вернуть принятый пакет администратору
**So that** `ready_for_export` не становится необратимым состоянием до export.

### Acceptance Criteria (EARS)

1. WHEN agent отправляет пакет со статусом `ready_for_export`, разрешённый
   действующим `submit_for_review` action-policy
   THE SYSTEM SHALL перевести пакет в `submitted_for_review`.
2. WHEN переход завершается успешно
   THE SYSTEM SHALL установить `exportState: not_ready`.
3. WHEN переход завершается успешно
   THE SYSTEM SHALL вернуть файлы со статусом `uploaded` или `accepted` в
   `pending_review`, установить `reviewStatus: not_reviewed` и очистить
   `reviewedAtIso`/`reviewedBy`.
4. WHEN переход завершается успешно
   THE SYSTEM SHALL добавить каноническую history-запись с authenticated
   `actorId`.
5. WHEN persisted `media_assets` повторно загружаются для
   `submitted_for_review`
   THE SYSTEM SHALL восстановить `review_status: not_reviewed` как
   `pending_review`, а не как `accepted` или обычный `uploaded`.
6. WHILE пакет имеет статус `ready_for_export`
   THE SYSTEM SHALL применить те же canonical T2 package-, passport-,
   issue- и trip-date gates, что и для `in_progress`.

## US-2: Сохранить единый policy и fail-closed ошибки

**As a** VisaFlow operator
**I want** command-layer и readiness helper использовать один action-policy
**So that** разрешённость перехода не зависит от выбранного API.

### Acceptance Criteria (EARS)

1. WHEN `canAgentSubmitForReview` оценивает пакет для authenticated agent
   THE SYSTEM SHALL потребовать ownership и положительный результат
   `canPerformAction(submission, "submit_for_review", "agent")`.
2. WHEN `in_progress` пакет отправляется на проверку
   THE SYSTEM SHALL сохранить существующие completeness, required-media и
   trip-date проверки и их typed error messages.
3. WHEN роль, статус или blocking issue запрещают переход
   THE SYSTEM SHALL вернуть существующий typed domain error.
4. WHEN команда завершается ошибкой
   THE SYSTEM SHALL NOT мутировать исходный submission snapshot.
5. WHEN `in_progress` или `ready_for_export` пакет проходит guard
   THE SYSTEM SHALL выполнить подготовку и transition через один
   `applySubmissionActionResult` executor.
6. WHEN authenticated agent не владеет submission
   THE SYSTEM SHALL вернуть `PERMISSION_DENIED` до content-derived validation.
7. WHEN любой caller вызывает canonical `submit_for_review` executor без
   authenticated `actorId` либо с foreign actor
   THE SYSTEM SHALL вернуть `PERMISSION_DENIED` без мутации.
8. WHEN Questionnaire completion инициирует lifecycle command
   THE SYSTEM SHALL использовать session-owned `agentId`, а не owner id из
   изменяемого submission snapshot.
9. WHEN caller пытается выполнить T2 через direct status transition API
   THE SYSTEM SHALL вернуть `INVALID_TRANSITION`; подготовка T2 разрешена
   только owner-aware canonical action executor.

## US-3: Ограничить transition canonical-полями

**As a** VisaFlow maintainer
**I want** повторная отправка менять только transition-owned state
**So that** accepted PII и export identity не переписываются.

### Acceptance Criteria (EARS)

1. WHEN `ready_for_export` пакет возвращается на review
   THE SYSTEM SHALL сохранить applicant identity, questionnaire, issues и
   `exportPackage` без изменений.
2. WHEN transition пересчитывает derived state
   THE SYSTEM MAY обновить только `completeness` и
   `applicants[*].fileStatus` в соответствии с текущим snapshot.
3. THE SYSTEM SHALL NOT вводить новые status values, network API, RPC, SQL,
   migrations, checksum или ZIP contracts.
4. THE SYSTEM SHALL NOT утверждать production persistence без отдельного
   авторизованного RLS/RPC пути и транзакционного доказательства.

## Out of scope

- Visual UI, CSS, responsive behavior и E2E.
- Изменения questionnaire UX кроме bounded session-actor wiring к canonical
  command.
- Supabase schema, RLS, RPC и production deployment.
- Расширение `DomainError` или export package interfaces.

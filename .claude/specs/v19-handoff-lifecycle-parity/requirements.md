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
   `pending_review`.
4. WHEN переход завершается успешно
   THE SYSTEM SHALL добавить каноническую history-запись отправки агентом.
5. WHILE пакет является уже принятым legacy-пакетом
   THE SYSTEM SHALL сохранить действующую совместимость и не открывать повторно
   intake-, passport- и trip-date gates, применяемые к `in_progress`.

## US-2: Сохранить единый policy и fail-closed ошибки

**As a** VisaFlow operator
**I want** command-layer и readiness helper использовать один action-policy
**So that** разрешённость перехода не зависит от выбранного API.

### Acceptance Criteria (EARS)

1. WHEN `canAgentSubmitForReview` оценивает пакет
   THE SYSTEM SHALL вернуть результат канонического
   `canPerformAction(submission, "submit_for_review", "agent")`.
2. WHEN `in_progress` пакет отправляется на проверку
   THE SYSTEM SHALL сохранить существующие completeness, required-media и
   trip-date проверки и их typed error messages.
3. WHEN роль, статус или blocking issue запрещают переход
   THE SYSTEM SHALL вернуть существующий typed domain error.
4. WHEN команда завершается ошибкой
   THE SYSTEM SHALL NOT мутировать исходный submission snapshot.

## US-3: Ограничить transition canonical-полями

**As a** VisaFlow maintainer
**I want** повторная отправка менять только transition-owned state
**So that** accepted PII и export identity не переписываются.

### Acceptance Criteria (EARS)

1. WHEN `ready_for_export` пакет возвращается на review
   THE SYSTEM SHALL сохранить applicants, questionnaire, issues и
   `exportPackage` без изменений.
2. THE SYSTEM SHALL NOT вводить новые status values, API, RPC, SQL, migrations,
   checksum или ZIP contracts.
3. THE SYSTEM SHALL NOT утверждать production persistence без отдельного
   авторизованного RLS/RPC пути и транзакционного доказательства.

## Out of scope

- UI, CSS, browser handlers и responsive behavior.
- Изменение существующего accepted-legacy action-policy.
- Supabase schema, RLS, RPC, persistence и production deployment.
- Расширение `DomainError` или export package interfaces.

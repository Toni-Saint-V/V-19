# Requirements: Passport review state reconciliation

## US-1: Не повторять завершённую проверку паспорта

**As a** VisaFlow agent
**I want** после подтверждения распознанных паспортных полей видеть следующее
реальное действие
**So that** повторный вход в подачу не требует второй раз подтверждать уже
проверенные данные.

### Acceptance Criteria (EARS)

1. WHEN OCR extraction имеет статус `ready`, aggregate `verifiedAtIso` отсутствует
   после reload, а каждое применённое OCR-поле имеет `reviewOriginSource` равный
   `passport_ocr`, `reviewState: confirmed`, `reviewConfirmedAtIso` и
   `reviewConfirmedBy`
   THE SYSTEM SHALL считать OCR-проверку завершённой и не показывать действие
   «Подтвердите ручную проверку паспортных данных».
2. WHEN хотя бы одно применённое OCR-поле не подтверждено
   THE SYSTEM SHALL сохранить `passport_extraction_not_reviewed` и блокировку
   отправки.
3. WHEN extraction содержит конфликтное или ещё не применённое поле
   THE SYSTEM SHALL сохранить существующее действие разрешения конфликта или
   применения безопасного поля.
4. WHEN после production reload aggregate `verifiedAtIso` и questionnaire
   review envelope отсутствуют, но каждый extracted field сохраняет
   `verified: true` и его нормализованное значение совпадает с текущим
   questionnaire field
   THE SYSTEM SHALL считать это сохранённым per-field доказательством проверки,
   убрать повторный passport-review CTA и показать доступное действие
   «Отправить на проверку».
5. WHEN хотя бы один extracted field с `verified: true` расходится с текущим
   questionnaire value
   THE SYSTEM SHALL считать доказательство устаревшим и сохранить блокировку
   отправки.
6. WHEN aggregate passport guard восстановил завершённую проверку из persisted
   proof
   THE SYSTEM SHALL NOT повторно создавать
   `passport_ocr_unverified` через identity-consistency слой.
7. WHEN полностью готовая подача после reload сохраняет durable статус `draft`
   и агент подтверждает отправку
   THE SYSTEM SHALL сначала persist переход `draft → in_progress`, получить
   новую server revision и только затем persist
   `in_progress → submitted_for_review`.

## US-2: Сохранить канонические границы

**As a** VisaFlow operator
**I want** reconciliation использовать только явные review metadata
**So that** заполненность анкеты не выдаётся за проверку паспорта.

### Acceptance Criteria (EARS)

1. WHEN паспортный раздел заполнен на `100%`, но OCR review metadata отсутствует
   THE SYSTEM SHALL не считать это доказательством проверки.
2. WHEN `passport_scan` заменён или OCR-поле снова получает
   `reviewState: needs_review`
   THE SYSTEM SHALL снова требовать проверку.
3. WHEN статус подачи или required media вычисляются
   THE SYSTEM SHALL сохранить canonical domain guards без новых переходов,
   ролей или media aliases.
4. THE SYSTEM SHALL NOT считать `7/7`, `3/3` или `100%` самостоятельным
   доказательством ручной проверки паспорта.

## Out of scope

- Изменение canonical statuses, admin acceptance или export readiness.
- Доверие проценту заполнения как review-сигналу.
- Миграция или автоматическая мутация сохранённых submission records.
- Изменение OCR parsing, API, schema или storage.

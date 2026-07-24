# Questionnaire save failure loop — Requirements

## Context

Агент редактирует анкету, открытую с фокусом на конкретном поле. Если сохранение
черновика отклонено, текущий autosave-effect может повторно запустить ту же
revision после render или периодического refresh подачи. Баннер ошибки при этом
чередуется с состоянием `saving`, меняет высоту рабочей области и создаёт
бесконечный визуальный цикл.

### US-1: Стабильная ошибка сохранения

**As a** агент, заполняющий анкету

**I want** получить устойчивое состояние ошибки после неуспешного сохранения

**So that** форма не дёргается, сервис не получает фоновые дубли и введённые данные остаются доступны

#### Acceptance Criteria (EARS)

1. WHEN сохранение текущей autosave revision отклонено
   THE SYSTEM SHALL показать одну устойчивую ошибку и сохранить несохранённые поля в форме.

2. WHILE текущая revision остаётся неизменной после ошибки
   THE SYSTEM SHALL NOT автоматически повторять сохранение из-за render, смены identity callback или refresh объекта `submission`.

3. WHEN пользователь явно нажимает «Повторить сохранение»
   THE SYSTEM SHALL выполнить ровно одну новую попытку для текущей revision.

4. WHEN пользователь изменяет поле после ошибки
   THE SYSTEM SHALL создать новую revision и снова разрешить обычный autosave.

5. WHEN повторное сохранение завершается успешно
   THE SYSTEM SHALL очистить блокировку failed revision и штатно очистить pending updates.

6. WHEN сохранение завершается ошибкой
   THE SYSTEM SHALL NOT менять canonical submission status, questionnaire data или history.

## Non-functional requirements

- Баннер `role="alert"` остаётся доступным и не перемонтируется фоновым retry-loop.
- Исправление не меняет 900 ms autosave delay для новых правок.
- Исправление не добавляет backend retries, API calls или новые зависимости.

## Out of scope

- Изменение Supabase polling interval.
- Изменение canonical questionnaire validation и status transitions.
- Редизайн error banner или questionnaire layout.
- Deploy, push или production mutation.

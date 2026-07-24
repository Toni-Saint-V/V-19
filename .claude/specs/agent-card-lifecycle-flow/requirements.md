# Agent card lifecycle flow — Requirements

## US-1: Правдивое исправление замечаний

**As a** агент
**I want** исправлять точное замечание и сохранять его подтверждение
**So that** система не показывает исправление отправленным раньше времени

### Acceptance Criteria

1. WHEN агент нажимает «Сохранить исправление»
   THE SYSTEM SHALL проверить точный field/file target и сохранить подтверждение.
2. WHILE остаются неподтверждённые или невалидные замечания
   THE SYSTEM SHALL сохранять статус подачи `returned`.
3. WHEN подтверждено последнее валидное замечание
   THE SYSTEM SHALL одним handoff перевести issues в `fixed_by_agent` и подачу в
   `corrections_received`.
4. THE SYSTEM SHALL NOT сохранять `returned + fixed_by_agent`.

## US-2: Синхронные карточки и Drawer

1. WHEN handoff успешно сохранён
   THE SYSTEM SHALL убрать подачу из открытых «Моих действий».
2. WHEN handoff успешно сохранён
   THE SYSTEM SHALL показать «Исправления получены» в «Моих подачах» и Drawer.
3. WHILE подача ожидает администратора
   THE SYSTEM SHALL показывать в Drawer ожидание проверки, а не повторную отправку.
4. WHEN страница перезагружена
   THE SYSTEM SHALL восстановить status, issues, confirmations и history из
   canonical persistence.

## US-3: Полезные русские ошибки

1. WHEN validation блокирует действие
   THE SYSTEM SHALL назвать конкретное поле/файл и следующий шаг по-русски.
2. WHEN persistence или RPC завершается ошибкой
   THE SYSTEM SHALL сообщить, что статус не изменён, и предложить повторить.
3. WHEN ошибка произошла
   THE SYSTEM SHALL NOT скрывать action-card или показывать success/status handoff.

## Out of scope

- UI redesign, новые lifecycle-статусы, production deploy или применение
  migration к shared/production database.

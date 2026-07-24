# Requirements: Questionnaire mobile footer-first

## US-1: Постоянная мобильная навигация

**As a** VisaFlow agent
**I want** основные действия анкеты всегда видеть в компактном footer
**So that** длинные секции удобно проходить одной рукой без потери контекста.

### Acceptance Criteria (EARS)

1. WHEN анкета открыта при viewport до `767px`
   THE SYSTEM SHALL скрыть screen header и показать footer из previous section,
   Save/Exit, applicant switch и next section.
2. WHEN пользователь находится на первой или последней секции
   THE SYSTEM SHALL отключить недоступную section arrow.
3. WHEN applicant menu открыт
   THE SYSTEM SHALL показать текущие имена, progress и issue state через
   существующий accessible listbox.
4. WHEN footer показан
   THE SYSTEM SHALL оставить scroll-контент неперекрытым и учитывать safe area.

## US-2: Полный сценарий продолжения

**As a** VisaFlow agent
**I want** завершать разделы через большую CTA в конце скролла
**So that** анкета последовательно ведёт по секциям и заявителям.

### Acceptance Criteria (EARS)

1. WHEN существует следующая секция
   THE SYSTEM SHALL открыть её и сфокусировать первое поле.
2. WHEN текущая секция последняя и существует следующий заявитель
   THE SYSTEM SHALL открыть его первую секцию.
3. WHEN текущий заявитель и секция последние
   THE SYSTEM SHALL выполнить существующий safe Save/Exit flow.

## US-3: Отсутствие регрессий

**As a** VisaFlow agent
**I want** текущую логику анкеты сохранить
**So that** мобильная полировка не меняет данные или review workflow.

### Acceptance Criteria (EARS)

1. WHEN desktop viewport равен или шире `768px`
   THE SYSTEM SHALL сохранить текущий header, layout и действия.
2. WHEN используются validation, autosave, retry, issue resolution или
   family-copy
   THE SYSTEM SHALL сохранить текущие handlers, sequencing и ограничения.
3. WHEN анкета рендерится на целевых viewport
   THE SYSTEM SHALL не иметь horizontal overflow, console errors или controls
   меньше 44px.

## Out of scope

- Изменения API, schema, persistence, status contracts или field mappings.
- Изменения `QuestionnaireScreen`, `questionnaireFamilyCopy`,
  `AccessibleSelectMenu`, shared tokens или visual baseline.
- Commit/push до локальной пользовательской приёмки.

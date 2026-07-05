# UX/Product Audit — VisaFlow V-19

## Что работает сильнее всего

1. **Сильный enterprise-визуал** — тёмная палитра, плотные карточки, аккуратные borders, хороший SaaS-feel.
2. **Правильная доменная структура** — пакеты, заявители, документы, замечания, проверка, выгрузка.
3. **Два workspace** — агентская зона и админская зона логически разделены.
4. **Drawer pattern** — правильный выбор для быстрых ревью без потери контекста.
5. **Status-driven UI** — пользователь постоянно понимает состояние пакета.
6. **Хорошая основа под OCR/review workflow** — сверка полей, документы, замечания.

## Что было сломано / рискованно

### 1. Недостающие импорты

**Проблема:** в исходных файлах импортировались компоненты, которых не было среди загруженных файлов:

```txt
QuestionnaireScreen
PreUploadScreen
ReviewWorkspace
RemarkForm
```

**Почему мешало:** проект не мог стать runnable Vite-приложением.

**Исправление:** добавлены недостающие компоненты.

**Приоритет:** critical.

### 2. Нет единой точки входа

**Проблема:** были отдельные экраны, но не было `App.tsx`, который связывает agent/admin зоны.

**Почему мешало:** Codex мог собрать набор разрозненных компонентов вместо продукта.

**Исправление:** добавлен `App.tsx` с workspace switching.

**Приоритет:** critical.

### 3. Inline styles в layout

**Проблема:** местами использовались inline styles для shadow/width.

**Почему мешало:** нарушает правило “CSS через tokens/classes” и усложняет повторяемость.

**Исправление:** заменено на utility classes/mapping.

**Приоритет:** high.

### 4. Dead-end сценарии

**Проблема:** кнопки “Создать пакет”, “Загрузить”, “Сверить с паспортом” могли вести в отсутствующие экраны.

**Почему мешало:** пользователь теряет путь до результата.

**Исправление:** добавлены экраны загрузки, анкеты, сверки, замечаний.

**Приоритет:** critical.

### 5. Много повторяющихся badge/status решений

**Проблема:** статусы реализованы локально в разных файлах.

**Почему мешало:** дальше появятся расхождения в цветах/текстах/логике.

**Исправление сейчас:** не ломал структуру, но зафиксировал в `CODEX_TASK.md`, что нужно вынести reusable UI.

**Приоритет:** high.

## Новый user flow

### Agent flow

```txt
Мои действия
→ Создать пакет
→ Загрузка документов
→ OCR/readiness
→ Анкета
→ Drawer пакета
→ Отправить на проверку
```

### Admin flow

```txt
Очередь проверки
→ AdminReviewDrawer
→ Сверить с паспортом
→ ReviewWorkspace
→ Замечание или OK
→ Завершить проверку
→ Выгрузка
```

## ТОП-10 улучшений с максимальным impact

1. Добавить единый data model для submissions/applicants/documents/issues.
2. Вынести reusable UI-компоненты: badge, tabs, drawer, metric card, progress bar.
3. Подключить реальный API и optimistic state updates.
4. Сделать глобальный command search `⌘K`.
5. Добавить risk score и readiness score на уровне каждого пакета.
6. Добавить timeline/audit trail для админских действий.
7. Добавить bulk export и bulk assignment.
8. Сделать role-based permissions для agent/admin.
9. Добавить валидацию анкеты по стране/типу визы.
10. Добавить mobile sticky CTA для длинных рабочих сценариев.

## Quick wins

1. Унифицировать тексты CTA.
2. Добавить пустые состояния для всех списков.
3. Добавить count badges в tabs.
4. Добавить hotkeys: Escape, Cmd+K, Enter on card.
5. Добавить skeleton на Media/Drafts/Applicants.
6. Добавить фильтр “только рискованные”.
7. Добавить “последнее действие” на карточки пакетов.

## Системные изменения

```txt
src/
  data/
    submissions.ts
    applicants.ts
    documents.ts
    issues.ts
  types/
    submission.ts
    applicant.ts
    document.ts
    issue.ts
  components/
    ui/
      StatusBadge.tsx
      MetricCard.tsx
      SearchInput.tsx
      SegmentedTabs.tsx
      DrawerShell.tsx
      EmptyState.tsx
```

## Build verification

`npm run build` проходит успешно.

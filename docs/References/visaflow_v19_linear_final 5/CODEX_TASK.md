# Codex Task — VisaFlow V-19 Top Product

## Цель

Собрать и поддерживать premium SaaS-интерфейс для визового workflow: агент собирает документы и анкеты, администратор проверяет пакет, сверяет документы/OCR, оставляет замечания и выгружает готовые досье.

Ключевой результат: пользователь должен стабильно доходить до целевого действия:

1. агент: создать пакет → загрузить документы → заполнить/проверить анкету → отправить на проверку;
2. админ: открыть пакет → сверить данные → оставить точные замечания или подтвердить → выгрузить пакет.

## Стек

Использовать:

- React
- TypeScript / TSX
- Vite
- `motion/react`
- `lucide-react`
- существующие utility classes / tokens из проекта

Не использовать без отдельного решения:

- MUI
- Bootstrap
- Ant Design
- random CSS framework поверх текущей системы
- inline styles для layout/цветов/отступов
- hardcoded новые цвета вне существующей палитры
- новые паттерны, которые конфликтуют с текущим dark enterprise UI

## Исходная база

Основные референсы уже перенесены в `src/components/`:

```txt
CommandCenter.tsx          агентская зона, sidebar, список действий
Drawer.tsx                 drawer пакета заявителя
DraftsScreen.tsx           матрица сбора документов
ApplicantsScreen.tsx       семьи и одиночные заявители
MediaScreen.tsx            библиотека файлов
IssuesScreen.tsx           замечания и ошибки
AdminWorkspace.tsx         админская зона
AdminScreens.tsx           очередь проверки
AdminReviewDrawer.tsx      drawer админской проверки
AdminExportScreen.tsx      центр выгрузки
```

Добавленные недостающие экраны:

```txt
PreUploadScreen.tsx        загрузка документов и первичная сборка
QuestionnaireScreen.tsx    полноэкранное редактирование анкеты
ReviewWorkspace.tsx        сверка документа/OCR в админке
RemarkForm.tsx             форма замечания
App.tsx                    переключение агент/админ workspace
```

## Архитектура UX

### Agent workspace

Главный сценарий:

```txt
CommandCenter
→ Создать пакет / Загрузить
→ PreUploadScreen
→ QuestionnaireScreen
→ Drawer
→ Отправить на проверку
```

Левая навигация:

```txt
Мои действия
Сбор документов
Заявители / Семьи
Файлы / Медиа
Замечания
```

Главные CTA:

- `Создать пакет`
- `Загрузить`
- `Открыть`
- `Отправить на проверку`
- `Создать запрос клиенту`

### Admin workspace

Главный сценарий:

```txt
AdminWorkspace
→ Очередь на проверку
→ AdminReviewDrawer
→ ReviewWorkspace
→ RemarkForm / Завершить сверку
→ AdminExportScreen
→ Export ZIP
```

Левая навигация:

```txt
Проверка
Выгрузка
Пользователи
Настройки
```

Главные CTA:

- `Открыть`
- `Подтвердить`
- `Сверить с паспортом`
- `Добавить замечание`
- `Завершить проверку`
- `Скачать ZIP`

## Компонентные правила

### 1. Не ломать visual language

Сохранять текущий стиль:

- dark enterprise UI;
- плотная информационная архитектура;
- rounded-2xl / rounded-xl;
- фоновые слои `#101011`, `#141416`, `#161617`, `#1a1a1d`;
- borders `#202124`, `#242529`, `white/5`, `white/10`;
- primary blue `#3a45b4`, hover `#4855d4`, accent `#8fa3ff`;
- status colors: emerald, orange, red, blue;
- компактная типографика `text-[11px]`, `text-[13px]`, `text-[15px]`, `text-[21px]`;
- focus states через `focus-visible:ring-*`.

### 2. Не писать inline styles

Плохо:

```tsx
<div style={{ width: `${progress}%` }} />
<div style={{ boxShadow: '0 1px 0 rgba(...) inset' }} />
```

Хорошо:

```tsx
<div className="w-[64%] bg-[#3a45b4]" />
<div className="shadow-[inset_0_1px_0_rgba(255,255,255,0.026)]" />
```

Если значение динамическое, использовать mapping:

```tsx
const progressClass = progress === 100 ? 'w-full' : progress === 40 ? 'w-[40%]' : 'w-0';
```

### 3. Состояния должны быть явными

Для каждого workflow-state должен быть визуальный ответ:

```txt
ready / complete        emerald
in_progress / pending   blue / primary
returned / warning      orange
error / critical        red
neutral / draft         white opacity
```

### 4. Все кликабельные карточки должны быть доступны с клавиатуры

Для card-click использовать:

```tsx
tabIndex={0}
onKeyDown={(event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    handler();
  }
}}
```

### 5. Drawer должен быть не декоративным, а action-driven

Drawer обязан иметь:

- понятный title;
- статус пакета;
- вкладки;
- ключевой контент;
- sticky footer с главным действием;
- escape/close behavior;
- mobile bottom-sheet поведение, если уже есть в паттерне.

## Что улучшать дальше

### Critical

1. Перевести mock data в единый data layer.
2. Убрать дубли статусов между `CommandCenter`, `Drawer`, `AdminReviewDrawer`, `AdminExportScreen`.
3. Вынести `StatusBadge`, `ProgressBar`, `MetricCard`, `SearchInput`, `WorkspaceSidebar` в reusable UI.
4. Добавить реальные empty/loading/error states для всех экранов.
5. Подключить API-контракты вместо локальных mock arrays.

### High

1. Унифицировать названия статусов: `returned`, `issues`, `warning`, `error` сейчас местами смешаны.
2. Разделить agent/admin permissions.
3. Добавить command palette для поиска пакетов, заявителей, файлов.
4. Добавить optimistic UI для подтверждения полей и замечаний.
5. Добавить audit trail после каждого действия админа.

### Medium

1. Добавить skeleton states на все вкладки.
2. Добавить bulk actions в Media и Drafts.
3. Добавить фильтры по стране, дедлайну, owner, риску.
4. Добавить mobile CTA bar на длинных экранах.
5. Добавить сохранение последней активной вкладки.

## Проверка качества

Перед финалом обязательно прогнать:

```bash
npm run typecheck
npm run build
```

Проверить вручную:

```txt
[ ] открывается агентская зона
[ ] переключается в админскую зону
[ ] открывается Drawer пакета
[ ] открывается QuestionnaireScreen
[ ] открывается PreUploadScreen
[ ] открывается AdminReviewDrawer
[ ] открывается ReviewWorkspace
[ ] открывается RemarkForm
[ ] работает mobile sidebar
[ ] нет horizontal overflow на mobile
[ ] CTA видны и понятны
[ ] цвета/отступы не выпадают из системы
[ ] нет inline style для layout
[ ] нет новых случайных цветов
```

## Definition of Done

Фича считается готовой, если:

- TypeScript build проходит;
- Vite build проходит;
- пользовательский сценарий не обрывается dead-end экраном;
- все основные действия имеют CTA;
- каждый статус имеет визуальное состояние;
- mobile layout не ломается;
- UI выглядит как единый продукт, а не набор разрозненных экранов.

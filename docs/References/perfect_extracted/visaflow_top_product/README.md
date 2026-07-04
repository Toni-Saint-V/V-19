# VisaFlow V-19 — Top Product React/Vite Build

Готовый Vite-пакет на базе загруженных TSX-референсов.

## Стек

- React
- TypeScript / TSX
- Vite
- motion/react
- lucide-react
- Tailwind utility classes как существующая class/token-система референса

## Что собрано

- Агентская зона: `CommandCenter`
- Админская зона: `AdminWorkspace`
- Переключение workspace в `App.tsx`
- Drawer для пакета заявителя
- Drawer админской проверки
- Экран загрузки документов: `PreUploadScreen.tsx`
- Экран анкеты: `QuestionnaireScreen.tsx`
- Экран сверки паспорта/OCR: `ReviewWorkspace.tsx`
- Форма замечания: `RemarkForm.tsx`
- Документация для Codex: `CODEX_TASK.md`
- UX-аудит и карта улучшений: `docs/UI_AUDIT.md`
- Карта дизайн-системы: `docs/DESIGN_SYSTEM_MAP.md`

## Запуск

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

Проверено: `npm run build` проходит успешно.

## Главные файлы

```txt
src/
  App.tsx
  main.tsx
  index.css
  components/
    CommandCenter.tsx
    AdminWorkspace.tsx
    Drawer.tsx
    AdminReviewDrawer.tsx
    PreUploadScreen.tsx
    QuestionnaireScreen.tsx
    ReviewWorkspace.tsx
    RemarkForm.tsx
    ApplicantsScreen.tsx
    DraftsScreen.tsx
    MediaScreen.tsx
    IssuesScreen.tsx
    AdminExportScreen.tsx
    AdminScreens.tsx
```

## Важное

Исходники были сильными визуально, но не были полноценным runnable Vite-пакетом: отсутствовали несколько импортируемых компонентов. В этом пакете они добавлены, а приложение собрано в единый продуктовый сценарий.

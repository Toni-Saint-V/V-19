# V-19 admin export/new UI logic hotfix

Накатывается поверх проекта из корня репозитория. Архив содержит только изменённые файлы `src/...`.

Что закрывает:

- админская `Проверка` открывает реальную выбранную заявку, а не мок;
- в drawer передаётся `submission`, доступно принять заявку доменным action и перейти в `Выгрузку`;
- экран `Выгрузка` работает с реальными `ready_for_export` submissions;
- `Сформировать Excel` создаёт проверенный workbook artifact;
- `Скачать Excel` скачивает XLSX без повторной логики;
- `Скачать ZIP с Excel` собирает ZIP fail-closed, а в `local-demo` не падает из-за отсутствия Supabase storage;
- ZIP включает deterministic local placeholders для accepted-файлов, если Supabase выключен.

Файлы в архиве:

- `src/components/AdminExportScreen.tsx`
- `src/components/AdminReviewDrawer.tsx`
- `src/components/AdminScreens.tsx`
- `src/components/AdminWorkspace.tsx`
- `src/modules/submissions/exportMediaZip.ts`
- `src/modules/submissions/exportWorkbook.ts`

Перед накатыванием желательно сохранить текущие изменения, если рабочее дерево грязное.

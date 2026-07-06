# V-19 Premium Product Upgrade

## Цель

Усилить текущий `src` как submission-first document orchestration system: более цельный premium UI, безопасная загрузка документов, устойчивое чтение PDF анкет, более полезная ZIP/Excel выгрузка и переиспользуемый sidebar navigation button.

## Основные изменения

### UI / UX

- Добавлен переиспользуемый `SideMenuButton`.
- Боковая навигация переведена на единый компонент с active/compact/badge/shortcut/focus states.
- Добавлен premium CSS convergence layer для cards, export cockpit, review surfaces, sidebar и motion.
- Добавлены reduced-motion правила.
- Export cockpit показывает готовность документов как required slots, а не просто количество записей файлов.

### Upload / PDF

- Добавлен `documentIntake.ts` с едиными guard-правилами.
- Загрузка паспортов, селфи и PDF анкет валидируется до локальной/удалённой обработки.
- Ошибки загрузки теперь безопасные и пользовательские: пустой файл, неверный тип, превышение лимита.
- PDF extraction дополнен fail-closed проверками: type/size/empty, encrypted/password, corrupt/invalid, no-readable-text.
- PDF text layer нормализуется до стабильного текста; OCR fallback остаётся локальным.

### Export / ZIP

- ZIP теперь формируется как пакет, а не как плоское приложение к Excel.
- Структура: `00_Excel/`, `city/family|single/submission/applicant_XX/`.
- `manifest.json` создаётся на корне, у submission и у applicant.
- `issues.json` создаётся на корне и у каждого submission.
- Отсутствующие исходники получают `__MISSING__/*.txt` с диагностикой.
- Если файл есть в локальной browser-сессии, он попадает в ZIP напрямую.
- Если файл сохранён в Supabase private storage, ZIP пытается получить его через signed URL и вложить реальный Blob.
- Если signed URL/Blob недоступен, пакет не ломается: создаётся `__MISSING__` placeholder.

## Проверка

В рабочей среде без `package.json` и `node_modules` выполнена syntax-level TypeScript проверка изменённого `src`:

```bash
tsc --noEmit --noCheck --skipLibCheck --jsx react-jsx --module ESNext --target ES2022 --moduleResolution Bundler --allowSyntheticDefaultImports --esModuleInterop $(find src -name '*.ts' -o -name '*.tsx')
```

Результат: passed.

После распаковки в полный репозиторий нужно выполнить:

```bash
npm ci
node scripts/verify-v19-premium-upgrade.mjs
npm run typecheck
npm run lint
npm run build
```

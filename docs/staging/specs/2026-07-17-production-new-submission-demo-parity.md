# Production «Новая подача» в стиле demo

## WORKFLOW STATE

- Package Manager: npm (via `package-lock.json`)
- Framework: React 19 + Vite 8
- Phase: implementation approved by user
- Source truth: local-demo `src/components/PreUploadScreen.tsx`
- Production target: `src/modules/submissions/components/CreateSubmissionDrawer.tsx`
- Production entry: `CommandCenter -> CreateSubmissionDrawer` when `usesSupabase=true`
- Verification: Chrome at 320x740, 390x844, 430x932, 768x1024 and 1440x900

## Decisions

contract: production продолжает создавать canonical `Submission` через текущие `CreateSubmissionDrawer` props, `onCreate`, passport upload, storage, OCR и `openQuestionnaire`; demo data model в production не переносится.

contract: визуальная композиция берётся из demo `PreUploadScreen`: полноэкранный тёмный dialog, header 64 px, компактный package switch, спокойная control-панель, крупная синяя upload-zone, desktop rail с распознанными данными и нижняя action-зона.

contract: обязательные production-поля, которых нет в demo, остаются: город подачи, количество членов семьи, паспорт каждого заявителя и семейные общие данные. Они встраиваются в demo-композицию без отдельной card-in-card и без изменения canonical payload.

invariant: `single` и `family`, список городов, family count, passport file acceptance, OCR states, retries, draft creation, error handling и переход в анкету сохраняют текущую семантику.

invariant: screen не загружает селфи при создании подачи; селфи 1 и селфи 2 остаются в последующем сборе документов согласно canonical package contract.

invariant: raw visual values из demo сначала оформляются tokens в `src/shared/ui/visual-baseline.css`; production screen rules используют `var(...)`.

mobile-layout: header 64 px; inset 16–20 px; одна колонка; package switch и обязательные controls видимы до upload-zone; upload-zone не уже 288 px и не создаёт горизонтальный scroll; footer не перекрывает последний контент.

desktop-layout: центральная рабочая поверхность и rail распознанных данных повторяют demo-пропорции; основной upload workflow получает приоритет, secondary OCR detail остаётся справа.

states: empty, drag-active, uploading, OCR, needs-review, ready, create-error и disabled CTA используют одну геометрию без скачков layout.

accessibility: сохраняются dialog semantics, focus trap/return, Escape close, visible focus, drag-and-drop keyboard fallback, labels и live status.

copy: «Новая подача», «Семья», «Один», «Город подачи», «Сохранить черновик», «Создать и открыть анкету» остаются едиными терминами.

copy: upload title динамический — «Перетащите паспорт сюда» для одиночной подачи и «Перетащите паспорта сюда» для семьи.

copy: format hint — «JPEG, PNG, HEIC, HEIF или PDF. После загрузки распознаем данные и подготовим анкету».

copy: технические `upload`, `prefill`, `mapping`, `ITEMS`, `0 OCR` и смешанный язык не показываются пользователю; rail называется «Данные из паспорта» / «Данные из паспортов», counter — «N полей».

copy: blocker/error всегда содержит действие: «Загрузите паспорт, чтобы продолжить» или «Загрузите паспорта всех заявителей».

test: current production creation callbacks и focused unit/integration tests проходят без изменения payload.

test: Chrome proof после последней правки подтверждает `scrollWidth <= innerWidth`, mobile header ratio <= 0.15, minimum 16 px inset, доступность primary CTA, переключение `Семья/Один`, город, family count, empty/error states и отсутствие console errors.

## Approaches considered

1. Recommended — перенести demo shell и композицию в `CreateSubmissionDrawer`, оставив production handlers и data flow. Даёт максимальную визуальную близость при минимальном риске для Supabase/OCR.
2. Перевести production route напрямую на `PreUploadScreen` и написать adapter в canonical submission pipeline. Внешне ближе к demo, но заметно выше риск потери city/family/storage/error contracts.
3. Только CSS поверх текущего markup. Быстрее, но не воспроизводит demo hierarchy, desktop rail и responsive behavior; отклонено для требования 1:1.

## Working notes

- Runtime demo mobile evidence at 390x844: header 64 px, no horizontal overflow, upload-zone x=20, width=350, height≈375, radius 24 px, padding 24 px.
- Runtime demo desktop evidence: header 64 px; main grid with primary surface and 390 px rail; upload-zone dashed accent border, 24 px radius.
- Current production browser comment shows the heavier structure/card, confirming the selected production surface is not visually aligned with demo.
- Product Design saved context is absent; the user-selected demo screen and current repository are sufficient source truth.
- Implementation starts only after explicit approval of approach 1, per Praxis gate.

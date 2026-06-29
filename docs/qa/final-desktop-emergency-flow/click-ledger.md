# Final Desktop Emergency Flow Click Ledger

Runtime: `http://127.0.0.1:5173/`, `local/dev auth`, desktop only.

## Agent

- `Мои действия`: opened at 1440x960, action rows visible, no horizontal overflow.
- `Мои подачи`: opened at 1440x960, shows `Семейные подачи` and `Индивидуальные подачи` in the first desktop viewport.
- Search/filter controls: visible as compact toolbar controls; list remains readable.
- Submission row: opens shared `SubmissionDrawer`.
- Drawer close: works through `Закрыть`.
- `Новая подача`: opens `CreateSubmissionDrawer`.
- Create type toggle `Заявитель`: visible and active by default.
- Create type toggle `Семья`: works and shows family applicants.
- Create without passport: `Сохранить черновик` and `Дальше` remain disabled; no fake OCR/upload/storage claim.
- Dirty create close: confirmation appears; `Закрыть без сохранения` works.
- Admin remark visibility: same local/dev runtime shows the admin remark in agent list context and drawer.

## Admin

- `Работа`: opens review queue.
- Review row: opens admin review drawer.
- Admin drawer tabs: `Паспорт`, `Селфи`, `Анкета`, `Замечания` are clickable surfaces.
- Unsupported passport accept: button is disabled with existing handler boundary.
- Remark composer: opens from `Вернуть с замечанием` / `Замечание`.
- Remark submit: filled reason and agent comment create a visible issue.
- Drawer close: works.
- `Выгрузка`: opens export workspace.
- Export selection: selected package drives preview and action dock.
- `Сформировать Эксель`: works for selected ready package.
- `Скачать Excel`: works after generation; downloaded `visaflow-export-0mwe8ei.xlsx`.
- `Отметить выгружено`: remains disabled until download, then becomes available.

## Console And Overflow

- Console errors: none observed in the Playwright proof run.
- Console warnings: none observed in the Playwright proof run.
- Horizontal overflow: none at 1440x960 or 1280x900 for checked desktop surfaces.

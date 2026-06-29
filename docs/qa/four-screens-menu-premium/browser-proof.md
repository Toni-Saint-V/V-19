# Four Screens + Navigation Browser Proof

Final proof package: `docs/qa/four-screens-menu-premium/final/`

## Viewports

- Desktop: 1440, 1024.
- Tablet: 768.
- Mobile: 430, 390, 375, 320.

## Screens

- `Мои действия`
- `Мои подачи`
- `Выгрузка`
- `Проверка`
- Desktop side menu
- Mobile menu for agent/admin/export
- Admin review drawer tabs: `Паспорт`, `Селфи`, `Анкета`, `Замечания`

## Automated Browser Result

- Final screenshots: 61.
- Console errors/warnings: 0 relevant events.
- OverflowX: 0 for final captured scoped states.
- Dialog proof: admin review drawer present and fitting for captured drawer states.
- Admin remarks proof: `Добавить замечание` is visible in the empty `Замечания` tab.

## Interaction Proof

- Agent mobile menu opened and closed.
- Export mobile menu opened and closed.
- Export row action `Смотреть пакет` was visible and clicked.
- Admin review `Добавить замечание` affordance was visible in final drawer proof.
- Admin `Исправления` tab was reachable.

Machine-readable proof: `docs/qa/four-screens-menu-premium/final/browser-proof.json`

# Four Screens + Navigation Premium Mismatch Ledger

Reference source: current best implementation in this checkout, Agent Flow patterns, current live baseline screenshots, and prompt acceptance criteria. Figma is unavailable and not used.

Baseline package: `docs/qa/four-screens-menu-premium/baseline/`

## P0 blockers

- None found in baseline browser proof.
- Console: no relevant errors.
- Document overflowX: 0 for captured scoped screens/menu at 1440, 1024, 768, 430, 390, 375, 320.

## P1 blockers

- Admin / Проверка:
  - Reference: screen should be a compact review workflow named `Проверка`.
  - Live: primary admin route is still named `Работа`, and local/dev access queue consumes the first viewport before the review queue.
  - Likely files: `src/App.tsx`, `src/styles.css`.
  - Fix: rename admin primary surface label/copy to `Проверка`; keep auth logic unchanged but make local/dev access queue compact/non-dominant on scoped operational surfaces.

- Admin / Проверка mobile:
  - Reference: action and status must be readable and not overlap.
  - Live: review card CTA `Проверить` overlaps the `100%` readiness pill on 390px.
  - Likely files: `src/styles.css`.
  - Fix: stack/wrap admin action row footer on narrow screens and give the CTA its own row.

- Admin / Выгрузка mobile:
  - Reference: no squeezed desktop table on mobile; export action reachable and blocker reasons readable.
  - Live: export queue remains table-shaped on 390px, with cramped columns and truncated headers.
  - Likely files: `src/styles.css`.
  - Fix: mobile-only card presentation for `.export-row` while preserving existing buttons/selection/export handlers.

- Mobile menu:
  - Reference: menu opens/closes reliably and close is reachable.
  - Live: menu opens, but no explicit close control exists inside the sheet.
  - Likely files: `src/modules/submissions/components/OperationalNavigation.tsx`, `src/App.tsx`, `src/styles.css`.
  - Fix: add optional close action to `OperationalSidebar` and show a touch-friendly close button in mobile sheet.

## P2 mismatches

- Agent / Мои действия mobile:
  - Live: filter icon button is visually heavy; bottom tab bar crowds the last visible card.
  - Fix or accept: tune mobile toolbar/button density if touched by shared CSS.

- Agent / Мои подачи desktop:
  - Live: single active row leaves a large empty content area at 1440.
  - Fix or accept: acceptable for filtered data state; do not invent fake data or change filtering.

- Export desktop:
  - Live: local/dev access queue appears below export content and reads like an unrelated panel.
  - Fix: same compact/non-dominant auth queue presentation as admin review, UI only.

- Sidebar desktop:
  - Live: visually consistent and active state clear; no blocker.
  - Fix or accept: keep.

## Responsive blockers

- 320/375/390/430/768:
  - Baseline overflowX is 0 across scoped screens/menu.
  - Main responsive blockers are usability/visual, not document overflow.

## Cycle 1 notes

- Fixed admin primary label from `Работа` to `Проверка`.
- Added explicit mobile menu close control.
- Added mobile menu access on `Выгрузка`.
- Converted mobile export queue away from squeezed table toward card rows.
- Fixed mobile admin review row CTA/readiness overlap.
- Remaining after cycle 1:
  - Empty local/dev access queue still competed with `Проверка` and `Выгрузка`.
  - Admin/export mobile topbar needed tighter framing.
  - Export mobile cards were readable but too tall.

## Cycle 2 notes

- Hid only empty local/dev access queue on scoped admin/export operational surfaces; auth logic unchanged.
- Normalized admin/export mobile topbar framing.
- Tightened mobile export card spacing.
- Added stable final drawer proof with explicit waits for `Паспорт`, `Селфи`, `Анкета`, `Замечания`.
- Final browser proof:
  - `docs/qa/four-screens-menu-premium/final/browser-proof.json`
  - 61 final screenshots.
  - Console: no relevant errors.
  - OverflowX: 0 across final captured scoped screens/menu/drawer states.
  - Interactions: agent menu open/close, export menu open/close, export row action visible/clicked, admin corrections tab.

## Remaining P2 / accepted limitations

- `Проверка` desktop has one visible queue item in the demo data, so the lower workspace is sparse. No fake data was added.
- `Выгрузка` mobile card rows are intentionally taller than the old table because the required export facts stay readable and actions remain reachable.

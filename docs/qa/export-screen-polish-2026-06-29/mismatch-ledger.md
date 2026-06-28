# Export Screen Mobile/Layout QA Ledger

## Scope

- Surface: `surface-export`
- Screen: `Выгрузка`
- Runtime: `http://127.0.0.1:5177/`
- Change type: responsive layout geometry only.

## Baseline Findings

### Critical

- On 320-430px, the export grid stayed as `1fr + 360px`, which compressed the queue/table area down to 0-52px and let the contract rail dominate the screen.
- On mobile, the ready table visually overlapped the rail and made the screen difficult to use.

### Important

- On 768px tablet, the screen still used the narrow content column beside the rail instead of a single-column flow.
- The table wrapper expanded to 760px and pushed against the layout instead of scrolling inside its own container.

### Polish

- Desktop layout was stable and was intentionally preserved.

## Fix Applied

- Added scoped CSS only under `surface-export`.
- At `max-width: 1120px`, export uses a single-column flow:
  - queue/list first;
  - contract rail second;
  - both constrained to the viewport width.
- At mobile widths, the table stays inside an internal scroll wrapper instead of stretching the body/page.
- No export rules, Excel contract, statuses, handlers, auth, storage, or domain logic changed.

## Final Proof

- `final2-desktop1440-export.png`
- `final2-tablet768-export.png`
- `final2-mobile430-export.png`
- `final2-mobile390-export.png`
- `final2-mobile375-export.png`
- `final2-mobile320-export.png`
- `final2-results.json`

## Final Metrics

- Console errors: none in Playwright proof.
- Body horizontal overflow: `0` at 1440, 768, 430, 390, 375, 320.
- Tablet grid: one column.
- Mobile grid: one column.
- Export table: internal horizontal scroll only.

## Deviations / Risks

- The Excel preview remains a masked preview and does not prove real workbook generation in this UI-polish pass.
- Product export behavior stays fail-closed and was not changed.

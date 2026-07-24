# Tasks

### T-1: Упростить содержимое строки

- **Status**: completed
- **Wired**: yes
- **Verified**: yes
- **Requirements**: US-1
- **Description**: оставить ID + имя/фамилию, даты, город и агента; убрать вторичное row metadata.
- **Acceptance**: DOM содержит четыре смысловых поля в заданном порядке.
- **Dependencies**: none

### T-2: Выровнять desktop/mobile композицию

- **Status**: completed
- **Wired**: yes
- **Verified**: yes
- **Requirements**: US-1
- **Description**: общий icon-rail, desktop grid и mobile facts grid.
- **Acceptance**: одинаковый размер/выравнивание иконок, нет horizontal overflow.
- **Dependencies**: T-1

### T-3: Проверить изменение

- **Status**: completed
- **Wired**: n/a
- **Verified**: yes
- **Requirements**: US-1
- **Description**: focused unit, typecheck, lint, local-demo build, desktop/mobile browser proof.
- **Acceptance**: все проверки проходят или blockers перечислены.
- **Dependencies**: T-1, T-2

## WORKFLOW STATE

Package Manager: npm (via package-lock.json)
Framework: React 19 + Vite (via package.json and vite.config.ts)
Verification: npm run typecheck, npm run lint, npm run build:local-demo, focused unit test, localhost desktop/mobile proof

## Verification Results

- **Typecheck:** `npm run typecheck` — PASSED
- **Focused unit:** `npx vitest run tests/unit/activeAdminExportScreen.spec.tsx` — PASSED, 6/6
- **Scoped lint:** changed TSX and test — PASSED
- **Repository lint excluding foreign untracked workspaces:** PASSED with 0 errors and 2 pre-existing warnings
- **Project lint:** `npm run lint` — BLOCKED by generated files under untracked `.codex-ship-0a166295/` (15,679 errors); directory preserved unchanged
- **Build:** `npm run build:local-demo` — PASSED
- **Browser desktop:** 1440×1000 — PASSED; 0 overflow, 0 browser errors, four 24×24 icon rails with 14×14 icons
- **Browser mobile:** 390×844 — PASSED; 0 overflow, 0 browser errors, four 24×24 icon rails with 14×14 icons

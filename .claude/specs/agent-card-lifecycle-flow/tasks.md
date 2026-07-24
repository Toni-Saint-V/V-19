# Agent card lifecycle flow — Tasks

## WORKFLOW STATE

- **Status**: Completed
- **Package Manager**: npm (via `package-lock.json`)
- **Framework**: React + Vite (via `vite.config.ts` and `react`)
- **Target**: close staff-review and bank-grade lifecycle findings
- **Source of truth**: `docs/release/canonical-domain-contract.md` T5
- **Verification**: RED/GREEN focused tests, full unit/integration suite,
  typecheck, scoped/full lint, local-demo build, migration contracts, final
  independent reviews
- **Out of scope**: unrelated dirty WIP, remote migration apply, deploy, commit,
  push

### T-1: Добавить confirmation domain contract

- **Status**: completed
- **Wired**: yes
- **Verified**: yes
- **Requirements**: US-1, US-3
- **Acceptance**: multi-issue и invalid-target unit tests проходят.
- **Dependencies**: none

### T-2: Подключить анкету и file replacement

- **Status**: completed
- **Wired**: yes
- **Verified**: yes
- **Requirements**: US-1, US-2, US-3
- **Acceptance**: последнее подтверждение автоматически создаёт handoff.
- **Dependencies**: T-1

### T-3: Синхронизировать Drawer и очереди

- **Status**: completed
- **Wired**: yes
- **Verified**: yes
- **Requirements**: US-2, US-3
- **Acceptance**: подсказки/CTA/status соответствуют canonical snapshot.
- **Dependencies**: T-1, T-2

### T-4: Сохранить confirmation в Supabase

- **Status**: completed
- **Wired**: yes
- **Verified**: yes
- **Requirements**: US-1, US-2
- **Acceptance**: payload, migration contract и reload readback проходят.
- **Dependencies**: T-1

### T-5: Проверить полный flow

- **Status**: completed
- **Wired**: n/a
- **Verified**: yes
- **Requirements**: US-1, US-2, US-3
- **Acceptance**: 144 файла / 1446 тестов прошли, local-demo build и scoped
  lint прошли; localhost browser proof подтвердил карточки, Drawer, русские
  подсказки и отсутствие console errors. Применение миграции и readback в
  удалённой Supabase остаются release-блокером до отдельного разрешения.
- **Dependencies**: T-2, T-3, T-4

### T-6: Закрыть findings финального review

- **Status**: completed
- **Wired**: yes
- **Verified**: yes
- **Requirements**: US-1, US-2, US-3
- **Acceptance**: invalid target/package/partial RPC/concurrency/revert/JSON
  ordering/timestamp/Russian error scenarios fail closed. Дополнительно
  проверены terminal audit immutability, второй correction cycle, потерянный
  RPC response с competing-tab target, безопасные forward/rollback ordering и
  canonical `VF-*` text IDs. Финальный gate: 144 test files / 1461 passed /
  5 skipped, typecheck, scoped lint, 285 migration checks, production-mode
  build и два независимых review verdict `PASS`.
- **Dependencies**: T-5

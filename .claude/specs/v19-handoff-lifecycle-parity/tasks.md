# Tasks: V-19 handoff lifecycle parity

### T-1: Зафиксировать lifecycle contract

- **Status**: completed
- **Wired**: n/a
- **Verified**: yes
- **Requirements**: US-1, US-2, US-3
- **Description**: Описать EARS requirements, actor/ownership, policy
  ownership, derived mutation boundary и durable media projection.
- **Acceptance**: Requirements и design не вводят новые status/network API/RLS
  контракты и следуют canonical T2.
- **Dependencies**: none

### T-2: Выровнять command и readiness helper

- **Status**: completed
- **Wired**: n/a
- **Verified**: yes
- **Requirements**: US-1, US-2, US-3
- **Description**: Делегировать оба submit path существующему action-policy,
  потребовать actor ownership в raw executor и session caller, сбросить
  durable media review metadata.
- **Acceptance**: Полный `ready_for_export -> submitted_for_review` работает
  через единый command-layer; incomplete/foreign snapshots fail closed;
  `in_progress` typed messages сохраняются.
- **Dependencies**: T-1

### T-3: Добавить regression coverage

- **Status**: completed
- **Wired**: n/a
- **Verified**: yes
- **Requirements**: US-1, US-2, US-3
- **Description**: Проверить успешный transition, actor history, ownership,
  запрет direct T2 bypass, session-vs-snapshot caller, derived mutation
  boundary, immutable failures, operational delegation и полный mocked durable
  loader round-trip.
- **Acceptance**: Focused unit specs проходят, включая blocking role/status
  cases.
- **Dependencies**: T-2

### T-4: Выполнить release verification

- **Status**: completed
- **Wired**: n/a
- **Verified**: yes
- **Requirements**: US-1, US-2, US-3
- **Description**: Запустить typecheck, non-UI tests, boundary/safety gates,
  scoped lint, full gate и localhost browser smoke.
- **Acceptance**: Scoped checks имеют verdict `PASS`; pre-existing unrelated
  blocker отделён от новых regressions.
- **Dependencies**: T-2, T-3
- **Notes**: Fresh fix-pass: changed-test pack `318/318`, focused
  lifecycle/persistence/ownership pack `102/102`, non-UI business logic `1062/1062`,
  typecheck, scoped ESLint, V-19 boundary (`73` runtime files), safety,
  Supabase release (`279` checks), local-demo build и `git diff --check`
  прошли. После полного cold restart Browser и изолированный Chrome DevTools
  загрузили свежий `status-BfWGcZYh.js`; все `16` first-party requests вернули
  HTTP `200`, console errors/warnings отсутствовали на desktop/mobile.
  Независимый staff correctness review вернул `PASS`. Repository-wide
  `verify:business-logic` остаётся `BLOCKED` только прежним out-of-scope
  auth-readiness check `inviteUserByEmail`; current production trigger также
  не разрешает accepted-resubmission write. Production RLS/RPC persistence
  этим mocked/local proof не заявляется и требует отдельного backend-трека.

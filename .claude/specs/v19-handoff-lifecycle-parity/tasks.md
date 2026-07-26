# Tasks: V-19 handoff lifecycle parity

### T-1: Зафиксировать lifecycle contract

- **Status**: completed
- **Wired**: n/a
- **Verified**: yes
- **Requirements**: US-1, US-2, US-3
- **Description**: Описать EARS requirements, policy ownership, mutation
  boundary и persistence exclusion.
- **Acceptance**: Requirements и design не вводят новые status/API/RLS
  контракты.
- **Dependencies**: none

### T-2: Выровнять command и readiness helper

- **Status**: completed
- **Wired**: n/a
- **Verified**: yes
- **Requirements**: US-1, US-2, US-3
- **Description**: Делегировать accepted-resubmission существующему
  action-policy и вывести boolean readiness из того же guard.
- **Acceptance**: `ready_for_export -> submitted_for_review` работает через
  command-layer; `in_progress` behavior остаётся прежним.
- **Dependencies**: T-1

### T-3: Добавить regression coverage

- **Status**: completed
- **Wired**: n/a
- **Verified**: yes
- **Requirements**: US-1, US-2, US-3
- **Description**: Проверить успешный transition, exact mutation boundary,
  immutable failures и operational delegation.
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
- **Notes**: `typecheck`, 1057 non-UI tests, boundary, safety, build,
  Browser/Chrome localhost smoke и diff checks прошли. Full gate остаётся
  `BLOCKED` только прежним auth-readiness check `inviteUserByEmail`.

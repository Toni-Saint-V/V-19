# Tasks: Questionnaire mobile footer-first

### T-1: Добавить footer-first composition

- **Status**: complete
- **Wired**: yes
- **Verified**: yes
- **Requirements**: US-1, US-2
- **Description**: Добавить общий section navigation helper, четыре footer
  actions и scoped mobile layout.
- **Acceptance**: Footer не overlay, arrows section-only, CTA сохраняет полный
  continue flow.
- **Dependencies**: none

### T-2: Закрепить regression contracts

- **Status**: complete
- **Wired**: n/a
- **Verified**: yes
- **Requirements**: US-1, US-2, US-3
- **Description**: Обновить unit и questionnaire E2E под mobile footer и
  desktop parity.
- **Acceptance**: Все целевые состояния и viewports покрыты проверками.
- **Dependencies**: T-1

### T-3: Проверить и передать локальный runtime

- **Status**: complete
- **Wired**: n/a
- **Verified**: yes
- **Requirements**: US-3
- **Description**: Запустить verification ladder, сохранить evidence вне repo и
  поднять preview для пользовательской приёмки.
- **Acceptance**: Verdict PASS; commit/push не выполнены до одобрения.
- **Dependencies**: T-2

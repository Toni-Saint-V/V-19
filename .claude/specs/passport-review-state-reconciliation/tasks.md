# Tasks: Passport review state reconciliation

### T-1: Закрепить reconciliation contract тестами

- **Status**: complete
- **Wired**: yes
- **Verified**: yes
- **Requirements**: US-1, US-2
- **Description**: Добавить positive и fail-closed regression cases для
  aggregate passport review gate и next-step brief.
- **Acceptance**: Confirmed persisted OCR fields убирают повторный review CTA;
  partial confirmation остаётся blocked.
- **Dependencies**: none

### T-2: Реализовать read-only reconciliation

- **Status**: complete
- **Wired**: yes
- **Verified**: yes
- **Requirements**: US-1, US-2
- **Description**: Централизовать derived review completion в
  `passportExtractionGuards`.
- **Acceptance**: Guard, brief и next-step engine используют единый результат.
- **Dependencies**: T-1

### T-3: Проверить questionnaire navigation и release gate

- **Status**: complete
- **Wired**: n/a
- **Verified**: yes
- **Requirements**: US-1, US-2
- **Description**: Проверить applicant menu, last-section CTA, desktop/mobile,
  focused tests, typecheck/build и scoped release diff.
- **Acceptance**: PASS перед commit, push и production deploy.
- **Dependencies**: T-1, T-2

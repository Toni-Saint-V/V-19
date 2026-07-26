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

### T-4: Воспроизвести production drift VF-1072

- **Status**: complete
- **Wired**: n/a
- **Verified**: yes
- **Requirements**: US-1, US-2
- **Description**: Закрепить fixture, где `7/7` и `3/3` готовы, aggregate и
  questionnaire envelope потеряны при reload, но per-field extraction proof
  сохранён.
- **Acceptance**: До исправления fixture показывает повторный passport-review
  CTA; после исправления Drawer показывает «Отправить на проверку».
- **Dependencies**: T-3

### T-5: Расширить read-only reconciliation

- **Status**: complete
- **Wired**: yes
- **Verified**: yes
- **Requirements**: US-1, US-2
- **Description**: Принять per-field `verified` только при точном normalized
  value match с questionnaire field и подключить identity-consistency к тому же
  applicant-level guard, не ослабляя остальные passport guards.
- **Acceptance**: Matching proof разрешает submit; missing/false/mismatch proof
  остаётся blocked.
- **Dependencies**: T-4

### T-6: Проверить Drawer и lifecycle handoff

- **Status**: complete
- **Wired**: n/a
- **Verified**: yes
- **Requirements**: US-1, US-2
- **Description**: Прогнать guard, next-step, Drawer и submit-for-review
  focused suites на production-equivalent файлах.
- **Acceptance**: Повторный CTA отсутствует, кнопка отправки доступна, а
  fail-closed cases и canonical transition продолжают проходить.
- **Dependencies**: T-5

### T-7: Воспроизвести durable draft permission failure

- **Status**: complete
- **Wired**: n/a
- **Verified**: yes
- **Requirements**: US-1, US-2
- **Description**: Закрепить production-состояние, где готовая VF-1072 после
  reload имеет статус `draft`, а combined submit пытается одним write перейти в
  review.
- **Acceptance**: Тест явно показывает persisted checkpoints `filling`, затем
  `waiting_review`.
- **Dependencies**: T-6

### T-8: Разделить combined submit на два server commits

- **Status**: complete
- **Wired**: yes
- **Verified**: yes
- **Requirements**: US-1, US-2
- **Description**: На persistence boundary сохранять `in_progress`, получать
  новую revision и только затем сохранять `submitted_for_review`.
- **Acceptance**: Durable draft не перескакивает через canonical lifecycle;
  existing in-progress использует один write.
- **Dependencies**: T-7

### T-9: Проверить production-equivalent handoff

- **Status**: complete
- **Wired**: n/a
- **Verified**: yes
- **Requirements**: US-1, US-2
- **Description**: Прогнать lifecycle, persistence, App runtime, typecheck и
  production bundle.
- **Acceptance**: Все проверки PASS; release diff не содержит чужой WIP.
- **Dependencies**: T-8

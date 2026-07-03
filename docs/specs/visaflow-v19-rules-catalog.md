# VisaFlow V-19 Deterministic Rules Catalog

Status: Task 9A source-of-truth draft
Product context: Spain MVP, Russian-language Agent/Admin operations cockpit
Runtime scope: no evaluator, no UI wiring, no migrations, no dependencies

This catalog defines deterministic rules for the next rules-engine task. The
same input must always produce the same rule result. AI may explain rule results
to a user, but AI must not decide readiness, status, blockers, warnings, or
export truth.

Normative context:

- `docs/release/canonical-domain-contract.md`
- `docs/architecture/v19-flow-state-model.md`
- canonical domain/application boundary: `src/modules/submissions`

## Rule Schema

Every rule entry below defines:

- `ruleId`: stable machine-readable identifier.
- `titleRu`: short Russian title for operators.
- `descriptionRu`: what the rule protects.
- `category`: `passport`, `questionnaire`, `files`, `family`, `issues`,
  `status`, `export`, `city`, `appointment`, or `system`.
- `phase`: `appointment_readiness`, `document_package_readiness`,
  `export_readiness`, `workflow_gate`, or `system_safety`.
- `severity`: `blocker`, `warning`, or `info`.
- `appliesTo`: one or more gate surfaces: `appointment_readiness`, `submit`,
  `review`, `accept`, `ready_for_export`, `export`.
- `blocks`: one or more booleans or derived gates:
  `appointmentReadiness`, `documentPackageReadiness`, `canSubmit`,
  `canAccept`, `canMarkReadyForExport`, `canExport`, or `none`.
- `requiredInputs`: exact data needed to evaluate the rule.
- `condition`: deterministic condition in plain terms.
- `agentMessageRu`: safe copy for the agent.
- `adminMessageRu`: safe copy for the admin.
- `nextActionRu`: next operational action.
- `safeCopyNotes`: copy constraints for this rule.
- `overridePolicy`: whether admin override exists.
- `testCases`: minimum positive and negative scenarios for Task 9B.

Copy must stay operational: say what is missing, what requires manual check,
what blocks appointment preparation or export, and what the next action is.
Rule output must not promise an outcome, imply external authority validation, or
make AI/OCR the source of truth. Test snapshots and logs must not contain direct
personal contact values, full passport numbers, or full document identifiers.

## Phase Separation

### `appointment_readiness`

MVP phase for proceeding to BLS/consulate appointment booking or preparation.
Appointment readiness blockers are limited to:

- passport scan and passport identity fields;
- passport validity and blank-page declaration;
- front and side/profile selfies;
- identity basics, trip dates, visa type, contact data, jurisdiction;
- duplicate active submissions or appointments;
- family consistency.

This phase must not require the full visa evidence package.

### `document_package_readiness`

Future phase for full visa evidence package checks. Insurance, hotel booking,
tickets, bank statements, employment proof, invitation letters, and other
evidence files belong here only. They must not block MVP appointment readiness.

### `export_readiness`

Export phase for accepted submissions, Excel row completeness, package identity,
family grouping, city/date/type consistency, and unresolved issue checks.

### `workflow_gate`

Status, role, issue lifecycle, and transition gates for submit, review, accept,
ready-for-export, and export actions.

## Gate Derivation

- `appointmentReadiness` passes only when there are no blocker rules in
  `phase: appointment_readiness`.
- `canSubmit` for the MVP must require valid role/status and no
  `appointment_readiness` blockers. It must not require
  `document_package_readiness`.
- `canAccept` must require review-compatible status, no unresolved blocker
  issues, and still-valid appointment readiness inputs.
- `canMarkReadyForExport` must require `canAccept` plus export initialization
  guards defined by the canonical domain contract.
- `canExport` must require `ready_for_export`, closed blocker issues, stable
  export row data, package identity checks, and active export rules.
- Unknown critical data fails closed for blocker gates. Unknown optional data
  can produce warning only when this catalog explicitly says so.

## Appointment Readiness Rules

#### APPT_PASSPORT_MISSING
- `titleRu`: Скан паспорта не загружен
- `descriptionRu`: Нельзя подготовить запись без скана паспорта заявителя.
- `category`: passport
- `phase`: appointment_readiness
- `severity`: blocker
- `appliesTo`: appointment_readiness, submit
- `blocks`: appointmentReadiness, canSubmit
- `requiredInputs`: applicant.id, files by applicant, file.type, file.status
- `condition`: for any applicant, no `passport_scan` exists or its status is `missing` or `needs_replacement`.
- `agentMessageRu`: Загрузите скан паспорта для заявителя.
- `adminMessageRu`: Скан паспорта отсутствует; запись подготовить нельзя.
- `nextActionRu`: Агент загружает или заменяет скан паспорта.
- `safeCopyNotes`: Use missing-file language only; do not state outcome promises.
- `overridePolicy`: none in MVP.
- `testCases`: missing `passport_scan` blocks; uploaded non-replacement `passport_scan` passes this rule.

#### APPT_PASSPORT_MRZ_UNREADABLE
- `titleRu`: Данные паспорта не прочитаны
- `descriptionRu`: Номер паспорта или базовые identity поля не получены из скана и не введены вручную.
- `category`: passport
- `phase`: appointment_readiness
- `severity`: blocker
- `appliesTo`: appointment_readiness, submit, review
- `blocks`: appointmentReadiness, canSubmit
- `requiredInputs`: passportExtraction.status, extracted passportNumber, applicant identity fields, manual overrides
- `condition`: passport scan exists, but passport number or required identity fields are absent after extraction plus manual entry.
- `agentMessageRu`: Проверьте паспорт и заполните данные вручную.
- `adminMessageRu`: Данные паспорта требуют ручной проверки до подготовки записи.
- `nextActionRu`: Открыть паспорт, проверить номер и identity поля, сохранить ручные значения.
- `safeCopyNotes`: Say extraction is unavailable or incomplete; do not say OCR confirmed anything.
- `overridePolicy`: admin can continue only after manual values are saved.
- `testCases`: unreadable scan with no manual passport number blocks; saved manual passport number and identity basics pass.

#### APPT_PASSPORT_EXPIRED
- `titleRu`: Паспорт просрочен
- `descriptionRu`: Дата окончания паспорта раньше текущей даты.
- `category`: passport
- `phase`: appointment_readiness
- `severity`: blocker
- `appliesTo`: appointment_readiness, submit, review
- `blocks`: appointmentReadiness, canSubmit
- `requiredInputs`: passportExpiresAt, evaluationDate
- `condition`: `passportExpiresAt` is present and earlier than `evaluationDate`.
- `agentMessageRu`: Паспорт просрочен. Проверьте документ и замените данные.
- `adminMessageRu`: Паспорт просрочен; подготовка записи заблокирована.
- `nextActionRu`: Уточнить документ у заявителя или заменить паспортные данные.
- `safeCopyNotes`: State document validity fact only.
- `overridePolicy`: none in MVP.
- `testCases`: expiry yesterday blocks; expiry today or later does not trigger this rule.

#### APPT_PASSPORT_VALIDITY_TOO_SHORT
- `titleRu`: Срок действия паспорта недостаточен
- `descriptionRu`: Паспорт должен действовать минимум 3 месяца после планируемого выезда из Шенгена.
- `category`: passport
- `phase`: appointment_readiness
- `severity`: blocker
- `appliesTo`: appointment_readiness, submit, review
- `blocks`: appointmentReadiness, canSubmit
- `requiredInputs`: passportExpiresAt, tripDateTo
- `condition`: `passportExpiresAt` is earlier than 3 calendar months after `tripDateTo`.
- `agentMessageRu`: Проверьте срок действия паспорта относительно даты выезда.
- `adminMessageRu`: Срок действия паспорта слишком короткий для подготовки записи.
- `nextActionRu`: Обновить дату выезда или паспортные данные после проверки.
- `safeCopyNotes`: Keep the message operational and date-based.
- `overridePolicy`: none in MVP.
- `testCases`: expiry 2 months after departure blocks; expiry at least 3 months after departure passes.

#### APPT_PASSPORT_NO_BLANK_PAGES_DECLARED
- `titleRu`: Недостаточно пустых страниц
- `descriptionRu`: Заявитель указал меньше 2 пустых страниц в паспорте.
- `category`: passport
- `phase`: appointment_readiness
- `severity`: blocker
- `appliesTo`: appointment_readiness, submit
- `blocks`: appointmentReadiness, canSubmit
- `requiredInputs`: applicant.blankPassportPagesDeclared
- `condition`: declared blank pages count is present and less than 2.
- `agentMessageRu`: Уточните наличие минимум 2 пустых страниц в паспорте.
- `adminMessageRu`: Заявитель указал меньше 2 пустых страниц; запись заблокирована.
- `nextActionRu`: Получить подтверждение или новый документ от заявителя.
- `safeCopyNotes`: Refer to applicant declaration, not visual certainty from the scan.
- `overridePolicy`: none in MVP.
- `testCases`: declared `1` blocks; declared `2` passes this rule.

#### APPT_PASSPORT_NO_BLANK_PAGES_UNCONFIRMED
- `titleRu`: Пустые страницы не подтверждены
- `descriptionRu`: Система не проверяет пустые страницы по скану, а заявитель не подтвердил их наличие.
- `category`: passport
- `phase`: appointment_readiness
- `severity`: warning
- `appliesTo`: appointment_readiness, review
- `blocks`: none
- `requiredInputs`: applicant.blankPassportPagesDeclared, applicant.blankPagesConfirmed
- `condition`: blank pages count is absent and `blankPagesConfirmed` is not true.
- `agentMessageRu`: Подтвердите, что в паспорте есть минимум 2 пустые страницы.
- `adminMessageRu`: Наличие пустых страниц не подтверждено; нужна ручная проверка.
- `nextActionRu`: Получить подтверждение от заявителя.
- `safeCopyNotes`: Warning only by default; do not imply scan-based certainty.
- `overridePolicy`: can be upgraded to blocker by country profile if required.
- `testCases`: absent declaration creates warning; confirmed blank pages produce no finding.

#### APPT_SELFIE_1_MISSING
- `titleRu`: Первое селфи не загружено
- `descriptionRu`: Для подготовки записи нужен фронтальный снимок заявителя.
- `category`: files
- `phase`: appointment_readiness
- `severity`: blocker
- `appliesTo`: appointment_readiness, submit
- `blocks`: appointmentReadiness, canSubmit
- `requiredInputs`: applicant.id, files by applicant, file.type, file.status
- `condition`: for any applicant, no `selfie` exists or its status is `missing` or `needs_replacement`.
- `agentMessageRu`: Загрузите фронтальное селфи заявителя.
- `adminMessageRu`: Фронтальное селфи отсутствует; запись заблокирована.
- `nextActionRu`: Агент загружает или заменяет `selfie`.
- `safeCopyNotes`: Use file requirement language only.
- `overridePolicy`: none in MVP.
- `testCases`: missing `selfie` blocks; uploaded non-replacement `selfie` passes.

#### APPT_SELFIE_2_MISSING
- `titleRu`: Второе селфи не загружено
- `descriptionRu`: Для подготовки записи нужен боковой или профильный снимок заявителя.
- `category`: files
- `phase`: appointment_readiness
- `severity`: blocker
- `appliesTo`: appointment_readiness, submit
- `blocks`: appointmentReadiness, canSubmit
- `requiredInputs`: applicant.id, files by applicant, file.type, file.status
- `condition`: for any applicant, no `selfie_2` exists or its status is `missing` or `needs_replacement`.
- `agentMessageRu`: Загрузите второе селфи заявителя.
- `adminMessageRu`: Второе селфи отсутствует; запись заблокирована.
- `nextActionRu`: Агент загружает или заменяет `selfie_2`.
- `safeCopyNotes`: Do not describe `selfie_2` as video.
- `overridePolicy`: none in MVP.
- `testCases`: missing `selfie_2` blocks; uploaded non-replacement `selfie_2` passes.

#### APPT_SELFIE_BAD_QUALITY
- `titleRu`: Селфи требует замены
- `descriptionRu`: Селфи слишком размытое, темное, обрезанное или лицо не видно.
- `category`: files
- `phase`: appointment_readiness
- `severity`: blocker
- `appliesTo`: appointment_readiness, submit, review
- `blocks`: appointmentReadiness, canSubmit
- `requiredInputs`: file.qualityFlags, file.status, manual admin file review
- `condition`: any required selfie has a deterministic quality flag requiring replacement or file status `needs_replacement`.
- `agentMessageRu`: Замените селфи: лицо должно быть видно без сильного размытия или обрезки.
- `adminMessageRu`: Селфи требует замены до подготовки записи.
- `nextActionRu`: Запросить новый снимок у заявителя.
- `safeCopyNotes`: Describe observable quality issue only.
- `overridePolicy`: admin can clear only by changing deterministic review status to accepted.
- `testCases`: `needs_replacement` blocks; accepted quality review passes.

#### APPT_SELFIES_LOOK_DUPLICATED
- `titleRu`: Селфи похожи друг на друга
- `descriptionRu`: Два селфи выглядят одинаковыми или почти одинаковыми.
- `category`: files
- `phase`: appointment_readiness
- `severity`: warning
- `appliesTo`: appointment_readiness, review
- `blocks`: none
- `requiredInputs`: selfie file fingerprints, perceptual duplicate flag, manual review status
- `condition`: deterministic duplicate check marks `selfie` and `selfie_2` as identical or near-identical.
- `agentMessageRu`: Проверьте, что загружены два разных снимка.
- `adminMessageRu`: Селфи похожи; нужна ручная проверка.
- `nextActionRu`: При необходимости запросить второй отличающийся снимок.
- `safeCopyNotes`: Warning by default; do not claim identity verification.
- `overridePolicy`: can be configured as blocker if product requires distinct liveness shots.
- `testCases`: same fingerprint warns; distinct fingerprints produce no finding.

#### APPT_TRIP_DATES_MISSING
- `titleRu`: Даты поездки не заполнены
- `descriptionRu`: Для подготовки записи нужны даты въезда и выезда.
- `category`: appointment
- `phase`: appointment_readiness
- `severity`: blocker
- `appliesTo`: appointment_readiness, submit
- `blocks`: appointmentReadiness, canSubmit
- `requiredInputs`: tripDateFrom, tripDateTo
- `condition`: entry date or exit date is absent.
- `agentMessageRu`: Заполните даты въезда и выезда.
- `adminMessageRu`: Даты поездки отсутствуют; запись заблокирована.
- `nextActionRu`: Уточнить и сохранить обе даты поездки.
- `safeCopyNotes`: Keep copy date-specific.
- `overridePolicy`: none in MVP.
- `testCases`: missing exit date blocks; both dates present passes this rule.

#### APPT_TRIP_DATE_INVALID_RANGE
- `titleRu`: Некорректный диапазон поездки
- `descriptionRu`: Дата выезда не может быть раньше даты въезда.
- `category`: appointment
- `phase`: appointment_readiness
- `severity`: blocker
- `appliesTo`: appointment_readiness, submit
- `blocks`: appointmentReadiness, canSubmit
- `requiredInputs`: tripDateFrom, tripDateTo
- `condition`: `tripDateTo` is earlier than `tripDateFrom`.
- `agentMessageRu`: Проверьте даты поездки: выезд раньше въезда.
- `adminMessageRu`: Диапазон дат поездки некорректен.
- `nextActionRu`: Исправить дату въезда или выезда.
- `safeCopyNotes`: State the date conflict only.
- `overridePolicy`: none.
- `testCases`: exit before entry blocks; exit same day or later passes.

#### APPT_TOO_EARLY_FOR_APPLICATION
- `titleRu`: Слишком рано для подачи
- `descriptionRu`: Дата записи или подготовки заявления больше чем за 6 месяцев до поездки.
- `category`: appointment
- `phase`: appointment_readiness
- `severity`: blocker
- `appliesTo`: appointment_readiness, submit
- `blocks`: appointmentReadiness, canSubmit
- `requiredInputs`: appointmentPreparationDate, tripDateFrom
- `condition`: preparation or appointment date is more than 6 calendar months before `tripDateFrom`.
- `agentMessageRu`: Дата подготовки слишком ранняя относительно поездки.
- `adminMessageRu`: Запись слишком ранняя относительно планируемой поездки.
- `nextActionRu`: Выбрать корректную дату подготовки или уточнить даты поездки.
- `safeCopyNotes`: Use calendar-window language only.
- `overridePolicy`: none in MVP.
- `testCases`: 7 months before entry blocks; 6 months or less passes.

#### APPT_TOO_LATE_FOR_APPLICATION
- `titleRu`: Слишком поздно для подачи
- `descriptionRu`: Дата записи или подготовки меньше чем за 15 календарных дней до поездки.
- `category`: appointment
- `phase`: appointment_readiness
- `severity`: blocker
- `appliesTo`: appointment_readiness, submit, review
- `blocks`: appointmentReadiness, canSubmit
- `requiredInputs`: appointmentPreparationDate, tripDateFrom, actorRole, overrideDecision
- `condition`: preparation or appointment date is less than 15 calendar days before `tripDateFrom`.
- `agentMessageRu`: Дата подготовки слишком близко к поездке. Передайте администратору для решения.
- `adminMessageRu`: Срок до поездки меньше 15 дней; требуется решение администратора.
- `nextActionRu`: Администратор проверяет возможность исключения или меняет даты.
- `safeCopyNotes`: State operational timing risk; do not promise downstream acceptance.
- `overridePolicy`: blocks agent flow; admin override may allow continuation with recorded reason.
- `testCases`: agent at 10 days blocks; admin override with reason clears this rule for admin flow.

#### APPT_VISA_TYPE_MISSING
- `titleRu`: Тип визы не выбран
- `descriptionRu`: Для записи нужен выбранный тип или категория визы.
- `category`: appointment
- `phase`: appointment_readiness
- `severity`: blocker
- `appliesTo`: appointment_readiness, submit
- `blocks`: appointmentReadiness, canSubmit
- `requiredInputs`: visaType, countryProfile.supportedVisaTypes
- `condition`: `visaType` is absent.
- `agentMessageRu`: Выберите тип визы.
- `adminMessageRu`: Тип визы не выбран; запись заблокирована.
- `nextActionRu`: Выбрать тип из доступного списка MVP.
- `safeCopyNotes`: Use selection requirement language.
- `overridePolicy`: none.
- `testCases`: empty visa type blocks; supported selected type passes this rule.

#### APPT_UNSUPPORTED_VISA_TYPE
- `titleRu`: Тип визы вне MVP
- `descriptionRu`: Выбранный тип визы не поддерживается текущим MVP профилем.
- `category`: appointment
- `phase`: appointment_readiness
- `severity`: blocker
- `appliesTo`: appointment_readiness, submit, review
- `blocks`: appointmentReadiness, canSubmit
- `requiredInputs`: visaType, countryProfile.supportedVisaTypes
- `condition`: selected `visaType` is not in the active country profile allow-list.
- `agentMessageRu`: Выберите тип визы, поддерживаемый в текущем процессе.
- `adminMessageRu`: Выбранный тип визы не входит в MVP процесс.
- `nextActionRu`: Изменить тип или перенести подачу в отдельный ручной процесс.
- `safeCopyNotes`: Say unsupported in product scope, not invalid for all contexts.
- `overridePolicy`: admin can move to manual external process, but catalog result stays blocker.
- `testCases`: unsupported type blocks; allow-listed type passes.

#### APPT_CONSULAR_JURISDICTION_MISSING
- `titleRu`: Юрисдикция не заполнена
- `descriptionRu`: Не хватает города проживания, города записи или центра подачи.
- `category`: city
- `phase`: appointment_readiness
- `severity`: blocker
- `appliesTo`: appointment_readiness, submit
- `blocks`: appointmentReadiness, canSubmit
- `requiredInputs`: residenceCity, submission.city, appointmentCenter, countryProfile.jurisdictionRules
- `condition`: required jurisdiction or appointment center field is absent.
- `agentMessageRu`: Заполните город и центр подачи для записи.
- `adminMessageRu`: Данные юрисдикции отсутствуют; запись заблокирована.
- `nextActionRu`: Уточнить город проживания и центр подачи.
- `safeCopyNotes`: Use missing jurisdiction data language.
- `overridePolicy`: none by default.
- `testCases`: missing appointment center blocks; all jurisdiction fields present passes.

#### APPT_CONSULAR_JURISDICTION_MISMATCH
- `titleRu`: Центр подачи не совпадает с юрисдикцией
- `descriptionRu`: Выбранный центр подачи не соответствует правилам города или региона проживания.
- `category`: city
- `phase`: appointment_readiness
- `severity`: blocker
- `appliesTo`: appointment_readiness, submit, review
- `blocks`: appointmentReadiness, canSubmit
- `requiredInputs`: residenceCity, appointmentCenter, countryProfile.jurisdictionRules
- `condition`: deterministic jurisdiction mapping rejects the selected appointment center for the applicant.
- `agentMessageRu`: Проверьте город проживания и выбранный центр подачи.
- `adminMessageRu`: Центр подачи не соответствует юрисдикции заявителя.
- `nextActionRu`: Выбрать корректный центр или исправить данные проживания.
- `safeCopyNotes`: State mapping mismatch only.
- `overridePolicy`: country profile may define admin override with reason.
- `testCases`: city mapped to another center blocks; matching center passes.

#### APPT_DUPLICATE_PASSPORT_ACTIVE_SUBMISSION
- `titleRu`: Активная подача с тем же паспортом
- `descriptionRu`: Найдена другая незавершенная подача с тем же номером паспорта.
- `category`: system
- `phase`: appointment_readiness
- `severity`: blocker
- `appliesTo`: appointment_readiness, submit, review
- `blocks`: appointmentReadiness, canSubmit
- `requiredInputs`: normalized passportNumber, active submissions index, current submission id
- `condition`: another non-exported/non-closed active submission has the same normalized passport number.
- `agentMessageRu`: Проверьте дубль подачи по паспорту.
- `adminMessageRu`: Есть активная подача с тем же паспортом; запись заблокирована.
- `nextActionRu`: Объединить процесс вручную или закрыть дубль по регламенту.
- `safeCopyNotes`: Do not expose full passport number in list copy or logs.
- `overridePolicy`: admin can override only after resolving duplicate state.
- `testCases`: same passport in another active submission blocks; same current submission does not block.

#### APPT_DUPLICATE_ACTIVE_APPOINTMENT
- `titleRu`: Уже есть активная запись
- `descriptionRu`: Для заявителя уже зарегистрирована активная запись в операционном контуре.
- `category`: appointment
- `phase`: appointment_readiness
- `severity`: blocker
- `appliesTo`: appointment_readiness, submit, review
- `blocks`: appointmentReadiness, canSubmit
- `requiredInputs`: applicant id, normalized passportNumber, active appointment index
- `condition`: active appointment exists for the same applicant identity or passport number.
- `agentMessageRu`: Проверьте существующую запись заявителя.
- `adminMessageRu`: Активная запись уже существует; повторная подготовка заблокирована.
- `nextActionRu`: Открыть существующую запись или закрыть дубль по регламенту.
- `safeCopyNotes`: Do not expose direct contact data or full document number.
- `overridePolicy`: admin can override only after duplicate record is resolved.
- `testCases`: matching active appointment blocks; canceled historical appointment does not block.

#### APPT_CONTACT_MISSING
- `titleRu`: Контактные данные не заполнены
- `descriptionRu`: Для подготовки записи нужен телефон или email согласно профилю страны.
- `category`: questionnaire
- `phase`: appointment_readiness
- `severity`: blocker
- `appliesTo`: appointment_readiness, submit
- `blocks`: appointmentReadiness, canSubmit
- `requiredInputs`: applicant.phone, applicant.email, countryProfile.requiredContactFields
- `condition`: required contact field is absent or blank.
- `agentMessageRu`: Заполните контактные данные заявителя.
- `adminMessageRu`: Контактные данные отсутствуют; запись заблокирована.
- `nextActionRu`: Запросить и сохранить требуемый контакт.
- `safeCopyNotes`: Do not print the actual phone or email in snapshots.
- `overridePolicy`: country profile can define whether phone, email, or both are required.
- `testCases`: required phone absent blocks; required contact present passes.

#### APPT_APPLICANT_NAME_MISSING
- `titleRu`: ФИО заявителя не заполнено
- `descriptionRu`: ФИО не получено из паспорта и не введено вручную.
- `category`: passport
- `phase`: appointment_readiness
- `severity`: blocker
- `appliesTo`: appointment_readiness, submit
- `blocks`: appointmentReadiness, canSubmit
- `requiredInputs`: applicant.fullName, passport extracted firstName, passport extracted surname, manual fields
- `condition`: required name components are absent after extraction plus manual entry.
- `agentMessageRu`: Заполните ФИО заявителя по паспорту.
- `adminMessageRu`: ФИО отсутствует; запись заблокирована.
- `nextActionRu`: Проверить паспорт и сохранить ФИО вручную.
- `safeCopyNotes`: Do not log full name in rule snapshots unless redacted.
- `overridePolicy`: none; manual value is the override mechanism.
- `testCases`: no extracted or manual name blocks; manual full name passes.

#### APPT_DOB_MISSING
- `titleRu`: Дата рождения не заполнена
- `descriptionRu`: Дата рождения не получена из паспорта и не введена вручную.
- `category`: passport
- `phase`: appointment_readiness
- `severity`: blocker
- `appliesTo`: appointment_readiness, submit
- `blocks`: appointmentReadiness, canSubmit
- `requiredInputs`: applicant.birthDate, extracted birthDate, manual fields
- `condition`: date of birth is absent after extraction plus manual entry.
- `agentMessageRu`: Заполните дату рождения заявителя по паспорту.
- `adminMessageRu`: Дата рождения отсутствует; запись заблокирована.
- `nextActionRu`: Проверить паспорт и сохранить дату рождения вручную.
- `safeCopyNotes`: Do not expose full birth date in logs unless redacted.
- `overridePolicy`: none; manual value is the override mechanism.
- `testCases`: missing DOB blocks; saved valid DOB passes.

#### APPT_NATIONALITY_MISSING
- `titleRu`: Гражданство не заполнено
- `descriptionRu`: Гражданство не получено из паспорта и не введено вручную.
- `category`: passport
- `phase`: appointment_readiness
- `severity`: blocker
- `appliesTo`: appointment_readiness, submit
- `blocks`: appointmentReadiness, canSubmit
- `requiredInputs`: applicant.nationality, extracted citizenship, manual fields
- `condition`: nationality/citizenship is absent after extraction plus manual entry.
- `agentMessageRu`: Заполните гражданство заявителя по паспорту.
- `adminMessageRu`: Гражданство отсутствует; запись заблокирована.
- `nextActionRu`: Проверить паспорт и сохранить гражданство вручную.
- `safeCopyNotes`: Keep copy field-specific.
- `overridePolicy`: none; manual value is the override mechanism.
- `testCases`: missing nationality blocks; saved nationality passes.

#### APPT_FAMILY_MEMBER_MISSING_PASSPORT
- `titleRu`: У участника семьи нет паспорта
- `descriptionRu`: В семейной подаче у каждого участника должен быть скан паспорта.
- `category`: family
- `phase`: appointment_readiness
- `severity`: blocker
- `appliesTo`: appointment_readiness, submit
- `blocks`: appointmentReadiness, canSubmit
- `requiredInputs`: submission.type, applicants, files by applicant
- `condition`: submission type is `family` and any family applicant lacks ready `passport_scan`.
- `agentMessageRu`: Загрузите скан паспорта для каждого участника семьи.
- `adminMessageRu`: В семейной подаче есть участник без паспорта.
- `nextActionRu`: Открыть участника семьи и загрузить паспорт.
- `safeCopyNotes`: Do not list full passport values.
- `overridePolicy`: none in MVP.
- `testCases`: one family member missing passport blocks; all members with passport pass.

#### APPT_FAMILY_MEMBER_MISSING_SELFIES
- `titleRu`: У участника семьи нет селфи
- `descriptionRu`: В семейной подаче у каждого участника должны быть два селфи.
- `category`: family
- `phase`: appointment_readiness
- `severity`: blocker
- `appliesTo`: appointment_readiness, submit
- `blocks`: appointmentReadiness, canSubmit
- `requiredInputs`: submission.type, applicants, files by applicant
- `condition`: submission type is `family` and any family applicant lacks ready `selfie` or `selfie_2`.
- `agentMessageRu`: Загрузите оба селфи для каждого участника семьи.
- `adminMessageRu`: В семейной подаче есть участник без полного набора селфи.
- `nextActionRu`: Открыть участника семьи и загрузить недостающие селфи.
- `safeCopyNotes`: Use file requirement language only.
- `overridePolicy`: none in MVP.
- `testCases`: missing `selfie_2` for child blocks; all required selfies pass.

#### APPT_FAMILY_DIFFERENT_CITIES
- `titleRu`: Участники семьи в разных городах
- `descriptionRu`: Для единой семейной записи город должен совпадать у всех участников.
- `category`: family
- `phase`: appointment_readiness
- `severity`: blocker
- `appliesTo`: appointment_readiness, submit, review
- `blocks`: appointmentReadiness, canSubmit
- `requiredInputs`: submission.type, applicant city or jurisdiction fields
- `condition`: submission type is `family` and applicants have more than one appointment city or jurisdiction city.
- `agentMessageRu`: Проверьте город записи у участников семьи.
- `adminMessageRu`: В семейной подаче разные города; запись заблокирована.
- `nextActionRu`: Исправить город или разделить подачу.
- `safeCopyNotes`: State family consistency conflict only.
- `overridePolicy`: none unless country profile supports split-family processing.
- `testCases`: Moscow plus Saint Petersburg blocks; one shared city passes.

#### APPT_FAMILY_DIFFERENT_TRIP_DATES
- `titleRu`: Участники семьи с разными датами поездки
- `descriptionRu`: Для единой семейной записи даты поездки должны совпадать, если профиль требует общий маршрут.
- `category`: family
- `phase`: appointment_readiness
- `severity`: blocker
- `appliesTo`: appointment_readiness, submit, review
- `blocks`: appointmentReadiness, canSubmit
- `requiredInputs`: submission.type, applicant trip dates, countryProfile.familyUnifiedTripRequired
- `condition`: family unified trip is required and applicants have different entry or exit dates.
- `agentMessageRu`: Проверьте даты поездки у всех участников семьи.
- `adminMessageRu`: Даты поездки в семье расходятся; запись заблокирована.
- `nextActionRu`: Исправить даты или разделить подачу.
- `safeCopyNotes`: State route consistency conflict only.
- `overridePolicy`: country profile can disable this rule for independent trips.
- `testCases`: different exit dates block when unified trip required; matching dates pass.

#### APPT_FAMILY_DIFFERENT_VISA_TYPES
- `titleRu`: Участники семьи с разными типами визы
- `descriptionRu`: Для единой семейной записи тип визы должен совпадать, если профиль требует общий тип.
- `category`: family
- `phase`: appointment_readiness
- `severity`: blocker
- `appliesTo`: appointment_readiness, submit, review
- `blocks`: appointmentReadiness, canSubmit
- `requiredInputs`: submission.type, applicant visaType, countryProfile.familyUnifiedVisaTypeRequired
- `condition`: family unified visa type is required and applicants have more than one visa type.
- `agentMessageRu`: Проверьте тип визы у участников семьи.
- `adminMessageRu`: В семейной подаче разные типы визы; запись заблокирована.
- `nextActionRu`: Исправить тип или разделить подачу.
- `safeCopyNotes`: Say product profile requires consistency.
- `overridePolicy`: country profile can disable this rule where mixed family types are supported.
- `testCases`: tourist plus business blocks when unified type required; one type passes.

#### APPT_FAMILY_MEMBER_COUNT_REQUIRES_MANUAL_CHECK
- `titleRu`: Количество участников требует проверки
- `descriptionRu`: Размер семейной подачи выходит за автоматический MVP лимит.
- `category`: family
- `phase`: appointment_readiness
- `severity`: warning
- `appliesTo`: appointment_readiness, review
- `blocks`: none
- `requiredInputs`: submission.type, applicants.length, countryProfile.familyAutoLimit
- `condition`: family applicant count is greater than the configured automatic processing limit.
- `agentMessageRu`: Передайте семейную подачу администратору для проверки состава.
- `adminMessageRu`: Количество участников семьи требует ручной проверки.
- `nextActionRu`: Администратор проверяет состав семьи и способ записи.
- `safeCopyNotes`: Warning only unless profile explicitly blocks.
- `overridePolicy`: can be configured as blocker for a country or center limit.
- `testCases`: count above limit warns; count within limit passes.

## Workflow, Issue, Export, and Safety Rules

#### PASS_EXTRACTION_UNAVAILABLE
- `titleRu`: Извлечение данных паспорта недоступно
- `descriptionRu`: Паспорт есть, но автоматическое извлечение не дало пригодных данных.
- `category`: passport
- `phase`: workflow_gate
- `severity`: warning
- `appliesTo`: review, accept
- `blocks`: none
- `requiredInputs`: passportExtraction.status, manual identity field state
- `condition`: extraction status is `failed` or `unavailable`, while all required manual fields are present.
- `agentMessageRu`: Данные паспорта заполнены вручную; проверьте их перед отправкой.
- `adminMessageRu`: Автоматическое извлечение недоступно; используйте ручную проверку.
- `nextActionRu`: Сверить ручные поля со сканом паспорта.
- `safeCopyNotes`: Do not state that extraction proved correctness.
- `overridePolicy`: warning only when manual fields are complete.
- `testCases`: unavailable extraction with complete manual fields warns; unavailable extraction with missing fields is covered by blockers.

#### PASS_MRZ_NEEDS_MANUAL_REVIEW
- `titleRu`: MRZ требует ручной проверки
- `descriptionRu`: MRZ или паспортные поля извлечены, но помечены как требующие проверки.
- `category`: passport
- `phase`: workflow_gate
- `severity`: warning
- `appliesTo`: review, accept
- `blocks`: none
- `requiredInputs`: extractedFields.needsManualReview, adminReviewState
- `condition`: any required extracted passport field has `needsManualReview: true` and manual review is not recorded.
- `agentMessageRu`: Проверьте паспортные данные перед отправкой.
- `adminMessageRu`: Паспортные данные требуют ручной проверки.
- `nextActionRu`: Администратор сверяет поля и отмечает проверку.
- `safeCopyNotes`: Say requires check; do not state machine certainty.
- `overridePolicy`: admin review clears warning.
- `testCases`: field needing review warns; reviewed field passes.

#### PASS_EXPIRY_MISSING
- `titleRu`: Дата окончания паспорта не заполнена
- `descriptionRu`: Срок действия паспорта нужен для readiness and timing checks.
- `category`: passport
- `phase`: appointment_readiness
- `severity`: blocker
- `appliesTo`: appointment_readiness, submit
- `blocks`: appointmentReadiness, canSubmit
- `requiredInputs`: passportExpiresAt, manual passport fields
- `condition`: passport expiry date is absent after extraction plus manual entry.
- `agentMessageRu`: Заполните дату окончания паспорта.
- `adminMessageRu`: Дата окончания паспорта отсутствует; запись заблокирована.
- `nextActionRu`: Проверить паспорт и сохранить дату окончания.
- `safeCopyNotes`: Field-missing copy only.
- `overridePolicy`: none; manual value is required.
- `testCases`: missing expiry blocks; saved valid expiry passes.

#### Q_REQUIRED_FIELDS_INCOMPLETE
- `titleRu`: Обязательные поля не заполнены
- `descriptionRu`: Required appointment questionnaire fields are incomplete.
- `category`: questionnaire
- `phase`: appointment_readiness
- `severity`: blocker
- `appliesTo`: appointment_readiness, submit
- `blocks`: appointmentReadiness, canSubmit
- `requiredInputs`: questionnaire answers, countryProfile.appointmentRequiredFields
- `condition`: any required appointment field is absent, blank, or invalid.
- `agentMessageRu`: Заполните обязательные поля анкеты для записи.
- `adminMessageRu`: Обязательные поля анкеты не заполнены.
- `nextActionRu`: Открыть анкету и заполнить отмеченные поля.
- `safeCopyNotes`: Do not include full sensitive answers in logs.
- `overridePolicy`: none unless field is optional in country profile.
- `testCases`: one missing required field blocks; all required fields valid pass.

#### Q_REQUIRED_SECTION_INCOMPLETE
- `titleRu`: Раздел анкеты не завершен
- `descriptionRu`: Required appointment section has at least one incomplete required field.
- `category`: questionnaire
- `phase`: appointment_readiness
- `severity`: blocker
- `appliesTo`: appointment_readiness, submit
- `blocks`: appointmentReadiness, canSubmit
- `requiredInputs`: questionnaire sections, section required flags, field completion state
- `condition`: required section status is not complete.
- `agentMessageRu`: Завершите обязательный раздел анкеты.
- `adminMessageRu`: Обязательный раздел анкеты не завершен.
- `nextActionRu`: Открыть раздел и заполнить недостающие поля.
- `safeCopyNotes`: Section-level copy may avoid exposing sensitive field values.
- `overridePolicy`: none unless section is disabled by country profile.
- `testCases`: incomplete required section blocks; complete section passes.

#### Q_APPOINTMENT_BASICS_MISSING
- `titleRu`: Не хватает базовых данных для записи
- `descriptionRu`: Missing identity, trip, contact, visa type, or jurisdiction fields needed for appointment preparation.
- `category`: questionnaire
- `phase`: appointment_readiness
- `severity`: blocker
- `appliesTo`: appointment_readiness, submit
- `blocks`: appointmentReadiness, canSubmit
- `requiredInputs`: identity basics, trip dates, visaType, contact fields, jurisdiction fields
- `condition`: any configured appointment-basic field is missing and no more specific rule already covers it.
- `agentMessageRu`: Заполните базовые данные для записи.
- `adminMessageRu`: Базовые данные для записи неполные.
- `nextActionRu`: Заполнить отмеченные поля в анкете.
- `safeCopyNotes`: Use a summary message; field-level messages come from specific rules.
- `overridePolicy`: none by default.
- `testCases`: missing required jurisdiction detail blocks; all configured basics pass.

#### FILE_OPEN_BLOCKER_ISSUE
- `titleRu`: По файлу есть открытое блокирующее замечание
- `descriptionRu`: File cannot be accepted or exported while a blocker issue is unresolved.
- `category`: files
- `phase`: workflow_gate
- `severity`: blocker
- `appliesTo`: accept, ready_for_export, export
- `blocks`: canAccept, canMarkReadyForExport, canExport
- `requiredInputs`: file id/type, issue target, issue severity, issue status
- `condition`: any issue targets the file and has severity `blocker` with status `open` or `fixed_by_agent`.
- `agentMessageRu`: Исправьте замечание по файлу и отправьте на проверку.
- `adminMessageRu`: По файлу есть незакрытое блокирующее замечание.
- `nextActionRu`: Агент исправляет файл; администратор закрывает замечание после проверки.
- `safeCopyNotes`: Do not expose raw storage paths.
- `overridePolicy`: none; issue lifecycle must be completed.
- `testCases`: open blocker issue blocks accept/export; closed blocker issue passes this rule.

#### FILE_PENDING_ADMIN_REVIEW
- `titleRu`: Файл требует проверки администратора
- `descriptionRu`: Uploaded file has not reached accepted state for export readiness.
- `category`: files
- `phase`: export_readiness
- `severity`: blocker
- `appliesTo`: accept, ready_for_export, export
- `blocks`: canAccept, canMarkReadyForExport, canExport
- `requiredInputs`: file.status, required file types, admin review state
- `condition`: required appointment media exists but status is `uploaded` or `pending_review` when accept/export requires accepted media.
- `agentMessageRu`: Файл загружен и ожидает проверки.
- `adminMessageRu`: Проверьте и примите файл перед готовностью к выгрузке.
- `nextActionRu`: Администратор проверяет файл и меняет статус на accepted or creates issue.
- `safeCopyNotes`: Do not say file is accepted until status is accepted.
- `overridePolicy`: admin acceptance is the only clearing action.
- `testCases`: pending review blocks export; accepted file passes.

#### ISSUE_OPEN_BLOCKER
- `titleRu`: Есть открытое блокирующее замечание
- `descriptionRu`: Acceptance and export are blocked by open blocker issues.
- `category`: issues
- `phase`: workflow_gate
- `severity`: blocker
- `appliesTo`: accept, ready_for_export, export
- `blocks`: canAccept, canMarkReadyForExport, canExport
- `requiredInputs`: issues.status, issues.severity
- `condition`: any issue has severity `blocker` and status `open`.
- `agentMessageRu`: Исправьте блокирующее замечание.
- `adminMessageRu`: Есть открытое блокирующее замечание.
- `nextActionRu`: Агент исправляет; администратор проверяет после повторной отправки.
- `safeCopyNotes`: Keep issue copy concrete and operational.
- `overridePolicy`: none.
- `testCases`: open blocker issue blocks; warning issue alone does not block this rule.

#### ISSUE_FIXED_BY_AGENT_RECHECK
- `titleRu`: Исправление требует проверки администратора
- `descriptionRu`: Fixed blocker issue must be closed by admin before acceptance or export.
- `category`: issues
- `phase`: workflow_gate
- `severity`: blocker
- `appliesTo`: accept, ready_for_export, export
- `blocks`: canAccept, canMarkReadyForExport, canExport
- `requiredInputs`: issues.status, issues.severity
- `condition`: any blocker issue has status `fixed_by_agent`.
- `agentMessageRu`: Исправление отправлено и ожидает проверки.
- `adminMessageRu`: Исправление заявителя нужно проверить и закрыть.
- `nextActionRu`: Администратор проверяет исправление и закрывает замечание.
- `safeCopyNotes`: Use canonical `fixed_by_agent`; legacy aliases must be normalized before evaluation.
- `overridePolicy`: none; admin closure is required.
- `testCases`: `fixed_by_agent` blocker blocks export; `closed_by_admin` passes.

#### ISSUE_WARNING_VISIBLE
- `titleRu`: Есть предупреждение
- `descriptionRu`: Warning issue remains visible but does not block unless configured.
- `category`: issues
- `phase`: workflow_gate
- `severity`: warning
- `appliesTo`: review, accept, export
- `blocks`: none
- `requiredInputs`: issues.status, issues.severity, rule configuration
- `condition`: any non-closed issue has severity `warning`.
- `agentMessageRu`: Проверьте предупреждение по подаче.
- `adminMessageRu`: Предупреждение остается видимым для контроля.
- `nextActionRu`: Проверить предупреждение и решить, нужно ли действие.
- `safeCopyNotes`: Do not present warning as blocker unless configured.
- `overridePolicy`: can be upgraded to blocker by explicit product configuration.
- `testCases`: warning issue creates warning; warning configured as blocker blocks its configured gate.

#### STAT_INVALID_SUBMIT_STATUS
- `titleRu`: Нельзя отправить из текущего статуса
- `descriptionRu`: Agent submit is allowed only from `in_progress` for first submission or `returned` for corrections command.
- `category`: status
- `phase`: workflow_gate
- `severity`: blocker
- `appliesTo`: submit
- `blocks`: canSubmit
- `requiredInputs`: submission.status, actorRole, requested action
- `condition`: action is submit and current status is not allowed by canonical transition matrix.
- `agentMessageRu`: Отправка недоступна из текущего статуса.
- `adminMessageRu`: Отправка заблокирована статусом подачи.
- `nextActionRu`: Выполнить допустимое действие для текущего статуса.
- `safeCopyNotes`: State status guard, not generic failure.
- `overridePolicy`: none.
- `testCases`: submit from `draft` blocks; submit from `in_progress` can proceed to readiness checks.

#### STAT_INVALID_ACCEPT_STATUS
- `titleRu`: Нельзя принять из текущего статуса
- `descriptionRu`: Admin accept is allowed only from review-compatible statuses.
- `category`: status
- `phase`: workflow_gate
- `severity`: blocker
- `appliesTo`: accept, ready_for_export
- `blocks`: canAccept, canMarkReadyForExport
- `requiredInputs`: submission.status, actorRole
- `condition`: accept is requested and status is not `submitted_for_review` or `corrections_received`.
- `agentMessageRu`: Подача еще не находится на проверке администратора.
- `adminMessageRu`: Принятие недоступно из текущего статуса.
- `nextActionRu`: Дождаться отправки на проверку или выбрать корректное действие.
- `safeCopyNotes`: Use canonical status language.
- `overridePolicy`: none.
- `testCases`: accept from `returned` blocks; accept from `submitted_for_review` proceeds to issue/readiness checks.

#### STAT_INVALID_EXPORT_STATUS
- `titleRu`: Нельзя выгрузить из текущего статуса
- `descriptionRu`: Export is allowed only when status is `ready_for_export`.
- `category`: status
- `phase`: export_readiness
- `severity`: blocker
- `appliesTo`: export
- `blocks`: canExport
- `requiredInputs`: submission.status
- `condition`: export is requested and normalized status is not `ready_for_export`.
- `agentMessageRu`: Подача еще не готова к выгрузке.
- `adminMessageRu`: Выгрузка доступна только для статуса `ready_for_export`.
- `nextActionRu`: Завершить проверку и принятие перед выгрузкой.
- `safeCopyNotes`: Do not call accepted status exported.
- `overridePolicy`: none.
- `testCases`: export from `submitted_for_review` blocks; export from `ready_for_export` proceeds to export checks.

#### STAT_RETURNED_NOT_EXPORTABLE
- `titleRu`: Возвращенная подача не выгружается
- `descriptionRu`: Returned submission cannot be exported until corrections are reviewed and accepted.
- `category`: status
- `phase`: export_readiness
- `severity`: blocker
- `appliesTo`: export
- `blocks`: canExport
- `requiredInputs`: submission.status
- `condition`: normalized status is `returned` and export is requested.
- `agentMessageRu`: Подача возвращена на исправление.
- `adminMessageRu`: Возвращенная подача не доступна для выгрузки.
- `nextActionRu`: Агент исправляет замечания; администратор проверяет повторно.
- `safeCopyNotes`: State lifecycle state only.
- `overridePolicy`: none.
- `testCases`: returned status blocks export; ready_for_export status is checked by export rules.

#### EXP_OPEN_BLOCKERS
- `titleRu`: В выборке есть блокирующие замечания
- `descriptionRu`: Export package cannot include submissions with unresolved blocker issues.
- `category`: export
- `phase`: export_readiness
- `severity`: blocker
- `appliesTo`: export
- `blocks`: canExport
- `requiredInputs`: selected submissions, issues.severity, issues.status
- `condition`: selected submission has blocker issue with status `open` or `fixed_by_agent`.
- `agentMessageRu`: Исправьте блокирующие замечания перед выгрузкой.
- `adminMessageRu`: В выборке есть незакрытые блокирующие замечания.
- `nextActionRu`: Закрыть замечания после проверки или снять подачу с выборки.
- `safeCopyNotes`: Avoid exposing issue internals in export logs.
- `overridePolicy`: none.
- `testCases`: selected open blocker blocks export; closed blockers pass.

#### EXP_FAMILY_GROUPING_INCONSISTENT
- `titleRu`: Семейная группировка неконсистентна
- `descriptionRu`: Export rows must preserve valid family grouping.
- `category`: family
- `phase`: export_readiness
- `severity`: blocker
- `appliesTo`: export
- `blocks`: canExport
- `requiredInputs`: submission.type, familyGroupId, applicants, export rows
- `condition`: family submission rows are split, missing group identity, or grouped with unrelated submissions.
- `agentMessageRu`: Проверьте состав семейной подачи.
- `adminMessageRu`: Семейная группировка в выгрузке неконсистентна.
- `nextActionRu`: Исправить grouping data or exclude affected rows.
- `safeCopyNotes`: Do not expose full applicant identifiers in logs.
- `overridePolicy`: none.
- `testCases`: missing family group id blocks; stable group id for all members passes.

#### EXP_CITY_DATE_CATEGORY_CONFLICT
- `titleRu`: Конфликт города, дат или типа
- `descriptionRu`: Export package cannot mix incompatible city, trip date, or visa type values.
- `category`: export
- `phase`: export_readiness
- `severity`: blocker
- `appliesTo`: export
- `blocks`: canExport
- `requiredInputs`: selected submissions city, tripDateFrom, tripDateTo, visaType, countryProfile export grouping rules
- `condition`: selected rows violate configured export grouping constraints for city, dates, or visa type.
- `agentMessageRu`: Проверьте город, даты и тип подачи.
- `adminMessageRu`: В выборке есть конфликт города, дат или типа.
- `nextActionRu`: Разделить выгрузку на совместимые пакеты.
- `safeCopyNotes`: State conflict type without full personal data.
- `overridePolicy`: country profile defines allowed grouping.
- `testCases`: mixed cities block when city grouping required; same city/date/type passes.

#### EXP_REQUIRED_ROW_FIELD_MISSING
- `titleRu`: Не хватает поля для Excel
- `descriptionRu`: Required export row field is missing or empty.
- `category`: export
- `phase`: export_readiness
- `severity`: blocker
- `appliesTo`: export
- `blocks`: canExport
- `requiredInputs`: export row model, export contract columns
- `condition`: any required Excel/export field for a row is absent or blank after deterministic row building.
- `agentMessageRu`: Заполните данные, необходимые для выгрузки.
- `adminMessageRu`: В строке выгрузки отсутствует обязательное поле.
- `nextActionRu`: Открыть подачу, заполнить поле, пересобрать предварительный просмотр.
- `safeCopyNotes`: Redact direct identifiers in snapshots.
- `overridePolicy`: none unless column is marked optional in export contract.
- `testCases`: missing applicant name blocks; complete required row passes.

#### EXP_MANUAL_REVIEW_REMAINS
- `titleRu`: Остались поля ручной проверки
- `descriptionRu`: Manual review fields remain visible before export.
- `category`: export
- `phase`: export_readiness
- `severity`: warning
- `appliesTo`: export
- `blocks`: none
- `requiredInputs`: manualReview flags, admin review state
- `condition`: any non-blocking manual-review flag remains after acceptance.
- `agentMessageRu`: Есть поля, которые нужно проверить вручную.
- `adminMessageRu`: Перед выгрузкой проверьте оставшиеся предупреждения.
- `nextActionRu`: Проверить предупреждения или зафиксировать ручное решение.
- `safeCopyNotes`: Warning copy only; do not imply export is blocked.
- `overridePolicy`: can be upgraded to blocker by explicit export profile.
- `testCases`: non-blocking manual flag warns; no flags produce no finding.

#### EXP_PACKAGE_IDENTITY_STALE
- `titleRu`: Выборка изменилась после формирования файла
- `descriptionRu`: Export package identity must match selected rows.
- `category`: export
- `phase`: export_readiness
- `severity`: blocker
- `appliesTo`: export
- `blocks`: canExport
- `requiredInputs`: selected submission ids, row fingerprint, package identity, export state
- `condition`: generated/downloaded package identity does not match current selected rows.
- `agentMessageRu`: Пакет выгрузки нужно сформировать заново.
- `adminMessageRu`: Выборка изменилась; сформируйте Excel заново.
- `nextActionRu`: Пересобрать предварительный просмотр и файл выгрузки.
- `safeCopyNotes`: No row-level PII in fingerprint logs.
- `overridePolicy`: none.
- `testCases`: row fingerprint drift blocks mark-exported; matching fingerprint passes.

#### EXP_ALREADY_EXPORTED
- `titleRu`: Подача уже выгружена
- `descriptionRu`: Exported submissions are terminal and cannot be exported again as active rows.
- `category`: export
- `phase`: export_readiness
- `severity`: blocker
- `appliesTo`: export
- `blocks`: canExport
- `requiredInputs`: submission.status, exportState, exportedAt
- `condition`: selected submission has normalized status `exported` or export state `marked_exported`.
- `agentMessageRu`: Подача уже находится в истории выгрузки.
- `adminMessageRu`: В выборке есть уже выгруженная подача.
- `nextActionRu`: Уберите подачу из активной выборки или откройте историю.
- `safeCopyNotes`: Do not mutate exported state.
- `overridePolicy`: none.
- `testCases`: exported selected row blocks; ready_for_export selected row proceeds to other checks.

#### DOC_PACKAGE_INSURANCE_FUTURE
- `titleRu`: Страховка для будущей проверки документов
- `descriptionRu`: Insurance belongs to future document package readiness, not appointment readiness.
- `category`: files
- `phase`: document_package_readiness
- `severity`: info
- `appliesTo`: review
- `blocks`: none
- `requiredInputs`: future document package profile, insurance file state
- `condition`: document package phase is enabled and insurance file is absent.
- `agentMessageRu`: Страховка относится к будущей проверке пакета документов.
- `adminMessageRu`: Страховка не блокирует MVP запись; проверяется в отдельной фазе.
- `nextActionRu`: Не блокировать appointment readiness; проверить позже when phase is enabled.
- `safeCopyNotes`: Must remain future-phase copy.
- `overridePolicy`: future country profile may make it blocker for document package only.
- `testCases`: missing insurance does not block appointment; future document phase can report info/blocker by config.

#### DOC_PACKAGE_HOTEL_FUTURE
- `titleRu`: Бронь проживания для будущей проверки документов
- `descriptionRu`: Hotel booking belongs to future document package readiness, not appointment readiness.
- `category`: files
- `phase`: document_package_readiness
- `severity`: info
- `appliesTo`: review
- `blocks`: none
- `requiredInputs`: future document package profile, hotel booking file state
- `condition`: document package phase is enabled and lodging evidence is absent.
- `agentMessageRu`: Бронь проживания относится к будущей проверке пакета документов.
- `adminMessageRu`: Бронь проживания не блокирует MVP запись; проверяется отдельно.
- `nextActionRu`: Не блокировать appointment readiness; проверить позже when phase is enabled.
- `safeCopyNotes`: Must remain future-phase copy.
- `overridePolicy`: future country profile may make it blocker for document package only.
- `testCases`: missing lodging document does not block appointment; future phase can report by config.

#### DOC_PACKAGE_TICKETS_FUTURE
- `titleRu`: Билеты для будущей проверки документов
- `descriptionRu`: Tickets belong to future document package readiness, not appointment readiness.
- `category`: files
- `phase`: document_package_readiness
- `severity`: info
- `appliesTo`: review
- `blocks`: none
- `requiredInputs`: future document package profile, tickets file state
- `condition`: document package phase is enabled and tickets evidence is absent.
- `agentMessageRu`: Билеты относятся к будущей проверке пакета документов.
- `adminMessageRu`: Билеты не блокируют MVP запись; проверяются отдельно.
- `nextActionRu`: Не блокировать appointment readiness; проверить позже when phase is enabled.
- `safeCopyNotes`: Must remain future-phase copy.
- `overridePolicy`: future country profile may make it blocker for document package only.
- `testCases`: missing tickets do not block appointment; future phase can report by config.

#### DOC_PACKAGE_BANK_FUTURE
- `titleRu`: Финансовые документы для будущей проверки
- `descriptionRu`: Financial evidence belongs to future document package readiness, not appointment readiness.
- `category`: files
- `phase`: document_package_readiness
- `severity`: info
- `appliesTo`: review
- `blocks`: none
- `requiredInputs`: future document package profile, financial file state
- `condition`: document package phase is enabled and configured financial evidence is absent.
- `agentMessageRu`: Финансовые документы относятся к будущей проверке пакета документов.
- `adminMessageRu`: Финансовые документы не блокируют MVP запись; проверяются отдельно.
- `nextActionRu`: Не блокировать appointment readiness; проверить позже when phase is enabled.
- `safeCopyNotes`: Must remain future-phase copy.
- `overridePolicy`: future country profile may make it blocker for document package only.
- `testCases`: missing financial evidence does not block appointment; future phase can report by config.

#### DOC_PACKAGE_EMPLOYMENT_FUTURE
- `titleRu`: Документы о занятости для будущей проверки
- `descriptionRu`: Employment evidence belongs to future document package readiness, not appointment readiness.
- `category`: files
- `phase`: document_package_readiness
- `severity`: info
- `appliesTo`: review
- `blocks`: none
- `requiredInputs`: future document package profile, employment file state
- `condition`: document package phase is enabled and configured employment evidence is absent.
- `agentMessageRu`: Документы о занятости относятся к будущей проверке пакета документов.
- `adminMessageRu`: Документы о занятости не блокируют MVP запись; проверяются отдельно.
- `nextActionRu`: Не блокировать appointment readiness; проверить позже when phase is enabled.
- `safeCopyNotes`: Must remain future-phase copy.
- `overridePolicy`: future country profile may make it blocker for document package only.
- `testCases`: missing employment evidence does not block appointment; future phase can report by config.

#### DOC_PACKAGE_INVITATION_FUTURE
- `titleRu`: Приглашение для будущей проверки документов
- `descriptionRu`: Invitation evidence belongs to future document package readiness, not appointment readiness.
- `category`: files
- `phase`: document_package_readiness
- `severity`: info
- `appliesTo`: review
- `blocks`: none
- `requiredInputs`: future document package profile, invitation file state
- `condition`: document package phase is enabled and configured invitation evidence is absent.
- `agentMessageRu`: Приглашение относится к будущей проверке пакета документов.
- `adminMessageRu`: Приглашение не блокирует MVP запись; проверяется отдельно.
- `nextActionRu`: Не блокировать appointment readiness; проверить позже when phase is enabled.
- `safeCopyNotes`: Must remain future-phase copy.
- `overridePolicy`: future country profile may make it blocker for document package only.
- `testCases`: missing invitation does not block appointment; future phase can report by config.

#### SYS_UNKNOWN_DATA_FAIL_CLOSED
- `titleRu`: Критичные данные неизвестны
- `descriptionRu`: Unknown data fails closed for critical gates.
- `category`: system
- `phase`: system_safety
- `severity`: blocker
- `appliesTo`: appointment_readiness, submit, accept, ready_for_export, export
- `blocks`: appointmentReadiness, canSubmit, canAccept, canMarkReadyForExport, canExport
- `requiredInputs`: rule requiredInputs metadata, input presence map
- `condition`: a blocker rule cannot evaluate because required critical input is missing or unknown.
- `agentMessageRu`: Не хватает данных для проверки готовности.
- `adminMessageRu`: Критичные данные отсутствуют; действие заблокировано.
- `nextActionRu`: Заполнить недостающие данные или восстановить источник.
- `safeCopyNotes`: State missing-evidence behavior clearly.
- `overridePolicy`: none for critical gates.
- `testCases`: unknown passport expiry blocks; optional warning input absence follows that rule's policy.

#### SYS_COPY_SAFETY
- `titleRu`: Безопасная формулировка результата
- `descriptionRu`: Rule output must stay operational and avoid outcome promises or machine-authority wording.
- `category`: system
- `phase`: system_safety
- `severity`: blocker
- `appliesTo`: appointment_readiness, submit, review, accept, ready_for_export, export
- `blocks`: canSubmit, canAccept, canMarkReadyForExport, canExport
- `requiredInputs`: rendered rule messages, audit text, test snapshots
- `condition`: generated or stored copy contains prohibited outcome, authority, or machine-decision wording.
- `agentMessageRu`: Текст результата проверки требует безопасной формулировки.
- `adminMessageRu`: Текст результата проверки содержит небезопасную формулировку.
- `nextActionRu`: Заменить текст на нейтральную операционную формулировку.
- `safeCopyNotes`: This rule validates copy safety for all other rules.
- `overridePolicy`: none.
- `testCases`: unsafe outcome promise blocks release; neutral missing-data copy passes.

#### SYS_PII_SNAPSHOT_MINIMIZATION
- `titleRu`: Минимизация персональных данных
- `descriptionRu`: Rule logs and snapshots must not expose unnecessary personal identifiers.
- `category`: system
- `phase`: system_safety
- `severity`: blocker
- `appliesTo`: appointment_readiness, submit, review, accept, ready_for_export, export
- `blocks`: canSubmit, canAccept, canMarkReadyForExport, canExport
- `requiredInputs`: logs, test snapshots, rule payload serialization
- `condition`: rule output, logs, or snapshots include direct contact values, full passport numbers, or unnecessary full personal identifiers.
- `agentMessageRu`: Данные проверки требуют маскирования.
- `adminMessageRu`: В служебном выводе есть лишние персональные данные.
- `nextActionRu`: Маскировать значения и оставить только минимально нужный контекст.
- `safeCopyNotes`: Redact by default; show identifiers only inside authorized detail surfaces.
- `overridePolicy`: none.
- `testCases`: full passport in snapshot blocks; last digits or internal id pass when needed.

## Task 9B Implementation Recommendations

- Implement the runtime evaluator as a pure function over a normalized
  submission snapshot, country profile, duplicate indexes, appointment context,
  and export context.
- Keep `ruleId` values stable and return structured results:
  `ruleId`, `severity`, `phase`, `blocks`, `messages`, `nextAction`,
  `requiredInputs`, and redacted evidence keys.
- Make Spain the first country profile with fixed `countryCode: "ES"` and
  `countryLabel: "Испания"`, while keeping appointment timing, jurisdiction,
  supported visa types, family consistency, and future document package rules
  profile-driven.
- Keep `document_package_readiness` disabled for MVP appointment gating.
- Map legacy issue/status names at the boundary before evaluation; reject
  unknown status, issue status, media type, and actor role fail-closed.
- Add unit tests for every rule in this catalog before wiring UI decisions.

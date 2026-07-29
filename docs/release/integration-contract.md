# Integration Contract — Agent Flow ↔ Admin Flow

Статус: **FROZEN / change-controlled**

Контракт: `V19-INTEGRATION-CONTRACT-20260729`

Зафиксирован для:

- репозитория `/Users/user/Documents/V-19`;
- общего base commit `ba9ddb34e506babac0514daa58558a71aca3a3b8`;
- потока Agent Flow: `feature/agent-flow`;
- потока Admin Flow: `feature/admin-flow`.

Этот документ фиксирует общий интерфейс двух потоков до изменения product-кода.
Он описывает committed-модель репозитория на указанном SHA, а не подтверждённое
состояние production Supabase. Live schema, RLS и Storage в этой фиксации не
проверялись.

## 1. Власть контракта и запрет самовольных изменений

Порядок источников истины:

1. `docs/release/canonical-domain-contract.md`;
2. non-UI код `src/modules/submissions`;
3. committed Supabase migrations и `src/lib/supabase/database.types.ts`;
4. этот Integration Contract как замороженная граница Agent/Admin;
5. UI, mock/demo, legacy aliases и тестовые fixtures.

Если нижний уровень противоречит верхнему, применяется верхний уровень, а
противоречие считается conformance gap. Широкое физическое право в RLS не
расширяет доменное право роли.

После фиксации запрещено без отдельного согласования менять:

- набор таблиц, связей, canonical/wire mappings и обязательных полей;
- статусную машину и issue lifecycle;
- ownership, write permissions и storage path;
- форму canonical readback;
- RPC, через которые пересекается граница Agent/Admin.

Любое предложение об изменении оформляется до реализации и содержит:

1. точный delta контракта;
2. причину;
3. влияние на таблицы, RLS, RPC, Storage, UI и данные;
4. migration/backfill/rollback plan, если применимо;
5. проверку исходного потока;
6. проверку второго потока;
7. явное одобрение владельцев обоих потоков.

До одобрения действует этот документ. Неодобренная реализация должна быть
остановлена fail-closed.

## 2. Термины

- **Canonical status/type** — значение доменного API и UI.
- **Wire value** — legacy-совместимое значение, физически записываемое в
  committed Supabase schema.
- **DB-required** — колонка `NOT NULL` или обязательная часть вызова RPC.
- **Handoff-required** — поле/инвариант, обязательные перед передачей заявки
  между Agent и Admin, даже если колонка допускает `NULL`.
- **Owner** — `submissions.agent_id`; это владелец intake-данных, а не review-
  решений.
- **Canonical readback** — восстановление одной канонической заявки после
  записи из durable Supabase rows, history и versioned compatibility snapshot.

## 3. Сущности и связи

```text
auth.users
  └─ 1:1 profiles
       ├─ 1:N submissions (agent_id = owner)
       │    ├─ 1:N applicants
       │    │    ├─ 1:N questionnaire_answers
       │    │    ├─ 1:N media_assets
       │    │    │    └─ 0:1 document_assets
       │    │    └─ 0:N corrections
       │    ├─ 0:N corrections
       │    └─ 0:N status_history (logical entity link)
       ├─ 1:N export_batches (created_by = admin)
       │    └─ 1:N export_batch_members
       └─ 0:N document_export_events (created_by = admin/system)

media_assets.(storage_bucket, storage_path)
  └─ logical 1:1 storage.objects in private bucket submission-media
```

`status_history.entity_id` — логическая ссылка без FK. `export_batches.submission_ids`
— массив logical IDs; `export_batch_members` является нормализованным immutable
snapshot состава batch.

## 4. Используемые Supabase tables

### 4.1 Core handoff tables

#### `public.profiles`

Назначение: identity и role boundary.

DB-required:

- `id` — PK, FK → `auth.users.id`;
- `email`;
- `display_name`;
- `role` — `agent | admin`;
- `created_at` — DB default допустим.

Optional: `organization_name`.

Ownership и запись:

- профиль создаётся только доверенным provisioning flow;
- пользователь не меняет собственный `role`;
- Agent/Admin читаются как actor identities, но роль не является UI-
  переключателем.

#### `public.submissions`

Назначение: aggregate root заявки и durable ownership/status projection.

DB-required:

- `id` — text PK;
- `agent_id` — FK → `profiles.id`;
- `type` — `single | family`;
- `title`;
- `country`;
- `city`;
- `travel_date`;
- `status` — physical `public.submission_status`;
- `priority` — `Высокий | Средний | Низкий`;
- `readiness_percent` — `0..100`;
- `appointment_status`;
- `created_at`, `updated_at`;
- `case_revision` — non-negative optimistic-concurrency revision.

Handoff-required:

- immutable `id`, `agent_id`, `type`;
- non-blank `title`, `city`;
- primary country is fixed: runtime label `country = Испания`, canonical code
  `countryCode = ES` (code persists in the canonical snapshot because the
  physical table has no separate `country_code` column);
- normalized non-blank `trip_date_from` and `trip_date_to`;
- canonical status recoverable by Section 7;
- complete package guards from Sections 5 and 6;
- `submitted_at` on first successful submit;
- `exported_at` only on atomic export completion.

Compatibility/derived:

- `public_number` — nullable до полного questionnaire; затем globally unique
  `1..9999`, назначается только
  `public.ensure_submission_public_number(submission_id)` и после назначения
  immutable;
- `family_intelligence` — JSONB compatibility envelope containing versioned
  `v19CockpitSnapshot`; it is not permission authority;
- `review_started_at`, `accepted_at`;
- `exported_at` until export;
- legacy `travel_date` remains a compatibility field, while the normalized
  range is authoritative for new writes.

Relations:

- N:1 `agent_id → profiles.id`;
- 1:N to `applicants`, `questionnaire_answers`, `media_assets`, `corrections`;
- logical 1:N to submission `status_history`;
- N:M to `export_batches` through snapshot membership.

#### `public.applicants`

Назначение: один заявитель внутри single/family submission.

DB-required:

- `id` — text PK;
- `submission_id` — FK → `submissions.id`, cascade delete;
- `full_name`;
- `role`;
- `passport_number`;
- `country`;
- `city`;
- `trip_dates`;
- `role_confirmed`;
- `questionnaire_percent`, `media_percent` — `0..100`;
- `created_at`, `updated_at`.

Handoff-required для `submitted_for_review`:

- `full_name`;
- `role`;
- `passport_number`, не placeholder `-`;
- `birth_date`;
- `citizenship`;
- `address`;
- `phone`;
- `email`;
- `passport_issued_at`;
- `passport_expires_at`;
- `country`;
- `city`;
- `trip_dates`;
- `hotel_name`;
- `hotel_address`.

Single:

- ровно один applicant;
- он считается primary.

Family:

- минимум один applicant;
- primary resolver выбирает единственного applicant с `role = main`;
- если `main` отсутствует, legacy-compatible fallback — первый applicant;
- более одного `main` делает primary неоднозначным и блокирует handoff;
- каждый applicant принадлежит только своей submission.

Optional до handoff: `suggested_role`, `patronymic`. Persisted
`role_confirmed` — compatibility/UI field и не заменяет primary resolver.

Relations:

- N:1 `submission_id → submissions.id`;
- уникальная пара `(id, submission_id)` используется composite FK children;
- 1:N to `questionnaire_answers`, `media_assets`, applicant-scoped
  `corrections`.

Canonical applicant role mapping:

| Canonical role | New-write `applicants.role` | Read aliases |
|---|---|---|
| `main` | `Основной заявитель` | `main`, `Основной заявитель` |
| `spouse` | `Супруг` | `spouse`, `Супруг`, `Супруга`, `Супруг(а)`, `Супруг/супруга` |
| `child` | `Ребёнок` | `child`, values beginning with `Ребёнок` or `Ребенок` |

Любое другое/пустое role value на canonical readback отклоняется fail-closed.
Существующий write mapper содержит defensive fallback `Заявитель` для
неизвестного runtime role, но собственный read mapper его не принимает.
Поэтому оба новых потока обязаны валидировать canonical role до persistence и
никогда не записывать этот fallback.

#### `public.questionnaire_answers`

Назначение: нормализованные ответы каждого applicant.

DB-required:

- `id` — UUID PK, DB default допустим;
- `submission_id` — FK → `submissions.id`;
- `applicant_id` — FK → `applicants.id`;
- `section_id`;
- `field_id`;
- `label`;
- `value` — JSONB;
- `created_at`, `updated_at`.

Optional: `updated_by → profiles.id`.

Invariants:

- unique `(applicant_id, section_id, field_id)`;
- `applicant_id` обязан принадлежать той же `submission_id`;
- `section_id`, `field_id`, `label` — non-blank;
- handoff требует непустой и валидный ответ для каждого required field из
  Appendix A у каждого applicant;
- unknown/duplicate field не подменяет required field.

`value` имеет две совместимые формы:

- plain JSON string для ответа без metadata;
- exact versioned envelope с `kind = v19_questionnaire_field` и `version = 1`,
  где semantic `value` остаётся ответом, а review/provenance metadata
  сохраняется рядом.

Envelope fields:

- required discriminator: `kind`, `version`;
- required semantic payload: string `value`;
- optional review metadata:
  `adminReviewApprovedAtIso`, `adminReviewApprovedBy`,
  `reviewConfirmedAtIso`, `reviewConfirmedBy`, `reviewOriginSource`,
  `reviewSource`, `reviewState`.

Другой `kind` или unsupported `version` не может нести trusted review metadata
и обрабатывается fail-closed/как unapproved semantic fallback. Missing
`version` также запрещён для новых writes и не может удовлетворять Admin
approval/readiness contract.

Frozen reader compatibility caveat: текущий mapper принимает
`kind = v19_questionnaire_field` при отсутствующем `version` и восстанавливает
review metadata. Это base conformance gap, а не разрешённый wire shape. Agent и
Admin Flow не должны считать unversioned approvals доверенными до hardening
reader либо явного migration/normalization delta.

Subfield ownership внутри envelope:

- owning Agent меняет semantic `value`;
- approved Agent/system intake use cases меняют `reviewState`,
  `reviewSource`, `reviewOriginSource`, `reviewConfirmedAtIso`,
  `reviewConfirmedBy`;
- Admin во время `submitted_for_review | corrections_received` меняет только
  `adminReviewApprovedAtIso` и `adminReviewApprovedBy` у восьми passport review
  fields: `first-name`, `surname`, `passport-no`, `birth-date`,
  `passport-issue-place`, `passport-expiry-date`, `birth-place`,
  `birth-country`;
- semantic изменение Agent автоматически очищает оба
  `adminReviewApproved*` поля;
- Admin approval не изменяет semantic `value`;
- persistence обязана merge/preserve metadata, а не заменять весь envelope
  устаревшей копией.

#### `public.media_assets`

Назначение: durable metadata канонических документов и admin review result.

DB-required:

- `id` — text PK;
- `submission_id` — FK → `submissions.id`;
- `applicant_id` — composite relation к applicant той же submission;
- `type` — physical `media_slot_type`;
- `storage_bucket` — только `submission-media`;
- `storage_path`;
- `upload_status` — `none | uploaded`;
- `review_status` —
  `not_reviewed | accepted | replace_required | poor_quality`.

Handoff-required для uploaded canonical slot:

- `generated_file_name`;
- `upload_status = uploaded`;
- canonical bucket/path из Section 6;
- отсутствие `replace_required | poor_quality` при Agent submit;
- перед `ready_for_export`: `review_status = accepted`, valid persisted
  `reviewed_at`, non-blank Admin `reviewed_by` и canonical private storage
  identity.

New-upload metadata, обязательные для browser upload use case, хотя physical
columns nullable для legacy rows:

- `original_file_name`;
- `mime_type`;
- `size_bytes > 0`;
- `uploaded_at`.

Admin-owned review fields:

- `review_status`;
- `reviewed_at`;
- `reviewed_by → profiles.id`.

Invariants:

- unique `(applicant_id, type)`;
- Agent не задаёт и не сохраняет admin review metadata;
- замена binary/content очищает прежнее review decision;
- legacy `photo_white`, `video`, `pdf` и неизвестные значения не входят в
  canonical Agent/Admin handoff.

#### `public.corrections`

Назначение: admin issues и их Agent/Admin lifecycle.

DB-required:

- `id` — UUID PK, DB default допустим;
- `submission_id` — FK → `submissions.id`;
- `scope` — `submission | applicant | field | media`;
- `reason` — non-blank;
- `severity` — `blocking | note`;
- `status` — physical `open | fixed | closed`;
- `created_by` — FK → `profiles.id`;
- `created_at`.

Conditional required:

- `applicant_id` for applicant/field/media scope;
- `field_key` for field scope;
- `media_type` for media scope;
- `fixed_at` when Agent submits a concrete fix.

Ownership:

- only Admin or authorized system creates `open`;
- only owning Agent changes canonical `open → fixed_by_agent`;
- only Admin changes canonical `fixed_by_agent → closed_by_admin`;
- closed issue is terminal.

Canonical → wire shape:

| Canonical issue field | Physical correction |
|---|---|
| status `open | fixed_by_agent | closed_by_admin` | `open | fixed | closed` |
| severity `blocker` | `blocking` |
| severity `warning | info` | `note` |
| type `file | media` | `scope = media`, canonical `media_type` required |
| type `field | section` | `scope = field`, `field_key = target.field` required |
| required non-blank `reason` + required non-blank `comment` | one `reason` string joined as `reason — comment` |

Normalized fallback читает physical `note` как canonical `warning` и не может
восстановить отдельный `comment`; versioned cockpit snapshot сохраняет точную
severity/reason/comment форму. Section issue без конкретного `target.field`
не может быть записан этим wire mapper и обязан fail closed, а не создавать
невалидную correction.

#### `public.status_history`

Назначение: durable audit и disambiguation канонического статуса.

DB-required:

- `id` — UUID PK, DB default допустим;
- `entity_type` — `submission | applicant | media | appointment`;
- `entity_id`;
- `to_status`;
- `comment` — empty string допустим;
- `changed_by` — FK → `profiles.id`;
- `changed_at`;
- `source` — `agent | admin | bb | system`.

Conditional required:

- `from_status` для любого перехода существующей submission;
- canonical `from_status`/`to_status` для нового Agent/Admin flow;
- non-blank `note` для причины return, corrective handoff и специальных
  system transitions.

History append-only по доменному контракту. Она не используется для обхода
transition guards.

#### `app_private.admin_submission_mutation_receipts`

Назначение: idempotent replay и actor binding для
`save_admin_submission_batch_if_current`.

DB-required:

- `operation_id` — UUID PK;
- `actor_id` — authenticated Admin actor;
- `request_fingerprint` — lowercase SHA-256, 64 hex chars;
- `created_at`.

Completion fields:

- `result` — exact cached RPC response;
- `completed_at`.

Ownership/access:

- browser/UI не читает и не пишет receipt table напрямую;
- только Admin batch RPC создаёт, блокирует, завершает и очищает receipts;
- тот же `(actor_id, operation_id, request_fingerprint)` безопасно replay-ит
  сохранённый result;
- другой actor или тот же operation ID с другим fingerprint отклоняется;
- incomplete/failed transaction не публикует частичный result.

### 4.2 Committed Admin export persistence

#### `public.document_assets`

Назначение: derived validation/document projection принятого `media_assets`.

DB-required:

- `id`;
- `submission_id`;
- `applicant_id`;
- `type` — `passport_scan | selfie_1 | selfie_2`;
- `bucket = submission-media`;
- `storage_path`;
- `upload_status` — `pending | uploaded | failed`;
- `validation_status` — `pending | passed | failed`;
- `export_status` — `not_ready | ready | exported`;
- `created_at`, `updated_at`.

Relations/invariants:

- optional unique `source_media_asset_id → media_assets.id`;
- unique `(submission_id, applicant_id, type)`;
- type projection `selfie → selfie_1`;
- `validation_status = passed` and `export_status = ready` require uploaded,
  path-valid and Admin-accepted source media;
- это system-derived projection, Agent и Admin не редактируют её вручную.
- наличие этой projection не разрешает ZIP/package artifact: active canonical
  export остаётся Excel-only.

#### `public.export_batches`

Назначение: immutable identity успешно подготовленного/завершённого export
package.

DB-required:

- `id`;
- `created_by → profiles.id`;
- `created_at`;
- `format` — `xlsx | csv`;
- `row_count >= 0`;
- `submission_ids` — non-empty for a real package.

Handoff-required:

- `idempotency_key`;
- `file_name`;
- `content_fingerprint`;
- canonical active `format = xlsx`; physical `csv` остаётся compatibility value,
  но не активирует новый artifact;
- `row_count > 0` и точно равен текущему числу applicants выбранных submissions;
- `submission_ids` уникальны, non-blank и существуют;
- все selected submissions имеют одинаковые physical `city` и `travel_date`;
- все submissions в одном approved export operation остаются
  `ready_for_export` до atomic completion.

Only Admin-initiated export RPC may create the durable batch.

#### `public.export_batch_members`

Назначение: immutable snapshot ownership и applicant membership export batch.

DB-required:

- `export_batch_id → export_batches.id`;
- `submission_id → submissions.id`;
- `applicant_id → applicants.id`;
- `source_agent_id → profiles.id`;
- `source_agent_display_name`;
- `city`;
- `submission_type`;
- `submission_title`;
- `applicant_name`;
- `submission_order > 0`;
- `applicant_order > 0`;
- `created_at`.

Conditional:

- `family_submission_id = submission_id` for family;
- `family_submission_id IS NULL` for single.

Primary key: `(export_batch_id, applicant_id)`. Запись создаётся system-side
одновременно с batch и после этого не изменяется.

#### `public.document_export_events`

Статус: **extension-only / not active in this frozen contract**.

Назначение committed schema: audit результата ZIP/document export. Верхний
canonical contract разрешает сейчас только Excel; создание ZIP,
`DOCUMENT_EXPORT_CREATED` или обязательная привязка Excel к ZIP требуют
отдельного approved contract delta по Section 1.

DB-required:

- `id`;
- `event_type = DOCUMENT_EXPORT_CREATED`;
- non-empty `submission_ids`;
- `asset_ids`;
- safe `zip_file_name`;
- `file_count >= 0`;
- `created_at`.

Handoff-required:

- `package_identity_key`;
- `created_by`;
- `applicant_count`;
- `workbook_file_name`.

Если extension будет отдельно одобрен, событие создаётся только успешно
завершившимся atomic command; failure не оставляет partial event.

### 4.3 Storage contract

Используется приватный bucket `submission-media` и `storage.objects`.

Канонический object path:

```text
submissions/{submissionId}/applicants/{applicantId}/{type}/{filename}
```

Допустимые Agent media types:

- `passport_scan`;
- `selfie`;
- `selfie_2`.

Требования:

- без leading slash, `//`, `..` и дополнительного path segment;
- `{submissionId}` и `{applicantId}` совпадают с relational ownership;
- `{filename}` совпадает с `generated_file_name`;
- generated filename использует безопасный system format:
  `{token}_passport_scan.{jpg|jpeg|png|heic|heif|pdf}`,
  `{token}_selfie.{jpg|jpeg|png|heic|heif}` или
  `{token}_selfie_2.{jpg|jpeg|png|heic|heif}`;
- object и `media_assets` metadata должны появляться/исчезать согласованно;
- read разрешён owner Agent и Admin;
- Agent write разрешён только для owned editable submission и canonical path;
- bucket остаётся private; UI получает только short-lived signed URL;
- `selfie`/`selfie_2`: JPEG, PNG, HEIC/HEIF, максимум 50 MB;
- `passport_scan`: JPEG, PNG, HEIC/HEIF или `application/pdf`, максимум 50 MB;
- PDF допустим как формат canonical `passport_scan`, но отдельный media type
  `pdf` не является каноническим Agent slot.

### 4.4 Explicitly outside this cross-stream contract

Следующие таблицы не меняют Agent→Admin handoff и не могут использоваться как
альтернативный source of truth:

- `access_requests`;
- `appointments`;
- `admin_pdf_artifacts`;
- `returned_pdf_handoff_artifacts`;
- `agent_return_packages`;
- `agent_return_package_artifacts`;
- `public.submission_files` и private bucket `submission-files` — competing
  legacy typed-file model с другим path/MIME/name contract; новый Agent/Admin
  flow не читает, не пишет и не использует их для readiness;
- ZIP/document-package creation и `document_export_events`;
- AI/OCR quota/audit tables.

Их отдельные workflows остаются extension contracts. Добавить их в основной
handoff можно только через change protocol Section 1.

## 5. Обязательный submission package

Для перехода в `submitted_for_review`:

- single содержит ровно одного applicant;
- family содержит минимум одного applicant и одного primary;
- у каждого applicant заполнены handoff-required profile/passport/hotel fields;
- у каждого applicant заполнены все required questionnaire fields;
- у каждого applicant есть uploaded `passport_scan`;
- у single/primary family applicant дополнительно есть uploaded `selfie` и
  `selfie_2`;
- secondary family applicants не обязаны иметь selfie slots;
- нет required media со статусом `replace_required | poor_quality`;
- нет unresolved issue;
- каждый media row совпадает с private Storage object path;
- transition и actor записаны в `status_history`.

Для `ready_for_export` дополнительно:

- нет `open` и `fixed_by_agent` issues;
- восемь passport review fields каждого applicant имеют Admin approval actor и
  timestamp для текущего semantic value;
- все required media имеют `review_status = accepted`, valid persisted
  `reviewed_at`, non-blank Admin `reviewed_by` и canonical private storage
  identity;
- `document_assets` projection валиден;
- review action прошёл одним canonical command.

## 6. Media type mapping

| Canonical UI/domain | `media_assets.type` wire | Storage segment | `document_assets.type` |
|---|---|---|---|
| `passport_scan` | `passport_scan` | `passport_scan` | `passport_scan` |
| `selfie` (front) | `selfie` | `selfie` | `selfie_1` |
| `selfie_2` (side) | `selfie_2` | `selfie_2` | `selfie_2` |

Запрещены в новом handoff: `photo`, `photo_white`, `video`, unknown media.
Physical enum может содержать legacy values, но это не разрешение записывать их
из Agent/Admin flow.

## 7. Status machine

### 7.1 Единственные canonical submission statuses

1. `draft`
2. `in_progress`
3. `submitted_for_review`
4. `returned`
5. `corrections_received`
6. `ready_for_export`
7. `exported`

`exported` — terminal.

### 7.2 Canonical → committed Supabase wire mapping

| Canonical | Physical `submissions.status` |
|---|---|
| `draft` | `draft` |
| `in_progress` | `filling` |
| `submitted_for_review` | `waiting_review` |
| `returned` | `returned` |
| `corrections_received` | `waiting_review` |
| `ready_for_export` | `ready_for_excel` |
| `exported` | `exported` |

`submitted_for_review` и `corrections_received` намеренно делят legacy wire
value. Поэтому write обязан сохранять canonical status в versioned cockpit
snapshot и canonical `status_history.to_status`. Новый код не угадывает эти два
состояния только по `waiting_review`.

Canonical readback:

1. загрузить owned/visible `submissions` row и normalized child rows;
2. если `v19CockpitSnapshot` valid — нормализовать его canonical model;
3. overlay durable applicants, answers, media, corrections, export rows и
   durable history;
4. physical `exported` плюс valid `exported_at` принудительно подтверждает
   terminal `exported`;
5. при missing/corrupt snapshot использовать последний valid canonical
   submission history status, затем legacy row mapping как fallback;
6. unknown/ambiguous data без durable evidence quarantines/fails closed.

Legacy read aliases допускаются только на read boundary:

- `filling → in_progress`;
- `ready_for_review | waiting_review | in_review → submitted_for_review`, если
  отсутствует более точное canonical history/snapshot evidence;
- `accepted | ready_for_excel → ready_for_export`;
- `requires_action | attention_required → returned`;
- appointment/completed legacy values дают `exported` только при valid
  `exported_at`, иначе `ready_for_export`.

### 7.3 Допустимые переходы и actor

| ID | Action | Кто меняет | From | To | Обязательные guards |
|---|---|---|---|---|---|
| T0 | Create draft | Agent | none | `draft` | Authenticated Agent становится owner; canonical initial data. |
| T1 | Save/start | Owning Agent | `draft` | `in_progress` | Минимум один applicant; incomplete package разрешён. |
| T2 | Submit/re-submit | Owning Agent | `in_progress`, `ready_for_export` | `submitted_for_review` | Полный package; нет unresolved issue; re-submit очищает export readiness и требует нового review. |
| T3 | Return with issues | Admin | `submitted_for_review` | `returned` | Минимум один новый valid `open` issue; нет export commit. |
| T4 | Accept first review | Admin | `submitted_for_review` | `ready_for_export` | Нет open/fixed issues; полный package; восемь passport fields каждого applicant имеют current Admin approval; required media имеют accepted status + persisted review actor/time + private storage identity. |
| T5 | Submit corrections | Owning Agent | `returned` | `corrections_received` | Каждое open issue конкретно исправлено и стало `fixed_by_agent`; package остаётся полным. |
| T6 | Close and accept | Admin | `corrections_received` | `ready_for_export` | Все fixes проверены и закрыты; open отсутствуют; исправленные passport fields повторно подтверждены; required media имеют accepted status + persisted review actor/time + private storage identity. |
| T7 | Return again | Admin | `corrections_received` | `returned` | Создан минимум один новый valid open issue; closed issues не переоткрываются. |
| T8 | Prepare Excel export | Admin-initiated, authorized system | `ready_for_export` | `ready_for_export` | Excel-only, status-preserving; unique submission set; exact applicant row count; one city/travel-date group; identity/idempotency/fingerprint guards; нет issues. |
| T9 | Complete Excel export | Admin-initiated, authorized system commits | `ready_for_export` | `exported` | Workbook generated and downloaded/committed; valid identity/fingerprint; exact selected state; `exported_at`; atomic, no partial writes. |

Любой неуказанный переход запрещён.

Canonical command boundary:

- Agent draft/submit: `public.save_submission_draft(payload)`;
- post-questionnaire public number:
  `public.ensure_submission_public_number(submission_id)`;
- Agent correction handoff:
  `public.submit_corrections_handoff(payload)`;
- Admin multi-case review save:
  `public.save_admin_submission_batch_if_current(payloads,
  expected_revisions, actor_id, operation_id)`;
- Admin export completion:
  `public.complete_export_package(payload)`.

На frozen base `complete_export_package` hard-coupled с обязательным
`document_export`/ZIP payload и event. Это противоречит Excel-only authority.
RPC нельзя использовать для release T9, пока approved delta либо:

1. не отделит Excel completion от ZIP/document extension; либо
2. отдельно не одобрит ZIP/package contract с влиянием на оба потока.

Admin save обязан использовать `case_revision` и stable `operation_id`;
stale revision или повтор с другим payload отклоняется без partial mutation.

### 7.4 Issue status machine

Canonical:

```text
none --Admin/system--> open --owning Agent--> fixed_by_agent --Admin--> closed_by_admin
```

Wire mapping:

| Canonical issue | `corrections.status` |
|---|---|
| `open` | `open` |
| `fixed_by_agent` | `fixed` |
| `closed_by_admin` | `closed` |

Forbidden:

- `open → closed_by_admin`;
- `fixed_by_agent → open`;
- `closed_by_admin → open | fixed_by_agent`;
- Agent creates review issue;
- Admin marks Agent work fixed;
- old closed issue is reopened вместо нового issue.

## 8. Entity ownership and write rights

| Entity / field group | Owner | Кто читает | Кто меняет |
|---|---|---|---|
| `profiles` identity/role | Trusted provisioning | Self/Admin as permitted | Trusted provisioning only |
| `submissions.agent_id`, `id`, `type` | System assignment + owning Agent aggregate | Owning Agent, Admin | Create command only; immutable after creation |
| Submission intake fields, applicants, questionnaire semantic values | Owning Agent | Owning Agent, Admin | Owning Agent only in `draft`, `in_progress`, `returned`; canonical command boundary |
| Questionnaire intake provenance/confirmation metadata | Owning Agent/system workflow | Owning Agent, Admin | Approved Agent/system intake commands; semantic change invalidates stale approvals |
| Passport field `adminReviewApproved*` metadata | Admin | Owning Agent, Admin | Admin only during `submitted_for_review`, `corrections_received`; never changes semantic answer |
| Media binary + upload metadata | Owning Agent | Owning Agent, Admin | Owning Agent in editable state; replacement clears review |
| Media review fields | Admin | Owning Agent, Admin | Admin only during review |
| Issue creation/reason/target/severity | Admin | Owning Agent, Admin | Admin/system creates new issue; existing target/history immutable |
| Issue fix evidence/state | Owning Agent | Owning Agent, Admin | Agent only `open → fixed_by_agent` during correction handoff |
| Issue closure | Admin | Owning Agent, Admin | Admin only `fixed_by_agent → closed_by_admin` |
| Canonical status | Domain command | Owning Agent, Admin | Actor from transition table only |
| `status_history` | Audit/system | Owning Agent, Admin | Append by successful canonical command; no manual rewrite |
| `case_revision` | System | Owning Agent, Admin | Atomic persistence RPC only |
| `public_number` | Submission aggregate | Owning Agent, Admin | `ensure_submission_public_number` only after complete questionnaire; then immutable |
| Admin mutation receipt | Admin RPC/system | Owning Admin operation through RPC only | Batch RPC only; no direct UI access |
| `document_assets` | Derived system projection | Admin; Agent only where downstream contract permits | Trigger/system only |
| Excel export batch/member data | Admin-initiated system command | Admin; downstream Agent view via immutable owner snapshot only | Approved atomic Excel export command only |
| ZIP/document event data | Separately approved extension only | No active cross-flow consumer | Forbidden until approved delta |
| `exported_at` | System commit | Owning Agent, Admin | Approved T9 command only; current ZIP-coupled RPC is blocked |

Role isolation rules:

- Agent никогда не читает и не меняет submission другого Agent;
- Admin видит все reviewable submissions, но не становится owner intake;
- Admin review не переписывает Agent questionnaire/profile content;
- physical RLS capability не является основанием обходить canonical command;
- `service_role` не используется browser/client flow;
- unauthenticated/anon не выполняет workflow RPC.

## 9. Cross-flow persistence proof

Каждая интеграционная проверка обязана доказать:

```text
action
  → expected durable effect
  → canonical readback
  → full page reload / new client read
  → opposite-role visibility and forbidden-write isolation
```

Минимальные сценарии:

1. Agent создаёт single, сохраняет questionnaire/media, перезагружает и
   отправляет; Admin после нового read видит `submitted_for_review`.
2. Agent создаёт family; все applicants и selective selfie requirements
   сохраняются; Admin видит тот же состав и owner.
3. Admin принимает media и submission; Agent после reload видит
   `ready_for_export`, но не может менять Admin review fields.
4. Admin создаёт issue и возвращает; Agent видит `returned`, исправляет,
   semantic answer change очищает прежний Admin field approval, затем Agent
   отправляет corrections; Admin видит `corrections_received`, повторно
   подтверждает исправленные passport fields, закрывает issues и принимает.
5. T9 остаётся `BLOCKED` на frozen base из-за hard-coupled ZIP payload.
   После approved delta Excel command обязан создать согласованные
   batch/member rows и `exported_at` без ZIP event (либо по отдельно
   одобренному ZIP contract); Agent после reload видит terminal `exported`.
6. Отрицательные проверки: чужой Agent не читает/не пишет; Agent не создаёт
   issue и не принимает media; Admin не меняет intake; stale Admin revision,
   forbidden transition и partial Storage metadata отклоняются.

Mock/local-only/optimistic UI state не является доказательством Supabase
persistence.

## 10. Conformance gaps на frozen base

Эти пункты описывают наблюдаемую committed-модель и **не разрешают** менять
контракт:

1. Physical `submission_status` остаётся legacy enum; canonical значения
   требуют adapter + snapshot/history disambiguation.
2. Physical `corrections.status` использует `open | fixed | closed`; canonical
   issue names требуют обязательного mapping.
3. Physical `media_slot_type` содержит legacy slots; canonical boundary должен
   отфильтровывать их.
4. Некоторые child-table RLS policies дают Admin более широкое CRUD-право, чем
   доменная ownership matrix. Admin Flow обязан использовать canonical review
   commands и не менять Agent-owned intake.
5. Committed corrections policies/guards должны быть доказаны live на запрет
   Agent-created `open` issue. До такого evidence это release blocker, а не
   разрешение UI делать insert.
6. `family_intelligence.v19CockpitSnapshot` и normalized rows образуют dual
   representation. Любое расхождение должно завершаться canonical reconcile
   или quarantine, но не silent last-write-wins.
7. Existing `complete_export_package` требует ZIP/document payload и event,
   хотя верхний контракт активирует только Excel. T9 release заблокирован до
   approved delta; committed ZIP tables сами по себе не являются approval.
8. `public.submission_files`/`submission-files` сохраняют конкурирующую
   legacy media model. Они не участвуют в canonical readiness/readback.
9. Physical correction projection объединяет reason/comment и схлопывает
   `warning | info` в `note`; точная форма зависит от valid versioned snapshot,
   иначе fallback обязан быть консервативным.
10. Applicant write mapper может вернуть `Заявитель` для invalid runtime role,
    тогда как read mapper это значение отклоняет. Canonical role validation
    должна остановить write; сам fallback не является новым wire alias.
11. Questionnaire reader принимает `v19_questionnaire_field` без `version` и
    восстанавливает review metadata. Frozen contract требует version 1;
    unversioned Admin approval не release-trusted до approved reader
    hardening/backfill.
12. Live Supabase migration level, RLS, Storage policies и authenticated role
   fixtures не подтверждены этим docs-only этапом.

Исправление любого gap, требующее schema/RLS/RPC change, проходит Section 1 и
обязательную проверку обоих потоков.

## 11. Freeze acceptance checklist

- [ ] Используемые core/export tables перечислены.
- [ ] DB-required и handoff-required fields перечислены.
- [ ] Все entity relations перечислены.
- [ ] Canonical и wire status/media/issue mappings перечислены.
- [ ] Canonical submission statuses ровно семь.
- [ ] Переходы ровно T0–T9; любой иной запрещён.
- [ ] Issue lifecycle ровно
  `open → fixed_by_agent → closed_by_admin`.
- [ ] Ownership и write rights Agent/Admin/System разделены.
- [ ] Questionnaire semantic value и Admin passport approval metadata имеют
  раздельный ownership; Agent edit сбрасывает stale approval.
- [ ] Storage bucket/path/private-access зафиксированы.
- [ ] Canonical RPC boundary зафиксирована.
- [ ] Active export artifact — только Excel; ZIP/document event extension не
  активируется без approved delta.
- [ ] Agent и Admin flow проверяются одним cross-flow proof.
- [ ] Изменение контракта требует описания delta/impact и проверки второго
  потока.

## Appendix A. Required questionnaire field IDs

Required для каждого applicant, согласно canonical questionnaire blueprint:

| Section | Required `field_id` |
|---|---|
| `contacts` | `home-country`, `home-city`, `home-street`, `home-house`, `postal-code`, `email`, `contact-number`, `lives-outside-citizenship` |
| `trip` | `purpose`, `main-destination`, `first-entry-country`, `entry-count`, `arrival-date`, `departure-date`, `stay-duration`, `previous-biometrics` |
| `hotel` | `inviting-party-type`, `hotel-name`, `hotel-address`, `hotel-country`, `hotel-city`, `hotel-postal-code` |
| `appointment` | `appointment-city`, `desired-date-1`, `desired-date-2` |
| `personal` | `surname`, `first-name`, `birth-date`, `birth-place`, `birth-country`, `gender`, `marital-status` |
| `passport` | `passport-type`, `passport-no`, `passport-issue-date`, `passport-expiry-date`, `passport-issue-country`, `passport-issue-place` |
| `employment` | `occupation`, `employer-name` |

Валидация:

- required answer не blank;
- email проходит email format;
- phone содержит 7–18 цифр;
- date валидна в поддерживаемом `DD.MM.YYYY` или ISO representation;
- passport number после удаления пробелов содержит 5–20 букв/цифр/дефисов.

Поля, отмеченные blueprint как `required: false`, остаются optional и не
блокируют handoff.

## Appendix B. Frozen source map

- `docs/release/canonical-domain-contract.md`
- `docs/architecture/v19-flow-state-model.md`
- `src/modules/submissions/domainContract.ts`
- `src/modules/submissions/status.ts`
- `src/modules/submissions/questionnaire.ts`
- `src/modules/submissions/passportReviewContract.ts`
- `src/modules/submissions/supabasePersistence.ts`
- `src/modules/submissions/exportPackagePersistence.ts`
- `src/modules/submissions/mediaStoragePolicy.ts`
- `supabase/migrations/20260611000000_visaflow_mvp_foundation.sql`
- `supabase/migrations/20260624001000_questionnaire_answers_persistence.sql`
- `supabase/migrations/20260707000100_typed_status_history_source.sql`
- `supabase/migrations/20260707001000_document_assets_production_pipeline.sql`
- `supabase/migrations/20260706023000_typed_submission_files.sql`
- `supabase/migrations/20260709234515_agent_return_packages.sql`
- `supabase/migrations/20260713095403_atomic_export_document_completion.sql`
- `supabase/migrations/20260717050000_admin_passport_review_media_policy.sql`
- `supabase/migrations/20260718190000_global_submission_public_numbers.sql`
- `supabase/migrations/20260719160000_assign_public_number_after_questionnaire.sql`
- `supabase/migrations/20260722000000_harden_workflow_rpc_anon_execute.sql`
- `supabase/migrations/20260722001000_admin_submission_batch_concurrency.sql`
- `src/lib/supabase/database.types.ts`

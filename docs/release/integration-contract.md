# Integration Contract — Agent Flow ↔ Admin Flow

Статус: **FROZEN / change-controlled**

Контракт: `V19-INTEGRATION-CONTRACT-20260729`

Зафиксирован для:

- репозитория `/Users/user/Documents/V-19`;
- production release base commit `ad0ef4cd996089ced396c57d77f333facce4be1b`;
- integration branch `codex/document-intake-production-20260729`;
- потока Agent Flow: `feature/agent-flow`;
- потока Admin Flow: `feature/admin-flow`.

Этот документ фиксирует общий интерфейс двух потоков до изменения product-кода.
Он описывает committed-модель репозитория на указанном SHA. В release run
2026-07-29 production project `tsymifccglpepvbmrcgh` проверен read-only по
schema, grants/RLS inventory и role-scoped readback; mutating authenticated
cross-flow proof не выполнялся и остаётся отдельным release evidence gate.

### UI ownership freeze amendment — 2026-07-29

Статус: **FROZEN / UI OWNER HANDOFF PENDING**.

Единственный UI source of truth:

- Codex thread
  `codex://threads/019fab71-8c0c-7db1-b3ae-ba416cf7167c`;
- worktree
  `/Users/user/Documents/V-19/.runtime/worktrees/v19-ui-convergence-20260729`;
- branch `codex/v19-ui-convergence-20260729`;
- base `ad0ef4cd996089ced396c57d77f333facce4be1b`;
- live reference `http://127.0.0.1:4201/`, проверенный по listener cwd;
- UI snapshot остаётся WIP до явного handoff владельца потока и поэтому не
  копируется в release candidate частично.

Ownership:

- UI-поток эксклюзивно владеет rendered JSX/DOM, CSS, visual tokens, copy,
  assets, layout, responsive behavior и interaction presentation;
- integration-поток владеет Supabase adapters, CAS/idempotency, domain rules,
  status/ownership validation и persistence readback;
- integration-поток не имеет права редизайнить, «улучшать» или самостоятельно
  разрешать visual conflict.

Допустимый integration delta:

- только невидимое domain/persistence wiring;
- если adapter plumbing неизбежно пересекает `App.tsx` или component file, оно
  не может менять rendered JSX, class names, copy, styles, visual state,
  ordering или responsive behavior;
- финальный UI-owner snapshot применяется целиком после handoff; текущий
  незавершённый dirty WIP не захватывается.

Исключённый presentation delta:

- integration-поток не добавляет selector связи заявителя; frozen intake
  сохраняет прежнее представление, а отсутствующие explicit roles backend
  детерминированно трактует как `main`, затем `spouse`, затем `child`;
- integration-поток не добавляет T9-blocked карточки, пояснения или новую copy
  в Admin export screen; server/action authority продолжает fail-closed
  запрещать T9 mutation, не меняя frozen presentation;
- canonical issue target остаётся exact field ID в domain/persistence, но
  существующая человекочитаемая label должна отображаться без появления
  technical ID и без изменения прежнего текста.

Влияние:

- Supabase tables, required fields, relations, status machine, entity
  ownership и write rights не меняются;
- текущий integration snapshot с самостоятельным UI delta отозван и не может
  быть принят или deployed;
- production alias не переключается до объединения с exact UI-owner snapshot.

Проверка второго потока:

- после UI handoff повторяются Agent create/edit/correction/reload и Admin
  readback/review/accept/Excel;
- reference и integrated app сравниваются в system Chrome после последнего
  изменения на desktop `1440x900`, tablet `768x900` и mobile `390x844`;
- не допускаются P0/P1 visual differences, horizontal overflow, новая copy,
  потерянные controls или console errors;
- только после этой проверки формируется новый immutable combined snapshot для
  независимых VERIFIER и RED-TEAM.

### Passport review minimal-UI amendment — 2026-07-29

Статус: **REQUESTED / UI OWNER HANDOFF PENDING**.

Точный presentation delta:

- экран `Сверка паспорта` сохраняет паспорт как главный рабочий объект;
- на viewport до `1023px` media pane получает достаточно высоты, чтобы
  оригинал паспорта можно было читать до перехода к полям;
- повторная summary-карточка, длинные пояснения и unrelated corrected-issue
  detail не занимают рабочую область паспортной сверки;
- остаются только необходимые controls: назад, скачать, zoom/rotate/fullscreen
  там, где доступны, выбор оригинала, замечание, applicant switcher, паспортные
  поля, подтверждение секции и итоговые review actions;
- повторяющийся applicant progress и пояснительная copy не должны дублировать
  уже доступные selector, field state и action state;
- полные accessible names, focus order, disabled reason и live error/saving
  feedback сохраняются, даже если видимая mobile-label становится короче.

Baseline evidence:

- reference `390x844`: media stage `179px`, первый passport-field ниже `1093px`;
- reference `768x900`: media stage `191px`, первый passport-field ниже `1082px`;
- runtime-only prototype без изменения source: media stage `449px` на
  `390x844` и `483px` на `768x900`, первый passport-field начинается в первом
  viewport; horizontal overflow отсутствует;
- screenshots находятся вне product repository:
  `/Users/user/Documents/V-19-evidence/document-intake-production-20260729/passport-review-audit`.

Влияние:

- Supabase tables, required fields, relations, status machine, entity
  ownership и write rights не меняются;
- `ReviewWorkspace` продолжает читать тот же submission/media aggregate и
  вызывать те же Admin review handlers;
- ни один Admin approval, issue closure или return/accept action не удаляется
  и не становится автоматическим;
- последним прямым user request текущему integration-потоку разрешён только
  этот bounded passport-review presentation amendment после exact overlay
  UI-owner snapshot;
- все остальные экраны, shared presentation и interaction behavior остаются
  побайтным handoff владельца `4201`; это исключение не разрешает integration
  redesign за пределами `ReviewWorkspace`/его scoped stylesheet.

Проверка второго потока:

- Admin: passport/selfie tabs, zoom/rotate, exact-field remark, section confirm,
  return и accept остаются keyboard/touch reachable на `390`, `768` и `1440`;
- Agent: созданное passport media и исправленное exact field после reload
  отображаются Admin в том же applicant slot; Admin decision после canonical
  readback возвращается Agent без изменения issue target/status;
- hidden explanatory UI не может скрывать validation/error/saving state;
- final source snapshot и browser-proof формируются только после применения
  этого amendment в UI-owner reference `4201`.

### UI interaction evidence alignment — 2026-07-29

Точный delta:

- UI-owner handoff заменяет отдельные preview/confirm/cancel controls family
  copy на одну кнопку с first-click preview и second-click confirm;
- orphan evidence ID `questionnaire.cancel-family-copy`, которого больше нет в
  rendered interaction tree, удаляется из
  `agentInteractionContract`; существующие
  `questionnaire.preview-family-copy` и `questionnaire.copy-family` остаются.

Влияние:

- rendered UI, Supabase tables/relations, status machine, ownership, copy
  payload и persistence handlers не меняются;
- change устраняет только ложное обещание несуществующего interaction в
  evidence catalog.

Проверка второго потока:

- Agent first click только показывает preview, second click применяет тот же
  bounded family-copy plan, reload сохраняет результат;
- Admin readback questionnaire aggregate и exact issue labels остаются
  неизменными; отдельного Admin interaction ID не добавляется.

Local browser-runner alignment:

- fastlane Playwright config принимает только явный
  `PW_BROWSER_CHANNEL=chrome`; без переменной CI сохраняет прежний bundled
  Chromium;
- это test-only launch selection без runtime, UI, Supabase или deploy delta;
- один и тот же localhost server и system Chrome используются для Agent и
  Admin flow, поэтому browser evidence не смешивает разные builds.

Passport evidence alignment:

- Admin review E2E больше не использует визуально скрытую вторичную подпись
  `Паспортная секция` как признак открытого экрана;
- assertion привязан к оставленному пользователю видимому заголовку
  `Данные паспорта`, после чего отдельно проверяет validation alert и disabled
  section action;
- это test-only locator delta: rendered UI, handlers, persistence и status
  machine не меняются;
- protected-media proof теперь явно включает tablet `768x900` и требует не
  менее `400px` высоты media stage на каждом проверяемом viewport, чтобы
  passport original оставался главным рабочим объектом;
- второй поток остаётся покрыт отдельным Agent create/correction/reload
  сценарием и Admin canonical readback того же passport aggregate.

Frozen UI navigation evidence alignment:

- Agent full-flow proof открывает submission через зафиксированный keyboard
  contract карточки (`focus` + `Enter`), а не по её геометрическому центру,
  который после UI-owner handoff может совпасть со вложенным document control;
- Admin navigation proof на экране пользователей проверяет оставленный видимым
  content heading `Пользователи и заявки`; mobile-only скрытый page-level
  `Управление пользователями` больше не считается обязательным visual target;
- это только test locator/click-target delta: JSX, CSS, handlers, accessible
  card action, Supabase persistence и status transitions не меняются;
- отдельный Agent pointer-click test продолжает открывать drawer того же
  submission ID, full-flow дополнительно доказывает keyboard activation, а
  Admin после перехода читает тот же access-request aggregate и отдельно
  проходит review, issue closure, accept и export сценарии.

### Final UI-owner handoff receipt — 2026-07-29

Статус: **FROZEN / LOCALLY INTEGRATED / PRODUCTION UNCHANGED**.

UI-owner source snapshot:

- thread
  `codex://threads/019fab71-8c0c-7db1-b3ae-ba416cf7167c`;
- worktree
  `/Users/user/Documents/V-19/.runtime/worktrees/v19-ui-convergence-20260729`;
- branch `codex/v19-ui-convergence-20260729`;
- base `ad0ef4cd996089ced396c57d77f333facce4be1b`;
- 14-file WIP combined-v2 SHA-256
  `0039224c1be01bd39c586d0b04b5f0737674254dc74893af3b7cfa5465724635`;
- combined-v2 повторно вычислен после owner handoff и не изменился;
- owner technical receipt
  `/Users/user/.codex/visualizations/2026/07/29/019fab71-8c0c-7db1-b3ae-ba416cf7167c/v19-ui-convergence-20260729/technical-receipt.txt`,
  SHA-256
  `f0eb2fe94e98494e7dbb8b4f8356d02364b754993bef62dd0538a6f6b16deb2e`;
- owner browser receipt
  `/Users/user/.codex/visualizations/2026/07/29/019fab71-8c0c-7db1-b3ae-ba416cf7167c/v19-ui-convergence-20260729/browser-receipt.json`,
  SHA-256
  `e85e15d8b39202daff58dc425827658e289fc63a80a0854495481bd13acc7985`,
  verdict `PASS`: 32 screenshots, 32 overflow checks, 635/635 localhost
  responses, zero console/page/network/origin errors;
- owner VERIFIER и RED-TEAM: `0 BLOCKER / 0 HIGH / 0 MEDIUM`.

Точный UI-owner file set:

1. `src/components/AdminUsersAccessScreen.tsx`
2. `src/components/ApplicantsScreen.tsx`
3. `src/components/PreUploadScreen.css`
4. `src/components/PreUploadScreen.tsx`
5. `src/components/WorkspaceSurface.tsx`
6. `src/modules/submissions/components/AgentActionStatusStrip.tsx`
7. `src/modules/submissions/components/AgentActionsCommandCockpit.tsx`
8. `src/modules/submissions/components/FigmaQuestionnaireScreen.tsx`
9. `src/modules/submissions/components/questionnaire-codex-polish-v1.css`
10. `src/shared/ui/v19-design-system.tsx`
11. `src/shared/ui/operational-screen-convergence.css`
12. `tests/e2e-supabase-ui/ui-helpers.ts`
13. `tests/unit/applicantsScreenInteractions.spec.tsx`
14. `tests/unit/figmaQuestionnaireScreen.spec.tsx`

Integrated presentation receipt:

- target worktree `/Users/user/Documents/V-19-release-20260729`;
- branch `codex/document-intake-production-20260729`;
- listener `http://127.0.0.1:4202/`, PID `29152`, cwd равен target
  worktree;
- 12 из 14 handoff files совпадают с owner snapshot побайтно;
- два ожидаемых integration differences — только
  `FigmaQuestionnaireScreen.tsx` и его unit test. В component delta состоит из
  одного import, вычисления existing field label и подстановки этой label в
  две уже существующие text branches; DOM, class names, controls, styles,
  order, layout и responsive behavior не меняются. Unit delta добавляет один
  regression test;
- этот ранее зафиксированный non-visual seam сохраняет canonical issue field
  ID как persistence target, но не показывает technical ID пользователю вместо
  существующей questionnaire label;
- единственный user-approved visual delta после overlay находится в scoped
  `src/shared/ui/review-workspace.css`: минимальный passport review с крупным
  media stage и без второстепенной видимой copy;
- integration test-only deltas ограничены Chrome channel opt-in и evidence
  locators/viewport assertions, описанными выше;
- integrated UI-convergence receipt
  `/Users/user/Documents/V-19-evidence/document-intake-production-20260729/final-ui-convergence-proof/browser-receipt.json`,
  SHA-256
  `bb7ad69ca89a2262b6e67960edce89298b5f8f67fb089809b247a26f0403c1b7`,
  verdict `PASS`: 32 screenshots, 32 overflow checks, 649/649 localhost
  responses, zero console/page/network/origin errors;
- final dual-flow Playwright receipt
  `/Users/user/Documents/V-19-evidence/document-intake-production-20260729/final-dual-flow-browser/playwright/fastlane/.last-run.json`,
  SHA-256
  `91d1c43004802cd49950d78eb11c8fa7d05da8ffffe219a8b13b2f561bc00903`,
  verdict `PASS`: 9/9 tests;
- passport visual evidence:
  `/Users/user/Documents/V-19-evidence/document-intake-production-20260729/passport-final-visual`;
  viewports `360x800`, `390x844`, `768x900`, `1440x900`, media stage не
  меньше `400px`, horizontal overflow отсутствует.

Влияние и второй поток:

- Supabase tables, required fields, relations, status machine, ownership и
  write rights не менялись;
- Agent create/questionnaire/media/reload и Admin canonical readback проходят
  в одном browser flow; Admin reject-invalid, exact issue, close corrected
  issues, accept и Excel проходят на том же integrated runtime;
- presentation-only owner flow дополнительно прошёл copy second-click, reopen,
  hard reload, swipe и role isolation;
- production migration, commit, push, Vercel deploy и alias switch не
  выполнялись.

### P1 repair amendment — production profiles RLS and UI freeze

Статус: **APPROVED FOR LOCAL REPAIR / PREVIOUS FREEZE SUPERSEDED**.

Superseded snapshot:

- combined-v2
  `ef1370e98bd0f828e5d9fc393e6a3bce4e6cae4e0d1e016a6725fa2de8a07e55`
  не принимается, не коммитится и не деплоится;
- независимый RED-TEAM доказал, что production policy `profiles read own or
admin` скрывает Admin creator row от Agent внутри `SECURITY INVOKER`
  `save_agent_submission_if_current`;
- прежний PostgreSQL harness не включал production-equivalent `profiles` RLS,
  поэтому легитимная open → fixed correction давала ложный `PASS`;
- независимый VERIFIER доказал отдельное нарушение UI freeze: новая видимая
  T9/Integration Contract error-copy была добавлена в
  `AdminExportScreen`/`App`, хотя handoff разрешает только frozen presentation.

Точный database delta:

- `save_agent_submission_if_current` остаётся `SECURITY INVOKER`;
- добавляется private, non-mutating
  `app_private.agent_correction_created_by_admin(uuid,text)`:
  `SECURITY DEFINER`, pinned search path, `PUBLIC`/`anon` denied,
  `authenticated` execute only;
- helper возвращает `true` только если durable correction создан профилем
  `admin`, принадлежит переданному submission и вызывающий пользователь либо
  владеет этой submission, либо сам Admin;
- прямой RLS-зависимый lookup `public.profiles` внутри Agent RPC заменяется
  вызовом этого bounded attestation helper;
- PostgreSQL 17 harness включает RLS на `public.profiles` и production policy
  `id = auth.uid() or current_profile_role() = 'admin'` до применения
  migration.

Влияние database delta:

- таблицы, поля, foreign keys, status machine и ownership не меняются;
- helper не возвращает profile row или PII, не создаёт и не меняет correction;
- Agent по-прежнему не может добавить/удалить issue, переписать identity,
  reason, severity, creator, timestamps или закрыть его как Admin;
- единственный разрешённый Agent переход остаётся точный open → fixed после
  реального field/media исправления в собственной returned submission;
- Admin creator attestation больше не зависит от видимости Admin profile row
  через Agent RLS.

Точный UI/action delta:

- удаляются import/branch/setExportError с новой T9-specific copy из
  `AdminExportScreen`; frozen JSX, controls, labels, layout и CSS не меняются;
- App-level `mark_exported` и package callback остаются fail-closed до
  persistence/RPC, но используют только уже существующую generic
  `Действие недоступно в текущем статусе`;
- единый action-authority assertion в `adminExportActions` проверяет canonical
  `mark_exported.releaseState` до чтения Storage/создания Blob; frozen handler
  использует обычный существующий error path без T9-specific copy;
- evidence tests больше не требуют T9/Integration Contract text или отдельную
  blocked-card presentation; они проверяют frozen ZIP control, отсутствие
  prepared/download/confirm artifact и неизменность Excel T8.

Влияние UI/action delta:

- новый видимый текст, badge, card, disabled-state, class или responsive
  behavior не добавляется;
- T9 document ZIP/terminal mutation остаются заблокированы, Excel T8 остаётся
  доступен;
- `onExportPackages`, `completeExportPackage`, external bridge и
  `mark_exported` persistence не вызываются при blocked release state.

Проверка второго потока:

- с production-equivalent profiles RLS Admin-created field и media issues
  проходят Agent exact correction → durable fixed → Admin canonical readback;
- forged Agent issue, creator rewrite, unchanged field, reused media object и
  direct corrections DML остаются `42501`;
- Admin export browser flow сохраняет frozen owner UI, формирует/скачивает
  Excel, не создаёт ZIP artifact и не показывает новую T9-specific copy;
- после repair повторяются full unit/integration, PostgreSQL 17, production
  build/guards, Agent/Admin browser flow и независимые VERIFIER/RED-TEAM на
  новом immutable hash.

### T9 document ZIP activation amendment — 2026-07-29

Статус: **APPROVED FOR IMPLEMENTATION / UI PRESENTATION FROZEN**.

Основание: owner явно потребовал закрыть ZIP и остальные user-visible
functional blockers до commit/push/deploy. Этот amendment заменяет все более
ранние формулировки текущего документа, где T9, ZIP/document event или
`mark_exported` отмечены как blocked/forbidden. Исторические P1 receipts
остаются доказательством прежнего snapshot, но не определяют новый release
state.

#### Точный activation delta

- database schema и migration body для T9 не меняются: используется уже
  зафиксированный `public.complete_export_package(jsonb)` и существующие
  таблицы/триггеры;
- canonical `mark_exported.releaseState` меняется с `blocked` на `enabled`;
- существующий `assertAdminDocumentPackageExportEnabled` остаётся единым
  action-authority gate и начинает пропускать только contract state
  `enabled`;
- существующие frozen controls и handlers
  `Сформировать ZIP с Excel` → `Скачать ZIP` →
  `Подтвердить скачивание` становятся достижимыми; JSX, CSS, labels, layout,
  responsive behavior и паспортный экран не меняются;
- T8 остаётся status-preserving созданием/скачиванием Excel;
- T9 начинается только после exact ZIP preparation, передачи ZIP браузеру и
  явного Admin confirmation; terminal commit выполняет только
  `public.complete_export_package(payload)`.

#### Supabase entities, required fields and relations

- `public.document_assets` — server projection от `media_assets`; обязательны
  `id`, `submission_id`, `applicant_id`, `type`, `bucket`,
  `storage_path`, `upload_status`, `validation_status`, `export_status`.
  T9 принимает точный набор: один `passport_scan` на каждого applicant плюс
  `selfie_1` и `selfie_2` только primary applicant каждой submission;
  `upload_status = uploaded`, `validation_status = passed`,
  `export_status = ready`. Успешный commit атомарно переводит только этот
  exact UUID set в `exported`;
- `public.export_batches` — обязательны `id`, `created_by`, `created_at`,
  `format = xlsx`, `row_count`, unique non-blank `idempotency_key`,
  non-blank `content_fingerprint`, safe `file_name`, unique non-empty
  `submission_ids`. `created_by/created_at` задаются server trigger;
- `public.export_batch_members` — immutable owner/applicant snapshot,
  создаваемый after-insert trigger для каждого applicant выбранных
  submissions; relation:
  `export_batch_id → export_batches.id`,
  `submission_id → submissions.id`,
  `applicant_id → applicants.id`,
  `source_agent_id → profiles.id`; обязательны owner display snapshot, city,
  type/title/name и deterministic submission/applicant order;
- `public.document_export_events` — ровно один
  `DOCUMENT_EXPORT_CREATED` на `package_identity_key`; обязательны exact
  `submission_ids`, exact `asset_ids`, safe `zip_file_name`,
  `file_count = asset_ids.length`, positive `applicant_count`,
  exact workbook filename, Admin `created_by/created_at`;
- `public.submissions` — exact locked selection только из physical
  `accepted | ready_for_excel`; успешный T9 пишет `status = exported`,
  `exported_at = export_batches.created_at`, `updated_at` и одну
  `status_history` запись на фактически изменённую submission;
- private Storage bucket `submission-media` — T9 только читает exact
  canonical object paths, уже принадлежащие accepted `document_assets`.
  ZIP собирается в браузере и скачивается локально; ZIP object не загружается
  в Storage, а `document_export_events.zip_file_name` является audit metadata,
  не Storage path.

#### Actor, ownership and write rights

- только active approved Admin инициирует preparation, download confirmation
  и authenticated RPC;
- `complete_export_package` проверяет `auth.uid()` и null-safe server-owned
  Admin profile role; `PUBLIC` и `anon` не имеют execute, `authenticated`
  execute не заменяет role/identity/content guards;
- Agent не создаёт batch/event/member rows, не меняет
  `document_assets.export_status`, `submissions.exported_at` или terminal
  status; owning Agent после canonical reload читает свою terminal submission
  и разрешённый immutable member snapshot;
- прямой update `submissions.status/exported_at` и прямой insert exported
  `status_history` блокируются transaction-local boundary triggers;
- Admin не получает права менять Agent intake; T9 использует только уже
  approved immutable selection and artifact identity.

#### Atomicity, idempotency and rollback

- `complete_export_package` выполняет row locks, exact selection/identity/media
  guards, batch insert, member snapshot trigger, document event, asset
  transition, submission terminal transition и status history в одной
  PostgreSQL transaction; любое исключение откатывает весь database delta;
- повтор с тем же idempotency key допустим только при полном совпадении batch,
  submission set, event, filenames, applicant/file counts и exported asset
  set; он возвращает duplicate result без второго event/history;
- конфликтующий reuse idempotency key, stale selection/fingerprint,
  mixed city/travel date, open/fixed blocker, missing/extra/foreign asset,
  invalid filename или не-Admin actor fail closed;
- до RPC UI может durable-зафиксировать retryable
  `file_generated → file_downloaded`; если canonical readback доказывает
  `not_committed`, это состояние возвращается в `ready`;
- при потерянном RPC response выполняются idempotent retry и canonical
  readback. `committed` никогда автоматически не откатывается; `unknown`
  не получает ложный rollback и требует refresh/operator reconciliation;
- скачанный browser file нельзя «отозвать». После подтверждённого terminal
  commit `exported` остаётся terminal; исправление database фактов возможно
  только новой owner-approved forward migration/remediation, не direct DML.

#### Влияние и второй поток

- UI presentation остаётся побайтно owner-frozen; меняется только достижимость
  уже существующих ZIP/download/confirm states;
- single и family package: Agent create/media/questionnaire → Admin review →
  T8 Excel → T9 ZIP → exact atomic commit → Admin canonical readback →
  owning Agent hard reload видит `exported` и больше не может менять intake;
- duplicate Admin confirmation/readback остаётся idempotent и не создаёт
  второй batch/event/history;
- другой Agent не читает/не меняет aggregate; non-Admin RPC, stale ZIP,
  changed selection, missing Storage object и cross-owner asset fail closed
  до terminal mutation;
- verification обязана включать unit/domain, реальный PostgreSQL 17 atomic
  export harness, desktop/mobile browser download+confirm, Agent terminal
  reload, role isolation, full build/guards и независимые VERIFIER/RED-TEAM на
  одном immutable hash;
- mobile browser verification нажимает видимый hit-target строки
  `label[data-testid="admin-export-row-*"]` и затем проверяет состояние
  вложенного checkbox. Сам checkbox намеренно visually hidden frozen CSS;
  прямой pointer-click по его clipped box не моделирует пользовательский
  жест. Product JSX/CSS и desktop/keyboard selection при этой корректировке
  не меняются;
- production activation дополнительно требует подтверждения deployed
  migration coverage и authenticated Admin/Agent canonical readback; этот
  amendment сам по себе не является разрешением применять миграции к
  production Supabase.

### T9 server-authority hardening amendment — 2026-07-29

Статус:
**APPROVED FOR SOURCE IMPLEMENTATION / PRODUCTION APPLY NOT AUTHORIZED**.

Основание: независимые VERIFIER/RED-TEAM на freeze `29c3739b...` обнаружили
три server-authority gap между активированным exact T9 contract и последними
deployed function bodies:

1. `app_private.complete_export_package_core(jsonb)` всё ещё принимает
   `format in ('xlsx', 'csv')`, а public wrapper не требует `.xlsx` suffix у
   `document_export.workbook_file_name`;
2. wrapper валидирует `document_assets`, но не блокирует/проверяет
   соответствующие private `storage.objects`; удалённый после projection
   Storage object не препятствует terminal commit;
3. normalized-row branch принимает произвольный non-blank
   `content_fingerprint`, потому что durable `exportPackage` identity существует
   только в canonical cockpit snapshot.

#### Точный delta

- новая forward-only migration
  `20260729060000_harden_t9_server_authority.sql` не добавляет и не удаляет
  tables/columns/relations и не расширяет RLS/Storage права;
- migration читает current definitions через `pg_get_functiondef` и fail
  closed меняет только exact reviewed fragments:
  - core отклоняет payload, если null-safe условие
    `batch_record.format is distinct from 'xlsx'` истинно;
  - core требует у `batch.file_name` safe basename без `/`, `\`, `..` и
    case-insensitive suffix `.xlsx`;
  - wrapper требует тот же safe `.xlsx` contract у
    `document_export.workbook_file_name`;
  - core требует canonical `v19CockpitSnapshot` для каждой выбранной
    submission. Normalized/legacy selection без snapshot больше не может
    выполнить T9; ей нужен отдельный owner-reviewed reconcile/backfill, а не
    произвольный fingerprint;
  - wrapper под row lock связывает каждый exact `document_asset` с ровно одним
    существующим `storage.objects` row по
    `(bucket_id, name) = (document_assets.bucket,
document_assets.storage_path)`, требует bucket `submission-media` и
    distinct object count, равный exact asset count;
- migration допускает только два цельных определения: exact reviewed legacy
  state или уже hardened state. Missing/null-unsafe Admin guard, лишнее
  occurrence, смешанное old/new состояние либо другой drift завершают apply
  исключением;
- physical `export_batches` и legacy CSV rows не переписываются. Hardening
  относится только к canonical terminal T9 RPC; T8 Excel
  preparation/download остаётся status-preserving;
- `storage.objects` остаётся owned Supabase Storage entity. Browser и Agent не
  получают direct SQL access; SECURITY DEFINER wrapper использует object row
  lock только для exact server-side existence/readiness proof;
- source migration и документация не являются разрешением применять её к
  production. Remote migration history, backup и authenticated smoke требуют
  отдельного owner authorization.

#### Влияние и обязательная проверка второго потока

- positive single T9 и family T9 используют `format = xlsx`, safe `.xlsx`
  filenames, canonical snapshot identity, exact document set и существующие
  private Storage objects;
- реальный PostgreSQL 17 family proof обязан подтвердить формулу
  `applicant_count + submission_count * 2`: три applicants одной family дают
  пять assets/objects — три passports и две selfies только primary applicant;
- extra secondary selfie/object, missing Storage object, `format = csv`,
  unsafe/non-XLSX batch filename, unsafe/non-XLSX workbook filename,
  missing/extra asset, normalized selection без canonical identity и Agent
  actor отклоняются с нулевым durable delta;
- duplicate exact XLSX payload остаётся idempotent; conflicting identity,
  suffix/format/storage drift не создают второй batch/member/event/history;
- owning Agent после successful Admin family T9 видит terminal aggregate
  readback, другой Agent по-прежнему изолирован; ни один Agent flow не получает
  нового write права;
- frozen JSX/CSS/labels/layout не меняются.

### Release guard alignment amendment — migration order and Auth provisioning

Статус: **APPROVED FOR LOCAL RELEASE-GUARD ALIGNMENT**.

Точный delta:

- локальный promotion order получает уже зафиксированные этим контрактом
  `20260728191313_archive_agent_submission_cards.sql` и
  `20260729050000_agent_submission_concurrency.sql` после
  `20260722003000_atomic_return_package_artifact_upload.sql`, затем
  `20260729060000_harden_t9_server_authority.sql` после Agent concurrency;
- те же три имени добавляются в production promotion runbook и approval
  checklist; это документирует порядок, но не является разрешением применить
  миграции к production;
- `requiredRemoteMigrationOrder` не меняется до отдельного owner-approved
  production apply/readback;
- `verify-auth-data-readiness` проверяет серверный `inviteUserByEmail` в
  вынесенном owner-файле
  `supabase/functions/_shared/accessRequestProvisioning.ts`, а не требует
  implementation text в делегирующем
  `supabase/functions/access-request/index.ts`.

Влияние:

- таблицы, поля, связи, status machine, ownership, Edge Function behavior и UI
  не меняются;
- stale guard снова проверяет фактическую серверную invite-реализацию;
- новые миграции перестают быть undeclared, но остаются неприменёнными к
  production до отдельного разрешения;
- public registration по-прежнему не принимает пароль, не создаёт confirmed
  user и не перезаписывает существующий Auth password.

Проверка второго потока:

- `verify:auth-data-readiness` обязан подтвердить `inviteUserByEmail`,
  sanitized public response, запрет password payload и точный local migration
  order;
- PostgreSQL 17 concurrency/RLS harness повторяется после alignment;
- `verify:production-packet`/remote evidence сохраняют fail-closed границу и не
  считают новые migration применёнными без canonical production readback.

### Release alignment amendment — 2026-07-29

Точный delta:

- provenance контракта выровнен с фактическим production base
  `ad0ef4cd996089ced396c57d77f333facce4be1b`;
- в Sections 3, 4.1, 7.3, 8 и 9 документированы уже существующие на этом base
  `public.agent_submission_card_archives` и
  `public.archive_agent_submission_card(text, bigint)`;
- unknown applicant role теперь останавливает write mapper вместо создания
  fallback `Заявитель`;
- questionnaire envelope без exact `version = 1` сохраняет semantic value, но
  его review metadata больше не считается trusted;
- единый discriminated issue-target validator вызывается перед domain mutation
  и повторно перед Supabase correction payload;
- все issue-creation entrypoint'ы (`returnWithIssues`, precise Admin action и
  принятие ББ-подсказки) canonicalize успешно разрешённый target в `field` или
  `file` до mutation; broad section/virtual passport и mixed target остаются
  suggestion/validation error без изменения submission;
- active passport-review UI передаёт в remark boundary канонический
  `AdminPassportReviewFieldId`, а отдельный `fieldLabel` используется только
  для Admin/Agent-facing copy; `label`, `sourceLabel` и `fieldLabel` не
  используются как write target;
- active export UI и штатный sandbox UI gate зафиксированы как Excel T8-only;
  ZIP-coupled T9 controls и completion остаются заблокированы.

Причина: предыдущий provenance указывал более ранний SHA, не описывал committed
Agent card archive boundary и перечислял три fail-open compatibility caveat как
текущее поведение, хотя release slice закрывает их без изменения database
contract.

Классификация change-control: amendment фиксирует source provenance и
conformance уже замороженным таблицам, связям, status machine и ownership. Он
не меняет их структуру и не заявляет dual-flow approval структурного delta.
Требование Section 1 об отдельном одобрении обоих владельцев остаётся
fail-closed для любого будущего изменения таблиц, RPC, переходов или прав.

Влияние:

- database migration, backfill, rollback и изменение production schema не
  выполняются;
- canonical submission status machine и Admin review ownership не меняются;
- owning Agent может скрыть только собственную карточку в editable status через
  revision-aware RPC, не удаляя submission aggregate;
- Admin продолжает видеть aggregate для audit/review, а архив не разрешает
  Agent менять данные после скрытия карточки;
- valid roles `main | spouse | child`, versioned questionnaire envelopes и
  точные field/media issues сохраняют прежний wire mapping;
- invalid role не создаёт applicant row; unversioned/unsupported envelope не
  переносит Admin approval metadata, но semantic answer сохраняется;
- mixed, legacy, missing, duplicate или nonexistent issue target не мутирует
  submission и не создаёт correction payload;
- все восемь passport-review remark targets, включая
  `passport-expiry-date`, разрешаются по каноническому field ID; совпадающие
  display labels вроде `Действителен до` не участвуют в выборе target;
- canonical field ID остаётся persistence/focus key, а UI восстанавливает
  человекочитаемый questionnaire label из того же applicant aggregate; Admin
  form, reason/comment и Agent correction surfaces не показывают technical ID;
- `section` с ровно одним точным questionnaire field сохраняется как canonical
  `field`, поэтому Agent исправляет именно это поле; section-only и virtual
  passport ББ-подсказки не становятся persistence issue;
- Admin формирует и скачивает Excel без изменения submission status; Agent не
  получает ложный terminal `exported` от blocked T9;
- неподтверждённый `submit_submission_for_review_handoff` из отдельного Agent
  worktree не входит в этот контракт или release.

Проверка второго потока:

- Agent readback исключает архивированную карточку, Admin readback сохраняет
  её; Admin ownership и review actions не переходят к Agent и не используют
  archive row как submission status;
- Admin создаёт только точное canonical issue, а Agent получает тот же target и
  не может исправить другой field/file;
- mixed target не переводит Admin submission в `returned`; canonicalized field
  issue после точного Agent edit становится `fixed_by_agent`, а invalid
  ББ-подсказка остаётся доступной для ручного dismiss без cross-flow mutation;
- Admin passport-review UI передаёт каждый из восьми канонических field ID;
  Agent получает тот же точный target, в том числе при повторяющемся label
  `Действителен до`;
- Admin form сохраняет canonical ID, но показывает и формирует текст по
  `fieldLabel`; после readback Agent drawer и questionnaire alert отображают
  label того же exact field, не меняя target или lifecycle;
- Agent semantic questionnaire value переживает unversioned fallback, но Admin
  approval требует versioned metadata и повторной проверки;
- desktop/mobile localhost Chrome flow проверяет Agent drawer/create и Admin
  review/issue/Excel surfaces; production mutating cross-flow этим не
  подменяется.

### T9 canonical release boundary reconciliation — 2026-07-31

Статус: **LOCAL INTEGRATION ONLY / PRODUCTION NOT APPLIED**.

Этот поздний amendment заменяет для текущего integration preview прежний
`T9 document ZIP activation amendment — 2026-07-29`. При расхождении
приоритет имеет `docs/release/canonical-domain-contract.md`: активным export
artifact остаётся только Excel T8, а ZIP/package и terminal T9 требуют
отдельного последующего owner-approved контракта.

Точный delta:

- canonical `mark_exported.releaseState` остаётся `blocked`;
- frozen Admin export presentation, controls, labels, layout и CSS не
  меняются; ZIP action останавливается общим action-authority guard до чтения
  Storage и создания Blob;
- migration
  `20260731000000_block_t9_until_approved_contract.sql` выполняется после
  historical T9 hardening и отзывает client `EXECUTE` у public wrapper и
  private core для `public`, `anon` и `authenticated`;
- T9 function bodies, tables, status machine и данные не переписываются;
- `requiredRemoteMigrationOrder` и production evidence не меняются без
  отдельного owner-approved apply и canonical readback.

Rollback локального preview: revert этого amendment вместе с migration/code
commit. Возвращать `EXECUTE`, активировать T9 или применять migration в
production этим rollback-описанием не разрешается.

### Approved Agent CAS integration amendment — 2026-07-29

Статус amendment: **APPROVED FOR LOCAL INTEGRATION / PRODUCTION NOT APPLIED**.

Source snapshot:

- Agent worktree `/Users/user/Documents/V-19-agent-flow`;
- branch `feature/agent-flow`;
- exact base `ad0ef4cd996089ced396c57d77f333facce4be1b`;
- staged diff SHA-256
  `c199eee3504d7b69c8caab5c85ae5c7345dda84618f873b3a1ab81721df83177`;
- migration SHA-256
  `ed7b10cad35435b3001d7e50be9abc76355acc0c256c78e7b143c54499188b9a`;
- Agent owner, independent VERIFIER и RED-TEAM приняли source snapshot без
  P0/P1; пользователь отдельно поручил перенести и правильно интегрировать
  второй поток в основной release candidate.

Это одобрение разрешает только локальный перенос указанного snapshot и
dual-flow verification. Оно не разрешает commit, push, применение migration к
production, переключение Vercel alias или live mutation.

Точный структурный delta:

1. Добавляется private receipt table
   `app_private.agent_submission_mutation_receipts`.
2. Все Agent aggregate writes переводятся на один
   `SECURITY INVOKER` RPC:
   `public.save_agent_submission_if_current(payload, expected_revision,
actor_id, operation_id)`.
3. Execute для revision-blind Agent RPC
   `save_submission_draft(jsonb)`, `submit_corrections_handoff(jsonb)` и
   `upsert_questionnaire_answers(jsonb)` отзывается у
   `public | anon | authenticated`.
4. Agent direct DML на `submissions`, `applicants`,
   `questionnaire_answers`, `media_assets`, `corrections` и
   `status_history` допускается только внутри RPC с matching incomplete
   receipt; Admin batch-CAS boundary не меняется.
5. `ensure_submission_public_number(text)` возвращает не только
   `publicNumber`/`assignedNow`, но и итоговый `caseRevision`, чтобы следующий
   Agent write не использовал stale revision.
6. Upload boundary сначала пишет canonical private Storage object, затем
   подтверждает relational metadata через CAS. Definitive DB rejection удаляет
   только новый exact object; неизвестный результат сохраняет object для
   readback/reconciliation; прежний object удаляется только после
   подтверждённого commit нового metadata.

Supabase table contract delta:

- `operation_id uuid` — PK, stable idempotency key;
- `actor_id uuid NOT NULL` — authenticated Agent actor, логически связан с
  `profiles.id` и обязан совпадать с `auth.uid()`;
- `submission_id text NOT NULL` — логически связан с owned
  `submissions.id`; immutable ownership повторно проверяется RPC;
- `request_fingerprint text NOT NULL` — lowercase SHA-256 из payload и
  `expected_revision`;
- `created_at timestamptz NOT NULL`;
- completion pair: `result jsonb`, `completed_at timestamptz`;
- RLS включён; authenticated actor видит/создаёт/обновляет/удаляет только rows
  со своим `actor_id`, но browser product code не обращается к table напрямую;
- completed receipts старше 90 дней удаляются, а per-actor retained set
  ограничивается последними 512 completed operations.

Status machine delta:

- новых canonical или wire statuses нет;
- набор T0–T9 и issue lifecycle не меняются;
- T0/T1/T2/T5 и разрешённый
  `ready_for_export → submitted_for_review` проходят через один Agent CAS RPC;
- если новый draft отправляется одним UI intent, durable history всё равно
  содержит два последовательных canonical события T1 и T2; прямой
  `draft → submitted_for_review` не вводится;
- stale revision, reused operation ID с другим fingerprint, чужой owner,
  forbidden status или неполный handoff отклоняются одной transaction без
  partial aggregate write.

Ownership delta:

- owning Agent остаётся единственным владельцем intake data;
- CAS/receipt не передаёт ownership и не расширяет статусы, в которых Agent
  может редактировать;
- Agent не может сохранить, удалить или подменить Admin
  `adminReviewApproved*`, media review actor/time/status и issue closure;
- re-submit из `ready_for_export` обязан очистить export readiness и вернуть
  accepted media в `not_reviewed`; Admin снова владеет review decision;
- Admin RPC, receipts, review rights и Excel T8 остаются без изменения.

Влияние и release sequence:

- migration создаёт table, RLS policies, helper functions, CAS RPC и шесть
  write-fence triggers; существующие business rows не backfill'ятся и не
  переписываются;
- UI без migration fail-closed, потому что новый RPC отсутствует; старый UI
  после migration fail-closed, потому что legacy RPC больше не executable;
- поэтому production rollout только coordinated:
  prebuild без alias switch → migration → немедленный alias switch → forced
  reload/live smoke. Старые открытые вкладки считаются несовместимыми и должны
  обновиться;
- migration и deploy требуют отдельных точных approvals; до них production
  evidence остаётся `BLOCKED`;
- rollback после migration не равен простому откату UI: требуется отдельно
  reviewed rollback migration для grants/triggers/functions. Предпочтителен
  fail-closed roll-forward; повторное открытие revision-blind RPC без отдельного
  security approval запрещено.

Проверка второго потока:

- Agent single/family snapshot после CAS readback восстанавливает applicants,
  questionnaire, media, canonical status/history и current revision; Admin
  новым read видит тот же immutable owner и пакет;
- Agent mutation с Admin approval metadata, Admin media review metadata или
  чужим owner отклоняется; Admin aggregate после нового read остаётся
  неизменённым;
- Agent re-submit из `ready_for_export` очищает export package/review state, а
  Admin получает `submitted_for_review` и обязан провести review заново;
- Admin batch CAS, точные issue targets, passport field IDs, archive
  visibility и Excel T8 должны повторно пройти после объединения двух diffs;
- Storage path/object existence проверяется при handoff; unknown network
  outcome не удаляет потенциально committed object вслепую.

Принятые P2 residual risks, не расширяющие контракт:

- после двух последовательных network timeout UI не выполняет автоматический
  receipt reconciliation в том же intent; reload/readback остаётся
  обязательным безопасным восстановлением;
- Storage cleanup имеет bounded synchronous retry и явную ошибку, но пока не
  имеет durable cleanup outbox; возможный orphan не становится canonical
  media row и требует операционного cleanup.

### Agent issue-ownership P1 remediation record — 2026-07-29

Независимые VERIFIER и RED-TEAM до commit/production обнаружили, что исходный
Agent CAS snapshot проверял `corrections` только как JSON array, после чего
historical dispatcher мог upsert'ить Admin-owned issue fields. Это нарушало уже
замороженные ownership rules разделов 4.1 и 8 и не является допустимым
изменением контракта.

Обязательное conformance-исправление:

- таблицы, required fields, связи, canonical statuses, переходы и владельцы не
  меняются;
- migration добавляет только private deterministic helper, который связывает
  runtime issue ID с его существующим durable correction UUID;
- Agent CAS RPC требует точное one-to-one соответствие между
  `v19CockpitSnapshot.submission.issues`, `payload.corrections` и текущими
  `public.corrections` после блокировки submission row и проверки revision;
- новый submission не может принести issue; существующий Agent не может
  добавить, удалить, переименовать или переназначить issue;
- `submission_id`, `applicant_id`, `scope`, `field_key`, `media_type`,
  `reason`, `severity`, durable identity и Admin creation metadata остаются
  неизменными;
- единственная Agent-мутация issue — `open → fixed` для owned submission в
  `returned | ready_for_review`; `fixed → closed` остаётся только Admin,
  `closed` остаётся terminal;
- `created_by`, `created_at` и уже установленный `fixed_at` берутся из durable
  row, а новый `fixed_at` при `open → fixed` ставит server clock;
- mismatch отклоняет всю CAS transaction до historical dispatcher с
  `42501`; partial aggregate write и mutation receipt не публикуются.

Дополнение target-resolution/evidence, зафиксированное до реализации:

- это conformance-исправление не добавляет таблиц, колонок, связей, статусов,
  переходов, ролей или write rights;
- успешно разрешённые questionnaire alias/display label немедленно
  canonicalize в точный `QuestionnaireField.id`; label остаётся только
  человекочитаемым текстом и не попадает в `Issue.target.field` /
  `corrections.field_key`;
- persistence boundary повторно canonicalize весь issue set до сериализации;
  один и тот же normalized submission aggregate является источником и
  `v19CockpitSnapshot.submission.issues`, и `payload.corrections`; legacy/manual
  label target либо однозначно переводится в field ID, либо весь write
  отклоняется до RPC;
- если legacy/manual Admin issue ещё не имеет snapshot, тот же persistence
  boundary фиксирует исходное canonical field value или media evidence до
  передачи Agent; уже существующий snapshot, включая пустую строку, не
  переписывается;
- `open → fixed` для field/section требует, чтобы exact canonical target
  существовал, новое значение после trim было непустым и отличалось от
  Admin snapshot; пустой исходный snapshot не отключает эту проверку;
- media issue snapshot хранит versioned evidence identity текущего private
  объекта, а не display status; identity включает canonical bucket/path
  существующего `media_assets` slot;
- `open → fixed` для media требует uploaded `media_assets` того же
  submission/applicant/type, canonical private path, существующий
  `storage.objects` и новую storage identity. Если durable media row уже
  существует, replacement path обязан отличаться от прежнего; status-only
  toggle не считается исправлением;
- historical issue snapshot без versioned media identity остаётся
  read-compatible, но server authority всё равно сравнивает incoming media с
  заблокированной durable row и fail-closed отклоняет отсутствие новой
  evidence;
- Admin target/reason/comment/severity и creation metadata остаются
  неизменными; новый server-side `fixed_at` подтверждает только уже доказанную
  замену/правку.

Влияние:

- Supabase schema и RLS не меняются; изменяется только fail-closed validation
  внутри существующего Agent CAS RPC и canonicalization на Admin issue
  boundary;
- новые field issues по alias/label становятся исправимыми через canonical
  field ID без изменения UI copy;
- корректная media replacement больше не зависит от совпадения старого и
  нового display status, но требует реально нового private Storage object;
- forged empty-field fix, status-only media fix, повторное использование
  прежнего storage path и label-as-write-target отклоняются целиком.

Remediated source provenance:

- перечисленные ниже hashes фиксируют verified remediation snapshot после
  закрытия issue-ownership, canonical target, persistence round-trip и
  field/media evidence P1;
- migration SHA-256
  `fa4ee74e7a8b75b757ccc71123358d6e3072bbd35aa0768536d14f5b86735656`;
- PostgreSQL 17 adversarial harness SHA-256
  `97241d62c15c4bb42abca96b52e5e73809524553891350fbfae9734c26d59bc8`;
- migration unit contract SHA-256
  `4a88bd19fb5fecfba29dbccb5d99e57cdf375a409f02173c566e089b6b38d3e5`;
- canonical target/evidence helper SHA-256
  `069a893361a21185754c6e8ecbc498fd4c41b5e41410ed6e59b88e7ddd1c48eb`;
- Supabase persistence boundary SHA-256
  `e6424cce0faab5289bd342132eed0133713510276bed4158ee5c561357a4f748`;
- canonical status/action/domain runtime SHA-256:
  `84a9e5c6de42d3dddf5b8785798fb665c7f654b1f0a74128c8d925e640f44ee4`,
  `7ca78c780819340900454d383801ead6fa06780d9c1601939ba269ddc6829b51`,
  `1e8adc9765a46991e9b67b8027bb0d7ce874b6afebf2c7fd69597a4644cc27ec`;
- persistence round-trip unit contract SHA-256
  `6d39c00fe8425c1054c568f1189c6e54494a8cc5757e06cd85ca51d817fca0de`;
- incoming teammate hashes выше остаются provenance исходного transfer
  snapshot и не описывают remediated release candidate.

Verified evidence для этого snapshot:

- PostgreSQL 17 adversarial CAS/ownership/evidence harness — PASS;
- Node 22 full unit/integration run: 151 files, 1538 passed, 15 skipped;
- production Supabase build и bundle guard — PASS;
- safety, V-19 boundary, deployment headers и Agent workflow gates — PASS;
- localhost system Chrome dual-flow после последней persistence-правки:
  12/12 PASS, включая Agent durable reload/Admin readback, issue correction,
  Admin accept/Excel и desktop/mobile surfaces;
- repository hygiene и `git diff --check` — PASS.

Влияние на второй поток:

- обычный Agent correction handoff должен по-прежнему сохранять fixed issue и
  переводить package в `corrections_received`;
- Admin readback обязан увидеть исходные target/reason/severity, затем только
  Admin закрывает issue и выполняет accept/Excel flow;
- PostgreSQL harness обязан доказать отклонение forged insert, target/reason/
  severity rewrite, Agent closure, deletion, snapshot identity spoofing,
  empty-field no-op и status/path-reuse media no-op, а также принять
  legitimate field и media correction;
- browser/unit readback обязан доказать: Admin label/alias сохраняется как
  canonical field ID; Agent replacement создаёт новую storage identity и
  помечает только matching issue fixed; Admin видит тот же target/evidence,
  закрывает issue и продолжает accept/Excel flow;
- после SQL remediation повторяются Agent E2E, Admin correction/accept/export
  E2E и все затронутые unit/integration gates.

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
       │    └─ 0:1 agent_submission_card_archives
       │    └─ 0:N app_private.agent_submission_mutation_receipts
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

| Canonical role | New-write `applicants.role` | Read aliases                                                 |
| -------------- | --------------------------- | ------------------------------------------------------------ |
| `main`         | `Основной заявитель`        | `main`, `Основной заявитель`                                 |
| `spouse`       | `Супруг`                    | `spouse`, `Супруг`, `Супруга`, `Супруг(а)`, `Супруг/супруга` |
| `child`        | `Ребёнок`                   | `child`, values beginning with `Ребёнок` or `Ребенок`        |

Любое другое/пустое role value на canonical readback отклоняется fail-closed.
New-write mapper также отклоняет unknown runtime role до создания payload и не
создаёт fallback `Заявитель`.

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

Release reader доверяет review metadata только при exact
`kind = v19_questionnaire_field` и `version = 1`. Missing/unsupported version
возвращает semantic string value, но не восстанавливает approval/provenance
metadata.

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

| Canonical issue field                               | Physical correction                              |
| --------------------------------------------------- | ------------------------------------------------ |
| status `open`, `fixed_by_agent`, `closed_by_admin`  | `open`, `fixed`, `closed`                        |
| severity `blocker`                                  | `blocking`                                       |
| severity `warning`, `info`                          | `note`                                           |
| type `file`, `media`                                | `scope = media`, canonical `media_type` required |
| type `field`, `section`                             | `scope = field`, `field_key` required            |
| required non-blank `reason` and non-blank `comment` | one `reason` joined as `reason — comment`        |

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

#### `public.agent_submission_card_archives`

Назначение: audited Agent-only скрытие eligible карточки из Agent queue без
удаления submission aggregate, children, review history или Storage objects.

DB-required:

- `submission_id` — PK, FK → `submissions.id`, cascade delete;
- `agent_id` — FK → `profiles.id`;
- `case_revision >= 0`;
- `archived_at` — server timestamp.

Relations/invariants:

- одна archive row на submission;
- `agent_id` обязан совпадать с immutable `submissions.agent_id`;
- RPC принимает точный current `case_revision` и сериализуется на submission
  row;
- допустимы только physical `draft | filling`, соответствующие canonical
  `draft | in_progress`;
- повтор того же archive command идемпотентно возвращает существующую row;
- archive не меняет `submissions.status` и не является status transition;
- после archive все последующие Agent mutations aggregate/children
  отклоняются archive fence;
- Admin readback не фильтруется archive row и сохраняет audit/review visibility.

Ownership/access:

- owning Agent читает archive rows только своих submissions;
- Admin читает archive rows для audit;
- browser не вставляет/не удаляет rows напрямую;
- owning Agent создаёт row только через
  `public.archive_agent_submission_card(text, bigint)`;
- transfer ownership, cross-Agent archive и восстановление через delete
  запрещены.

#### `app_private.agent_submission_mutation_receipts`

Назначение: idempotent replay, actor binding и write-fence context для
`save_agent_submission_if_current`.

DB-required:

- `operation_id` — UUID PK;
- `actor_id` — authenticated Agent actor;
- `submission_id` — owned submission logical ID;
- `request_fingerprint` — lowercase SHA-256, 64 hex chars;
- `created_at`.

Completion fields:

- `result` — exact cached RPC response с `operationId`, `submissionId`,
  `caseRevision` и normalized result counters;
- `completed_at`.

Ownership/access:

- browser/UI не читает и не пишет receipt table напрямую;
- только Agent CAS RPC создаёт, блокирует, завершает и очищает receipts;
- RLS связывает каждый row с `auth.uid() = actor_id`;
- тот же `(actor_id, submission_id, operation_id, request_fingerprint)`
  безопасно replay'ит exact result;
- другой actor/submission или тот же operation ID с другим fingerprint
  отклоняется;
- incomplete/failed transaction не публикует partial result;
- receipt не является ownership authority и не заменяет
  `submissions.agent_id`.

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
| ------------------- | ------------------------ | --------------- | ---------------------- |
| `passport_scan`     | `passport_scan`          | `passport_scan` | `passport_scan`        |
| `selfie` (front)    | `selfie`                 | `selfie`        | `selfie_1`             |
| `selfie_2` (side)   | `selfie_2`               | `selfie_2`      | `selfie_2`             |

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

| Canonical              | Physical `submissions.status` |
| ---------------------- | ----------------------------- |
| `draft`                | `draft`                       |
| `in_progress`          | `filling`                     |
| `submitted_for_review` | `waiting_review`              |
| `returned`             | `returned`                    |
| `corrections_received` | `waiting_review`              |
| `ready_for_export`     | `ready_for_excel`             |
| `exported`             | `exported`                    |

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

| ID  | Action                        | Кто меняет                                 | From                              | To                     | Обязательные guards                                                                                                                                                                                                                                         |
| --- | ----------------------------- | ------------------------------------------ | --------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T0  | Create draft                  | Agent                                      | none                              | `draft`                | Authenticated Agent становится owner; canonical initial data.                                                                                                                                                                                               |
| T1  | Save/start                    | Owning Agent                               | `draft`                           | `in_progress`          | Минимум один applicant; incomplete package разрешён.                                                                                                                                                                                                        |
| T2  | Submit/re-submit              | Owning Agent                               | `in_progress`, `ready_for_export` | `submitted_for_review` | Полный package; нет unresolved issue; re-submit очищает export readiness и требует нового review.                                                                                                                                                           |
| T3  | Return with issues            | Admin                                      | `submitted_for_review`            | `returned`             | Минимум один новый valid `open` issue; нет export commit.                                                                                                                                                                                                   |
| T4  | Accept first review           | Admin                                      | `submitted_for_review`            | `ready_for_export`     | Нет open/fixed issues; полный package; восемь passport fields каждого applicant имеют current Admin approval; required media имеют accepted status + persisted review actor/time + private storage identity.                                                |
| T5  | Submit corrections            | Owning Agent                               | `returned`                        | `corrections_received` | Каждое open issue конкретно исправлено и стало `fixed_by_agent`; package остаётся полным.                                                                                                                                                                   |
| T6  | Close and accept              | Admin                                      | `corrections_received`            | `ready_for_export`     | Все fixes проверены и закрыты; open отсутствуют; исправленные passport fields повторно подтверждены; required media имеют accepted status + persisted review actor/time + private storage identity.                                                         |
| T7  | Return again                  | Admin                                      | `corrections_received`            | `returned`             | Создан минимум один новый valid open issue; closed issues не переоткрываются.                                                                                                                                                                               |
| T8  | Prepare Excel export          | Admin-initiated, authorized system         | `ready_for_export`                | `ready_for_export`     | Excel-only, status-preserving; unique submission set; exact applicant row count; one city/travel-date group; identity/idempotency/fingerprint guards; нет issues.                                                                                           |
| T9  | Complete document ZIP package | Admin-initiated, authorized system commits | `ready_for_export`                | `exported`             | Exact Excel + accepted private media ZIP was prepared and handed to the browser; Admin confirmed download; exact selection/identity/fingerprint/media set; one atomic RPC writes batch/member/event/assets/status/history/`exported_at`; no partial writes. |

Любой неуказанный переход запрещён.

Canonical command boundary:

- Agent draft/save/submit/correction handoff:
  `public.save_agent_submission_if_current(payload, expected_revision,
actor_id, operation_id)`;
- Agent card archive:
  `public.archive_agent_submission_card(submission_id,
expected_case_revision)`;
- post-questionnaire public number:
  `public.ensure_submission_public_number(submission_id)`, возвращающий
  `caseRevision`;
- Admin multi-case review save:
  `public.save_admin_submission_batch_if_current(payloads,
expected_revisions, actor_id, operation_id)`;
- Admin export completion:
  `public.complete_export_package(payload)`.

T9 ZIP/document payload и event отдельно одобрены
`T9 document ZIP activation amendment — 2026-07-29`. Поэтому
`complete_export_package` является единственным release T9 command при точном
соблюдении описанного там media set, browser confirmation, atomicity,
idempotency, actor и canonical readback contract.

Agent и Admin save обязаны использовать current `case_revision` и stable
`operation_id`; stale revision или повтор operation ID с другим payload
отклоняется без partial mutation. Revision-blind Agent RPC не является
разрешённым compatibility fallback.

### 7.4 Issue status machine

Canonical:

```text
none --Admin/system--> open --owning Agent--> fixed_by_agent --Admin--> closed_by_admin
```

Wire mapping:

| Canonical issue   | `corrections.status` |
| ----------------- | -------------------- |
| `open`            | `open`               |
| `fixed_by_agent`  | `fixed`              |
| `closed_by_admin` | `closed`             |

Forbidden:

- `open → closed_by_admin`;
- `fixed_by_agent → open`;
- `closed_by_admin → open | fixed_by_agent`;
- Agent creates review issue;
- Admin marks Agent work fixed;
- old closed issue is reopened вместо нового issue.

## 8. Entity ownership and write rights

| Entity / field group                                                | Owner                                      | Кто читает                                                 | Кто меняет                                                                                      |
| ------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `profiles` identity/role                                            | Trusted provisioning                       | Self/Admin as permitted                                    | Trusted provisioning only                                                                       |
| `submissions.agent_id`, `id`, `type`                                | System assignment + owning Agent aggregate | Owning Agent, Admin                                        | Create command only; immutable after creation                                                   |
| Submission intake fields, applicants, questionnaire semantic values | Owning Agent                               | Owning Agent, Admin                                        | Owning Agent only in `draft`, `in_progress`, `returned`; canonical command boundary             |
| Questionnaire intake provenance/confirmation metadata               | Owning Agent/system workflow               | Owning Agent, Admin                                        | Approved Agent/system intake commands; semantic change invalidates stale approvals              |
| Passport field `adminReviewApproved*` metadata                      | Admin                                      | Owning Agent, Admin                                        | Admin only during `submitted_for_review`, `corrections_received`; never changes semantic answer |
| Media binary + upload metadata                                      | Owning Agent                               | Owning Agent, Admin                                        | Owning Agent in editable state; replacement clears review                                       |
| Media review fields                                                 | Admin                                      | Owning Agent, Admin                                        | Admin only during review                                                                        |
| Issue creation/reason/target/severity                               | Admin                                      | Owning Agent, Admin                                        | Admin/system creates new issue; existing target/history immutable                               |
| Issue fix evidence/state                                            | Owning Agent                               | Owning Agent, Admin                                        | Agent only `open → fixed_by_agent` during correction handoff                                    |
| Issue closure                                                       | Admin                                      | Owning Agent, Admin                                        | Admin only `fixed_by_agent → closed_by_admin`                                                   |
| Canonical status                                                    | Domain command                             | Owning Agent, Admin                                        | Actor from transition table only                                                                |
| `status_history`                                                    | Audit/system                               | Owning Agent, Admin                                        | Append by successful canonical command; no manual rewrite                                       |
| `agent_submission_card_archives`                                    | Owning Agent visibility state              | Owning Agent, Admin                                        | Owning Agent via revision-aware archive RPC; no direct update/delete                            |
| Agent mutation receipt                                              | Agent CAS RPC/system                       | Owning Agent operation through RPC only                    | CAS RPC only; no direct product UI access                                                       |
| `case_revision`                                                     | System                                     | Owning Agent, Admin                                        | Atomic persistence RPC only                                                                     |
| `public_number`                                                     | Submission aggregate                       | Owning Agent, Admin                                        | `ensure_submission_public_number` only after complete questionnaire; then immutable             |
| Admin mutation receipt                                              | Admin RPC/system                           | Owning Admin operation through RPC only                    | Batch RPC only; no direct UI access                                                             |
| `document_assets`                                                   | Derived system projection                  | Admin; owning Agent only where downstream policy permits   | Trigger/system projection; exact `ready → exported` set only inside approved T9 RPC             |
| Excel export batch/member data                                      | Admin-initiated system command             | Admin; owning Agent downstream view via immutable snapshot | Approved atomic T9 command and after-insert member snapshot trigger only                        |
| ZIP/document event data                                             | Admin-initiated system audit               | Admin; owning Agent only where downstream policy permits   | One exact idempotent `DOCUMENT_EXPORT_CREATED` event inside approved T9 RPC only                |
| `exported_at`                                                       | System commit                              | Owning Agent, Admin                                        | Approved atomic T9 RPC only; direct mutation blocked                                            |

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
   сохраняются; Admin видит тот же состав, owner и current revision.
3. Admin принимает media и submission; Agent после reload видит
   `ready_for_export`, но не может менять Admin review fields.
4. Admin создаёт issue и возвращает; Agent видит `returned`, исправляет,
   semantic answer change очищает прежний Admin field approval, затем Agent
   отправляет corrections; Admin видит `corrections_received`, повторно
   подтверждает исправленные passport fields, закрывает issues и принимает.
5. Agent архивирует eligible owned card; после reload Agent её не видит и не
   может мутировать, а Admin после нового read сохраняет audit visibility того
   же immutable-owner aggregate.
6. T9 использует отдельно одобренный ZIP contract: Admin собирает exact
   Excel+media ZIP, запускает browser download и подтверждает его; один RPC
   создаёт согласованные batch/member/event rows, переводит exact
   `document_assets` и submissions в terminal state; Agent после reload видит
   `exported`.
7. Отрицательные проверки: чужой Agent не читает/не пишет; Agent не создаёт
   issue и не принимает media; Admin не меняет intake; stale Admin revision,
   stale Agent revision, reused operation ID с другим payload, forbidden
   transition и partial Storage metadata отклоняются.
8. Agent re-submit из `ready_for_export` очищает export package и Admin media
   approvals; Admin после нового read видит `submitted_for_review`, а Agent не
   может сохранить прежнее Admin review state.

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
7. Existing `complete_export_package` требует ZIP/document payload и event.
   Эта coupling теперь явно одобрена только границами
   `T9 document ZIP activation amendment — 2026-07-29`; наличие таблиц вне
   этого exact command по-прежнему не разрешает direct writes.
8. `public.submission_files`/`submission-files` сохраняют конкурирующую
   legacy media model. Они не участвуют в canonical readiness/readback.
9. Physical correction projection объединяет reason/comment и схлопывает
   `warning | info` в `note`; точная форма зависит от valid versioned snapshot,
   иначе fallback обязан быть консервативным.
10. Read-only production inventory и role-scoped readback подтверждены только
    для доступных fixtures. В production есть один Agent fixture; изоляция двух
    реальных Agent identities и mutating cross-flow не доказаны этим run.
11. `src/modules/submissions/operationalWorkflow.ts` используется только
    невключённым в active App graph legacy
    `src/modules/submissions/pages/OperationsScreens.tsx`. Его PDF-mismatch
    issue helpers не являются active issue-creation entrypoint этого release.
    Любое подключение этой surface к `App.tsx` требует отдельной conformance
    проверки общего issue-target validator и lifecycle до активации.

Исправление любого gap, требующее schema/RLS/RPC change, проходит Section 1 и
обязательную проверку обоих потоков.

## 11. Freeze acceptance and release evidence

- [x] Используемые core/export tables перечислены.
- [x] DB-required и handoff-required fields перечислены.
- [x] Все entity relations перечислены.
- [x] Canonical и wire status/media/issue mappings перечислены.
- [x] Canonical submission statuses ровно семь.
- [x] Переходы ровно T0–T9; любой иной запрещён.
- [x] Issue lifecycle ровно
      `open → fixed_by_agent → closed_by_admin`.
- [x] Ownership и write rights Agent/Admin/System разделены.
- [x] Questionnaire semantic value и Admin passport approval metadata имеют
      раздельный ownership; Agent edit сбрасывает stale approval.
- [x] Storage bucket/path/private-access зафиксированы.
- [x] Canonical RPC boundary зафиксирована.
- [x] Active export artifacts — status-preserving Excel T8 и отдельно
      одобренный exact media ZIP T9; document event/terminal transition
      выполняются только `complete_export_package`.
- [x] Требование единого Agent/Admin cross-flow proof зафиксировано.
- [x] Изменение контракта требует описания delta/impact и проверки второго
      потока.

Release evidence:

- [x] Node 22 unit/integration, typecheck, build и contract-target regressions.
- [x] PostgreSQL 17 exact repository-function harness: first T9 commit,
      immutable member snapshot, duplicate replay, conflicting replay, missing
      document rollback, null-safe Admin authorization, Agent denial и direct
      terminal-DML denial.
- [x] Localhost system Chrome: Agent/Admin desktop+mobile, protected passport
      media, Excel T8 и ZIP download/confirmation T9.
- [x] Owner-frozen presentation: 12/14 handoff files remain byte-identical;
      два exact integration differences сохраняют прежнюю human-readable issue
      label и её unit regression, не меняя DOM/CSS/layout/controls. T9 меняет
      только existing command reachability и verification hit-target.
- [x] Production Supabase read-only schema/RLS/role-scoped readback.
- [ ] Production migration/readback parity: production packet reports ten
      required migrations absent from the recorded remote contract, including
      `20260720000000_export_package_media_only_file_count.sql`,
      `20260722001000_admin_submission_batch_concurrency.sql`,
      `20260722003000_atomic_return_package_artifact_upload.sql`,
      `20260728191313_archive_agent_submission_cards.sql` and
      `20260729050000_agent_submission_concurrency.sql`, а также
      `20260729060000_harden_t9_server_authority.sql`.
- [ ] Production authenticated mutating cross-flow с durable reload и
      opposite-role readback; требует отдельного разрешения на test-data writes.

### 11.1 Final local T9 receipt — 2026-07-29

Verdict boundary: **LOCAL PASS / PRODUCTION ACTIVATION BLOCKED**.

Fresh immutable-snapshot inputs immediately before independent review:

- `npm test` — 152/152 files, 1551 passed, 5 contract-intentional skipped;
- `npm run build:supabase-production` — 2263 modules; production bundle guard
  PASS, 62 files checked and all 15 forbidden markers absent;
- `npm run lint` — 0 errors, two pre-existing hook warnings in
  `AccessibleSelectMenu.tsx`;
- `npm run verify:business-logic:security` — PASS; 1150 non-UI tests, 76-file
  runtime boundary, safety/auth/release/security gates, 0 production dependency
  vulnerabilities;
- `npm run verify:auth-data-readiness` — PASS, 216 checks;
- `npm run verify:supabase-release` — PASS, 285 checks;
- `node tests/integration/exportPackageCompletionPostgres.mjs
public.ecr.aws/supabase/postgres:17.6.1.127` — PASS on PostgreSQL 17,
  включая повторный idempotent migration apply, single/family commit,
  exact five-asset family graph, duplicate replay, CSV/non-XLSX denial,
  missing Storage denial, normalized/no-snapshot denial, secondary-selfie
  denial, Agent/unprofiled denial, rollback и direct terminal-DML denial;
- targeted localhost system-Chrome release flow — 12/12 passed;
- content-level ZIP proof — desktop 2/2 and mobile 2/2: оба family/single
  archive были
  opened with JSZip; family/single exact media entries, primary-only selfies,
  manifest counts/ownership, embedded XLSX signature and terminal confirmation
  matched the contract;
- owner handoff audit — 12/14 files byte-identical via `/usr/bin/cmp`; два
  exact integration differences перечислены в Final UI-owner handoff receipt.

Known non-product or activation gates are not converted into false PASS:

- historical broad `app-smoke.spec.ts` still targets pre-convergence cockpit
  selectors/copy and is not source truth for the frozen owner UI; it is
  explicitly excluded from the release browser receipt. The current targeted
  Agent/Admin/ZIP suites are green;
- `verify:agent-screen-runtime` has a stale seven-stylesheet allow-list and
  legacy `CreateSubmissionDrawer.tsx`/inline-style assumptions that conflict
  with the approved owner convergence; no production UI is changed to satisfy
  that obsolete verifier;
- `verify:performance` reports the already accepted owner CSS aggregate above
  historical budgets; this is a performance debt, not hidden as PASS;
- `verify:agent-interaction-evidence` is BLOCKED because the external deployed
  evidence file is not configured;
- `verify:production-packet` is BLOCKED with 97 integrity/activation items. In
  particular, the recorded production remote migration contract lacks ten
  current required migrations and has no fresh authenticated Agent/Admin
  workflow, Storage, backup/security-advisor or deployed interaction evidence.

Следствие: commit/push могут зафиксировать reviewable source snapshot только
после независимых VERIFIER/RED-TEAM verdicts. Production alias нельзя считать
готовым или безопасно активировать до отдельного owner-authorized Supabase
migration/readback этапа; этот документ не даёт такое разрешение.

## Appendix A. Required questionnaire field IDs

Required для каждого applicant, согласно canonical questionnaire blueprint:

| Section       | Required `field_id`                                                                                                                           |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `contacts`    | `home-country`, `home-city`, `home-street`, `home-house`, `postal-code`, `email`, `contact-number`, `lives-outside-citizenship`               |
| `trip`        | `purpose`, `main-destination`, `first-entry-country`, `entry-count`, `arrival-date`, `departure-date`, `stay-duration`, `previous-biometrics` |
| `hotel`       | `inviting-party-type`, `hotel-name`, `hotel-address`, `hotel-country`, `hotel-city`, `hotel-postal-code`                                      |
| `appointment` | `appointment-city`, `desired-date-1`, `desired-date-2`                                                                                        |
| `personal`    | `surname`, `first-name`, `birth-date`, `birth-place`, `birth-country`, `gender`, `marital-status`                                             |
| `passport`    | `passport-type`, `passport-no`, `passport-issue-date`, `passport-expiry-date`, `passport-issue-country`, `passport-issue-place`               |
| `employment`  | `occupation`, `employer-name`                                                                                                                 |

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
- `src/modules/submissions/adminIssueTargetContract.ts`
- `src/components/ReviewPassportFieldRow.tsx`
- `src/components/RemarkForm.tsx`
- `src/components/Drawer.tsx`
- `src/components/review/adminRemarkIssueInput.ts`
- `src/modules/submissions/domainEngine.ts`
- `src/modules/submissions/aiSuggestions.ts`
- `src/modules/submissions/agentSubmissionCardArchive.ts`
- `src/modules/submissions/submissionActions.ts`
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
- `supabase/migrations/20260720000000_export_package_media_only_file_count.sql`
- `supabase/migrations/20260718190000_global_submission_public_numbers.sql`
- `supabase/migrations/20260719160000_assign_public_number_after_questionnaire.sql`
- `supabase/migrations/20260722000000_harden_workflow_rpc_anon_execute.sql`
- `supabase/migrations/20260722001000_admin_submission_batch_concurrency.sql`
- `supabase/migrations/20260728191313_archive_agent_submission_cards.sql`
- `supabase/migrations/20260729050000_agent_submission_concurrency.sql`
- `supabase/migrations/20260729060000_harden_t9_server_authority.sql`
- `tests/integration/exportPackageCompletionPostgres.mjs`
- `tests/unit/t9ServerAuthorityMigration.spec.ts`
- `src/lib/supabase/database.types.ts`

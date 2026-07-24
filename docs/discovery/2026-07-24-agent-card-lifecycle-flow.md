## Goal

Сделать сквозной flow карточек агента правдивым и рабочим: «Мои действия»,
«Мои подачи», drawer/анкета и Supabase должны показывать один канонический
статус, сохранять изменения и без ошибок проводить подачу через первичную и
повторную проверку.

## Hypotheses

- [x] UI уже строит обе очереди из одного массива `Submission` → validated:
      `CommandCenter` передаёт canonical submissions в `ApplicantsScreen` и
      `AgentActionsCommandCockpit`.
- [x] Карточка действия исчезает только после смены canonical snapshot →
      validated: `agentOpenActions` возвращает пустую очередь для неeditable
      `submitted_for_review` / `corrections_received`, а завершённое действие
      строится отдельно.
- [x] Повторная отправка имеет выделенный атомарный persistence path →
      validated: `corrections_received` выбирает
      `submit_corrections_handoff`, который сохраняет submission, corrections и
      status history в одной транзакции.
- [x] Текущая реализация расходится с нормативным T5 → validated:
      `uploadRequiredFile` и `markSubmissionIssueFixedResult` могут записать
      `fixed_by_agent`, оставив submission в `returned`, хотя canonical contract
      связывает `open -> fixed_by_agent` с
      `returned -> corrections_received`.
- [~] Проблема вызвана отсутствующим backend RPC → invalidated: RPC и
      Supabase-first writer уже существуют; главный риск находится в моменте
      доменного handoff и его UI-вызове.
- [ ] После последнего исправления повторная отправка должна происходить
      автоматически, без отдельного подтверждения → требуется подтверждение
      пользователя.

## Investigation plan

- [x] Phase 1: зафиксировать canonical lifecycle, UI owners и dirty boundaries.
- [x] Phase 2: проверить action derivation, status labels и persistence/RPC path.
- [x] Phase 3: запустить текущие focused unit tests и определить пробел покрытия.
- [ ] Phase 4: после подтверждения UX handoff оформить EARS spec и выполнить
      минимальную реализацию с unit/integration/E2E/reload proof.

## Experiments

### 2026-07-24 — Canonical lifecycle versus current correction flow

what: сопоставлены `canonical-domain-contract.md`, `status.ts`,
`submissionActions.ts`, `agentActions.ts` и `supabasePersistence.ts`.
saw: нормативный T5 требует одного handoff, но текущий UI/domain допускают
промежуточный persisted snapshot `returned + fixed_by_agent` и отдельную карточку
«Отправить исправления».
conclusion: до изменения кода нужно выбрать UX атомарного handoff; persistence
уже умеет сохранить итоговый `corrections_received` через специальный RPC.

### 2026-07-24 — Focused regression baseline

what: запущены `submissionActionSafety`, `agentActionsCommandCockpit`,
`applicantsScreenInteractions` и `v19SupabasePersistence`.
saw: `4` test files и `93` tests прошли; существующий suite закрепляет
промежуточный `returned + fixed_by_agent`, но не доказывает требуемый
cross-screen flow после последнего исправления и reload.
conclusion: текущая зелёная база не покрывает пользовательский acceptance flow;
нужны новые сценарии на атомарность, исчезновение action-card, status update,
Supabase RPC и readback.

## Confirmed direction

problem statement: агент исправляет замечание в возвращённой подаче; сейчас
момент завершения работы неоднозначен и допускает расхождение между issue
lifecycle, статусом подачи, карточками разных экранов и durable persistence;
успех — один fail-closed handoff создаёт `corrections_received`, переводит только
реально исправленные `open` issues в `fixed_by_agent`, убирает открытое действие,
показывает «На проверке» в «Моих подачах», сохраняет snapshot/history через
`submit_corrections_handoff` и воспроизводится после reload без дублей.

Пользователь подтвердил 2026-07-24: каждое замечание завершается явным действием
«Сохранить исправление»; после последнего валидного исправления handoff
запускается автоматически. Анкета остаётся открытой read-only и подтверждает
отправку. Пользовательские ошибки должны быть полезными и на русском.

## Ruled out

- Перекрасить статусы только в UI — оставляет database truth и другой экран
  рассинхронизированными.
- Добавить параллельный local state для карточек — создаёт второй source of truth.
- Писать status/issues/history отдельными несвязанными запросами — нарушает
  atomic command и допускает частично сохранённый flow.
- Трогать AccessGate, questionnaire polish, export UI и текущую
  ready-for-export migration — это чужой dirty scope.

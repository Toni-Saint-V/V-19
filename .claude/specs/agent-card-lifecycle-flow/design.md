# Agent card lifecycle flow — Design

## Architecture

`Questionnaire/Drawer upload → CommandCenter queued mutation → canonical
correction command → App persistence → Supabase RPC → canonical reload`.

`Submission` остаётся единственным UI snapshot для «Моих действий», «Моих
подач», анкеты и Drawer.

## Domain contract

- `Issue.agentConfirmation` хранит время и monotonic revision подтверждённого target.
- Подтверждённое, но ещё не отправленное issue остаётся `open`.
- Единый command проверяет target, записывает confirmation и, когда все open
  issues подтверждены и актуальны, выполняет `returned → corrections_received`.
- Любое последующее изменение target увеличивает revision и инвалидирует старое
  подтверждение, даже если значение вернулось к прежнему или JSON сменил порядок
  ключей.
- Failed command не мутирует status/issues/history.

## Persistence

- В `corrections` добавляются monotonic `target_revision` и nullable
  `agent_confirmed_at`/`agent_confirmed_revision` с pair constraint.
- Agent writes используют `expected_case_revision` и отклоняют stale snapshot.
- SECURITY INVOKER/RLS и ownership сохраняются.
- Промежуточное подтверждение использует `save_submission_draft`; финальный
  snapshot выбирает существующий `submit_corrections_handoff`.
- Production migration не применяется в рамках задачи.

## Presentation

- Анкета: «Сохранить исправление»; после последнего исправления остаётся
  read-only с подтверждением.
- Drawer: точный следующий blocker для `returned`; ожидание администратора для
  `corrections_received`; история остаётся read-only действием.
- Ошибки пользовательского уровня — конкретные, русские и fail-closed.

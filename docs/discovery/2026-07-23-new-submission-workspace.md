## Goal

Превратить экран «Новая подача» из отдельного fullscreen-dialog в полноценный
раздел рабочего кабинета агента, визуально и навигационно согласованный с
«Моими действиями» и «Моими подачами».

## Hypotheses

- [x] Разрыв создаёт собственный fullscreen shell → validated: production UI и
      `CommandCenter` показывают fixed dialog поверх скрытого `AppShell`.
- [x] Безопасно переиспользовать текущий intake owner → validated:
      `PreUploadScreen` уже инкапсулирует family/single, OCR, file validation и
      canonical submit contract.
- [~] Нужен новый параллельный create-компонент → invalidated: это дублирует
  state и persistence paths.

## Investigation plan

- [x] Phase 1: проверить live mobile/desktop и определить source truth.
- [x] Phase 2: проверить ownership, dirty/busy states и тестовый контур.

## Experiments

### 2026-07-23 — Production responsive audit

what: проверены `390x844` и `1440x900`.
saw: fullscreen dialog скрывает общий shell; desktop создаёт пустой нижний
объём, mobile сжимает заявителей и отделяет OCR-action от основного flow.
conclusion: create-flow должен стать обычным workspace-разделом.

## Confirmed direction

problem statement: агент создаёт одиночную или семейную подачу в рабочем
кабинете; сейчас create-flow теряет навигационный контекст и визуальную систему;
успех — общий sidebar/header остаются видимыми, бизнес-логика не меняется,
dirty/busy navigation остаётся fail-safe, responsive UI проходит на
375/390/768/1024/1440 px.

Пользователь подтвердил направление 2026-07-23 и выбрал in-place refactor
`PreUploadScreen` как обычного раздела.

## Ruled out

- Сохранить fullscreen и только перекрасить — не устраняет параллельный shell.
- Добавить workspace-адаптер вокруг старого dialog — оставляет двойные
  layout/ARIA-контракты.

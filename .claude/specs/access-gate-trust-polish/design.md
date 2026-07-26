# AccessGate Visual + Trust Polish Design

## Decisions

- `src/components/AccessGate.tsx` остаётся единственным markup/state owner.
- `AccessGateProps` остаётся неизменным.
- `AccessShell` принимает `mode: AccessGateMode` и устанавливает
  `data-access-mode` на `.access-shell`.
- Общая brand-панель использует существующий logo asset и следующую copy:
  - `VisaFlow V-19`
  - `Рабочий кабинет визовых подач`
  - `Подготовка агентом, проверка администратором и выгрузка — в одном
операционном контуре.`
  - `Доступ к кабинету подтверждает администратор.`
- Логотип становится decorative при наличии видимого product name, чтобы
  screen reader не озвучивал VisaFlow дважды.

## Presentation Contract

- Desktop/tablet >760 px: двухколоночный layout, компактный logo, brand title,
  process description и approval cue слева; текущая state card справа.
- Mobile ≤760 px: компактная identity-композиция в существующей высоте;
  длинное process description скрыто, product name и approval cue видимы.
- Registration mobile сохраняет flat composition; navigation target становится
  44 px и получает видимый focus state.
- Inputs и actions используют текущие tokens; new gradients, assets и
  marketing decoration не добавляются.

## State Contract

Одинаковая shell presentation применяется к:

- `register`
- `login`
- `reset`
- `invite`
- `recovery`
- `pending`

Различия между состояниями остаются только в существующем card content и
callbacks. Data flow не меняется:

`user input → current validation → current callback → current status/error UI`.

## CSS Ownership

- Базовая desktop/mobile presentation: scoped AccessGate section в
  `src/shared/ui/system.css`.
- Финальная registration mobile geometry: существующий AccessGate block в
  `src/shared/ui/figma-all-screens-v1.css`.
- Глобальные tokens, import order и другие surface selectors не меняются.

## Failure Boundaries

- Mobile identity не увеличивает существующий brand-panel height.
- Error/success content увеличивает только scrollable card/shell.
- Любое влияние на authenticated screens считается regression.
- Любое изменение callback count, payload или state transition блокирует
  acceptance независимо от визуального результата.

## Verification

- Unit: current auth behavior plus mode marker and shared factual copy.
- E2E: 320, 375, 390, 430, 768 и 1440 px; 40/44 px targets, overflow, CTA fold,
  focus, reduced motion и axe.
- Integration: existing registration/admin-approval flow.
- Visual: identical fixtures at 390x844 and 1440x900 for all six states;
  registration also at 320x568 and 430x932.

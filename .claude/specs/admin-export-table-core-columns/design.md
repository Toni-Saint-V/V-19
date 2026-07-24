# Design

## Architecture

- `src/components/AdminExportScreen.tsx` остаётся владельцем данных, выбора и фильтров.
- Строка использует существующий `V19QueueCard` и текущие callbacks.
- Стили остаются selector-scoped к `.v19-admin-export-*`.

## Desktop composition

`checkbox | ID + имя/фамилия | даты поездки | город | агент`

Каждая смысловая ячейка использует icon-rail одинаковой ширины и Lucide-иконку одинакового размера.

## Mobile composition

- Чекбокс остаётся отдельным touch target слева.
- Identity занимает верхнюю строку.
- Даты, город и агент размещаются ниже в адаптивной сетке.
- Заголовок таблицы скрывается по существующему breakpoint.

## State preservation

Selected, active, blocked, disabled, hover и focus состояния остаются на текущем `V19QueueCard` и checkbox.

## Verification

- Unit: четыре смысловых поля присутствуют, вторичный family count и blocker reason отсутствуют из строки.
- Typecheck/lint/build.
- Localhost: desktop 1440×1000 и mobile 390×844, без horizontal overflow.

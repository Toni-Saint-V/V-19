# V-19 Visual Primitives Contract

## Product Intent
Перевести V-19 на единый dark-first визуальный контракт, где экран `Мои действия` является эталоном плотности, типографики, цветов, радиусов, кнопок, тегов, ячеек, side menu, right-side panel sections и motion.

## Target User
Агент или администратор VisaFlow, который каждый день быстро сканирует подачи, статусы, замечания, файлы и следующие действия на desktop и mobile.

## User Stories
- Как агент, я вижу одинаковые toolbar, tabs, search, filters, city selector и кнопки на рабочих экранах.
- Как агент, я вижу на mobile только два типа длинных ячеек и быстро понимаю ID, имя, город, даты, число людей и действие.
- Как администратор, я вижу на `Проверка` те же list primitives, что и на `Мои действия`, без отдельного визуального языка.
- Как оператор выгрузки, я вижу отдельные applicant/family cards только на `Выгрузка`, но в тех же токенах.
- Как пользователь, я получаю плавные и одинаковые hover/active/focus/open/close transitions, с поддержкой reduced motion.

## Acceptance Criteria
- Все новые visual values живут в token section `src/shared/ui/visual-baseline.css`; экранные правила используют `var(...)`.
- Все отступы тоже токены: page padding, section padding, card padding, toolbar gap, list gap, row grid gap, button padding, sidebar padding, right-panel padding, mobile bottom safe area.
- Project font берется из `--v19-font-family`; новые font imports запрещены.
- Shared primitives покрывают: sidebar, topbar title+hamburger, toolbar, tabs, city selector, search, filters, buttons, tags, status dots, long cells, applicant/family cards, right panel sections.
- Default/secondary buttons темно-серые; primary CTA остается indigo только для главного действия.
- Bright palette применяется только к маленьким dots/halos, не к большим badge backgrounds.
- Mobile имеет два reusable long-cell variants для `Мои действия` list, `Проверка` list и `Мои подачи`.
- Export-only applicant/family cards не появляются на остальных экранах.
- Right-side panel на `Выгрузка` и `Заявители` оформлен как набор секций, не как drawer.
- Motion есть у каждого интерактивного primitive: hover, active, pressed/selected, focus-visible, open/close, row select, panel reveal; reduced-motion safe.

## Edge Cases
- Очень длинное имя, город, дата или статус не должны создавать horizontal overflow.
- У одиночной подачи people badge пустой или скрыт.
- У семейной подачи people badge виден справа в mobile cell.
- Панель/toolbar не должны превращаться в два вложенных прямоугольника.
- Mobile toolbar не должен выносить filter/context buttons отдельной строкой от search.
- Disabled buttons должны выглядеть как disabled, но без яркой semantic заливки.

## Non-Happy Paths
- Если archive component использует mock data, routing или `motion/react`, переносится только визуальная анатомия.
- Если shared primitive ломает другой экран, change откатывается или ограничивается scope selector.
- Если browser proof показывает overflow/clip, экран не считается готовым.

## Technical Assumptions
- `src/shared/ui/system.css` остается legacy/base layer.
- `src/shared/ui/visual-baseline.css` подключен после `system.css` и является новым visual override layer.
- `CollectionPrimitives.tsx`, `OperationalNavigation.tsx`, `RightRailPrimitives.tsx` и existing screen classes можно использовать как shared primitive anchors.
- Архивы `/Users/user/Downloads/111111111.zip` и `/Users/user/Downloads/Premium Длинные ячейки и Заявители.zip` используются только как visual reference.

## Affected Modules
- `AGENTS.md`
- `src/main.tsx`
- `src/shared/ui/visual-baseline.css`
- `src/shared/ui/system.css` only if needed to expose existing tokens, not for new visual duplication
- `src/modules/submissions/components/CollectionPrimitives.tsx`
- `src/modules/submissions/components/OperationalNavigation.tsx`
- `src/modules/submissions/components/RightRailPrimitives.tsx`
- `src/modules/submissions/components/AgentSubmissionContextRail.tsx`
- `src/modules/submissions/pages/OperationsScreens.tsx`
- `src/modules/submissions/pages/FigmaVisualScreens.tsx`

## Implementation Tasks
- Freeze token vocabulary first, including spacing tokens before any screen selector work.
- Build shared button/tag/dot primitives.
- Build shared toolbar/topbar/sidebar primitives.
- Build two mobile long-cell variants.
- Build export-only applicant/family card primitive styling.
- Build right panel section styling for non-drawer side panels.
- Apply to `Мои действия` first, then shared dependent surfaces only where necessary.
- Verify desktop and mobile runtime screenshots before review.

## Verification Plan
- `npm run typecheck`
- `git diff --check -- AGENTS.md src/main.tsx src/shared/ui/visual-baseline.css`
- Token duplication scan for raw colors/sizes outside token block in `visual-baseline.css`
- Browser proof desktop and mobile for `Мои действия`
- Browser smoke for `Мои подачи`, `Проверка`, `Выгрузка`
- Fresh screenshots under `docs/qa/`
- Written `premium-design-ux-review` for current screen before moving to next screen

## Release Risks
- Existing `system.css` is large and has old screen-specific overrides; cascade conflicts are likely.
- Changing shared primitives can affect multiple surfaces at once.
- Mobile proof is mandatory because current feedback is mostly mobile-sensitive.

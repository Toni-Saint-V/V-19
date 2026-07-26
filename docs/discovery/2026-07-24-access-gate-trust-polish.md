## Goal

Усилить визуальное качество и доверие к VisaFlow в общей точке входа без
изменения authentication flow, данных, permissions или бизнес-логики.

## Hypotheses

- [x] AccessGate — высокоценная общая поверхность → validated: её видят агент
      и администратор до входа, тогда как основные рабочие экраны недавно
      получили отдельные polish-проходы.
- [x] Визуальное улучшение можно отделить от auth-поведения → validated:
      `AccessGateProps`, callbacks и state transitions уже локализованы в
      `src/components/AccessGate.tsx`.
- [x] Есть измеримый quality defect → validated: focused Playwright обнаружил
      мобильную кнопку высотой 32 px при контракте минимум 40 px.
- [~] Нужен новый auth-функционал → invalidated: цель закрывается текущими
  состояниями, factual copy и responsive presentation.

## Investigation plan

- [x] Phase 1: проверить source truth, текущий runtime и тестовый контур.
- [x] Phase 2: выбрать bounded visual approach и зафиксировать trust-copy.
- [x] Phase 3: реализовать scoped presentation и проверить все auth-состояния.

## Experiments

### 2026-07-24 — Source and runtime audit

what: проверены `AccessGate.tsx`, активный CSS cascade, unit/E2E contracts и
desktop/mobile localhost render.
saw: desktop brand-панель визуально доминирует без объяснения продукта; mobile
registration содержит 32 px navigation target; CSS ownership разделён между
`system.css` и финальным mobile convergence layer.
conclusion: нужен presentational polish с неизменным auth contract и явными
responsive guards.

## Confirmed direction

problem statement: агент или администратор должен с первого экрана понимать,
что VisaFlow — единый рабочий кабинет визовых подач, а доступ контролируется
администратором; успех — цельная trust-композиция во всех шести auth-состояниях,
40 px desktop / 44 px touch controls, отсутствие overflow и полное сохранение
существующего auth-поведения.

Пользователь подтвердил направление 2026-07-24 и выбрал `Visual + trust`.

## Ruled out

- CSS-only fix — закрывает geometry defect, но почти не усиливает доверие.
- Auth redesign — добавляет незаказанный функционал и риск.
- Полная консолидация глобального CSS cascade — расширяет diff без
  пропорциональной продуктовой ценности.

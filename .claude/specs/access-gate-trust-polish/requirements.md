# AccessGate Visual + Trust Polish Requirements

## US-1: Понимать продукт до входа

**As a** пользователь VisaFlow
**I want** видеть ясную brand и access context
**So that** первый экран выглядит цельным и вызывает доверие

### Acceptance Criteria

1. WHEN любое AccessGate-состояние отображается
   THE SYSTEM SHALL показывать общую VisaFlow identity и factual trust-copy.
2. THE SYSTEM SHALL NOT заявлять encryption, compliance, AI verification или
   другие неподтверждённые гарантии.

## US-2: Пользоваться AccessGate на любом viewport

**As a** пользователь mobile, tablet или desktop
**I want** видеть устойчивую композицию и доступные controls
**So that** вход и запрос доступа не выглядят сломанными

### Acceptance Criteria

1. WHILE viewport не шире 760 px
   THE SYSTEM SHALL держать touch controls не меньше 44x44 px.
2. WHILE viewport шире 760 px
   THE SYSTEM SHALL держать interactive controls не меньше 40 px.
3. THE SYSTEM SHALL NOT создавать page-level horizontal overflow.
4. WHILE viewport равен 320x568
   THE SYSTEM SHALL оставлять registration CTA доступным через scroll.
5. WHILE viewport равен 390x844 или 430x932
   THE SYSTEM SHALL сохранять primary registration CTA в первом viewport.

## US-3: Сохранить состояние и обратную связь

**As a** пользователь auth flow
**I want** получать прежнюю validation и status feedback
**So that** visual polish не меняет поведение доступа

### Acceptance Criteria

1. WHEN validation, error, success, busy или pending state отображается
   THE SYSTEM SHALL сохранять текущие `alert` / `status` semantics и focus.
2. WHEN reduced motion запрошен
   THE SYSTEM SHALL отключать non-essential animation.
3. WHEN длинный email или error text отображается
   THE SYSTEM SHALL переносить текст без clipping и horizontal overflow.

## US-4: Не менять auth contract

**As a** владелец продукта
**I want** ограничить изменение presentation-слоем
**So that** качество растёт без нового функционала

### Acceptance Criteria

1. THE SYSTEM SHALL preserve `AccessGateProps`, callbacks, validation,
   localStorage behavior, API calls и state transitions.
2. THE SYSTEM SHALL preserve local-demo registration with password and
   Supabase registration without password.
3. THE SYSTEM SHALL add no dependency, route, schema, persistence field or
   analytics event.

## Out of Scope

- Изменение auth, approval, recovery или invite behavior.
- Новые security/compliance promises.
- Глобальный CSS refactor.
- Рабочие экраны после входа.
- Commit, push, deploy и production mutation.

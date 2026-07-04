# Interaction Checklist

Runtime: `http://127.0.0.1:5174/`

Final browser proof: `all-screens-browser-qa-v4.json`

Result summary:

- Failures: `0`
- Page overflows: `0`
- Console/page errors: `0`
- Screenshots: `42`

## Agent

- Login as local agent.
- Navigate `Входящие`.
- Navigate `Мои действия`.
- Navigate `Мои подачи`.
- Navigate `Настройки`.
- Open action card.
- Open full submission drawer from mobile action summary when needed.
- Click drawer tabs: questionnaire, files, issues.
- Open create submission drawer.
- Verify create drawer is visible on desktop, tablet, and mobile.
- Verify mobile menu opens and each nav item is clickable.
- Verify no document-level horizontal overflow on desktop, tablet, or mobile.

## Admin

- Login as local admin.
- Navigate `Входящие`.
- Navigate `Мои действия`.
- Navigate `Проверка`.
- Navigate `Выгрузка`.
- Navigate `Настройки`.
- Open first review row.
- Click admin drawer tabs: questionnaire, passport/selfie/files, issues.
- Verify export actions and disabled/enabled button states are visible.
- Verify mobile menu opens and each nav item is clickable.
- Verify Admin Review tablet/mobile blocker is fixed.
- Verify no document-level horizontal overflow on desktop, tablet, or mobile.

## Responsive

Viewports tested:

- Desktop: `1440x900`
- Tablet: `768x1024`
- Mobile: `390x844`

Screenshots use prefix `v4-`.

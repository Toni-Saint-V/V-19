# Sandbox full-flow UI evidence

Run: `sandbox-2026-07-14T20-36-57-308Z`

Evidence rule: every row comes from a real browser state reached through UI interaction. Data is synthetic sandbox data; credentials are never captured.

| Step | Role | Project / viewport | Submission | Description | Screenshot |
| --- | --- | --- | --- | --- | --- |
| 01-agent-signed-in | agent | supabase-ui-desktop / 1440x900 | - | Агент вошёл через реальную форму авторизации; открыт рабочий экран без вывода credentials. | [supabase-ui-desktop-01-agent-signed-in.png](./supabase-ui-desktop-01-agent-signed-in.png) |
| 09-mobile-768-submissions | agent | supabase-ui-tablet-768 / 768x1024 | - | Mobile 768px: список подач открыт через навигацию; primary content видим. | [supabase-ui-tablet-768-09-mobile-768-submissions.png](./supabase-ui-tablet-768-09-mobile-768-submissions.png) |
| 02-single-01-create-empty | agent | supabase-ui-desktop / 1440x900 | - | Одиночная подача: открыта форма создания; primary action заблокирован до добавления паспортов. | [supabase-ui-desktop-02-single-01-create-empty.png](./supabase-ui-desktop-02-single-01-create-empty.png) |
| 09-mobile-768-drawer | agent | supabase-ui-tablet-768 / 768x1024 | - | Mobile 768px: drawer подачи открыт tap; содержимое и закрытие доступны. | [supabase-ui-tablet-768-09-mobile-768-drawer.png](./supabase-ui-tablet-768-09-mobile-768-drawer.png) |
| 09-mobile-320-submissions | agent | supabase-ui-mobile-320 / 320x740 | - | Mobile 320px: список подач открыт через навигацию; primary content видим. | [supabase-ui-mobile-320-09-mobile-320-submissions.png](./supabase-ui-mobile-320-09-mobile-320-submissions.png) |
| 09-mobile-390-submissions | agent | supabase-ui-mobile-390 / 390x664 | - | Mobile 390px: список подач открыт через навигацию; primary content видим. | [supabase-ui-mobile-390-09-mobile-390-submissions.png](./supabase-ui-mobile-390-09-mobile-390-submissions.png) |
| 09-mobile-430-submissions | agent | supabase-ui-mobile-430 / 430x932 | - | Mobile 430px: список подач открыт через навигацию; primary content видим. | [supabase-ui-mobile-430-09-mobile-430-submissions.png](./supabase-ui-mobile-430-09-mobile-430-submissions.png) |
| 09-mobile-390-drawer | agent | supabase-ui-mobile-390 / 390x664 | - | Mobile 390px: drawer подачи открыт tap; содержимое и закрытие доступны. | [supabase-ui-mobile-390-09-mobile-390-drawer.png](./supabase-ui-mobile-390-09-mobile-390-drawer.png) |
| 09-mobile-320-drawer | agent | supabase-ui-mobile-320 / 320x740 | - | Mobile 320px: drawer подачи открыт tap; содержимое и закрытие доступны. | [supabase-ui-mobile-320-09-mobile-320-drawer.png](./supabase-ui-mobile-320-09-mobile-320-drawer.png) |
| 09-mobile-430-drawer | agent | supabase-ui-mobile-430 / 430x932 | - | Mobile 430px: drawer подачи открыт tap; содержимое и закрытие доступны. | [supabase-ui-mobile-430-09-mobile-430-drawer.png](./supabase-ui-mobile-430-09-mobile-430-drawer.png) |
| 02-single-02-create-ready | agent | supabase-ui-desktop / 1440x900 | - | Одиночная подача: паспортные файлы выбраны через UI, создание анкеты доступно. | [supabase-ui-desktop-02-single-02-create-ready.png](./supabase-ui-desktop-02-single-02-create-ready.png) |
| 02-single-03-applicant-01-section-01 | agent | supabase-ui-desktop / 1440x900 | VF-11111115-mrl4409p-1-166xt3q | Одиночная подача: заявитель 1/1, раздел 1/10 «Файлы -» заполнен реальными UI-кликами и вводом. | [supabase-ui-desktop-02-single-03-applicant-01-section-01.png](./supabase-ui-desktop-02-single-03-applicant-01-section-01.png) |

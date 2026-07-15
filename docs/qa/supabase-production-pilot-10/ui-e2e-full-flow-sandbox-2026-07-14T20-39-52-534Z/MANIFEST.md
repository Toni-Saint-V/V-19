# Sandbox full-flow UI evidence

Run: `sandbox-2026-07-14T20-39-52-534Z`

Evidence rule: every row comes from a real browser state reached through UI interaction. Data is synthetic sandbox data; credentials are never captured.

| Step | Role | Project / viewport | Submission | Description | Screenshot |
| --- | --- | --- | --- | --- | --- |
| 01-agent-signed-in | agent | supabase-ui-desktop / 1440x900 | - | Агент вошёл через реальную форму авторизации; открыт рабочий экран без вывода credentials. | [supabase-ui-desktop-01-agent-signed-in.png](./supabase-ui-desktop-01-agent-signed-in.png) |
| 02-single-01-create-empty | agent | supabase-ui-desktop / 1440x900 | - | Одиночная подача: открыта форма создания; primary action заблокирован до добавления паспортов. | [supabase-ui-desktop-02-single-01-create-empty.png](./supabase-ui-desktop-02-single-01-create-empty.png) |
| 02-single-02-create-ready | agent | supabase-ui-desktop / 1440x900 | - | Одиночная подача: паспортные файлы выбраны через UI, создание анкеты доступно. | [supabase-ui-desktop-02-single-02-create-ready.png](./supabase-ui-desktop-02-single-02-create-ready.png) |
| 02-single-03-applicant-01-section-01 | agent | supabase-ui-desktop / 1440x900 | VF-11111116-mrl47qpx-1-0pczgvw | Одиночная подача: заявитель 1/1, раздел 1/10 «Файлы -» заполнен реальными UI-кликами и вводом. | [supabase-ui-desktop-02-single-03-applicant-01-section-01.png](./supabase-ui-desktop-02-single-03-applicant-01-section-01.png) |
| 02-single-03-applicant-01-section-02 | agent | supabase-ui-desktop / 1440x900 | VF-11111116-mrl47qpx-1-0pczgvw | Одиночная подача: заявитель 1/1, раздел 2/10 «Запись -» заполнен реальными UI-кликами и вводом. | [supabase-ui-desktop-02-single-03-applicant-01-section-02.png](./supabase-ui-desktop-02-single-03-applicant-01-section-02.png) |

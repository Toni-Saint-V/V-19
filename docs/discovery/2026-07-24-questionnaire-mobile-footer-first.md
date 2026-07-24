# Mobile questionnaire footer-first

## Goal

Объединить компактную мобильную навигацию анкеты с полным доредизайновым
сценарием, не меняя desktop и бизнес-логику.

## Hypotheses

- [x] Постоянные действия можно вернуть без overlay → footer является отдельным
      flex-элементом fullscreen shell и уменьшает только высоту scroll viewport.
- [x] Верхний mobile header можно убрать без потери действий → previous/next,
      Save/Exit и applicant switch доступны в footer, а секции остаются сверху.
- [x] Историческое продолжение можно сохранить → CTA в конце скролла использует
      текущий `continueSectionFlow`: следующая секция, следующий заявитель, Save/Exit.
- [~] Одновременный header и footer улучшат доступность → отклонено: они
  дублируют действия и уменьшают полезную высоту формы.

## Investigation plan

- [x] Сверить `997e65a9`, текущий `main` и промежуточный footer commit.
- [x] Сверить section/field order, подсказки, family-copy и issue routing.
- [x] Зафиксировать выбранную мобильную композицию с пользователем.

## Experiments

### 2026-07-24 — Source and regression baseline

what: Сопоставлены историческая и текущая анкеты; запущены focused unit и
questionnaire browser sanity.

saw: Порядок 7 секций, 57 field bindings, 45 Excel mappings и 31 placeholder
совпадают. Baseline: unit `96 passed, 5 skipped`; E2E `6 passed`.

conclusion: Нужен bounded UI/navigation patch поверх текущего `main`, без
восстановления старой копии компонента.

### 2026-07-24 — Footer-first verification

what: Реализованы четыре footer actions, общий navigation helper и реальный
двухзаявительный browser fixture для applicant menu.

saw: Focused unit `98 passed, 5 skipped`; questionnaire E2E `7 passed` на
`320/375/390/430/768/1024/1440`; typecheck, lint и local-demo build прошли.
Portal applicant menu потребовал отдельного scoped layer над fullscreen shell.

conclusion: Mobile footer, contextual CTA и desktop composition сохраняют единый
контракт навигации; реализация готова к commit/push/deploy по команде пользователя.

## Confirmed direction

problem statement: Агенту на мобильном нужен один нормальный scroll с секциями и
контекстом сверху, постоянными четырьмя действиями снизу и полной CTA в конце
раздела. Успех — desktop не изменён, footer не перекрывает контент, а все
текущие persistence/validation/copy/issue сценарии остаются зелёными.

## Ruled out

- Полный rollback к `997e65a9` — потеряет более поздние исправления.
- Header + footer — дублирует действия и съедает высоту.
- Удаление end-of-scroll CTA — ломает переход к следующему заявителю и
  финальный Save/Exit.

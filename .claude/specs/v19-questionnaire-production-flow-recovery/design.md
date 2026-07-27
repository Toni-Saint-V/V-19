# Дизайн: перенос рабочего persistence handoff

## Найденное рабочее поведение

В `939b4b5d` agent save после успешного `save_submission_draft` принимает server response, обновляет локальный submission state и запускает штатный canonical refresh. Это позволяет `CommandCenter` завершить create-flow и открыть анкету.

В `d79ac3f2` тот же вызов дополнительно включает `{ verifyCanonicalReadback: true }`. Raw intended draft сравнивается с уже нормализованным canonical snapshot, поэтому семантически эквивалентный результат ошибочно классифицируется как `CANONICAL_READBACK_MISMATCH`.

## Перенос

В `src/App.tsx` вызов `saveCockpitSubmissionsForProfile` возвращается к рабочему режиму `939b4b5d`: без принудительной опции post-save raw readback.

Сохраняются все более новые контракты production baseline:

- revision из RPC;
- ownership boundary;
- retry/canonical reconciliation внутри persistence adapter;
- pending submission id против дублей;
- штатный refresh после успешного commit;
- обработка реальных RPC и transport failures.

## Реальная UI-проверка

1. Создать одну подачу без паспорта.
2. Убедиться, что после успешного RPC открылась анкета.
3. Выйти из анкеты штатной кнопкой.
4. Открыть созданную подачу повторно из UI.
5. Перезагрузить страницу и подтвердить сохранённое состояние.
6. Сохранить скриншоты ключевых состояний вне product repository.

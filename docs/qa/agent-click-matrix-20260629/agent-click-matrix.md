# Agent Click Matrix 2026-06-29

| Screen | Control | Type | Status | Result |
|---|---|---|---|---|
| Мои действия | screen load | screen | WORKS | Экран открывается после agent login |
| Мои подачи | screen load | screen | WORKS | Обе категории видны на desktop |
| Настройки | screen load | screen | WORKS | Экран настроек открывается |
| Навигация агента | Мои подачи | button | WORKS | Переходит на список подач |
| Навигация агента | Настройки | button | WORKS | Переходит в настройки |
| Навигация агента | Мои действия | button | WORKS | Переходит в action queue |
| Навигация агента | profile/logout | button | WORKS | Возвращает на login gate |
| Мои действия | Все действия | filter tab | WORKS | Фильтр меняет/показывает список или empty state |
| Мои действия | Ошибки | filter tab | WORKS | Фильтр меняет/показывает список или empty state |
| Мои действия | На проверке | filter tab | WORKS | Фильтр меняет/показывает список или empty state |
| Мои действия | Поиск по действиям | search input | BROKEN | Поиск по ПД-1051 сужает выдачу |
| Мои действия | Колонки | view toggle | WORKS | Переключатель кликается, список остается доступен |
| Мои действия | Список | view toggle | WORKS | Переключатель кликается, список остается доступен |
| Мои действия | Создать пакет | button | WORKS | Открывает create drawer |
| Мои действия | row action Исправить | row button | WORKS | Открывает drawer/workspace context |
| Мои действия | row action Продолжить | row button | WORKS | Открывает drawer/workspace context |
| Мои действия | row action Добавить | row button | WORKS | Открывает drawer/workspace context |
| Мои действия | row action Смотреть | row button | WORKS | Открывает drawer/workspace context |
| Agent Drawer | open returned drawer | drawer | WORKS | Returned drawer opens with issue count |
| Agent Drawer | tab Обзор | tab | WORKS | Tab switches content |
| Agent Drawer | tab Анкета | tab | WORKS | Tab switches content |
| Agent Drawer | tab Замечания | tab | WORKS | Tab switches content |
| Agent Drawer | tab История | tab | WORKS | Tab switches content |
| Agent Drawer | issue action Исправить | issue button | WORKS | Переходит в анкету и показывает проблемный блок |
| Agent Drawer | issue action Перезагрузить | issue button | BROKEN | Выглядит как action, но aria-disabled/disabled; нельзя исправить файловое замечание |
| Agent Drawer | Отправить исправления | footer button | WORKS | Отправка прошла/изменила статус |
| Agent Drawer | Отмена | footer button | WORKS | Закрывает drawer или уводит из него |
| Create Submission | empty save/next gates | disabled state | WORKS | Без паспорта save/next disabled |
| Create Submission | single passport upload | file input | WORKS | Synthetic JPEG makes save/next available; copy stays manual-check |
| Create Submission | Сохранить черновик | button | WORKS | Creates draft and opens/updates submission |
| runtime | create family | script | BROKEN | Cannot access 'add' before initialization |
| Мои подачи | Все | filter tab | WORKS | Filter changes/preserves valid list |
| Мои подачи | Требуют действия | filter tab | WORKS | Filter changes/preserves valid list |
| Мои подачи | В работе | filter tab | WORKS | Filter changes/preserves valid list |
| Мои подачи | На проверке | filter tab | WORKS | Filter changes/preserves valid list |
| Мои подачи | Готово | filter tab | WORKS | Filter changes/preserves valid list |
| Мои подачи | Поиск по подачам | search input | BROKEN | После ввода “Иван” список визуально не сужается полностью |
| Мои подачи | Сбросить | button | WORKS | Clears search/filter |
| Мои подачи | card: Добавить селфи | card button | WORKS | Opens drawer/workspace context, but no obvious close button in side detail panel |
| Мои подачи | card: Смотреть статус | card button | WORKS | Opens drawer/workspace context, but no obvious close button in side detail panel |
| Мои подачи | card: Заполнить анкету | card button | WORKS | Opens drawer/workspace context, but no obvious close button in side detail panel |
| Мои подачи detail rail | Открыть файл | quick action | WORKS | Quick action opens drawer/workspace target |
| Мои подачи detail rail | Анкета | quick action | WORKS | Quick action opens drawer/workspace target |
| runtime | my submissions quick links | script | BROKEN | locator.click: Timeout 30000ms exceeded. |
| Настройки | Новая подача | button | OBSERVED | Visible button; not clicked if it may logout/change session/settings |
| Настройки | Профиль | button | OBSERVED | Visible button; not clicked if it may logout/change session/settings |
| Настройки | Уведомления | button | OBSERVED | Visible button; not clicked if it may logout/change session/settings |
| Настройки | Интерфейс | button | OBSERVED | Visible button; not clicked if it may logout/change session/settings |
| Настройки | Возврат подачи | button | OBSERVED | Visible button; not clicked if it may logout/change session/settings |
| Настройки | Новые замечания | button | OBSERVED | Visible button; not clicked if it may logout/change session/settings |
| Настройки | Ошибки выгрузки | button | DISABLED | Disabled visibly |
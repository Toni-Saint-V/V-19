# Linear-Style Examples For VisaFlow

These are product and interaction examples to study, not a request to copy brand assets. The goal is to apply the same design thinking: compact work surfaces, hidden depth, clear selected objects, and fast keyboard/mouse workflows.

## 1. Inbox / Triage Queue

Linear pattern:

- A dense list of issues is the main surface.
- Each row has title, status, owner, labels, priority, and timestamp.
- The list is scannable before any detail panel opens.
- Selection gives immediate context without navigating away.

VisaFlow application:

- Agent `Мои подачи` should behave like an operational inbox.
- Rows should represent cases/applicants that need action.
- Priority reason must be visible: missing document, returned correction, review waiting, export risk.
- The first row should be the obvious next case to open.

Concrete example:

```text
Case row
Name: Семья Ахмедовых
Status: Требует действия
Priority: High
Next action: Исправить срок действия паспорта
Owner: Agent
Signals: 2 blockers, 1 returned note, review due today
Primary row action: Open
```

## 2. Selected Row + Right Detail Drawer

Linear pattern:

- The main list remains visible.
- Details open in a right-side panel or detail page.
- The user keeps spatial context: where they came from, what is selected, what changed.
- Deeper tabs or sections are inside the detail layer, not dumped onto the main canvas.

VisaFlow application:

- Select a case in the queue.
- Open a right drawer with tabs:
  - `Обзор`
  - `Люди`
  - `Анкета`
  - `Файлы`
  - `Замечания`
  - `История`
- Keep the main queue calm and unchanged behind the drawer.

Concrete drawer behavior:

```text
Default tab: Обзор
Primary action: Исправить сейчас / Отправить на проверку / Вернуть с причиной
Secondary action: Copy safe summary
Close: returns to the same selected row
Mobile: drawer becomes full-height sheet
```

## 3. Saved Views Instead Of Dashboard Walls

Linear pattern:

- Work is segmented by views: assigned, created, triage, backlog, project, cycle.
- Views are lightweight filters over the same core object model.
- The product avoids decorative metric walls.

VisaFlow application:

- Agent views:
  - `Требуют действия`
  - `В работе`
  - `На проверке`
  - `Готово`
- Admin views:
  - `Новые на проверке`
  - `Возвраты`
  - `Приняты`
  - `Передача / выгрузка`
- Export views:
  - `Готово к выгрузке`
  - `Нужна ручная проверка`
  - `Передано`

The same case row model should power all views.

## 4. Command-Like Actions With Calm UI

Linear pattern:

- Primary actions are visible, but the interface does not show every possible action at once.
- Secondary actions live in menus, shortcuts, or contextual panels.
- The interface feels powerful because it is focused.

VisaFlow application:

- Main row action: `Открыть`.
- Detail primary action depends on state:
  - `Исправить`
  - `Отправить на проверку`
  - `Принять`
  - `Вернуть с причиной`
  - `Подготовить handoff`
- Secondary actions:
  - copy summary;
  - assign owner;
  - add note;
  - view audit history;
  - download safe export.

## 5. Compact Type Scale

Linear-style principle:

- Most work text is small but readable.
- Large type is rare.
- Weight and color create hierarchy, not huge sizes.

VisaFlow suggested scale:

```text
Page title: 18px / 24px / 600
Section title: 14px / 20px / 600
Row title: 13px / 18px / 600
Body: 13px / 18px / 400
Meta: 12px / 16px / 400
Chip: 11px / 14px / 500
Tiny audit text: 11px / 14px / 400
```

Rules:

- No negative letter spacing.
- No viewport-based font scaling.
- No giant dashboard numbers unless they are true operational counters.

## 6. Calm Dark Surface System

Linear-style principle:

- Backgrounds are close in value.
- Borders and selected states do the separation work.
- Bright color is reserved for meaning.

VisaFlow suggested tokens:

```text
bg.app: #08090b
bg.sidebar: #0c0d10
bg.panel: #111318
bg.panelRaised: #151820
bg.selected: #1b2030
border.subtle: rgba(255,255,255,0.08)
border.strong: rgba(255,255,255,0.14)
text.primary: #f4f6fb
text.secondary: #9ca3af
text.muted: #6f7682
accent.blue: #6aa4ff
accent.amber: #f2b84b
accent.green: #50c878
accent.red: #ff6b6b
```

Rules:

- Avoid random gradients.
- Avoid large shadows.
- Use one radius family, around `6px` to `8px`.

## 7. Status As Workflow, Not Decoration

Linear pattern:

- Status names are short and action-oriented.
- Status changes are part of the workflow.

VisaFlow status model:

```text
Draft -> Needs action -> In review -> Returned -> Accepted -> Handoff -> Exported
```

Trust-safe wording:

- Use `Accepted for human review` or `Ready for admin review`.
- Avoid `Approved`, `Officially verified`, `Visa ready`, or `Approval chance`.

## 8. Activity Feed

Linear pattern:

- History is chronological, compact, and secondary.
- It explains what changed without owning the whole screen.

VisaFlow application:

- Activity should live in drawer tab `История`.
- Include safe events:
  - case created;
  - document marked missing;
  - admin returned with reason;
  - agent fixed field;
  - submitted to review;
  - accepted for handoff.
- Do not log secrets or private document content in visible event text.

## 9. Search And Filters

Linear pattern:

- Search is quiet and predictable.
- Filters are composable, not visually loud.

VisaFlow application:

- Search sits inside the work panel header.
- City/status filters align with tabs.
- Long city names must not truncate if there is space.
- Mobile search becomes full-width inside the list panel.

Good search behavior:

```text
Search by applicant, family, case id, city, blocker text.
Empty state: "Ничего не найдено. Измените запрос или фильтр."
No fake semantic search unless implemented.
```

## 10. Keyboard / Speed Model

Linear-style principle:

- The product rewards repeated work.
- Selection, opening, closing, and changing views are fast.

VisaFlow application:

```text
Up/Down: move selected row
Enter: open drawer
Esc: close drawer
/ or Cmd+K: search / command menu
1-4: switch core views
```

If implemented later, show shortcuts only where useful. Do not clutter the UI with instructional text.

## What GPT Should Conclude

The next VisaFlow design should not be "more beautiful cards." It should be a Linear-like operations machine:

```text
One queue.
One selected object.
One safe next action.
Depth hidden in a right drawer.
Human review as the final certainty boundary.
```

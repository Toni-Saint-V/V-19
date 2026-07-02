> Deprecated archive: this v17 standalone prototype package is historical
> reference only. It is not current runtime source truth, production readiness
> evidence, or implementation precedence. Use
> `../docs/release/canonical-domain-contract.md` and the root `README.md`.

# VisaFlow V-19 — Design System Source of Truth v1.2

**Status:** release baseline  
**Applies to:** Agent and Admin operational UI  
**Reference implementation:** `visaflow-v19-prototype-v17.html`  
**Date:** 23 June 2026

---

## 1. Design principles

### 1.1 Operational clarity

Every surface must answer one of three questions:

1. What changed?
2. What requires action?
3. What is the exact next step?

### 1.2 Submission-first architecture

Submission is the primary object. Applicants, files, questionnaire sections, issues and history are always contextual children.

### 1.3 Calm premium density

The interface is dense but not cramped:

- explicit grid columns;
- restrained borders;
- selective semantic color;
- minimal shadow;
- no decorative dashboards.

### 1.4 Trust before delight

The UI must state real limitations:

- no real upload;
- no OCR or AI decision;
- no real Excel generation;
- unknown duplicate state without backend evidence.

Never simulate a production capability that is not implemented.

---

## 2. Brand system

### 2.1 Product mark

Use the supplied gold/blue globe + V artwork as the compact mark.

**Sidebar specification**

- desktop: 40 × 40 px;
- mobile sidebar: 36 × 36 px;
- radius: 12 px desktop, 11 px mobile;
- background: near-black;
- border: one neutral border token;
- no glow;
- no animated shine;
- no full-size logo poster inside product UI.

### 2.2 Wordmark

Use live text:

```text
VisaFlow V-19
Operations for Spain / Операции по Испании
```

Do not rasterize the product name in the application shell.

### 2.3 Brand color usage

Gold and blue belong primarily to the supplied mark. Product interaction colors continue to use semantic tokens. Do not recolor operational controls to gold.

---

## 3. Core tokens

### 3.1 Color

```css
--canvas: 5 5 6;
--panel: 16 16 17;
--surface: 20 20 22;
--raised: 24 24 27;
--control: 30 30 33;
--hover: 34 34 38;
--selected: 39 39 43;

--line: 32 33 36;
--line-default: 43 44 48;
--line-strong: 58 59 64;

--fg: 243 243 245;
--fg-2: 164 164 170;
--fg-3: 139 140 148;
--fg-disabled: 104 105 112;

--accent: 100 111 224;
--accent-hover: 116 126 232;
--accent-focus: 124 132 255;

--danger: 231 78 88;
--warning: 221 169 70;
--success: 60 188 118;
--info: 103 143 230;
```

### 3.2 Surface hierarchy

| Layer | Token | Use |
|---|---|---|
| Canvas | `--canvas` | Browser/app background |
| Panel | `--panel` | Sidebar, rail, table body |
| Surface | `--surface` | Page and cards |
| Raised | `--raised` | Selected rail summary, dialogs |
| Control | `--control` | Inputs, buttons, tags |

Depth is created by borders, sticky regions and overlays—not glass or gradients.

### 3.3 Radius

```css
--r-control: 10px;
--r-card: 12px;
--r-panel: 16px;
```

Additional component radii:

- brand mark: 12 px;
- context rail cards: 13 px;
- table shell: 15 px;
- pills: 999 px.

### 3.4 Shadow

Use the dialog shadow only for modal/overlay surfaces.

```css
--shadow-dialog:
  0 22px 68px rgb(0 0 0 / .5),
  0 1px 0 rgb(255 255 255 / .025) inset;
```

A docked desktop rail has no dialog shadow.

### 3.5 Motion

```css
--ease: cubic-bezier(.22,.8,.24,1);
```

Typical duration: 140–260 ms.  
Respect `prefers-reduced-motion` and reduce motion to effectively zero.

---

## 4. Typography

Default stack:

```css
Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
```

| Role | Size / line height | Weight |
|---|---:|---:|
| Page title | 21 / 28 | 590–600 |
| Drawer title | 19 / 24 | 610 |
| Context rail title | 14 / 19 | 620 |
| Collection title | 14.5 / 20 | 590 |
| Object/context | 12 / 17 | 570 |
| Metadata | 10–11.5 / 15–16 | 400 |
| Control | 12–14 / 20 | 540 |

Rules:

- avoid all caps in operational copy;
- use monospace only for IDs and technical contracts;
- do not truncate primary names when a lower-priority cell can collapse.

---

## 5. Spacing system

Base step: **4 px**.

Recommended scale:

```text
4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32
```

Key dimensions:

- app outer padding: 8 px desktop;
- sidebar width: 272 px;
- topbar: 64 px;
- context rail: 360 px;
- drawer: about 840 px;
- page padding: 18–22 px full width; 16 px with docked rail;
- collection row: 74–82 px;
- matrix row: 70–82 px;
- minimum primary control target: 44 px.

---

## 6. Application shell

### 6.1 Desktop, rail closed

```text
Sidebar 272 | Main flexible
```

### 6.2 Desktop, rail open

```text
Sidebar 272 | Main flexible | Rail 360
```

Threshold: **1280 px**.

### 6.3 Tablet/mobile

Below 1280 px:

- rail is an overlay;
- sidebar follows existing overlay rules;
- no document-level horizontal overflow.

---

## 7. Context Rail component

### 7.1 Purpose

The rail provides actionable context without replacing the Submission Drawer.

It may contain:

- current state;
- next exact action;
- open issues;
- quick links;
- recent changes;
- export checks and contract evidence.

It must not become a generic dashboard.

### 7.2 Anatomy

```text
Sticky header
  Eyebrow
  Title
  Close control
Scrollable body
  Summary card
  Action card
  Context cards
```

### 7.3 Desktop behavior

- part of app grid;
- square outer edges against app frame;
- left divider;
- independent vertical scroll;
- `overflow-x: hidden`;
- no backdrop;
- no dialog shadow.

### 7.4 Overlay behavior

Below 1280 px:

- fixed to right edge;
- backdrop required;
- close on Escape/backdrop;
- width is 360 px or full viewport on mobile.

### 7.5 Persistence

Visibility is route-scoped and stored for the browser session.

---

## 8. Collection row system

### 8.1 General rules

- use CSS Grid;
- explicit columns, not arbitrary spacing;
- no full colored row background;
- semantic indicator is a dot, icon or compact tag;
- exact action remains visible;
- primary title and target object remain separate when both matter.

### 8.2 Inbox

```text
Unread stripe | Event dot | Event title | Object/context | State | Action
```

### 8.3 My Actions

```text
Severity dot | Exact command | Target object | Due/availability | State | Action
```

### 8.4 My Submissions, rail closed

```text
Submission | Trip | Status | Files | Readiness | Disclosure
```

### 8.5 My Submissions, rail open

```text
Submission | Trip | Status + file detail | Readiness | Disclosure
```

This compact variant is a first-class component state, not a broken responsive fallback.

### 8.6 Admin Work

```text
Entity | Submission | City/trip | Wait | Readiness | Stage | Review action
```

The screen is always a list, never a board.

---

## 9. Semantic tags

### 9.1 Anatomy

```text
[ 6 px dot ] Label
```

Recommended height: 27–30 px.

### 9.2 Tone mapping

| Tone | Meaning |
|---|---|
| Danger | Returned, blocker, invalid exact target |
| Warning | Needs attention, replaced file awaiting review |
| Success | Complete, ready |
| Info | Review/focus state |
| Neutral | Metadata or non-semantic state |

### 9.3 Rules

- text is always present;
- tinted background opacity remains low;
- tags are content-sized;
- do not place multiple tags that repeat the same fact;
- do not paint the entire card/row.

---

## 10. Buttons and controls

### 10.1 Button hierarchy

- Primary: indigo, one per local decision area.
- Secondary: neutral control surface.
- Danger: neutral surface with danger text/border; avoid large red fills.
- Ghost: text or low-emphasis navigation.

### 10.2 Icon buttons

- minimum 40 × 40 desktop;
- accessible name required;
- use 44 px minimum for primary touch targets where possible;
- selected and focus states are independent.

### 10.3 Inputs

- height: 40–46 px;
- border: `--line-default`;
- invalid exact target: danger border + `aria-invalid`;
- no glow except focus ring.

---

## 11. Submission Drawer

### 11.1 Shell

- width: about 840 px;
- modal backdrop;
- sticky header/tabs/footer where applicable;
- focus trap;
- return focus to opener.

### 11.2 Issues

Desktop card:

```text
Title + status
Exact path
Reason | Comment
Severity + exact action + trust note
```

- reason/comment: two columns;
- mobile: one column;
- severity line: 3 px;
- footer: 48 px minimum, only meaningful controls.

### 11.3 Files

```text
File requirement | Owner | State/action
```

- ready: green tag;
- awaiting review: amber tag;
- replace/blocking: red tag;
- trust note appears once below matrix.

### 11.4 Applicants

```text
Identity | Readiness | State
```

- readiness receives the largest width;
- progress max visual width: about 300 px;
- file chip sits near readiness label;
- state centered vertically.

### 11.5 Questionnaire

- desktop section rail: 174 px;
- section row: 44 px;
- exact blocker stays visible;
- mini-diff: Before / Current / Expected;
- red only on exact blocker/invalid field;
- no mapping/debug chips in release UI.

### 11.6 Overview

```text
Main 1.08fr | Context 0.92fr
```

Keep next action prominent without turning the right column into a dashboard.

---

## 12. Export surface

### 12.1 Main table

Full state:

```text
Select | Submission | City | Dates | Applicants | State | Updated
```

Docked-rail state:

- Updated may collapse;
- state label becomes concise;
- selected-package command bar reduces to summary;
- commands live in the rail.

### 12.2 Export rail

Must show:

- selected package;
- mapped/unresolved count;
- masked preview;
- pre-export guards;
- 56-row contract audit;
- fail-closed blocker;
- disabled real download.

### 12.3 Contract language

Use precise copy:

- `Excel · Sheet1 A:BD`
- `56 columns`
- `mapped / derived / unresolved`
- `Duplicate protection requires backend evidence`

Do not claim a file was generated.

---

## 13. Responsive contract

### >= 1280 px

- docked context rail available and visible by default on My Submissions and Export;
- compact My Submissions row while rail is open;
- full app sidebar;
- drawer about 840 px.

### 768–1279 px

- rail overlay on explicit action;
- lower-priority columns may collapse;
- lists remain lists;
- no kanban reflow.

### <= 767 px

- one-column page;
- row uses title + metadata + compact state summary;
- drawer full-screen;
- matrices stack;
- exact action remains reachable;
- no overflow at 390 px.

---

## 14. Accessibility

Required baseline:

- semantic buttons and links;
- `tablist`, `tab`, `aria-selected` for tabs;
- `aria-label` for icon-only controls;
- visible keyboard focus;
- focus trap and focus return for drawer;
- `aria-invalid` and `aria-describedby` for errors;
- text plus color for status;
- reduced motion;
- WCAG AA contrast for normal text.

---

## 15. Content rules

### Good

- `Уточнить дату выезда`
- `Анна Петрова · Поездка · поле 28`
- `Ожидает проверки`
- `Файлы не отправляются`

### Avoid

- generic `Открыть` when an exact action exists;
- mixed-language operational labels;
- repeated trust copy in every row;
- duplicate `Возвращено`, percentage or file count;
- claims that upload/OCR/Excel succeeded.

---

## 16. Anti-patterns

Do not add:

- kanban or draggable columns;
- metric-card dashboards;
- CRM or separate People/Family products;
- decorative charts;
- full-row semantic backgrounds;
- glassmorphism or glow;
- oversized logo art in product navigation;
- fake upload, OCR, AI decision or download;
- hidden critical state on mobile.

---

## 17. Quality gates

Before release, verify:

- 1440×900;
- 1280×800;
- 1024×768;
- 390×844;
- rail open/closed;
- all Drawer tabs;
- exact-target focus;
- Agent and Admin roles;
- Export mapping audit;
- no document horizontal overflow;
- no console/page errors.

The v17 standalone reference passed **56/56 Playwright assertions**. This is the minimum regression baseline for subsequent implementation.

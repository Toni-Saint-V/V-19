# VisaFlow V-19 — Codex Implementation Specification v17

**Status:** implementation-ready  
**Primary executable artifact:** `visaflow-v19-prototype-v17.html`  
**Design authority:** `VisaFlow_V19_Design_System_Source_of_Truth_v1.2.md`  
**Release date:** 23 June 2026

---

## 1. Release objective

Implement the v17 interface calibration without adding new product areas or changing the domain model.

The release has four concrete goals:

1. Integrate the supplied VisaFlow brand mark into the product shell.
2. Make the right-side context surface a true docked column on desktop, with an explicit hide/show control.
3. Preserve a premium, readable content row when the rail is open.
4. Refine the Submission Drawer internals: Issues, Files, Questionnaire, Applicants and Overview.

The result remains a dark, Submission-first operational SaaS for Spain visa applications.

---

## 2. Source precedence

When implementation sources disagree, use this order:

1. `VisaFlow_V19_Codex_Implementation_Spec_v17.md`
2. `VisaFlow_V19_Design_System_Source_of_Truth_v1.2.md`
3. `visaflow-v19-prototype-v17.html`
4. `VisaFlow_V19_Release_Design_Logic_Spec_v15.pdf`
5. Older prototype patches and screenshots

v17 overrides the previous rule that My Submissions must start without a context rail. On desktop **1280 px and wider**, My Submissions and Export start with the rail visible. The user can hide it explicitly.

---

## 3. Product boundaries

### 3.1 Primary entity

`Submission` remains the only top-level operational object.

```ts
type Submission = {
  id: string;
  type: 'single' | 'family';
  applicants: Applicant[];
  questionnaire: Questionnaire;
  files: SubmissionFile[];
  issues: Issue[];
  history: HistoryEvent[];
  exportState: ExportState;
};
```

Applicants, family members, files, issues and history are contextual children of a Submission.

### 3.2 Role architecture

**Agent navigation**

1. Inbox
2. My Actions
3. My Submissions
4. Settings

**Admin navigation**

1. Work
2. Export

Admin Work local tabs remain:

- To Review
- Corrections
- Events

Do not reintroduce standalone Admin Inbox, Actions or Review routes.

### 3.3 Excluded implementation

Do not add:

- Supabase or another database;
- production authentication or permissions;
- real file upload or file reading;
- OCR or AI decisions;
- real Excel generation or download;
- fake backend success;
- dashboards, CRM entities, kanban or analytics.

---

## 4. Domain invariants

### 4.1 Submission lifecycle

```text
draft
→ in_progress
→ submitted_for_review
→ returned / requires_action
→ corrections_received
→ ready_for_export
→ exported
```

Opening a row, selecting a row, opening a rail or opening a drawer must not mutate Submission status.

### 4.2 Issue lifecycle

```text
open → fixed → closed
```

- `open`: unresolved target.
- `fixed`: valid target change recorded by Agent.
- `closed`: change reviewed and closed by Admin.

Exact target contract:

```ts
type ExactTarget = {
  submissionId: string;
  applicantId?: string;
  tab: 'overview' | 'applicants' | 'questionnaire' | 'files' | 'issues' | 'history';
  sectionId?: string;
  fieldId?: string;
  fileId?: string;
  issueId?: string;
};
```

A questionnaire issue is fixed only by its target field. A file issue cannot be fixed by a fake upload action.

### 4.3 Inbox behavior

- Unread event: one 3 px indigo stripe.
- Event type: small semantic dot.
- Opening an event may mark that event read.
- Opening an event must not change Submission status.
- Exact action must open the correct tab/section/field.

---

## 5. Brand integration

### 5.1 Sidebar brand

Use the supplied VisaFlow globe/V mark as a compact product mark.

```text
[ 40 × 40 mark ] VisaFlow V-19
                 Operations for Spain
```

Requirements:

- self-contained asset or repository asset with stable path;
- 40 × 40 px desktop, 36 × 36 px mobile sidebar;
- 12 px radius;
- dark background matching the sidebar;
- one neutral border;
- no glow, animated shine or oversized wordmark;
- product title remains live text for readability.

The prototype embeds the mark as a WebP data URI so the HTML remains self-contained.

---

## 6. Docked Context Rail

### 6.1 Layout contract

Desktop, width **>= 1280 px**:

```text
Sidebar 272 px | Main minmax(0, 1fr) | Context Rail 360 px
```

Tablet/mobile, width **< 1280 px**:

- rail is closed by default;
- explicit toolbar action opens it as an overlay;
- backdrop closes it;
- document width must remain equal to viewport width.

### 6.2 Interaction

- Toolbar panel button toggles the rail.
- Rail header close button hides it.
- Wide-screen preference persists in `sessionStorage` per route:
  - `submissions`
  - `export`
- Hiding the rail immediately restores the full-width table.
- Opening the rail immediately switches My Submissions to the compact row contract.

### 6.3 Rail is not a drawer

On desktop the rail must:

- participate in the app grid;
- have no modal backdrop;
- have no floating radius or dialog shadow;
- scroll independently;
- remain visually connected to the page.

---

## 7. My Submissions contracts

### 7.1 Rail closed: full six-column table

```text
Submission | Trip | Status | Files | Readiness | Disclosure
```

### 7.2 Rail open: compact five-zone row

```text
Submission | Trip | Status + operational detail | Readiness | Disclosure
```

The compact Status cell includes the file count in secondary text, so information is not lost.

Example:

```text
Returned
1 blocker · 10 of 11
```

Rules:

- title, ID and applicant count remain in the identity cell;
- city and dates remain in Trip;
- status appears once;
- readiness appears once;
- file count appears once;
- no critical text truncation;
- no semantic full-row background.

### 7.3 Submission rail anatomy

1. Header: `Context of submission` + title + Close.
2. Compact identity/state summary.
3. Exact next action.
4. Open issues list.
5. Quick links: Questionnaire, Files, Issues.
6. Recent changes.

The next-action button must preserve exact target routing.

---

## 8. Export rail

Export remains a separate Admin surface with a distinct trust contract.

### 8.1 Rail anatomy

1. Excel contract header: `Sheet1 A:BD`.
2. Selected package count.
3. Mapped/unresolved summary.
4. Masked sheet preview.
5. Pre-export checks.
6. 56-row mapping audit.
7. Fail-closed blocker.
8. Disabled preflight/download controls.

### 8.2 Main table with rail open

- Keep Submission, City, Dates, Applicants and State readable.
- Hide only the lowest-priority Updated column.
- Use the concise state label `Ready`/`Готово` while docked.
- Move package command responsibility to the rail.
- The bottom bulk bar becomes a compact selection/blocker summary.

### 8.3 Trust rules

- only accepted/ready submissions;
- compatible city/date/category package;
- exact 56-column A:BD contract;
- unresolved mapping blocks preflight;
- duplicate status remains unknown without backend evidence;
- real download remains disabled.

---

## 9. Submission Drawer

### 9.1 Header

Contains:

- title;
- Spain, city, type/applicant count and ID;
- one semantic status tag;
- quiet readiness percentage;
- More and Close controls.

Do not add duplicate blocker/status chips.

### 9.2 Issues tab

Each issue card uses this hierarchy:

```text
Title                                 Status
Exact object path
────────────────────────────────────────────
Reason                  Comment
────────────────────────────────────────────
Severity | Exact action | Trust note
```

Rules:

- 3 px severity line on the left;
- no full colored card surface;
- reason and comment use two balanced columns on desktop;
- one column on mobile;
- footer renders only meaningful actions;
- file issues show the no-real-upload boundary once, in muted text.

### 9.3 Files tab

Three columns:

```text
File requirement | Owner | State/action
```

Rows contain requirement-specific secondary copy, not repeated system copy.

The trust boundary appears exactly once below the matrix:

```text
Files are not sent.
Only interface states are shown; upload and file reading are disabled.
```

### 9.4 Applicants tab

Three columns:

```text
Applicant identity | Questionnaire + files readiness | State
```

- readiness column is the largest flexible column;
- progress is neutral and capped visually;
- file count is an amber/green chip;
- state is centered at the right;
- no card-per-applicant redesign.

### 9.5 Questionnaire tab

Preserve exact-target logic.

Refinements:

- 174 px section rail on desktop;
- 44 px section rows;
- compact blocker header;
- Before / Current / Expected in a three-cell mini-diff;
- exact invalid field keeps `aria-invalid` and `aria-describedby`;
- section history remains a dialog.

### 9.6 Overview tab

Use a balanced two-column composition:

```text
Main 1.08fr | Context 0.92fr
```

Main:

- status and concise summary;
- responsible/reviewer/category/ID;
- checklist.

Context:

- next action;
- recent changes;
- history link.

---

## 10. Shared semantic components

```ts
type SemanticTone = 'neutral' | 'info' | 'warning' | 'danger' | 'success';

type SemanticTag = {
  label: string;
  tone: SemanticTone;
};

type ContextRailState = {
  route: 'submissions' | 'export';
  open: boolean;
  docked: boolean;
};
```

Color meanings:

- red: blocker, returned, invalid exact target;
- amber: warning, replaced file awaiting review;
- green: ready or complete;
- indigo: focus and primary action;
- gray: ordinary metadata and controls.

Status must never rely on color alone.

---

## 11. CSS implementation requirements

- Use existing design tokens.
- Use CSS Grid for app layout and row distribution.
- Never use `justify-content: space-between` as a substitute for an explicit column contract.
- Add `min-width: 0` to grid children containing potentially wide content.
- Context rail must have `overflow-x: hidden` and independent vertical scrolling.
- No document-level horizontal overflow at 390, 1024, 1280 or 1440 px.
- Preserve `prefers-reduced-motion` behavior.
- Touch targets: minimum 44 px for primary controls.
- No decorative gradients, glass, glow or full-row semantic fills.

---

## 12. Responsive behavior

### Desktop >= 1280 px

- Sidebar visible.
- My Submissions rail visible by default.
- Export rail visible by default.
- Rail is docked.
- My Submissions uses compact five-zone rows while rail is visible.
- Drawer width about 840 px.

### Tablet 768–1279 px

- Sidebar overlay according to existing contract.
- Rail closed by default.
- Explicit rail action opens an overlay.
- Main lists remain lists.

### Mobile <= 767 px

- One-column workspace.
- Submission row shows status, file count and readiness.
- Admin Work row shows city, applicant count and wait time.
- Drawer becomes full-screen.
- Issue details stack.
- Applicant/File matrices stack while retaining state.
- No horizontal overflow at 390 px.

---

## 13. Accessibility floor

- Semantic buttons; no clickable `div`.
- Visible `:focus-visible` ring.
- Every icon-only button has an accessible name.
- Tabs use `tablist`, `tab`, `aria-selected`.
- Drawer traps focus and restores focus to opener.
- Exact error field uses `aria-invalid` and `aria-describedby`.
- Status uses text plus color.
- Reduced motion is respected.
- Normal text must meet WCAG AA contrast.

---

## 14. Implementation order for Codex

1. Inspect repository status and avoid unrelated dirty files.
2. Locate existing shell, routes, drawer and export ownership.
3. Add the compact brand asset/component.
4. Add route-scoped context-rail state and session persistence.
5. Implement desktop three-column app grid at 1280 px.
6. Implement full/compact My Submissions row variants.
7. Implement Submission context rail.
8. Implement Export context rail and compact docked table state.
9. Refine Issues tab.
10. Refine Files tab and remove repeated trust copy.
11. Refine Applicants matrix.
12. Refine Questionnaire spacing without changing exact-target logic.
13. Verify Overview balance.
14. Run browser tests at 1440×900, 1280×800, 1024×768 and 390×844.
15. Record PASS/FAIL; do not claim completion without runtime evidence.

Do not commit, push or deploy without explicit approval.

---

## 15. Acceptance criteria

- [ ] Supplied VisaFlow mark is integrated in the sidebar.
- [ ] Product title remains readable live text.
- [ ] My Submissions rail is docked at >=1280 px.
- [ ] Export rail is docked at >=1280 px.
- [ ] Both rails can be hidden and reopened.
- [ ] Rail preference persists for the current browser session.
- [ ] Rail-open Submission row uses five stable zones.
- [ ] Rail-closed Submission table restores six columns.
- [ ] Status, file count and readiness are not duplicated.
- [ ] Rail next action opens the exact target field/file/tab.
- [ ] Issues cards are compact and use reason/comment columns.
- [ ] Files trust copy appears once.
- [ ] Applicants remain a balanced matrix.
- [ ] Questionnaire mini-diff shows Before/Current/Expected.
- [ ] Export audit contains exactly 56 mapping rows.
- [ ] Unresolved mapping blocks export.
- [ ] Real download remains disabled.
- [ ] Admin navigation contains only Work and Export.
- [ ] No document horizontal overflow at target viewports.
- [ ] Runtime has no console/page errors in tested scenarios.

---

## 16. Verification evidence

The standalone v17 HTML was verified in headless Chromium with Playwright using `page.set_content`.

**Result: 56/56 assertions passed.**

Coverage includes:

- brand rendering;
- docked and overlay rail modes;
- rail toggle and session state;
- full/compact Submission table contracts;
- exact-target routing and focus;
- all five Drawer surfaces;
- file trust-copy deduplication;
- 390 px overflow;
- Inbox unread transition and status immutability;
- Admin two-screen IA;
- 56-row export mapping audit;
- disabled real download;
- runtime errors.

This is browser proof for the standalone prototype. It is not backend, security, formal WCAG, upload, OCR, AI or production Excel certification.

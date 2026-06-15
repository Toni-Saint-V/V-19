# GPT Deep Research Prompt: VisaFlow Premium Operations Workspace

You are a senior product designer, UX architect, and frontend systems designer for B2B SaaS operations software.

Your task is to deeply analyze the attached VisaFlow evidence package and produce the strongest possible product/UI direction for the next implementation pass.

## Evidence Package

Inspect these files and folders:

- `docs/research/deep-research-idea-pack/README.md`
- `docs/research/deep-research-idea-pack/LINEAR_STYLE_EXAMPLES.md`
- `docs/prototypes/deep-research/visaflow-v19-ferrari-cockpit.html`
- `docs/prototypes/deep-research/visaflow-v20-2-operations-prototype.html`
- `docs/prototypes/deep-research/visaflow-v20-2-operations-prototype.backup-before-agent-ui.html`
- `docs/qa/deep-research-idea-pack/source-references/`
- `docs/qa/deep-research-idea-pack/v19-ferrari-cockpit/`
- `docs/qa/deep-research-idea-pack/v20-2-operations/`

## Product Context

Product: VisaFlow AI, an operations workspace for visa agencies.

Core users:

- Agent: prepares cases, fixes blockers, submits for review.
- Admin/reviewer: reviews submissions, accepts or returns with reasons, tracks handoff/export.
- Human operator: owns final uncertainty and operational decisions.

Core model:

```text
Role entry -> Priority queue -> Active object -> Exact next action -> Right drawer depth -> Human review / handoff
```

The product should not feel like a marketing dashboard. It should feel like a premium operations cockpit: dense, quiet, fast, and obvious.

## Non-Negotiable Trust Rules

AI may:

- explain;
- organize;
- summarize blockers;
- draft review-safe helper text;
- prioritize attention;
- prepare handoff materials.

AI may not:

- promise visas;
- estimate approval odds;
- claim official/government verification;
- fake OCR;
- fake uploads;
- fake decisions;
- imply outcome control.

Human review closes uncertainty.

## Analysis Tasks

### 1. Extract Visual Grammar

From the reference images and prototypes, identify:

- layout grammar;
- type scale;
- spacing rhythm;
- surface system;
- sidebar behavior;
- search/filter behavior;
- row/table/card density;
- drawer/slide-over mechanics;
- selected/hover/focus states;
- mobile behavior;
- weak patterns that should be rejected.

Be explicit about what should be copied from the Linear-style reference thinking:

- hidden depth;
- compact typography;
- row-first work surfaces;
- calm dark palette;
- right-side slide-over;
- tabs inside the detail layer;
- clear selected object;
- no decorative overload.

### 2. Product Flow Synthesis

Design a complete flow map:

1. Agent Case Queue.
2. Agent Case Workspace.
3. Applicant Task Screen.
4. Fix / Edit Screen.
5. Submit To Review.
6. Admin Command Center.
7. Admin Review Screen.
8. Returned Corrections.
9. Export / Appointment / Handoff Tracking.

For each screen define:

- user goal;
- primary action;
- secondary actions;
- visible data;
- hidden drawer/detail data;
- loading state;
- empty state;
- error state;
- mobile behavior;
- acceptance criteria.

### 3. Design System

Produce a concrete design system:

- color tokens;
- semantic status tokens;
- typography scale;
- spacing scale;
- radius;
- borders;
- shadows;
- buttons;
- inputs/search;
- tabs;
- status chips;
- tables/lists;
- right drawer;
- modals;
- loading/empty/error/success states;
- responsive breakpoints.

Use exact values, not vague adjectives.

### 4. Critique Current Artifacts

Compare the copied HTML prototypes and screenshots:

- What is strongest in V19 Ferrari cockpit?
- What is strongest in V20.2 operations prototype?
- Which iterations still feel overloaded or weak?
- Which screenshots show final direction versus rejected direction?
- Which ideas should be merged into one product model?

Do not praise everything. Prioritize real product quality.

### 5. Implementation Handoff

Return a developer-ready plan for React/Vite:

- component tree;
- route/local-state model;
- data shape;
- events;
- view states;
- accessibility requirements;
- mobile rules;
- reduced-motion rules;
- QA screenshot plan;
- acceptance tests.

Keep the implementation scoped. Do not invent backend features that are not proven.

## Output Format

Return:

1. `Executive Direction`
   - One product direction and why it wins.
2. `Reference Extraction`
   - What to copy, what to reject.
3. `Screen Map`
   - Every screen with goal, action, states, and mobile behavior.
4. `Design System`
   - Tokens and component rules with exact values.
5. `Interaction Model`
   - Queue, active object, drawer, tabs, review/handoff mechanics.
6. `Trust & AI Safety`
   - Safe AI boundaries and copy rules.
7. `React Implementation Plan`
   - Components, state, events, tests.
8. `QA / Verification Plan`
   - Desktop/mobile screenshots, no overflow, accessibility, trust scan.
9. `Top 10 Improvements`
   - Ordered by impact.
10. `Final Scorecard`

- Score the proposed direction out of 100 with reasoning.

## Quality Bar

The answer must be concrete enough that a React/Vite developer can implement the next pass without asking what the product is supposed to be.

The result should be premium because the product logic is clear, not because it has decorative styling.

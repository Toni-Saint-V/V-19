# VisaFlow Deep Research Idea Pack

Purpose: give GPT Deep Research a dense, source-backed package of VisaFlow UI ideas, HTML prototypes, screenshots, rejected directions, and product constraints.

This package is intentionally docs-only. It does not change React runtime, Supabase, auth, schema, deployment, or product data.

## Source Threads

- `codex://threads/019ec3f0-fe98-7c43-aa58-c92ac0076cc7` - V19 Ferrari cockpit iteration, critique loop, Linear-style correction, drawer-depth model.
- `codex://threads/019ec0ec-63db-7323-9c7c-a2824c687d00` - V20.2 operations prototype, agent/admin/export screens, mobile and QA screenshots.
- `codex://threads/019ec5d5-06de-7850-bb15-259dda21b920` - prompt for turning source screens into a full HTML prototype and developer handoff.

## Inventory

### HTML Prototypes

- [V19 Ferrari cockpit prototype](../../prototypes/deep-research/visaflow-v19-ferrari-cockpit.html)
  - Best for studying the `Priority Queue -> Active Case -> Right Drawer` model.
  - Shows the later correction away from overloaded cards and toward a compact Linear-like operations surface.
- [V20.2 operations prototype](../../prototypes/deep-research/visaflow-v20-2-operations-prototype.html)
  - Best for studying the broad product flow: agent queue, admin command center, export/handoff, states, and responsive behavior.
- [V20.2 backup before agent UI polish](../../prototypes/deep-research/visaflow-v20-2-operations-prototype.backup-before-agent-ui.html)
  - Useful as a before-state for comparing the final agent dashboard polish.

### Screenshots

- [User/source references](../../qa/deep-research-idea-pack/source-references/)
  - Original visual references and feedback screenshots from the source threads.
  - Use these first to understand the intended premium direction: quiet dark system, compact hierarchy, hidden depth, slide-over details.
- [V19 Ferrari cockpit QA](../../qa/deep-research-idea-pack/v19-ferrari-cockpit/)
  - Focused screenshots for agent focus, drawer tabs, admin board, export, dark/light theme, mobile, and proof metadata.
- [V20.2 operations QA](../../qa/deep-research-idea-pack/v20-2-operations/)
  - Broad screenshot archive for admin, agent, export, intake, state screens, mobile, compact, and iterative polish passes.

Total copied evidence files in `docs/qa/deep-research-idea-pack/`: 167.

## Product Direction To Extract

The strongest direction is not a decorative dashboard. It is an operations workspace:

```text
Role entry -> Priority queue -> Active object -> Exact next action -> Right drawer depth -> Human review / handoff
```

The UI should answer one question quickly:

```text
What should the agent/admin open first, why, and what is the next safe action?
```

## Best Ideas To Preserve

1. Queue-first composition
   - Main surface is a prioritized list/table of cases, not a wall of cards.
   - Every row exposes status, next action, readiness risk, and owner.

2. Hidden depth through right drawer
   - Details appear only after selecting a case or action.
   - Drawer tabs carry depth: overview, people, form, files, issues, history.
   - Main screen stays calm; the drawer handles complexity.

3. Role-separated workspace
   - Agent view: fix, prepare, submit to review.
   - Admin view: review queue, accept, return with reason, track handoff.
   - Export/handoff view: operational transition after acceptance, not a fake automated outcome.

4. Compact premium SaaS density
   - Small stable type scale, no viewport-scaled headings.
   - Quiet dark surfaces, restrained borders, clear selected states.
   - Minimal decorative effects; hierarchy comes from layout and information priority.

5. Trust-safe AI
   - AI may explain, summarize blockers, draft safe text, and organize next actions.
   - AI may not promise visas, estimate approval odds, claim official verification, fake OCR, fake uploads, or make decisions.
   - Human review closes uncertainty.

6. State coverage
   - Include loading, empty, error, search-empty, disabled, mobile, compact, and returned-for-fixes states.
   - These states are visible in the V20.2 screenshot archive and should be treated as first-class product screens.

## Directions To Avoid

- Overloaded first screen that shows the whole lifecycle at once.
- Random cards competing for attention.
- Giant typography, aggressive font weights, negative letter spacing, or viewport-based font scaling.
- Decorative glassmorphism, large shadows, and random gradients.
- AI as a fake authority layer.
- Admin and agent flows blended into one ambiguous screen.
- Mobile as a compressed desktop screenshot.

## Key Screens GPT Should Synthesize

1. Agent Case Queue
   - Prioritized cases, filters, city/search controls, compact summary, no topbar clutter.
2. Agent Case Workspace
   - Active case, applicants, readiness blockers, exact next action.
3. Applicant Task Screen
   - Task-scoped edits instead of long form-first data entry.
4. Fix / Edit Screen
   - Field or document correction with validation and safe copy.
5. Submit To Review
   - Deterministic readiness checklist and human-review handoff.
6. Admin Command Center
   - Review queue, operational counters, attention routing.
7. Admin Review Screen
   - Accept or return with clear reason, required fixes, and audit trail.
8. Returned Corrections
   - Agent sees what to fix, why, and how to resubmit.
9. Export / Appointment / Handoff Tracking
   - Manual operational stage after acceptance; no fake automation.

## Evaluation Criteria For New Output

Score any new proposal against:

- Product logic: does the screen know what job it performs?
- Information hierarchy: can the next action be understood in 2 seconds?
- Role clarity: agent/admin/export responsibilities are separate.
- Trust safety: no fake visa, OCR, upload, official verification, or AI authority.
- UI density: compact, calm, readable, not marketing-style.
- Depth model: details are discoverable through drawer/tabs, not dumped onto the canvas.
- Responsive quality: mobile is designed, not merely squeezed.
- Developer handoff: components, states, events, and acceptance criteria are explicit.

## Recommended Reading Order

1. Open the user/source reference images.
2. Open the final V19 Ferrari cockpit HTML.
3. Inspect V19 screenshots for the drawer-depth model.
4. Open the V20.2 operations HTML.
5. Inspect V20.2 final, V6, premium, admin, export, and state screenshots.
6. Use [GPT_DEEP_RESEARCH_PROMPT.md](./GPT_DEEP_RESEARCH_PROMPT.md) as the actual research prompt.
7. Use [LINEAR_STYLE_EXAMPLES.md](./LINEAR_STYLE_EXAMPLES.md) for concrete Linear-style examples to translate into VisaFlow.

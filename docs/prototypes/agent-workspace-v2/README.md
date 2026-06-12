# Agent Workspace V2 Prototype

Standalone HTML prototype package for the new VisaFlow AI agent workspace.

Open:

```bash
open docs/prototypes/agent-workspace-v2/index.html
```

## Architecture

The prototype uses a task-first workflow:

```text
Cases Workspace -> Case Workspace -> Applicant Workspace -> Applicant Editing
-> Issue Resolution -> Returned For Fixes -> Readiness Review -> Ready For Review
```

The core mental model is:

```text
CASE -> APPLICANTS -> TASKS -> DATA
```

Not:

```text
CASE -> FORMS -> DATA -> TASKS
```

## Prototype Screens

1. Cases Workspace: choose the case by readiness, status, and next step.
2. Case Workspace: see readiness, blockers, main problem, and applicants.
3. Applicant Workspace: choose the task that moves the applicant toward readiness.
4. Applicant Editing: edit only data needed for the selected task using Profile, Documents, and Issues tabs.
5. Issue Resolution: show problem, reason, required action, and agent action.
6. Returned For Fixes: show operator return notes and correction path.
7. Readiness Review: show Ready / Not Ready, blockers, and next action.
8. Ready For Review: show final state after blockers are closed.

## Architecture Decisions

- Master -> Detail -> Task -> Action is the organizing layout.
- Tasks are the center of the workspace.
- AI is a small support layer for gaps, aggregation, and priority. It is not a product center.
- Long forms are hidden behind task-scoped progressive disclosure.
- Readiness is an outcome of closed tasks, not a standalone dashboard.

## Removed Concepts

- Intake Cockpit
- Readiness Autobot
- AI Helper as a primary product surface
- Family Intelligence as a main block
- Large right-side panels
- Form-first workflow

## UX Review Findings

- Overload reduced by showing one decision per screen.
- Dead ends reduced by making every screen expose a next action.
- Duplication reduced by moving readiness into the case and review screens only.
- AI language is trust-safe and secondary.
- Medium findings should block approval until fixed. Current intended state: Critical 0, Serious 0, Medium 0.

## Verification Targets

- All 8 screens reachable from the side rail or actions.
- Desktop and mobile have no horizontal overflow.
- Required task/readiness/issue copy is present.
- Buttons keep usable geometry on mobile.
- Screenshots should be saved under `docs/qa/`.

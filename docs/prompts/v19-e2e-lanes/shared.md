# Shared V-19 Parallel E2E Closure Contract

Repository source: `{{repoRoot}}`
Run id: `{{runId}}`
Base ref: `{{baseRef}}`
Model target: `{{model}}`
Reasoning target: `{{reasoning}}`
Plan reasoning target: `{{planReasoning}}`
Access target: `{{access}}`

You are one lane in a parallel VisaFlow V-19 closure run. Work only in your
assigned branch/worktree. Do not commit, push, merge, rebase, deploy, or run
destructive git. Preserve unrelated dirty work.

## Quality Target

This prompt is the lane contract after meta-prompt decomposition and strict
critic hardening. Target quality is 95+:

- One lane owns one bounded product slice.
- Every claim is tied to a copied artifact, inspected file, test, screenshot, or
  browser/runtime proof.
- Creator and verifier roles stay separate: implement/fix only inside owned
  scope, then challenge your own result with a strict critic pass before final
  verdict.
- If evidence is missing, write `BLOCKED` or `Unverified`; do not upgrade it to
  `PASS`.

## Shared State Model

Before touching implementation, read:

```text
$V19_TEST_ARTIFACTS_DIR/generated-lane-prompts/{{runId}}/context/docs/architecture/v19-flow-state-model.md
```

All screens, clicks, PDF behavior, export behavior, issue lifecycle, and history
must orbit that model:

- `Submission` is the single product entity.
- Lifecycle and permissions are domain-owned.
- React renders state and dispatches commands.
- `requiresAction` is derived, not a lifecycle status.
- Every click is either a domain command, a projection/navigation action, an
  artifact action, disabled-with-reason, or removed by V-19 scope.

## Non-Negotiables

- Inspect source truth before edits.
- Do not guess routes, selectors, flows, PDF behavior, export behavior, or readiness.
- Do not expand V-19 scope.
- Do not add country selection. Spain is fixed.
- Do not add forbidden surfaces: CRM, People, Families standalone, Groups, analytics, AI checker, board view, saved filters.
- Do not put business logic in React components.
- Do not fake PDF/export proof.
- Do not claim done without fresh verification.
- Treat local/demo proof, sandbox/live proof, and production readiness as separate evidence layers.

## Required Start

Before implementation, install/check required plugins if the launcher did not
already confirm them, then read the launch manifest, all copied context files,
and all copied skill files. Print this before implementation:

1. `pwd`
2. branch
3. `git status --short --branch`
4. your owned scope
5. files you must not touch
6. launch manifest path
7. copied context bundle paths you read
8. copied skill files you read
9. copied visual/QA assets you inspected or intentionally skipped
10. plugin/skill availability gaps, if any

## Skill Activation

Every lane must begin with:

```md
## Skill Activation

Applied:

- [skill/tool name] - [resolved path if skill] - [why used]

Unavailable:

- [skill/tool name] - [why unavailable or skipped]

Scope:

- What this lane owns:
- What this lane must not touch:
```

Do not proceed until this block is complete.

## Artifact Reading Contract

Read these copied artifacts from your own worktree before any edits:

- launch manifest;
- `AGENTS.md`;
- shared state model;
- prework report;
- flow matrix;
- click inventory;
- screenshots index;
- copied visual/QA assets relevant to your lane;
- lane config;
- shared prompt;
- every copied `skills/*.md` file.

If an artifact is missing, stop and report `BLOCKED: missing artifact`.

## Final Self-Critique

Before your final answer, run a strict self-review:

- Does every changed behavior map back to the shared state model?
- Did you keep V-19 scope locked?
- Did you avoid moving business logic into UI?
- Did you produce fresh evidence for every PASS?
- Are unresolved Critical/Serious/Medium findings still inside your lane?

If any answer is weak, report it as a finding instead of claiming closure.

# Codex Stack Audit

Date: 2026-06-12
Repo: `/Users/user/Documents/V-19`
Branch: `feat/domain-core`

Update note: this is the original pre-install audit. The current post-cleanup
and post-install state is tracked in `CODEX_INSTALL_EVAL_RESULTS.md`,
`CODEX_ACCELERATOR_STACKS.md`, and `CODEX_PLUGIN_CATALOG_SCREENING.md`.

## Executive Verdict

Current quality: 76/100

Main problem: the machine has a useful but noisy Codex surface. The actual daily core is small, while the installed catalog contains many disabled heavy workflow, review, creative, deploy, and connector tools that should stay out of the default route.

Biggest opportunity: standardize one V-19 operating system around repo source truth, `-go`, `-next`, `-pick`, `-check`, `-ship`, and task-specific presets. Do not promote tools because they exist. Promote only after the route is proven on a named task class.

What to stop immediately:

- Stop treating installed plugins as an active stack.
- Stop using legacy public mode names for V-19. Keep `Architect Mode`, `Builder Mode`, `Auditor Mode`, plus workflow aliases.
- Stop loading design/review/automation helpers by default.
- Stop starting with aggregate checks when a smaller proof answers the task.
- Stop expanding into deploy, GitHub, Supabase live operations, or connectors without task evidence.

What to standardize:

- Daily route: files first, targeted tests second, Browser only for UI/runtime proof, heavier reviewers only for release or high-risk changes.
- Tool promotion rule: `inventory -> route decision -> outcome -> noise -> fallback -> rollback`.
- Report rule: no completion claim without fresh verification and a readiness delta.

Operational readiness delta for this audit plan:

```text
72 -> 80 (+8)
```

This audit is read-only with respect to global Codex configuration. No plugin was installed, removed, enabled, or disabled.

## What I Inspected

- Repo rules: `AGENTS.md`
- V-19 operating docs: `docs/CODEX_OPERATING_MEMO.md`, `docs/codex/AGENTS.md`, `docs/codex/PROJECT_BRIEF.md`, `docs/codex/ARCHITECTURE.md`, `docs/codex/PLANS.md`, `docs/codex/TEST_STRATEGY.md`, `docs/codex/GITFLOW.md`
- Repo prompts and hook: `.codex/prompts/*`, `.codex/hooks.json`, `scripts/codex-quality-radar.mjs`
- Package scripts and stack: `package.json`
- Global Codex config: `~/.codex/config.toml`
- Plugin CLI surface: `codex plugin --help`, `codex plugin list --available --json`, `codex plugin marketplace list`
- MCP surface: `codex mcp list`
- Installed local skill files under `~/.codex/skills`
- Plugin manifests and skill folders under `~/.codex/plugins/cache`
- Current repo state: `git status --short --branch`

## What I Could Not Inspect

- Live marketplace ratings: UNKNOWN, because `web_search = "disabled"` and network access was not requested.
- Fresh external repository activity: UNKNOWN for the same reason.
- Plugin update history: UNKNOWN except local version/source fields visible in Codex snapshots.
- Runtime value of disabled MCP servers: not tested, because the task is an audit and activation would add side effects.
- Connector account data: not inspected; no connector was activated for live data.

## Current Inventory

### Configured Marketplace Snapshots

| Marketplace              | Installed | Available not installed | Source                     |
| ------------------------ | --------: | ----------------------: | -------------------------- |
| `openai-primary-runtime` |         1 |                       2 | local runtime              |
| `openai-bundled`         |         1 |                       1 | bundled local marketplace  |
| `awesome-codex-plugins`  |        10 |                      95 | git snapshot               |
| `openai-curated`         |         9 |                     164 | local curated snapshot     |
| Total                    |        21 |                     262 | 283 visible plugin records |

### Enabled Plugins

| Plugin                                     | Purpose                                              | Audit recommendation                                               |
| ------------------------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------ |
| `browser@openai-bundled`                   | In-app browser control for local UI/runtime checks   | KEEP, but use only when UI/runtime proof is needed                 |
| `development-skills@awesome-codex-plugins` | Development workflows, staff review, handoff helpers | PRESET ONLY; useful but overlaps with local mode skills            |
| `ru-text@awesome-codex-plugins`            | Russian text quality rules                           | RARE USE; use for Russian UX/copy pass, not every engineering task |

### Enabled MCP Servers

| MCP                   | Status  | Purpose                        | Recommendation                                          |
| --------------------- | ------- | ------------------------------ | ------------------------------------------------------- |
| `memory`              | enabled | local memory graph             | KEEP, but treat as historical context, not source truth |
| `node_repl`           | enabled | persistent Node-backed runtime | PRESET ONLY for browser/app/plugin workflows            |
| `openaiDeveloperDocs` | enabled | OpenAI docs                    | RARE USE for OpenAI API tasks                           |

Disabled MCP servers: `playwright`, `context7`, `figma`, `figma-desktop`.

### Current Global Defaults

| Setting                      | Current value     | Audit note                                                               |
| ---------------------------- | ----------------- | ------------------------------------------------------------------------ |
| `model`                      | `gpt-5.5`         | Good daily default                                                       |
| `review_model`               | `gpt-5.4`         | Fine for review, but use only at gates                                   |
| `model_reasoning_effort`     | `xhigh`           | Too heavy as a default for small work                                    |
| `plan_mode_reasoning_effort` | `xhigh`           | Good for hard architecture/audit                                         |
| `web_search`                 | `disabled`        | Correct for local source-truth work; live external audits become UNKNOWN |
| `approval_policy`            | `on-request`      | Good for controlled escalation                                           |
| `sandbox_mode`               | `workspace-write` | Good for repo work                                                       |

## Full Tool Matrix

Scores use the requested rubric: relevance, execution quality, risk reduction, context efficiency, frequency, integration value, maintenance, and noise penalty.

| Tool                                                | Type              |                     Status | Score | Recommendation | Use cases                                             | Anti-use cases                                      |
| --------------------------------------------------- | ----------------- | -------------------------: | ----: | -------------- | ----------------------------------------------------- | --------------------------------------------------- |
| `codex-logic`                                       | local skill       |                  available |    90 | KEEP           | architecture, domain, workflow, technical correctness | cosmetic-only work                                  |
| `codex-ui`                                          | local skill       |                  available |    86 | PRESET ONLY    | premium UI implementation                             | backend-only changes                                |
| `codex-ux`                                          | local skill       |                  available |    88 | PRESET ONLY    | strict review, trust, IA, merge verdict               | normal coding pass                                  |
| `codex-qa`                                          | local skill       |                  available |    87 | PRESET ONLY    | runtime proof, release confidence                     | early planning                                      |
| `codex-autopilot`                                   | local skill       |                  available |    82 | PRESET ONLY    | bounded one-task execution                            | broad multi-goal work                               |
| `codex-autopilot-performance`                       | local skill       |                  available |    78 | PRESET ONLY    | one bounded polish/performance target                 | feature scope expansion                             |
| `bank-grade-review`                                 | local skill       |                  available |    86 | RARE USE       | high-risk review, release gate                        | small docs/code fixes                               |
| `security-best-practices`                           | local skill       |                  available |    82 | RARE USE       | explicit security review                              | non-security feature work                           |
| `frontend-testing-debugging`                        | local skill       |                  available |    84 | PRESET ONLY    | UI runtime debugging                                  | source-only planning                                |
| `react-best-practices`                              | local skill       |                  available |    74 | RARE USE       | React performance review                              | generic Vite changes                                |
| `playwright`                                        | local skill       |                  available |    78 | PRESET ONLY    | browser automation from terminal                      | simple static inspection                            |
| `screenshot`                                        | local skill       |                  available |    68 | RARE USE       | OS screenshot fallback                                | normal Browser proof                                |
| `openai-docs`                                       | system skill      |                  available |    73 | RARE USE       | OpenAI API/model docs                                 | repo-local product work                             |
| `plugin-creator`                                    | system skill      |                  available |    72 | RARE USE       | create a real plugin scaffold                         | stack audit only                                    |
| `skill-creator`                                     | system skill      |                  available |    68 | RARE USE       | create/update skills                                  | normal implementation                               |
| `skill-installer`                                   | system skill      |                  available |    58 | RARE USE       | install skill after approval                          | default daily work                                  |
| `imagegen`                                          | system skill/tool |                  available |    45 | RARE USE       | bitmap assets                                         | V-19 cockpit code tasks                             |
| `chronicle`                                         | local skill       | available/disabled feature |    35 | DISABLE        | screen history ambiguity only                         | repo-backed source truth                            |
| `browser@openai-bundled`                            | plugin            |                    enabled |    84 | KEEP           | localhost UI/runtime proof                            | pure docs/domain work                               |
| `development-skills@awesome-codex-plugins`          | plugin            |                    enabled |    72 | PRESET ONLY    | staff review, handoff, language dev workflows         | default route; overlaps local skills                |
| `ru-text@awesome-codex-plugins`                     | plugin            |                    enabled |    55 | RARE USE       | Russian copy polish                                   | engineering tasks without text changes              |
| `agentops@awesome-codex-plugins`                    | plugin            |                   disabled |    44 | DISABLE        | large agent ops experiments                           | V-19 daily work; 158 skills is too much             |
| `codex-reviewer@awesome-codex-plugins`              | plugin            |                   disabled |    63 | RARE USE       | GitHub PR review                                      | local pre-PR work                                   |
| `praxis@awesome-codex-plugins`                      | plugin            |                   disabled |    58 | DISABLE        | alternate coding discipline                           | duplicates current gates                            |
| `spec-driven@awesome-codex-plugins`                 | plugin            |                   disabled |    50 | DISABLE        | greenfield spec writing                               | V-19 already has docs/tasks                         |
| `stark@awesome-codex-plugins`                       | plugin            |                   disabled |    52 | RARE USE       | design-token exploration                              | normal V-19 UI; overlaps Product Design/local rules |
| `tool-advisor@awesome-codex-plugins`                | plugin            |                   disabled |    46 | DISABLE        | broad tool discovery                                  | this audit replaces it                              |
| `universal-design-principles@awesome-codex-plugins` | plugin            |                   disabled |    42 | DISABLE        | generic UX principles                                 | V-19 has specific UI rules                          |
| `chrome-devtools@awesome-codex-plugins`             | plugin            |                   disabled |    66 | RARE USE       | deep Chrome debugging/perf                            | normal Browser smoke                                |
| `vercel@openai-curated`                             | plugin            |                   disabled |    62 | RARE USE       | deploy/debug hosted app                               | local MVP tasks                                     |
| `superpowers@openai-curated`                        | plugin            |                   disabled |    56 | DISABLE        | alternate planning/TDD stack                          | duplicates local Codex modes                        |
| `github@openai-curated`                             | plugin            |                   disabled |    64 | RARE USE       | PR/CI/issues                                          | local docs/code tasks                               |
| `build-web-apps@openai-curated`                     | plugin            |                   disabled |    70 | PRESET ONLY    | major frontend build with QA                          | small targeted fixes                                |
| `remotion@openai-curated`                           | plugin            |                   disabled |    15 | REMOVE         | video generation                                      | unrelated to VisaFlow MVP                           |
| `supabase@openai-curated`                           | plugin            |                   disabled |    76 | PRESET ONLY    | Supabase schema/RLS work                              | local mock-only flows                               |
| `openai-developers@openai-curated`                  | plugin            |                   disabled |    70 | RARE USE       | OpenAI API/agents docs                                | deterministic local domain work                     |
| `shutterstock@openai-curated`                       | plugin            |                   disabled |    12 | REMOVE         | stock assets                                          | V-19 cockpit should avoid stock visuals             |
| `picsart@openai-curated`                            | plugin            |                   disabled |    24 | REMOVE         | creative generation                                   | not core to this operational MVP                    |
| `presentations@openai-primary-runtime`              | plugin            |                   disabled |    22 | REMOVE         | decks                                                 | not daily product delivery                          |
| `memory`                                            | MCP               |                    enabled |    70 | KEEP           | prior decisions                                       | current code truth                                  |
| `node_repl`                                         | MCP               |                    enabled |    68 | PRESET ONLY    | JS/browser runtime support                            | simple shell/file inspection                        |
| `openaiDeveloperDocs`                               | MCP               |                    enabled |    66 | RARE USE       | OpenAI API docs                                       | normal V-19 product work                            |
| `playwright`                                        | MCP               |                   disabled |    70 | PRESET ONLY    | browser MCP automation                                | when Browser plugin is sufficient                   |
| `context7`                                          | MCP               |                   disabled |    50 | RARE USE       | external docs lookup                                  | local source-truth tasks                            |
| `figma` / `figma-desktop`                           | MCP               |                   disabled |    45 | RARE USE       | design file import                                    | no Figma artifact scoped                            |

## Duplication Analysis

| Cluster         | Keep                                                             | Replace                                        | Merge                                                 | Remove/disable                                                      |
| --------------- | ---------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------- |
| Daily execution | `-go`, `codex-logic`, `codex-execution-gate`, repo docs          | `spec-driven`, `praxis`, broad AgentOps        | fold useful ideas into V-19 prompts                   | keep `agentops`, `superpowers`, `praxis`, `spec-driven` default-off |
| Review          | `codex-ux`, `bank-grade-review` for high risk                    | `codex-reviewer` until PR/GitHub is active     | one findings-first rubric                             | no always-on external reviewer                                      |
| QA/browser      | Browser plugin, `npm run test:e2e`, `frontend-testing-debugging` | `chrome-devtools` for normal smoke             | Browser first, DevTools only for deep runtime/perf    | keep Chrome DevTools default-off                                    |
| UI design       | V-19 UI rules, `codex-ui`, prototypes, Browser screenshots       | generic design plugins                         | use Product Design only when a design artifact exists | keep `stark`, `universal-design-principles` default-off             |
| Supabase        | local repo rules, Supabase plugin only for schema/RLS scope      | build-web-apps Supabase skill for live DB work | central RLS/security checklist                        | no live Supabase by default                                         |
| Creative assets | existing UI system and generated app screenshots                 | Shutterstock/Picsart for MVP cockpit           | none for daily stack                                  | remove from default stack                                           |
| Docs/decks      | repo markdown docs                                               | presentations/documents for normal engineering | use only for deliverables                             | no docs plugin default                                              |
| Russian copy    | memory preference plus `ru-text` when needed                     | always-on `ru-text`                            | use a copy preset                                     | do not load for code-only work                                      |

## Context Economics

### Top Context Wasters

1. `model_reasoning_effort = "xhigh"` for all tasks.
2. `agentops@awesome-codex-plugins` with 158 skills.
3. `development-skills@awesome-codex-plugins` as a default instead of targeted skill use.
4. Legacy public mode names conflicting with V-19 `AGENTS.md`.
5. `ru-text` for code-only tasks.
6. `vercel` before deploy is scoped.
7. `superpowers` duplicating local planning/execution gates.
8. `stark` plus V-19 UI rules plus Product Design in the same pass.
9. `tool-advisor` during an already scoped audit.
10. `spec-driven` when V-19 already has project brief, plans, tasks, and test strategy.
11. `chrome-devtools` for checks that Browser can prove.
12. `openaiDeveloperDocs` for repo-local work.
13. `shutterstock` and `picsart` in an operational cockpit product.
14. `presentations` during engineering tasks.
15. `github` before PR/CI work is requested.
16. `supabase` live tools while local/mock remains the target.
17. Figma MCP with no Figma artifact.
18. `context7` for facts already present in repo docs.
19. Multiple review systems in one pass.
20. Multiple automation systems in one pass.

### Top Highest ROI Tools

1. `rg`, exact file reads, and repo docs.
2. `npm run typecheck`
3. `npm run test`
4. `npm run verify:safety`
5. `npm run verify`
6. Browser plugin for visible UI proof.
7. `npm run test:e2e` for UI/runtime changes.
8. `codex-logic`
9. `codex-ui`
10. `codex-ux`
11. `codex-qa`
12. `bank-grade-review` for release/high-risk review.
13. `security-best-practices` for scoped security review.
14. `supabase@openai-curated` only for RLS/schema tasks.
15. `openai-docs` only for OpenAI API implementation.

### Most Dangerous Tools

1. `agentops` if made default-on.
2. `superpowers` if layered over local gates.
3. Live Supabase tools without an explicit schema/RLS scope.
4. Deploy tools before release gate.
5. GitHub automation before PR intent.
6. Any broad connector with private user/business data.
7. Creative asset tools that can dilute operational UI.
8. Multiple browser/debug stacks at once.
9. Any plugin used because its name sounds helpful.
10. Live web search treated as source truth for local code.

### Hidden Gems

1. `.codex/prompts/go.md`: strong one-command founder loop.
2. `.codex/prompts/next-batch.md`: good task batch planner.
3. `scripts/codex-quality-radar.mjs`: local safety/workflow radar.
4. `docs/CODEX_OPERATING_MEMO.md`: compact operating system.
5. `docs/codex/TASKS_FOR_CODEX.md`: repo-backed task queue.
6. `npm run verify:performance`: rare, useful product-quality budget.
7. `npm run verify:safety`: protects VisaFlow trust copy.
8. `codex plugin list --available --json`: audit-grade inventory source.
9. `codex mcp list`: exact MCP state.
10. Browser plugin: high ROI when used only after UI/runtime changes.

## Tools To Disable Or Remove From The Default Surface

Immediate recommendation: do not delete files or uninstall automatically. Remove these from the mental/default route today and keep them disabled:

- `agentops@awesome-codex-plugins`
- `praxis@awesome-codex-plugins`
- `spec-driven@awesome-codex-plugins`
- `tool-advisor@awesome-codex-plugins`
- `universal-design-principles@awesome-codex-plugins`
- `superpowers@openai-curated`
- `remotion@openai-curated`
- `shutterstock@openai-curated`
- `picsart@openai-curated`
- `presentations@openai-primary-runtime`

Consider changing to preset-only later:

- `ru-text@awesome-codex-plugins`
- `development-skills@awesome-codex-plugins`
- `browser@openai-bundled`

Do not change `~/.codex/config.toml` without a separate backup-first task.

## Tools Worth Adding

No critical install is required today. The current stack already has enough to move V-19.

| Candidate                             | Status                 | Priority                       | What it replaces or adds                 | Expected ROI                         | Risk                                      |
| ------------------------------------- | ---------------------- | ------------------------------ | ---------------------------------------- | ------------------------------------ | ----------------------------------------- |
| `codex-security@openai-curated`       | visible, not installed | HIGH for release/security pass | Adds focused code security scanning      | Medium-high on auth/storage/RLS work | Could duplicate `security-best-practices` |
| `plugin-eval@openai-curated`          | visible, not installed | MEDIUM                         | Helps benchmark helpers before promotion | Medium for future stack cleanup      | Needs explicit evaluation task            |
| `posthog@openai-curated`              | visible, not installed | LOW until analytics exists     | Product analytics connector              | Medium later                         | Premature before instrumentation plan     |
| `documents@openai-primary-runtime`    | visible, not installed | LOW                            | Deliverable docs                         | Low for daily engineering            | Context/asset overhead                    |
| `spreadsheets@openai-primary-runtime` | visible, not installed | LOW                            | Structured audit matrices                | Low-medium for audits                | Not needed if markdown is enough          |

Rejected for now:

- `airtable@openai-curated`: V-19 is not a CRM/ops database migration target today.
- `lovable@openai-curated`: no active Lovable workspace task in this repo.
- `docusign@openai-curated`: document signing is outside MVP.
- `codebase-recon@awesome-codex-plugins`: `rg`, repo docs, and git history are enough here.
- `tailtest@awesome-codex-plugins`: automatic tests on every turn is too much noise.

## Recommended Presets

| Preset                   | Plugins                                                | Skills                                                              | MCP/tools                                     | Disable                        | Model/reasoning  | Use when                           | Do not use when            |
| ------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------- | --------------------------------------------- | ------------------------------ | ---------------- | ---------------------------------- | -------------------------- |
| Daily Core               | none required; Browser only if visible proof is needed | `codex-logic`                                                       | files, `rg`, targeted npm scripts             | all heavy plugins              | `gpt-5.5` medium | normal bounded task                | UI/release/security gate   |
| Product Logic            | none                                                   | `codex-logic`, optional `bank-grade-review`                         | files, tests                                  | Browser, creative, deploy      | high             | domain/status/export/AI guardrails | copy-only or CSS-only task |
| Premium UI Build         | Browser, optional Build Web Apps                       | `codex-ui`, `frontend-testing-debugging`                            | Browser, Playwright only if needed            | Supabase/GitHub/deploy         | high             | screen redesign, major UI          | tiny copy/CSS fix          |
| Architecture Engineering | none                                                   | `codex-logic`, `bank-grade-review`                                  | files, tests                                  | design/creative/connectors     | xhigh            | multi-file architecture            | small one-file fix         |
| Reviewer Bank Grade      | none                                                   | `codex-ux`, `bank-grade-review`, optional `security-best-practices` | diff, tests                                   | creative, deploy unless scoped | xhigh            | merge/no-merge decision            | early implementation       |
| QA Release               | Browser; GitHub only for PR/CI                         | `codex-qa`, `frontend-testing-debugging`                            | `npm run verify:full`, Browser, screenshots   | design ideation                | high/xhigh       | release confidence                 | planning only              |
| Research References      | OpenAI docs only when needed                           | `openai-docs`                                                       | `openaiDeveloperDocs`, web only if authorized | all unrelated plugins          | medium/high      | current external API fact          | repo-local fact exists     |
| Automation               | none by default                                        | `codex-autopilot`, `codex-execution-gate`, `codex-verdict-gate`     | files, targeted proof                         | AgentOps/Superpowers           | high             | one bounded task                   | unclear scope              |

## Mode Mapping

V-19 canonical contract wins.

| Legacy/internal label | V-19 public surface                                   | Required stack                             | Review gate                                      | Acceptance gate                                   | Forbidden by default             |
| --------------------- | ----------------------------------------------------- | ------------------------------------------ | ------------------------------------------------ | ------------------------------------------------- | -------------------------------- |
| `logic`               | Architect Mode                                        | `codex-logic`, files, tests                | self-review or `bank-grade-review` for high risk | targeted tests or `npm run verify`                | Browser, deploy, live connectors |
| `ui`                  | Builder Mode                                          | `codex-ui` for UI, otherwise `codex-logic` | `codex-ux` if risk is non-trivial                | typecheck/lint/test/build; Browser for visible UI | broad design plugins             |
| `ux`                  | Auditor Mode                                          | `codex-ux`, optional `bank-grade-review`   | findings first                                   | no Critical/Serious/Medium findings               | implementation scope creep       |
| `qa`                  | `-check` / release QA                                 | `codex-qa`, Browser if runtime affected    | QA findings                                      | `npm run verify`, `test:e2e` when UI/runtime      | product redesign                 |
| `auto`                | `-go`                                                 | smallest valid mix                         | `codex-execution-gate` and self-review           | proof command plus readiness delta                | multi-goal work                  |
| `auto2`               | no public V-19 command; bounded polish follow-up only | one target, one verifier                   | `codex-verdict-gate`                             | specific metric/proof                             | widening scope                   |

Common mistakes:

- Treating `logic/ui/ux/qa/auto/auto2` as public V-19 commands.
- Running Browser before exact file inspection.
- Running full verification before a targeted proof.
- Enabling Supabase/Vercel/GitHub because the repo mentions them.
- Calling a UI change premium without desktop/mobile evidence.

## VisaFlow Premium Operator

Purpose: a thin V-19 operating layer, not a large plugin bundle.

Daily rules:

- Source truth order: repo files, package scripts, tests, Browser proof, then external docs only when needed.
- Product boundary: Agent Intake -> Submission Creation -> Review Queue -> Correction Loop -> Excel-compatible Export -> Manual Appointment Handoff.
- AI boundary: explain, organize, simplify, prepare; never decide outcomes,
  invent upload/OCR evidence, or imply state validation authority.
- MVP boundary: no CRM expansion, no automatic appointment system, no live Supabase activation unless scoped and gated.
- Tool budget: one primary mode skill, one verifier skill, Browser only for UI/runtime proof.
- Stop rule: if auth, DB, schema, deploy, admin, live connectors, or global config appears outside scope, stop and ask.

Workflow:

```text
-next: inspect and propose 8-10 repo-backed tasks, no edits
-go: pick one bounded highest-impact task, execute, verify, review, stop
-pick N: execute only the chosen task
-ui-go: prototype first for major UI, then React, then screenshots
-check: verify current diff
-ship: final release-confidence gate
```

Review checklist:

- Goal and success criteria are explicit.
- Exact files were inspected before edits.
- Business logic stayed out of UI.
- Trust copy stays non-promissory.
- Local/mock vs Supabase-live boundary is clear.
- No unrelated dirty files were touched.
- No broad plugin stack was activated.
- Critical/Serious/Medium findings are zero before claiming readiness.

QA gate:

- Non-UI docs/code: targeted proof plus relevant npm script.
- Domain/application: `npm run typecheck`, targeted unit tests, then `npm run verify` when behavior changes.
- UI/runtime: Browser proof, desktop start/final, mobile final, screenshots under `docs/qa/`, `npm run test:e2e`.
- Release: `npm run format:check`, `npm run verify:full`, plus review.

Branch/worktree rule:

- Preserve dirty work.
- Do not use `git add .`.
- Use a dedicated branch/worktree for large or serious work.
- No push/deploy/PR unless requested.

Merge/no-merge rubric:

- Merge only if verification is fresh and no Critical/Serious/Medium finding remains.
- No merge with broken responsive layout, accessibility regression, failing tests, unsafe trust copy, unclear data boundary, or unexplained tradeoff.

Rollback rule:

- Tool/config changes need backup-first commands.
- Plugin promotion stays recommended-only until repeated wins on a named task class.
- Any new default-on helper must have a measured noise/benefit record.

## Daily Operating System

Default:

```text
-go
```

For planning:

```text
-next
-pick 2
```

For UI:

```text
-ui-go
```

For verification and release:

```text
-check
-ship
```

Daily model strategy:

- Medium reasoning for normal bounded work.
- High for architecture, non-trivial UI, hard bugs, and review.
- Xhigh only for audits, high-risk changes, large refactors, and release verdicts.

## Copy-Paste Commands

Inventory:

```bash
codex plugin marketplace list
codex plugin list --available --json
codex mcp list
find /Users/user/.codex/skills -maxdepth 4 -name SKILL.md -print
```

Repo proof:

```bash
npm run typecheck
npm run lint
npm run test
npm run verify:safety
npm run verify
npm run test:e2e
npm run verify:full
```

Workflow docs proof:

```bash
npm run verify:codex-hook
npm run format:check
```

Safe plugin management syntax:

```bash
codex plugin add <plugin>@<marketplace>
codex plugin remove <plugin>@<marketplace>
codex plugin marketplace list
codex plugin marketplace upgrade <marketplace>
```

Do not use `codex plugin install`; this local CLI uses `add`.

## Available Plugin Snapshot

These are visible in the local configured snapshots. Their live quality, ratings, and latest upstream activity are UNKNOWN without live research.

### `openai-primary-runtime` available, not installed

```text
documents@openai-primary-runtime, spreadsheets@openai-primary-runtime
```

### `openai-bundled` available, not installed

```text
latex@openai-bundled
```

### `awesome-codex-plugins` available, not installed

```text
a-team@awesome-codex-plugins, aegis@awesome-codex-plugins, agent-harness-skills@awesome-codex-plugins, agent-vision@awesome-codex-plugins, agentgram@awesome-codex-plugins, agiflow-ai-plugin@awesome-codex-plugins, aient@awesome-codex-plugins, alcove@awesome-codex-plugins
amq-cli@awesome-codex-plugins, anchor@awesome-codex-plugins, antigravity-2@awesome-codex-plugins, antigravity@awesome-codex-plugins, apple-calendar@awesome-codex-plugins, archcore@awesome-codex-plugins, ateam@awesome-codex-plugins, axonflow@awesome-codex-plugins
be-serious@awesome-codex-plugins, bkt@awesome-codex-plugins, bringyour-migration-auditor@awesome-codex-plugins, brooks-lint@awesome-codex-plugins, calle@awesome-codex-plugins, canvas-apps-plugin-codex@awesome-codex-plugins, cc@awesome-codex-plugins, claude-code-harness@awesome-codex-plugins
claude-code-skills@awesome-codex-plugins, claude-octopus@awesome-codex-plugins, codebase-recon@awesome-codex-plugins, codex-mem@awesome-codex-plugins, codex-multi-auth@awesome-codex-plugins, codex-obsidian@awesome-codex-plugins, codex-project-autopilot@awesome-codex-plugins, codex-rg-guard@awesome-codex-plugins
codex-seo@awesome-codex-plugins, codex-usage-tracker@awesome-codex-plugins, codiris-agentizer@awesome-codex-plugins, context-pack@awesome-codex-plugins, dataproduct-builder-dbt@awesome-codex-plugins, dev-skills@awesome-codex-plugins, dodopayments@awesome-codex-plugins, education-agent-skills@awesome-codex-plugins
ejentum@awesome-codex-plugins, epic@awesome-codex-plugins, espresso@awesome-codex-plugins, flowstudio-power-automate@awesome-codex-plugins, frappe-agent@awesome-codex-plugins, gh-project-plugin@awesome-codex-plugins, graymatter@awesome-codex-plugins, hol-guard-plugin@awesome-codex-plugins
hotl@awesome-codex-plugins, jk@awesome-codex-plugins, kachilu-browser@awesome-codex-plugins, kicad-happy@awesome-codex-plugins, langfuse@awesome-codex-plugins, launchfast@awesome-codex-plugins, llm-transpile@awesome-codex-plugins, mobazha@awesome-codex-plugins
morning-ai@awesome-codex-plugins, n8n-mcp-synta-codex@awesome-codex-plugins, nullcost-catalog@awesome-codex-plugins, oc-codex-multi-auth@awesome-codex-plugins, openproject@awesome-codex-plugins, orgx-codex-plugin@awesome-codex-plugins, panews@awesome-codex-plugins, papersflow-codex-plugin@awesome-codex-plugins
pdf-monster@awesome-codex-plugins, personal-data-protection@awesome-codex-plugins, prompt-to-asset@awesome-codex-plugins, registry-broker-codex-plugin@awesome-codex-plugins, remotion@awesome-codex-plugins, runtype-skills@awesome-codex-plugins, rust-reverse-engineering@awesome-codex-plugins, sealos@awesome-codex-plugins
session-orchestrator@awesome-codex-plugins, simple-man@awesome-codex-plugins, sitemd@awesome-codex-plugins, staff-engineer-mode@awesome-codex-plugins, tailtest@awesome-codex-plugins, tandem-codex-plugin@awesome-codex-plugins, tartinerlabs@awesome-codex-plugins, task-scheduler@awesome-codex-plugins
team-skills-platform@awesome-codex-plugins, thermal-fluid-research-workflow@awesome-codex-plugins, tokrepo-search@awesome-codex-plugins, unity-agent-workflows@awesome-codex-plugins, unslop@awesome-codex-plugins, upwork-autopilot@awesome-codex-plugins, velith@awesome-codex-plugins, vibe-portrait@awesome-codex-plugins
vidseeds@awesome-codex-plugins, villagesql@awesome-codex-plugins, workflow-kit@awesome-codex-plugins, writers-loop@awesome-codex-plugins, x-twitter-scraper@awesome-codex-plugins, yandex-direct-for-all@awesome-codex-plugins, zagrosi-forge@awesome-codex-plugins
```

### `openai-curated` available, not installed

```text
actively@openai-curated, aiera@openai-curated, airtable@openai-curated, alation@openai-curated, alpaca@openai-curated, amplitude@openai-curated, apollo@openai-curated, asana@openai-curated
atlassian-rovo@openai-curated, attio@openai-curated, base44@openai-curated, binance@openai-curated, biorender@openai-curated, box@openai-curated, brand24@openai-curated, brex@openai-curated
brighthire@openai-curated, build-ios-apps@openai-curated, build-macos-apps@openai-curated, build-web-data-visualization@openai-curated, calendly@openai-curated, canva@openai-curated, carta-crm@openai-curated, catalyst-by-zoho@openai-curated
cb-insights@openai-curated, channel99@openai-curated, chronograph@openai-curated, circleback@openai-curated, circleci@openai-curated, clay@openai-curated, clickup@openai-curated, close@openai-curated
cloudflare@openai-curated, cloudinary@openai-curated, coderabbit@openai-curated, codex-security@openai-curated, cogedim@openai-curated, common-room@openai-curated, conductor@openai-curated, convex@openai-curated
coupler-io@openai-curated, coveo@openai-curated, cube@openai-curated, daloopa@openai-curated, datadog@openai-curated, datasite@openai-curated, deepnote@openai-curated, demandbase@openai-curated
dnb-finance-analytics@openai-curated, docket@openai-curated, docusign@openai-curated, domotz-preview@openai-curated, dovetail@openai-curated, dow-jones-factiva@openai-curated, egnyte@openai-curated, expo@openai-curated
factset@openai-curated, fal@openai-curated, figma@openai-curated, finn@openai-curated, fireflies@openai-curated, fiscal-ai@openai-curated, fyxer@openai-curated, game-studio@openai-curated
gmail@openai-curated, google-calendar@openai-curated, google-drive@openai-curated, govtribe@openai-curated, granola@openai-curated, happenstance@openai-curated, hebbia@openai-curated, help-scout@openai-curated
heygen@openai-curated, hg-insights@openai-curated, highlevel@openai-curated, hostinger@openai-curated, hubspot@openai-curated, hugging-face@openai-curated, hyperframes@openai-curated, intercom@openai-curated
jam@openai-curated, keybid-puls@openai-curated, life-science-research@openai-curated, linear@openai-curated, lovable@openai-curated, lseg@openai-curated, magicpath@openai-curated, marcopolo@openai-curated
mem@openai-curated, meticulate@openai-curated, midpage@openai-curated, mixpanel-headless@openai-curated, mixpanel@openai-curated, monday-com@openai-curated, moody-s@openai-curated, morningstar@openai-curated
motherduck@openai-curated, mt-newswires@openai-curated, myregistry-com@openai-curated, neon-postgres@openai-curated, netlify@openai-curated, network-solutions@openai-curated, ngs-analysis@openai-curated, notion@openai-curated
nvidia@openai-curated, omni-analytics@openai-curated, otter-ai@openai-curated, outlook-calendar@openai-curated, outlook-email@openai-curated, outreach@openai-curated, particl-market-research@openai-curated, pipedrive@openai-curated
pitchbook@openai-curated, plugin-eval@openai-curated, policynote@openai-curated, posthog@openai-curated, pylon@openai-curated, quartr@openai-curated, quickbooks@openai-curated, quicknode@openai-curated
ranked-ai@openai-curated, razorpay@openai-curated, read-ai@openai-curated, readwise@openai-curated, render@openai-curated, replit@openai-curated, responsive@openai-curated, rox@openai-curated
s-p@openai-curated, scite@openai-curated, semrush@openai-curated, sendgrid@openai-curated, sentry@openai-curated, setu-bharat-connect-billpay@openai-curated, sharepoint@openai-curated, shopify@openai-curated
signnow@openai-curated, similarweb@openai-curated, skywatch@openai-curated, slack@openai-curated, statsig@openai-curated, streak@openai-curated, stripe@openai-curated, superhuman@openai-curated
taxdown@openai-curated, teams@openai-curated, teamwork-com@openai-curated, temporal@openai-curated, test-android-apps@openai-curated, third-bridge@openai-curated, thoughtspot@openai-curated, tinman-ai@openai-curated
twilio-developer-kit@openai-curated, united-rentals@openai-curated, vantage@openai-curated, waldo@openai-curated, weatherpromise@openai-curated, windsor-ai@openai-curated, wix@openai-curated, yepcode@openai-curated
zoho@openai-curated, zoom@openai-curated, zoominfo@openai-curated, zotero@openai-curated
```

## Final Self-Critique

- Noise reduced: yes, the recommended daily stack is files plus targeted proof, with Browser only for visible runtime work.
- Duplication removed: yes, review, QA, UI, Supabase, and automation clusters have one default route and default-off alternates.
- Context efficiency improved: yes, xhigh-by-default, AgentOps, broad design stacks, and creative tools are identified as context costs.
- MVP protected: yes, CRM, automatic appointment, broad connector, and live backend expansion are excluded by default.
- AI safety protected: yes, AI remains assistive and non-decisional.
- Trust protected: yes, the report avoids unsafe product claims and routes copy changes through safety proof.
- QA included: yes, each preset has acceptance proof and `-check` / `-ship` gates.
- Review gates included: yes, `codex-ux`, `bank-grade-review`, and release gates are scoped.
- No hallucinated tools: yes, all named plugin IDs came from local Codex inventory or current session capabilities.
- Immediately usable tomorrow: yes, the default commands and presets map to existing V-19 docs and package scripts.

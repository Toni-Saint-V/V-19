# Codex Accelerator Stacks

Date: 2026-06-12
Repo: `/Users/user/Documents/V-19`
Branch: `feat/domain-core`

## Purpose

This document answers the follow-up question the base audit did not push far
enough: which unavailable, not-installed, disabled, and installed Codex surfaces
could actually raise V-19 delivery throughput.

The answer is not "turn on more plugins." The useful multiplier comes from
small task-specific stacks:

- one clear primary mode
- one domain helper when the task has a real domain
- one verifier
- no duplicate reviewers
- no broad workflow packs in the default path

## Scope Inspected

Local Codex plugin catalog from `codex plugin list --available --json`:

| Marketplace              | Total | Installed | Enabled | Not installed |
| ------------------------ | ----: | --------: | ------: | ------------: |
| `openai-primary-runtime` |     3 |         1 |       0 |             2 |
| `openai-bundled`         |     2 |         1 |       1 |             1 |
| `awesome-codex-plugins`  |   105 |        10 |       0 |            95 |
| `openai-curated`         |   173 |         9 |       0 |           164 |
| Total                    |   283 |        23 |       1 |           260 |

Also inspected:

- local skills under `~/.codex/skills`
- installed plugin manifests under `~/.codex/.tmp/plugins/plugins`
- not-installed plugin manifests available in the local catalog snapshot
- enabled MCP servers from `codex mcp list`
- V-19 AGENTS/project rules and existing Codex stack audit

External live ratings, marketplace popularity, and update history remain
UNKNOWN because live network search was not requested or used. Recommendations
below are based on visible local manifests, skill names, fit to V-19, and context
cost.

## Executive Verdict

Current stack shape after Install+Eval:

- Enabled plugin: `browser@openai-bundled`
- Installed but disabled accelerator plugins: `codex-security@openai-curated`,
  `plugin-eval@openai-curated`
- Enabled MCPs: `memory`, `node_repl`
- High-signal local skills already exist for daily work: `codex-logic`,
  `codex-ui`, `codex-ux`, `codex-qa`, `codex-execution-gate`,
  `codex-verdict-gate`, `bank-grade-review`, `frontend-testing-debugging`,
  `react-best-practices`, `security-best-practices`, `playwright`

Best new acceleration came from installing only two candidates and keeping them
default-off:

1. `codex-security@openai-curated`
2. `plugin-eval@openai-curated`

Conditional later installs:

1. `coderabbit@openai-curated` if PR review becomes a standard workflow
2. `sentry@openai-curated` only after Sentry exists in the product workflow
3. `posthog@openai-curated` only after product analytics exists in the product
   workflow
4. `figma@openai-curated` only when a real Figma file is the source of truth

Do not make any of these default-on. They are accelerator presets, not startup
surface.

## Highest-ROI Accelerator Stacks

### 1. V-19 Fast Delivery Stack

Use for: default `-go`, small product bugs, copy/trust fixes, small typed
implementation tasks.

| Surface | Selection                                                                            |
| ------- | ------------------------------------------------------------------------------------ |
| Plugins | `browser@openai-bundled` only when UI/runtime proof is needed                        |
| Skills  | `codex-logic`, `codex-execution-gate`, `codex-verdict-gate`                          |
| MCPs    | `memory` only for historical context; `node_repl` only if JS runtime proof is useful |
| Checks  | targeted tests, `npm run typecheck`, relevant repo verifier                          |
| ROI     | Very high daily ROI                                                                  |
| Risk    | Low, because it avoids plugin sprawl                                                 |

Why it works:

- Most V-19 tasks are bounded product engineering tasks, not ecosystem tasks.
- The repo already has strong AGENTS rules and local skills.
- Extra plugins usually slow the route unless they map to the exact task.

When not to use:

- Deep RLS/security review
- PR/CI work
- production deploy/debug
- Figma-backed implementation

Sample command:

```bash
-go
```

### 2. Premium UI Runtime Stack

Use for: visible screen work, responsive issues, interaction bugs, layout
quality, visual QA.

| Surface | Selection                                                                                          |
| ------- | -------------------------------------------------------------------------------------------------- |
| Plugins | `browser@openai-bundled`; optional `build-web-apps@openai-curated` for major new frontend surfaces |
| Skills  | `codex-ui`, `frontend-testing-debugging`, `react-best-practices`, `codex-verdict-gate`             |
| MCPs    | `node_repl` only if Browser/plugin runtime automation needs it                                     |
| Checks  | Browser smoke, screenshots under `docs/qa/`, `npm run test:e2e` when flow risk exists              |
| ROI     | High for UI-visible tasks                                                                          |
| Risk    | Medium if `build-web-apps` is used for small fixes                                                 |

Installed status:

- `browser`: installed and enabled
- `build-web-apps`: installed, disabled, available as preset-only

Why it works:

- Browser gives direct evidence.
- Local UI rules are more specific to V-19 than generic design packs.
- `build-web-apps` is useful when building a new surface, not when patching a
  component.

When not to use:

- Source-only logic work
- Supabase/RLS work
- small copy fixes with no visual risk

Sample command:

```bash
-ui-go
```

### 3. Supabase and RLS Hardening Stack

Use for: migrations, RLS, private data, Supabase auth/session behavior, storage
access, repository/service boundaries.

| Surface | Selection                                                                                               |
| ------- | ------------------------------------------------------------------------------------------------------- |
| Plugins | `supabase@openai-curated`; preset-only `codex-security@openai-curated`                                  |
| Skills  | `codex-logic`, `security-best-practices`, `bank-grade-review`, `codex-verdict-gate`                     |
| MCPs    | Supabase MCP only with an explicit target project and read/write scope                                  |
| Checks  | targeted unit/integration tests, RLS review, `npm run verify:safety`, release security gate when needed |
| ROI     | Very high for the current V-19 risk profile                                                             |
| Risk    | Medium if live Supabase tools are activated without scope                                               |

Installed status:

- `supabase`: installed, disabled, preset-only
- `codex-security`: installed, disabled, preset-only

Why `codex-security` is the best new plugin:

- It has concrete skills for `security-scan`, `security-diff-scan`,
  `deep-security-scan`, `threat-model`, `finding-discovery`,
  `attack-path-analysis`, `fix-finding`, and `validation`.
- V-19 contains private applicant/case/export data paths, Supabase migrations,
  RLS policies, auth boundaries, and AI helper constraints.
- This is one of the few unavailable plugins that maps to a real recurring V-19
  risk rather than generic productivity.

When not to use:

- small UI polish
- markdown-only docs
- local mock-only flows without data boundary changes

Install command, only when user confirms:

```bash
codex plugin add codex-security@openai-curated
```

### 4. Plugin Evaluation Lab

Use for: measuring whether a plugin or skill should be promoted, rewritten,
disabled, or rejected.

| Surface | Selection                                                                                   |
| ------- | ------------------------------------------------------------------------------------------- |
| Plugins | preset-only `plugin-eval@openai-curated`                                                    |
| Skills  | `plugin-eval`, `evaluate-plugin`, `evaluate-skill`, `improve-skill`, `metric-pack-designer` |
| MCPs    | none by default                                                                             |
| Checks  | local evaluation reports, token budget analysis, benchmark scenarios                        |
| ROI     | Very high for stack design and future cleanup                                               |
| Risk    | Low if used as an evaluation tool, not a default route                                      |

Installed status:

- `plugin-eval`: installed, disabled, preset-only

Why this matters:

- It turns plugin selection into measured evidence instead of taste.
- It can benchmark whether a skill lowers token cost, improves success rate, or
  only adds noise.
- It directly answers the "find better stacks" problem without trusting plugin
  names.

When not to use:

- normal product implementation
- urgent bug fixes
- tasks with no plugin/skill decision

Install command, only when user confirms:

```bash
codex plugin add plugin-eval@openai-curated
```

### 5. PR and Review Stack

Use for: PR preparation, review comment handling, CI failures, merge readiness.

| Surface | Selection                                                                       |
| ------- | ------------------------------------------------------------------------------- |
| Plugins | `github@openai-curated`; optional install candidate `coderabbit@openai-curated` |
| Skills  | `codex-qa`, `codex-ux`, `bank-grade-review`, GitHub PR/CI skills                |
| MCPs    | GitHub connector only for PR/CI scope                                           |
| Checks  | PR checks, targeted failing logs, local reproduction, final review gate         |
| ROI     | Medium to high when PR workflow is active                                       |
| Risk    | Medium because duplicate reviewers can produce noise                            |

Installed status:

- `github`: installed, disabled, preset-only
- `coderabbit`: not installed, available in local catalog

Why `coderabbit` is conditional:

- It exposes a concrete `coderabbit-review` workflow for current changes.
- It can be useful as a second reviewer at PR boundaries.
- It duplicates `bank-grade-review` and local QA for everyday work, so it should
  not be default-on.

Install command, only if PR review becomes routine:

```bash
codex plugin add coderabbit@openai-curated
```

### 6. AI Helper Safety Stack

Use for: OpenAI API work, AI helper prompts, AI validators, rate limits, logging,
structured outputs, tool/action boundaries.

| Surface | Selection                                                                    |
| ------- | ---------------------------------------------------------------------------- |
| Plugins | `openai-developers@openai-curated` only for OpenAI API/agent implementation  |
| Skills  | `openai-docs`, `codex-logic`, `security-best-practices`, `bank-grade-review` |
| MCPs    | OpenAI docs MCP only when current API docs are required                      |
| Checks  | validators, safety grep, targeted tests, `npm run verify:safety`             |
| ROI     | High only for AI-helper work                                                 |
| Risk    | Medium if API/docs tools are loaded for deterministic domain work            |

Installed status:

- `openai-developers`: installed, disabled, preset-only
- `openai-docs`: system skill available

When not to use:

- readiness/status logic that has no AI provider dependency
- UI layout work
- export logic with deterministic rules

### 7. Observability Stack

Use for: production issue triage, product analytics, session/error analysis,
feature flags, experiment readouts.

| Surface | Selection                                                            |
| ------- | -------------------------------------------------------------------- |
| Plugins | install candidates `sentry@openai-curated`, `posthog@openai-curated` |
| Skills  | Sentry or PostHog plugin skill, `codex-logic`, `codex-qa`            |
| MCPs    | connector/app only after account is linked and scope is explicit     |
| Checks  | issue/event evidence, analytics queries, local fix verification      |
| ROI     | Medium now; high after instrumentation exists                        |
| Risk    | High if connected before product data exists or scope is unclear     |

Installed status:

- `sentry`: not installed, available in local catalog
- `posthog`: not installed, available in local catalog

Why conditional:

- These are strong once V-19 has real production telemetry.
- Before that, they add setup cost without moving the MVP.

Install commands, only after instrumentation/account scope exists:

```bash
codex plugin add sentry@openai-curated
codex plugin add posthog@openai-curated
```

### 8. Figma Source-of-Truth Stack

Use for: implementing or reviewing a screen where Figma is the real source
artifact.

| Surface | Selection                                                                    |
| ------- | ---------------------------------------------------------------------------- |
| Plugins | install candidate `figma@openai-curated`                                     |
| Skills  | Figma implementation/parity skills, `codex-ui`, `frontend-testing-debugging` |
| MCPs    | Figma connector only for a named file/frame                                  |
| Checks  | design parity, Browser screenshots, responsive proof                         |
| ROI     | Medium only when Figma exists                                                |
| Risk    | Medium-high if it competes with repo UI rules or no Figma file is scoped     |

Installed status:

- `figma`: not installed in local plugin catalog snapshot
- Figma plugin is available in the current session as an app/plugin surface, but
  persistent CLI install is not present in `codex plugin list`

Install command, only when a Figma-backed task exists:

```bash
codex plugin add figma@openai-curated
```

## Best New Installs

| Priority | Plugin                                | Expected ROI                      | What it replaces or adds                                  | Main risk                              | Default-on? |
| -------- | ------------------------------------- | --------------------------------- | --------------------------------------------------------- | -------------------------------------- | ----------- |
| HIGH     | `codex-security@openai-curated`       | Very high                         | Adds structured security scan/diff/threat-model workflow  | can be overused for small tasks        | No          |
| HIGH     | `plugin-eval@openai-curated`          | Very high                         | Adds evidence-based skill/plugin scoring and benchmarking | can become meta-work if not bounded    | No          |
| MEDIUM   | `coderabbit@openai-curated`           | Medium-high                       | Adds external PR review workflow                          | duplicate reviewer noise               | No          |
| MEDIUM   | `sentry@openai-curated`               | High after production telemetry   | Adds production issue triage                              | useless before Sentry data exists      | No          |
| MEDIUM   | `posthog@openai-curated`              | High after analytics exists       | Adds product analytics/flags/experiments                  | premature analytics scope              | No          |
| LOW-MED  | `figma@openai-curated`                | High only with real design source | Adds design-to-code/parity flow                           | fights repo truth without Figma source | No          |
| LOW      | `documents@openai-primary-runtime`    | Low for product delivery          | Helps polished document deliverables                      | not core engineering                   | No          |
| LOW      | `spreadsheets@openai-primary-runtime` | Low now                           | Helps analysis deliverables                               | not core engineering                   | No          |

Recommended install batch for fresh machines:

```bash
codex plugin add codex-security@openai-curated
codex plugin add plugin-eval@openai-curated
```

Do not install the conditional batch until a real workflow needs it.

## Reviewed But Rejected For Default Use

| Plugin or family                                                    | Status              | Verdict                 | Reason                                                                 |
| ------------------------------------------------------------------- | ------------------- | ----------------------- | ---------------------------------------------------------------------- |
| `agentops@awesome-codex-plugins`                                    | installed, disabled | keep disabled           | massive skill surface; overlaps local modes and increases context cost |
| `development-skills@awesome-codex-plugins`                          | installed, disabled | preset only             | useful, but duplicates local V-19 modes for daily work                 |
| `superpowers@openai-curated`                                        | installed, disabled | keep disabled           | alternate workflow system; conflicts with V-19 AGENTS route            |
| `praxis@awesome-codex-plugins`                                      | installed, disabled | keep disabled           | coding discipline overlap without clear V-19 ROI                       |
| `spec-driven@awesome-codex-plugins`                                 | installed, disabled | keep disabled           | V-19 already has project brief, plans, test strategy, and AGENTS       |
| `tool-advisor@awesome-codex-plugins`                                | installed, disabled | keep disabled           | this repo now has a tailored audit and promotion rule                  |
| `stark@awesome-codex-plugins`                                       | installed, disabled | rare use                | useful only for dedicated design-token work                            |
| `universal-design-principles@awesome-codex-plugins`                 | installed, disabled | keep disabled           | generic UX guidance is weaker than V-19 premium UI rules               |
| `chrome-devtools@awesome-codex-plugins`                             | installed, disabled | rare use                | use Browser first; DevTools only for deep runtime/perf diagnosis       |
| `a-team@awesome-codex-plugins`                                      | not installed       | reject now              | multi-agent workflow is higher noise than current bounded route        |
| `aegis@awesome-codex-plugins`                                       | not installed       | reject now              | likely security/review overlap; `codex-security` is a clearer fit      |
| `claude-octopus@awesome-codex-plugins`                              | not installed       | reject now              | broad alternate agent workflow, high context risk                      |
| `hotl@awesome-codex-plugins`                                        | not installed       | reject now              | not tied to a recurring V-19 delivery bottleneck                       |
| `dev-skills@awesome-codex-plugins`                                  | not installed       | reject now              | duplicates `development-skills` and local skills                       |
| `airtable@openai-curated`                                           | not installed       | reject now              | V-19 is not using Airtable as source truth                             |
| `lovable@openai-curated`                                            | not installed       | reject now              | useful only for a Lovable workspace handoff, not daily V-19 delivery   |
| `notion@openai-curated`                                             | not installed       | reject now              | no Notion source-of-truth workflow for this repo                       |
| `linear@openai-curated`                                             | not installed       | reject now              | no Linear task workflow established                                    |
| `cloudinary@openai-curated`                                         | not installed       | reject now              | no media-library bottleneck in V-19 MVP                                |
| `remotion`, `picsart`, `shutterstock`, `presentations`              | mixed               | reject for V-19 default | creative/deck/media surfaces do not move the core product              |
| `calendly`, `docusign`, `shopify`, `quickbooks`, sales-data plugins | not installed       | reject now              | business connectors do not fit the current product architecture        |
| `temporal`, `convex`, `datadog`, `mixpanel`                         | not installed       | later only              | potentially useful after architecture/instrumentation choices are made |

## Practical 3x Candidates

No stack can honestly promise a universal 3x. The closest high-confidence
multipliers are task-specific:

| Bottleneck                                     | Stack                            | Expected improvement                                       |
| ---------------------------------------------- | -------------------------------- | ---------------------------------------------------------- |
| Security/RLS uncertainty slows merge decisions | Supabase and RLS Hardening Stack | faster finding validation and clearer fix/no-fix decisions |
| Plugin choice becomes subjective               | Plugin Evaluation Lab            | fewer bad installs and less prompt bloat                   |
| UI changes need repeated manual checking       | Premium UI Runtime Stack         | faster visual proof and fewer responsive regressions       |
| PR reviews create late surprises               | PR and Review Stack              | earlier diff feedback before merge                         |
| production bugs lack evidence                  | Observability Stack              | faster triage after telemetry exists                       |

## Default Operating System

Daily default:

```text
Files -> targeted proof -> Browser only if visible/runtime -> focused review -> final verdict
```

Preset activation rule:

```text
Use one accelerator stack only when the task names the matching risk.
Do not combine UI, security, PR, observability, and design stacks in one pass.
```

Promotion rule for any new plugin:

```text
install disabled -> run on one bounded task -> compare baseline route -> measure noise -> keep preset-only or remove
```

## Copy-Paste Commands

Inspect catalog:

```bash
codex plugin list --available --json
```

Install only the high-ROI evaluation/security pair on a machine where they are
not already installed:

```bash
codex plugin add codex-security@openai-curated
codex plugin add plugin-eval@openai-curated
```

Conditional later:

```bash
codex plugin add coderabbit@openai-curated
codex plugin add sentry@openai-curated
codex plugin add posthog@openai-curated
codex plugin add figma@openai-curated
```

Check MCP state:

```bash
codex mcp list
```

Verify V-19 after workflow/config docs change:

```bash
npm run typecheck
npm run verify:codex-hook
```

## Immediate Recommendation

Do today:

1. Keep the global default lean: Browser only, memory/node runtime available,
   no broad workflow packs default-on.
2. Keep `codex-security` and `plugin-eval` installed but disabled by default;
   use them only for benchmark/security presets.
3. Keep `build-web-apps`, `supabase`, `github`, `vercel`, and
   `openai-developers` installed but disabled until their exact task appears.
4. Do not install broad community agent packs until `plugin-eval` proves they
   beat the local V-19 route.

## Final Self-Critique

- Noise reduced: yes, because every candidate is preset-only.
- Duplication removed: yes, duplicate review/workflow/design packs are rejected
  for default use.
- Context efficiency improved: yes, high-ROI stacks activate one domain helper
  at a time.
- MVP protected: yes, no connector/deploy/media plugin is promoted without a
  real task.
- AI safety protected: yes, AI helper work stays behind `openai-docs`,
  validators, and safety gates.
- Trust protected: yes, recommendations do not add outcome-claiming workflows.
- QA included: yes, each stack names its verifier.
- Review gates included: yes, review is limited to task-risk gates.
- Unavailable tools considered: yes, the 262 not-installed local-catalog plugins
  from the original scan were included; after Install+Eval, 260 remain not
  installed.
- No hallucinated tools: yes, all named plugin IDs were visible in the local
  Codex catalog or current session surface.
- Immediately usable tomorrow: yes, commands and preset rules are copy-paste
  ready.

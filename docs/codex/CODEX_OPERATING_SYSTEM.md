# V-19 Codex Operating System

Date: 2026-06-13
Repo: `/Users/user/Documents/V-19`
Purpose: one operational source of truth for how Codex should move VisaFlow AI
forward without tool sprawl.

## 1. Operating Thesis

V-19 Codex is not a plugin collection. It is a delivery system.

Default rule:

```text
smallest valid stack -> bounded product task -> fresh evidence -> fix findings -> stop
```

The system optimizes for:

- product readiness
- trust boundaries
- clean architecture
- UI/runtime proof when UI changes
- security/RLS proof when private data changes
- low context cost
- reversible tool changes

The system rejects:

- default-on plugin sprawl
- broad community workflow packs without evidence
- multiple reviewers for ordinary tasks
- connector/live-data access without explicit scope
- completion claims without fresh verification

## 2. Current Codex Surface

Current plugin inventory:

| State                  | Count |
| ---------------------- | ----: |
| Visible plugin records |   283 |
| Installed plugins      |    23 |
| Not installed          |   260 |
| Enabled plugins        |     1 |

Enabled by default:

| Surface                  | Status  | Purpose                            |
| ------------------------ | ------- | ---------------------------------- |
| `browser@openai-bundled` | enabled | local UI/runtime proof when needed |
| `memory` MCP             | enabled | historical context only            |
| `node_repl` MCP          | enabled | Browser/runtime support only       |

Installed but disabled:

| Surface                            | Use                                           |
| ---------------------------------- | --------------------------------------------- |
| `codex-security@openai-curated`    | rare security/RLS/auth/storage/AI-helper gate |
| `plugin-eval@openai-curated`       | plugin/skill measurement lab                  |
| `supabase@openai-curated`          | scoped Supabase schema/RLS work               |
| `build-web-apps@openai-curated`    | major frontend surface builds only            |
| `github@openai-curated`            | PR/CI/review workflow only                    |
| `vercel@openai-curated`            | deploy/runtime inspection only                |
| `openai-developers@openai-curated` | OpenAI API/agent work only                    |

Important session rule:

- Newly installed plugins/skills may require a new Codex session before their
  skills appear in the active skill list.
- Do not infer availability from `config.toml` alone. Verify with
  `codex plugin list --available --json`.

## 3. Product Truth

VisaFlow AI is:

```text
Agent Intake
-> Submission Creation
-> Review Queue
-> Correction Loop
-> Excel-compatible Export
-> Manual Appointment Handoff
```

AI may:

- explain
- organize
- simplify
- prepare
- summarize blockers
- draft review-safe helper text

AI may not:

- decide outcomes
- estimate outcome odds
- promise results
- imply external validation authority
- invent upload/OCR evidence
- bypass human review

Human review closes uncertainty.

## 4. Public Commands

Use these as the public command surface:

| Command   | Meaning                                        |        Edits? | Default stack       |
| --------- | ---------------------------------------------- | ------------: | ------------------- |
| `-next`   | propose next high-impact tasks only            |            no | files + repo docs   |
| `-go`     | choose one bounded task, execute, verify, stop |           yes | Fast Delivery Stack |
| `-pick N` | execute selected task from latest batch        |           yes | task-specific       |
| `-ui-go`  | premium UI workflow                            |           yes | UI Runtime Stack    |
| `-check`  | verify current diff                            | no by default | verification stack  |
| `-ship`   | release-confidence gate                        | no by default | release stack       |

Internal skills are implementation details, not public modes:

- `codex-logic`
- `codex-ui`
- `codex-ux`
- `codex-qa`
- `codex-execution-gate`
- `codex-verdict-gate`
- `bank-grade-review`
- `frontend-testing-debugging`
- `react-best-practices`
- `security-best-practices`

Do not expose old role names or broad mode lists as the main user interface.

## 5. Task Router

Route every task by risk and evidence need.

| Task type                 | Primary route                                     | Add only when needed                                      |
| ------------------------- | ------------------------------------------------- | --------------------------------------------------------- |
| Fast fix                  | `codex-logic`                                     | targeted test                                             |
| Standard feature          | `codex-logic` -> implementation -> targeted proof | `codex-verdict-gate`                                      |
| Premium UI                | `codex-ui` -> Browser proof -> screenshots        | `frontend-testing-debugging`                              |
| Supabase/RLS/auth/storage | `codex-logic` -> scoped security review -> tests  | `codex-security`, `security-best-practices`               |
| AI helper                 | `codex-logic` -> safety validators -> tests       | `openai-docs`, `openai-developers`                        |
| Current diff check        | inspect diff -> smallest verifier                 | Browser/e2e/security only if touched                      |
| Release gate              | format -> full verifier -> review                 | `bank-grade-review`, `codex-security` when risk justifies |
| Plugin/skill decision     | baseline route -> `plugin-eval` -> decision       | no product code edits                                     |

Impact order:

1. Broken flow
2. Runtime issues
3. UX friction
4. Trust/copy issues
5. Accessibility
6. Visual hierarchy
7. Performance
8. Motion/polish

## 6. Presets

### Daily Core

Use for most work.

```text
repo files -> codex-logic -> targeted proof -> codex-verdict-gate
```

Enabled plugins:

- `browser` only if UI/runtime proof is needed

Forbidden:

- `codex-security`
- `plugin-eval`
- GitHub/Vercel/Supabase live tools
- broad workflow packs

### Premium UI Runtime

Use for visible UI changes.

```text
codex-ui -> Browser -> screenshots -> e2e when flow risk exists -> verdict
```

Required evidence:

- desktop final screenshot
- mobile final screenshot
- multi-step flows need start/middle/completion proof

Store screenshots in:

```text
docs/qa/
```

### Supabase/RLS Security

Use when touching:

- migrations
- RLS policies
- auth/session behavior
- private storage
- Supabase config/activation
- repository persistence boundaries

Route:

```text
codex-logic -> codex-security diff worklist -> manual review -> targeted tests -> verdict
```

Keep `codex-security` disabled by default because static evaluation showed high
context cost.

### Plugin Evaluation Lab

Use only for tool portfolio decisions.

Route:

```text
plugin-eval analyze -> compare baseline -> decide keep / preset-only / remove
```

Use it to answer:

- Does this helper reduce failures?
- Does it reduce retries?
- Does it justify context cost?
- Does it duplicate local skills?

### PR/CI/Release

Use only when PR/CI/release is actually in scope.

```text
codex-qa -> GitHub/Vercel only if scoped -> bank-grade-review -> ship verdict
```

Do not push, deploy, merge, or open PR unless explicitly requested.

## 7. Verification Ladder

Use the smallest proof that matches the risk.

| Risk                               | Proof                                                      |
| ---------------------------------- | ---------------------------------------------------------- |
| docs/workflow only                 | Prettier check + `npm run verify:codex-hook`               |
| TypeScript/source change           | `npm run typecheck` + targeted tests                       |
| business/domain logic              | targeted unit tests + `npm run test` if shared             |
| trust/copy/security-sensitive text | `npm run verify:safety`                                    |
| UI/runtime                         | Browser proof + screenshots + relevant e2e                 |
| Supabase/RLS/auth/storage          | targeted tests + security review + `npm run verify:safety` |
| release                            | `npm run verify:full`                                      |

Default commands:

```bash
npm run typecheck
npm run verify:codex-hook
```

Current-diff command:

```bash
npm run format:check
npm run verify
```

Release command:

```bash
npm run verify:full
```

## 8. Review Gate

Before final verdict, report:

```text
Goal:
Success criteria:
Completed:
Not completed:
Verification:
Screenshots:
Readiness delta:
Remaining risks:
Next highest-impact task:
Verdict:
```

Severity rules:

- Critical = must fix before completion
- Serious = must fix before completion
- Medium = must fix before completion
- Minor = may ship with explicit note

Do not write a final "complete" report while Critical, Serious, or Medium
findings remain.

## 9. Tool Promotion Rule

No helper becomes default-on because it sounds useful.

Promotion path:

```text
inventory -> route decision -> baseline run -> helper run -> noise/cost check -> rollback path -> repeat wins -> promote
```

Allowed outcomes:

- `KEEP DEFAULT`: rare; must be low-cost and useful almost every turn
- `PRESET ONLY`: useful for a named task class
- `RARE GATE`: powerful but expensive
- `DISABLE`: installed but not active
- `REMOVE`: no clear V-19 use case

Current outcomes:

| Surface                         | Outcome      |
| ------------------------------- | ------------ |
| `browser@openai-bundled`        | KEEP DEFAULT |
| `codex-logic`                   | KEEP CORE    |
| `plugin-eval@openai-curated`    | PRESET ONLY  |
| `codex-security@openai-curated` | RARE GATE    |
| `bank-grade-review`             | RARE GATE    |
| `frontend-testing-debugging`    | UI PRESET    |
| `supabase@openai-curated`       | PRESET ONLY  |
| `build-web-apps@openai-curated` | PRESET ONLY  |
| `github@openai-curated`         | RARE GATE    |
| `vercel@openai-curated`         | RARE GATE    |

## 10. Config And Rollback

Current backup for the latest install/eval run:

```bash
/Users/user/.codex/backups/install-eval-20260613-004030/config.toml
```

Rollback config:

```bash
cp /Users/user/.codex/backups/install-eval-20260613-004030/config.toml /Users/user/.codex/config.toml
```

Remove the two new plugins:

```bash
codex plugin remove codex-security@openai-curated
codex plugin remove plugin-eval@openai-curated
```

Inspect current plugin state:

```bash
codex plugin list --available --json
```

Inspect MCP state:

```bash
codex mcp list
```

Persistent plugin enable/disable lives in:

```text
~/.codex/config.toml
```

Use backup-first before editing that file.

## 11. Daily Operating Loop

Use this sequence for normal execution:

1. Inspect `git status --short --branch`.
2. Read the smallest source-truth files.
3. Pick the highest-impact bounded task.
4. Choose one preset.
5. Execute the smallest safe change.
6. Run targeted proof.
7. Run broader proof only when risk requires it.
8. Fix Critical/Serious/Medium findings.
9. Report readiness delta.
10. Stop and name the next highest-impact task.

Do not continue into the next unrelated task automatically.

## 12. Immediate Next Flow

The tool stack is now clean enough. The next product-moving flow should be:

```text
-check current dirty diff
-> security/RLS pass on current Supabase persistence diff
-> fix findings
-> UI/runtime QA with screenshots
-> ship gate when clean
```

Why:

- Current dirty diff touches Supabase config, activation, database types,
  persistence, migration SQL, UI shell, styles, and tests.
- This is higher ROI than another plugin catalog audit.
- The installed `codex-security` can now support the security/RLS pass, but it
  should stay disabled by default.

## 13. Source Documents

Use these as supporting detail, not as the daily entrypoint:

- `docs/codex/CODEX_INSTALL_EVAL_RESULTS.md`
- `docs/codex/CODEX_ACCELERATOR_STACKS.md`
- `docs/codex/CODEX_PLUGIN_CATALOG_SCREENING.md`
- `docs/codex/CODEX_CONFIG_CLEANUP_PLAN.md`
- `docs/codex/CODEX_STACK_AUDIT.md`
- `AGENTS.md`
- `.codex/prompts/go.md`
- `.codex/prompts/check.md`
- `.codex/prompts/ship.md`

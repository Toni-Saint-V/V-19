# V-19 Parallel E2E One-Command Launcher

Use this when the E2E closure needs all agent lanes opened at once in separate
branches and Terminal windows.

## Command

```bash
npm run v19:e2e:4
```

This is the one-command launcher for the current package state. It allows the
local launcher/prompt artifacts to be used before they are committed and creates
a unique timestamped run id by default, so reruns do not collide.

Strict clean-source launch after the package is committed:

```bash
npm run v19:e2e:lanes
```

Dry run without git/window mutation:

```bash
npm run v19:e2e:lanes -- --dry-run --print-commands --no-plugin-install
```

## Defaults

- Model: `gpt-5.5`
- Reasoning: `high`
- Plan reasoning: `xhigh`
- Sandbox: `danger-full-access`
- Approval policy: `never`
- Profile: `power`
- Worktrees: `~/.codex/worktrees/v19-e2e-closure/<run-id>/<lane>/V-19`

## Package Layout

- Launcher: `scripts/launch-v19-parallel-e2e.mjs`
- Lane config: `docs/prompts/v19-e2e-lanes/lanes.json`
- Shared prompt template: `docs/prompts/v19-e2e-lanes/shared.md`
- Shared state model: `docs/architecture/v19-flow-state-model.md`
- Root manifest: `docs/qa/generated-lane-prompts/<run-id>/launch-manifest.json`
- Lane prompt: `docs/qa/generated-lane-prompts/<run-id>/<lane>.md`
- Lane context bundle: `docs/qa/generated-lane-prompts/<run-id>/context/...`
- Lane visual/QA assets: `docs/qa/generated-lane-prompts/<run-id>/context/docs/qa/*.{png,jpg,jpeg,webp}`
- Lane skill bundle: `docs/qa/generated-lane-prompts/<run-id>/context/skills/*.md`

## Preflight

The launcher fails before opening windows when:

- Codex CLI is missing.
- Required context files are missing.
- A generated branch/worktree already exists.
- Tracked source/tooling files are dirty and `--allow-dirty-source` was not passed.
- More than four lanes are configured.
- Any required `SKILL.md` file is missing.

Dirty source files are blocked because new worktrees start from `HEAD`, not from
uncommitted local edits. Use `--allow-dirty-source` only when the stale-base
behavior is intentional.

## What It Opens

The launcher creates four lane branches and worktrees:

- `01-state-integration-captain`
- `02-agent-flow-state`
- `03-admin-review-pdf-state`
- `04-export-click-mobile-verifier`

All lanes are anchored to:

```text
docs/architecture/v19-flow-state-model.md
```

The launcher enforces a hard maximum of four configured lanes.

Each Terminal window starts Codex with:

```text
-m gpt-5.5
-p power
-s danger-full-access
-a never
-c model_reasoning_effort="high"
-c plan_mode_reasoning_effort="xhigh"
--search
```

## Plugin Preflight

Before opening windows, the launcher verifies the lean plugin stack from
`docs/prompts/v19-e2e-lanes/lanes.json`. It attempts `codex plugin add --json`
for missing/disabled plugins and then re-checks that every required plugin is
installed and enabled.

The launcher also verifies every required skill file from
`requiredSkillFiles`, then copies those `SKILL.md` files into each lane context
folder. Every lane prompt requires reading those copied skill files before work.

Skip plugin install/check:

```bash
npm run v19:e2e:lanes -- --no-plugin-install
```

## Model Caveat

The launcher records the requested model in the manifest. The installed Codex
CLI does not expose a local model-availability check, so model availability is
confirmed only when Codex sessions actually start.

## Safety

The launcher does not commit, push, merge, rebase, deploy, or delete worktrees.
It fails if a generated branch or worktree path already exists.

Use a stable run id when rerunning a known plan:

```bash
npm run v19:e2e:lanes -- --run-id 20260626-e2e-close
```

If the package is still uncommitted and a stable run id is required:

```bash
npm run v19:e2e:lanes -- --allow-dirty-source --run-id 20260626-e2e-close
```

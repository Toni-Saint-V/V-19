# Codex Config Cleanup Plan

Date: 2026-06-12
Repo: `/Users/user/Documents/V-19`

## Purpose

Reduce default Codex context noise without weakening the V-19 delivery loop.
This is a backup-first global config plan. It does not apply changes by itself.

Target outcome:

- Keep the daily route fast: files, exact inspections, targeted tests, Browser only when UI/runtime proof is needed.
- Move broad helper plugins to preset-only.
- Keep rollback simple and local.
- Avoid uninstalling disabled plugins until normal V-19 work proves they have no value.

## Current Baseline

Observed enabled plugin defaults:

```text
browser@openai-bundled
development-skills@awesome-codex-plugins
ru-text@awesome-codex-plugins
```

Observed enabled MCP servers:

```text
memory
node_repl
openaiDeveloperDocs
```

Observed high-noise default:

```text
model_reasoning_effort = "xhigh"
```

Observed already-disabled high-noise plugins:

```text
agentops@awesome-codex-plugins
praxis@awesome-codex-plugins
spec-driven@awesome-codex-plugins
tool-advisor@awesome-codex-plugins
universal-design-principles@awesome-codex-plugins
superpowers@openai-curated
remotion@openai-curated
shutterstock@openai-curated
picsart@openai-curated
presentations@openai-primary-runtime
```

## Recommended Target State

Keep enabled:

```text
browser@openai-bundled
memory
node_repl
```

Move to preset-only by disabling globally:

```text
development-skills@awesome-codex-plugins
ru-text@awesome-codex-plugins
openaiDeveloperDocs MCP
```

Change default reasoning:

```text
model_reasoning_effort = "medium"
plan_mode_reasoning_effort = "xhigh"
```

Do not uninstall today:

```text
agentops@awesome-codex-plugins
praxis@awesome-codex-plugins
spec-driven@awesome-codex-plugins
tool-advisor@awesome-codex-plugins
universal-design-principles@awesome-codex-plugins
superpowers@openai-curated
remotion@openai-curated
shutterstock@openai-curated
picsart@openai-curated
presentations@openai-primary-runtime
```

## Backup Commands

Run these before any global config edit:

```bash
backup_dir="/Users/user/.codex/backups/config-cleanup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$backup_dir"
cp /Users/user/.codex/config.toml "$backup_dir/config.toml"
codex plugin list --json > "$backup_dir/plugin-list.json"
codex plugin list --available --json > "$backup_dir/plugin-list-available.json"
codex plugin marketplace list > "$backup_dir/plugin-marketplaces.txt"
codex mcp list > "$backup_dir/mcp-list.txt"
shasum -a 256 /Users/user/.codex/config.toml > "$backup_dir/config.toml.sha256"
printf '%s\n' "$backup_dir"
```

Expected result:

- A printed backup directory path.
- A restorable `config.toml`.
- Pre-change plugin and MCP inventory.
- A checksum for the original config.

## Apply Checklist

Apply only after explicit approval to edit global Codex config.

Edit:

```text
/Users/user/.codex/config.toml
```

Make these exact changes:

```toml
model_reasoning_effort = "medium"
plan_mode_reasoning_effort = "xhigh"

[mcp_servers.openaiDeveloperDocs]
enabled = false

[mcp_servers.memory]
enabled = true

[plugins."development-skills@awesome-codex-plugins"]
enabled = false

[plugins."ru-text@awesome-codex-plugins"]
enabled = false

[plugins."browser@openai-bundled"]
enabled = true
```

Do not change:

```text
approval_policy
sandbox_mode
model
review_model
web_search
plugin marketplace sources
disabled high-noise plugins
connector settings
project trust settings
```

## Post-Change Verification

After editing config, restart Codex if plugin or skill availability does not update immediately.

Run:

```bash
codex plugin list --json
codex mcp list
```

Expected state:

- `browser@openai-bundled` remains enabled.
- `development-skills@awesome-codex-plugins` is disabled.
- `ru-text@awesome-codex-plugins` is disabled.
- `memory` and `node_repl` remain enabled.
- `openaiDeveloperDocs` is disabled.
- No new plugin is enabled.
- No disabled high-noise plugin becomes enabled.

Then run one low-risk V-19 check:

```bash
npm run typecheck
npm run verify:codex-hook
```

If the next real task needs `development-skills`, `ru-text`, or OpenAI docs, activate the relevant helper only for that task class instead of making it default-on again.

## Rollback

Rollback is a file restore from the printed backup directory.

```bash
backup_dir="/Users/user/.codex/backups/config-cleanup-YYYYMMDD-HHMMSS"
cp "$backup_dir/config.toml" /Users/user/.codex/config.toml
shasum -a 256 /Users/user/.codex/config.toml
cat "$backup_dir/config.toml.sha256"
```

After rollback:

```bash
codex plugin list --json
codex mcp list
```

Restart Codex if the UI/session still shows the previous plugin state.

## Promotion Rule

Do not make any helper default-on because it sounds useful.

A helper can move from disabled or preset-only to default-on only after:

```text
named task class
baseline route
helper route
fresh evidence
noise impact
fallback path
rollback path
```

Minimum evidence:

- Three successful uses on the same V-19 task class.
- No increase in wrong tool activation.
- No conflict with `AGENTS.md`.
- No hidden live-data or global-config side effects.

## Preset-Only Usage

Use `development-skills` only for:

- staff-level code review
- handoff
- language-specific debugging
- large implementation workflow triage

Use `ru-text` only for:

- Russian UX copy pass
- final Russian report polish
- trust-sensitive copy review

Use `openaiDeveloperDocs` only for:

- OpenAI API or model docs
- Agents SDK
- OpenAI platform troubleshooting

## Do Not Remove Today

Keep disabled installed plugins in place for now. Removal is lower priority than proving the lean default route.

Removal becomes reasonable only if:

- backup and inventory are current
- the plugin stayed unused across several V-19 delivery blocks
- the plugin is not referenced by any active skill, prompt, or MCP route
- uninstall commands are reviewed before execution

## Acceptance Criteria

This cleanup plan is acceptable when:

- Backup commands are explicit.
- Apply changes are exact and limited.
- Rollback is one restore operation.
- Default-on tools are fewer.
- Browser proof remains available for UI/runtime work.
- No plugin is installed or removed as part of this plan.
- No global config change happens without separate approval.

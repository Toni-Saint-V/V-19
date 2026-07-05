# V-19 Agent Workflows

Use workflows only when the task matches their trigger.

## Available Workflows

- `v19-ui-reference-transfer/`
  - For ZIP/HTML/`START_HERE.html` reference UI transfer into the target V-19 project.
  - Entry point: `.agents/workflows/v19-ui-reference-transfer/README.md`.
  - Copy-ready prompt: `.agents/prompts/v19-ui-reference-transfer.md`.

## Rule

If a task is not a workflow match, route to the smaller rule file under `.agents/rules/` instead of loading workflow instructions.

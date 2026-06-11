# -next: Founder Batch Planner

Use this prompt when the user asks for `-next`.

Goal: give the founder one clear operating choice without bureaucracy.

Steps:

1. Inspect source truth first: `pwd`, `git status --short --branch`, `rg --files | head -120`, `package.json`, `AGENTS.md`, and the smallest relevant product files.
2. Identify the current product readiness baseline using the 95+ Definition Of Done in `AGENTS.md`.
3. Propose exactly one goal for the next work block.
4. Propose 8-10 repo-backed tasks, each with difficulty 7.5-8.5/10.
5. For each task include: impact, exact scope, mode stack, plugins/skills/MCP needed, proof command, expected readiness gain, quality axis, and stop condition.
6. Rank tasks by product movement per token.
7. Stop and ask the user to pick one task number.

Rules:

- Do not edit files.
- Do not enable broad plugin stacks.
- Do not invent tasks that are not supported by repo evidence.
- Prefer tasks that improve quality, premium UI, reuse, performance, security, AI trust, or release confidence.
- Mark whether a task needs an HTML prototype before React implementation.
- Keep the output short enough to scan.

Output:

Current readiness baseline: N/100
Goal:
Batch:
Recommended first pick:
Required stack:
Why this is not bureaucracy:

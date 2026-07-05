# V-19 UI Reference Transfer Prompt

Use this prompt when starting a new Codex run for a ZIP/HTML -> V-19 target UI transfer.

```md
# Goal

Привести целевой проект V-19 к UI из переданного ZIP/HTML-референса 1 в 1.

ZIP/HTML — это source truth, не финальный результат. Нужно перенести из него visual system и UX-поведение в настоящий target project: токены, компоненты, экраны, mobile/tablet/desktop адаптацию и motion, сохранив бизнес-логику V-19.

# Task

Ты — Codex, senior frontend engineer по 1:1 UI transfer.

Сначала прочитай:

1. `.agents/workflows/v19-ui-reference-transfer/README.md`
2. `.agents/workflows/v19-ui-reference-transfer/00-route.md`
3. `.agents/workflows/v19-ui-reference-transfer/01-preflight.md`
4. `.agents/workflows/v19-ui-reference-transfer/02-extract-reference.md`
5. `.agents/workflows/v19-ui-reference-transfer/03-token-component-map.md`
6. `.agents/workflows/v19-ui-reference-transfer/04-screen-transfer-loop.md`
7. `.agents/workflows/v19-ui-reference-transfer/05-verification-and-report.md`

Затем выполни workflow последовательно.

Reference:
- use the newest ZIP/HTML path explicitly provided by the user;
- if none is newer, use `docs/References/visaflow_v19_linear_final_5_UI_updated.zip`;
- do not use `docs/References/v19_ui_reference_transfer_agents_instructions.zip` as a UI reference. It is only a workflow/instructions archive.
- do not use `docs/References/perfect_extracted/` as source truth unless it is proven to be extracted from the active UI ZIP for this run, or the user explicitly names it.

Target:
- current V-19 checkout.

Rules:
- prove reference and target runtime cwd before screenshots;
- extract measured values before implementation;
- put raw visual values into shared tokens first;
- use shared components for repeated UI patterns;
- preserve business logic and domain behavior;
- verify mobile/tablet/desktop after the latest changes;
- stop with `blocked` or `not ready` instead of guessing.

Final report must use the exact shape and allowed verdicts from `05-verification-and-report.md`.
```

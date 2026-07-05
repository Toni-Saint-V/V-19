# V-19 Agents Folder

This folder contains scoped instructions for Codex work in V-19.

Start from root `AGENTS.md`. Then use this folder only for the matching task type.

## Task Routing

- UI ZIP/HTML 1:1 reference transfer:
  - read `.agents/workflows/v19-ui-reference-transfer/README.md`;
  - then read its numbered workflow files in order.
- Normal UI polish without external reference:
  - read `.agents/rules/v19-design-system-components.md`;
  - read `.agents/rules/visual-lock-tokens.md`;
  - read `.agents/rules/verification-gates.md`.
- Domain/business logic:
  - read `.agents/rules/v19-domain.md`;
  - read `.agents/rules/verification-gates.md`;
  - do not load UI reference-transfer workflow unless UI runtime evidence is required.
- Git/release:
  - read `.agents/rules/git-release-safety.md`;
  - read `.agents/rules/verification-gates.md`.

## Non-UI Safety

Do not force UI/browser workflows onto backend, OCR, Supabase, export data, business logic, tests-only, docs-only, or release tasks.

The ZIP/HTML transfer workflow is intentionally opt-in and source-reference scoped.

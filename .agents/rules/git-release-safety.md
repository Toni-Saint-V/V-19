---
paths:
  - "**"
---

# Git And Release Safety

- Before commit, push, merge, rebase, deploy, or destructive git, inspect branch, status, worktree, and diff.
- Preserve unrelated dirty work.
- Commit, PR, push, merge, rebase, deploy, and destructive git require explicit user approval.
- Do not use `git reset --hard`, `git checkout --`, or equivalent destructive commands unless explicitly requested.
- For release claims, separate local verification, browser proof, and production readiness.
- If proof is incomplete, say: `Implementation complete, product-ready proof incomplete.`

# V-19 agent contract

Marker: `TONY_REPOSITORY_RULES_V1`

This file applies to the whole repository. The durable templates and operating
details live in [docs/agent-workflow/README.md](docs/agent-workflow/README.md).

## Source of truth

- Product and command entry points: `README.md`, `package.json`,
  `package-lock.json`, and `.nvmrc`.
- Canonical workflow rules: `docs/release/canonical-domain-contract.md` and the
  non-UI domain/application code under `src/modules/submissions`.
- Verification truth: npm scripts, Playwright configs, and executable tests.
- Existing behavior and fresh runtime evidence outrank stale screenshots,
  generated artifacts, old plans, and guessed contracts.

## Pre-work report

Before editing, publish a bounded `TASK CONTRACT` with the objective,
authoritative sources, exact base/worktree/branch, allowed and forbidden scope,
planned files, evidence directory, verification commands, reviewers, rollback,
and unresolved assumptions. Revise it before material scope expansion.

## Scope and no-go

Do not touch product UI, domain behavior, API, storage, auth/RLS, migrations,
Supabase, CI, production, dependencies, or lockfiles unless the task explicitly
assigns that area. Never inspect or modify secrets or credential stores.
Preserve unrelated dirty work and generated artifacts. Put screenshots, traces,
videos, reports, and ZIP files outside the repository.

## Runtime and package manager

Use npm only. Run repository npm commands with supported Node 22:

```sh
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run <script>
```

Do not add another package manager. A dependency or lockfile change requires an
explicit task contract and exact version.

## Ownership

One primary agent is the only writer. At most two additional agents may review
the stopped diff read-only. Reviewers do not edit, use MCP/network, inspect
credentials, or self-approve their own work. Never assign overlapping writes.

## Cross-repository lock

Before work spans another repository or worktree, lock and report its absolute
path, exact base, branch, owner, allowed files, forbidden files, and external
evidence directory. If any element is unknown or ownership conflicts, stop with
`BLOCKED`.

## Completion gate

Completion requires a final changed-file allowlist, `git diff --check`,
dependency/lockfile inspection when applicable, format/lint/typecheck, relevant
unit and integration tests, build, deterministic browser proof for UI behavior,
a verification ledger with exact exit codes, artifact scan, and independent
VERIFIER plus RED-TEAM review. Explain skips and residual risk.

Public verdicts are only:

- `PASS` — every mandatory gate passed with no material residual risk.
- `BLOCKED` — evidence, approval, manual control, or material risk remains.
- `FAIL` — the implementation is unsafe or contradicts the contract.

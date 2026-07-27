# Codex Workflow Hardening v1.0

Status: Implemented — BLOCKED
Date: 2026-07-27
Base: `af640895ea1bddfa463f22369573af666c430de8`

## Objective

Make agent work in V-19 bounded, reviewable, and reproducible without changing
product behavior. The repository SHALL expose durable task, browser, verification,
and review contracts plus a deterministic workflow verifier.

## Scope

### Included

- Root agent policy and detailed workflow documentation.
- `TASK CONTRACT`, `BROWSER RECEIPT`, `VERIFICATION LEDGER`, and
  `REVIEW FINDING` text contracts.
- Repository skills named `browser-runtime-proof` and
  `independent-diff-review`.
- A public `verify:agent-workflow` npm script included in `verify`.
- Root Playwright tooling upgraded exactly from `1.60.0` to `1.62.0`.
- Failure-only Playwright artifacts routed outside the repository.
- Redacted `APPLY_MANUALLY` guidance for user-level Codex and TonyOS controls.

### Excluded

- Product logic, UI, API, storage, authentication, authorization, RLS,
  migrations, Supabase, CI, production, and the domain model.
- Nested `AGENTS.md` files.
- New custom prompts, package managers, MCP servers, or dependencies other than
  exact `@playwright/test@1.62.0`.
- Automatic changes to user configuration, TonyOS, installed plugins, legacy
  prompts, remote branches, deployments, or production data.

## Requirements

### R1 — Task contract

WHEN an agent begins a repository change, THE SYSTEM SHALL require a `TASK
CONTRACT` containing objective, source truth, base and worktree, allowed and
forbidden scope, planned files, dependency policy, evidence directory,
verification commands, reviewer roles, rollback, and unresolved assumptions.

IF the planned file set or behavior expands materially, THE SYSTEM SHALL require
the contract to be revised before further edits.

### R2 — Ownership and cross-repository isolation

WHILE implementation is active, THE SYSTEM SHALL permit one writer and at most
two read-only reviewers.

WHEN another repository or worktree is involved, THE SYSTEM SHALL require an
explicit repository, base, worktree, branch, ownership, and evidence lock.

IF ownership or the exact base cannot be proven, THE SYSTEM SHALL report
`BLOCKED`.

### R3 — Browser proof

WHEN browser behavior is in scope, THE SYSTEM SHALL require localhost-only
execution and exact viewport coverage at `390x844`, `768x1024`, and `1440x900`.

THE SYSTEM SHALL record console errors, page errors, failed requests, relevant
responses, persistence readback after reload, horizontal overflow, user-visible
outcomes, artifact paths, and command exit codes in a `BROWSER RECEIPT`.

BEFORE a proof page is created, THE SYSTEM SHALL block service workers and
install HTTP(S) and WS(S) guards for the exact approved localhost origins,
including ports.

IF any other origin is attempted, THE SYSTEM SHALL abort it, record its
sanitized origin/path and resource metadata, and fail the proof even when the
request could otherwise succeed.

THE SYSTEM SHALL record sanitized origins for every HTTP(S) request/response
and every WS(S) connection rather than keeping only selected resource types or
paths.

THE SYSTEM SHALL treat Browser or MCP exploration as non-final evidence. Final
browser proof SHALL come from deterministic Playwright tests.

THE SYSTEM SHALL route browser binaries and artifacts to an explicit external
evidence directory.

### R4 — Verification ledger

WHEN a verification command runs, THE SYSTEM SHALL append a `VERIFICATION
LEDGER` row with phase, command, environment, expected proof, exit code, result,
artifact path, and notes.

IF a gate was skipped, inherited, or could not run, THE SYSTEM SHALL record that
fact explicitly; absence of a row SHALL NOT imply success.

### R5 — Independent review

WHEN implementation stops, THE SYSTEM SHALL request fresh read-only reviews from
VERIFIER and RED-TEAM roles.

THE VERIFIER SHALL compare requirements, exact commands and exit codes,
final-diff scope, and evidence parity.

THE RED-TEAM SHALL inspect permissions, tool governance, scope drift, hidden
skips, unsafe fallback, and rollback.

EVERY finding SHALL use the `REVIEW FINDING` contract and one of
`BLOCKER`, `HIGH`, `MEDIUM`, or `LOW`.

### R6 — Public verdicts

THE SYSTEM SHALL publish only `PASS`, `BLOCKED`, or `FAIL`.

IF material residual risk, unapplied mandatory manual controls, unexplained
files, a `BLOCKER`, an unaccepted `HIGH`, or a required red gate remains, THE
SYSTEM SHALL report `BLOCKED`.

IF implementation is unsafe or contradicts the contract, THE SYSTEM SHALL report
`FAIL`.

### R7 — Repository skills and duplicate resolution

THE SYSTEM SHALL provide only the missing repository skills
`browser-runtime-proof` and `independent-diff-review`.

THE SYSTEM SHALL NOT add repository skills named `scope-lock` or
`verification-before-completion`, because active Codex scope/verification/verdict
gates and the existing Superpowers verification skill already cover them.

Each repository skill SHALL have unique `name` and `description` frontmatter and
document `When to use`, `Do not use`, `Inputs`, and `Outputs`.

### R8 — Deterministic verifier

WHEN `npm run verify:agent-workflow` executes, THE SYSTEM SHALL deterministically
check:

- required AGENTS and workflow-document markers;
- required contract sections and duplicate resolution;
- unique repository-skill names and descriptions;
- required skill sections;
- absence of repository `scope-lock`,
  `verification-before-completion`, and new `.agents/prompts`;
- exact Playwright dependency and root artifact/retry policies;
- external artifact routing;
- specialized production/Supabase privacy policies;
- inclusion of `verify:agent-workflow` in `verify`.

THE SYSTEM SHALL require sensitive configs to call the unshadowed named
`defineConfig` import from `@playwright/test` directly and SHALL reject local
wrappers, aliases, computed keys, helper-generated policy containers,
non-literal artifact settings, and unsupported composition.

THE SYSTEM SHALL accept `defineConfig` and `devices` only as unaliased named
value imports and SHALL reject every imported config or device-policy reference
outside its sanctioned composition position, including mutation and dynamic
`eval`/`require`/`Function`/`import()` paths.

THE SYSTEM SHALL reject dynamic primitives by reference, including
parenthesized, aliased, computed-property, constructor, `createRequire`,
`getBuiltinModule`, and VM-equivalent loader paths, rather than inspecting only
a direct call target.

THE SYSTEM SHALL use a TypeScript type-aware callable surface so runtime-built
property names cannot select a callable/constructor, including `.join()` and
`String.fromCharCode()` constructions. Computed call/constructor targets and
tagged-template execution SHALL fail closed.

THE SYSTEM SHALL recursively analyze every relative value, type-only, and
side-effect import/export in the executable config graph. Each graph path SHALL
pass lexical, component `lstat`, symlink, regular-file, and canonical `realpath`
validation before read. `.env*` imports SHALL be rejected without being read.
The TypeScript program SHALL use a guarded CompilerHost that serves repository
modules from the prevalidated in-memory graph and delegates only exact
allowlisted TypeScript/library declarations and package metadata. Every other
project or environment-like path SHALL be refused before I/O, and a host-read
audit probe SHALL prove that denied paths never reach the underlying host.
Every I/O-capable CompilerHost method SHALL be explicitly overridden:
repository directory results SHALL be synthesized from the memory graph,
dependency directory metadata SHALL be delegated only within exact allowlisted
roots, environment lookup SHALL return no value, and emit/write/create methods
SHALL fail closed. The audit SHALL spy every underlying I/O method while it
drives an actual guarded TypeScript program. A closed method inventory SHALL
reject any future CompilerHost method that is neither explicitly guarded nor
classified as pure. Helper modules MAY import Playwright types and unaliased
`expect`, but SHALL NOT import `devices`.

Executable non-relative imports SHALL be limited to the audited Node, Supabase,
and Playwright module allowlist so an untracked path alias cannot bypass graph
analysis.

Sensitive executable modules SHALL limit `process` references to `process.env`,
`process.cwd`, and `process.pid`.

WHEN a sensitive config inherits another config, THE SYSTEM SHALL reject
symlinked path components and SHALL verify that both lexical and canonical
targets remain regular files inside the locked repository.

THE SYSTEM SHALL execute adversarial probes for comments plus computed keys,
helper-generated policy, shadowed `defineConfig`, aliased Playwright imports,
imported-config mutation, device-policy mutation, direct and indirect `eval`,
computed `Function`, `createRequire` device mutation, computed process module
loaders, runtime `.join`/`String.fromCharCode` callable construction, named and
side-effect helper mutation, lexical module escape, and dynamic code.
THE probes SHALL also cover canonical path escape.

IF any check fails, THE SYSTEM SHALL print actionable failures and exit non-zero.

### R9 — Playwright tooling

THE root Playwright config SHALL set:

- `retries: process.env.CI ? 2 : 0`;
- `retryStrategy: "isolated"`;
- `preserveOutput: "failures-only"`;
- screenshot `"only-on-failure"`;
- trace and video `"retain-on-failure"`;
- list plus HTML reporters, with HTML output under `testArtifactPath`.

THE SYSTEM SHALL keep the existing targeted responsive test as the exact
three-viewport proof and SHALL NOT multiply every test across three projects.

THE SYSTEM SHALL leave production and Supabase Playwright configs with sensitive
artifacts disabled.

IF Playwright 1.62 introduces failures not present on 1.60, THE SYSTEM SHALL
rollback only the Playwright tooling slice and record incompatibility; it SHALL
NOT weaken assertions or retries.

### R10 — Manual configuration gates

THE SYSTEM SHALL generate, outside the repository, a redacted unified diff for
user Codex defaults with:

- approval policy `on-request`;
- sandbox mode `workspace-write`;
- network disabled;
- temporary roots excluded;
- maximum two agents;
- app writes requiring approval;
- destructive and open-world actions disabled;
- every MCP server default-off;
- plugin allowlist limited to `ru-text`, `codebase-recon`, `spec-driven`, and
  `tool-advisor`, with Browser enabled only per localhost task.

THE SYSTEM SHALL classify `development-skills` and Praxis as
`REQUIRES_MANUAL_REVIEW/default-off`, and six existing user prompts as legacy
without modifying or deleting them.

THE SYSTEM SHALL record TonyOS as a manual blocker while its unset resolver
chooses bundled alpha. Until separate TonyOS hardening, the documented safe
invocation SHALL be `TONY_CODEX_BIN=/opt/homebrew/bin/codex`.

THE SYSTEM SHALL keep the 2026-07-28 MCP change as a separate default-off canary
with old/new client/server combinations and SHALL NOT migrate production.

## Acceptance criteria

1. The tracked diff is limited to the approved workflow/tooling allowlist.
2. No repository-local browser artifacts or new prompts exist.
3. `@playwright/test` resolves exactly to `1.62.0`.
4. `verify:agent-workflow` and `verify:repo-hygiene` pass.
5. Changed files pass formatting, syntax, and deterministic targeted checks.
6. Browser proof records all three required viewports and a complete receipt.
7. VERIFIER and RED-TEAM return no unresolved `BLOCKER` or `HIGH`.
8. The final verdict remains `BLOCKED` until mandatory Codex config and TonyOS
   manual gates are applied and independently reverified.

## Rollback

- Remove the new workflow documents and repository skills.
- Remove `verify:agent-workflow` from `package.json` and delete its script.
- Restore `scripts/verify-repository-hygiene.mjs` and `playwright.config.ts`.
- Restore `package.json` and `package-lock.json` to Playwright `1.60.0`.
- Do not rollback or modify product files because this slice does not own them.

# V-19 agent workflow

This contract turns agent work into a bounded sequence with explicit ownership,
fresh evidence, and independent review. Root rules live in
[`AGENTS.md`](../../AGENTS.md); the implementation requirements live in
[`docs/staging/specs/2026-07-27-codex-workflow-hardening-v1.md`](../staging/specs/2026-07-27-codex-workflow-hardening-v1.md).

## Operating sequence

1. Lock exact repository, base, worktree, branch, writer, allowed files, and
   external evidence directory.
2. Publish the `TASK CONTRACT`.
3. Inspect source truth before editing.
4. Let one writer implement the bounded slice.
5. Run deterministic checks and append every result to the
   `VERIFICATION LEDGER`.
6. If browser behavior matters, produce a complete `BROWSER RECEIPT`.
7. Stop editing, then run independent VERIFIER and RED-TEAM reviews.
8. Fix only in-scope findings, rerun affected gates, and re-review the complete
   final diff.
9. Publish only `PASS`, `BLOCKED`, or `FAIL`.

## TASK CONTRACT

Copy this template before the first edit:

```text
TASK CONTRACT
Task ID:
Objective:
Definition of done:
Repository:
Exact base:
Worktree:
Branch:
Primary writer:
Read-only reviewers: VERIFIER, RED-TEAM
Authoritative sources:
Allowed behavior:
Forbidden behavior:
Allowed files:
Forbidden files:
Dependency policy:
Package manager and runtime:
External evidence directory:
Browser target and roles:
Verification commands:
Manual approvals:
Known baseline failures:
Rollback:
Unresolved assumptions:
Status: PASS | BLOCKED | FAIL
```

Rules:

- File and behavior lists are closed sets. Material expansion requires a revised
  contract before more edits.
- The worktree must resolve to the exact base. Dirty product work in another
  checkout is never inherited implicitly.
- One writer owns every mutation. Reviewers remain read-only.
- A second repository requires its own lock; authorization does not transfer
  across repositories.

## Cross-repository lock

```text
CROSS-REPOSITORY LOCK
Repository:
Absolute path:
Exact base:
Worktree:
Branch:
Owner:
Allowed files:
Forbidden files:
Evidence directory:
Reason this repository is required:
Rollback:
```

Unknown base, shared ownership, overlapping write sets, or a missing evidence
boundary means `BLOCKED`.

## BROWSER RECEIPT

Browser proof is localhost-only. The in-app Browser may be used for task-scoped
exploration, but only deterministic Playwright tests count as final proof.

```text
BROWSER RECEIPT
Task ID:
Repository/base/diff:
Timestamp and timezone:
Localhost URL:
Approved network origins:
Server command:
Playwright version:
Browser binary path:
Artifact root:
Role:
Official fixture:
Start state:
Action:
Expected backend/domain effect:
Canonical readback:
Reload readback:
Role-isolation check:

Viewport 390x844:
  Visible outcome:
  Console errors:
  Page errors:
  Failed requests:
  Network requests:
  Network responses:
  Blocked origin attempts:
  WebSocket requests:
  Relevant responses:
  Persistence:
  Horizontal overflow:
  Artifact paths:

Viewport 768x1024:
  Visible outcome:
  Console errors:
  Page errors:
  Failed requests:
  Network requests:
  Network responses:
  Blocked origin attempts:
  WebSocket requests:
  Relevant responses:
  Persistence:
  Horizontal overflow:
  Artifact paths:

Viewport 1440x900:
  Visible outcome:
  Console errors:
  Page errors:
  Failed requests:
  Network requests:
  Network responses:
  Blocked origin attempts:
  WebSocket requests:
  Relevant responses:
  Persistence:
  Horizontal overflow:
  Artifact paths:

Final Playwright command:
Exit code:
HTML report:
Trace/video/screenshot policy:
Evidence gaps:
Residual risk:
Verdict: PASS | BLOCKED | FAIL
```

Mandatory flow proof is:

```text
action -> backend/domain effect -> canonical readback -> reload -> role isolation
```

Set both `PLAYWRIGHT_BROWSERS_PATH` and `V19_TEST_ARTIFACTS_DIR` below the
approved external evidence directory. Never use repository-local report,
test-results, screenshot, trace, video, browser-cache, or ZIP paths. Retain
runner-managed screenshots, traces, and videos only when a test fails. A
targeted proof may deliberately capture explicit viewport evidence screenshots,
but only below the external evidence directory.

Before the first page is created, block service workers and install HTTP(S) and
WS(S) guards for the exact approved localhost origins, including ports. Abort
every other origin. Record sanitized origin/path data for every request,
response, failed request, and WebSocket; fail even when an external request
would have returned successfully. A deny-by-default loopback proxy provides a
second boundary but does not replace the route guards.

Required exact viewports are `390x844`, `768x1024`, and `1440x900`. The targeted
responsive proof owns this matrix; do not multiply every E2E test into three
projects.

## VERIFICATION LEDGER

Record attempts, not just successful reruns:

| Phase    | Command       | Environment        | Expected proof | Exit code | Result            | Artifact             | Notes                 |
| -------- | ------------- | ------------------ | -------------- | --------: | ----------------- | -------------------- | --------------------- |
| baseline | exact command | Node/browser paths | what it proves |   integer | PASS/BLOCKED/FAIL | external path or N/A | pre-existing failures |

Requirements:

- Include the exact command and exit code from a fresh run.
- Separate baseline failures from regressions introduced by the current diff.
- Record skipped, blocked, inherited, and not-applicable checks explicitly.
- Static/unit checks do not replace browser, persistence, permission, or
  production evidence.
- A cached pass, Browser/MCP session, localhost screenshot, or build alone is
  not a release claim.

Sensitive production/Supabase Playwright policy is parsed through the TypeScript
AST. Configs must call the unshadowed named `defineConfig` import from
`@playwright/test` directly. `defineConfig` and `devices` are accepted only as
unaliased named value imports, and imported config/device policy bindings may
appear only in their sanctioned composition positions. Local wrappers, aliases,
mutations, direct/indirect/computed `eval`/`require`/`Function`/`import()` code,
Node `createRequire`/`getBuiltinModule` and VM-equivalent loaders, computed
policy keys, helper-generated `use`/`projects`, non-literal artifact values,
unsupported composition, symlinked config paths or directories, and canonical
path escapes fail closed. Dynamic primitives are rejected by reference, not
only when they are a direct call target. A TypeScript type-aware callable check
rejects computed access on callable/unknown values, computed call/constructor
targets, and tagged-template execution; runtime-built property names therefore
do not bypass the gate. Sensitive executable modules may access `process` only
through `process.env`, `process.cwd`, and `process.pid`.

The gate recursively parses every relative value, type-only, or side-effect
import/export in the executable config graph. Every graph file receives
lexical, component `lstat`, symlink, regular-file, and canonical `realpath`
validation before it is read; `.env*` imports are rejected without reading
them. A guarded CompilerHost serves repository modules only from that
prevalidated in-memory graph. It may delegate reads only for declaration files
and package metadata beneath the exact TypeScript, Node type, Supabase, and
Playwright dependency allowlist; all other project or environment-like paths
are refused before I/O. Every I/O-capable CompilerHost surface is explicitly
overridden: project directory answers are synthesized from memory, dependency
directory metadata is delegated only inside exact allowlisted roots,
environment lookup returns no value, and emit/write/create operations fail
closed. A built-in host-read audit probe spies every underlying I/O method and
drives an actual guarded TypeScript program, proving denied paths never reach
the underlying host. A closed method inventory rejects any future CompilerHost
method that is neither explicitly guarded nor classified as pure. Outside
`config/playwright/*.config.ts`, Playwright imports are limited to types and the
unaliased `expect` value; helpers cannot import `devices`. Relative
default-config inheritance is allowed only once per target. Non-relative
imports are restricted to the audited Node, Supabase, and Playwright module
allowlist; an unknown package or path alias fails closed.

## REVIEW FINDING

```text
REVIEW FINDING
Severity: BLOCKER | HIGH | MEDIUM | LOW
Reviewer: VERIFIER | RED-TEAM
File and line:
Requirement:
Problem:
Impact:
Reproduction/evidence:
Minimal fix:
Disposition: OPEN | FIXED | ACCEPTED
```

VERIFIER checks spec match, exact command/exit-code parity, final-diff scope,
hidden skips, artifacts, and acceptance criteria.

RED-TEAM checks permissions, tool governance, unsafe fallbacks, scope drift,
credential exposure, generated files, rollback, and whether failure semantics
are honest.

There must be zero open `BLOCKER` or `HIGH` findings. Every `MEDIUM` is fixed or
accepted by the accountable human. Reviewers issue only `PASS`, `BLOCKED`, or
`FAIL`.

## Duplicate resolution

Do not create repository skills named `scope-lock` or
`verification-before-completion`.

- Scope is already covered by active `codex-scope-lock`.
- Execution evidence is already covered by `codex-verification-gate` and
  `codex-verdict-gate`.
- The existing Superpowers `verification-before-completion` skill provides the
  same completion discipline.

This repository adds only `browser-runtime-proof` and
`independent-diff-review`.

## Tool and MCP governance

Default posture:

- MCP servers are disabled.
- Filesystem, shell, database, secrets, and credential MCP servers are
  forbidden.
- Network access is disabled unless the task contract names a bounded read-only
  source or an approved dependency download.
- Browser is default-off and may be enabled only for a localhost exploration
  task; Playwright remains the final proof.
- Destructive actions, open-world actions, app writes, remote mutations,
  publishing, deployment, and production changes require exact human approval.
- Agents never inspect credentials, tokens, private keys, browser profiles,
  cookies, or secret stores.

Default plugin allowlist:

- `ru-text`
- `codebase-recon`
- `spec-driven`
- `tool-advisor`

All other plugins remain default-off until pinned, audited, needed by the task,
and explicitly enabled for that task.

`development-skills` and Praxis are
`REQUIRES_MANUAL_REVIEW/default-off`: the installed packages reference missing
shared instruction files and hook executables. Do not repair, reinstall, or
enable them as part of a V-19 product task.

## APPLY_MANUALLY — Codex user defaults

User-level Codex configuration is outside this repository. Apply the separately
generated redacted patch only after human review, then run a fresh doctor and
behavior probe.

The manual target state is:

- approval policy `on-request`;
- sandbox `workspace-write`;
- network disabled;
- slash temp and process temp excluded from workspace roots;
- maximum two agents;
- app writes require approval;
- destructive and open-world actions disabled;
- every MCP server disabled by default;
- only the default plugin allowlist enabled.

Do not copy credentials or machine-specific secret values into patches,
evidence, logs, or this repository.

## APPLY_MANUALLY — TonyOS stable binary

The current TonyOS resolver chooses a bundled alpha when `TONY_CODEX_BIN` is
unset. This remains a manual blocker outside V-19. Until a separately reviewed
TonyOS hardening task changes the resolver, use:

```sh
TONY_CODEX_BIN=/opt/homebrew/bin/codex <tony-command>
```

Do not replace the bundled application binary and do not claim `PASS` until the
stable-binary gate is applied and independently reverified.

## Legacy prompts

The following six user prompts are classified as legacy:

- `fix-exact.txt`
- `qa-fast.txt`
- `slash-speed.txt`
- `spec-execute-verify.md`
- `fast-auto.txt`
- `goal-eval-loop.txt`

Do not delete or modify them automatically. A future cleanup requires separate
ownership, content review, rollback, and approval.

## MCP 2026-07-28 default-off canary

This is a separate canary plan, not a production migration.

| Client | Server | Mode                                  | Required result                                            |
| ------ | ------ | ------------------------------------- | ---------------------------------------------------------- |
| old    | old    | isolated compatibility control        | Existing audited behavior remains unchanged                |
| old    | new    | isolated negative/compatibility probe | Failure is bounded and does not enable the server globally |
| new    | old    | isolated compatibility probe          | No permission or transport widening                        |
| new    | new    | isolated canary                       | Protocol, permission, timeout, and rollback checks pass    |

For each cell record exact versions, pin/source, permissions, network route,
startup result, tool inventory, one harmless read-only call, timeout behavior,
shutdown, artifacts, and rollback. Keep all MCP entries default-off after the
canary. Production migration requires a new task contract and approval.

## Final report

```text
VERDICT: PASS | BLOCKED | FAIL
Exact base and worktree:
Changed-file allowlist:
Behavior changed:
Behavior explicitly unchanged:
Verification ledger:
Browser receipt:
VERIFIER findings:
RED-TEAM findings:
Manual gates:
Residual risk:
Rollback:
Unverified items:
```

`PASS` requires every mandatory manual gate, green required verification, no
unexplained files, no open `BLOCKER`/`HIGH`, accepted `MEDIUM`, and no material
residual risk. Any material residual risk means `BLOCKED`. Unsafe or incorrect
implementation means `FAIL`.

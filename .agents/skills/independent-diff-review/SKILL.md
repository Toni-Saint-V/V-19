---
name: independent-diff-review
description: Performs a fresh read-only V-19 diff review against the task contract, evidence ledger, and repository boundaries.
---

# Independent diff review

## When to use

Use after implementation has stopped, after a significant corrective patch, and
before a completion or merge-readiness claim. Run separate VERIFIER and RED-TEAM
reviews against the same final diff.

## Do not use

- Do not review while the writer is still editing.
- Do not act as both writer and independent approver.
- Do not edit files, run mutating commands, use MCP/network, inspect credentials,
  or broaden the task.
- Do not infer a pass from prior commentary, cached output, or missing evidence.

## Inputs

- Exact base and current HEAD/worktree identity.
- Approved `TASK CONTRACT`, repository `AGENTS.md`, and specification.
- Complete final diff and changed-file allowlist.
- Verification ledger, browser receipt when applicable, and external artifact
  index.
- Known baseline failures, accepted risks, and rollback.

## Procedure

1. Read the final diff fresh from base and confirm scope ownership.
2. VERIFIER checks requirements, exact commands/exit codes, hidden skips,
   final-diff/evidence parity, and acceptance criteria.
3. RED-TEAM checks permissions, tool governance, scope drift, unsafe fallback,
   generated artifacts, rollback, and failure semantics.
4. Report findings first. Use only `BLOCKER`, `HIGH`, `MEDIUM`, or `LOW`.
5. After writer fixes, discard the old opinion and review the entire final diff
   again.

## Outputs

Each finding uses `REVIEW FINDING` fields:

- severity;
- reviewer role;
- file and line;
- requirement;
- problem;
- impact;
- reproduction/evidence;
- minimal fix;
- disposition.

The review ends with counts by severity, evidence gaps, and one verdict:
`PASS`, `BLOCKED`, or `FAIL`. `PASS` requires zero `BLOCKER`/`HIGH` findings and
every `MEDIUM` fixed or explicitly accepted by the accountable human.

---
name: browser-runtime-proof
description: Proves a bounded V-19 localhost browser flow with external artifacts and a complete deterministic receipt.
---

# Browser runtime proof

## When to use

Use after a UI, interaction, persistence, responsive, accessibility, or browser
runtime change has a stopped final diff. Use it for release claims that depend on
what a real user can click and read back.

## Do not use

- Do not use for pure backend, documentation, planning, or static-analysis work.
- Do not navigate to production or non-localhost targets.
- Do not inspect browser profiles, cookies, local storage, credentials, or
  private session stores.
- Do not invent fixtures, inject tokens, bypass role boundaries, or treat
  Browser/MCP exploration as final proof.
- Do not write screenshots, traces, videos, reports, or browser binaries inside
  the repository.

## Inputs

- Approved `TASK CONTRACT` and stopped final diff.
- Localhost URL and exact server command.
- User role, official fixture, start state, action, expected domain effect, and
  canonical readback.
- Explicit external evidence directory.
- Exact Playwright command and browser-binary directory.

## Procedure

1. Confirm the target resolves only to `127.0.0.1` or `localhost`. Define the
   exact approved HTTP(S) and WS(S) origin set, including ports.
2. Set `PLAYWRIGHT_BROWSERS_PATH` and `V19_TEST_ARTIFACTS_DIR` to directories
   below the approved external evidence root.
3. Before creating a page, block service workers, install HTTP(S) and WS(S)
   route guards, and abort every origin outside that exact set. Record sanitized
   origin, path, method, and resource type for every network request and
   response; never discard the origin. A closed loopback proxy is an additional
   defense, not a replacement for the route guard.
4. Exercise the user action at exact `390x844`, `768x1024`, and `1440x900`
   viewports.
5. Capture console errors, page errors, failed requests, all response status,
   visible outcome, persistence readback after reload, role isolation, and
   horizontal overflow. Fail if any non-approved origin was attempted, even
   when it returned successfully or the route guard aborted it.
6. Exploration through the in-app Browser is optional and task-scoped. Run the
   deterministic Playwright test as the final proof.
7. Record every command and exit code. Retain runner-managed screenshots,
   traces, and videos only for failures. An explicit viewport evidence
   screenshot is allowed only when the targeted proof deliberately writes it
   below the external evidence root.

## Outputs

A `BROWSER RECEIPT` containing:

- task/base/diff identity and localhost URL;
- role and fixture;
- viewport matrix;
- action, backend/domain effect, canonical readback, reload, and role isolation;
- console errors, page errors, failed requests, every sanitized request/response
  origin, blocked-origin attempts, WebSocket origins, and horizontal overflow;
- Playwright version, exact command, exit code, and artifact paths;
- gaps, residual risk, and one public verdict: `PASS`, `BLOCKED`, or `FAIL`.

No receipt is complete unless deterministic Playwright proof ran.

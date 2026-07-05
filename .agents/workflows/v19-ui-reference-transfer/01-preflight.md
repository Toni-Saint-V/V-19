# 01 Preflight

Do this before any edit.

## Confirm Target State

Run and report:

```bash
pwd
git branch --show-current
git status --short
```

Preserve unrelated dirty work. Do not stash, reset, clean, checkout, rebase, merge, commit, or push unless the user explicitly asks.

## Confirm Reference

Identify the newest explicit user-provided UI reference. If none is newer, use:

```text
docs/References/visaflow_v19_linear_final_5_UI_updated.zip
```

The reference may be a ZIP, extracted folder, local server, or `START_HERE.html`.

Do not use `docs/References/v19_ui_reference_transfer_agents_instructions.zip` as a UI reference. It contains only agent/workflow instructions. It is valid context only if the workflow files are missing from the target checkout.

Do not treat `docs/References/perfect_extracted/` as authoritative by default. It is a legacy/extracted reference tree and may differ from the active ZIP. Use it only when you prove it was extracted from the active reference ZIP during this run, or when the user explicitly names it.

If the active ZIP and any extracted folder disagree, the active ZIP wins.

## Prove Runtime Ownership

Before trusting screenshots, prove both runtimes:

```text
Reference path:
Reference runtime URL:
Reference serving cwd:
Target cwd:
Target runtime URL:
Target serving cwd:
Serving cwd verified: yes/no
```

If a port is stale or owned by another checkout, stop and fix the runtime before continuing.

## Baseline Screenshot Matrix

Capture reference and target before edits:

- `320x740`
- `390x844`
- `430x932`
- `768x1024`
- `1440x900`

Save screenshots under `docs/qa/` with names that identify:

- reference or target;
- screen;
- viewport;
- timestamp or pass name.

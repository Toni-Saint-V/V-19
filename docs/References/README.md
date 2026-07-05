# Reference Artifacts

This folder can contain UI references and helper archives. Do not treat every ZIP here as visual source truth.

## Authoritative UI Reference

Use this as the current UI source truth unless the user provides a newer explicit UI reference:

- `docs/References/visaflow_v19_linear_final_5_UI_updated.zip`

It contains the reference `START_HERE.html`, source components, built assets, design-system notes, and QA screenshots.

## Not A UI Reference

Do not use this file for visual extraction, screenshots, token values, component matching, or 1:1 comparison:

- `docs/References/v19_ui_reference_transfer_agents_instructions.zip`

It is only a portable copy of `AGENTS.md` and `.agents/...` workflow instructions.

## Extracted Reference Folders

The checked-in `docs/References/perfect_extracted/` tree is not automatically authoritative for the current transfer task. Use an extracted folder only when it is proven to come from the active UI reference ZIP for this run, or when the user explicitly names it as the source truth.

If an extracted folder and the active ZIP disagree, the active ZIP wins.

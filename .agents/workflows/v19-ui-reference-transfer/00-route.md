# 00 Route

Classify the request before doing any work.

## Use This Workflow When

The user asks for any of:

- ZIP/HTML reference transfer;
- `START_HERE.html` as source truth;
- `1:1`, visual parity, exact UI transfer;
- make V-19 match a provided UI;
- transfer colors, fonts, sizes, spacing, motion, cards, sheets, drawers, or components from a reference;
- make target project look like the reference.

## Route Out For Non-UI Tasks

If the task is primarily one of these, do not use this workflow:

- backend/service/domain logic;
- Supabase/database/storage/auth;
- OCR/MRZ/passport extraction;
- export row model/workbook correctness;
- release/security/readiness gates;
- unit/integration test repair;
- docs-only update;
- git/branch/PR/merge;
- performance not caused by UI layout.

Use the normal `AGENTS.md` route for those tasks and keep browser/UI tools out unless runtime UI evidence is actually required.

## Required Route Summary

For UI reference transfer tasks, begin with:

```text
Task type: strict ZIP/HTML 1:1 UI transfer
Reference:
Target:
Selected route: reference truth -> token extraction -> shared components -> screen loop -> browser proof
Stop gate: no 1:1 claim without latest reference-vs-target screenshots
```

If the request is ambiguous, inspect available files first. Ask only when the product target or reference artifact cannot be identified safely.

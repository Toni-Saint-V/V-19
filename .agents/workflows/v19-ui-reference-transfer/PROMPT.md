# Prompt: V-19 1:1 UI Transfer From ZIP/HTML Reference

## Goal

Make the target V-19 project visually and behaviorally match the provided ZIP/HTML reference.

The ZIP/HTML is source truth, not the output. The output is changed target project code: shared tokens, shared components, migrated screens, and browser proof.

## Task

Use the provided reference ZIP/HTML, usually `START_HERE.html`, to transfer the UI into the target project 1:1 for the declared scope.

Do not redesign, approximate, or premium-adjust. Extract measured reference values, place them into shared tokens/components, migrate screens, and verify in browser.

## Workflow

Read and execute this workflow in order:

1. `.agents/workflows/v19-ui-reference-transfer/00-route.md`
2. `.agents/workflows/v19-ui-reference-transfer/01-preflight.md`
3. `.agents/workflows/v19-ui-reference-transfer/02-extract-reference.md`
4. `.agents/workflows/v19-ui-reference-transfer/03-token-component-map.md`
5. `.agents/workflows/v19-ui-reference-transfer/04-screen-transfer-loop.md`
6. `.agents/workflows/v19-ui-reference-transfer/05-verification-and-report.md`

## Hard Rules

- Reference first, tokens second, components third, screens fourth, proof last.
- Do not implement from memory or taste.
- Do not copy reference mock logic into V-19.
- Preserve target business logic, statuses, permissions, routes, data, and domain behavior.
- Do not claim 1:1 without latest reference-vs-target screenshots.
- Keep non-UI tasks out of this workflow.

## Required Output

Return the report shape from `05-verification-and-report.md` and use only one of its allowed verdicts.

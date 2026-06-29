# Admin Drawer Only Matrix

Source commit: `23115370 feat(ui): polish V-19 agent and admin responsive surfaces`

Target branch: `codex/ui-admin-drawer-only-20260629-045831`

Scope: only admin review drawer port/adaptation.

## Ported

- `src/modules/submissions/components/AdminReviewDrawer.tsx`
- `src/modules/submissions/components/AdminReviewDrawer.css`
- Minimal `src/App.tsx` admin-review drawer wiring
- `tests/unit/adminReviewDrawer.spec.tsx`

## Intentionally Not Ported

- Source screenshots under `docs/qa/**`
- `src/modules/submissions/pages/FigmaVisualScreens.tsx`
- `src/modules/submissions/pages/OperationsScreens.tsx`
- `src/modules/submissions/components/CreateSubmissionDrawer.tsx`
- `src/modules/submissions/exportRules.ts`
- `src/modules/submissions/operationalWorkflow.ts`
- `src/modules/submissions/submissionActions.ts`
- `src/styles.css`
- `supabase/**`

## Matrix

| Requirement | Evidence path |
| --- | --- |
| Drawer opens from admin review queue/card | `tests/e2e/v19-pilot-admin-review-flow.spec.ts` |
| Real title/id/city/status shown | `tests/unit/adminReviewDrawer.spec.tsx` |
| Real local agent full name shown from submission owner | `tests/unit/adminReviewDrawer.spec.tsx` |
| Tabs: Обзор, Заявители, Анкета, Файлы, Замечания, История | `tests/unit/adminReviewDrawer.spec.tsx` |
| Issue targets limited to Анкета, Скан загранпаспорта, Селфи, Селфи N2 | `tests/unit/adminReviewDrawer.spec.tsx` |
| No generic `Документ` target | `tests/unit/adminReviewDrawer.spec.tsx` |
| Accept/return guards preserved | `src/App.tsx` routes actions through current `updateSubmission`; `AdminReviewDrawer.tsx` uses `getPrimaryAction` |
| Canonical active files only | `AdminReviewDrawer.tsx` filters by `activeMediaFileTypes` |

## Integration Dependencies

- P1: Source commit has per-file accept UI backed by `markSubmissionFileAccepted` in `submissionActions.ts`. That file is outside this task boundary, so the admin-only drawer preserves package-level acceptance through existing domain actions instead of adding file-level accept.
- P2: Browser screenshots are intentionally not generated in this branch because generated screenshots are forbidden by the task.

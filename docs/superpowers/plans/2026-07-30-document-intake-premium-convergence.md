# Document Intake Premium UI Convergence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Converge every active production surface in the document Intake app on the established «Мои подачи» product grammar without changing domain behavior, persistence, permissions, routes, or production infrastructure.

**Architecture:** Preserve the `CommandCenter` and `AdminWorkspace` render chains, make narrowly scoped presentation changes under stable surface roots, and reuse the current V-19 shell, collection, rail, drawer, and form primitives. Implement four dependency-ordered slices; each slice owns its components, focused tests, and external browser evidence, while shared rules live only in `operational-screen-convergence.css` or an already imported surface stylesheet.

**Tech Stack:** React 18, TypeScript, Vite, existing Tailwind utilities and CSS, Vitest/Testing Library, Playwright, npm with Node 22.

## Global Constraints

- Base: `c4b1a6b6cd5e717a553ae1815e99350c49f0a975`.
- Worktree: `/Users/user/Documents/V-19/.runtime/worktrees/document-intake-prod-premium-20260729`.
- Branch: `codex/document-intake-premium-convergence-20260730`.
- Writer: `/root` only; VERIFIER and RED-TEAM are read-only reviewers.
- External evidence: `/Users/user/.codex/visualizations/2026/07/29/019faf01-411f-7400-ac14-196b66991a9e/document-intake-premium`.
- Use npm only with `PATH=/opt/homebrew/opt/node@22/bin:$PATH`.
- Never inspect or modify `.env*`, credentials, tokens, private keys, or secret stores.
- Do not change domain state, APIs, payloads, persistence, auth/RLS, migrations, Supabase, routes, CI, dependencies, lockfiles, deployment, or production.
- Do not edit `src/shared/ui/system.css` or `src/shared/ui/visual-baseline.css`.
- Do not add global element selectors, global ARIA selectors, duplicate production components, or an unbounded final-override stylesheet.
- Preserve the authenticated lazy boundary in `src/components/WorkspaceSurface.tsx`.
- Screenshots, traces, reports, videos, and generated Playwright artifacts go only to the external evidence directory.
- Known baseline: repository-wide `npm run format:check` fails on 258 pre-existing files. It remains a ledger row; every changed file also receives a targeted Prettier check.
- Each slice is one logical commit. Slice 1 is a dependency of slices 2–4; rollback is reverse order.

---

## Task 1: Lock the «Мои подачи» Reference

**Files:**

- Verify only: `src/components/CommandCenter.tsx:170-1315`
- Verify only: `src/components/ApplicantsScreen.tsx:962-1420`
- Verify only: `src/shared/ui/operational-screen-convergence.css:1-620`
- Create outside repository: `document-intake-premium/reference/reference-matrix.md`
- Create outside repository: `document-intake-premium/reference/*.png`

- [ ] **Step 1: Confirm the active production render chain**

```bash
rg -n "ApplicantsScreen|surface-agent-submissions" \
  src/components/CommandCenter.tsx \
  src/components/ApplicantsScreen.tsx \
  src/shared/ui/operational-screen-convergence.css
rg -n "OperationsScreens|AgentSubmissionsScreen" src --glob '!**/*.spec.*'
```

Expected: `CommandCenter -> ApplicantsScreen` is active; no production import path mounts `AgentSubmissionsScreen`.

- [ ] **Step 2: Start the isolated local-demo runtime**

```bash
PATH=/opt/homebrew/opt/node@22/bin:$PATH \
  VITE_SUPABASE_BACKEND_TARGET=local-demo \
  VITE_SUPABASE_SANDBOX_PROBE_ENABLED=false \
  npm run dev -- --host 127.0.0.1 --port 4199
```

Expected: Vite serves this exact worktree at `http://127.0.0.1:4199`.

- [ ] **Step 3: Capture the baseline matrix**

Use the real navigation path to «Мои подачи». Capture populated family/single collections, loading, empty, filtered-empty plus reset, a progress item, a blocked item, contextual detail closed/open, keyboard focus, and reduced motion at `1440×900`, `768×1024`, and `390×844`, plus 320 px overflow smoke.

For every capture record SHA, role, viewport, setup, UI action, console errors, failed requests, and artifact path. Record computed shell/content width, header spacing, surface radii, borders, focus ring, control heights, row spacing, navigation breakpoint, sticky-action offset, and visible overflow. These facts are the measurable comparison baseline for every later slice.

---

## Task 2: Slice 1 — Shared Shell, Command Palette, Admin Review Queue

**Allowed product files:**

- `src/shared/ui/v19-design-system.tsx`
- `src/shared/ui/operational-screen-convergence.css`
- `src/components/CommandCenter.tsx` only for a missing stable root/modifier
- `src/components/AdminWorkspace.tsx` only for a missing stable root/modifier
- `src/modules/submissions/components/CommandPalette.tsx`
- `src/components/AdminScreens.tsx`

**Allowed tests:**

- `tests/unit/adminWorkspaceAccessibility.spec.tsx`
- `tests/unit/operationalSideMenu.spec.tsx`
- New: `tests/e2e/v19-premium-shared-admin.spec.ts`

**Forbidden:** every other product file; handler/data/navigation behavior; `system.css`; `visual-baseline.css`.

- [ ] **Step 1: Add a failing shared-shell and review-queue contract**

The new E2E test must:

```ts
await expect(page.locator(".ops-shell")).toHaveCount(1);
await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
await expect(page.getByRole("navigation")).toBeVisible();
expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
  viewportWidth,
);
```

It also opens/closes the palette through the real shortcut, returns focus to the invoker, opens admin review through real nav, produces and resets filtered-empty, verifies one dominant queue surface with secondary disclosed context, checks 44 px mobile targets and reduced motion, and fails on console errors or unexpected failed requests.

- [ ] **Step 2: Prove the contract fails**

```bash
PATH=/opt/homebrew/opt/node@22/bin:$PATH \
  npx playwright test tests/e2e/v19-premium-shared-admin.spec.ts --project=chromium
```

Expected: FAIL on hierarchy, overflow, target size, focus return, or responsive disclosure.

- [ ] **Step 3: Converge shell and palette**

In the allowed shell files:

- preserve nav IDs, callbacks, counts, routes, role labels, landmarks, headings, and focus ownership;
- expose a stable modifier only where CSS cannot identify the active surface;
- use the same page-header anatomy and identity placement for agent/admin;
- keep one primary page action and demote profile/secondary actions;
- retain reachable label-preserving mobile navigation.

In `CommandPalette.tsx`, preserve command sources and handlers while aligning dialog depth, search, selected/empty result, keyboard hint, close affordance, 44 px mobile targets, Escape, arrow-key navigation, accessible naming, and focus return.

- [ ] **Step 4: Recompose the admin review queue**

In `AdminScreens.tsx`, preserve queue derivation, filters, metrics, selection, drawer opening, AI/SLA data, and handlers. Present identity, priority/status, progress/blocker, metadata, then next action. Reduce equal-weight summary cards, move AI/SLA behind existing disclosure/secondary context, keep loading/empty/filtered-empty/retry explicit, and use the existing user-facing date formatter.

- [ ] **Step 5: Add scoped convergence CSS**

Reuse existing tokens and reference radii, borders, focus ring, control heights, and spacing under existing roots. Keep two visible nesting levels, `120–160ms` control feedback, `160–220ms` panel feedback, scoped reduced-motion overrides, deliberate tab wrapping/scrolling at locked widths, and reserved space for sticky actions.

- [ ] **Step 6: Extend unit coverage**

Assert one main landmark, valid page heading, named menu/palette controls, a visible active nav item, focus return, and unchanged handler counts.

- [ ] **Step 7: Verify, capture, review, commit**

Run targeted Prettier and ESLint over the allowlist, then:

```bash
PATH=/opt/homebrew/opt/node@22/bin:$PATH \
  npx vitest run tests/unit/adminWorkspaceAccessibility.spec.tsx \
  tests/unit/operationalSideMenu.spec.tsx
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run typecheck
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run build
PATH=/opt/homebrew/opt/node@22/bin:$PATH \
  npx playwright test tests/e2e/v19-premium-shared-admin.spec.ts --project=chromium
git diff --check
git diff -- package.json package-lock.json
```

Capture shell/palette/review states at all locked widths. VERIFIER checks behavior and coverage; RED-TEAM probes cascade spill, clipped controls, misleading states, and focus loss.

```bash
git add \
  src/shared/ui/v19-design-system.tsx \
  src/shared/ui/operational-screen-convergence.css \
  src/components/CommandCenter.tsx \
  src/components/AdminWorkspace.tsx \
  src/modules/submissions/components/CommandPalette.tsx \
  src/components/AdminScreens.tsx \
  tests/unit/adminWorkspaceAccessibility.spec.tsx \
  tests/unit/operationalSideMenu.spec.tsx \
  tests/e2e/v19-premium-shared-admin.spec.ts
git commit -m "feat(ui): unify shared shell and admin review grammar"
```

---

## Task 3: Slice 2 — Review Workspace, Remark Dialog, Export

**Allowed product files:**

- `src/components/ReviewWorkspace.tsx`
- `src/shared/ui/review-workspace.css`
- `src/components/RemarkForm.tsx`
- `src/components/AdminExportScreen.tsx`
- `src/shared/ui/operational-screen-convergence.css` only for shared Slice 1 primitives

**Allowed tests:**

- `tests/unit/reviewWorkspaceProgressiveMedia.spec.tsx`
- `tests/unit/reviewMediaPreview.spec.tsx`
- `tests/unit/adminExportScreen.spec.tsx`
- New: `tests/e2e/v19-premium-review-export.spec.ts`

**Forbidden:** transitions, remark payloads, export rules/generation, storage, media authorization, persistence, `AdminWorkspace` orchestration, and every file outside the allowlist.

- [ ] **Step 1: Add a failing review/export contract**

Through real UI, open a queue item, switch applicant/media/field regions, reproduce unavailable/rejected media, open the remark dialog, trigger an invalid submit, close with focus return, open export, select a row, inspect blockers/readiness, and reach the real action. Assert reading order, no sticky overlap, no raw ISO text, no overflow, no console errors, and no unexpected failed requests at all locked widths.

- [ ] **Step 2: Prove the contract fails**

```bash
PATH=/opt/homebrew/opt/node@22/bin:$PATH \
  npx playwright test tests/e2e/v19-premium-review-export.spec.ts --project=chromium
```

- [ ] **Step 3: Recompose review and remark**

Preserve every media authorization/retry/rejection, applicant switch, field correction, decision, conflict, validation, payload, and dirty/close handler. Order identity, original document, review state/blockers, fields/corrections, then decisions. Use a balanced desktop split and one active tablet/mobile region. Make every fail-closed media state complete, expose disabled reasons adjacent to actions, reserve sticky-footer space, preserve dialog focus semantics, and keep 44 px mobile targets.

- [ ] **Step 4: Recompose export**

Preserve selection, readiness, blockers, package identity, generation/download/commit, double-submit guard, and handlers. Present selection, readiness/blockers, package summary, then final action. Keep blockers before the action, convert context rail to Slice 1 responsive disclosure, and use existing date formatters.

- [ ] **Step 5: Extend fail-closed tests**

Prove unavailable/rejected media never yields a ready decision; switching applicants preserves fail-closed state; invalid remarks do not submit; export blockers and double-submit protection remain; wrapper changes do not alter accessible names or handler counts.

- [ ] **Step 6: Verify, capture, review, commit**

After targeted Prettier/ESLint:

```bash
PATH=/opt/homebrew/opt/node@22/bin:$PATH \
  npx vitest run tests/unit/reviewWorkspaceProgressiveMedia.spec.tsx \
  tests/unit/reviewMediaPreview.spec.tsx tests/unit/adminExportScreen.spec.tsx
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run typecheck
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run build
PATH=/opt/homebrew/opt/node@22/bin:$PATH \
  npx playwright test tests/e2e/v19-premium-review-export.spec.ts --project=chromium
git diff --check
git diff -- package.json package-lock.json
```

Capture media loading/unavailable/rejected/retry, disabled reason, invalid remark, export blocker/ready, and responsive disclosure. VERIFIER/RED-TEAM explicitly confirm fail-closed behavior and sticky-area safety.

```bash
git add \
  src/components/ReviewWorkspace.tsx \
  src/shared/ui/review-workspace.css \
  src/components/RemarkForm.tsx \
  src/components/AdminExportScreen.tsx \
  src/shared/ui/operational-screen-convergence.css \
  tests/unit/reviewWorkspaceProgressiveMedia.spec.tsx \
  tests/unit/reviewMediaPreview.spec.tsx \
  tests/unit/adminExportScreen.spec.tsx \
  tests/e2e/v19-premium-review-export.spec.ts
git commit -m "feat(ui): converge review and export decision surfaces"
```

---

## Task 4: Slice 3 — Agent Actions, Submissions, Drawer, Intake, Questionnaire

**Allowed product files:**

- `src/components/CommandCenter.tsx`
- `src/modules/submissions/components/AgentActionsCommandCockpit.tsx`
- `src/components/ApplicantsScreen.tsx`
- `src/components/AgentReturnPackagesPanel.tsx`
- `src/components/Drawer.tsx`
- `src/components/PreUploadScreen.tsx`
- `src/components/QuestionnaireScreen.tsx`
- `src/modules/submissions/components/FigmaQuestionnaireScreen.tsx`
- `src/shared/ui/operational-screen-convergence.css` only for shared scoped rules

**Allowed tests:**

- `tests/unit/applicantsScreenInteractions.spec.tsx`
- `tests/unit/applicantsScreenProductionEmptyState.spec.tsx`
- `tests/unit/drawerInteractions.spec.tsx`
- `tests/unit/preUploadScreen.spec.tsx`
- `tests/unit/questionnaireScreen.spec.tsx`
- `tests/unit/questionnaireReadOnlyStatus.spec.tsx`
- `tests/unit/questionnaireScreenOwnership.spec.tsx` verify only
- New: `tests/e2e/v19-premium-agent-flow.spec.ts`

**Forbidden:** lifecycle logic, family rules, assignment/OCR semantics, persistence, questionnaire payloads/validation, permissions, and every file outside the allowlist.

- [ ] **Step 1: Add a regression fence around «Мои подачи»**

Assert collection grouping/filters, identity-status-progress/blocker-action order, open/close detail, populated/empty/filtered-empty/blocked states, desktop/tablet/mobile/reduced-motion behavior, and 320 px overflow.

- [ ] **Step 2: Add a failing adjacent-flow contract**

Through real nav, assert «Мои действия» shares shell/control/work-item/disclosure grammar; return packages remain secondary; drawer becomes a full-screen mobile workspace and returns focus; «Новая подача» exposes progress/task/save/validation/retry/next action; questionnaire section/applicant navigation, dirty/saving/saved/error/read-only states, sticky clearance, and no raw ISO/overflow/runtime errors.

- [ ] **Step 3: Prove adjacent parity fails while the reference stays green**

```bash
PATH=/opt/homebrew/opt/node@22/bin:$PATH \
  npx playwright test tests/e2e/v19-premium-agent-flow.spec.ts --project=chromium
```

- [ ] **Step 4: Converge action, handoff, and reference surfaces**

Preserve actions filters/counts/selection/drawer handlers and present one primary next action plus one concise blocker, with AI/history/why behind existing disclosure. Preserve return-package download behavior. Do not redesign «Мои подачи»; fix only proven clipping, target-size, raw-date, focus, sticky-overlap, or state-completeness gaps.

- [ ] **Step 5: Converge drawer, intake, and questionnaire**

Preserve drawer issue focus, files/media/history, permissions, actions, focus trap, Escape, and return focus; use full-screen mobile and safe action spacing. Preserve intake single/family, assignment, OCR/manual fallback, validation, and saving while reducing nesting and exposing progress/current task/state/next action. Preserve questionnaire ownership, applicant switching, validation, save/save-exit/correction/read-only/persistence behavior while unifying section navigation, field grouping, progress, state feedback, and sticky actions.

- [ ] **Step 6: Run focused tests**

After targeted Prettier/ESLint:

```bash
PATH=/opt/homebrew/opt/node@22/bin:$PATH \
  npx vitest run tests/unit/applicantsScreenInteractions.spec.tsx \
  tests/unit/applicantsScreenProductionEmptyState.spec.tsx \
  tests/unit/drawerInteractions.spec.tsx tests/unit/preUploadScreen.spec.tsx \
  tests/unit/questionnaireScreen.spec.tsx \
  tests/unit/questionnaireReadOnlyStatus.spec.tsx \
  tests/unit/questionnaireScreenOwnership.spec.tsx
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run typecheck
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run build
PATH=/opt/homebrew/opt/node@22/bin:$PATH \
  npx playwright test tests/e2e/v19-premium-agent-flow.spec.ts --project=chromium
git diff --check
git diff -- package.json package-lock.json
```

- [ ] **Step 7: Capture, review, commit**

Capture actions filtered/error, reference states, return package, drawer tabs, intake single/family/OCR-manual, questionnaire dirty/saving/saved/error/read-only, focus, reduced motion, and all widths. VERIFIER protects the reference and behavior; RED-TEAM probes hidden validation, clipped controls, state loss, and handler drift.

```bash
git add \
  src/components/CommandCenter.tsx \
  src/modules/submissions/components/AgentActionsCommandCockpit.tsx \
  src/components/ApplicantsScreen.tsx \
  src/components/AgentReturnPackagesPanel.tsx \
  src/components/Drawer.tsx \
  src/components/PreUploadScreen.tsx \
  src/components/QuestionnaireScreen.tsx \
  src/modules/submissions/components/FigmaQuestionnaireScreen.tsx \
  src/shared/ui/operational-screen-convergence.css \
  tests/unit/applicantsScreenInteractions.spec.tsx \
  tests/unit/applicantsScreenProductionEmptyState.spec.tsx \
  tests/unit/drawerInteractions.spec.tsx \
  tests/unit/preUploadScreen.spec.tsx \
  tests/unit/questionnaireScreen.spec.tsx \
  tests/unit/questionnaireReadOnlyStatus.spec.tsx \
  tests/e2e/v19-premium-agent-flow.spec.ts
git commit -m "feat(ui): converge agent intake and submission workflows"
```

---

## Task 5: Slice 4 — Access, Runtime, Users, Settings, PWA, Cleanup

**Allowed product files:**

- `src/App.tsx` only for presentation wrappers/state roots
- `src/components/AppCrashBoundary.tsx`
- `src/components/WorkspaceSurface.tsx` without changing lazy loading
- `src/components/AccessGate.tsx`
- `src/components/AdminUsersAccessScreen.tsx`
- `src/components/AdminSystemSettingsScreen.tsx`
- `src/pwa/PwaInstallAssistant.tsx`
- `src/pwa/bootstrap.tsx`
- `src/shared/ui/operational-screen-convergence.css` only for shared scoped rules

**Allowed tests:**

- `tests/unit/accessGateInvite.spec.tsx`
- `tests/unit/premiumExperienceScreens.spec.tsx`
- New: `tests/e2e/v19-premium-access-settings-pwa.spec.ts`

**Forbidden:** auth semantics, invite/reset/recovery, access approvals, retry/sign-out logic, lazy imports, PWA install/service-worker logic, persistence, and every file outside the allowlist.

- [ ] **Step 1: Add failing mode/state coverage**

Deterministically cover login, register, pending, invite, reset, recovery; workspace loading/empty/blocked/reconnect/sign-out/fatal; user queue populated/empty/disabled/success/error; agent/admin settings changed/reset; and PWA supported/unsupported/installed/prompt/dismissed. Assert focus, 44 px targets, reduced motion, no overflow, safe error copy, and no raw diagnostics. Missing existing fixtures are recorded `BLOCKED`; production behavior is not changed to manufacture fixtures.

- [ ] **Step 2: Prove the contract fails**

```bash
PATH=/opt/homebrew/opt/node@22/bin:$PATH \
  npx playwright test tests/e2e/v19-premium-access-settings-pwa.spec.ts --project=chromium
```

- [ ] **Step 3: Converge access and runtime states**

Preserve all mode decisions, fields, validation, callbacks, native form behavior, live regions, retry, reconnect, and sign-out handlers. Use one access grammar and the shared runtime typography/depth/action/focus system. Keep fatal UI free of raw diagnostics, all modes mobile-safe, and the authenticated lazy import unchanged.

- [ ] **Step 4: Converge users, settings, and PWA**

Preserve request status and approve/reject behavior, preferences/resets, install detection/prompt/install/dismiss/service-worker behavior, and all handlers. Apply reference list/field/status/action hierarchy, expose disabled reasons/results, disclose secondary system context responsively, and prevent the PWA assistant from covering sticky actions.

- [ ] **Step 5: Perform bounded CSS cleanup**

Only consolidate selectors introduced or directly touched by the four slices. Remove computed-style-proven duplicates, retain surface-root scope/token values/cascade order, and do not format unrelated legacy sections.

- [ ] **Step 6: Verify, capture, review, commit**

After targeted Prettier/ESLint:

```bash
PATH=/opt/homebrew/opt/node@22/bin:$PATH \
  npx vitest run tests/unit/accessGateInvite.spec.tsx \
  tests/unit/premiumExperienceScreens.spec.tsx
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run typecheck
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run build
PATH=/opt/homebrew/opt/node@22/bin:$PATH \
  npx playwright test tests/e2e/v19-premium-access-settings-pwa.spec.ts --project=chromium
git diff --check
git diff -- package.json package-lock.json
```

Capture every available access/runtime/user/settings/PWA state at all widths. VERIFIER checks behavior/lazy-boundary preservation; RED-TEAM probes auth leakage, raw diagnostics, unreachable controls, overlap, and CSS spill.

```bash
git add \
  src/App.tsx \
  src/components/AppCrashBoundary.tsx \
  src/components/WorkspaceSurface.tsx \
  src/components/AccessGate.tsx \
  src/components/AdminUsersAccessScreen.tsx \
  src/components/AdminSystemSettingsScreen.tsx \
  src/pwa/PwaInstallAssistant.tsx \
  src/pwa/bootstrap.tsx \
  src/shared/ui/operational-screen-convergence.css \
  tests/unit/accessGateInvite.spec.tsx \
  tests/unit/premiumExperienceScreens.spec.tsx \
  tests/e2e/v19-premium-access-settings-pwa.spec.ts
git commit -m "feat(ui): unify access settings and runtime states"
```

---

## Task 6: Final Completion Matrix and Repository Gate

**Files:**

- Create outside repository: `document-intake-premium/final/completion-matrix.md`
- Create outside repository: `document-intake-premium/final/verification-ledger.md`
- Create outside repository: `document-intake-premium/final/screenshots/*.png`
- Create outside repository: `document-intake-premium/final/runtime/*.json`
- No product edits during the final stopped-diff review.

- [ ] **Step 1: Freeze scope**

```bash
git diff --name-status c4b1a6b6cd5e717a553ae1815e99350c49f0a975...HEAD
git diff --check c4b1a6b6cd5e717a553ae1815e99350c49f0a975...HEAD
git diff c4b1a6b6cd5e717a553ae1815e99350c49f0a975...HEAD -- package.json package-lock.json
```

Expected: only spec/plan and declared UI/test files; diff check passes; dependency diff is empty.

- [ ] **Step 2: Run the complete ledger**

Record the exact exit code for each:

```bash
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run format:check
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run typecheck
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run lint
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run test
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run build
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run verify:performance
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run verify:agent-screen-runtime
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run verify:v19-boundary
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run verify:v19-ui-proof
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run verify:repo-hygiene
git diff --check c4b1a6b6cd5e717a553ae1815e99350c49f0a975...HEAD
git diff c4b1a6b6cd5e717a553ae1815e99350c49f0a975...HEAD -- package.json package-lock.json
```

The existing repository-wide Prettier failure remains visible if it persists. It cannot be replaced by a narrower check; changed-file Prettier must also be green.

- [ ] **Step 3: Run the final browser matrix**

For every inventory row, use real clicks, reproduce every applicable deterministic state, capture `1440×900`, `768×1024`, `390×844`, run 320 px overflow smoke, verify focus/return/names/reduced-motion/target size/sticky clearance/no raw timestamp, and record console errors, failed requests, action result, exact SHA, and comparison to Task 1. Mutating local-demo flows additionally record action, canonical in-target readback, reload, and role isolation when supported. `N/A` needs a domain/platform reason; missing fixtures are `BLOCKED`.

- [ ] **Step 4: Check runtime and performance**

Record listener PID/CWD for port 4199, exact SHA, no interaction-attributable long task over 50 ms for a bounded filter/drawer/workspace-switch sample, no unexpected post-settle layout shift, motion-budget compliance, and preserved authenticated lazy loading.

- [ ] **Step 5: Independent final reviews**

VERIFIER checks spec coverage, behavior, evidence, and command results. RED-TEAM probes overflow, CSS spill, state gaps, accessibility, misleading status/actions, and false completion. A material finding reopens its slice.

- [ ] **Step 6: Publish only `PASS`, `BLOCKED`, or `FAIL`**

`PASS` requires every mandatory row green and no material residual risk. Do not push, merge, deploy, publish, or mutate production without a new explicit approval for that exact action.

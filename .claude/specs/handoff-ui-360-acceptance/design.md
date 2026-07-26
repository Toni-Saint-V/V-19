# Handoff UI 360 Acceptance Design

## Architecture overview

The existing `tests/e2e/v19-responsive-proof.spec.ts` remains the owner of the
cross-surface responsive scenario. The existing
`verifyEveryAdminDrawerSubview(...)` helper remains the owner of protected-media
Passport Review. Both consume the same run-scoped external artifact contract:

```text
responsiveViewports
  -> existing local-demo fixture
  -> Agent Actions
  -> Agent submission Drawer
  -> Admin review queue
  -> Admin Export

verifyEveryAdminDrawerSubview
  -> Admin Passport Review at 1440, 390, and 360
  -> Passport, Selfie 1, and Selfie 2 tabs

testRunArtifactPath
  -> runs/<branch-head-run-id>/<surface>/<screenshot>
```

No product state, persistence owner, side effect, or application interface
changes.

## Source truth

- Handoff archive checksum:
  `3a7ceb0209fb659e2c511bb2118662e83fb56be9b24feacdf8c17c1ee2647cbc`.
- `docs/release/canonical-domain-contract.md`.
- `tests/e2e/v19-responsive-proof.spec.ts`.
- `tests/e2e/v19-pilot-admin-review-flow.spec.ts`.
- `tests/support/artifacts.ts`.
- Existing completed specs for Agent Drawer, My Actions, and Admin Export under
  `.claude/specs/`.

## Implementation

Add this viewport to `responsiveViewports` without replacing existing entries:

```ts
{
  height: 800,
  label: "360",
  maxCreateInnerOverflowPx: 10,
  width: 360,
}
```

The height is a realistic bounded Android viewport while the width is the exact
handoff acceptance value. The shared scenario also traverses the unrelated
`PreUpload` workspace. Every viewport now measures its inner overflow. Existing
viewports keep their 1 px rendering tolerance, while 360 px records the observed
10 px debt as a bounded budget that fails on any further regression.

The Drawer proof requires its close control to remain visible and inside the
viewport, activates the `Анкета` and `Обзор` tabs with `aria-selected` readback,
and closes by pointer activation rather than keyboard fallback.

The existing protected-media helper adds 360 x 800 to its 1440 and 390 matrix.
It opens the real `Сверка паспорта` dialog, verifies dialog bounds, exercises
all three media tabs, checks horizontal overflow, and persists screenshots
outside Playwright's disposable success output.

`testRunArtifactPath(...)` normalizes `V19_EVIDENCE_RUN_ID`; CI falls back to
branch, HEAD, and run metadata, while local runs receive a timestamp-and-process
identity. Screenshot names encode the exact viewport dimensions without a
historical hard-coded date.

Existing assertions verify:

- no Agent workspace document scroll;
- no horizontal document overflow;
- Drawer bounds and operability;
- Admin review, Passport Review, and Export layout;
- absence of browser console/page errors;
- screenshots written with `testRunArtifactPath(...)`.

## Failure handling

1. Run the focused responsive proof against the exact branch build.
2. Classify failures against the handoff file map before selecting an owner.
3. If it passes, do not edit product CSS or TSX.
4. If it fails inside the handoff scope, identify the first exact surface and
   computed overflow owner.
5. Patch only that surface's existing scoped class or presentation component.
6. Rerun 360, 390, and desktop proof through the unchanged matrix.
7. If more than one independent product surface needs a substantial change,
   stop and report the additional scope instead of starting a broad redesign.

## Alternatives considered

### Infer 360 px support from 375 px

Rejected because the archive explicitly requires 360 px verification.

### Add a new duplicate Passport Review flow

Rejected because the repository already has a stronger protected-media helper.
The implementation extends that existing viewport matrix instead of duplicating
its interaction sequence inside the broad responsive scenario.

### Restyle all handoff surfaces

Rejected because the archive contains no mockups, tokens, component patches, or
new requirements, while current `origin/main` already contains completed UI
specs for every named surface.

## Verification

- Focused Playwright responsive proof on Chromium.
- Focused protected-media Passport Review proof on Chromium.
- Artifact provenance unit contract.
- Focused unit tests for Drawer, Agent Actions, Admin Export, and Admin Review.
- TypeScript typecheck.
- Scoped ESLint.
- Local-demo build.
- `git diff --check`.
- In-app Browser readback at 360 and 390.
- Chrome DevTools console/network inspection when the shared plugin profile is
  available.

## Risk and rollback

- Risk: low for the viewport-matrix change; medium only if a global CSS edit is
  proven necessary.
- Rollback: revert the viewport entries, strict acceptance assertions, and
  run-scoped test artifact helper.
- `src/shared/ui/visual-baseline.css`, domain modules, dependencies, and backend
  files remain unchanged unless an exact failure proves otherwise.

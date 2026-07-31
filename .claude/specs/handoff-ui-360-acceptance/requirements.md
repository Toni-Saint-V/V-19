# Handoff UI 360 Acceptance Requirements

## Scope

Close the only unverified requirement from the `V-19 UI Excellence Codex
Handoff`: prove the existing primary UI surfaces at exactly 360 px without
changing submission business logic, handlers, state, persistence, APIs,
validation, permissions, or workflows.

The target surfaces are the existing Agent Actions queue, Agent submission
Drawer, Admin passport-review presentation, and Admin Export workspace.

## US-1: Verify the exact handoff mobile width

**As a** VisaFlow operator using a 360 px mobile viewport
**I want** the primary operational surfaces to stay inside the viewport
**So that** the handoff's mobile acceptance claim is directly verifiable.

### Acceptance criteria (EARS)

1. WHEN the responsive proof runs at 360 x 800
   THE SYSTEM SHALL render Agent Actions without horizontal document overflow.
2. WHEN the Agent submission Drawer opens at 360 x 800
   THE SYSTEM SHALL keep the Drawer inside the viewport and keep its close
   control and content operable through pointer activation and state readback.
3. WHEN the Admin passport-review presentation renders at 360 x 800
   THE SYSTEM SHALL open the `Сверка паспорта` dialog, keep the dialog and media
   tabs inside the viewport, and avoid horizontal document overflow.
4. WHEN Admin Export renders a selected package at 360 x 800
   THE SYSTEM SHALL avoid horizontal document overflow and keep the existing
   package action enabled.
5. WHEN the 360 px proof runs
   THE SYSTEM SHALL emit its screenshots through the existing external test
   artifact helper under a filesystem-safe run identifier.

## US-2: Preserve the accepted UI and domain contracts

**As a** VisaFlow maintainer
**I want** the exact-width proof to reuse the current responsive scenario
**So that** a verification improvement cannot invent a second product flow.

### Acceptance criteria (EARS)

1. WHEN 360 px is added to the viewport matrix
   THE SYSTEM SHALL retain the existing 375, 390, 768, 1024, and 1440 proofs.
2. WHEN the scenario performs existing actions
   THE SYSTEM SHALL preserve all handlers, interaction destinations, disabled
   reasons, data contracts, and canonical lifecycle guards.
3. IF the 360 px proof passes without a presentation defect
   THEN THE SYSTEM SHALL require no product CSS or TSX change.
4. IF the 360 px proof exposes a presentation defect
   THEN THE SYSTEM SHALL change only the smallest existing presentation owner
   needed for that exact failure and rerun the same proof.

## Non-functional requirements

- Add no dependency and do not modify `package.json` or `package-lock.json`.
- Keep screenshots, traces, reports, and Playwright output outside the product
  repository.
- Preserve accessibility names, focus behavior, touch targets, and reduced
  motion behavior.
- Keep the known `PreUpload` 360 px inner-overflow debt measurable and fail if
  it exceeds 10 px.
- Include a configured branch/HEAD/run identity in durable evidence paths when
  available; otherwise generate a unique local run identity.
- Keep localhost evidence separate from production claims.

## Out of scope

- Submission statuses, transitions, readiness, issue lifecycle, export
  lifecycle, persistence, API, Supabase, RLS, Storage, or backend changes.
- New UI concepts, visual tokens, routes, tabs, filters, or product copy.
- Broad edits to `src/shared/ui/visual-baseline.css`.
- Commit, push, merge, deploy, or production mutation.

## Open questions

None. The handoff fixes the missing width at 360 px and the current responsive
proof already owns the required cross-surface fixture.

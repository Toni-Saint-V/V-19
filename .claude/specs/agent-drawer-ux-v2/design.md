# Agent Drawer UX v2 Design

## Decisions

- The four tabs remain `overview`, `questionnaire`, `issues`, and `history`.
- A Drawer-local read-only intent derives from `getPrimaryAction`,
  `buildSubmissionNextStepBrief`, open issues, and canonical required-media slots.
- The same intent owns the header action and footer action, preventing contradictory CTAs.
- `draft` starts work; editable statuses route to the exact blocker; ready states use
  the existing lifecycle command; read-only states route to History.
- Required-media targets reuse `onUploadApplicantFile`; questionnaire and issue targets
  reuse existing navigation callbacks.
- Opening the questionnaire from the Drawer records a local origin so Back can reopen
  the same Drawer and tab without changing routes or persisted data.
- Mobile preserves the existing sheet geometry below the 1024 px breakpoint while
  compacting task context and keeping the explicit close/action controls reachable.
- Drawer CSS remains tokenized and scoped; generic submission and fallback rules remain untouched.

## Presentation intent

The internal intent is one of:

- `submission`: existing canonical `SubmissionAction`;
- `navigate`: exact `WorkspaceTarget`;
- `upload`: canonical applicant and required media type;
- `history`: local History tab navigation;
- `wait`: no mutation, with a canonical reason.

Priority:

1. `draft` existing `save_progress`;
2. editable exact next-step target;
3. first missing canonical required-media slot;
4. enabled canonical lifecycle action;
5. read-only/terminal History;
6. canonical wait or recoverable fallback.

## Responsive contract

- Desktop: existing side-panel width and motion; compact lifecycle metadata, dominant
  action, two-column Overview where space permits, non-duplicated footer.
- Mobile/tablet: existing sheet silhouette and motion, safe-area-aware header, explicit
  close control, compact expandable metadata, four-tab row, one-row action bar.
- Existing colors, typography, cards, radii, and spacing remain the visual baseline;
  v2 introduces only task-clarity, touch-target, focus, and feedback deltas.
- The non-functional drag handle is removed.

## Tab behavior

- Overview document rows upload exact missing media in editable states.
- Overview applicant rows open the exact applicant questionnaire.
- Questionnaire cards are native buttons and report exact counts or honest states.
- Issues are grouped by lifecycle state with per-card pending/error/success feedback.
- History remains read-only and retains canonical event order.

## Failure and concurrency

- Existing request ids and pending refs remain authoritative for submission actions.
- Upload pending state is target-specific and prevents duplicate file selection.
- Late results for another submission cannot update visible feedback.
- Changing submission clears tab scroll and expanded-context state; reopening the same
  submission preserves its local tab context.

## Verification

- Unit tests cover intent priority, target routing, exact progress, issue groups,
  async feedback, focus, scroll reset, and seven lifecycle states.
- Localhost Playwright covers desktop, tablet, mobile, short-height, landscape,
  breakpoint, keyboard, touch size, Axe, 200% text, forced colors, and reduced motion.
- Independent desktop and mobile Before/After reviews use the existing seven-category rubric.

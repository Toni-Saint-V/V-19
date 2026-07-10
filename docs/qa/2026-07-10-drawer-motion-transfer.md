# Drawer UI and motion transfer — 10 July 2026

## Scope

The approved historical Drawer reference was applied as a UI-only slice while
keeping the current V-19 submission domain, permissions and file handlers.

- Agent drawer: `src/components/Drawer.tsx`
- Active canonical agent drawer: `src/modules/submissions/components/adminAiAssistance.tsx`
- Admin review drawer: `src/components/AdminReviewDrawer.tsx`
- Canonical admin review drawer: `src/modules/submissions/components/AdminReviewDrawer.tsx`
- Remark form: `src/components/RemarkForm.tsx`
- Passport/selfie review workspace: `src/components/ReviewWorkspace.tsx`

## Motion contract

- Agent drawer: spring slide from the right on desktop and from the bottom on
  mobile (`damping: 28`, `stiffness: 240`, `mass: 0.8`).
- Admin drawer: spring slide with the historical blur transition (`damping: 26`,
  `stiffness: 220`, `mass: 1`).
- Tab content: `AnimatePresence` transition of 0.2s.
- Remark form: spring modal transition (`damping: 24`, `stiffness: 260`).
- Document review: scale transition from `0.985` to `1`.

The questionnaire screen itself was not copied. Only the drawer tab transition
and the existing open-questionnaire handler are retained.

## Interaction boundary

All existing close, tab, primary-action, remark, document verification and file
upload handlers remain in the target. This transfer does not introduce mocked
domain actions or modify submission statuses.

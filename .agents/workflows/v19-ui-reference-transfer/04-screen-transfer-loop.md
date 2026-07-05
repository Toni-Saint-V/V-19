# 04 Screen Transfer Loop

Migrate one screen or one reusable slice at a time.

## Priority Order

1. Shell/topbar/sidebar.
2. Agent main workspace / `Мои действия`.
3. Questionnaire / анкета.
4. Applicants / заявители и семьи.
5. Admin review / очередь проверки.
6. Export / центр выгрузки.
7. Upload / pre-upload.
8. Drawers, sheets, and modals.

If the user names a specific screen, start there and stop after that verified screen unless they explicitly ask to continue.

## Per-Screen Loop

For each screen:

1. Capture current reference and target screenshots.
2. Identify top 3-7 visual deltas by severity.
3. Update tokens/primitives first.
4. Migrate screen markup/styles to the shared system.
5. Verify mobile, tablet, desktop.
6. Fix regressions immediately.
7. Record remaining deltas.

## Mobile Requirements

- Header/topbar `<= 15%` viewport height, normally about `56px`.
- Primary work content visible first.
- Secondary metrics, summaries, filters, rails, and intro copy go to sheet/dock/drawer/tabs/collapse if they consume primary space.
- Minimum mobile horizontal inset: `16px`.
- Tap targets: `40-44px`.
- No page-level horizontal overflow.
- Dock/footer does not cover final content.
- Text wraps or truncates intentionally.

## Desktop Requirements

- Preserve desktop density and hierarchy from reference.
- Stable sidebar/topbar.
- Page padding and grid match reference.
- Card/list rhythm, status treatment, and CTA hierarchy match reference.
- Any mobile fix must be regression-checked on desktop before continuing.

## Motion Requirements

- Transfer only reference-backed motion.
- Allowed: screen enter, workspace switch, overlay fade, bottom sheet slide/fade, side nav slide, modal scale/y.
- No random bounce, decorative animation, or slow theatrical transition.
- Reduced-motion safety required when motion is changed.

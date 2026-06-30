# Motion Values Report

Scope: My Actions list/columns switch, filter popover, Submission Drawer, Create Submission upload queue.

Source ZIP/code used:
- `/Users/user/Downloads/Premium Dark-First Мои действия.zip`
- `/Users/user/Downloads/111111111.zip`
- `/Users/user/Premium Dark-First UI Concept.zip`

Reference motion values found:
- `--ease: cubic-bezier(.22,.8,.24,1)` in the imported V-19 motion source HTML.
- Popover: `animation: pop-in .16s var(--ease)`, from `opacity:0; transform:translateY(-4px) scale(.99)` to `opacity:1; transform:none`.
- Drawer body/tab content: `animation: tab-in .17s var(--ease)`, from `opacity:.5; transform:translateY(3px)` to `opacity:1; transform:none`.
- Progress bar: `transition: width .35s var(--ease)`.
- Submission Drawer overlay: `transition={{ duration: 0.25 }}`.
- Submission Drawer panel: `transition={{ type: "spring", damping: 28, stiffness: 240, mass: 0.8 }}`.
- Drawer active tab indicator: `transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}`.
- Drawer tab content: `transition={{ duration: 0.2 }}`.
- Create Submission root: `transition={{ type: "spring", damping: 25, stiffness: 250 }}`.
- Create Submission upload card: `layout`, `initial={{ opacity: 0, y: 10 }}`, `animate={{ opacity: 1, y: 0 }}`, `exit={{ opacity: 0, scale: 0.95 }}`.
- Questionnaire root/dropdowns/progress retained from source: spring `damping:25, stiffness:250`, dropdown `duration:0.15`, progress `delay:0.1, duration:1.2, ease:"easeOut"`, shimmer `duration:2.5, ease:"linear", repeat:Infinity`.

Runtime proof after patch:
- Typecheck: `npm run typecheck` passed.
- Server: `http://127.0.0.1:5177/` returned HTTP 200.
- Desktop view-stage: `0.17s cubic-bezier(0.22, 0.8, 0.24, 1)`, no console errors, no body/doc horizontal overflow.
- Filter popover: `0.16s cubic-bezier(0.22, 0.8, 0.24, 1)`.
- Columns progress: `width 0.35s cubic-bezier(0.22, 0.8, 0.24, 1)`.
- Create upload card observed mid-animation: opacity `0.222858`, transform `matrix(1, 0, 0, 1, 0, 5.52106)`, then settles to opacity `0.999919`, transform `none`.
- Mobile 390x844: same stage timing, drawer opens, no body/doc horizontal overflow, no console errors.

Runtime screenshots:
- `runtime-13-motion-initial-retina-2732x1536.png`
- `runtime-13-motion-filter-popover-retina-2732x1536.png`
- `runtime-13-motion-columns-retina-2732x1536.png`
- `runtime-13-motion-card-click-drawer-retina-2732x1536.png`
- `runtime-13-motion-create-open-retina-2732x1536.png`
- `runtime-13-motion-create-upload-added-retina-2732x1536.png`
- `runtime-13-motion-mobile-my-actions-390x844.png`
- `runtime-13-motion-mobile-drawer-390x844.png`

Deviation log:
- Full reference runtime screenshots for these exact motion states were not regenerated in this pass. The values were transferred code-first from the ZIP source and verified live in V-19.

# 03 Token And Component Map

Implement shared system before screen-level styling.

## Token Destinations

Use existing shared surfaces first:

- `src/shared/ui/system.css`
- `src/shared/ui/visual-baseline.css`
- `src/shared/ui/primitives.tsx`
- `src/shared/ui/v19-design-system.tsx`
- `src/modules/submissions/components/CollectionPrimitives.tsx`
- `src/modules/submissions/components/RightRailPrimitives.tsx`

Do not create a parallel design system if existing shared layers can carry the work.

## Required Primitive Map

Map reference patterns to shared target components:

```text
Reference pattern | Target primitive | Action | Screens affected
```

Required categories:

- `AppShell` / workspace shell;
- `OperationalSideMenu` / navigation;
- `TopBar` / page header;
- `Button` / `IconButton`;
- `SegmentedTabs`;
- `SearchFilterRow`;
- `Panel` / `Section`;
- `MetricCard`;
- `StatusChip` / `StatusDot`;
- `ProgressMeter`;
- `ListCell` / `MobileCell`;
- `BottomDock`;
- `BottomSheet`;
- `DrawerShell`;
- `ModalShell`.

## Component Rules

- If a pattern appears on 2+ screens, make or update a shared primitive.
- Screens may map domain data to props, state, and handlers.
- Screens must not redefine visual shells, status treatment, spacing, typography, or motion locally.
- Keep one shared side menu through app shell/navigation. Do not duplicate sidebars per screen.
- Preserve V-19 business logic and domain contracts.

## Non-UI Safety

Do not move business rules into UI primitives. Status transitions, export eligibility, issue lifecycle, permissions, OCR, Supabase, and row models stay in domain/use-case/service code.

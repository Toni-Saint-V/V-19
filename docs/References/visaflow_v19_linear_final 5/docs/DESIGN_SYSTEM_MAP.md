# Design System Map — VisaFlow V-19

## Product tone

Dark, premium, enterprise, high-density, operational dashboard.

## Base surfaces

```txt
App background:        bg-[#101011]
Main background:       bg-[#141416]
Card background:       bg-[#161617]
Elevated surface:      bg-[#1a1a1d]
Control surface:       bg-[#1e1e21]
Active surface:        bg-[#27272b]
Deep drawer:           bg-[#111113]
```

## Borders

```txt
Main border:           border-[#202124]
Card border:           border-[#242529]
Active border:         border-[#2e2f34]
Subtle border:         border-white/5
Overlay border:        border-white/10
```

## Primary actions

```txt
Primary bg:            bg-[#3a45b4]
Primary hover:         hover:bg-[#4855d4]
Primary soft:          bg-[#3a45b4]/10 или bg-[#3a45b4]/20
Primary text:          text-[#8fa3ff]
Primary ring:          focus-visible:ring-[#3a45b4]
```

## Status colors

```txt
Success:               emerald-400 / emerald-500
Warning:               orange-400 / orange-500
Error:                 red-400 / red-500
Info/processing:       blue-400 / blue-500
Neutral:               white/40, white/50, white/70
```

## Typography

```txt
Micro labels:          text-[10px], text-[11px], uppercase, tracking-wide
Metadata:              text-[11.5px], text-[12px], text-white/40
Body compact:          text-[13px], text-[14px]
Card title:            text-[15px], font-semibold
Page title:            text-[19px] / text-[21px]
Hero title:            text-[28px] / text-[36px]
```

## Shape

```txt
Small controls:        rounded-lg, rounded-[10px]
Buttons/cards:         rounded-xl
Main cards:            rounded-2xl
Hero/upload panels:    rounded-3xl
Mobile drawer:         rounded-t-[28px]
```

## Motion

Recommended:

```tsx
initial={{ opacity: 0, y: 10 }}
animate={{ opacity: 1, y: 0 }}
transition={{ duration: 0.2 }}
```

Drawer:

```tsx
transition={{ type: 'spring', damping: 26, stiffness: 220 }}
```

## Reusable patterns to extract later

```txt
StatusBadge
MetricCard
SearchInput
SegmentedTabs
WorkspaceSidebar
ActionDrawer
ProgressBar
DocumentCard
FieldReviewRow
EmptyState
```

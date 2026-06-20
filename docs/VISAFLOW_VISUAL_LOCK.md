# VisaFlow Visual Lock

This file is the visual source of truth for VisaFlow UI work. Future UI changes must preserve the current VisaFlow UI soul and obey this lock before using visual references.

## Priority Order

1. V-19 product/domain scope
2. Current VisaFlow visual soul
3. Existing implementation
4. Visual references

## Locked Visual System

### Dark Surfaces

- app background: `#070809`
- shell/container background: `#0b0c0e`
- main panel background: `#0e1013`
- row background: `#15171b`
- row hover: `#191c21`
- control/search/icon background: `#1a1c21`
- subtle border: `rgba(255,255,255,0.08)`
- strong border: `rgba(255,255,255,0.13)`

### Text

- primary: `#f3f4f6`
- secondary: `#b2b6bf`
- muted: `#8f949e`

### Indigo Accent And Focus

- accent: `#6874e8`
- accent hover: `#7580ee`
- accent active: `#5964d6`
- focus: `#7c84ff`

### Neutral Selected State

- selected bg: `#25272d`
- selected hover bg: `#2a2d34`
- selected border: `rgba(255,255,255,0.11)`
- selected text: `#f3f4f6`
- nav selected bg: `#25272d`
- nav selected border: `rgba(255,255,255,0.12)`
- row selected bg: `#181b21`
- row selected border: `rgba(104,116,232,0.72)`

### Status Colors

Red:

- base: `#ff5c67`
- hover: `#ff6b75`
- active: `#e94d59`
- foreground: `#18080a`
- soft bg: `rgba(255,92,103,0.13)`
- soft border: `rgba(255,92,103,0.48)`
- soft text: `#ff8a92`

Yellow:

- base: `#f4b840`
- hover: `#ffc653`
- active: `#d99b25`
- foreground: `#171006`
- soft bg: `rgba(244,184,64,0.13)`
- soft border: `rgba(244,184,64,0.48)`
- soft text: `#f4b840`

Green:

- base: `#45d082`
- hover: `#58df93`
- active: `#30b86a`
- foreground: `#06150c`
- soft bg: `rgba(69,208,130,0.13)`
- soft border: `rgba(69,208,130,0.48)`
- soft text: `#59df94`

## Visual Rules

Preserve:

- current dark SaaS atmosphere
- current density
- current typography feel
- current radii
- current spacing
- current calm graphite containers
- current neutral gray selected states
- current red/yellow/green status feeling

Do not:

- make the background lighter
- make the background pure black
- replace selected gray with indigo
- replace selected gray with amber/yellow
- add glow
- add glassmorphism
- add gradients
- add heavy shadows
- use Tailwind red/yellow/green directly in components
- pick new colors manually
- change opacity of whole rows for draft/disabled states
- introduce a new visual language

Apply locked tokens to:

- app background
- main shell/container
- panels
- rows
- row hover
- controls
- search fields
- icon buttons
- sidebar selected state
- selected filters/views
- active row border
- status dots
- status chips
- blocker chips
- returned chips
- warning/video/files chips
- accepted/ready/success chips
- destructive button "Закрыть без сохранения"

## Semantic Mapping

- returned / blocker / destructive = red
- video / files / pending / warning = yellow
- accepted / ready / success / complete = green
- selected navigation/views = neutral gray
- focus outline = indigo
- active row border may use subtle indigo

## Implementation Rules

- Use the existing styling system.
- Centralize variables/tokens.
- Replace hardcoded colors with variables.
- Keep layout unchanged.
- Keep component structure unchanged unless required for token reuse.
- Keep this file as the visual source of truth for all UI changes.

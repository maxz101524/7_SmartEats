# Demo Day Visual Polish — Design Document

**Date:** 2026-04-15
**Scope:** Frontend-only visual enhancements to Menu + Home pages
**Goal:** Make the app look like a real consumer food app for live demo to judges

---

## Design Decisions

- **User wants information density** over bigger elements — compact rows, not larger cards
- **Landing page hero** gets an animated gradient aurora background; rest of pages stay on `--se-bg-base` cream
- **All changes are frontend-only** — no new API endpoints, no new dependencies
- **All colors use existing `--se-*` tokens** from `tokens.css`

---

## Menu Page Changes

### 1. Compact Horizontal Dish Rows
Replace the 2-column `CompactDishCard` grid with single-column horizontal rows.

**Row layout:**
```
[44px icon] [Name + serving subtitle]  [macro pills]  [dietary badge]  [Add btn]
```

- Icon: 44px (down from 64px), same rounded square
- Name: bold, single line with ellipsis overflow
- Serving info: muted subtext below name (e.g. `1.5 cups (~350g) · Kosher Lunch`)
- Macros: inline colored text, horizontal layout
- Dietary badge: first flag only, right-aligned
- Add button: compact, 32px height, "+" icon by default, "Add" text on hover
- Row hover: subtle background tint + 3px left border in `--se-primary`
- "In tray" state: faint orange-tinted background, quantity badge next to Add button
- Mobile: macros wrap to second line, Add button stays right-aligned

### 2. Macro Progress Bar
Thin 4px horizontal stacked bar under each dish name showing protein/carbs/fat calorie ratio.
- Uses `--se-macro-protein`, `--se-macro-carbs`, `--se-macro-fat`
- Width proportional to each macro's calorie contribution (protein×4, carbs×4, fat×9)
- Rounded ends, subtle opacity

### 3. Collapsible Filter Panel
Dietary + allergen chips collapse behind a toggle, collapsed by default.
- Search bar + Filter/AI toggle stay always visible
- Toggle line: `"Dietary & Allergens ▾"` — expands/collapses with smooth height animation
- When filters active, show count badge: `"Filters (2) ▾"`

### 4. Station Header Accent Bar
Replace plain `border-bottom` divider with:
- 4px left accent bar in `--se-primary`
- Station name + item count on same line
- Tighter vertical spacing

### 5. Add Button Micro-animation
On click:
- Brief scale bounce (100ms, scale 0.92 → 1)
- Button text flashes checkmark "✓" for 600ms, then reverts
- CSS transitions only

### 6. Staggered Fade-in
When dishes load or filters change:
- Rows fade + slide in with staggered 30ms delay per item
- CSS `@keyframes`, 150ms duration, 8px translateY
- Cap at ~15 items to avoid long delays

---

## Home Page Changes

### 7. Animated Gradient Aurora (Hero Only)
- Soft animated gradient behind the hero section
- Colors: blend of `--se-primary-dim` (peach), a subtle lavender (#e8e0f0), and cream
- Slow 15s loop, barely perceptible motion
- Below the hero: fades back to standard `--se-bg-base`
- Implementation: absolutely positioned div behind hero content with `@keyframes` background-position shift

### 8. "Serving Right Now" Scrolling Ticker
New section between stats and feature cards.
- Fetches ~12 dishes from `/api/dishes/` (public, no auth)
- Displays compact pill cards in a horizontal auto-scrolling row
- Each pill: `[icon] Dish Name · 130 kcal · Vegan · Hall Name`
- CSS `@keyframes` marquee animation, pauses on hover
- Section header: "Serving right now" with pulsing green dot
- Clicking a pill navigates to `/dishes/:id`

### 9. Animated Stat Counters
- Numbers count up from 0 to final value over 1.5s
- Triggered when stats section enters viewport (IntersectionObserver)
- `requestAnimationFrame` based easing

---

## Files to Modify

| File | Changes |
|------|---------|
| `frontend/src/pages/Menu.tsx` | Replace CompactDishCard with DishRow, add MacroBar, collapsible filters, station header, animations |
| `frontend/src/pages/Home.tsx` | Add aurora gradient, scrolling ticker section, animated counters |
| `frontend/src/styles/tokens.css` | No changes needed — all tokens exist |

---

## What's NOT Changing

- No backend/API changes
- No new npm dependencies
- No changes to routing, auth, or data flow
- No changes to other pages (Profile, Dashboard, AIMeals, DishDetail)
- No changes to `tokens.css` or `custom.css`

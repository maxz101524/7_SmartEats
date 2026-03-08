# SmartEats Visual Redesign — Design Doc

**Date:** 2026-03-07
**Aesthetic:** Clean & elevated (Linear/Notion/Stripe-inspired) with selective layout rethinks
**Scope:** All pages — Home, Menu, DishDetail, Profile, AIMeals, Navbar, Footer

---

## 1. Home Page

### Layout changes
- Hero section gets a **full-width soft gradient background band** (cream → warm peach, subtle) that extends edge-to-edge behind centered content
- Feature cards become taller with centered content, each with a **48px circular icon container** (colored bg + SVG icon) replacing emoji
- Stats section gets accent-colored left borders and trend indicators

### Detail polish
- Hero title: `--se-text-display` size, tighter letter-spacing
- Subtitle: lighter weight, increased line-height
- Primary CTA: subtle orange box-shadow glow
- Section spacing increased for more breathing room
- Replace emoji icons (🍽, ✦, ◎) with clean inline SVG icons (utensils, sparkle, chart-pie) in `--se-primary` on `--se-primary-dim` circular backgrounds

---

## 2. Menu Page

### Layout changes
- **Hall selector** (left rail): Each hall becomes a card-style button with location pin icon, hall name, dish count badge. Selected = `--se-primary-dim` fill + left accent border
- **Dish list items**: Upgrade to mini card rows — more vertical space, subtle bottom border, pill-shaped macro badges with tinted backgrounds (each macro in its color)
- **Station headers**: Thin tinted background bar (`--se-bg-subtle`) with small-caps name + count badge

### Detail polish
- **Filter chips**: Active chips get filled backgrounds with semantic colors — meal period in `--se-primary-dim`, dietary in `--se-success-dim`, allergen in `--se-error-dim`
- **Search input**: Search icon on left, larger, softer radius (`--se-radius-lg`)
- **Empty state**: Larger icon, better typography, more whitespace
- **Mobile chip bar**: Slightly taller with subtle bottom shadow

---

## 3. DishDetail Page

### Layout changes
- **Back button**: Pill-shaped (`--se-bg-subtle`, `--se-radius-full`, icon + "Back to Menu")
- **Macro cards**: Accent-bordered — 3px colored top border per macro color, larger value text (28px bold), unit label in muted text. 2x2 grid mobile, 4-column desktop
- **Dietary section**: Grouped in a styled panel with subtle background and "Dietary Info" label
- **Replace matplotlib PNG chart** with a **client-side Vega-Lite donut chart** — interactive hover, `--se-macro-*` colors, rendered in browser

### Detail polish
- Dish name: `--se-weight-extrabold`, more margin below
- Subtitle: dot separator, muted color
- Extended nutrition (fiber, sodium): 2-column mini grid with icon indicators
- Nutrition source badge: pill — "AI Estimated" in `--se-warning-dim` + sparkle icon, "Database" in `--se-info-dim` + database icon
- Add to Meal CTA: full width on mobile, + icon before text

---

## 4. Profile Page

### Layout changes
- **Avatar**: Gradient background (warm orange gradient) instead of flat tint
- **Stat tiles**: Icon indicators (SVG for sex, age, height, weight, goal) + subtle accent left border, responsive auto-fit grid
- **Section headings**: Styled h2 with thin `--se-primary` underline accent, more whitespace above
- **Chart cards**: Each Vega chart wrapped in a card with a title label above

### Detail polish
- Summary stats: larger typography, color-coded numbers matching macro tokens
- Tables: alternating row tinting (`--se-bg-subtle`), hover highlight, styled header row (`--se-bg-elevated`)
- Export buttons: outlined pills with download icons
- Logout button: moved to bottom of page, discrete position

---

## 5. AIMeals Page

### Layout changes
- **Tab switcher**: Segmented control — single rounded container with sliding highlight indicator, `--se-primary-dim` on active
- **Chat empty state**: Larger illustration icon, suggestion chips become styled cards in a column with left accent borders and hover lift
- **Chat bubbles**: User = softer rounded (`--se-radius-xl`). AI = subtle left border accent in `--se-primary`

### Estimator polish
- Form inputs grouped into visual sections: "Body Metrics" (age, sex, weight, height) and "Goals" (activity, goal) with subtle section headings
- Results calorie card: subtle radial gradient background
- Macro cards: horizontal progress bars color-coded with `--se-macro-*`
- Model info: restyled as muted pill badge

### Detail polish
- Dish recommendation cards: calorie badge, category label, hover shadow lift
- Follow-up chips: larger, arrow icon, `--se-bg-elevated` background
- Send button: circular with shadow, hover scale-up
- Typing indicator: refined bubble shape matching AI messages

---

## 6. Navbar + Footer

### Navbar
- Nav links: add 16px inline SVG icons before labels (house, utensils, sparkle)
- Logo: slightly larger, tighter spacing, optional icon mark before "SmartEats"
- Profile avatar: subtle ring border in `--se-primary`
- Active state: filled `--se-primary` background with white text (more prominent)

### Footer
- Expand to proper 3-column layout:
  - Left: Logo + tagline ("Smart dining at UIUC")
  - Center: Quick links (Menu, AI Meals, Profile) in muted text
  - Right: "Built with React + Django" credit
  - Bottom: thin divider + copyright
- Background: `--se-bg-surface` with top border

---

## SVG Icon System

Rather than adding an icon library dependency, use **inline SVG components** for the ~10 icons needed:
- House (Home nav)
- Utensils (Menu nav)
- Sparkle (AI Meals nav)
- Search (Menu search)
- MapPin (Hall location)
- ArrowLeft (Back button)
- Download (Export)
- Plus (Add to Meal)
- ChartPie (Feature card)
- User (Profile)

Create `frontend/src/components/Icons.tsx` with simple functional components wrapping `<svg>` elements. Each accepts `size` and `color` props.

---

## Files to Create
- `frontend/src/components/Icons.tsx` — SVG icon components

## Files to Modify (all pages + components)
- `frontend/src/pages/Home.tsx`
- `frontend/src/pages/Menu.tsx`
- `frontend/src/pages/DishDetail.tsx`
- `frontend/src/pages/Profile.tsx`
- `frontend/src/pages/AIMeals.tsx`
- `frontend/src/components/Navbar.tsx`
- `frontend/src/components/FoodListItem.tsx`
- `frontend/src/components/FilterChip.tsx`
- `frontend/src/Base.tsx` (footer)
- `frontend/src/static/css/custom.css` (new animations/styles)

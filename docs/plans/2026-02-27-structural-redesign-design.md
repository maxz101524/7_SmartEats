# SmartEats — Structural Redesign Design
**Date:** 2026-02-27
**Status:** Approved — ready for implementation
**Author:** Brainstorm session (Claude Code)

---

## Context

SmartEats previously had 8 page routes with significant overlap:
- `/` and `/dishes` pointed to the same `Dishes` component
- `/halls` opened dishes inside a modal (dead-end UX)
- `/charts` and `/reports` were standalone pages with no clear home
- No landing/marketing page existed

This redesign merges, removes, and restructures pages to create a coherent app with a clear hierarchy.

---

## Decisions

### Background
`--se-bg-base: #F3F0EA` — flat warm cream, no grain. Already implemented in `tokens.css`.

### Navbar
Floating pill (Solidroad / iPhone-style). See §2 below.

### Page consolidation
- `/dishes` + `/halls` → `/menu` (split panel)
- `/charts` + `/reports` → absorbed into `/profile` as scroll sections
- `/` → new Home hub page (was a duplicate of `/dishes`)

---

## 1. Navbar — Floating Pill

**Visual spec:**
- `position: fixed`, `top: 12px`, `left: 50%`, `transform: translateX(-50%)`
- `width: min(800px, calc(100% - 48px))` — 24px breathing room each side
- `height: 52px`
- `background: white`, `border-radius: 9999px`
- `box-shadow: 0 2px 16px rgba(0,0,0,0.10)`
- `z-index: 50`

**3-column layout (all flex, each col `flex:1`):**
```
[ Home · Menu · AI Meals ]   [ SmartEats ]   [ Sign In / Profile ]
       left                      center              right
```
- **Left:** `Home`, `Menu`, `AI Meals` — text links, active state uses `--se-primary` color + subtle tint pill
- **Center:** `SmartEats` logo — "Smart" in `--se-primary` orange, "Eats" in `--se-text-main` dark, `font-black`
- **Right (logged out):** "Sign In" text → `/login`
- **Right (logged in):** Avatar initials circle + "Profile" → `/profile`; logout accessible from profile page

**Base.tsx changes:**
- `main` gets `paddingTop: 76px` (52px nav + 12px top + 12px gap)
- Content `max-w-2xl mx-auto` (down from `max-w-7xl`)
- Footer unchanged

---

## 2. Route Map

### New routes
| Path | Component | Notes |
|------|-----------|-------|
| `/` | `Home` | New — landing hub |
| `/menu` | `Menu` | New — split panel (replaces `/dishes` + `/halls`) |
| `/menu/:hallId` | `Menu` | Same component, URL param selects hall |
| `/aimeals` | `AIMeals` | Unchanged |
| `/profile` | `Profile` | Rebuilt — absorbs Charts + Reports |
| `/dishes/:id` | `DishDetail` | Unchanged |
| `/login` | `Login` | Unchanged |
| `/register` | `Register` | Unchanged |
| `/gglogin` | `GGLogin` | Unchanged |
| `/showcase` | `Showcase` | Design review — remove before final deploy |

### Removed routes
| Old path | Old component | Fate |
|----------|--------------|------|
| `/dishes` | `Dishes` | Replaced by `/menu` |
| `/halls` | `DiningHalls` | Replaced by `/menu` |
| `/charts` | `Charts` | Absorbed into `/profile` §3 |
| `/reports` | `Reports` | Absorbed into `/profile` §4 |

---

## 3. New Page: Home (`/`)

**Purpose:** Landing hub — introduces the app, quick entry points, light personalization when logged in.

**Sections:**
1. **Hero**
   - Headline: `"Eat Smarter at UIUC"` (large, font-extrabold)
   - Subtitle: `"Explore dining hall menus, track nutrition, and plan meals with AI."`
   - CTA row: `<Button variant="primary">Browse Menu →</Button>` + `<Button variant="ghost">Sign In</Button>` (logged-out) or `<Button variant="secondary">View Profile</Button>` (logged-in)

2. **Quick stats row** (logged-in only — fetches `/api/meals/`)
   - 3 `Card` tiles: Calories Today · Meals Logged · Dining Halls
   - If no data: show skeleton or empty-state text, never crash

3. **Feature grid** — 3 `Card hover` cards with icons, title, description, and link:
   - Browse Menu → `/menu`
   - AI Meal Planner → `/aimeals`
   - My Profile → `/profile`

**Components used:** `Button`, `Card` (existing)

---

## 4. New Page: Menu (`/menu`, `/menu/:hallId`)

**Purpose:** Unified dining + dish discovery via a macOS-style split panel.

### Layout
```
┌──────────────┬────────────────────────────────────────┐
│  Dining      │  ISR Dining — 42 dishes                │
│  Halls       │  ─────────────────────────────────     │
│              │  [All] [Protein] [Grain] [Dessert]...  │
│ ● ISR        │                                        │
│   PAR        │  Grilled Chicken      320 kcal  [+]    │
│   Allen      │  Caesar Salad         210 kcal  [+]    │
│   FAR        │  Pasta Primavera      450 kcal  [+]    │
│              │                                        │
│  (scrollable)│  (scrollable)                          │
└──────────────┴────────────────────────────────────────┘
```

### Left rail (260px, fixed height, scrollable)
- Header: "Dining Halls" label
- List of hall rows: hall name + location + dish count pill
- Selected hall: `--se-primary-dim` background + `--se-primary` left border
- Data: `GET /api/halls/`

### Right panel (flex-grow)
- Header: selected hall name (h2) + location + dish count
- Category filter chips row (uses `FilterChip` component — see §6)
- Search input field
- Dish list: `FoodListItem` rows inside a `Card padding="none"`
- Data: `GET /api/dishes/?dining_hall__name=<name>` (or hall ID equivalent)
- **Empty state (no hall selected):** centered message "← Select a dining hall to browse its menu"

### URL sync
- On hall select: `navigate('/menu/' + hall.Dining_Hall_ID)`
- On mount: read `useParams().hallId` and pre-select that hall
- Back button works naturally

### Mobile (< 768px)
- Left rail hidden; halls become a horizontal scrollable chip row at top of page
- Dish list fills full width below

### API calls
```
GET /api/halls/              → hall list for left rail
GET /api/dishes/?search=...  → dish search (existing param)
```
Note: backend may need a `?hall=<id>` filter added. Check `/api/dishes/` query params first.

---

## 5. Rebuilt Page: Profile (`/profile`)

**Purpose:** Single destination for identity, nutrition insights, and meal history.

**Auth guard:** Redirect to `/login` if no `authToken` in localStorage.

### Scrollable sections (no tabs — simpler, mobile-friendly)

**Section 1 — Identity card**
- Avatar: large initials circle in `--se-primary-dim` / `--se-primary` text
- Name (first + last), NetID badge
- Body stats in a 2×3 grid: Sex · Age · Height · Weight · Goal
- (Edit button: placeholder for future, disabled for now)

**Section 2 — Nutrition Charts**
- Reuse `VegaChart` component from existing `Charts.tsx`
- Remove `theme: "dark"` from `embed()` call — use default light theme
- Side-by-side on desktop, stacked on mobile
- Sources: `GET /api/dishes-by-category/`, `GET /api/meals-per-day/`

**Section 3 — Meal Reports**
- Reuse logic from existing `Reports.tsx`
- Date range filter + meal list + export buttons (CSV / JSON)
- Source: `GET /api/meal-reports/`, `GET /api/export-meals/?format=csv|json`

**Logout button** at bottom of page (remove from navbar).

---

## 6. New Component: FilterChip

Needed by `Menu.tsx` for category filtering.

```tsx
// Usage
<FilterChip label="All" active={cat === "all"} onClick={() => setCat("all")} />
```

**Props:** `label: string`, `active: boolean`, `onClick: () => void`
**Style:** pill shape, `--se-primary-dim` bg + `--se-primary` text when active; `--se-bg-subtle` + `--se-text-muted` when inactive. Already demoed in `Showcase.tsx` `FilterChipDemo`.

---

## 7. Files

### Create
| File | Description |
|------|-------------|
| `frontend/src/pages/Home.tsx` | New landing hub |
| `frontend/src/pages/Menu.tsx` | Split panel (replaces Dishes + DiningHalls) |
| `frontend/src/components/FilterChip.tsx` | Reusable chip (extract from Showcase demo) |

### Rewrite
| File | Change |
|------|--------|
| `frontend/src/components/Navbar.tsx` | Floating pill (full rewrite) |
| `frontend/src/pages/Profile.tsx` | Rebuilt — absorbs Charts + Reports |
| `frontend/src/Base.tsx` | paddingTop 76px, max-w-2xl |
| `frontend/src/App.tsx` | Updated routes |

### Delete (after migration verified)
| File | Replaced by |
|------|-------------|
| `frontend/src/pages/Dishes.tsx` | `Menu.tsx` |
| `frontend/src/pages/DiningHalls.tsx` | `Menu.tsx` |
| `frontend/src/pages/Charts.tsx` | `Profile.tsx` §2 |
| `frontend/src/pages/Reports.tsx` | `Profile.tsx` §3 |

---

## 8. Implementation Order

Execute in this order — each step is independently testable:

1. **Navbar + Base.tsx** — floating pill + layout padding. Visual foundation for everything.
2. **App.tsx** — update routes (add `/menu`, `/`, remove `/dishes` `/halls` `/charts` `/reports`). Keep old pages temporarily until new ones are ready.
3. **FilterChip component** — small, needed by Menu.
4. **Home.tsx** — static-first, add logged-in stats second.
5. **Menu.tsx** — split panel with URL sync. Most complex step.
6. **Profile.tsx** — consolidate existing Charts + Reports + Profiles logic.
7. **Cleanup** — delete old pages, verify no broken imports, test all routes.
8. **Showcase** — add FilterChip demo, verify components still render on new background.

---

## 9. Design Token Reference

All styling must use `--se-*` tokens from `frontend/src/styles/tokens.css`.

Key tokens for new pages:
- Background: `--se-bg-base` (#F3F0EA)
- Cards: `--se-bg-surface` (white), `--se-shadow-sm`
- Active/brand: `--se-primary` (#E84A27), `--se-primary-dim` (#FDE8E2)
- Text hierarchy: `--se-text-main` → `--se-text-secondary` → `--se-text-muted` → `--se-text-faint`
- Borders: `--se-border` (#E4DED5)
- Macros: `--se-macro-cal/protein/carbs/fat/fiber`

Never use raw Tailwind color classes (`text-blue-600`, `bg-gray-100`, etc.) in new pages.

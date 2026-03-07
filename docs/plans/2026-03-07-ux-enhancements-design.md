# SmartEats UX Enhancements — Design Doc

**Date:** 2026-03-07
**Approach:** Foundation First — build reusable infrastructure, then apply across pages
**Scope:** Highest-impact changes across perceived performance, visual consistency, and user flows

---

## 1. New Reusable Components

### 1a. Skeleton Loader (`components/Skeleton.tsx`)

Animated placeholder component for loading states.

- **Variants:** `text` (lines of varying width), `rect` (block), `circle` (avatar)
- **Props:** `variant`, `width`, `height`, `lines` (text variant)
- **Styling:** `--se-bg-subtle` base with CSS shimmer animation (gradient sweep left-to-right)
- **Applied to:** Menu (dish list), Profile (charts, stats), Home (stats cards), DishDetail (nutrition data)
- **Animation:** `@keyframes shimmer` defined in shared CSS, subtle 1.5s infinite loop

### 1b. Toast Notification System (`components/Toast.tsx` + `ToastProvider`)

Context-based toast for success/error/info feedback.

- **API:** `useToast()` hook → `toast.success(msg)`, `toast.error(msg)`, `toast.info(msg)`
- **Position:** Bottom-right, stacked (newest on top)
- **Auto-dismiss:** 4 seconds, with progress bar indicator
- **Animation:** Slide in from right (200ms ease-out)
- **Colors:** Uses `--se-success`/`--se-error`/`--se-info` with their `-dim` background variants
- **Replaces inline messages in:** AddDish, Login, Register, AIMeals, Profile exports

---

## 2. Design System Fixes

Migrate all remaining raw Tailwind color classes and hardcoded hex values to `--se-*` tokens.

| File | Current Violation | Fix |
|------|-------------------|-----|
| `Login.tsx` | `bg-blue-500`, `text-gray-100`, raw Tailwind palette | `--se-primary`, `--se-text-*`, `--se-bg-*` |
| `Register.tsx` | Same Tailwind violations as Login | Same token migration |
| `AddDish.tsx` | `border-blue-300`, `bg-green-100`, `text-red-700` | `--se-border`, `--se-success-dim`, `--se-error` |
| `NotFound.tsx` | `text-gray-200`, `bg-blue-600` — off-brand | Full redesign: cream bg, orange accent, warm copy |
| `DishDetail.tsx` | Hardcoded `FLAG_COLORS` hex values | Shared constant using CSS custom properties |
| `FoodListItem.tsx` | Same `FLAG_COLORS` hardcoding | Share constant with DishDetail |
| `AIMeals.tsx` | Estimator uses `#ef4444`, `#f59e0b`, `#3b82f6` | `--se-macro-cal`, `--se-macro-carbs`, `--se-macro-protein` |

**Shared FLAG_COLORS constant:** Extract dietary flag color mapping to a shared util (e.g., `utils/flagColors.ts`) using CSS variable references so changes propagate from tokens.css.

---

## 3. Animations & Micro-interactions

### 3a. Route Transitions
- CSS `@keyframes fadeIn` (opacity 0→1, 200ms)
- Applied via wrapper div around `<Outlet>` in `Base.tsx`, keyed to route path

### 3b. Micro-interactions
- **Button press:** `transform: scale(0.97)` on `:active` (universal via Button component)
- **Card hover:** `translateY(-2px)` lift + shadow `--se-shadow-sm` → `--se-shadow-md` (150ms transition)
- **Filter chip toggle:** Smooth `transition: all 150ms ease` on background/border color
- **List item click:** Brief 200ms orange tint flash on row background

### 3c. Skeleton Shimmer
- `@keyframes shimmer` — gradient sweep, 1.5s infinite, applied to Skeleton component
- Defined in shared CSS (either `tokens.css` animation section or new `animations.css`)

---

## 4. User Flow Improvements

### 4a. "Add to Meal" on DishDetail
- Prominent CTA below nutrition info
- **Authenticated:** "Add to Today's Meal" → `POST /api/meals/` → success toast
- **Unauthenticated:** "Sign in to track meals" → navigates to `/login`
- Uses `--se-primary` orange button style (Button component, variant="primary", size="lg")

### 4b. Error Recovery
- On fetch failure: render a Card with error message + "Try Again" button
- Retry button re-fires the same fetch function (stored in a ref or callback)
- Replaces generic "Something went wrong" text across all pages

### 4c. Mobile Table Scrolling (Profile)
- Wrap `<table>` elements in `<div style="overflow-x: auto">`
- Add subtle right-edge gradient fade to hint at horizontal scroll

### 4d. Chart Responsiveness (Profile)
- Vega-Lite container gets `max-width: 100%` and `min-height: 200px`
- Prevents chart squashing on narrow viewports

---

## Summary of Files to Create

| New File | Purpose |
|----------|---------|
| `components/Skeleton.tsx` | Skeleton loader component |
| `components/Toast.tsx` | Toast notification component + ToastProvider + useToast hook |
| `utils/flagColors.ts` | Shared dietary flag color mapping |

## Summary of Files to Modify

| File | Changes |
|------|---------|
| `Base.tsx` | Wrap Outlet in fade-in animation, add ToastProvider |
| `Login.tsx` | Token migration, use toast for feedback |
| `Register.tsx` | Token migration, use toast for feedback |
| `AddDish.tsx` | Token migration, use toast for feedback |
| `NotFound.tsx` | Full redesign with design system tokens |
| `DishDetail.tsx` | Add skeleton loading, "Add to Meal" CTA, shared flag colors |
| `FoodListItem.tsx` | Shared flag colors |
| `AIMeals.tsx` | Fix hardcoded estimator colors |
| `Menu.tsx` | Add skeleton loading for dish list |
| `Profile.tsx` | Add skeleton loading, table scroll wrappers, chart responsiveness |
| `Home.tsx` | Add skeleton loading for stats |
| `components/Button.tsx` | Add `:active` scale micro-interaction |
| `components/Card.tsx` | Add hover lift + shadow transition |
| `tokens.css` or new `animations.css` | Shimmer keyframes, fadeIn keyframes |

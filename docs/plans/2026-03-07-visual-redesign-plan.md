# SmartEats Visual Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Elevate every page from utilitarian to clean & elevated (Linear/Notion-inspired) with refined details, SVG icons, better typography, and selective layout rethinks.

**Architecture:** Create an SVG icon component library, then systematically redesign each page/component. Each task is a single page or component rewrite. No new dependencies — all CSS + inline SVG.

**Tech Stack:** React 19, TypeScript, inline styles with `--se-*` CSS tokens, Vega-Lite (for DishDetail donut chart), inline SVG icons

---

### Task 1: Create SVG Icon Library

**Files:**
- Create: `frontend/src/components/Icons.tsx`

**Step 1: Create the icon components**

Create `frontend/src/components/Icons.tsx` with the following icons, each accepting `size?: number` (default 20) and `color?: string` (default `"currentColor"`):

```tsx
interface IconProps {
  size?: number;
  color?: string;
  className?: string;
}

export function IconHome({ size = 20, color = "currentColor" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" />
      <path d="M9 21V12h6v9" />
    </svg>
  );
}

export function IconUtensils({ size = 20, color = "currentColor" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2" />
      <path d="M7 2v20" />
      <path d="M21 15V2v0a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3zm0 0v7" />
    </svg>
  );
}

export function IconSparkle({ size = 20, color = "currentColor" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke="none">
      <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8L12 2z" />
    </svg>
  );
}

export function IconSearch({ size = 20, color = "currentColor" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}

export function IconMapPin({ size = 20, color = "currentColor" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

export function IconArrowLeft({ size = 20, color = "currentColor" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
    </svg>
  );
}

export function IconDownload({ size = 20, color = "currentColor" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

export function IconPlus({ size = 20, color = "currentColor" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconChartPie({ size = 20, color = "currentColor" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.21 15.89A10 10 0 118 2.83" />
      <path d="M22 12A10 10 0 0012 2v10z" />
    </svg>
  );
}

export function IconUser({ size = 20, color = "currentColor" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

export function IconDatabase({ size = 20, color = "currentColor" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  );
}
```

**Step 2: Verify**

Run: `cd frontend && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add frontend/src/components/Icons.tsx
git commit -m "feat: add SVG icon library with 11 icons"
```

---

### Task 2: Redesign Navbar

**Files:**
- Modify: `frontend/src/components/Navbar.tsx`

**Step 1: Update the Navbar**

Key changes to Navbar.tsx:
- Import `{ IconHome, IconUtensils, IconSparkle }` from `"./Icons"`
- Add icons before each nav link label:
  ```tsx
  const leftLinks = [
    { to: "/", label: "Home", icon: IconHome, ... },
    { to: "/menu", label: "Menu", icon: IconUtensils, ... },
    { to: "/aimeals", label: "AI Meals", icon: IconSparkle, ... },
  ];
  ```
- Render icon inline: `<link.icon size={15} />` before the label text in each link, with `gap: "5px"` and `display: "flex", alignItems: "center"` on the link
- **Active state change**: When active, use `background: "var(--se-primary)"` with `color: "var(--se-text-inverted)"` (filled orange with white text) instead of the current tinted orange
- **Logo**: increase font-size to `1.1rem`, add `letterSpacing: "-0.02em"` for tighter wordmark feel
- **Profile avatar**: Add a `2px solid var(--se-primary)` ring border around the initials circle. Show the user's first initial from localStorage `userFirstName` instead of hardcoded "U"

**Step 2: Verify visually**

Run dev server. Check all 3 states: logged out (Sign In), logged in (avatar + Profile), active vs inactive links.

**Step 3: Commit**

```bash
git add frontend/src/components/Navbar.tsx
git commit -m "feat: redesign navbar with icons, filled active state, refined logo"
```

---

### Task 3: Redesign Footer in Base.tsx

**Files:**
- Modify: `frontend/src/Base.tsx`

**Step 1: Expand footer to 3-column layout**

Replace the current minimal footer (lines 20-51) with:

```tsx
<footer
  style={{
    background: "var(--se-bg-surface)",
    borderTop: "1px solid var(--se-border)",
    padding: "32px 0 24px",
    marginTop: "auto",
  }}
>
  <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 24px" }}>
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start", gap: 24 }}>
      {/* Left: Logo + tagline */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <span style={{ color: "var(--se-primary)", fontWeight: 900, fontSize: "1.1rem" }}>Smart</span>
          <span style={{ color: "var(--se-text-main)", fontWeight: 900, fontSize: "1.1rem" }}>Eats</span>
        </div>
        <p style={{ fontSize: "var(--se-text-xs)", color: "var(--se-text-muted)", marginTop: 4, margin: "4px 0 0" }}>
          Smart dining at UIUC
        </p>
      </div>

      {/* Center: Quick links */}
      <div style={{ display: "flex", gap: 20 }}>
        {[
          { to: "/menu", label: "Menu" },
          { to: "/aimeals", label: "AI Meals" },
          { to: "/profile", label: "Profile" },
        ].map((link) => (
          <a
            key={link.to}
            href={link.to}
            style={{
              fontSize: "var(--se-text-sm)",
              color: "var(--se-text-muted)",
              textDecoration: "none",
              fontWeight: 500,
            }}
          >
            {link.label}
          </a>
        ))}
      </div>

      {/* Right: Credit */}
      <p style={{ fontSize: "var(--se-text-xs)", color: "var(--se-text-faint)", margin: 0 }}>
        Built with React + Django
      </p>
    </div>

    {/* Bottom divider + copyright */}
    <div
      style={{
        borderTop: "1px solid var(--se-border-muted)",
        marginTop: 20,
        paddingTop: 16,
        textAlign: "center",
      }}
    >
      <p style={{ fontSize: "var(--se-text-xs)", color: "var(--se-text-faint)", margin: 0 }}>
        &copy; {new Date().getFullYear()} SmartEats &mdash; UIUC INFO 490
      </p>
    </div>
  </div>
</footer>
```

Use `<Link>` from react-router-dom instead of `<a>` tags for the quick links.

**Step 2: Commit**

```bash
git add frontend/src/Base.tsx
git commit -m "feat: redesign footer with 3-column layout, quick links, and copyright"
```

---

### Task 4: Redesign Home Page

**Files:**
- Modify: `frontend/src/pages/Home.tsx`

**Step 1: Update Home.tsx**

Key changes:

1. **Import icons**: `import { IconUtensils, IconSparkle, IconChartPie } from "../components/Icons";`

2. **Hero section**:
   - Add a subtle gradient background band around the hero section: `background: "linear-gradient(180deg, var(--se-bg-base) 0%, #f0ece4 50%, var(--se-bg-base) 100%)"` — very subtle warm darkening
   - Hero padding stays 80px top, increase bottom to 72px
   - Title: keep at 3rem but add `letterSpacing: "-0.02em"` for tighter display feel
   - Primary CTA: add `boxShadow: "0 4px 14px rgba(232, 74, 39, 0.25)"` for an orange glow

3. **Feature cards**: Replace emoji with circular icon containers:
   ```tsx
   const featureCards = [
     { icon: IconUtensils, title: "Browse Menu", ... },
     { icon: IconSparkle, title: "AI Meal Planner", ... },
     { icon: IconChartPie, title: "My Profile", ... },
   ];
   ```
   Replace the emoji div with:
   ```tsx
   <div style={{
     width: 48, height: 48, borderRadius: "50%",
     background: "var(--se-primary-dim)",
     display: "flex", alignItems: "center", justifyContent: "center",
   }}>
     <card.icon size={24} color="var(--se-primary)" />
   </div>
   ```

4. **Stats cards**: Add a `borderLeft: "3px solid var(--se-primary)"` accent to each card. Keep the current layout.

**Step 2: Commit**

```bash
git add frontend/src/pages/Home.tsx
git commit -m "feat: redesign Home with gradient hero, SVG icons, accent stats"
```

---

### Task 5: Redesign Menu Page — Hall Selector + Filters + Station Headers

**Files:**
- Modify: `frontend/src/pages/Menu.tsx`
- Modify: `frontend/src/components/FilterChip.tsx`

**Step 1: Read Menu.tsx and FilterChip.tsx**

Read both files fully to understand current structure.

**Step 2: Update hall selector buttons in Menu.tsx**

Find the hall button rendering in the sidebar. Update each hall button to be a card-style button:
- Add `import { IconMapPin } from "../components/Icons";`
- Each hall button gets: `background: "var(--se-bg-surface)"`, `border: "1px solid var(--se-border)"`, `borderRadius: "var(--se-radius-md)"`, `padding: "10px 14px"`
- Selected hall: `background: "var(--se-primary-dim)"`, `borderLeft: "3px solid var(--se-primary)"`, `borderColor: "var(--se-primary)"`
- Add a small `<IconMapPin size={14} color="var(--se-text-faint)" />` before the location text

**Step 3: Update station headers in Menu.tsx**

Find station header rendering. Add a subtle background bar:
- Wrap station header in a div with `background: "var(--se-bg-subtle)"`, `borderRadius: "var(--se-radius-sm)"`, `padding: "6px 12px"`, `marginBottom: 12`
- Keep the small-caps label + count badge

**Step 4: Update FilterChip.tsx**

Read the current FilterChip component. Modify the active state to use **filled backgrounds** with semantic colors. The FilterChip should accept an optional `tint` prop (`"primary" | "success" | "error"`) that determines which color set to use when active:
- `"primary"` (default): `background: "var(--se-primary-dim)"`, `color: "var(--se-primary)"`, `border: "1px solid var(--se-primary)"`
- `"success"`: `background: "var(--se-success-dim)"`, `color: "var(--se-success)"`, `border: "1px solid var(--se-success)"`
- `"error"`: `background: "var(--se-error-dim)"`, `color: "var(--se-error)"`, `border: "1px solid var(--se-error)"`

Then in Menu.tsx, pass `tint="primary"` for meal period chips, `tint="success"` for dietary chips, `tint="error"` for allergen exclusion chips.

**Step 5: Update search input in Menu.tsx**

Find the search input. Add:
- Import `{ IconSearch } from "../components/Icons"`
- Wrap input in a relative-positioned div
- Place `<IconSearch size={16} color="var(--se-text-faint)" />` absolutely positioned on the left (left: 12px, top: 50%, transform: translateY(-50%))
- Add `paddingLeft: 36` to the input to make room for the icon
- Increase border radius to `"var(--se-radius-lg)"`

**Step 6: Commit**

```bash
git add frontend/src/pages/Menu.tsx frontend/src/components/FilterChip.tsx
git commit -m "feat: redesign Menu with card-style halls, tinted chips, search icon, station bars"
```

---

### Task 6: Redesign DishDetail Page + Replace Matplotlib Chart

**Files:**
- Modify: `frontend/src/pages/DishDetail.tsx`

**Step 1: Update DishDetail.tsx**

Key changes:

1. **Back button**: Replace current plain button with a pill-style button:
   ```tsx
   import { IconArrowLeft, IconSparkle, IconDatabase } from "../components/Icons";
   ```
   Back button gets: `background: "var(--se-bg-subtle)"`, `borderRadius: "var(--se-radius-full)"`, `padding: "6px 14px 6px 10px"`, `border: "none"`

2. **Macro cards**: Update MacroCard component to add a colored top border:
   ```tsx
   // Add borderTop to the card div:
   borderTop: `3px solid ${color}`,
   ```
   Increase value fontSize from 22 to 28. Change the container from `display: "flex"` to `display: "grid", gridTemplateColumns: "repeat(2, 1fr)"` on mobile (use `repeat(4, 1fr)` with a media-query-like approach — since this is inline styles, use a minWidth approach with `gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))"`)

3. **Dietary info section**: Wrap dietary flags + allergens in a grouped panel:
   ```tsx
   <div style={{
     background: "var(--se-bg-subtle)",
     borderRadius: "var(--se-radius-lg)",
     padding: "12px 16px",
     marginBottom: 20,
   }}>
     <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--se-text-faint)", margin: "0 0 8px" }}>
       Dietary Info
     </p>
     {/* dietary flags here */}
     {/* allergen badges here */}
   </div>
   ```

4. **Nutrition source badge**: Add icons:
   - AI Generated: `<IconSparkle size={14} />` before text, use `--se-warning-dim` bg + `--se-warning` color
   - Database: `<IconDatabase size={14} />` before text

5. **Replace matplotlib chart**: Remove the `<img>` that loads `/api/dish-summary-img/${id}/` and replace with a client-side Vega-Lite donut chart. The project already has `vega`, `vega-lite`, and `vega-embed` installed. Add:
   ```tsx
   import { useRef } from "react";
   import vegaEmbed from "vega-embed";
   ```
   Create a `useEffect` that renders a donut chart when dish data is available:
   ```tsx
   const chartRef = useRef<HTMLDivElement>(null);

   useEffect(() => {
     if (!dish || !chartRef.current) return;
     const spec = {
       $schema: "https://vega.github.io/schema/vega-lite/v5.json",
       width: "container",
       height: 200,
       data: {
         values: [
           { macro: "Protein", grams: dish.protein, color: "var(--se-macro-protein)" },
           { macro: "Carbs", grams: dish.carbohydrates, color: "var(--se-macro-carbs)" },
           { macro: "Fat", grams: dish.fat, color: "var(--se-macro-fat)" },
         ].filter(d => d.grams > 0),
       },
       mark: { type: "arc", innerRadius: 50, cornerRadius: 4 },
       encoding: {
         theta: { field: "grams", type: "quantitative", stack: true },
         color: {
           field: "macro",
           type: "nominal",
           scale: { domain: ["Protein", "Carbs", "Fat"], range: ["#3b82f6", "#d97706", "#f0784a"] },
           legend: { orient: "bottom", title: null },
         },
         tooltip: [
           { field: "macro", type: "nominal", title: "Macro" },
           { field: "grams", type: "quantitative", title: "Grams" },
         ],
       },
       config: {
         view: { stroke: null },
         background: "transparent",
         font: "DM Sans",
       },
     };
     vegaEmbed(chartRef.current, spec as any, { actions: false, renderer: "svg" });
   }, [dish]);
   ```
   Replace the `<img>` section with:
   ```tsx
   <div
     ref={chartRef}
     style={{
       background: "var(--se-bg-surface)",
       border: "1px solid var(--se-border)",
       borderRadius: "var(--se-radius-lg)",
       padding: 16,
     }}
   />
   ```

6. **Add to Meal CTA**: Make full width on mobile — add `width: "100%"` to the button wrapper div, and add `<IconPlus size={18} />` before button text:
   ```tsx
   import { IconPlus } from "../components/Icons";
   // In the Button:
   <Button variant="primary" size="lg" loading={adding} onClick={handleAddToMeal}>
     <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
       <IconPlus size={18} /> Add to Today's Meal
     </span>
   </Button>
   ```

**Step 2: Verify**

Run dev server. Navigate to a dish detail page. Verify:
- Pill back button renders
- Macro cards have colored top borders and larger text
- Dietary info grouped in a panel
- Vega donut chart renders instead of matplotlib image
- Add to Meal button has plus icon

**Step 3: Commit**

```bash
git add frontend/src/pages/DishDetail.tsx
git commit -m "feat: redesign DishDetail with accent macros, Vega donut chart, pill back button"
```

---

### Task 7: Redesign Profile Page

**Files:**
- Modify: `frontend/src/pages/Profile.tsx`

**Step 1: Read Profile.tsx fully**

Read the entire file to understand all sections.

**Step 2: Apply visual enhancements**

Key changes:

1. **Avatar**: Replace flat `--se-primary-dim` background with a gradient:
   ```tsx
   background: "linear-gradient(135deg, var(--se-primary), #f59e0b)",
   ```

2. **Stat tiles**: Add icon indicators using imported SVG icons. Add `borderTop: "3px solid var(--se-primary)"` accent to each tile.

3. **Section headings**: Each h2 gets an underline accent:
   ```tsx
   <div style={{ borderBottom: "2px solid var(--se-primary)", display: "inline-block", paddingBottom: 4, marginBottom: 20 }}>
     <h2 style={{ ... }}>Section Title</h2>
   </div>
   ```

4. **Tables**: Add alternating row tinting:
   - Even rows: `background: "var(--se-bg-subtle)"`
   - All rows: `transition: "background 100ms"` and hover `background: "var(--se-bg-elevated)"`
   - Header row: `background: "var(--se-bg-elevated)"`, `fontWeight: 700`

5. **Export buttons**: Add `<IconDownload size={16} />` before each export button text. Style as outlined pills with `border: "1.5px solid var(--se-border)"`, `borderRadius: "var(--se-radius-full)"`.

6. **Logout button**: Move to bottom of the page section instead of inside the identity card.

7. **Chart card labels**: Add a title label above each Vega chart:
   ```tsx
   <p style={{ fontSize: "var(--se-text-sm)", fontWeight: 600, color: "var(--se-text-secondary)", margin: "0 0 8px" }}>
     Dishes by Category
   </p>
   ```

**Step 3: Commit**

```bash
git add frontend/src/pages/Profile.tsx
git commit -m "feat: redesign Profile with gradient avatar, accent stats, styled tables"
```

---

### Task 8: Redesign AIMeals Page

**Files:**
- Modify: `frontend/src/pages/AIMeals.tsx`

**Step 1: Read AIMeals.tsx fully**

Read the entire file to understand the tab switcher, chat UI, and estimator sections.

**Step 2: Apply visual enhancements**

Key changes:

1. **Tab switcher**: Replace individual pill buttons with a segmented control:
   ```tsx
   <div style={{
     display: "inline-flex",
     background: "var(--se-bg-subtle)",
     borderRadius: "var(--se-radius-full)",
     padding: 3,
     gap: 2,
   }}>
     {["Chat", "Estimator"].map((tab) => (
       <button
         key={tab}
         onClick={() => setActiveTab(tab.toLowerCase())}
         style={{
           padding: "8px 20px",
           borderRadius: "var(--se-radius-full)",
           border: "none",
           fontSize: "var(--se-text-sm)",
           fontWeight: 600,
           cursor: "pointer",
           transition: "all 150ms ease",
           background: activeTab === tab.toLowerCase() ? "var(--se-bg-surface)" : "transparent",
           color: activeTab === tab.toLowerCase() ? "var(--se-text-main)" : "var(--se-text-muted)",
           boxShadow: activeTab === tab.toLowerCase() ? "var(--se-shadow-sm)" : "none",
         }}
       >
         {tab}
       </button>
     ))}
   </div>
   ```

2. **Chat empty state suggestions**: Replace plain bordered buttons with styled cards:
   ```tsx
   // Each suggestion becomes:
   <button style={{
     textAlign: "left",
     padding: "12px 16px",
     borderRadius: "var(--se-radius-md)",
     border: "1px solid var(--se-border)",
     borderLeft: "3px solid var(--se-primary)",
     background: "var(--se-bg-surface)",
     cursor: "pointer",
     fontSize: "var(--se-text-sm)",
     color: "var(--se-text-secondary)",
     transition: "all 150ms ease",
     width: "100%",
   }}>
     {suggestion}
   </button>
   ```
   Add hover: `background: "var(--se-bg-elevated)"`, `transform: "translateY(-1px)"`

3. **Chat bubbles**: User messages get `borderRadius: "var(--se-radius-xl) var(--se-radius-xl) var(--se-radius-sm) var(--se-radius-xl)"` (chat bubble shape). AI messages get a subtle left border: `borderLeft: "3px solid var(--se-primary-dim)"`.

4. **Estimator form grouping**: Add section labels:
   ```tsx
   <p style={{ fontSize: "var(--se-text-xs)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--se-text-faint)", margin: "0 0 8px" }}>
     Body Metrics
   </p>
   ```
   Before the age/sex/weight/height inputs, and "Goals" before activity/goal selects.

5. **Estimator results macro cards**: Replace the solid color dot with a small horizontal progress bar:
   ```tsx
   <div style={{
     width: "100%",
     height: 4,
     borderRadius: 2,
     background: "var(--se-bg-subtle)",
     margin: "0 0 8px",
     overflow: "hidden",
   }}>
     <div style={{
       width: `${Math.min((value / totalMacroGrams) * 100, 100)}%`,
       height: "100%",
       borderRadius: 2,
       background: color,
     }} />
   </div>
   ```

6. **Follow-up suggestion chips**: Increase font size to `--se-text-sm`, add `background: "var(--se-bg-elevated)"`, `borderRadius: "var(--se-radius-full)"`, `padding: "6px 14px"`.

**Step 3: Commit**

```bash
git add frontend/src/pages/AIMeals.tsx
git commit -m "feat: redesign AIMeals with segmented tabs, styled chat, grouped estimator"
```

---

## Execution Order

```
Task 1 (Icons)       ── Foundation, no dependencies
Task 2 (Navbar)      ── Depends on Task 1
Task 3 (Footer)      ── Independent
Task 4 (Home)        ── Depends on Task 1
Task 5 (Menu)        ── Depends on Task 1
Task 6 (DishDetail)  ── Depends on Task 1
Task 7 (Profile)     ── Depends on Task 1
Task 8 (AIMeals)     ── Independent (no icons needed)
```

**Parallelizable:** Tasks 2-8 can all run after Task 1 completes. Tasks 3 and 8 are fully independent. However, since multiple tasks touch overlapping imports, run sequentially for safety.

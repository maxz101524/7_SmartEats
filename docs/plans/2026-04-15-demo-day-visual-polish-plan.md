# Demo Day Visual Polish — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Menu and Home pages look like a polished consumer food app for tomorrow's live demo to judges.

**Architecture:** All changes are frontend-only. Menu page gets compact horizontal dish rows replacing the 2-col card grid, collapsible filters, and micro-animations. Home page gets an animated aurora hero background, a live dish ticker, and animated stat counters. No new API endpoints or dependencies.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS v4, existing `--se-*` design tokens from `tokens.css`.

**Design doc:** `docs/plans/2026-04-15-demo-day-visual-polish-design.md`

---

## Task 1: Add new CSS keyframes to custom.css

**Files:**
- Modify: `frontend/src/static/css/custom.css:84-88` (after existing `@keyframes fadeIn`)

**Step 1: Add the new keyframes**

Append after the existing `fadeIn` keyframe (line 88) and before the reduced-motion media query (line 90):

```css
/* ── Dish row stagger entrance ─────────────────────────── */
@keyframes slideInRow {
  from { opacity: 0; transform: translateX(-8px); }
  to   { opacity: 1; transform: translateX(0); }
}

/* ── Hero aurora gradient ──────────────────────────────── */
@keyframes auroraShift {
  0%   { background-position: 0% 50%; }
  33%  { background-position: 100% 50%; }
  66%  { background-position: 50% 100%; }
  100% { background-position: 0% 50%; }
}

/* ── Scrolling dish ticker ─────────────────────────────── */
@keyframes tickerScroll {
  0%   { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}

/* ── Add button bounce ─────────────────────────────────── */
@keyframes addBounce {
  0%   { transform: scale(1); }
  40%  { transform: scale(0.90); }
  100% { transform: scale(1); }
}
```

**Step 2: Verify the dev server still compiles**

Run: `cd frontend && npm run dev -- --port 5174 &` (or verify existing server)
Expected: No CSS parse errors, page loads normally.

**Step 3: Commit**

```bash
git add frontend/src/static/css/custom.css
git commit -m "feat: add CSS keyframes for demo day polish (slideInRow, aurora, ticker, bounce)"
```

---

## Task 2: Compact DishRow component (replace CompactDishCard in Menu.tsx)

This is the largest change. Replace the `CompactDishCard` function component (lines 228-448 in Menu.tsx) with a new `DishRow` component, and add a `MacroBar` helper.

**Files:**
- Modify: `frontend/src/pages/Menu.tsx:228-448` (replace CompactDishCard)
- Modify: `frontend/src/pages/Menu.tsx:1346` (update grid usage to use new rows)

**Step 1: Replace CompactDishCard with MacroBar + DishRow**

Replace the `CompactDishCard` function (lines 228–448) with:

```tsx
function MacroBar({ protein, carbs, fat }: { protein: number; carbs: number; fat: number }) {
  const pCal = protein * 4;
  const cCal = carbs * 4;
  const fCal = fat * 9;
  const total = pCal + cCal + fCal || 1;

  return (
    <div
      style={{
        display: "flex",
        height: 4,
        borderRadius: 2,
        overflow: "hidden",
        background: "var(--se-bg-subtle)",
        width: "100%",
        maxWidth: 160,
      }}
    >
      <div style={{ width: `${(pCal / total) * 100}%`, background: "var(--se-macro-protein)" }} />
      <div style={{ width: `${(cCal / total) * 100}%`, background: "var(--se-macro-carbs)" }} />
      <div style={{ width: `${(fCal / total) * 100}%`, background: "var(--se-macro-fat)" }} />
    </div>
  );
}

function DishRow({
  dish,
  station,
  trayQuantity,
  index,
  onClick,
  onAddToTray,
}: {
  dish: Dish;
  station: string;
  trayQuantity: number;
  index: number;
  onClick: () => void;
  onAddToTray: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  const inTray = trayQuantity > 0;

  const handleAdd = () => {
    onAddToTray();
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 600);
  };

  const firstFlag = dish.dietary_flags?.[0];
  const flagColors = firstFlag ? (FLAG_COLORS[firstFlag] || FLAG_FALLBACK) : null;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "10px 16px",
        borderRadius: "var(--se-radius-lg)",
        background: inTray
          ? "rgba(var(--se-primary-rgb), 0.04)"
          : hovered
            ? "var(--se-bg-elevated)"
            : "var(--se-bg-surface)",
        borderLeft: hovered ? "3px solid var(--se-primary)" : "3px solid transparent",
        transition: "all 120ms ease",
        animation: `slideInRow 150ms ease both`,
        animationDelay: `${Math.min(index, 15) * 30}ms`,
      }}
    >
      {/* Icon */}
      <button
        type="button"
        onClick={onClick}
        style={{
          width: 44,
          minWidth: 44,
          height: 44,
          borderRadius: 12,
          background: "var(--se-bg-elevated)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px solid var(--se-border)",
          cursor: "pointer",
          flexShrink: 0,
          padding: 0,
        }}
      >
        <FoodIcon dishName={dish.dish_name} category={dish.category as FoodCategory} size="md" />
      </button>

      {/* Name + serving + macro bar */}
      <button
        type="button"
        onClick={onClick}
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: 3,
          textAlign: "left",
          border: "none",
          background: "transparent",
          padding: 0,
          cursor: "pointer",
        }}
      >
        <span
          style={{
            fontSize: "var(--se-text-sm)",
            fontWeight: "var(--se-weight-bold)",
            color: "var(--se-text-main)",
            lineHeight: 1.2,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {dish.dish_name}
        </span>
        <span
          style={{
            fontSize: 11,
            color: "var(--se-text-muted)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {dish.serving_size || "Serving size unavailable"}
          {dish.meal_period ? ` · ${dish.meal_period}` : ""}
          {` · ${station}`}
        </span>
        <MacroBar protein={dish.protein} carbs={dish.carbohydrates} fat={dish.fat} />
      </button>

      {/* Macros */}
      <div
        className="hidden md:flex"
        style={{
          alignItems: "center",
          gap: 8,
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--se-text-muted)" }}>
          {dish.calories} kcal
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--se-macro-protein)" }}>
          {dish.protein}g P
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--se-macro-carbs)" }}>
          {dish.carbohydrates}g C
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--se-macro-fat)" }}>
          {dish.fat}g F
        </span>
      </div>

      {/* Dietary flag badge */}
      {flagColors && firstFlag && (
        <span
          className="hidden sm:inline-flex"
          style={{
            flexShrink: 0,
            padding: "3px 7px",
            borderRadius: "var(--se-radius-full)",
            background: flagColors.bg,
            color: flagColors.text,
            fontSize: 9,
            fontWeight: 800,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          {firstFlag}
        </span>
      )}

      {/* Tray quantity badge */}
      {inTray && (
        <span
          style={{
            flexShrink: 0,
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: "var(--se-primary)",
            color: "var(--se-text-inverted)",
            fontSize: 11,
            fontWeight: 800,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {trayQuantity}
        </span>
      )}

      {/* Add button */}
      <button
        type="button"
        onClick={handleAdd}
        style={{
          flexShrink: 0,
          height: 32,
          minWidth: 32,
          padding: justAdded ? "0 12px" : hovered ? "0 14px" : "0",
          width: justAdded || hovered ? "auto" : 32,
          borderRadius: "var(--se-radius-full)",
          border: "1.5px solid var(--se-border)",
          background: justAdded
            ? "var(--se-success)"
            : inTray
              ? "var(--se-bg-surface)"
              : "var(--se-bg-surface)",
          color: justAdded
            ? "var(--se-text-inverted)"
            : "var(--se-text-main)",
          fontSize: "var(--se-text-sm)",
          fontWeight: "var(--se-weight-bold)",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 120ms ease",
          animation: justAdded ? "addBounce 200ms ease" : "none",
        }}
      >
        {justAdded ? "✓" : hovered ? "Add" : "+"}
      </button>
    </div>
  );
}
```

**Step 2: Update the dish grid rendering**

Find the grid rendering section (around line 1346):

```tsx
<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
  {dishes.map((dish) => (
    <CompactDishCard
```

Replace with:

```tsx
<div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
  {dishes.map((dish, i) => (
    <DishRow
      key={dish.dish_id}
      dish={dish}
      station={station}
      index={i}
      trayQuantity={getItemQuantity(dish.dish_id)}
      onClick={() => navigate(`/dishes/${dish.dish_id}`)}
      onAddToTray={() => handleAddDishToTray(dish)}
    />
  ))}
</div>
```

**Step 3: Verify the menu page renders correctly**

Run: Open `http://localhost:5173/menu/5` (Kosher Kitchen from screenshots)
Expected: Dishes render as horizontal rows instead of 2-col cards. Each row has icon, name, macro bar, macros, badge, and Add button.

**Step 4: Commit**

```bash
git add frontend/src/pages/Menu.tsx
git commit -m "feat: replace dish cards with compact horizontal rows + macro bar"
```

---

## Task 3: Collapsible filter panel in Menu.tsx

**Files:**
- Modify: `frontend/src/pages/Menu.tsx` (the filter section, around lines 1197-1249)

**Step 1: Add filter collapse state**

In the `Menu()` component, after the existing state declarations (around line 467), add:

```tsx
const [filtersOpen, setFiltersOpen] = useState(false);
```

**Step 2: Wrap the dietary + allergen chip sections in a collapsible container**

Replace the filter chip section (the `<div>` containing "Dietary" and "Exclude Allergens" labels + chips, around lines 1197-1249) with:

```tsx
<div>
  <button
    type="button"
    onClick={() => setFiltersOpen((open) => !open)}
    style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      background: "none",
      border: "none",
      cursor: "pointer",
      padding: "4px 0",
      fontSize: "var(--se-text-xs)",
      fontWeight: "var(--se-weight-bold)",
      color: "var(--se-text-muted)",
      letterSpacing: "0.04em",
    }}
  >
    Dietary & Allergens
    {(activeDietary.size + excludedAllergens.size > 0) && (
      <span
        style={{
          padding: "2px 7px",
          borderRadius: "var(--se-radius-full)",
          background: "var(--se-primary)",
          color: "var(--se-text-inverted)",
          fontSize: 10,
          fontWeight: 800,
        }}
      >
        {activeDietary.size + excludedAllergens.size}
      </span>
    )}
    <span
      style={{
        display: "inline-flex",
        transform: filtersOpen ? "rotate(180deg)" : "rotate(0deg)",
        transition: "transform 140ms ease",
        fontSize: 12,
      }}
    >
      ▾
    </span>
  </button>
  <div
    style={{
      display: "grid",
      gridTemplateRows: filtersOpen ? "1fr" : "0fr",
      transition: "grid-template-rows 200ms ease",
    }}
  >
    <div style={{ overflow: "hidden" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 10 }}>
        <div>
          <p
            style={{
              margin: "0 0 6px",
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--se-text-faint)",
            }}
          >
            Dietary
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {DIETARY_FILTERS.map((flag) => (
              <FilterChip
                key={flag}
                label={flag}
                active={activeDietary.has(flag)}
                onClick={() => toggleDietary(flag)}
                tint="success"
              />
            ))}
          </div>
        </div>
        <div>
          <p
            style={{
              margin: "0 0 6px",
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--se-text-faint)",
            }}
          >
            Exclude Allergens
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {ALLERGEN_FILTERS.map((allergen) => (
              <FilterChip
                key={allergen}
                label={allergen}
                active={excludedAllergens.has(allergen)}
                onClick={() => toggleAllergen(allergen)}
                tint="error"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
```

**Step 3: Verify filters work**

Open the menu page, confirm:
- Filters are collapsed by default
- Clicking "Dietary & Allergens" reveals the chips
- Selecting a filter shows the count badge
- Filters still work as before

**Step 4: Commit**

```bash
git add frontend/src/pages/Menu.tsx
git commit -m "feat: collapse dietary/allergen filters behind toggle"
```

---

## Task 4: Station header accent bar

**Files:**
- Modify: `frontend/src/pages/Menu.tsx` (station header section, around lines 1296-1344)

**Step 1: Replace the station header markup**

Replace the station header `<div>` (the one with `borderBottom`) with:

```tsx
<div
  style={{
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    paddingLeft: 14,
    borderLeft: "4px solid var(--se-primary)",
  }}
>
  <h2
    style={{
      margin: 0,
      fontSize: "var(--se-text-base)",
      fontWeight: "var(--se-weight-extrabold)",
      color: "var(--se-text-main)",
      letterSpacing: "-0.02em",
    }}
  >
    {station}
  </h2>
  <span
    style={{
      padding: "4px 10px",
      borderRadius: "var(--se-radius-full)",
      background: "var(--se-bg-subtle)",
      color: "var(--se-text-muted)",
      fontSize: "var(--se-text-xs)",
      fontWeight: "var(--se-weight-semibold)",
      whiteSpace: "nowrap",
    }}
  >
    {dishes.length} items
  </span>
</div>
```

This removes the "SERVING STATION" label overhead and the border-bottom, replacing with a compact left-accent bar.

**Step 2: Verify station headers render**

Check menu page — each station should show as `▌ Station Name ............. N items`

**Step 3: Commit**

```bash
git add frontend/src/pages/Menu.tsx
git commit -m "feat: station headers with left accent bar"
```

---

## Task 5: Home page aurora gradient hero

**Files:**
- Modify: `frontend/src/pages/Home.tsx:84-201` (hero section)

**Step 1: Wrap the hero section with the aurora background**

Replace the hero wrapper (line 84):

```tsx
<div style={{ margin: "0 -24px", padding: "0 24px", background: "var(--se-bg-base)" }}>
```

With:

```tsx
<div
  style={{
    margin: "0 -24px",
    padding: "0 24px",
    position: "relative",
    overflow: "hidden",
  }}
>
  {/* Aurora gradient background */}
  <div
    style={{
      position: "absolute",
      inset: 0,
      background: "linear-gradient(135deg, #fde8e2 0%, #f5f3f0 25%, #e8e0f0 50%, #fef9c3 75%, #fde8e2 100%)",
      backgroundSize: "400% 400%",
      animation: "auroraShift 15s ease infinite",
      opacity: 0.7,
    }}
  />
  <div style={{ position: "relative", zIndex: 1 }}>
```

And close the wrapper after the hero `</section>` tag (line 200):

```tsx
  </div> {/* end z-1 relative wrapper */}
</div>
```

**Step 2: Verify the aurora renders**

Open `http://localhost:5173/` — the hero section should have a slowly-shifting pastel gradient behind the text. Below-the-fold content should still be on the standard cream.

**Step 3: Commit**

```bash
git add frontend/src/pages/Home.tsx
git commit -m "feat: animated aurora gradient on home hero section"
```

---

## Task 6: "Serving Right Now" scrolling dish ticker on Home page

**Files:**
- Modify: `frontend/src/pages/Home.tsx` (add new section between stats and feature cards)

**Step 1: Add state and fetch for ticker dishes**

In the `Home()` component, after the existing `stats`/`statsError` state (around line 21), add:

```tsx
const [tickerDishes, setTickerDishes] = useState<{ dish_id: number; dish_name: string; calories: number; dietary_flags?: string[]; category?: string }[]>([]);
```

In the existing `useEffect` (or add a new one after line 53), add a fetch for public dishes:

```tsx
useEffect(() => {
  axios
    .get(`${API_BASE}/dishes/`, { params: { limit: 16 } })
    .then((res) => {
      const data = Array.isArray(res.data) ? res.data : (res.data.results ?? []);
      setTickerDishes(data.slice(0, 16));
    })
    .catch(() => {
      // Ticker is decorative — silent fail is fine
    });
}, []);
```

**Step 2: Add the ticker section JSX**

Insert this section after the stats section and before the feature cards `<div>` (around line 322):

```tsx
{/* ── Section: Serving Right Now ticker ── */}
{tickerDishes.length > 0 && (
  <section style={{ marginBottom: 32, overflow: "hidden" }}>
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 14,
      }}
    >
      <span style={{ position: "relative", display: "inline-flex", width: 8, height: 8 }}>
        <span
          className="animate-ping"
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background: "var(--se-success)",
            opacity: 0.6,
          }}
        />
        <span
          style={{
            position: "relative",
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "var(--se-success)",
            display: "block",
          }}
        />
      </span>
      <span
        style={{
          fontSize: "var(--se-text-xs)",
          fontWeight: "var(--se-weight-bold)",
          color: "var(--se-text-secondary)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        Serving right now
      </span>
    </div>
    <div
      style={{
        display: "flex",
        width: "max-content",
        animation: "tickerScroll 30s linear infinite",
        gap: 12,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.animationPlayState = "paused"; }}
      onMouseLeave={(e) => { e.currentTarget.style.animationPlayState = "running"; }}
    >
      {/* Duplicate the list for seamless loop */}
      {[...tickerDishes, ...tickerDishes].map((dish, i) => (
        <button
          key={`${dish.dish_id}-${i}`}
          type="button"
          onClick={() => navigate(`/dishes/${dish.dish_id}`)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 16px",
            borderRadius: "var(--se-radius-full)",
            background: "var(--se-bg-surface)",
            border: "1px solid var(--se-border)",
            boxShadow: "var(--se-shadow-sm)",
            whiteSpace: "nowrap",
            cursor: "pointer",
            transition: "box-shadow 120ms ease, border-color 120ms ease",
            fontSize: "var(--se-text-sm)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--se-primary)";
            e.currentTarget.style.boxShadow = "var(--se-shadow-md)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--se-border)";
            e.currentTarget.style.boxShadow = "var(--se-shadow-sm)";
          }}
        >
          <FoodIcon dishName={dish.dish_name} category={dish.category as FoodCategory} size="sm" />
          <span style={{ fontWeight: "var(--se-weight-semibold)", color: "var(--se-text-main)" }}>
            {dish.dish_name}
          </span>
          <span style={{ color: "var(--se-text-muted)", fontSize: 12 }}>
            {dish.calories} kcal
          </span>
          {dish.dietary_flags?.[0] && (
            <span
              style={{
                padding: "2px 6px",
                borderRadius: "var(--se-radius-full)",
                background: (FLAG_COLORS[dish.dietary_flags[0]] || FLAG_FALLBACK).bg,
                color: (FLAG_COLORS[dish.dietary_flags[0]] || FLAG_FALLBACK).text,
                fontSize: 9,
                fontWeight: 800,
                textTransform: "uppercase",
              }}
            >
              {dish.dietary_flags[0]}
            </span>
          )}
        </button>
      ))}
    </div>
  </section>
)}
```

**Step 3: Add necessary imports to Home.tsx**

At the top of Home.tsx, add the FoodIcon and flag color imports:

```tsx
import { FoodIcon } from "../components/FoodIcon";
import type { FoodCategory } from "../components/FoodIcon";
import { FLAG_COLORS, FLAG_FALLBACK } from "../utils/flagColors";
```

**Step 4: Verify the ticker renders and scrolls**

Open `http://localhost:5173/` — a "Serving right now" section should appear with pill-shaped dish cards scrolling left continuously. Hovering should pause the scroll. Clicking should navigate to dish detail.

**Step 5: Commit**

```bash
git add frontend/src/pages/Home.tsx
git commit -m "feat: live dish ticker on home page with auto-scroll"
```

---

## Task 7: Animated stat counters on Home page

**Files:**
- Modify: `frontend/src/pages/Home.tsx` (stats section, lines 251-321)

**Step 1: Add an AnimatedCounter helper component**

Add this above the `Home()` export:

```tsx
function AnimatedCounter({ target, duration = 1500 }: { target: number; duration?: number }) {
  const [count, setCount] = useState(0);
  const [ref, setRef] = useState<HTMLSpanElement | null>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!ref) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started) {
          setStarted(true);
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(ref);
    return () => observer.disconnect();
  }, [ref, started]);

  useEffect(() => {
    if (!started || target <= 0) return;
    const start = performance.now();
    let raf: number;

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * target));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [started, target, duration]);

  return <span ref={setRef}>{started ? count.toLocaleString() : "0"}</span>;
}
```

**Step 2: Replace static stat numbers with AnimatedCounter**

In the stats section, replace the two static number renders:

Replace `{stats.total_dishes ?? "—"}` with:
```tsx
{stats.total_dishes ? <AnimatedCounter target={stats.total_dishes} /> : "—"}
```

Replace `{stats.total_halls ?? "—"}` with:
```tsx
{stats.total_halls ? <AnimatedCounter target={stats.total_halls} duration={800} /> : "—"}
```

**Step 3: Verify counters animate**

Open `http://localhost:5173/` while logged in — stats should count up from 0 when they scroll into view.

**Step 4: Commit**

```bash
git add frontend/src/pages/Home.tsx
git commit -m "feat: animated stat counters with intersection observer"
```

---

## Task 8: Final verification + polish commit

**Files:**
- All previously modified files

**Step 1: Full page walkthrough**

Verify each page works:
1. Home page: aurora gradient shifts, dish ticker scrolls, stat counters animate, all links work
2. Menu page (pick a hall): dishes show as compact rows, macro bars render, filters collapse/expand, station headers have accent bar, Add button bounces + shows checkmark, stagger animation plays on filter change
3. Navigate between pages — no console errors, no layout shifts

**Step 2: Mobile responsive check**

Resize browser to 375px width and verify:
- Home ticker still scrolls (no overflow issues)
- Menu dish rows wrap macros below name
- Filters collapsible still works
- No horizontal overflow

**Step 3: Commit any final tweaks**

```bash
git add -A
git commit -m "polish: demo day visual enhancements — final tweaks"
```

---

## Execution Order Summary

| Task | What | Time Est |
|------|------|----------|
| 1 | CSS keyframes | 5 min |
| 2 | DishRow component (replaces CompactDishCard) | 30 min |
| 3 | Collapsible filters | 15 min |
| 4 | Station header accent | 10 min |
| 5 | Home aurora gradient | 10 min |
| 6 | Dish ticker | 20 min |
| 7 | Animated counters | 15 min |
| 8 | Final verification | 10 min |

**Total: ~2 hours**

Tasks 5-7 (Home page) are independent of Tasks 2-4 (Menu page) and can be parallelized.

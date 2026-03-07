# SmartEats UX Enhancements — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Elevate SmartEats UX with reusable infrastructure (Skeleton, Toast), design system compliance, micro-interactions, and key user flow improvements.

**Architecture:** Build two new reusable components (Skeleton, Toast) and a shared utility (flagColors), then systematically apply them across all pages. Fix design system violations in auth/admin components. Add page transitions and micro-interactions via CSS. Implement "Add to Meal" CTA on DishDetail.

**Tech Stack:** React 19, TypeScript, CSS custom properties (`--se-*` tokens), Vite, axios

---

### Task 1: Create Skeleton Loader Component

**Files:**
- Create: `frontend/src/components/Skeleton.tsx`
- Modify: `frontend/src/static/css/custom.css` (add shimmer keyframes)

**Step 1: Add shimmer animation to custom.css**

Add after the existing `@keyframes gradient-shift` block (after line 68):

```css
/* ── Skeleton shimmer ───────────────────────────────────── */
@keyframes shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
```

**Step 2: Create Skeleton component**

Create `frontend/src/components/Skeleton.tsx`:

```tsx
interface SkeletonProps {
  variant?: "text" | "rect" | "circle";
  width?: string | number;
  height?: string | number;
  lines?: number;
}

const base: React.CSSProperties = {
  background: `linear-gradient(
    90deg,
    var(--se-bg-subtle) 25%,
    var(--se-border-muted) 50%,
    var(--se-bg-subtle) 75%
  )`,
  backgroundSize: "200% 100%",
  animation: "shimmer 1.5s ease-in-out infinite",
  borderRadius: "var(--se-radius-sm)",
};

export default function Skeleton({
  variant = "rect",
  width,
  height,
  lines = 3,
}: SkeletonProps) {
  if (variant === "circle") {
    const size = width ?? 48;
    return (
      <div
        style={{ ...base, width: size, height: size, borderRadius: "50%" }}
        aria-hidden="true"
      />
    );
  }

  if (variant === "text") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }} aria-hidden="true">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            style={{
              ...base,
              height: 14,
              width: i === lines - 1 ? "60%" : "100%",
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      style={{ ...base, width: width ?? "100%", height: height ?? 80 }}
      aria-hidden="true"
    />
  );
}
```

**Step 3: Verify component renders**

Run: `cd frontend && npm run dev`
Temporarily import Skeleton in Home.tsx and render `<Skeleton variant="text" lines={3} />` to visually verify the shimmer animation works. Remove after verification.

**Step 4: Commit**

```bash
git add frontend/src/components/Skeleton.tsx frontend/src/static/css/custom.css
git commit -m "feat: add Skeleton loader component with shimmer animation"
```

---

### Task 2: Create Toast Notification System

**Files:**
- Create: `frontend/src/components/Toast.tsx`
- Modify: `frontend/src/main.tsx` (wrap app in ToastProvider)

**Step 1: Create Toast component with provider and hook**

Create `frontend/src/components/Toast.tsx`:

```tsx
import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";

type ToastType = "success" | "error" | "info";

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastAPI {
  success: (msg: string) => void;
  error: (msg: string) => void;
  info: (msg: string) => void;
}

const ToastContext = createContext<ToastAPI | null>(null);

export function useToast(): ToastAPI {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

const TYPE_STYLES: Record<ToastType, { bg: string; border: string; color: string }> = {
  success: {
    bg: "var(--se-success-dim)",
    border: "var(--se-success)",
    color: "var(--se-success)",
  },
  error: {
    bg: "var(--se-error-dim)",
    border: "var(--se-error)",
    color: "var(--se-error)",
  },
  info: {
    bg: "var(--se-info-dim)",
    border: "var(--se-info)",
    color: "var(--se-info)",
  },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const addToast = useCallback((message: string, type: ToastType) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const api: ToastAPI = {
    success: useCallback((msg: string) => addToast(msg, "success"), [addToast]),
    error: useCallback((msg: string) => addToast(msg, "error"), [addToast]),
    info: useCallback((msg: string) => addToast(msg, "info"), [addToast]),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          display: "flex",
          flexDirection: "column-reverse",
          gap: 8,
          zIndex: 9999,
          pointerEvents: "none",
        }}
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => setToasts((p) => p.filter((x) => x.id !== t.id))} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const s = TYPE_STYLES[toast.type];
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  return (
    <div
      role="alert"
      aria-live="polite"
      onClick={onDismiss}
      style={{
        pointerEvents: "auto",
        cursor: "pointer",
        padding: "12px 20px",
        borderRadius: "var(--se-radius-md)",
        border: `1.5px solid ${s.border}`,
        background: s.bg,
        color: s.color,
        fontFamily: "var(--se-font-sans)",
        fontSize: "var(--se-text-sm)",
        fontWeight: 600,
        boxShadow: "var(--se-shadow-md)",
        transform: visible ? "translateX(0)" : "translateX(120%)",
        opacity: visible ? 1 : 0,
        transition: "transform 200ms ease-out, opacity 200ms ease-out",
        maxWidth: 360,
      }}
    >
      {toast.message}
    </div>
  );
}
```

**Step 2: Wrap app in ToastProvider**

In `frontend/src/main.tsx`, wrap the `<App />` inside `<ToastProvider>`:

```tsx
import { ToastProvider } from "./components/Toast.tsx";

// Inside render:
<GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
  <ToastProvider>
    <App />
  </ToastProvider>
</GoogleOAuthProvider>
```

**Step 3: Verify toast renders**

Run dev server. Temporarily add a button to Home.tsx that calls `toast.success("It works!")` on click. Verify the toast slides in from the right and auto-dismisses. Remove after verification.

**Step 4: Commit**

```bash
git add frontend/src/components/Toast.tsx frontend/src/main.tsx
git commit -m "feat: add Toast notification system with provider and useToast hook"
```

---

### Task 3: Create Shared Flag Colors Utility

**Files:**
- Create: `frontend/src/utils/flagColors.ts`
- Modify: `frontend/src/pages/DishDetail.tsx` (remove local FLAG_COLORS, import shared)
- Modify: `frontend/src/components/FoodListItem.tsx` (remove local FLAG_COLORS, import shared)

**Step 1: Create shared utility**

Create `frontend/src/utils/flagColors.ts`:

```ts
export const FLAG_COLORS: Record<string, { bg: string; text: string }> = {
  Vegetarian: { bg: "var(--se-success-dim)", text: "var(--se-success)" },
  Vegan:      { bg: "var(--se-success-dim)", text: "var(--se-success)" },
  Halal:      { bg: "var(--se-info-dim)",    text: "var(--se-info)" },
  Jain:       { bg: "var(--se-warning-dim)", text: "var(--se-warning)" },
};

export const FLAG_FALLBACK = { bg: "var(--se-bg-subtle)", text: "var(--se-text-muted)" };
```

**Step 2: Update DishDetail.tsx**

- Remove the local `FLAG_COLORS` constant (lines 27–32)
- Add import: `import { FLAG_COLORS, FLAG_FALLBACK } from "../utils/flagColors";`
- Replace `FLAG_COLORS[flag] || { bg: "var(--se-bg-subtle)", text: "var(--se-text-muted)" }` with `FLAG_COLORS[flag] || FLAG_FALLBACK`

**Step 3: Update FoodListItem.tsx**

- Remove the local `FLAG_COLORS` constant (lines 29–34)
- Add import: `import { FLAG_COLORS, FLAG_FALLBACK } from "../utils/flagColors";`
- Replace fallback with `FLAG_FALLBACK`
- Fix fat badge hardcoded bg `#fff1eb` (line 137) → `"var(--se-primary-dim)"`

**Step 4: Verify both pages render flags correctly**

Run dev server. Navigate to `/menu`, select a hall, verify dietary flags show correct colors. Click a dish to go to DishDetail, verify flags match.

**Step 5: Commit**

```bash
git add frontend/src/utils/flagColors.ts frontend/src/pages/DishDetail.tsx frontend/src/components/FoodListItem.tsx
git commit -m "refactor: extract FLAG_COLORS to shared utility with design tokens"
```

---

### Task 4: Fix Design System — Login.tsx

**Files:**
- Modify: `frontend/src/components/Login.tsx`

**Step 1: Rewrite Login.tsx to use design tokens and Button component**

Key changes:
- Replace `bg-gray-100` wrapper → `style={{ background: "var(--se-bg-base)" }}`
- Replace `bg-white p-10 rounded-2xl shadow-lg border border-gray-100` → use `<Card padding="lg">`
- Replace raw `<button className="bg-blue-500...">` → `<Button variant="primary" size="lg">`
- Replace form input classes → semantic styles with `--se-*` tokens
- Fix navigation: `navigate("/dishes")` → `navigate("/menu")` (line 27)
- Replace inline error/success messages → use `useToast()` hook

**Step 2: Verify login flow works**

Run dev server. Navigate to `/login`. Verify:
- Form renders with cream background, white card, orange submit button
- Login succeeds → toast shows success, navigates to `/menu`
- Login fails → toast shows error message

**Step 3: Commit**

```bash
git add frontend/src/components/Login.tsx
git commit -m "fix: migrate Login page to design system tokens and fix /dishes → /menu redirect"
```

---

### Task 5: Fix Design System — Register.tsx

**Files:**
- Modify: `frontend/src/components/Register.tsx`

**Step 1: Rewrite Register.tsx to use design tokens and Button component**

Key changes (same pattern as Login):
- Replace all Tailwind color classes with `--se-*` token inline styles
- Use `<Card>` wrapper and `<Button>` component
- Fix navigation: `navigate("/dishes")` → `navigate("/menu")` (line 39)
- Replace inline messages → use `useToast()` hook
- Style all form inputs consistently with `--se-bg-input`, `--se-border`, `--se-border-strong` (focus)

**Step 2: Verify registration flow works**

Navigate to `/register`. Verify form renders with design system styling. Test submission (if possible) or verify visual consistency.

**Step 3: Commit**

```bash
git add frontend/src/components/Register.tsx
git commit -m "fix: migrate Register page to design system tokens and fix /dishes → /menu redirect"
```

---

### Task 6: Fix Design System — AddDish.tsx

**Files:**
- Modify: `frontend/src/components/AddDish.tsx`

**Step 1: Migrate AddDish styling**

Key changes:
- Replace `border-blue-300` → `border: 1.5px solid var(--se-border)`
- Replace success message `bg-green-100 text-green-700 border-green-300` → `--se-success-dim`, `--se-success`
- Replace error message `bg-red-100 text-red-700 border-red-300` → `--se-error-dim`, `--se-error`
- Replace all input Tailwind colors → `--se-*` token inline styles
- Use `<Button>` component for submit
- Replace `window.location.reload()` with toast notification (no page reload)

**Step 2: Verify AddDish form**

Navigate to the add dish page. Verify styling matches design system. Verify success/error messages use toast instead of inline.

**Step 3: Commit**

```bash
git add frontend/src/components/AddDish.tsx
git commit -m "fix: migrate AddDish to design system tokens, replace reload with toast"
```

---

### Task 7: Fix Design System — NotFound.tsx

**Files:**
- Modify: `frontend/src/pages/NotFound.tsx`

**Step 1: Redesign NotFound page**

Replace the entire page with a design-system-compliant version:

```tsx
import { Link } from "react-router-dom";
import Button from "../components/Button";

export default function NotFound() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        textAlign: "center",
        padding: "var(--se-space-8)",
      }}
    >
      <p
        style={{
          fontSize: "8rem",
          fontWeight: 800,
          color: "var(--se-border-muted)",
          lineHeight: 1,
          margin: 0,
        }}
      >
        404
      </p>
      <h1
        style={{
          fontSize: "var(--se-text-h2)",
          fontWeight: 700,
          color: "var(--se-text-main)",
          marginTop: "var(--se-space-4)",
        }}
      >
        Lost in the Dining Hall?
      </h1>
      <p
        style={{
          fontSize: "var(--se-text-base)",
          color: "var(--se-text-muted)",
          marginTop: "var(--se-space-2)",
          marginBottom: "var(--se-space-8)",
        }}
      >
        The page you're looking for doesn't exist.
      </p>
      <Link to="/">
        <Button variant="primary" size="lg">Back to Home</Button>
      </Link>
    </div>
  );
}
```

**Step 2: Verify**

Navigate to a non-existent route (e.g., `/asdf`). Verify page uses cream background, warm text colors, orange CTA button.

**Step 3: Commit**

```bash
git add frontend/src/pages/NotFound.tsx
git commit -m "fix: redesign 404 page to use design system tokens"
```

---

### Task 8: Fix Design System — AIMeals.tsx Estimator Colors

**Files:**
- Modify: `frontend/src/pages/AIMeals.tsx`

**Step 1: Replace hardcoded estimator macro colors**

Around lines 487–490, replace:
```tsx
{ label: "Protein", value: result.macros.protein_g, color: "#ef4444" },
{ label: "Carbs", value: result.macros.carbs_g, color: "#f59e0b" },
{ label: "Fat", value: result.macros.fat_g, color: "#3b82f6" },
```

With:
```tsx
{ label: "Protein", value: result.macros.protein_g, color: "var(--se-macro-protein)" },
{ label: "Carbs", value: result.macros.carbs_g, color: "var(--se-macro-carbs)" },
{ label: "Fat", value: result.macros.fat_g, color: "var(--se-macro-fat)" },
```

Also remove the hex fallbacks in the error styling around lines 396–398 — the tokens are always available since `tokens.css` is loaded globally.

**Step 2: Verify**

Navigate to `/aimeals`, switch to Estimator tab, fill out the form. Verify macro cards show correct token colors (blue for protein, amber for carbs, orange for fat).

**Step 3: Commit**

```bash
git add frontend/src/pages/AIMeals.tsx
git commit -m "fix: replace hardcoded hex colors with --se-macro-* tokens in AIMeals estimator"
```

---

### Task 9: Add Page Transition Animation

**Files:**
- Modify: `frontend/src/Base.tsx`
- Modify: `frontend/src/static/css/custom.css` (add fadeIn keyframes)

**Step 1: Add fadeIn keyframes to custom.css**

After the shimmer keyframes:

```css
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

**Step 2: Wrap Outlet in animated container in Base.tsx**

Import `useLocation` from `react-router-dom`. Wrap the `<Outlet />` in a div keyed by `location.pathname`:

```tsx
const location = useLocation();

// In JSX, replace <Outlet /> with:
<div key={location.pathname} style={{ animation: "fadeIn 200ms ease-out" }}>
  <Outlet />
</div>
```

**Step 3: Verify**

Navigate between pages. Verify a subtle fade-in on each route change (content should gently appear, not pop).

**Step 4: Commit**

```bash
git add frontend/src/Base.tsx frontend/src/static/css/custom.css
git commit -m "feat: add subtle fade-in page transition on route changes"
```

---

### Task 10: Add Micro-interactions — Button & Card

**Files:**
- Modify: `frontend/src/components/Button.tsx`
- Modify: `frontend/src/components/Card.tsx`

**Step 1: Add active press effect to Button**

In Button.tsx, add to the `<button>` element's existing inline style or className:
- Add CSS class or inline style: on `:active`, apply `transform: scale(0.97)`.
- Simplest approach: add `transition: "transform 100ms ease"` to the button's inline style and use an `onMouseDown`/`onMouseUp` pattern, OR add a CSS rule in custom.css:

```css
/* Button press micro-interaction */
button:active:not(:disabled) {
  transform: scale(0.97);
}
```

This is the cleanest approach — add it to `custom.css` so it applies globally to all buttons.

**Step 2: Enhance Card hover effect**

In Card.tsx, update the hover behavior. Currently it changes `boxShadow` on mouse enter/leave. Enhance:
- Add `transition: "transform 150ms ease, box-shadow 150ms ease"` to base style
- On hover: `transform: "translateY(-2px)"` + `boxShadow: "var(--se-shadow-md)"`
- On leave: `transform: "translateY(0)"` + `boxShadow: "var(--se-shadow-sm)"`

**Step 3: Verify**

Click buttons — they should briefly shrink. Hover cards — they should lift slightly with a shadow increase.

**Step 4: Commit**

```bash
git add frontend/src/static/css/custom.css frontend/src/components/Card.tsx
git commit -m "feat: add button press and card hover micro-interactions"
```

---

### Task 11: Apply Skeleton Loaders to Pages

**Files:**
- Modify: `frontend/src/pages/Home.tsx` (stats section)
- Modify: `frontend/src/pages/Menu.tsx` (hall list + dish list)
- Modify: `frontend/src/pages/DishDetail.tsx` (nutrition loading)
- Modify: `frontend/src/pages/Profile.tsx` (profile card + charts + report)

**Step 1: Home.tsx — stats skeleton**

Replace the conditional `stats && (...)` rendering. When `isLoggedIn && !stats`, show 3 skeleton cards in the stats grid:

```tsx
import Skeleton from "../components/Skeleton";

// When stats is null but user is logged in:
<div className="grid grid-cols-1 md:grid-cols-3 gap-5">
  {[1, 2, 3].map((i) => (
    <Card key={i} padding="md">
      <Skeleton variant="rect" height={24} width="40%" />
      <div style={{ marginTop: 8 }}><Skeleton variant="text" lines={1} /></div>
    </Card>
  ))}
</div>
```

**Step 2: Menu.tsx — sidebar skeleton**

Replace `"Loading…"` text (line ~287) with skeleton cards:

```tsx
{loading ? (
  <div style={{ padding: "20px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
    {[1, 2, 3].map((i) => (
      <Skeleton key={i} variant="rect" height={52} />
    ))}
  </div>
) : (
```

**Step 3: DishDetail.tsx — nutrition skeleton**

Replace the `"Loading…"` text (line ~96) with a centered skeleton layout:

```tsx
if (!dish) {
  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "var(--se-space-8)" }}>
      <Skeleton variant="rect" height={32} width="60%" />
      <div style={{ marginTop: 16 }}><Skeleton variant="text" lines={2} /></div>
      <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} variant="rect" height={80} />)}
      </div>
    </div>
  );
}
```

**Step 4: Profile.tsx — profile + report skeletons**

Replace `"Loading profile…"` (line ~229) with skeleton card:
```tsx
<Card padding="md">
  <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
    <Skeleton variant="circle" width={64} />
    <div style={{ flex: 1 }}>
      <Skeleton variant="rect" height={24} width="50%" />
      <div style={{ marginTop: 8 }}><Skeleton variant="text" lines={2} /></div>
    </div>
  </div>
</Card>
```

Replace `"Loading meal history…"` (line ~380) with:
```tsx
<div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
  <Skeleton variant="rect" height={120} />
  <Skeleton variant="rect" height={200} />
</div>
```

**Step 5: Verify all pages**

Throttle network in DevTools (slow 3G). Navigate to each page and verify skeleton loaders appear instead of plain text.

**Step 6: Commit**

```bash
git add frontend/src/pages/Home.tsx frontend/src/pages/Menu.tsx frontend/src/pages/DishDetail.tsx frontend/src/pages/Profile.tsx
git commit -m "feat: add skeleton loaders to Home, Menu, DishDetail, and Profile pages"
```

---

### Task 12: Add "Add to Meal" CTA on DishDetail

**Files:**
- Modify: `frontend/src/pages/DishDetail.tsx`

**Step 1: Add CTA button below nutrition info**

After the nutrition section, add:

```tsx
import { useToast } from "../components/Toast";
import Button from "../components/Button";

// Inside component:
const token = localStorage.getItem("authToken");
const toast = useToast();
const [adding, setAdding] = useState(false);

async function handleAddToMeal() {
  if (!token) {
    navigate("/login");
    return;
  }
  setAdding(true);
  try {
    await axios.post(
      `${API_BASE}/meals/`,
      { dish_ids: [dish.id] },
      { headers: { Authorization: `Token ${token}` } }
    );
    toast.success(`${dish.dish_name} added to today's meal!`);
  } catch {
    toast.error("Failed to add dish to meal. Please try again.");
  } finally {
    setAdding(false);
  }
}

// In JSX, after the nutrition cards:
<div style={{ marginTop: "var(--se-space-6)", textAlign: "center" }}>
  {token ? (
    <Button variant="primary" size="lg" loading={adding} onClick={handleAddToMeal}>
      Add to Today's Meal
    </Button>
  ) : (
    <Button variant="secondary" size="lg" onClick={() => navigate("/login")}>
      Sign in to track meals
    </Button>
  )}
</div>
```

**Step 2: Verify the flow**

- Logged out: button says "Sign in to track meals", clicking navigates to `/login`
- Logged in: button says "Add to Today's Meal", clicking shows toast on success/error

**Step 3: Commit**

```bash
git add frontend/src/pages/DishDetail.tsx
git commit -m "feat: add 'Add to Meal' CTA on DishDetail page"
```

---

### Task 13: Add Error Recovery Component

**Files:**
- Modify: `frontend/src/pages/Home.tsx`
- Modify: `frontend/src/pages/Menu.tsx`
- Modify: `frontend/src/pages/Profile.tsx`

**Step 1: Create inline error+retry pattern**

Rather than a separate component, use a consistent inline pattern across pages. When a fetch fails, show:

```tsx
<Card padding="md">
  <div style={{ textAlign: "center", padding: "var(--se-space-6)" }}>
    <p style={{ color: "var(--se-error)", fontWeight: 600, fontSize: "var(--se-text-base)" }}>
      Something went wrong
    </p>
    <p style={{ color: "var(--se-text-muted)", fontSize: "var(--se-text-sm)", marginTop: 4 }}>
      {errorMessage}
    </p>
    <div style={{ marginTop: "var(--se-space-4)" }}>
      <Button variant="secondary" size="sm" onClick={retryFunction}>
        Try Again
      </Button>
    </div>
  </div>
</Card>
```

**Step 2: Apply to Home.tsx**

In the stats fetch, add an `error` state. If stats fetch fails, show the retry card instead of silently swallowing the error.

**Step 3: Apply to Menu.tsx**

If hall list fetch fails, show retry card in the sidebar.

**Step 4: Apply to Profile.tsx**

If profile or report fetch fails, show retry card in place of the respective loading sections.

**Step 5: Verify**

Temporarily break the API URL to trigger errors. Verify retry cards appear with working "Try Again" buttons.

**Step 6: Commit**

```bash
git add frontend/src/pages/Home.tsx frontend/src/pages/Menu.tsx frontend/src/pages/Profile.tsx
git commit -m "feat: add error recovery with retry buttons on Home, Menu, and Profile"
```

---

### Task 14: Mobile Table Scroll + Chart Responsiveness on Profile

**Files:**
- Modify: `frontend/src/pages/Profile.tsx`

**Step 1: Wrap tables in scroll containers**

Find the two `<table>` elements (macronutrient table ~line 490 and meals-by-category table ~line 557). Wrap each in:

```tsx
<div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
  <table style={{ minWidth: 400, /* ...existing styles */ }}>
    {/* existing table content */}
  </table>
</div>
```

**Step 2: Constrain chart containers**

For the Vega-Lite chart containers and the base64 chart image, ensure:
- Chart divs: `style={{ maxWidth: "100%", overflow: "hidden" }}`
- Base64 image: `style={{ width: "100%", maxWidth: 600, height: "auto" }}`

**Step 3: Verify on mobile**

Use DevTools responsive mode (375px width). Verify tables scroll horizontally and charts don't overflow.

**Step 4: Commit**

```bash
git add frontend/src/pages/Profile.tsx
git commit -m "fix: add mobile scroll wrappers for tables and constrain chart sizing"
```

---

## Execution Order & Dependencies

```
Task 1 (Skeleton)  ──┐
Task 2 (Toast)     ──┤── Infrastructure (no dependencies between them)
Task 3 (FlagColors)──┘
                      │
Task 4 (Login)     ──┐
Task 5 (Register)  ──┤
Task 6 (AddDish)   ──┤── Design System Fixes (depend on Task 2 for toast)
Task 7 (NotFound)  ──┤
Task 8 (AIMeals)   ──┘
                      │
Task 9 (Transitions)──── Animation (independent)
Task 10 (Micro-int) ──── Animation (independent)
                      │
Task 11 (Skeletons)──── Apply infrastructure (depends on Task 1)
Task 12 (AddToMeal)──── User flow (depends on Task 2 for toast)
Task 13 (ErrorRecov)─── User flow (depends on Task 2 for toast)
Task 14 (MobileScrl)─── Polish (independent)
```

**Parallelizable groups:**
- Tasks 1, 2, 3 can run in parallel
- Tasks 4–8 can run in parallel (all depend on Task 2)
- Tasks 9, 10 can run in parallel
- Tasks 11–14 can run in parallel (11 depends on Task 1, 12–13 depend on Task 2)

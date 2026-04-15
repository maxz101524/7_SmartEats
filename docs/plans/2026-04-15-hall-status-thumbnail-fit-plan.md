# Dining Hall Status + Thumbnail Fit Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the hardcoded “LIVE” badge with accurate Open/Closed + meal period status, and make dining hall thumbnails feel edge-to-edge on the hall selection grid.

**Architecture:** Add a small Django endpoint that fetches and parses UIUC Housing’s Dining Menus hours table, computing per-hall open state + current meal + close time. Update the Menu hall selection UI to fetch that endpoint once on load and render a new status pill; tweak thumbnail rendering by applying a small baseline crop.

**Tech Stack:** Django 5.1 + DRF (existing), Python stdlib + `requests` (already used), React 19 + TypeScript + Vite, existing `--se-*` design tokens.

---

### Task 1: Backend — add hall status fetch/parse service

**Files:**
- Create: `backend/mealPlanning/services/uiuc_hours.py`
- Test: `backend/mealPlanning/tests.py` (add focused unit tests)

**Step 1: Write failing tests**

Add unit tests for:
- parsing a representative HTML snippet containing the hours table rows
- computing open/closed given a fixed “now” in America/Chicago

**Step 2: Run tests to verify failure**

Run:

```bash
cd backend
SECRET_KEY=dev python manage.py test mealPlanning --settings=SmartEats_config.settings.development -v 1
```

Expected: FAIL because `uiuc_hours` module and parsing functions don’t exist yet.

**Step 3: Write minimal implementation**

Implement:
- `fetch_hours_html()`
- `parse_hours_rows(html) -> list[dict]`
- `compute_status(rows, now_dt, option_ids) -> dict`

**Step 4: Run tests to verify pass**

Re-run the same command.

Expected: PASS for the new tests (note: repo has an existing Gemini test that may fail when `GEMINI_API_KEY` isn’t set).

---

### Task 2: Backend — expose `GET /api/hall-status/`

**Files:**
- Modify: `backend/mealPlanning/views.py`
- Modify: `backend/mealPlanning/urls.py`
- Test: `backend/mealPlanning/tests.py`

**Step 1: Write failing test**

Add a test that:
- mocks the HTTP fetch to return a fixture hours HTML
- calls the view
- asserts the returned JSON includes keys for known dining option IDs and correct shape

**Step 2: Run test to verify failure**

Run the backend test command.

Expected: FAIL because route/view doesn’t exist.

**Step 3: Implement view + route**

Add `hall_status_view`:
- fetch + parse hours table
- compute status for the `DINING_OPTIONS` IDs you already use for menus
- return `JsonResponse` map keyed by `DiningOptionID`

**Step 4: Re-run tests**

Expected: New tests pass.

---

### Task 3: Frontend — fetch hall status once and render badge

**Files:**
- Modify: `frontend/src/pages/Menu.tsx`

**Step 1: Add types + state**

Add:
- `HallStatusMap` type
- `hallStatus` state in `Menu`

**Step 2: Fetch on page load**

On mount, call `GET ${API_BASE}/hall-status/` and store the result.

**Step 3: Update `HallSelectionCard`**

Replace “Live” pill with:
- open: `Open · ${meal} until ${time}`
- closed: `Closed`
- unknown: `Hours unavailable` (or omit)

**Step 4: Verify build**

Run:

```bash
cd frontend
npm run build
```

Expected: Build succeeds.

---

### Task 4: Frontend — make thumbnails feel edge-to-edge

**Files:**
- Modify: `frontend/src/pages/Menu.tsx`

**Step 1: Update image styles**

Apply baseline crop:
- `transform: scale(1.06)` when not hovered
- `transform: scale(1.095)` when hovered

**Step 2: Visual spot-check**

Run dev server and confirm thumbnail gutters are no longer visible.

---

### Task 5: Verification

**Step 1: Backend quick smoke**

Run dev server and hit:
- `GET /api/hall-status/` → returns JSON map.

**Step 2: UI smoke**

Load `/menu` and confirm:
- cards show Open/Closed + meal period
- “until …” time looks correct
- thumbnails look seamless


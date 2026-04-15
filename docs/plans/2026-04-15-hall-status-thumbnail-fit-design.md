# Dining Hall Status + Thumbnail Fit — Design

**Goal:** Make the hall selection grid feel seamless (no “hard-coded” image gutters) and replace the hardcoded “LIVE” badge with a real, accurate dining hall status indicator (Open/Closed + current meal + end time).

## UI/UX

### Hall card thumbnail fit
- **Problem:** Several thumbnail assets include embedded “side gutters” in the image itself, which reads as the UI adding hard-coded padding.
- **Solution:** Keep the card’s image container edge-to-edge, but apply a small baseline crop via CSS transform so the composition fills the card.
  - `object-fit: cover`, `object-position: center`
  - Baseline `transform: scale(1.06)` with hover nudging to ~`scale(1.095)` to preserve the existing hover “zoom” feel.

### Status badge (replaces “LIVE”)
- **Badge content (per approval):**
  - When open: `Open · <Meal> until <time>`
  - When closed: `Closed`
- **Badge styling:**
  - Pill with subtle backdrop + shadow for legibility over photos
  - Dot color communicates state (green = open, neutral = closed)
  - Refresh policy: **on page load only** (no polling)

## Data & Accuracy

### Source of truth
- Use University Housing’s published “Dining Menus” hours table at `https://web.housing.illinois.edu/diningmenus`.
- Parse the hours rows (DiningOptionID, Date, Time Period, Start, End) and compute:
  - whether each supported dining option is open **right now**
  - which meal period is active
  - the period end time (for “until …”)

### Backend API
- Add `GET /api/hall-status/` that returns a map keyed by `DiningOptionID`:

```json
{
  "1": { "is_open": true, "meal_label": "Lunch", "closes_at": "1:30 PM" },
  "2": { "is_open": false, "meal_label": null, "closes_at": null }
}
```

### Timezone behavior
- Interpret “Start/End” times as **local to UIUC (America/Chicago)**.
- Compute “now” in the same timezone so open/closed is correct even when the server is not in Central time.

## Failure modes
- If the hours page cannot be fetched/parsed:
  - backend returns `{}` with a 200 status (UI can fall back to a neutral badge or hide it)
  - frontend will display `Closed` only when status is known; otherwise show a neutral “Hours unavailable” state (or omit badge text).

## Out of scope
- Polling / real-time updates (explicitly not requested)
- Adding dependencies (HTML parsing will use standard library / existing deps)


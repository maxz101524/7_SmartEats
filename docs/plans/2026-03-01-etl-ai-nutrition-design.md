# ETL Pipeline + AI Nutrition Enrichment — Design

**Date:** 2026-03-01
**Branch:** `etl-ai-nutrition` (off `main`)
**Scope:** Backend only — no frontend changes

---

## Overview

Daily pipeline that fetches the UIUC dining menu, populates `DiningHall` + `Dish` models, and enriches each dish with accurate nutrition data (Wger first, Gemini AI as fallback).

## Architecture: Single Command (Approach A)

One Django management command `scrape_menu` handles the full pipeline:
1. Fetch today's menu from UIUC Dining API for all 3 halls
2. `get_or_create` each DiningHall and Dish
3. For dishes missing nutrition: Wger lookup → Gemini fallback
4. Save results

Scheduled via Render Cron Job at 6 AM daily.

---

## 1. Model Migration — New Dish Fields

| Field | Type | Default | Purpose |
|---|---|---|---|
| `fiber` | `DecimalField(5,2)` | `null` | Grams of fiber |
| `sodium` | `DecimalField(7,2)` | `null` | Milligrams of sodium |
| `allergens` | `JSONField` | `[]` | Allergen strings from UIUC Traits |
| `dietary_flags` | `JSONField` | `[]` | e.g. `["Vegetarian", "Vegan"]` |
| `nutrition_source` | `CharField(20)` | `""` | `"wger"` or `"ai_generated"` |
| `ai_confidence` | `CharField(10)` | `""` | `"high"`, `"medium"`, `"low"` |
| `meal_period` | `CharField(50)` | `""` | `"Continental Breakfast"`, `"Lunch"`, `"Dinner"` |
| `course` | `CharField(100)` | `""` | e.g. `"Entrees"`, `"Breads"` |
| `serving_unit` | `CharField(100)` | `""` | Station name (e.g. `"Baked Expectations"`) |
| `uiuc_item_id` | `IntegerField` | `null` | UIUC API ItemID for tracking |
| `last_seen` | `DateField` | `null` | Last date dish appeared on menu |

All new fields are `null=True, blank=True` to preserve existing data.

---

## 2. UIUC Dining API

- **Endpoint:** `POST https://web.housing.illinois.edu/DiningMenus/api/DiningMenu/GetOption/`
- **Payload:** `{"DiningOptionID": "<id>", "mealDate": "YYYY-MM-DD"}`
- **Option IDs:** Ikenberry=1, PAR=2, ISR=3 (verified 2026-03-01)
- **Response per item:** `FormalName`, `Category`, `Course`, `Meal`, `Traits`, `ServingUnit`, `ItemID`, `EventDate`
- **Volume:** ~200 items/day across all 3 halls

### Trait Parsing

Traits string (e.g. `"Corn,Eggs,Gluten,Milk,Soy,Vegetarian,Wheat,"`) is split into:
- **Allergens:** `{Corn, Eggs, Fish, Gluten, Milk, Peanuts, Sesame, Shellfish, Soy, Tree Nuts, Wheat, Coconut}`
- **Dietary flags:** `{Vegan, Vegetarian, Halal, Jain}`

---

## 3. ETL Flow

```
scrape_menu [--date YYYY-MM-DD]  (defaults to today)
  │
  ├── For each hall (1=Ikenberry, 2=PAR, 3=ISR):
  │     ├── POST to UIUC API
  │     ├── get_or_create DiningHall by name
  │     └── For each menu item:
  │           ├── Parse FormalName, Category, Course, Meal, Traits, ServingUnit, ItemID
  │           ├── Split Traits → allergens[] + dietary_flags[]
  │           ├── get_or_create Dish by (dish_name, dining_hall)
  │           ├── Update metadata fields + last_seen
  │           └── If no nutrition (calories==0, nutrition_source=="") → queue
  │
  ├── Nutrition enrichment for queued dishes:
  │     ├── Wger lookup (name similarity ≥ 0.6) → source="wger"
  │     └── Gemini fallback with full context → source="ai_generated"
  │
  └── Summary log: halls, dishes created/updated, nutrition enriched
```

### Idempotency
- `unique_together = ("dish_name", "dining_hall")` handles re-runs
- Nutrition enrichment only targets dishes where `nutrition_source == ""`
- `last_seen` is always updated

---

## 4. Wger Matching Strategy

1. Query `https://wger.de/api/v2/ingredient/?name=<dish_name>&language=2&limit=5`
2. Score each result with `difflib.SequenceMatcher` (case-insensitive)
3. Accept top result if similarity ≥ 0.6
4. Store: calories, protein, carbs, fat, fiber, sodium, source="wger"
5. If no match → AI fallback

Wger data is per 100g. Stored as-is since UIUC doesn't provide gram-based serving sizes.

---

## 5. Gemini AI Fallback

**Client:** `backend/mealPlanning/services/gemini_client.py`
**Model:** `gemini-1.5-flash` via `google-generativeai` SDK
**API Key:** `GEMINI_API_KEY` in backend `.env`

### Prompt Context
- Dish name, category, meal period
- Dietary flags and allergens from UIUC
- Serving unit (station name)

### Structured Output Schema
```json
{
  "calories": int,
  "protein": number,
  "carbohydrates": number,
  "fat": number,
  "fiber": number,
  "sodium": number,
  "confidence": "high" | "medium" | "low"
}
```

Enforced via `response_mime_type="application/json"` + `response_schema`.
Temperature = 0 for consistency. Rate limited at 0.5s between calls.

---

## 6. File Layout

```
backend/mealPlanning/
├── management/
│   └── commands/
│       └── scrape_menu.py        # Management command
├── services/
│   ├── uiuc_dining.py            # UIUC API client
│   ├── wger_client.py            # Wger nutrition lookup + matching
│   └── gemini_client.py          # Gemini AI wrapper
├── models.py                     # + new Dish fields
└── migrations/
    └── 000X_add_nutrition_fields.py
```

### New Dependency
- `google-generativeai` added to `requirements.txt`

---

## 7. Scheduling (Render)

Render Cron Job runs daily at 6 AM CT:
```
python manage.py scrape_menu --settings=SmartEats_config.settings.production
```

---

## 8. Error Handling

- UIUC API timeout (5s) → skip hall, log warning, continue
- Wger API timeout (5s) → fall through to Gemini
- Gemini failure → log error, leave dish with no nutrition (will retry next run)
- Invalid JSON from Gemini → log, skip dish
- All errors are non-fatal: the command always completes and reports what it did

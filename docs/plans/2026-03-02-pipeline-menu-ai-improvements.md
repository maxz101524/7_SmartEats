# Pipeline + Menu + AI Chat Improvements — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the nutrition pipeline to be Gemini-only with a better prompt, reorganize the menu page by station with smart filters, improve dish display, add serving size info, and wire up the AI chat to actually use Gemini.

**Branch:** `pipeline-menu-ai-v2` off `main`

---

## Task 0: Create Branch

```bash
git checkout main && git pull
git checkout -b pipeline-menu-ai-v2 main
```

---

## Task 1: Remove Wger, Make Gemini the Sole Enrichment Source

**Priority: HIGHEST — this is the core data quality fix.**

### Files:
- Modify: `backend/mealPlanning/services/gemini_client.py`
- Modify: `backend/mealPlanning/management/commands/scrape_menu.py`
- Modify: `backend/mealPlanning/models.py` (add `serving_size` field)
- Modify: `backend/mealPlanning/tests.py`
- Auto-generate: new migration

### Step 1: Add `serving_size` field to Dish model

In `backend/mealPlanning/models.py`, add after the `sodium` field:

```python
serving_size = models.CharField(
    max_length=100, default="", blank=True,
    help_text='e.g. "1 piece (~170g)", "1 cup", "1 bowl (~300g)"'
)
```

Generate and apply migration.

### Step 2: Rewrite the Gemini prompt

Replace `gemini_client.py` with an improved version. Key changes:
- **Remove rate limit of 0.5s** — increase to **7 seconds** (safe under 10 RPM free tier)
- **Much richer prompt** with dining hall context, explicit serving size estimation
- **Add `serving_size` to the response schema**
- **Add `sugar` to response** (useful macro, Gemini can estimate it)

New prompt template:

```
You are a university dining hall nutrition expert. Estimate the nutritional content for ONE STANDARD SERVING of this dish as it would be served at a UIUC (University of Illinois) dining hall.

DISH INFORMATION:
- Name: {dish_name}
- Dining hall category: {category}
- Meal period: {meal_period} (e.g. Breakfast, Lunch, Dinner)
- Station/serving area: {serving_unit}
- Known allergens: {allergens}
- Dietary classifications: {dietary_flags}

INSTRUCTIONS:
1. Consider this is a UNIVERSITY DINING HALL serving — portions are typically generous (not restaurant-style plating).
2. "Standard serving" means what a student would put on their plate in one trip — e.g. one piece of chicken, one bowl of soup, one scoop of rice, one cookie.
3. Estimate the serving size in a human-readable format (e.g. "1 piece (~170g)", "1 cup (~240ml)", "1 bowl (~350g)").
4. Base your estimates on the dish name, its station context, and typical university dining preparations.
5. For sodium, use milligrams (mg). For all other macros, use grams (g). Calories as integer.
6. Rate your confidence: "high" for common well-known items, "medium" for reasonable estimates, "low" for unusual or ambiguous items.

Return a JSON object with these exact keys:
- calories (integer)
- protein (number, grams)
- carbohydrates (number, grams)
- fat (number, grams)
- fiber (number, grams)
- sodium (number, milligrams)
- sugar (number, grams)
- serving_size (string, human-readable)
- confidence (string: "high", "medium", or "low")
```

### Step 3: Update `estimate_nutrition()` return to include `serving_size` and `sugar`

Add `serving_size` and `sugar` to the required keys validation.

### Step 4: Rewrite `scrape_menu.py` to remove Wger entirely

- Remove `from mealPlanning.services import wger_client`
- Remove the Wger lookup step
- All nutrition goes through Gemini directly
- Add a `--force` flag to re-enrich dishes that already have nutrition (for re-processing Wger data)
- Update stats dict to remove `wger` counter, add `skipped` and `force_enriched` counters

New enrichment logic:
```python
for dish in dishes_to_enrich:
    ai_data = gemini_client.estimate_nutrition(
        dish_name=dish.dish_name,
        category=dish.category,
        meal_period=dish.meal_period,
        allergens=dish.allergens,
        dietary_flags=dish.dietary_flags,
        serving_unit=dish.serving_unit,
    )
    if ai_data:
        dish.calories = ai_data["calories"]
        dish.protein = round(ai_data["protein"])
        dish.carbohydrates = round(ai_data["carbohydrates"])
        dish.fat = round(ai_data["fat"])
        dish.fiber = ai_data["fiber"]
        dish.sodium = ai_data["sodium"]
        dish.serving_size = ai_data.get("serving_size", "")
        dish.nutrition_source = "ai_generated"
        dish.ai_confidence = ai_data.get("confidence", "")
        dish.save()
        stats["ai"] += 1
```

When `--force` is passed:
```python
needs_nutrition = (dish.nutrition_source == "") if not force else True
```

### Step 5: Update tests

- Remove `WgerClientTest` entirely (or keep wger_client.py for the existing `/api/nutrition-lookup/` endpoint but remove from pipeline)
- Update `ScrapeMenuCommandTest` to remove Wger mocks, only mock Gemini
- Add test for `--force` flag behavior
- Update Gemini mock response to include `serving_size` and `sugar`

### Step 6: Commit

```bash
git add -A
git commit -m "feat: switch to Gemini-only pipeline with improved prompt and serving size"
```

---

## Task 2: Update Dish API to Return New Fields

### Files:
- Modify: `backend/mealPlanning/views.py` (dish_list_view, dish_detail_view, dining_hall_view)

### Step 1: Update `dining_hall_view` to include new fields in dish serialization

Currently returns only: `dish_id, dish_name, calories, protein, carbohydrates, fat`

Add: `fiber, sodium, allergens, dietary_flags, nutrition_source, ai_confidence, meal_period, course, serving_unit, serving_size`

### Step 2: Update `dish_list_view` to include new fields

Currently returns: `dish_id, dish_name, calories, category, dining_hall__name, detail_url`

Add: `protein, carbohydrates, fat, fiber, sodium, allergens, dietary_flags, serving_unit, serving_size, course, meal_period`

### Step 3: Update `dish_detail_view`

This uses `model_to_dict()` which should already include new fields, but verify it returns `allergens`, `dietary_flags`, `serving_size`, etc.

### Step 4: Commit

```bash
git commit -m "feat: expose new nutrition and metadata fields in dish API endpoints"
```

---

## Task 3: Reorganize Menu Page — Station-Based Hierarchy + Smart Filters

**This is the big frontend change.**

### Files:
- Modify: `frontend/src/pages/Menu.tsx`
- Modify: `frontend/src/components/FoodListItem.tsx`

### Step 1: Update TypeScript interfaces

```typescript
interface Dish {
  dish_id: number;
  dish_name: string;
  calories: number;
  protein: number;
  carbohydrates: number;
  fat: number;
  fiber?: number;
  sodium?: number;
  category?: string;
  allergens?: string[];
  dietary_flags?: string[];
  serving_unit?: string;
  serving_size?: string;
  course?: string;
  meal_period?: string;
  nutrition_source?: string;
  ai_confidence?: string;
}
```

### Step 2: Group dishes by `serving_unit` (station)

Instead of a flat list, group dishes by station:

```typescript
const stationGroups = useMemo(() => {
  const groups: Record<string, Dish[]> = {};
  for (const dish of filteredDishes) {
    const station = dish.serving_unit || "Other";
    (groups[station] ??= []).push(dish);
  }
  return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
}, [filteredDishes]);
```

Render as:
```
ABBONDANTE GRILL          ← station header
  Dill Pickle Slices
  Sliced Tomatoes
  ...

BAKED EXPECTATIONS        ← station header
  Chocolate Chip Muffin
  Cinnamon Chip Muffin
  ...
```

### Step 3: Replace free-text search with smart filter system

Add a filter panel (inspired by the old design screenshots) with:

1. **Search bar** (keep, but above filters)
2. **Meal period tabs**: Breakfast | Lunch | Dinner (from `meal_period` field)
3. **Dietary preference chips** (toggle): Vegetarian, Vegan, Halal, Gluten-Free
   - Filter: dish must have matching flag in `dietary_flags`
   - "Gluten-Free" = dish does NOT have "Gluten" in `allergens`
4. **Allergen exclusion chips** (toggle): Gluten, Milk, Eggs, Soy, Nuts, Shellfish, Fish
   - Filter: dish must NOT have selected allergen in `allergens`
5. **Macro sliders** (optional, if time permits):
   - Max Calories slider
   - Min Protein slider

Use the existing `FilterChip` component for dietary/allergen chips.

### Step 4: Improve dish display in the list

Update `FoodListItem` to show more info at a glance:

Current: `[icon] Dish Name / Category · Hall / [cal] [protein]`

New: `[icon] Dish Name / Station · Serving Size / [cal] [protein] [carbs] [fat] / [dietary flags as tiny colored pills]`

Add props to `FoodListItem`:
- `carbohydrates?: number`
- `fat?: number`
- `servingSize?: string`
- `servingUnit?: string` (station name, replaces hallName in subtitle)
- `dietaryFlags?: string[]`
- `allergens?: string[]`

Show 4 macro badges instead of 2: `[cal] [protein] [carbs] [fat]`

Show dietary flags as small colored pills below macros (Vegetarian=green, Vegan=green, Halal=blue).

Show serving size in the subtitle line: `Station · 1 piece (~170g)`

### Step 5: Commit

```bash
git commit -m "feat: reorganize menu by station with smart filters and richer dish display"
```

---

## Task 4: Update Dish Detail Page

### Files:
- Modify: `frontend/src/pages/DishDetail.tsx`

### Step 1: Redesign to use design tokens (currently uses raw Tailwind)

Replace the current page with a clean redesign using `--se-*` tokens. Display:

- **Dish name** (title)
- **Station** + **Dining Hall** (subtitle)
- **Serving size** (e.g. "1 piece (~170g)")
- **Macro breakdown** — 4 circular/card style: Cal, Protein, Carbs, Fat (similar to old design's circular indicators)
- **Extended nutrition**: Fiber, Sodium, Sugar (if available)
- **Dietary flags** as colored pills
- **Allergen warnings** as outlined pills
- **Nutrition source badge**: "AI Estimated" with confidence level, or "Database" for Wger
- **Pie chart** (keep existing `/api/dish-summary-img/{id}/` or consider switching to inline Vega-Lite)
- **"Go Back" button** linking to menu

### Step 2: Commit

```bash
git commit -m "feat: redesign dish detail page with full nutrition, serving size, and allergens"
```

---

## Task 5: Wire Up AI Chat to Use Gemini

**The current `/api/aimeals/` endpoint just searches pre-stored TempMeal records. It's not an AI chat.**

### Files:
- Modify: `backend/mealPlanning/views.py` (AIMealView)
- Modify: `backend/mealPlanning/urls.py` (add new endpoint)
- Create: `backend/mealPlanning/services/ai_chat.py`

### Step 1: Create a new AI chat service

Create `backend/mealPlanning/services/ai_chat.py`:

- Uses the same `google.genai` Client as `gemini_client.py`
- Accepts a user message string
- Builds a system prompt that includes context about available dining halls and today's menu
- Queries all current dishes from DB to provide as context
- Returns a structured response with text + optional dish recommendations

Prompt structure:
```
You are SmartEats AI, a nutrition assistant for UIUC dining halls.

AVAILABLE DINING HALLS:
{hall_list}

TODAY'S MENU ({date}):
{dish_list_with_nutrition}

The student asks: "{user_message}"

Respond helpfully about dining options, nutrition, or meal planning.
If recommending dishes, include their nutrition info.
Keep responses concise and friendly.
Return JSON with:
- "response": string (your text response)
- "recommended_dishes": [{"dish_id": int, "dish_name": str, "reason": str}] (optional, max 5)
```

### Step 2: Create a new endpoint `POST /api/ai-chat/`

- Accepts `{"message": "user's question"}`
- Calls `ai_chat.get_response(message)`
- Returns `{"response": "...", "recommended_dishes": [...]}`
- Rate limited: max 10 requests per minute per IP (or per user if authenticated)

### Step 3: Update frontend `AIMeals.tsx`

- Change API call from `POST /api/aimeals/` to `POST /api/ai-chat/`
- Display AI text response as a regular message bubble
- If `recommended_dishes` are returned, show them as clickable cards linking to `/dishes/:id`

### Step 4: Keep the old `/api/aimeals/` endpoint working (don't break it)

### Step 5: Commit

```bash
git commit -m "feat: add Gemini-powered AI chat endpoint and wire up frontend"
```

---

## Task 6: Run Full Test Suite + Update Tests

### Step 1: Run all tests

```bash
python manage.py test mealPlanning --settings=SmartEats_config.settings.development -v 2
```

### Step 2: Fix any failures

### Step 3: Final commit

```bash
git commit -m "chore: update tests and finalize pipeline + menu + AI chat improvements"
```

---

## Task 7: Re-enrich All Dishes with Gemini

**This is a deployment step, not a code step.**

After merging, run on Render via One-Off Job:

```bash
python manage.py scrape_menu --force --settings=SmartEats_config.settings.production
```

The `--force` flag will re-process ALL dishes through Gemini, including ones previously enriched by Wger, giving them accurate serving sizes and consistent AI-generated nutrition.

**Note:** ~250 dishes at 7s rate limit = ~30 minutes. Use Render One-Off Job (not shell).

---

## Summary of Commits

1. `feat: switch to Gemini-only pipeline with improved prompt and serving size`
2. `feat: expose new nutrition and metadata fields in dish API endpoints`
3. `feat: reorganize menu by station with smart filters and richer dish display`
4. `feat: redesign dish detail page with full nutrition, serving size, and allergens`
5. `feat: add Gemini-powered AI chat endpoint and wire up frontend`
6. `chore: update tests and finalize pipeline + menu + AI chat improvements`

---

## Key Design Decisions

1. **Gemini-only (no Wger):** Wger is a generic ingredient DB that poorly matches dining hall recipes. Gemini with rich context produces more accurate, tailored results.
2. **7-second rate limit:** Keeps us safely under the 10 RPM free tier. 250 dishes = ~30 min, acceptable for a background job.
3. **Station-based grouping:** Matches how dining halls are physically organized. Students navigate by station, not alphabetical dish lists.
4. **Smart filters over free-text:** Dietary preferences and allergen exclusion are the primary filtering needs for dining hall users. Free-text search is kept as secondary.
5. **AI chat using Gemini:** The current TempMeal search is not useful. A real AI chat with menu context provides actual value.

# ETL Pipeline + AI Nutrition — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Daily pipeline that fetches the UIUC dining menu and enriches dishes with Wger/Gemini nutrition data.

**Architecture:** Single Django management command (`scrape_menu`) fetches all 3 dining halls from the UIUC API, upserts DiningHall + Dish records, then enriches nutrition via Wger (primary) with Gemini AI fallback. Services are isolated in `mealPlanning/services/`.

**Tech Stack:** Django 5.1.6, `requests` (HTTP), `google-generativeai` (Gemini), `difflib` (fuzzy matching), Django `JSONField`

**Design doc:** `docs/plans/2026-03-01-etl-ai-nutrition-design.md`

---

## Task 0: Create Branch

**Step 1: Create and switch to feature branch**

```bash
cd backend
git checkout -b etl-ai-nutrition main
```

---

## Task 1: Dish Model Migration

**Files:**
- Modify: `backend/mealPlanning/models.py` (Dish class, lines 31-61)
- Create: auto-generated migration

**Step 1: Write failing test**

Create `backend/mealPlanning/tests.py`:

```python
from django.test import TestCase
from mealPlanning.models import DiningHall, Dish


class DishModelFieldsTest(TestCase):
    def setUp(self):
        self.hall = DiningHall.objects.create(name="Test Hall", location="Test Location")

    def test_new_nutrition_fields_exist(self):
        dish = Dish.objects.create(
            dish_name="Test Dish",
            category="Entree",
            dining_hall=self.hall,
            fiber=2.5,
            sodium=150.0,
            allergens=["Gluten", "Milk"],
            dietary_flags=["Vegetarian"],
            nutrition_source="wger",
            ai_confidence="",
            meal_period="Lunch",
            course="Entrees",
            serving_unit="Grill Station",
            uiuc_item_id=12345,
        )
        dish.refresh_from_db()
        self.assertEqual(dish.fiber, 2.5)
        self.assertEqual(dish.sodium, 150.0)
        self.assertEqual(dish.allergens, ["Gluten", "Milk"])
        self.assertEqual(dish.dietary_flags, ["Vegetarian"])
        self.assertEqual(dish.nutrition_source, "wger")
        self.assertEqual(dish.meal_period, "Lunch")
        self.assertEqual(dish.course, "Entrees")
        self.assertEqual(dish.serving_unit, "Grill Station")
        self.assertEqual(dish.uiuc_item_id, 12345)

    def test_new_fields_default_to_null_or_empty(self):
        dish = Dish.objects.create(
            dish_name="Minimal Dish",
            category="Side",
            dining_hall=self.hall,
        )
        dish.refresh_from_db()
        self.assertIsNone(dish.fiber)
        self.assertIsNone(dish.sodium)
        self.assertEqual(dish.allergens, [])
        self.assertEqual(dish.dietary_flags, [])
        self.assertEqual(dish.nutrition_source, "")
        self.assertEqual(dish.ai_confidence, "")
        self.assertIsNone(dish.uiuc_item_id)
        self.assertIsNone(dish.last_seen)
```

**Step 2: Run test to verify it fails**

```bash
cd backend
python manage.py test mealPlanning.tests.DishModelFieldsTest --settings=SmartEats_config.settings.development -v 2
```

Expected: FAIL — fields don't exist yet.

**Step 3: Add new fields to Dish model**

In `backend/mealPlanning/models.py`, add these fields to the `Dish` class after the `fat` field (line 43):

```python
    fiber = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True,
        help_text="Grams of fiber per serving"
    )
    sodium = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True,
        help_text="Milligrams of sodium per serving"
    )
    allergens = models.JSONField(
        default=list, blank=True,
        help_text='e.g. ["Gluten", "Milk", "Soy"]'
    )
    dietary_flags = models.JSONField(
        default=list, blank=True,
        help_text='e.g. ["Vegetarian", "Vegan"]'
    )
    nutrition_source = models.CharField(
        max_length=20, default="", blank=True,
        help_text='"wger", "ai_generated", or "" (unknown)'
    )
    ai_confidence = models.CharField(
        max_length=10, default="", blank=True,
        help_text='"high", "medium", "low", or ""'
    )
    meal_period = models.CharField(
        max_length=50, default="", blank=True,
        help_text='e.g. "Continental Breakfast", "Lunch", "Dinner"'
    )
    course = models.CharField(
        max_length=100, default="", blank=True,
        help_text='e.g. "Entrees", "Breads"'
    )
    serving_unit = models.CharField(
        max_length=100, default="", blank=True,
        help_text='Station name, e.g. "Baked Expectations"'
    )
    uiuc_item_id = models.IntegerField(
        null=True, blank=True,
        help_text="ItemID from UIUC Dining API"
    )
    last_seen = models.DateField(
        null=True, blank=True,
        help_text="Last date this dish appeared on the menu"
    )
```

**Step 4: Generate and apply migration**

```bash
python manage.py makemigrations mealPlanning --settings=SmartEats_config.settings.development
python manage.py migrate --settings=SmartEats_config.settings.development
```

**Step 5: Run tests to verify they pass**

```bash
python manage.py test mealPlanning.tests.DishModelFieldsTest --settings=SmartEats_config.settings.development -v 2
```

Expected: 2 tests PASS.

**Step 6: Commit**

```bash
git add mealPlanning/models.py mealPlanning/migrations/ mealPlanning/tests.py
git commit -m "feat: add nutrition, allergen, and metadata fields to Dish model"
```

---

## Task 2: UIUC Dining API Client

**Files:**
- Create: `backend/mealPlanning/services/__init__.py` (empty)
- Create: `backend/mealPlanning/services/uiuc_dining.py`

**Step 1: Write failing test**

Append to `backend/mealPlanning/tests.py`:

```python
from unittest.mock import patch, MagicMock
from mealPlanning.services.uiuc_dining import fetch_menu, parse_traits, ALLERGEN_SET, DIET_FLAG_SET


class UIUCDiningClientTest(TestCase):

    def test_parse_traits_splits_allergens_and_flags(self):
        traits_str = "Corn,Eggs,Gluten,Milk,Soy,Vegetarian,Wheat,"
        allergens, flags = parse_traits(traits_str)
        self.assertEqual(set(allergens), {"Corn", "Eggs", "Gluten", "Milk", "Soy", "Wheat"})
        self.assertEqual(flags, ["Vegetarian"])

    def test_parse_traits_empty_string(self):
        allergens, flags = parse_traits("")
        self.assertEqual(allergens, [])
        self.assertEqual(flags, [])

    def test_parse_traits_vegan_and_jain(self):
        allergens, flags = parse_traits("Jain,Vegan,Vegetarian,")
        self.assertEqual(allergens, [])
        self.assertEqual(set(flags), {"Jain", "Vegan", "Vegetarian"})

    @patch("mealPlanning.services.uiuc_dining.requests.post")
    def test_fetch_menu_returns_parsed_items(self, mock_post):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = [
            {
                "FormalName": "Banana",
                "Category": "Fruits",
                "Course": "Fruits",
                "Meal": "Lunch",
                "Traits": "Jain,Vegan,Vegetarian,",
                "ServingUnit": "Euclid Street Deli",
                "ItemID": 841,
                "EventDate": "2026-03-01T00:00:00",
            }
        ]
        mock_post.return_value = mock_response

        items = fetch_menu(option_id=1, date_str="2026-03-01")
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["formal_name"], "Banana")
        self.assertEqual(items[0]["category"], "Fruits")
        self.assertEqual(items[0]["meal"], "Lunch")
        self.assertEqual(items[0]["allergens"], [])
        self.assertEqual(set(items[0]["dietary_flags"]), {"Jain", "Vegan", "Vegetarian"})
        self.assertEqual(items[0]["item_id"], 841)

    @patch("mealPlanning.services.uiuc_dining.requests.post")
    def test_fetch_menu_handles_timeout(self, mock_post):
        import requests as req
        mock_post.side_effect = req.exceptions.Timeout("timeout")
        items = fetch_menu(option_id=1, date_str="2026-03-01")
        self.assertEqual(items, [])
```

**Step 2: Run tests to verify they fail**

```bash
python manage.py test mealPlanning.tests.UIUCDiningClientTest --settings=SmartEats_config.settings.development -v 2
```

Expected: FAIL — module doesn't exist.

**Step 3: Create the UIUC dining client**

Create `backend/mealPlanning/services/__init__.py` (empty file).

Create `backend/mealPlanning/services/uiuc_dining.py`:

```python
import logging
import requests

logger = logging.getLogger(__name__)

UIUC_API_URL = "https://web.housing.illinois.edu/DiningMenus/api/DiningMenu/GetOption/"

DINING_OPTIONS = {
    1: "Ikenberry Dining Center",
    2: "Pennsylvania Avenue Dining Hall",
    3: "Illinois Street Dining Center",
}

ALLERGEN_SET = frozenset({
    "Corn", "Eggs", "Fish", "Gluten", "Milk", "Peanuts",
    "Sesame", "Shellfish", "Soy", "Tree Nuts", "Wheat", "Coconut",
})

DIET_FLAG_SET = frozenset({"Vegan", "Vegetarian", "Halal", "Jain"})


def parse_traits(traits_str):
    """Split UIUC Traits string into (allergens, dietary_flags) lists."""
    if not traits_str:
        return [], []
    tokens = [t.strip() for t in traits_str.split(",") if t.strip()]
    allergens = sorted(t for t in tokens if t in ALLERGEN_SET)
    dietary_flags = sorted(t for t in tokens if t in DIET_FLAG_SET)
    return allergens, dietary_flags


def fetch_menu(option_id, date_str):
    """
    Fetch menu items from UIUC Dining API for one dining option and date.

    Returns a list of dicts with normalized keys, or [] on error.
    """
    try:
        resp = requests.post(
            UIUC_API_URL,
            json={"DiningOptionID": str(option_id), "mealDate": date_str},
            timeout=10,
        )
        resp.raise_for_status()
    except requests.exceptions.RequestException as exc:
        logger.warning("UIUC API error for option %s: %s", option_id, exc)
        return []

    items = []
    for raw in resp.json():
        allergens, dietary_flags = parse_traits(raw.get("Traits", ""))
        items.append({
            "formal_name": raw["FormalName"],
            "category": raw.get("Category", ""),
            "course": raw.get("Course", ""),
            "meal": raw.get("Meal", ""),
            "serving_unit": raw.get("ServingUnit", ""),
            "item_id": raw.get("ItemID"),
            "allergens": allergens,
            "dietary_flags": dietary_flags,
        })
    return items
```

**Step 4: Run tests**

```bash
python manage.py test mealPlanning.tests.UIUCDiningClientTest --settings=SmartEats_config.settings.development -v 2
```

Expected: 5 tests PASS.

**Step 5: Commit**

```bash
git add mealPlanning/services/ mealPlanning/tests.py
git commit -m "feat: add UIUC dining API client with trait parsing"
```

---

## Task 3: Wger Nutrition Client

**Files:**
- Create: `backend/mealPlanning/services/wger_client.py`

**Step 1: Write failing test**

Append to `backend/mealPlanning/tests.py`:

```python
from mealPlanning.services.wger_client import lookup_nutrition


class WgerClientTest(TestCase):

    @patch("mealPlanning.services.wger_client.requests.get")
    def test_exact_match_returns_nutrition(self, mock_get):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "results": [
                {
                    "name": "Banana",
                    "energy": 89,
                    "protein": "1.100",
                    "carbohydrates": "23.000",
                    "fat": "0.300",
                    "fiber": "2.600",
                    "sodium": "0.001",
                }
            ]
        }
        mock_resp.raise_for_status = MagicMock()
        mock_get.return_value = mock_resp

        result = lookup_nutrition("Banana")
        self.assertIsNotNone(result)
        self.assertEqual(result["calories"], 89)
        self.assertAlmostEqual(result["protein"], 1.1)
        self.assertAlmostEqual(result["fiber"], 2.6)

    @patch("mealPlanning.services.wger_client.requests.get")
    def test_no_match_returns_none(self, mock_get):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"results": []}
        mock_resp.raise_for_status = MagicMock()
        mock_get.return_value = mock_resp

        result = lookup_nutrition("Xylophone Casserole")
        self.assertIsNone(result)

    @patch("mealPlanning.services.wger_client.requests.get")
    def test_low_similarity_returns_none(self, mock_get):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "results": [
                {
                    "name": "Completely Different Food Item",
                    "energy": 200,
                    "protein": "10.0",
                    "carbohydrates": "20.0",
                    "fat": "5.0",
                    "fiber": "1.0",
                    "sodium": "0.5",
                }
            ]
        }
        mock_resp.raise_for_status = MagicMock()
        mock_get.return_value = mock_resp

        result = lookup_nutrition("Banana")
        self.assertIsNone(result)

    @patch("mealPlanning.services.wger_client.requests.get")
    def test_timeout_returns_none(self, mock_get):
        import requests as req
        mock_get.side_effect = req.exceptions.Timeout("timeout")
        result = lookup_nutrition("Banana")
        self.assertIsNone(result)
```

**Step 2: Run tests to verify they fail**

```bash
python manage.py test mealPlanning.tests.WgerClientTest --settings=SmartEats_config.settings.development -v 2
```

Expected: FAIL — module doesn't exist.

**Step 3: Create the Wger client**

Create `backend/mealPlanning/services/wger_client.py`:

```python
import logging
from difflib import SequenceMatcher

import requests

logger = logging.getLogger(__name__)

WGER_INGREDIENT_URL = "https://wger.de/api/v2/ingredient/"
SIMILARITY_THRESHOLD = 0.6


def _similarity(a, b):
    """Case-insensitive similarity ratio between two strings."""
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def lookup_nutrition(dish_name):
    """
    Query Wger for a dish name. Returns a dict of nutrition data if a
    confident match is found, or None otherwise.

    Return format:
        {
            "calories": int,
            "protein": float,
            "carbohydrates": float,
            "fat": float,
            "fiber": float,
            "sodium": float,
        }
    """
    try:
        resp = requests.get(
            WGER_INGREDIENT_URL,
            params={"name": dish_name, "language": 2, "format": "json", "limit": 5},
            timeout=5,
        )
        resp.raise_for_status()
    except requests.exceptions.RequestException as exc:
        logger.warning("Wger API error for '%s': %s", dish_name, exc)
        return None

    results = resp.json().get("results", [])
    if not results:
        return None

    # Score each result by name similarity, pick best
    best = None
    best_score = 0.0
    for item in results:
        score = _similarity(dish_name, item["name"])
        if score > best_score:
            best_score = score
            best = item

    if best_score < SIMILARITY_THRESHOLD:
        logger.debug(
            "Wger: no confident match for '%s' (best: '%s' @ %.2f)",
            dish_name, best["name"] if best else "?", best_score,
        )
        return None

    return {
        "calories": int(best["energy"]),
        "protein": float(best.get("protein") or 0),
        "carbohydrates": float(best.get("carbohydrates") or 0),
        "fat": float(best.get("fat") or 0),
        "fiber": float(best.get("fiber") or 0),
        "sodium": float(best.get("sodium") or 0),
    }
```

**Step 4: Run tests**

```bash
python manage.py test mealPlanning.tests.WgerClientTest --settings=SmartEats_config.settings.development -v 2
```

Expected: 4 tests PASS.

**Step 5: Commit**

```bash
git add mealPlanning/services/wger_client.py mealPlanning/tests.py
git commit -m "feat: add Wger nutrition client with fuzzy name matching"
```

---

## Task 4: Gemini AI Client

**Files:**
- Create: `backend/mealPlanning/services/gemini_client.py`
- Modify: `backend/requirements.txt` (add `google-generativeai`)

**Step 1: Add dependency**

Add to `backend/requirements.txt`:
```
google-generativeai>=0.8.0
```

Install:
```bash
pip install google-generativeai
```

**Step 2: Write failing test**

Append to `backend/mealPlanning/tests.py`:

```python
from mealPlanning.services.gemini_client import estimate_nutrition


class GeminiClientTest(TestCase):

    @patch("mealPlanning.services.gemini_client.genai")
    def test_returns_structured_nutrition(self, mock_genai):
        mock_model = MagicMock()
        mock_response = MagicMock()
        mock_response.text = '{"calories": 350, "protein": 8.0, "carbohydrates": 45.0, "fat": 15.0, "fiber": 2.0, "sodium": 400.0, "confidence": "medium"}'
        mock_model.generate_content.return_value = mock_response
        mock_genai.GenerativeModel.return_value = mock_model

        result = estimate_nutrition(
            dish_name="Blueberry Muffin",
            category="Baked Expectations",
            meal_period="Continental Breakfast",
            allergens=["Eggs", "Gluten", "Milk"],
            dietary_flags=["Vegetarian"],
            serving_unit="Baked Expectations",
        )
        self.assertEqual(result["calories"], 350)
        self.assertAlmostEqual(result["protein"], 8.0)
        self.assertEqual(result["confidence"], "medium")

    @patch("mealPlanning.services.gemini_client.genai")
    def test_returns_none_on_api_error(self, mock_genai):
        mock_model = MagicMock()
        mock_model.generate_content.side_effect = Exception("API error")
        mock_genai.GenerativeModel.return_value = mock_model

        result = estimate_nutrition(
            dish_name="Mystery Dish",
            category="Unknown",
            meal_period="Dinner",
        )
        self.assertIsNone(result)

    @patch("mealPlanning.services.gemini_client.genai")
    def test_returns_none_on_invalid_json(self, mock_genai):
        mock_model = MagicMock()
        mock_response = MagicMock()
        mock_response.text = "not valid json"
        mock_model.generate_content.return_value = mock_response
        mock_genai.GenerativeModel.return_value = mock_model

        result = estimate_nutrition(
            dish_name="Bad Response Dish",
            category="Unknown",
            meal_period="Lunch",
        )
        self.assertIsNone(result)
```

**Step 3: Run tests to verify they fail**

```bash
python manage.py test mealPlanning.tests.GeminiClientTest --settings=SmartEats_config.settings.development -v 2
```

Expected: FAIL — module doesn't exist.

**Step 4: Create the Gemini client**

Create `backend/mealPlanning/services/gemini_client.py`:

```python
import json
import logging
import time

from django.conf import settings

try:
    import google.generativeai as genai
except ImportError:
    genai = None

logger = logging.getLogger(__name__)

MODEL_NAME = "gemini-1.5-flash"
_last_call_time = 0.0
RATE_LIMIT_SECONDS = 0.5

NUTRITION_SCHEMA = {
    "type": "object",
    "properties": {
        "calories": {"type": "integer"},
        "protein": {"type": "number"},
        "carbohydrates": {"type": "number"},
        "fat": {"type": "number"},
        "fiber": {"type": "number"},
        "sodium": {"type": "number"},
        "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
    },
    "required": ["calories", "protein", "carbohydrates", "fat", "fiber", "sodium", "confidence"],
}


def _get_model():
    api_key = getattr(settings, "GEMINI_API_KEY", None)
    if not api_key:
        import os
        api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY not configured")
    genai.configure(api_key=api_key)
    return genai.GenerativeModel(
        MODEL_NAME,
        generation_config={
            "temperature": 0,
            "response_mime_type": "application/json",
            "response_schema": NUTRITION_SCHEMA,
        },
    )


def estimate_nutrition(
    dish_name,
    category="",
    meal_period="",
    allergens=None,
    dietary_flags=None,
    serving_unit="",
):
    """
    Use Gemini to estimate nutrition for a dish. Returns a dict with
    calories, protein, carbohydrates, fat, fiber, sodium, confidence
    or None on failure.
    """
    global _last_call_time

    if genai is None:
        logger.error("google-generativeai not installed")
        return None

    prompt = (
        f"Estimate the nutritional content per standard serving of this university dining hall dish.\n\n"
        f"Dish: {dish_name}\n"
        f"Category: {category}\n"
        f"Meal period: {meal_period}\n"
        f"Station: {serving_unit}\n"
        f"Allergens: {', '.join(allergens or [])}\n"
        f"Dietary flags: {', '.join(dietary_flags or [])}\n\n"
        f"Return JSON with: calories (int), protein (g), carbohydrates (g), "
        f"fat (g), fiber (g), sodium (mg), and confidence (high/medium/low)."
    )

    # Rate limiting
    elapsed = time.time() - _last_call_time
    if elapsed < RATE_LIMIT_SECONDS:
        time.sleep(RATE_LIMIT_SECONDS - elapsed)

    try:
        model = _get_model()
        response = model.generate_content(prompt)
        _last_call_time = time.time()
        data = json.loads(response.text)
        # Validate required keys
        required = {"calories", "protein", "carbohydrates", "fat", "fiber", "sodium", "confidence"}
        if not required.issubset(data.keys()):
            logger.warning("Gemini response missing keys for '%s': %s", dish_name, data)
            return None
        return data
    except (json.JSONDecodeError, ValueError) as exc:
        logger.warning("Gemini JSON error for '%s': %s", dish_name, exc)
        return None
    except Exception as exc:
        logger.error("Gemini API error for '%s': %s", dish_name, exc)
        return None
```

**Step 5: Run tests**

```bash
python manage.py test mealPlanning.tests.GeminiClientTest --settings=SmartEats_config.settings.development -v 2
```

Expected: 3 tests PASS.

**Step 6: Commit**

```bash
git add mealPlanning/services/gemini_client.py mealPlanning/tests.py requirements.txt
git commit -m "feat: add Gemini AI nutrition estimation client"
```

---

## Task 5: Management Command — scrape_menu

**Files:**
- Create: `backend/mealPlanning/management/__init__.py` (empty)
- Create: `backend/mealPlanning/management/commands/__init__.py` (empty)
- Create: `backend/mealPlanning/management/commands/scrape_menu.py`

**Step 1: Write failing test**

Append to `backend/mealPlanning/tests.py`:

```python
from django.core.management import call_command
from io import StringIO
from datetime import date


class ScrapeMenuCommandTest(TestCase):

    @patch("mealPlanning.services.gemini_client.estimate_nutrition")
    @patch("mealPlanning.services.wger_client.lookup_nutrition")
    @patch("mealPlanning.services.uiuc_dining.fetch_menu")
    def test_creates_hall_and_dishes(self, mock_fetch, mock_wger, mock_gemini):
        mock_fetch.return_value = [
            {
                "formal_name": "Banana",
                "category": "Fruits",
                "course": "Fruits",
                "meal": "Lunch",
                "serving_unit": "Deli",
                "item_id": 841,
                "allergens": [],
                "dietary_flags": ["Vegan", "Vegetarian"],
            },
        ]
        mock_wger.return_value = {
            "calories": 89,
            "protein": 1.1,
            "carbohydrates": 23.0,
            "fat": 0.3,
            "fiber": 2.6,
            "sodium": 0.001,
        }

        out = StringIO()
        call_command("scrape_menu", "--date=2026-03-01", stdout=out)

        # Hall created
        self.assertTrue(DiningHall.objects.filter(name="Ikenberry Dining Center").exists())

        # Dish created with nutrition
        dish = Dish.objects.get(dish_name="Banana", dining_hall__name="Ikenberry Dining Center")
        self.assertEqual(dish.calories, 89)
        self.assertEqual(dish.nutrition_source, "wger")
        self.assertEqual(dish.dietary_flags, ["Vegan", "Vegetarian"])
        self.assertEqual(dish.last_seen, date(2026, 3, 1))

    @patch("mealPlanning.services.gemini_client.estimate_nutrition")
    @patch("mealPlanning.services.wger_client.lookup_nutrition")
    @patch("mealPlanning.services.uiuc_dining.fetch_menu")
    def test_gemini_fallback_when_wger_fails(self, mock_fetch, mock_wger, mock_gemini):
        mock_fetch.return_value = [
            {
                "formal_name": "Mystery Casserole",
                "category": "Entrees",
                "course": "Entrees",
                "meal": "Dinner",
                "serving_unit": "Grill",
                "item_id": 999,
                "allergens": ["Gluten", "Milk"],
                "dietary_flags": [],
            },
        ]
        mock_wger.return_value = None  # No Wger match
        mock_gemini.return_value = {
            "calories": 450,
            "protein": 20.0,
            "carbohydrates": 35.0,
            "fat": 22.0,
            "fiber": 3.0,
            "sodium": 800.0,
            "confidence": "medium",
        }

        out = StringIO()
        call_command("scrape_menu", "--date=2026-03-01", stdout=out)

        dish = Dish.objects.get(dish_name="Mystery Casserole")
        self.assertEqual(dish.calories, 450)
        self.assertEqual(dish.nutrition_source, "ai_generated")
        self.assertEqual(dish.ai_confidence, "medium")

    @patch("mealPlanning.services.gemini_client.estimate_nutrition")
    @patch("mealPlanning.services.wger_client.lookup_nutrition")
    @patch("mealPlanning.services.uiuc_dining.fetch_menu")
    def test_skips_dishes_already_enriched(self, mock_fetch, mock_wger, mock_gemini):
        hall = DiningHall.objects.create(name="Ikenberry Dining Center", location="Ikenberry")
        Dish.objects.create(
            dish_name="Banana",
            category="Fruits",
            dining_hall=hall,
            calories=89,
            nutrition_source="wger",
        )

        mock_fetch.return_value = [
            {
                "formal_name": "Banana",
                "category": "Fruits",
                "course": "Fruits",
                "meal": "Lunch",
                "serving_unit": "Deli",
                "item_id": 841,
                "allergens": [],
                "dietary_flags": ["Vegan"],
            },
        ]

        out = StringIO()
        call_command("scrape_menu", "--date=2026-03-01", stdout=out)

        # Wger should NOT have been called — dish already has nutrition
        mock_wger.assert_not_called()
        mock_gemini.assert_not_called()

        # But metadata should be updated
        dish = Dish.objects.get(dish_name="Banana", dining_hall=hall)
        self.assertEqual(dish.last_seen, date(2026, 3, 1))
        self.assertEqual(dish.dietary_flags, ["Vegan"])
```

**Step 2: Run tests to verify they fail**

```bash
python manage.py test mealPlanning.tests.ScrapeMenuCommandTest --settings=SmartEats_config.settings.development -v 2
```

Expected: FAIL — command doesn't exist.

**Step 3: Create the management command**

Create empty `__init__.py` files:
- `backend/mealPlanning/management/__init__.py`
- `backend/mealPlanning/management/commands/__init__.py`

Create `backend/mealPlanning/management/commands/scrape_menu.py`:

```python
import logging
from datetime import date

from django.core.management.base import BaseCommand

from mealPlanning.models import DiningHall, Dish
from mealPlanning.services.uiuc_dining import fetch_menu, DINING_OPTIONS
from mealPlanning.services.wger_client import lookup_nutrition
from mealPlanning.services.gemini_client import estimate_nutrition

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Fetch today's UIUC dining menu and enrich dishes with nutrition data."

    def add_arguments(self, parser):
        parser.add_argument(
            "--date",
            type=str,
            default=None,
            help="Menu date in YYYY-MM-DD format (defaults to today)",
        )

    def handle(self, *args, **options):
        menu_date = options["date"] or date.today().isoformat()
        self.stdout.write(f"Scraping menu for {menu_date}...")

        stats = {"halls": 0, "created": 0, "updated": 0, "wger": 0, "ai": 0, "skipped": 0}
        dishes_to_enrich = []

        for option_id, hall_name in DINING_OPTIONS.items():
            items = fetch_menu(option_id, menu_date)
            if not items:
                self.stdout.write(self.style.WARNING(f"  No items for {hall_name}"))
                continue

            hall, _ = DiningHall.objects.get_or_create(
                name=hall_name,
                defaults={"location": hall_name},
            )
            stats["halls"] += 1

            for item in items:
                dish, created = Dish.objects.get_or_create(
                    dish_name=item["formal_name"],
                    dining_hall=hall,
                    defaults={"category": item["category"]},
                )

                # Always update metadata
                dish.category = item["category"]
                dish.meal_period = item["meal"]
                dish.course = item["course"]
                dish.serving_unit = item["serving_unit"]
                dish.allergens = item["allergens"]
                dish.dietary_flags = item["dietary_flags"]
                dish.uiuc_item_id = item["item_id"]
                dish.last_seen = date.fromisoformat(menu_date)
                dish.save()

                if created:
                    stats["created"] += 1
                else:
                    stats["updated"] += 1

                # Queue for nutrition enrichment if needed
                needs_nutrition = (dish.calories == 0 and dish.nutrition_source == "")
                if needs_nutrition:
                    dishes_to_enrich.append(dish)
                else:
                    stats["skipped"] += 1

        # Nutrition enrichment phase
        self.stdout.write(f"Enriching {len(dishes_to_enrich)} dishes...")

        for dish in dishes_to_enrich:
            wger_data = lookup_nutrition(dish.dish_name)

            if wger_data:
                dish.calories = wger_data["calories"]
                dish.protein = round(wger_data["protein"])
                dish.carbohydrates = round(wger_data["carbohydrates"])
                dish.fat = round(wger_data["fat"])
                dish.fiber = wger_data["fiber"]
                dish.sodium = wger_data["sodium"]
                dish.nutrition_source = "wger"
                dish.save()
                stats["wger"] += 1
                continue

            ai_data = estimate_nutrition(
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
                dish.nutrition_source = "ai_generated"
                dish.ai_confidence = ai_data.get("confidence", "")
                dish.save()
                stats["ai"] += 1
            else:
                logger.warning("No nutrition data for '%s'", dish.dish_name)

        self.stdout.write(self.style.SUCCESS(
            f"Done! Halls: {stats['halls']}, "
            f"Created: {stats['created']}, Updated: {stats['updated']}, "
            f"Wger: {stats['wger']}, AI: {stats['ai']}, "
            f"Skipped: {stats['skipped']}"
        ))
```

**Step 4: Run tests**

```bash
python manage.py test mealPlanning.tests.ScrapeMenuCommandTest --settings=SmartEats_config.settings.development -v 2
```

Expected: 3 tests PASS.

**Step 5: Commit**

```bash
git add mealPlanning/management/ mealPlanning/tests.py
git commit -m "feat: add scrape_menu management command with Wger/Gemini enrichment"
```

---

## Task 6: Add GEMINI_API_KEY to Settings

**Files:**
- Modify: `backend/SmartEats_config/settings/base.py`
- Modify: `backend/.env` (manual — do not commit)

**Step 1: Add setting**

In `backend/SmartEats_config/settings/base.py`, after the `SECRET_KEY` line, add:

```python
GEMINI_API_KEY = env('GEMINI_API_KEY', default='')
```

**Step 2: Add to .env (manual)**

```
GEMINI_API_KEY=your-api-key-here
```

**Step 3: Commit settings change only**

```bash
git add SmartEats_config/settings/base.py
git commit -m "feat: add GEMINI_API_KEY setting from environment"
```

---

## Task 7: Integration Test — Live API Smoke Test

**This is a manual verification step, not an automated test.**

**Step 1: Run the command with real APIs**

```bash
cd backend
python manage.py scrape_menu --settings=SmartEats_config.settings.development
```

**Step 2: Verify results**

```bash
python manage.py shell --settings=SmartEats_config.settings.development -c "
from mealPlanning.models import Dish, DiningHall
print(f'Halls: {DiningHall.objects.count()}')
print(f'Dishes: {Dish.objects.count()}')
print(f'Wger enriched: {Dish.objects.filter(nutrition_source=\"wger\").count()}')
print(f'AI enriched: {Dish.objects.filter(nutrition_source=\"ai_generated\").count()}')
print(f'No nutrition: {Dish.objects.filter(nutrition_source=\"\").count()}')
for d in Dish.objects.filter(nutrition_source='wger')[:3]:
    print(f'  {d.dish_name}: {d.calories} cal, source={d.nutrition_source}')
for d in Dish.objects.filter(nutrition_source='ai_generated')[:3]:
    print(f'  {d.dish_name}: {d.calories} cal, source={d.nutrition_source}, confidence={d.ai_confidence}')
"
```

Expected: 3 halls, ~200 dishes, mix of wger/ai_generated sources.

**Step 3: Commit any fixes if needed, then final commit**

```bash
git add -A
git commit -m "chore: finalize ETL pipeline after integration testing"
```

---

## Task 8: Run Full Test Suite

**Step 1: Run all tests**

```bash
cd backend
python manage.py test mealPlanning --settings=SmartEats_config.settings.development -v 2
```

Expected: All tests pass (DishModelFieldsTest, UIUCDiningClientTest, WgerClientTest, GeminiClientTest, ScrapeMenuCommandTest).

---

## Summary of Commits

1. `feat: add nutrition, allergen, and metadata fields to Dish model`
2. `feat: add UIUC dining API client with trait parsing`
3. `feat: add Wger nutrition client with fuzzy name matching`
4. `feat: add Gemini AI nutrition estimation client`
5. `feat: add scrape_menu management command with Wger/Gemini enrichment`
6. `feat: add GEMINI_API_KEY setting from environment`
7. `chore: finalize ETL pipeline after integration testing`

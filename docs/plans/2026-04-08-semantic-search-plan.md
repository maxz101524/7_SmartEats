# Semantic Dish Search Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

> **Implementation note (2026-04-09):** The shipped version was adjusted from `all-mpnet-base-v2` to `all-MiniLM-L6-v2` so semantic search fits the deployed Render memory budget. Historical planning details below reflect the original prototype direction.

**Goal:** Add a natural language semantic search mode to the Menu page, backed by `sentence-transformers/all-mpnet-base-v2` stored per-dish in the database and refreshed daily by `scrape_menu`.

**Architecture:** Each `Dish` record gets a `BinaryField` storing its pickled 768-dim embedding. `scrape_menu` computes embeddings after upserting dishes. A new `SemanticSearchView` embeds the user's query, cosine-compares against today's stored embeddings, and returns ranked results. The Menu page search bar gets a "Filter / AI" mode toggle; AI mode calls the new endpoint instead of doing a client-side name filter.

**Tech Stack:** `sentence-transformers` (all-mpnet-base-v2, Apple MPS), `numpy`, Django `BinaryField`, React `useEffect` debounce, `axios`.

---

## Task 1: Add `sentence-transformers` to backend dependencies

**Files:**
- Modify: `backend/requirements.txt`

**Step 1: Add the dependency**

Open `backend/requirements.txt` and add after the `# Local LLM` block:

```
# Semantic Search (A9)
sentence-transformers>=2.7.0
numpy>=1.24.0
```

(`torch` and `transformers` are already listed — `sentence-transformers` pulls the rest.)

**Step 2: Install it**

```bash
cd backend
pip install sentence-transformers>=2.7.0
```

Expected: resolves quickly since torch/transformers are already installed. The `all-mpnet-base-v2` model (~420MB) downloads on first use, not now.

**Step 3: Commit**

```bash
git add backend/requirements.txt
git commit -m "feat(a9): add sentence-transformers dependency for semantic search"
```

---

## Task 2: Add `embedding` field to `Dish` model + migrate

**Files:**
- Modify: `backend/mealPlanning/models.py` (after `last_seen` field, ~line 92)
- New migration: auto-generated

**Step 1: Add the field**

In `backend/mealPlanning/models.py`, find the `last_seen` field (line ~89) and add immediately after it:

```python
    last_seen = models.DateField(
        null=True, blank=True,
        help_text="Last date this dish appeared on the menu"
    )
    embedding = models.BinaryField(
        null=True, blank=True,
        help_text="Pickled numpy float32 array (768-dim) from all-mpnet-base-v2"
    )
```

**Step 2: Make migration**

```bash
cd backend
python manage.py makemigrations mealPlanning --settings=SmartEats_config.settings.development
```

Expected output: `Migrations for 'mealPlanning': mealPlanning/migrations/000X_dish_embedding.py`

**Step 3: Apply migration**

```bash
python manage.py migrate --settings=SmartEats_config.settings.development
```

Expected: `Applying mealPlanning.000X_dish_embedding... OK`

**Step 4: Commit**

```bash
git add backend/mealPlanning/models.py backend/mealPlanning/migrations/
git commit -m "feat(a9): add embedding BinaryField to Dish model"
```

---

## Task 3: Create `semantic_search` service

**Files:**
- Create: `backend/mealPlanning/services/semantic_search.py`
- Modify: `backend/mealPlanning/tests.py` (add `SemanticSearchServiceTest` class)

**Step 1: Write the failing tests first**

Open `backend/mealPlanning/tests.py`. Add these imports at the top of the file (alongside existing ones):

```python
import pickle
import numpy as np
from datetime import date
from unittest.mock import patch, MagicMock
from mealPlanning.services.semantic_search import dish_text, encode_to_bytes, decode_from_bytes, search
```

Then add this test class at the bottom of the file:

```python
class SemanticSearchServiceTest(TestCase):

    def test_dish_text_combines_name_category_flags_allergens(self):
        dish = Dish(
            dish_name="Grilled Chicken",
            category="Entrees",
            dietary_flags=["Gluten-Free"],
            allergens=["Milk"],
        )
        result = dish_text(dish)
        self.assertEqual(result, "Grilled Chicken Entrees Gluten-Free Milk")

    def test_dish_text_handles_none_and_empty_fields(self):
        dish = Dish(
            dish_name="Pasta",
            category=None,
            dietary_flags=None,
            allergens=None,
        )
        result = dish_text(dish)
        self.assertEqual(result, "Pasta")

    def test_dish_text_handles_empty_lists(self):
        dish = Dish(
            dish_name="Soup",
            category="Soups",
            dietary_flags=[],
            allergens=[],
        )
        result = dish_text(dish)
        self.assertEqual(result, "Soup Soups")

    @patch("mealPlanning.services.semantic_search._get_model")
    def test_encode_decode_roundtrip(self, mock_get_model):
        mock_model = MagicMock()
        mock_model.encode.return_value = np.array([0.1, 0.2, 0.3], dtype=np.float32)
        mock_get_model.return_value = mock_model

        blob = encode_to_bytes("test dish")
        result = decode_from_bytes(blob)
        np.testing.assert_array_almost_equal(result, [0.1, 0.2, 0.3])

    @patch("mealPlanning.services.semantic_search._get_model")
    def test_search_returns_most_similar_dish_first(self, mock_get_model):
        mock_model = MagicMock()
        mock_get_model.return_value = mock_model

        hall = DiningHall.objects.create(name="Test Hall", location="Test")
        # dish1: "protein" direction [1, 0]; dish2: "vegetable" direction [0, 1]
        vec1 = np.array([1.0, 0.0], dtype=np.float32)
        vec2 = np.array([0.0, 1.0], dtype=np.float32)
        dish1 = Dish.objects.create(
            dish_name="Grilled Chicken", category="Entrees",
            dining_hall=hall, last_seen=date.today(),
            embedding=pickle.dumps(vec1),
        )
        Dish.objects.create(
            dish_name="Garden Salad", category="Salads",
            dining_hall=hall, last_seen=date.today(),
            embedding=pickle.dumps(vec2),
        )
        # Query points toward dish1
        mock_model.encode.return_value = np.array([1.0, 0.0], dtype=np.float32)

        results = search("high protein")
        self.assertEqual(len(results), 2)
        self.assertEqual(results[0]["dish_name"], "Grilled Chicken")
        self.assertGreater(results[0]["score"], results[1]["score"])

    @patch("mealPlanning.services.semantic_search._get_model")
    def test_search_returns_empty_list_when_no_embeddings_today(self, mock_get_model):
        mock_model = MagicMock()
        mock_model.encode.return_value = np.array([1.0, 0.0], dtype=np.float32)
        mock_get_model.return_value = mock_model

        # No dishes with last_seen=today
        results = search("anything")
        self.assertEqual(results, [])

    def test_search_returns_empty_list_for_empty_query(self):
        results = search("")
        self.assertEqual(results, [])
        results = search("   ")
        self.assertEqual(results, [])
```

**Step 2: Run tests to verify they fail**

```bash
cd backend
python manage.py test mealPlanning.tests.SemanticSearchServiceTest --settings=SmartEats_config.settings.development -v 2
```

Expected: `ImportError: cannot import name 'dish_text' from 'mealPlanning.services.semantic_search'`

**Step 3: Create the service**

Create `backend/mealPlanning/services/semantic_search.py`:

```python
import logging
import pickle

import numpy as np

logger = logging.getLogger(__name__)

MODEL_NAME = "sentence-transformers/all-mpnet-base-v2"
_model = None


def _get_model():
    global _model
    if _model is None:
        import torch
        from sentence_transformers import SentenceTransformer
        device = "mps" if torch.backends.mps.is_available() else "cpu"
        logger.info("Loading embedding model %s on %s", MODEL_NAME, device)
        _model = SentenceTransformer(MODEL_NAME, device=device)
    return _model


def dish_text(dish):
    """Build a plain-text representation of a dish for embedding."""
    parts = [dish.dish_name]
    if dish.category:
        parts.append(dish.category)
    if dish.dietary_flags:
        parts.extend(dish.dietary_flags)
    if dish.allergens:
        parts.extend(dish.allergens)
    return " ".join(parts)


def encode_to_bytes(text):
    """Encode text to a normalized 768-dim vector and return as pickled bytes."""
    model = _get_model()
    vec = model.encode(text, normalize_embeddings=True).astype(np.float32)
    return pickle.dumps(vec)


def decode_from_bytes(blob):
    """Deserialize a stored embedding blob back to a numpy array."""
    return pickle.loads(bytes(blob))


def search(query, hall_id=None, top_k=10):
    """
    Semantic search over today's dishes.
    Returns a ranked list of dish dicts with an added 'score' field.
    """
    from datetime import date
    from mealPlanning.models import Dish

    if not query or not query.strip():
        return []

    today = date.today()
    qs = Dish.objects.filter(last_seen=today).exclude(embedding=None)
    if hall_id is not None:
        qs = qs.filter(dining_hall_id=hall_id)

    dishes = list(qs)
    if not dishes:
        return []

    # Build embedding matrix
    vecs = []
    valid_dishes = []
    for dish in dishes:
        try:
            vec = decode_from_bytes(dish.embedding)
            if np.linalg.norm(vec) > 0:
                vecs.append(vec)
                valid_dishes.append(dish)
        except Exception as exc:
            logger.warning("Could not decode embedding for dish %s: %s", dish.dish_id, exc)

    if not vecs:
        return []

    matrix = np.stack(vecs)                                         # (N, 768)
    model = _get_model()
    query_vec = model.encode(query.strip(), normalize_embeddings=True).astype(np.float32)  # (768,)
    scores = matrix @ query_vec                                     # cosine similarity

    top_indices = np.argsort(scores)[::-1][:top_k]

    results = []
    for idx in top_indices:
        dish = valid_dishes[int(idx)]
        results.append({
            "dish_id": dish.dish_id,
            "dish_name": dish.dish_name,
            "score": float(scores[idx]),
            "calories": dish.calories,
            "protein": dish.protein,
            "carbohydrates": dish.carbohydrates,
            "fat": dish.fat,
            "fiber": float(dish.fiber) if dish.fiber is not None else None,
            "sodium": float(dish.sodium) if dish.sodium is not None else None,
            "category": dish.category,
            "allergens": dish.allergens,
            "dietary_flags": dish.dietary_flags,
            "serving_unit": dish.serving_unit,
            "serving_size": dish.serving_size,
            "course": dish.course,
            "meal_period": dish.meal_period,
            "nutrition_source": dish.nutrition_source,
            "ai_confidence": dish.ai_confidence,
        })

    return results
```

**Step 4: Run tests to verify they pass**

```bash
python manage.py test mealPlanning.tests.SemanticSearchServiceTest --settings=SmartEats_config.settings.development -v 2
```

Expected: all 6 tests PASS. (The model is fully mocked — no download happens.)

**Step 5: Commit**

```bash
git add backend/mealPlanning/services/semantic_search.py backend/mealPlanning/tests.py
git commit -m "feat(a9): add semantic_search service with dish_text, encode, search"
```

---

## Task 4: Create `build_embeddings` management command

This command backfills embeddings for all existing dishes (e.g. dishes scraped before this feature existed).

**Files:**
- Create: `backend/mealPlanning/management/commands/build_embeddings.py`
- Modify: `backend/mealPlanning/tests.py` (add `BuildEmbeddingsCommandTest`)

**Step 1: Write the failing test**

Add to `backend/mealPlanning/tests.py`:

```python
from django.core.management import call_command
import io

class BuildEmbeddingsCommandTest(TestCase):

    @patch("mealPlanning.services.semantic_search.encode_to_bytes")
    def test_embeds_dishes_without_embeddings(self, mock_encode):
        mock_encode.return_value = b"fake_embedding"
        hall = DiningHall.objects.create(name="Ikenberry", location="Ikenberry")
        dish = Dish.objects.create(
            dish_name="Pancakes", category="Breakfast",
            dining_hall=hall, last_seen=date.today(),
        )
        self.assertIsNone(dish.embedding)

        out = io.StringIO()
        call_command("build_embeddings", stdout=out)

        dish.refresh_from_db()
        self.assertEqual(bytes(dish.embedding), b"fake_embedding")
        mock_encode.assert_called_once()

    @patch("mealPlanning.services.semantic_search.encode_to_bytes")
    def test_skips_dishes_that_already_have_embeddings(self, mock_encode):
        hall = DiningHall.objects.create(name="PAR", location="PAR")
        Dish.objects.create(
            dish_name="Eggs", category="Breakfast",
            dining_hall=hall, last_seen=date.today(),
            embedding=b"existing",
        )
        out = io.StringIO()
        call_command("build_embeddings", stdout=out)

        mock_encode.assert_not_called()
```

**Step 2: Run tests to verify they fail**

```bash
python manage.py test mealPlanning.tests.BuildEmbeddingsCommandTest --settings=SmartEats_config.settings.development -v 2
```

Expected: `CommandError` or `ModuleNotFoundError` — command doesn't exist yet.

**Step 3: Create the command**

Create `backend/mealPlanning/management/commands/build_embeddings.py`:

```python
from django.core.management.base import BaseCommand

from mealPlanning.models import Dish
from mealPlanning.services import semantic_search


class Command(BaseCommand):
    help = "Compute and store embeddings for dishes that are missing them."

    def add_arguments(self, parser):
        parser.add_argument(
            "--force",
            action="store_true",
            help="Re-embed all dishes, even those with existing embeddings.",
        )

    def handle(self, *args, **options):
        qs = Dish.objects.all() if options["force"] else Dish.objects.filter(embedding=None)
        total = qs.count()
        self.stdout.write(f"Embedding {total} dishes...")

        success = 0
        for i, dish in enumerate(qs, 1):
            try:
                text = semantic_search.dish_text(dish)
                dish.embedding = semantic_search.encode_to_bytes(text)
                dish.save(update_fields=["embedding"])
                success += 1
            except Exception as exc:
                self.stderr.write(f"  Failed: {dish.dish_name} — {exc}")

            if i % 20 == 0:
                self.stdout.write(f"  {i}/{total}")

        self.stdout.write(self.style.SUCCESS(f"Done. {success}/{total} dishes embedded."))
```

**Step 4: Run tests to verify they pass**

```bash
python manage.py test mealPlanning.tests.BuildEmbeddingsCommandTest --settings=SmartEats_config.settings.development -v 2
```

Expected: 2 tests PASS.

**Step 5: Run command to backfill existing dishes**

```bash
python manage.py build_embeddings --settings=SmartEats_config.settings.development
```

This triggers the first download of `all-mpnet-base-v2` (~420MB). Expected output: `Done. N/N dishes embedded.`

**Step 6: Commit**

```bash
git add backend/mealPlanning/management/commands/build_embeddings.py backend/mealPlanning/tests.py
git commit -m "feat(a9): add build_embeddings management command"
```

---

## Task 5: Update `scrape_menu` to compute embeddings on dish upsert

After each daily scrape, newly upserted dishes should get embeddings automatically.

**Files:**
- Modify: `backend/mealPlanning/management/commands/scrape_menu.py`
- Modify: `backend/mealPlanning/tests.py` (add embedding assertion to existing scrape test)

**Step 1: Update the existing scrape test to assert embeddings are set**

In `backend/mealPlanning/tests.py`, find `ScrapeMenuCommandTest.test_creates_hall_and_dishes_via_gemini`. Add a mock for `encode_to_bytes` and assert the dish gets an embedding:

```python
@patch("mealPlanning.services.semantic_search.encode_to_bytes")
@patch("mealPlanning.services.gemini_client.estimate_nutrition")
@patch("mealPlanning.services.uiuc_dining.fetch_menu")
def test_creates_hall_and_dishes_via_gemini(self, mock_fetch, mock_gemini, mock_encode):
    mock_encode.return_value = b"fake_vec"
    # ... (keep existing mock_fetch and mock_gemini setup exactly as-is) ...
    # At the end, add:
    dish = Dish.objects.get(dish_name="Banana")
    self.assertEqual(bytes(dish.embedding), b"fake_vec")
```

(You only need to add the `@patch` decorator for `encode_to_bytes` and the final assertion — leave all other test code unchanged.)

**Step 2: Run to confirm it fails**

```bash
python manage.py test mealPlanning.tests.ScrapeMenuCommandTest.test_creates_hall_and_dishes_via_gemini --settings=SmartEats_config.settings.development -v 2
```

Expected: test fails because `dish.embedding` is `None`.

**Step 3: Modify `scrape_menu.py`**

Open `backend/mealPlanning/management/commands/scrape_menu.py`.

Add `semantic_search` to the imports at line 7:

```python
from mealPlanning.services import uiuc_dining, gemini_client, semantic_search
```

After the closing `self.stdout.write(self.style.SUCCESS(...))` at the end of `handle()`, add an embedding phase:

```python
        # Embedding phase — compute for any dish scraped today that lacks an embedding
        dishes_needing_embedding = [d for d in today_dishes if d.embedding is None]
        self.stdout.write(f"Embedding {len(dishes_needing_embedding)} dishes...")
        for dish in dishes_needing_embedding:
            try:
                dish.refresh_from_db()  # pick up any nutrition updates
                text = semantic_search.dish_text(dish)
                dish.embedding = semantic_search.encode_to_bytes(text)
                dish.save(update_fields=["embedding"])
            except Exception as exc:
                logger.warning("Embedding failed for '%s': %s", dish.dish_name, exc)
```

And track `today_dishes` inside the loop. In `handle()`, add `today_dishes = []` alongside `dishes_to_enrich = []` (line ~34):

```python
        stats = {"halls": 0, "created": 0, "updated": 0, "ai": 0, "skipped": 0, "force_enriched": 0}
        dishes_to_enrich = []
        today_dishes = []         # ← add this line
```

Then after `dish.save()` (line ~64, the metadata save), append to both lists:

```python
                dish.save()
                today_dishes.append(dish)  # ← add this line

                if created:
```

**Step 4: Run all scrape tests**

```bash
python manage.py test mealPlanning.tests.ScrapeMenuCommandTest --settings=SmartEats_config.settings.development -v 2
```

Expected: all 3 scrape tests PASS.

**Step 5: Commit**

```bash
git add backend/mealPlanning/management/commands/scrape_menu.py backend/mealPlanning/tests.py
git commit -m "feat(a9): compute dish embeddings in scrape_menu pipeline"
```

---

## Task 6: Add `SemanticSearchView` and register URL

**Files:**
- Modify: `backend/mealPlanning/views.py` (add view at the bottom)
- Modify: `backend/mealPlanning/urls.py`
- Modify: `backend/mealPlanning/tests.py` (add `SemanticSearchViewTest`)

**Step 1: Write the failing tests**

Add to `backend/mealPlanning/tests.py`:

```python
from rest_framework.test import APIClient

class SemanticSearchViewTest(TestCase):

    def setUp(self):
        self.client = APIClient()

    def test_missing_query_returns_400(self):
        response = self.client.get("/api/semantic-search/")
        self.assertEqual(response.status_code, 400)
        self.assertIn("error", response.data)

    def test_empty_query_returns_400(self):
        response = self.client.get("/api/semantic-search/?q=")
        self.assertEqual(response.status_code, 400)

    def test_query_too_long_returns_400(self):
        response = self.client.get(f"/api/semantic-search/?q={'x' * 201}")
        self.assertEqual(response.status_code, 400)

    @patch("mealPlanning.services.semantic_search.search")
    def test_valid_query_returns_200_with_results(self, mock_search):
        mock_search.return_value = [
            {"dish_id": 1, "dish_name": "Chicken", "score": 0.9}
        ]
        response = self.client.get("/api/semantic-search/?q=high protein")
        self.assertEqual(response.status_code, 200)
        self.assertIn("results", response.data)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["query"], "high protein")

    @patch("mealPlanning.services.semantic_search.search")
    def test_hall_param_is_passed_to_service(self, mock_search):
        mock_search.return_value = []
        self.client.get("/api/semantic-search/?q=soup&hall=3")
        mock_search.assert_called_once_with("soup", hall_id="3", top_k=10)

    @patch("mealPlanning.services.semantic_search.search")
    def test_service_error_returns_503(self, mock_search):
        mock_search.side_effect = RuntimeError("model crashed")
        response = self.client.get("/api/semantic-search/?q=breakfast")
        self.assertEqual(response.status_code, 503)
```

**Step 2: Run to confirm they fail**

```bash
python manage.py test mealPlanning.tests.SemanticSearchViewTest --settings=SmartEats_config.settings.development -v 2
```

Expected: all fail with 404 (endpoint doesn't exist yet).

**Step 3: Add the view**

At the bottom of `backend/mealPlanning/views.py`, add:

```python
class SemanticSearchView(APIView):
    """
    GET /api/semantic-search/?q=<query>&hall=<id>&top_k=10
    Returns dishes ranked by semantic similarity to the query.
    Primary AI feature for A9 — uses sentence-transformers/all-mpnet-base-v2 locally.
    """

    def get(self, request):
        query = request.query_params.get("q", "").strip()
        if not query:
            return Response(
                {"error": "Query parameter 'q' is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(query) > 200:
            return Response(
                {"error": "Query must be 200 characters or fewer."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        hall_id = request.query_params.get("hall") or None
        try:
            top_k = min(int(request.query_params.get("top_k", 10)), 20)
        except ValueError:
            top_k = 10

        try:
            from mealPlanning.services import semantic_search
            results = semantic_search.search(query, hall_id=hall_id, top_k=top_k)
        except Exception as exc:
            logger.error("Semantic search error: %s", exc)
            return Response(
                {"error": "Search service unavailable. Try the filter instead."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response({
            "results": results,
            "count": len(results),
            "query": query,
            "no_embeddings": len(results) == 0,
        })
```

Make sure `logger` is already defined at the top of `views.py` — if not, add:
```python
import logging
logger = logging.getLogger(__name__)
```

**Step 4: Register the URL**

In `backend/mealPlanning/urls.py`, add alongside the other API paths:

```python
path('semantic-search/', views.SemanticSearchView.as_view(), name='semantic_search'),
```

**Step 5: Run tests**

```bash
python manage.py test mealPlanning.tests.SemanticSearchViewTest --settings=SmartEats_config.settings.development -v 2
```

Expected: all 6 tests PASS.

**Step 6: Smoke test manually**

```bash
python manage.py runserver --settings=SmartEats_config.settings.development
curl "http://localhost:8000/api/semantic-search/?q=high+protein+breakfast"
```

Expected: JSON response with `results`, `count`, `query` keys. (Results may be empty if no dishes have `last_seen=today` in your local DB — that's fine; run `scrape_menu` or `build_embeddings` to populate.)

**Step 7: Commit**

```bash
git add backend/mealPlanning/views.py backend/mealPlanning/urls.py backend/mealPlanning/tests.py
git commit -m "feat(a9): add SemanticSearchView at /api/semantic-search/"
```

---

## Task 7: Update `Menu.tsx` — mode toggle + AI search

**Files:**
- Modify: `frontend/src/pages/Menu.tsx`

**Step 1: Add new state variables**

In `Menu.tsx`, find the existing state block (around line 225):

```ts
const [search, setSearch] = useState("");
```

Add immediately after it:

```ts
const [searchMode, setSearchMode] = useState<"filter" | "ai">("filter");
const [aiResults, setAiResults]   = useState<Dish[] | null>(null);
const [aiLoading, setAiLoading]   = useState(false);
const [aiError, setAiError]       = useState<string | null>(null);
```

**Step 2: Add the AI search effect**

After the existing `useEffect` blocks (around line 275), add:

```tsx
// ── AI semantic search ────────────────────────────────────────────────────
useEffect(() => {
  if (searchMode !== "ai" || !search.trim()) {
    setAiResults(null);
    setAiError(null);
    return;
  }
  setAiLoading(true);
  setAiError(null);
  const timer = setTimeout(async () => {
    try {
      const params: Record<string, string | number> = { q: search };
      if (selectedHall) params.hall = selectedHall.Dining_Hall_ID;
      const { data } = await axios.get(`${API_BASE}/semantic-search/`, { params });
      setAiResults(data.results);
    } catch {
      setAiError("AI search unavailable — try Filter mode instead.");
      setAiResults([]);
    } finally {
      setAiLoading(false);
    }
  }, 400);
  return () => clearTimeout(timer);
}, [search, searchMode, selectedHall]);
```

**Step 3: Update `filteredDishes` useMemo**

Find the `filteredDishes` useMemo (line ~307). Replace it with:

```tsx
const filteredDishes = useMemo(() => {
  if (!selectedHall) return [];
  if (searchMode === "ai") return aiResults ?? selectedHall.dishes;
  return selectedHall.dishes.filter((d) => {
    if (search && !d.dish_name.toLowerCase().includes(search.toLowerCase())) return false;
    if (activeMealPeriod !== "All" && d.meal_period !== activeMealPeriod) return false;
    for (const flag of activeDietary) {
      if (flag === "Gluten-Free") {
        if (d.allergens?.includes("Gluten")) return false;
      } else {
        if (!d.dietary_flags?.includes(flag)) return false;
      }
    }
    for (const allergen of excludedAllergens) {
      if (d.allergens?.includes(allergen)) return false;
    }
    return true;
  });
}, [selectedHall, search, searchMode, aiResults, activeMealPeriod, activeDietary, excludedAllergens]);
```

**Step 4: Update `selectHall` to clear AI state**

Find `selectHall` (line ~267). Add two lines after `setSearch("")`:

```tsx
const selectHall = (hall: DiningHall) => {
  setSelectedHall(hall);
  setSearch("");
  setAiResults(null);   // ← add
  setAiError(null);     // ← add
  setActiveMealPeriod("All");
  setActiveDietary(new Set());
  setExcludedAllergens(new Set());
  navigate(`/menu/${hall.Dining_Hall_ID}`);
};
```

**Step 5: Add the mode toggle to the search bar**

Find the search bar `<div>` (around line 722, the one with `position: "relative", flex: "1 1 180px"`). Replace the entire search section (the outer `<div style={{ position: "relative", flex: "1 1 180px" }}>` and its contents) with:

```tsx
{/* Search + mode toggle */}
<div style={{ display: "flex", alignItems: "center", gap: 6, flex: "1 1 180px", minWidth: 0 }}>
  {/* Mode toggle pill */}
  <div
    style={{
      display: "flex",
      background: "var(--se-bg-subtle)",
      border: "1.5px solid var(--se-border)",
      borderRadius: "var(--se-radius-full)",
      padding: 2,
      flexShrink: 0,
    }}
  >
    {(["filter", "ai"] as const).map((mode) => (
      <button
        key={mode}
        onClick={() => { setSearchMode(mode); setSearch(""); setAiResults(null); setAiError(null); }}
        style={{
          padding: "3px 10px",
          borderRadius: "var(--se-radius-full)",
          border: "none",
          cursor: "pointer",
          fontSize: 11,
          fontWeight: 600,
          transition: "all 0.15s",
          background: searchMode === mode ? "var(--se-primary)" : "transparent",
          color: searchMode === mode ? "#fff" : "var(--se-text-muted)",
        }}
      >
        {mode === "ai" ? "✦ AI" : "Filter"}
      </button>
    ))}
  </div>

  {/* Search input */}
  <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
    <div
      style={{
        position: "absolute", left: 11, top: "50%",
        transform: "translateY(-50%)", display: "flex",
        alignItems: "center", pointerEvents: "none",
      }}
    >
      {aiLoading
        ? <span style={{ fontSize: 13, color: "var(--se-primary)" }}>⏳</span>
        : <IconSearch size={15} color="var(--se-text-faint)" />}
    </div>
    <input
      type="text"
      placeholder={searchMode === "ai" ? "Try: high protein breakfast, light vegetarian…" : "Search dishes…"}
      value={search}
      onChange={(e) => setSearch(e.target.value)}
      aria-label={searchMode === "ai" ? "AI semantic search" : "Search dishes"}
      style={{
        width: "100%", height: 36, paddingLeft: 32,
        paddingRight: search ? 36 : 12,
        borderRadius: "var(--se-radius-full)",
        border: `1.5px solid ${searchMode === "ai" ? "var(--se-primary)" : "var(--se-border)"}`,
        background: "var(--se-bg-subtle)",
        fontSize: 13, color: "var(--se-text-main)",
        outline: "none", boxSizing: "border-box", transition: "border-color 0.15s",
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = "var(--se-primary)";
        e.currentTarget.style.boxShadow = "0 0 0 3px rgba(232, 74, 39, 0.1)";
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = searchMode === "ai" ? "var(--se-primary)" : "var(--se-border)";
        e.currentTarget.style.boxShadow = "none";
      }}
    />
    {search && (
      <button
        type="button"
        onClick={() => { setSearch(""); setAiResults(null); setAiError(null); }}
        aria-label="Clear search"
        style={{
          position: "absolute", right: 6, top: "50%",
          transform: "translateY(-50%)", width: 24, height: 24,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "var(--se-bg-elevated)", border: "none",
          borderRadius: "50%", cursor: "pointer",
        }}
      >
        <IconClose size={12} color="var(--se-text-muted)" />
      </button>
    )}
  </div>
</div>
```

**Step 6: Show AI error and "AI results" label**

Find where `filteredDishes.length` is displayed (around line 696). Just above the dish grid, add an error/label display. Find the element that renders the dish count / empty state and add above it:

```tsx
{/* AI mode indicators */}
{searchMode === "ai" && aiError && (
  <p style={{ color: "var(--se-error, #c0392b)", fontSize: 13, margin: "0 0 8px" }}>
    {aiError}
  </p>
)}
{searchMode === "ai" && !aiError && aiResults && aiResults.length > 0 && (
  <p style={{ color: "var(--se-text-faint)", fontSize: 12, margin: "0 0 8px" }}>
    ✦ AI results for "{search}"
  </p>
)}
```

**Step 7: Manual test**

```bash
cd frontend && npm run dev
```

1. Navigate to `/menu`, select a dining hall
2. Click "✦ AI" toggle — placeholder changes, border turns orange
3. Type "high protein breakfast" — after 400ms, results update with semantically ranked dishes
4. Type "" (clear) — all of today's dishes show
5. Click "Filter" — reverts to exact text match
6. Test error path: stop the backend server, type a query — "AI search unavailable" message appears

**Step 8: Commit**

```bash
git add frontend/src/pages/Menu.tsx
git commit -m "feat(a9): add AI semantic search mode toggle to Menu page"
```

---

## Final Verification

Run the full backend test suite to confirm nothing is broken:

```bash
cd backend
python manage.py test mealPlanning --settings=SmartEats_config.settings.development -v 2
```

Expected: all tests PASS.

Then do a full end-to-end smoke test:
1. Start backend: `python manage.py runserver --settings=SmartEats_config.settings.development`
2. Start frontend: `cd frontend && npm run dev`
3. Open `http://localhost:5173/menu`
4. Select a dining hall, switch to AI mode, type `"vegetarian low calorie"`
5. Confirm results are ranked differently from the text filter

---

## Notes for Demo

- **First AI search** triggers model load (~2-3s, runs on Apple MPS automatically)
- Subsequent searches are fast (model stays in memory for the server's lifetime)
- `all-mpnet-base-v2` downloads to `~/.cache/huggingface/` — never committed to git (covered by existing `.gitignore` patterns for `*.bin`, `*.safetensors`)
- If no dishes have `last_seen=today`, run: `python manage.py build_embeddings --settings=SmartEats_config.settings.development`

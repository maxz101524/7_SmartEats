# Semantic Dish Search — Design

**Date:** 2026-04-08
**Assignment:** A9 — Integrated AI Application Deployment
**Feature:** AI-enhanced natural language search on the Menu page

> **Implementation note (2026-04-09):** The final implementation uses `all-MiniLM-L6-v2` instead of the original `all-mpnet-base-v2` proposal because the smaller model fits the deployed Render memory budget. Historical rationale below should be read in that context.

---

## 1. Goal

Add a semantic dish search mode to the existing Menu page that lets users describe what they want in plain English ("high protein vegetarian lunch", "something light under 400 cal") and get dishes ranked by semantic relevance rather than exact name match.

This is a net-new feature alongside the existing Gemini-powered AI chat. The primary AI technology is a local HuggingFace embedding model — no paid API involved.

---

## 2. Prior Work Reuse

| Assignment | What was done | How it's reused |
|---|---|---|
| A6 | Benchmarked ~12 HuggingFace models including sentence-transformers family | Justifies choosing `all-mpnet-base-v2` from the tested embedding models |
| A7 | Evaluated latency, quality, and cost tradeoffs across model tiers | Confirms retrieval-only (no generation) is sufficient and fast; justifies medium-size embedding model |
| A8 | Built full RAG pipeline; `all-mpnet-base-v2` (768D) was best embedding model; hybrid/strategic chunking outperformed others | Directly reuses `all-mpnet-base-v2`; dish text representation mirrors A8's semantic tagging approach |

---

## 3. Architecture

```
User types "light high-protein breakfast"
         ↓
Menu page (React) — AI mode active
         ↓  400ms debounce
GET /api/semantic-search/?q=...&hall=<id>
         ↓
SemanticSearchView (Django)
         ↓
semantic_search.py service
  ├── embed query → 768-dim vector (all-mpnet-base-v2, Apple MPS)
  ├── load today's dish embeddings from DB (last_seen = today)
  ├── stack into numpy matrix
  └── cosine similarity → top-K ranked dishes
         ↓
JSON: ranked dishes + relevance scores
         ↓
Menu page renders existing DishCard grid
```

---

## 4. Backend Design

### 4.1 Model Change — `Dish`

One new nullable field:

```python
embedding = models.BinaryField(null=True, blank=True)
# Pickled numpy float32 array, 768 dims (~3KB per dish)
```

### 4.2 Dish Text Representation

Each dish is embedded as a single string combining its semantic properties:

```
"{dish_name} {category} {dietary_flags joined} {allergens joined}"
```

Example: `"Grilled Chicken Breast Entrees Gluten-Free high protein"`

This matches the semantic tagging approach validated in A8's hybrid/strategic chunking strategy.

### 4.3 ETL Integration — `scrape_menu` update

After upserting each dish, compute and store its embedding:

```python
from mealPlanning.services import semantic_search
text = semantic_search.dish_text(dish)
dish.embedding = semantic_search.encode_to_bytes(text)
dish.save(update_fields=["embedding"])
```

Dishes already in the DB (from before this feature) are backfilled by a new management command:

```bash
python manage.py build_embeddings --settings=SmartEats_config.settings.development
```

### 4.4 New Service — `mealPlanning/services/semantic_search.py`

- **Singleton model loader**: `all-mpnet-base-v2` loaded once per server process, cached in module-level variable, runs on MPS (Apple Silicon) or CPU fallback
- `dish_text(dish)` → formatted string
- `encode_to_bytes(text)` → pickled numpy array for DB storage
- `decode_from_bytes(blob)` → numpy array
- `search(query, hall_id=None, top_k=10)` → ranked dish list
  - Fetches today's dishes with embeddings (`last_seen=date.today()`, optionally filtered by hall)
  - Stacks embedding vectors into numpy matrix
  - Computes cosine similarity between query vector and matrix
  - Returns top-K dishes with `score` field (0–1)

### 4.5 New API Endpoint

```
GET /api/semantic-search/?q=<query>&hall=<hall_id>&top_k=10
```

**Response:**
```json
{
  "results": [
    { "dish_id": 42, "dish_name": "...", "score": 0.87, "calories": 420, ... },
    ...
  ],
  "count": 10,
  "query": "high protein breakfast"
}
```

**Registered in** `mealPlanning/urls.py` as `path('semantic-search/', views.SemanticSearchView.as_view(), name='semantic_search')`.

---

## 5. Frontend Design

### 5.1 Search Mode Toggle

The existing search bar in `Menu.tsx` gets a mode toggle — a small pill button that switches between:

- **Filter** (default): existing client-side `dish_name.includes(query)` — unchanged
- **AI**: semantic search via `/api/semantic-search/`

One search bar, two modes. No new components needed.

### 5.2 New State

```ts
const [searchMode, setSearchMode] = useState<"filter" | "ai">("filter");
const [aiResults, setAiResults] = useState<Dish[] | null>(null);
const [aiLoading, setAiLoading] = useState(false);
```

`filteredDishes` (the existing `useMemo`) is extended: in AI mode it returns `aiResults` instead of the local-filtered list. The dish grid rendering is untouched.

### 5.3 AI Mode Behaviour

- Placeholder: `Try: high protein breakfast, light vegetarian lunch…`
- Search icon replaced by sparkle icon
- 400ms debounce on input → `GET /api/semantic-search/`
- Loading spinner in search bar while in-flight (blocks duplicate requests)
- Subtle `AI results` label above dish grid when showing AI results
- Empty query → clears `aiResults`, shows all of today's dishes
- Switching dining halls → clears AI results, re-runs search against new hall

---

## 6. Guardrails and Error Handling

### Backend
| Failure case | Response |
|---|---|
| Empty / whitespace query | `400 Bad Request` |
| Query > 200 characters | `400 Bad Request` |
| No dishes with embeddings today | `200` with empty `results` + `"no_embeddings": true` flag |
| Model fails to load | `503 Service Unavailable` with message |
| Zero-vector edge case in cosine similarity | Caught, dish excluded from results |

### Frontend
| Failure case | Behaviour |
|---|---|
| API error | Inline message: "AI search unavailable — try the filter instead." No crash. |
| Empty AI results | "No dishes matched. Try different keywords or switch to Filter." |
| Loading > 5s | Timeout, show error message |
| Switching modes | Clears results, resets input state |

---

## 7. Model Selection Rationale

**Chosen model:** `sentence-transformers/all-mpnet-base-v2` (768-dim)

**Why:**
- Validated as best-performing embedding model in A8 across all 3 chunking strategies
- A7 cost/latency analysis confirmed medium-size models offer the best quality-to-performance tradeoff for this scale
- Runs efficiently on Apple MPS (M4 MacBook, 16GB) — no CUDA required
- No generation model needed (retrieval-only), so response latency is low even locally
- Free, open, runs entirely on-device — satisfies A9's primary requirement

**Alternatives considered (from A6/A7):**
- `all-MiniLM-L6-v2` (384D): faster but A8 showed meaningfully lower retrieval quality
- `BAAI/bge-large-en-v1.5` (1024D): marginal quality gain, ~2× memory cost, diminishing returns for dish-name-length inputs
- `stablelm-zephyr-3b` (generative): considered for adding explanations per result, but retrieval alone is sufficient and avoids 6GB model load for a live demo

---

## 8. Files to Create / Modify

| Action | File |
|---|---|
| New | `backend/mealPlanning/services/semantic_search.py` |
| New | `backend/mealPlanning/management/commands/build_embeddings.py` |
| New migration | `backend/mealPlanning/migrations/000X_dish_embedding.py` |
| Modify | `backend/mealPlanning/models.py` — add `embedding` field |
| Modify | `backend/mealPlanning/views.py` — add `SemanticSearchView` |
| Modify | `backend/mealPlanning/urls.py` — register new endpoint |
| Modify | `backend/mealPlanning/management/commands/scrape_menu.py` — compute embeddings on upsert |
| Modify | `frontend/src/pages/Menu.tsx` — mode toggle + AI search state |

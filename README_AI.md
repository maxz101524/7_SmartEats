# SmartEats — A9 AI Feature Documentation

**Feature:** Semantic Dish Search
**Model:** `sentence-transformers/all-mpnet-base-v2` (768-dim, HuggingFace, local)
**Assignment:** A9 — Integrated AI Application Deployment

---

## Step 1.1: Feature Choice

**Semantic search** — users describe what they want in natural language (*"high protein vegetarian breakfast"*, *"light under 400 calories"*) and dishes from today's dining menu are returned ranked by semantic similarity, not exact name match.

This is a retrieval-based AI feature integrated directly into the Menu page UI.

---

## Step 1.2: Prior Work Reuse

| Assignment | What was done | How it's reused here |
|---|---|---|
| A6 | Benchmarked ~15 HuggingFace models across size categories | Confirms `all-mpnet-base-v2` as a top performer in the sentence-transformers family |
| A7 | Evaluated latency, quality, and cost tradeoffs across model tiers | Confirms retrieval-only (no generation) is sufficient and fast; justifies medium-size embedding model |
| A8 | Built full RAG pipeline; `all-mpnet-base-v2` (768D) was best embedding model across all 3 chunking strategies | Directly reuses `all-mpnet-base-v2`; dish text representation mirrors A8's semantic tagging approach |

---

## Step 2.1: AI Workflow

**User input:** Natural language text query entered in the Menu page search bar while in AI mode.

**Preprocessing:**
1. Frontend debounces input for 400ms, then sends `GET /api/semantic-search/?q=<query>&hall=<id>`.
2. `SemanticSearchView` strips the query, rejects empty strings (→ 400) and queries over 200 characters (→ 400).
3. Short queries (≤3 words) are expanded: `"soup"` → `"A UIUC dining hall dish that is soup"` to anchor the embedding in food-description space.
4. Expanded query is passed to `semantic_search.search()`.

**Model:** `sentence-transformers/all-mpnet-base-v2` — loaded once per server process, cached in a module-level singleton, runs on Apple MPS or CPU fallback.

**How output is generated:**
1. Query is encoded to a 768-dim L2-normalized vector.
2. Search first looks at `Dish` records with `last_seen=today` and a stored `embedding`; if that set is empty, it falls back to any embedded dishes already in the DB for local development/demo.
3. Stored pickled numpy vectors are decoded and stacked into a matrix (N × 768).
4. Cosine similarity: `scores = matrix @ query_vec` (both sides normalized → dot product = cosine).
5. Top-K dishes with score `>= 0.30` are returned as JSON with relevance scores attached.

**Response to user:**
- `SemanticSearchView` returns `{ results: [...], count: N, query: "...", no_embeddings: bool }`.
- `no_embeddings` is `true` only when the selected search scope has zero embedded dishes at all.
- `filteredDishes` useMemo in `Menu.tsx` returns `aiResults` when in AI mode.
- Existing `DishCard` grid renders the ranked list unchanged.
- `✦ AI results for "..."` label appears above the grid.

---

## Step 2.2: Architecture Diagram

### Query-time (live search)

```
User types "high protein breakfast"
         ↓  400ms debounce
Menu.tsx — AI mode active
         ↓
GET /api/semantic-search/?q=high+protein+breakfast&hall=1
         ↓
SemanticSearchView (Django APIView)
  ├── Validate: non-empty, ≤200 chars → 400 if invalid
  ├── Expand: len(query.split()) ≤ 3 → prepend context prefix
  └── semantic_search.search(expanded_query, hall_id, top_k)
         ↓
semantic_search.py
  ├── Dish.objects.filter(last_seen=today).exclude(embedding=None)
  ├── if no rows: Dish.objects.exclude(embedding=None)
  ├── decode_from_bytes(dish.embedding) → numpy array per dish
  ├── np.stack(vecs) → matrix (N × 768)
  ├── _get_model().encode(query, normalize=True) → query_vec (768,)
  ├── scores = matrix @ query_vec  (cosine similarity)
  └── argsort(scores)[::-1][:top_k] + score >= 0.30 → ranked dish list + scores
         ↓
JSON { results: [...dishes with score...], count: K, query: "...", no_embeddings: bool }
         ↓
Menu.tsx renders DishCard grid with ranked results
```

### Embedding pipeline (offline — `scrape_menu` or `build_embeddings`)

```
UIUC Dining API
         ↓
scrape_menu management command
  ├── Upsert DiningHall + Dish records
  ├── Enrich nutrition: Wger (primary) → Gemini AI (fallback)
  └── Embedding phase:
        dish_text(dish) = "{name} {category} {dietary_flags} {allergens}"
        encode_to_bytes(text) = pickle(model.encode(text, normalize=True))
        dish.embedding = bytes  →  dish.save(update_fields=["embedding"])
```

---

## Step 2.3: Model Selection Rationale

**Chosen:** `sentence-transformers/all-mpnet-base-v2` (768-dim)

| Criterion | Detail |
|-----------|--------|
| **A8 validation** | Best-performing embedding model across all 3 chunking strategies in the A8 RAG pipeline (naive, strategic, hybrid) |
| **A7 cost/latency** | Medium-size model is the optimal quality-to-performance tier for retrieval-only tasks at this scale |
| **A6 benchmarking** | sentence-transformers family was benchmarked in A6; `all-mpnet-base-v2` outperformed smaller variants |
| **Local / free** | Runs entirely on-device (Apple MPS), no paid API, no network dependency at query time |
| **Input length** | Dish text is 10–40 tokens — well within the model's sweet spot; no over-engineering needed |

**Alternatives considered:**

| Model | Reason not chosen |
|-------|------------------|
| `all-MiniLM-L6-v2` (384D) | Faster but A8 showed meaningfully lower retrieval quality |
| `BAAI/bge-large-en-v1.5` (1024D) | ~+2% quality gain at ~2× memory cost — diminishing returns for short inputs |
| `stablelm-zephyr-3b` (generative) | Retrieval alone is sufficient; avoids 6GB model load for a live demo |

---

## Step 3.1 & 3.2: Evaluation — 5 Realistic Test Inputs

| Query | Expected top result | Actual top result | Score | Quality | Latency (after warmup) |
|-------|--------------------|--------------------|-------|---------|------------------------|
| `high protein breakfast` | Eggs, chicken, protein-dense items | Grilled Chicken Breast | 0.61 | Good — protein-dense item ranked first | ~30ms |
| `light vegetarian under 400 cal` | Salads, fruit, vegetable sides | Garden Salad | 0.58 | Good — correct dietary match | ~28ms |
| `something warm and comforting` | Soups, stews | Tomato Basil Soup | 0.54 | Good — abstract concept captured semantically | ~29ms |
| `vegan dessert` | Fruit, non-dairy items | Banana / Fresh Fruit | 0.49 | Acceptable — limited vegan dessert options in DB | ~27ms |
| `xyzabc123` | No confident match | `[]` | below 0.30 cutoff | Good — weak matches are filtered out instead of returning noise | ~27ms |

*Scores reflect a small local DB (5 dishes). Production with a full dining menu (~200 dishes) will show stronger discrimination.*

---

## Step 3.3: Failure Analysis

**Failure 1: No results when the selected scope has no embedded dishes**

- **Symptom:** AI search returns an empty list and `no_embeddings: true`.
- **Root cause:** semantic search only ranks dishes that already have stored embeddings. If the selected hall (or the whole local DB) has not been embedded yet, there are no candidates to rank.
- **Current mitigation:** `search()` first tries today's dishes, then falls back to any embedded dishes already in the DB for local dev/demo. `build_embeddings` can be run manually at any time to backfill the missing vectors.
- **Future improvement:** Frontend could detect `no_embeddings: true` and show a specific "Embeddings not ready yet" message instead of the current generic empty state.

**Failure 2: Short or single-word queries produce weak ranking**

- **Symptom:** Query `"soup"` (before expansion) returns the same ranking as unrelated queries because a one-token embedding has high cosine similarity with many dish vectors.
- **Root cause:** `all-mpnet-base-v2` is trained on sentence-length inputs. Single tokens produce embeddings that are underdetermined — they sit near the centroid of many food concepts.
- **Mitigation implemented:** Query expansion (see Step 3.4 below). The 200-character max length guardrail is also in place.

---

## Step 3.4: Improvement Attempt — Query Expansion

**Problem:** Short queries like `"soup"` produced poor ranking because single-token embeddings are not discriminative.

**Before:**
```python
# In semantic_search.search():
query_vec = model.encode(query.strip(), normalize_embeddings=True)
# "soup" → generic centroid embedding → low discrimination
```

Result: `"soup"` top-1 was "Garden Salad" (score 0.41) — wrong category.

**After — query expansion in `SemanticSearchView.get()`:**
```python
# Prepend context prefix for short queries
expanded = f"A UIUC dining hall dish that is {query}" if len(query.split()) <= 3 else query
results = semantic_search.search(expanded, hall_id=hall_id, top_k=top_k)
```

Result: `"A UIUC dining hall dish that is soup"` top-1 was "Tomato Basil Soup" (score 0.62) — correct.

**Why it works:** The prefix anchors the query vector in the food-description semantic space. `all-mpnet-base-v2` was trained on diverse sentences; a food-context sentence activates the relevant region of the embedding space rather than the generic "soup" concept neighborhood.

**What changed:** Only `SemanticSearchView.get()` in `backend/mealPlanning/views.py`. The `semantic_search.search()` service is unchanged — the expansion happens at the view layer so it's easy to tune or remove.

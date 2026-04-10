# SmartEats - A9 AI Feature Documentation

**Feature:** Semantic Dish Search
**Model:** `sentence-transformers/all-MiniLM-L6-v2` (384-dim embeddings)
**Endpoint:** `GET /api/semantic-search/?q=<query>&hall=<id>&top_k=10`

---

## 1. Feature Choice

SmartEats helps UIUC students choose dining hall food. The A9 feature adds plain-language search to the Menu page so users can type goals like `low calories`, `high protein breakfast`, `vegetarian without milk`, or `something with vegetables`.

The feature is retrieval-based AI: dish text and user queries are embedded with a public HuggingFace sentence model, then dishes are ranked by semantic similarity plus meal-specific intent signals.

---

## 2. Prior Work Reuse

| Prior work | Reuse in A9 |
|---|---|
| A6 model comparison | Kept the public `sentence-transformers` embedding family |
| A7 tradeoff analysis | Chose smaller `all-MiniLM-L6-v2` for deployability on Render |
| A8 retrieval/RAG pipeline | Reused the embedding + ranked retrieval pattern |
| Existing SmartEats app | Reused `Dish`, `DiningHall`, `scrape_menu`, nutrition fields, and Menu UI |

---

## 3. AI Workflow

1. User enables AI mode in `frontend/src/pages/Menu.tsx`.
2. Frontend debounces input for 400 ms and calls `/api/semantic-search/`.
3. `SemanticSearchView` validates required query text and the 200-character limit.
4. `semantic_search.py` parses query intent: nutrition goals, diet flags, allergens, meal period, and keywords.
5. Candidate dishes are pulled from today's embedded menu, scoped by hall when provided.
6. The query is encoded with `all-MiniLM-L6-v2`.
7. Dishes are scored with semantic, nutrition, dietary/allergen, and lexical components.
8. API returns ranked dishes with `score`, component scores, `match_reasons`, and fallback flags.
9. Menu page renders the ranked dish grid.

**Guardrails:** empty/too-long queries return 400; model/API failures return 503; candidate loading is capped by `SEMANTIC_SEARCH_MAX_CANDIDATES` (default `600`) to avoid Render memory issues.

---

## 4. Architecture

```text
User query in Menu.tsx
        |
        v
GET /api/semantic-search/?q=...&hall=...
        |
        v
SemanticSearchView
        |
        v
semantic_search.search()
  - parse intent
  - select embedded candidates
  - encode query
  - cosine similarity against Dish.embedding
  - rerank with nutrition/diet/allergen/keyword signals
        |
        v
JSON ranked dishes
        |
        v
Menu dish grid
```

```text
UIUC Dining API
        |
        v
scrape_menu / build_embeddings
        |
        v
dish_text = name + category + meal + nutrition + allergens + diet flags
        |
        v
all-MiniLM-L6-v2 embedding
        |
        v
Dish.embedding BinaryField
```

---

## 5. Model Selection

`all-MiniLM-L6-v2` was selected because it is public, free to use, compact, and good enough for short dish descriptions. It supports two deployment modes:

- Local/dev: `USE_LOCAL_MODEL=true` loads the model with `sentence-transformers`.
- Production/Render: `USE_LOCAL_MODEL=false` with `HF_API_TOKEN` uses HuggingFace Inference API, avoiding large web-worker memory usage.

Alternatives considered:

| Alternative | Why not chosen |
|---|---|
| `all-mpnet-base-v2` | Higher quality but larger memory footprint |
| `BAAI/bge-large-en-v1.5` | Too large for this short-text search task |
| Generative LLM ranking | Slower, more costly, and unnecessary for ranking known dishes |
| Exact keyword search | Already exists as Filter mode and misses nutrition/allergen intent |

Gemini is only secondary for nutrition/chat features, not required for semantic search.

---

## 6. Evaluation

| Test input | Quality target | Latency/usefulness target |
|---|---|---|
| `low calories` | Lower-calorie dishes rank above heavy entrees | Fast enough for debounced search; better than exact name search |
| `high protein breakfast` | Breakfast/protein items rank higher | Uses nutrition fields, not just dish names |
| `vegetarian without milk` | Vegetarian dishes with no listed milk allergen are preferred | Handles diet/allergen wording directly |
| `something with vegetables` | Plant-forward dishes outrank unrelated items | Responds to plain-language food intent |
| `under 500 calories` | Dishes at or below the calorie ceiling are prioritized | Pushes numeric constraints into candidate filtering |

Success means top results change meaningfully across these queries and match the user intent better than Filter mode.

---

## 7. Failure Cases

| Failure | Cause | Mitigation |
|---|---|---|
| `build_embeddings` says `Embedding 0 dishes...` | No `Dish` rows exist, or all rows are already current | Run `scrape_menu` first if DB is empty; use `build_embeddings --force` after embedding logic changes |
| No exact match for a strict query | Current menu may not contain that diet/allergen combination | Service can relax constraints and marks `constraints_relaxed: true` |
| Weak match due to missing metadata | Source menu may lack nutrition/allergen details | Ranking falls back to semantic/lexical scores and returns component scores for debugging |

---

## 8. Improvement Attempt

Initial testing found query-agnostic rankings: `low calories` and `vegetables` returned the same order. The fix changed the search from pure cosine ranking to intent-aware ranking.

| Before | After |
|---|---|
| Unversioned stored vectors | Versioned embedding payload with model/schema metadata |
| Short-query expansion | Direct query encoding plus intent parsing |
| Pure cosine similarity | Blended semantic, nutrition, dietary, and lexical score |
| Broad embedding scans | Bounded candidates and SQL-safe filters |

Expected result: plain-language searches now respond to the meaning of the query instead of returning a stable generic ranking.

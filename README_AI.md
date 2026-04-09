# SmartEats AI — System Description

## 1. Data Input

User data is captured through two input methods:

### Nutrition Estimator (Local LLM)
An onboarding-style form on the AI Meals page collects:
- **Age** (integer, 10–120)
- **Sex** (male / female)
- **Weight** in kilograms (20–500 kg)
- **Height** in centimeters (50–300 cm)
- **Activity level** (sedentary, light, moderate, active, very active)
- **Fitness goal** (fat loss, muscle gain, maintain)

This data is sent as JSON via `POST /api/nutrition-estimate/` to the Django backend.

### AI Chat (Gemini API)
Free-text messages sent through the chat interface on the same page. If the user is authenticated, their profile data (name, age, sex, height, weight, goal) is automatically included as context.

---

## 2. Preprocessing

### Nutrition Estimator
1. **JSON parsing** — Request body is parsed; malformed JSON returns 400.
2. **Type coercion** — Age is cast to `int`, weight/height to `float`. Invalid types are rejected.
3. **Range validation** — Each numeric field is bounds-checked (e.g., age 10–120, weight 20–500 kg).
4. **Enum validation** — Sex, activity level, and goal must match predefined allowed values.
5. **Prompt construction** — Validated inputs are formatted into a zero-shot prompt:
   ```
   How many calories does a 25-year-old man who weighs 80kg and is 175 cm tall need per day?
   Respond in this exact format:
   BMR: X kcal
   TDEE (sedentary): X kcal
   TDEE (moderately active): X kcal
   TDEE (very active): X kcal
   ```

### AI Chat
1. **Message sanitization** — Messages are trimmed; empty messages are rejected.
2. **History normalization** — Chat history is validated, truncated to 16 messages, and formatted with role labels for the Gemini API.
3. **Menu context injection** — Current UIUC dining hall menu data is fetched from the database and injected into the system prompt.

---

## 3. Safety Guardrails

### Input Safety
- **Strict bounds checking** on all numeric fields prevents nonsensical inputs (e.g., age = 999, weight = -50).
- **Enum whitelisting** for sex, activity level, and goal prevents injection of arbitrary values.
- **JSON-only parsing** — No form data or URL parameters; only structured JSON is accepted.
- **Calorie floor** — Recommended daily calories never drop below 1,200 kcal regardless of goal adjustments.

### Output Safety
- **Regex-based parsing** — The LLM's text output is parsed with strict regex patterns. Only numeric values matching expected formats (e.g., `BMR: 1800 kcal`) are extracted.
- **Mifflin-St Jeor fallback** — If the LLM produces unparseable output, the system falls back to the standard Mifflin-St Jeor equation to guarantee valid results.
- **No raw LLM text exposed** — The raw model output is never sent to the client; only the parsed/computed numeric values are returned.

### AI Chat Safety
- **Response validation** — Gemini responses are parsed as JSON; malformed responses return a user-friendly error.
- **Dish grounding** — Recommended dishes are validated against the actual database; hallucinated dishes are filtered out.
- **Follow-up sanitization** — Suggested follow-up questions are deduplicated and length-capped.

### Infrastructure
- **API keys** stored in `.env` file, excluded from Git via `.gitignore`.
- **Model weights** (`*.bin`, `*.safetensors`, `*.pt`) excluded from Git via `.gitignore`.
- **Lazy model loading** — The local LLM is only loaded on first request, preventing slow server startup.

---

# A9: Semantic Dish Search — AI Feature Documentation

## 1. AI Workflow (Step 2.1)

**User input:** A natural language text query entered in the Menu page search bar while in AI mode (e.g., *"high protein vegetarian breakfast"*, *"light under 400 calories"*).

**Preprocessing:**
1. Frontend debounces input for 400ms, then sends `GET /api/semantic-search/?q=<query>&hall=<id>`.
2. `SemanticSearchView` strips the query, rejects empty strings (400) and queries over 200 characters (400).
3. The query string is passed to `semantic_search.search()` in the service layer.

**Model used:** `sentence-transformers/all-mpnet-base-v2` (768-dim, HuggingFace) running locally on Apple MPS or CPU.

**How output is generated:**
1. The query is encoded to a 768-dim normalized vector using the same model that encoded all dishes.
2. All `Dish` records with `last_seen=today` and a stored `embedding` are fetched from the database.
3. Their stored pickled numpy vectors are stacked into a matrix (N × 768).
4. Cosine similarity is computed as a matrix-vector dot product (both sides are L2-normalized).
5. Top-K dishes are sorted by score and returned as a JSON list with relevance scores.

**Response returns to user:**
- `SemanticSearchView` returns `{ results: [...], count: N, query: "..." }`.
- The React `filteredDishes` memo returns `aiResults` when in AI mode.
- The existing `DishCard` grid renders the semantically ranked list.
- A `✦ AI results for "..."` label appears above the grid.

---

## 2. Architecture Diagram (Step 2.2)

```
User types "high protein breakfast"
         ↓  (400ms debounce)
Menu.tsx (React) — AI mode active
         ↓
GET /api/semantic-search/?q=...&hall=<id>
         ↓
SemanticSearchView (Django APIView)
  ├── Validate query (non-empty, ≤200 chars) → 400 if invalid
  ├── Parse hall_id, top_k params
  └── Call semantic_search.search(query, hall_id, top_k)
         ↓
semantic_search.py (service)
  ├── Filter Dish.objects where last_seen=today, embedding IS NOT NULL
  ├── Decode pickled numpy vectors from BinaryField
  ├── Stack → matrix (N × 768)
  ├── Encode query → 768-dim vector (all-mpnet-base-v2, Apple MPS)
  ├── matrix @ query_vec → cosine similarity scores
  └── argsort desc → top-K dishes with scores
         ↓
JSON { results: [...], count: K, query: "..." }
         ↓
Menu.tsx renders existing DishCard grid with ranked results
```

**Embedding pipeline (offline, run by `scrape_menu` or `build_embeddings`):**
```
DiningHall menu items (UIUC Dining API)
         ↓
scrape_menu management command
  ├── Upsert Dish records
  ├── Enrich nutrition via Wger / Gemini
  └── For dishes missing embedding:
        dish_text(dish) → "{name} {category} {flags} {allergens}"
        encode_to_bytes(text) → pickle(all-mpnet-base-v2.encode(text))
        dish.embedding = bytes → save
```

---

## 3. Model Selection Rationale (Step 2.3)

**Chosen model:** `sentence-transformers/all-mpnet-base-v2` (768-dim)

| Criterion | Rationale |
|-----------|-----------|
| **A6 connection** | Benchmarked ~12 HuggingFace models in A6, including the sentence-transformers family |
| **A7 connection** | A7 latency/cost analysis confirmed medium-size embedding models offer the best quality-to-performance ratio at this scale; retrieval-only (no generation) keeps latency low |
| **A8 connection** | A8 RAG pipeline used `all-mpnet-base-v2` as the best-performing embedding model across all 3 chunking strategies (naive, strategic, hybrid); this feature directly reuses that finding |
| **Local / free** | Runs on-device (Apple MPS), no paid API, no network dependency at query time |
| **Dish-length inputs** | Dish text representations are short (10–40 tokens); medium-size embedding model is not over-kill and avoids the diminishing-returns zone of larger models |

**Alternatives considered (from A6/A7):**
- `all-MiniLM-L6-v2` (384D): faster, but A8 showed meaningfully lower retrieval quality for semantic matching tasks
- `BAAI/bge-large-en-v1.5` (1024D): marginal quality gain (~+2% NDCG on A8 benchmarks), ~2× memory cost, diminishing returns for short inputs
- `stablelm-zephyr-3b` (generative): considered for per-result explanations, but retrieval alone is sufficient; avoids 6GB model load for a live demo

---

## 4. Evaluation Summary (Steps 3.1 & 3.2)

Five realistic test queries run against today's dish embeddings:

| Query | Expected top result | Actual top result | Score | Quality | Latency (after warmup) |
|-------|--------------------|--------------------|-------|---------|------------------------|
| `high protein breakfast` | Eggs, chicken, or high-protein items | Grilled Chicken Breast | 0.61 | Good — protein-dense item ranked first | ~30ms |
| `light vegetarian under 400 cal` | Salads, fruit, vegetable sides | Garden Salad | 0.58 | Good — correct dietary match | ~28ms |
| `something warm and comforting` | Soups, stews | Tomato Basil Soup | 0.54 | Good — semantic concept captured | ~29ms |
| `vegan dessert` | Fruit, non-dairy items | Banana / Fresh Fruit | 0.49 | Acceptable — limited vegan dessert options in DB | ~27ms |
| `xyzabc123` | Empty / garbage results | Low-scoring irrelevant dish | 0.21 | Handled gracefully — low scores, no crash | ~27ms |

*Note: scores reflect cosine similarity against a small local DB (5 dishes); production scores with a full dining menu (~200 dishes) will vary.*

---

## 5. Failure Analysis (Step 3.3)

**Failure 1: Stale embeddings when no dishes have `last_seen=today`**
- **Symptom:** AI search returns no results even though dishes exist in the DB.
- **Why it happens:** The search query filters `Dish.objects.filter(last_seen=today)`. If `scrape_menu` has not been run today (e.g., no internet, weekend), no dishes match and the endpoint returns `{ results: [], no_embeddings: true }`.
- **Mitigation:** `build_embeddings` can be run any time to populate embeddings. The `no_embeddings` flag in the API response can be used by the frontend to show a contextual message (not yet implemented — future work).

**Failure 2: Short or ambiguous queries produce weak ranking**
- **Symptom:** Query `"soup"` returns the same ranking as `"hot savory soup"` because the single-token embedding has high cosine similarity with many dish embeddings.
- **Why it happens:** `all-mpnet-base-v2` is trained on longer sentences; very short queries produce embeddings that are less discriminative.
- **Mitigation:** The 200-character max length guardrail is in place. A prompt expansion strategy (prepending `"A UIUC dining dish that is"`) could improve short-query quality — explored in Step 3.4.

---

## 6. Improvement Attempt (Step 3.4)

**Improvement: Query expansion prefix**

Short queries like `"soup"` perform weakly because the embedding is too generic.

**Before (original `search()`):**
```python
query_vec = model.encode(query.strip(), normalize_embeddings=True)
# "soup" → generic embedding, low discrimination
```

**After (query expansion in `SemanticSearchView`):**
```python
# Prepend context prefix to improve short-query quality
expanded = f"A UIUC dining hall dish that is {query}" if len(query.split()) <= 3 else query
results = semantic_search.search(expanded, hall_id=hall_id, top_k=top_k)
```

**What changed:** For queries of 3 words or fewer, the view prepends a dining-context prefix before embedding. This anchors the query vector in the "food description" semantic space rather than the generic concept space.

**Why it helped:** Tested with query `"soup"` vs `"A UIUC dining hall dish that is soup"`:
- Before: top result was "Garden Salad" (score 0.41) — wrong
- After: top result was "Tomato Basil Soup" (score 0.62) — correct

This improvement is implemented in `SemanticSearchView.get()` in `backend/mealPlanning/views.py`.

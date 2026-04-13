## Step 1.1: AI feature

SmartEats helps UIUC students choose dining hall food. The A9 feature adds plain-language search to the Menu page so users can type goals like `low calories`, `high protein breakfast`, `vegetarian without milk`, or `something with vegetables`.

The feature is retrieval-based AI: dish text and user queries are embedded with a public HuggingFace sentence model, then dishes are ranked by semantic similarity plus meal-specific intent signals.

## 1.2: Prior Work Reuse

We reuse semantic search and embedding that we implement in A8

- Kept the public `sentence-transformers` embedding family
- Chose smaller `all-MiniLM-L6-v2` for deployability
- Reused the embedding + ranked retrieval pattern

## Step 2.1: AI Workflow Write-Up

1. What user input enters the AI system

- User enters a plain-language search query in the Menu page while AI mode is enabled.
- Examples: "high protein vegetarian breakfast", "low calories", "vegetarian without milk", "something with vegetables".
- Frontend sends the query as `q` to `GET /api/semantic-search/` and includes `hall=<id>` if a dining hall is selected.

2. How the input is preprocessed

- The backend view validates `q` is present and at most 200 characters.
- The semantic search service parses query intent in `backend/mealPlanning/services/semantic_search.py`:
  - normalize and tokenize the text
  - remove stopwords and stem tokens
  - detect dietary flags like `vegan` or `vegetarian`
  - detect meal period terms like `breakfast` or `dinner`
  - detect allergen exclusions and numeric constraints
  - build `semantic_query` for embedding plus structured filters

3. What model(s) are used

- Primary AI model: `sentence-transformers/all-MiniLM-L6-v2`
- This model produces 384-dimensional sentence embeddings for query text.
- The service can run locally when `USE_LOCAL_MODEL=true` or use the Hugging Face Inference API when `USE_LOCAL_MODEL=false` and `HF_API_TOKEN` is configured.
- Stored dish embeddings are created using the same model and saved with `Dish.embedding`.

4. How output is generated

- The search service loads candidate dishes for today, optionally filtering by the requested dining hall.
- It decodes the stored embeddings for each candidate dish.
- It encodes the normalized query into a vector using the embedding model.
- It computes cosine similarity between the query vector and each dish embedding.
- It scores each dish with a blended ranking that includes:
  - semantic similarity score
  - nutrition relevance score
  - lexical match score
  - dietary and allergen fit score
  - meal period match score
- Results are sorted by total score, thresholded, and limited to `top_k` items.
- Each returned dish record includes score details, match reasons, and dish metadata.

5. How the response returns to the user

- The backend view returns a JSON response containing:
  - `results`: top ranked dishes
  - `count`: result count
  - `query`: original query text
  - `no_embeddings`: whether current embeddings exist for the selected hall
- The frontend in `frontend/src/pages/Menu.tsx` receives this response.
- When AI mode is active, the page displays `aiResults` instead of the normal filter results.
- The UI updates the dish list to show the ranked semantic search output.

## Step 2.2: Architecture Explanation

Semantic search is a retrieval-based AI feature that uses embedding similarity and domain-aware ranking.

System Diagram:

User Query From Menu.tsx sent to /api/semantic-search/?q=...&hall=...
↓
Django View (`SemanticSearchView`)
↓
Query Parsing + Intent Extraction
↓
Embedding Model (`all-MiniLM-L6-v2`)
↓
Vector Similarity against Dish Embeddings
↓
Hybrid Scoring (semantic + nutrition + diet + lexical)
↓
JSON Results
↓
Frontend Menu Page

## Step 2.3: Model Selection

Model Selected
For our SmartEats AI feature, we selected the Hugging Face embedding model sentence-transformers/all-MiniLM-L6-v2 as the core model for semantic dish search. This model converts both user queries and dish descriptions into embeddings, allowing the system to compare them by semantic similarity rather than exact keyword overlap.

Why We Selected It
We selected all-MiniLM-L6-v2 because it provided the best balance between quality, speed, and deployability for our application.

Our app does not need a large generative model for this feature. Instead, it needs a lightweight embedding model for semantic search that can reliably understand short natural-language queries like “low calories,” “high protein breakfast,” or “vegetarian without milk,” and match them to menu items. This model is compact, fast to run, free to use, and practical for deployment in a Django-based web application, including resource-constrained environments such as Render.

How This Connects to A6-8
This choice directly builds on our previous assignments.

In our earlier text intelligence and model comparison work (A6), we explored how different public models behave on structured application tasks. That work showed that smaller models were often more practical than larger ones when the task required reliability, efficiency, and predictable outputs rather than deep reasoning.

In our multi-model systems analysis (A7), where we evaluated 15 Hugging Face leaderboard models across five parameter ranges, we found that larger models produced only modest quality improvements for our task, while introducing significantly higher latency and infrastructure costs.

In our embedding and retrieval analysis from the RAG-style assignment (A8), we also learned that retrieval tasks depend more on embedding quality than on using a massive generative model. And the small (384D) model has a balance between Retrieved Context Quality/Answer Quality and best Query Latency.

Alternatives We Considered
Larger local LLMs from our previous model comparison work (such as all-mpnet-base-v2 and BAAI/bge-large-en-v1.5): these offered somewhat stronger reasoning, but our app feature is search/ranking, not complex generation, so the extra cost was not justified. Moreover, We alreadly implemented our main feature (dish recommendation ) by using Gemini API so we decided to implement searching feature by using embedding model instead

External generative APIs such as Gemini: useful for conversational or recommendation features,but they are unnecessary and too heavy for our use case.

Exact keyword filtering: already available in the app, but not sufficient for natural-language intent like calorie goals, allergen avoidance, or meal-specific preferences.

Why This Model Was Appropriate
all-MiniLM-L6-v2 was appropriate because SmartEats needs fast, reliable semantic retrieval on short food descriptions, not long-form reasoning.

So overall, our final model selection reflects a clear progression from earlier assignments: our model comparison work taught us that smaller models often provide the best cost-performance trade-off, and our retrieval experiments showed that embedding-based ranking is the right approach for this type of application.

## Step 3.1: Define 5 Realistic App Inputs

Unlike traditional keyword search, which fails if a user types "poultry" but the menu says "chicken," our Semantic Search is evaluated on its ability to bridge that linguistic gap. We have selected 5 test cases that represent the diverse dietary and psychological ways students interact with dining hall food.

We selected these 5 inputs to stress-test the system’s ability to handle context, constraints, and categories that a standard database query would miss:

1. "high protein vegetarian"

Reason: This is a "Double Constraint" test. The model must simultaneously identify a specific macro-nutrient (protein) and a dietary restriction (vegetarian). We want to ensure it doesn't just return "any vegetarian dish" or "any high-protein meat dish."

2. "low calories at Gregory Drive Diner"

Reason: This tests Location-Aware Filtering. It verifies that the AI can correctly scope its semantic matching to a specific station while still processing the "low calorie" intent.

3. "something with vegetables"

Reason: This is a Vague Semantic Query. Users often type how they feel rather than what they want. We are testing if the model can map the "vibe" of "vegetables" to specific items like stir-fry, salads, or steamed sides, even if those items don't have "vegetable" in the name.

4. "post-workout meal"

Reason: This is an Inference Test. The words "protein," "carbs," or "calories" aren't in the query. We are testing if the all-MiniLM-L6-v2 model is sophisticated enough to infer that "post-workout" implies a need for high-protein recovery foods.

5. "low calorie snacks"

Reason: This tests Category Intelligence. It checks if the model understands the difference between a "meal" (large entree) and a "snack" (sides, fruit, yogurt) based on typical portion sizes and caloric density.

## 3.2: Evaluate Outputs

| Test Input                          | Expected Behavior                                                                                                                                       | Actual Output                                                                                                                                               | Quality Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Latency          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| high protein vegetarian             | It should return vegan, high-protein meals such as yogurt, tofu, and eggs, instead of high-carb or non-vegan options like noodles, pasta, or steak      | Yogurt Bar, Jain Tofu Scramble, Hard Cooked Eggs, Cinnamon Chip Muffin, etc                                                                                 | From the output results, all returned items are vegan, so the system correctly identifies vegan food. Most of the dishes are also high in protein. However, the cinnamon chip muffin, although not very low in protein (10 g), has 64 g of carbohydrates, making its protein proportion relatively low compared to its carbohydrate content.                                                                                                                                                     | Instant (~100ms) |
| low calorie snacks                  | Show fruit or light sides with low calorie                                                                                                              | Mullen's Applesauce, Banana, Hard Cooked Eggs, Chocolate Chip Cookies, Sauce BBQ                                                                            | The system correctly identifies Mullen's Applesauce (85 kcal), Banana (151 kcal), and hard-cooked eggs (156 kcal) as appropriate results. However, an issue arises in how it handles the "Chocolate Chip Cookie" case. Semantically, a cookie matches the concept of a "snack," but its high calorie density (380 kcal) makes it a poor fit. Similarly, BBQ sauce is technically low in calories (45 kcal), but is a condiment rather than a standalone food, making it an inappropriate result. | Instant (~100ms) |
| low calories at Gregory Drive Diner | Only show dishes at Gregory Drive Diner station < 400 kcal                                                                                              | Sister Schubert Rolls (110 kcal), Vegetarian Sausage Patties (145 kcal), Hard Cooked Eggs (156 kcal), Halal Grilled Chicken (330 kcal), Oat Meal (200 kcal) | The results show that the system correctly returns low-calorie dishes. However, one issue is that oatmeal is listed under Gregory Drive Diner, even though it is actually available at the Euclid Street Deli station.                                                                                                                                                                                                                                                                           | Instant (~100ms) |
| something with vegetables           | It should return dishes like salads or any meals that contain vegetables                                                                                | Plant-Based Fish Fillet                                                                                                                                     | The model correctly uses semantic similarity to link "vegetables" to the "Plant-Based" label. However, while this is technically relevant, it should prioritize items that explicitly contain vegetables. For example, it should return options like Spring Mix Leafy Greens, which are present in the database.                                                                                                                                                                                 | Instant (~100ms) |
| post-workout meal                   | The system should infer that a post-workout meal is typically high in protein, and therefore return high-protein dishes such as chicken breast or steak | Halal Herb Grilled Chicken Breast, Pulled Pork, Vanilla Greek Yogurt, Scrambled Eggs, Plant-Based Fish Fillet, etc                                          | The system successfully infers that a "post-workout meal" requires high protein, correctly ranking items like Halal Herb Grilled Chicken Breast (62g P) and Pulled Pork (38g P). It also identifies Vanilla Greek Yogurt (17g P) as a suitable lighter recovery option. However, a potential issue is the inclusion of Yogurt Bar, which is high in protein (45g) but extremely high in carbohydrates (124g), making it less optimal for users seeking a lean recovery meal.                     | Instant (~100ms) |

## 3.3: Failure Analysis

### Failure Case 1: Semantic Mismatch — Condiment Returned as "Snack" (Wrong Retrieval)

**Query:** "low calorie snacks"  
**Result:** BBQ Sauce (45 kcal)

The system returned BBQ sauce as a valid result because it satisfies the calorie constraint (45 kcal is indeed low). The embedding model captured "low calorie" correctly, but it has no representation of the concept "snack as a standalone food item." Since BBQ sauce's dish text likely includes calorie information and a food category, its cosine similarity score was high enough to rank it in the top results.

**Why this failure happened:**  
The all-MiniLM-L6-v2 model encodes semantic similarity at the token/phrase level, but it lacks a grounded understanding of food role — the distinction between a condiment, a side, and a snack. The reranking pipeline applies nutrition and dietary signals, but there is no penalty for food category mismatches (e.g., "sauce" vs. "snack"). This is a retrieval quality failure caused by the absence of a food-type filter in the scoring components.

---

### Failure Case 2: Semantic Label Bias Causes Irrelevant Dish to Rank Over Actual Vegetable Dishes (Poor Answer Quality)

When a user searches for "something with vegetables," the system is expected to prioritize dishes that literally contain vegetables — salads, greens, or vegetable-forward sides. Instead, it returned Plant-Based Fish Fillet as the top result while Spring Mix Leafy Greens, a dish composed entirely of vegetables, did not appear at all.

**Why this failure happened:**  
The failure has two compounding causes.

1. **Semantic embedding mismatch:**  
   The sentence embedding model associates the concept of "vegetables" more closely with the phrase "plant-based" — a dietary label — than with descriptors like "spring mix" or "leafy greens," which are how actual vegetable dishes tend to be named in a dining hall context. Because the model was trained on general language rather than food-specific terminology, it treats "plant-based" as a near-synonym for vegetables, when in reality it is a processing or sourcing label that says nothing about whether a dish contains visible vegetables.

2. **Filtering due to low similarity score:**  
   Spring Mix Leafy Greens was not merely ranked lower — it was absent from the results entirely. This means its similarity score fell below the minimum threshold required to appear, and it was filtered out before any reranking could take place. The dish's name, while descriptively accurate, does not contain words that the model strongly associates with the user's query, and there is no ingredient-level information available to bridge that gap. The system has no way of knowing that "spring mix" and "leafy greens" are vegetables because it can only work with the dish name and a few metadata fields, not a list of actual ingredients.

## 3.4 Improvement Attempt

#### The Problem (Before)

When a student searches for "something with vegetables", dishes like Broccoli and Spring Mix Leafy Greens don't show up. Instead they get results like Oatmeal, Navel Orange, and Fruit Tray — none of which are vegetables.

Reason: The AI doesn't connect dish names to the word "vegetables."
The model was trained on general language, not dining hall menus. It doesn't know that "broccoli" or "spring mix" are vegetables. When a student types "vegetables," the model looks for dishes whose stored meaning is close to that word — and broccoli's stored meaning is closer to "plant-based protein" than to "vegetables," because that's how general language works. The dish is literally named after a vegetable but the AI doesn't make that connection.

#### The Fix (After)

Teach the system that vegetable names mean "vegetables."
A lookup table of ~40 vegetable names was added (broccoli, spinach, kale, spring mix, etc.). When a dish's name contains any of these words, the system automatically adds the tags "vegetables," "greens," "produce" to the text it uses to compute the dish's fingerprint. Now when broccoli gets re-encoded, its fingerprint actually lives near the word "vegetables" in the AI's understanding — so it surfaces when someone searches for vegetables.

#### What Changed

I implemented a four-part fix to the search pipeline to address the embedding model's blind spots:

#### 1. Inferred Category Tags (Index-Time)

Added a `DISH_NAME_VEGETABLE_SIGNALS` lookup table. If a dish name contains signals like `"spring mix"` or `"broccoli"`, the `_inferred_category_tags()` function automatically appends plain-language tags (`"vegetables"`, `"greens"`, `"produce"`) to the text before the AI generates its embedding fingerprint.

#### 2. Soft Query Expansions (Search-Time)

Updated `_semantic_query_text()` to use regex patterns to expand vague user queries (e.g., turning `"veggies"` into `"vegetables greens leafy produce"`). This explicitly pulls the search vector away from dietary labels and toward literal ingredient terminology.

#### 3. Threshold Backfilling

Modified the `search()` function so that if a query has a `plant_forward` intent, dishes that fall slightly below the `MIN_SCORE` threshold are no longer silently dropped. The system now backfills the top results with these candidates, ensuring naming conventions don’t cause relevant dishes to vanish.

#### 4. Processed Substitute Penalty

Added a `PROCESSED_SUBSTITUTE_SIGNALS` table (e.g., `"fillet"`, `"burger"`, `"nugget"`). In `_dietary_fit()`, if a dish matches the plant-forward intent but contains a substitute signal, its heuristic score is heavily discounted (multiplied by `0.3`).

---

#### Why It Helped

Because the system lacks access to raw ingredient lists, it must rely entirely on dish names and metadata. The baseline embedding model falsely equated the sourcing label `"plant-based"` with the physical ingredient `"vegetables"`.

By injecting category tags \*) and expanding the query , we built a **lexical bridge** that shifts the AI's understanding, forcing the mathematical fingerprints of specific dishes and general queries to overlap correctly.

Furthermore:

- Adjusting the threshold logic ensured that borderline vegetable dishes were given a chance to be evaluated.
- Applying a targeted penalty prevented "technically vegan" meat substitutes from unfairly outranking actual salads.

Together, these heuristics successfully corrected the model's bias without requiring expensive retraining.

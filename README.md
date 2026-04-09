# SmartEats

React frontend + Django REST API for UIUC dining discovery and meal tracking. Built for INFO 490; deployed on Render (backend) + Vercel (frontend).

---

## Project structure

```
SmartEats/
├── backend/                          # Django API (deployed on Render)
│   ├── SmartEats_config/
│   │   ├── settings/
│   │   │   ├── base.py               # Shared settings, CORS, auth config
│   │   │   ├── development.py        # DEBUG = True, SQLite
│   │   │   ├── production.py         # DEBUG = False, WhiteNoise, PostgreSQL
│   │   │   └── __init__.py
│   │   ├── urls.py                   # /admin/, /api/...
│   │   └── secrets_environment.py   # Loads .env via django-environ
│   ├── mealPlanning/
│   │   ├── models.py                 # DiningHall, Dish, UserProfile, Meal
│   │   ├── views.py                  # API views, auth, charts, NutritionEstimateView
│   │   ├── api_views.py              # Public chart-ready JSON
│   │   ├── urls.py                   # All /api/ routes
│   │   ├── services/
│   │   │   ├── local_llm.py          # Local LLM (StableLM 1.6B) nutrition estimator
│   │   │   ├── ai_chat.py            # Gemini-powered AI chat service
│   │   │   └── gemini_client.py      # Gemini dish nutrition estimation
│   │   └── migrations/
│   ├── docs/
│   │   ├── 05_notes/                 # notes.txt (per-week implementation notes)
│   │   ├── 06_screenshots/           # Week2–Week6 screenshots and deliverables
│   │   └── archive/                  # Archived README sections (prior weeks)
│   ├── build.sh                      # Render build: pip, migrate, collectstatic
│   ├── requirements.txt
│   └── db.sqlite3                    # Committed for course deliverables
│
├── frontend/                         # React + TypeScript + Vite (deployed on Vercel)
│   ├── src/
│   │   ├── config.ts                 # API_BASE / BACKEND_BASE
│   │   ├── main.tsx                  # Entry point
│   │   ├── App.tsx                   # Router
│   │   ├── Base.tsx                  # Layout (Navbar + Outlet)
│   │   ├── components/               # Navbar, Login, Register, GGLogin, AddDish, etc.
│   │   ├── pages/                    # Dishes, DishDetail, DiningHalls, AIMeals,
│   │   │                             # Charts, Reports, NotFound, Showcase
│   │   └── static/css/custom.css     # Theme overrides
│   └── package.json
│
├── llm-test/                         # A6 Part 1 — Hugging Face Leaderboard Lab
│   ├── ai_prototype.ipynb            # 15-model benchmark + prompt engineering + evaluation
│   └── model_matrix_results.json     # Raw matrix test results (15 models)
│
├── README_AI.md                      # A6 Part 2 §1 — Data Input, Preprocessing, Safety Guardrails
├── A5-part3-deliverables/            # Public API alternative use case demos
├── group-7-vega-lite-API-demo.txt    # Vega-Lite spec (A5 submission artifact)
└── README.md
```

---

## A6 scope (Text Intelligence — Local LLM + API Integration)

### Part 1: Hugging Face Leaderboard Lab (`llm-test/`)

- **15 models** tested across 5 size categories: Ultra-Light (<1B), Small (1B–3B), Medium (3B–5B), Large (5B–7B), Extra-Large (7B–10B+).
- **Prompt engineering:** Zero-shot, one-shot, few-shot, and many-shot prompting evaluated.
- **Evaluation criteria:** Instruction adherence, reasoning accuracy, prompt stability, inference speed.
- **Selected model:** `stabilityai/stablelm-2-zephyr-1_6b` — best balance of accuracy, speed (~1.5s), and structured output formatting.

### Part 2: Django Integration

#### §1 — System Description (`README_AI.md`)
Documents Data Input, Preprocessing, and Safety Guardrails for both the local LLM and Gemini API features.

#### §2 — Local LLM in Django (`services/local_llm.py`)
- **Model:** `stabilityai/stablelm-2-zephyr-1_6b` via `transformers` — auto-downloads weights on first run.
- **Endpoint:** `POST /api/nutrition-estimate/` — accepts age, sex, weight, height, activity level, and goal.
- Input validation (type, range, enum whitelisting) → zero-shot prompt → regex parsing → Mifflin-St Jeor fallback.
- Returns BMR, TDEE, recommended daily calories, and macro breakdown (protein/carbs/fat).
- **Environment toggle:** `USE_LOCAL_LLM=true` (default) loads the real model. Set `USE_LOCAL_LLM=false` on Render to use Mifflin-St Jeor fallback within 512MB memory.

#### §3 — External API Integration (Gemini)
- `gemini_client.py` — AI-powered dish nutrition estimation.
- `ai_chat.py` — Conversational AI chatbot with dining hall menu context, dish recommendations, and follow-up suggestions.
- API key stored in `.env`, excluded from Git.

### Part 3: Reflection (`backend/docs/05_notes/notes.txt`)
Answers to all four production reflection questions:
1. Size vs. Quality Trade-off
2. Cost & Scaling (10,000 daily users)
3. Hybrid Potential (local + API)
4. Cost Comparison (pre-trained vs. paid API)

### Frontend: AI Nutrition Hub (`AIMeals.tsx`)
Tabbed interface with two features:
- **AI Chat** — Gemini-powered chatbot for dining recommendations.
- **Nutrition Estimator** — Form that calls the local LLM endpoint and displays BMR, TDEE, recommended calories, and macros.

---

## A9: Semantic Dish Search (Primary AI Feature)

The Menu page has a **Filter / AI** mode toggle on the search bar.

- **Filter mode** (default): client-side exact name match — unchanged behaviour.
- **AI mode**: natural language semantic search powered by `sentence-transformers/all-mpnet-base-v2` running locally on Apple MPS (or CPU fallback). Type a description like *"high protein vegetarian breakfast"* and dishes are ranked by cosine similarity against pre-computed 768-dim embeddings stored in the `Dish.embedding` field.

### How to access the AI feature

1. Open the app at `http://localhost:5173`
2. Navigate to `/menu` and select a dining hall
3. Click the **✦ AI** toggle in the search bar
4. Type a natural language query — results update after a 400ms debounce

### Model download note

`all-mpnet-base-v2` (~420 MB) downloads automatically on first use to `~/.cache/huggingface/`. It is **not committed to the repo** (covered by `.gitignore` patterns for `*.bin`, `*.safetensors`). After the first download it is cached permanently.

To pre-warm the model and backfill any existing dishes with embeddings:

```bash
cd backend
python manage.py build_embeddings --settings=SmartEats_config.settings.development
```

The `scrape_menu` pipeline also computes embeddings for any newly scraped dishes automatically.

### New API endpoint (A9)

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /api/semantic-search/?q=<query>&hall=<id>&top_k=10` | No | Semantic search — returns ranked dishes with relevance scores |

---

## Running locally

**Backend:**
```bash
cd backend
pip install -r requirements.txt
python manage.py runserver --settings=SmartEats_config.settings.development
```
> First request to `/api/nutrition-estimate/` will download the StableLM model (~3GB). First call to `/api/semantic-search/` will download `all-mpnet-base-v2` (~420MB). Both are cached in `~/.cache/huggingface/`.

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

`config.ts` auto-detects localhost and uses `http://localhost:8000` when no `VITE_BACKEND_BASE_URL` is set.

---

## Deployment

- **Backend (Render):** Auto-deploys from `main`. Env: `USE_LOCAL_LLM=false` (memory constraint), `GEMINI_API_KEY`, `SECRET_KEY`.
- **Frontend (Vercel):** Auto-deploys from `main`. Env: `VITE_BACKEND_BASE_URL`.
- **Live:** Frontend https://smarteats7.vercel.app — Backend https://smarteats-backend.onrender.com

---

## API reference

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /api/halls/` | No | Dining halls list |
| `GET /api/dishes/` | No | Dish catalog (`?search=`) |
| `GET /api/dishes/<id>` | No | Dish detail |
| `GET /api/dish-stats/` | No | Aggregation stats |
| `GET /api/dishes-by-category/` | No | Public — dishes per category |
| `GET /api/meals-per-day/` | No | Public — meals per day |
| `GET /api/nutrition-lookup/?q=` | No | Wger nutrition lookup |
| `POST /api/nutrition-estimate/` | No | **A6** — Local LLM calorie/macro estimation |
| `POST /api/ai-chat/` | No | **A6** — Gemini AI chat |
| `POST /api/login/` | No | Token login |
| `POST /api/register/` | No | Registration |
| `POST /api/google-login/` | No | Google OAuth login |
| `GET/PUT /api/profile/` | Yes | Authenticated user profile |
| `GET /api/meal-reports/` | Yes | Reports JSON |
| `GET /api/export-meals/?format=csv\|json` | No | Meal export |
| `GET /api/charts/*.png` | No | Matplotlib chart images |

---

Archived section docs (A2–A5): `backend/docs/archive/`

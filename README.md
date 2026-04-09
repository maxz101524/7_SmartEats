# SmartEats

React frontend + Django REST API for UIUC dining discovery and meal tracking.

- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS v4
- **Backend:** Django 5.1.6 + Django REST Framework + SQLite (dev) / PostgreSQL (prod)
- **Deployment:** Render (backend) · Vercel (frontend)

---

## Project Structure

```
smarteats_week5/
├── backend/
│   ├── SmartEats_config/
│   │   ├── settings/
│   │   │   ├── base.py             # Shared settings, CORS, installed apps
│   │   │   ├── development.py      # DEBUG=True, local SQLite DB
│   │   │   └── production.py       # WhiteNoise, PostgreSQL, no debug
│   │   └── urls.py                 # Root URL router
│   └── mealPlanning/
│       ├── models.py               # DiningHall, Dish (w/ embedding field), UserProfile, Meal
│       ├── views.py                # All API views incl. SemanticSearchView
│       ├── urls.py                 # /api/ routes
│       ├── tests.py                # 46 unit tests
│       ├── services/
│       │   ├── semantic_search.py  # A9 — all-MiniLM-L6-v2 embedding + cosine search
│       │   ├── gemini_client.py    # Gemini dish nutrition estimation
│       │   ├── ai_chat.py          # Gemini AI chat service
│       │   └── local_llm.py        # StableLM nutrition estimator
│       └── management/commands/
│           ├── scrape_menu.py      # Daily ETL: fetch menu → upsert dishes → embed
│           └── build_embeddings.py # Backfill embeddings for existing dishes
└── frontend/
    └── src/
        ├── config.ts               # API_BASE, BACKEND_BASE
        ├── App.tsx                 # Router
        ├── pages/
        │   └── Menu.tsx            # Split panel with Filter/AI search toggle
        └── styles/tokens.css       # CSS design tokens
```

---

## Setup

### Install dependencies

```bash
# Backend
cd backend
pip install -r requirements.txt

# Frontend
cd frontend
npm install
```

### Environment variables

Copy `.env.example` to `.env` in `backend/` and fill in the required values:

```
SECRET_KEY=...
GEMINI_API_KEY=...
```

### Run the backend

```bash
cd backend
python manage.py migrate --settings=SmartEats_config.settings.development
python manage.py runserver --settings=SmartEats_config.settings.development
```

API available at `http://localhost:8000/api/`

### Run the frontend

```bash
cd frontend
npm run dev
```

App available at `http://localhost:5173`

### Run tests

```bash
cd backend
python manage.py test mealPlanning --settings=SmartEats_config.settings.development -v 2
```

51 tests, all passing.

---

## A9 AI Feature: Semantic Dish Search

The Menu page has a **Filter / AI** toggle on the search bar.

- **Filter mode** (default): client-side exact name match.
- **AI mode**: natural language semantic search powered by `sentence-transformers/all-MiniLM-L6-v2`. Type *"high protein vegetarian breakfast"* and dishes are ranked by cosine similarity against pre-computed 384-dim embeddings stored per dish.

### Accessing the feature

1. Start backend + frontend locally (see above)
2. Go to `http://localhost:5173/menu`
3. Select a dining hall
4. Click **✦ AI** in the search bar
5. Type a natural language query — results update after a 400ms debounce

### Model download

`all-MiniLM-L6-v2` (~90 MB) downloads automatically on first search to `~/.cache/huggingface/`. It is not committed to the repo. To pre-warm and backfill dish embeddings:

```bash
cd backend
python manage.py build_embeddings --settings=SmartEats_config.settings.development
```

If you are upgrading from an older checkout that used `all-mpnet-base-v2`, run a full refresh once:

```bash
python manage.py build_embeddings --force --settings=SmartEats_config.settings.development
```

`scrape_menu` also computes embeddings for newly scraped dishes automatically:

```bash
python manage.py scrape_menu --settings=SmartEats_config.settings.development
```

> **Note:** AI search prefers dishes from today's menu, then falls back to any embedded dishes already in the DB for local development. Run `scrape_menu` for the freshest menu, or `build_embeddings` to backfill older rows.

---

## API Reference

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /api/halls/` | No | Dining halls list |
| `GET /api/dishes/` | No | Dish catalog |
| `GET /api/dishes/<id>` | No | Dish detail |
| `GET /api/semantic-search/?q=<query>&hall=<id>&top_k=10` | No | **A9** — Semantic search, ranked by cosine similarity |
| `POST /api/nutrition-estimate/` | No | Local LLM calorie/macro estimation |
| `POST /api/ai-chat/` | No | Gemini AI chat |
| `GET /api/meals/` | Yes | Meal history |
| `GET /api/chart/` | Yes | Nutrition chart data |
| `GET/PUT /api/profile/` | Yes | Authenticated user profile |
| `GET /api/daily-intake/` | Yes | Today's macro totals |
| `GET /api/daily-history/` | Yes | 7-day nutrition history |
| `GET /api/ai-recommend/` | Yes | AI macro recommendations |
| `POST /api/login/` | No | Token login |
| `POST /api/register/` | No | Registration |
| `POST /api/google-login/` | No | Google OAuth |
| `GET /api/export-meals/?format=csv\|json` | No | Meal export |

---

## Git Hygiene

Model weights and caches are excluded from the repo:

```
*.bin
*.safetensors
*.pt
~/.cache/huggingface/
```

The app downloads weights locally on first use.

---

## Deployment

- **Backend (Render):** `https://smarteats-backend.onrender.com` — `USE_LOCAL_LLM=false` (memory constraint for nutrition estimation only)
- **Frontend (Vercel):** `https://smarteats7.vercel.app`

> Semantic search now uses a smaller local embedding model that fits the deployed backend memory budget. After deploying the backend, run `python manage.py build_embeddings --force --settings=SmartEats_config.settings.development` once so any older stored vectors are regenerated.

---

Archived section docs (A2–A8): `backend/docs/archive/`

# SmartEats

React frontend + Django REST API for UIUC dining discovery and meal tracking. Built for INFO 490; deployment (A4): Render (backend) + Vercel (frontend).

---

## Project structure

```
SmartEats/
├── backend/                          # Django API (deployed on Render)
│   ├── SmartEats_config/
│   │   ├── settings/
│   │   │   ├── base.py               # Shared settings, CORS
│   │   │   ├── development.py       # DEBUG = True
│   │   │   ├── production.py        # DEBUG = False, WhiteNoise, FRONTEND_URL
│   │   │   └── __init__.py
│   │   ├── wsgi.py                   # WSGI entry (production)
│   │   ├── asgi.py
│   │   ├── urls.py                   # /admin/, /api/...
│   │   └── secrets_environment.py   # Loads .env via django-environ
│   ├── mealPlanning/
│   │   ├── models.py                 # DiningHall, Dish, UserProfile, Meal, TempMeal, TempMealItem
│   │   ├── views.py                  # JSON APIs, Matplotlib charts, export, reports, external API
│   │   ├── api_views.py             # Chart-ready JSON: dishes-by-category, meals-per-day
│   │   ├── urls.py                   # All /api/ routes
│   │   ├── admin.py, apps.py, tests.py
│   │   └── migrations/
│   ├── docs/
│   │   ├── 01_project_documents/    # Idea_description.pdf, etc.
│   │   ├── 04_branching_strategy/    # branching_strategy.md
│   │   ├── 05_notes/                 # notes.txt
│   │   ├── 06_screenshots_and_other_deliverables/
│   │   │   └── Week4/               # Vega-Lite specs (vegalite-*-chart-spec.json), screenshots
│   │   └── archive/                 # README_sections_prior_to_week4.md
│   ├── build.sh                      # Render build: pip, migrate, collectstatic, create superuser
│   ├── manage.py
│   ├── requirements.txt             # Django, gunicorn, whitenoise, requests, matplotlib, etc.
│   ├── .env.example                 # Template for SECRET_KEY etc. (.env is git-ignored)
│   ├── db.sqlite3                   # SQLite DB (committed for A4)
│   └── README.md                    # Backend-specific notes (if any)
│
├── frontend/                         # React + TypeScript + Vite (deployed on Vercel)
│   ├── src/
│   │   ├── config.ts                # API_BASE / BACKEND_BASE from VITE_* env vars
│   │   ├── main.tsx                  # Entry; imports index.css, custom.css, App
│   │   ├── App.tsx                   # Router: /, /dishes, /halls, /profile, /aimeals, /charts, /reports
│   │   ├── Base.tsx                  # Layout + Navbar
│   │   ├── index.css, App.css
│   │   ├── components/               # Navbar, ShowData, AddDish, Empty
│   │   ├── pages/                    # Dishes, DishDetail, DiningHalls, Profiles, AIMeals, Charts, Reports, NotFound
│   │   └── static/
│   │       ├── css/custom.css       # Dark theme (Tailwind v4 variable overrides)
│   │       └── images/              # e.g. smarteats-logo.png
│   ├── public/                      # Static assets (e.g. vite.svg)
│   ├── index.html
│   ├── package.json                 # react, vega, vega-lite, vega-embed, axios, tailwind
│   └── vite.config.ts
│
├── .gitignore
└── README.md
```

---

## A4 scope (APIs, Vega-Lite, Exports, Deployment)

### Internal API for charts

- **GET** `/api/dishes-by-category/` — JSON list `[{ "category", "count" }]` (from `api_views.py`).
- **GET** `/api/meals-per-day/` — JSON list `[{ "date", "count" }]` (from `api_views.py`).

Used by the frontend Charts page and by Vega-Lite specs (e.g. in [Vega Editor](https://vega.github.io/editor/) with `data.url` set to the deployed API).

### Vega-Lite charts

- **Charts page** (`/charts`): two embedded Vega-Lite charts (bar: dishes by category; line: meals per day), data from the internal API via `config.ts` (env-based URL).
- **Specs & screenshots:** `backend/docs/06_screenshots_and_other_deliverables/Week4/` (e.g. `vegalite-bar-chart-spec.json`, `vegalite-line-chart-spec.json`).

### External API

- **GET** `/api/nutrition-lookup/?q=<query>` — calls Wger ingredient API (`requests.get`, `params=`, `timeout=5`, `raise_for_status()`), combines with internal dish matches, returns JSON. Optional `?netID=` for user goal analysis.

### CSV & JSON export + Reports

- **GET** `/api/export-meals/?format=csv` — CSV download (headers + rows, timestamped filename).
- **GET** `/api/export-meals/?format=json` — JSON download with `generated_at`, `record_count`, `meals` (pretty-printed).
- **Reports page** (`/reports`): totals, grouped summaries (macros, categories), chart image, and Download CSV / Download JSON buttons linking to the export endpoints.

### Deployment

- **Backend (Render):** Root directory `backend`, build `./build.sh`, start `gunicorn SmartEats_config.wsgi:application`. Env: `SECRET_KEY`, `DJANGO_SETTINGS_MODULE=SmartEats_config.settings.production`, `FRONTEND_URL` (origin only, no trailing slash), optional `PYTHON_VERSION`.
- **Frontend (Vercel):** Root directory `frontend`, build `npm run build`, output `dist`. Env: `VITE_API_BASE_URL`, `VITE_BACKEND_BASE_URL` pointing at the Render backend URL.
- **CORS:** Backend allows `FRONTEND_URL`, `https://vega.github.io`, and localhost; see `production.py`.

**Live (example):** Frontend https://smarteats7.vercel.app/ — Backend https://smarteats-backend.onrender.com (APIs under `/api/`).

---

## Running locally

- **Backend:** From repo root, `cd backend && pip install -r requirements.txt && python manage.py migrate && python manage.py runserver` (uses `development` settings if `DJANGO_SETTINGS_MODULE` unset; see `wsgi.py`).
- **Frontend:** `cd frontend && npm install && npm run dev` — uses `http://localhost:8000` for API when `VITE_API_BASE_URL` / `VITE_BACKEND_BASE_URL` are not set (see `frontend/src/config.ts`).

---

## Other APIs (reference)

| Endpoint | Description |
| -------- | ----------- |
| `/api/halls/` | Dining halls list |
| `/api/dishes/`, `/api/dishes/<id>/` | Dishes list (optional `?search=`), detail |
| `/api/dish-stats/` | Aggregation stats (totals, by category, by hall) |
| `/api/profiles/`, `/api/meals/` | User profiles, meal history |
| `/api/dishes-manage/` | GET list / POST create dish (CSRF) |
| `/api/aimeals/` | AI meal search (GET fuzzy, POST exact) |
| `/api/dish-summary-img/<id>/`, `/api/charts/*.png`, `/api/chart/` | Matplotlib chart images |
| `/api/meal-reports/` | Reports JSON (totals, macros, categories, chart base64) |

---

Archived section docs (pre–A4): `backend/docs/archive/README_sections_prior_to_week4.md`.

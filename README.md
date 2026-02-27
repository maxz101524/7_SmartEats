# SmartEats

React frontend + Django REST API for UIUC dining discovery and meal tracking. Built for INFO 490; current deployment (A5): Render (backend) + Vercel (frontend), with authentication and Google OAuth.

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
│   │   ├── models.py                 # DiningHall, Dish, UserProfile, Meal, TempMeal, TempMealItem
│   │   ├── views.py                  # API views, auth endpoints, charts, export, reports
│   │   ├── api_views.py              # Public chart-ready JSON: dishes-by-category, meals-per-day
│   │   ├── urls.py                   # All /api/ routes
│   │   └── migrations/
│   ├── docs/
│   │   ├── 01_project_documents/
│   │   ├── 02_wireframes/
│   │   ├── 03_data_model/
│   │   ├── 04_branching_strategy/    # branching_strategy.md
│   │   ├── 05_notes/                 # notes.txt (per-week implementation notes)
│   │   ├── 06_screenshots/           # Week2–Week5 screenshots and deliverables
│   │   └── archive/                  # Archived README sections (prior weeks)
│   ├── build.sh                      # Render build: pip, migrate, collectstatic
│   ├── requirements.txt
│   ├── .env.example
│   └── db.sqlite3                    # Committed for course deliverables
│
├── frontend/                         # React + TypeScript + Vite (deployed on Vercel)
│   ├── src/
│   │   ├── config.ts                 # API_BASE / BACKEND_BASE from VITE_BACKEND_BASE_URL
│   │   ├── main.tsx                  # Entry point
│   │   ├── App.tsx                   # Router
│   │   ├── Base.tsx                  # Layout (Navbar + Outlet)
│   │   ├── components/               # Navbar, Login, Register, GGLogin, logout,
│   │   │                             # AddDish, ShowData, Empty, Button, Card, FoodIcon, FoodListItem
│   │   ├── pages/                    # Dishes, DishDetail, DiningHalls, Profiles,
│   │   │                             # AIMeals, Charts, Reports, NotFound, Showcase
│   │   └── static/css/custom.css     # Tailwind v4 dark theme overrides
│   ├── index.html
│   └── package.json
│
├── A5-part3-deliverables/            # Public API alternative use case demos
├── group-7-vega-lite-API-demo.txt    # Vega-Lite spec (submission artifact)
├── CLAUDE.md                         # Claude Code project instructions
└── README.md
```

---

## A5 scope (Authentication, Google OAuth, Public API, Deployment)

### Authentication (Part 1 & 2)

- **Token auth:** DRF `TokenAuthentication` + `dj-rest-auth`. Login returns a token stored in `localStorage`.
- **Endpoints:** `POST /api/login/`, `POST /api/register/`, `POST /api/google-login/`
- **Google OAuth:** `django-allauth` on backend + `@react-oauth/google` on frontend. "Continue with Google" button on the login page (`GGLogin.tsx`).
- **Protected APIs:** `UserProfileView` and `MealReportsView` require `IsAuthenticated`.
- **Nav:** Shows Login button when logged out, Logout button when logged in (token from `localStorage`).

### Public API + Vega-Lite (Part 3)

- **Public endpoints** (no auth required):
  - `GET /api/dishes-by-category/` → `[{ "category", "count" }]`
  - `GET /api/meals-per-day/` → `[{ "date", "count" }]`
- **Vega-Lite spec:** `group-7-vega-lite-API-demo.txt` — bar chart of dishes by category, `data.url` points to production API.
- **Alternative uses:** `A5-part3-deliverables/` — Python script, Google Sheets import, Jupyter notebook analysis (each with screenshots).

### Deployment

- **Backend (Render):** Auto-deploys from `main`. Build via `build.sh`. Start: `gunicorn SmartEats_config.wsgi:application`.
  - Env: `SECRET_KEY`, `DJANGO_SETTINGS_MODULE=SmartEats_config.settings.production`
- **Frontend (Vercel):** Auto-deploys from `main`. Root dir: `frontend`. Build: `npm run build`.
  - Env: `VITE_BACKEND_BASE_URL=https://smarteats-backend.onrender.com` (no trailing slash)
- **Live:** Frontend https://smarteats7.vercel.app — Backend https://smarteats-backend.onrender.com

---

## Running locally

**Backend:**
```bash
cd backend
python manage.py runserver --settings=SmartEats_config.settings.development
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

`config.ts` auto-detects localhost and uses `http://localhost:8000` when no `VITE_BACKEND_BASE_URL` is set.

---

## API reference

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /api/halls/` | No | Dining halls list |
| `GET /api/dishes/` | No | Dish catalog (`?search=`) |
| `GET /api/dishes/<id>` | No | Dish detail |
| `GET /api/dish-stats/` | No | Aggregation stats |
| `GET /api/dishes-by-category/` | No | **Public** — dishes per category (Vega-Lite) |
| `GET /api/meals-per-day/` | No | **Public** — meals per day (Vega-Lite) |
| `GET /api/nutrition-lookup/?q=` | No | External Wger nutrition lookup |
| `POST /api/login/` | No | Token login |
| `POST /api/register/` | No | Registration |
| `POST /api/google-login/` | No | Google OAuth login |
| `GET/PUT /api/profile/` | Yes | Authenticated user profile |
| `GET /api/profiles/` | No | All profiles (admin) |
| `GET /api/meals/` | No | Meal history |
| `POST /api/aimeals/` | No | AI meal search |
| `GET /api/meal-reports/` | Yes | Reports JSON (totals, macros, chart) |
| `GET /api/export-meals/?format=csv\|json` | No | Meal export |
| `GET /api/charts/*.png` | No | Matplotlib chart images |

---

Archived section docs: `backend/docs/archive/`

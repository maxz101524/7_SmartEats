# Archived README sections (A4 / Week 4 scope)

This file preserves the A4 README section for reference. The main README now reflects the current codebase as of A5 (Authentication, Google OAuth, Public API, Individual Deployment).

---

## A4 scope (APIs, Vega-Lite, Exports, Deployment)

### Internal API for charts

- **GET** `/api/dishes-by-category/` — JSON list `[{ "category", "count" }]` (from `api_views.py`).
- **GET** `/api/meals-per-day/` — JSON list `[{ "date", "count" }]` (from `api_views.py`).

Used by the frontend Charts page and by Vega-Lite specs (e.g. in [Vega Editor](https://vega.github.io/editor/) with `data.url` set to the deployed API).

### Vega-Lite charts

- **Charts page** (`/charts`): two embedded Vega-Lite charts (bar: dishes by category; line: meals per day), data from the internal API via `config.ts` (env-based URL).
- **Specs & screenshots:** `backend/docs/06_screenshots/Week4/` (e.g. `vegalite-bar-chart-spec.json`, `vegalite-line-chart-spec.json`).

### External API

- **GET** `/api/nutrition-lookup/?q=<query>` — calls Wger ingredient API, combines with internal dish matches, returns JSON. Optional `?netID=` for user goal analysis.

### CSV & JSON export + Reports

- **GET** `/api/export-meals/?format=csv` — CSV download (headers + rows, timestamped filename).
- **GET** `/api/export-meals/?format=json` — JSON download with `generated_at`, `record_count`, `meals`.
- **Reports page** (`/reports`): totals, grouped summaries (macros, categories), chart image, and Download CSV / Download JSON buttons.

### Deployment

- **Backend (Render):** Root directory `backend`, build `./build.sh`, start `gunicorn SmartEats_config.wsgi:application`.
- **Frontend (Vercel):** Root directory `frontend`, build `npm run build`, output `dist`. Env: `VITE_BACKEND_BASE_URL` pointing at Render backend.
- **Live:** Frontend https://smarteats7.vercel.app/ — Backend https://smarteats-backend.onrender.com

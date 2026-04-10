# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

SmartEats is a two-service full-stack app: Django REST backend + React/Vite frontend for UIUC dining discovery and meal tracking. See the root `README.md` for architecture and API reference.

### Services

| Service | Port | Start command |
|---------|------|---------------|
| Backend (Django) | 8000 | `cd backend && python3 manage.py runserver --settings=SmartEats_config.settings.development` |
| Frontend (React/Vite) | 5173 | `cd frontend && npx vite --host 0.0.0.0 --port 5173` |

### Non-obvious caveats

- **Backend `.env` required**: Django will crash on startup without `backend/.env` containing at least `SECRET_KEY`. Copy from `backend/.env.example` and set a value. Generate one with `python3 -c "import secrets; print(secrets.token_urlsafe(50))"`.
- **Registration uses `netID`**: The `POST /api/register/` endpoint expects a `netID` field (not `username`) for the username. See `mealPlanning/views.py` `RegisterAPIView`.
- **Login also uses `netID`**: `POST /api/login/` expects `netID` and `password`.
- **Pre-populated SQLite DB**: `backend/db.sqlite3` is committed with seed data (dining halls, dishes). Migrations are already applied; `python3 manage.py migrate` is a no-op unless schema changes.
- **No automated tests exist**: `backend/mealPlanning/tests.py` is an empty stub. Django `test` command runs 0 tests.
- **Frontend ESLint**: Has 9 pre-existing lint errors (`@typescript-eslint/no-explicit-any`, `no-unused-vars`, `no-unused-expressions`). These are in the existing codebase, not regressions.
- **Frontend auto-detects backend**: `src/config.ts` uses `http://localhost:8000` when running on localhost; no env var needed for dev.
- **`SITE_ID = 2`** in `base.py`: Django Sites framework is configured with SITE_ID=2. If you get `Site matching query does not exist` errors, create a second Site object in the database.

### Lint / build commands

- **Frontend lint**: `cd frontend && npx eslint .`
- **Frontend build**: `cd frontend && npx tsc -b && npx vite build`
- **Backend check**: `cd backend && python3 manage.py check --settings=SmartEats_config.settings.development`

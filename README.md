# SmartEats

A meal planning and nutrition tracking application for university dining halls, built with a **Django REST backend** and a **React + TypeScript frontend**.
## Docs can be found in backend/docs

---

## Project Structure

```
SmartEats/
├── backend/                         # Django REST API
│   ├── SmartEats_config/
│   │   ├── settings/
│   │   │   ├── base.py              # Shared settings (SECRET_KEY, INSTALLED_APPS, etc.)
│   │   │   ├── development.py       # DEBUG = True, local ALLOWED_HOSTS
│   │   │   └── production.py        # DEBUG = False
│   │   ├── secrets_environment.py   # Loads .env via django-environ
│   │   └── urls.py                  # Root URL config
│   ├── mealPlanning/
│   │   ├── models.py                # DiningHall, Dish, UserProfile, Meal
│   │   ├── views.py                 # 2 FBVs + 2 CBVs (JSON API endpoints)
│   │   └── urls.py                  # Named URL patterns for all 4 views
│   ├── docs/
│   │   ├── 01_project_documents/
│   │   ├── 02_wireframes/
│   │   ├── 03_data_model/
│   │   ├── 04_branching_strategy/
│   │   └── 05_notes/notes.txt
│   │   └── 06_screenshots/
│   ├── .env                         # Secret keys (git-ignored)
│   └── .env.example                 # Template for required env vars
│
└── frontend/                        # React + TypeScript + Vite
    └── src/
        ├── App.tsx                  # Router config (equivalent to urls.py)
        ├── Base.tsx                 # Layout wrapper (equivalent to base.html)
        ├── components/
        │   ├── Navbar.tsx           # Shared navigation bar
        │   └── ShowData.tsx         # Reusable data-list component
        └── pages/
            ├── DiningHalls.tsx      # Consumes /api/halls/
            ├── Dishes.tsx           # Consumes /api/dishes/
            ├── Profiles.tsx         # Consumes /api/profiles/ and /api/meals/
            └── NotFound.tsx         # 404 page
```

---

## How to Run

### Prerequisites

- Python 3.12+, Node.js 18+
- `pip install django django-environ django-cors-headers djangorestframework`

First, open 2 separate terminals, one for Backend and one for Frontend.

### 1. Backend (Django)

```bash
cd backend
python manage.py runserver --settings=SmartEats_config.settings.development
```

### 2. Frontend (React)

```bash
cd frontend
npm install
npm run dev
```

---

## Views — Django-to-React Mapping

Since we use React as our frontend, our Django views serve as **JSON API endpoints** rather than rendering HTML templates directly. The four required view types (2 FBV + 2 CBV) are all implemented in `backend/mealPlanning/views.py` and wired up in `backend/mealPlanning/urls.py` with named routes. The React frontend then consumes these endpoints and handles the presentation.

**Function-Based Views (FBVs):** We implement two FBVs that correspond to the assignment's HttpResponse and render() patterns. `dining_hall_view` uses `HttpResponse(json.dumps(...))` to manually serialize and return data — this mirrors the "manual HttpResponse" approach. `dish_list_view` uses `JsonResponse()`, which is Django's built-in shortcut that automatically handles serialization and content-type headers — analogous to using `render()` as a convenience shortcut. On the frontend, `DiningHalls.tsx` and `Dishes.tsx` consume these endpoints respectively.

**Class-Based Views (CBVs):** We implement two CBVs matching the base and generic patterns. `UserProfileBaseView` inherits from `django.views.View` and manually implements `get()` to query and return data — this is the base CBV approach. `MealListView` inherits from `django.views.generic.ListView` with `model = Meal` and overrides `render_to_response` to return JSON — this demonstrates how generic views reduce boilerplate by handling the queryset automatically. On the frontend, `Profiles.tsx` consumes both of these endpoints.

**URL Routing:** All four Django URLs use `name=` for named routing. On the React side, `App.tsx` uses React Router's `<Route path=... />` for equivalent declarative routing.

| View                    | Type                | Django URL                                    | React Page          |
| ----------------------- | ------------------- | --------------------------------------------- | ------------------- |
| `dining_hall_view`    | FBV — HttpResponse | `/api/halls/` (`name='dining_hall_list'`) | `DiningHalls.tsx` |
| `dish_list_view`      | FBV — JsonResponse | `/api/dishes/` (`name='dish_list'`)       | `Dishes.tsx`      |
| `UserProfileBaseView` | CBV — View         | `/api/profiles/` (`name='user_profiles'`) | `Profiles.tsx`    |
| `MealListView`        | CBV — ListView     | `/api/meals/` (`name='meal_history'`)     | `Profiles.tsx`    |

---

## Templates — Django-to-React Mapping

Instead of Django's template engine, we use React's **component composition.**

**Base Template:** `Base.tsx` serves as our `base.html`. It defines the shared page layout — a `<Navbar />` at the top, a `<footer>` at the bottom, and React Router's `<Outlet />` in the middle where child page content renders. This is equivalent to Django's `{% block content %}`. All page components automatically inherit this layout by being nested routes under `<Route path="/" element={<Base />}>`, which is the React equivalent of `{% extends "base.html" %}`.

**Feature Templates & Loops:** Each page component (`Dishes.tsx`, `DiningHalls.tsx`, `Profiles.tsx`) acts as a feature template. They fetch data from the backend API and iterate over it using `.map()` — the React equivalent of `{% for item in items %}`. For the empty state (equivalent to `{% empty %}`), we conditionally render a "No data found" message when the list is empty.

**Template Reuse:** `ShowData.tsx` is a generic, reusable component shared by both `Dishes.tsx` and `DiningHalls.tsx`. It accepts an API endpoint, a title, and a render function for each item — decoupling the data-fetching and list-rendering logic from page-specific content. This mirrors how a single Django template can be reused across multiple views.

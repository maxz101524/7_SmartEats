# SmartEats
A meal planning and nutrition tracking application for university dining halls, built with a **Django REST backend** and a **React + TypeScript frontend**.
## Docs can be found in backend/docs

---

## Project Structure

```
SmartEats/
├── backend/                          # Django REST API
│   ├── SmartEats_config/
│   │   ├── settings/
│   │   │   ├── base.py               # Shared settings (SECRET_KEY, INSTALLED_APPS, etc.)
│   │   │   ├── development.py        # DEBUG = True, local ALLOWED_HOSTS
│   │   │   └── production.py         # DEBUG = False
│   │   ├── secrets_environment.py    # Loads .env via django-environ
│   │   └── urls.py                   # Root URL config
│   ├── mealPlanning/
│   │   ├── models.py                 # DiningHall, Dish, UserProfile, Meal
│   │   ├── views.py                  # FBVs + CBVs (JSON API endpoints + Matplotlib charts)
│   │   └── urls.py                   # Named URL patterns for all views
│   ├── docs/
│   │   ├── 01_project_documents/
│   │   ├── 02_wireframes/
│   │   ├── 03_data_model/
│   │   ├── 04_branching_strategy/
│   │   ├── 05_notes/notes.txt        # Design decisions & section notes
│   │   └── 06_screenshots/
│   ├── .env                          # Secret keys (git-ignored)
│   └── .env.example                  # Template for required env vars
│
├── frontend/                         # React + TypeScript + Vite
│   ├── index.html                    # Entry HTML (Google Fonts <link>, page title)
│   ├── vite.config.ts                # Vite + React + Tailwind v4 plugin
│   ├── src/
│   │   ├── main.tsx                  # App entry — imports index.css + custom.css
│   │   ├── App.tsx                   # Router config (equivalent to urls.py)
│   │   ├── Base.tsx                  # Layout wrapper (equivalent to base.html)
│   │   ├── index.css                 # Tailwind v4 import (@import "tailwindcss")
│   │   ├── App.css                   # Minimal app-level styles
│   │   ├── components/
│   │   │   ├── Navbar.tsx            # Sticky nav bar with logo + links
│   │   │   ├── ShowData.tsx          # Reusable data list (replaces {% for %}/{% empty %})
│   │   │   ├── AddDish.tsx           # POST form — create dish with CSRF
│   │   │   └── Empty.tsx             # Empty-state placeholder
│   │   ├── pages/
│   │   │   ├── Dishes.tsx            # Menu explorer with GET search + stats
│   │   │   ├── DishDetail.tsx        # Single dish detail + Matplotlib chart
│   │   │   ├── DiningHalls.tsx       # Dining hall listing
│   │   │   ├── Profiles.tsx          # User profiles + meal history
│   │   │   ├── AIMeals.tsx           # AI meal matcher (GET fuzzy / POST exact)
│   │   │   └── NotFound.tsx          # 404 page
│   │   └── static/
│   │       ├── css/
│   │       │   └── custom.css        # Dark theme — remaps Tailwind v4 color vars + Inter font
│   │       └── images/
│   │           └── smarteats-logo.png # Brand logo (displayed in Navbar)
│   └── public/
│       └── vite.svg
│
└── README.md
```

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

## Section 1: URL Linking & Navigation

The app has a working home page at `/`, a navigation bar with 5 links using React Router `<Link>` , and detail pages (DishDetail.tsx) via primary keys (e.g., `/dishes/6`). `get_absolute_url()` is implemented on `Dish` and `UserProfile` models using `reverse()`, and the API serializes it as `detail_url` so the frontend never hard-codes paths.

**Screenshots:** `backend/docs/06_screenshots/week3`

## Section 2: ORM Queries & Data Presentation

- **Basic queries:** `dish_list_view` displays all dishes via `Dish.objects.select_related('dining_hall').all()`
- **GET search:** `/api/dishes/?search=chicken` — filters with `dish_name__icontains`
- **POST search:** `AIMealView.post()` — exact-match dish lookup, hides query data from the URL
- **Relationship spanning:** `AIMealView` queries across `TempMeal → TempMealItem → Dish` using `items__dish__dish_name__icontains`
- **Aggregations:** `dish_stats_view` returns total dish/hall counts (`Count`) and grouped summaries by category and dining hall (`annotate + Count`)

## Section 3: Static Files & UI Styling

A custom CSS file at `frontend/src/static/css/custom.css` provides a dark theme and the Inter font. Rather than overriding Tailwind classes, it remaps Tailwind v4's CSS color variables (`--color-white`, `--color-gray-*`, etc.) so every existing utility class automatically picks up the dark palette. The font is also applied in `index.html` `. A SmartEats logo (`src/static/images/smarteats-logo.png`) is displayed in the Navbar header.



## Section 4: Data Visualization (Matplotlib)

Three chart views, all using ORM aggregation → Matplotlib → `BytesIO` → `HttpResponse(content_type="image/png")`:

| Endpoint                            | View                           | Chart Type     | Data Source                              |
| ----------------------------------- | ------------------------------ | -------------- | ---------------------------------------- |
| `/api/dish-summary-img/<id>/`     | `DishSummaryImageView` (CBV) | Pie chart      | Single dish macro breakdown              |
| `/api/charts/dishes_per_hall.png` | `dishes_per_hall_png` (FBV)  | Bar chart      | `annotate(Count)` dishes per hall      |
| `/api/chart/`                     | `MealSummaryView` (CBV)      | Dual pie chart | User meal macros + category distribution |

All views use `BytesIO()` to write the PNG to an in-memory buffer and `plt.close(fig)` to free RAM. Charts include titles, axis labels, and legends/autopct. `DishDetail.tsx` embeds the chart with `<img src=".../api/dish-summary-img/{id}/" alt="Dish Nutrition Chart" />`.
<img width="2940" height="1912" alt="image" src="https://github.com/user-attachments/assets/0de15c51-4e38-4c06-bae8-b9133dbdbdf6" />

## Section 5: Forms & User Input

- **GET form:** `Dishes.tsx` search bar → `GET /api/dishes/?search=...` — query params visible in URL, results shareable via link
- **POST form:** `AddDish.tsx` creation form → `POST /api/dishes-manage/` — submits dish name, category, nutrition, and dining hall
- **CSRF:** `DishManagementView.get()` uses `@ensure_csrf_cookie` to set the token cookie; `AddDish.tsx` reads it via `getCookie("csrftoken")` and sends it as the `X-CSRFToken` header on POST
- **CBV handling GET + POST:** `DishManagementView` inherits from `View` — `get()` lists dishes, `post()` creates a new dish with validation

## Section 6: Creating APIs

All Django views serve JSON so the React frontend consumes them as APIs.

| Endpoint                | View Type      | Response Type    | Description                              |
| ----------------------- | -------------- | ---------------- | ---------------------------------------- |
| `/api/halls/`         | FBV            | `HttpResponse` | Dining halls — manual `json.dumps()`  |
| `/api/dishes/`        | FBV            | `JsonResponse` | Dishes (supports `?search=` filtering) |
| `/api/dishes/<id>`    | FBV            | `JsonResponse` | Dish detail by PK                        |
| `/api/dish-stats/`    | FBV            | `JsonResponse` | Aggregation stats                        |
| `/api/profiles/`      | CBV (View)     | `JsonResponse` | User profiles                            |
| `/api/meals/`         | CBV (ListView) | `JsonResponse` | Meal history                             |
| `/api/dishes-manage/` | CBV (View)     | `JsonResponse` | GET list / POST create dish              |
| `/api/aimeals/`       | CBV (View)     | `JsonResponse` | AI meal search (GET fuzzy, POST exact)   |

**Filtering via query parameters:** `dish_list_view` reads `request.GET.get('search')` and filters with `Dish.objects.filter(dish_name__icontains=query)` — e.g. `/api/dishes/?search=chicken` returns only matching dishes. `AIMealView.get()` reads `request.GET.get('dishes')`, splits by comma, and chains `Q()` filters across related models (`items__dish__dish_name__icontains`) — e.g. `/api/aimeals/?dishes=Rice,Chicken` returns meals containing all specified dishes.

**HttpResponse vs JsonResponse:** `dining_hall_view` uses `HttpResponse(json.dumps(...), content_type="application/json")` (manual); `dish_list_view` uses `JsonResponse(data, safe=False)` (auto-serializes + sets MIME type). `JsonResponse` is a subclass of `HttpResponse` that handles encoding and content-type automatically.



## Data Model Design

We extend Django's built-in User model via a `UserProfile` model to store personalized health data without redefining built-in fields (e.g., email).

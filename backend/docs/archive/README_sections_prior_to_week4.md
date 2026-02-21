# Archived README sections (prior to A4 / Week 4)

This file preserves the previous README section documentation for reference. The main README now reflects the current codebase as of A4 (APIs, Vega-Lite, Exports, Deployment).

---

## Section 1: URL Linking & Navigation

The app has a working home page at `/`, a navigation bar with 5 links using React Router `<Link>` (no hard-coded paths), and detail pages via primary keys (e.g., `/dishes/6`). `get_absolute_url()` is implemented on `Dish` and `UserProfile` models using `reverse()`, and the API serializes it as `detail_url` so the frontend never hard-codes paths.

**Screenshots:** `backend/docs/06_screenshots/week3`

## Section 2: ORM Queries & Data Presentation

- **Basic queries:** `dish_list_view` displays all dishes via `Dish.objects.select_related('dining_hall').all()`
- **GET search:** `/api/dishes/?search=chicken` — filters with `dish_name__icontains`
- **POST search:** `AIMealView.post()` — exact-match dish lookup, hides query data from the URL
- **Relationship spanning:** `AIMealView` queries across `TempMeal → TempMealItem → Dish` using `items__dish__dish_name__icontains`
- **Aggregations:** `dish_stats_view` returns total dish/hall counts (`Count`) and grouped summaries by category and dining hall (`annotate + Count`)

## Section 3: Static Files & UI Styling

A custom CSS file at `frontend/src/static/css/custom.css` provides a dark theme and the Inter font. Rather than overriding Tailwind classes, it remaps Tailwind v4's CSS color variables (`--color-white`, `--color-gray-*`, etc.) so every existing utility class automatically picks up the dark palette. The Inter font is loaded via `<link>` in `index.html` and set through `--font-sans`. A SmartEats logo (`src/static/images/smarteats-logo.png`) is displayed in the Navbar header.

Vite automatically handles cache busting by appending content hashes to built asset filenames (e.g. `custom-BxK3q7.css`), so browsers always fetch the latest version after a code change.

## Section 4: Data Visualization (Matplotlib)

Three chart views, all using ORM aggregation → Matplotlib → `BytesIO` → `HttpResponse(content_type="image/png")`:

| Endpoint                            | View                           | Chart Type     | Data Source                              |
| ----------------------------------- | ------------------------------ | -------------- | ---------------------------------------- |
| `/api/dish-summary-img/<id>/`     | `DishSummaryImageView` (CBV) | Pie chart      | Single dish macro breakdown              |
| `/api/charts/dishes_per_hall.png` | `dishes_per_hall_png` (FBV)  | Bar chart      | `annotate(Count)` dishes per hall      |
| `/api/chart/`                     | `MealSummaryView` (CBV)      | Dual pie chart | User meal macros + category distribution |

All views use `BytesIO()` to write the PNG to an in-memory buffer and `plt.close(fig)` to free RAM. Charts include titles, axis labels, and legends/autopct. `DishDetail.tsx` embeds the chart with `<img src=".../api/dish-summary-img/{id}/" alt="Dish Nutrition Chart" />`.

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

**Filtering via query parameters:** `dish_list_view` reads `request.GET.get('search')` and filters with `Dish.objects.filter(dish_name__icontains=query)`. `AIMealView.get()` reads `request.GET.get('dishes')`, splits by comma, and chains `Q()` filters across related models.

**Screenshots:** `backend/docs/08_screenshots_week5/`

## Data Model Design

We extend Django's built-in User model via a `UserProfile` model to store personalized health data without redefining built-in fields (e.g., email).

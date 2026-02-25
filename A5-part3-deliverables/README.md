# Part 3.4 — Three Alternative Uses of the Public API

**Public API endpoint:**
`https://smarteats-backend.onrender.com/api/dishes-by-category/`

Returns a JSON array of `{ "category": string, "count": integer }` objects — one per food category in the SmartEats dining hall database.

---

## Use 1 — Python Script (Aggregation)

**File:** `use1_python_script.py`
**Screenshot:** `use1_screenshot.png`

Fetches the API and computes simple aggregations: total dish count, most popular category, and a text-based breakdown sorted by count.

```bash
pip install requests
python use1_python_script.py
```

---

## Use 2 — Google Sheets (Live Import)

**Screenshot:** `use2_googlesheets_screenshot.png`

Imports the API data directly into a Google Sheet using the built-in `IMPORTDATA` function — no code required.

In any Google Sheet cell, enter:
```
=IMPORTDATA("https://smarteats-backend.onrender.com/api/dishes-by-category/")
```

The sheet auto-populates with live data from the database. Useful for non-technical stakeholders who want a refreshable view of the data.

---

## Use 3 — Pandas + Matplotlib Analysis (Notebook)

**File:** `use3_notebook.py`
**Screenshots:** `use3_screenshot.png`, `use3_chart.png`

Loads the API into a pandas DataFrame, prints summary statistics (mean, min, max, std), and generates a bar chart saved as `use3_chart.png`.

```bash
pip install requests pandas matplotlib
python use3_notebook.py
```

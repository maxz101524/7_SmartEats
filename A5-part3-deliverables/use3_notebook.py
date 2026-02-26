"""
Part 3.4 - Alternative Use 3: Pandas + Matplotlib Analysis
SmartEats Public API: /api/dishes-by-category/

Demonstrates importing API data into a pandas DataFrame,
computing summary statistics, and producing a bar chart.
Run with: python use3_notebook.py
  (or paste each block into a Jupyter notebook cell)
"""

import requests
import pandas as pd
import matplotlib.pyplot as plt

# ── 1. Fetch data from the public API ───────────────────────────────────────
URL = "https://smarteats-backend.onrender.com/api/dishes-by-category/"
df = pd.DataFrame(requests.get(URL).json())
df = df.sort_values("count", ascending=False).reset_index(drop=True)

# ── 2. Display the DataFrame ─────────────────────────────────────────────────
print("SmartEats - Dishes by Category (DataFrame)")
print("=" * 40)
print(df.to_string(index=False))

# ── 3. Summary statistics ────────────────────────────────────────────────────
print("\nSummary Statistics:")
print(df["count"].describe().to_string())

# ── 4. Bar chart ─────────────────────────────────────────────────────────────
fig, ax = plt.subplots(figsize=(8, 5))
ax.bar(df["category"], df["count"], color="steelblue", edgecolor="white")
ax.set_title("SmartEats: Dishes by Category", fontsize=14, fontweight="bold")
ax.set_xlabel("Food Category")
ax.set_ylabel("Number of Dishes")
plt.xticks(rotation=35, ha="right")
plt.tight_layout()
plt.savefig("A5-part3-deliverables/use3_chart.png", dpi=150)
print("\nChart saved to A5-part3-deliverables/use3_chart.png")
plt.show()

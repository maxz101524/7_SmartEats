"""
Part 3.4 - Alternative Use 1: Python Script
SmartEats Public API: /api/dishes-by-category/

Demonstrates fetching and aggregating data from the public API using Python.
Run with: python use1_python_script.py
"""

import requests

URL = "https://smarteats-backend.onrender.com/api/dishes-by-category/"

data = requests.get(URL).json()

total = sum(d["count"] for d in data)
top = max(data, key=lambda d: d["count"])

print("=" * 40)
print("SmartEats - Dishes by Category")
print("=" * 40)
print(f"API Source: {URL}\n")

print("Category Breakdown (sorted by count):")
for d in sorted(data, key=lambda x: x["count"], reverse=True):
    bar = "#" * d["count"]
    print(f"  {d['category']:<20} {d['count']:>3}  {bar}")

print()
print(f"Total dishes tracked : {total}")
print(f"Most popular category: {top['category']} ({top['count']} dishes)")
print(f"Number of categories : {len(data)}")

import logging
from difflib import SequenceMatcher

import requests

logger = logging.getLogger(__name__)

WGER_INGREDIENT_URL = "https://wger.de/api/v2/ingredient/"
SIMILARITY_THRESHOLD = 0.6


def _similarity(a, b):
    """Case-insensitive similarity ratio between two strings."""
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def lookup_nutrition(dish_name):
    """
    Query Wger for a dish name. Returns a dict of nutrition data if a
    confident match is found, or None otherwise.

    Return format:
        {
            "calories": int,
            "protein": float,
            "carbohydrates": float,
            "fat": float,
            "fiber": float,
            "sodium": float,
        }
    """
    try:
        resp = requests.get(
            WGER_INGREDIENT_URL,
            params={"name": dish_name, "language": 2, "format": "json", "limit": 5},
            timeout=5,
        )
        resp.raise_for_status()
    except requests.exceptions.RequestException as exc:
        logger.warning("Wger API error for '%s': %s", dish_name, exc)
        return None

    results = resp.json().get("results", [])
    if not results:
        return None

    # Score each result by name similarity, pick best
    best = None
    best_score = 0.0
    for item in results:
        score = _similarity(dish_name, item["name"])
        if score > best_score:
            best_score = score
            best = item

    if best_score < SIMILARITY_THRESHOLD:
        logger.debug(
            "Wger: no confident match for '%s' (best: '%s' @ %.2f)",
            dish_name, best["name"] if best else "?", best_score,
        )
        return None

    return {
        "calories": int(best["energy"]),
        "protein": float(best.get("protein") or 0),
        "carbohydrates": float(best.get("carbohydrates") or 0),
        "fat": float(best.get("fat") or 0),
        "fiber": float(best.get("fiber") or 0),
        "sodium": float(best.get("sodium") or 0),
    }

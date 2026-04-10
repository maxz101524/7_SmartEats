import logging
import requests

logger = logging.getLogger(__name__)

UIUC_API_URL = "https://web.housing.illinois.edu/DiningMenus/api/DiningMenu/GetOption/"

DINING_OPTIONS = {
    1: "Ikenberry Dining Center",
    2: "Pennsylvania Avenue Dining Hall",
    3: "Illinois Street Dining Center",
    5: "Lincoln/Allen Dining Hall",
    12: "Field of Greens",
    23: "Kosher Kitchen",
}

ALLERGEN_SET = frozenset({
    "Corn", "Eggs", "Fish", "Gluten", "Milk", "Peanuts",
    "Sesame", "Shellfish", "Soy", "Tree Nuts", "Wheat", "Coconut",
})

DIET_FLAG_SET = frozenset({"Vegan", "Vegetarian", "Halal", "Jain"})


def parse_traits(traits_str):
    """Split UIUC Traits string into (allergens, dietary_flags) lists."""
    if not traits_str:
        return [], []
    tokens = [t.strip() for t in traits_str.split(",") if t.strip()]
    allergens = sorted(t for t in tokens if t in ALLERGEN_SET)
    dietary_flags = sorted(t for t in tokens if t in DIET_FLAG_SET)
    return allergens, dietary_flags


def fetch_menu(option_id, date_str):
    """
    Fetch menu items from UIUC Dining API for one dining option and date.

    Returns a list of dicts with normalized keys, or [] on error.
    """
    try:
        resp = requests.post(
            UIUC_API_URL,
            json={"DiningOptionID": str(option_id), "mealDate": date_str},
            timeout=10,
        )
        resp.raise_for_status()
    except requests.exceptions.RequestException as exc:
        logger.warning("UIUC API error for option %s: %s", option_id, exc)
        return []

    items = []
    for raw in resp.json():
        allergens, dietary_flags = parse_traits(raw.get("Traits", ""))
        items.append({
            "formal_name": raw["FormalName"],
            "category": raw.get("Category", ""),
            "course": raw.get("Course", ""),
            "meal": raw.get("Meal", ""),
            "serving_unit": raw.get("ServingUnit", ""),
            "item_id": raw.get("ItemID"),
            "allergens": allergens,
            "dietary_flags": dietary_flags,
        })
    return items

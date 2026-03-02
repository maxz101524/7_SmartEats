import json
import logging
import time

from django.conf import settings

try:
    from google import genai
except ImportError:
    genai = None

logger = logging.getLogger(__name__)

MODEL_NAME = "gemini-2.5-flash"
_last_call_time = 0.0
RATE_LIMIT_SECONDS = 7  # Safe under 10 RPM free tier


def _get_client():
    api_key = getattr(settings, "GEMINI_API_KEY", None)
    if not api_key:
        import os
        api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY not configured")
    return genai.Client(api_key=api_key)


def estimate_nutrition(
    dish_name,
    category="",
    meal_period="",
    allergens=None,
    dietary_flags=None,
    serving_unit="",
):
    """
    Use Gemini to estimate nutrition for a dish. Returns a dict with
    calories, protein, carbohydrates, fat, fiber, sodium, sugar,
    serving_size, confidence — or None on failure.
    """
    global _last_call_time

    if genai is None:
        logger.error("google-genai not installed")
        return None

    prompt = (
        "You are a university dining hall nutrition expert. Estimate the nutritional "
        "content for ONE STANDARD SERVING of this dish as it would be served at a "
        "UIUC (University of Illinois) dining hall.\n\n"
        "DISH INFORMATION:\n"
        f"- Name: {dish_name}\n"
        f"- Dining hall category: {category}\n"
        f"- Meal period: {meal_period} (e.g. Breakfast, Lunch, Dinner)\n"
        f"- Station/serving area: {serving_unit}\n"
        f"- Known allergens: {', '.join(allergens or []) or 'None listed'}\n"
        f"- Dietary classifications: {', '.join(dietary_flags or []) or 'None listed'}\n\n"
        "INSTRUCTIONS:\n"
        "1. Consider this is a UNIVERSITY DINING HALL serving — portions are typically "
        "generous (not restaurant-style plating).\n"
        '2. "Standard serving" means what a student would put on their plate in one trip '
        "— e.g. one piece of chicken, one bowl of soup, one scoop of rice, one cookie.\n"
        "3. Estimate the serving size in a human-readable format "
        '(e.g. "1 piece (~170g)", "1 cup (~240ml)", "1 bowl (~350g)").\n'
        "4. Base your estimates on the dish name, its station context, and typical "
        "university dining preparations.\n"
        "5. For sodium, use milligrams (mg). For all other macros, use grams (g). "
        "Calories as integer.\n"
        '6. Rate your confidence: "high" for common well-known items, "medium" for '
        'reasonable estimates, "low" for unusual or ambiguous items.\n\n'
        "Return a JSON object with these exact keys:\n"
        "- calories (integer)\n"
        "- protein (number, grams)\n"
        "- carbohydrates (number, grams)\n"
        "- fat (number, grams)\n"
        "- fiber (number, grams)\n"
        "- sodium (number, milligrams)\n"
        "- sugar (number, grams)\n"
        "- serving_size (string, human-readable)\n"
        '- confidence (string: "high", "medium", or "low")'
    )

    # Rate limiting
    elapsed = time.time() - _last_call_time
    if elapsed < RATE_LIMIT_SECONDS:
        time.sleep(RATE_LIMIT_SECONDS - elapsed)

    try:
        client = _get_client()
        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=prompt,
            config={
                "temperature": 0,
                "response_mime_type": "application/json",
            },
        )
        _last_call_time = time.time()
        data = json.loads(response.text)
        # Validate required keys
        required = {
            "calories", "protein", "carbohydrates", "fat",
            "fiber", "sodium", "sugar", "serving_size", "confidence",
        }
        if not required.issubset(data.keys()):
            logger.warning("Gemini response missing keys for '%s': %s", dish_name, data)
            return None
        return data
    except (json.JSONDecodeError, ValueError) as exc:
        logger.warning("Gemini JSON error for '%s': %s", dish_name, exc)
        return None
    except Exception as exc:
        logger.error("Gemini API error for '%s': %s", dish_name, exc)
        return None

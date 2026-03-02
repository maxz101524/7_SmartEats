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
RATE_LIMIT_SECONDS = 0.5


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
    calories, protein, carbohydrates, fat, fiber, sodium, confidence
    or None on failure.
    """
    global _last_call_time

    if genai is None:
        logger.error("google-genai not installed")
        return None

    prompt = (
        f"Estimate the nutritional content per standard serving of this university dining hall dish.\n\n"
        f"Dish: {dish_name}\n"
        f"Category: {category}\n"
        f"Meal period: {meal_period}\n"
        f"Station: {serving_unit}\n"
        f"Allergens: {', '.join(allergens or [])}\n"
        f"Dietary flags: {', '.join(dietary_flags or [])}\n\n"
        f"Return JSON with: calories (int), protein (g), carbohydrates (g), "
        f"fat (g), fiber (g), sodium (mg), and confidence (high/medium/low).\n"
        f"Return ONLY the JSON object, no markdown."
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
        required = {"calories", "protein", "carbohydrates", "fat", "fiber", "sodium", "confidence"}
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
